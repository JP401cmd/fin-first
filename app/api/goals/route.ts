import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  serverError,
  unauthorized,
} from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import {
  CreateGoalSchema,
  UpdateGoalSchema,
  PATCHABLE_GOAL_COLUMNS,
  MAX_GOAL_BODY_BYTES,
  isAutoSyncGoalType,
  type GoalLinksInput,
} from './schema'

/**
 * Goals API — CRUD op financiële doelen.
 *
 *   GET    /api/goals[?id=…]  lijst (of één doel), verrijkt met `links`
 *   POST   /api/goals         nieuw doel, optioneel met koppelingen + auto-sync
 *   PATCH  /api/goals         doel bijwerken (gewhitelist), optioneel `links`-diff
 *   DELETE /api/goals?id=…    doel verwijderen (CASCADE ruimt de koppelingen op)
 *
 * ── SECURITY (ADR 0044 + ADR 0058) ────────────────────────────────────────────
 * Anon RLS-client via de server-helper — nooit service-role. `user_id` en
 * `household_id` komen uit de sessie resp. uit `household_members`, nooit uit de
 * body. Body-validatie loopt volledig via `./schema.ts`; foutvorm uitsluitend via
 * de respond-helpers (plat `{ error }`, nooit een rauwe `error.message`).
 *
 * ── KOPPELINGEN (`goal_links`, migratie 20260901140000) ───────────────────────
 * Eén doel kan aan meerdere bezittingen én schulden hangen. De legacy-kolommen
 * `goals.linked_asset_id` / `linked_debt_id` blijven bestaan (gebackfilld) maar
 * worden hier NIET meer geschreven — koppelen gaat uitsluitend via `links`.
 *
 * De datalaag is op drie punten strenger dan de route zou vermoeden; die drie
 * bepalen de vorm van de code hieronder:
 *   1. De guard-trigger `trg_guard_goal_link_owner` eist dat het DOEL, de
 *      bezitting én de schuld alle drie van `goal_links.user_id` zijn — óók op
 *      een gedeeld doel. Op andermans gedeelde doel kun je dus geen koppeling
 *      schrijven; deze route weigert dat vooraf met een 403 i.p.v. de trigger te
 *      laten struikelen.
 *   2. Die trigger raise't met errcode `42501` (niet `P0001`) — zie
 *      `linkWriteFailure`.
 *   3. De SELECT-policies op `assets`/`debts` zijn huishoud-verbreed. De
 *      eigenaarscontrole vooraf zet daarom een expliciete `.eq('user_id', …)`;
 *      RLS scope't dat daar níét (CLAUDE.md, datapad-conventie).
 */

// ── Postgres-foutcodes die we betekenisvol vertalen ──────────────────────────
const PG_UNIQUE_VIOLATION = '23505'
const PG_FOREIGN_KEY_VIOLATION = '23503'
const PG_CHECK_VIOLATION = '23514'
/** Ook de errcode waarmee `guard_goal_link_owner()` weigert. */
const PG_INSUFFICIENT_PRIVILEGE = '42501'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/** Eén koppelrij zoals hij in het response-contract terugkomt. */
type GoalLinkRef = { asset_id: string | null; debt_id: string | null }

/** Rij met een id — genoeg om doelen aan hun koppelingen te hangen. */
type WithId = { id?: unknown }

/** Get the household_id for the current user, or null */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getUserHouseholdId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.household_id ?? null
}

/**
 * Leest de body met een harde groottegrens en levert een verse `Request` op voor
 * `parseBody`. De `content-length`-header is een hint (kan ontbreken of liegen),
 * dus de echte grens ligt op de gelezen tekst — zelfde patroon als
 * `/api/toekomst-doel`. De reconstructie is nodig omdat `parseBody` een `Request`
 * verwacht en de originele stream na `.text()` verbruikt is.
 */
async function readCappedRequest(
  request: Request,
): Promise<{ ok: true; request: Request } | { ok: false; response: NextResponse }> {
  const declared = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > MAX_GOAL_BODY_BYTES) {
    return { ok: false, response: badRequest('Verzoek te groot', 'payload_too_large') }
  }

  let raw: string
  try {
    raw = await request.text()
  } catch {
    return { ok: false, response: badRequest('Ongeldig verzoek') }
  }
  if (raw.length > MAX_GOAL_BODY_BYTES) {
    return { ok: false, response: badRequest('Verzoek te groot', 'payload_too_large') }
  }

  return {
    ok: true,
    request: new Request(request.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw,
    }),
  }
}

