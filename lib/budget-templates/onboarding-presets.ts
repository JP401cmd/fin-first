// ── Budget-templates: Minimalistisch / Nibud / Uitgebreid ─────
//
// Drie voorgedefinieerde budget-opzetten die ALLEMAAL dezelfde canonieke
// hoofdstructuur (8 hoofdbudgetten uit `BUDGET_PARENT_META`) gebruiken. Het
// detailniveau bepaalt alléén hoeveel deelbudgetten er onder elk hoofdbudget
// hangen (zie `docs/budgetplan-templates-voorstel.md`). Wordt gebruikt door:
//   · `components/app/app-setup/configs/budgetteren.config.tsx`
//     (sectie 2 van de Budgetteren-setup-gate)
//   · `components/app/budget-plan-editor-sheet.tsx` (template-picker
//     binnen de bestaande plan-editor)
//   · `app/api/budgetteren/setup/route.ts` (server-seed via `buildTemplateSeed`)
//
// Verplaatst (mei 2026) uit `components/onboarding/onboarding-budgets.tsx`
// om hergebruik mogelijk te maken zonder dat de oude onboarding-component
// (die niet meer in de stappenvolgorde zit) moet blijven bestaan.

import type { ComponentType } from 'react'
import { Minus, List, ListTree, type LucideProps } from 'lucide-react'
import {
  BUDGET_SLUGS,
  BUDGET_PARENT_META,
  getDefaultBudgets,
  leafSeed,
  parentSeed,
  type SeedBudget,
} from '@/lib/budget-data'

export type BudgetTemplateId = 'minimalistisch' | 'nibud' | 'uitgebreid'

export interface TemplateCategory {
  /** Canonieke hoofdbudget-slug (uit BUDGET_SLUGS) waar deze categorie op landt. */
  parentSlug: string
  /** Canonieke hoofdbudget-naam (uit BUDGET_PARENT_META) voor previews. */
  label: string
  /** Emoji voor de picker-previews. */
  icon: string
  /** Leaf-slugs onder dit hoofdbudget. Leeg = transacties direct op het hoofdbudget. */
  slugs: string[]
}

export interface BudgetTemplate {
  id: BudgetTemplateId
  name: string
  subtitle: string
  description: string
  icon: ComponentType<LucideProps>
  categories: TemplateCategory[]
}

const S = BUDGET_SLUGS

/** Korte helper: canonieke hoofdbudget-naam (zodat alle templates gelijk labelen). */
function parentLabel(slug: string): string {
  return BUDGET_PARENT_META[slug].name
}

// ── Template 1: Minimalistisch ───────────────────────────────
// Vijf bestedings-potjes; transacties boeken direct op het hoofdbudget
// (lege `slugs`). Sparen splitst wél in noodbuffer + investeren.
const MINIMALISTISCH_CATEGORIES: TemplateCategory[] = [
  { parentSlug: S.VASTE_LASTEN_WONEN, label: parentLabel(S.VASTE_LASTEN_WONEN), icon: '🏠', slugs: [] },
  { parentSlug: S.DAGELIJKSE_UITGAVEN, label: parentLabel(S.DAGELIJKSE_UITGAVEN), icon: '🛒', slugs: [] },
  { parentSlug: S.VERVOER, label: parentLabel(S.VERVOER), icon: '🚗', slugs: [] },
  { parentSlug: S.LEUKE_DINGEN, label: parentLabel(S.LEUKE_DINGEN), icon: '🎯', slugs: [] },
  { parentSlug: S.SPAREN_SCHULDEN, label: parentLabel(S.SPAREN_SCHULDEN), icon: '💰', slugs: [S.SPAREN_NOODBUFFER, S.INVESTEREN_FIRE] },
]

