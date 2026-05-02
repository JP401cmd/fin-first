import type { ReactNode } from 'react'

/**
 * Layout voor de tijdelijke `/beheer/blueprints` showcase.
 *
 * Doel: visuele preview van alle 10 page-type-blueprints en editorial DNA
 * elementen vóór definitieve goedkeuring van het ui-ux skill plan.
 *
 * Deze layout simuleert de plan-keuzes inline (via CSS-vars op de wrapper)
 * zodat de echte app niet wordt geraakt:
 * - Palet-tussenstap geïnspireerd op FT.com (zalm-roze, minder bruin dan FD):
 *   #fbf2e7 page bg / #fef9ef paper. Toont hoe warmer en lichter de pagina's
 *   voelen zonder klinisch wit of bruin-traditioneel te worden.
 * - `--module-active-*` mapping op Kern als default — kindpagina's kunnen
 *   per type een andere module activeren via hun eigen wrapper.
 * - `--rule-soft` voor halftransparante dotted/dashed dividers.
 *
 * VERWIJDERBAAR: deze hele directory (`/beheer/blueprints/*`) mag in één
 * keer verwijderd worden zodra het plan is goedgekeurd en de echte rollout
 * begonnen is. Geen externe verwijzingen.
 */
export default function BlueprintsLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="-mx-4 sm:-mx-6 -my-5 sm:-my-12 px-4 sm:px-8 py-6 sm:py-10"
      style={
        {
          // Palet-tussenstap — FT-geïnspireerd, minder bruin
          '--bg': '#fbf2e7',
          '--paper': '#fef9ef',
          '--subtle': '#f3ead9',
          '--border-ed': '#e3dac8',
          '--border-md': '#ccc1aa',
          '--rule-soft': 'rgba(26, 25, 22, 0.18)',
          // Module-active default = Kern (kindcomponenten kunnen overschrijven)
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
          background: 'var(--bg)',
          color: 'var(--ink)',
          minHeight: 'calc(100vh - var(--header-height))',
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  )
}
