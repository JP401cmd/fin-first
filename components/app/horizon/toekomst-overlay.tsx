'use client'

/**
 * ToekomstOverlay — toggle-bare editorial ballonnen-laag over de FIRE-grafiek.
 *
 * Doel: een leek wijzen op de plekken waar hij de prognose kan aanscherpen,
 * zónder een zware modal. Transparante laag bovenop de grafiek met een aantal
 * editorial speech-balloons die NAAR een aanpassing wijzen (pointer/tail).
 * Elke ballon opent een BESTAANDE in-page editor (geen navigatie, behalve waar
 * dat triviaal is) zodat de grafiek live meebeweegt.
 *
 * Geen eigen rekenlogica — puur presentatie + callbacks naar de parent
 * (horizon-client). De parent geeft `onHover(emphasis)` mee zodat een ballon de
 * relevante grafiekfase kan accentueren via `SimChart.emphasis`.
 *
 * Module-accent: Toekomst = horizon/paars via `--module-active-*`.
 */

import type { ReactNode } from 'react'
import {
  Wallet,
  TrendingDown,
  Landmark,
  Flag,
  ArrowDownWideNarrow,
  Home,
  CalendarPlus,
  X,
} from 'lucide-react'

/** Welke grafiekfase een ballon accentueert bij hover/focus. */
type OverlayEmphasis = 'accumulation' | 'withdrawal' | 'fire' | null

/** Verticale rij + horizontale uitlijning. */
type BalloonAnchor = {
  /** Verticale plek in de overlay (top / hoger-midden / lager-midden / onder). */
  row: 'top' | 'mid-high' | 'mid-low' | 'bottom'
  /** Horizontale uitlijning — bepaalt de kant van de pointer-tail. */
  side: 'left' | 'right'
}

export interface OverlayBalloonDef {
  id: string
  icon: ReactNode
  /** Korte editorial kop (mono kicker). */
  kicker: string
  /** Eén zin uitleg — leek-taal, vrijheidstijd-framing waar passend. */
  body: string
  /** CTA-label op de knop. */
  cta: string
  anchor: BalloonAnchor
  /** Grafiekfase die deze ballon accentueert bij hover/focus. */
  emphasis: OverlayEmphasis
  /** Opent de bijbehorende in-page editor. */
  onActivate: () => void
}

export interface ToekomstOverlayProps {
  /** Of de overlay zichtbaar is (toggle in de header). */
  visible: boolean
  /** Ballon-definities (door horizon-client samengesteld + gewired). */
  balloons: OverlayBalloonDef[]
  /** Accentueer de gegeven grafiekfase (of reset met null). */
  onEmphasisChange: (emphasis: OverlayEmphasis) => void
  /** Sluit de overlay (toggle uit). */
  onClose: () => void
}

const ROW_CLASS: Record<BalloonAnchor['row'], string> = {
  top: 'top-3 sm:top-4',
  'mid-high': 'top-[34%] -translate-y-1/2',
  'mid-low': 'top-[64%] -translate-y-1/2',
  bottom: 'bottom-3 sm:bottom-4',
}

/**
 * Bouw de ballon-definities. Geëxporteerd zodat horizon-client de set kan
 * samenstellen met zijn eigen editor-openers, en de volgorde/teksten op één
 * plek staan.
 */
export function ToekomstOverlay({
  visible,
  balloons,
  onEmphasisChange,
  onClose,
}: ToekomstOverlayProps) {
  if (!visible) return null

  return (
    /* role="region" zodat screenreaders dit blok kunnen vinden via landmark-navigatie. */
    <div
      role="region"
      className="pointer-events-none absolute inset-0 z-20"
      aria-label="Aanscherp-tips over de grafiek"
    >
      {/* Sluit-knop rechtsboven — pointer-events terug aan op de knop zelf. */}
      <button
        type="button"
        onClick={onClose}
        className="pointer-events-auto absolute right-2 top-2 z-30 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-ed)] bg-[var(--paper)]/90 text-[var(--ink-3)] backdrop-blur-sm transition-colors hover:text-[var(--ink)]"
        aria-label="Tips verbergen"
        title="Tips verbergen"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>

      {/* Desktop: zwevende ballonnen over de grafiek heen (hidden op sm en smaller). */}
      <div className="hidden sm:block">
        {balloons.map((b) => (
          <OverlayBalloon
            key={b.id}
            def={b}
            onEmphasisChange={onEmphasisChange}
          />
        ))}
      </div>

      {/* Mobile: compacte gestapelde lijst onder de grafiek (<sm).
          Geen chart-ankering of staarten — simpele tappable rijen.
          Onderaan ruimte voor de zwevende mobiele nav via --mobile-nav-clearance. */}
      <div
        className="pointer-events-auto sm:hidden"
        style={{ paddingBottom: 'var(--mobile-nav-clearance, 5rem)' }}
      >
        <MobileTipList balloons={balloons} />
      </div>
    </div>
  )
}

