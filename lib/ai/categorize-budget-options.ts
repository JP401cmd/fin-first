/**
 * Pure helpers voor het opbouwen van de aangeboden categorisatie-opties vanuit
 * een set ruwe budgetrijden. Gedragsloze extractie zodat de logica testbaar is
 * zonder Supabase of de AI SDK te raken.
 *
 * Canonieke plek (single source of truth). Wordt geconsumeerd door:
 *   - app/api/ai/categorize/route.ts (cloud-pad, via de re-export-barrel
 *     ./budget-options)
 *   - components/app/ai-categorize-sheet.tsx (lokale privé-modus-resolver)
 *   - lib/regression-tests/suites/categorisatie.ts
 *
 * De import-richting dwong deze verplaatsing af: een client-component mag niet
 * uit `app/api/**` importeren. De oude route-locatie blijft als dunne barrel
 * bestaan zodat bestaande imports (route + budget-options.test.ts) ongewijzigd
 * werken — geen duplicatie.
 */

import type { CategorizeBudgetOption } from '@/lib/ai/categorize-system-prompt'

export type BudgetRow = {
  id: string
  parent_id: string | null
  name: string
  slug: string | null
  budget_type: string | null
  description: string | null
  ownership: string | null
}

export type BudgetCandidate = {
  option: CategorizeBudgetOption
  id: string
  ownership: string | null
}

/** Budget-types die als toewijsdoel mogen dienen. 'archive' is bewust uitgesloten. */
const ASSIGNABLE_TYPES = new Set<CategorizeBudgetOption['type']>([
  'income', 'expense', 'savings', 'debt',
])

export function isAssignableType(t: string | null): t is CategorizeBudgetOption['type'] {
  return t != null && ASSIGNABLE_TYPES.has(t as CategorizeBudgetOption['type'])
}

/**
 * Verwerkt een platte lijst budgetrijden naar de aangeboden opties + slug→id mapping.
 *
 * Regels:
 * - Alleen leaf-budgetten (geen andere rij heeft dit id als parent_id).
 * - Alleen assignable types (income/expense/savings/debt).
 * - Bij slug-collisie wint de 'shared' ownership-rij.
 * - Rows zonder slug worden overgeslagen.
 */
export function buildBudgetOptions(rows: BudgetRow[]): {
  options: CategorizeBudgetOption[]
  slugToId: Map<string, string>
  validSlugs: Set<string>
} {
  const parentIds = new Set<string>()
  for (const b of rows) {
    if (b.parent_id) parentIds.add(b.parent_id)
  }

  const idToName = new Map<string, string>()
  for (const b of rows) idToName.set(b.id, b.name)

  const bySlug = new Map<string, BudgetCandidate>()

  for (const b of rows) {
    if (!b.slug) continue
    if (parentIds.has(b.id)) continue // parent met children → geen toewijsdoel
    if (!isAssignableType(b.budget_type)) continue

    const candidate: BudgetCandidate = {
      id: b.id,
      ownership: b.ownership,
      option: {
        slug: b.slug,
        name: b.name,
        parentName: b.parent_id ? (idToName.get(b.parent_id) ?? null) : null,
        type: b.budget_type as CategorizeBudgetOption['type'],
        description: b.description ?? null,
      },
    }

    const existing = bySlug.get(b.slug)
    // Voorkeur voor 'shared' bij een slug-collisie.
    if (existing && b.ownership !== 'shared') continue
    bySlug.set(b.slug, candidate)
  }

  const options: CategorizeBudgetOption[] = Array.from(bySlug.values()).map((c) => c.option)
  const slugToId = new Map<string, string>()
  const validSlugs = new Set<string>()
  for (const c of bySlug.values()) {
    slugToId.set(c.option.slug, c.id)
    validSlugs.add(c.option.slug)
  }

  return { options, slugToId, validSlugs }
}

/**
 * Valideert een door het model geretourneerde slug tegen de aangeboden set.
 * Normaliseert naar lowercase+trim. Onbekende slug → null.
 */
export function resolveSlug(
  rawSlug: string | null | undefined,
  validSlugs: Set<string>,
): string | null {
  if (!rawSlug) return null
  const normalized = rawSlug.toLowerCase().trim()
  return validSlugs.has(normalized) ? normalized : null
}
