import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { setBudgetTracking } from '@/lib/budget-tracking'
import { unauthorized, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'

/**
 * POST `/api/assets/toggle-budget`
 *
 * Schakelt `has_budget_tracking` aan/uit voor een specifieke cash-asset. De drie
 * gekoppelde schrijfacties (asset-vlag, `bank_accounts`-companion, module-gate
 * `profiles.budgeting_active`) staan in `lib/budget-tracking.ts#setBudgetTracking`
 * — deze route is de HTTP-kant daarvan. Sinds fase 4 van het
 * doelrekening-plan schrijft ook `POST /api/bank-connect/auth-link` diezelfde
 * keuze (het voorgevinkte budget-vinkje in de koppelwizard, B2), en die twee
 * mogen niet elk hun eigen drieluik hebben.
 *
 * Aanroepers: de detail-sheet (`<AssetDetailSheet>`) en het rekeningscherm
 * (`<CashAccountView>` → "Budgetteren uitschakelen"), beide achter een
 * bevestigingsdialoog — bewust geen quick-toggle vanuit kaarten of chips,
 * omdat een wijziging door alle historische berekeningen heen werkt.
 *
 * Body: `{ id: string, enabled: boolean }`
 * Antwoord: `{ ok, asset, budgeting_active }` — `budgeting_active` is de
 * herberekende module-gate, zodat de client daarna niet zelf hoeft te raden
 * (of te herberekenen) waar hij naartoe navigeert.
 */
const ToggleBudgetSchema = z.object({
  id: z.string().min(1, 'id is vereist'),
  enabled: z.boolean(),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  const parsed = await parseBody(ToggleBudgetSchema, request)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  const result = await setBudgetTracking(supabase, user.id, body.id, body.enabled)

  if (!result.ok) {
    return serverError(result.error, 'assets-toggle-budget:POST')
  }

  return NextResponse.json({
    ok: true,
    asset: result.asset,
    budgeting_active: result.budgetingActive,
  })
}
