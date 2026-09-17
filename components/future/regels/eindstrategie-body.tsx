'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import { runRegelProjection, type RegelProjection } from '@/lib/future/regel-sim'
import { StopPlanVragen } from '@/components/horizon/stop-plan-vragen'
import {
  planDraftEquals,
  planDraftFromPlan,
  planDraftFromSettings,
  planDraftToFireSettingsBody,
  validatePlanDraft,
  type PlanDraft,
} from '@/lib/horizon/plan-draft'
import { SubsectionLabel } from '@/components/editorial'
import {
  RegelIntro,
  LiveSimImpact,
  FireDeltaFooter,
  fireFooterSleutel,
} from './shared'
import type { RegelBodyProps } from './types'

const EMPTY_PROJ: RegelProjection = { rows: [], fireAgeFractional: null }

/** V7 — Excel-default tekort-lening-rente (P!B25 = 0,05 → 5%). */
const DEFAULT_DEFICIT_PCT = 5

/**
 * TPR-12 — uitleg bij de schakelaar, norm keuze · effect · waarom (eigenaarsnorm
 * 13 sep 2026), beschrijvend. Wat de kern doet: `gap.ts` toetst het nalatenschapsbedrag
 * op Prognose!I (totaal netto vermogen incl. niet-liquide bezit) bij 'Ja', anders op
 * Prognose!J (alleen liquide). Geëxporteerd voor de test.
 */
export const NALATENSCHAP_NIET_LIQUIDE_UITLEG =
  'Je kiest of je eigen woning en ander niet-liquide bezit meetellen in het bedrag dat op de ' +
  'eindleeftijd over moet zijn. Aan: de app toetst dat bedrag op je totale vermogen, inclusief de ' +
  'woning. Uit (standaard): alleen op het geld dat je vrij kunt opnemen, dus dat bedrag moet ook ' +
  'liquide overblijven. Dat verandert hoeveel je onderweg kunt onttrekken, en dus wanneer je vrij ' +
  'bent. Relevant omdat een woning wel waarde heeft, maar niet zomaar opneembaar is.'

/**
 * ADR 0149 — uitleg bij "Geen tekort-lening in mijn plan", norm keuze · effect · waarom.
 * Beschrijvend (Wft): wat de berekening doet, geen advies. Geëxporteerd voor de test.
 */
export const GEEN_TEKORT_LENING_UITLEG =
  'Je kiest of je plan mag leunen op een tekort-lening: geld dat de berekening leent zodra je ' +
  'vermogen op is en je inkomen je uitgaven nog niet dekt. Aan (standaard): je vrijheidsleeftijd ' +
  'is het vroegste moment waarop je zonder zo’n lening tot het einde van je plan komt; een korte ' +
  'overbrugging die binnen een jaar is afgelost, zoals rond een huisverkoop, telt niet mee. Uit: ' +
  'de berekening mag gaten overbruggen met een lening, waardoor je eerder vrij kunt lijken. Relevant omdat vrij met een schuld die je later moet terugbetalen iets anders is dan ' +
  'vrij zonder schuld.'

/**
 * Regel 1 — de plan-regel als TWEE VRAGEN (ADR 0129 B13: Voorkeuren is de bron;
 * de strategie-modal op /toekomst spiegelt dezelfde twee vragen via hetzelfde
 * `StopPlanVragen`-component). Vraag 1 = het stop-anker, vraag 2 = de eind-vorm met
 * eindleeftijd en nalatenschap. Live impact-grafiek (baseline vs. kandidaat via
 * `runRegelProjection`, met het volledige plan-concept als override zodat de kernel
 * het anker meerekent).
 *
 * Vóór F3b stond hier een handmatige strategie-lijst van vijf waarden waarin
 * 'pensioen' en 'nu-stoppen' als eind-vormen meeliepen — de conflatie die dit besluit
 * opheft.
 */
