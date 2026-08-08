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
 * Idempotency: a 24h in-memory cache keyed on `${user.id}:${idempotency_key}`.
 * Same key within the window returns the cached response without writing.
 * The cache is process-local — duplicate writes after server restart are
 * defended against by the unique balance_snapshots constraint
 * `(user_id, snapshot_date, entity_type, entity_id)`, which prevents
 * snapshot dupes; asset/debt rows are still written but the chance of a
 * post-restart double-submit is acceptable.
 *
 * DELETE branch: bulk-removal of all aangifte-imported assets+debts for a
 * given peildatum (`?peildatum=YYYY-MM-DD`). Called from the koppelingen-page
 * for "Verwijder alle aangifte-imports van peildatum X".
 */

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { buildAssetDraft, buildDebtDraft } from '@/lib/quick-add/build-drafts'
import { accountNumberWriteColumns } from '@/lib/asset-account-number'
import type {
  AangifteImportPayload,
  AangifteImportResponse,
  AangifteAssetReviewItem,
  AangifteDebtReviewItem,
} from '@/lib/aangifte/types'

// ── Idempotency cache ───────────────────────────────────────────────
//
// The plan asks for a 24h cache window. We store both successful and
// failed responses so retries return the same outcome — the client must
// generate a NEW idempotency key to retry a failed import. This mirrors
// the holdings-route pattern (`X-Idempotency-Key` header) but with a
// longer TTL because aangifte-imports are larger and less repeatable.
//
// Concurrency: een naïve "check then write"-flow laat twee gelijktijdige
// POSTs (double-click, abuse) langs de cache.get-controle glippen vóór de
// eerste de set heeft gedaan. We tracken daarom *in-flight keys* in een
// aparte `Set` die zo vroeg mogelijk in de handler wordt gezet en in een
// `try/finally` weer leeggemaakt; daarmee gedraagt de cache zich als een
// per-key mutex zonder dat we een externe semaphore nodig hebben.
//
// Onbounded growth: de cache wordt alleen opgeschoond bij elke POST. In een
// pathologisch scenario (veel unieke keys per dag) kan hij oneindig groeien.
// We bewaken dat met een MAX_CACHE_SIZE en een eenvoudige FIFO-eviction op
// timestamp — geen volledige LRU want het toegangspatroon is per key
// nagenoeg one-shot.

interface CachedResponse {
  body: AangifteImportResponse
  status: number
  timestamp: number
}

const idempotencyCache = new Map<string, CachedResponse>()
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000 // 24h
const MAX_CACHE_SIZE = 1000
const inFlightKeys = new Set<string>()

function cleanExpiredIdempotencyKeys(): void {
  const now = Date.now()
  for (const [key, entry] of idempotencyCache.entries()) {
    if (now - entry.timestamp > IDEMPOTENCY_TTL_MS) {
      idempotencyCache.delete(key)
    }
  }
}

/**
 * Plaats een entry in de cache. Bij overschrijding van MAX_CACHE_SIZE
 * verwijderen we de oudste entry (laagste timestamp). Niet volledig LRU,
 * maar voldoende voor het verwachte one-shot toegangspatroon. Veiliger dan
 * onbounded groeien.
 */
function setCachedResponseWithCap(
  key: string,
  entry: CachedResponse,
): void {
  if (idempotencyCache.size >= MAX_CACHE_SIZE && !idempotencyCache.has(key)) {
    let oldestKey: string | null = null
    let oldestTimestamp = Number.POSITIVE_INFINITY
    for (const [k, v] of idempotencyCache.entries()) {
      if (v.timestamp < oldestTimestamp) {
        oldestTimestamp = v.timestamp
        oldestKey = k
      }
    }
    if (oldestKey) idempotencyCache.delete(oldestKey)
  }
  idempotencyCache.set(key, entry)
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

  // Idempotency check — same `${user.id}:${idempotency_key}` returns the
  // cached response within 24h. The cache lives in process memory; a
  // server restart drops it. After restart, a duplicate submit will
  // re-write the assets/debts but balance_snapshots' UNIQUE constraint
  // prevents duplicate snapshot rows — partial duplicate is acceptable
  // since the user can bulk-delete via DELETE on this same route.
  cleanExpiredIdempotencyKeys()
  const cacheKey = `${user.id}:${payload.idempotency_key}`
  const cached = idempotencyCache.get(cacheKey)
  if (cached) {
    return Response.json(cached.body, { status: cached.status })
  }

  // Concurrent-double-click guard: een tweede POST met dezelfde key terwijl
  // de eerste nog draait krijgt 409 Conflict. Dit voorkomt dat twee
  // gelijktijdige requests beide de write-loop ingaan vóór de cache-set
  // gebeurt, met dubbele rijen tot gevolg. De `inFlightKeys.add` moet vóór
  // de eerste write plaatsvinden en de finally-block na de laatste, zodat
  // de window zo klein mogelijk blijft.
  if (inFlightKeys.has(cacheKey)) {
    const conflictBody: AangifteImportResponse = {
      ok: false,
      error: 'Import al bezig.',
    }
    return Response.json(conflictBody, { status: 409 })
  }
  inFlightKeys.add(cacheKey)

  try {
    return await runImportWritePhase({
      supabase,
      user,
      payload,
      cacheKey,
    })
  } finally {
    // Lock-release: ongeacht success/failure of throw moet de key weer
    // beschikbaar zijn voor toekomstige retries (met diezelfde of een
    // nieuwe idempotency-key).
    inFlightKeys.delete(cacheKey)
  }
}

