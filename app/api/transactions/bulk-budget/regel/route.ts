import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/parse-body'
import { unauthorized, badRequest, serverError } from '@/lib/api/respond'
import { BulkRuleSchema } from '@/lib/transactions/bulk-schemas'
import { collectEigenRekeningBudgetIds } from '@/lib/transactions/transfer-marking'
import { isRejected, planRuleTarget } from '@/lib/transactions/rule-target'
import { escapeLikePattern } from '@/lib/transactions/search-query'
import type { BulkRuleResponse } from '@/lib/transactions/bulk-contract'

/**
 * `POST /api/transactions/bulk-budget/regel` — maak van een geslaagde
 * hercategorisatie een blijvende regel (F20/AC13).
 *
 * Deze route wordt UITSLUITEND aangeroepen op expliciete bevestiging. Wegklikken
 * laat geen regel achter, want er gebeurt dan simpelweg geen call — de
 * hercategorisatie zelf schrijft nooit een regel mee.
 *
 * ## Twee soorten regel, en waarom het verschil ertoe doet
 *
 * Wáár de regel landt en of hij überhaupt mag ontstaan, beslist deze route niet
 * zelf: dat is `planRuleTarget` (`lib/transactions/rule-target.ts`), gedeeld met
 * `lib/category-rules.ts` en `components/app/transaction-form.tsx`. Kort: een
 * "Eigen rekening"-regel hoort in `user_own_ibans` en nooit in
 * `category_corrections` (een budgetcorrectie zet alleen `budget_id`, dus
 * toekomstige imports zouden wél op de archive-post landen en tóch meetellen —
 * `isRealAggRow` kijkt naar `transaction_type`), en élke blijvende matchwaarde
 * draagt dezelfde ondergrens.
 *
 * Die ondergrens gold hier eerder alléén op de `user_own_ibans`-tak. Dat was het
 * gat: een `category_corrections`-regel op `description` matcht als SUBSTRING op
 * priority 1, dus een zoekterm van twee tekens stuurde élke volgende import naar
 * één budget — en daarmee de spaarquote en de FIRE-datum.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return unauthorized()

    const parsed = await parseBody(BulkRuleSchema, request)
    if (!parsed.ok) return parsed.response
    const { matchField, matchValue, budgetId } = parsed.data

    const { data: budget, error: budgetError } = await supabase
      .from('budgets')
      .select('id, slug')
      .eq('user_id', user.id)
      .eq('id', budgetId)
      .maybeSingle()
    if (budgetError) return serverError(budgetError, 'transactions-bulk-regel:POST')
    if (!budget) return badRequest('Onbekend budget', 'unknown_budget')

    const targetsEigenRekening = collectEigenRekeningBudgetIds([
      budget as { id: string; slug: string | null },
    ]).has(budgetId)

    const plan = planRuleTarget({ targetsEigenRekening, matchField, matchValue })
    if (isRejected(plan)) {
      return badRequest(
        plan.rejected.message,
        plan.rejected.reason === 'unsupported_match_field'
          ? 'unsupported_match_field'
          : 'validation_error',
      )
    }
    const target = plan.target

    if (target.table === 'user_own_ibans') {
      // `ignoreDuplicates` op de bestaande UNIQUE `(user_id, match_type,
      // match_value)`: twee keer bevestigen is een no-op, geen 409.
      const { error } = await supabase.from('user_own_ibans').upsert(
        {
          user_id: user.id,
          iban: target.matchType === 'iban' ? target.matchValue : null,
          match_type: target.matchType,
          match_value: target.matchValue,
          label: target.label,
        },
        { onConflict: 'user_id,match_type,match_value', ignoreDuplicates: true },
      )
      if (error && (error as { code?: string }).code !== '23505') {
        return serverError(error, 'transactions-bulk-regel:POST')
      }

      const body: BulkRuleResponse = { created: true }
      return NextResponse.json(body)
    }

    // Gewoon budget → budget-correctieregel. Delete vóór insert zodat een
    // bestaande regel op dezelfde waarde wordt VERVANGEN en er niet twee
    // tegenstrijdige regels op dezelfde tegenpartij ontstaan; de match is
    // case-insensitief, net als bij het bewerkformulier.
    //
    // `escapeLikePattern` is hier geen nettigheid: zonder escaping is een `%` in
    // de matchwaarde een joker, en wist deze delete ÁLLE regels van de gebruiker
    // met "Regel opgeslagen" als terugkoppeling.
    const { error: delError } = await supabase
      .from('category_corrections')
      .delete()
      .eq('user_id', user.id)
      .eq('match_field', target.matchField)
      .ilike('match_value', escapeLikePattern(target.matchValue))
    if (delError) return serverError(delError, 'transactions-bulk-regel:POST')

    const { error: insError } = await supabase.from('category_corrections').insert({
      user_id: user.id,
      match_field: target.matchField,
      match_value: target.matchValue,
      budget_id: budgetId,
    })
    if (insError) return serverError(insError, 'transactions-bulk-regel:POST')

    const body: BulkRuleResponse = { created: true }
    return NextResponse.json(body)
  } catch (err) {
    return serverError(err, 'transactions-bulk-regel:POST')
  }
}
