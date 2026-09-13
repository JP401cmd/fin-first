'use client'

/**
 * Laag 2 "Voor wie wil" inline in de plan-review (TPR-15; besluit eigenaar 13 sep 2026: één
 * waarde met live effect, een bereik later op een eigen kaart).
 *
 * Vier onderdelen, elk op het afsluitscherm van de pane in te stellen:
 *  - inflatie en bruto rendement — de BESTAANDE `VoorkeurBewerkenBody` (zelfde body en
 *    schrijfroute `PUT /api/parameters` als de Voorkeuren-kaarten en de optimizer-chip);
 *  - Box 3-methode + heffingvrij inkomen — de BESTAANDE `Box3MethodeBody`;
 *  - rendement per eigen bezitting — via de smalle route `PATCH /api/assets/[id]/expected-return`,
 *    met dezelfde band per type en dezelfde veldnaam als het bezittingenformulier.
 *
 * Het live effect draait op de client-veilige snapshot (`runRegelProjection` met de
 * `parameters`- of `assetExpectedReturns`-override); hier wordt niets zelf berekend. Laag 2
 * hoort niet bij een stap: opslaan zet geen markering (de pane regelt dat).
 */

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { VoorkeurBewerkenBody, VOORKEUR_UITLEG } from '@/components/future/voorkeur-bewerken-body'
import { Box3MethodeBody } from '@/components/future/box3-methode-body'
import { FireDeltaFooter, fireFooterSleutel } from '@/components/future/regels/shared'
import type { RegelEditActionsState } from '@/components/future/regels/types'
import { runRegelProjection, type RegelSimSnapshot } from '@/lib/future/regel-sim'
import { BOX3_METHOD_LABELS } from '@/lib/box3-method'
import { TYPICAL_RETURNS } from '@/lib/asset-data'
import {
  assetReturnBand,
  assetReturnLabel,
  isWithinAssetReturnBand,
} from '@/lib/asset-parameter-bands'
import { EXCEL_HEFFINGVRIJ_INKOMEN_PP } from '@/lib/horizon-kernel/adapter/defaults'
import type { PlanReviewLaag2Bezitting, PlanReviewLaag2Context } from '@/lib/plan-review/editor-context'
import type { PlanReviewLaag2Onderdeel } from '@/lib/plan-review/types'

export interface PlanReviewLaag2EditorProps {
  laag2: PlanReviewLaag2Context
  /** Client-veilig; `null` = geen run → geen live effect, opslaan blijft mogelijk. */
  snapshot: RegelSimSnapshot | null
  onActionsChange: (s: RegelEditActionsState) => void
  /** Na een geslaagde write via de bestaande route. */
  onSaved: () => void
}

/** Fractie → percentage zoals het invoerveld 'm toont (0,07 → 7; 0,025 → 2,5), zonder float-ruis. */
function naarPct(fractie: number): number {
  return Math.round(fractie * 10_000) / 100
}

function formatPct(pct: number): string {
  return `${pct.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`
}

/** De huidige waarde per onderdeel zoals het afsluitscherm 'm toont. */
export function laag2Waarde(onderdeel: PlanReviewLaag2Onderdeel, laag2: PlanReviewLaag2Context): string {
  switch (onderdeel) {
    case 'inflatie':
      return `${formatPct(naarPct(laag2.inflationRate))} per jaar`
    case 'bruto-rendement':
      return `${formatPct(naarPct(laag2.terugvalRendement))} per jaar`
    case 'box3':
      return laag2.box3Method === 'werkelijk'
        ? `${BOX3_METHOD_LABELS.werkelijk} · € ${(laag2.box3HeffingvrijInkomen ?? EXCEL_HEFFINGVRIJ_INKOMEN_PP).toLocaleString('nl-NL')} heffingvrij`
        : BOX3_METHOD_LABELS[laag2.box3Method]
    case 'rendement-bezitting': {
      // Alleen wat hier in te stellen is: afschrijvend bezit rekent zonder rendement.
      const n = laag2.bezittingen.filter((b) => !b.afschrijvend).length
      return n === 0 ? 'Geen bezittingen om in te stellen' : n === 1 ? '1 bezitting' : `${n} bezittingen`
    }
  }
}

/** De wizard sluit niet bij opslaan zonder wijziging: de host beslist. */
const blijfOpen = () => {}

function InflatieEditor({ laag2, snapshot, onActionsChange, onSaved }: PlanReviewLaag2EditorProps) {
  return (
    <VoorkeurBewerkenBody
      title="Inflatie"
      column="inflation_rate"
      currentValuePct={naarPct(laag2.inflationRate)}
      helperText={VOORKEUR_UITLEG.inflation_rate}
      kop="h5"
      snapshot={snapshot}
      onActionsChange={onActionsChange}
      onSaved={onSaved}
      onOngewijzigd={blijfOpen}
    />
  )
}