// ── Koppelingen: lezen ───────────────────────────────────────────────────────

/**
 * Haalt de koppelrijen van een reeks doelen op, gegroepeerd per doel.
 *
 * BEWUST DEGRADEREND: faalt deze query, dan krijgt elk doel een lege `links` en
 * gaat de echte fout naar de serverlog. De verrijking is additief — een doelenlijst
 * die helemaal wegvalt breekt de check-in, een ontbrekende koppel-array niet.
 * Op de SCHRIJFpaden is deze coulance er expliciet níét.
 */
async function fetchLinksByGoal(
  supabase: SupabaseServerClient,
  goalIds: string[],
): Promise<Map<string, GoalLinkRef[]>> {
  const byGoal = new Map<string, GoalLinkRef[]>()
  if (goalIds.length === 0) return byGoal

  const { data, error } = await supabase
    .from('goal_links')
    .select('goal_id, asset_id, debt_id')
    .in('goal_id', goalIds)

  if (error) {
    console.error('[goals:links] ophalen mislukt:', error.code)
    return byGoal
  }

  for (const row of data ?? []) {
    const list = byGoal.get(row.goal_id) ?? []
    list.push({ asset_id: row.asset_id ?? null, debt_id: row.debt_id ?? null })
    byGoal.set(row.goal_id, list)
  }
  return byGoal
}

/** Hangt de koppelingen aan de doel-rijen (zonder de rijen zelf te muteren). */
function attachLinks<T extends WithId>(goals: T[], byGoal: Map<string, GoalLinkRef[]>) {
  return goals.map((goal) => ({
    ...goal,
    links: (typeof goal.id === 'string' ? byGoal.get(goal.id) : undefined) ?? [],
  }))
}

/** Verrijkt één doel met zijn koppelingen. */
async function withLinks<T extends WithId>(supabase: SupabaseServerClient, goal: T) {
  const id = typeof goal.id === 'string' ? goal.id : null
  const byGoal = await fetchLinksByGoal(supabase, id ? [id] : [])
  return { ...goal, links: (id ? byGoal.get(id) : undefined) ?? [] }
}

// ── Koppelingen: schrijven ───────────────────────────────────────────────────

/**
 * Controleert dat elke te koppelen bezitting/schuld van de gebruiker ZELF is,
 * vóór er iets geschreven wordt. Dit is niet alleen een vriendelijkere fout dan
 * de guard-trigger: het is ook de reden dat we bij POST geen half doel hoeven
 * achter te laten.
 *
 * De `.eq('user_id', …)` is verplicht en niet decoratief — de SELECT-policies op
 * `assets` en `debts` zijn huishoud-verbreed, dus zonder die filter zou de
 * bezitting van de partner hier legitiem "gevonden" worden terwijl de
 * guard-trigger 'm even later alsnog weigert.
 */
async function assertOwnsLinkTargets(
  supabase: SupabaseServerClient,
  userId: string,
  links: { assetIds: string[]; debtIds: string[] },
): Promise<NextResponse | null> {
  if (links.assetIds.length > 0) {
    const { data, error } = await supabase
      .from('assets')
      .select('id')
      .eq('user_id', userId)
      .in('id', links.assetIds)
    if (error) return serverError(error, 'goals:links-assets')
    if ((data?.length ?? 0) !== links.assetIds.length) {
      return badRequest('Een gekoppelde bezitting bestaat niet of is niet van jou.', 'invalid_link')
    }
  }

  if (links.debtIds.length > 0) {
    const { data, error } = await supabase
      .from('debts')
      .select('id')
      .eq('user_id', userId)
      .in('id', links.debtIds)
    if (error) return serverError(error, 'goals:links-debts')
    if ((data?.length ?? 0) !== links.debtIds.length) {
      return badRequest('Een gekoppelde schuld bestaat niet of is niet van jou.', 'invalid_link')
    }
  }

  return null
}

/**
 * Vertaalt een mislukte schrijfactie op `goal_links` naar een client-veilig
 * antwoord. De guard-trigger en RLS gebruiken beide `42501`; de FK- en
 * CHECK-schendingen betekenen "de client stuurde iets onmogelijks".
 * Alles wat we niet herkennen gaat via `serverError` (generieke tekst + logregel).
 */
