/**
 * Wil module-route layout. Wraps all `/will/**` pages en zet
 * `--module-active-*` op de Wil-shades zodat editorial primitives
 * automatisch de paarse module-tint krijgen.
 *
 * Highlight-marker wordt Wil-200 (lichtpaars) op deze routes.
 */
export default function WillLayout({ children }: { children: React.ReactNode }) {
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
