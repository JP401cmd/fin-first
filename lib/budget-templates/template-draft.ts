// ── Budget-draft helpers: template → draft, Eigen rekening, groeperen ──
//
// Pure helpers rond `DraftBudget` (lib/budget-plan-diff.ts), gedeeld door de
// plan-editor in de app (`components/app/budget-plan-editor-sheet.tsx`) en de
// budgetstap in de onboarding (`components/onboarding/onboarding-budget.tsx`).
// `buildTemplateDraft`, `makeTmpId`, `groupForRender` en de "te verdelen"-som
// stonden tot sep 2026 privé in de sheet en zijn hierheen verhuisd, niet
// herschreven — beide oppervlakken rekenen dus met dezelfde regels.
//
// Nieuw zijn alleen `buildEmptyDraft`, `ensureEigenRekening` en
// `isProtectedBudget`: de post Eigen rekening is verplicht, omdat de
// transfer-herkenning (`resolveEigenRekeningBudgetId`, lib/budget-data.ts)
// er overboekingen tussen eigen rekeningen op laat landen.

import {
  BUDGET_SLUGS,
  leafSeed,
  parentSeed,
  type Budget,
  type SeedBudget,
} from '@/lib/budget-data'
import { buildTemplateSeed, type BudgetTemplateId } from '@/lib/budget-templates/onboarding-presets'
import { NEW_BUDGET_DETAIL_DEFAULTS, type DraftBudget } from '@/lib/budget-plan-diff'

export type BudgetType = Budget['budget_type']

export const TYPE_ORDER: BudgetType[] = ['income', 'expense', 'savings', 'debt', 'archive']

export const TYPE_LABEL: Record<BudgetType, string> = {
  income: 'Inkomsten',
  expense: 'Uitgaven',
  savings: 'Sparen',
  debt: 'Schulden',
  archive: 'Archief',
}

let tmpCounter = 0
/** Client-side tijdelijk id; `isTempId` herkent het `tmp-`-prefix. */
export function makeTmpId(): string {
  tmpCounter += 1
  return `tmp-${Date.now().toString(36)}-${tmpCounter}`
}

/**
 * Zet een hiërarchische seed (`SeedBudget[]`) om naar platte draft-rijen met
 * tijdelijke ids. Een hoofdbudget mét children leidt zijn bedrag af van de
 * kinderen (amount = null → de view toont de som); een childless hoofdbudget
 * (minimalistisch) draagt zelf het bedrag.
 */
function seedToDraft(seed: SeedBudget[]): DraftBudget[] {
  const next: DraftBudget[] = []

  seed.forEach((parent, parentIdx) => {
    const parentId = makeTmpId()
    const children = parent.children ?? []
    next.push({
      id: parentId,
      parentId: null,
      name: parent.name,
      slug: parent.slug,
      icon: parent.icon,
      description: parent.description ?? null,
      budgetType: parent.budget_type,
      defaultLimit: parent.default_limit,
      isEssential: parent.is_essential,
      sortOrder: parent.sort_order ?? parentIdx,
      interval: 'monthly',
      rolloverType: 'reset',
      amount: children.length > 0 ? null : parent.default_limit,
      ...NEW_BUDGET_DETAIL_DEFAULTS,
    })
    children.forEach((child, idx) => {
      next.push({
        id: makeTmpId(),
        parentId,
        name: child.name,
        slug: child.slug,
        icon: child.icon,
        description: child.description ?? null,
        budgetType: parent.budget_type,
        defaultLimit: child.default_limit,
        isEssential: false,
        sortOrder: idx,
        interval: 'monthly',
        rolloverType: 'reset',
        amount: child.default_limit,
        ...NEW_BUDGET_DETAIL_DEFAULTS,
      })
    })
  })

  return next
}

/**
 * Bouw de template-draft uit de gedeelde, canonieke seed-builder
 * (`buildTemplateSeed`). De seed levert de volledige hiërarchie met de
 * canonieke slug, naam, icoon en `budget_type` per budget — de editor
 * verzint hier dus niets zelf. De seed bevat Eigen rekening al; de draft gaat
 * tóch door `ensureEigenRekening`, zodat die garantie niet stil afhangt van
 * de seed.
 */
export function buildTemplateDraft(templateId: BudgetTemplateId, income: number): DraftBudget[] {
  return ensureEigenRekening(seedToDraft(buildTemplateSeed(templateId, income)))
}

/** "Leeg beginnen": alleen de verplichte post Eigen rekening. */
export function buildEmptyDraft(): DraftBudget[] {
  return ensureEigenRekening([])
}

/**
 * Garandeert dat de draft de verplichte post Eigen rekening bevat: hoofdbudget
 * `eigen-rekening` (archive) met deelbudget `eigen-rekening-sub`. Idempotent —
 * een draft die ze al heeft komt ongewijzigd terug (zelfde referentie). Naam,
 * icoon en omschrijving komen uit de seed-catalogus (`parentSeed`/`leafSeed`).
 */
