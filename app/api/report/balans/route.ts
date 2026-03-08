import { createClient } from '@/lib/supabase/server'

// ── Types ────────────────────────────────────────────────────────────────────

export interface BalansItem {
  id: string
  name: string
  type: string          // asset_type, debt_type, or bank account_type
  value: number         // weighted value (after inclusion %)
  rawValue: number      // original value before weighting
  inclusionPct: number
  interestRate?: number // only for debts
}

export interface BalansSubGroup {
  label: string
  items: BalansItem[]
  subtotal: number
}

export interface BalansCategory {
  label: string
  items: BalansItem[]
  subGroups: BalansSubGroup[]
  subtotal: number
}

export interface BalansData {
  date: string
  generatedAt: string
  displayName: string | null

  // ── ACTIVA (left side) ──
  vasteActiva: BalansCategory       // Fixed assets: woning, voertuig, fysieke bezittingen
  vlottendeActiva: BalansCategory   // Current assets: spaargeld, beleggingen, crypto, pensioen
  liquideMiddelen: BalansCategory   // Cash & bank accounts: betaal- en spaarrekeningen
  totalActiva: number

  // ── PASSIVA (right side) ──
  eigenVermogen: number              // Net worth = activa - schulden
  langVreemdVermogen: BalansCategory // Long-term: hypotheek, studielening, persoonlijke lening
  kortVreemdVermogen: BalansCategory // Short-term: creditcard, doorlopend krediet
  totalPassiva: number               // = eigenVermogen + lang + kort (equals totalActiva)

  // ── Kengetallen ──
  solvabiliteitsratio: number | null  // eigenVermogen / totalActiva × 100
  schuldgraad: number | null          // totalSchulden / eigenVermogen
  liquiditeitsratio: number | null    // vlottendeActiva+liquide / kortVreemdVermogen
  totalSchulden: number

  // ── Vrijheid ──
  dailyExpenseRate: number
}

// ── Classification maps ──────────────────────────────────────────────────────

// Asset types → vaste activa (illiquid, long-term)
const VASTE_ACTIVA_TYPES = new Set(['eigen_huis', 'real_estate', 'vehicle', 'physical'])
// Everything else → vlottende activa (liquid, convertible)

// Debt types → lang vreemd vermogen (>1 year)
const LANG_VREEMD_TYPES = new Set(['mortgage', 'personal_loan', 'student_loan', 'car_loan'])
// Everything else → kort vreemd vermogen (<1 year)

// Dutch labels for asset types
const ASSET_TYPE_LABELS: Record<string, string> = {
  savings: 'Spaargeld',
  investment: 'Beleggingen',
  retirement: 'Pensioen',
  eigen_huis: 'Eigen woning',
  real_estate: 'Vastgoed (belegging)',
  crypto: 'Crypto',
  vehicle: 'Voertuig',
  physical: 'Fysieke bezittingen',
  other: 'Overig',
}

const DEBT_TYPE_LABELS: Record<string, string> = {
  mortgage: 'Hypotheek',
  personal_loan: 'Persoonlijke lening',
  student_loan: 'Studielening',
  car_loan: 'Autolening',
  credit_card: 'Creditcard',
  revolving_credit: 'Doorlopend krediet',
  payment_plan: 'Afbetalingsregeling',
  belastingschuld: 'Belastingschuld',
  other: 'Overig',
}

const BANK_ACCOUNT_LABELS: Record<string, string> = {
  checking: 'Betaalrekening',
  savings: 'Spaarrekening',
  joint: 'En/of-rekening',
  business: 'Zakelijke rekening',
  other: 'Overige rekening',
}

