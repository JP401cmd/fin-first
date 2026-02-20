import type { SupabaseClient } from '@supabase/supabase-js'
import { buildSharedContext } from './shared-context'
import { section, formatCurrency, bulletList } from './formatter'
import { getNibudHouseholdType, getNibudReferences, calculateBenchmarks } from '@/lib/nibud/reference-data'
import { detectRecurringTransactions } from '@/lib/recurring-detection'

const TEMPORAL_LABELS: Record<number, string> = {
  1: 'De Levensgenieter (level 1) — Comfort > Snelheid. Wil niet inleveren op comfort. FIRE is een leuke bonus, geen obsessie.',
  2: 'De Reiziger (level 2) — Spaart wat overblijft. Ervaringen en herinneringen gaan voor. Balans, licht hellend naar nu.',
  3: 'De Architect (level 3) — Optimaliseert bewust. Bereid luxe op te offeren als het tijd oplevert, maar geen kluizenaar. De gulden middenweg.',
  4: 'De Stoïcijn (level 4) — Haalt plezier uit soberheid en efficiency. Streng en doelgericht. Snelheid > Comfort.',
  5: 'De Essentialist (level 5) — Alles wat niet essentieel is, moet weg. Minimalistisch leven voor maximale snelheid naar vrijheid.',
}

/**
 * Build the full financial context for AI recommendation generation.
 * Uses real Supabase data for budgets, transactions, assets, debts, profile, and feedback.
 */
