'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { LeverageStatus } from '@/lib/leverage-status'
import type { CashflowCardStatuses } from '@/lib/cashflow-cards'

/**
 * De vier cashflow-kaartstatussen (Budget, Transacties, Vaste lasten, Forecast)
 * voor de sidebar-status-dots onder Cashflow. Spiegelt EXACT de statussen van de
 * cashflow-landingskaarten: beide consumeren `buildCashflowCards` +
 * `cashflowCardStatuses` — de hub direct (server-side), de sub-pagina's via
 * `GET /api/overzicht/cashflow-status`.
 *
 * INTERNE HOOK. Consumers gebruiken `useCashflowStatusContext()` uit
 * components/app/cashflow-status-provider.tsx; die provider is de ENIGE
 * aanroeper hiervan, zodat er per pagina hooguit één fetch loopt (spiegel van
 * usePageStatus ↔ PageStatusProvider).
 *
 * ── TWEE ROUTES, TWEE BRONNEN ───────────────────────────────────────────────
 *  · **De hub** (`/overzicht/cashflow`) berekent de vier kaarten toch al
 *    server-side en geeft de statussen mee via `<CashflowStatusSeed>`. Daar
 *    fetcht deze hook dus NOOIT — 0 requests, 0 queries.
 *  · **De sub-pagina's** (`/budget`, `/transacties`, `/vaste-lasten`,
 *    `/forecast`) hebben de kaarten niet server-side; die fetchen de route
 *    (één keer per route-bezoek, geen polling; server-side afgevlakt door de
 *    TTL-cache in lib/cashflow-status-cache.ts).
 *  · **Alle andere pagina's** raken het endpoint niet aan en tonen neutrale
 *    (grijze) dots — egress-gating, ongewijzigd.
 *
 * WAAROM DE HUB OP EEN ROUTE-REGEL STAAT EN NIET OP "IS ER AL EEN SEED?":
 * de seed komt uit een GESTREAMD blok (`<Suspense>` op de hub, perf T2.2) en
 * mount dus pas ná de eerste paint — ná het effect van de provider. Zou het
 * fetch-besluit van de aanwezigheid van de seed afhangen, dan won de fetch de
 * race precies zolang de loaders traag zijn, en verdampte de winst stilletjes.
 * Vergelijk `PageStatusSeed` op /overzicht: dat leunt wél op de
 * child-vóór-parent-effectvolgorde en valt in het gestreamde blok terug op de
 * client-fetch (zie components/overview/overzicht-secondary-loader.tsx). Hier is
 * die volgorde-afhankelijkheid weg-ontworpen: de seed hoeft alleen de WAARDE te
 * leveren (wanneer hij ook binnenkomt), niet de race te winnen.
 *
 * PERSPECTIEF HOORT IN DE DEPS. Een perspectiefwissel doet `router.refresh()`
 * (components/app/perspective-provider.tsx) — een ZACHTE refresh: server-
 * componenten hertekenen, clientstate overleeft. Op de hub is dat genoeg (de
 * hertekende `CashflowCardsLoader` seedt nieuwe waarden), maar op een sub-pagina
 * zou een effect zonder perspectief in de deps nooit opnieuw fetchen en zouden
 * huishoud-/partnerdots persoonlijke kleuren blijven tonen tot een routewissel.
 * Het perspectief staat daarom in de deps; de cookie is dan al geschreven (dat
 * gebeurt synchroon vóór de refresh), dus de route leest meteen het nieuwe
 * perspectief en de TTL-cache is per perspectief gesleuteld → gegarandeerd vers.
 *
 * Defensief: zolang er geen seed/antwoord is blijven alle statussen 'neutral'
 * (progressive enhancement) — precies de staat die de dots vandaag ook tijdens
 * de fetch tonen. Tijdens een lopende her-fetch blijven de VORIGE kleuren staan
 * i.p.v. naar grijs te vallen: dat is een kort venster (één request) en een
 * grijze flits bij elke perspectiefwissel is de slechtere ruil.
 */

/** De hub — de enige cashflow-route die zijn eigen statussen server-side levert. */
export const CASHFLOW_HUB_ROUTE = '/overzicht/cashflow'

export const NEUTRAL_CASHFLOW_STATUSES: CashflowCardStatuses = {
  budget: 'neutral',
  transacties: 'neutral',
  vasteLasten: 'neutral',
  forecast: 'neutral',
}

const VALID: readonly LeverageStatus[] = ['good', 'warn', 'bad', 'neutral']

function coerce(value: unknown): LeverageStatus {
  return typeof value === 'string' && (VALID as readonly string[]).includes(value)
    ? (value as LeverageStatus)
    : 'neutral'
}

/**
 * @param seed De server-berekende statussen van de hub, of null. Wordt alleen op
 *   `CASHFLOW_HUB_ROUTE` gelezen; elders is hij per definitie afwezig.
 * @param perspective Het actieve client-perspectief. Wijzigt het, dan haalt deze
 *   hook de statussen opnieuw op (zie de kop).
 */
export function useCashflowCardStatuses(
  seed: CashflowCardStatuses | null,
  perspective: string,
): CashflowCardStatuses {
  const pathname = usePathname() ?? '/'
  // Trailing slash strippen vóór de routevergelijking (Next normaliseert 'm weg,
  // maar een `/overzicht/cashflow/` zou anders als sub-pagina tellen).
  const route =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  // Begrensde match: alleen de hub zelf en zijn kinderen. Een losse prefixmatch
  // zou een zusterroute als `/overzicht/cashflow-instellingen` als sub-pagina
  // behandelen en 'm laten fetchen.
  const isHub = route === CASHFLOW_HUB_ROUTE
  const onCashflowRoute = isHub || route.startsWith(`${CASHFLOW_HUB_ROUTE}/`)
  const [fetched, setFetched] = useState<CashflowCardStatuses>(NEUTRAL_CASHFLOW_STATUSES)

  useEffect(() => {
    if (!onCashflowRoute || isHub) {
      // Off-route: niet fetchen; dots blijven neutral. Op de hub: de pagina
      // seedt de statussen zelf (zie de kop) — ook daar geen request.
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/overzicht/cashflow-status')
        if (!res.ok) return
        const data = (await res.json()) as Partial<Record<keyof CashflowCardStatuses, unknown>>
        if (cancelled) return
        setFetched({
          budget: coerce(data.budget),
          transacties: coerce(data.transacties),
          vasteLasten: coerce(data.vasteLasten),
          forecast: coerce(data.forecast),
        })
      } catch {
        // Stil falen — dots blijven neutral (progressive enhancement).
      }
    })()
    return () => {
      cancelled = true
    }
    // `perspective` staat hier bewust in: een wissel doet alleen een zachte
    // refresh, dus zonder deze dep zou de sub-pagina op de oude kleuren blijven
    // staan. De cleanup zet `cancelled`, dus een antwoord van het vórige
    // perspectief kan het nieuwe nooit overschrijven.
  }, [onCashflowRoute, isHub, perspective])

  if (!onCashflowRoute) return NEUTRAL_CASHFLOW_STATUSES
  return isHub ? (seed ?? NEUTRAL_CASHFLOW_STATUSES) : fetched
}
