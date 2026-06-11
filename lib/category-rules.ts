/**
 * Toewijzings-plan voor budget-categorisatie met optionele regel-aanmaak en
 * retroactieve toepassing. Geëxtraheerd patroon uit `handleSave` in
 * `components/app/ai-categorize-sheet.tsx` (en `handleSaveWithScope` in
 * `transaction-form.tsx`), als schone basis voor nieuwe callers (Sleepmodus).
 * De bestaande callers blijven (bewust) op hun eigen implementatie.
 *
 * Twee lagen:
 *  - `buildAssignmentPlan` — puur: bepaalt updates, regels en retro-filters.
 *  - `applyAssignmentPlan` — voert het plan sequentieel uit op een Supabase-client.
 *    Volgorde is betekenisvol: de directe tx-update loopt vóór de retro-update,
 *    zodat `budget_id IS NULL` de zojuist toegewezen rijen vanzelf uitsluit.
 */

export type AssignScope = 'rule' | 'these' | 'one'

export type AssignmentInput = {
  tx: {
    id: string
    counterparty_name: string | null
    counterparty_iban: string | null
    description: string
  }
  /** Vergelijkbare transacties die bij scope 'these'/'rule' meegaan. */
  siblingIds: string[]
  budgetId: string
  scope: AssignScope
  /** Eigen-rekening-drop: zet ook transaction_type='transfer'. */
  isTransfer: boolean
  /** Gedeeld budget + huishouden + toggle aan → transactie wordt gezamenlijk. */
  makeShared: boolean
  userId: string
}

export type CategoryRule = {
  match_field: 'counterparty_name' | 'description' | 'counterparty_iban'
  match_value: string
  budget_id: string
}

type TxUpdateSet = {
  budget_id: string
  category_source: string
  ownership?: 'shared'
  transaction_type?: 'transfer'
}

export type AssignmentPlan = {
  txUpdate: { ids: string[]; set: TxUpdateSet }
  rules: CategoryRule[]
  /**
   * Eigen-rekening-herkenning (user_own_ibans) bij een transfer-drop met
   * scope 'rule'. Bewust géén category_corrections-regel: alleen via deze
   * herkenning krijgen toekomstige imports ook transaction_type='transfer'
   * (priority 0 in categorizeTransaction), niet enkel het archive-budget.
   */
  ownAccountRule: {
    matchType: 'iban' | 'name'
    /** IBAN genormaliseerd (geen spaties, uppercase); naam lowercase getrimd. */
    matchValue: string
    label: string | null
    userId: string
  } | null
  retro: {
    set: { budget_id: string; category_source: 'rule'; transaction_type?: 'transfer' }
    nameFilter: { field: 'counterparty_name'; value: string } | { field: 'description'; value: string }
    /** Genormaliseerd (geen spaties, uppercase); null zonder IBAN. */
    iban: string | null
    userId: string
  } | null
}

export function buildAssignmentPlan(input: AssignmentInput): AssignmentPlan {
  const { tx, siblingIds, budgetId, scope, isTransfer, makeShared, userId } = input

  const set: TxUpdateSet = {
    budget_id: budgetId,
    category_source: isTransfer ? 'transfer' : 'manual',
  }
  if (isTransfer) set.transaction_type = 'transfer'
  if (makeShared) set.ownership = 'shared'

  const ids = scope === 'one' ? [tx.id] : [tx.id, ...siblingIds]

  if (scope !== 'rule') {
    return { txUpdate: { ids, set }, rules: [], ownAccountRule: null, retro: null }
  }

  const matchField = tx.counterparty_name ? ('counterparty_name' as const) : ('description' as const)
  const matchValue = tx.counterparty_name || tx.description
  const iban = tx.counterparty_iban ? tx.counterparty_iban.replace(/\s/g, '').toUpperCase() : null

  // Transfer-drop: de "regel" is een eigen-rekening-herkenning, geen budget-regel.
  let rules: CategoryRule[] = []
  let ownAccountRule: AssignmentPlan['ownAccountRule'] = null
  if (isTransfer) {
    const nameKey = (tx.counterparty_name ?? '').trim().toLowerCase()
    if (iban || nameKey) {
      ownAccountRule = {
        matchType: iban ? 'iban' : 'name',
        matchValue: iban || nameKey,
        label: tx.counterparty_name,
        userId,
      }
    }
  } else {
    rules = [{ match_field: matchField, match_value: matchValue, budget_id: budgetId }]
    if (iban) rules.push({ match_field: 'counterparty_iban', match_value: iban, budget_id: budgetId })
  }

  const retroSet: NonNullable<AssignmentPlan['retro']>['set'] = {
    budget_id: budgetId,
    category_source: 'rule',
  }
  if (isTransfer) retroSet.transaction_type = 'transfer'

  return {
    txUpdate: { ids, set },
    rules,
    ownAccountRule,
    retro: {
      set: retroSet,
      nameFilter: { field: matchField, value: matchValue },
      iban,
      userId,
    },
  }
}

