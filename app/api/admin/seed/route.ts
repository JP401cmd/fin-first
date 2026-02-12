import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { PERSONAS, type PersonaKey, type PersonaData } from '@/lib/test-personas'

export async function POST(req: Request) {
  const supabase = await createClient()

  // Step 1: Verify superadmin
  if (!(await isSuperAdmin(supabase))) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const body = await req.json()
  const personaKey = body.persona as PersonaKey
  if (!personaKey || !PERSONAS[personaKey]) {
    return new Response(JSON.stringify({ error: 'Ongeldige persona' }), { status: 400 })
  }

  const persona = PERSONAS[personaKey]
  const userId = user.id
  const summary: Record<string, number> = {}

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'))
      }

      try {
        const totalSteps = 22
        let currentStep = 0

        function progress(step: string, table: string, action: string, count?: number) {
          currentStep++
          const pct = Math.round((currentStep / totalSteps) * 100)
          send({ step, progress: pct, table, action, ...(count !== undefined ? { count } : {}) })
        }

        // ── Phase 1: Delete all user data ──────────────────────

        const deleteTable = async (table: string, label: string) => {
          const { count } = await supabase
            .from(table)
            .delete({ count: 'exact' })
            .eq('user_id', userId)
          progress(`${label} verwijderen...`, table, 'delete', count ?? 0)
          return count ?? 0
        }

        await deleteTable('recommendation_feedback', 'Feedback')
        await deleteTable('actions', 'Acties')
        await deleteTable('recommendations', 'Aanbevelingen')
        await deleteTable('budget_rollovers', 'Budget rollovers')
        await deleteTable('budget_amounts', 'Budget bedragen')
        await deleteTable('recurring_transactions', 'Terugkerende transacties')
        await deleteTable('transactions', 'Transacties')
        await deleteTable('valuations', 'Waarderingen')
        await deleteTable('net_worth_snapshots', 'Vermogenssnapshots')
        await deleteTable('life_events', 'Levensgebeurtenissen')
        await deleteTable('goals', 'Doelen')
        await deleteTable('debts', 'Schulden')
        await deleteTable('assets', 'Bezittingen')
        await deleteTable('bank_accounts', 'Bankrekeningen')
        await deleteTable('budgets', 'Budgetten')

        // ── Phase 2: Update profile ────────────────────────────

        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: userId,
            full_name: persona.profile.full_name,
            date_of_birth: persona.profile.date_of_birth,
            household_type: persona.profile.household_type,
            temporal_balance: persona.profile.temporal_balance,
            updated_at: new Date().toISOString(),
          })
        if (profileError) throw new Error(`Profiel update mislukt: ${profileError.message}`)
        progress('Profiel bijwerken...', 'profiles', 'update', 1)
        summary.profiles = 1

        // ── Phase 3: Insert data ───────────────────────────────

        // Bank accounts
        const accountRows = persona.bank_accounts.map((a) => ({
          user_id: userId,
          ...a,
        }))
        const { data: insertedAccounts, error: accErr } = await supabase
          .from('bank_accounts')
          .insert(accountRows)
          .select('id, name')
        if (accErr) throw new Error(`Bankrekeningen insert mislukt: ${accErr.message}`)
        progress('Bankrekeningen toevoegen...', 'bank_accounts', 'insert', insertedAccounts?.length ?? 0)
        summary.bank_accounts = insertedAccounts?.length ?? 0
        const primaryAccountId = insertedAccounts?.[0]?.id

        // Assets
        const assetRows = persona.assets.map((a, i) => ({
          user_id: userId,
          name: a.name,
          asset_type: a.asset_type,
          current_value: a.current_value,
          purchase_value: a.purchase_value,
          purchase_date: a.purchase_date,
          expected_return: a.expected_return,
          monthly_contribution: a.monthly_contribution,
          institution: a.institution || null,
          is_active: true,
          sort_order: i,
        }))
        const { data: insertedAssets, error: assetErr } = await supabase
          .from('assets')
          .insert(assetRows)
          .select('id')
        if (assetErr) throw new Error(`Assets insert mislukt: ${assetErr.message}`)
        progress('Bezittingen toevoegen...', 'assets', 'insert', insertedAssets?.length ?? 0)
        summary.assets = insertedAssets?.length ?? 0

        // Debts
        if (persona.debts.length > 0) {
          const debtRows = persona.debts.map((d, i) => ({
            user_id: userId,
            name: d.name,
            debt_type: d.debt_type,
            original_amount: d.original_amount,
            current_balance: d.current_balance,
            interest_rate: d.interest_rate,
            minimum_payment: d.minimum_payment,
            monthly_payment: d.monthly_payment,
            start_date: d.start_date,
            creditor: d.creditor || null,
            is_active: true,
            sort_order: i,
          }))
          const { data: insertedDebts, error: debtErr } = await supabase
            .from('debts')
            .insert(debtRows)
            .select('id')
          if (debtErr) throw new Error(`Schulden insert mislukt: ${debtErr.message}`)
          progress('Schulden toevoegen...', 'debts', 'insert', insertedDebts?.length ?? 0)
          summary.debts = insertedDebts?.length ?? 0
        } else {
          progress('Schulden toevoegen... (geen)', 'debts', 'insert', 0)
          summary.debts = 0
        }

        // Budgets (parent + children)
        const budgetSlugToId: Record<string, string> = {}
        let budgetCount = 0
        for (const parent of persona.budgets) {
          const { data: parentData, error: parentErr } = await supabase
            .from('budgets')
            .insert({
              user_id: userId,
              parent_id: null,
              name: parent.name,
              slug: parent.slug,
              icon: parent.icon,
              description: parent.description,
              default_limit: parent.default_limit,
              budget_type: parent.budget_type,
              interval: 'monthly',
              rollover_type: 'reset',
              limit_type: 'soft',
              alert_threshold: 80,
              max_single_transaction_amount: parent.default_limit,
              is_essential: parent.is_essential,
              priority_score: parent.priority_score,
              is_inflation_indexed: false,
              sort_order: parent.sort_order,
            })
            .select('id')
            .single()
          if (parentErr) throw new Error(`Budget "${parent.name}" insert mislukt: ${parentErr.message}`)
          budgetSlugToId[parent.slug] = parentData.id
          budgetCount++

          if (parent.children) {
            for (let i = 0; i < parent.children.length; i++) {
              const child = parent.children[i]
              const { data: childData, error: childErr } = await supabase
                .from('budgets')
                .insert({
                  user_id: userId,
                  parent_id: parentData.id,
                  name: child.name,
                  slug: child.slug,
                  icon: child.icon,
                  description: child.description,
                  default_limit: child.default_limit,
                  budget_type: parent.budget_type,
                  interval: 'monthly',
                  rollover_type: 'reset',
                  limit_type: 'soft',
                  alert_threshold: 80,
                  max_single_transaction_amount: child.default_limit * 2,
                  is_essential: parent.is_essential,
                  priority_score: parent.priority_score,
                  is_inflation_indexed: false,
                  sort_order: i,
                })
                .select('id')
                .single()
              if (childErr) throw new Error(`Budget "${child.name}" insert mislukt: ${childErr.message}`)
              budgetSlugToId[child.slug] = childData.id
              budgetCount++
            }
          }
        }
        progress('Budgetten toevoegen...', 'budgets', 'insert', budgetCount)
        summary.budgets = budgetCount

        // Transactions
        if (primaryAccountId) {
          const txRows = persona.transactions.map((t) => ({
            user_id: userId,
            account_id: primaryAccountId,
            budget_id: budgetSlugToId[t.budgetSlug] ?? null,
            date: daysAgo(t.dayOffset),
            amount: t.amount,
            description: t.description,
            counterparty_name: t.counterparty_name,
            counterparty_iban: t.counterparty_iban,
            is_income: t.is_income,
            category_source: 'import',
          }))

          // Insert in batches of 50
          let txCount = 0
          for (let i = 0; i < txRows.length; i += 50) {
            const batch = txRows.slice(i, i + 50)
            const { error: txErr } = await supabase.from('transactions').insert(batch)
            if (txErr) throw new Error(`Transacties insert mislukt (batch ${Math.floor(i / 50)}): ${txErr.message}`)
            txCount += batch.length
          }
          progress('Transacties toevoegen...', 'transactions', 'insert', txCount)
          summary.transactions = txCount
        } else {
          progress('Transacties toevoegen... (geen account)', 'transactions', 'insert', 0)
          summary.transactions = 0
        }

        // Goals
        const goalRows = persona.goals.map((g, i) => ({
          user_id: userId,
          name: g.name,
          description: g.description,
          goal_type: g.goal_type,
          target_value: g.target_value,
          current_value: g.current_value,
          target_date: g.target_date,
          icon: g.icon,
          color: g.color,
          is_completed: g.is_completed,
          sort_order: i,
        }))
        const { data: insertedGoals, error: goalErr } = await supabase
          .from('goals')
          .insert(goalRows)
          .select('id')
        if (goalErr) throw new Error(`Doelen insert mislukt: ${goalErr.message}`)
        progress('Doelen toevoegen...', 'goals', 'insert', insertedGoals?.length ?? 0)
        summary.goals = insertedGoals?.length ?? 0

        // Life events
        const eventRows = persona.life_events.map((e) => ({
          user_id: userId,
          name: e.name,
          event_type: e.event_type,
          target_age: e.target_age,
          target_date: e.target_date,
          one_time_cost: e.one_time_cost,
          monthly_cost_change: e.monthly_cost_change,
          monthly_income_change: e.monthly_income_change,
          duration_months: e.duration_months,
          icon: e.icon,
          is_active: e.is_active,
          sort_order: e.sort_order,
        }))
        const { data: insertedEvents, error: eventErr } = await supabase
          .from('life_events')
          .insert(eventRows)
          .select('id')
        if (eventErr) throw new Error(`Levensgebeurtenissen insert mislukt: ${eventErr.message}`)
        progress('Levensgebeurtenissen toevoegen...', 'life_events', 'insert', insertedEvents?.length ?? 0)
        summary.life_events = insertedEvents?.length ?? 0

        // Recommendations + Actions
        let recCount = 0
        let actionCount = 0
        for (const rec of persona.recommendations) {
          const { data: recData, error: recErr } = await supabase
            .from('recommendations')
            .insert({
              user_id: userId,
              title: rec.title,
              description: rec.description,
              recommendation_type: rec.recommendation_type,
              euro_impact_monthly: rec.euro_impact_monthly,
              euro_impact_yearly: rec.euro_impact_yearly,
              freedom_days_per_year: rec.freedom_days_per_year,
              related_budget_slug: rec.related_budget_slug,
              priority_score: Math.max(1, Math.min(5, rec.priority_score)),
              suggested_actions: rec.suggested_actions,
              status: rec.status,
            })
            .select('id')
            .single()
          if (recErr) throw new Error(`Aanbeveling "${rec.title}" insert mislukt: ${recErr.message}`)
          recCount++

          for (const action of rec.actions) {
            const { error: actErr } = await supabase
              .from('actions')
              .insert({
                user_id: userId,
                recommendation_id: recData.id,
                source: action.source,
                title: action.title,
                description: action.description,
                freedom_days_impact: action.freedom_days_impact,
                euro_impact_monthly: action.euro_impact_monthly,
                status: action.status,
                priority_score: Math.max(1, Math.min(5, action.priority_score)),
                sort_order: actionCount,
              })
            if (actErr) throw new Error(`Actie "${action.title}" insert mislukt: ${actErr.message}`)
            actionCount++
          }
        }
        progress('Aanbevelingen en acties toevoegen...', 'recommendations', 'insert', recCount)
        summary.recommendations = recCount
        summary.actions = actionCount

        // Net worth snapshots
        const snapshotRows = persona.net_worth_snapshots.map((s) => ({
          user_id: userId,
          snapshot_date: monthsAgoDate(s.monthsAgo),
          total_assets: s.total_assets,
          total_debts: s.total_debts,
          net_worth: s.net_worth,
        }))
        const { data: insertedSnapshots, error: snapErr } = await supabase
          .from('net_worth_snapshots')
          .insert(snapshotRows)
          .select('id')
        if (snapErr) throw new Error(`Vermogenssnapshots insert mislukt: ${snapErr.message}`)
        progress('Vermogenssnapshots toevoegen...', 'net_worth_snapshots', 'insert', insertedSnapshots?.length ?? 0)
        summary.net_worth_snapshots = insertedSnapshots?.length ?? 0

        // Done
        send({ done: true, summary })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Onbekende fout'
        send({ error: message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked',
    },
  })
}

function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

function monthsAgoDate(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  d.setDate(1)
  return d.toISOString().split('T')[0]
}
