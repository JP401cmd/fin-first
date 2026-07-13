/**
 * GET /api/report/vermogen?date=YYYY-MM-DD
 *
 * Vermogensoverzicht-rapport (Kern-rapport). Levert een complete inventaris
 * van alle bezittingen en schulden op de gevraagde peildatum, plus app-
 * deepening secties voor de modules die op ≥1 row geactiveerd staan
 * (Budgetteren, Holdings, Woonbalans, Verhuurrendement, Hypotheekplanner).
 *
 * Patroon conform `app/api/report/balans/route.ts` — server-side compose,
 * client-side render. Geen module-eis: het rapport werkt altijd; app-secties
 * verschijnen alleen als er data is (CLAUDE.md fallback-regel).
 *
 * Spec: docs/superpowers/specs/2026-05-11-kern-rapport-en-instellingen-rapport-design.md
 */
import { createClient } from '@/lib/supabase/server'
import { getRecentDailyExpenseRate } from '@/lib/expense-rate'
import {
  ASSET_GROUP_FOR_TYPE,
  ASSET_TYPE_LABELS,
  ASSET_SUBTYPE_LABELS,
  type Asset,
  type AssetType,
} from '@/lib/asset-data'
import {
  DEBT_TYPE_LABELS,
  DEBT_SUBTYPE_LABELS,
  REPAYMENT_TYPE_LABELS,
  computeExpectedBalance,
  amortizationSchedule,
  linearAmortization,
  interestOnlySchedule,
  type Debt,
  type DebtType,
} from '@/lib/debt-data'
import type {
  VermogenReportData,
  VermogenAssetCategory,
  VermogenAssetItem,
  VermogenDebtCategory,
  VermogenDebtItem,
  VermogenBudgetterenSection,
  VermogenHoldingsSection,
  VermogenHoldingRow,
  VermogenWoonbalansSection,
  VermogenWoonbalansItem,
  VermogenVerhuurSection,
  VermogenVerhuurItem,
  VermogenHypotheekSection,
  VermogenHypotheekItem,
  VermogenHypotheekRow,
} from '@/lib/vermogen-report-data'

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Bereken de resterende looptijd in maanden vanaf de peildatum. Returnt
 * `null` als geen einddatum bekend is (revolving credit / creditcard) of
 * als de einddatum al gepasseerd is (dan is de schuld feitelijk in
 * "overstand"-fase).
 */
function remainingMonthsFromEndDate(endDate: string | null, referenceDate: Date): number | null {
  if (!endDate) return null
  const end = new Date(endDate)
  const diffMs = end.getTime() - referenceDate.getTime()
  if (diffMs <= 0) return 0
  // 30.44 = gemiddelde dagen per maand (365.25 / 12); zelfde constant als
  // in computeExpectedBalance / computeRenteAflossingsSplit voor consistentie.
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.44)))
}

/**
 * Vorm een leesbare adres-string uit los opgeslagen postcode + huisnummer.
 * Hoofd-letters voor de postcode-prefix conform NL-conventie.
 */
function formatAddress(postcode: string | null, houseNumber: string | null): string | null {
  if (!postcode && !houseNumber) return null
  const parts: string[] = []
  if (postcode) parts.push(postcode.toUpperCase().trim())
  if (houseNumber) parts.push(houseNumber.trim())
  return parts.join(' ') || null
}

/**
 * Bouw één asset-item uit een DB-rij. Pakt de type-specifieke velden alleen
 * op wanneer ze van toepassing zijn — anders blijven ze `null` zoals
 * gespecificeerd in `VermogenAssetItem`.
 */
