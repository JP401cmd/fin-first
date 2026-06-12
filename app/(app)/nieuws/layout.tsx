/**
 * Will & acties-route layout. Wraps `/nieuws` en zet de `--module-active-*`
 * CSS-variabelen op de Wil-shades zodat editorial primitives (kicker-streep,
 * headline-emphasis, highlight-marker) en shell-elementen de Wil-tint krijgen
 * die de gebruiker koos op `/mijn/uiterlijk` — via één variabele i.p.v.
 * hardcoded class-names.
 *
 * Bewust geen Breadcrumb/ModuleNav: de krant draagt zijn eigen chrome
 * (`NieuwsOnlyClient`). Deze wrapper voegt alléén het route-accent toe.
 * Cross-module-defaults staan in `app/globals.css` (neutrale ink-shades).
 */
export default function NieuwsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={
        {
          '--module-active-50': 'var(--color-wil-50)',
          '--module-active-100': 'var(--color-wil-100)',
          '--module-active-200': 'var(--color-wil-200)',
          '--module-active-300': 'var(--color-wil-300)',
          '--module-active-400': 'var(--color-wil-400)',
          '--module-active-500': 'var(--color-wil-500)',
          '--module-active-600': 'var(--color-wil-600)',
          '--module-active-700': 'var(--color-wil-700)',
          '--module-active-800': 'var(--color-wil-800)',
          '--module-active-900': 'var(--color-wil-900)',
          '--module-active-950': 'var(--color-wil-950)',
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  )
}
