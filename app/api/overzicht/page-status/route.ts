import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { loadLeverScores } from '@/lib/lever-scores-loader'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { loadCashflowData } from '@/lib/cashflow-data-loader'
import { loadVasteLastenSummary } from '@/lib/vaste-lasten-summary'
import { buildCashflowCards } from '@/lib/cashflow-cards'
import { hasBox2Relevance } from '@/lib/box2-relevance'
import { resolvePageStatusMap } from '@/lib/page-status/resolve'
import type { PageStatusInfo } from '@/lib/page-status/types'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * GET /api/overzicht/page-status?route=<pathname>
 *
 * Levert de status-duiding (PageStatusInfo) voor ÉÉN /overzicht-route plus de
 * per-gebruiker "geminimaliseerd"-voorkeur van de status-duiding-banner voor
 * diezelfde route. Geeft `{ info: null, minimized: null }` als de route
 * groen/neutraal of buiten scope is.
 *
 * SINGLE SOURCE: hergebruikt EXACT dezelfde bronnen als de sidebar-dots en de
 * cashflow-kaarten (`loadLeverScores`, `buildCashflowCards`, `hasBox2Relevance`)
 * en de pure `resolvePageStatusMap`. Geen herberekening, geen drift met de dot.
 *
 * Egress / route-scoped: deze route is bewust LAZY én laadt ALLEEN de databron
 * die de gevraagde route-familie nodig heeft (zie use-page-status.ts):
 *  - hefbomen + Box 1/3 (bezittingen/schulden/cashflow/belasting/box1/box3)
 *    → loadLeverScores (één lichte set queries), GEEN dashboard-load.
 *  - cashflow-subkaarten (budget/transacties/vaste-lasten/forecast)
 *    → loadDashboardData + loadCashflowData + loadVasteLastenSummary.
 *  - belasting/box2 → hasBox2Relevance (één ja/nee-gate).
 * Niet-cashflow-routes raken de zware dashboard-loader dus NOOIT aan — dat was
 * de regressie die deze route oplost t.o.v. de eager layout-load.
 *
 * De minimized-voorkeur komt uit `profiles.status_banner_minimized` (jsonb,
 * route → het LeverageStatus-niveau waarop de gebruiker de banner inklapte) en
 * wordt PARALLEL aan de statusberekening gelezen (Promise.all) — geen extra
 * seriële round-trip.
 *
 * Perspectief-bewust via `getServerPerspective()` (dezelfde cookie als de
 * pagina), zodat de status ook in huishouden-/partner-weergave klopt — exact
 * zoals de cashflow-status-route het perspectief doorgeeft.
 */

/** Het niveau waarop een banner kan worden geminimaliseerd (warn of bad). */
type MinimizedLevel = 'warn' | 'bad'

/** Welke databron(nen) een in-scope route nodig heeft. */
type Family = 'lever' | 'cashflow' | 'box2'

const ROUTE_FAMILY: Record<string, Family> = {
  '/overzicht/bezittingen': 'lever',
  '/overzicht/schulden': 'lever',
  '/overzicht/cashflow': 'lever',
  '/overzicht/belasting': 'lever',
  '/overzicht/belasting/box1': 'lever',
  '/overzicht/belasting/box3': 'lever',
  '/overzicht/cashflow/budget': 'cashflow',
  '/overzicht/cashflow/transacties': 'cashflow',
  '/overzicht/cashflow/vaste-lasten': 'cashflow',
  '/overzicht/cashflow/forecast': 'cashflow',
  '/overzicht/belasting/box2': 'box2',
}

/**
 * Gedeelde in-scope-allowlist voor GET én PUT: normaliseert een pad (trailing
 * slash strippen) en geeft het terug ALLEEN als het in ROUTE_FAMILY zit —
 * anders null. Eén bron van waarheid; PUT valideert via exact dezelfde poort.
 */
function normalizeRoute(raw: string | null): string | null {
  if (!raw) return null
  // Trailing slash strippen (behalve de root "/"); leeg → niets.
  const trimmed = raw.length > 1 && raw.endsWith('/') ? raw.slice(0, -1) : raw
  return trimmed in ROUTE_FAMILY ? trimmed : null
}

/** Smalt een onbekende jsonb-waarde tot een geldig minimized-niveau (of null). */
function asMinimizedLevel(value: unknown): MinimizedLevel | null {
  return value === 'warn' || value === 'bad' ? value : null
}

/**
 * Leest `profiles.status_banner_minimized` van de EIGEN profielrij (RLS-scoped,
 * anon-client) en geeft het opgeslagen niveau voor één route terug, of null.
 * Lichte single-row select; bewust geen service-role.
 */
async function readMinimizedLevel(
  supabase: SupabaseClient,
  userId: string,
  route: string,
): Promise<MinimizedLevel | null> {
  const { data } = await supabase
    .from('profiles')
    .select('status_banner_minimized')
    .eq('id', userId)
    .single()

  const map = (data?.status_banner_minimized ?? {}) as Record<string, unknown>
  return asMinimizedLevel(map[route])
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) {
      return NextResponse.json({ info: null, minimized: null }, { status: 401 })
    }

    const route = normalizeRoute(request.nextUrl.searchParams.get('route'))
    if (!route) {
      // Onbekende/buiten-scope-route → geen banner, geen data-load.
      return NextResponse.json({ info: null, minimized: null })
    }

    const family = ROUTE_FAMILY[route]

    // De minimized-voorkeur (lichte single-row select) draait PARALLEL aan de
    // — soms zware — statusberekening, zodat we geen extra seriële round-trip
    // toevoegen. computeInfo() kiest zelf de juiste, route-scoped databron.
    const computeInfo = async (): Promise<PageStatusInfo | null> => {
      if (family === 'lever') {
        // Hefbomen + Box 1/3 — één lichte set queries, GEEN dashboard-load.
        const perspective = await getServerPerspective()
        const levers = await loadLeverScores(supabase, perspective)
        return resolvePageStatusMap({ levers })[route] ?? null
      }
      if (family === 'cashflow') {
        // Cashflow-subkaarten — dezelfde loaders als de cashflow-landingspagina.
        const perspective = await getServerPerspective()
        const [dashboardResult, cashflow, vasteLasten] = await Promise.all([
          loadDashboardData(supabase),
          loadCashflowData(supabase, perspective),
          loadVasteLastenSummary(supabase),
        ])
        const cashflowCards = buildCashflowCards(
          dashboardResult.dashboardData,
          cashflow,
          vasteLasten,
        )
        return resolvePageStatusMap({ cashflowCards })[route] ?? null
      }
      // box2 — alleen de ja/nee-gate.
      const box2Relevant = await hasBox2Relevance(supabase, user.id)
      return resolvePageStatusMap({ box2Relevant })[route] ?? null
    }

    const [info, minimized] = await Promise.all([
      computeInfo(),
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
 * Valideert `route` via exact dezelfde `normalizeRoute`-allowlist als de GET.
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
    const route = normalizeRoute(
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