export type AssignmentResult = {
  /** Aantal direct toegewezen transacties (tx + siblings). */
  assigned: number
  ruleCreated: boolean
  /** Aantal retroactief bijgewerkte (oudere) transacties. */
  bulkUpdated: number
}

// Minimale Supabase-clientvorm zodat de executor met zowel de browser-client
// als een test-fake werkt.
type QueryBuilder = {
  eq: (column: string, value: unknown) => QueryBuilder
  is: (column: string, value: unknown) => QueryBuilder
  in: (column: string, values: unknown[]) => QueryBuilder
  ilike: (column: string, pattern: string) => QueryBuilder
  select: (columns: string) => PromiseLike<{ data: { id: string }[] | null; error: { message: string } | null }>
  maybeSingle: () => PromiseLike<{ data: { id: string } | null; error: { message: string } | null }>
} & PromiseLike<{ error: { message: string } | null }>

type SupabaseLike = {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => QueryBuilder
    delete: () => QueryBuilder
    insert: (values: Record<string, unknown>) => QueryBuilder
    select: (columns: string) => QueryBuilder
  }
}

const CHUNK = 200

export async function applyAssignmentPlan(
  supabase: SupabaseLike,
  plan: AssignmentPlan,
): Promise<AssignmentResult> {
  // 1. Directe toewijzing — gechunkt om de PostgREST-URL-lengte te respecteren.
  for (let i = 0; i < plan.txUpdate.ids.length; i += CHUNK) {
    const { error } = await supabase
      .from('transactions')
      .update(plan.txUpdate.set)
      .in('id', plan.txUpdate.ids.slice(i, i + CHUNK))
    if (error) throw new Error(error.message)
  }

  // 2. Regels — delete vóór insert zodat een bestaande regel wordt vervangen.
  for (const rule of plan.rules) {
    const { error: delError } = await supabase
      .from('category_corrections')
      .delete()
      .eq('user_id', plan.retro!.userId)
      .eq('match_field', rule.match_field)
      .ilike('match_value', rule.match_value)
    if (delError) throw new Error(delError.message)
    const { error: insError } = await supabase
      .from('category_corrections')
      .insert({ user_id: plan.retro!.userId, ...rule })
    if (insError) throw new Error(insError.message)
  }

  // 2b. Eigen-rekening-herkenning — bestaat de regel al, dan niets doen
  //     (zelfde patroon als markRowsAsTransfer in de import-flow).
  let ownRuleCreated = false
  if (plan.ownAccountRule) {
    const { matchType, matchValue, label, userId } = plan.ownAccountRule
    const { data: existing, error: checkError } = await supabase
      .from('user_own_ibans')
      .select('id')
      .eq('user_id', userId)
      .eq('match_type', matchType)
      .eq('match_value', matchValue)
      .maybeSingle()
    if (checkError) throw new Error(checkError.message)
    if (!existing) {
      const { error: insertError } = await supabase.from('user_own_ibans').insert({
        user_id: userId,
        iban: matchType === 'iban' ? matchValue : null,
        match_type: matchType,
        match_value: matchValue,
        label,
      })
      if (insertError) throw new Error(insertError.message)
    }
    ownRuleCreated = true
  }

  // 3. Retroactief — `budget_id IS NULL` sluit de zojuist toegewezen rijen uit
  //    omdat stap 1 al gelopen heeft.
  let bulkUpdated = 0
  if (plan.retro) {
    const { set, nameFilter, iban, userId } = plan.retro

    let nameQuery = supabase
      .from('transactions')
      .update(set)
      .eq('user_id', userId)
      .is('budget_id', null)
    nameQuery = nameFilter.field === 'counterparty_name'
      ? nameQuery.ilike('counterparty_name', nameFilter.value)
      : nameQuery.ilike('description', `%${nameFilter.value}%`)
    const { data: nameRows, error: nameError } = await nameQuery.select('id')
    if (nameError) throw new Error(nameError.message)
    bulkUpdated += nameRows?.length ?? 0

    if (iban) {
      const { data: ibanRows, error: ibanError } = await supabase
        .from('transactions')
        .update(set)
        .eq('user_id', userId)
        .is('budget_id', null)
        .eq('counterparty_iban', iban)
        .select('id')
      if (ibanError) throw new Error(ibanError.message)
      bulkUpdated += ibanRows?.length ?? 0
    }
  }

  return {
    assigned: plan.txUpdate.ids.length,
    ruleCreated: plan.rules.length > 0 || ownRuleCreated,
    bulkUpdated,
  }
}