function linkWriteFailure(err: unknown, tag: string): NextResponse {
  const code = (err as { code?: string } | null)?.code

  if (code === PG_INSUFFICIENT_PRIVILEGE) {
    console.error(`[${tag}] koppeling geweigerd door eigenaarsguard/RLS (${code})`)
    return forbidden('Je kunt alleen je eigen bezittingen en schulden aan een doel koppelen.')
  }
  if (code === PG_FOREIGN_KEY_VIOLATION || code === PG_CHECK_VIOLATION) {
    console.error(`[${tag}] ongeldige koppeling (${code})`)
    return badRequest('Ongeldige koppeling naar een bezitting of schuld.', 'invalid_link')
  }
  if (code === PG_UNIQUE_VIOLATION) {
    console.error(`[${tag}] dubbele koppeling (${code})`)
    return conflict('Deze koppeling bestaat al.', 'duplicate_link')
  }
  return serverError(err, tag)
}

/** Bouwt de insertrijen voor een set koppelingen. */
function buildLinkRows(
  userId: string,
  goalId: string,
  assetIds: string[],
  debtIds: string[],
) {
  return [
    ...assetIds.map((assetId) => ({
      user_id: userId,
      goal_id: goalId,
      asset_id: assetId,
      debt_id: null,
    })),
    ...debtIds.map((debtId) => ({
      user_id: userId,
      goal_id: goalId,
      asset_id: null,
      debt_id: debtId,
    })),
  ]
}

/**
 * Schrijft het VERSCHIL tussen de gevraagde en de bestaande koppelingen.
 *
 * Diff-keuzes, expliciet:
 *   - `links` niet meegestuurd ⇒ deze functie wordt niet aangeroepen; koppelingen
 *     blijven ongemoeid. Er is dus geen impliciete wipe.
 *   - TOEVOEGEN wordt bepaald tegen ÁLLE bestaande rijen van het doel (ook die van
 *     een ander), zodat we nooit een duplicaat proberen dat de partial unique index
 *     zou weigeren.
 *   - VERWIJDEREN gebeurt alleen op rijen van de gebruiker zélf. De DELETE-policy op
 *     `goal_links` is eigen-rij; een verzoek om andermans koppelrij te wissen zou
 *     anders stilzwijgend 0 rijen raken. Dat is vandaag theorie (schrijven mag toch
 *     alleen op je eigen doel), maar het houdt de diff eerlijk als de policy ooit
 *     verruimd wordt.
 */