function buildAssetItem(a: Asset, linkedAssetsById: Map<string, Asset>): VermogenAssetItem {
  const inclusionPct = Number(a.net_worth_inclusion_pct ?? 100)
  const currentValue = Math.round(Number(a.current_value) || 0)
  const weightedValue = Math.round(currentValue * (inclusionPct / 100))

  const subtypeMap = ASSET_SUBTYPE_LABELS[a.asset_type as AssetType] ?? {}
  const subtypeLabel = a.subtype ? subtypeMap[a.subtype] ?? null : null

  // Rental income wordt in DB als MAANDbedrag bijgehouden — bevestigd door
  // assets-client.tsx (label "Huurinkomsten p/m"), verhuurrendement/calc.ts
  // (monthlyRent) en asset-kpi.ts (rentalMonthly * 12). Hier vermenigvuldigen
  // we met 12 naar een jaarbedrag, conform het `rentalIncomeYearly`-contract.
  const rentalIncomeRaw = a.rental_income == null ? null : Number(a.rental_income) * 12
  // Linked asset alleen ophalen voor vordering — daar bepaalt de spec
  // dat we de gekoppelde-asset-naam in de details-regel tonen.
  const linkedAssetName = a.asset_type === 'vordering' && a.linked_asset_id
    ? linkedAssetsById.get(a.linked_asset_id)?.name ?? null
    : null

  return {
    id: a.id,
    name: a.name,
    subtypeLabel,
    subtype: a.subtype ?? null,
    currentValue,
    inclusionPct,
    weightedValue,
    // DB slaat expected_return op als percentage al (bv. 7), niet als fractie.
    // Lees als-is; UI rendert "{n}%".
    expectedReturnPct: a.expected_return == null ? null : Number(a.expected_return),
    monthlyContribution: Number(a.monthly_contribution) || 0,
    ownership: a.ownership === 'shared' ? 'shared' : 'personal',

    wozValue: a.woz_value == null ? null : Math.round(Number(a.woz_value)),
    addressLine: formatAddress(a.address_postcode, a.address_house_number),
    rentalIncomeYearly: rentalIncomeRaw && rentalIncomeRaw > 0 ? Math.round(rentalIncomeRaw) : null,
    riskProfile: a.risk_profile ?? null,
    tickerSymbol: a.ticker_symbol ?? null,
    retirementProvider: a.retirement_provider_type ?? null,
    institution: a.institution ?? null,
    kvkNumber: a.kvk_number ?? null,
    ownershipPercentage: a.ownership_percentage == null ? null : Number(a.ownership_percentage),
    annualDividend: a.annual_dividend == null ? null : Math.round(Number(a.annual_dividend)),
    depreciationRate: a.depreciation_rate == null ? null : Number(a.depreciation_rate),
    expiryDate: a.expiry_date ?? null,
    beneficiary: a.beneficiary ?? null,
    linkedAssetName,

    hasBudgetTracking: a.has_budget_tracking === true,
    hasHoldingsTracking: a.has_holdings_tracking === true,
    hasWoonbalansTracking: a.has_woonbalans_tracking === true,
    hasRentalTracking: a.has_rental_tracking === true,
  }
}

/**
 * Bouw één debt-item uit een DB-rij. Spiegelt `buildAssetItem` voor de debt
 * kant: alle algemene velden plus type-specifieke kenmerken.
 */
function buildDebtItem(d: Debt, referenceDate: Date): VermogenDebtItem {
  const inclusionPct = Number(d.net_worth_inclusion_pct ?? 100)
  const currentBalance = Math.round(Number(d.current_balance) || 0)
  const weightedBalance = Math.round(currentBalance * (inclusionPct / 100))

  const subtypeMap = DEBT_SUBTYPE_LABELS[d.debt_type as DebtType] ?? {}
  const subtypeLabel = d.subtype ? subtypeMap[d.subtype] ?? null : null
  const repaymentTypeLabel = d.repayment_type
    ? REPAYMENT_TYPE_LABELS[d.repayment_type] ?? null
    : null

  return {
    id: d.id,
    name: d.name,
    typeLabel: DEBT_TYPE_LABELS[d.debt_type as DebtType] ?? d.debt_type,
    subtype: d.subtype ?? null,
    subtypeLabel,
    currentBalance,
    interestRatePct: Number(d.interest_rate) || 0,
    remainingMonths: remainingMonthsFromEndDate(d.end_date, referenceDate),
    monthlyPayment: Math.round((Number(d.monthly_payment) || 0) * 100) / 100,
    repaymentTypeLabel,
    repaymentType: d.repayment_type ?? null,
    nhg: d.nhg ?? null,
    creditor: d.creditor ?? null,

    fixedRateEndDate: d.fixed_rate_end_date ?? null,
    isTaxDeductible: d.is_tax_deductible ?? null,
    draagkrachtmetingDate: d.draagkrachtmeting_date ?? null,
    taxYear: d.tax_year ?? null,
    hasPaymentPlan: d.has_payment_plan === true,
    hasWrittenAgreement: d.has_written_agreement === true,

    inclusionPct,
    weightedBalance,
    hasHypotheekplannerTracking: d.has_hypotheekplanner_tracking === true,
  }
}

