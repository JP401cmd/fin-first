import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { badRequest, forbidden, notFound, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { loadPerspectiveContext } from '@/lib/household/perspective-loader'
import { TRANSACTION_FLAG_COLUMNS } from '@/lib/household/transaction-flags'
import { CreateTransactionFlagSchema, UpdateTransactionFlagSchema } from './schema'

/**
 * Transaction-flags API — "te bespreken met je partner" (ADR 0128, fase 1).
 *
 *   POST   /api/transaction-flags        boeking markeren (of een afgeronde vlag heropenen)
 *   PATCH  /api/transaction-flags        status omzetten en/of notitie bijwerken
 *   DELETE /api/transaction-flags?id=…   eigen vlag intrekken
 *
 * Geen GET: lezen loopt via de server-loader `loadTransactionFlags` (ADR 0058);
 * de UI ververst met `router.refresh()`.
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 * Anon RLS-client, nooit service-role. `household_id` komt uit de huishoud-
 * context van de sessie, `flagged_by` uit `getUser()`; beide staan niet in het
 * zod-schema. De ECHTE poort ligt in de database: de INSERT-policy eist een
 * gedeelde boeking op een 'full'-rekening (`transaction_flaggable`), de SELECT-/
 * UPDATE-policies erven de zichtbaarheid van `transactions`. Deze route vertaalt
 * die weigeringen naar client-veilige antwoorden — hij herhaalt de regel niet.
 *
 * "Bestaat niet" en "mag je niet zien" krijgen hetzelfde antwoord (404), zodat
 * er geen existence-oracle op andermans vlag-/boeking-id's ontstaat.
 */

const PG_UNIQUE_VIOLATION = '23505'
const PG_FOREIGN_KEY_VIOLATION = '23503'
/** RLS-weigering (WITH CHECK) én de errcode van `transaction_flags_guard()`. */
const PG_INSUFFICIENT_PRIVILEGE = '42501'

const NOT_FLAGGABLE_MESSAGE =
  'Deze boeking kun je niet met je partner bespreken: alleen gedeelde boekingen op een rekening waarvan ook de boekingen zichtbaar zijn.'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

async function resolveHousehold(supabase: SupabaseServerClient) {
  const ctx = await loadPerspectiveContext(supabase)
  if (!ctx.hasHousehold || !ctx.householdId) return null
  return ctx.householdId
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return unauthorized()

  const parsed = await parseBody(CreateTransactionFlagSchema, request)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  let householdId: string | null
  try {
    householdId = await resolveHousehold(supabase)
  } catch (err) {
    return serverError(err, 'transaction-flags:POST')
  }
  if (!householdId) {
    return badRequest('Je hebt geen huishouden — koppel eerst je partner.', 'no_household')
  }

  const { data: inserted, error } = await supabase
    .from('transaction_flags')
    .insert({
      transaction_id: body.transactionId,
      household_id: householdId,
      flagged_by: user.id,
      note: body.note ?? null,
    })
    .select(TRANSACTION_FLAG_COLUMNS)
    .single()

  if (!error) return NextResponse.json(inserted, { status: 201 })

  // Eén vlag per boeking: bestaat hij al, dan is dit een heropening. De UPDATE
  // loopt onder de huishoud-policy — een vlag in een ander huishouden raakt
  // hij niet (0 rijen → 404, geen orakel).
  if (error.code === PG_UNIQUE_VIOLATION) {
    const patch: Record<string, unknown> = { status: 'open' }
    // Alleen een ÉCHTE nieuwe notitie vervangt de oude; de knop stuurt `null`
    // bij een leeg veld en dat mag de eerdere notitie niet stil wissen.
    if (typeof body.note === 'string') patch.note = body.note
    const { data: reopened, error: reopenError } = await supabase
      .from('transaction_flags')
      .update(patch)
      .eq('transaction_id', body.transactionId)
      .eq('household_id', householdId)
      .select(TRANSACTION_FLAG_COLUMNS)
      .maybeSingle()
    if (reopenError) return serverError(reopenError, 'transaction-flags:POST-reopen')
    if (!reopened) return notFound()
    return NextResponse.json(reopened)
  }

  if (error.code === PG_INSUFFICIENT_PRIVILEGE || error.code === PG_FOREIGN_KEY_VIOLATION) {
    console.error(`[transaction-flags:POST] markeren geweigerd door policy (${error.code})`)
    return forbidden(NOT_FLAGGABLE_MESSAGE)
  }

  return serverError(error, 'transaction-flags:POST')
}

// ── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return unauthorized()

  const parsed = await parseBody(UpdateTransactionFlagSchema, request)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  let householdId: string | null
  try {
    householdId = await resolveHousehold(supabase)
  } catch (err) {
    return serverError(err, 'transaction-flags:PATCH')
  }
  if (!householdId) return notFound()

  // Expliciete whitelist: `resolved_*` stempelt de trigger, sleutels zijn
  // onveranderlijk. Alles wat hier niet staat bereikt de database niet.
  const patch: Record<string, unknown> = {}
  if (body.status !== undefined) patch.status = body.status
  if (body.note !== undefined) patch.note = body.note

  const { data: updated, error } = await supabase
    .from('transaction_flags')
    .update(patch)
    .eq('id', body.id)
    .eq('household_id', householdId)
    .select(TRANSACTION_FLAG_COLUMNS)
    .maybeSingle()

  if (error) {
    if (error.code === PG_INSUFFICIENT_PRIVILEGE) {
      console.error(`[transaction-flags:PATCH] geweigerd door policy/guard (${error.code})`)
      return forbidden('Deze vlag kun je niet wijzigen.')
    }
    return serverError(error, 'transaction-flags:PATCH')
  }
  if (!updated) return notFound()
  return NextResponse.json(updated)
}

// ── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return badRequest('Vlag-id ontbreekt')

  // Intrekken mag alleen de melder zelf: de DELETE-policy is eigen-rij én de
  // query scope't expliciet — de policy doet het al, de filter maakt het
  // leesbaar en houdt de 0-rijen-uitkomst eerlijk.
  const { data: deleted, error } = await supabase
    .from('transaction_flags')
    .delete()
    .eq('id', id)
    .eq('flagged_by', user.id)
    .select('id')
    .maybeSingle()

  if (error) return serverError(error, 'transaction-flags:DELETE')
  if (!deleted) return notFound()
  return NextResponse.json({ success: true })
}