async function applyLinkDiff(
  supabase: SupabaseServerClient,
  userId: string,
  goalId: string,
  links: GoalLinksInput,
): Promise<NextResponse | null> {
  const { data: existing, error: readError } = await supabase
    .from('goal_links')
    .select('id, user_id, asset_id, debt_id')
    .eq('goal_id', goalId)

  if (readError) return serverError(readError, 'goals:links-read')

  const rows = existing ?? []
  const presentAssets = new Set(rows.map((r) => r.asset_id).filter(Boolean) as string[])
  const presentDebts = new Set(rows.map((r) => r.debt_id).filter(Boolean) as string[])

  const wantedAssets = new Set(links.assetIds)
  const wantedDebts = new Set(links.debtIds)

  const addAssets = links.assetIds.filter((id) => !presentAssets.has(id))
  const addDebts = links.debtIds.filter((id) => !presentDebts.has(id))

  const removeIds = rows
    .filter((r) => r.user_id === userId)
    .filter((r) =>
      r.asset_id ? !wantedAssets.has(r.asset_id) : r.debt_id ? !wantedDebts.has(r.debt_id) : false,
    )
    .map((r) => r.id as string)

  // Eigenaarschap vóór de eerste schrijfactie: zo laat een geweigerde koppeling
  // nooit een half toegepaste diff achter.
  const ownership = await assertOwnsLinkTargets(supabase, userId, {
    assetIds: addAssets,
    debtIds: addDebts,
  })
  if (ownership) return ownership

  if (removeIds.length > 0) {
    const { error } = await supabase
      .from('goal_links')
      .delete()
      .in('id', removeIds)
      .eq('user_id', userId)
    if (error) return serverError(error, 'goals:links-delete')
  }

  if (addAssets.length > 0 || addDebts.length > 0) {
    const { error } = await supabase
      .from('goal_links')
      .insert(buildLinkRows(userId, goalId, addAssets, addDebts))
    if (error) return linkWriteFailure(error, 'goals:links-insert')
  }

  return null
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)

  if (!claims) {
    return unauthorized()
  }

  const { searchParams } = new URL(request.url)
  const goalId = searchParams.get('id')

  // Get user's household for shared goal access
  const householdId = await getUserHouseholdId(supabase, claims.sub)

  if (goalId) {
    // Get single goal (user's own OR shared from same household)
    let query = supabase
      .from('goals')
      .select('*')
      .eq('id', goalId)

    if (householdId) {
      query = query.or(`user_id.eq.${claims.sub},and(ownership.eq.shared,household_id.eq.${householdId})`)
    } else {
      query = query.eq('user_id', claims.sub)
    }

    const { data, error } = await query.single()

    if (error) {
      return notFound()
    }
    return NextResponse.json(await withLinks(supabase, data))
  }

  // Get all goals: user's own + shared household goals from partner
  let query = supabase
    .from('goals')
    .select('*')

  if (householdId) {
    query = query.or(`user_id.eq.${claims.sub},and(ownership.eq.shared,household_id.eq.${householdId})`)
  } else {
    query = query.eq('user_id', claims.sub)
  }

  const { data, error } = await query.order('sort_order', { ascending: true })

  if (error) {
    return serverError(error, 'goals:GET')
  }

  const goals = data ?? []
  // Koppelingen alleen voor EIGEN doelen ophalen. De lijst hierboven bevat ook
  // het gedeelde doel van de partner, en diens koppelrijen zijn via de
  // SELECT-policy leesbaar. De waarde lekt niet (RLS op `assets`/`debts` blijft
  // dicht, dus geen naam of bedrag), maar `asset_id` vs. `debt_id` verraadt de
  // SOORT en het aantal rijen het AANTAL van posten die de partner nooit deelde
  // — onder het standaard privacymodel een echt signaal. De koppel-UI staat op
  // een partner-doel toch al uit (de guard weigert schrijven), dus deze data is
  // daar nergens voor nodig.
  const ownIds = goals
    .filter((g) => g.user_id === claims.sub)
    .map((g) => g.id)
    .filter((id): id is string => typeof id === 'string')
  return NextResponse.json(attachLinks(goals, await fetchLinksByGoal(supabase, ownIds)))
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return unauthorized()
  }

  const capped = await readCappedRequest(request)
  if (!capped.ok) return capped.response

  const parsed = await parseBody(CreateGoalSchema, capped.request)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  // Huishoud-scoping server-bepaald: wie 'shared' vraagt zonder huishouden krijgt
  // geen stille degradatie naar 'personal' — dat zou een doel privé maken terwijl
  // het scherm "gedeeld" toont. `household_id` uit de body wordt genegeerd (het
  // staat niet eens in het schema).
  let goalHouseholdId: string | null = null
  if (body.ownership === 'shared') {
    goalHouseholdId = await getUserHouseholdId(supabase, user.id)
    if (!goalHouseholdId) {
      return badRequest('Je hebt geen huishouden — maak eerst een koppeling met je partner.')
    }
  }

  // Auto-sync: alleen zinvol voor doeltypen waarvan de waarde uit een kengetal
  // komt. `metadata` is en blijft server-bepaald; `bron: 'parameter'` zet deze
  // route nooit (dat blijft exclusief aan /api/toekomst-doel).
  if (body.sync === 'auto') {
    if (!isAutoSyncGoalType(body.goal_type)) {
      return badRequest('Dit doeltype kan niet automatisch meelopen met een kengetal.', 'sync_unsupported')
    }

    // Eén actief meelopend doel per type. App-laag-check: de partial unique index
    // in de database dekt alleen lab-parameterdoelen (metadata.bron='parameter')
    // en blijft ongemoeid.
    const { data: existingAuto, error: dupError } = await supabase
      .from('goals')
      .select('id')
      .eq('user_id', user.id)
      .eq('goal_type', body.goal_type)
      .eq('is_completed', false)
      .filter('metadata->>sync', 'eq', 'auto')
      .limit(1)

    if (dupError) return serverError(dupError, 'goals:POST')
    if ((existingAuto?.length ?? 0) > 0) {
      return conflict('Je hebt al een meelopend doel van dit type.', 'duplicate_auto_goal')
    }
  }

  const links = body.links ?? { assetIds: [], debtIds: [] }

  // VOLGORDE — bewust: eerst de eigenaarscontrole op de koppeldoelwitten, dan pas
  // het doel invoegen. Zo is het normale foutgeval (client stuurt een bezitting
  // van een ander) afgehandeld vóór er iets bestaat, en hoeven we niets terug te
  // draaien. De compenserende delete verderop dekt alleen het restrisico: een
  // race waarin de bezitting tussen de controle en de insert van eigenaar wisselt.
  const ownership = await assertOwnsLinkTargets(supabase, user.id, links)
  if (ownership) return ownership

  const row: Record<string, unknown> = {
    user_id: user.id,
    name: body.name,
    description: body.description,
    goal_type: body.goal_type,
    target_value: body.target_value,
    current_value: body.current_value,
    target_date: body.target_date,
    budget_id: body.budget_id,
    icon: body.icon ?? 'Target',
    color: body.color ?? 'teal',
    custom_unit: body.custom_unit,
    ownership: body.ownership,
    household_id: goalHouseholdId,
    // `linked_asset_id` / `linked_debt_id` bewust NIET gezet: legacy-kolommen.
  }
  if (body.sort_order !== undefined) row.sort_order = body.sort_order
  if (body.sync === 'auto') row.metadata = { sync: 'auto' }

  const { data: goal, error } = await supabase
    .from('goals')
    .insert(row)
    .select()
    .single()

  if (error) {
    return serverError(error, 'goals:POST')
  }

  if (links.assetIds.length > 0 || links.debtIds.length > 0) {
    const { error: linkError } = await supabase
      .from('goal_links')
      .insert(buildLinkRows(user.id, goal.id, links.assetIds, links.debtIds))

    if (linkError) {
      // Compensatie: laat geen doel achter dat de gevraagde koppelingen mist —
      // dat leest op het scherm als een geslaagde opslag met verdwenen invoer.
      const { error: rollbackError } = await supabase
        .from('goals')
        .delete()
        .eq('id', goal.id)
        .eq('user_id', user.id)
      if (rollbackError) {
        console.error('[goals:POST] terugdraaien van doel na koppelfout mislukt:', rollbackError.code)
      }
      return linkWriteFailure(linkError, 'goals:POST-links')
    }
  }

  return NextResponse.json(await withLinks(supabase, goal), { status: 201 })
}

