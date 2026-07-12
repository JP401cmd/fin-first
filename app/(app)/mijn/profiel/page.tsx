'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { HouseholdSection } from '@/components/app/household-section'
import { HouseholdPrivacySettings } from '@/components/mijn/household-privacy-settings'
import { HouseholdBudgetModelSection } from '@/components/mijn/household-budget-model-section'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { PageOpening, Button } from '@/components/editorial'

type HouseholdType = 'solo' | 'samen' | 'gezin'

export default function ProfielPage() {
  const supabase = createClient()
  // NB: kleuren (module/budget/phase) worden al server-side door de
  // app-layout in de ModuleColorProvider gezet (zie app/(app)/layout.tsx).
  // Deze pagina laadt ze daarom NIET opnieuw via de provider-setters — dat zou
  // bovendien een PUT /api/appearance triggeren en een verse keuze op
  // /mijn/uiterlijk overschrijven met stale DB-waarden (clobber-bug).

  // Profile state
  const [fullName, setFullName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [country, setCountry] = useState('NL')
  const [householdType, setHouseholdType] = useState<HouseholdType>('solo')
  const [marketplaceDisplayName, setMarketplaceDisplayName] = useState('')

  // Household profile state (NIBUD matching)
  const [numberOfChildren, setNumberOfChildren] = useState(0)
  const [childrenAges, setChildrenAges] = useState<number[]>([])
  const [housingType, setHousingType] = useState<string | null>(null)
  const [energyLabel, setEnergyLabel] = useState<string | null>(null)
  const [hasCar, setHasCar] = useState(false)
  const [netMonthlyIncome, setNetMonthlyIncome] = useState<string>('')
  const [childAgeInput, setChildAgeInput] = useState('')

  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (data) {
        setFullName(data.full_name ?? '')
        setDateOfBirth(data.date_of_birth ?? '')
        setCountry(data.country ?? 'NL')
        setHouseholdType(data.household_type ?? 'solo')
        setMarketplaceDisplayName(data.marketplace_display_name ?? '')
        setNumberOfChildren(data.number_of_children ?? 0)
        setChildrenAges(data.children_ages ?? [])
        setHousingType(data.housing_type ?? null)
        setEnergyLabel(data.energy_label ?? null)
        setHasCar(data.has_car ?? false)
        setNetMonthlyIncome(data.net_monthly_income ? String(data.net_monthly_income) : '')
        // Kleuren (module/budget/phase) NIET hier laden — de layout zet ze al
        // server-side in de provider. Opnieuw zetten via de persisterende
        // setters zou een PUT triggeren en een verse keuze overschrijven.
      }

      setLoading(false)
    }
    loadProfile()
  }, [supabase])

  const saveProfile = useCallback(async () => {
    setSaving(true)
    setSaveMessage(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSaveMessage({ type: 'error', text: 'Niet ingelogd.' })
      setSaving(false)
      return
    }

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        full_name: fullName || null,
        date_of_birth: dateOfBirth || null,
        country: country || 'NL',
        household_type: householdType,
        marketplace_display_name: marketplaceDisplayName.trim() || null,
        number_of_children: numberOfChildren,
        children_ages: childrenAges,
        housing_type: housingType,
        energy_label: energyLabel,
        has_car: hasCar,
        net_monthly_income: netMonthlyIncome ? Number(netMonthlyIncome) : null,
        updated_at: new Date().toISOString(),
      })

    if (error) {
      setSaveMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    } else {
      setSaveMessage({ type: 'success', text: 'Opgeslagen!' })
      setTimeout(() => setSaveMessage(null), 3000)

      // Feature #830: clear 'income' from deferred onboarding fields when
      // the user has now filled in their income. This removes the coach-bubble
      // suggestion prompting them to complete this field. Stored in
      // feature_preferences.deferred_onboarding_fields (JSONB sub-key).
      if (netMonthlyIncome && Number(netMonthlyIncome) > 0) {
        try {
          const { data: currentProfile } = await supabase
            .from('profiles')
            .select('feature_preferences')
            .eq('id', user.id)
            .single()
          const prefs = (currentProfile?.feature_preferences as Record<string, unknown>) ?? {}
          const deferred = Array.isArray(prefs.deferred_onboarding_fields)
            ? prefs.deferred_onboarding_fields as string[]
            : []
          if (deferred.includes('income')) {
            prefs.deferred_onboarding_fields = deferred.filter((f: string) => f !== 'income')
            await supabase
              .from('profiles')
              .update({ feature_preferences: prefs })
              .eq('id', user.id)
          }
        } catch {
          // Graceful degradation
        }
      }
    }
    setSaving(false)
  }, [supabase, fullName, dateOfBirth, country, householdType, marketplaceDisplayName, numberOfChildren, childrenAges, housingType, energyLabel, hasCar, netMonthlyIncome])

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-md)] border-t-zinc-900" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
      <NavStackMeta title="Profiel" bottomBar={{ kind: 'tabs' }} />
      {/* Editorial pagina-opening — blueprint Type 8 (Settings) */}
      <PageOpening
        className="mb-5 sm:mb-8"
        kicker="Mijn · profiel"
        titleBefore="Wie ben "
        emphasis="jij"
        titleAfter="?"
        deck="Je persoonlijke gegevens en huishoudprofiel."
      />

      {/* ── Persoonlijke Gegevens ─────────────────────────────────── */}
      <section className="mb-5 sm:mb-8 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-8">
        <h2 className="label-editorial text-[var(--ink-2)]">
          Persoonlijke Gegevens
        </h2>
        <p className="mt-1 mb-3 sm:mb-6 text-sm text-[var(--ink-3)]">
          Basisinformatie over jou en je huishouden.
        </p>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="fullName" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Volledige naam
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Je naam"
              className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
          </div>

          <div>
            <label htmlFor="marketplaceDisplayName" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Naam in bibliotheek
            </label>
            <input
              id="marketplaceDisplayName"
              type="text"
              maxLength={40}
              value={marketplaceDisplayName}
              onChange={(e) => setMarketplaceDisplayName(e.target.value)}
              placeholder="Anoniem"
              className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
            <p className="mt-1 text-[11px] text-[var(--ink-3)]">
              Wordt getoond bij door jou gedeelde rekenhulpen. Leeg = &quot;Anoniem&quot;.
            </p>
          </div>

          <div>
            <label htmlFor="dob" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Geboortedatum
            </label>
            <input
              id="dob"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
          </div>

          <div>
            <label htmlFor="country" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Land
            </label>
            <input
              id="country"
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="NL"
              className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Huishouden
            </span>
            <div className="flex gap-2">
              {(['solo', 'samen', 'gezin'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setHouseholdType(type)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    householdType === type
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-[var(--border-md)] bg-[var(--subtle)] text-[var(--ink-2)] hover:border-zinc-400'
                  }`}
                >
                  {type === 'solo' ? 'Solo' : type === 'samen' ? 'Samen' : 'Gezin'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 sm:mt-6 flex items-center gap-3">
          <Button variant="primary" onClick={saveProfile} disabled={saving}>
            {saving ? 'Opslaan...' : 'Opslaan'}
          </Button>
          {saveMessage && (
            <span className={`text-sm ${saveMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
              {saveMessage.text}
            </span>
          )}
        </div>
      </section>

      {/* ── Huishoudprofiel (NIBUD matching) ─────────────────────── */}
      <section className="mb-5 sm:mb-8 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-8">
        <h2 className="label-editorial text-[var(--ink-2)]">
          Huishoudprofiel
        </h2>
        <p className="mt-1 mb-3 sm:mb-6 text-sm text-[var(--ink-3)]">
          Deze gegevens worden gebruikt voor je NIBUD Budget Gezondheidscheck.
        </p>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="numChildren" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Aantal kinderen
            </label>
            <input
              id="numChildren"
              type="number"
              min={0}
              max={10}
              value={numberOfChildren}
              onChange={(e) => {
                const n = Math.max(0, Number(e.target.value))
                setNumberOfChildren(n)
                if (n < childrenAges.length) setChildrenAges(childrenAges.slice(0, n))
              }}
              className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Leeftijden kinderen
            </label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {childrenAges.map((age, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-[var(--ink-2)]"
                >
                  {age} jaar
                  <button
                    onClick={() => setChildrenAges(childrenAges.filter((_, idx) => idx !== i))}
                    className="ml-0.5 text-[var(--ink-3)] hover:text-[var(--ink-2)]"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
            {childrenAges.length < numberOfChildren && (
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  max={25}
                  value={childAgeInput}
                  onChange={(e) => setChildAgeInput(e.target.value)}
                  placeholder="Leeftijd"
                  className="w-24 rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && childAgeInput) {
                      e.preventDefault()
                      setChildrenAges([...childrenAges, Math.max(0, Number(childAgeInput))])
                      setChildAgeInput('')
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (childAgeInput) {
                      setChildrenAges([...childrenAges, Math.max(0, Number(childAgeInput))])
                      setChildAgeInput('')
                    }
                  }}
                  className="rounded-lg border border-[var(--border-md)] px-3 py-1.5 text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)]"
                >
                  Toevoegen
                </button>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="housingType" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Woningtype
            </label>
            <select
              id="housingType"
              value={housingType ?? ''}
              onChange={(e) => setHousingType(e.target.value || null)}
              className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            >
              <option value="">Selecteer...</option>
              <option value="huur_sociaal">Huur (sociaal)</option>
              <option value="huur_vrij">Huur (vrije sector)</option>
              <option value="koop">Koopwoning</option>
            </select>
          </div>

          <div>
            <label htmlFor="energyLabel" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Energielabel
            </label>
            <select
              id="energyLabel"
              value={energyLabel ?? ''}
              onChange={(e) => setEnergyLabel(e.target.value || null)}
              className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            >
              <option value="">Selecteer...</option>
              {['A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G'].map(label => (
                <option key={label} value={label}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Auto</span>
            <div className="flex gap-2">
              {[
                { value: false, label: 'Nee' },
                { value: true, label: 'Ja' },
              ].map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => setHasCar(opt.value)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    hasCar === opt.value
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-[var(--border-md)] bg-[var(--subtle)] text-[var(--ink-2)] hover:border-zinc-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="netIncome" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Netto maandinkomen
              <span className="ml-1 text-xs font-normal text-[var(--ink-3)]">(optioneel)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-3)]">&euro;</span>
              <input
                id="netIncome"
                type="number"
                min={0}
                step={50}
                value={netMonthlyIncome}
                onChange={(e) => setNetMonthlyIncome(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] py-2 pr-3 pl-7 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
              />
            </div>
            <p className="mt-1 text-[10px] text-[var(--ink-3)]">
              Wordt gebruikt voor gepersonaliseerde NIBUD-berekeningen.
            </p>
          </div>
        </div>

        <div className="mt-3 sm:mt-6 flex items-center gap-3">
          <Button variant="primary" onClick={saveProfile} disabled={saving}>
            {saving ? 'Opslaan...' : 'Opslaan'}
          </Button>
          {saveMessage && (
            <span className={`text-sm ${saveMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
              {saveMessage.text}
            </span>
          )}
        </div>
      </section>

      {/* ── Huishouden Management ────────────────────────────────── */}
      <HouseholdSection />
      <HouseholdBudgetModelSection />
      <HouseholdPrivacySettings />
    </div>
  )
}
