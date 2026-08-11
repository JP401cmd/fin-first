import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/parse-body'
import { unauthorized, badRequest, serverError } from '@/lib/api/respond'
import { BulkDeleteSchema } from '@/lib/transactions/bulk-schemas'
import {
  readBulkCandidates,
  collectLinkedCounterpartIds,
  bulkDeleteTransactions,
} from '@/lib/transactions/bulk-mutate'
import { TYPE_TO_CONFIRM_THRESHOLD, type BulkDeleteResponse } from '@/lib/transactions/bulk-contract'

/**
 * `POST /api/transactions/bulk-delete` — HARD verwijderen van een bevroren
 * id-lijst (F16/F17/F18, AC9/AC10).
 *
 * Geen prullenbak, geen soft delete (eigenaarsbesluit B1). Dat maakt elke poort
 * hier een echte poort:
 *
 *  - `expectedCount` moet gelijk zijn aan de ontdubbelde id-lijst;
 *  - boven `TYPE_TO_CONFIRM_THRESHOLD` moet `confirmCount` het overgetypte
 *    TOTAAL zijn — inclusief de tegenboekingen, want dat is ook het getal dat de
 *    knoptekst noemt (ADR 0104, besluit 8). De server toetst dat zelf; zou hij
 *    dat niet doen, dan is de type-to-confirm UI-theater.
 *
 * Splits vragen geen applicatiewerk: `transaction_splits.transaction_id` draagt
 * `ON DELETE CASCADE` (20260717120000:267-277). De tegenboeking van een
 * handmatige overboeking wél: die FK is `ON DELETE SET NULL`, dus er blijft geen
 * FK-wees achter maar een SEMANTISCHE — een rij die nog
 * `transaction_type='transfer'` draagt en daardoor via `isRealAggRow` in noch
 * inkomsten noch uitgaven meetelt, terwijl zijn tegenhanger weg is.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return unauthorized()

    const parsed = await parseBody(BulkDeleteSchema, request)
    if (!parsed.ok) return parsed.response
    const { ids, expectedCount, confirmCount, includeLinkedCounterparts } = parsed.data

    const uniqueIds = [...new Set(ids)]
    if (uniqueIds.length !== expectedCount) {
      return badRequest(
        `De selectie is gewijzigd: ${uniqueIds.length} transacties in plaats van ${expectedCount}. Zoek opnieuw en bevestig.`,
        'count_mismatch',
      )
    }

    const candidates = await readBulkCandidates(supabase, user.id, uniqueIds)
    const foundIds = candidates.map((row) => row.id)

    let counterpartIds: string[] = []
    if (includeLinkedCounterparts) {
      const linked = collectLinkedCounterpartIds(candidates, uniqueIds)
      // Own-row verifiëren vóór ze meetellen: een `linked_transfer_id` kan naar
      // een rij van de partner of naar een intussen verdwenen rij wijzen. Zou die
      // in het totaal meetellen, dan zou de gebruiker een getal moeten overtypen
      // dat nooit geraakt wordt.
      const resolved = await readBulkCandidates(supabase, user.id, linked)
      counterpartIds = resolved.map((row) => row.id)
    }

    const totaal = foundIds.length + counterpartIds.length
    if (totaal > TYPE_TO_CONFIRM_THRESHOLD && confirmCount !== totaal) {
      return badRequest(
        `Bevestig door ${totaal} over te typen — dat is inclusief de tegenboekingen die meegaan.`,
        'confirm_mismatch',
      )
    }

    const selectionResult = await bulkDeleteTransactions(supabase, user.id, foundIds)
    const counterpartResult = counterpartIds.length
      ? await bulkDeleteTransactions(supabase, user.id, counterpartIds)
      : { touched: 0, failedIds: [] as string[] }

    const body: BulkDeleteResponse = {
      requested: uniqueIds.length,
      deleted: selectionResult.touched,
      orphansCleared: counterpartResult.touched,
      failedIds: [...selectionResult.failedIds, ...counterpartResult.failedIds],
      // Zie de noot in bulk-budget: het manifest weigert boven SELECTION_MAX, dus
      // een bevroren lijst kan hier nooit afgekapt zijn.
      truncated: false,
    }
    return NextResponse.json(body)
  } catch (err) {
    return serverError(err, 'transactions-bulk-delete:POST')
  }
}
