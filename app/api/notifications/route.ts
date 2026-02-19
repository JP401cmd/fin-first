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

    // ── 2. Streak warnings ───────────────────────────────────────────

    const { data: streakData } = await supabase
      .from('user_streaks')
      .select('streak_type, current_count, last_activity_date')
      .eq('user_id', user.id)

    if (streakData) {
      const today = new Date()
      const currentWeek = getISOWeek(today)
      const currentYear = getISOWeekYear(today)

      for (const streak of streakData) {
        if (!streak.last_activity_date || streak.current_count < 2) continue

        const lastDate = new Date(streak.last_activity_date)
        const lastWeek = getISOWeek(lastDate)
        const lastYear = getISOWeekYear(lastDate)

        const isLastWeek =
          (currentYear === lastYear && currentWeek - lastWeek === 1) ||
          (currentYear === lastYear + 1 &&
            lastWeek >= 52 &&
            currentWeek === 1)

        if (!isLastWeek) continue

        const typeLabels: Record<string, string> = {
          login: 'Login',
          budget_compliance: 'Budget',
          action_completion: 'Actie',
        }
        const label = typeLabels[streak.streak_type] || streak.streak_type
        const id = `streak_${streak.streak_type}`

        notifications.push({
          id,
          type: 'streak',
          priority: 2,
          title: `${label} streak in gevaar!`,
          description: `Je ${streak.current_count}-weekse streak loopt af als je deze week niets doet`,
          icon: 'Flame',
          color: 'orange',
          createdAt: now,
          read: readIds.includes(id),
          actionUrl: '/dashboard',
          aiContext: `Mijn ${label.toLowerCase()} streak van ${streak.current_count} weken staat op het spel. Hoe kan ik deze behouden?`,
        })
      }
    }

    // ── 3. Unnotified badges ─────────────────────────────────────────

    const { data: unnotifiedBadges } = await supabase
      .from('user_badges')
      .select('badge_slug, earned_at')
      .eq('user_id', user.id)
      .eq('notified', false)

    if (unnotifiedBadges && unnotifiedBadges.length > 0) {
      const { data: badgeDefs } = await supabase
        .from('badge_definitions')
        .select('slug, name, description, icon, color, category')
        .in(
          'slug',
          unnotifiedBadges.map((b) => b.badge_slug)
        )

      for (const ub of unnotifiedBadges) {
        const def = badgeDefs?.find((d) => d.slug === ub.badge_slug)
        if (!def) continue

        const id = `badge_${ub.badge_slug}`
        notifications.push({
          id,
          type: 'badge',
          priority: 6,
          title: `Badge verdiend: ${def.name}`,
          description: def.description || 'Je hebt een nieuwe badge verdiend!',
          icon: 'Trophy',
          color: 'amber',
          createdAt: ub.earned_at || now,
          read: readIds.includes(id),
          actionUrl: '/identity',
          aiContext: `Ik heb de badge '${def.name}' verdiend! Wat betekent dit voor mijn financiële pad?`,
        })
      }
    } else {
      // Fallback to app_settings
      const { data: badgeSettings } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', `earned_badges_${user.id}`)
        .maybeSingle()

      if (badgeSettings?.value) {
        try {
          const badges = JSON.parse(badgeSettings.value) as Array<{
            slug: string
            earned_at: string
            notified: boolean
          }>
          const unnotified = badges.filter((b) => !b.notified)
          for (const badge of unnotified) {
            const id = `badge_${badge.slug}`
            notifications.push({
              id,
              type: 'badge',
              priority: 6,
              title: `Badge verdiend: ${badge.slug}`,
              description: 'Je hebt een nieuwe badge verdiend!',
              icon: 'Trophy',
              color: 'amber',
              createdAt: badge.earned_at || now,
              read: readIds.includes(id),
              actionUrl: '/identity',
              aiContext: `Ik heb de badge '${badge.slug}' verdiend! Wat betekent dit voor mijn financiële pad?`,
            })
          }
        } catch {
          // Invalid JSON — skip
        }
      }
    }

    // Sort by priority (lower = higher priority)
    notifications.sort((a, b) => a.priority - b.priority)

    // Filter out disabled notification types based on user preferences
    const filtered = notifications.filter(n => prefs[n.type] !== false)

    // ── Merge into history ───────────────────────────────────────────
    // Store current notifications in history for the modal to display
    // Keep only entries from the last 7 days

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const cutoff = sevenDaysAgo.toISOString()

    // Start from stored history, prune old entries
    let history = storedHistory.filter((h) => h.createdAt >= cutoff)

    // Merge current notifications into history (upsert by id)
    const historyIds = new Set(history.map((h) => h.id))
    for (const n of filtered) {
      if (historyIds.has(n.id)) {
        // Update existing entry with fresh data
        history = history.map((h) =>
          h.id === n.id ? { ...n, createdAt: h.createdAt } : h
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

    // Persist updated history (fire and forget)
    supabase
      .from('app_settings')
      .upsert(
        {
          key: `notifications_history_${user.id}`,
          value: JSON.stringify(history),
        },
        { onConflict: 'key' }
      )
      .then(() => {})

    return NextResponse.json({
      notifications: filtered,
      history,
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

    const validTypes = ['budget', 'streak', 'sync', 'recommendation', 'insight', 'badge', 'levelup']
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

// ── ISO week helpers ─────────────────────────────────────────────────

function getISOWeek(date: Date): number {
  const d = new Date(date.getTime())
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7
    )
  )
}

function getISOWeekYear(date: Date): number {
  const d = new Date(date.getTime())
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  return d.getFullYear()
}