export function ensureEigenRekening(draft: DraftBudget[]): DraftBudget[] {
  const parent = draft.find((r) => r.slug === BUDGET_SLUGS.EIGEN_REKENING)
  const sub = draft.find((r) => r.slug === BUDGET_SLUGS.EIGEN_REKENING_SUB)
  if (parent && sub) return draft

  if (!parent) {
    const [newParent, newSub] = seedToDraft([
      { ...parentSeed(BUDGET_SLUGS.EIGEN_REKENING, 0), children: [leafSeed(BUDGET_SLUGS.EIGEN_REKENING_SUB, 0)] },
    ])
    if (!sub) return [...draft, newParent, newSub]
    // Een los deelbudget zonder hoofdbudget: hang het onder het nieuwe hoofdbudget.
    return [...draft.map((r) => (r.id === sub.id ? { ...r, parentId: newParent.id } : r)), newParent]
  }

  const siblings = draft.filter((r) => r.parentId === parent.id)
  const sortOrder = siblings.length > 0 ? Math.max(...siblings.map((s) => s.sortOrder)) + 1 : 0
  const seed = leafSeed(BUDGET_SLUGS.EIGEN_REKENING_SUB, 0)
  return [
    ...draft,
    {
      id: makeTmpId(),
      parentId: parent.id,
      name: seed.name,
      slug: seed.slug,
      icon: seed.icon,
      description: seed.description ?? null,
      budgetType: parent.budgetType,
      defaultLimit: 0,
      isEssential: false,
      sortOrder,
      interval: 'monthly',
      rolloverType: 'reset',
      amount: 0,
      ...NEW_BUDGET_DETAIL_DEFAULTS,
    },
  ]
}

/** Uitleg bij de verplichte post Eigen rekening — gedeeld door boom en detailscherm. */
export const EIGEN_REKENING_UITLEG =
  'Hier landen overboekingen tussen je eigen rekeningen, zodat ze niet als uitgave tellen.'

/** Eigen rekening (hoofd- en deelbudget) is niet te verwijderen of te hernoemen. */
export function isProtectedBudget(row: { slug: string | null }): boolean {
  return row.slug === BUDGET_SLUGS.EIGEN_REKENING || row.slug === BUDGET_SLUGS.EIGEN_REKENING_SUB
}

/** Groepeer + sorteer een platte draft voor weergave: secties per type. */
export function groupForRender(draft: DraftBudget[]) {
  const byType: Record<BudgetType, DraftBudget[]> = {
    income: [], expense: [], savings: [], debt: [], archive: [],
  }
  for (const row of draft) byType[row.budgetType].push(row)

  return TYPE_ORDER.map((type) => {
    const rows = byType[type]
    const parents = rows.filter((r) => !r.parentId)
    const childrenBy: Record<string, DraftBudget[]> = {}
    for (const r of rows) {
      if (r.parentId) {
        (childrenBy[r.parentId] ||= []).push(r)
      }
    }
    parents.sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name))
    for (const id of Object.keys(childrenBy)) {
      childrenBy[id].sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name))
    }
    return { type, parents, childrenBy }
  })
}

export type GroupedDraft = ReturnType<typeof groupForRender>

/**
 * De "te verdelen"-som van de plan-editor. Alleen bladeren tellen mee (een
 * hoofdbudget mét kinderen is een afgeleide som); inkomen en archief tellen
 * niet als toegewezen. Het inkomen komt uit de inkomensposten van de draft,
 * met `fallbackIncome` wanneer die leeg zijn. `carry` = doorgeschoven bedragen
 * uit eerdere maanden (alleen de app-editor kent die).
 */
export function computeTeVerdelen(
  draft: DraftBudget[],
  fallbackIncome: number,
  carry = 0,
): { allocatedTotal: number; incomeTotal: number; teVerdelen: number } {
  const parentIds = new Set(draft.filter((r) => !r.parentId).map((r) => r.id))
  const allocatedTotal = draft.reduce((sum, row) => {
    if (row.budgetType === 'income' || row.budgetType === 'archive') return sum
    const hasChildren = draft.some((r) => r.parentId === row.id)
    if (parentIds.has(row.id) && hasChildren) return sum
    return sum + (row.amount ?? row.defaultLimit ?? 0)
  }, 0)

  const incomeTotal = draft
    .filter((r) => r.budgetType === 'income' && !draft.some((c) => c.parentId === r.id))
    .reduce((sum, r) => sum + (r.amount ?? r.defaultLimit ?? 0), 0)

  const effectiveIncome = incomeTotal > 0 ? incomeTotal : fallbackIncome
  return { allocatedTotal, incomeTotal, teVerdelen: effectiveIncome - allocatedTotal - carry }
}
