import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  parseToekomstScenarioPrefs,
  stripStopKeuze,
  DOEL_PARAMETERS,
  type DoelParameter,
} from '@/lib/horizon/toekomst-scenario'
import {
  buildParameterGoalRows,
  PARAMETER_GOAL_TYPES,
  LEGACY_PARAMETER_GOAL_TYPES,
  PARAM_TO_GOAL_TYPE,
  type ParameterGoalRow,
} from '@/lib/horizon/toekomst-doel'
import { FIRE_PLAN_COLUMNS, isFixedAnchor, PERPETUAL_END_AGE, resolveFirePlanWithOverride, type FirePlan } from '@/lib/fire-strategy'
import { badRequest, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { ToekomstDoelBodySchema, type VastleggenBody } from './schema'

/**
 * PUT /api/toekomst-doel
 *
 * Promotie-route van "verkennen wordt richten": legt de actuele lab-stand vast als
 * persistent doelscenario (`vastleggen`) of maakt het weer los (`loslaten`). Een
 * doelscenario GENEREERT parameter-doel-rijen in `goals` (spaarquote/rendement/fire/
 * dekking) én schrijft een `doel`-blok in `profiles.toekomst_scenario_prefs` — twee stores
 * die consistent moeten blijven. Daarom een dunne server-route i.p.v. de generieke
 * goals-API (metadata wordt UITSLUITEND server-side gezet — kleiner security-oppervlak).
 *
 * SECURITY (spiegelt /api/toekomst-scenario):
 *   - authz via `supabase.auth.getUser()` (401 zonder sessie);
 *   - anon RLS-client via de server-helper — NOOIT service-role; elke query expliciet
 *     `.eq('user_id', user.id)` resp. `.eq('id', user.id)` (own-row) naast de RLS-policies;
 *   - body-grootte begrensd (8 KB) vóór parsen; daarna de vorm via zod (`./schema`,
 *     `parseBody`) — malformed/ongeldig → 400;
 *   - `parseToekomstScenarioPrefs` blijft de ENIGE schrijfpoort op de pref (saneert de
 *     doelstand met de canonieke clamps); een ongeldige stand ⇒ 400 (nooit rauwe JSON);
 *   - alleen `error.code` gelogd, geen PII/kolominhoud. Geen GET.
 *
 * Volgorde bij vastleggen: eerst de goals (idempotent per type via select-then-
 * update/insert op het `(user_id, goal_type, bron='parameter')`-anker), dan de pref —
 * zodat een herhaalde vastlegging geen dubbele rijen maakt.
 *
 * HET ANKER IS SERVER-BEPAALD (ADR 0145 D3). De route leest het plan (stop-anker ×
 * eind-vorm) uit het eigen profiel met exact dezelfde lezing als de loaders en de
 * kernel-adapter (`resolveFirePlanWithOverride` op `FIRE_PLAN_COLUMNS` +
 * `feature_preferences`) en beslist zélf welk uitkomstdoel bij het anker hoort:
 *   - `solved`  → `fire` mag, `dekking` niet (400);
 *   - `aow`/`age` → `fire` wordt gestript (geen vrijheidsleeftijd om vast te leggen),
 *     `dekking` krijgt de plan-velden (eindleeftijd/anker/stopleeftijd) uit het profiel
 *     — nooit uit de body — en de stopkeuze verdwijnt uit `doel.stand` (D4);
 *   - `now` → geen doel uit het lab (400; `loslaten` blijft).
 * Ná de upserts wordt de anker-onverenigbare rij verwijderd (`fire_age` onder een vast
 * anker, `plan_coverage` onder `solved`): de anker-wissel-reconciliatie, bewust hier en
 * niet in /api/fire-settings.
 */

// De payload is klein (≤ 4 vinkjes + doelwaarden + een compacte stand). 8 KB is ruim.
const MAX_BODY_BYTES = 8 * 1024

// Postgres unique_violation — het race-vangnet van de partial unique index.
const UNIQUE_VIOLATION = '23505'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Merge een `doel`-blok in de bestaande rauwe pref en parse door de canonieke poort.
 * Forceert `v: 2` zodat het doel-blok wordt meegenomen (de parser leest `doel` alleen
 * bij v2) én overschrijft een eventueel oud `doel`. `null` = de doelstand is ongeldig
 * (of de pref onparseerbaar) → de caller vertaalt dat naar 400.
 */
function parsePrefWithDoel(existingRaw: Record<string, unknown> | null, doel: unknown) {
  return parseToekomstScenarioPrefs({ ...(existingRaw ?? {}), v: 2, doel })
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Body-grootte begrenzen vóór het parsen (Content-Length is een hint; de echte grens
  // ligt op de gelezen tekst zodat een ontbrekende/foute header niet ontsnapt).
  const declaredLength = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Verzoek te groot' }, { status: 413 })
  }

  let raw: string
  try {
    raw = await request.text()
  } catch {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Verzoek te groot' }, { status: 413 })
  }

  // De stream is na `.text()` verbruikt; `parseBody` krijgt een verse Request met de
  // al begrensde tekst (zelfde reconstructie als `readCappedRequest` in /api/goals).
  const parsed = await parseBody(
    ToekomstDoelBodySchema,
    new Request(request.url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: raw }),
  )
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  if (body.action === 'loslaten') {
    return handleLoslaten(supabase, user.id)
  }
  return handleVastleggen(supabase, user.id, body)
}

