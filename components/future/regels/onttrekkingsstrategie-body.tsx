'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { WithdrawalStrategyType, WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
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

const STRATEGY_INFO: Record<WithdrawalStrategyType, { label: string; description: string }> = {
  static: {
    label: 'Vast (4%)',
    description:
      'Klassiek SWR — elk jaar een vast, inflatie-geïndexeerd bedrag. Voorspelbaar, reageert niet op de markt.',
  },
  guardrails: {
    label: 'Guardrails',
    description:
      'Dynamische bandbreedte: verlaagt opname bij slechte beursjaren, verhoogt bij goede. Robuust tegen sequence-risk.',
  },
  vpw: {
    label: 'VPW',
    description:
      'Variable Percentage Withdrawal — percentage stijgt met je leeftijd. Maximaliseert consumptie; vermogen op = op.',
  },
  bucket: {
    label: 'Bucket',
    description:
      'Cash-buffer gescheiden van het lange-termijn portfolio. Uitgaven uit cash, herbalanceer in goede jaren.',
  },
}

const STRATEGY_ORDER: WithdrawalStrategyType[] = ['static', 'guardrails', 'vpw', 'bucket']

type Draft = WithdrawalStrategyConfig

function GuardrailSlider({
  label,
  value,
  min,
  max,
  onChange,
  hint,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  hint?: string
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold text-[var(--ink-2)]">{label}</span>
        <span className="font-mono tabular-nums text-sm text-[var(--ink)]">
          {Math.round(value * 100)}%
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--module-active-700)]"
      />
      {hint && <p className="text-[10px] text-[var(--ink-3)] italic leading-snug">{hint}</p>}
    </label>
  )
}

/**
 * Regel 2 — Onttrekkingsstrategie. Strategie-keuze + (bij guardrails) de teruggebrachte
 * floor/ceiling/cut/raise-instellingen, met live impact-grafiek.
 */
export function OnttrekkingsstrategieBody({
  simSnapshot,
  fireStrategy,
  withdrawalStrategy,
  onActionsChange,
  onClose,
  onSaved,
}: RegelBodyProps) {
  const ws = withdrawalStrategy ?? WITHDRAWAL_DEFAULTS
  const [draft, setDraft] = useState<Draft>({ ...ws })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounced = useDebouncedValue(draft, 200)

  // VPW combineert alleen met de eindstrategie 'deplete'.
  const vpwBlocked =
    fireStrategy != null && fireStrategy.strategy !== 'deplete'

  const { baseline, draftProj } = useMemo(() => {
    if (!simSnapshot) return { baseline: EMPTY_PROJ, draftProj: EMPTY_PROJ }
    const baseline = runRegelProjection(simSnapshot)
    const draftProj = runRegelProjection(simSnapshot, { withdrawalStrategy: { ...debounced } })
    return { baseline, draftProj }
  }, [simSnapshot, debounced])

  const isGuardrails = draft.strategy === 'guardrails'
  const floorCeilingValid = !isGuardrails || draft.guardrailFloor < draft.guardrailCeiling
  const changed =
    draft.strategy !== ws.strategy ||
    draft.guardrailFloor !== ws.guardrailFloor ||
    draft.guardrailCeiling !== ws.guardrailCeiling ||
    draft.guardrailCutStep !== ws.guardrailCutStep ||
    draft.guardrailRaiseStep !== ws.guardrailRaiseStep
  const canSave = !saving && floorCeilingValid && changed

  const saveRef = useRef(async () => {})
  useEffect(() => {
    saveRef.current = async () => {
      setSaving(true)
      setError(null)
      try {
        const res = await fetch('/api/withdrawal-strategy', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            withdrawal_strategy: draft.strategy,
            guardrail_floor: draft.guardrailFloor,
            guardrail_ceiling: draft.guardrailCeiling,
            guardrail_cut_step: draft.guardrailCutStep,
            guardrail_raise_step: draft.guardrailRaiseStep,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onActionsChange, canSave, saving, deltaMonths])

  return (
    <div className="pb-6">
      <RegelIntro regelId="onttrekkingsstrategie" />

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </div>
      )}

      <RegelSectionLabel>Kies je onttrekkingsstrategie</RegelSectionLabel>
      <div className="space-y-2">
        {STRATEGY_ORDER.map((key) => {
          const info = STRATEGY_INFO[key]
          const disabled = key === 'vpw' && vpwBlocked
          return (
            <RegelOptionCard
              key={key}
              active={draft.strategy === key}
              title={info.label}
              description={info.description}
              onSelect={() => setDraft((d) => ({ ...d, strategy: key }))}
              disabled={disabled}
              note={
                disabled
                  ? 'VPW werkt alleen met de eindstrategie ‘Vermogen opeten’.'
                  : undefined
              }
            />
          )
        })}
      </div>

      {/* Guardrail-verfijning — de teruggebrachte diepgang */}
      {isGuardrails && (
        <div className="mt-5 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-4 space-y-4">
          <RegelSectionLabel>Verfijn je guardrails</RegelSectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <GuardrailSlider
              label="Ondergrens (floor)"
              value={draft.guardrailFloor}
              min={0.5}
              max={1.0}
              onChange={(v) => setDraft((d) => ({ ...d, guardrailFloor: v }))}
              hint="Minimale opname als % van je basisbudget."
            />
            <GuardrailSlider
              label="Bovengrens (ceiling)"
              value={draft.guardrailCeiling}
              min={1.0}
              max={2.0}
              onChange={(v) => setDraft((d) => ({ ...d, guardrailCeiling: v }))}
              hint="Maximale opname als % van je basisbudget."
            />
            <GuardrailSlider
              label="Verlaging bij dip"
              value={draft.guardrailCutStep}
              min={0.05}
              max={0.5}
              onChange={(v) => setDraft((d) => ({ ...d, guardrailCutStep: v }))}
              hint="Stap waarmee je opname daalt na een slecht beursjaar."
            />
            <GuardrailSlider
              label="Verhoging bij top"
              value={draft.guardrailRaiseStep}
              min={0.05}
              max={0.5}
              onChange={(v) => setDraft((d) => ({ ...d, guardrailRaiseStep: v }))}
              hint="Stap waarmee je opname stijgt na een goed beursjaar."
            />
          </div>
          {!floorCeilingValid && (
            <p className="text-[11px] text-amber-700">Ondergrens moet lager zijn dan de bovengrens.</p>
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