/**
 * Groepeer assets per `asset_type` in de canonieke volgorde van
 * `ASSET_TYPE_LABELS`. Lege categorieën worden weggefilterd.
 */
function buildAssetCategories(assets: Asset[], linkedAssetsById: Map<string, Asset>): VermogenAssetCategory[] {
  const categories: VermogenAssetCategory[] = []
  for (const type of Object.keys(ASSET_TYPE_LABELS) as AssetType[]) {
    const items = assets
      .filter((a) => a.asset_type === type)
      .map((a) => buildAssetItem(a, linkedAssetsById))
    if (items.length === 0) continue
    const subtotal = items.reduce((s, i) => s + i.weightedValue, 0)
    categories.push({
      type,
      label: ASSET_TYPE_LABELS[type],
      // Eigen woning krijgt zijn eigen 'wonen'-groep in het rapport; alle
      // andere types vallen onder 'bezittingen'. Renderers die de groep
      // niet kennen vallen terug op de bestaande flat-lijst.
      group: ASSET_GROUP_FOR_TYPE[type],
      items,
      subtotal,
    })
  }
  return categories
}

function buildDebtCategories(debts: Debt[], referenceDate: Date): VermogenDebtCategory[] {
  const categories: VermogenDebtCategory[] = []
  for (const type of Object.keys(DEBT_TYPE_LABELS) as DebtType[]) {
    const items = debts
      .filter((d) => d.debt_type === type)
      .map((d) => buildDebtItem(d, referenceDate))
    if (items.length === 0) continue
    const subtotal = items.reduce((s, i) => s + i.weightedBalance, 0)
    categories.push({
      type,
      label: DEBT_TYPE_LABELS[type],
      items,
      subtotal,
    })
  }
  return categories
}

// ── Budgetteren-app sectie ───────────────────────────────────────────

interface BudgetRow {
  id: string
  parent_id: string | null
  name: string
  icon: string
  default_limit: number
  budget_type: string
  is_essential: boolean
  is_archived: boolean | null
}

interface TxRow {
  budget_id: string | null
  amount: number
}

function NL_MONTH_LABEL(year: number, month: number): string {
  const months = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December']
  return `${months[month - 1]} ${year}`
}

