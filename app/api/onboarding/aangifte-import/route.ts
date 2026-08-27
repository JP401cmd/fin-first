/**
 * Aangifte-import endpoint.
 *
 * Receives a confirmed `AangifteImportPayload` from the review-step and
 * writes the assets, debts, balance-snapshots and profile-updates in a
 * single best-effort transaction. The shape is owned by `lib/aangifte/types.ts`
 * (Phase A contracts) — this file is a server boundary that re-validates
 * via Zod and translates the payload into Supabase writes.
 *
 * Privacy: server-side logging never includes amounts or names. Errors are
 * logged with type/code only; callers see a single human-readable message.
 *
 * Idempotency: a DURABLE claim row in `import_idempotency`, keyed on a
 * SERVER-DERIVED SHA-256 content hash of the payload
 * (`lib/aangifte/import-key.ts`). Two properties matter:
 *
 *   · SERVER-BEPAALD. The client-supplied `idempotency_key` is accepted by
 *     the schema (rolling-deploy compatibility) but IGNORED — exactly as
 *     `/api/transactions/import` ignores the client `import_hash` and
 *     recomputes it. That field was a fresh randomUUID per submit attempt,
 *     so two submits from the same review never carried the same key and
 *     the old dedup could not fire at all.
 *   · DUURZAAM. The previous guard was a Map in process memory. On Vercel
 *     every instance is short-lived, so a second submit after a cold start
 *     found an empty cache and re-wrote assets and debts. Only
 *     `balance_snapshots` was protected, by its own UNIQUE constraint.
 *
 * Flow: claim `status='pending'` BEFORE the write phase; a 23505 means
 * someone was here first (replay the stored response, or 409 while it is
 * still running). Failures delete the claim so a retry is allowed, and a
 * `pending` claim older than 15 minutes is taken over so a crashed request
 * cannot block the user forever.
 *
 * DELETE branch: bulk-removal of all aangifte-imported assets+debts for a
 * given peildatum (`?peildatum=YYYY-MM-DD`). Called from the koppelingen-page
 * for "Verwijder alle aangifte-imports van peildatum X". It also releases the
 * matching claims — otherwise the content hash would permanently block a
 * legitimate re-import after a deliberate bulk delete.
 */

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { buildAssetDraft, buildDebtDraft } from '@/lib/quick-add/build-drafts'
import { accountNumberWriteColumns } from '@/lib/asset-account-number'
import {
  deriveAangifteImportKey,
  AANGIFTE_IMPORT_SCOPE,
} from '@/lib/aangifte/import-key'
import type {
  AangifteImportPayload,
  AangifteImportResponse,
  AangifteAssetReviewItem,
  AangifteDebtReviewItem,
} from '@/lib/aangifte/types'

// ── Durable idempotency claim ───────────────────────────────────────
//
// Vervangt de vorige cache in procesgeheugen (Map + in-flight-Set). Die
// kon de vraag "is deze aangifte al geïmporteerd?" principieel niet
// beantwoorden: het antwoord moet het proces overleven en op Vercel doet
// procesgeheugen dat niet.
//
// De claim is één rij in `import_idempotency` met PK (user_id, scope, key).
// De INSERT zelf is de synchronisatie: Postgres laat er precies één winnen
// en geeft de verliezer 23505. Daarmee vervalt de aparte in-flight-Set —
// die werkte alleen binnen één instantie, deze uniciteit werkt erover heen.

const CLAIM_TABLE = 'import_idempotency'

/**
 * Een `pending` claim van een request dat stierf midden in de schrijffase
 * zou de gebruiker permanent blokkeren. Na deze periode nemen we zo'n
 * verweesde claim over.
 *
 * BEWUSTE CAP — expliciet en gedocumenteerd: ruim boven de duur van een
 * normale import (seconden), ruim onder wat een gebruiker als "vast"
 * ervaart. Te kort en twee gelijktijdige submits lopen alsnog beide de
 * schrijffase in; te lang en een crash kost de gebruiker een halve dag.
 */
const CLAIM_TAKEOVER_MINUTES = 15

/** Het opgeslagen succes-antwoord: uitsluitend rij-id's, geen bedragen/namen. */
interface StoredClaimResponse {
  asset_ids: string[]
  debt_ids: string[]
}

type ClaimOutcome =
  /** Wij hebben de claim; de schrijffase mag draaien. */
  | { kind: 'claimed' }
  /** Deze import was al klaar; geef het bewaarde antwoord terug. */
  | { kind: 'replay'; body: AangifteImportResponse }
  /** Een andere request is er nu mee bezig. */
  | { kind: 'in_progress' }
  /** De claim-administratie zelf faalde; niet schrijven. */
  | { kind: 'error' }

