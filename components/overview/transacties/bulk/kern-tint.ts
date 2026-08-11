import type { CSSProperties } from 'react'

/**
 * Kern-tint voor de bulkbewerk-overlays.
 *
 * De route-layout van `/overzicht` zet `--module-active-*` op de Kern-shades,
 * maar overlays renderen via `createPortal` naar `document.body` en vallen dus
 * buiten die wrapper: daar geldt de `:root`-terugval (ink-shades). Editorial
 * primitives die de module-kleur via `--module-active-*` lezen — `Kicker` met
 * zijn 28×1px streep voorop — zouden in de overlay grijs worden terwijl de
 * pagina eronder Kern is.
 *
 * Vandaar deze tint op de content-root van elke overlay in deze map. Géén vaste
 * hex: de vars wijzen door naar `--color-kern-*`, en die volgen de accentkleur
 * die de gebruiker op `/mijn/uiterlijk` heeft gekozen. Spiegelt
 * `KERN_MODULE_TINT_STYLE` in de onboarding, die dezelfde portal-grens oplost.
 */
export const KERN_MODULE_TINT: CSSProperties = {
  '--module-active-50': 'var(--color-kern-50)',
  '--module-active-100': 'var(--color-kern-100)',
  '--module-active-200': 'var(--color-kern-200)',
  '--module-active-300': 'var(--color-kern-300)',
  '--module-active-400': 'var(--color-kern-400)',
  '--module-active-500': 'var(--color-kern-500)',
  '--module-active-600': 'var(--color-kern-600)',
  '--module-active-700': 'var(--color-kern-700)',
  '--module-active-800': 'var(--color-kern-800)',
  '--module-active-900': 'var(--color-kern-900)',
  '--module-active-950': 'var(--color-kern-950)',
} as CSSProperties