function BrutoRendementEditor({ laag2, snapshot, onActionsChange, onSaved }: PlanReviewLaag2EditorProps) {
  return (
    <div className="space-y-3">
      {laag2.zonderEigenRendement === 0 && (
        <p className="text-xs text-[var(--ink)]">
          {laag2.bezittingen.length === 0
            ? 'Je hebt nog geen eigen bezittingen. Dit getal telt voor een bezitting zonder eigen rendement.'
            : 'Al je bezittingen hebben een eigen rendement. Dit getal verandert je plan nu dus niet; het telt pas voor een bezitting zonder eigen rendement.'}
        </p>
      )}
      <VoorkeurBewerkenBody
        title="Bruto rendement"
        column="expected_return"
        currentValuePct={naarPct(laag2.terugvalRendement)}
        helperText={VOORKEUR_UITLEG.expected_return}
        kop="h5"
        snapshot={snapshot}
        onActionsChange={onActionsChange}
        onSaved={onSaved}
        onOngewijzigd={blijfOpen}
      />
    </div>
  )
}

function Box3Editor({ laag2, snapshot, onActionsChange, onSaved }: PlanReviewLaag2EditorProps) {
  return (
    <Box3MethodeBody
      current={laag2.box3Method}
      currentHeffingvrijInkomen={laag2.box3HeffingvrijInkomen}
      kop="h5"
      snapshot={snapshot}
      onActionsChange={onActionsChange}
      onClose={blijfOpen}
      onSaved={onSaved}
    />
  )
}