// ── Template 2: Nibud-standaard ─────────────────────────────
// Het Nibud-huishoudboekje: herkenbare potjes onder elk hoofdbudget.
const NIBUD_CATEGORIES: TemplateCategory[] = [
  {
    parentSlug: S.VASTE_LASTEN_WONEN, label: parentLabel(S.VASTE_LASTEN_WONEN), icon: '🏠',
    slugs: [S.HUUR_HYPOTHEEK, S.GAS_WATER_LICHT, S.VERZEKERINGEN_WONEN, S.GEMEENTELIJKE_LASTEN, S.TELEFOON_INTERNET_TV, S.ABONNEMENTEN_CONTRIBUTIES],
  },
  {
    parentSlug: S.DAGELIJKSE_UITGAVEN, label: parentLabel(S.DAGELIJKSE_UITGAVEN), icon: '🛒',
    slugs: [S.BOODSCHAPPEN, S.HUISHOUDEN_VERZORGING, S.KINDEREN_SCHOOL, S.MEDISCHE_KOSTEN],
  },
  {
    parentSlug: S.VERVOER, label: parentLabel(S.VERVOER), icon: '🚗',
    slugs: [S.BRANDSTOF_OV, S.AUTO_VASTE_LASTEN, S.AUTO_ONDERHOUD, S.FIETS_DEELVERVOER],
  },
  {
    parentSlug: S.LEUKE_DINGEN, label: parentLabel(S.LEUKE_DINGEN), icon: '🎉',
    slugs: [S.UIT_ETEN_HORECA, S.VRIJE_TIJD_SPORT, S.VAKANTIE, S.KLEDING_OVERIGE],
  },
  {
    parentSlug: S.SPAREN_SCHULDEN, label: parentLabel(S.SPAREN_SCHULDEN), icon: '🏦',
    slugs: [S.SPAREN_NOODBUFFER, S.INVESTEREN_FIRE],
  },
  {
    parentSlug: S.SCHULDEN_AFLOSSINGEN_PARENT, label: parentLabel(S.SCHULDEN_AFLOSSINGEN_PARENT), icon: '💳',
    slugs: [S.SCHULDEN_AFLOSSINGEN, S.EXTRA_AFLOSSING_HYPOTHEEK],
  },
]

// ── Template 3: Uitgebreid ──────────────────────────────────
// Zelfde structuur als Nibud, plus de reserverings- en detailpotjes.
const UITGEBREID_CATEGORIES: TemplateCategory[] = [
  {
    parentSlug: S.VASTE_LASTEN_WONEN, label: parentLabel(S.VASTE_LASTEN_WONEN), icon: '🏠',
    slugs: [
      S.HUUR_HYPOTHEEK, S.GAS_WATER_LICHT, S.VERZEKERINGEN_WONEN, S.GEMEENTELIJKE_LASTEN,
      S.TELEFOON_INTERNET_TV, S.ABONNEMENTEN_CONTRIBUTIES, S.ONDERHOUD_HUIS_TUIN, S.INVENTARIS_APPARATEN,
    ],
  },
  {
    parentSlug: S.DAGELIJKSE_UITGAVEN, label: parentLabel(S.DAGELIJKSE_UITGAVEN), icon: '🛒',
    slugs: [S.BOODSCHAPPEN, S.HUISHOUDEN_VERZORGING, S.KINDEREN_SCHOOL, S.MEDISCHE_KOSTEN, S.HUISDIEREN],
  },
  {
    parentSlug: S.VERVOER, label: parentLabel(S.VERVOER), icon: '🚗',
    slugs: [S.BRANDSTOF_OV, S.AUTO_VASTE_LASTEN, S.AUTO_ONDERHOUD, S.FIETS_DEELVERVOER],
  },
  {
    parentSlug: S.LEUKE_DINGEN, label: parentLabel(S.LEUKE_DINGEN), icon: '🎉',
    slugs: [S.UIT_ETEN_HORECA, S.VRIJE_TIJD_SPORT, S.VAKANTIE, S.KLEDING_OVERIGE, S.CADEAUS_FEESTDAGEN],
  },
  {
    parentSlug: S.SPAREN_SCHULDEN, label: parentLabel(S.SPAREN_SCHULDEN), icon: '🏦',
    slugs: [S.SPAREN_NOODBUFFER, S.INVESTEREN_FIRE],
  },
  {
    parentSlug: S.SCHULDEN_AFLOSSINGEN_PARENT, label: parentLabel(S.SCHULDEN_AFLOSSINGEN_PARENT), icon: '💳',
    slugs: [S.SCHULDEN_AFLOSSINGEN, S.EXTRA_AFLOSSING_HYPOTHEEK],
  },
]

