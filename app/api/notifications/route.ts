import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { shouldAlert } from '@/lib/budget-alerts'
import { getActiveNudges, type NudgeDataState, type NudgeOverrides } from '@/lib/nudge-definitions'
import type { ModuleId } from '@/lib/module-registry'
import { shouldSendWozReminder, WOZ_REMINDER_TEMPLATE } from '@/lib/notifications/woz-reminder'
import { shouldSendPensionReminder, PENSION_REMINDER_TEMPLATE } from '@/lib/notifications/pension-reminder'
import { amsterdamWeekKey } from '@/lib/briefing/snapshot'

// ── Types ────────────────────────────────────────────────────────────

export type NotificationType =
  | 'budget'
  | 'sync'
  | 'recommendation'
  | 'levelup'
  | 'partner_transaction'
  | 'horizon'
  | 'holding_alert'
  | 'module_nudge'
  | 'briefing'

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
      recommendation: true, levelup: true,
      partner_transaction: true, horizon: true,
      holding_alert: true, module_nudge: true, briefing: true,
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

    // Accept optional `days` query parameter (default: 7, clamped 1–90)
    const daysParam = request.nextUrl.searchParams.get('days')
    const days = daysParam ? Math.max(1, Math.min(90, parseInt(daysParam, 10) || 7)) : 7

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    // Keep sevenDaysAgo for backward-compat references (e.g. level-up check)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    // ── 1. Budget alerts ─────────────────────────────────────────────

    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const monthEnd = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      1
    )

    // Build current period string for rollovers (YYYY-MM)
    const currentPeriod = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`

    const [budgetsRes, txRes, amountsRes, rolloversRes] = await Promise.all([
      supabase
        .from('budgets')
        .select('id, name, slug, parent_id, budget_type, default_limit, alert_threshold')
        .eq('user_id', user.id),
      supabase
        .from('transactions')
        .select('budget_id, amount, transaction_type')
        .eq('user_id', user.id)
        .gte('date', monthStart.toISOString().split('T')[0])
        .lt('date', monthEnd.toISOString().split('T')[0])
        .not('budget_id', 'is', null),
      supabase
        .from('budget_amounts')
        .select('budget_id, effective_from, amount')
        .eq('user_id', user.id),
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

    const { data: bankAccounts } = await supabase
      .from('bank_connection_accounts')
      .select('id, iban, last_synced_at')
      .eq('is_active', true)

    if (bankAccounts) {
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

      for (const account of bankAccounts) {
        if (!account.last_synced_at) continue
        const lastSynced = new Date(account.last_synced_at)
        if (lastSynced >= threeDaysAgo) continue

        const daysSince = Math.floor((Date.now() - lastSynced.getTime()) / 86_400_000)
        const label = account.iban ? account.iban.replace(/(.{4})/g, '$1 ').trim().slice(-9) : 'Bankrekening'
        const id = `sync_${account.id}`

        notifications.push({
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

    try {
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
          notifications.push({
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
          notifications.push({
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
    if (prefs.briefing !== false) try {
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
        notifications.push({
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

    // ── 5. Level-up notifications ───────────────────────────────────

    const { data: levelChangeData } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', `sovereignty_level_change_${user.id}`)
      .maybeSingle()

    if (levelChangeData?.value) {
      try {
        const change = JSON.parse(levelChangeData.value) as {
          oldLevel: number
          newLevel: number
          timestamp: string
        }
        // Only show if within the last 7 days
        if (change.timestamp >= sevenDaysAgo.toISOString()) {
          const id = `levelup_${change.newLevel}_${change.timestamp.split('T')[0]}`
          notifications.push({
            id,
            type: 'levelup',
            priority: 1,
            title: `Niveau omhoog: Level ${change.newLevel}`,
            description: `Je soevereiniteitsniveau is gestegen van level ${change.oldLevel} naar ${change.newLevel}. Bekijk welke features er zijn ontgrendeld!`,
            icon: 'ArrowUp',
            color: 'purple',
            createdAt: change.timestamp,
            read: readIds.includes(id),
            actionUrl: '/identity',
            aiContext: `Ik ben van soevereiniteitsniveau ${change.oldLevel} naar ${change.newLevel} gegaan. Wat is er nu anders?`,
            metadata: { oldLevel: change.oldLevel, newLevel: change.newLevel },
          })
        }
      } catch {
        // Invalid JSON — skip
      }
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

            // Compute daily expenses for freedom time calculation (exclude transfers)
            const dailyExpenses = monthEnd && monthStart
              ? (() => {
                  const totalExpenses = (txRes.data ?? [])
                    .filter(t =>
                      (t as { transaction_type?: string | null }).transaction_type !== 'transfer' &&
                      (t as { transaction_type?: string | null }).transaction_type !== 'joint_transfer')
                    .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)
                  const daysInMonth = Math.ceil((monthEnd.getTime() - monthStart.getTime()) / 86_400_000)
                  return totalExpenses / Math.max(daysInMonth, 1)
                })()
              : 0

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

              // Calculate freedom days impact
              const freedomDays = dailyExpenses > 0
                ? Math.round((amount / dailyExpenses) * 10) / 10
                : 0

              const id = `partner_tx_${tx.id}`
              const isIncome = tx.is_income === true
              const categoryLabel = budgetName ? ` · ${budgetName}` : ''

              // Freedom-time formatting
              const freedomDaysRounded = Math.round(freedomDays * 10) / 10
              let freedomLabel = ''
              if (freedomDaysRounded > 0) {
                if (freedomDaysRounded >= 365) {
                  const years = Math.floor(freedomDaysRounded / 365)
                  const months = Math.round((freedomDaysRounded % 365) / 30)
                  freedomLabel = months > 0 ? `${years}j ${months}m` : `${years}j`
                } else if (freedomDaysRounded >= 30) {
                  const months = Math.floor(freedomDaysRounded / 30)
                  const days = Math.round(freedomDaysRounded % 30)
                  freedomLabel = days > 0 ? `${months}m ${days}d` : `${months}m`
                } else {
                  freedomLabel = `${freedomDaysRounded} ${freedomDaysRounded === 1 ? 'dag' : 'dagen'}`
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

    // ── 7. Horizon alerts (FIRE aandachtspunten) ─────────────────────

    // Profile is used by both horizon alerts and module nudges, so hoist it
    let profile: { date_of_birth?: string; expected_return?: number; inflation_rate?: number; active_modules?: string[] } | null = null

    try {
      const [profileRes, debtsRes, assetsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('date_of_birth, expected_return, inflation_rate, active_modules')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('debts')
          .select('current_balance')
          .eq('is_active', true),
        supabase
          .from('assets')
          .select('current_value')
          .eq('user_id', user.id),
      ])

      profile = profileRes.data
      const dateOfBirth = profile?.date_of_birth
      const totalDebts = (debtsRes.data ?? []).reduce((sum, d) => sum + Math.abs(Number(d.current_balance ?? 0)), 0)
      const totalAssets = (assetsRes.data ?? []).reduce((sum, a) => sum + Number(a.current_value ?? 0), 0)

      // Alert: no date of birth set
      if (!dateOfBirth) {
        const id = 'horizon_no_dob'
        notifications.push({
          id,
          type: 'horizon',
          priority: 3,
          title: 'Geboortedatum niet ingesteld',
          description: 'Stel je geboortedatum in bij instellingen voor nauwkeurige leeftijds- en vrijheidsberekeningen.',
          icon: 'Calendar',
          color: 'amber',
          createdAt: now,
          read: readIds.includes(id),
          actionUrl: '/identity/profiel',
          aiContext: 'Ik heb mijn geboortedatum nog niet ingesteld. Waarom is dat belangrijk voor mijn FIRE-berekeningen?',
        })
      }

      // Alert: has debts
      if (totalDebts > 0) {
        const id = 'horizon_has_debt'
        const debtFormatted = totalDebts.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 })
        notifications.push({
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

        if (monthlySavings <= 0 && netWorth < monthlyExpenses * 12 * 25) {
          const id = 'horizon_fire_unreachable'
          notifications.push({
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

    try {
      const { data: activeAlerts } = await supabase
        .from('holding_alerts')
        .select('id, holding_id, type, threshold, last_triggered_at')
        .eq('user_id', user.id)
        .eq('is_active', true)

      if (activeAlerts && activeAlerts.length > 0) {
        // Fetch holdings data for alert evaluation
        const holdingIds = [...new Set(activeAlerts.filter(a => a.holding_id).map(a => a.holding_id))]
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
          const holding = alert.holding_id ? holdingsMap.get(alert.holding_id) : null
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
            notifications.push({
              id,
              type: 'holding_alert',
              priority: 2,
              title,
              description,
              icon: alert.type === 'rebalance_drift' ? 'BarChart3' : 'Bell',
              color: alert.type === 'price_below' ? 'red' : alert.type === 'price_above' ? 'green' : 'blue',
              createdAt: now,
              read: readIds.includes(id),
              actionUrl: alert.holding_id ? `/core/assets/holdings/${alert.holding_id}` : '/core/assets/holdings',
            })
          }
        }
      }
    } catch (err) {
      console.error('Holding alert notification error:', err)
    }

    // ── 9. Module nudges (onboarding guidance) ──────────────────────

    let nudgeNotifications: Notification[] = []

    try {
      const [
        nudgeAssetsRes,
        nudgeDebtsRes,
        nudgeBudgetsRes,
        nudgeTransactionsRes,
        nudgeHoldingsRes,
        nudgeGoalsRes,
        nudgeLifeEventsRes,
        nudgeBankConnsRes,
        nudgeOverridesRes,
      ] = await Promise.all([
        supabase.from('assets').select('id').eq('user_id', user.id).eq('is_active', true).limit(1),
        supabase.from('debts').select('id').eq('user_id', user.id).eq('is_active', true).limit(1),
        supabase.from('budgets').select('id').eq('user_id', user.id).is('parent_id', null).limit(1),
        supabase.from('transactions').select('id').eq('user_id', user.id).limit(1),
        supabase.from('investment_holdings').select('id, isin').eq('user_id', user.id).eq('is_active', true),
        supabase.from('goals').select('id').eq('user_id', user.id).limit(1),
        supabase.from('life_events').select('id, event_type').eq('user_id', user.id).eq('is_active', true),
        supabase.from('bank_connections').select('id, status').eq('user_id', user.id),
        supabase.from('app_settings').select('value').eq('key', 'nudge_overrides').maybeSingle(),
      ])

      const nudgeHoldings = nudgeHoldingsRes.data ?? []
      const nudgeLifeEvents = (nudgeLifeEventsRes.data ?? []).filter(e => e.event_type !== 'aow')
      const nudgeOverrides: NudgeOverrides = nudgeOverridesRes.data?.value
        ? JSON.parse(nudgeOverridesRes.data.value)
        : {}

      const nudgeState: NudgeDataState = {
        hasAssets: (nudgeAssetsRes.data?.length ?? 0) > 0,
        hasDebts: (nudgeDebtsRes.data?.length ?? 0) > 0,
        hasBudgets: (nudgeBudgetsRes.data?.length ?? 0) > 0,
        hasTransactions: (nudgeTransactionsRes.data?.length ?? 0) > 0,
        hasActiveBankConnection: (nudgeBankConnsRes.data ?? []).some((c: { status: string }) => c.status === 'authorized'),
        hasHoldings: nudgeHoldings.length > 0,
        hasHoldingsWithIsin: nudgeHoldings.some((h: { isin: string | null }) => h.isin !== null && h.isin !== ''),
        hasGoals: (nudgeGoalsRes.data?.length ?? 0) > 0,
        hasLifeEvents: nudgeLifeEvents.length > 0,
        hasFireParams: profile?.expected_return != null || profile?.inflation_rate != null,
        activeModules: (profile?.active_modules as ModuleId[]) ?? [],
        dismissedNudgeIds: new Set(readIds.filter((id: string) => id.startsWith('nudge_'))),
      }

      const activeNudges = getActiveNudges(nudgeState, nudgeOverrides)
      nudgeNotifications = activeNudges.map((nudge) => ({
        id: `nudge_${nudge.key}`,
        type: 'module_nudge' as NotificationType,
        priority: nudge.priority,
        title: nudge.title,
        description: nudge.description,
        icon: nudge.icon,
        color: 'amber',
        createdAt: new Date().toISOString(),
        read: false,
        actionUrl: nudge.href,
        metadata: { moduleId: nudge.moduleId },
      }))
    } catch (err) {
      console.error('Module nudge notification error:', err)
    }

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

    // Persist full 30-day history
    await supabase
      .from('app_settings')
      .upsert(
        {
          key: `notifications_history_${user.id}`,
          value: JSON.stringify(history),
        },
        { onConflict: 'key' }
      )

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
      unreadCount: filtered.filter((n) => !n.read).length + nudgeNotifications.length,
      nudges: nudgeNotifications,
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

    const validTypes = ['budget', 'sync', 'recommendation', 'levelup', 'partner_transaction', 'horizon', 'holding_alert', 'module_nudge', 'briefing']
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