// ── vastleggen ─────────────────────────────────────────────────────────────────

/**
 * Het plan van de ingelogde gebruiker — eigen rij, dezelfde kolommen en dezelfde
 * resolver als de loaders/kernel-adapter (L1: `FIRE_PLAN_COLUMNS`, nooit drie van de
 * vijf). `null` bij een DB-fout (de caller antwoordt 500).
 */
async function readFirePlan(supabase: SupabaseServerClient, userId: string): Promise<FirePlan | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(`${FIRE_PLAN_COLUMNS}, feature_preferences`)
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.error('[/api/toekomst-doel PUT] plan read mislukt:', error.code)
    return null
  }
  // Een ontbrekende rij gedraagt zich als `solved` (zelfde tolerantie als de loaders).
  return resolveFirePlanWithOverride((data ?? {}) as Parameters<typeof resolveFirePlanWithOverride>[0])
}

async function handleVastleggen(
  supabase: SupabaseServerClient,
  userId: string,
  body: VastleggenBody,
) {
  // Het anker eerst: het bepaalt welk uitkomstdoel hier überhaupt mag (ADR 0145 D3).
  const plan = await readFirePlan(supabase, userId)
  if (plan === null) {
    return serverError(new Error('plan read mislukt'), 'toekomst-doel:PUT:plan')
  }
  const anchorFixed = isFixedAnchor(plan)
  if (plan.anchor.kind === 'now') {
    // E6: verkennen mag, geen doel uit het lab. `loslaten` blijft beschikbaar.
    return badRequest('Onder dit stopmoment legt het lab geen doel vast', 'anchor_now')
  }

  // Parameters: het schema liet alleen bekende keys met `true` door; hier alleen
  // overnemen wat daadwerkelijk gekozen is (een optionele sleutel kan leeg meekomen).
  // Zonder geldige parameter is er niets te promoveren.
  const parameters: Partial<Record<DoelParameter, true>> = {}
  for (const p of DOEL_PARAMETERS) {
    if (body.parameters[p] === true) parameters[p] = true
  }
  const hadParameters = Object.keys(parameters).length > 0
  if (anchorFixed) {
    // Onder aow/age is er geen vrijheidsleeftijd om vast te leggen: een client die
    // `fire: true` stuurt (oude client, of een verkende stop) krijgt géén fire_age-rij.
    delete parameters.fire
  } else if (parameters.dekking) {
    return badRequest('Een dekkingsdoel hoort bij een vast stopmoment', 'dekking_vereist_vast_anker')
  }
  if (Object.keys(parameters).length === 0) {
    // Leeg ná het strippen onder een vast anker is een ander geval dan een lege keuze:
    // de client koos alleen `fire`, en die hoort niet bij dit plan. De `code` laat de
    // client dat onderscheiden (en de tekst tonen); de tekst zelf blijft gelijk.
    return hadParameters
      ? badRequest('Geen doelparameters', 'geen_parameters_na_plan')
      : NextResponse.json({ error: 'Geen doelparameters' }, { status: 400 })
  }

  // Doelwaarden: het schema liet alleen eindige getallen door; de pure builder clampt
  // verder. De PLAN-velden van het dekkingsdoel komen uit het profiel, nooit uit de body
  // (het schema stript ze).
  const dw = body.doelwaarden
  const { rows } = buildParameterGoalRows({
    parameters,
    doelwaarden: {
      spaarquotePct: dw.spaarquotePct,
      rendementPct: dw.rendementPct,
      fireLeeftijd: dw.fireLeeftijd,
      margeJaren: dw.margeJaren,
      ...(anchorFixed && plan.anchor.kind !== 'solved'
        ? {
            // Zelfde eindleeftijd als de kernel (`eindleeftijdVan`): onder `perpetual`
            // rekent die tot PERPETUAL_END_AGE, niet tot het opgeslagen veld.
            planEindleeftijd: plan.endForm === 'perpetual' ? PERPETUAL_END_AGE : plan.endAge,
            planStopAnker: plan.anchor.kind,
            planStopLeeftijd: plan.anchor.kind === 'age' ? plan.anchor.age : null,
          }
        : {}),
    },
  })
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Geen geldige doelwaarden' }, { status: 400 })
  }

  // De pref-parameters spiegelen exact de rijen die we gaan schrijven (pref ↔ rijen
  // consistent — overgeslagen parameters komen niet in het doel-blok).
  const doelParameters: Partial<Record<DoelParameter, true>> = {}
  for (const row of rows) doelParameters[row.parameter] = true

  const gezetOp = new Date().toISOString()
  // Onder een vast anker is de stopkeuze geen doelstand (D4): de slider verkent daar
  // alleen, dus `stopAge`/`stopKoppel`/`stopMarge` verdwijnen vóór de pref-write.
  const stand = anchorFixed ? stripStopKeuze(body.stand) : body.stand

  // Valideer de doelstand VÓÓR we goals schrijven: een ongeldige stand mag geen
  // wees-goals achterlaten. De parser is de enige poort en saneert de stand.
  const probe = parsePrefWithDoel({}, { gezetOp, parameters: doelParameters, stand })
  if (!probe?.doel) {
    return NextResponse.json({ error: 'Ongeldige doelstand' }, { status: 400 })
  }

  // Goals eerst (idempotent per type). goalIds voedt de pref-cache.
  const goalIds: Partial<Record<DoelParameter, string>> = {}
  for (const row of rows) {
    const id = await upsertParameterGoal(supabase, userId, row)
    if (id === null) {
      return NextResponse.json({ error: 'Fout bij opslaan' }, { status: 500 })
    }
    goalIds[row.parameter] = id
  }

  // Anker-wissel-reconciliatie: de rij van het uitkomstdoel dat NIET bij dit anker hoort
  // (fire_age onder een vast anker, plan_coverage onder solved) gaat weg — own-row, alleen
  // bron='parameter', zodat een handmatig doel van hetzelfde type ongemoeid blijft.
  const onverenigbaar = anchorFixed ? PARAM_TO_GOAL_TYPE.fire : PARAM_TO_GOAL_TYPE.dekking
  const { error: reconcileError } = await supabase
    .from('goals')
    .delete()
    .eq('user_id', userId)
    .eq('goal_type', onverenigbaar)
    .filter('metadata->>bron', 'eq', 'parameter')
  if (reconcileError) {
    return serverError(reconcileError, 'toekomst-doel:PUT:reconcile')
  }

  // Pref daarna: read → merge doel-blok (mét goalIds) → parse → own-row write.
  const { data: profileRow, error: readError } = await supabase
    .from('profiles')
    .select('toekomst_scenario_prefs')
    .eq('id', userId)
    .maybeSingle()
  if (readError) {
    console.error('[/api/toekomst-doel PUT] pref read mislukt:', readError.code)
    return NextResponse.json({ error: 'Fout bij opslaan' }, { status: 500 })
  }

  const existingRaw = isPlainObject(profileRow?.toekomst_scenario_prefs)
    ? profileRow.toekomst_scenario_prefs
    : null
  const parsed = parsePrefWithDoel(existingRaw, {
    gezetOp,
    parameters: doelParameters,
    stand,
    goalIds,
  })
  // Defensief: de stand is al gevalideerd, dus dit hoort niet te falen.
  if (!parsed?.doel) {
    return NextResponse.json({ error: 'Ongeldige doelstand' }, { status: 400 })
  }

  const { error: writeError } = await supabase
    .from('profiles')
    .update({ toekomst_scenario_prefs: parsed })
    .eq('id', userId)
  if (writeError) {
    console.error('[/api/toekomst-doel PUT] pref write mislukt:', writeError.code)
    return NextResponse.json({ error: 'Fout bij opslaan' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, goalIds })
}

