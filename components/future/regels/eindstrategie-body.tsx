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
  fireDeltaMonths,
} from './shared'
import type { RegelBodyProps } from './types'

const EMPTY_PROJ: RegelProjection = { rows: [], fireAgeFractional: null }

/** V7 — Excel-default tekort-lening-rente (P!B25 = 0,05 → 5%). */
const DEFAULT_DEFICIT_PCT = 5

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

  const { baseline, draftProj } = useMemo(() => {
    if (!simSnapshot) return { baseline: EMPTY_PROJ, draftProj: EMPTY_PROJ }
    const baseline = runRegelProjection(simSnapshot)
    const draftProj = runRegelProjection(simSnapshot, { firePlan: debounced })
    return { baseline, draftProj }
  }, [simSnapshot, debounced])

  // De AOW-toets kan alleen hier (de route kent de AOW niet): uit de snapshot, die
  // dezelfde tabel-lookup draagt als de Tijdas.
  const aowAge = simSnapshot?.aowFractional ?? null
  const validatie = validatePlanDraft(draft, { aowAge })
  const changed = !planDraftEquals(draft, opgeslagen) || deficitPct !== savedDeficitPct
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
  }, [draft, deficitPct, onClose, onSaved])

  const deltaMonths = fireDeltaMonths(baseline, draftProj)
  useEffect(() => {
    onActionsChange({
      canSave,
      saving,
      save: () => saveRef.current(),
      footerInfo: <FireDeltaFooter baseline={baseline} draft={draftProj} />,
    })
    // baseline/draftProj zijn useMemo-stabiel; deltaMonths bewaakt republish.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onActionsChange, canSave, saving, deltaMonths])

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