/**
 * Legt de claim vóór de schrijffase, of stelt vast waarom dat niet mag.
 *
 * Volgorde is essentieel: eerst claimen, dan pas schrijven. Andersom
 * (schrijven en daarna registreren) laat precies het gat open dat deze
 * kaart dicht — twee requests die beide al aan het schrijven zijn.
 */
async function claimImport(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  key: string,
  peildatum: string,
): Promise<ClaimOutcome> {
  const { error: insertErr } = await supabase.from(CLAIM_TABLE).insert({
    user_id: userId,
    scope: AANGIFTE_IMPORT_SCOPE,
    key,
    peildatum,
    status: 'pending',
  })

  // Geen conflict → wij zijn de eerste.
  if (!insertErr) return { kind: 'claimed' }

  // Alles behalve een unique-violation is een echte storing.
  if ((insertErr as PostgresLikeError).code !== '23505') {
    logSafeError('claim_insert', insertErr)
    return { kind: 'error' }
  }

  // 23505 → er ligt al een claim. Bepaal of hij klaar is of nog loopt.
  const { data: existing, error: readErr } = await supabase
    .from(CLAIM_TABLE)
    .select('status, response')
    .eq('user_id', userId)
    .eq('scope', AANGIFTE_IMPORT_SCOPE)
    .eq('key', key)
    .maybeSingle()

  if (readErr || !existing) {
    logSafeError('claim_read', readErr)
    return { kind: 'error' }
  }

  if (existing.status === 'done') {
    const stored = (existing.response ?? null) as StoredClaimResponse | null
    return {
      kind: 'replay',
      body: {
        ok: true,
        asset_ids: stored?.asset_ids ?? [],
        debt_ids: stored?.debt_ids ?? [],
        // Toets 5: zonder deze vlag is "gelukt" niet te onderscheiden van
        // "er is niets gebeurd".
        already_imported: true,
      },
    }
  }

  // `pending` — alleen overnemen als hij verweesd is. De `.lt(created_at)`
  // in dezelfde UPDATE maakt de overname atomair: raakt hij nul rijen, dan
  // was een ander ons voor of is de claim nog vers.
  const cutoff = new Date(
    Date.now() - CLAIM_TAKEOVER_MINUTES * 60 * 1000,
  ).toISOString()
  const { data: takenOver, error: takeoverErr } = await supabase
    .from(CLAIM_TABLE)
    .update({ created_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('scope', AANGIFTE_IMPORT_SCOPE)
    .eq('key', key)
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .select('key')

  if (takeoverErr) {
    logSafeError('claim_takeover', takeoverErr)
    return { kind: 'error' }
  }
  if (takenOver && takenOver.length > 0) return { kind: 'claimed' }

  return { kind: 'in_progress' }
}

/**
 * Markeert de claim als afgerond en bewaart het antwoord voor een replay.
 *
 * ── WAAROM DIT ÉÉN KEER HERKANST ────────────────────────────────────
 * Deze UPDATE is de enige stap die de claim van `pending` naar `done`
 * brengt. Faalt hij, dan blijft er een claim `pending` staan terwijl de
 * rijen wél geschreven zijn. Na `CLAIM_TAKEOVER_MINUTES` beschouwt de
 * claim-logica die rij als verweesd, neemt hem over en draait de
 * schrijffase OPNIEUW — dubbele assets en debts, precies de bug die deze
 * route hoort te voorkomen.
 *
 * De realistische faalvorm is een voorbijgaande netwerk-/poolhik op een
 * rij die we al bezitten; één herkansing dekt dat. Blijft hij falen, dan
 * loggen we met een eigen fase zodat het terugvindbaar is. Restrisico bij
 * twee mislukte pogingen: een dubbele import ná 15 minuten. Dat is
 * bewust geaccepteerd en hier vastgelegd in plaats van stil gelaten.
 */
async function completeClaim(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  key: string,
  response: StoredClaimResponse,
): Promise<void> {
  const apply = () =>
    supabase
      .from(CLAIM_TABLE)
      .update({
        status: 'done',
        response,
        completed_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('scope', AANGIFTE_IMPORT_SCOPE)
      .eq('key', key)

  const { error } = await apply()
  if (!error) return

  logSafeError('claim_complete_retry', error)
  const { error: retryErr } = await apply()
  if (retryErr) {
    // Laatste redmiddel: de claim blijft `pending`. Beter dan hem te
    // verwijderen — een replay geeft dan 409 i.p.v. stil dubbel te schrijven.
    logSafeError('claim_complete_failed', retryErr)
  }
}

/**
 * Geeft de claim vrij na een mislukte import.
 *
 * Dit behoudt de bestaande, bewuste semantiek "mislukkingen worden niet
 * gecached": zonder deze stap zou één DB-hik de gebruiker permanent op
 * deze inhoud blokkeren, want de contenthash blijft bij een retry gelijk.
 */
async function releaseClaim(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  key: string,
): Promise<void> {
  const { error } = await supabase
    .from(CLAIM_TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('scope', AANGIFTE_IMPORT_SCOPE)
    .eq('key', key)
  if (error) logSafeError('claim_release', error)
}

// ── Zod schemas ─────────────────────────────────────────────────────
//
// One-to-one with the TypeScript contracts in `lib/aangifte/types.ts`.
// `.strict()` on the top-level rejects unknown fields — defense-in-depth
// against rogue clients trying to smuggle extra columns into the write
// path. Sub-objects also use `.strict()` so the per-row payload cannot
// carry stray keys (e.g. trying to bypass `source` by sending it from
// the client).

const ASSET_TYPE_VALUES = [
  'cash',
  'savings',
  'investment',
  'retirement',
  'eigen_huis',
  'real_estate',
  'crypto',
  'vehicle',
  'physical',
  'deelneming',
  'levensverzekering',
  'vordering',
  'other',
] as const

const DEBT_TYPE_VALUES = [
  'mortgage',
  'personal_loan',
  'student_loan',
  'car_loan',
  'credit_card',
  'revolving_credit',
  'payment_plan',
  'belastingschuld',
  'familielening',
  'dga_schuld',
  'other',
] as const

const Field3Schema = z.union([z.string(), z.number(), z.null()]).optional()

const AssetReviewItemSchema = z
  .object({
    asset_type: z.enum(ASSET_TYPE_VALUES),
    name: z.string().trim().min(1, 'Naam is verplicht'),
    current_value: z.number().finite().min(0, 'Bedrag mag niet negatief zijn'),
    field3: Field3Schema,
    current_value_actual: z.number().finite().min(0).optional(),
  })
  .strict()

const DebtReviewItemSchema = z
  .object({
    debt_type: z.enum(DEBT_TYPE_VALUES),
    name: z.string().trim().min(1, 'Naam is verplicht'),
    current_balance: z.number().finite().min(0, 'Bedrag mag niet negatief zijn'),
    field3: Field3Schema,
    linked_asset_id: z.string().uuid().nullable().optional(),
    current_balance_actual: z.number().finite().min(0).optional(),
  })
  .strict()

// Mirror of `AangifteProfileUpdates` in `lib/aangifte/types.ts`. The
// `income_type` enum matches the `profiles_income_type_check` CHECK
// constraint exactly — any value mismatch surfaces here, not at the DB.
const ProfileUpdatesSchema = z
  .object({
    gross_annual_income: z.number().finite().min(0).optional(),
    aow_active: z.boolean().optional(),
    income_type: z
      .enum(['employee', 'self_employed', 'mixed', 'pension', 'unemployed'])
      .optional(),
  })
  .strict()

// ISO date `yyyy-mm-dd` regex. We deliberately don't try to use
// `z.string().date()` — the Zod 4 Validator emits a slightly different
// surface and we want a well-known regex shape that round-trips through
// PostgreSQL's DATE type without timezone surprises.
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

// Mortgage-pair schema. Indices verwijzen naar posities in `assets` en
// `debts` arrays die de client meestuurt. `.strict()` weigert extra velden
// zodat een misvormde pair direct als 400 verschijnt — de server hoeft
// nooit te raden welke pair-shape geldig is.
const LinkedMortgagePairSchema = z
  .object({
    asset_idx: z.number().int().min(0),
    debt_idx: z.number().int().min(0),
  })
  .strict()

const importPayloadSchema = z
  .object({
    assets: z.array(AssetReviewItemSchema),
    debts: z.array(DebtReviewItemSchema),
    profile_updates: ProfileUpdatesSchema,
    peildatum: z.string().regex(ISO_DATE_REGEX, 'Peildatum moet ISO yyyy-mm-dd zijn'),
    tax_year: z.number().int().min(2000).max(2100),
    idempotency_key: z.string().uuid('idempotency_key moet een geldige UUID zijn'),
    linked_mortgage_pairs: z.array(LinkedMortgagePairSchema).optional(),
  })
  .strict()

// ── Logging helper ──────────────────────────────────────────────────
//
// Privacy-safe logger: never includes amounts, names, or any payload
// content. Logs only the operation phase + Postgres error code (if any)
// + sanitised error type. This keeps the audit trail useful for
// debugging while honouring the data-minimisation contract from the
// design doc.

interface PostgresLikeError {
  code?: string
  message?: string
  details?: string
  hint?: string
}

function logSafeError(phase: string, err: unknown): void {
  if (err && typeof err === 'object') {
    const pgErr = err as PostgresLikeError
    const code = pgErr.code ? `code=${pgErr.code}` : 'code=unknown'
    // Match Postgres error patterns we actually care about — never echo
    // back .message from user-facing payload content.
    console.error(`[aangifte-import] ${phase} ${code}`)
    return
  }
  console.error(`[aangifte-import] ${phase} type=${typeof err}`)
}

// ── POST handler ────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const body: AangifteImportResponse = { ok: false, error: 'Niet ingelogd.' }
    return Response.json(body, { status: 401 })
  }

  // Body validation — the strict Zod schema rejects unknown fields and
  // validates each row's shape including the sub-row strict-ness. We
  // never pass parsed.error back to the client (could leak structure
  // hints); a generic 400 + `details` flatten gives enough context to
  // the developer hitting the endpoint while keeping production cheap.
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    const body: AangifteImportResponse = { ok: false, error: 'Ongeldige JSON-body.' }
    return Response.json(body, { status: 400 })
  }

  const parsed = importPayloadSchema.safeParse(raw)
  if (!parsed.success) {
    logSafeError('validation', parsed.error)
    const body: AangifteImportResponse = {
      ok: false,
      error: 'Ongeldige invoer. Controleer de payload-vorm.',
    }
    return Response.json(body, { status: 400 })
  }

  const payload: AangifteImportPayload = parsed.data

  // Sleutel SERVER-ZIJDIG afgeleid uit de inhoud. `payload.idempotency_key`
  // wordt bewust genegeerd (zie kopcommentaar): hij is client-bepaald én per
  // submit-poging een verse UUID, dus als dedup-sleutel onbruikbaar.
  const importKey = deriveAangifteImportKey(payload, user.id)

  // Claim vóór de schrijffase. De unieke PK op (user_id, scope, key) is de
  // synchronisatie — over serverinstanties heen, anders dan de vorige
  // in-flight-Set die alleen binnen één proces werkte.
  const claim = await claimImport(supabase, user.id, importKey, payload.peildatum)

  if (claim.kind === 'error') {
    const body: AangifteImportResponse = {
      ok: false,
      error: 'Importeren mislukt. Probeer het opnieuw of corrigeer een rij.',
    }
    return Response.json(body, { status: 500 })
  }

  if (claim.kind === 'replay') {
    // Deze aangifte is al geïmporteerd — niets opnieuw wegschrijven.
    return Response.json(claim.body, { status: 200 })
  }

  if (claim.kind === 'in_progress') {
    const conflictBody: AangifteImportResponse = {
      ok: false,
      error: 'Import al bezig.',
    }
    return Response.json(conflictBody, { status: 409 })
  }

  return await runImportWritePhase({
    supabase,
    user,
    payload,
    importKey,
  })
}

// ── Write-phase helper ──────────────────────────────────────────────
//
// Eigenlijke schrijfketen, geëxtraheerd zodat de POST-handler alleen over
// de claim gaat. De helper gooit niet door — alle errors worden hier
// afgehandeld als 500-response, inclusief het vrijgeven van de claim.
//
// Aanroepvoorwaarde: de claim is al gelegd (`status='pending'`). Deze
// functie is verantwoordelijk voor het afronden (`done`) óf vrijgeven van
// die claim; ze mag niet worden aangeroepen zonder claim.

interface WritePhaseArgs {
  supabase: Awaited<ReturnType<typeof createClient>>
  user: { id: string }
  payload: AangifteImportPayload
  importKey: string
}

async function runImportWritePhase({
  supabase,
  user,
  payload,
  importKey,
}: WritePhaseArgs): Promise<Response> {
  // Write phase — orchestrated as a series of typed Supabase calls.
  //
  // We deliberately do NOT use a single RPC here (unlike save-own-data)
  // because the write surface is small and the rollback story is
  // managed via compensating deletes on failure: if any step fails we
  // delete everything we wrote so the user is not left with a partial
  // import. This keeps the implementation in TypeScript (type-safe with
  // the same `AangifteAssetReviewItem`/`AangifteDebtReviewItem` shapes)
  // and avoids a separate Postgres function migration that would
  // shadow `lib/quick-add/build-drafts.ts`.
  const insertedAssetIds: string[] = []
  const insertedDebtIds: string[] = []
  const insertedSnapshotIds: string[] = []

  try {
    // 1. Insert assets, capturing IDs in input order so the optional
    //    delta-snapshots and the mortgage-coupling step can reference
    //    them. We loop instead of bulk-insert because the per-row
    //    `buildAssetDraft` returns column sets that vary by asset_type
    //    (e.g. `woz_value` for eigen_huis only) — bulk-insert would
    //    require harmonising the column union, which gains us nothing
    //    in practice (most aangifte-imports are < 20 rows).
    const assetIdByIndex = new Map<number, string>()
    const today = new Date().toISOString().split('T')[0]
    for (let i = 0; i < payload.assets.length; i++) {
      const item: AangifteAssetReviewItem = payload.assets[i]
      const draft = buildAssetDraft(item)
      // The "live" value is `current_value_actual` if provided, else
      // the peildatum value. Snapshot at peildatum is created later.
      const liveValue =
        typeof item.current_value_actual === 'number'
          ? item.current_value_actual
          : draft.current_value
      const row = {
        user_id: user.id,
        name: draft.name,
        asset_type: draft.asset_type,
        current_value: liveValue,
        // purchase_value mirrors the live value at import — the user can
        // adjust later. For aangifte-import this is a sensible default
        // because we don't know the historic purchase price.
        purchase_value: liveValue,
        purchase_date: today,
        expected_return: draft.expected_return,
        monthly_contribution: draft.monthly_contribution,
        institution: draft.institution,
        ...accountNumberWriteColumns(draft.account_number),
        notes: draft.notes,
        is_active: true,
        sort_order: i,
        subtype: draft.subtype,
        risk_profile: draft.risk_profile,
        tax_benefit: draft.tax_benefit,
        is_liquid: draft.is_liquid,
        lock_end_date: draft.lock_end_date,
        ticker_symbol: draft.ticker_symbol,
        rental_income: draft.rental_income,
        woz_value: draft.woz_value,
        retirement_provider_type: draft.retirement_provider_type,
        depreciation_rate: draft.depreciation_rate,
        address_postcode: draft.address_postcode,
        address_house_number: draft.address_house_number,
        ownership: draft.ownership,
        net_worth_inclusion_pct: draft.net_worth_inclusion_pct,
        // Provenance — the whole point of this endpoint.
        source: 'aangifte_import' as const,
        imported_peildatum: payload.peildatum,
      }
      const { data, error } = await supabase
        .from('assets')
        .insert(row)
        .select('id')
        .single()
      if (error || !data) {
        throw { phase: 'asset_insert', err: error }
      }
      const newId = data.id as string
      insertedAssetIds.push(newId)
      assetIdByIndex.set(i, newId)

      // Optional snapshot row: gemaakt zodra de gebruiker een actuele
      // waarde invulde — ook als die exact gelijk is aan de peildatumwaarde.
      // Reden: zelfs een gelijke waarde is een bewust historisch anker
      // ("we wisten dat dit op peildatum X zo was") en moet niet stilzwijgend
      // verdwijnen. Wijziging tov de oorspronkelijke condition die alleen
      // bij ongelijkheid een snapshot maakte.
      if (typeof item.current_value_actual === 'number') {
        const snapshotRow = {
          user_id: user.id,
          snapshot_date: payload.peildatum,
          entity_type: 'asset' as const,
          entity_id: newId,
          entity_name: draft.name,
          entity_subtype: draft.subtype,
          balance: draft.current_value,
          net_worth_inclusion_pct: draft.net_worth_inclusion_pct,
        }
        const { data: snapData, error: snapErr } = await supabase
          .from('balance_snapshots')
          .insert(snapshotRow)
          .select('id')
          .single()
        if (snapErr || !snapData) {
          throw { phase: 'asset_snapshot_insert', err: snapErr }
        }
        insertedSnapshotIds.push(snapData.id as string)
      }
    }

    // 2. Insert debts — same pattern as assets. The mortgage-coupling
    //    step (next) will run an UPDATE on debts where it finds a
    //    mortgage without `linked_asset_id` and an eigen_huis was
    //    imported in this batch.
    const debtIdByIndex = new Map<number, string>()
    for (let i = 0; i < payload.debts.length; i++) {
      const item: AangifteDebtReviewItem = payload.debts[i]
      const draft = buildDebtDraft(item)
      const liveBalance =
        typeof item.current_balance_actual === 'number'
          ? item.current_balance_actual
          : draft.current_balance
      const row = {
        user_id: user.id,
        name: draft.name,
        debt_type: draft.debt_type,
        original_amount: liveBalance,
        current_balance: liveBalance,
        interest_rate: draft.interest_rate,
        minimum_payment: draft.minimum_payment,
        monthly_payment: draft.monthly_payment,
        start_date: today,
        end_date: draft.end_date,
        creditor: draft.creditor,
        notes: draft.notes,
        is_active: true,
        sort_order: i,
        subtype: draft.subtype,
        is_tax_deductible: draft.is_tax_deductible,
        fixed_rate_end_date: draft.fixed_rate_end_date,
        nhg: draft.nhg,
        linked_asset_id: draft.linked_asset_id,
        credit_limit: draft.credit_limit,
        repayment_type: draft.repayment_type,
        draagkrachtmeting_date: draft.draagkrachtmeting_date,
        tax_year: draft.tax_year,
        ownership: draft.ownership,
        net_worth_inclusion_pct: draft.net_worth_inclusion_pct,
        include_aflossing_in_savings: draft.include_aflossing_in_savings,
        source: 'aangifte_import' as const,
        imported_peildatum: payload.peildatum,
      }
      const { data, error } = await supabase
        .from('debts')
        .insert(row)
        .select('id')
        .single()
      if (error || !data) {
        throw { phase: 'debt_insert', err: error }
      }
      const newId = data.id as string
      insertedDebtIds.push(newId)
      debtIdByIndex.set(i, newId)

      // Snapshot bij elk gevuld actual-veld — zie commentaar bij assets-tak.
      if (typeof item.current_balance_actual === 'number') {
        const snapshotRow = {
          user_id: user.id,
          snapshot_date: payload.peildatum,
          entity_type: 'debt' as const,
          entity_id: newId,
          entity_name: draft.name,
          entity_subtype: draft.subtype,
          balance: draft.current_balance,
          net_worth_inclusion_pct: draft.net_worth_inclusion_pct,
        }
        const { data: snapData, error: snapErr } = await supabase
          .from('balance_snapshots')
          .insert(snapshotRow)
          .select('id')
          .single()
        if (snapErr || !snapData) {
          throw { phase: 'debt_snapshot_insert', err: snapErr }
        }
        insertedSnapshotIds.push(snapData.id as string)
      }
    }

    // 3. Mortgage-coupling: koppel `debts.linked_asset_id` aan de
    //    bijbehorende eigen-woning-asset.
    //
    //    Voorkeurspad — `payload.linked_mortgage_pairs`: de client (review-
    //    step) berekent de pairs op basis van de uiteindelijk verstuurde
    //    arrays en stuurt ze expliciet mee. Wij respecteren die mapping
    //    één-op-één. Dit ontkoppelt de server-heuristiek van de UI-keuze
    //    en voorkomt dat alle mortgages aan de éérste eigen_huis gehangen
    //    worden bij meerdere panden.
    //
    //    Fallback — geen pairs gegeven: oudere clients zonder de nieuwe
    //    veld krijgen het oude greedy-gedrag (eerste eigen_huis vangt alle
    //    ongelinkte mortgages). Backward-compat is belangrijk omdat de
    //    payload-shape niet versioned is en clients tijdens een rolling
    //    deploy nog de oude shape kunnen sturen.
    const explicitPairs = payload.linked_mortgage_pairs ?? []
    if (explicitPairs.length > 0) {
      for (const pair of explicitPairs) {
        // Defensief: indices buiten range (mismatched arrays) overslaan
        // ipv crashen — een verkeerd gevormde pair mag de hele import
        // niet kelderen.
        const assetItem = payload.assets[pair.asset_idx]
        const debtItem = payload.debts[pair.debt_idx]
        if (!assetItem || !debtItem) continue
        if (assetItem.asset_type !== 'eigen_huis') continue
        if (debtItem.debt_type !== 'mortgage') continue
        // Respecteer een client-side override op `linked_asset_id`: als
        // de gebruiker handmatig een ander asset koos, overschrijven we
        // dat niet.
        if (debtItem.linked_asset_id) continue
        const eigenHuisId = assetIdByIndex.get(pair.asset_idx)
        const debtId = debtIdByIndex.get(pair.debt_idx)
        if (!eigenHuisId || !debtId) continue
        const { error: linkErr } = await supabase
          .from('debts')
          .update({
            linked_asset_id: eigenHuisId,
            is_tax_deductible: true,
          })
          .eq('id', debtId)
          .eq('user_id', user.id)
        if (linkErr) {
          throw { phase: 'mortgage_link', err: linkErr }
        }
      }
    } else {
      // Fallback voor backwards-compat: oude greedy-heuristiek.
      const firstEigenHuisIdx = payload.assets.findIndex(
        (a) => a.asset_type === 'eigen_huis',
      )
      if (firstEigenHuisIdx !== -1) {
        const eigenHuisId = assetIdByIndex.get(firstEigenHuisIdx)
        if (eigenHuisId) {
          for (let i = 0; i < payload.debts.length; i++) {
            const debtItem = payload.debts[i]
            if (
              debtItem.debt_type === 'mortgage' &&
              !debtItem.linked_asset_id
            ) {
              const debtId = debtIdByIndex.get(i)
              if (!debtId) continue
              const { error: linkErr } = await supabase
                .from('debts')
                .update({
                  linked_asset_id: eigenHuisId,
                  is_tax_deductible: true,
                })
                .eq('id', debtId)
                .eq('user_id', user.id)
              if (linkErr) {
                throw { phase: 'mortgage_link', err: linkErr }
              }
            }
          }
        }
      }
    }

    // 4. Profile updates — only the fields actually present in
    //    profile_updates. This is intentionally a partial update so
    //    the import never overwrites a value the user didn't confirm.
    //    Empty profile_updates (e.g. user only imported assets/debts)
    //    skips the call entirely.
    const profileUpdatePayload: Record<string, unknown> = {}
    if (payload.profile_updates.gross_annual_income != null) {
      profileUpdatePayload.gross_annual_income = payload.profile_updates.gross_annual_income
    }
    if (payload.profile_updates.aow_active != null) {
      profileUpdatePayload.aow_active = payload.profile_updates.aow_active
    }
    if (payload.profile_updates.income_type != null) {
      profileUpdatePayload.income_type = payload.profile_updates.income_type
    }
    if (Object.keys(profileUpdatePayload).length > 0) {
      const { error: profileErr } = await supabase
        .from('profiles')
        .update(profileUpdatePayload)
        .eq('id', user.id)
      if (profileErr) {
        throw { phase: 'profile_update', err: profileErr }
      }
    }

    // Succes — claim afronden zodat een volgende submit met dezelfde inhoud
    // dit antwoord terugkrijgt in plaats van opnieuw te schrijven.
    await completeClaim(supabase, user.id, importKey, {
      asset_ids: insertedAssetIds,
      debt_ids: insertedDebtIds,
    })
    const successBody: AangifteImportResponse = {
      ok: true,
      asset_ids: insertedAssetIds,
      debt_ids: insertedDebtIds,
      already_imported: false,
    }
    return Response.json(successBody, { status: 200 })
  } catch (err) {
    // Compensating deletes — best effort. We delete in reverse order
    // so balance_snapshots are removed before the assets/debts they
    // reference (no FK on entity_id but staying consistent).
    const wrapped = err as { phase?: string; err?: unknown }
    logSafeError(wrapped.phase ?? 'unknown', wrapped.err ?? err)

    // Compensate: roll back inserted snapshots first, then debts, then assets.
    // Each compensation step is best-effort; if any fails we still surface
    // the original error to the client.
    if (insertedSnapshotIds.length > 0) {
      await supabase
        .from('balance_snapshots')
        .delete()
        .in('id', insertedSnapshotIds)
        .eq('user_id', user.id)
        .then(() => undefined, (e) => logSafeError('compensate_snapshots', e))
    }
    if (insertedDebtIds.length > 0) {
      await supabase
        .from('debts')
        .delete()
        .in('id', insertedDebtIds)
        .eq('user_id', user.id)
        .then(() => undefined, (e) => logSafeError('compensate_debts', e))
    }
    if (insertedAssetIds.length > 0) {
      await supabase
        .from('assets')
        .delete()
        .in('id', insertedAssetIds)
        .eq('user_id', user.id)
        .then(() => undefined, (e) => logSafeError('compensate_assets', e))
    }

    // Claim vrijgeven — mislukkingen worden bewust NIET vastgelegd. Anders
    // zou een voorbijgaande DB-hik de gebruiker permanent op deze inhoud
    // blokkeren: de contenthash is bij een retry immers identiek. Dit
    // gebeurt ná de compenserende deletes, zodat een retry een schone
    // DB-staat aantreft.
    await releaseClaim(supabase, user.id, importKey)

    const failBody: AangifteImportResponse = {
      ok: false,
      error: 'Importeren mislukt. Probeer het opnieuw of corrigeer een rij.',
    }
    return Response.json(failBody, { status: 500 })
  }
}

// ── DELETE handler — bulk-remove imports per peildatum ─────────────
//
// Triggered from the koppelingen-page "Verwijder alle aangifte-imports
// van peildatum X" action. Removes:
//   - all assets where source='aangifte_import' AND imported_peildatum=X
//   - all debts where source='aangifte_import' AND imported_peildatum=X
//   - balance_snapshots on snapshot_date=X for the user (only those
//     pointing to entity-IDs in the deleted asset/debt sets)
//
// Cascade is FK-based: assets ON DELETE CASCADE doesn't apply to
// balance_snapshots (no FK), so we delete snapshots explicitly. Debts'
// `linked_asset_id` ON DELETE SET NULL prevents orphan FK errors when an
// eigen_huis is deleted while a related mortgage exists from another
// source.

export async function DELETE(req: Request): Promise<Response> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json(
      { ok: false, error: 'Niet ingelogd.' },
      { status: 401 },
    )
  }

  const url = new URL(req.url)
  const peildatumRaw = url.searchParams.get('peildatum')
  if (!peildatumRaw || !ISO_DATE_REGEX.test(peildatumRaw)) {
    return Response.json(
      { ok: false, error: 'Ongeldige peildatum.' },
      { status: 400 },
    )
  }
  const peildatum = peildatumRaw

  try {
    // Step 1: Fetch the asset/debt IDs we'll delete so we can clean
    // their snapshots first. We rely on the partial index
    // `idx_assets_user_source_imported` to keep this cheap.
    const [assetsRes, debtsRes] = await Promise.all([
      supabase
        .from('assets')
        .select('id')
        .eq('user_id', user.id)
        .eq('source', 'aangifte_import')
        .eq('imported_peildatum', peildatum),
      supabase
        .from('debts')
        .select('id')
        .eq('user_id', user.id)
        .eq('source', 'aangifte_import')
        .eq('imported_peildatum', peildatum),
    ])
    if (assetsRes.error) {
      throw { phase: 'fetch_assets', err: assetsRes.error }
    }
    if (debtsRes.error) {
      throw { phase: 'fetch_debts', err: debtsRes.error }
    }

    const assetIds = (assetsRes.data ?? []).map((r) => r.id as string)
    const debtIds = (debtsRes.data ?? []).map((r) => r.id as string)

    // Step 2: Delete snapshots that point at any of the to-be-deleted
    // assets or debts. Two separate queries keep the index hits clean.
    if (assetIds.length > 0) {
      const { error } = await supabase
        .from('balance_snapshots')
        .delete()
        .eq('user_id', user.id)
        .eq('entity_type', 'asset')
        .in('entity_id', assetIds)
      if (error) {
        throw { phase: 'delete_asset_snapshots', err: error }
      }
    }
    if (debtIds.length > 0) {
      const { error } = await supabase
        .from('balance_snapshots')
        .delete()
        .eq('user_id', user.id)
        .eq('entity_type', 'debt')
        .in('entity_id', debtIds)
      if (error) {
        throw { phase: 'delete_debt_snapshots', err: error }
      }
    }

    // Step 3: Delete the debts first (because mortgage may reference an
    // eigen_huis asset; deleting assets first triggers the ON DELETE
    // SET NULL on debts.linked_asset_id, but only after a successful
    // delete — Postgres handles the order, so debts-first or
    // assets-first both work; we go debts-first for symmetry with the
    // rollback path in POST).
    if (debtIds.length > 0) {
      const { error } = await supabase
        .from('debts')
        .delete()
        .eq('user_id', user.id)
        .eq('source', 'aangifte_import')
        .eq('imported_peildatum', peildatum)
      if (error) {
        throw { phase: 'delete_debts', err: error }
      }
    }
    if (assetIds.length > 0) {
      const { error } = await supabase
        .from('assets')
        .delete()
        .eq('user_id', user.id)
        .eq('source', 'aangifte_import')
        .eq('imported_peildatum', peildatum)
      if (error) {
        throw { phase: 'delete_assets', err: error }
      }
    }

    // Step 4: Geef de idempotentie-claims van deze peildatum vrij.
    //
    // DIT IS DE ESCAPE HATCH. De sleutel is een CONTENThash, dus een
    // gebruiker die dezelfde aangifte bewust opnieuw wil importeren na een
    // bulk-verwijdering krijgt exact dezelfde sleutel — en zou zonder deze
    // stap permanent een replay terugkrijgen op rijen die niet meer bestaan.
    // Bewust ná de rij-deletes: faalt er iets eerder, dan blijft de claim
    // staan en klopt hij nog steeds bij de (niet-verwijderde) rijen.
    const { error: claimErr } = await supabase
      .from(CLAIM_TABLE)
      .delete()
      .eq('user_id', user.id)
      .eq('scope', AANGIFTE_IMPORT_SCOPE)
      .eq('peildatum', peildatum)
    if (claimErr) {
      throw { phase: 'delete_claims', err: claimErr }
    }

    return Response.json(
      {
        ok: true,
        deleted: {
          assets: assetIds.length,
          debts: debtIds.length,
        },
      },
      { status: 200 },
    )
  } catch (err) {
    const wrapped = err as { phase?: string; err?: unknown }
    logSafeError(wrapped.phase ?? 'delete_unknown', wrapped.err ?? err)
    return Response.json(
      { ok: false, error: 'Verwijderen mislukt. Probeer het opnieuw.' },
      { status: 500 },
    )
  }
}
