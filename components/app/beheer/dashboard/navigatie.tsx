import Link from 'next/link'
import {
  DASHBOARD_ONDERWERPEN,
  DASHBOARD_PERIODES,
  ONDERWERP_LABEL,
  dashboardHref,
  type DashboardOnderwerp,
  type DashboardPeriode,
} from '@/lib/beheer/dashboard/doorklik'
import { LinkBezig } from './link-bezig'

/**
 * Weergave en periode van het dashboard. Beide staan in de URL, zodat een
 * wissel van weergave de periode behoudt, een link deelbaar is en de
 * terugknop van de browser werkt. Links, geen knoppen; alleen het laadteken
 * binnen de link draait in de browser.
 */

function Chip({ href, actief, children }: { href: string; actief: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={actief ? 'page' : undefined}
      // Geen scroll-sprong: de kop blijft staan, alleen de inhoud wisselt.
      scroll={false}
      className={`inline-flex min-h-11 items-center whitespace-nowrap border px-3 py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] ${
        actief
          ? 'border-[var(--ink)] font-medium text-[var(--ink)]'
          : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)]'
      }`}
    >
      {children}
      <LinkBezig />
    </Link>
  )
}

export function DashboardNavigatie({
  onderwerp,
  dagen,
}: {
  onderwerp: DashboardOnderwerp
  dagen: DashboardPeriode
}) {
  return (
    <nav
      aria-label="Weergave en periode"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-[var(--border-ed)] py-3"
    >
      <div className="flex flex-wrap gap-2" role="group" aria-label="Weergave">
        {DASHBOARD_ONDERWERPEN.map((o) => (
          <Chip key={o} href={dashboardHref(o, dagen)} actief={o === onderwerp}>
            {ONDERWERP_LABEL[o]}
          </Chip>
        ))}
      </div>
      <span aria-hidden className="hidden h-6 w-px bg-[var(--border-ed)] sm:block" />
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Periode voor het verloop">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-meta)]">Verloop over</span>
        {DASHBOARD_PERIODES.map((p) => (
          <Chip key={p} href={dashboardHref(onderwerp, p)} actief={p === dagen}>
            {p} dagen
          </Chip>
        ))}
      </div>
    </nav>
  )
}
