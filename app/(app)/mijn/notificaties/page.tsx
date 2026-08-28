'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NOTIFICATION_TYPES, WEEKLY_BRIEFING_EMAIL_TOGGLE } from '@/lib/identity-constants'
import { Bell, CalendarCheck, HandCoins, type LucideIcon } from 'lucide-react'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { PageInfoButton, PageOpening } from '@/components/editorial'
import { DepthSection } from '@/components/app/depth-section'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import { PAGE_INFO } from '@/lib/page-info-content'

type PartnerNotifMode = 'all_shared' | 'threshold' | 'categories' | 'disabled'

/**
 * Eén schakelrij: icoon + label + uitleg + switch. Was viermaal bijna-identiek
 * geïnlined; MIJN-3 voegt er een vijfde (de hoofdschakelaar) aan toe, dus hier
 * één vorm die ze allemaal dragen.
 */
function NotifToggleRow({
  Icon,
  label,
  description,
  enabled,
  onToggle,
  disabled = false,
}: {
  Icon: LucideIcon
  label: string
  description: string
  enabled: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <Icon className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--ink-2)]">{label}</p>
          <p className="text-xs text-[var(--ink-3)]">{description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          enabled ? 'bg-zinc-900' : 'bg-zinc-300'
        } ${disabled ? 'opacity-50' : ''}`}
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
}

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
  const simple = useDisplayMode().mode === 'simple'

  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({
    budget: true,
    sync: true,
    recommendation: true,
    horizon: true,
    holding_alert: true,
    briefing: true,
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

  // Briefing-per-e-mail opt-in (aparte profiles-kolom, default UIT).
  const [briefingEmailEnabled, setBriefingEmailEnabled] = useState(false)
  const [briefingEmailSaving, setBriefingEmailSaving] = useState(false)

  // ─ Load alle data parallel ────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setNotifLoading(false)
        return
      }

      const [notifData, checkinRes, householdRes, briefingEmailRes] = await Promise.all([
        supabase
          .from('app_settings')
          .select('value')
          .eq('key', `notifications_preferences_${user.id}`)
          .maybeSingle(),
        fetch('/api/monthly-checkin'),
        // `/api/household/status` en NIET `/api/household/privacy`: die laatste
        // levert geen enkel veld waarmee je "heb ik een partner?" kunt
        // beantwoorden. Deze pagina las er `data.hasHousehold` uit — een veld
        // dat de route nooit heeft geretourneerd — waardoor het partnerblok bij
        // niemand meer verscheen, ook niet bij een echt stel (S10).
        fetch('/api/household/status'),
        fetch('/api/briefing/email/pref'),
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

      // Briefing-per-e-mail opt-in
      if (briefingEmailRes.ok) {
        try {
          const data = await briefingEmailRes.json()
          if (typeof data.enabled === 'boolean') setBriefingEmailEnabled(data.enabled)
        } catch { /* default false */ }
      }

      // ── Partner-notificaties: alleen bij een ECHTE partner ────────────────
      // De poort is `members.length > 1`, niet "heeft een huishouden". Dat
      // onderscheid is geen muggenzifterij: `POST /api/household/invite` maakt
      // de huishoud-rij én de eigen ledenrij al aan op het moment van
      // uitnodigen — vóór de ander accepteert. Op "heeft een huishouden" gaan
      // staan zou dus vier partner-modi en een categorie-picker tonen aan
      // iemand die alleen is. Dezelfde afleiding staat al in
      // `app/api/household/box2|box3/route.ts`.
      //
      // Let op de snake_case van deze route (`has_household`, `members`): het
      // was precies zo'n naamverschil dat deze sectie stilzwijgend uitzette.
      if (householdRes.ok) {
        try {
          const data = await householdRes.json()
          const memberCount = Array.isArray(data.members) ? data.members.length : 0
          if (data.has_household === true && memberCount > 1) {
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

  // ─ MIJN-3: hoofdschakelaar over de push-types ─────────────────────────────
  //
  // In Eenvoudig staan de zeven losse types achter een disclosure; daarboven
  // staat één regel "Meldingen in de app". Die regel is PRESENTATIE over
  // dezelfde voorkeuren-blob — géén nieuw veld en géén tweede bron: aan =
  // minstens één type aan, uitzetten = alle zeven uit, aanzetten = alle zeven
  // aan. De gebruiker bevestigt met dezelfde "Opslaan"-knop als de losse types,
  // dus het opslagpad blijft ongewijzigd (/api/notifications).
  const notifOnCount = NOTIFICATION_TYPES.filter(
    ({ type }) => notifPrefs[type] !== false,
  ).length
  const anyNotifOn = notifOnCount > 0

  const toggleAllNotifPrefs = useCallback(() => {
    setNotifPrefs((prev) => {
      // Alles-uit wanneer er nog iets aan staat, anders alles-aan. `...prev`
      // blijft staan zodat een sleutel die de server kent maar deze build niet
      // (nieuwer meldingstype) niet stilzwijgend uit de blob verdwijnt.
      const turnOff = NOTIFICATION_TYPES.some(({ type }) => prev[type] !== false)
      return {
        ...prev,
        ...Object.fromEntries(NOTIFICATION_TYPES.map(({ type }) => [type, !turnOff])),
      }
    })
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

  const toggleBriefingEmail = useCallback(async () => {
    const newVal = !briefingEmailEnabled
    setBriefingEmailEnabled(newVal)
    setBriefingEmailSaving(true)
    try {
      const res = await fetch('/api/briefing/email/pref', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newVal }),
      })
      if (!res.ok) throw new Error('save failed')
    } catch {
      setBriefingEmailEnabled(!newVal) // revert
    }
    setBriefingEmailSaving(false)
  }, [briefingEmailEnabled])

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
      <NavStackMeta title="Notificaties" bottomBar={{ kind: 'tabs' }} />

      <PageOpening
        className="mb-6 pr-12 sm:pr-14"
        kicker="Mijn · notificaties"
        titleBefore="Wat je hoort "
        emphasis="en wanneer"
        titleAfter=""
        deck="Stel in welke meldingen je wilt ontvangen — push-types, partner-transacties en maandelijkse geld-checkin."
      >
        <PageInfoButton
          description={PAGE_INFO['/mijn/notificaties'] ?? ''}
          className="absolute right-0 top-0"
        />
      </PageOpening>

      {/* Context-banner: maakt duidelijk waar deze meldingen verschijnen.
          User-feedback (mei 2026): "het is mij niet duidelijk welke
          notificaties dit zijn, die van de coach of die in het meldingen
          scherm terecht komen?". */}
      <div className="mb-4 border border-[var(--border-ed)] bg-[var(--subtle)] p-3 sm:p-4 text-xs sm:text-sm text-[var(--ink-2)]">
        <p className="leading-relaxed">
          <span className="font-semibold text-[var(--ink)]">Push-meldingen</span>{' '}
          die je op je apparaat ontvangt — ook bekend onder het{' '}
          <em>belletje</em>-icoon op /berichten. De{' '}
          <span className="font-semibold text-[var(--ink)]">Fin-coach</span> heeft
          een eigen meldingen-stream onder &quot;Berichten&quot; in het hoofdmenu.
          Die twee zijn los van elkaar.
        </p>
      </div>

      <section className="border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        <div className="px-4 sm:px-8 py-6">
          {notifLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-md)] border-t-zinc-900" />
            </div>
          ) : (
            <>
              {/* MIJN-3 — in Eenvoudig staan de zeven meldingstypen achter één
                  hoofdschakelaar + disclosure; de drie hoofdregels (meldingen in
                  de app, briefing per e-mail, geldcheck-in) staan erboven. In
                  Volledig blijft de vlakke lijst exact zoals hij was. */}
              {simple ? (
                <div className="border border-[var(--border-ed)] divide-y divide-[var(--border-ed)]">
                  <NotifToggleRow
                    Icon={Bell}
                    label="Meldingen in de app"
                    description={`Push-meldingen op je apparaat — ${notifOnCount} van ${NOTIFICATION_TYPES.length} typen aan`}
                    enabled={anyNotifOn}
                    onToggle={toggleAllNotifPrefs}
                  />
                  <NotifToggleRow
                    Icon={WEEKLY_BRIEFING_EMAIL_TOGGLE.icon}
                    label={WEEKLY_BRIEFING_EMAIL_TOGGLE.label}
                    description={WEEKLY_BRIEFING_EMAIL_TOGGLE.description}
                    enabled={briefingEmailEnabled}
                    onToggle={() => void toggleBriefingEmail()}
                    disabled={briefingEmailSaving}
                  />
                  <NotifToggleRow
                    Icon={CalendarCheck}
                    label="Maandelijkse geldcheck-in"
                    description="Herinnering om elke maand je financiën te checken"
                    enabled={checkinEnabled}
                    onToggle={() => void toggleCheckin()}
                    disabled={checkinSaving}
                  />
                </div>
              ) : (
                <>
                  <div className="divide-y divide-zinc-100 border border-[var(--border-ed)]">
                    {NOTIFICATION_TYPES.map(({ type, label, description, icon: Icon }) => (
                      <NotifToggleRow
                        key={type}
                        Icon={Icon}
                        label={label}
                        description={description}
                        enabled={notifPrefs[type] !== false}
                        onToggle={() => toggleNotifPref(type)}
                      />
                    ))}
                  </div>

                  {/* Monthly check-in toggle */}
                  <div className="mt-4 border border-[var(--border-ed)]">
                    <NotifToggleRow
                      Icon={CalendarCheck}
                      label="Maandelijkse geldcheck-in"
                      description="Herinnering om elke maand je financiën te checken"
                      enabled={checkinEnabled}
                      onToggle={() => void toggleCheckin()}
                      disabled={checkinSaving}
                    />
                  </div>

                  {/* Briefing per e-mail — aparte opt-in (profiles-kolom, default UIT) */}
                  <div className="mt-4 border border-[var(--border-ed)]">
                    <NotifToggleRow
                      Icon={WEEKLY_BRIEFING_EMAIL_TOGGLE.icon}
                      label={WEEKLY_BRIEFING_EMAIL_TOGGLE.label}
                      description={WEEKLY_BRIEFING_EMAIL_TOGGLE.description}
                      enabled={briefingEmailEnabled}
                      onToggle={() => void toggleBriefingEmail()}
                      disabled={briefingEmailSaving}
                    />
                  </div>
                </>
              )}

              {/* Disclosure met de losse meldingstypen — alleen in Eenvoudig.
                  Hard verbergen zou de enige ingang naar deze zeven keuzes
                  dichtzetten; `DepthSection` klapt ze in mét behoud (ADR 0026). */}
              {simple && (
                <div className="mt-4">
                  <DepthSection
                    title="Alle meldingstypen"
                    summary={`${notifOnCount} van ${NOTIFICATION_TYPES.length} aan`}
                  >
                    <div className="divide-y divide-[var(--border-ed)] border border-[var(--border-ed)]">
                      {NOTIFICATION_TYPES.map(({ type, label, description, icon: Icon }) => (
                        <NotifToggleRow
                          key={type}
                          Icon={Icon}
                          label={label}
                          description={description}
                          enabled={notifPrefs[type] !== false}
                          onToggle={() => toggleNotifPref(type)}
                        />
                      ))}
                    </div>
                  </DepthSection>
                </div>
              )}

              {/* Partner transacties — only when user has a household */}
              {hasHousehold && (
                <div id="partner-transacties" className="mt-5 border border-[var(--border-ed)] overflow-hidden scroll-mt-4">
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
                          className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors ${
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
                      <div className="border border-[var(--border-ed)] p-3 bg-[var(--subtle)]">
                        <label className="block text-xs font-medium text-[var(--ink-2)] mb-1.5">Drempelbedrag</label>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[var(--ink-3)]">€</span>
                          <input
                            type="number"
                            min="0"
                            step="10"
                            value={partnerNotifThreshold}
                            onChange={(e) => setPartnerNotifThreshold(e.target.value)}
                            className="w-28 border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 text-sm font-mono tabular-nums text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-wil-400"
                          />
                          <span className="text-xs text-[var(--ink-3)]">of hoger</span>
                        </div>
                      </div>
                    )}

                    {partnerNotifMode === 'categories' && (
                      <div className="border border-[var(--border-ed)] p-3 bg-[var(--subtle)]">
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
                                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                                    checked ? 'bg-wil-50 border border-wil-200' : 'border border-transparent hover:bg-[var(--paper)]'
                                  }`}
                                >
                                  <div
                                    className={`h-4 w-4 border shrink-0 flex items-center justify-center ${
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
                        className="bg-wil-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-wil-700 disabled:opacity-50"
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
                  className="bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
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