/**
 * Upsert één parameter-doel-rij op het `(user_id, goal_type, bron='parameter')`-anker.
 * Een partial unique index kan niet via supabase-js `.upsert(onConflict)` (index-inferentie
 * faalt), dus: SELECT-bestaande → UPDATE óf INSERT (own-row). Verliest de INSERT een race
 * (unique_violation), dan is de rij intussen door een parallelle write gemaakt → her-select
 * + UPDATE ("bestond al"). Retourneert het rij-id, of `null` bij een echte DB-fout.
 */
async function upsertParameterGoal(
  supabase: SupabaseServerClient,
  userId: string,
  row: ParameterGoalRow,
): Promise<string | null> {
  const existing = await selectParameterGoalId(supabase, userId, row.goal_type)
  if (!existing.ok) return null
  if (existing.id) return updateParameterGoal(supabase, userId, existing.id, row)

  const { data, error } = await supabase
    .from('goals')
    .insert(buildInsertRow(userId, row))
    .select('id')
    .single()
  if (!error && data?.id) return data.id as string

  if (error?.code === UNIQUE_VIOLATION) {
    // Race: de rij bestaat nu tóch → her-select en update (idempotent eindresultaat).
    const raced = await selectParameterGoalId(supabase, userId, row.goal_type)
    if (raced.ok && raced.id) return updateParameterGoal(supabase, userId, raced.id, row)
  }

  console.error('[/api/toekomst-doel PUT] goal insert mislukt:', error?.code)
  return null
}

