/**
 * Belasting-layout — neutraliseert de van `/overzicht` geërfde Kern-amber
 * `--module-active-*`-context, zodat de **hub** neutraal-ink chrome krijgt.
 *
 * De drie boxen dragen hun eigen kleur-codering (amber/violet/teal) via de
 * box-subpagina-layouts (`box1|2|3/layout.tsx`) of — op de hub zelf — via
 * directe `var(--color-boxN-*)`-referenties in de multi-box-componenten. De
 * structuur-typografie (masthead, sectielabels) blijft hier bewust ink, zodat
 * kleur uitsluitend functioneel per box wordt ingezet.
 *
 * Waarden = de `:root`-defaults uit `app/globals.css` (incl. Horizon-200 als
 * universele highlight-marker voor het hub-jaartotaal).
 */
export default function BelastingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={
        {
          '--module-active-50': 'var(--ink-4)',
          '--module-active-100': 'var(--ink-4)',
          '--module-active-200': 'var(--color-horizon-200)',
          '--module-active-300': 'var(--ink-3)',
          '--module-active-400': 'var(--ink-3)',
          '--module-active-500': 'var(--ink-2)',
          '--module-active-600': 'var(--ink-2)',
          '--module-active-700': 'var(--ink)',
          '--module-active-800': 'var(--ink)',
          '--module-active-900': 'var(--ink)',
          '--module-active-950': 'var(--ink)',
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  )
}
