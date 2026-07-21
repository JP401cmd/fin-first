import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import {
  computePageStatusInfo,
  normalizePageStatusRoute,
  asMinimizedLevel,
  readMinimizedLevel,
  ROUTE_FAMILY,
} from '@/lib/page-status/compute'
import {
  statusCacheKey,
  readStatusCache,
  writeStatusCache,
} from '@/lib/page-status/status-cache'
import { getServerPerspective } from '@/lib/household/server-perspective'
import type { MinimizedLevel } from '@/lib/page-status/display'

/**
 * GET /api/overzicht/page-status?route=<pathname>
 *
 * Levert de status-duiding (PageStatusInfo) voor ÉÉN /overzicht-route plus de
 * per-gebruiker "geminimaliseerd"-voorkeur van de status-duiding-banner voor
 * diezelfde route. Geeft `{ info: null, minimized: null }` als de route
 * groen/neutraal of buiten scope is.
 *
 * SINGLE SOURCE: de statusberekening én de route-familie-mapping wonen in
 * `lib/page-status/compute.ts` (`computePageStatusInfo` / `ROUTE_FAMILY` /
 * `normalizePageStatusRoute`), gedeeld met de server-pagina die de banner al
 * server-side seedt. Deze route blijft bestaan voor CLIENT-SIDE her-fetches:
 * een route-wissel binnen /overzicht (zie use-page-status.ts) haalt zo verse,
 * route-scoped status op zonder de hele pagina te herladen.
 *
 * Egress / route-scoped: `computePageStatusInfo` laadt bewust ALLEEN de
 * databron die de gevraagde route-familie nodig heeft — niet-cashflow-/niet-
 * freedom-routes raken de zware dashboard-loader dus NOOIT aan.
 *
 * De minimized-voorkeur komt uit `profiles.status_banner_minimized` (jsonb,
 * route → het LeverageStatus-niveau waarop de gebruiker de banner inklapte) en
 * wordt PARALLEL aan de statusberekening gelezen (Promise.all) — geen extra
 * seriële round-trip.
 */

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) {
      return NextResponse.json({ info: null, minimized: null }, { status: 401 })
    }

    const route = normalizePageStatusRoute(request.nextUrl.searchParams.get('route'))
    if (!route) {
      // Onbekende/buiten-scope-route → geen banner, geen data-load.
      return NextResponse.json({ info: null, minimized: null })
    }

    // CASHFLOW-familie: korte per-gebruiker+perspectief+route TTL-cache op de
    // (zware) statusberekening. De cashflow-subpagina's seeden hun status niet
    // server-side, dus elke subnavigatie her-fetcht hier; snel heen-en-weer klikken
    // herhaalt anders telkens loadDashboardData + loadCashflowData +
    // loadVasteLastenSummary. Staleness op een duidings-banner is akkoord
    // (kaart-besluit). De minimized-voorkeur wordt NOOIT gecachet (fris gelezen),
    // zodat minimaliseren/escalatie-heropening direct blijven werken. Andere
    // families (lever/box2/freedom) blijven ongecachet — freedom wordt al geseed.
    if (ROUTE_FAMILY[route] === 'cashflow') {
      const perspective = await getServerPerspective()
      const key = statusCacheKey(user.id, perspective, route)
      const cached = readStatusCache(key)
      const [info, minimized] = await Promise.all([
        cached.hit
          ? Promise.resolve(cached.info)
          : computePageStatusInfo(supabase, route),
        readMinimizedLevel(supabase, user.id, route),
      ])
      if (!cached.hit) writeStatusCache(key, info)
      return NextResponse.json({ info, minimized })
    }

    // De minimized-voorkeur (lichte single-row select) draait PARALLEL aan de
    // — soms zware — statusberekening, zodat we geen extra seriële round-trip
    // toevoegen. computePageStatusInfo kiest zelf de juiste, route-scoped databron.
    const [info, minimized] = await Promise.all([
      computePageStatusInfo(supabase, route),
      readMinimizedLevel(supabase, user.id, route),
    ])

    return NextResponse.json({ info, minimized })
  } catch (err) {
    console.error('[/api/overzicht/page-status]', err)
    return NextResponse.json({ error: 'Interne fout' }, { status: 500 })
  }
}

/**
 * PUT /api/overzicht/page-status
 *
 * Slaat de per-gebruiker "geminimaliseerd"-voorkeur van de status-duiding-banner
 * op voor één /overzicht-route. Body: `{ route: string, level: 'warn'|'bad'|null }`.
 *  - level 'warn'|'bad' → de gebruiker klapte de banner op dat niveau in.
 *  - level null         → voorkeur wissen (banner weer tonen).
 *
 * Schrijft read-modify-write op de jsonb-map in de EIGEN profielrij
 * (`.eq('id', user.id)`, RLS-scoped, anon-client). Nooit een service-role-client.
 * Valideert `route` via exact dezelfde `normalizePageStatusRoute`-allowlist als de GET.
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) {
      return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    // Malformed/ontbrekende body → 400 i.p.v. een generieke 500. Spiegelt de
    // parse-guard van /api/appearance (PUT) zodat een corrupte body een nette
    // client-fout geeft, niet een server-fout.
    let body: { route?: unknown; level?: unknown }
    try {
      body = (await request.json()) as { route?: unknown; level?: unknown }
    } catch {
      return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
    }

    // Route via dezelfde in-scope-allowlist als de GET — geen duplicatie.
    const route = normalizePageStatusRoute(
      typeof body.route === 'string' ? body.route : null,
    )
    if (!route) {
      return NextResponse.json({ error: 'Onbekende route' }, { status: 400 })
    }

    // Level moet exact 'warn' | 'bad' | null zijn.
    const level: MinimizedLevel | null =
      body.level === null ? null : asMinimizedLevel(body.level)
    if (body.level !== null && level === null) {
      return NextResponse.json({ error: 'Ongeldig niveau' }, { status: 400 })
    }

    // Read-modify-write op de eigen jsonb-map: lezen, sleutel zetten/wissen,
    // de volledige map terugschrijven naar UITSLUITEND de eigen rij (RLS).
    const { data: current } = await supabase
      .from('profiles')
      .select('status_banner_minimized')
      .eq('id', user.id)
      .single()

    const nextMap: Record<string, unknown> = {
      ...((current?.status_banner_minimized as Record<string, unknown>) ?? {}),
    }
    if (level === null) {
      delete nextMap[route]
    } else {
      nextMap[route] = level
    }

    const { error } = await supabase
      .from('profiles')
      .update({ status_banner_minimized: nextMap })
      .eq('id', user.id)

    if (error) throw error

    return NextResponse.json({ ok: true, minimized: level })
  } catch (err) {
    console.error('[/api/overzicht/page-status PUT]', err)
    return NextResponse.json({ error: 'Interne fout' }, { status: 500 })
  }
}
