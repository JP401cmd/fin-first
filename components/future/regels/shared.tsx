'use client'

import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { EditorialDeck, SubsectionLabel } from '@/components/editorial'
import { EventImpactPreview } from '@/components/app/horizon/event-impact-preview'
import { REGEL_META, type RegelId } from '@/lib/future/regel-registry'
import type { RegelProjection } from '@/lib/future/regel-sim'
import { deflate } from '@/lib/euro-display'
import { formatCurrency } from '@/lib/format'
import { EFFECT_BEDRAG_AFRONDING } from '@/lib/plan-review/types'

/** Intro-blok bovenaan elke body: uitleg-deck uit de registry. */
export function RegelIntro({ regelId }: { regelId: RegelId }) {
  return (
    <div className="mb-6">
      <EditorialDeck>{REGEL_META[regelId].intro}</EditorialDeck>
    </div>
  )
}

/** Radio-kaart voor een strategie/optie — gedeeld door alle bodies. */
export function RegelOptionCard({
  active,
  title,
  description,
  onSelect,
  disabled = false,
  note,
}: {
  active: boolean
  title: ReactNode
  description: ReactNode
  onSelect: () => void
  disabled?: boolean
  /** Optionele waarschuwing/uitleg onder de beschrijving (bv. incompatibiliteit). */
  note?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onSelect}
      aria-pressed={active}
      disabled={disabled}
      className={`flex items-start gap-3 rounded-xl border p-3 text-left w-full transition-all ${
        disabled
          ? 'border-[var(--border-ed)] opacity-50 cursor-not-allowed'
          : active
            ? 'border-[var(--ink-2)] bg-[var(--subtle)]/50'
            : 'border-[var(--border-ed)] hover:border-[var(--ink-3)]'
      }`}
    >
      <span
        className={`mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full border-2 shrink-0 ${
          active ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]' : 'border-[var(--border-md)]'
        }`}
        aria-hidden="true"
      >
        {active && <Check className="w-3 h-3" />}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-[var(--ink)]">{title}</div>
        <p className="mt-0.5 text-[11px] text-[var(--ink-2)] leading-snug">{description}</p>
        {note && <p className="mt-1 text-[11px] italic text-amber-700 leading-snug">{note}</p>}
      </div>
    </button>
  )
}

/**
 * Klein infoblok "Zo werkt de prioriteit" — gedeeld door de drie pot-regels zodat
 * de uitleg van de prio-semantiek overal identiek is. Spiegelt de help-tekst in
 * CategoriePrioEditor (gewicht ½^(prio−1), 5 = reserve) en expliciteert de relatie
 * tussen de snelkeuze (preset/optie) en de fijnafstemming (prio per categorie).
 *
 * `variant`: 'order' voor de twee volgorde-regels (preset = volgorde), 'target'
 * voor Verdeling bij toename (optie = bestemming van je overschot).
 */
export function PrioUitlegBlok({ variant = 'order' }: { variant?: 'order' | 'target' }) {
  return (
    <div className="mt-6 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)]/40 px-3 py-3">
      <SubsectionLabel>Zo werkt de prioriteit</SubsectionLabel>
      {variant === 'order' ? (
        <p className="text-[11px] text-[var(--ink-2)] leading-snug">
          Een <span className="font-semibold">preset</span> is een snelkeuze: hij zet in één klik
          de volgorde van je vermogensgroepen. Wie eerder in de rij staat, wordt eerder
          aangesproken.
        </p>
      ) : (
        <p className="text-[11px] text-[var(--ink-2)] leading-snug">
          De <span className="font-semibold">optie</span> hierboven is een snelkeuze: hij bepaalt
          naar welke groep je overschot standaard toe gaat.
        </p>
      )}
      <p className="mt-1.5 text-[11px] text-[var(--ink-2)] leading-snug">
        Zet je hieronder <span className="font-semibold">Prioriteit per categorie</span> aan, dan
        stuur je per categorie op een schaal 1–5: lager = eerder aangesproken, elke stap weegt
        dubbel zo zwaar (gewicht ½<sup>prio−1</sup>), en{' '}
        <span className="font-semibold text-[var(--ink)]">5 = reserve</span> (pas aanspreken als de
        rest leeg is). Die per-categorie-prio&apos;s overrulen dan de keuze hierboven.
      </p>
    </div>
  )
}

/** Bereken FIRE-delta in maanden tussen baseline en draft (null als onbepaald). */
export function fireDeltaMonths(baseline: RegelProjection, draft: RegelProjection): number | null {
  if (baseline.fireAgeFractional == null || draft.fireAgeFractional == null) return null
  return Math.round((draft.fireAgeFractional - baseline.fireAgeFractional) * 12)
}

/**
 * Het live effect in de footer, in dezelfde drie treden als de plan-review-overzichten
 * (TPR-15, besluit eigenaar 13 sep 2026):
 *  1. de vrijheidsdatum schuift → maanden eerder/later;
 *  2. de datum blijft gelijk, maar hoe ver het liquide vermogen reikt verandert;
 *  3. beide reiken tot het einde → wat er aan het einde meer of minder over is, in euro's van
 *     vandaag (elk bedrag precies één keer gedeflateerd met de kernelfactor van zijn eigen
 *     eindrij, ADR 0090), afgerond zoals de overzichten.
 * Consume, don't recompute: alles komt uit de twee kern-runs.
 */
