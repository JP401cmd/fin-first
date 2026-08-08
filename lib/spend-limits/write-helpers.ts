/**
 * Gedeelde schrijf-helpers voor de grenzenpot-routes.
 *
 * POST (/api/spend-limits) en PATCH (/api/spend-limits/[id]) schrijven exact
 * dezelfde kolommen uit exact hetzelfde zod-schema. Twee kopieën van die
 * omzetting zouden onvermijdelijk uit elkaar lopen — vandaar één eigenaar.
 *
 * Route-handlers mogen zelf alleen HTTP-methodes exporteren, dus deze helpers
 * horen hier en niet in het route-bestand.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { spendLimitCounterpartyKey } from './counterparty-key'
import type { SpendLimitInput } from './schema'

/** De kolommen die een grenzenpot-mutatie schrijft (zonder `user_id`). */
export function toSpendLimitRow(input: SpendLimitInput) {
  const base = {
    name: input.name,
    purpose: input.purpose ?? null,
    rule_type: input.ruleType,
    limit_amount: input.limitAmount,
    period: input.period,
    is_active: input.isActive,
    updated_at: new Date().toISOString(),
  }

  if (input.ruleType === 'budget') {
    return {
      ...base,
      budget_id: input.budgetId,
      include_child_budgets: input.includeChildBudgets,
      counterparty_key: null as string | null,
      counterparty_label: null as string | null,
    }
  }

  return {
    ...base,
    budget_id: null as string | null,
    include_child_budgets: true,
    // Serverzijdig afgeleid: de client stuurt alleen het label, nooit de
    // sleutel. Zo kan een client geen sleutel meesturen die afwijkt van zijn
    // eigen label, en zit de sleutel per definitie in het formaat dat de
    // SQL-functie én de check-constraint verwachten.
    counterparty_key: spendLimitCounterpartyKey(input.counterpartyLabel),
    counterparty_label: input.counterpartyLabel,
  }
}

/**
 * Bewijst dat het meegestuurde budget van de aanroeper is.
 *
 * De zod-validatie toetst alleen het UUID-FORMAAT, en de foreign key bewijst
 * alleen dat de rij BESTAAT. Zonder deze check maakt het verschil tussen "ok" en
 * een FK-fout een existence-oracle over andermans budget-ids, en zou de
 * `ON DELETE CASCADE` een grenzenpot aan een vreemde rij hangen — die verdwijnt
 * dan stil zodra de ander zijn budget opruimt. De select loopt op de RLS-client,
 * dus "niet van jou" en "bestaat niet" zijn hier terecht hetzelfde antwoord.
 */
export async function budgetIsOwn(supabase: SupabaseClient, budgetId: string): Promise<boolean> {
  const { data } = await supabase.from('budgets').select('id').eq('id', budgetId).maybeSingle()
  return Boolean(data)
}