export function EindstrategieBody({
  simSnapshot,
  fireStrategy,
  firePlan,
  onActionsChange,
  onClose,
  onSaved,
}: RegelBodyProps) {
  // Bron: het plan uit de bundel; zonder plan (oude bundel) de legacy-label.
  const opgeslagen = useMemo<PlanDraft>(
    () =>
      firePlan
        ? planDraftFromPlan(firePlan)
        : planDraftFromSettings({
            fire_end_strategy: fireStrategy?.strategy ?? 'deplete',
            fire_end_age: fireStrategy?.endAge ?? 90,
            fire_legacy_amount: fireStrategy?.legacyAmount ?? 0,
          }),
    [firePlan, fireStrategy],
  )
  const [draft, setDraft] = useState<PlanDraft>(opgeslagen)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounced = useDebouncedValue(draft, 200)

  // V7 — tekort-lening-rente (percentage). De pane levert dit veld niet mee, dus
  // lezen we het zelf uit /api/fire-settings; NULL = Excel-default (5%). Opslaan
  // gaat via dezelfde PUT als het plan (deficit_loan_rate als fractie 0..1).
  const [deficitPct, setDeficitPct] = useState(DEFAULT_DEFICIT_PCT)
  const [savedDeficitPct, setSavedDeficitPct] = useState(DEFAULT_DEFICIT_PCT)
  const [deficitLoaded, setDeficitLoaded] = useState(false)
  // TPR-12 — niet-liquide bezit meetellen in de nalatenschap (kernel P!B54). NULL in de
  // kolom = kernel-default 'Nee' → schakelaar uit. Alleen zichtbaar bij eind-vorm
  // nalatenschap; dezelfde GET/PUT als de tekort-lening-rente.
  const [includeIlliquid, setIncludeIlliquid] = useState(false)
  const [savedIncludeIlliquid, setSavedIncludeIlliquid] = useState(false)
  // ADR 0149 — geen tekort-lening in het plan. Standaard AAN: NULL in de kolom = aan,
  // alleen een bewuste `false` = uit (aanvulling 17 sep 2026).
  const [geenTekortLening, setGeenTekortLening] = useState(true)
  const [savedGeenTekortLening, setSavedGeenTekortLening] = useState(true)
  useEffect(() => {
    let cancelled = false
    fetch('/api/fire-settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return
        const raw = d.deficit_loan_rate
        if (raw != null && Number.isFinite(Number(raw))) {
          const pct = Number(raw) * 100
          setDeficitPct(pct)
          setSavedDeficitPct(pct)
        }
        const illiquid = d.fire_legacy_include_illiquid === true
        setIncludeIlliquid(illiquid)
        setSavedIncludeIlliquid(illiquid)
        const geenTekort = d.fire_no_deficit_loan !== false
        setGeenTekortLening(geenTekort)
        setSavedGeenTekortLening(geenTekort)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDeficitLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])
  const deficitValid = Number.isFinite(deficitPct) && deficitPct >= 0 && deficitPct <= 100

  const isLegacy = draft.endForm === 'legacy'
  const { baseline, draftProj } = useMemo(() => {
    if (!simSnapshot) return { baseline: EMPTY_PROJ, draftProj: EMPTY_PROJ }
    const baseline = runRegelProjection(simSnapshot)
    // De schakelaar reist mee in de live-sim (kernel leest 'm via de rauwe context),
    // alleen onder nalatenschap — daarbuiten heeft P!B54 geen betekenis.
    const draftProj = runRegelProjection(simSnapshot, {
      firePlan: debounced,
      ...(debounced.endForm === 'legacy' ? { legacyIncludeIlliquid: includeIlliquid } : {}),
      geenTekortLening,
    })
    return { baseline, draftProj }
  }, [simSnapshot, debounced, includeIlliquid, geenTekortLening])

  // De AOW-toets kan alleen hier (de route kent de AOW niet): uit de snapshot, die
  // dezelfde tabel-lookup draagt als de Tijdas.
  const aowAge = simSnapshot?.aowFractional ?? null
  const validatie = validatePlanDraft(draft, { aowAge })
  const illiquidChanged = isLegacy && includeIlliquid !== savedIncludeIlliquid
  const changed =
    !planDraftEquals(draft, opgeslagen) ||
    deficitPct !== savedDeficitPct ||
    illiquidChanged ||
    geenTekortLening !== savedGeenTekortLening
  const canSave = !saving && validatie.ok && deficitValid && changed

  // Save-handler via ref tegen stale closures (zelfde patroon als event-pane-edit).
  const saveRef = useRef(async () => {})
  useEffect(() => {
    saveRef.current = async () => {
      setSaving(true)
      setError(null)
      try {
        const res = await fetch('/api/fire-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Altijd het volledige plan (route-contract R3): eind-vorm + anker.
            ...planDraftToFireSettingsBody(draft),
            // V7 — tekort-lening-rente als fractie 0..1.
            deficit_loan_rate: deficitPct / 100,
            // TPR-12 — alleen meesturen onder nalatenschap (daarbuiten blijft de kolom staan).
            ...(draft.endForm === 'legacy' ? { fire_legacy_include_illiquid: includeIlliquid } : {}),
            fire_no_deficit_loan: geenTekortLening,
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setError(data?.error ?? 'Opslaan mislukt')
          setSaving(false)
          return
        }
        setSaving(false)
        onClose()
        onSaved()
      } catch {
        setError('Opslaan mislukt — netwerkfout')
        setSaving(false)
      }
    }
  }, [draft, deficitPct, includeIlliquid, geenTekortLening, onClose, onSaved])

  const footerSleutel = fireFooterSleutel(baseline, draftProj)
  useEffect(() => {
    onActionsChange({
      canSave,
      saving,
      save: () => saveRef.current(),
      footerInfo: <FireDeltaFooter baseline={baseline} draft={draftProj} />,
      changed,
    })
    // baseline/draftProj zijn useMemo-stabiel; footerSleutel bewaakt republish.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onActionsChange, canSave, saving, footerSleutel, changed])

  return (
    <div className="pb-6">
      <RegelIntro regelId="eindstrategie" />

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </div>
      )}

      <StopPlanVragen
        value={draft}
        onChange={setDraft}
        errors={validatie.errors}
        aowAge={aowAge}
        currentAge={null}
        solvedFireAge={simSnapshot ? baseline.fireAgeFractional : null}
      />

      {/* TPR-12 — niet-liquide bezit meetellen in de nalatenschap (alleen bij eind-vorm nalatenschap). */}
      {isLegacy && (
        <div
          aria-busy={!deficitLoaded}
          className={`mt-6 transition-opacity duration-300 ${deficitLoaded ? 'opacity-100' : 'opacity-60'}`}
        >
          <SubsectionLabel>Wat telt mee voor het bedrag dat over moet zijn</SubsectionLabel>
          <button
            type="button"
            role="switch"
            aria-checked={includeIlliquid}
            onClick={() => setIncludeIlliquid((v) => !v)}
            className="flex w-full items-start gap-3 text-left"
          >
            <span
              className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
                includeIlliquid
                  ? 'border-[var(--module-active-700)] bg-[var(--module-active-700)]'
                  : 'border-[var(--border-md)] bg-[var(--paper)]'
              }`}
              aria-hidden="true"
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-[var(--paper)] shadow transition-transform ${
                  includeIlliquid ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[var(--ink)]">
                Niet-liquide bezit meetellen in de nalatenschap
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-[var(--ink-2)]">
                {NALATENSCHAP_NIET_LIQUIDE_UITLEG}
              </span>
            </span>
          </button>
        </div>
      )}

      {/* ADR 0149 — geen tekort-lening in het plan (hoofdinstelling, dezelfde PUT). */}
      <div
        id="geen-tekort-lening"
        aria-busy={!deficitLoaded}
        className={`mt-6 transition-opacity duration-300 ${deficitLoaded ? 'opacity-100' : 'opacity-60'}`}
      >
        <SubsectionLabel>Tekort-lening</SubsectionLabel>
        <button
          type="button"
          role="switch"
          aria-checked={geenTekortLening}
          onClick={() => setGeenTekortLening((v) => !v)}
          className="flex w-full items-start gap-3 text-left"
        >
          <span
            className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
              geenTekortLening
                ? 'border-[var(--module-active-700)] bg-[var(--module-active-700)]'
                : 'border-[var(--border-md)] bg-[var(--paper)]'
            }`}
            aria-hidden="true"
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-[var(--paper)] shadow transition-transform ${
                geenTekortLening ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[var(--ink)]">
              Geen tekort-lening in mijn plan
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-[var(--ink-2)]">
              {GEEN_TEKORT_LENING_UITLEG}
            </span>
          </span>
        </button>
      </div>

      {/* V7 — tekort-lening-rente (FIRE-instelling, opgeslagen via dezelfde PUT). */}
      <div
        aria-busy={!deficitLoaded}
        className={`mt-6 transition-opacity duration-300 ${deficitLoaded ? 'opacity-100' : 'opacity-60'}`}
      >
        <SubsectionLabel>Rente tekort-lening</SubsectionLabel>
        <label className="block">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              step={0.25}
              value={deficitPct}
              onChange={(e) => setDeficitPct(Number(e.target.value))}
              aria-label="Rente tekort-lening in procent per jaar"
              className="w-24 px-3 py-2 border border-[var(--border-md)] rounded-lg bg-[var(--paper)] font-mono tabular-nums focus:border-[var(--module-active-700)] focus:outline-none"
            />
            <span className="text-sm text-[var(--ink-3)]">% per jaar</span>
          </div>
          {!deficitValid && (
            <p className="mt-1 text-[11px] text-amber-700">Tussen 0% en 100%.</p>
          )}
          <p className="mt-1 text-[11px] text-[var(--ink-3)] italic leading-snug">
            Zijn je uitgaven in een jaar niet gedekt door vermogen of inkomen, dan leent de
            projectie het tekort tegen deze rente. Standaard 5%.
          </p>
        </label>
      </div>

      {/* Live impact */}
      <div className="mt-6">
        <SubsectionLabel>Impact op je vrijheidspad</SubsectionLabel>
        <LiveSimImpact baseline={baseline} draft={draftProj} />
      </div>
    </div>
  )
}