// ── PATCH ────────────────────────────────────────────────────────────────────

/** Op welke titel de gebruiker dit doel mag muteren. */
type GoalAccess =
  | { scope: 'own'; isAuto: boolean }
  | { scope: 'shared'; householdId: string; isAuto: boolean }

/**
 * Bepaalt of (en hoe) de gebruiker dit doel mag muteren, vóór er geschreven wordt.
 * Vervangt de oude "probeer eigen rij, val terug op gedeeld"-volgorde: die kon niet
 * vertellen of een mislukte update aan toegang of aan een lege diff lag, en een
 * `links`-only wijziging heeft helemaal geen kolom-update om op mee te liften.
 *
 * "Bestaat niet" en "niet van jou" krijgen bewust hetzelfde antwoord (404) — geen
 * existentie-orakel op andermans doel-id's; zelfde lijn als de guard-trigger.
 */
async function resolveGoalAccess(
  supabase: SupabaseServerClient,
  userId: string,
  goalId: string,
): Promise<{ ok: true; access: GoalAccess } | { ok: false; response: NextResponse }> {
  const { data, error } = await supabase
    .from('goals')
    .select('id, user_id, ownership, household_id, metadata')
    .eq('id', goalId)
    .maybeSingle()

  if (error) return { ok: false, response: serverError(error, 'goals:PATCH') }
  if (!data) return { ok: false, response: notFound() }

  const isAuto =
    typeof data.metadata === 'object' &&
    data.metadata !== null &&
    (data.metadata as Record<string, unknown>).sync === 'auto'

  if (data.user_id === userId) return { ok: true, access: { scope: 'own', isAuto } }

  if (data.ownership === 'shared' && data.household_id) {
    const mine = await getUserHouseholdId(supabase, userId)
    if (mine && mine === data.household_id) {
      return { ok: true, access: { scope: 'shared', householdId: mine, isAuto } }
    }
  }

  return { ok: false, response: notFound() }
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return unauthorized()
  }

  const capped = await readCappedRequest(request)
  if (!capped.ok) return capped.response

  const parsed = await parseBody(UpdateGoalSchema, capped.request)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  const resolved = await resolveGoalAccess(supabase, user.id, body.id)
  if (!resolved.ok) return resolved.response
  const { access } = resolved

  // Koppelingen schrijven mag alleen op je EIGEN doel. Dat is geen keuze van deze
  // route maar van de datalaag: `guard_goal_link_owner()` eist dat het ouder-doel
  // van de schrijver is. Vooraf weigeren geeft een begrijpelijke 403 in plaats van
  // een generieke trigger-fout.
  if (body.links && access.scope !== 'own') {
    return forbidden('Koppelingen kun je alleen wijzigen op een doel dat van jou is.')
  }

  // Een meelopend doel wisselt helemaal niet van type. POST bewaakt bij aanmaak
  // dat `sync: 'auto'` alleen op een kengetal-type staat, maar `metadata` is hier
  // niet aanpasbaar — dus zonder deze toets kon je de marker laten staan en het
  // type omzetten. Twee gevolgen: naar een niet-kengetal-type heet het doel
  // "loopt automatisch mee" terwijl niemand het synchroniseert, en omdat de
  // bewerk-sheet bij zo'n doel géén invoerveld toont is de waarde daarna
  // onbereikbaar. Naar een ánder kengetal-type omzeilt het de "één meelopend doel
  // per type"-grens én houdt het de doelwaarde in de verkeerde eenheid
  // (procenten die ineens als jaartal gelezen worden).
  if (access.isAuto && body.goal_type !== undefined) {
    return badRequest(
      'Dit doel loopt automatisch mee met een kengetal; van type wisselen kan niet. Maak een nieuw doel aan.',
      'sync_unsupported',
    )
  }

  // Expliciete veld-whitelist. Alles wat hier niet in staat — `user_id`,
  // `household_id`, `ownership`, `metadata`, `linked_asset_id`, `linked_debt_id` —
  // is al door het zod-schema gestript en bereikt de database dus nooit.
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of PATCHABLE_GOAL_COLUMNS) {
    const value = body[key]
    if (value !== undefined) updateData[key] = value
  }

  // Houd het paar (is_completed, completed_at) samenhangend wanneer de client
  // alleen de vlag omzet: een afgerond doel zonder tijdstempel is niet te vieren
  // en niet te sorteren.
  if (body.is_completed === true && body.completed_at === undefined) {
    updateData.completed_at = new Date().toISOString()
  }
  if (body.is_completed === false && body.completed_at === undefined) {
    updateData.completed_at = null
  }

  let query = supabase.from('goals').update(updateData).eq('id', body.id)
  query = access.scope === 'own'
    ? query.eq('user_id', user.id)
    : query.eq('ownership', 'shared').eq('household_id', access.householdId)

  const { data: goal, error } = await query.select().maybeSingle()

  if (error) return serverError(error, 'goals:PATCH')
  // Geen rij terug ondanks geslaagde toegangscontrole: de rij is er tussen beide
  // stappen uit verdwenen (of een write-policy weigert 'm).
  if (!goal) return notFound()

  if (body.links) {
    const linkFailure = await applyLinkDiff(supabase, user.id, body.id, body.links)
    if (linkFailure) return linkFailure
  }

  return NextResponse.json(await withLinks(supabase, goal))
}

// ── DELETE ───────────────────────────────────────────────────────────────────

/**
 * Ongewijzigd van opzet: eigen rij eerst, dan het gedeelde huishoud-doel. De
 * koppelingen in `goal_links` verdwijnen mee via `ON DELETE CASCADE` — daar hoeft
 * hier niets voor te gebeuren. Alleen de rauwe foutteksten zijn vervangen door de
 * respond-helpers.
 */
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return unauthorized()
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return badRequest('Doel-id ontbreekt')
  }

  // Try deleting user's own goal
  const { data: ownGoal } = await supabase
    .from('goals')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle()

  if (ownGoal) return NextResponse.json({ success: true })

  // If not found, try shared household goal
  const householdId = await getUserHouseholdId(supabase, user.id)
  if (householdId) {
    const { error: sharedError } = await supabase
      .from('goals')
      .delete()
      .eq('id', id)
      .eq('ownership', 'shared')
      .eq('household_id', householdId)

    if (sharedError) {
      return serverError(sharedError, 'goals:DELETE')
    }
    return NextResponse.json({ success: true })
  }

  return notFound()
}