async function loadBudgetterenSection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  referenceDate: Date,
): Promise<VermogenBudgetterenSection | null> {
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth() + 1
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

  // Vorige maand window — voor de spaarquote-uitsplitsing.
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const prevStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`
  const prevEnd = monthStart

  const [budgetsResult, currentTxResult, prevTxResult] = await Promise.all([
    supabase.from('budgets').select('id, parent_id, name, icon, default_limit, budget_type, is_essential, is_archived').eq('is_archived', false),
    supabase.from('transactions').select('budget_id, amount').gte('date', monthStart).lt('date', monthEnd),
    supabase.from('transactions').select('budget_id, amount').gte('date', prevStart).lt('date', prevEnd),
  ])

  const budgets = ((budgetsResult.data ?? []) as unknown as BudgetRow[]).filter((b) => !b.is_archived)
  if (budgets.length === 0) return null

  const currentTx = (currentTxResult.data ?? []) as unknown as TxRow[]
  const prevTx = (prevTxResult.data ?? []) as unknown as TxRow[]

  // Map budget-id → categorie-naam-keten zodat we per parent-categorie
  // de top-5 spenders kunnen tonen op een leesbare manier.
  const byId = new Map<string, BudgetRow>()
  for (const b of budgets) byId.set(b.id, b)

  // Bepaal voor elke transactie welke top-level parent-categorie het is.
  function rollupParent(budgetId: string | null): string | null {
    if (!budgetId) return null
    const seen = new Set<string>()
    let cur = byId.get(budgetId)
    while (cur && cur.parent_id && !seen.has(cur.id)) {
      seen.add(cur.id)
      cur = byId.get(cur.parent_id)
    }
    return cur?.id ?? null
  }

  // Spending per parent — voor top-5.
  const spendByParent = new Map<string, number>()
  for (const t of currentTx) {
    const parentId = rollupParent(t.budget_id)
    if (!parentId) continue
    const parent = byId.get(parentId)
    if (!parent || parent.budget_type === 'income' || parent.budget_type === 'archive') continue
    const amt = Math.abs(Number(t.amount) || 0)
    spendByParent.set(parentId, (spendByParent.get(parentId) ?? 0) + amt)
  }

  // Totaal begroot (maandelijks) op parent-niveau voor expense-categorieën.
  // Volgt het patroon van `app/api/report/budget/route.ts` — als parent
  // children heeft, tellen we de children; anders de parent zelf.
  const parents = budgets.filter((b) => !b.parent_id)
  const children = budgets.filter((b) => b.parent_id)
  let totalBudgetedMonthly = 0
  for (const p of parents) {
    if (p.budget_type !== 'expense') continue
    const ownChildren = children.filter((c) => c.parent_id === p.id)
    if (ownChildren.length > 0) {
      totalBudgetedMonthly += ownChildren.reduce((s, c) => s + Number(c.default_limit), 0)
    } else {
      totalBudgetedMonthly += Number(p.default_limit) || 0
    }
  }

  const totalSpentThisMonth = Array.from(spendByParent.values()).reduce((s, v) => s + v, 0)

  // Top-5 categorieën op uitgaven deze maand.
  const topCategories = Array.from(spendByParent.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, spent]) => {
      const parent = byId.get(id)!
      const ownChildren = children.filter((c) => c.parent_id === parent.id)
      const limit = ownChildren.length > 0
        ? ownChildren.reduce((s, c) => s + Number(c.default_limit), 0)
        : Number(parent.default_limit) || 0
      return {
        name: parent.name,
        icon: parent.icon ?? '📦',
        spent: Math.round(spent),
        limit: Math.round(limit),
      }
    })

  // Spaarquote vorige maand: (income − expenses) / income × 100.
  // Income = positieve transacties op income-budgets; expenses = abs van
  // negatieve transacties op alle non-income-budgets.
  let prevIncome = 0
  let prevExpense = 0
  for (const t of prevTx) {
    const parentId = rollupParent(t.budget_id)
    if (!parentId) continue
    const parent = byId.get(parentId)
    if (!parent) continue
    const amt = Number(t.amount) || 0
    if (parent.budget_type === 'income') {
      prevIncome += Math.abs(amt)
    } else if (parent.budget_type === 'expense') {
      prevExpense += Math.abs(amt)
    }
  }
  const savingsRateLastMonth = prevIncome > 0
    ? Math.round(((prevIncome - prevExpense) / prevIncome) * 100)
    : null

  return {
    totalCategories: parents.filter((b) => b.budget_type === 'expense' || b.budget_type === 'savings').length,
    totalBudgetedMonthly: Math.round(totalBudgetedMonthly),
    totalSpentThisMonth: Math.round(totalSpentThisMonth),
    topCategories,
    savingsRateLastMonth,
    monthLabel: NL_MONTH_LABEL(year, month),
  }
}

// ── Holdings-app sectie ──────────────────────────────────────────────

interface InvestmentHoldingRow {
  asset_id: string
  ticker: string | null
  name: string | null
  units: number | null
  avg_purchase_price: number | null
  current_price: number | null
}

interface CryptoHoldingRow {
  asset_id: string
  symbol: string | null
  name: string | null
  units: number | null
  avg_purchase_price: number | null
  current_price: number | null
}

async function loadHoldingsSection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  trackedAssets: Asset[],
): Promise<VermogenHoldingsSection | null> {
  if (trackedAssets.length === 0) return null
  const trackedIds = trackedAssets.map((a) => a.id)
  const nameById = new Map<string, string>()
  for (const a of trackedAssets) nameById.set(a.id, a.name)

  const [invResult, cryResult] = await Promise.all([
    supabase
      .from('investment_holdings')
      .select('asset_id, ticker, name, units, avg_purchase_price, current_price')
      .eq('is_active', true)
      .in('asset_id', trackedIds),
    supabase
      .from('crypto_holdings')
      .select('asset_id, symbol, name, units, avg_purchase_price, current_price')
      .eq('is_active', true)
      .in('asset_id', trackedIds),
  ])

  const invRows = (invResult.data ?? []) as unknown as InvestmentHoldingRow[]
  const cryRows = (cryResult.data ?? []) as unknown as CryptoHoldingRow[]

  const rows: VermogenHoldingRow[] = []
  let totalMarketValue = 0
  let totalCost = 0

  for (const h of invRows) {
    const units = Number(h.units) || 0
    const avg = Number(h.avg_purchase_price) || 0
    // Fallback naar gemiddelde aankoopkoers als geen current_price beschikbaar
    // — zelfde regel als `loadHoldingsData`.
    const price = h.current_price != null ? Number(h.current_price) : avg
    const marketValue = units * price
    totalMarketValue += marketValue
    totalCost += units * avg
    rows.push({
      parentAssetName: nameById.get(h.asset_id) ?? 'Beleggingsdepot',
      ticker: h.ticker ?? '—',
      name: h.name ?? h.ticker ?? '—',
      units,
      avgPurchasePrice: Math.round(avg * 100) / 100,
      currentPrice: Math.round(price * 100) / 100,
      marketValue: Math.round(marketValue),
      bucket: 'investment',
    })
  }

  for (const h of cryRows) {
    const units = Number(h.units) || 0
    const avg = Number(h.avg_purchase_price) || 0
    const price = h.current_price != null ? Number(h.current_price) : avg
    const marketValue = units * price
    totalMarketValue += marketValue
    totalCost += units * avg
    const ticker = h.symbol ? `${h.symbol.toUpperCase()}-EUR` : '—'
    rows.push({
      parentAssetName: nameById.get(h.asset_id) ?? 'Crypto-portfolio',
      ticker,
      name: h.name ?? h.symbol ?? '—',
      units,
      avgPurchasePrice: Math.round(avg * 100) / 100,
      currentPrice: Math.round(price * 100) / 100,
      marketValue: Math.round(marketValue),
      bucket: 'crypto',
    })
  }

  if (rows.length === 0) return null

  // Sorteer op marktwaarde aflopend — grootste posities bovenaan voor
  // direct overzicht ("waar zit het geld?").
  rows.sort((a, b) => b.marketValue - a.marketValue)

  return {
    totalMarketValue: Math.round(totalMarketValue),
    totalCost: Math.round(totalCost),
    rows,
  }
}

// ── Woonbalans-app sectie ────────────────────────────────────────────

function buildWoonbalansSection(
  trackedEigenHuizen: Asset[],
  allDebts: Debt[],
): VermogenWoonbalansSection | null {
  if (trackedEigenHuizen.length === 0) return null
  const items: VermogenWoonbalansItem[] = trackedEigenHuizen.map((a) => {
    const marketValue = Math.round(Number(a.current_value) || 0)
    const wozValue = a.woz_value == null ? null : Math.round(Number(a.woz_value))
    // Zoek hypotheek die naar deze asset wijst — de mortgage-side heeft
    // `linked_asset_id` (zie debt-data.ts), niet de asset zelf.
    const mortgage = allDebts.find(
      (d) => d.debt_type === 'mortgage' && d.linked_asset_id === a.id,
    )
    const mortgageBalance = mortgage ? Math.round(Number(mortgage.current_balance) || 0) : null
    const brutoOverwaarde = mortgageBalance != null ? marketValue - mortgageBalance : null
    const stilleReserve = wozValue != null ? marketValue - wozValue : null
    return {
      assetName: a.name,
      marketValue,
      wozValue,
      mortgageBalance,
      brutoOverwaarde,
      stilleReserve,
    }
  })
  return { items }
}

// ── Verhuurrendement-app sectie ──────────────────────────────────────

/**
 * Bezettingsgraad uit het vacancy_log: ratio van occupied-maanden over de
 * laatste 12 maanden. Returnt `null` als er minder dan 1 entry is — UI
 * toont dan een vraagteken / streepje in plaats van een misleidend 0%.
 */
function computeBezettingsgraad(log: Asset['vacancy_log']): number | null {
  if (!log || log.length === 0) return null
  // Sorteer op maand desc en pak max 12 meest recente entries.
  const recent = [...log].sort((a, b) => (b.month ?? '').localeCompare(a.month ?? '')).slice(0, 12)
  if (recent.length === 0) return null
  const occupied = recent.filter((e) => e.occupied).length
  return Math.round((occupied / recent.length) * 100)
}

function buildVerhuurSection(trackedRentals: Asset[]): VermogenVerhuurSection | null {
  if (trackedRentals.length === 0) return null
  const items: VermogenVerhuurItem[] = trackedRentals.map((a) => {
    const marketValue = Math.round(Number(a.current_value) || 0)
    // rental_income is een MAANDbedrag (zie buildAssetItem) → ×12 naar jaar.
    const rentalIncomeYearly = Math.round((Number(a.rental_income) || 0) * 12)
    const monthlyMaintenanceCost = Math.round(Number(a.monthly_maintenance_cost) || 0)
    const vvaFee = Math.round(Number(a.vva_fee) || 0)
    // Fallback op 1%-schatting wanneer geen monthly_maintenance_cost ingevuld
    // — zelfde regel als de Verhuurrendement-app (zie spec sectie 2.2 vi.d).
    const effectiveMaintenanceYearly = monthlyMaintenanceCost > 0
      ? monthlyMaintenanceCost * 12
      : marketValue * 0.01
    const yearlyCosts = effectiveMaintenanceYearly + vvaFee * 12
    const brutoRendementPct = marketValue > 0
      ? Math.round((rentalIncomeYearly / marketValue) * 10000) / 100
      : 0
    const nettoRendementPct = marketValue > 0
      ? Math.round(((rentalIncomeYearly - yearlyCosts) / marketValue) * 10000) / 100
      : 0
    return {
      assetName: a.name,
      marketValue,
      rentalIncomeYearly,
      monthlyMaintenanceCost,
      vvaFee,
      brutoRendementPct,
      nettoRendementPct,
      bezettingsgraadPct: computeBezettingsgraad(a.vacancy_log),
    }
  })
  return { items }
}

// ── Hypotheekplanner-app sectie ──────────────────────────────────────

/**
 * Bereken aflos-schema voor één hypotheek. Hergebruikt de
 * `amortizationSchedule` / `linearAmortization` / `interestOnlySchedule`
 * uit `lib/debt-data.ts` zodat het exact dezelfde getallen oplevert als
 * de Hypotheekplanner-tab.
 */
function buildHypotheekItem(d: Debt): VermogenHypotheekItem {
  const expected = computeExpectedBalance(d)
  const rt = d.repayment_type ?? 'annuiteit'
  const balance = Number(d.current_balance) || 0
  const rate = Number(d.interest_rate) || 0

  // Bouw schema afhankelijk van type. Voor `aflossingsvrij` zonder
  // einddatum vallen we terug op 360 maanden (30 jaar) zodat de UI altijd
  // iets toont.
  let schedule: VermogenHypotheekRow[] = []
  if (rt === 'aflossingsvrij') {
    const months = remainingMonthsFromEndDate(d.end_date, new Date()) ?? 360
    schedule = interestOnlySchedule(balance, rate, Math.min(months, 360))
  } else if (rt === 'lineair') {
    const months = remainingMonthsFromEndDate(d.end_date, new Date()) ?? 240
    schedule = linearAmortization(balance, rate, Math.max(1, months))
  } else {
    // annuiteit (default)
    const monthly = Number(d.monthly_payment) || 0
    schedule = monthly > 0 ? amortizationSchedule(balance, rate, monthly) : []
  }

  const firstYear = schedule.slice(0, 12)
  const endRow = schedule[schedule.length - 1]
  // Totaal-resterende rente = som van interest over hele schedule. Voor
  // aflossingsvrij gebruik je computeExpectedBalance dat hetzelfde berekent.
  const totalRemainingInterest = schedule.reduce((s, r) => s + r.interest, 0)

  return {
    debtName: d.name,
    currentBalance: Math.round(balance),
    monthlyPayment: Math.round((Number(d.monthly_payment) || 0) * 100) / 100,
    interestRatePct: rate,
    repaymentTypeLabel: d.repayment_type ? REPAYMENT_TYPE_LABELS[d.repayment_type] : null,
    totalRemainingInterest: Math.round(totalRemainingInterest),
    firstYearSchedule: firstYear,
    endBalance: Math.round(endRow?.balance ?? expected?.expectedBalance ?? 0),
  }
}

function buildHypotheekSection(trackedMortgages: Debt[]): VermogenHypotheekSection | null {
  if (trackedMortgages.length === 0) return null
  return {
    items: trackedMortgages.map(buildHypotheekItem),
  }
}

// ── Daily expense rate ───────────────────────────────────────────────

/**
 * Canoniek dagtarief (€/dag) via de gedeelde bron `lib/expense-rate.ts` —
 * zelfde 12-mnd rolling grondslag als balans/budget-rapport, dashboard-widgets
 * en de sidebar (KRUIS-20). Op 2 decimalen afgerond voor de rapport-weergave.
 */
async function computeDailyExpenseRate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  referenceDate: Date,
): Promise<number> {
  const { dailyRate } = await getRecentDailyExpenseRate(supabase, referenceDate)
  return Math.round(dailyRate * 100) / 100
}

// ── Main handler ─────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    const url = new URL(request.url)
    const dateParam = url.searchParams.get('date') || new Date().toISOString().split('T')[0]
    const referenceDate = new Date(dateParam)
    if (Number.isNaN(referenceDate.getTime())) {
      return Response.json({ error: 'Ongeldige peildatum' }, { status: 400 })
    }

    // ── Parallel loads ──
    // Eén SELECT * op assets/debts zodat alle type-specifieke kolommen
    // beschikbaar zijn voor de detail-regels. Dit is een rapport-route —
    // page-load gevoeligheid is acceptabel.
    const [assetsResult, debtsResult, profileResult] = await Promise.all([
      supabase.from('assets').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
      supabase.from('debts').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
      supabase.from('profiles').select('full_name').single(),
    ])

    const assets = (assetsResult.data ?? []) as unknown as Asset[]
    const debts = (debtsResult.data ?? []) as unknown as Debt[]
    const profile = profileResult.data

    // Index assets voor `vordering`-linked-asset-resolver.
    const assetsById = new Map<string, Asset>()
    for (const a of assets) assetsById.set(a.id, a)

    const assetCategories = buildAssetCategories(assets, assetsById)
    const debtCategories = buildDebtCategories(debts, referenceDate)
    const totalAssets = assetCategories.reduce((s, c) => s + c.subtotal, 0)
    const totalDebts = debtCategories.reduce((s, c) => s + c.subtotal, 0)
    const totalAssetCount = assetCategories.reduce((s, c) => s + c.items.length, 0)
    const totalDebtCount = debtCategories.reduce((s, c) => s + c.items.length, 0)
    const eigenVermogen = totalAssets - totalDebts

    // ── App-deepening (conditional) ──
    // We bekijken eerst welke modules content krijgen: dit beperkt de
    // hoeveelheid I/O voor users zonder app-activatie.
    const cashWithBudget = assets.filter(
      (a) => a.asset_type === 'cash' && a.has_budget_tracking === true,
    )
    const trackedHoldingsAssets = assets.filter(
      (a) =>
        (a.asset_type === 'investment' || a.asset_type === 'crypto') &&
        a.has_holdings_tracking === true,
    )
    const trackedEigenHuizen = assets.filter(
      (a) => a.asset_type === 'eigen_huis' && a.has_woonbalans_tracking === true,
    )
    const trackedRentals = assets.filter(
      (a) => a.asset_type === 'real_estate' && a.has_rental_tracking === true,
    )
    const trackedMortgages = debts.filter(
      (d) => d.debt_type === 'mortgage' && d.has_hypotheekplanner_tracking === true,
    )

    // Parallel: alleen de secties met data ophalen.
    const [budgetterenSection, holdingsSection, dailyExpenseRate] = await Promise.all([
      cashWithBudget.length > 0 ? loadBudgetterenSection(supabase, referenceDate) : Promise.resolve(null),
      trackedHoldingsAssets.length > 0 ? loadHoldingsSection(supabase, trackedHoldingsAssets) : Promise.resolve(null),
      computeDailyExpenseRate(supabase, referenceDate),
    ])

    const woonbalansSection = buildWoonbalansSection(trackedEigenHuizen, debts)
    const verhuurSection = buildVerhuurSection(trackedRentals)
    const hypotheekSection = buildHypotheekSection(trackedMortgages)

    const payload: VermogenReportData = {
      date: dateParam,
      generatedAt: new Date().toISOString(),
      displayName: profile?.full_name ?? null,
      dailyExpenseRate,
      assets: assetCategories,
      totalAssets,
      totalAssetCount,
      debts: debtCategories,
      totalDebts,
      totalDebtCount,
      eigenVermogen,
      budgetterenSection,
      holdingsSection,
      woonbalansSection,
      verhuurSection,
      hypotheekSection,
    }

    return Response.json(payload)
  } catch (error) {
    console.error('Vermogen report generation error:', error)
    return Response.json(
      { error: 'Vermogensoverzicht genereren mislukt. Probeer het later opnieuw.' },
      { status: 500 },
    )
  }
}
