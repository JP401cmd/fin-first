import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { shouldAlert } from '@/lib/budget-alerts'
import { shouldSendWozReminder, WOZ_REMINDER_TEMPLATE } from '@/lib/notifications/woz-reminder'
import { shouldSendPensionReminder, PENSION_REMINDER_TEMPLATE } from '@/lib/notifications/pension-reminder'
import { amsterdamWeekKey } from '@/lib/briefing/snapshot'
import { localMonthBounds } from '@/lib/month-range'
import { resolveFireParams } from '@/lib/fire-params'
import { calculateFreedomTime } from '@/lib/format'
import { decryptIbanForLabel } from '@/lib/truelayer/cash-asset-backfill'

// ── Types ────────────────────────────────────────────────────────────

export type NotificationType =
  | 'budget'
  | 'sync'
  | 'recommendation'
  | 'partner_transaction'
  | 'horizon'
  | 'holding_alert'
  | 'briefing'
  | 'budget_model_proposal'

export type Notification = {
  id: string
  type: NotificationType
  priority: number
  title: string
  description: string
  icon: string
  color: string
  createdAt: string
  read: boolean
  actionUrl?: string
  aiContext?: string
  metadata?: Record<string, unknown>
}

// ── Langzame-checks cache ────────────────────────────────────────────
// Egress-reductie (jun 2026): de poll draait per gebruiker elke 10 min en
// deed ~22 queries per request. De checks die hooguit dagelijks/wekelijks
// iets nieuws opleveren (sync-warnings, WOZ/pensioen-jaarreminders,
// weekbriefing, budgetmodel-voorstellen, horizon- en
// holding-alerts) worden hier per gebruiker 15 min gecached. Vers per poll
// blijven alleen: read-state/prefs, budgetstatus en partner-transacties.
//
// Module-level Map = per serverproces (zelfde patroon als de idempotency-
// cache in app/api/holdings/route.ts). Op serverless betekent dat hooguit
// dubbele berekening per lambda — alle checks zijn idempotent en de
// jaarlijkse/wekelijkse reminders zijn zelf al gegate via app_settings.
const SLOW_CHECKS_TTL_MS = 15 * 60_000
const slowChecksCache = new Map<string, { computedAt: number; items: Notification[] }>()

