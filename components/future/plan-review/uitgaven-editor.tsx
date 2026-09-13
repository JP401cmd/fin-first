'use client'

/**
 * Stap 2 "Leven na stoppen" inline in de plan-review (TPR-15).
 *
 * Dezelfde methodekeuze en reflectieve flow als het uitgaven-scherm
 * (`components/app/horizon/uitgaven-keuze`), dezelfde context-lezing
 * (`useUitgavenContext`) en dezelfde schrijfroute (`PUT /api/fire-settings`, plus
 * `/api/retirement-aspirations` bij zelf samenstellen). Twee verschillen, allebei alleen
 * hier: een methode-klik is een CONCEPT (`opslaanBijKiezen: false`) en het effect draait
 * live mee via `runRegelProjection` met de uitgaven-override — dezelfde override die de
 * vergelijking van deze stap al gebruikt. Consume, don't recompute: de kern leidt het
 * jaarbedrag zelf af uit methode + eigen bedrag.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { formatMaskedCurrency } from '@/lib/format'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import { runRegelProjection, type RegelProjection, type RegelSimSnapshot } from '@/lib/future/regel-sim'
import { useUitgavenContext, type UitgavenContext } from '@/components/app/horizon/use-uitgaven-context'
import {
  UitgavenEigenBedrag,
  UitgavenMethodeKeuze,
  useUitgavenKeuze,
} from '@/components/app/horizon/uitgaven-keuze'
import { FireDeltaFooter, LiveSimImpact, fireDeltaMonths } from '@/components/future/regels/shared'
import { SubsectionLabel } from '@/components/editorial'
import type { PlanReviewEditorProps } from './editors'

const LEGE_PROJECTIE: RegelProjection = { rows: [], fireAgeFractional: null }

export function UitgavenEditor({ context, onActionsChange, onSaved }: PlanReviewEditorProps) {
  const { ctx, loading, error, retry } = useUitgavenContext(true)

  if (error) {
    return (
      <div className="space-y-2">
        <p role="alert" className="text-negative">Fout bij laden: {error}</p>
        <button
          type="button"
          onClick={retry}
          className="inline-flex min-h-[44px] items-center text-xs font-semibold text-[var(--ink-2)] underline hover:text-[var(--ink)]"
        >
          Opnieuw proberen
        </button>
      </div>
    )
  }
  if (loading || !ctx) {
    return (
      <p className="text-[var(--ink-3)]" aria-live="polite">
        Je uitgaven na stoppen worden geladen…
      </p>
    )
  }
  return <UitgavenEditorInhoud ctx={ctx} snapshot={context.snapshot} onActionsChange={onActionsChange} onSaved={onSaved} />
}

function UitgavenEditorInhoud({
  ctx,
  snapshot,
  onActionsChange,
  onSaved,
}: {
  ctx: UitgavenContext
  snapshot: RegelSimSnapshot | null
  onActionsChange: PlanReviewEditorProps['onActionsChange']
  onSaved: () => void
}) {
  const { masked } = useMaskedAmounts()
  const keuze = useUitgavenKeuze({
    ...ctx,
    opslaanBijKiezen: false,
    // Zelf samenstellen meldt `onSaved`, een andere methode `onSaveComplete`: in de
    // wizard betekenen ze allebei "geschreven via de bestaande route".
    onSaved,
    onSaveComplete: onSaved,
  })

  // Stabiele identiteit per waarde: een verse object-literal per render zou de debounce
  // (en daarmee twee kernel-runs) elke 200 ms opnieuw laten afgaan.
  const conceptBedrag = keuze.method === 'custom_amount' ? keuze.finalAmount : ctx.customAmount
  const conceptNu = useMemo(
    () => ({ method: keuze.method, customAmount: conceptBedrag }),
    [keuze.method, conceptBedrag],
  )
  const concept = useDebouncedValue(conceptNu, 200)
  const { baseline, draftProj } = useMemo(() => {
    if (!snapshot) return { baseline: LEGE_PROJECTIE, draftProj: LEGE_PROJECTIE }
    return {
      baseline: runRegelProjection(snapshot),
      draftProj: runRegelProjection(snapshot, { retirementExpense: concept }),
    }
  }, [snapshot, concept])

  const canSave =
    keuze.changed && !keuze.saving && (keuze.method !== 'custom_amount' || keuze.finalAmount > 0)

  // Save via ref tegen stale closures (zelfde patroon als de regel-bodies).
  const saveRef = useRef(keuze.slaConceptOp)
  useEffect(() => {
    saveRef.current = keuze.slaConceptOp
  })

  const deltaMonths = fireDeltaMonths(baseline, draftProj)
  useEffect(() => {
    onActionsChange({
      canSave,
      saving: keuze.saving,
      save: () => saveRef.current(),
      footerInfo: (
        <span className="flex flex-col leading-tight">
          {keuze.method === 'custom_amount' && (
            // Zelfde "voorlopig totaal" als de footer van het uitgaven-scherm: wat opslaan vastlegt.
            <span className="font-mono text-xs tabular-nums text-[var(--ink)]">
              {formatMaskedCurrency(keuze.finalAmount, masked)} / jr
            </span>
          )}
          <FireDeltaFooter baseline={baseline} draft={draftProj} />
        </span>
      ),
      changed: keuze.changed,
    })
    // baseline/draftProj zijn useMemo-stabiel; deltaMonths bewaakt republish.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onActionsChange, canSave, keuze.saving, keuze.changed, deltaMonths, keuze.method, keuze.finalAmount, masked])

  return (
    <div className="pb-2">
      <UitgavenMethodeKeuze
        kop="h5"
        method={keuze.method}
        previewByMethod={keuze.previewByMethod}
        budgetingActive={ctx.budgetingActive}
        saving={keuze.saving}
        onPick={keuze.pickMethod}
      />

      {keuze.method === 'custom_amount' ? (
        <UitgavenEigenBedrag
          kop="h5"
          answers={keuze.answers}
          setAnswers={keuze.setAnswers}
          showInlineSaveBlock={false}
          savedFlash={keuze.savedFlash}
          finalAmount={keuze.finalAmount}
          saving={keuze.saving}
          masked={masked}
          onSaveCustom={keuze.saveCustom}
          error={keuze.error}
        />
      ) : (
        keuze.error && (
          <p role="alert" className="mt-3 text-xs text-negative">
            {keuze.error}
          </p>
        )
      )}

      <div className="mt-6">
        <SubsectionLabel>Impact op je vrijheidspad</SubsectionLabel>
        <LiveSimImpact baseline={baseline} draft={draftProj} />
      </div>
    </div>
  )
}