function OverlayBalloon({
  def,
  onEmphasisChange,
}: {
  def: OverlayBalloonDef
  onEmphasisChange: (emphasis: OverlayEmphasis) => void
}) {
  const sideClass = def.anchor.side === 'left' ? 'left-3 sm:left-5' : 'right-3 sm:right-5'
  // Tail aan de onderkant, naar de grafiek toe; horizontaal aan de ballon-kant.
  const tailSide = def.anchor.side === 'left' ? 'left-5' : 'right-5'

  return (
    <div
      className={`pointer-events-auto absolute ${ROW_CLASS[def.anchor.row]} ${sideClass} w-[min(15rem,calc(100vw-2.5rem))]`}
      onMouseEnter={() => onEmphasisChange(def.emphasis)}
      onMouseLeave={() => onEmphasisChange(null)}
      onFocus={() => onEmphasisChange(def.emphasis)}
      onBlur={() => onEmphasisChange(null)}
    >
      <div
        className="relative bg-[var(--paper)]/95 p-3 text-sm leading-snug text-[var(--ink-2)] shadow-md backdrop-blur-sm"
        style={{
          fontFamily: 'var(--font-source-serif, Georgia, serif)',
          border: '1px solid var(--ink)',
          borderLeftWidth: '4px',
          borderLeftColor: 'var(--module-active-500)',
        }}
      >
        {/* Kicker: 10px mono uppercase — gebruik -800 voor WCAG AA contrast op lichte achtergrond. */}
        <div className="mb-1.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] not-italic text-[var(--module-active-800)]">
          <span aria-hidden className="inline-flex">
            {def.icon}
          </span>
          {def.kicker}
        </div>
        <p className="italic">{def.body}</p>
        {/* CTA-knop: tekst op -700 is 12px normaal gewicht — AA-grens ligt hier lager dan 10px kicker. */}
        <button
          type="button"
          onClick={def.onActivate}
          className="mt-2.5 inline-flex min-h-[36px] items-center gap-1 rounded-[var(--r-sm)] border border-[var(--module-active-300)] bg-[var(--module-active-50)] px-2.5 py-1 font-sans text-[12px] font-medium not-italic text-[var(--module-active-800)] transition-colors hover:bg-[var(--module-active-100)]"
        >
          {def.cta}
        </button>

        {/* Pointer/tail naar de grafiek — kleine driehoek onder de ballon.
            Positie: -bottom-[6px] zodat de bovenste helft van het vierkant
            de kaart-rand overlapt en de onderste helft als driehoek uitsteekt.
            De kaartrand (1px solid ink) valt hierdoor niet dubbel met de
            tail-rand. box-shadow als border voorkomt dat de niet-zichtbare
            kanten van het rotated vierkant de kaartrand doubleren. */}
        <span
          aria-hidden
          className={`absolute -bottom-[6px] ${tailSide} h-3 w-3 rotate-45 bg-[var(--paper)]`}
          style={{
            boxShadow: '1px 1px 0 0 var(--ink)',
          }}
        />
      </div>
    </div>
  )
}

// ── Mobile-only gestapelde tippenlijst ─────────────────────────────────────
// Dezelfde balloon-definities als de desktop-laag, maar zonder
// chart-ankering of staarten. Tappable rijen met icon + kicker + body + CTA.
function MobileTipList({ balloons }: { balloons: OverlayBalloonDef[] }) {
  if (balloons.length === 0) return null

  return (
    <div
      className="mt-3 flex flex-col gap-2 px-3"
      aria-label="Aanscherp-tips"
    >
      {balloons.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={b.onActivate}
          className="flex w-full items-start gap-3 border border-[var(--border-ed)] bg-[var(--paper)]/95 p-3 text-left transition-colors hover:bg-[var(--paper)] active:bg-[var(--subtle)]"
          style={{ borderLeftWidth: '3px', borderLeftColor: 'var(--module-active-500)' }}
          aria-label={`${b.kicker} — ${b.cta}`}
        >
          <span aria-hidden className="mt-0.5 flex-shrink-0 text-[var(--module-active-600)]">
            {b.icon}
          </span>
          <span className="min-w-0 flex-1">
            {/* Kicker: 10px mono uppercase — -800 voor WCAG AA contrast. */}
            <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--module-active-800)]">
              {b.kicker}
            </span>
            <span
              className="mt-0.5 block text-[13px] italic leading-snug text-[var(--ink-2)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              {b.body}
            </span>
            <span className="mt-1.5 block text-[12px] font-medium text-[var(--module-active-800)] underline-offset-2 hover:underline">
              {b.cta} →
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}

// ── Iconen voor de standaard-ballonset ─────────────────────────────────────
// Geëxporteerd zodat horizon-client dezelfde iconen kan hergebruiken bij het
// samenstellen van de ballon-definities (één bron, geen drift).
export const OVERLAY_ICONS = {
  income: <Wallet className="h-3.5 w-3.5" />,
  expenses: <TrendingDown className="h-3.5 w-3.5" />,
  pension: <Landmark className="h-3.5 w-3.5" />,
  end: <Flag className="h-3.5 w-3.5" />,
  withdrawal: <ArrowDownWideNarrow className="h-3.5 w-3.5" />,
  housing: <Home className="h-3.5 w-3.5" />,
  event: <CalendarPlus className="h-3.5 w-3.5" />,
} as const
