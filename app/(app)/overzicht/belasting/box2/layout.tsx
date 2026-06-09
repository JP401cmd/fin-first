/**
 * Box 2-layout — zet de `--module-active-*`-context op de **violet** box-triade
 * (`--color-box2-*`). Zie `box1/layout.tsx` voor het patroon.
 */
export default function Box2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={
        {
          '--module-active-50': 'var(--color-box2-50)',
          '--module-active-100': 'var(--color-box2-100)',
          '--module-active-200': 'var(--color-box2-200)',
          '--module-active-300': 'var(--color-box2-300)',
          '--module-active-400': 'var(--color-box2-400)',
          '--module-active-500': 'var(--color-box2-500)',
          '--module-active-600': 'var(--color-box2-600)',
          '--module-active-700': 'var(--color-box2-700)',
          '--module-active-800': 'var(--color-box2-800)',
          '--module-active-900': 'var(--color-box2-900)',
          '--module-active-950': 'var(--color-box2-950)',
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  )
}
