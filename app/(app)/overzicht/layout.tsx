import { Breadcrumb } from '@/components/app/breadcrumb'
import { PageStatusBanner } from '@/components/app/page-status-banner'
import { PageStatusProvider } from '@/components/app/page-status-provider'

/**
 * Kern module-route layout. Wraps all `/core/**` pages and sets the
 * `--module-active-*` CSS-variabelen op de Kern-shades zodat editorial
 * primitives (kicker-streep, headline-emphasis, highlight-marker) de
 * juiste module-tint krijgen via één variabele i.p.v. hardcoded class-names.
 *
 * Highlight-marker (`--module-active-200`) wordt Kern-200 op `/core/**`,
 * Wil-200 op `/will/**`, Horizon-200 op `/horizon/**`. Cross-module-routes
 * vallen terug op de defaults in `:root` (zie `app/globals.css`).
 *
 * De <PageStatusBanner> rendert bovenaan elke pagina (één slot dekt Overzicht,
 * Cashflow en Belasting). De banner haalt zijn data LAZY + route-scoped op via
 * `usePageStatus` (client) — de layout blijft bewust een lichte, niet-async
 * server-component zodat niet-cashflow-routes nooit de zware dashboard-loader
 * aanraken (egress).
 */
export default function CoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={
        {
          '--module-active-50': 'var(--color-kern-50)',
          '--module-active-100': 'var(--color-kern-100)',
          '--module-active-200': 'var(--color-kern-200)',
          '--module-active-300': 'var(--color-kern-300)',
          '--module-active-400': 'var(--color-kern-400)',
          '--module-active-500': 'var(--color-kern-500)',
          '--module-active-600': 'var(--color-kern-600)',
          '--module-active-700': 'var(--color-kern-700)',
          '--module-active-800': 'var(--color-kern-800)',
          '--module-active-900': 'var(--color-kern-900)',
          '--module-active-950': 'var(--color-kern-950)',
        } as React.CSSProperties
      }
    >
      <PageStatusProvider>
        <div className="mx-auto max-w-6xl px-6">
          <Breadcrumb color="amber" />
          <PageStatusBanner />
        </div>
        {children}
      </PageStatusProvider>
    </div>
  )
}
