import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { unauthorized, badRequest, serverError } from '@/lib/api/respond'
import type { BudgetPlanDiff } from '@/lib/budget-plan-diff'

/**
 * POST /api/budgets/plan — Apply a diff atomically via the save_budget_plan RPC.
 *
 * Body: a BudgetPlanDiff object. The RPC validates ownership, rejects historical
 * amount rows, and performs inserts/updates/deletes plus amount upserts in a
 * single Postgres transaction. Any failure rolls back the whole save.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
  }

  const diff = (await request.json()) as BudgetPlanDiff

  if (!diff || typeof diff !== 'object') {
    return badRequest('Ongeldige payload')
  }
  for (const key of ['to_insert', 'to_update', 'to_delete', 'amounts'] as const) {
    if (!Array.isArray(diff[key])) {
      return badRequest(`${key} moet een array zijn`)
    }
  }

  const { data, error } = await supabase.rpc('save_budget_plan', { p_plan: diff })

  if (error) {
    return serverError(error, 'budgets-plan:POST')
  }

  const result = data as { success?: boolean; error?: string; status?: number; counts?: Record<string, number>; id_map?: Record<string, string> }
  if (result?.error) {
    // The RPC returns author-written, client-safe messages for its 401/403
    // guard failures. A 500 carries the raw SQLERRM/SQLSTATE from the
    // EXCEPTION-block — that must never reach the client (ADR 0044). Route it
    // through serverError() so the real error is logged server-side under a
    // grep-able tag and the client only sees a generic message.
    if (result.status === 401 || result.status === 403) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return serverError(new Error(result.error), 'budgets-plan:rpc')
  }

  return NextResponse.json({
    success: true,
    counts: result.counts ?? {},
    id_map: result.id_map ?? {},
  })
}
