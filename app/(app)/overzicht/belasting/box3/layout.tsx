/**
 * Box 3-layout — zet de `--module-active-*`-context op de **teal** box-triade
 * (`--color-box3-*`). Zie `box1/layout.tsx` voor het patroon.
 */
export default function Box3Layout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={
        {
          '--module-active-50': 'var(--color-box3-50)',
          '--module-active-100': 'var(--color-box3-100)',
          '--module-active-200': 'var(--color-box3-200)',
          '--module-active-300': 'var(--color-box3-300)',
          '--module-active-400': 'var(--color-box3-400)',
          '--module-active-500': 'var(--color-box3-500)',
          '--module-active-600': 'var(--color-box3-600)',
          '--module-active-700': 'var(--color-box3-700)',
          '--module-active-800': 'var(--color-box3-800)',
          '--module-active-900': 'var(--color-box3-900)',
          '--module-active-950': 'var(--color-box3-950)',
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  )
}
