'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NOTIFICATION_TYPES } from '@/lib/identity-constants'
import { CalendarCheck, HandCoins } from 'lucide-react'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { PageInfoButton } from '@/components/editorial'
import { PAGE_INFO } from '@/lib/page-info-content'

type PartnerNotifMode = 'all_shared' | 'threshold' | 'categories' | 'disabled'

/**
 * /mijn/notificaties — geëxtraheerd uit het 1823-regel identity/instellingen
 * monster. Bevat alle notif-instellingen: push-types, partner-transactie-
 * meldingen (mode + drempel/categorie-picker) en de maandelijkse geld-
 * checkin-toggle.
 *
 * State is volledig lokaal (geen cross-tab koppeling). Endpoints zijn
 * ongewijzigd: /api/notifications, /api/partner-notifications, /api/monthly-checkin.
 */
export default function MijnNotificatiesPage() {
  const supabase = createClient()

  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({
    budget: true,
    sync: true,
    recommendation: true,
    insight: true,
    levelup: true,
    holding_alert: true,
  })
  const [notifLoading, setNotifLoading] = useState(true)
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifMessage, setNotifMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Partner-notif state
  const [partnerNotifMode, setPartnerNotifMode] = useState<PartnerNotifMode>('all_shared')
  const [partnerNotifThreshold, setPartnerNotifThreshold] = useState<string>('100')
  const [partnerNotifCategories, setPartnerNotifCategories] = useState<string[]>([])
  const [partnerNotifSaving, setPartnerNotifSaving] = useState(false)
  const [partnerNotifMessage, setPartnerNotifMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [partnerNotifSaved, setPartnerNotifSaved] = useState<{ mode: PartnerNotifMode; threshold: string; categories: string[] }>({ mode: 'all_shared', threshold: '100', categories: [] })
  const [userBudgetCategories, setUserBudgetCategories] = useState<{ id: string; name: string }[]>([])

  const [hasHousehold, setHasHousehold] = useState(false)
  const [checkinEnabled, setCheckinEnabled] = useState(true)
  const [checkinSaving, setCheckinSaving] = useState(false)

  // ─ Load alle data parallel ────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setNotifLoading(false)
        return
      }

      const [notifData, checkinRes, privacyRes] = await Promise.all([
        supabase
          .from('app_settings')
          .select('value')
          .eq('key', `notifications_preferences_${user.id}`)
          .maybeSingle(),
        fetch('/api/monthly-checkin'),
        fetch('/api/household/privacy'),
      ])

      // Notif prefs
      if (notifData.data?.value) {
        try {
          const parsed = JSON.parse(notifData.data.value)
          setNotifPrefs((prev) => ({ ...prev, ...parsed }))
        } catch {
          /* swallow parse-error, default state blijft */
        }
      }
      setNotifLoading(false)

      // Monthly checkin
      if (checkinRes.ok) {
        try {
          const data = await checkinRes.json()
          if (typeof data.enabled === 'boolean') setCheckinEnabled(data.enabled)
        } catch { /* default true */ }
      }

      // Partner-notif: alleen voor huishoudens
      if (privacyRes.ok) {
        try {
          const data = await privacyRes.json()
          if (data.hasHousehold) {
            setHasHousehold(true)
            try {
              const pnRes = await fetch('/api/partner-notifications')
              if (pnRes.ok) {
                const pn = await pnRes.json()
                if (pn.mode) {
                  const mode = pn.mode as PartnerNotifMode
                  const threshold = String(pn.threshold ?? 100)
                  const categories = Array.isArray(pn.categories) ? pn.categories : []
                  setPartnerNotifMode(mode)
                  setPartnerNotifThreshold(threshold)
                  setPartnerNotifCategories(categories)
                  setPartnerNotifSaved({ mode, threshold, categories: [...categories] })
                }
              }
            } catch { /* swallow */ }

            // Budgets voor categorie-picker
            const { data: budgets } = await supabase
              .from('budgets')
              .select('id, name')
              .eq('user_id', user.id)
              .order('name', { ascending: true })
            if (budgets) {
              setUserBudgetCategories(budgets.map((b) => ({ id: String(b.id), name: String(b.name) })))
            }
          }
        } catch { /* swallow */ }
      }
    }
    void load()
  }, [supabase])

  // ─ Handlers ───────────────────────────────────────────────────────────────
  const toggleNotifPref = useCallback((type: string) => {
    setNotifPrefs((prev) => ({ ...prev, [type]: !prev[type] }))
  }, [])

  const saveNotifPrefs = useCallback(async () => {
    setNotifSaving(true)
    setNotifMessage(null)
    try {
      const res = await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: notifPrefs }),
      })
      if (!res.ok) throw new Error('Save failed')
      setNotifMessage({ type: 'success', text: 'Opgeslagen!' })
      setTimeout(() => setNotifMessage(null), 3000)
    } catch {
      setNotifMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    }
    setNotifSaving(false)
  }, [notifPrefs])

  const savePartnerNotifPrefs = useCallback(async () => {
    setPartnerNotifSaving(true)
    setPartnerNotifMessage(null)
    try {
      const res = await fetch('/api/partner-notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: partnerNotifMode,
          threshold: Number(partnerNotifThreshold) || 100,
          categories: partnerNotifCategories,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      setPartnerNotifSaved({ mode: partnerNotifMode, threshold: partnerNotifThreshold, categories: [...partnerNotifCategories] })
      setPartnerNotifMessage({ type: 'success', text: 'Partner-notificaties opgeslagen!' })
      setTimeout(() => setPartnerNotifMessage(null), 3000)
    } catch {
      setPartnerNotifMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    }
    setPartnerNotifSaving(false)
  }, [partnerNotifMode, partnerNotifThreshold, partnerNotifCategories])

  const partnerNotifChanged =
    partnerNotifMode !== partnerNotifSaved.mode ||
    partnerNotifThreshold !== partnerNotifSaved.threshold ||
    JSON.stringify(partnerNotifCategories) !== JSON.stringify(partnerNotifSaved.categories)

  const togglePartnerCategory = useCallback((catId: string) => {
    setPartnerNotifCategories((prev) =>
      prev.includes(catId) ? prev.filter((c) => c !== catId) : [...prev, catId],
    )
  }, [])

  const toggleCheckin = useCallback(async () => {
    const newVal = !checkinEnabled
    setCheckinEnabled(newVal)
    setCheckinSaving(true)
    try {
      await fetch('/api/monthly-checkin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newVal }),
      })
    } catch {
      setCheckinEnabled(!newVal) // revert
    }
    setCheckinSaving(false)
  }, [checkinEnabled])

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
      <NavStackMeta title="Notificaties" bottomBar={{ kind: 'tabs' }} />

      <header className="relative mb-6 space-y-2">
        <PageInfoButton
          description={PAGE_INFO['/mijn/notificaties'] ?? ''}
          className="absolute right-0 top-0"
        />
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
          <span aria-hidden className="inline-block h-px w-7 shrink-0" style={{ background: 'var(--module-active-500)' }} />
          Mijn · notificaties
        </div>
        <h1 className="font-bold text-3xl tracking-[-0.02em]" style={{ fontFamily: 'var(--font-playfair, serif)' }}>
          Wat je hoort{' '}
          <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
            en wanneer
          </em>
        </h1>
        <p
          className="italic text-[14px] leading-snug text-[var(--ink-2)] pl-4 mt-2"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)', borderLeft: '2px solid var(--module-active-500)' }}
        >
          Stel in welke meldingen je wilt ontvangen — push-types, partner-transacties en maandelijkse geld-checkin.
        </p>
      </header>

      <section className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        <div className="px-4 sm:px-8 py-6">
          {notifLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-md)] border-t-zinc-900" />
            </div>
          ) : (
            <>
              <div className="divide-y divide-zinc-100 rounded-xl border border-[var(--border-ed)]">
                {NOTIFICATION_TYPES.map(({ type, label, description, icon: Icon }) => {
                  const enabled = notifPrefs[type] !== false
                  return (
                    <div key={type} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--ink-2)]">{label}</p>
                          <p className="text-xs text-[var(--ink-3)]">{description}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleNotifPref(type)}
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                          enabled ? 'bg-zinc-900' : 'bg-zinc-300'
                        }`}
                        aria-label={`${enabled ? 'Uit' : 'In'} schakelen: ${label}`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 rounded-full bg-[var(--paper)] transition-transform ${
                            enabled ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Monthly check-in toggle */}
              <div className="mt-4 rounded-xl border border-[var(--border-ed)]">
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <CalendarCheck className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--ink-2)]">Maandelijkse geldcheck-in</p>
                      <p className="text-xs text-[var(--ink-3)]">Herinnering om elke maand je financiën te checken</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleCheckin()}
                    disabled={checkinSaving}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      checkinEnabled ? 'bg-zinc-900' : 'bg-zinc-300'
                    } ${checkinSaving ? 'opacity-50' : ''}`}
                    aria-label={checkinEnabled ? 'Schakel geldcheck-in uit' : 'Schakel geldcheck-in in'}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-[var(--paper)] transition-transform ${
                        checkinEnabled ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Partner transacties — only when user has a household */}
              {hasHousehold && (
                <div id="partner-transacties" className="mt-5 rounded-xl border border-[var(--border-ed)] overflow-hidden scroll-mt-4">
                  <div className="flex items-center gap-3 px-4 py-3 bg-[var(--subtle)] border-b border-[var(--border-ed)]">
                    <HandCoins className="h-4 w-4 shrink-0 text-wil-600" />
                    <div>
                      <p className="text-sm font-semibold text-[var(--ink)]">Partner transacties</p>
                      <p className="text-xs text-[var(--ink-3)]">Meldingen over transacties van je partner</p>
                    </div>
                  </div>
                  <div className="px-4 py-4 space-y-4">
                    <div className="space-y-2">
                      {(
                        [
                          { mode: 'all_shared' as PartnerNotifMode, label: 'Alle gedeelde transacties', desc: 'Ontvang een melding bij elke gedeelde transactie' },
                          { mode: 'threshold' as PartnerNotifMode, label: 'Boven drempelbedrag', desc: 'Alleen transacties boven een bepaald bedrag' },
                          { mode: 'categories' as PartnerNotifMode, label: 'Geselecteerde categorieën', desc: 'Alleen transacties in bepaalde budgetcategorieën' },
                          { mode: 'disabled' as PartnerNotifMode, label: 'Uitgeschakeld', desc: 'Geen meldingen over partner transacties' },
                        ]
                      ).map((opt) => (
                        <button
                          key={opt.mode}
                          type="button"
                          onClick={() => setPartnerNotifMode(opt.mode)}
                          className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                            partnerNotifMode === opt.mode
                              ? 'bg-wil-50 border border-wil-300'
                              : 'border border-[var(--border-ed)] hover:bg-[var(--subtle)]'
                          }`}
                        >
                          <div
                            className={`mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                              partnerNotifMode === opt.mode ? 'border-wil-600' : 'border-[var(--border-md)]'
                            }`}
                          >
                            {partnerNotifMode === opt.mode && <div className="h-2 w-2 rounded-full bg-wil-600" />}
                          </div>
                          <div>
                            <p className={`text-sm font-medium ${partnerNotifMode === opt.mode ? 'text-wil-800' : 'text-[var(--ink-2)]'}`}>{opt.label}</p>
                            <p className="text-xs text-[var(--ink-3)]">{opt.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>

                    {partnerNotifMode === 'threshold' && (
                      <div className="rounded-lg border border-[var(--border-ed)] p-3 bg-[var(--subtle)]">
                        <label className="block text-xs font-medium text-[var(--ink-2)] mb-1.5">Drempelbedrag</label>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[var(--ink-3)]">€</span>
                          <input
                            type="number"
                            min="0"
                            step="10"
                            value={partnerNotifThreshold}
                            onChange={(e) => setPartnerNotifThreshold(e.target.value)}
                            className="w-28 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 text-sm font-mono tabular-nums text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-wil-400"
                          />
                          <span className="text-xs text-[var(--ink-3)]">of hoger</span>
                        </div>
                      </div>
                    )}

                    {partnerNotifMode === 'categories' && (
                      <div className="rounded-lg border border-[var(--border-ed)] p-3 bg-[var(--subtle)]">
                        <label className="block text-xs font-medium text-[var(--ink-2)] mb-2">Selecteer categorieën</label>
                        {userBudgetCategories.length > 0 ? (
                          <div className="space-y-1.5">
                            {userBudgetCategories.map((cat) => {
                              const checked = partnerNotifCategories.includes(cat.id)
                              return (
                                <button
                                  key={cat.id}
                                  type="button"
                                  onClick={() => togglePartnerCategory(cat.id)}
                                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                                    checked ? 'bg-wil-50 border border-wil-200' : 'border border-transparent hover:bg-[var(--paper)]'
                                  }`}
                                >
                                  <div
                                    className={`h-4 w-4 rounded border shrink-0 flex items-center justify-center ${
                                      checked ? 'bg-wil-600 border-wil-600' : 'border-[var(--border-md)] bg-[var(--paper)]'
                                    }`}
                                  >
                                    {checked && (
                                      <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                                        <path
                                          d="M2.5 6L5 8.5L9.5 3.5"
                                          stroke="currentColor"
                                          strokeWidth="1.5"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        />
                                      </svg>
                                    )}
                                  </div>
                                  <span className={`text-sm ${checked ? 'text-wil-800 font-medium' : 'text-[var(--ink-2)]'}`}>{cat.name}</span>
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-[var(--ink-3)] italic">Geen budgetcategorieën gevonden. Maak eerst budgetten aan.</p>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => void savePartnerNotifPrefs()}
                        disabled={partnerNotifSaving || !partnerNotifChanged}
                        className="rounded-lg bg-wil-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-wil-700 disabled:opacity-50"
                      >
                        {partnerNotifSaving ? 'Opslaan...' : 'Opslaan'}
                      </button>
                      {partnerNotifMessage && (
                        <span className={`text-sm ${partnerNotifMessage.type === 'success' ? 'text-wil-600' : 'text-red-600'}`}>
                          {partnerNotifMessage.text}
                        </span>
                      )}
                      {partnerNotifChanged && !partnerNotifMessage && (
                        <span className="text-xs text-amber-600">Niet-opgeslagen wijzigingen</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={() => void saveNotifPrefs()}
                  disabled={notifSaving}
                  className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
                >
                  {notifSaving ? 'Opslaan...' : 'Opslaan'}
                </button>
                {notifMessage && (
                  <span className={`text-sm ${notifMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {notifMessage.text}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
