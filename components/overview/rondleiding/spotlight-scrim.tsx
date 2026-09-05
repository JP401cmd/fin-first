'use client'

import type { SpotlightRect } from './use-spotlight-rect'

/**
 * SpotlightScrim — de vier scrim-panelen rond het uitgelichte element (ADR 0130).
 *
 * ══ Waarom vier panelen en geen masker ════════════════════════════════════
 *
 * Een gewone overlay dekt de pagina áf. Deze moet er een GAT in laten waar het
 * uitgelichte element niet alleen zichtbaar maar ook tíkbaar blijft — de laatste
 * stap wijst naar de nav-pill respectievelijk Fins eigen knop, en die moeten
 * werken terwijl de rondleiding loopt (op een tegel tikken beëindigt de tour als
 * `onderbroken`, dat is bewust gedrag). Een `box-shadow: 0 0 0 9999px`-truc of
 * een SVG-masker geeft één laag over de hele viewport en vangt dus élke klik.
 * Vier losse rechthoeken laten het middenstuk letterlijk vrij.
 *
 * De panelen dragen `pointer-events-auto` (klikken erbuiten valt op de scrim,
 * niet op de pagina eronder), de ring eromheen `pointer-events-none` — anders
 * zou de 2px-rand precies over de klikrand van het element liggen.
 *
 * Scrim-kleur is `var(--scrim)`, verplicht: `scripts/check-overlay-standard.mjs`
 * regel 3 is niet allowlistbaar, en met zeven eerdere scrim-varianten in de app
 * is dat terecht.
 */

/** Ademruimte tussen het element en de rand van het gat. */
const PADDING = 8

export function SpotlightScrim({
  rect,
  onScrimClick,
}: {
  /** `null` = geen spotlight: één vol paneel (de welkomstkaart). */
  rect: SpotlightRect | null
  /** Klik náást het gat. De provider gebruikt 'm om over te slaan. */
  onScrimClick?: () => void
}) {
  const paneel = 'pointer-events-auto absolute bg-[var(--scrim)] motion-safe:transition-[inset] motion-safe:duration-300'

  if (!rect) {
    return (
      <div
        aria-hidden="true"
        onClick={onScrimClick}
        className={`${paneel} inset-0`}
      />
    )
  }

  const top = Math.max(0, rect.top - PADDING)
  const left = Math.max(0, rect.left - PADDING)
  const rechts = rect.left + rect.width + PADDING
  const onder = rect.top + rect.height + PADDING

  return (
    <div aria-hidden="true">
      {/* boven */}
      <div
        onClick={onScrimClick}
        className={paneel}
        style={{ top: 0, left: 0, right: 0, height: Math.max(0, top) }}
      />
      {/* onder */}
      <div
        onClick={onScrimClick}
        className={paneel}
        style={{ top: onder, left: 0, right: 0, bottom: 0 }}
      />
      {/* links, alleen op de hoogte van het gat */}
      <div
        onClick={onScrimClick}
        className={paneel}
        style={{ top, left: 0, width: Math.max(0, left), height: Math.max(0, onder - top) }}
      />
      {/* rechts, idem */}
      <div
        onClick={onScrimClick}
        className={paneel}
        style={{ top, left: rechts, right: 0, height: Math.max(0, onder - top) }}
      />
      {/* De ring om het gat. Route-accent (kern = /overzicht), nooit een
          Tailwind-standaardkleur: dit is module-identiteit. `outline` en niet
          `border`, zodat de rand geen ruimte inneemt en het gat exact even
          groot blijft als de vier panelen 'm laten. */}
      <div
        data-testid="spotlight-ring"
        className="pointer-events-none absolute motion-safe:transition-[inset] motion-safe:duration-300"
        style={{
          top,
          left,
          width: Math.max(0, rechts - left),
          height: Math.max(0, onder - top),
          outline: '2px solid var(--color-kern-500)',
          outlineOffset: '0px',
          borderRadius: '4px',
        }}
      />
    </div>
  )
}
