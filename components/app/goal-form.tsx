'use client'

/**
 * Fase 2.4 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §5.2 (sheet-driewegregel)
 * GoalForm wordt nu gerenderd via <ShellOverlay kind="sheet">. Conform
 * CLAUDE.md verbod op directe BottomSheet-imports buiten ShellOverlay.
 *
 * UITBREIDING (1 sep 2026) — drie dingen tegelijk:
 *  1. KOPPELEN IS MEERVOUDIG. De twee wederzijds-exclusieve selects ("koppel aan
 *     asset" / "koppel aan schuld") zijn vervangen door één checkbox-sectie met
 *     de groepen "Bezittingen" en "Schulden". State = twee id-lijsten, gevoed uit
 *     `goal.links` (tabel `goal_links`).
 *  2. PREFILL ≡ RUNTIME. De getoonde huidige waarde komt uit
 *     `computeLinkedCurrentValue` — dezelfde functie die de loaders draaien. De
 *     oude `handleDebtLink` zette `current_value` op het RUWE openstaande saldo
 *     ("how much has been paid off"), terwijl de loader `doel − saldo` rekent:
 *     twee rekenwegen voor één getal. Die is hiermee weg.
 *  3. SCHRIJVEN GAAT VIA `/api/goals`. Datapad-conventie (ADR 0058: muteren via
 *     API-route) én noodzaak: alleen de server mag `metadata.sync` zetten en de
 *     koppelingen diffen. De directe `supabase.from('goals').insert/update` is
 *     daarmee verdwenen; de browser-client wordt alleen nog voor `auth` gebruikt
 *     (toegestaan client-direct-geval).
 */

import { useState, useEffect } from 'react'
import { Users } from 'lucide-react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/format'
import { computeLinkedCurrentValue } from '@/lib/goal-current-value'
import {
  GOAL_TYPE_LABELS, GOAL_COLORS, GOAL_TYPE_META, GOAL_TYPE_ICONS,
  goalValueLabels, formatGoalValue, type Goal, type GoalType,
} from '@/lib/goal-data'
import { iconOptions } from '@/components/app/budget-shared'

type Asset = { id: string; name: string; current_value: number }
type Debt = { id: string; name: string; current_balance: number }

/**
 * De doelbasis-keuze in gewone taal: WAT er gemeten wordt als je dit doel aan een
 * kengetal hangt. Eén regel per type met `metricBasis: true`; de lijst zelf komt
 * uit `GOAL_TYPE_META` (niet hier overgetikt), deze map levert alleen de copy.
 * Ontbreekt er een regel, dan valt de kiezer terug op het type-label — een nieuw
 * metric-type verdwijnt dus nooit stil uit de keuzelijst.
 */
const METRIC_BASIS_UITLEG: Partial<Record<GoalType, string>> = {
  savings_rate: 'Je spaarquote — welk deel van je inkomen je maandelijks overhoudt.',
  net_worth: 'Je netto vermogen — alles wat je bezit, min wat je nog moet aflossen.',
  fire_age: 'Je vrijheidsleeftijd — de leeftijd waarop je niet meer voor geld hoeft te werken.',
  emergency_fund: 'Je noodfonds — hoeveel maanden uitgaven je opzij hebt staan.',
  passive_income: 'Je passieve inkomen — wat je vermogen per maand kan opleveren.',
  tax_burden: 'Je belastingdruk — welk deel van je inkomen naar de fiscus gaat.',
  debt_free_date: 'Je schuldenvrij-datum — wanneer je laatste schuld is afgelost.',
  // Expliciet dat dit NOMINAAL is: de kernel levert het bedrag in euro's van dát
  // moment. Wie hier "€ 500.000" invult denkt vrijwel zeker in geld van vandaag,
  // en over veertig jaar zit daar bij 2% inflatie ruwweg een factor twee tussen —
  // dan is het doel per constructie veel te makkelijk.
  end_balance: 'Het eindsaldo van je plan — wat er op je eindleeftijd nog staat, in euro\'s van dát moment (niet gecorrigeerd voor inflatie).',
}

