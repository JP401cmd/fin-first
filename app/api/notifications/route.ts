import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { shouldAlert } from '@/lib/budget-alerts'

// ── Types ────────────────────────────────────────────────────────────

export type NotificationType =
  | 'budget'
  | 'streak'
  | 'sync'
  | 'recommendation'
  | 'insight'
  | 'badge'
  | 'levelup'
  | 'partner_transaction'

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
      budget: true, streak: true, sync: true,
      recommendation: true, insight: true, badge: true, levelup: true,
      partner_transaction: true,
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
        .select('budget_id, amount')
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
          .filter((t) => t.budget_id === budgetId)
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
      .from('gocardless_accounts')
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
              .select('id, description, amount, date, budget_id, ownership')
              .eq('user_id', partnerMember.user_id)
              .gte('date', cutoffDate.toISOString().split('T')[0])
              .order('date', { ascending: false })
              .limit(50)

            // Also get shared transactions by current user's partner
            const { data: sharedTxs } = await supabase
              .from('transactions')
              .select('id, description, amount, date, budget_id, ownership')
              .eq('ownership', 'shared')
              .eq('user_id', partnerMember.user_id)
              .gte('date', cutoffDate.toISOString().split('T')[0])
              .order('date', { ascending: false })
              .limit(50)

            // Merge and deduplicate
            const allPartnerTxs = [...(partnerTxs || []), ...(sharedTxs || [])]
            const seenTxIds = new Set<string>()
            const uniquePartnerTxs = allPartnerTxs.filter(tx => {
              if (seenTxIds.has(tx.id)) return false
              seenTxIds.add(tx.id)
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

            // Compute daily expenses for freedom time calculation
            const dailyExpenses = monthEnd && monthStart
              ? (() => {
                  const totalExpenses = (txRes.data ?? [])
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
              const categoryLabel = budgetName ? ` · ${budgetName}` : ''
              const freedomLabel = freedomDays > 0 ? ` · ${freedomDays} ${freedomDays === 1 ? 'vrijheidsdag' : 'vrijheidsdagen'}` : ''

              notifications.push({
                id,
                type: 'partner_transaction',
                priority: 3,
                title: `Partner transactie: €${amount.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`,
                description: `${tx.description || 'Transactie'}${categoryLabel}${freedomLabel}`,
                icon: 'HandCoins',
                color: 'teal',
                createdAt: tx.date ? new Date(tx.date).toISOString() : now,
                read: readIds.includes(id),
                actionUrl: '/core/cash',
                aiContext: `Mijn partner heeft een transactie gedaan van €${amount.toFixed(2)}${budgetName ? ` in categorie ${budgetName}` : ''}. Wat is de impact op ons huishoudbudget?`,
                metadata: { amount, category: budgetName, freedomDays, isShared },
              })
            }
          }
        }
      }
    } catch (err) {
      console.error('Partner transaction notification error:', err)
      // Non-critical — continue without partner notifications
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

    // Return only entries within requested `days` window
    const returnHistory = history.filter((h) => h.createdAt >= returnCutoff)

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

    const validTypes = ['budget', 'streak', 'sync', 'recommendation', 'insight', 'badge', 'levelup', 'partner_transaction']
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