function RendementPerBezittingEditor({ laag2, snapshot, onActionsChange, onSaved }: PlanReviewLaag2EditorProps) {
  const bezittingen = laag2.bezittingen
  const [actief, setActief] = useState<string | null>(bezittingen[0]?.id ?? null)
  // Review M2 — tijdens een save is wisselen dicht: een late save zou anders stil schrijven
  // terwijl de lijst en de snapshot de oude waarde houden.
  const [bezig, setBezig] = useState(false)
  const publiceer = useCallback(
    (st: RegelEditActionsState) => {
      setBezig(st.saving)
      onActionsChange(st)
    },
    [onActionsChange],
  )
  // Een save die pas terugkomt nadat de gebruiker naar een andere bezitting wisselde, meldt
  // niets aan de host: anders zou het concept van de nieuwe bezitting stil verdwijnen.
  const actiefRef = useRef(actief)
  useEffect(() => {
    actiefRef.current = actief
  }, [actief])
  const opgeslagen = useCallback(
    (id: string) => {
      if (actiefRef.current === id) onSaved()
    },
    [onSaved],
  )

  const niets = bezittingen.length === 0
  useEffect(() => {
    if (niets) onActionsChange({ canSave: false, saving: false, save: () => {}, changed: false })
  }, [niets, onActionsChange])

  if (niets) {
    return (
      <p className="text-xs text-[var(--ink-3)]">
        Er zijn geen eigen bezittingen om in te stellen. Bezit dat op naam van je partner staat, stel je in via diens eigen
        account.
      </p>
    )
  }

  const bezit = bezittingen.find((b) => b.id === actief) ?? null

  return (
    <div className="space-y-4">
      <h5 className="font-serif text-lg text-[var(--ink)]">Rendement per bezitting</h5>
      {bezittingen.length > 1 && (
        <div role="group" aria-label="Welke bezitting pas je aan" className="flex flex-wrap gap-1.5">
          {bezittingen.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setActief(b.id)}
              disabled={bezig}
              aria-pressed={actief === b.id}
              className={`inline-flex min-h-[44px] items-center rounded-full border px-3 text-xs font-semibold transition-colors disabled:opacity-50 ${
                actief === b.id
                  ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                  : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] hover:text-[var(--ink)]'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}
      {bezit && (
        <BezittingRendementBody
          key={bezit.id}
          bezit={bezit}
          snapshot={snapshot}
          onActionsChange={publiceer}
          onSaved={() => opgeslagen(bezit.id)}
        />
      )}
    </div>
  )
}

function BezittingRendementBody({
  bezit,
  snapshot,
  onActionsChange,
  onSaved,
}: {
  bezit: PlanReviewLaag2Bezitting
  snapshot: RegelSimSnapshot | null
  onActionsChange: (s: RegelEditActionsState) => void
  onSaved: () => void
}) {
  const [waarde, setWaarde] = useState(String(bezit.expected_return))
  const [opgeslagen, setOpgeslagen] = useState(bezit.expected_return)
  const [saving, setSaving] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  const label = assetReturnLabel(bezit.asset_type)
  const band = assetReturnBand(bezit.asset_type)
  const standaard = TYPICAL_RETURNS[bezit.asset_type]
  const pct = waarde.trim() === '' ? Number.NaN : Number(waarde.replace(',', '.'))
  const invoerFout = bezit.afschrijvend
    ? null
    : !Number.isFinite(pct)
      ? 'Vul een getal in.'
      : isWithinAssetReturnBand(bezit.asset_type, pct)
        ? null
        : // Zelfde band als formulier en route, met de veldnaam die hier staat ("Rente" bij spaargeld).
          `${label} moet tussen ${band.min}% en ${band.max}% per jaar liggen.`
  const changed = !bezit.afschrijvend && invoerFout == null && pct !== opgeslagen
  const canSave = !saving && !bezit.afschrijvend && invoerFout == null

  // Live effect: dezelfde kern-run als de Tijdas, met alleen het rendement van deze rij vervangen.
  // Kernel-runs pas zodra er iets gewijzigd is: zonder wijziging toont de footer geen effect.
  const deferredPct = useDeferredValue(pct)
  const deferredChanged = Number.isFinite(deferredPct) && deferredPct !== opgeslagen
  const baseline = useMemo(
    () => (snapshot && deferredChanged ? runRegelProjection(snapshot) : null),
    [snapshot, deferredChanged],
  )
  const draftProj = useMemo(
    () =>
      snapshot && deferredChanged && isWithinAssetReturnBand(bezit.asset_type, deferredPct)
        ? runRegelProjection(snapshot, { assetExpectedReturns: { [bezit.id]: deferredPct } })
        : null,
    [snapshot, deferredChanged, bezit.id, bezit.asset_type, deferredPct],
  )
  const footerSleutel = baseline && draftProj ? fireFooterSleutel(baseline, draftProj) : null

  const saveRef = useRef(async () => {})
  useEffect(() => {
    saveRef.current = async () => {
      if (bezit.afschrijvend || invoerFout != null) return
      setSaving(true)
      setFout(null)
      try {
        const res = await fetch(`/api/assets/${encodeURIComponent(bezit.id)}/expected-return`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expected_return: pct }),
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: unknown }
          setFout(typeof data.error === 'string' ? data.error : 'Opslaan is niet gelukt.')
          return
        }
        setOpgeslagen(pct)
        onSaved()
      } catch {
        setFout('Opslaan is niet gelukt.')
      } finally {
        setSaving(false)
      }
    }
  })

  useEffect(() => {
    onActionsChange({
      canSave,
      saving,
      save: () => void saveRef.current(),
      changed,
      footerInfo: changed && baseline && draftProj ? <FireDeltaFooter baseline={baseline} draft={draftProj} /> : undefined,
    })
    // baseline/draftProj zijn useMemo-stabiel; footerSleutel bewaakt republish.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onActionsChange, canSave, saving, changed, footerSleutel])

  if (bezit.afschrijvend) {
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium text-[var(--ink)]">{bezit.name}</p>
        <p className="text-xs text-[var(--ink-3)]">
          Deze bezitting schrijft af, dus de app rekent hier niet met een rendement. Het afschrijvingspercentage pas je aan in
          het bezittingenformulier.
        </p>
      </div>
    )
  }

  const foutId = `rendement-${bezit.id}-fout`
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-[var(--ink)]">{bezit.name}</span>
        <span className="mb-1 block text-xs font-semibold text-[var(--ink-2)]">{label} per jaar (%)</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            min={band.min}
            max={band.max}
            step={0.1}
            value={waarde}
            onChange={(e) => setWaarde(e.target.value)}
            aria-invalid={invoerFout ? true : undefined}
            aria-describedby={invoerFout ? foutId : undefined}
            className="flex-1 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm tabular-nums focus:outline-none focus:border-[var(--ink-3)]"
          />
          <span className="text-sm text-[var(--ink-3)]">%</span>
        </div>
      </label>
      {invoerFout && (
        <p id={foutId} className="text-[11px] text-negative">
          {invoerFout}
        </p>
      )}
      {pct !== standaard && isWithinAssetReturnBand(bezit.asset_type, standaard) && (
        <button
          type="button"
          onClick={() => setWaarde(String(standaard))}
          disabled={saving}
          className="inline-flex min-h-[44px] items-center text-xs font-semibold text-[var(--ink-2)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
        >
          Standaard van de app voor dit soort bezit invullen ({formatPct(standaard)})
        </button>
      )}
      <p className="text-[11px] italic leading-snug text-[var(--ink-3)]">
        Je kiest met {label === 'Rente' ? 'welke rente' : 'welk rendement'} deze bezitting in je plan groeit. De app laat de waarde er elk jaar mee
        aangroeien, of dalen bij een negatief getal, en dat telt door in je vermogen en dus in wanneer je vrij bent. Relevant
        omdat een verschil van één procent over tientallen jaren flink oploopt; het getal is een aanname, geen voorspelling.
        Je stelt hetzelfde getal in het bezittingenformulier in.
      </p>
      {fout && (
        <p role="alert" className="text-xs text-negative">
          {fout}
        </p>
      )}
    </div>
  )
}

/**
 * Editor-register van laag 2. `Record<PlanReviewLaag2Onderdeel, …>`: een nieuw onderdeel
 * compileert pas met een editor (meebeweeg-check, laag a/b).
 */
export const PLAN_REVIEW_LAAG2_EDITORS: Record<PlanReviewLaag2Onderdeel, ComponentType<PlanReviewLaag2EditorProps>> = {
  inflatie: InflatieEditor,
  'bruto-rendement': BrutoRendementEditor,
  box3: Box3Editor,
  'rendement-bezitting': RendementPerBezittingEditor,
}
