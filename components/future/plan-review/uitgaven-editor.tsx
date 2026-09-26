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
import { FireDeltaFooter, LiveSimImpact, fireFooterSleutel } from '@/components/future/regels/shared'
import { SubsectionLabel } from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { PlanReviewEditorProps } from './editors'

const LEGE_PROJECTIE: RegelProjection = { rows: [], fireAgeFractional: null }

export function UitgavenEditor({ context, onActionsChange, onSaved }: PlanReviewEditorProps) {
  return <UitgavenBody snapshot={context.snapshot} onActionsChange={onActionsChange} onSaved={onSaved} />
}

/**
 * De body zelf (één body, twee hosts — ADR 0142/0179): de wizardstap "Leven na stoppen" en
 * de rij "Uitgave na pensioen" in katern Instellingen (`UitgavenRijPane`). Laadt de
 * uitgaven-context zelf; `metKop` toont het huidige jaarbedrag met de prijspeil-noot
 * (wat de oude uitgaven-pane bovenaan had).
 */
export function UitgavenBody({
  snapshot,
  onActionsChange,
  onSaved,
  metKop = false,
}: {
  snapshot: RegelSimSnapshot | null
  onActionsChange: PlanReviewEditorProps['onActionsChange']
  onSaved: () => void
  metKop?: boolean
}) {
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
  return (
    <UitgavenEditorInhoud ctx={ctx} snapshot={snapshot} onActionsChange={onActionsChange} onSaved={onSaved} metKop={metKop} />
  )
}

function UitgavenEditorInhoud({
  ctx,
  snapshot,
  onActionsChange,
  onSaved,
  metKop,
}: {
  ctx: UitgavenContext
  snapshot: RegelSimSnapshot | null
  onActionsChange: PlanReviewEditorProps['onActionsChange']
  onSaved: () => void
  metKop: boolean
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

  const footerSleutel = fireFooterSleutel(baseline, draftProj)
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
    // baseline/draftProj zijn useMemo-stabiel; footerSleutel bewaakt republish.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onActionsChange, canSave, keuze.saving, keuze.changed, footerSleutel, keuze.method, keuze.finalAmount, masked])

  return (
    <div className="pb-2">
      {metKop && (
        <div className="mb-5 border-b border-t border-[var(--ink)] py-4" data-testid="uitgaven-kop">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
            {keuze.method === 'custom_amount' ? 'Voorlopig' : 'Huidig'}
          </p>
          <p className="font-serif text-3xl font-black leading-none tracking-[-0.02em] text-[var(--ink)]">
            <MaskedAmount value={keuze.heroAmount} tone="horizon" monoWhenVisible={false} />
            <span className="ml-2 text-base font-normal text-[var(--ink-3)]">/ jaar</span>
          </p>
          {keuze.dailyPrice > 0 && (
            <p className="mt-1 text-sm italic text-[var(--ink-3)]">
              ≈ {formatMaskedCurrency(Math.round(keuze.dailyPrice), masked)}/dag ·{' '}
              {formatMaskedCurrency(Math.round(keuze.heroAmount / 12), masked)}/maand
            </p>
          )}
          <p className="mt-3 text-xs leading-snug text-[var(--ink-2)]">
            Alle bedragen hier zijn in prijspeil van vandaag. Inflatie rekent je projectie apart mee.
          </p>
        </div>
      )}
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
