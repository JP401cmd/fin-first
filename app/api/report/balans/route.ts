import { createClient } from '@/lib/supabase/server'

export interface BalansAssetItem {
  id: string
  name: string
  assetType: string
  currentValue: number
  inclusionPct: number
  weightedValue: number
}

export interface BalansDebtItem {
  id: string
  name: string
  debtType: string
  currentBalance: number
  interestRate: number
  inclusionPct: number
  weightedBalance: number
}

export interface BalansData {
  date: string
  generatedAt: string
  displayName: string | null
  assets: BalansAssetItem[]
  debts: BalansDebtItem[]
  totalAssets: number
  totalDebts: number
  netWorth: number
  dailyExpenseRate: number
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

    // Fetch all active assets, debts, profile and expense data in parallel
    const [assetsResult, debtsResult, profileResult, expenseResult] = await Promise.allSettled([
      supabase
        .from('assets')
        .select('id, name, asset_type, current_value, is_active, net_worth_inclusion_pct')
        .eq('is_active', true),
      supabase
        .from('debts')
        .select('id, name, debt_type, current_balance, interest_rate, is_active, net_worth_inclusion_pct')
        .eq('is_active', true),
      supabase
        .from('profiles')
        .select('full_name')
        .single(),
      // Get daily expense rate from last 12 months of transactions
      supabase
        .from('transactions')
        .select('amount, date')
        .lt('amount', 0)
        .gte('date', new Date(new Date(date).getFullYear(), new Date(date).getMonth() - 11, 1).toISOString().split('T')[0])
        .lte('date', date),
    ])

    type AssetRow = { id: string; name: string; asset_type: string; current_value: number; is_active: boolean; net_worth_inclusion_pct: number }
    type DebtRow = { id: string; name: string; debt_type: string; current_balance: number; interest_rate: number; is_active: boolean; net_worth_inclusion_pct: number }
    type TxRow = { amount: number; date: string }

    const assetsRaw = (assetsResult.status === 'fulfilled' ? assetsResult.value.data ?? [] : []) as AssetRow[]
    const debtsRaw = (debtsResult.status === 'fulfilled' ? debtsResult.value.data ?? [] : []) as DebtRow[]
    const profile = profileResult.status === 'fulfilled' ? profileResult.value.data : null
    const expenses = (expenseResult.status === 'fulfilled' ? expenseResult.value.data ?? [] : []) as TxRow[]

    // Build assets
    const assets: BalansAssetItem[] = assetsRaw.map(a => {
      const val = Number(a.current_value)
      const pct = a.net_worth_inclusion_pct ?? 100
      return {
        id: a.id,
        name: a.name,
        assetType: a.asset_type,
        currentValue: Math.round(val),
        inclusionPct: pct,
        weightedValue: Math.round(val * (pct / 100)),
      }
    })

    // Build debts
    const debts: BalansDebtItem[] = debtsRaw.map(d => {
      const bal = Number(d.current_balance)
      const pct = d.net_worth_inclusion_pct ?? 100
      return {
        id: d.id,
        name: d.name,
        debtType: d.debt_type,
        currentBalance: Math.round(bal),
        interestRate: Number(d.interest_rate),
        inclusionPct: pct,
        weightedBalance: Math.round(bal * (pct / 100)),
      }
    })

    const totalAssets = assets.reduce((sum, a) => sum + a.weightedValue, 0)
    const totalDebts = debts.reduce((sum, d) => sum + d.weightedBalance, 0)
    const netWorth = totalAssets - totalDebts

    // Compute daily expense rate
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

    const balansData: BalansData = {
      date,
      generatedAt: new Date().toISOString(),
      displayName: profile?.full_name || null,
      assets,
      debts,
      totalAssets,
      totalDebts,
      netWorth,
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
