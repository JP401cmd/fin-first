import { Breadcrumb } from '@/components/app/breadcrumb'
import { ModuleNav } from '@/components/app/module-nav'
import { mijnNav } from '@/lib/navigation'

/**
 * Fin & acties-route layout voor `/mijn`. Naast de bestaande ModuleNav +
 * Breadcrumb (teal) zet deze wrapper de `--module-active-*` CSS-variabelen op
 * de Wil-shades, zodat editorial primitives (kicker-streep, headline-emphasis,
 * highlight-marker) onder `/mijn` het Wil-accent dragen dat de gebruiker koos
 * op `/mijn/uiterlijk`. De picker noemt deze kleur "Fin & acties" en de
 * /mijn-tabs zijn al wil — vandaar het wil-accent (zie accentkleuren-actieplan).
 * Cross-module-defaults staan in `app/globals.css` (neutrale ink-shades).
 */
export default function MijnLayout({ children }: { children: React.ReactNode }) {
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
      {/* MIJN-1: op de hub (`/mijn`) toont `MijnOverview` alle negen bestemmingen
          al als kaartengrid; de tabbalk daarboven herhaalt exact dezelfde lijst.
          Op de subpagina's blijft hij — daar is hij de enige zijwaartse nav. */}
      <ModuleNav config={mijnNav} hideOnBasePath />
      <div className="mx-auto max-w-6xl px-6">
        <div className="pt-4">
          <Breadcrumb color="teal" />
        </div>
      </div>
      {children}
    </div>
  )
}
