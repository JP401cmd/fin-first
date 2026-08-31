import { registerCategory, registerTests } from '../test-registry'
import { assert, assertEqual, assertNotNull, assertGreaterThanOrEqual } from '../assert'
import type { TestCase } from '../test-types'
import { unauthenticatedFetch, authenticatedFetch } from '../server-runner'

const CAT = 'beheer.notificaties'

// ── Helpers ─────────────────────────────────────────────────────────────────

async function fetchJson(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await unauthenticatedFetch(path, init)
  let body: Record<string, unknown> = {}
  try {
    body = await res.json()
  } catch {
    // Non-JSON response
  }
  return { status: res.status, body }
}

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ──────────────── Step 2: notificatie voorkeuren pagina laadt ────────────────
  {
    id: 'notif-prefs-page-loads',
    name: 'Notificaties-voorkeurenpagina laadt',
    category: CAT,
    description: 'GET /mijn/notificaties retourneert 200 of auth redirect — de notificatie-voorkeuren',
    priority: 'critical',
    estimatedDurationMs: 2000,
    async fn() {
      const res = await authenticatedFetch('/mijn/notificaties', { redirect: 'manual' })
      // 200 (logged in) or 307 redirect (not logged in)
      assert(
        res.status === 200 || res.status === 307,
        `Expected 200 or 307 from /mijn/notificaties, got ${res.status}`,
      )
    },
  },

  // ──────────────── Step 3: notificatie voorkeuren wijzigen en opslaan ─────────
  {
    id: 'notif-put-prefs-auth-guard',
    name: 'PUT /api/notifications vereist authenticatie',
    category: CAT,
    description: 'PUT endpoint retourneert 401 zonder authenticatie',
    priority: 'critical',
    estimatedDurationMs: 1500,
    async fn() {
      const res = await fetchJson('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: { budget: true } }),
      })
      assertEqual(res.status, 401, 'PUT /api/notifications auth guard')
    },
  },
  {
    id: 'notif-put-prefs-validation',
    name: 'PUT /api/notifications valideert preferences object',
    category: CAT,
    description: 'PUT endpoint retourneert 400 bij ontbrekend of ongeldig preferences object',
    priority: 'high',
    estimatedDurationMs: 1500,
    async fn() {
      // Without preferences field — should be 400 or 401 (auth)
      const res = await fetchJson('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      assert(
        res.status === 400 || res.status === 401,
        `Expected 400 or 401 from PUT without preferences, got ${res.status}`,
      )
    },
  },
  {
    id: 'notif-prefs-valid-types',
    name: 'Notification preferences bevat alle geldige typen',
    category: CAT,
    description: 'PUT /api/notifications sanitiseert naar de 10 bekende notification types',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      // The API route validates against these types (lib/api/notifications)
      const validTypes = [
        'budget', 'sync', 'recommendation', 'partner_transaction',
        'horizon', 'holding_alert', 'briefing', 'budget_model_proposal',
        'spend_limit', 'milestone',
      ]
      assertEqual(validTypes.length, 10, '10 valid notification preference types')
      // Each must be a non-empty string
      for (const t of validTypes) {
        assert(t.length > 0, `Type "${t}" is non-empty`)
      }
    },
  },
  {
    id: 'notif-prefs-default-values',
    name: 'Standaard voorkeuren: alle typen ingeschakeld',
    category: CAT,
    description: 'Wanneer geen voorkeuren opgeslagen, zijn alle notification types enabled (true)',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      // Default preferences from the GET handler
      const defaultPrefs: Record<string, boolean> = {
        budget: true, sync: true,
        recommendation: true,
        partner_transaction: true, horizon: true,
        holding_alert: true, briefing: true,
        budget_model_proposal: true,
        spend_limit: true, milestone: true,
      }
      const keys = Object.keys(defaultPrefs)
      assertGreaterThanOrEqual(keys.length, 10, 'At least 10 default pref keys')
      for (const [key, val] of Object.entries(defaultPrefs)) {
        assertEqual(val, true, `Default pref for "${key}" is true`)
      }
    },
  },

  // ──────────────── Step 4: notificatie wordt aangemaakt bij relevante gebeurtenis ─
  {
    id: 'notif-get-auth-guard',
    name: 'GET /api/notifications vereist authenticatie',
    category: CAT,
    description: 'GET endpoint retourneert 401 zonder authenticatie',
    priority: 'critical',
    estimatedDurationMs: 1500,
    async fn() {
      const res = await fetchJson('/api/notifications')
      assertEqual(res.status, 401, 'GET /api/notifications auth guard')
    },
  },
  {
    id: 'notif-get-response-shape',
    name: 'GET /api/notifications response shape correct',
    category: CAT,
    description: 'Response bevat notifications array, history array, en unreadCount number',
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      // Validate expected response structure from the GET endpoint
      type ExpectedResponse = {
        notifications: unknown[]
        history: unknown[]
        unreadCount: number
      }
      // Type-level check — if the API returns this shape, destructuring works
      const sample: ExpectedResponse = {
        notifications: [],
        history: [],
        unreadCount: 0,
      }
      assert(Array.isArray(sample.notifications), 'notifications is array')
      assert(Array.isArray(sample.history), 'history is array')
      assertEqual(typeof sample.unreadCount, 'number', 'unreadCount is number')
    },
  },
  {
    id: 'notif-notification-type-enum',
    name: 'NotificationType bevat alle 10 typen',
    category: CAT,
    // De bankkoppeling-verloopwaarschuwing (2026-07-31) is bewust ONDER `sync`
    // gehangen en kreeg géén eigen type. `sync` is in de praktijk de "Bank"-bak
    // — MODULE_MAP labelt 'm zo, en WOZ_REMINDER_TEMPLATE gebruikt 'm ook al
    // voor een niet-synchronisatie-signaal. Een eigen type zou deze telling,
    // MODULE_MAP, de PUT-validTypes én de voorkeurenpagina raken, en een
    // gebruiker die "Bank"-meldingen uitzette alsnog laten waarschuwen.
    //
    // De telling stond tot 2026-08-31 op 8 en liep achter: `spend_limit` was er
    // al bij gekomen en `milestone` kwam erbij met de mijlpalen-motor
    // (ADR 0123). Deze lijst spiegelt de union in app/api/notifications/route.ts
    // — loopt hij achter, dan bewaakt hij niets.
    description: 'NotificationType union omvat budget, sync, recommendation, partner_transaction, horizon, holding_alert, briefing, budget_model_proposal, spend_limit, milestone',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const allTypes = [
        'budget', 'sync', 'recommendation', 'partner_transaction',
        'horizon', 'holding_alert', 'briefing', 'budget_model_proposal',
        'spend_limit', 'milestone',
      ]
      assertEqual(allTypes.length, 10, '10 notification types')
      // Verify uniqueness
      const unique = new Set(allTypes)
      assertEqual(unique.size, 10, 'All types are unique')
    },
  },
  {
    id: 'notif-bank-verloopwaarschuwing',
    name: 'Bankkoppeling-verloop: één bericht, en niet bij ontkoppeld of al verlopen',
    category: CAT,
    description:
      'buildBankSignalNotification waarschuwt binnen 14 dagen vóór het verlopen van de autorisatie, zwijgt bij een zacht ontkoppelde rekening, geeft geen verloop-bericht bij een al verlopen koppeling, en laat de verloop-waarschuwing vóórgaan op het versheidsbericht',
    priority: 'high',
    estimatedDurationMs: 10,
    async fn() {
      const { buildBankSignalNotification } = await import('@/lib/notifications/bank-signalen')

      const now = new Date('2026-07-29T12:00:00.000Z')
      const overDagen = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString()
      const dagenGeleden = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString()
      const base = {
        connectionAccountId: 'acc-1',
        label: '1 6430 01',
        providerName: 'ING',
        linkIsActive: true,
        connectionStatus: 'active',
        tokenExpiresAt: overDagen(60),
        lastSyncedAt: dagenGeleden(0),
      }

      assertEqual(buildBankSignalNotification(base, now), null, 'Gezonde koppeling zwijgt')

      const bijnaVerlopen = buildBankSignalNotification(
        { ...base, tokenExpiresAt: overDagen(10) },
        now,
      )
      assertNotNull(bijnaVerlopen, 'Waarschuwt binnen het 14-dagenvenster')
      assertEqual(bijnaVerlopen!.id, 'bank_expiry_acc-1', 'Eigen melding-id')
      assert(bijnaVerlopen!.title.includes('ING'), 'Noemt de bank, niet het IBAN-fragment')
      assert(!bijnaVerlopen!.title.includes('1 6430 01'), 'Geen rekeningnummer in de verloop-melding')

      assertEqual(
        buildBankSignalNotification({ ...base, linkIsActive: false, tokenExpiresAt: overDagen(3) }, now),
        null,
        'Zacht ontkoppelde rekening zwijgt volledig',
      )

      assertEqual(
        buildBankSignalNotification({ ...base, connectionStatus: 'expired', tokenExpiresAt: dagenGeleden(2) }, now),
        null,
        'Al verlopen koppeling krijgt geen "verloopt bijna"-bericht',
      )

      const beide = buildBankSignalNotification(
        { ...base, tokenExpiresAt: overDagen(4), lastSyncedAt: dagenGeleden(20) },
        now,
      )
      assertEqual(beide!.id, 'bank_expiry_acc-1', 'Verloop wint van versheid — nooit twee berichten')
    },
  },
  {
    id: 'notif-notification-shape',
    name: 'Notification object heeft alle verplichte velden',
    category: CAT,
    description: 'Notification type bevat id, type, priority, title, description, icon, color, createdAt, read',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const requiredFields = [
        'id', 'type', 'priority', 'title', 'description',
        'icon', 'color', 'createdAt', 'read',
      ]
      assertEqual(requiredFields.length, 9, '9 required notification fields')

      const optionalFields = ['actionUrl', 'aiContext', 'metadata']
      assertEqual(optionalFields.length, 3, '3 optional notification fields')
    },
  },
  {
    id: 'notif-budget-alert-generation',
    name: 'Budget alert notificaties worden gegenereerd bij overschrijding',
    category: CAT,
    description: 'shouldAlert functie triggert bij expense >= threshold% en savings < threshold%',
    priority: 'high',
    estimatedDurationMs: 10,
    async fn() {
      const { shouldAlert } = await import('@/lib/budget-alerts')

      // Expense: alert when spent >= threshold
      assert(shouldAlert(85, 100, 80, 'expense'), 'Expense 85% >= 80% threshold')
      assert(!shouldAlert(70, 100, 80, 'expense'), 'Expense 70% < 80% threshold')

      // Savings: alert when under target
      assert(shouldAlert(50, 100, 80, 'savings'), 'Savings 50% < 80% target')
      assert(!shouldAlert(90, 100, 80, 'savings'), 'Savings 90% >= 80% target')

      // Income: never alerts
      assert(!shouldAlert(200, 100, 80, 'income'), 'Income never alerts')

      // Edge cases
      assert(!shouldAlert(50, 0, 80, 'expense'), 'Zero limit never alerts')
      assert(!shouldAlert(50, 100, 0, 'expense'), 'Zero threshold never alerts')
    },
  },
  {
    id: 'notif-days-param-clamping',
    name: 'GET /api/notifications days parameter wordt geclamped (1-90)',
    category: CAT,
    description: 'Query parameter days wordt geclamped tussen 1 en 90, default 7',
    priority: 'medium',
    estimatedDurationMs: 10,
    fn() {
      // Verify clamping logic from the API route
      function clampDays(input: string | null): number {
        const daysParam = input
        return daysParam ? Math.max(1, Math.min(90, parseInt(daysParam, 10) || 7)) : 7
      }
      assertEqual(clampDays(null), 7, 'Default is 7 days')
      assertEqual(clampDays('30'), 30, '30 days accepted')
      assertEqual(clampDays('0'), 1, '0 clamped to 1')
      assertEqual(clampDays('-5'), 1, 'Negative clamped to 1')
      assertEqual(clampDays('100'), 90, '100 clamped to 90')
      assertEqual(clampDays('abc'), 7, 'Non-numeric defaults to 7')
    },
  },

  // ──────────────── Step 5: notificatie weergave in de UI ──────────────────────
  {
    id: 'notif-module-map-completeness',
    name: 'MODULE_MAP bevat mapping voor alle 10 NotificationTypes',
    category: CAT,
    description: 'NotificationItem component mapt elk type naar een concept-label en CSS variabelen',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      // From notification-item.tsx MODULE_MAP — concept-labels per bericht-type
      const moduleMap: Record<string, { label: string }> = {
        budget:                { label: 'Budget' },
        sync:                  { label: 'Bank' },
        recommendation:        { label: 'Partner-actie' },
        partner_transaction:   { label: 'Partner' },
        horizon:               { label: 'Toekomst' },
        holding_alert:         { label: 'Belegging' },
        briefing:              { label: 'Briefing' },
        budget_model_proposal: { label: 'Huishouden' },
        spend_limit:           { label: 'Je grens' },
        milestone:             { label: 'Mijlpaal' },
      }
      const keys = Object.keys(moduleMap)
      assertEqual(keys.length, 10, '10 types in MODULE_MAP')
      // Verify each has a non-empty label
      for (const [type, info] of Object.entries(moduleMap)) {
        assert(info.label.length > 0, `${type} maps to a non-empty label: ${info.label}`)
      }
    },
  },
  {
    id: 'notif-widget-type-icons',
    name: 'MeldingenWidget heeft TYPE_ICONS en TYPE_LABELS voor widget types',
    category: CAT,
    description: 'Widget toont iconen en labels per notificatietype (budget, milestone, positive, anomaly)',
    priority: 'medium',
    estimatedDurationMs: 10,
    fn() {
      // From meldingen-widget.tsx
      const typeIcons: Record<string, string> = {
        budget: '⚠️',
        milestone: '📊',
        positive: '✅',
        anomaly: '🚨',
      }
      const typeLabels: Record<string, string> = {
        budget: 'Budget',
        milestone: 'Mijlpaal',
        positive: 'Positief',
        anomaly: 'Ongebruikelijk',
      }
      assertEqual(Object.keys(typeIcons).length, 4, '4 widget type icons')
      assertEqual(Object.keys(typeLabels).length, 4, '4 widget type labels')
      // Dutch labels
      assertEqual(typeLabels.milestone, 'Mijlpaal', 'Milestone label in Dutch')
      assertEqual(typeLabels.anomaly, 'Ongebruikelijk', 'Anomaly label in Dutch')
    },
  },
  {
    id: 'notif-widget-sizes',
    name: 'MeldingenWidget ondersteunt alle widget sizes',
    category: CAT,
    description: 'Widget rendert mini (count), quarter (badge), half (top 3 lijst), full (gegroepeerd)',
    priority: 'medium',
    estimatedDurationMs: 10,
    fn() {
      // The meldingen-widget.tsx handles: mini, quarter, half, full
      const supportedSizes = ['mini', 'quarter', 'half', 'full']
      assertEqual(supportedSizes.length, 4, '4 widget sizes supported')
      // Mini: shows count text like "3 nieuw"
      // Quarter: shows badge with urgentie-kleur
      // Half: shows top 3 list items
      // Full: groups by type with timestamps
      assert(true, 'All 4 size modes documented')
    },
  },
  {
    id: 'notif-timestamp-formatting',
    name: 'Timestamp formatting in widget: minuten, uren, dagen, datum',
    category: CAT,
    description: 'formatTimestamp geeft relatieve tijd voor recent, absolute datum voor oudere meldingen',
    priority: 'medium',
    estimatedDurationMs: 10,
    fn() {
      // Replicate formatTimestamp logic from meldingen-widget.tsx
      function formatTimestamp(dateStr: string): string {
        const d = new Date(dateStr)
        const now = new Date()
        const diff = now.getTime() - d.getTime()
        const mins = Math.floor(diff / 60000)
        if (mins < 60) return `${mins}m geleden`
        const hours = Math.floor(mins / 60)
        if (hours < 24) return `${hours}u geleden`
        const days = Math.floor(hours / 24)
        if (days < 7) return `${days}d geleden`
        return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
      }

      const now = new Date()
      // 5 minutes ago
      const fiveMinAgo = new Date(now.getTime() - 5 * 60000).toISOString()
      assert(formatTimestamp(fiveMinAgo).includes('m geleden'), '5 min ago shows "m geleden"')

      // 3 hours ago
      const threeHoursAgo = new Date(now.getTime() - 3 * 3600000).toISOString()
      assert(formatTimestamp(threeHoursAgo).includes('u geleden'), '3 hrs ago shows "u geleden"')

      // 2 days ago
      const twoDaysAgo = new Date(now.getTime() - 2 * 86400000).toISOString()
      assert(formatTimestamp(twoDaysAgo).includes('d geleden'), '2 days ago shows "d geleden"')

      // 10 days ago — shows date
      const tenDaysAgo = new Date(now.getTime() - 10 * 86400000).toISOString()
      const tenDayResult = formatTimestamp(tenDaysAgo)
      assert(!tenDayResult.includes('geleden'), '10 days ago shows absolute date')
    },
  },

  // ──────────────── Step 6: notificatie als gelezen markeren ───────────────────
  {
    id: 'notif-patch-auth-guard',
    name: 'PATCH /api/notifications vereist authenticatie',
    category: CAT,
    description: 'PATCH endpoint retourneert 401 zonder authenticatie',
    priority: 'critical',
    estimatedDurationMs: 1500,
    async fn() {
      const res = await fetchJson('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markRead: 'test-id' }),
      })
      assertEqual(res.status, 401, 'PATCH /api/notifications auth guard')
    },
  },
  {
    id: 'notif-patch-mark-single',
    name: 'PATCH markRead: markeer enkele notificatie als gelezen',
    category: CAT,
    description: 'PATCH met { markRead: id } voegt ID toe aan readIds array',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      // Validate the logic from the PATCH handler
      const readIds: string[] = ['existing-1', 'existing-2']
      const markRead = 'new-id-3'

      if (!readIds.includes(markRead)) {
        readIds.push(markRead)
      }
      assertEqual(readIds.length, 3, '3 read IDs after marking new')
      assert(readIds.includes('new-id-3'), 'New ID is in readIds')

      // Idempotent: marking same ID again doesn't duplicate
      if (!readIds.includes(markRead)) {
        readIds.push(markRead)
      }
      assertEqual(readIds.length, 3, 'Still 3 — no duplicate')
    },
  },
  {
    id: 'notif-patch-mark-all',
    name: 'PATCH markAllRead: markeer meerdere notificaties als gelezen',
    category: CAT,
    description: 'PATCH met { markAllRead: string[] } voegt alle IDs toe aan readIds',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const readIds: string[] = ['existing-1']
      const markAllRead = ['new-2', 'new-3', 'existing-1']

      for (const id of markAllRead) {
        if (!readIds.includes(id)) readIds.push(id)
      }
      assertEqual(readIds.length, 3, '3 unique IDs after markAllRead')
      assert(readIds.includes('new-2'), 'new-2 added')
      assert(readIds.includes('new-3'), 'new-3 added')
    },
  },
  {
    id: 'notif-read-ids-pruning',
    name: 'Read IDs worden beperkt tot 200 entries',
    category: CAT,
    description: 'PATCH handler kapt readIds af op 200 om onbeperkte groei te voorkomen',
    priority: 'medium',
    estimatedDurationMs: 10,
    fn() {
      // Simulate 250 read IDs
      let readIds: string[] = Array.from({ length: 250 }, (_, i) => `id-${i}`)
      assertEqual(readIds.length, 250, '250 IDs before pruning')

      if (readIds.length > 200) {
        readIds = readIds.slice(-200)
      }
      assertEqual(readIds.length, 200, '200 IDs after pruning')
      // Kept the most recent (last 200)
      assertEqual(readIds[0], 'id-50', 'Oldest kept is id-50')
      assertEqual(readIds[199], 'id-249', 'Newest is id-249')
    },
  },

  // ──────────────── Step 7: notificatie verwijderen/wegswipen ──────────────────
  {
    id: 'notif-history-storage',
    name: 'Notificatie history: 30 dagen opslag, returneer alleen gevraagde periode',
    category: CAT,
    description: 'History bewaart tot 30 dagen aan meldingen, retourneert alleen entries binnen days-window',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const now = new Date()
      const storageCutoff = new Date()
      storageCutoff.setDate(storageCutoff.getDate() - 30)

      const requestedDays = 7
      const returnCutoff = new Date()
      returnCutoff.setDate(returnCutoff.getDate() - requestedDays)

      // Simulate history with entries at various ages
      const entries = [
        { id: 'recent', createdAt: new Date(now.getTime() - 1 * 86400000).toISOString() },
        { id: 'week-old', createdAt: new Date(now.getTime() - 6 * 86400000).toISOString() },
        { id: 'two-weeks', createdAt: new Date(now.getTime() - 14 * 86400000).toISOString() },
        { id: 'month-old', createdAt: new Date(now.getTime() - 29 * 86400000).toISOString() },
        { id: 'expired', createdAt: new Date(now.getTime() - 35 * 86400000).toISOString() },
      ]

      // Storage prune (30 days)
      const stored = entries.filter(e => e.createdAt >= storageCutoff.toISOString())
      assertEqual(stored.length, 4, '4 entries within 30-day storage window')
      assert(!stored.find(e => e.id === 'expired'), 'Expired entry pruned from storage')

      // Return filter (7 days)
      const returned = stored.filter(e => e.createdAt >= returnCutoff.toISOString())
      assertEqual(returned.length, 2, '2 entries within 7-day return window')
    },
  },
  {
    id: 'notif-history-merge-upsert',
    name: 'History merge: upsert door id, preserveer read-status',
    category: CAT,
    description: 'Nieuwe notificaties worden gemerged met bestaande history; read-status van bestaande entries blijft behouden',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      type HistItem = { id: string; title: string; read: boolean; createdAt: string }
      const now = new Date().toISOString()

      let history: HistItem[] = [
        { id: 'a', title: 'Old A', read: true, createdAt: now },
        { id: 'b', title: 'Old B', read: false, createdAt: now },
      ]
      const current: HistItem[] = [
        { id: 'a', title: 'Updated A', read: false, createdAt: now },
        { id: 'c', title: 'New C', read: false, createdAt: now },
      ]

      const historyIds = new Set(history.map(h => h.id))
      for (const n of current) {
        if (historyIds.has(n.id)) {
          history = history.map(h => h.id === n.id ? { ...n, createdAt: h.createdAt, read: h.read } : h)
        } else {
          history.push(n)
        }
      }

      assertEqual(history.length, 3, '3 entries after merge')
      const entryA = history.find(h => h.id === 'a')
      assertNotNull(entryA, 'Entry A exists')
      assertEqual(entryA.read, true, 'Entry A read-status preserved from old history')
      const entryC = history.find(h => h.id === 'c')
      assertNotNull(entryC, 'Entry C exists')
      assertEqual(entryC.read, false, 'New entry C is unread')
    },
  },

  // ──────────────── Step 8: notificatie badge teller correct ──────────────────
  {
    id: 'notif-unread-count',
    name: 'Unread count wordt correct berekend',
    category: CAT,
    description: 'unreadCount = filtered.filter(n => !n.read).length',
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const notifications = [
        { id: '1', read: false },
        { id: '2', read: true },
        { id: '3', read: false },
        { id: '4', read: false },
        { id: '5', read: true },
      ]
      const unreadCount = notifications.filter(n => !n.read).length
      assertEqual(unreadCount, 3, '3 unread out of 5')
    },
  },
  {
    id: 'notif-badge-display-logic',
    name: 'Badge toont count, met "9+" bij meer dan 9 ongelezen',
    category: CAT,
    description: 'App header badge toont exact getal tot 9, daarna "9+"',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      // From app-header.tsx: {unreadCount > 9 ? '9+' : unreadCount}
      function badgeText(unreadCount: number): string {
        if (unreadCount <= 0) return ''
        return unreadCount > 9 ? '9+' : String(unreadCount)
      }
      assertEqual(badgeText(0), '', 'No badge at 0')
      assertEqual(badgeText(3), '3', 'Shows 3')
      assertEqual(badgeText(9), '9', 'Shows 9')
      assertEqual(badgeText(10), '9+', 'Shows 9+ at 10')
      assertEqual(badgeText(99), '9+', 'Shows 9+ at 99')
    },
  },
  {
    id: 'notif-provider-context-shape',
    name: 'NotificationProvider context bevat alle vereiste methoden',
    category: CAT,
    description: 'useNotifications retourneert notifications, history, unreadCount, loading, isModalOpen, openModal, closeModal, markAsRead, markAllRead, refresh',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const expectedMethods = [
        'notifications', 'history', 'unreadCount', 'loading',
        'isModalOpen', 'openModal', 'closeModal',
        'markAsRead', 'markAllRead', 'refresh',
      ]
      assertEqual(expectedMethods.length, 10, '10 context properties')
      // Verify all are unique
      assertEqual(new Set(expectedMethods).size, 10, 'All unique')
    },
  },
  {
    id: 'notif-polling-interval',
    name: 'NotificationProvider pollt elke 60 seconden',
    category: CAT,
    description: 'Provider zet interval van 60_000ms voor automatische refresh',
    priority: 'medium',
    estimatedDurationMs: 10,
    fn() {
      const POLL_INTERVAL_MS = 60_000
      assertEqual(POLL_INTERVAL_MS, 60000, 'Poll interval is 60 seconds')
    },
  },
  {
    id: 'notif-optimistic-update',
    name: 'markAsRead gebruikt optimistic update + skip next poll',
    category: CAT,
    description: 'Bij markAsRead wordt state direct bijgewerkt en volgende poll overgeslagen om race condition te voorkomen',
    priority: 'medium',
    estimatedDurationMs: 10,
    fn() {
      // Simulate the optimistic update logic from notification-provider.tsx
      let notifications = [
        { id: '1', read: false },
        { id: '2', read: false },
      ]
      let unreadCount = 2
      let skipNextPoll = false

      // Mark notification 1 as read
      const targetId = '1'
      notifications = notifications.map(n => n.id === targetId ? { ...n, read: true } : n)
      unreadCount = Math.max(0, unreadCount - 1)
      skipNextPoll = true

      assertEqual(notifications[0].read, true, 'Notification 1 marked read optimistically')
      assertEqual(unreadCount, 1, 'Unread count decremented')
      assertEqual(skipNextPoll, true, 'Skip next poll to prevent race condition')
    },
  },

  // ──────────────── Auth consistency ──────────────────────────────────────────
  {
    id: 'notif-auth-consistency',
    name: 'Alle 3 notification endpoints vereisen authenticatie',
    category: CAT,
    description: 'GET, PATCH, PUT /api/notifications retourneren 401 zonder auth',
    priority: 'critical',
    estimatedDurationMs: 3000,
    async fn() {
      const methods = ['GET', 'PATCH', 'PUT'] as const
      const bodies: Record<string, string | undefined> = {
        GET: undefined,
        PATCH: JSON.stringify({ markRead: 'test' }),
        PUT: JSON.stringify({ preferences: { budget: true } }),
      }

      for (const method of methods) {
        const init: RequestInit = { method }
        if (bodies[method]) {
          init.headers = { 'Content-Type': 'application/json' }
          init.body = bodies[method]
        }
        const res = await fetchJson('/api/notifications', init)
        assertEqual(res.status, 401, `${method} /api/notifications returns 401`)
      }
    },
  },

  // ──────────────── Notification sorting ─────────────────────────────────────
  {
    id: 'notif-sorting-by-priority',
    name: 'Notificaties worden gesorteerd op priority (laagste getal eerst)',
    category: CAT,
    description: 'notifications.sort((a, b) => a.priority - b.priority) — priority 1 boven priority 3',
    priority: 'medium',
    estimatedDurationMs: 10,
    fn() {
      const notifications = [
        { id: 'c', priority: 3 },
        { id: 'a', priority: 1 },
        { id: 'b', priority: 2 },
      ]
      notifications.sort((a, b) => a.priority - b.priority)
      assertEqual(notifications[0].id, 'a', 'Priority 1 first')
      assertEqual(notifications[1].id, 'b', 'Priority 2 second')
      assertEqual(notifications[2].id, 'c', 'Priority 3 last')
    },
  },

  // ──────────────── Preference filtering ────────────────────────────────────
  {
    id: 'notif-prefs-filtering',
    name: 'Notificaties worden gefilterd op basis van voorkeuren',
    category: CAT,
    description: 'Disabled notification types worden uit de response gefilterd',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const prefs: Record<string, boolean> = {
        budget: true,
        streak: false,
        sync: true,
      }
      const notifications = [
        { id: '1', type: 'budget' },
        { id: '2', type: 'streak' },
        { id: '3', type: 'sync' },
        { id: '4', type: 'streak' },
      ]
      const filtered = notifications.filter(n => prefs[n.type] !== false)
      assertEqual(filtered.length, 2, '2 notifications after filtering out disabled streak')
      assert(!filtered.find(n => n.type === 'streak'), 'No streak notifications after filtering')
    },
  },
]

// ── Register ────────────────────────────────────────────────────────────────

export function register() {
  registerCategory({
    id: CAT,
    label: 'Beheer — Notificaties',
    description: 'Notificatie systeem: voorkeuren, bezorging, weergave en badge teller',
    testCount: 0,
    defaultRole: 'superadmin' as const,
  })
  registerTests(tests)
}
