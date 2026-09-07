/**
 * Fin-route layout. Wraps `/berichten` en zet de `--module-active-*`
 * CSS-variabelen op Fins eigen accent-shades zodat editorial primitives
 * (kicker-streep, headline-emphasis, highlight-marker) en shell-elementen de
 * Fin-tint krijgen die de gebruiker koos op `/mijn/uiterlijk`. Sinds UR3-32
 * heeft Fin een eigen accent (`--color-fin-*`): berichten en krant zijn Fins
 * uitingen, dus ze lenen niet langer het wil-accent (dat nu Schulden draagt) — via één variabele i.p.v.
 * hardcoded class-names.
 *
 * Bewust geen Breadcrumb/ModuleNav: het berichtencentrum draagt zijn eigen
 * chrome (`BerichtenClient`). Deze wrapper voegt alléén het route-accent toe.
 * Cross-module-defaults staan in `app/globals.css` (neutrale ink-shades).
 */
export default function BerichtenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={
        {
          '--module-active-50': 'var(--color-fin-50)',
          '--module-active-100': 'var(--color-fin-100)',
          '--module-active-200': 'var(--color-fin-200)',
          '--module-active-300': 'var(--color-fin-300)',
          '--module-active-400': 'var(--color-fin-400)',
          '--module-active-500': 'var(--color-fin-500)',
          '--module-active-600': 'var(--color-fin-600)',
          '--module-active-700': 'var(--color-fin-700)',
          '--module-active-800': 'var(--color-fin-800)',
          '--module-active-900': 'var(--color-fin-900)',
          '--module-active-950': 'var(--color-fin-950)',
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  )
}