// ── GET — Aggregate all active notifications ─────────────────────────

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    // Load read state + history + preferences
    const [readRes, historyRes, prefsRes] = await Promise.all([
      supabase
        .from('app_settings')
        .select('value')
        .eq('key', `notifications_read_${user.id}`)
        .maybeSingle(),
      supabase
        .from('app_settings')
        .select('value')
        .eq('key', `notifications_history_${user.id}`)
        .maybeSingle(),
      supabase
        .from('app_settings')
        .select('value')
        .eq('key', `notifications_preferences_${user.id}`)
        .maybeSingle(),
    ])

    const defaultPrefs: Record<string, boolean> = {
      budget: true, sync: true,
      recommendation: true,
      partner_transaction: true, horizon: true,
      holding_alert: true, briefing: true,
      budget_model_proposal: true,
    }
    const prefs: Record<string, boolean> = prefsRes.data?.value
      ? { ...defaultPrefs, ...JSON.parse(prefsRes.data.value) }
      : defaultPrefs

    const readIds: string[] = readRes.data?.value
      ? JSON.parse(readRes.data.value)
      : []

    const storedHistory: Notification[] = historyRes.data?.value
      ? JSON.parse(historyRes.data.value)
      : []

    const notifications: Notification[] = []
    const now = new Date().toISOString()

    // Langzame checks: cache-hit → secties 4/4b/4c/6b/7/8 overslaan en de
    // gecachte items hergebruiken (read-state wordt bij de merge vers
    // afgeleid). `slow` vangt de pushes van die secties op een cache-miss.
    const cachedSlow = slowChecksCache.get(user.id)
    const computeSlow = !cachedSlow || Date.now() - cachedSlow.computedAt >= SLOW_CHECKS_TTL_MS
    const slow: Notification[] = []

    // Accept optional `days` query parameter (default: 7, clamped 1–90)
    const daysParam = request.nextUrl.searchParams.get('days')
    const days = daysParam ? Math.max(1, Math.min(90, parseInt(daysParam, 10) || 7)) : 7

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    // ── 1. Budget alerts ─────────────────────────────────────────────

    // Tijdzone-veilige maandgrenzen (lib/month-range.ts) — lokale datum +
    // toISOString() schoof de grens in NL een dag terug, waardoor een
    // laatste-dag-van-vorige-maand-transactie in deze maand lekte.
    const monthBounds = localMonthBounds(new Date())
    const monthStart = monthBounds.start // YYYY-MM-DD, inclusief
    const monthEnd = monthBounds.end     // YYYY-MM-DD, exclusief (1e volgende maand)

    // Build current period string for rollovers (YYYY-MM) — uit de
    // tijdzone-veilige maandstart (eerste 7 tekens van YYYY-MM-DD).
    const currentPeriod = monthStart.slice(0, 7)

    const [budgetsRes, txRes, amountsRes, rolloversRes] = await Promise.all([
      supabase
        .from('budgets')
        .select('id, name, slug, parent_id, budget_type, default_limit, alert_threshold')
        .eq('user_id', user.id),
      supabase
        .from('transactions')
        .select('budget_id, amount, transaction_type')
        .eq('user_id', user.id)
        .gte('date', monthStart)
        .lt('date', monthEnd)
        .not('budget_id', 'is', null),
      // NB: budget_amounts heeft géén user_id-kolom — RLS scopet via de
      // budgets-join (zelfde patroon als lib/budgets-data-loader.ts). Het
      // eerdere .eq('user_id', …) gaf elke poll een 400 waardoor effectieve
      // limieten stil terugvielen op default_limit.
      supabase
        .from('budget_amounts')
        .select('budget_id, effective_from, amount'),
      supabase
        .from('budget_rollovers')
        .select('budget_id, carried_amount')
        .eq('period', currentPeriod),
    ])

    if (budgetsRes.data && txRes.data) {
      const budgets = budgetsRes.data
      const transactions = txRes.data
      const budgetAmounts = amountsRes.data ?? []
      const rolloverData = rolloversRes.data ?? []

      const parentBudgets = budgets.filter((b) => !b.parent_id)
      const childBudgets = budgets.filter((b) => b.parent_id)

      const todayStr = new Date().toISOString().split('T')[0]

      // Build rollover lookup: budget_id -> carried_amount
      const rolloverMap: Record<string, number> = {}
      for (const r of rolloverData) {
        rolloverMap[r.budget_id] = Number(r.carried_amount) || 0
      }

      function getEffectiveLimit(
        budgetId: string,
        defaultLimit: number
      ): number {
        const applicable = budgetAmounts
          .filter(
            (a) => a.budget_id === budgetId && a.effective_from <= todayStr
          )
          .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
        const baseLimit = applicable.length > 0
          ? Number(applicable[0].amount)
          : defaultLimit
        const carry = rolloverMap[budgetId] ?? 0
        return baseLimit + carry
      }

      function getSpent(budgetId: string): number {
        return transactions
          .filter((t) => t.budget_id === budgetId &&
            (t as { transaction_type?: string | null }).transaction_type !== 'transfer' &&
            (t as { transaction_type?: string | null }).transaction_type !== 'joint_transfer')
          .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)
      }

      function pushBudgetNotification(
        budget: { id: string; name: string; budget_type: string; alert_threshold: number | null; default_limit: number },
        spent: number,
        limit: number,
      ) {
        if (limit <= 0) return

        const threshold = Number(budget.alert_threshold ?? 80)
        const bt = (budget.budget_type ?? 'expense') as 'income' | 'expense' | 'savings' | 'debt'

        if (!shouldAlert(spent, limit, threshold, bt)) return

        const pct = (spent / limit) * 100
        const pctRounded = Math.round(pct)
        const id = `budget_${budget.id}`

        let title: string
        let description: string
        let color: string
        let icon: string

        if (bt === 'savings') {
          title = `${budget.name}: ${pctRounded}% gespaard`
          description = `€${Math.round(spent)} van €${Math.round(limit)} spaardoel — minder dan ${threshold}% bereikt`
          color = 'blue'
          icon = 'TrendingUp'
        } else if (bt === 'debt') {
          title = `${budget.name}: ${pctRounded}% afgelost`
          description = `€${Math.round(spent)} van €${Math.round(limit)} aflossingsdoel — minder dan ${threshold}% bereikt`
          color = 'purple'
          icon = 'TrendingUp'
        } else if (pct >= 120) {
          title = `${budget.name}: ${pctRounded}% — flink over budget`
          description = `€${Math.round(spent)} van €${Math.round(limit)} — €${Math.round(spent - limit)} overschrijding`
          color = 'red'
          icon = 'AlertTriangle'
        } else if (pct >= 100) {
          title = `${budget.name}: ${pctRounded}% — over budget`
          description = `€${Math.round(spent)} van €${Math.round(limit)} — budget overschreden`
          color = 'red'
          icon = 'AlertTriangle'
        } else {
          title = `${budget.name}: ${pctRounded}% besteed`
          description = `€${Math.round(spent)} van €${Math.round(limit)} — nog €${Math.round(limit - spent)} over (drempel: ${threshold}%)`
          color = 'amber'
          icon = 'AlertTriangle'
        }

        notifications.push({
          id,
          type: 'budget',
          priority: pct >= 100 ? 1 : 2,
          title,
          description,
          icon,
          color,
          createdAt: now,
          read: readIds.includes(id),
          actionUrl: `/core/budgets?budget=${budget.id}`,
          aiContext: `Mijn budget voor ${budget.name} staat op ${pctRounded}%. Wat kan ik doen om binnen budget te blijven?`,
        })
      }

      for (const parent of parentBudgets) {
        if (parent.budget_type === 'income') continue

        const children = childBudgets.filter((c) => c.parent_id === parent.id)

        if (children.length > 0) {
          // Check each child budget individually
          for (const child of children) {
            const childSpent = getSpent(child.id)
            const childLimit = getEffectiveLimit(child.id, Number(child.default_limit) || 0)
            pushBudgetNotification(
              { ...child, budget_type: child.budget_type ?? parent.budget_type, alert_threshold: child.alert_threshold ?? parent.alert_threshold },
              childSpent,
              childLimit,
            )
          }
        } else {
          // Leaf parent budget — check directly
          const parentSpent = getSpent(parent.id)
          const parentLimit = getEffectiveLimit(parent.id, Number(parent.default_limit) || 0)
          pushBudgetNotification(parent, parentSpent, parentLimit)
        }
      }
    }

    // ── 4. Sync warnings (stale bank accounts) ───────────────────────

    const { data: bankAccounts } = computeSlow
      ? await supabase
          .from('bank_connection_accounts')
          // `iban_encrypted`, niet de plaintext kolom: Stage B dropt
          // `bank_connection_accounts.iban`. De IBAN dient hier één cosmetisch
          // doel (het label van de melding), dus een onleesbare rij degradeert
          // naar 'Bankrekening' i.p.v. de hele meldingenlijst mee te nemen.
          .select('id, iban_encrypted, last_synced_at')
          .eq('is_active', true)
      : { data: null }

    if (bankAccounts) {
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

      for (const account of bankAccounts) {
        if (!account.last_synced_at) continue
        const lastSynced = new Date(account.last_synced_at)
        if (lastSynced >= threeDaysAgo) continue

        const daysSince = Math.floor((Date.now() - lastSynced.getTime()) / 86_400_000)
        const accountIban = decryptIbanForLabel(account.iban_encrypted)
        const label = accountIban ? accountIban.replace(/(.{4})/g, '$1 ').trim().slice(-9) : 'Bankrekening'
        const id = `sync_${account.id}`

        slow.push({
          id,
          type: 'sync',
          priority: 2,
          title: `${label}: ${daysSince} dagen niet gesynchroniseerd`,
          description: `Laatste sync: ${lastSynced.toLocaleDateString('nl-NL')}. Vernieuw je bankgegevens voor actueel inzicht.`,
          icon: 'RefreshCw',
          color: 'red',
          createdAt: now,
          read: readIds.includes(id),
          actionUrl: '/core/cash',
          aiContext: `Mijn bankrekening ${label} is al ${daysSince} dagen niet gesynchroniseerd. Wat moet ik doen?`,
        })
      }
    }

    // ── 4b. Jaarlijkse onderhouds-reminders (WOZ + pensioen) ─────────
    // Pure beslislogica leeft in `lib/notifications/{woz,pension}-reminder.ts`.
    // State per gebruiker in `app_settings.{woz,pension}_reminder_last_sent_*`
    // zorgt dat de reminder maximaal 1× per kalenderjaar verschijnt.

    if (computeSlow) try {
      const { data: reminderAssetRows } = await supabase
        .from('assets')
        .select('asset_type')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .in('asset_type', ['eigen_huis', 'retirement'])

      const reminderAssets = reminderAssetRows ?? []
      const eigenHuisCount = reminderAssets.filter((a) => a.asset_type === 'eigen_huis').length
      const retirementCount = reminderAssets.filter((a) => a.asset_type === 'retirement').length

      if (eigenHuisCount > 0 || retirementCount > 0) {
        const wozKey = `woz_reminder_last_sent_${user.id}`
        const pensionKey = `pension_reminder_last_sent_${user.id}`

        const [wozLastRes, pensionLastRes] = await Promise.all([
          eigenHuisCount > 0
            ? supabase.from('app_settings').select('value').eq('key', wozKey).maybeSingle()
            : Promise.resolve({ data: null as { value: string } | null }),
          retirementCount > 0
            ? supabase.from('app_settings').select('value').eq('key', pensionKey).maybeSingle()
            : Promise.resolve({ data: null as { value: string } | null }),
        ])

        const currentYear = new Date().getUTCFullYear()

        if (
          eigenHuisCount > 0 &&
          shouldSendWozReminder({
            profile: { eigenHuisAssetCount: eigenHuisCount },
            lastSentAt: wozLastRes.data?.value ?? null,
          })
        ) {
          await supabase
            .from('app_settings')
            .upsert({ key: wozKey, value: now }, { onConflict: 'key' })

          const id = `woz_reminder_${currentYear}`
          slow.push({
            id,
            ...WOZ_REMINDER_TEMPLATE,
            createdAt: now,
            read: readIds.includes(id),
            aiContext:
              'Mijn gemeente publiceert deze maanden nieuwe WOZ-waarden. Hoe werk ik de waarde van mijn eigen huis bij?',
          })
        }

        if (
          retirementCount > 0 &&
          shouldSendPensionReminder({
            profile: { retirementAssetCount: retirementCount },
            lastSentAt: pensionLastRes.data?.value ?? null,
          })
        ) {
          await supabase
            .from('app_settings')
            .upsert({ key: pensionKey, value: now }, { onConflict: 'key' })

          const id = `pension_reminder_${currentYear}`
          slow.push({
            id,
            ...PENSION_REMINDER_TEMPLATE,
            createdAt: now,
            read: readIds.includes(id),
            aiContext:
              'Hoe werk ik mijn pensioenwaarde bij vanuit Mijnpensioenoverzicht?',
          })
        }
      }
    } catch (err) {
      console.error('Yearly reminder notification error:', err)
    }

    // ── 4c. Wekelijkse briefing-melding ─────────────────────────────
    // Eén melding per ISO-week (Amsterdam): nudge naar /overzicht waar de
    // verse weekbriefing + vrijheidswinst klaarstaat. Gegate via een
    // app_settings-key, exact zoals de woz/pension-reminders hierboven.
    // De voorkeur-check zit hier (niet pas in het eind-filter) zodat een
    // uitgezette melding de week-key niet "opbrandt".
    if (computeSlow && prefs.briefing !== false) try {
      const briefingWeekKey = `briefing_notified_week_${user.id}`
      const { data: lastBriefingWeekRow } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', briefingWeekKey)
        .maybeSingle()
      const currentWeek = amsterdamWeekKey(new Date())
      if (lastBriefingWeekRow?.value !== currentWeek) {
        await supabase
          .from('app_settings')
          .upsert({ key: briefingWeekKey, value: currentWeek }, { onConflict: 'key' })
        const id = `briefing_${currentWeek}`
        slow.push({
          id,
          type: 'briefing',
          priority: 4,
          title: 'Je weekbriefing staat klaar',
          description:
            'Bekijk je vrijheidswinst van deze week — wat je geld je aan tijd opleverde.',
          icon: 'Sparkles',
          color: 'violet',
          createdAt: now,
          read: readIds.includes(id),
          actionUrl: '/overzicht#briefing',
        })
      }
    } catch (err) {
      console.error('Weekly briefing notification error:', err)
    }

    // ── 6. Partner transaction notifications ─────────────────────────
    // Check if user is in a household and has partner transaction notification prefs

    try {
      const { data: myMembership } = await supabase
        .from('household_members')
        .select('household_id, user_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (myMembership) {
        // Find partner in same household
        const { data: partnerMember } = await supabase
          .from('household_members')
          .select('user_id')
          .eq('household_id', myMembership.household_id)
          .neq('user_id', user.id)
          .maybeSingle()

        if (partnerMember) {
          // Load partner notification preferences
          const { data: partnerNotifData } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', `partner_notif_prefs_${user.id}`)
            .maybeSingle()

          type PartnerNotifMode = 'all_shared' | 'threshold' | 'categories' | 'disabled'
          const partnerNotifPrefs: { mode: PartnerNotifMode; threshold: number; categories: string[] } = partnerNotifData?.value
            ? JSON.parse(partnerNotifData.value)
            : { mode: 'all_shared', threshold: 100, categories: [] }

          if (partnerNotifPrefs.mode !== 'disabled') {
            // Fetch recent partner transactions (last 7 days, shared or owned by partner)
            const { data: partnerTxs } = await supabase
              .from('transactions')
              .select('id, description, amount, date, budget_id, ownership, is_income, transaction_type')
              .eq('user_id', partnerMember.user_id)
              .gte('date', cutoffDate.toISOString().split('T')[0])
              .order('date', { ascending: false })
              .limit(50)

            // Also get shared transactions by current user's partner
            const { data: sharedTxs } = await supabase
              .from('transactions')
              .select('id, description, amount, date, budget_id, ownership, is_income, transaction_type')
              .eq('ownership', 'shared')
              .eq('user_id', partnerMember.user_id)
              .gte('date', cutoffDate.toISOString().split('T')[0])
              .order('date', { ascending: false })
              .limit(50)

            // Merge, deduplicate, and filter out own-account transfers
            const allPartnerTxs = [...(partnerTxs || []), ...(sharedTxs || [])]
            const seenTxIds = new Set<string>()
            const uniquePartnerTxs = allPartnerTxs.filter(tx => {
              if (seenTxIds.has(tx.id)) return false
              seenTxIds.add(tx.id)
              const txType = (tx as { transaction_type?: string | null }).transaction_type
              if (txType === 'transfer' || txType === 'joint_transfer') return false
              return true
            })

            // Load budget names for category display
            const budgetIds = [...new Set(uniquePartnerTxs.map(tx => tx.budget_id).filter(Boolean))]
            let budgetNameMap: Record<string, string> = {}
            if (budgetIds.length > 0) {
              const { data: budgets } = await supabase
                .from('budgets')
                .select('id, name')
                .in('id', budgetIds)
              if (budgets) {
                budgetNameMap = Object.fromEntries(budgets.map(b => [b.id, b.name]))
              }
            }

            // Compute daily expenses for freedom time calculation (exclude transfers).
            // Canonieke dagbasis = jaaruitgaven / 365 (zie lib/format.ts
            // calculateFreedomTime), niet maand/dagenInMaand. De maanduitgaven
            // extrapoleren we naar een jaar (×12).
            const totalMonthExpenses = (txRes.data ?? [])
              .filter(t =>
                (t as { transaction_type?: string | null }).transaction_type !== 'transfer' &&
                (t as { transaction_type?: string | null }).transaction_type !== 'joint_transfer')
              .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)
            const dailyExpenses = totalMonthExpenses > 0 ? (totalMonthExpenses * 12) / 365 : 0

            for (const tx of uniquePartnerTxs) {
              const amount = Math.abs(Number(tx.amount))
              const isShared = tx.ownership === 'shared'
              const budgetName = tx.budget_id ? budgetNameMap[tx.budget_id] : null

              // Apply notification filters based on mode
              let shouldNotify = false

              if (partnerNotifPrefs.mode === 'all_shared') {
                shouldNotify = isShared
              } else if (partnerNotifPrefs.mode === 'threshold') {
                shouldNotify = amount >= partnerNotifPrefs.threshold
              } else if (partnerNotifPrefs.mode === 'categories') {
                shouldNotify = tx.budget_id != null && partnerNotifPrefs.categories.includes(tx.budget_id)
              }

              if (!shouldNotify) continue

              // Vrijheidstijd-impact via de canonieke helper (lib/format.ts):
              // dezelfde €→tijd-conversie als de rest van de app. De zichtbare
              // tekstvorm ("Xj Ym", "Ym Zd", "N dagen") houden we bewust gelijk
              // aan de oude melding — alleen de dagbasis is nu canoniek.
              const freedomBreakdown = calculateFreedomTime(amount, dailyExpenses)
              const freedomDaysRounded = freedomBreakdown.totalDays

              const id = `partner_tx_${tx.id}`
              const isIncome = tx.is_income === true
              const categoryLabel = budgetName ? ` · ${budgetName}` : ''

              // Freedom-time formatting — tekstvorm gelijk aan de oude melding,
              // gevoed door de canonieke breakdown.
              let freedomLabel = ''
              if (freedomDaysRounded > 0) {
                const { years, months, days } = freedomBreakdown
                if (years > 0) {
                  freedomLabel = months > 0 ? `${years}j ${months}m` : `${years}j`
                } else if (months > 0) {
                  freedomLabel = days > 0 ? `${months}m ${days}d` : `${months}m`
                } else {
                  freedomLabel = `${days} ${days === 1 ? 'dag' : 'dagen'}`
                }
              }

              // Positive tone for income, neutral for expenses
              const title = isIncome
                ? `Inkomen ontvangen: €${amount.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}${freedomLabel ? ` (+${freedomLabel} vrijheid)` : ''}`
                : `Partner uitgave: €${amount.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}${freedomLabel ? ` (${freedomLabel})` : ''}`

              const description = isIncome
                ? `${tx.description || 'Inkomen'}${categoryLabel} — vrijheid opgebouwd`
                : `${tx.description || 'Uitgave'}${categoryLabel}`

              notifications.push({
                id,
                type: 'partner_transaction',
                priority: 3,
                title,
                description,
                icon: isIncome ? 'TrendingUp' : 'HandCoins',
                color: isIncome ? 'emerald' : 'teal',
                createdAt: tx.date ? new Date(tx.date).toISOString() : now,
                read: readIds.includes(id),
                actionUrl: '/core/cash',
                aiContext: isIncome
                  ? `Mijn partner heeft €${amount.toFixed(2)} inkomen ontvangen${budgetName ? ` in categorie ${budgetName}` : ''}${freedomLabel ? `, dat is ${freedomLabel} aan vrijheidstijd` : ''}. Hoe draagt dit bij aan onze financiele vrijheid?`
                  : `Mijn partner heeft €${amount.toFixed(2)} uitgegeven${budgetName ? ` in categorie ${budgetName}` : ''}${freedomLabel ? `, dat is ${freedomLabel} aan vrijheidstijd` : ''}. Wat is de impact op ons huishoudbudget?`,
                metadata: { amount, category: budgetName, freedomDays: freedomDaysRounded, isShared, isIncome },
              })
            }
          }
        }
      }
    } catch (err) {
      console.error('Partner transaction notification error:', err)
      // Non-critical — continue without partner notifications
    }

    // ── 6b. Budgetmodel-voorstellen (gezamenlijk ⇄ gescheiden budget) ─
    // Toon een melding aan de PARTNER (niet de aanvrager) wanneer er een
    // openstaand voorstel is om over te stappen op één gezamenlijk
    // huishoudbudget — of juist terug naar gescheiden budgetten. RLS scoopt de
    // query al tot het eigen huishouden; we filteren op `proposed_by != user.id`
    // zodat de aanvrager zelf geen "actie vereist"-melding krijgt.

    if (computeSlow) try {
      const { data: budgetProposals } = await supabase
        .from('household_budget_model_proposals')
        .select('id, target_model, proposed_by, created_at')
        .eq('status', 'pending')
        .neq('proposed_by', user.id)
        .order('created_at', { ascending: false })

      if (budgetProposals && budgetProposals.length > 0) {
        // Partnernaam goedkoop ophalen via de huishoud-RPC (profiles-RLS is
        // own-only). Faalt dit, dan valt de tekst terug op "je partner".
        let proposerNameById: Record<string, string> = {}
        try {
          const { data: memberProfiles } = await supabase.rpc('household_member_profiles')
          for (const m of (memberProfiles ?? []) as Array<{ id: string; full_name: string | null }>) {
            if (m.full_name) proposerNameById[m.id] = m.full_name
          }
        } catch {
          proposerNameById = {}
        }

        for (const proposal of budgetProposals) {
          const toHousehold = proposal.target_model === 'household'
          const proposerName = proposerNameById[proposal.proposed_by] ?? 'je partner'
          const id = `budget_model_proposal_${proposal.id}`

          const title = toHousehold
            ? 'Voorstel: gezamenlijk huishoudbudget'
            : 'Voorstel: terug naar gescheiden budgetten'
          const description = toHousehold
            ? `${proposerName} stelt voor om jullie budgetten samen te voegen tot één gezamenlijk huishoudbudget.`
            : `${proposerName} stelt voor om terug te gaan naar gescheiden budgetten.`

          slow.push({
            id,
            type: 'budget_model_proposal',
            priority: 2,
            title,
            description,
            icon: 'Users',
            color: 'teal',
            createdAt: proposal.created_at
              ? new Date(proposal.created_at).toISOString()
              : now,
            read: readIds.includes(id),
            actionUrl: '/mijn/profiel#huishoudbudget',
            aiContext: toHousehold
              ? `${proposerName} stelt voor om over te stappen op één gezamenlijk huishoudbudget. Wat betekent dat voor mijn budgetten en privacy, en waar moet ik op letten?`
              : `${proposerName} stelt voor om terug te gaan naar gescheiden budgetten. Wat zijn de gevolgen van het terugdraaien van het gezamenlijke huishoudbudget?`,
            metadata: { proposalId: proposal.id, targetModel: proposal.target_model },
          })
        }
      }
    } catch (err) {
      console.error('Budget model proposal notification error:', err)
      // Non-critical — continue without budget model proposal notifications
    }

    // ── 7. Horizon alerts (FIRE aandachtspunten) ─────────────────────

    // Profile is hoisted here so the horizon alerts below can read it
    let profile: { date_of_birth?: string; expected_return?: number; inflation_rate?: number; active_modules?: string[] } | null = null

    if (computeSlow) try {
      const [profileRes, debtsRes, assetsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('date_of_birth, expected_return, inflation_rate, active_modules')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('debts')
          .select('current_balance, net_worth_inclusion_pct')
          .eq('is_active', true),
        supabase
          .from('assets')
          .select('current_value, net_worth_inclusion_pct')
          .eq('user_id', user.id)
          .eq('is_active', true),
      ])

      profile = profileRes.data
      const dateOfBirth = profile?.date_of_birth
      // Netto vermogen op dezelfde grondslag als dashboard-data-loader:
      // actieve posten, gewogen met net_worth_inclusion_pct.
      const totalDebts = (debtsRes.data ?? []).reduce(
        (sum, d) => sum + Math.abs(Number(d.current_balance ?? 0)) * (Number((d as { net_worth_inclusion_pct?: number | null }).net_worth_inclusion_pct ?? 100) / 100),
        0,
      )
      const totalAssets = (assetsRes.data ?? []).reduce(
        (sum, a) => sum + Number(a.current_value ?? 0) * (Number((a as { net_worth_inclusion_pct?: number | null }).net_worth_inclusion_pct ?? 100) / 100),
        0,
      )

      // Alert: no date of birth set
      if (!dateOfBirth) {
        const id = 'horizon_no_dob'
        slow.push({
          id,
          type: 'horizon',
          priority: 3,
          title: 'Geboortedatum niet ingesteld',
          description: 'Stel je geboortedatum in bij instellingen voor nauwkeurige leeftijds- en vrijheidsberekeningen.',
          icon: 'Calendar',
          color: 'amber',
          createdAt: now,
          read: readIds.includes(id),
          actionUrl: '/mijn/profiel',
          aiContext: 'Ik heb mijn geboortedatum nog niet ingesteld. Waarom is dat belangrijk voor mijn FIRE-berekeningen?',
        })
      }

      // Alert: has debts
      if (totalDebts > 0) {
        const id = 'horizon_has_debt'
        const debtFormatted = totalDebts.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 })
        slow.push({
          id,
          type: 'horizon',
          priority: 3,
          title: `${debtFormatted} aan openstaande schulden`,
          description: 'Schulden vertragen je pad naar volledige vrijheid. Bekijk je aflosstrategie.',
          icon: 'TrendingDown',
          color: 'purple',
          createdAt: now,
          read: readIds.includes(id),
          actionUrl: '/core/debts',
          aiContext: `Ik heb ${debtFormatted} aan schulden. Wat is de impact op mijn financiële vrijheid en hoe kan ik dit het beste aanpakken?`,
        })
      }

      // Alert: FIRE not reachable (simple check: no monthly savings or net worth negative)
      if (dateOfBirth) {
        // Compute monthly income/expenses from budgets for a rough savings check
        const monthlyIncome = (budgetsRes.data ?? [])
          .filter(b => b.budget_type === 'income' && !b.parent_id)
          .reduce((sum, b) => sum + Number(b.default_limit ?? 0), 0)
        const monthlyExpenses = (budgetsRes.data ?? [])
          .filter(b => b.budget_type === 'expense' && !b.parent_id)
          .reduce((sum, b) => sum + Number(b.default_limit ?? 0), 0)
        const monthlySavings = monthlyIncome - monthlyExpenses
        const netWorth = totalAssets - totalDebts

        // FIRE-doel op de canonieke grondslag: jaaruitgaven / effectiveSwr
        // (gepersonaliseerde SWR uit resolveFireParams), niet de impliciete
        // 25× (= 4%-regel). Zo oordeelt deze trigger op hetzelfde doel als
        // /toekomst.
        const { effectiveSwr } = resolveFireParams({
          expected_return: profile?.expected_return ?? null,
          inflation_rate: profile?.inflation_rate ?? null,
        })
        const fireTarget = effectiveSwr > 0 ? (monthlyExpenses * 12) / effectiveSwr : Infinity

        if (monthlySavings <= 0 && netWorth < fireTarget) {
          const id = 'horizon_fire_unreachable'
          slow.push({
            id,
            type: 'horizon',
            priority: 2,
            title: 'Volledige vrijheid niet haalbaar bij huidige koers',
            description: 'Verhoog je spaarquote of verlaag je uitgaven om je pad naar financiële vrijheid te versnellen.',
            icon: 'AlertTriangle',
            color: 'red',
            createdAt: now,
            read: readIds.includes(id),
            actionUrl: '/horizon',
            aiContext: 'Mijn FIRE-doel is niet haalbaar bij mijn huidige inkomsten en uitgaven. Wat kan ik doen?',
          })
        }
      }
    } catch (err) {
      console.error('Horizon notification error:', err)
    }

    // ── 8. Holding alerts (price & rebalancing) ──────────────────────

    if (computeSlow) try {
      // NB: `holding_id` is gesplitst in `investment_holding_id` /
      // `crypto_holding_id` (migratie 20260502000004). De oude select gaf
      // elke poll een 400. Prijs-alerts evalueren we alleen voor investment-
      // holdings (crypto-alerts vinden geen holding en slaan stil over —
      // de rebalance-drift-tak heeft geen holding nodig).
      const { data: activeAlerts } = await supabase
        .from('holding_alerts')
        .select('id, investment_holding_id, crypto_holding_id, type, threshold, last_triggered_at')
        .eq('user_id', user.id)
        .eq('is_active', true)

      if (activeAlerts && activeAlerts.length > 0) {
        const alertHoldingId = (a: { investment_holding_id: string | null; crypto_holding_id: string | null }) =>
          a.investment_holding_id ?? a.crypto_holding_id ?? null

        // Fetch holdings data for alert evaluation (investment only)
        const holdingIds = [...new Set(activeAlerts.map(a => a.investment_holding_id).filter((id): id is string => Boolean(id)))]
        const { data: holdingsData } = holdingIds.length > 0
          ? await supabase
              .from('investment_holdings')
              .select('id, name, ticker, current_price, avg_purchase_price, units, asset_class')
              .eq('user_id', user.id)
              .in('id', holdingIds)
          : { data: [] }

        const holdingsMap = new Map((holdingsData || []).map(h => [h.id, h]))

        // For rebalance alerts, compute allocation percentages
        const { data: allHoldings } = await supabase
          .from('investment_holdings')
          .select('id, current_price, units, asset_class')
          .eq('user_id', user.id)
          .eq('is_active', true)

        const totalPortfolioValue = (allHoldings || []).reduce((sum, h) => {
          return sum + ((Number(h.current_price) || 0) * (Number(h.units) || 0))
        }, 0)

        // Get target allocations for drift detection
        const { data: targets } = await supabase
          .from('target_allocations')
          .select('category, target_pct')
          .eq('user_id', user.id)
          .eq('view_mode', 'asset_class')

        const targetMap = new Map((targets || []).map(t => [t.category, Number(t.target_pct)]))

        // Compute current allocations by asset_class
        const currentAlloc = new Map<string, number>()
        for (const h of (allHoldings || [])) {
          const val = (Number(h.current_price) || 0) * (Number(h.units) || 0)
          const cls = (h.asset_class as string) || 'Overig'
          currentAlloc.set(cls, (currentAlloc.get(cls) || 0) + val)
        }

        for (const alert of activeAlerts) {
          const holdingId = alertHoldingId(alert)
          const holding = alert.investment_holding_id ? holdingsMap.get(alert.investment_holding_id) : null
          const currentPrice = holding ? Number(holding.current_price) || 0 : 0
          const avgPrice = holding ? Number(holding.avg_purchase_price) || 0 : 0
          const holdingName = holding ? (holding.ticker || holding.name || 'Holding') : 'Portfolio'

          let triggered = false
          let title = ''
          let description = ''

          if (alert.type === 'price_above' && holding) {
            triggered = currentPrice >= alert.threshold
            const formatted = currentPrice.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })
            const thresholdFormatted = Number(alert.threshold).toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })
            title = `${holdingName} bereikt ${thresholdFormatted}`
            description = `De prijs van ${holdingName} staat nu op ${formatted}, boven je alert van ${thresholdFormatted}.`
          } else if (alert.type === 'price_below' && holding) {
            triggered = currentPrice > 0 && currentPrice <= alert.threshold
            const formatted = currentPrice.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })
            const thresholdFormatted = Number(alert.threshold).toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })
            title = `${holdingName} onder ${thresholdFormatted}`
            description = `De prijs van ${holdingName} staat nu op ${formatted}, onder je alert van ${thresholdFormatted}.`
          } else if (alert.type === 'return_threshold' && holding && avgPrice > 0) {
            const returnPct = ((currentPrice - avgPrice) / avgPrice) * 100
            triggered = Math.abs(returnPct) >= Math.abs(alert.threshold)
            title = `${holdingName} rendement ${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(1)}%`
            description = `Het rendement van ${holdingName} heeft je drempel van ${alert.threshold}% bereikt.`
          } else if (alert.type === 'rebalance_drift' && totalPortfolioValue > 0) {
            // Check max drift across all asset classes with targets
            let maxDrift = 0
            let driftClass = ''
            for (const [cls, targetPct] of targetMap) {
              const currentVal = currentAlloc.get(cls) || 0
              const currentPct = (currentVal / totalPortfolioValue) * 100
              const drift = Math.abs(currentPct - targetPct)
              if (drift > maxDrift) {
                maxDrift = drift
                driftClass = cls
              }
            }
            triggered = maxDrift > alert.threshold
            title = `Portfolio allocatie-drift: ${maxDrift.toFixed(1)}%`
            description = `${driftClass} wijkt ${maxDrift.toFixed(1)}% af van je doelallocatie. Overweeg herbalancering.`
          }

          if (triggered) {
            const id = `holding_alert_${alert.id}`
            slow.push({
              id,
              type: 'holding_alert',
              priority: 2,
              title,
              description,
              icon: alert.type === 'rebalance_drift' ? 'BarChart3' : 'Bell',
              color: alert.type === 'price_below' ? 'red' : alert.type === 'price_above' ? 'green' : 'blue',
              createdAt: now,
              read: readIds.includes(id),
              actionUrl: holdingId ? `/core/assets/holdings/${holdingId}` : '/core/assets/holdings',
            })
          }
        }
      }
    } catch (err) {
      console.error('Holding alert notification error:', err)
    }

    // ── Merge langzame checks ────────────────────────────────────────
    // Cache-miss: net berekende items cachen; cache-hit: gecachte items
    // hergebruiken. Read-status wordt altijd vers afgeleid uit readIds —
    // markeren-als-gelezen werkt dus ook binnen het TTL-venster direct.
    if (computeSlow) {
      slowChecksCache.set(user.id, { computedAt: Date.now(), items: slow })
    }
    const slowItems = computeSlow ? slow : (cachedSlow?.items ?? [])
    notifications.push(
      ...slowItems.map((n) => ({ ...n, read: readIds.includes(n.id) }))
    )

    // Sort by priority (lower = higher priority)
    notifications.sort((a, b) => a.priority - b.priority)

    // Filter out disabled notification types based on user preferences
    const filtered = notifications.filter(n => prefs[n.type] !== false)

    // ── Merge into history ───────────────────────────────────────────
    // Store current notifications in history for the modal to display
    // Always retain up to 30 days in storage; return only `days` worth

    const storageCutoff = new Date()
    storageCutoff.setDate(storageCutoff.getDate() - 30)
    const storageCutoffStr = storageCutoff.toISOString()
    const returnCutoff = cutoffDate.toISOString()

    // Start from stored history, prune entries older than 30 days
    let history = storedHistory.filter((h) => h.createdAt >= storageCutoffStr)

    // Merge current notifications into history (upsert by id)
    const historyIds = new Set(history.map((h) => h.id))
    for (const n of filtered) {
      if (historyIds.has(n.id)) {
        // Update existing entry with fresh data, but preserve read-status
        history = history.map((h) =>
          h.id === n.id ? { ...n, createdAt: h.createdAt, read: h.read || readIds.includes(n.id) } : h
        )
      } else {
        history.push(n)
      }
    }

    // Mark history entries as read if they are in readIds
    history = history.map((h) => ({
      ...h,
      read: readIds.includes(h.id) || h.read,
    }))

    // Sort history by createdAt descending (newest first)
    history.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    // Persist full 30-day history — alleen wanneer er daadwerkelijk iets
    // veranderd is. De poll draait periodiek; zonder deze guard schreef
    // elke poll een identieke JSON-blob terug (onnodige write + egress).
    const serializedHistory = JSON.stringify(history)
    if (serializedHistory !== historyRes.data?.value) {
      await supabase
        .from('app_settings')
        .upsert(
          {
            key: `notifications_history_${user.id}`,
            value: serializedHistory,
          },
          { onConflict: 'key' }
        )
    }

    // Return only entries within the requested `days` window AND respect the
    // user's per-type voorkeuren. We persist the FULL history above (so
    // toggling a type back on re-reveals it), but we never SHOW a type the
    // user switched off. This is what makes de toggles op /mijn/notificaties
    // het berichtencentrum daadwerkelijk filteren — óók voor reeds ontvangen
    // berichten zoals partner-acties, die alleen via de history binnenkomen.
    const returnHistory = history.filter(
      (h) => h.createdAt >= returnCutoff && prefs[h.type] !== false
    )

    return NextResponse.json({
      notifications: filtered,
      history: returnHistory,
      unreadCount: filtered.filter((n) => !n.read).length,
    })
  } catch (err) {
    console.error('Notifications error:', err)
    return NextResponse.json(
      { error: 'Fout bij laden meldingen' },
      { status: 500 }
    )
  }
}

