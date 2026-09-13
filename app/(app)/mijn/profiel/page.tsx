'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { HouseholdSection } from '@/components/app/household-section'
import { HouseholdPrivacySettings } from '@/components/mijn/household-privacy-settings'
import { HouseholdBudgetModelSection } from '@/components/mijn/household-budget-model-section'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { PageOpening, Button, PageInfoButton } from '@/components/editorial'
import { FormError, formErrorId } from '@/components/app/form-error'
import { useToast } from '@/components/app/toast-provider'
import { getPageInfo } from '@/lib/page-info-content'
import { VALID_HOUSEHOLD_TYPES, type HouseholdType } from '@/lib/household-type'

/**
 * Eén opslag-fouttekst voor deze pagina — zowel wanneer de server de opslag
 * weigert als wanneer het verzoek door een netwerkstoring niet aankomt. Beide
 * zijn voor de gebruiker hetzelfde geval: "het opslaan lukte niet, probeer
 * opnieuw". Gedocumenteerd in lib/uat/acceptance/mijn.ts (WF-MIJN-02c).
 */
const SAVE_FAILED_MESSAGE = 'Opslaan is mislukt. Probeer het opnieuw.'

const NOT_LOGGED_IN_MESSAGE = 'Je bent niet ingelogd. Log opnieuw in en probeer het nog eens.'

/**
 * De 400-tekst van `parseBody` heeft de vorm `veld.pad: melding`. De melding zelf
 * is Nederlands en client-veilig (gezet in het schema van /api/profile); het
 * technische veldpad hoort niet op het scherm.
 */
function validationMessage(error: unknown): string {
  if (typeof error !== 'string' || !error) return SAVE_FAILED_MESSAGE
  return error.replace(/^[\w.]+: /, '')
}

/** Canoniek huishoudtype; de dode kolom-default 'single' en onbekende waarden → 'solo'. */
function toHouseholdType(value: unknown): HouseholdType {
  return VALID_HOUSEHOLD_TYPES.includes(value as HouseholdType) ? (value as HouseholdType) : 'solo'
}