/** De types die als doelbasis kiesbaar zijn. Canoniek: de `metricBasis`-vlag. */
const METRIC_BASIS_TYPES = (Object.keys(GOAL_TYPE_META) as GoalType[]).filter(
  (t) => GOAL_TYPE_META[t].metricBasis === true,
)

/** Doelbasis: `'manual'` = een bedrag dat je zelf bijhoudt, anders het metric-type. */
type DoelBasis = 'manual' | GoalType

const inputClass =
  'w-full border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--module-active-500)] focus:ring-1 focus:ring-[var(--module-active-500)]'

export function GoalForm({
  goal,
  assets,
  debts,
  onClose,
  onSaved,
  lockedToSavings,
  initialValues,
}: {
  goal?: Goal
  assets: Asset[]
  debts: Debt[]
  onClose: () => void
  onSaved: (newGoalId?: string) => void
  lockedToSavings?: boolean
  initialValues?: {
    target_value?: string
    target_date?: string
    name?: string
    /** Voorgeselecteerd doel-type bij een nieuw doel (bv. de preset "Schuldenvrij"). */
    goal_type?: GoalType
  }
}) {
  const isEdit = !!goal
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [hasHousehold, setHasHousehold] = useState(false)
  const [isShared, setIsShared] = useState(goal?.ownership === 'shared')
  /** Eigen user-id — alleen om te bepalen of dit doel van jóu is (koppel-guard). */
  const [userId, setUserId] = useState<string | null>(null)

  // Check if user has a household
  useEffect(() => {
    async function checkHousehold() {
      try {
        const res = await fetch('/api/household/status')
        if (res.ok) {
          const data = await res.json()
          if (data.has_household && data.household?.id) {
            setHasHousehold(true)
          }
        }
      } catch {
        // No household — keep defaults
      }
    }
    checkHousehold()
  }, [])

  // Eigen id via de auth-client (toegestaan client-direct-geval: `supabase.auth.*`).
  useEffect(() => {
    let cancelled = false
    async function loadUser() {
      const { data } = await createClient().auth.getUser()
      if (!cancelled) setUserId(data.user?.id ?? null)
    }
    loadUser()
    return () => {
      cancelled = true
    }
  }, [])

  const [form, setForm] = useState({
    name: goal?.name ?? initialValues?.name ?? '',
    description: goal?.description ?? '',
    goal_type: (goal?.goal_type ?? initialValues?.goal_type ?? 'savings') as GoalType,
    target_value: goal ? String(goal.target_value) : (initialValues?.target_value ?? ''),
    current_value: goal ? String(goal.current_value) : '0',
    target_date: goal?.target_date ?? initialValues?.target_date ?? '',
    icon: goal?.icon ?? (initialValues?.goal_type ? GOAL_TYPE_ICONS[initialValues.goal_type] : 'Target'),
    color: goal?.color ?? 'teal',
    custom_unit: goal?.custom_unit ?? '',
  })

  // Koppelingen — twee id-lijsten, geïnitialiseerd uit `goal.links`. Een rij met
  // twee (of nul) verwijzingen is per DB-CHECK onmogelijk maar wordt hier
  // defensief genegeerd, zoals elke andere lezer van `GoalLink`.
  const [linkedAssetIds, setLinkedAssetIds] = useState<string[]>(
    () => (goal?.links ?? []).map((l) => l.asset_id).filter((id): id is string => !!id),
  )
  const [linkedDebtIds, setLinkedDebtIds] = useState<string[]>(
    () => (goal?.links ?? []).map((l) => l.debt_id).filter((id): id is string => !!id),
  )

  /**
   * Doelbasis alleen bij een NIEUW doel: van een bestaand doel omzetten naar een
   * meelopend kengetal is een andere handeling (de server schrijft `metadata`
   * alleen bij POST) — dat zou hier een knop zijn die stil niets doet.
   */
  const [basis, setBasis] = useState<DoelBasis>('manual')
  /** Onthoudt het handmatige type, zodat terugschakelen naar 'manual' niets weggooit. */
  const [manualType, setManualType] = useState<GoalType>(form.goal_type)

  const isMetricBasis = !isEdit && basis !== 'manual'

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function setType(next: GoalType) {
    setForm((prev) => ({ ...prev, goal_type: next, icon: GOAL_TYPE_ICONS[next] }))
  }

  function handleBasisChange(next: DoelBasis) {
    setBasis(next)
    if (next === 'manual') {
      setType(manualType)
      return
    }
    setManualType(form.goal_type)
    setType(next)
    // Een meelopend doel haalt zijn waarde uit de motor: koppelingen zouden die
    // waarde overrulen (link wint van metric in `syncActiveGoalValues`). Los ze
    // daarom expliciet i.p.v. ze onzichtbaar te laten meelopen.
    setLinkedAssetIds([])
    setLinkedDebtIds([])
  }

  // viaLab-doelen (verwacht rendement, vrijheidsleeftijd) worden via het
  // /toekomst-lab beheerd. Ze zijn niet vrij aanmaakbaar; bij een onverhoopte
  // edit van zo'n rij staat de type-select vast (defensief — DoelenView routeert
  // parameter-doelen normaal naar het lab, niet naar GoalForm).
  const isViaLabGoal = isEdit && GOAL_TYPE_META[form.goal_type].viaLab === true

  const meta = GOAL_TYPE_META[form.goal_type]
  const labels = goalValueLabels(form.goal_type)

  // ── Koppelen ──────────────────────────────────────────────────────────────
  // De DB-guard `trg_guard_goal_link_owner` eist dat doel, bezitting én schuld
  // alle drie van de schrijver zijn — óók op een gedeeld doel. Op andermans
  // gedeelde doel kun je dus niet koppelen; de route weigert dat met een 403.
  // Zolang we het eigen id nog niet kennen tonen we de sectie niet op een
  // gedeeld doel (liever even niets dan een sectie die straks 403 oplevert).
  const isSharedGoal = isEdit && goal!.ownership === 'shared'
  // Nog niet te bepalen (auth-call loopt): op een gedeeld doel liever even niets
  // tonen dan een sectie die straks een 403 oplevert. Bij een persoonlijk doel is
  // er niets te wachten — dat is per definitie van jou.
  const eigenaarOnbekend = isSharedGoal && userId === null
  const isForeignGoal = isSharedGoal && userId !== null && goal!.user_id !== userId
  const showAssetGroup = meta.supportsAssetLink && assets.length > 0
  const showDebtGroup = meta.supportsDebtLink && debts.length > 0
  const showLinkSection =
    !lockedToSavings &&
    !isMetricBasis &&
    !eigenaarOnbekend &&
    !isForeignGoal &&
    (showAssetGroup || showDebtGroup)

  const selectedAssets = assets.filter((a) => linkedAssetIds.includes(a.id))
  const selectedDebts = debts.filter((d) => linkedDebtIds.includes(d.id))
  const hasLinks = selectedAssets.length > 0 || selectedDebts.length > 0
  const isMixed = selectedAssets.length > 0 && selectedDebts.length > 0

  /**
   * DE huidige waarde bij ≥1 koppeling — via de gedeelde formule, niet via een
   * eigen som. Afgeleid (geen state) zodat 'ie ook meebeweegt met het doelbedrag:
   * de alleen-schulden-tak rekent `doel − saldo`.
   */
  const linkedCurrent = hasLinks
    ? computeLinkedCurrentValue(Number(form.target_value) || 0, selectedAssets, selectedDebts)
    : null

  function toggleAsset(id: string) {
    setLinkedAssetIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      // Mengen mag alleen waar het type dat toestaat; anders sluit de ene groep
      // de andere uit (zelfde regel als de oude wederzijds-exclusieve selects).
      if (next.length > 0 && !meta.allowsMixedLinks) setLinkedDebtIds([])
      return next
    })
  }

  function toggleDebt(id: string) {
    setLinkedDebtIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      if (next.length > 0 && !meta.allowsMixedLinks) setLinkedAssetIds([])
      return next
    })
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!form.name.trim()) {
      setError('Vul een naam in voor je doel.')
      return
    }
    if (!form.target_value || parseFloat(form.target_value) <= 0) {
      setError('Vul een doelwaarde groter dan 0 in.')
      return
    }

    setSaving(true)
    setError('')

    // Gedeelde velden. `metadata`, `user_id`, `household_id` en de legacy-kolommen
    // `linked_asset_id`/`linked_debt_id` staan hier bewust niet: die zijn
    // server-bepaald resp. vervangen door `links` (het schema stript ze sowieso).
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      goal_type: form.goal_type,
      target_value: parseFloat(form.target_value),
      target_date: form.target_date || null,
      icon: form.icon,
      color: form.color,
      custom_unit: form.goal_type === 'custom' ? (form.custom_unit.trim() || null) : null,
      links: { assetIds: linkedAssetIds, debtIds: linkedDebtIds },
    }

    // De huidige waarde schrijven we alleen wanneer die van de gebruiker is. Bij
    // een meelopend doel vult de server 'm live; bij koppelingen schrijven we de
    // GEDEELDE formule-uitkomst, zodat de opgeslagen waarde meteen klopt met wat
    // de loader er straks van maakt.
    if (!isMetricBasis) {
      payload.current_value = linkedCurrent ?? (parseFloat(form.current_value) || 0)
    }

    try {
      const res = await fetch('/api/goals', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEdit
            ? { id: goal!.id, ...payload }
            : {
                ...payload,
                ownership: isShared ? 'shared' : 'personal',
                ...(isMetricBasis ? { sync: 'auto' } : {}),
              },
        ),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(
          (data && typeof data.error === 'string' && data.error) ||
            'Opslaan mislukt. Probeer het opnieuw.',
        )
        setSaving(false)
        return
      }
      onSaved(isEdit ? undefined : (data?.id as string | undefined))
    } catch {
      setError('Opslaan mislukt. Controleer je verbinding en probeer het opnieuw.')
      setSaving(false)
    }
  }

  return (
    <ShellOverlay
      open={true}
      onClose={onClose}
      kind="sheet"
      size="lg"
      title={isEdit ? 'Doel bewerken' : 'Nieuw doel'}
      footer={
        <ModalFooter
          primary={{ label: 'Opslaan', onClick: () => handleSubmit(), loading: saving }}
          secondary={{ label: 'Annuleren', onClick: onClose }}
        />
      }
    >
        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div role="alert" className="mb-4 border border-negative/30 bg-negative/10 p-3 text-sm text-negative">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label htmlFor="goal-name" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                Naam
              </label>
              <input
                id="goal-name"
                type="text"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                className={inputClass}
                placeholder="bijv. Noodfonds opbouwen"
                required
              />
            </div>

            {/* Shared goal toggle — alleen bij een nieuw doel: `ownership` is
                bewust geen PATCH-veld (wie een doel ziet verander je niet in een
                generieke update). Bij bewerken tonen we de stand alleen. */}
            {hasHousehold && !isEdit && (
              <div>
                <button
                  type="button"
                  onClick={() => setIsShared(!isShared)}
                  aria-pressed={isShared}
                  className={`flex w-full items-center gap-3 border px-4 py-3 text-left transition-colors ${
                    isShared
                      ? 'border-[var(--module-active-300)] bg-[var(--module-active-50)]/40'
                      : 'border-[var(--border-md)] hover:bg-[var(--subtle)]'
                  }`}
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    isShared ? 'bg-[var(--module-active-100)]/40' : 'bg-[var(--subtle)]'
                  }`}>
                    <Users className={`h-4 w-4 ${isShared ? 'text-[var(--module-active-700)]' : 'text-[var(--ink-3)]'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${isShared ? 'text-[var(--module-active-700)]' : 'text-[var(--ink)]'}`}>
                      Gedeeld doel
                    </p>
                    <p className="text-xs text-[var(--ink-3)]">
                      {isShared
                        ? 'Beide partners zien dit doel en kunnen bijdragen'
                        : 'Maak dit een gezamenlijk doel met je partner'}
                    </p>
                  </div>
                  <div className={`h-5 w-9 rounded-full transition-colors ${isShared ? 'bg-[var(--module-active-500)]' : 'bg-[var(--border-md)]'}`}>
                    <div className={`h-5 w-5 rounded-full bg-[var(--paper)] shadow transition-transform ${isShared ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </button>
              </div>
            )}
            {hasHousehold && isEdit && goal!.ownership === 'shared' && (
              <p className="flex items-center gap-2 text-xs text-[var(--ink-3)]">
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                Gedeeld doel — beide partners zien dit doel.
              </p>
            )}

            {/* Doelbasis — alleen bij een nieuw doel */}
            {!isEdit && !lockedToSavings && (
              <div>
                <label htmlFor="goal-basis" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                  Waar meet je dit doel aan af?
                </label>
                <select
                  id="goal-basis"
                  value={basis}
                  onChange={(e) => handleBasisChange(e.target.value as DoelBasis)}
                  className={inputClass}
                >
                  <option value="manual">Een bedrag dat ik zelf bijhoud</option>
                  <optgroup label="Loopt automatisch mee">
                    {METRIC_BASIS_TYPES.map((t) => (
                      <option key={t} value={t}>{GOAL_TYPE_LABELS[t]}</option>
                    ))}
                  </optgroup>
                </select>
                <p className="mt-1.5 text-xs text-[var(--ink-3)]">
                  {basis === 'manual'
                    ? 'Je vult de voortgang zelf bij, of koppelt het doel hieronder aan je bezittingen en schulden.'
                    : `${METRIC_BASIS_UITLEG[basis] ?? GOAL_TYPE_LABELS[basis]} De app houdt dit voor je bij.`}
                </p>
              </div>
            )}

            {/* Type — alleen zinvol zolang je het doel zelf bijhoudt: bij een
                doelbasis lígt het type vast (dat ís de keuze hierboven). */}
            {!lockedToSavings && !isMetricBasis && (
              <div>
                <label htmlFor="goal-type" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                  Type doel
                </label>
                <select
                  id="goal-type"
                  value={form.goal_type}
                  disabled={isViaLabGoal}
                  onChange={(e) => {
                    const newType = e.target.value as GoalType
                    setManualType(newType)
                    setType(newType)
                  }}
                  className={`${inputClass} disabled:cursor-not-allowed disabled:bg-[var(--subtle)] disabled:text-[var(--ink-3)]`}
                >
                  <optgroup label="Financieel">
                    {(Object.keys(GOAL_TYPE_META) as GoalType[])
                      // viaLab-types (verwacht rendement, vrijheidsleeftijd) worden
                      // via het /toekomst-lab beheerd — niet vrij aanmaakbaar in
                      // GoalForm. Ze verschijnen alleen als het bestaande doel dat
                      // je bewerkt zelf van dat type is (select staat dan disabled).
                      .filter((t) => GOAL_TYPE_META[t].group === 'Financieel')
                      .filter((t) => !GOAL_TYPE_META[t].viaLab || t === form.goal_type)
                      .map((type) => (
                        <option key={type} value={type}>{GOAL_TYPE_LABELS[type]}</option>
                      ))}
                  </optgroup>
                  <optgroup label="Persoonlijk">
                    {(Object.keys(GOAL_TYPE_META) as GoalType[])
                      .filter((t) => GOAL_TYPE_META[t].group === 'Persoonlijk')
                      .filter((t) => !GOAL_TYPE_META[t].viaLab || t === form.goal_type)
                      .map((type) => (
                        <option key={type} value={type}>{GOAL_TYPE_LABELS[type]}</option>
                      ))}
                  </optgroup>
                </select>
                {isViaLabGoal && (
                  <p className="mt-1.5 text-xs text-[var(--ink-3)]">
                    Wordt beheerd via je doelsituatie op de tijdas.
                  </p>
                )}
              </div>
            )}

            {/* Custom unit field */}
            {form.goal_type === 'custom' && (
              <div>
                <label htmlFor="goal-custom-unit" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                  Eenheid
                </label>
                <input
                  id="goal-custom-unit"
                  type="text"
                  value={form.custom_unit}
                  onChange={(e) => update('custom_unit', e.target.value)}
                  className={inputClass}
                  placeholder="bijv. boeken, km, uren"
                />
              </div>
            )}

            {/* Target + Current */}
            <div className={`grid gap-4 ${lockedToSavings || isMetricBasis ? 'grid-cols-1' : 'grid-cols-2'}`}>
              <div>
                <label htmlFor="goal-target" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                  {labels.target}
                </label>
                <input
                  id="goal-target"
                  type="number"
                  inputMode="decimal"
                  min={meta.min ?? 1}
                  max={meta.max}
                  step={meta.step}
                  value={form.target_value}
                  onChange={(e) => update('target_value', e.target.value)}
                  className={`${inputClass} font-mono tabular-nums`}
                  placeholder={meta.unit === 'datum' ? String(new Date().getFullYear() + 5) : '0'}
                  required
                />
                {/* Een datumdoel wordt als decimaal jaar bewaard (2031,5 = medio
                    2031) en zó ook teruggetoond ("juli 2031"). Zonder deze regel
                    is er geen enkele aanwijzing dat de helft achter de komma
                    maanden zijn. */}
                {meta.unit === 'datum' && (
                  <p className="mt-1.5 text-xs text-[var(--ink-3)]">
                    Vul het jaar in. Een halfje erbij betekent medio dat jaar: 2031,5 = juli 2031.
                  </p>
                )}
              </div>
              {/* Bij een doelbasis verdwijnt het veld: die waarde komt van de
                  server, niet van de gebruiker. Bij koppelingen blijft het veld
                  staan maar read-only — je ziet wát er meeloopt. */}
              {!lockedToSavings && !isMetricBasis && (
                <div>
                  <label htmlFor="goal-current" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                    {labels.current}
                  </label>
                  <input
                    id="goal-current"
                    type="number"
                    inputMode="decimal"
                    min={meta.min ?? 0}
                    max={meta.max}
                    step={meta.step}
                    value={hasLinks ? String(Math.round((linkedCurrent ?? 0) * 100) / 100) : form.current_value}
                    onChange={(e) => update('current_value', e.target.value)}
                    readOnly={hasLinks}
                    aria-describedby={hasLinks ? 'goal-current-live' : undefined}
                    className={`${inputClass} font-mono tabular-nums ${
                      hasLinks ? 'cursor-not-allowed bg-[var(--subtle)] text-[var(--ink-2)]' : ''
                    }`}
                    placeholder="0"
                  />
                  {hasLinks && (
                    <p id="goal-current-live" className="mt-1.5 text-xs text-[var(--ink-3)]">
                      Loopt live mee met je koppelingen — je hoeft hier niets bij te houden.
                    </p>
                  )}
                </div>
              )}
            </div>
            {isMetricBasis && (
              <p className="text-xs text-[var(--ink-3)]">
                De huidige stand haalt de app zelf op. Je ziet 'm terug op je doelkaart.
              </p>
            )}

            {/* Deadline */}
            <div>
              <label htmlFor="goal-date" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                Deadline (optioneel)
              </label>
              <input
                id="goal-date"
                type="date"
                value={form.target_date}
                onChange={(e) => update('target_date', e.target.value)}
                className={inputClass}
              />
            </div>

            {/* ── Koppelen: bezittingen én schulden, meervoudig ── */}
            {showLinkSection && (
              <fieldset className="border-t border-[var(--border-ed)] pt-4">
                <legend className="text-sm font-medium text-[var(--ink-2)]">
                  Koppelen (optioneel)
                </legend>
                <p className="mt-1 mb-3 text-xs text-[var(--ink-3)]">
                  Vink aan waaruit dit doel is opgebouwd. De huidige waarde loopt
                  dan automatisch mee.
                </p>

                {showAssetGroup && (
                  <div className="mb-4">
                    <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
                      Koppel aan bezitting(en)
                    </p>
                    <ul className="border-t border-[var(--border-ed)]">
                      {assets.map((a) => (
                        <li key={a.id} className="border-b border-[var(--border-ed)]">
                          <label className="flex min-h-11 cursor-pointer items-center gap-3 px-1 py-2 transition-colors hover:bg-[var(--subtle)]">
                            <input
                              type="checkbox"
                              checked={linkedAssetIds.includes(a.id)}
                              onChange={() => toggleAsset(a.id)}
                              className="h-4 w-4 shrink-0 accent-[var(--module-active-500)]"
                            />
                            <span className="min-w-0 flex-1 truncate text-sm text-[var(--ink)]">
                              {a.name}
                            </span>
                            <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--ink-2)]">
                              {formatCurrency(Number(a.current_value))}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {showDebtGroup && (
                  <div className="mb-3">
                    <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
                      Koppel aan schuld(en) — afbouwdoel
                    </p>
                    <ul className="border-t border-[var(--border-ed)]">
                      {debts.map((d) => (
                        <li key={d.id} className="border-b border-[var(--border-ed)]">
                          <label className="flex min-h-11 cursor-pointer items-center gap-3 px-1 py-2 transition-colors hover:bg-[var(--subtle)]">
                            <input
                              type="checkbox"
                              checked={linkedDebtIds.includes(d.id)}
                              onChange={() => toggleDebt(d.id)}
                              className="h-4 w-4 shrink-0 accent-[var(--module-active-500)]"
                            />
                            <span className="min-w-0 flex-1 truncate text-sm text-[var(--ink)]">
                              {d.name}
                            </span>
                            <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--ink-2)]">
                              {formatCurrency(Number(d.current_balance))}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!meta.allowsMixedLinks && showAssetGroup && showDebtGroup && (
                  <p className="text-xs text-[var(--ink-3)]">
                    Bij dit doeltype kies je óf bezittingen, óf schulden.
                  </p>
                )}

                {isMixed && (
                  <p
                    data-testid="gemengde-koppeling-uitleg"
                    className="border-l-2 border-[var(--module-active-500)] pl-3 text-xs italic text-[var(--ink-2)]"
                  >
                    Er wordt netto gerekend: de waarde van je bezittingen min de
                    openstaande schuld. Nu{' '}
                    <span className="font-mono tabular-nums not-italic">
                      {formatGoalValue(linkedCurrent ?? 0, form.goal_type, form.custom_unit)}
                    </span>
                    .
                  </p>
                )}
              </fieldset>
            )}

            {/* Color + Icon */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Kleur</label>
                <div className="flex flex-wrap gap-2">
                  {GOAL_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => update('color', c.value)}
                      aria-label={`Kleur ${c.label}`}
                      aria-pressed={form.color === c.value}
                      className={`h-8 w-8 rounded-full ${c.class} ${
                        form.color === c.value ? 'ring-2 ring-offset-2 ring-[var(--ink-3)]' : ''
                      }`}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="goal-icon" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Icoon</label>
                <select
                  id="goal-icon"
                  value={form.icon}
                  onChange={(e) => update('icon', e.target.value)}
                  className={inputClass}
                >
                  {iconOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="goal-desc" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                Beschrijving (optioneel)
              </label>
              <textarea
                id="goal-desc"
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                className={inputClass}
                rows={2}
                placeholder="Waarom is dit doel belangrijk?"
              />
            </div>
          </div>
        </form>
    </ShellOverlay>
  )
}
