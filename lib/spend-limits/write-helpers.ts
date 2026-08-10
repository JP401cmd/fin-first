/**
 * Gedeelde schrijf-helpers voor de grenzenpot-routes.
 *
 * POST (/api/spend-limits) en PATCH (/api/spend-limits/[id]) schrijven exact
 * dezelfde kolommen uit exact hetzelfde zod-schema, en zetten de regels op exact
 * dezelfde manier weg. Twee kopieën van die omzetting zouden onvermijdelijk uit
 * elkaar lopen — vandaar één eigenaar.
 *
 * Route-handlers mogen zelf alleen HTTP-methodes exporteren, dus deze helpers
 * horen hier en niet in het route-bestand.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { SpendLimitInput } from './schema'

/**
 * De kolommen op `spend_limits` die een mutatie schrijft (zonder `user_id`).
 *
 * De REGELS staan er bewust niet bij: die leven sinds 10-08-2026 in
 * `spend_limit_rules` en gaan via `replaceSpendLimitRules`. De legacy-kolommen
 * (`rule_type`, `budget_id`, `include_child_budgets`, `counterparty_key`,
 * `counterparty_label`) worden NIET meer geschreven — ze halfslachtig blijven
 * vullen zou precies de tweede waarheid maken die deze wijziging opruimt. Ze
 * staan op NULL voor elke pot die na deze wijziging is aangemaakt of bewerkt.
 */
export function toSpendLimitRow(input: SpendLimitInput) {
  return {
    name: input.name,
    purpose: input.purpose ?? null,
    limit_amount: input.limitAmount,
    period: input.period,
    is_active: input.isActive,
    updated_at: new Date().toISOString(),
  }
}

/**
 * De regels in de vorm die `public.spend_limit_replace_rules` verwacht.
 *
 * Alleen LABELS — nooit sleutels. De genormaliseerde zoeksleutel wordt in SQL
 * afgeleid met dezelfde functie die het aggregaat gebruikt, zodat er geen enkele
 * route bestaat waarlangs een sleutel kan afwijken van zijn eigen label.
 *
 * `sort_order` komt uit de POSITIE in de lijst en niet uit een veld in de body:
 * de volgorde die de gebruiker in het formulier ziet, is de volgorde die de
 * ontdubbeling in SQL gebruikt (de eerste regel vangt de transactie). Een apart
 * meegestuurd volgnummer zou daarvan kunnen afwijken.
 */
export function toReplaceRulesPayload(input: SpendLimitInput) {
  return input.rules.map((rule, index) => ({
    sort_order: index,
    budget_ids: rule.budgetIds,
    include_child_budgets: rule.includeChildBudgets,
    counterparty_labels: rule.counterpartyLabels,
  }))
}

/**
 * Alle budget-ids die in de regels voorkomen, ontdubbeld.
 * Eén lijst om te toetsen, ongeacht over hoeveel regels ze verspreid staan.
 */
export function collectInputBudgetIds(input: SpendLimitInput): string[] {
  return [...new Set(input.rules.flatMap((r) => r.budgetIds))]
}

/**
 * Bewijst dat álle meegestuurde budgetten van de aanroeper zijn.
 *
 * De zod-validatie toetst alleen het UUID-FORMAAT. Vroeger bewees de foreign key
 * op `spend_limits.budget_id` dat de rij bestond; `spend_limit_rules.budget_ids`
 * is een `uuid[]` en kan er geen dragen, dus dit is nu de ENIGE plek waar
 * eigenaarschap wordt getoetst. Zonder deze check zou een gebruiker vreemde
 * budget-ids in zijn regel kunnen zetten — die tellen weliswaar niets (het
 * aggregaat is SECURITY INVOKER en ziet alleen zíjn transacties), maar de UI zou
 * er wel een lege "onbekend budget"-regel van maken en de fout pas veel later
 * zichtbaar worden.
 *
 * De select loopt op de RLS-client, dus "niet van jou" en "bestaat niet" zijn
 * hier terecht hetzelfde antwoord — er ontstaat geen existence-oracle over
 * andermans budget-ids.
 */
export async function budgetsAreOwn(
  supabase: SupabaseClient,
  budgetIds: readonly string[],
): Promise<boolean> {
  if (budgetIds.length === 0) return true
  const { data, error } = await supabase.from('budgets').select('id').in('id', [...budgetIds])
  if (error) return false
  return (data ?? []).length === budgetIds.length
}

/**
 * Vervang de regels van één pot, atomair.
 *
 * Bewust via de plpgsql-functie en niet als DELETE + INSERT vanuit de route:
 * elke PostgREST-call is zijn eigen transactie, en een mislukte tweede stap zou
 * een pot ZONDER regels achterlaten. Die telt stil nul en ziet er in de UI uit
 * als "je geeft niets uit" — precies de klasse stille fout die dit domein overal
 * uitsluit.
 */
export async function replaceSpendLimitRules(
  supabase: SupabaseClient,
  limitId: string,
  input: SpendLimitInput,
): Promise<{ error: unknown | null }> {
  const { error } = await supabase.rpc('spend_limit_replace_rules', {
    p_limit_id: limitId,
    p_rules: toReplaceRulesPayload(input),
  })
  return { error: error ?? null }
}
