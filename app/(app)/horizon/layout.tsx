export default function HorizonLayout({ children }: { children: React.ReactNode }) {
  return (
    /* Module-active CSS-variabelen worden hier gezet op Horizon-shades zodat
       editorial primitives (kicker-streep, headline-emphasis, highlight-marker)
       automatisch zandgoud-getint zijn op alle /horizon/** pagina's. */
    <div
      style={
        {
          '--module-active-50': 'var(--color-horizon-50)',
          '--module-active-100': 'var(--color-horizon-100)',
          '--module-active-200': 'var(--color-horizon-200)',
          '--module-active-300': 'var(--color-horizon-300)',
          '--module-active-400': 'var(--color-horizon-400)',
          '--module-active-500': 'var(--color-horizon-500)',
          '--module-active-600': 'var(--color-horizon-600)',
          '--module-active-700': 'var(--color-horizon-700)',
          '--module-active-800': 'var(--color-horizon-800)',
          '--module-active-900': 'var(--color-horizon-900)',
          '--module-active-950': 'var(--color-horizon-950)',
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  )
}
