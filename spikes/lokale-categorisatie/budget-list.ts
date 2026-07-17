// Leid de standaard-budgetboom af uit de canonieke catalogus van de app
// (single source of truth) → CategorizeBudgetOption[] zoals de echte
// categorisatie-route die aan de prompt voert.
//
// Alleen LEAF-budgetten zijn een toewijsdoel (app-conventie). Archive-leaves
// ("Eigen rekening") zijn geen toewijsdoel en worden uitgesloten — hun type
// ('archive') valt bovendien buiten CategorizeBudgetOption['type'].

import { BUDGET_LEAF_META, BUDGET_PARENT_META } from '../../lib/budget-data.ts'
import type { CategorizeBudgetOption } from '../../lib/ai/categorize-system-prompt.ts'
import type { DevTransaction } from './types.ts'

/**
 * Bouw de aangeboden budgetlijst (leaf-only, archive uitgesloten) uit de
 * canonieke catalogus. Type = het budget_type van het hoofdbudget.
 */
export function buildDefaultBudgetOptions(): CategorizeBudgetOption[] {
  const options: CategorizeBudgetOption[] = []

  for (const [slug, leaf] of Object.entries(BUDGET_LEAF_META)) {
    const parent = BUDGET_PARENT_META[leaf.parentSlug]
    if (!parent) continue
    if (parent.budget_type === 'archive') continue // geen toewijsdoel

    options.push({
      slug,
      name: leaf.name,
      parentName: parent.name,
      type: parent.budget_type as CategorizeBudgetOption['type'],
      description: leaf.description ?? null,
    })
  }

  return options
}

/** Set van geldige toewijsbare slugs — voor validatie (metriek 9) en dataset-check. */
export function validSlugSet(options?: CategorizeBudgetOption[]): Set<string> {
  const opts = options ?? buildDefaultBudgetOptions()
  return new Set(opts.map((o) => o.slug))
}

// ── Goud-bron: budgetlijst + transacties uit externe JSON (pure coercie) ───────
//
// Bij een goud-set komen zowel de promptlijst als de slug-validatie én de
// accuracy-vergelijking uit de ECHTE budgetlijst van het bron-account
// (goud-budgets.json), niet uit de standaardboom. Deze helpers zijn puur zodat ze
// zonder DOM/netwerk te unit-testen zijn.

const ASSIGNABLE_TYPES = new Set<CategorizeBudgetOption['type']>(['income', 'expense', 'savings', 'debt'])

/** Coerce goud-budgets.json → gevalideerde CategorizeBudgetOption[] (archive/onbekend type overgeslagen). */
export function coerceBudgetOptions(raw: unknown): CategorizeBudgetOption[] {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).budgets)
      ? ((raw as Record<string, unknown>).budgets as unknown[])
      : null
  if (!arr) throw new Error('goud-budgets.json: verwacht een array van budgetopties (of {budgets:[...]}).')

  const out: CategorizeBudgetOption[] = []
  for (const e of arr) {
    if (!e || typeof e !== 'object') continue
    const o = e as Record<string, unknown>
    const slug = typeof o.slug === 'string' ? o.slug : null
    const name = typeof o.name === 'string' ? o.name : null
    const type = typeof o.type === 'string' ? (o.type as CategorizeBudgetOption['type']) : ('' as CategorizeBudgetOption['type'])
    if (!slug || !name || !ASSIGNABLE_TYPES.has(type)) continue
    out.push({
      slug,
      name,
      parentName: typeof o.parentName === 'string' ? o.parentName : null,
      type,
      description: typeof o.description === 'string' ? o.description : null,
    })
  }
  if (out.length === 0) throw new Error('goud-budgets.json: geen geldige budgetopties gevonden.')
  return out
}

/** Coerce een dataset-JSON (array of {transactions:[...]}) → DevTransaction[]. */
export function normalizeDatasetTransactions(raw: unknown): DevTransaction[] {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).transactions)
      ? ((raw as Record<string, unknown>).transactions as unknown[])
      : null
  if (!arr) throw new Error('dataset: verwacht een array of {transactions:[...]}.')

  return arr.map((e, i): DevTransaction => {
    const o = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>
    const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
    const bron = o.bron === 'manual' || o.bron === 'ai' ? (o.bron as 'manual' | 'ai') : undefined
    const label = o.label_slug === null ? null : str(o.label_slug) ?? str(o.label)
    return {
      id: o.id != null ? String(o.id) : `tx${i + 1}`,
      description: str(o.description) ?? '',
      counterparty_name: str(o.counterparty_name) ?? str(o.counterparty),
      amount: Number(o.amount) || 0,
      reference: str(o.reference),
      date: str(o.date) ?? '',
      label_slug: label,
      edge_case: o.edge_case === true,
      edge_note: str(o.edge_note) ?? undefined,
      bron,
    }
  })
}