/** Zoek de bestaande parameter-doel-rij van dit type (own-row). `ok:false` = DB-fout. */
async function selectParameterGoalId(
  supabase: SupabaseServerClient,
  userId: string,
  goalType: string,
): Promise<{ ok: true; id: string | null } | { ok: false }> {
  const { data, error } = await supabase
    .from('goals')
    .select('id')
    .eq('user_id', userId)
    .eq('goal_type', goalType)
    .filter('metadata->>bron', 'eq', 'parameter')
    .maybeSingle()
  if (error) {
    console.error('[/api/toekomst-doel PUT] goal select mislukt:', error.code)
    return { ok: false }
  }
  return { ok: true, id: (data?.id as string | undefined) ?? null }
}

/** Overschrijf de bestaande parameter-doel-rij met de nieuwe stand (own-row). */
async function updateParameterGoal(
  supabase: SupabaseServerClient,
  userId: string,
  id: string,
  row: ParameterGoalRow,
): Promise<string | null> {
  const { error } = await supabase
    .from('goals')
    .update({
      name: row.name,
      target_value: row.target_value,
      icon: row.icon,
      color: row.color,
      metadata: row.metadata,
      is_completed: false,
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId)
  if (error) {
    console.error('[/api/toekomst-doel PUT] goal update mislukt:', error.code)
    return null
  }
  return id
}

/**
 * De insert-rij voor een parameter-doel. `current_value` = 0: de fin-data-loader (stap 4)
 * injecteert de echte huidige waarde bij het lezen. `metadata` komt uit de builder (bron/
 * oorsprong/marge) — nooit uit de client.
 */
function buildInsertRow(userId: string, row: ParameterGoalRow) {
  return {
    user_id: userId,
    name: row.name,
    description: null,
    goal_type: row.goal_type,
    target_value: row.target_value,
    current_value: 0,
    target_date: null,
    linked_asset_id: null,
    linked_debt_id: null,
    icon: row.icon,
    color: row.color,
    ownership: 'personal',
    household_id: null,
    metadata: row.metadata,
  }
}

// ── loslaten ─────────────────────────────────────────────────────────────────

async function handleLoslaten(supabase: SupabaseServerClient, userId: string) {
  // 1. Verwijder alle parameter-typen (`PARAMETER_GOAL_TYPES`, incl. fire_age én
  //    plan_coverage, plus `LEGACY_PARAMETER_GOAL_TYPES` — de `salary`-rijen die het lab
  //    vóór 15 sep 2026 nog aanmaakte — own-row, alleen bron='parameter'; handmatige
  //    savings_rate/salary-doelen die de gebruiker zelf aanmaakte blijven ongemoeid).
  //    Werkt onder élk anker, ook `now`.
  const { error: deleteError } = await supabase
    .from('goals')
    .delete()
    .eq('user_id', userId)
    .in('goal_type', [...PARAMETER_GOAL_TYPES, ...LEGACY_PARAMETER_GOAL_TYPES])
    .filter('metadata->>bron', 'eq', 'parameter')
  if (deleteError) {
    console.error('[/api/toekomst-doel PUT] goals delete mislukt:', deleteError.code)
    return NextResponse.json({ error: 'Fout bij opslaan' }, { status: 500 })
  }

  // 2. Pref: read → `doel` verwijderen → parse (enige poort) → own-row write.
  const { data: profileRow, error: readError } = await supabase
    .from('profiles')
    .select('toekomst_scenario_prefs')
    .eq('id', userId)
    .maybeSingle()
  if (readError) {
    console.error('[/api/toekomst-doel PUT] pref read mislukt:', readError.code)
    return NextResponse.json({ error: 'Fout bij opslaan' }, { status: 500 })
  }

  const existingRaw = isPlainObject(profileRow?.toekomst_scenario_prefs)
    ? profileRow.toekomst_scenario_prefs
    : null
  const rest: Record<string, unknown> = { ...(existingRaw ?? {}) }
  delete rest.doel
  const parsed = parseToekomstScenarioPrefs({ ...rest, v: 2 })
  if (!parsed) {
    // Zou niet mogen (we forceren v:2) — maar nooit rauwe data wegschrijven.
    return NextResponse.json({ error: 'Fout bij opslaan' }, { status: 500 })
  }

  const { error: writeError } = await supabase
    .from('profiles')
    .update({ toekomst_scenario_prefs: parsed })
    .eq('id', userId)
  if (writeError) {
    console.error('[/api/toekomst-doel PUT] pref write mislukt:', writeError.code)
    return NextResponse.json({ error: 'Fout bij opslaan' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
