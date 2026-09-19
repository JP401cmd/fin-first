'use client'

/**
 * Stap "Waar je cijfers op rusten" inline in de plan-review (W-009, fase 1).
 *
 * ÉÉN BODY, TWEE HOSTS. Dit is géén tweede formulier: de inhoud is letterlijk
 * `CashflowGrondslagBody` — dezelfde body die het instellingenblok op
 * /overzicht/budget/transacties toont, met dezelfde lezing
 * (`GET /api/overzicht/cashflow-settings`) en dezelfde schrijfroute
 * (`PUT /api/parameters`). Verandert de keuze daar, dan verandert ze hier mee.
 *
 * DIRECT OPSLAAN, GEEN CONCEPT. Anders dan de uitgaven-editor kent dit formulier geen
 * conceptstand: een klik op een grondslag schrijft meteen weg (met optimistische
 * terugdraai bij een fout), precies zoals op het bestaande scherm. Daarom publiceert
 * deze editor `changed: false` — de pane toont dan "Bevestigen" in plaats van
 * "Opslaan en bevestigen" (TPR-15), want er valt niets meer op te slaan.
 *
 * LIVE EFFECT VIA DE KERN. De footer en de impact-strook draaien
 * `runRegelProjection` met de canonieke `RegelSimOverride.cashflow`: de twee
 * kasstroomvelden die `withResolvedKernelBedragen` vóór elke kernel-run op de
 * profielrij plakt. De kandidaat-bedragen komen uit `resolveAmountWithBasis` op de
 * cashflow-bundel (consume, don't recompute) — hier wordt niets herberekend.
 *
 * LADEN: bewust een eigen lazy fetch en NIET mee in `/api/plan-review/editor-context`.
 * Die bundel is ~25 queries in twee seriële golven; meeliften zou élke opening van de
 * wizard duurder maken, ook voor wie deze stap nooit opent.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import { runRegelProjection, type RegelProjection, type RegelSimSnapshot } from '@/lib/future/regel-sim'
import { FireDeltaFooter, LiveSimImpact, fireFooterSleutel } from '@/components/future/regels/shared'
import { SubsectionLabel } from '@/components/editorial'
import {
  CashflowGrondslagBody,
  useCashflowGrondslag,
  type CashflowGrondslagControl,
} from '@/components/overview/cashflow-grondslag-body'
import type { CashflowSettingsData } from '@/lib/cashflow-settings-data'
import type { PlanReviewEditorProps } from './editors'

const LEGE_PROJECTIE: RegelProjection = { rows: [], fireAgeFractional: null }

export function GrondslagEditor({ context, onActionsChange, onSaved }: PlanReviewEditorProps) {
  const [data, setData] = useState<CashflowSettingsData | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [poging, setPoging] = useState(0)

  useEffect(() => {
    let afgebroken = false
    setFout(null)
    void (async () => {
      try {
        const res = await fetch('/api/overzicht/cashflow-settings')
        if (!res.ok) throw new Error('niet ok')
        const bundel = (await res.json()) as CashflowSettingsData
        if (!afgebroken) setData(bundel)
      } catch {
        if (!afgebroken) setFout('Je grondslag kon niet geladen worden.')
      }
    })()
    return () => {
      afgebroken = true
    }
  }, [poging])

  if (fout) {
    return (
      <div className="space-y-2">
        <p role="alert" className="text-negative">{fout}</p>
        <button
          type="button"
          onClick={() => setPoging((p) => p + 1)}
          className="inline-flex min-h-[44px] items-center text-xs font-semibold text-[var(--ink-2)] underline hover:text-[var(--ink)]"
        >
          Opnieuw proberen
        </button>
      </div>
    )
  }
  if (!data) {
    return (
      <p className="text-[var(--ink-3)]" aria-live="polite">
        Je grondslag wordt geladen…
      </p>
    )
  }
  return <GrondslagEditorInhoud data={data} snapshot={context.snapshot} onActionsChange={onActionsChange} onSaved={onSaved} />
}

function GrondslagEditorInhoud({
  data,
  snapshot,
  onActionsChange,
  onSaved,
}: {
  data: CashflowSettingsData
  snapshot: RegelSimSnapshot | null
  onActionsChange: PlanReviewEditorProps['onActionsChange']
  onSaved: PlanReviewEditorProps['onSaved']
}) {
  // Een geslaagde schrijfactie meldt zich, maar mag de wizard NIET vooruitduwen: de
  // gebruiker stelt hier twee kanten in en zou na de eerste klik al doorgeschoven zijn.
  // De markering zet hij zelf met "Bevestigen"; deze ref houdt alleen bij dát er
  // geschreven is, voor het geval een latere fase daarop wil leunen.
  const geschrevenRef = useRef(false)
  const onPersisted = useCallback(() => {
    geschrevenRef.current = true
  }, [])

  const ctrl = useCashflowGrondslag(data, { onSaved: onPersisted, refreshRouter: false })

  return (
    <GrondslagEditorBody ctrl={ctrl} snapshot={snapshot} onActionsChange={onActionsChange} onSaved={onSaved} />
  )
}

function GrondslagEditorBody({
  ctrl,
  snapshot,
  onActionsChange,
}: {
  ctrl: CashflowGrondslagControl
  snapshot: RegelSimSnapshot | null
  onActionsChange: PlanReviewEditorProps['onActionsChange']
  onSaved: PlanReviewEditorProps['onSaved']
}) {
  // Stabiele identiteit per waarde: een verse object-literal per render zou de debounce
  // (en daarmee twee kernel-runs) elke 200 ms opnieuw laten afgaan.
  const kandidaatNu = useMemo(
    () => ({ monthlyIncome: ctrl.monthlyIncome, monthlyExpenses: ctrl.monthlyExpenses }),
    [ctrl.monthlyIncome, ctrl.monthlyExpenses],
  )
  const kandidaat = useDebouncedValue(kandidaatNu, 200)

  const { baseline, draftProj } = useMemo(() => {
    if (!snapshot) return { baseline: LEGE_PROJECTIE, draftProj: LEGE_PROJECTIE }
    return {
      baseline: runRegelProjection(snapshot),
      draftProj: runRegelProjection(snapshot, { cashflow: kandidaat }),
    }
  }, [snapshot, kandidaat])

  const footerSleutel = fireFooterSleutel(baseline, draftProj)
  useEffect(() => {
    onActionsChange({
      canSave: false,
      saving: ctrl.syncing,
      // Deze body schrijft al bij elke keuze; er is geen concept om op te slaan.
      save: () => {},
      footerInfo: <FireDeltaFooter baseline={baseline} draft={draftProj} />,
      changed: false,
    })
    // baseline/draftProj zijn useMemo-stabiel; footerSleutel bewaakt republish.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onActionsChange, ctrl.syncing, footerSleutel])

  return (
    <div className="pb-2">
      <CashflowGrondslagBody ctrl={ctrl} kop="h5" />

      <div className="mt-6">
        <SubsectionLabel>Impact op je vrijheidspad</SubsectionLabel>
        <LiveSimImpact baseline={baseline} draft={draftProj} />
      </div>
    </div>
  )
}
