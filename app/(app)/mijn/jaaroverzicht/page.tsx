import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { JaaroverzichtClient } from '@/components/mijn/jaaroverzicht-client'

export const metadata: Metadata = {
  title: 'Jaaroverzicht — TriFinity',
  description:
    'Jouw jaar in vrijheid: gewonnen vrijheidsdagen, vermogensgroei, je beste en zwakste spaarmaand en de rekening onder de streep.',
}

/**
 * /mijn/jaaroverzicht — "Jouw <jaar> in vrijheid".
 *
 * Server-wrapper conform het /mijn-subpagina-patroon (spiegel van
 * `/mijn/notificaties`): `NavStackMeta` levert de mobiele TopBar-titel én de
 * bottom-bar-kind, de client doet de rest. De titel staat óók in
 * `EXTRA_ROUTE_TITLES` (lib/nav-config.ts) zodat `resolveRouteTitle()` de
 * bovenbalk vult voordat de client gemount is.
 *
 * De data komt on-demand uit de bestaande route `/api/year-in-review` — een
 * lazy client-read via een API-route, het toegestane derde pad uit ADR 0058.
 */
export default function MijnJaaroverzichtPage() {
  return (
    <>
      <NavStackMeta title="Jaaroverzicht" bottomBar={{ kind: 'tabs' }} />
      <JaaroverzichtClient />
    </>
  )
}
