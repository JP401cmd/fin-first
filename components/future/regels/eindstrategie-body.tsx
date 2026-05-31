'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { STRATEGY_LABELS, type FireEndStrategy } from '@/lib/fire-strategy'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import { runRegelProjection, type RegelProjection } from '@/lib/future/regel-sim'
import {
  RegelIntro,
  RegelSectionLabel,
  RegelOptionCard,
  LiveSimImpact,
  FireDeltaFooter,
  fireDeltaMonths,
} from './shared'
import type { RegelBodyProps } from './types'

const EMPTY_PROJ: RegelProjection = { rows: [], fireAgeFractional: null }
const STRATEGY_ORDER: FireEndStrategy[] = ['deplete', 'legacy', 'perpetual', 'pensioen']
/** Strategieën die een instelbare eindleeftijd tonen (perpetual = enkel weergave-horizon). */
const SHOWS_END_AGE: Record<FireEndStrategy, boolean> = {
  deplete: true,
  legacy: true,
  perpetual: false,
  pensioen: true,
}

interface Draft {
  strategy: FireEndStrategy
  endAge: number
  legacyAmount: number
}

/**
 * Regel 1 — Eindstrategie. Diepe instelling (strategie + eindleeftijd + nalatenschap)
 * met live impact-grafiek (baseline vs. kandidaat via runRegelProjection).
 */
export function EindstrategieBody({
  simSnapshot,
  fireStrategy,
  withdrawalStrategy,
  onActionsChange,
  onClose,
  onSaved,
}: RegelBodyProps) {
  const fs = fireStrategy ?? { strategy: 'deplete' as FireEndStrategy, endAge: 90, legacyAmount: 0 }
  const [draft, setDraft] = useState<Draft>({
    strategy: fs.strategy,
    endAge: fs.endAge,
    legacyAmount: fs.legacyAmount,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounced = useDebouncedValue(draft, 200)

  // VPW is alleen combineerbaar met 'deplete' (engine geeft anders een leeg pad).
  const vpwConflict = withdrawalStrategy?.strategy === 'vpw'

  const { baseline, draftProj } = useMemo(() => {
    if (!simSnapshot) return { baseline: EMPTY_PROJ, draftProj: EMPTY_PROJ }
    const baseline = runRegelProjection(simSnapshot)
    const draftProj = runRegelProjection(simSnapshot, {
      fireStrategy: {
        strategy: debounced.strategy,
        endAge: debounced.endAge,
        legacyAmount: debounced.legacyAmount,
      },
    })
    return { baseline, draftProj }
  }, [simSnapshot, debounced])

  const endAgeValid = Number.isFinite(draft.endAge) && draft.endAge >= 50 && draft.endAge <= 120
  const legacyValid = draft.strategy !== 'legacy' || (Number.isFinite(draft.legacyAmount) && draft.legacyAmount >= 0)
  const changed =
    draft.strategy !== fs.strategy ||
    draft.endAge !== fs.endAge ||
    draft.legacyAmount !== fs.legacyAmount
  const canSave = !saving && endAgeValid && legacyValid && changed

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
            fire_end_strategy: draft.strategy,
            fire_end_age: draft.endAge,
            fire_legacy_amount: draft.strategy === 'legacy' ? draft.legacyAmount : null,
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
  }, [draft, onClose, onSaved])

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

      <RegelSectionLabel>Kies je eindstrategie</RegelSectionLabel>
      <div className="space-y-2">
        {STRATEGY_ORDER.map((key) => {
          const meta = STRATEGY_LABELS[key]
          const disabled = vpwConflict && key !== 'deplete'
          return (
            <RegelOptionCard
              key={key}
              active={draft.strategy === key}
              title={meta.name}
              description={meta.subtitle}
              onSelect={() => setDraft((d) => ({ ...d, strategy: key }))}
              disabled={disabled}
              note={
                disabled
                  ? 'Niet combineerbaar met je huidige onttrekkingsstrategie (VPW).'
                  : undefined
              }
            />
          )
        })}
      </div>

      {/* Eindleeftijd + nalatenschap (de teruggebrachte diepgang) */}
      {(SHOWS_END_AGE[draft.strategy] || draft.strategy === 'legacy') && (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SHOWS_END_AGE[draft.strategy] && (
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] mb-1">
                Eindleeftijd
              </span>
              <input
                type="number"
                min={50}
                max={120}
                value={draft.endAge}
                onChange={(e) => setDraft((d) => ({ ...d, endAge: Number(e.target.value) || 0 }))}
                className="w-28 px-3 py-2 border border-[var(--border-md)] rounded-lg bg-[var(--paper)] font-mono tabular-nums focus:border-[var(--module-active-700)] focus:outline-none"
              />
              {!endAgeValid && (
                <p className="mt-1 text-[11px] text-amber-700">Tussen 50 en 120 jaar.</p>
              )}
              <p className="mt-1 text-[11px] text-[var(--ink-3)] italic leading-snug">
                {draft.strategy === 'deplete'
                  ? 'Op deze leeftijd is je vermogen volledig opgemaakt.'
                  : draft.strategy === 'legacy'
                    ? 'Op deze leeftijd resteert het nalatenschapsbedrag.'
                    : 'Tot deze leeftijd reken je het pensioen-restant door.'}
              </p>
            </label>
          )}
          {draft.strategy === 'legacy' && (
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] mb-1">
                Nalatenschap (€)
              </span>
              <input
                type="number"
                min={0}
                step={1000}
                value={draft.legacyAmount}
                onChange={(e) => setDraft((d) => ({ ...d, legacyAmount: Number(e.target.value) || 0 }))}
                className="w-40 px-3 py-2 border border-[var(--border-md)] rounded-lg bg-[var(--paper)] font-mono tabular-nums focus:border-[var(--module-active-700)] focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-[var(--ink-3)] italic leading-snug">
                Dit bedrag (in huidige euro&apos;s) laat je na — de rest mag opraken.
              </p>
            </label>
          )}
        </div>
      )}

      {/* Live impact */}
      <div className="mt-6">
        <RegelSectionLabel>Impact op je vrijheidspad</RegelSectionLabel>
        <LiveSimImpact baseline={baseline} draft={draftProj} />
      </div>
    </div>
  )
}
