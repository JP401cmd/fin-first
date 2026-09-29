/**
 * Krant-route layout (Krant 2D). Wraps `/krant/**` — vandaag alleen
 * `/krant/meer`, de weg omhoog naar het volledige TriFinity — en zet de
 * `--module-active-*`-variabelen op Fins accent, precies zoals
 * `app/(app)/nieuws/layout.tsx` dat voor /nieuws doet. De Krant-lezer ziet zo
 * op /krant/meer dezelfde tint als in zijn Krant, in de kleur die hij koos op
 * `/mijn/uiterlijk`.
 *
 * Alléén het route-accent; geen eigen chrome.
 */
export default function KrantLayout({ children }: { children: React.ReactNode }) {
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
