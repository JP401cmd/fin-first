import { z } from 'zod'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/parse-body'
import { forbidden, serverError, unauthorized } from '@/lib/api/respond'

/**
 * POST /api/recurring/bulk — meerdere gedetecteerde patronen in één keer
 * overnemen als terugkerende boekingen.
 *
 * ── Waarom deze route bestaat ───────────────────────────────────────────────
 * De "Alles toevoegen"-knop in de patronen-modal deed dit eerst met een
 * client-directe `insert()` vanuit de browser. Dat wijkt af van ADR 0058
 * (lezen via loader, MUTEREN via een API-route) en laat de validatie volledig
 * aan RLS over. RLS dekt het ergste — de INSERT-policy op
 * `recurring_transactions` eist `auth.uid() = user_id`, dus schrijven namens
 * een ander lukt niet — maar meer dan dat toetst zij niet: `account_id` en
 * `budget_id` zijn vreemde sleutels zonder eigenaarschapscheck in de policy.
 * Een client kon dus in principe een rekening of budget van een ander aan zijn
 * eigen regel hangen. Die tweede laag zit hier.
 *
 * `user_id` komt hier uit de sessie en NOOIT uit de body: een door de client
 * meegestuurde eigenaar is geen invoer maar een aanname over wie je bent.
 */

/** Frequenties zoals `recurring_transactions.frequency` ze kent. */
const FREQUENTIES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const

const PatroonSchema = z.object({
  name: z.string().trim().min(1, 'Naam mag niet leeg zijn').max(200),
  amount: z.number().finite(),
  frequency: z.enum(FREQUENTIES),
  day_of_month: z.number().int().min(1).max(31).nullable().optional(),
  day_of_week: z.number().int().min(0).max(6).nullable().optional(),
  budget_id: z.string().uuid().nullable().optional(),
})

const BulkSchema = z.object({
  /** De rekening waar deze regels aan hangen; eigenaarschap wordt server-side getoetst. */
  account_id: z.string().uuid(),
  /** Bovengrens is een DoS-rem, geen functionele grens: de detector levert er in
   *  de praktijk hooguit enkele tientallen. */
  patterns: z.array(PatroonSchema).min(1, 'Geen patronen meegegeven').max(100),
})

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return unauthorized()

    const parsed = await parseBody(BulkSchema, req)
    if (!parsed.ok) return parsed.response
    const { account_id, patterns } = parsed.data

    // ── Eigenaarschap van de VREEMDE SLEUTELS ────────────────────────────────
    // Dit is de laag die RLS niet levert. De SELECT-policy op deze tabellen kan
    // huishoud-gedeeld zijn, dus "ik kan hem zien" is géén bewijs van
    // eigenaarschap — daarom een expliciete `.eq('user_id', …)` en niet alleen
    // een bestaanscheck.
    const { data: account, error: accountError } = await supabase
      .from('bank_accounts')
      .select('id')
      .eq('id', account_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (accountError) return serverError(accountError, 'recurring-bulk:POST')
    if (!account) return forbidden('Deze rekening is niet van jou')

    const budgetIds = [...new Set(
      patterns.map((p) => p.budget_id).filter((id): id is string => typeof id === 'string'),
    )]
    if (budgetIds.length > 0) {
      const { data: eigenBudgetten, error: budgetError } = await supabase
        .from('budgets')
        .select('id')
        .in('id', budgetIds)
        .eq('user_id', user.id)
      if (budgetError) return serverError(budgetError, 'recurring-bulk:POST')
      if ((eigenBudgetten?.length ?? 0) !== budgetIds.length) {
        return forbidden('Een van de budgetten is niet van jou')
      }
    }

    // Volgnummer aansluitend op wat er al staat, zodat de nieuwe regels achteraan
    // komen in plaats van te botsen met bestaande posities.
    const { count, error: countError } = await supabase
      .from('recurring_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
    if (countError) return serverError(countError, 'recurring-bulk:POST')

    const startDate = new Date().toISOString().split('T')[0]
    const rijen = patterns.map((p, i) => ({
      user_id: user.id,
      account_id,
      name: p.name,
      amount: p.amount,
      frequency: p.frequency,
      day_of_month: p.day_of_month ?? null,
      day_of_week: p.day_of_week ?? null,
      start_date: startDate,
      budget_id: p.budget_id ?? null,
      is_active: true,
      sort_order: (count ?? 0) + i,
    }))

    // Eén insert = alles-of-niets. Een half doorgevoerde lijst is hier het
    // slechtste resultaat: de gebruiker ziet "toegevoegd" en moet daarna zelf
    // uitzoeken welke helft ontbreekt.
    const { data, error } = await supabase
      .from('recurring_transactions')
      .insert(rijen)
      .select('id')
    if (error) return serverError(error, 'recurring-bulk:POST')

    return NextResponse.json({ added: data?.length ?? 0 })
  } catch (err) {
    return serverError(err, 'recurring-bulk:POST')
  }
}
