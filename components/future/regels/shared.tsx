'use client'

import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { EditorialDeck } from '@/components/editorial'
import { EventImpactPreview } from '@/components/app/horizon/event-impact-preview'
import { REGEL_META, type RegelId } from '@/lib/future/regel-registry'
import type { RegelProjection } from '@/lib/future/regel-sim'

/** Intro-blok bovenaan elke body: uitleg-deck uit de registry. */
export function RegelIntro({ regelId }: { regelId: RegelId }) {
  return (
    <div className="mb-6">
      <EditorialDeck>{REGEL_META[regelId].intro}</EditorialDeck>
    </div>
  )
}

/** Sectiekop binnen een body (bv. "Kies je strategie" / "Verfijn"). */
export function RegelSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] mb-2">
      {children}
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
      <RegelSectionLabel>Zo werkt de prioriteit</RegelSectionLabel>
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

/** Footer-info node: live FIRE-delta voor de pane-footer. */
export function FireDeltaFooter({
  baseline,
  draft,
}: {
  baseline: RegelProjection
  draft: RegelProjection
}) {
  const delta = fireDeltaMonths(baseline, draft)
  if (delta == null) {
    return <span className="text-[11px] text-[var(--ink-3)]">Geen vergelijking</span>
  }
  if (delta === 0) {
    return <span className="text-[11px] text-[var(--ink-3)]">Geen verschil in vrijheidsdatum</span>
  }
  const earlier = delta < 0
  return (
    <span className="text-[12px]">
      <span className="text-[var(--ink-3)]">Vrijheid </span>
      <span
        className="font-semibold"
        style={{ color: earlier ? 'var(--positive)' : 'var(--negative)' }}
      >
        {earlier ? `${Math.abs(delta)} mnd eerder` : `${delta} mnd later`}
      </span>
    </span>
  )
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