// ── Write-phase helper ──────────────────────────────────────────────
//
// Eigenlijke schrijfketen, geëxtraheerd zodat de POST-handler een
// schoon try/finally om de inFlightKeys-lock kan plaatsen. De helper
// gooit niet door — alle errors worden hier afgehandeld als 500-response;
// de caller hoeft alleen de lock te releasen.

interface WritePhaseArgs {
  supabase: Awaited<ReturnType<typeof createClient>>
  user: { id: string }
  payload: AangifteImportPayload
  cacheKey: string
}

async function runImportWritePhase({
  supabase,
  user,
  payload,
  cacheKey,
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

    // 5. Goal-guide completion-detector — bonus: if this import results
    //    in ≥1 aangifte-imported assets and the user has at least 3
    //    assets total (across all sources), mark the relevant goal
    //    steps as completed. We do this best-effort: failures here do
    //    NOT roll back the import, since the data is the primary value
    //    and step-completion is cosmetic.
    await maybeCompleteVermogenOverzichtSteps(supabase, user.id).catch((err) => {
      logSafeError('goal_guide_completion', err)
    })

    // Success — cache (met size-cap eviction) en return.
    const successBody: AangifteImportResponse = {
      ok: true,
      asset_ids: insertedAssetIds,
      debt_ids: insertedDebtIds,
    }
    setCachedResponseWithCap(cacheKey, {
      body: successBody,
      status: 200,
      timestamp: Date.now(),
    })
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

    const failBody: AangifteImportResponse = {
      ok: false,
      error: 'Importeren mislukt. Probeer het opnieuw of corrigeer een rij.',
    }
    // We deliberately do NOT cache failures — a transient DB hiccup
    // should not block the user for 24h on the same idempotency key.
    // The client retries with the same key (after fixing whatever
    // caused the failure) and the next attempt runs against fresh DB
    // state.
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

// ── Goal-guide completion-detector ──────────────────────────────────
//
// Bonus from the plan: when an aangifte-import lands ≥1 asset rows and
// the user has ≥3 total assets, mark the `vermogen-overzicht` steps
// `vo_first_asset` and `vo_assets_3` as completed. We touch
// `profiles.module_guide_state` directly using the same JSONB shape as
// `app/api/module-guide/progress/route.ts` to stay compatible.
//
// Best-effort: any failure here is logged but does not block the import.
//
// NOTE (8 aug 2026): the `goal:<slug>` key convention originally came from
// `lib/briefing/goal-guide-steps.ts`, which was removed together with
// /beheer/doelen (dead branch, zero UI consumers since ADR 0007). The key
// below is therefore a plain literal now. No live surface reads
// `goal:vermogen-overzicht` — the Welcome guide uses `welcome:guide`
// (lib/welcome-guide.ts). This write is kept because removing it touches a
// live onboarding route beyond the confirmed cleanup scope; it is tracked
// on the follow-up card for the remaining guide-state dead code.

interface ModuleGuideProgressEntry {
  completedSteps: string[]
  dismissedAt: string | null
}

type ModuleGuideStateMap = Record<string, ModuleGuideProgressEntry>

async function maybeCompleteVermogenOverzichtSteps(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<void> {
  // Count user's total assets — both manual + imported. When we cross
  // the thresholds (1 / 3) we toggle the corresponding goal-step.
  const { count, error: countErr } = await supabase
    .from('assets')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_active', true)
  if (countErr) {
    throw countErr
  }
  const totalAssets = count ?? 0
  if (totalAssets < 1) return // nothing to mark; defensive

  // Read the current module_guide_state. The column may not exist on
  // older DBs — we degrade gracefully (no completion happens, the user
  // toggles steps manually as before).
  const { data: profile, error: readErr } = await supabase
    .from('profiles')
    .select('module_guide_state')
    .eq('id', userId)
    .single()
  if (readErr) {
    if ((readErr as PostgresLikeError).code === '42703') return
    throw readErr
  }

  const goalKey = 'goal:vermogen-overzicht'
  const currentState = (profile?.module_guide_state as ModuleGuideStateMap | null) ?? {}
  const currentEntry: ModuleGuideProgressEntry = currentState[goalKey] ?? {
    completedSteps: [],
    dismissedAt: null,
  }

  const wantSteps = new Set<string>(currentEntry.completedSteps)
  let mutated = false
  // vo_first_asset: any asset suffices.
  if (totalAssets >= 1 && !wantSteps.has('vo_first_asset')) {
    wantSteps.add('vo_first_asset')
    mutated = true
  }
  // vo_assets_3: at least 3 total assets.
  if (totalAssets >= 3 && !wantSteps.has('vo_assets_3')) {
    wantSteps.add('vo_assets_3')
    mutated = true
  }

  if (!mutated) return

  const updatedState: ModuleGuideStateMap = {
    ...currentState,
    [goalKey]: {
      ...currentEntry,
      completedSteps: Array.from(wantSteps),
    },
  }

  const { error: writeErr } = await supabase
    .from('profiles')
    .update({ module_guide_state: updatedState })
    .eq('id', userId)
  if (writeErr) {
    if ((writeErr as PostgresLikeError).code === '42703') return
    throw writeErr
  }
}