function buildSubGroups(items: BalansItem[], labelMap: Record<string, string>): BalansSubGroup[] {
  const groups: Record<string, BalansItem[]> = {}
  for (const item of items) {
    if (!groups[item.type]) groups[item.type] = []
    groups[item.type].push(item)
  }
  return Object.entries(groups).map(([type, groupItems]) => ({
    label: labelMap[type] || type,
    items: groupItems,
    subtotal: groupItems.reduce((s, i) => s + i.value, 0),
  }))
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    const url = new URL(request.url)
    const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0]

    // Fetch all active assets, debts, bank accounts, profile and expense data
    const [assetsResult, debtsResult, bankResult, profileResult, expenseResult] = await Promise.allSettled([
      supabase
        .from('assets')
        .select('id, name, asset_type, current_value, is_active, net_worth_inclusion_pct')
        .eq('is_active', true),
      supabase
        .from('debts')
        .select('id, name, debt_type, current_balance, interest_rate, is_active, net_worth_inclusion_pct')
        .eq('is_active', true),
      supabase
        .from('bank_accounts')
        .select('id, name, account_type, balance, is_active')
        .eq('is_active', true),
      supabase
        .from('profiles')
        .select('full_name')
        .single(),
      supabase
        .from('transactions')
        .select('amount, date')
        .lt('amount', 0)
        .gte('date', new Date(new Date(date).getFullYear(), new Date(date).getMonth() - 11, 1).toISOString().split('T')[0])
        .lte('date', date),
    ])

    type AssetRow = { id: string; name: string; asset_type: string; current_value: number; is_active: boolean; net_worth_inclusion_pct: number }
    type DebtRow = { id: string; name: string; debt_type: string; current_balance: number; interest_rate: number; is_active: boolean; net_worth_inclusion_pct: number }
    type BankRow = { id: string; name: string; account_type: string; balance: number; is_active: boolean }
    type TxRow = { amount: number; date: string }

    const assetsRaw = (assetsResult.status === 'fulfilled' ? assetsResult.value.data ?? [] : []) as AssetRow[]
    const debtsRaw = (debtsResult.status === 'fulfilled' ? debtsResult.value.data ?? [] : []) as DebtRow[]
    const banksRaw = (bankResult.status === 'fulfilled' ? bankResult.value.data ?? [] : []) as BankRow[]
    const profile = profileResult.status === 'fulfilled' ? profileResult.value.data : null
    const expenses = (expenseResult.status === 'fulfilled' ? expenseResult.value.data ?? [] : []) as TxRow[]

    // ── Classify assets ──────────────────────────────────────────────────────

    const vasteItems: BalansItem[] = []
    const vlottendeItems: BalansItem[] = []

    for (const a of assetsRaw) {
      const val = Number(a.current_value)
      const pct = a.net_worth_inclusion_pct ?? 100
      const item: BalansItem = {
        id: a.id,
        name: a.name,
        type: a.asset_type,
        rawValue: Math.round(val),
        value: Math.round(val * (pct / 100)),
        inclusionPct: pct,
      }
      if (VASTE_ACTIVA_TYPES.has(a.asset_type)) {
        vasteItems.push(item)
      } else {
        vlottendeItems.push(item)
      }
    }

    const vasteActiva: BalansCategory = {
      label: 'Vaste activa',
      items: vasteItems,
      subGroups: buildSubGroups(vasteItems, ASSET_TYPE_LABELS),
      subtotal: vasteItems.reduce((s, i) => s + i.value, 0),
    }

    const vlottendeActiva: BalansCategory = {
      label: 'Vlottende activa',
      items: vlottendeItems,
      subGroups: buildSubGroups(vlottendeItems, ASSET_TYPE_LABELS),
      subtotal: vlottendeItems.reduce((s, i) => s + i.value, 0),
    }

    // ── Bank accounts as liquide middelen ────────────────────────────────────

    const liquideItems: BalansItem[] = banksRaw.map(b => ({
      id: b.id,
      name: b.name,
      type: b.account_type,
      rawValue: Math.round(Number(b.balance)),
      value: Math.round(Number(b.balance)),
      inclusionPct: 100,
    }))

    const liquideMiddelen: BalansCategory = {
      label: 'Liquide middelen',
      items: liquideItems,
      subGroups: buildSubGroups(liquideItems, BANK_ACCOUNT_LABELS),
      subtotal: liquideItems.reduce((s, i) => s + i.value, 0),
    }

    const totalActiva = vasteActiva.subtotal + vlottendeActiva.subtotal + liquideMiddelen.subtotal

    // ── Classify debts ───────────────────────────────────────────────────────

    const langItems: BalansItem[] = []
    const kortItems: BalansItem[] = []

    for (const d of debtsRaw) {
      const bal = Number(d.current_balance)
      const pct = d.net_worth_inclusion_pct ?? 100
      const item: BalansItem = {
        id: d.id,
        name: d.name,
        type: d.debt_type,
        rawValue: Math.round(bal),
        value: Math.round(bal * (pct / 100)),
        inclusionPct: pct,
        interestRate: Number(d.interest_rate),
      }
      if (LANG_VREEMD_TYPES.has(d.debt_type)) {
        langItems.push(item)
      } else {
        kortItems.push(item)
      }
    }

    const langVreemdVermogen: BalansCategory = {
      label: 'Lang vreemd vermogen',
      items: langItems,
      subGroups: buildSubGroups(langItems, DEBT_TYPE_LABELS),
      subtotal: langItems.reduce((s, i) => s + i.value, 0),
    }

    const kortVreemdVermogen: BalansCategory = {
      label: 'Kort vreemd vermogen',
      items: kortItems,
      subGroups: buildSubGroups(kortItems, DEBT_TYPE_LABELS),
      subtotal: kortItems.reduce((s, i) => s + i.value, 0),
    }

    const totalSchulden = langVreemdVermogen.subtotal + kortVreemdVermogen.subtotal
    const eigenVermogen = totalActiva - totalSchulden
    const totalPassiva = eigenVermogen + totalSchulden // always equals totalActiva

    // ── Kengetallen ──────────────────────────────────────────────────────────

    const solvabiliteitsratio = totalActiva > 0
      ? Math.round((eigenVermogen / totalActiva) * 10000) / 100
      : null

    const schuldgraad = eigenVermogen > 0
      ? Math.round((totalSchulden / eigenVermogen) * 100) / 100
      : null

    // Current ratio: (vlottende activa + liquide middelen) / kort vreemd vermogen
    const currentAssets = vlottendeActiva.subtotal + liquideMiddelen.subtotal
    const liquiditeitsratio = kortVreemdVermogen.subtotal > 0
      ? Math.round((currentAssets / kortVreemdVermogen.subtotal) * 100) / 100
      : null

    // ── Daily expense rate ───────────────────────────────────────────────────

    let dailyExpenseRate = 0
    if (expenses.length > 0) {
      const totalExpenses = expenses.reduce((sum, tx) => sum + Math.abs(Number(tx.amount)), 0)
      const dates = expenses.map(tx => new Date(tx.date).getTime())
      const earliest = new Date(Math.min(...dates))
      const refDate = new Date(date)
      let dataMonths = Math.max(1,
        (refDate.getFullYear() - earliest.getFullYear()) * 12 +
        (refDate.getMonth() - earliest.getMonth()) + 1
      )
      dataMonths = Math.min(dataMonths, 12)
      const monthlyExpenses = totalExpenses / dataMonths
      dailyExpenseRate = (monthlyExpenses * 12) / 365
    }

    // ── Response ─────────────────────────────────────────────────────────────

    const balansData: BalansData = {
      date,
      generatedAt: new Date().toISOString(),
      displayName: profile?.full_name || null,
      vasteActiva,
      vlottendeActiva,
      liquideMiddelen,
      totalActiva,
      eigenVermogen,
      langVreemdVermogen,
      kortVreemdVermogen,
      totalPassiva,
      solvabiliteitsratio,
      schuldgraad,
      liquiditeitsratio,
      totalSchulden,
      dailyExpenseRate: Math.round(dailyExpenseRate * 100) / 100,
    }

    return Response.json(balansData)
  } catch (error) {
    console.error('Balans generation error:', error)
    return Response.json(
      { error: 'Balans genereren mislukt. Probeer het later opnieuw.' },
      { status: 500 }
    )
  }
}
