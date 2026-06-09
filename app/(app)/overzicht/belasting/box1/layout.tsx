/**
 * Box 1-layout — zet de `--module-active-*`-context op de **amber** box-triade
 * (`--color-box1-*`). Alle editorial-primitives (kicker-streep, headline-em,
 * deck-border, highlight-marker) en box-detailcomponenten die `--module-active-*`
 * lezen, kleuren zo automatisch in de Box 1-tint. Spiegelt het patroon van
 * `app/(app)/core/layout.tsx`.
 */
export default function Box1Layout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={
        {
          '--module-active-50': 'var(--color-box1-50)',
          '--module-active-100': 'var(--color-box1-100)',
          '--module-active-200': 'var(--color-box1-200)',
          '--module-active-300': 'var(--color-box1-300)',
          '--module-active-400': 'var(--color-box1-400)',
          '--module-active-500': 'var(--color-box1-500)',
          '--module-active-600': 'var(--color-box1-600)',
          '--module-active-700': 'var(--color-box1-700)',
          '--module-active-800': 'var(--color-box1-800)',
          '--module-active-900': 'var(--color-box1-900)',
          '--module-active-950': 'var(--color-box1-950)',
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  )
}