// ── Template definities ──────────────────────────────────────

export const BUDGET_TEMPLATES: BudgetTemplate[] = [
  {
    id: 'minimalistisch',
    name: 'Minimalistisch',
    subtitle: '5 potjes',
    description: 'Vijf potjes, klaar. Je boekt direct op de hoofdbudgetten — overzicht zonder details.',
    icon: Minus,
    categories: MINIMALISTISCH_CATEGORIES,
  },
  {
    id: 'nibud',
    name: 'Nibud-standaard',
    subtitle: '6 hoofdbudgetten · 22 potjes',
    description: 'Het Nibud-huishoudboekje: herkenbare potjes voor elk Nederlands huishouden.',
    icon: List,
    categories: NIBUD_CATEGORIES,
  },
  {
    id: 'uitgebreid',
    name: 'Uitgebreid',
    subtitle: '6 hoofdbudgetten · 26 potjes',
    description: 'Maximaal inzicht: elk potje apart, inclusief reserveringen voor onregelmatige kosten.',
    icon: ListTree,
    categories: UITGEBREID_CATEGORIES,
  },
]

// ── Allocatie-percentages per template ───────────────────────

/**
 * Verdeel een netto-maandinkomen over budget-slugs volgens een
 * percentage-mapping. Rounding-rest gaat naar de slug met de grootste
 * allocatie, zodat het totaal exact `netIncome` bedraagt.
 *
 * Het resultaat bevat de income-keys (salaris-uitkering = netIncome, overige
 * income 0) plus uitsluitend de slugs die in `alloc` voorkomen — dus zowel
 * leaf-slugs (Nibud/Uitgebreid) als parent-slugs (Minimalistisch boekt op het
 * hoofdbudget).
 */
function distributeIncome(
  netIncome: number,
  alloc: Record<string, number>,
): Record<string, number> {
  const result: Record<string, number> = {
    [S.SALARIS_UITKERING]: netIncome,
    [S.TOESLAGEN_KINDERBIJSLAG]: 0,
    [S.TERUGGAVE_BELASTING]: 0,
    [S.OVERIGE_INKOMSTEN]: 0,
  }

  // Alle geallokeerde slugs eerst op 0 zetten, dan invullen — zo zit elke
  // slug uit `alloc` zeker in het resultaat (ook bij netIncome 0).
  for (const slug of Object.keys(alloc)) {
    result[slug] = 0
  }

  let total = 0
  let largestSlug = ''
  let largestAmount = -1
  for (const [slug, pct] of Object.entries(alloc)) {
    const amt = Math.round(netIncome * pct)
    result[slug] = amt
    total += amt
    if (amt > largestAmount) {
      largestAmount = amt
      largestSlug = slug
    }
  }

  const diff = netIncome - total
  if (diff !== 0 && largestSlug) {
    result[largestSlug] += diff
  }

  return result
}

// Allocaties (% van netto-maandinkomen). Elk template telt exact op tot 100%.

/** Minimalistisch: allocatie op PARENT-niveau (transacties boeken op hoofdbudget). */
const MINIMALISTISCH_ALLOC: Record<string, number> = {
  [S.VASTE_LASTEN_WONEN]: 0.38,
  [S.DAGELIJKSE_UITGAVEN]: 0.17,
  [S.VERVOER]: 0.07,
  [S.LEUKE_DINGEN]: 0.13,
  [S.SPAREN_NOODBUFFER]: 0.10,
  [S.INVESTEREN_FIRE]: 0.15,
}

