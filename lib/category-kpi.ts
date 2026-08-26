/**
 * Categorie-aggregaten voor de KPI-strip op de Kern-landing.
 *
 * Spiegel van `lib/asset-kpi.ts` en `lib/debt-kpi.ts`: dezelfde KPI's, maar
 * geaggregeerd over alle items binnen een categorie. Aggregatie-strategie
 * per type:
 *   - **Gewogen gemiddelde** voor rates/percentages (rente, LTV, yield) —
 *     gewogen op `current_value` resp. `current_balance`.
 *   - **Som** voor euro-bedragen (overwaarde, dividend, maandlast).
 *   - **Counts/ratio's** voor types zonder zinvolle weging
 *     (belastingschuld, familielening, levensverzekering KPI 2).
 *
 * Pure server-safe functies — geen 'use client'.
 */
import type { Asset, AssetType } from './asset-data'
import type { Debt, DebtType } from './debt-data'
import type { AssetKpiContext } from './asset-kpi'
import type { DebtKpiContext } from './debt-kpi'
import type { KpiPair, KpiValue } from './asset-kpi'
import { formatCurrency } from './format'
import { debtRemainingMonths } from './debt-remaining-term'

// ── Helpers ────────────────────────────────────────────────────

const NL = 'nl-NL'

function formatPercent(value: number, opts: { decimals?: number; signed?: boolean } = {}): string {
  const { decimals = 1, signed = false } = opts
  const formatted = value.toLocaleString(NL, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  if (signed && value > 0) return `+${formatted}%`
  return `${formatted}%`
}

function diffMonths(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  return Math.max(0, months)
}

function diffYearsApprox(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime()
  if (ms <= 0) return 0
  return ms / (1000 * 60 * 60 * 24 * 365.25)
}

function toneFromSign(value: number): KpiValue['tone'] {
  if (value > 0) return 'pos'
  if (value < 0) return 'neg'
  return 'neutral'
}

/**
 * Gewogen gemiddelde. Items waarvan `weight` of `value` niet finite is
 * worden uitgesloten. Geeft `null` als er geen valide items zijn — caller
 * laat de KPI dan vervallen.
 */
function weightedAverage(
  items: Array<{ value: number; weight: number }>,
): number | null {
  let sumWV = 0
  let sumW = 0
  for (const { value, weight } of items) {
    if (!isFinite(value) || !isFinite(weight) || weight <= 0) continue
    sumWV += value * weight
    sumW += weight
  }
  if (sumW <= 0) return null
  return sumWV / sumW
}

function sumValid(values: number[]): number {
  let total = 0
  for (const v of values) {
    if (isFinite(v)) total += v
  }
  return total
}

// ── Resterende looptijd voor schulden — gedeelde bron met debt-kpi.
//    Stond hier eerder als letterlijke kopie ("identieke logica"), wat
//    betekende dat een fix in debt-kpi dit oppervlak stuk liet. De logica
//    woont nu in lib/debt-remaining-term.ts; dat bestand importeert alleen
//    debt-data, dus er is geen circulaire import.
const remainingMonths = debtRemainingMonths

// ── Asset categorie-aggregaten ─────────────────────────────────

function aggCash(assets: Asset[], ctx: AssetKpiContext): KpiPair {
  const stats = ctx.cashStatsByAssetId
  // Geen transactiedata beschikbaar (bv. cash-categorie zonder gekoppelde
  // bank-rekeningen) → val terug op gewogen gemiddelde rente. Dit voorkomt
  // dat de categorie­kaart leeg blijft.
  if (!stats || stats.size === 0) {
    const items = assets.map((a) => ({
      value: Number(a.expected_return),
      weight: Number(a.current_value),
    }))
    const avg = weightedAverage(items)
    if (avg == null) return {}
    return {
      primary: { value: formatPercent(avg, { decimals: 1 }), label: 'rente', tone: 'neutral' },
    }
  }

  // Aggregeer over alle assets in de groep. Mix-gebruik: transactie-stats
  // (budgetteren) en herwaarderings-stats (handmatige rekeningen) tellen
  // allebei mee voor het maandtotaal — beide vertegenwoordigen netto
  // saldoverandering. De "hoogste uitgave"-KPI komt alleen uit transactie-
  // stats; herwaarderings-rekeningen hebben geen losse uitgaven om te tonen.
  let totalMonthly = 0
  let biggestExpense = 0
  let biggestExpenseLabel: string | undefined
  let hasAnyMonthly = false
  let hasAnyExpense = false

  for (const a of assets) {
    const s = stats.get(a.id)
    if (!s) continue
    if (isFinite(s.monthlyChangeEur)) {
      totalMonthly += s.monthlyChangeEur
      hasAnyMonthly = true
    }
    if (s.kind === 'transaction' && isFinite(s.biggestExpenseEur) && s.biggestExpenseEur > biggestExpense) {
      biggestExpense = s.biggestExpenseEur
      biggestExpenseLabel = s.biggestExpenseLabel
      hasAnyExpense = true
    }
  }

  // KPI 1 — totaal mutatie deze maand
  let primary: KpiValue | undefined
  if (hasAnyMonthly) {
    primary = {
      value: totalMonthly > 0
        ? `+${formatCurrency(totalMonthly)}`
        : formatCurrency(totalMonthly),
      label: 'deze maand',
      tone: toneFromSign(totalMonthly),
      icon: totalMonthly > 0 ? 'up' : totalMonthly < 0 ? 'down' : null,
    }
  }

  // KPI 2 — hoogste uitgave
  let secondary: KpiValue | undefined
  if (hasAnyExpense) {
    secondary = {
      value: `−${formatCurrency(biggestExpense)}`,
      label: biggestExpenseLabel ? `${biggestExpenseLabel.slice(0, 18)}` : 'hoogste',
      tone: 'neg',
    }
  }

  return { primary, secondary }
}

function aggSavings(assets: Asset[], ctx: AssetKpiContext): KpiPair {
  // KPI 1 — gewogen gem. rente
  const rateItems = assets.map((a) => ({
    value: Number(a.expected_return),
    weight: Number(a.current_value),
  }))
  const avgRate = weightedAverage(rateItems)
  const primary: KpiValue | undefined = avgRate != null
    ? { value: formatPercent(avgRate, { decimals: 1 }), label: 'rente', tone: 'neutral' }
    : undefined

  // KPI 2 — gewogen gem. vasttijd (alleen items met einddatum)
  const now = ctx.now ?? new Date()
  const lockItems = assets
    .filter((a) => a.lock_end_date)
    .map((a) => ({
      value: diffMonths(now, new Date(a.lock_end_date!)),
      weight: Number(a.current_value),
    }))
    .filter((i) => i.value > 0)
  const avgMonths = lockItems.length > 0 ? weightedAverage(lockItems) : null
  const secondary: KpiValue | undefined = avgMonths != null
    ? { value: `${Math.round(avgMonths)} mnd`, label: 'gem. vast', tone: 'neutral' }
    : undefined

  return { primary, secondary }
}

function aggInvestment(assets: Asset[], ctx: AssetKpiContext): KpiPair {
  // Aggregatie via holdings als beschikbaar; anders fallback op
  // current_value vs purchase_value.
  let totalValue = 0
  let dailyChangeAbsolute = 0
  let totalCost = 0
  let hasHoldings = false

  for (const asset of assets) {
    const holdings = ctx.holdingsByAssetId?.get(asset.id) ?? []
    if (holdings.length > 0) {
      hasHoldings = true
      for (const h of holdings) {
        const units = Number(h.units) || 0
        const currentPrice = h.current_price != null ? Number(h.current_price) : Number(h.avg_purchase_price) || 0
        const avg = Number(h.avg_purchase_price) || 0
        const dailyPct = Number(h.daily_change_percent) || 0
        const value = units * currentPrice
        totalValue += value
        totalCost += units * avg
        dailyChangeAbsolute += value * (dailyPct / 100)
      }
    } else {
      // Fallback per asset
      const purchase = Number(asset.purchase_value) || 0
      const current = Number(asset.current_value) || 0
      totalValue += current
      totalCost += purchase
    }
  }

  if (totalValue <= 0) return {}

  // KPI 1 — dagverandering (alleen als minstens één holding aanwezig)
  let primary: KpiValue | undefined
  if (hasHoldings) {
    const baseValue = totalValue - dailyChangeAbsolute
    const dailyPct = baseValue > 0 ? (dailyChangeAbsolute / baseValue) * 100 : 0
    primary = {
      value: formatPercent(dailyPct, { decimals: 1, signed: true }),
      label: 'vandaag',
      tone: toneFromSign(dailyPct),
      icon: dailyPct > 0 ? 'up' : dailyPct < 0 ? 'down' : null,
    }
  }

  // KPI 2 — totaalrendement t.o.v. cost basis
  let secondary: KpiValue | undefined
  if (totalCost > 0) {
    const totalReturnPct = ((totalValue - totalCost) / totalCost) * 100
    secondary = {
      value: formatPercent(totalReturnPct, { decimals: 1, signed: true }),
      label: 'totaal',
      tone: toneFromSign(totalReturnPct),
    }
  }

  return { primary, secondary }
}

function aggCrypto(assets: Asset[], ctx: AssetKpiContext): KpiPair {
  // Crypto deelt aggregatie-pad met investment.
  return aggInvestment(assets, ctx)
}

function aggRetirement(assets: Asset[]): KpiPair {
  // KPI 1 — som maandbijdrage
  const totalMonthly = sumValid(assets.map((a) => Number(a.monthly_contribution)))
  const primary: KpiValue | undefined = totalMonthly > 0
    ? { value: `${formatCurrency(totalMonthly)}/mnd`, tone: 'neutral' }
    : undefined

  // KPI 2 — gewogen gem. verwacht rendement
  const items = assets.map((a) => ({
    value: Number(a.expected_return),
    weight: Number(a.current_value),
  }))
  const avg = weightedAverage(items)
  const secondary: KpiValue | undefined = avg != null && avg > 0
    ? { value: formatPercent(avg, { decimals: 1 }), label: 'verwacht', tone: 'neutral' }
    : undefined

  return { primary, secondary }
}

function aggEigenHuis(assets: Asset[], ctx: AssetKpiContext): KpiPair {
  // KPI 1 — gewogen Δ% boven WOZ
  const wozItems = assets
    .filter((a) => Number(a.woz_value) > 0 && Number(a.current_value) > 0)
    .map((a) => {
      const market = Number(a.current_value)
      const woz = Number(a.woz_value)
      const deltaPct = ((market - woz) / woz) * 100
      return { value: deltaPct, weight: market }
    })
  const avgDelta = wozItems.length > 0 ? weightedAverage(wozItems) : null
  const primary: KpiValue | undefined = avgDelta != null
    ? {
        value: formatPercent(avgDelta, { decimals: 0, signed: true }),
        label: 'boven WOZ',
        tone: toneFromSign(avgDelta),
      }
    : undefined

  // KPI 2 — som overwaarde (alleen voor items met gekoppelde hypotheek)
  let totalOverwaarde = 0
  let countOverwaarde = 0
  for (const a of assets) {
    const market = Number(a.current_value)
    const linkedDebt = ctx.linkedDebtBalanceByAssetId?.get(a.id) ?? 0
    if (market > 0 && linkedDebt > 0) {
      totalOverwaarde += Math.max(0, market - linkedDebt)
      countOverwaarde++
    }
  }
  const secondary: KpiValue | undefined = countOverwaarde > 0
    ? { value: formatCurrency(totalOverwaarde), label: 'overwaarde', tone: 'pos' }
    : undefined

  return { primary, secondary }
}

function aggRealEstate(assets: Asset[]): KpiPair {
  // KPI 1 — gewogen gem. bruto huurrendement
  const yieldItems = assets
    .filter((a) => Number(a.current_value) > 0 && Number(a.rental_income) > 0)
    .map((a) => {
      const market = Number(a.current_value)
      const rentMonthly = Number(a.rental_income)
      const grossYield = ((rentMonthly * 12) / market) * 100
      return { value: grossYield, weight: market }
    })
  const avgYield = yieldItems.length > 0 ? weightedAverage(yieldItems) : null
  const primary: KpiValue | undefined = avgYield != null
    ? { value: formatPercent(avgYield, { decimals: 1 }), label: 'rendement', tone: 'neutral' }
    : undefined

  // KPI 2 — gewogen gem. bezetting (alleen items met logs)
  const occItems = assets
    .filter((a) => Array.isArray(a.vacancy_log) && a.vacancy_log.length > 0)
    .map((a) => {
      const log = a.vacancy_log!.slice(-12)
      const occ = log.filter((e) => e.occupied).length
      return { value: (occ / log.length) * 100, weight: Number(a.current_value) }
    })
  const avgOcc = occItems.length > 0 ? weightedAverage(occItems) : null
  const secondary: KpiValue | undefined = avgOcc != null
    ? {
        value: formatPercent(avgOcc, { decimals: 0 }),
        label: 'bezet',
        tone: avgOcc >= 80 ? 'pos' : avgOcc >= 50 ? 'neutral' : 'neg',
      }
    : undefined

  return { primary, secondary }
}

function aggVehicle(assets: Asset[]): KpiPair {
  // KPI 1 — som jaarlijks waardeverlies
  let totalLoss = 0
  for (const a of assets) {
    const market = Number(a.current_value)
    const rate = Number(a.depreciation_rate)
    if (market > 0 && isFinite(rate) && rate > 0) {
      totalLoss += market * (rate / 100)
    }
  }
  const primary: KpiValue | undefined = totalLoss > 0
    ? { value: `−${formatCurrency(totalLoss)}/jr`, tone: 'neg' }
    : undefined

  // KPI 2 — gewogen gem. restwaarde
  const items = assets
    .filter((a) => Number(a.purchase_value) > 0 && Number(a.current_value) > 0)
    .map((a) => ({
      value: (Number(a.current_value) / Number(a.purchase_value)) * 100,
      weight: Number(a.purchase_value),
    }))
  const avg = items.length > 0 ? weightedAverage(items) : null
  const secondary: KpiValue | undefined = avg != null
    ? {
        value: formatPercent(avg, { decimals: 0 }),
        label: 'van aankoop',
        tone: avg >= 70 ? 'pos' : avg >= 40 ? 'neutral' : 'neg',
      }
    : undefined

  return { primary, secondary }
}

function aggPhysical(assets: Asset[]): KpiPair {
  // KPI 1 — som waardeverandering
  let delta = 0
  let hasAny = false
  for (const a of assets) {
    const purchase = Number(a.purchase_value)
    const market = Number(a.current_value)
    if (purchase > 0 && isFinite(market)) {
      delta += market - purchase
      hasAny = true
    }
  }
  const primary: KpiValue | undefined = hasAny
    ? {
        value: delta > 0 ? `+${formatCurrency(delta)}` : formatCurrency(delta),
        label: 'totaal',
        tone: toneFromSign(delta),
      }
    : undefined

  // KPI 2 — som jaarlijks verloop
  let annual = 0
  let hasAnnual = false
  for (const a of assets) {
    const market = Number(a.current_value)
    const rate = Number(a.depreciation_rate)
    if (market > 0 && isFinite(rate) && rate !== 0) {
      annual += market * (rate / 100)
      hasAnnual = true
    }
  }
  const secondary: KpiValue | undefined = hasAnnual
    ? {
        value: annual < 0
          ? `+${formatCurrency(Math.abs(annual))}/jr`
          : `−${formatCurrency(annual)}/jr`,
        tone: annual < 0 ? 'pos' : 'neg',
      }
    : undefined

  return { primary, secondary }
}

function aggDeelneming(assets: Asset[]): KpiPair {
  // KPI 1 — vervalt (gewogen gem. eigendomspercentage is niet zinvol).
  // KPI 2 — som verwacht jaarlijks dividend.
  const total = sumValid(assets.map((a) => Number(a.annual_dividend)))
  return {
    secondary: total > 0
      ? { value: `${formatCurrency(total)}/jr`, label: 'dividend', tone: 'pos' }
      : undefined,
  }
}

function aggLevensverzekering(assets: Asset[], ctx: AssetKpiContext): KpiPair {
  // KPI 1 — gewogen gem. resterende looptijd
  const now = ctx.now ?? new Date()
  const items = assets
    .filter((a) => a.expiry_date)
    .map((a) => ({
      value: diffYearsApprox(now, new Date(a.expiry_date!)),
      weight: Number(a.current_value),
    }))
    .filter((i) => i.value > 0)
  const avgYears = items.length > 0 ? weightedAverage(items) : null
  const primary: KpiValue | undefined = avgYears != null
    ? { value: `${Math.round(avgYears)} jr`, label: 'resterend', tone: 'neutral' }
    : undefined

  // KPI 2 — "X liquide / Y vast"
  const liquid = assets.filter((a) => a.is_liquid === true).length
  const fixed = assets.filter((a) => a.is_liquid === false).length
  let secondary: KpiValue | undefined
  if (liquid > 0 && fixed > 0) {
    secondary = { value: `${liquid} liq · ${fixed} vast`, tone: 'neutral' }
  } else if (liquid > 0) {
    secondary = { value: `${liquid} liquide`, tone: 'pos' }
  } else if (fixed > 0) {
    secondary = { value: `${fixed} vast`, tone: 'neutral' }
  }
  return { primary, secondary }
}

function aggVordering(assets: Asset[], ctx: AssetKpiContext): KpiPair {
  // KPI 1 — gewogen gem. rente
  const rateItems = assets
    .filter((a) => Number(a.expected_return) > 0)
    .map((a) => ({ value: Number(a.expected_return), weight: Number(a.current_value) }))
  const avgRate = rateItems.length > 0 ? weightedAverage(rateItems) : null
  const primary: KpiValue | undefined = avgRate != null
    ? { value: formatPercent(avgRate, { decimals: 1 }), label: 'rente', tone: 'pos' }
    : undefined

  // KPI 2 — gewogen gem. resterende looptijd (alleen items met einddatum)
  const now = ctx.now ?? new Date()
  const lockItems = assets
    .filter((a) => a.lock_end_date)
    .map((a) => ({
      value: diffMonths(now, new Date(a.lock_end_date!)),
      weight: Number(a.current_value),
    }))
    .filter((i) => i.value > 0)
  const avgMonths = lockItems.length > 0 ? weightedAverage(lockItems) : null
  const secondary: KpiValue | undefined = avgMonths != null
    ? { value: `${Math.round(avgMonths)} mnd`, label: 'resterend', tone: 'neutral' }
    : undefined

  return { primary, secondary }
}

// ── Debt categorie-aggregaten ──────────────────────────────────

function aggMortgage(debts: Debt[], ctx: DebtKpiContext): KpiPair {
  // KPI 1 — gewogen gem. LTV
  const ltvItems: Array<{ value: number; weight: number }> = []
  for (const d of debts) {
    const linkedValue = ctx.linkedAssetValueByDebtId?.get(d.id)
    const balance = Number(d.current_balance)
    if (linkedValue && linkedValue > 0 && balance > 0) {
      ltvItems.push({ value: (balance / linkedValue) * 100, weight: balance })
    }
  }
  const avgLtv = ltvItems.length > 0 ? weightedAverage(ltvItems) : null
  const primary: KpiValue | undefined = avgLtv != null
    ? {
        value: formatPercent(avgLtv, { decimals: 0 }),
        label: 'LTV',
        tone: avgLtv > 100 ? 'neg' : avgLtv < 80 ? 'pos' : 'neutral',
      }
    : undefined

  // KPI 2 — gewogen gem. resterende looptijd in jaren
  const now = ctx.now ?? new Date()
  const yearItems: Array<{ value: number; weight: number }> = []
  for (const d of debts) {
    const months = remainingMonths(d, now)
    if (months != null && months > 0) {
      yearItems.push({ value: months / 12, weight: Number(d.current_balance) })
    }
  }
  const avgYears = yearItems.length > 0 ? weightedAverage(yearItems) : null
  const secondary: KpiValue | undefined = avgYears != null
    ? { value: `${Math.round(avgYears)} jr`, label: 'resterend', tone: 'neutral' }
    : undefined

  return { primary, secondary }
}

function aggSimpleRateAndTerm(debts: Debt[], ctx: DebtKpiContext): KpiPair {
  // Gedeelde aggregatie voor personal_loan, car_loan, dga_schuld, other.
  const rateItems = debts
    .filter((d) => Number(d.interest_rate) > 0)
    .map((d) => ({ value: Number(d.interest_rate), weight: Number(d.current_balance) }))
  const avgRate = rateItems.length > 0 ? weightedAverage(rateItems) : null
  const primary: KpiValue | undefined = avgRate != null
    ? { value: formatPercent(avgRate, { decimals: 1 }), label: 'rente', tone: 'neutral' }
    : undefined

  const now = ctx.now ?? new Date()
  const termItems: Array<{ value: number; weight: number }> = []
  for (const d of debts) {
    const months = remainingMonths(d, now)
    if (months != null && months > 0) {
      termItems.push({ value: months, weight: Number(d.current_balance) })
    }
  }
  const avgMonths = termItems.length > 0 ? weightedAverage(termItems) : null
  const secondary: KpiValue | undefined = avgMonths != null
    ? { value: `${Math.round(avgMonths)} mnd`, label: 'resterend', tone: 'neutral' }
    : undefined

  return { primary, secondary }
}

function aggStudentLoan(debts: Debt[]): KpiPair {
  const rateItems = debts
    .filter((d) => Number(d.interest_rate) >= 0)
    .map((d) => ({ value: Number(d.interest_rate), weight: Number(d.current_balance) }))
  const avgRate = rateItems.length > 0 ? weightedAverage(rateItems) : null
  const primary: KpiValue | undefined = avgRate != null
    ? { value: formatPercent(avgRate, { decimals: 2 }), label: 'rente', tone: 'neutral' }
    : undefined

  const totalMonthly = sumValid(debts.map((d) => Number(d.monthly_payment)))
  const secondary: KpiValue | undefined = totalMonthly > 0
    ? { value: `${formatCurrency(totalMonthly)}/mnd`, tone: 'neutral' }
    : undefined

  return { primary, secondary }
}

function aggCreditCard(debts: Debt[]): KpiPair {
  const utilItems = debts
    .filter((d) => Number(d.credit_limit) > 0)
    .map((d) => {
      const limit = Number(d.credit_limit)
      const balance = Number(d.current_balance)
      return { value: (balance / limit) * 100, weight: limit }
    })
  const avgUtil = utilItems.length > 0 ? weightedAverage(utilItems) : null
  const primary: KpiValue | undefined = avgUtil != null
    ? {
        value: formatPercent(avgUtil, { decimals: 0 }),
        label: 'benutting',
        tone: avgUtil < 30 ? 'pos' : avgUtil < 70 ? 'neutral' : 'neg',
      }
    : undefined

  const rateItems = debts
    .filter((d) => Number(d.interest_rate) > 0)
    .map((d) => ({ value: Number(d.interest_rate), weight: Number(d.current_balance) }))
  const avgRate = rateItems.length > 0 ? weightedAverage(rateItems) : null
  const secondary: KpiValue | undefined = avgRate != null
    ? { value: formatPercent(avgRate, { decimals: 1 }), label: 'rente', tone: 'neutral' }
    : undefined

  return { primary, secondary }
}

function aggBelastingschuld(debts: Debt[]): KpiPair {
  // KPI 1 — count openstaand
  const primary: KpiValue = {
    value: `${debts.length}`,
    label: debts.length === 1 ? 'aanslag' : 'aanslagen',
    tone: 'neutral',
  }

  // KPI 2 — "X met / Y zonder regeling"
  const withPlan = debts.filter((d) => d.has_payment_plan).length
  const withoutPlan = debts.length - withPlan
  let secondary: KpiValue | undefined
  if (withPlan > 0 && withoutPlan > 0) {
    secondary = { value: `${withPlan} met regeling`, tone: 'pos' }
  } else if (withPlan > 0) {
    secondary = { value: `Alle in regeling`, tone: 'pos' }
  } else if (withoutPlan > 0) {
    secondary = { value: `Geen regeling`, tone: 'neg' }
  }
  return { primary, secondary }
}

function aggPaymentPlan(debts: Debt[], ctx: DebtKpiContext): KpiPair {
  const now = ctx.now ?? new Date()
  const termItems: Array<{ value: number; weight: number }> = []
  for (const d of debts) {
    const months = remainingMonths(d, now)
    if (months != null && months > 0) {
      termItems.push({ value: months, weight: Number(d.current_balance) })
    }
  }
  const avgMonths = termItems.length > 0 ? weightedAverage(termItems) : null
  const primary: KpiValue | undefined = avgMonths != null
    ? { value: `${Math.round(avgMonths)} mnd`, label: 'resterend', tone: 'neutral' }
    : undefined

  const totalMonthly = sumValid(debts.map((d) => Number(d.monthly_payment)))
  const secondary: KpiValue | undefined = totalMonthly > 0
    ? { value: `${formatCurrency(totalMonthly)}/mnd`, tone: 'neutral' }
    : undefined

  return { primary, secondary }
}

function aggFamilielening(debts: Debt[]): KpiPair {
  const withAgreement = debts.filter((d) => d.has_written_agreement).length
  let primary: KpiValue
  if (withAgreement === debts.length) {
    primary = { value: `Alle schriftelijk`, tone: 'pos' }
  } else if (withAgreement === 0) {
    primary = { value: `Geen schriftelijk`, tone: 'neg' }
  } else {
    primary = { value: `${withAgreement} schriftelijk`, tone: 'neutral' }
  }

  // KPI 2 — gewogen gem. rente (alleen items met rente > 0)
  const rateItems = debts
    .filter((d) => Number(d.interest_rate) > 0)
    .map((d) => ({ value: Number(d.interest_rate), weight: Number(d.current_balance) }))
  const avgRate = rateItems.length > 0 ? weightedAverage(rateItems) : null
  const secondary: KpiValue | undefined = avgRate != null
    ? { value: formatPercent(avgRate, { decimals: 1 }), label: 'rente', tone: 'neutral' }
    : undefined

  return { primary, secondary }
}

function aggDgaSchuld(debts: Debt[]): KpiPair {
  // KPI 1 — gewogen gem. rente
  const rateItems = debts
    .filter((d) => Number(d.interest_rate) > 0)
    .map((d) => ({ value: Number(d.interest_rate), weight: Number(d.current_balance) }))
  const avgRate = rateItems.length > 0 ? weightedAverage(rateItems) : null
  const primary: KpiValue | undefined = avgRate != null
    ? { value: formatPercent(avgRate, { decimals: 1 }), label: 'rente', tone: 'neutral' }
    : undefined

  // KPI 2 — som saldo (al weergegeven als totaal, dus liever count)
  const secondary: KpiValue = {
    value: `${debts.length}`,
    label: debts.length === 1 ? 'schuld' : 'schulden',
    tone: 'neutral',
  }

  return { primary, secondary }
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Bereken het samengestelde KPI-paar voor een asset-categorie.
 */
export function computeAssetCategoryKpis(
  assets: Asset[],
  type: AssetType,
  ctx: AssetKpiContext = {},
): KpiPair {
  if (assets.length === 0) return {}
  const dispatch: Record<AssetType, (a: Asset[], c: AssetKpiContext) => KpiPair> = {
    cash: aggCash,
    savings: aggSavings,
    investment: aggInvestment,
    retirement: aggRetirement,
    eigen_huis: aggEigenHuis,
    real_estate: aggRealEstate,
    crypto: aggCrypto,
    vehicle: aggVehicle,
    physical: aggPhysical,
    deelneming: aggDeelneming,
    levensverzekering: aggLevensverzekering,
    vordering: aggVordering,
    other: () => ({}),
  }
  return dispatch[type](assets, ctx)
}

/**
 * Bereken het samengestelde KPI-paar voor een debt-categorie.
 */
export function computeDebtCategoryKpis(
  debts: Debt[],
  type: DebtType,
  ctx: DebtKpiContext = {},
): KpiPair {
  if (debts.length === 0) return {}
  const dispatch: Record<DebtType, (d: Debt[], c: DebtKpiContext) => KpiPair> = {
    mortgage: aggMortgage,
    personal_loan: aggSimpleRateAndTerm,
    student_loan: aggStudentLoan,
    car_loan: aggSimpleRateAndTerm,
    credit_card: aggCreditCard,
    revolving_credit: aggCreditCard,
    payment_plan: aggPaymentPlan,
    belastingschuld: aggBelastingschuld,
    familielening: aggFamilielening,
    dga_schuld: aggDgaSchuld,
    other: aggSimpleRateAndTerm,
  }
  return dispatch[type](debts, ctx)
}
