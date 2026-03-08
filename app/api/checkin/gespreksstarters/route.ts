import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/* ── Types ──────────────────────────────────────────────────────────── */
export interface GesprekStarterData {
  id: string
  /** The conversation starter question */
  vraag: string
  /** Short context explaining the data trend behind this starter */
  context: string
  /** A concrete action suggestion */
  actie: string
  /** Sentiment: positive / neutral / alert */
  sentiment: 'positive' | 'neutral' | 'alert'
  /** The freedom-time framing (optional) */
  vrijheidstijd?: string
}

/* ── Helpers ─────────────────────────────────────────────────────────── */
function formatEUR(n: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

function freedomDays(amount: number, dailyExpenses: number): number {
  if (dailyExpenses <= 0) return 0
  return Math.round(Math.abs(amount) / dailyExpenses)
}

function freedomLabel(days: number): string {
  if (days >= 365) {
    const years = Math.floor(days / 365)
    const months = Math.round((days % 365) / 30)
    return months > 0 ? `${years} jaar en ${months} maanden` : `${years} jaar`
  }
  if (days >= 30) {
    const months = Math.floor(days / 30)
    const d = days % 30
    return d > 0 ? `${months} maanden en ${d} dagen` : `${months} maanden`
  }
  return `${days} ${days === 1 ? 'dag' : 'dagen'}`
}

/* ── Main handler ────────────────────────────────────────────────────── */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()
  const monthStart = new Date(currentYear, currentMonth, 1).toISOString().slice(0, 10)
  const monthEnd = new Date(currentYear, currentMonth + 1, 1).toISOString().slice(0, 10)
  const prevMonthStart = new Date(currentYear, currentMonth - 1, 1).toISOString().slice(0, 10)
  const prevMonthEnd = monthStart

  // Fetch data in parallel
  const [
    assetsRes, debtsRes, curIncomeRes, curExpenseRes, prevIncomeRes, prevExpenseRes,
    goalsRes, budgetsRes, actionsRes, snapshotsRes,
  ] = await Promise.all([
    supabase.from('assets').select('current_value').eq('user_id', user.id),
    supabase.from('debts').select('current_balance, name, debt_type').eq('user_id', user.id),
    supabase.from('transactions').select('amount').eq('user_id', user.id).eq('is_income', true).gte('date', monthStart).lt('date', monthEnd),
    supabase.from('transactions').select('amount').eq('user_id', user.id).eq('is_income', false).gte('date', monthStart).lt('date', monthEnd),
    supabase.from('transactions').select('amount').eq('user_id', user.id).eq('is_income', true).gte('date', prevMonthStart).lt('date', prevMonthEnd),
    supabase.from('transactions').select('amount').eq('user_id', user.id).eq('is_income', false).gte('date', prevMonthStart).lt('date', prevMonthEnd),
    supabase.from('goals').select('name, current_value, target_value, is_completed').eq('user_id', user.id),
    supabase.from('budgets').select('name, monthly_limit, budget_type').eq('user_id', user.id).eq('budget_type', 'expense'),
    supabase.from('actions').select('id, freedom_days, is_completed, completed_at').eq('user_id', user.id),
    supabase.from('net_worth_snapshots').select('value, snapshot_date').eq('user_id', user.id).order('snapshot_date', { ascending: false }).limit(6),
  ])

  // Compute metrics
  const totalAssets = (assetsRes.data || []).reduce((s, a) => s + (a.current_value || 0), 0)
  const totalDebts = (debtsRes.data || []).reduce((s, d) => s + (d.current_balance || 0), 0)
  const netWorth = totalAssets - totalDebts

  const monthlyIncome = (curIncomeRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const monthlyExpenses = (curExpenseRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const prevMonthIncome = (prevIncomeRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const prevMonthExpenses = (prevExpenseRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)

  const monthlySavings = monthlyIncome - monthlyExpenses
  const prevMonthlySavings = prevMonthIncome - prevMonthExpenses
  const savingsRate = monthlyIncome > 0 ? (monthlySavings / monthlyIncome) * 100 : 0
  const dailyExpenses = monthlyExpenses > 0 ? monthlyExpenses / 30 : 0

  const goals = goalsRes.data || []
  const activeGoals = goals.filter(g => !g.is_completed)
  const completedGoals = goals.filter(g => g.is_completed)
  const debts = debtsRes.data || []

  const allActions = actionsRes.data || []
  const completedThisMonth = allActions.filter(a =>
    a.is_completed && a.completed_at && a.completed_at >= monthStart && a.completed_at < monthEnd
  )
  const pendingActions = allActions.filter(a => !a.is_completed)

  const snapshots = snapshotsRes.data || []
  const netWorthTrend = snapshots.length >= 2 ? snapshots[0].value - snapshots[1].value : 0

  // ── Generate conversation starters based on data patterns ──
  const starters: GesprekStarterData[] = []

  // 1. Net worth growth/decline
  if (netWorthTrend > 0 && dailyExpenses > 0) {
    const days = freedomDays(netWorthTrend, dailyExpenses)
    starters.push({
      id: 'vermogen-groei',
      vraag: `Jullie vermogen is gegroeid met ${formatEUR(netWorthTrend)} — dat zijn ${days} extra vrijheidsdagen. Waar willen jullie die vrijheid aan besteden?`,
      context: `Netto vermogen steeg van ${formatEUR(snapshots[1]?.value || 0)} naar ${formatEUR(snapshots[0]?.value || 0)}.`,
      actie: 'Bespreek samen wat de volgende financiele mijlpaal zou kunnen zijn.',
      sentiment: 'positive',
      vrijheidstijd: freedomLabel(days),
    })
  } else if (netWorthTrend < 0 && dailyExpenses > 0) {
    const days = freedomDays(netWorthTrend, dailyExpenses)
    starters.push({
      id: 'vermogen-daling',
      vraag: `Jullie vermogen is deze maand ${formatEUR(Math.abs(netWorthTrend))} gedaald. Hoe voelen jullie je daarover, en is er een oorzaak die jullie samen willen aanpakken?`,
      context: `Netto vermogen daalde met ${formatEUR(Math.abs(netWorthTrend))} (${days} vrijheidsdagen).`,
      actie: 'Kijk samen of er eenmalige uitgaven waren of dat een structurele aanpassing nodig is.',
      sentiment: 'alert',
      vrijheidstijd: freedomLabel(days),
    })
  }

  // 2. Savings rate comparison
  if (monthlySavings > 0 && prevMonthlySavings > 0) {
    const savingsDelta = monthlySavings - prevMonthlySavings
    if (savingsDelta > 50) {
      const extraDays = freedomDays(savingsDelta * 12, dailyExpenses)
      starters.push({
        id: 'sparen-stijging',
        vraag: `Jullie hebben deze maand ${formatEUR(savingsDelta)} meer gespaard dan vorige maand. Op jaarbasis is dat ${freedomLabel(extraDays)} extra vrijheid. Welke keuze maakte het verschil?`,
        context: `Spaarquote: ${savingsRate.toFixed(0)}% (was ${prevMonthIncome > 0 ? ((prevMonthlySavings / prevMonthIncome) * 100).toFixed(0) : 0}%).`,
        actie: 'Bespreek welke uitgaven jullie bewust hebben verminderd en of dat houdbaar voelt.',
        sentiment: 'positive',
        vrijheidstijd: freedomLabel(extraDays),
      })
    } else if (savingsDelta < -50) {
      starters.push({
        id: 'sparen-daling',
        vraag: `De maandelijkse besparing is gedaald van ${formatEUR(prevMonthlySavings)} naar ${formatEUR(monthlySavings)}. Was dat een bewuste keuze, of zijn er onverwachte kosten geweest?`,
        context: `Verschil: ${formatEUR(savingsDelta)} minder gespaard dan vorige maand.`,
        actie: 'Kijk samen of jullie volgende maand weer naar het oude niveau willen.',
        sentiment: 'neutral',
      })
    }
  } else if (monthlySavings <= 0 && monthlyIncome > 0) {
    starters.push({
      id: 'negatief-sparen',
      vraag: `Deze maand hebben jullie meer uitgegeven dan er binnenkwam. Dat kan bewust zijn — maar is het hoe jullie het willen? Welk klein bedrag zou jullie volgende maand wél opzij kunnen leggen?`,
      context: `Uitgaven (${formatEUR(monthlyExpenses)}) overschreden inkomen (${formatEUR(monthlyIncome)}).`,
      actie: 'Spreek samen een realistisch minimaal spaarbedrag af voor volgende maand.',
      sentiment: 'alert',
    })
  }

  // 3. Expense trend
  if (prevMonthExpenses > 0 && monthlyExpenses > 0) {
    const expenseChange = ((monthlyExpenses - prevMonthExpenses) / prevMonthExpenses) * 100
    if (expenseChange > 15) {
      const extraSpent = monthlyExpenses - prevMonthExpenses
      const days = freedomDays(extraSpent * 12, dailyExpenses)
      starters.push({
        id: 'uitgaven-stijging',
        vraag: `Jullie uitgaven zijn ${expenseChange.toFixed(0)}% hoger dan vorige maand. Dat verschil (${formatEUR(extraSpent)}) is op jaarbasis ${freedomLabel(days)} aan vrijheidstijd. Welke uitgaven voelden waardevol?`,
        context: `Van ${formatEUR(prevMonthExpenses)} naar ${formatEUR(monthlyExpenses)} deze maand.`,
        actie: 'Loop samen de grootste uitgavencategorieen door en bespreek waar het verschil zit.',
        sentiment: 'neutral',
      })
    } else if (expenseChange < -10) {
      const saved = prevMonthExpenses - monthlyExpenses
      const days = freedomDays(saved, dailyExpenses)
      starters.push({
        id: 'uitgaven-daling',
        vraag: `Jullie gaven ${formatEUR(saved)} minder uit dan vorige maand — ${days} vrijheidsdagen gewonnen! Wat hebben jullie anders gedaan?`,
        context: `Uitgaven daalden ${Math.abs(expenseChange).toFixed(0)}% t.o.v. vorige maand.`,
        actie: 'Vier de besparing en bespreek of jullie dit patroon willen vasthouden.',
        sentiment: 'positive',
        vrijheidstijd: `${days} dagen`,
      })
    }
  }

  // 4. Goal progress
  if (activeGoals.length > 0) {
    const closest = activeGoals
      .filter(g => g.target_value > 0)
      .map(g => ({ ...g, pct: (g.current_value / g.target_value) * 100 }))
      .sort((a, b) => b.pct - a.pct)[0]

    if (closest && closest.pct >= 50 && closest.pct < 100) {
      const remaining = closest.target_value - closest.current_value
      const days = dailyExpenses > 0 ? freedomDays(remaining, dailyExpenses) : 0
      starters.push({
        id: 'doel-bijna',
        vraag: `Jullie zijn al ${closest.pct.toFixed(0)}% op weg naar "${closest.name}". Nog ${formatEUR(remaining)} te gaan! Hoe willen jullie dit samen vieren als het lukt?`,
        context: `Doel "${closest.name}": ${formatEUR(closest.current_value)} van ${formatEUR(closest.target_value)}.`,
        actie: 'Spreek een kleine beloning af voor als jullie dit doel bereiken.',
        sentiment: 'positive',
        vrijheidstijd: days > 0 ? freedomLabel(days) : undefined,
      })
    } else if (closest && closest.pct < 20) {
      starters.push({
        id: 'doel-start',
        vraag: `Jullie doel "${closest.name}" staat op ${closest.pct.toFixed(0)}%. Welk concreet bedrag kunnen jullie samen per maand opzij leggen om sneller op koers te komen?`,
        context: `Doel "${closest.name}" is net gestart.`,
        actie: 'Stel samen een automatische maandelijkse storting in voor dit doel.',
        sentiment: 'neutral',
      })
    }
  }

  // 5. Debt awareness (freedom framing)
  if (debts.length > 0 && totalDebts > 0 && dailyExpenses > 0) {
    const debtFreedomDays = freedomDays(totalDebts, dailyExpenses)
    starters.push({
      id: 'schulden-vrijheid',
      vraag: `Jullie totale schuld is ${formatEUR(totalDebts)} — dat is ${freedomLabel(debtFreedomDays)} aan vrijheid die jullie nog terugkopen. Welke schuld willen jullie het eerste aanpakken?`,
      context: `${debts.length} ${debts.length === 1 ? 'schuld' : 'schulden'} met een totale balans van ${formatEUR(totalDebts)}.`,
      actie: 'Bespreek samen of jullie een extra aflossing op de duurste schuld willen doen.',
      sentiment: 'neutral',
      vrijheidstijd: freedomLabel(debtFreedomDays),
    })
  }

  // 6. Actions momentum
  if (completedThisMonth.length > 0) {
    const totalFreedomDays = completedThisMonth.reduce((s, a) => s + (a.freedom_days || 0), 0)
    starters.push({
      id: 'acties-momentum',
      vraag: `Jullie hebben deze maand ${completedThisMonth.length} ${completedThisMonth.length === 1 ? 'actie' : 'acties'} afgerond${totalFreedomDays > 0 ? ` en ${totalFreedomDays} vrijheidsdagen verdiend` : ''}. Welke actie had de meeste impact?`,
      context: `${completedThisMonth.length} afgeronde acties deze maand.`,
      actie: 'Kies samen de volgende actie om aan te werken.',
      sentiment: 'positive',
      vrijheidstijd: totalFreedomDays > 0 ? `${totalFreedomDays} dagen` : undefined,
    })
  } else if (pendingActions.length > 0) {
    starters.push({
      id: 'acties-openstaand',
      vraag: `Er staan ${pendingActions.length} openstaande ${pendingActions.length === 1 ? 'actie' : 'acties'} klaar. Welke willen jullie deze maand samen oppakken?`,
      context: `${pendingActions.length} aanbevolen acties wachten op uitvoering.`,
      actie: 'Kies samen 1 actie en plan wanneer jullie die aanpakken.',
      sentiment: 'neutral',
    })
  }

  // 7. Savings as freedom builder
  if (monthlySavings > 100 && dailyExpenses > 0) {
    const days = freedomDays(monthlySavings, dailyExpenses)
    starters.push({
      id: 'sparen-vrijheid',
      vraag: `Jullie spaarden deze maand ${formatEUR(monthlySavings)} — dat zijn ${days} nieuwe vrijheidsdagen. Hoe voelt dat?`,
      context: `Spaarquote: ${savingsRate.toFixed(0)}% van het inkomen.`,
      actie: 'Bespreek of jullie tevreden zijn met dit tempo of willen versnellen.',
      sentiment: 'positive',
      vrijheidstijd: `${days} dagen`,
    })
  }

  // Ensure minimum 2 starters — add general ones if needed
  if (starters.length < 2) {
    if (!starters.find(s => s.id === 'algemeen-dromen')) {
      starters.push({
        id: 'algemeen-dromen',
        vraag: 'Als jullie volledig financieel vrij zouden zijn, hoe zou een ideale dinsdag eruitzien? Bespreek samen jullie visie op vrijheid.',
        context: 'Reflectiemoment over gezamenlijke levensdoelen.',
        actie: 'Schrijf allebei onafhankelijk 3 dingen op die jullie zouden doen, en vergelijk daarna.',
        sentiment: 'positive',
      })
    }
    if (starters.length < 2 && !starters.find(s => s.id === 'algemeen-waarden')) {
      starters.push({
        id: 'algemeen-waarden',
        vraag: 'Welke uitgave van afgelopen maand bracht jullie het meeste voldoening? En welke het minste? Bespreek samen wat dit zegt over jullie waarden.',
        context: 'Reflectie over bewust besteden en gezamenlijke prioriteiten.',
        actie: 'Identificeer samen een terugkerende uitgave die niet bijdraagt aan jullie geluk.',
        sentiment: 'neutral',
      })
    }
  }

  // Sort: positive first, then neutral, then alert — max 5
  const sorted = starters.sort((a, b) => {
    const order = { positive: 0, neutral: 1, alert: 2 }
    return order[a.sentiment] - order[b.sentiment]
  }).slice(0, 5)

  return NextResponse.json({ starters: sorted })
}