/** Nibud-standaard: allocatie op LEAF-niveau. */
const NIBUD_ALLOC: Record<string, number> = {
  [S.HUUR_HYPOTHEEK]: 0.24,
  [S.GAS_WATER_LICHT]: 0.05,
  [S.VERZEKERINGEN_WONEN]: 0.04,
  [S.GEMEENTELIJKE_LASTEN]: 0.02,
  [S.TELEFOON_INTERNET_TV]: 0.02,
  [S.ABONNEMENTEN_CONTRIBUTIES]: 0.01,
  [S.BOODSCHAPPEN]: 0.12,
  [S.HUISHOUDEN_VERZORGING]: 0.02,
  [S.KINDEREN_SCHOOL]: 0.02,
  [S.MEDISCHE_KOSTEN]: 0.02,
  [S.BRANDSTOF_OV]: 0.04,
  [S.AUTO_VASTE_LASTEN]: 0.03,
  [S.AUTO_ONDERHOUD]: 0.02,
  [S.FIETS_DEELVERVOER]: 0.01,
  [S.UIT_ETEN_HORECA]: 0.03,
  [S.VRIJE_TIJD_SPORT]: 0.03,
  [S.VAKANTIE]: 0.03,
  [S.KLEDING_OVERIGE]: 0.03,
  [S.SPAREN_NOODBUFFER]: 0.07,
  [S.INVESTEREN_FIRE]: 0.10,
  [S.SCHULDEN_AFLOSSINGEN]: 0.03,
  [S.EXTRA_AFLOSSING_HYPOTHEEK]: 0.02,
}

/** Uitgebreid: allocatie op LEAF-niveau, inclusief de reserverings-potjes. */
const UITGEBREID_ALLOC: Record<string, number> = {
  [S.HUUR_HYPOTHEEK]: 0.23,
  [S.GAS_WATER_LICHT]: 0.04,
  [S.VERZEKERINGEN_WONEN]: 0.04,
  [S.GEMEENTELIJKE_LASTEN]: 0.02,
  [S.TELEFOON_INTERNET_TV]: 0.02,
  [S.ABONNEMENTEN_CONTRIBUTIES]: 0.01,
  [S.ONDERHOUD_HUIS_TUIN]: 0.02,
  [S.INVENTARIS_APPARATEN]: 0.01,
  [S.BOODSCHAPPEN]: 0.11,
  [S.HUISHOUDEN_VERZORGING]: 0.02,
  [S.KINDEREN_SCHOOL]: 0.02,
  [S.MEDISCHE_KOSTEN]: 0.02,
  [S.HUISDIEREN]: 0.01,
  [S.BRANDSTOF_OV]: 0.03,
  [S.AUTO_VASTE_LASTEN]: 0.03,
  [S.AUTO_ONDERHOUD]: 0.02,
  [S.FIETS_DEELVERVOER]: 0.01,
  [S.UIT_ETEN_HORECA]: 0.03,
  [S.VRIJE_TIJD_SPORT]: 0.03,
  [S.VAKANTIE]: 0.03,
  [S.KLEDING_OVERIGE]: 0.03,
  [S.CADEAUS_FEESTDAGEN]: 0.01,
  [S.SPAREN_NOODBUFFER]: 0.06,
  [S.INVESTEREN_FIRE]: 0.10,
  [S.SCHULDEN_AFLOSSINGEN]: 0.03,
  [S.EXTRA_AFLOSSING_HYPOTHEEK]: 0.02,
}

const TEMPLATE_ALLOC: Record<BudgetTemplateId, Record<string, number>> = {
  minimalistisch: MINIMALISTISCH_ALLOC,
  nibud: NIBUD_ALLOC,
  uitgebreid: UITGEBREID_ALLOC,
}

/**
 * Retourneert de procentuele allocatie-amounts voor een template — income-keys
 * plus de geallokeerde bestedings-slugs (parent- of leaf-niveau, afhankelijk
 * van het template). Behouden als export omdat regressiesuites het importeren.
 */
export function buildTemplateAmounts(
  netIncome: number,
  templateId: BudgetTemplateId,
): Record<string, number> {
  return distributeIncome(netIncome, TEMPLATE_ALLOC[templateId])
}

// ── Gedeelde hiërarchische seed-builder ──────────────────────