// ── PATCH — Mark notifications as read ───────────────────────────────

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { markRead, markAllRead } = body as {
      markRead?: string
      markAllRead?: string[]
    }

    const settingsKey = `notifications_read_${user.id}`

    const { data: existing } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', settingsKey)
      .maybeSingle()

    let readIds: string[] = existing?.value
      ? JSON.parse(existing.value)
      : []

    if (markAllRead && Array.isArray(markAllRead)) {
      for (const id of markAllRead) {
        if (!readIds.includes(id)) readIds.push(id)
      }
    } else if (markRead) {
      if (!readIds.includes(markRead)) {
        readIds.push(markRead)
      }
    }

    // Keep only the last 200 IDs to prevent unbounded growth
    if (readIds.length > 200) {
      readIds = readIds.slice(-200)
    }

    await supabase
      .from('app_settings')
      .upsert(
        { key: settingsKey, value: JSON.stringify(readIds) },
        { onConflict: 'key' }
      )

    return NextResponse.json({ success: true, readCount: readIds.length })
  } catch (err) {
    console.error('Notification PATCH error:', err)
    return NextResponse.json(
      { error: 'Fout bij bijwerken meldingen' },
      { status: 500 }
    )
  }
}

// ── PUT — Save notification preferences ─────────────────────────────

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { preferences } = body as {
      preferences: Record<string, boolean>
    }

    if (!preferences || typeof preferences !== 'object') {
      return NextResponse.json(
        { error: 'Ongeldige voorkeuren' },
        { status: 400 }
      )
    }

    const validTypes = ['budget', 'sync', 'recommendation', 'partner_transaction', 'horizon', 'holding_alert', 'briefing', 'budget_model_proposal']
    const sanitized: Record<string, boolean> = {}
    for (const key of validTypes) {
      sanitized[key] = preferences[key] !== false
    }

    await supabase
      .from('app_settings')
      .upsert(
        {
          key: `notifications_preferences_${user.id}`,
          value: JSON.stringify(sanitized),
        },
        { onConflict: 'key' }
      )

    return NextResponse.json({ success: true, preferences: sanitized })
  } catch (err) {
    console.error('Notification PUT error:', err)
    return NextResponse.json(
      { error: 'Fout bij opslaan voorkeuren' },
      { status: 500 }
    )
  }
}