export type FireFooterEffect =
  | { kind: 'onbekend' }
  | { kind: 'maanden'; maanden: number }
  | { kind: 'reikt'; totLeeftijd: number | null; eerder: boolean }
  | { kind: 'einde'; euro: number }
  | { kind: 'geen' }

function reiktTot(p: RegelProjection): number | null | undefined {
  const r = p.reach
  if (!r) return undefined
  if (r.kind === 'gedekt') return null
  if (r.kind === 'reikt-tot') return Math.floor(r.age)
  if (r.kind === 'nu-op') return p.rows[0]?.age != null ? Math.floor(p.rows[0].age) : undefined
  return undefined
}

export function fireFooterEffect(baseline: RegelProjection, draft: RegelProjection): FireFooterEffect {
  const delta = fireDeltaMonths(baseline, draft)
  if (delta == null) return { kind: 'onbekend' }
  if (delta !== 0) return { kind: 'maanden', maanden: delta }
  const basisTot = reiktTot(baseline)
  const draftTot = reiktTot(draft)
  if (basisTot !== undefined && draftTot !== undefined && basisTot !== draftTot) {
    // null = tot het einde van het plan; dat is altijd verder dan een leeftijd.
    const eerder = draftTot != null && (basisTot == null || draftTot < basisTot)
    return { kind: 'reikt', totLeeftijd: draftTot, eerder }
  }
  if (basisTot === null && draftTot === null && baseline.eindeLiquide && draft.eindeLiquide) {
    const vandaag = (e: NonNullable<RegelProjection['eindeLiquide']>) => deflate(e.nominaal, e.inflationFactor, 'real')
    const verschil = vandaag(draft.eindeLiquide) - vandaag(baseline.eindeLiquide)
    const euro = Math.round(verschil / EFFECT_BEDRAG_AFRONDING) * EFFECT_BEDRAG_AFRONDING
    if (euro !== 0) return { kind: 'einde', euro }
  }
  return { kind: 'geen' }
}

/**
 * Stabiele sleutel van het footer-effect: bodies publiceren hun footer opnieuw zodra deze
 * verandert (niet op elke render, en niet alleen op de maanden — anders bleef trede 2/3 staan).
 */
export function fireFooterSleutel(baseline: RegelProjection, draft: RegelProjection): string {
  return JSON.stringify(fireFooterEffect(baseline, draft))
}

/** Footer-info node: live effect voor de pane-footer (zie `fireFooterEffect`). */
export function FireDeltaFooter({
  baseline,
  draft,
}: {
  baseline: RegelProjection
  draft: RegelProjection
}) {
  const effect = fireFooterEffect(baseline, draft)
  switch (effect.kind) {
    case 'onbekend':
      return <span className="text-[11px] text-[var(--ink-3)]">Geen vergelijking</span>
    case 'geen':
      return <span className="text-[11px] text-[var(--ink-3)]">Geen verschil in je plan</span>
    case 'maanden': {
      const earlier = effect.maanden < 0
      return (
        <span className="text-[12px]">
          <span className="text-[var(--ink-3)]">Vrijheid </span>
          <span className="font-semibold" style={{ color: earlier ? 'var(--positive)' : 'var(--negative)' }}>
            {earlier ? `${Math.abs(effect.maanden)} mnd eerder` : `${effect.maanden} mnd later`}
          </span>
        </span>
      )
    }
    case 'reikt':
      return (
        <span className="text-[12px]">
          <span className="text-[var(--ink-3)]">Geld reikt dan </span>
          <span className="font-semibold" style={{ color: effect.eerder ? 'var(--negative)' : 'var(--positive)' }}>
            {effect.totLeeftijd == null ? 'tot het einde' : `tot je ${effect.totLeeftijd}e`}
          </span>
        </span>
      )
    case 'einde': {
      const meer = effect.euro > 0
      return (
        <span className="text-[12px]" title="In euro's van vandaag">
          <span className="font-semibold" style={{ color: meer ? 'var(--positive)' : 'var(--negative)' }}>
            {formatCurrency(Math.abs(effect.euro))} {meer ? 'meer' : 'minder'}
          </span>
          <span className="text-[var(--ink-3)]"> over aan het einde</span>
        </span>
      )
    }
  }
}

/**
 * Live-sim impact-grafiek (regel 1 & 2): baseline vs. kandidaat.
 * Toont een nette fallback wanneer de engine geen pad oplevert
 * (bv. VPW × perpetual/legacy/pensioen — incompatibele combinatie).
 */
export function LiveSimImpact({
  baseline,
  draft,
  legendLabels = { draft: 'deze keuze', baseline: 'huidige instelling' },
}: {
  baseline: RegelProjection
  draft: RegelProjection
  legendLabels?: { draft: string; baseline: string }
}) {
  const noData = baseline.rows.length === 0 || draft.rows.length === 0
  if (noData) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-4 py-6 text-center">
        <p className="text-xs text-[var(--ink-3)] italic leading-snug">
          Geen vrijheidspad beschikbaar voor deze combinatie. Sommige strategieën zijn niet
          combineerbaar — pas de andere regel aan om de impact te zien.
        </p>
      </div>
    )
  }
  return (
    <EventImpactPreview
      baselineRows={baseline.rows}
      draftRows={draft.rows}
      baselineFireAge={baseline.fireAgeFractional}
      draftFireAge={draft.fireAgeFractional}
      height={170}
      legendLabels={legendLabels}
    />
  )
}