export async function buildRecommendationContext(supabase: SupabaseClient): Promise<string> {
  const parts: string[] = []

  // User identity/profile
  let temporalBalance = 3
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, date_of_birth, household_type, temporal_balance')
      .eq('id', user.id)
      .single()

    if (profile) {
      temporalBalance = profile.temporal_balance ?? 3
      const age = profile.date_of_birth
        ? Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : null
      const temporal = TEMPORAL_LABELS[temporalBalance] ?? TEMPORAL_LABELS[3]
      const identityLines = [
        age ? `Leeftijd: ${age} jaar` : null,
        `Huishoudtype: ${profile.household_type ?? 'solo'}`,
        `Temporal Balance: ${temporal}`,
      ].filter(Boolean) as string[]

      parts.push(section('IDENTITEIT & VOORKEUREN', identityLines.join('\n')))
    }
  }

  // Shared financial overview (net worth, FIRE, freedom %)
  const shared = await buildSharedContext(supabase)
  parts.push(shared)

  // Budget spending patterns
  const { data: budgets } = await supabase
    .from('budgets')
    .select('id, name, slug, parent_id, default_limit, is_essential, budget_type, priority_score')
    .order('sort_order')

  const { data: transactions } = await supabase
    .from('transactions')
    .select('budget_id, amount, date, is_income')
    .gte('date', getMonthsAgoDate(3))

  const { data: txForSubscriptions } = await supabase
    .from('transactions')
    .select('id, date, amount, description, counterparty_name, is_income, budget_id')
    .gte('date', getMonthsAgoDate(12))
    .order('date', { ascending: true })

  if (budgets && transactions) {
    // Aggregate spending per budget over last 3 months
    const spendingMap = new Map<string, number>()
    for (const tx of transactions) {
      if (tx.is_income || !tx.budget_id) continue
      const current = spendingMap.get(tx.budget_id) || 0
      spendingMap.set(tx.budget_id, current + Math.abs(Number(tx.amount)))
    }

    const budgetLines: string[] = []
    for (const budget of budgets) {
      if (budget.budget_type === 'income' || budget.parent_id) continue
      const totalSpent = spendingMap.get(budget.id) || 0
      const monthlyAvg = Math.round(totalSpent / 3)
      if (monthlyAvg > 0) {
        const limit = Number(budget.default_limit) || 0
        const essential = budget.is_essential ? ' [essentieel]' : ''
        const overBudget = limit > 0 && monthlyAvg > limit ? ` (OVER budget: ${formatCurrency(monthlyAvg - limit)})` : ''
        budgetLines.push(
          `${budget.name} (${budget.slug || '-'}): ${formatCurrency(monthlyAvg)}/mnd | budget: ${limit > 0 ? formatCurrency(limit) : 'geen'}${essential}${overBudget}`
        )
      }
    }

    // Also add child budget details
    for (const budget of budgets) {
      if (budget.budget_type === 'income' || !budget.parent_id) continue
      const totalSpent = spendingMap.get(budget.id) || 0
      const monthlyAvg = Math.round(totalSpent / 3)
      if (monthlyAvg > 0) {
        const limit = Number(budget.default_limit) || 0
        const essential = budget.is_essential ? ' [essentieel]' : ''
        budgetLines.push(
          `  └ ${budget.name} (${budget.slug || '-'}): ${formatCurrency(monthlyAvg)}/mnd | budget: ${limit > 0 ? formatCurrency(limit) : 'geen'}${essential}`
        )
      }
    }

    if (budgetLines.length > 0) {
      parts.push(section('BUDGET & UITGAVEN (gem. 3 maanden)', bulletList(budgetLines)))
    }

    // NIBUD benchmark section
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('household_type, number_of_children, children_ages')
        .eq('id', user.id)
        .single()

      if (profile) {
        const householdType = getNibudHouseholdType(profile)
        const references = await getNibudReferences(supabase, householdType)

        if (references.length > 0) {
          // Build spending-by-slug map from child budgets
          const spendingBySlug: Record<string, number> = {}
          for (const budget of budgets ?? []) {
            if (!budget.slug || budget.budget_type === 'income') continue
            const totalSpent = spendingMap.get(budget.id) || 0
            const monthlyAvg = Math.round(totalSpent / 3)
            if (monthlyAvg > 0) {
              spendingBySlug[budget.slug] = (spendingBySlug[budget.slug] ?? 0) + monthlyAvg
            }
          }

          // Calculate daily expense for freedom-day conversion
          const totalMonthlySpending = Object.values(spendingBySlug).reduce((s, v) => s + v, 0)
          const dailyExpense = totalMonthlySpending > 0 ? (totalMonthlySpending * 12) / 365 : 1

          const benchmarks = calculateBenchmarks(references, spendingBySlug, dailyExpense)
          const householdLabel: Record<string, string> = {
            alleenstaand: 'alleenstaand',
            paar: 'paar zonder kinderen',
            gezin_jong: 'gezin met jonge kinderen',
            gezin_tiener: 'gezin met tieners',
          }

          const benchmarkLines = benchmarks
            .filter(b => b.user_spending > 0 || (b.voorbeeld_amount ?? 0) > 0)
            .map(b => {
              const ref = b.voorbeeld_amount != null ? `NIBUD voorbeeld ${formatCurrency(b.voorbeeld_amount)}/mnd` : `NIBUD basis ${formatCurrency(b.basis_amount)}/mnd`
              const status = b.delta > 0
                ? `BOVEN NIBUD (+${formatCurrency(b.delta)}${b.freedom_days_potential > 0 ? `, ~${b.freedom_days_potential} dagen vrijheid/jaar` : ', marktconform'})`
                : b.delta < 0
                  ? `ONDER NIBUD (${formatCurrency(b.delta)})`
                  : 'op NIBUD-niveau'
              return `${b.nibud_category_name}: ${ref} | gebruiker ${formatCurrency(b.user_spending)}/mnd | ${status}`
            })

          if (benchmarkLines.length > 0) {
            const totalPotential = benchmarks.reduce((s, b) => s + b.freedom_days_potential, 0)
            const footer = totalPotential > 0
              ? `\nTotaal optimalisatiepotentieel: ~${totalPotential} vrijheidsdagen/jaar`
              : ''
            parts.push(section(
              `NIBUD BENCHMARK (referentie: ${householdLabel[householdType]}, 2026)`,
              bulletList(benchmarkLines) + footer,
            ))
          }
        }
      }
    }
  }

  // Subscription detection from 12-month transaction history
  if (txForSubscriptions && txForSubscriptions.length > 0) {
    const allDetected = detectRecurringTransactions(
      txForSubscriptions.map(t => ({
        id: t.id,
        date: t.date,
        amount: Number(t.amount),
        description: t.description ?? '',
        counterparty_name: t.counterparty_name ?? null,
        is_income: t.is_income ?? false,
        budget_id: t.budget_id ?? null,
      })),
      [],
      [],
    )

    const detectedSubs = allDetected.filter(
      d => d.suggestedCategory === 'subscription' && !d.isIncome && d.confidence !== 'low'
    )

    if (detectedSubs.length > 0) {
      // Group by category
      const grouped = new Map<string, typeof detectedSubs>()
      for (const sub of detectedSubs) {
        const cat = classifySubscription(sub.counterpartyName)
        if (!grouped.has(cat)) grouped.set(cat, [])
        grouped.get(cat)!.push(sub)
      }

      // Calculate total monthly cost (convert all to monthly equivalent)
      const toMonthly = (sub: (typeof detectedSubs)[0]) => {
        const abs = Math.abs(sub.averageAmount)
        if (sub.frequency === 'weekly') return abs * 52 / 12
        if (sub.frequency === 'quarterly') return abs / 3
        if (sub.frequency === 'yearly') return abs / 12
        return abs
      }

      const totalMonthly = detectedSubs.reduce((s, sub) => s + toMonthly(sub), 0)

      // Calculate daily expense from 3-month transaction data for freedom-day conversion
      let dailyExpense = 30 // default fallback
      if (transactions) {
        const totalSpent = transactions
          .filter(t => !t.is_income)
          .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
        const monthlyAvg = totalSpent / 3
        if (monthlyAvg > 0) dailyExpense = (monthlyAvg * 12) / 365
      }

      const freedomDaysPerYear = Math.round((totalMonthly * 12) / dailyExpense)

      const subLines: string[] = [
        `Totaal: ${formatCurrency(Math.round(totalMonthly))}/maand — dat kost ~${freedomDaysPerYear} vrijheidsdagen/jaar`,
        '',
      ]

      for (const [category, subs] of grouped) {
        const overlap = subs.length >= 2 ? ' — mogelijke overlap' : ''
        subLines.push(`${capitalize(category)} (${subs.length} dienst${subs.length !== 1 ? 'en' : ''}${overlap}):`)
        for (const sub of subs) {
          const monthly = Math.round(toMonthly(sub))
          subLines.push(`  - ${sub.counterpartyName}: ${formatCurrency(monthly)}/maand`)
        }
        subLines.push('')
      }

      const temporalHints: Record<number, string> = {
        1: 'De Levensgenieter (level 1) — beoordeel zacht: preserveer comfortdiensten, stel alleen echt overtollige overlap voor',
        2: 'De Reiziger (level 2) — overweeg lichte consolidatie van echte overlappen, maar behoud ervaringsdiensten',
        3: 'De Architect (level 3) — gebalanceerde beoordeling: stel consolidatie voor bij 2+ diensten in dezelfde categorie',
        4: 'De Stoïcijn (level 4) — wees streng: alles wat overlap vertoont moet weg. Bereken vrijheidsdagen-winst expliciet',
        5: 'De Essentialist (level 5) — maximale optimalisatie: behoud alleen de meest-gebruikte dienst per categorie',
      }
      const temporalHint = temporalHints[temporalBalance] ?? temporalHints[3]
      subLines.push(`Temporal Balance-richtlijn: ${temporalHint}`)

      parts.push(section('ABONNEMENTEN (12 maanden)', subLines.join('\n')))
    }
  }

  // Assets
  const { data: assets } = await supabase
    .from('assets')
    .select('name, asset_type, current_value, expected_return, monthly_contribution, is_active')
    .eq('is_active', true)

  if (assets && assets.length > 0) {
    const assetLines = assets.map(a =>
      `${a.name} (${a.asset_type}): ${formatCurrency(Number(a.current_value))} | rendement: ${a.expected_return}% | bijdrage: ${formatCurrency(Number(a.monthly_contribution))}/mnd`
    )
    parts.push(section('ACTIVA', bulletList(assetLines)))
  }

  // Debts
  const { data: debts } = await supabase
    .from('debts')
    .select('name, debt_type, current_balance, interest_rate, monthly_payment, minimum_payment, is_active')
    .eq('is_active', true)

  if (debts && debts.length > 0) {
    const debtLines = debts.map(d =>
      `${d.name} (${d.debt_type}): ${formatCurrency(Number(d.current_balance))} | rente: ${d.interest_rate}% | betaling: ${formatCurrency(Number(d.monthly_payment))}/mnd (min: ${formatCurrency(Number(d.minimum_payment))})`
    )
    parts.push(section('SCHULDEN', bulletList(debtLines)))
  }

  // Previously rejected feedback — so AI avoids similar suggestions
  const { data: feedback } = await supabase
    .from('recommendation_feedback')
    .select('recommendation_type, related_budget_slug, reason, feedback_type')
    .order('created_at', { ascending: false })
    .limit(30)

  if (feedback && feedback.length > 0) {
    const rejected = feedback.filter(f => f.feedback_type === 'rejected' || f.feedback_type === 'action_rejected')
    const accepted = feedback.filter(f => f.feedback_type === 'accepted' || f.feedback_type === 'action_completed')

    if (rejected.length > 0) {
      const rejectedLines = rejected.map(f => {
        const slug = f.related_budget_slug ? ` (${f.related_budget_slug})` : ''
        const reason = f.reason ? ` — reden: "${f.reason}"` : ''
        return `${f.recommendation_type}${slug}: ${f.feedback_type}${reason}`
      })
      parts.push(section('EERDER AFGEWEZEN (vermijd vergelijkbaar)', bulletList(rejectedLines)))
    }

    if (accepted.length > 0) {
      const acceptedLines = accepted.map(f => {
        const slug = f.related_budget_slug ? ` (${f.related_budget_slug})` : ''
        return `${f.recommendation_type}${slug}: ${f.feedback_type}`
      })
      parts.push(section('EERDER GEACCEPTEERD (meer van dit type)', bulletList(acceptedLines)))
    }
  }

  // Existing pending/accepted recommendations — avoid duplicates
  const { data: existing } = await supabase
    .from('recommendations')
    .select('title, recommendation_type, related_budget_slug, status')
    .in('status', ['pending', 'accepted'])

  if (existing && existing.length > 0) {
    const existingLines = existing.map(r => {
      const slug = r.related_budget_slug ? ` (${r.related_budget_slug})` : ''
      return `${r.title}${slug} — status: ${r.status}`
    })
    parts.push(section('BESTAANDE VOORSTELLEN (geen duplicaten)', bulletList(existingLines)))
  }

  return parts.join('\n')
}

function classifySubscription(name: string): string {
  const n = name.toLowerCase()
  if (/netflix|disney|hbo|videoland|apple.*tv|youtube.*premium|viaplay/.test(n)) return 'streaming'
  if (/spotify|apple.*music|deezer|tidal/.test(n)) return 'muziek'
  if (/basic.?fit|gym|sportschool|fitness/.test(n)) return 'sport\/fitness'
  if (/adobe|microsoft|office|github|notion|dropbox|google.*one|icloud|slack/.test(n)) return 'software'
  if (/xbox|playstation|steam|nintendo/.test(n)) return 'gaming'
  return 'overig'
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function getMonthsAgoDate(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().split('T')[0]
}