export default function ProfielPage() {
  const supabase = createClient()
  const { addToast } = useToast()
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
  const [netMonthlyIncome, setNetMonthlyIncome] = useState<string>('')
  const [childAgeInput, setChildAgeInput] = useState('')

  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // I-02 / besluit 3: fouten inline via FormError, succes via een toast.
  const [saveError, setSaveError] = useState<string | null>(null)

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
        setHouseholdType(toHouseholdType(data.household_type))
        setMarketplaceDisplayName(data.marketplace_display_name ?? '')
        setNumberOfChildren(data.number_of_children ?? 0)
        setChildrenAges(data.children_ages ?? [])
        setHousingType(data.housing_type ?? null)
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
    setSaveError(null)

    // TPR-14: opslaan loopt via PUT /api/profile (zod + error-envelope) i.p.v.
    // een client-upsert — geboortedatum en huishoudtype sturen de rekenmotor.
    // De route leidt de gebruiker af uit de sessie, zet `income_source` bij een
    // eigen bedrag en ruimt het uitgestelde inkomen-veld op (feature #830).
    let response: Response
    try {
      response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          date_of_birth: dateOfBirth || null,
          country,
          household_type: householdType,
          marketplace_display_name: marketplaceDisplayName,
          number_of_children: numberOfChildren,
          children_ages: childrenAges,
          housing_type: housingType,
          net_monthly_income: netMonthlyIncome ? Number(netMonthlyIncome) : null,
        }),
      })
    } catch {
      // WF-MIJN-02c: een netwerkstoring is géén uitgelogde sessie. Die tak mag
      // dus NIET de "je bent niet ingelogd"-tekst tonen (misleidend: de
      // gebruiker gaat onnodig opnieuw inloggen), maar de opslag-fouttekst.
      setSaveError(SAVE_FAILED_MESSAGE)
      setSaving(false)
      return
    }

    if (response.ok) {
      setSaveError(null)
      addToast({ type: 'success', title: 'Je profiel is opgeslagen.' })
    } else if (response.status === 401) {
      setSaveError(NOT_LOGGED_IN_MESSAGE)
    } else if (response.status === 400) {
      const data = (await response.json().catch(() => null)) as { error?: unknown } | null
      setSaveError(validationMessage(data?.error))
    } else {
      setSaveError(SAVE_FAILED_MESSAGE)
    }
    setSaving(false)
  }, [addToast, fullName, dateOfBirth, country, householdType, marketplaceDisplayName, numberOfChildren, childrenAges, housingType, netMonthlyIncome])

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
    <div className="relative mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
      <NavStackMeta title="Profiel" bottomBar={{ kind: 'tabs' }} />
      <PageInfoButton
        content={getPageInfo('/mijn/profiel')}
        className="absolute right-4 top-4 sm:right-6 sm:top-6"
      />
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
      <section className="mb-5 sm:mb-8 border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-8">
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
              className="w-full border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
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
              className="w-full border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
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
              aria-describedby="dob-hint"
              className="w-full border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
            <p id="dob-hint" className="mt-1 text-[11px] text-[var(--ink-3)]">
              Hieruit volgen je leeftijd nu en je AOW-leeftijd in de toekomstgrafiek. Dat
              telt, omdat elke projectie per levensjaar rekent: wanneer je vrij kunt zijn
              en hoe lang je vermogen reikt.
            </p>
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
              className="w-full border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            />
          </div>

          <div>
            <span id="household-label" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Huishouden
            </span>
            <div
              role="group"
              aria-labelledby="household-label"
              aria-describedby="household-hint"
              className="flex gap-2"
            >
              {VALID_HOUSEHOLD_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={householdType === type}
                  onClick={() => setHouseholdType(type)}
                  className={`flex-1 border px-3 py-2 text-sm font-medium transition-colors ${
                    householdType === type
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-[var(--border-md)] bg-[var(--subtle)] text-[var(--ink-2)] hover:border-zinc-400'
                  }`}
                >
                  {type === 'solo' ? 'Solo' : type === 'samen' ? 'Samen' : 'Gezin'}
                </button>
              ))}
            </div>
            <p id="household-hint" className="mt-1 text-[11px] text-[var(--ink-3)]">
              Je kiest of je alleen woont, samen of als gezin. Bij samen en gezin rekent de
              app met een fiscaal partner, wat onder meer je Box 3-vrijstelling verandert.
              Dat telt, omdat die belasting jaarlijks van je vermogen afgaat en dus je
              vrijheidstijd raakt.
            </p>
          </div>
        </div>

        <div className="mt-3 sm:mt-6">
          <Button variant="primary" onClick={saveProfile} disabled={saving}>
            {saving ? 'Opslaan...' : 'Opslaan'}
          </Button>
          <FormError id={formErrorId('profiel-persoonlijk')} message={saveError} />
        </div>
      </section>

      {/* ── Huishoudprofiel (NIBUD matching) ─────────────────────── */}
      <section className="mb-5 sm:mb-8 border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-8">
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
              className="w-full border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
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
                  className="w-24 border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
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
                  className="border border-[var(--border-md)] px-3 py-1.5 text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)]"
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
              className="w-full border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            >
              <option value="">Selecteer...</option>
              <option value="huur_sociaal">Huur (sociaal)</option>
              <option value="huur_vrij">Huur (vrije sector)</option>
              <option value="koop">Koopwoning</option>
            </select>
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
                className="w-full border border-[var(--border-md)] bg-[var(--subtle)] py-2 pr-3 pl-7 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
              />
            </div>
            <p className="mt-1 text-[10px] text-[var(--ink-3)]">
              Wordt gebruikt voor gepersonaliseerde NIBUD-berekeningen.
            </p>
          </div>
        </div>

        <div className="mt-3 sm:mt-6">
          <Button variant="primary" onClick={saveProfile} disabled={saving}>
            {saving ? 'Opslaan...' : 'Opslaan'}
          </Button>
          <FormError id={formErrorId('profiel-huishouden')} message={saveError} />
        </div>
      </section>

      {/* ── Huishouden Management ────────────────────────────────── */}
      <HouseholdSection />
      <HouseholdBudgetModelSection />
      <HouseholdPrivacySettings />
    </div>
  )
}
