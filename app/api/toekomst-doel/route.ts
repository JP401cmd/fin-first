import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  parseToekomstScenarioPrefs,
  DOEL_PARAMETERS,
  type DoelParameter,
} from '@/lib/horizon/toekomst-scenario'
import {
  buildParameterGoalRows,
  PARAMETER_GOAL_TYPES,
  type ParameterGoalRow,
} from '@/lib/horizon/toekomst-doel'

/**
 * PUT /api/toekomst-doel
 *
 * Promotie-route van "verkennen wordt richten": legt de actuele lab-stand vast als
 * persistent doelscenario (`vastleggen`) of maakt het weer los (`loslaten`). Een
 * doelscenario GENEREERT parameter-doel-rijen in `goals` (spaarquote/salaris/rendement/
 * fire) én schrijft een `doel`-blok in `profiles.toekomst_scenario_prefs` — twee stores
 * die consistent moeten blijven. Daarom een dunne server-route i.p.v. de generieke
 * goals-API (metadata wordt UITSLUITEND server-side gezet — kleiner security-oppervlak).
 *
 * SECURITY (spiegelt /api/toekomst-scenario):
 *   - authz via `supabase.auth.getUser()` (401 zonder sessie);
 *   - anon RLS-client via de server-helper — NOOIT service-role; elke query expliciet
 *     `.eq('user_id', user.id)` resp. `.eq('id', user.id)` (own-row) naast de RLS-policies;
 *   - body-grootte begrensd (8 KB) vóór parsen; malformed/ongeldig → 400;
 *   - `parseToekomstScenarioPrefs` blijft de ENIGE schrijfpoort op de pref (saneert de
 *     doelstand met de canonieke clamps); een ongeldige stand ⇒ 400 (nooit rauwe JSON);
 *   - alleen `error.code` gelogd, geen PII/kolominhoud. Geen GET.
 *
 * Volgorde bij vastleggen: eerst de goals (idempotent per type via select-then-
 * update/insert op het `(user_id, goal_type, bron='parameter')`-anker), dan de pref —
 * zodat een herhaalde vastlegging geen dubbele rijen maakt.
 */

// De payload is klein (≤ 4 vinkjes + doelwaarden + een compacte stand). 8 KB is ruim.
const MAX_BODY_BYTES = 8 * 1024

// Postgres unique_violation — het race-vangnet van de partial unique index.
const UNIQUE_VIOLATION = '23505'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Interpreteer een onbekende waarde als eindig getal, anders `undefined` (boundary-sanitize). */
function numOrUndef(v: unknown): number | undefined {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
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

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }
  if (!isPlainObject(body)) {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }

  if (body.action === 'vastleggen') {
    return handleVastleggen(supabase, user.id, body)
  }
  if (body.action === 'loslaten') {
    return handleLoslaten(supabase, user.id)
  }
  return NextResponse.json({ error: 'Ongeldige actie' }, { status: 400 })
}

// ── vastleggen ─────────────────────────────────────────────────────────────────

async function handleVastleggen(
  supabase: SupabaseServerClient,
  userId: string,
  body: Record<string, unknown>,
) {
  // Parameters: whitelist tegen de vier bekende keys; alleen `true` telt (nooit
  // client-waarden vertrouwen). Zonder geldige parameter is er niets te promoveren.
  const parameters: Partial<Record<DoelParameter, true>> = {}
  if (isPlainObject(body.parameters)) {
    for (const p of DOEL_PARAMETERS) {
      if (body.parameters[p] === true) parameters[p] = true
    }
  }
  if (Object.keys(parameters).length === 0) {
    return NextResponse.json({ error: 'Geen doelparameters' }, { status: 400 })
  }

  // Doelwaarden: boundary-sanitize naar eindige getallen; de pure builder clampt verder.
  const dw = isPlainObject(body.doelwaarden) ? body.doelwaarden : {}
  const { rows } = buildParameterGoalRows({
    parameters,
    doelwaarden: {
      spaarquotePct: numOrUndef(dw.spaarquotePct),
      salarisMnd: numOrUndef(dw.salarisMnd),
      rendementPct: numOrUndef(dw.rendementPct),
      fireLeeftijd: numOrUndef(dw.fireLeeftijd),
      margeJaren: numOrUndef(dw.margeJaren),
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
  const stand = isPlainObject(body.stand) ? body.stand : {}

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
 * De insert-rij voor een parameter-doel. `current_value` = 0: de will-data-loader (stap 4)
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
  // 1. Verwijder alle vier parameter-typen (own-row, alleen bron='parameter' — handmatige
  //    savings_rate/salary-doelen blijven ongemoeid).
  const { error: deleteError } = await supabase
    .from('goals')
    .delete()
    .eq('user_id', userId)
    .in('goal_type', [...PARAMETER_GOAL_TYPES])
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