/**
 * Bouw de volledige hiërarchische budget-seed voor een template. Eén bron voor
 * zowel de setup-route als (in fase B) de plan-editor:
 *
 *  · Alle 8 canonieke hoofdbudgetten in canonieke sort_order (meta uit
 *    `BUDGET_PARENT_META`), zodat de structuur ongeacht template gelijk is.
 *  · Inkomen: bij minimalistisch alleen `salaris-uitkering` (= netIncome); bij
 *    nibud/uitgebreid alle 4 income-children (salaris = netIncome, rest 0).
 *  · Per template-categorie: children = de leaf-slugs met meta uit de catalogus
 *    en `default_limit` = de allocatie-amount; het hoofdbudget krijgt de som van
 *    zijn children. Een categorie zónder slugs (minimalistisch) levert een
 *    childless hoofdbudget met `default_limit` = de parent-allocatie.
 *  · Hoofdbudgetten zónder categorie in dit template (bv. Schulden bij
 *    minimalistisch) worden wél aangemaakt op €0 zonder children.
 *  · Eigen rekening blijft altijd canoniek (archive parent + 1 child, €0).
 */
export function buildTemplateSeed(
  templateId: BudgetTemplateId,
  netIncome: number,
): SeedBudget[] {
  const amounts = buildTemplateAmounts(netIncome, templateId)
  const tpl = BUDGET_TEMPLATES.find((t) => t.id === templateId)
  if (!tpl) throw new Error(`Onbekend template: ${templateId}`)

  // Snel opzoeken welke categorie een hoofdbudget vult (per parentSlug).
  const categoryByParent = new Map<string, TemplateCategory>()
  for (const cat of tpl.categories) {
    categoryByParent.set(cat.parentSlug, cat)
  }

  // Canonieke parent-volgorde uit BUDGET_PARENT_META (op sort_order).
  const parentSlugsInOrder = Object.keys(BUDGET_PARENT_META).sort(
    (a, b) => BUDGET_PARENT_META[a].sort_order - BUDGET_PARENT_META[b].sort_order,
  )

  const seed: SeedBudget[] = []

  for (const parentSlug of parentSlugsInOrder) {
    // ── Inkomen ────────────────────────────────────────────────
    if (parentSlug === S.INKOMEN) {
      const incomeChildren =
        templateId === 'minimalistisch'
          ? [leafSeed(S.SALARIS_UITKERING, netIncome)]
          : [
              leafSeed(S.SALARIS_UITKERING, netIncome),
              leafSeed(S.TOESLAGEN_KINDERBIJSLAG, 0),
              leafSeed(S.TERUGGAVE_BELASTING, 0),
              leafSeed(S.OVERIGE_INKOMSTEN, 0),
            ]
      seed.push({
        ...parentSeed(S.INKOMEN, netIncome),
        children: incomeChildren,
      })
      continue
    }

    // ── Eigen rekening (archive) — altijd canoniek ─────────────
    if (parentSlug === S.EIGEN_REKENING) {
      seed.push({
        ...parentSeed(S.EIGEN_REKENING, 0),
        children: [leafSeed(S.EIGEN_REKENING_SUB, 0)],
      })
      continue
    }

    // ── Bestedings-hoofdbudgetten ──────────────────────────────
    const cat = categoryByParent.get(parentSlug)
    if (!cat) {
      // Geen categorie in dit template → hoofdbudget op €0, geen children.
      seed.push(parentSeed(parentSlug, 0))
      continue
    }

    if (cat.slugs.length === 0) {
      // Transacties boeken direct op het hoofdbudget: parent-allocatie, geen children.
      seed.push(parentSeed(parentSlug, amounts[parentSlug] ?? 0))
      continue
    }

    // Children uit de leaf-slugs; parent = som van children.
    const children = cat.slugs.map((slug) => leafSeed(slug, amounts[slug] ?? 0))
    const childSum = children.reduce((sum, c) => sum + c.default_limit, 0)
    seed.push({
      ...parentSeed(parentSlug, childSum),
      children,
    })
  }

  return seed
}

// Re-export voor consumers die de canonieke fallback-seed nodig hebben.
export { getDefaultBudgets }
