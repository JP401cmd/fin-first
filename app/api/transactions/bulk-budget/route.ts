import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/parse-body'
import { unauthorized, badRequest, serverError } from '@/lib/api/respond'
import { BulkBudgetSchema } from '@/lib/transactions/bulk-schemas'
import {
  readBulkCandidates,
  planBulkBudgetUpdate,
  bulkUpdateTransactions,
} from '@/lib/transactions/bulk-mutate'
import { collectEigenRekeningBudgetIds } from '@/lib/transactions/transfer-marking'
import type { BulkBudgetResponse } from '@/lib/transactions/bulk-contract'

/**
 * `PATCH /api/transactions/bulk-budget` — hercategoriseer een BEVROREN id-lijst
 * naar één budget (F14/F15, AC6/AC7/AC8/AC12).
 *
 * De route voert geen enkel filter uit; hij krijgt id's en telt wat de database
 * teruggaf. Alles wat naar `transactions` schrijft loopt door
 * `lib/transactions/bulk-mutate.ts`, dat `userId` verplicht neemt — deze route
 * kán de mutatie dus niet formuleren zonder de scoping (ADR 0104, besluit 5).
 *
 * `expectedCount` is een SERVER-poort, geen UI-versiering: wijkt het bevestigde
 * aantal af van de ontdubbelde id-lijst, dan is de selectie onderweg iets anders
 * geworden dan wat de gebruiker beoordeelde, en gaat er niets naar de database.
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    // `getUser()` en niet `getClaims()`: dit pad SCHRIJFT (zie lib/supabase/server.ts).
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return unauthorized()

    const parsed = await parseBody(BulkBudgetSchema, request)
    if (!parsed.ok) return parsed.response
    const { ids, expectedCount, budgetId } = parsed.data

    const uniqueIds = [...new Set(ids)]
    if (uniqueIds.length !== expectedCount) {
      return badRequest(
        `De selectie is gewijzigd: ${uniqueIds.length} transacties in plaats van ${expectedCount}. Zoek opnieuw en bevestig.`,
        'count_mismatch',
      )
    }

    // Het doelbudget wordt OWN-ROW geverifieerd. Zonder deze stap kan een client
    // een willekeurige budget-id opgeven; `budgets` is own-row onder RLS, dus een
    // vreemde id levert hier netjes niets op.
    let targetsEigenRekening = false
    if (budgetId) {
      const { data: budget, error: budgetError } = await supabase
        .from('budgets')
        .select('id, slug')
        .eq('user_id', user.id)
        .eq('id', budgetId)
        .maybeSingle()
      if (budgetError) return serverError(budgetError, 'transactions-bulk-budget:PATCH')
      if (!budget) return badRequest('Onbekend budget', 'unknown_budget')
      targetsEigenRekening = collectEigenRekeningBudgetIds([budget as { id: string; slug: string | null }]).has(
        budgetId,
      )
    }

    const candidates = await readBulkCandidates(supabase, user.id, uniqueIds)
    const { groups, skipped } = planBulkBudgetUpdate({
      requestedIds: uniqueIds,
      candidates,
      budgetId,
      targetsEigenRekening,
    })

    // `excludeSplits` zet `.not('is_split','is',true)` op de UPDATE zelf — de
    // skip-lijst hierboven is de MELDING, deze guard is de AFDWINGING.
    const { touched, failedIds } = await bulkUpdateTransactions(supabase, user.id, groups, {
      excludeSplits: true,
    })

    const body: BulkBudgetResponse = {
      requested: uniqueIds.length,
      updated: touched,
      skipped,
      failedIds,
      // Structureel false: het manifest WEIGERT boven SELECTION_MAX in plaats van
      // af te kappen, dus een mutatie op een bevroren lijst kan per definitie niet
      // op een afgekapte selectie draaien. Het veld blijft in het contract omdat
      // de UI één antwoordvorm leest.
      truncated: false,
    }
    return NextResponse.json(body)
  } catch (err) {
    return serverError(err, 'transactions-bulk-budget:PATCH')
  }
}
