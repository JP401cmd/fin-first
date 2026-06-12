import { describe, it, expect } from 'vitest'
import {
  BUDGET_TEMPLATES,
  buildTemplateAmounts,
  buildTemplateSeed,
  type BudgetTemplateId,
} from './onboarding-presets'
import { BUDGET_SLUGS, BUDGET_LEAF_META, BUDGET_PARENT_META } from '@/lib/budget-data'

const TEMPLATE_IDS: BudgetTemplateId[] = ['minimalistisch', 'nibud', 'uitgebreid']
const INCOME_KEYS = [
  BUDGET_SLUGS.SALARIS_UITKERING,
  BUDGET_SLUGS.TOESLAGEN_KINDERBIJSLAG,
  BUDGET_SLUGS.TERUGGAVE_BELASTING,
  BUDGET_SLUGS.OVERIGE_INKOMSTEN,
]
const ARCHIVE_PARENT = BUDGET_SLUGS.EIGEN_REKENING
const INCOME_PARENT = BUDGET_SLUGS.INKOMEN

// Sum of allocated (= bestedings-) amounts: everything except the income keys.
function allocatedSum(amounts: Record<string, number>): number {
  return Object.entries(amounts)
    .filter(([slug]) => !INCOME_KEYS.includes(slug as never))
    .reduce((n, [, v]) => n + v, 0)
}

describe('buildTemplateAmounts — allocaties sommeren naar netIncome', () => {
  // (1) Per template moet de allocatie exact het netto-inkomen opmaken.
  for (const income of [3000, 2347]) {
    for (const id of TEMPLATE_IDS) {
      it(`${id} @ €${income}: bestedingen sommeren exact naar netIncome`, () => {
        const amounts = buildTemplateAmounts(income, id)
        expect(amounts[BUDGET_SLUGS.SALARIS_UITKERING]).toBe(income)
        expect(allocatedSum(amounts)).toBe(income)
      })
    }
  }

  it('alle amounts zijn niet-negatieve gehele getallen', () => {
    for (const id of TEMPLATE_IDS) {
      const amounts = buildTemplateAmounts(2347, id)
      for (const [slug, amt] of Object.entries(amounts)) {
        expect(amt, `${id}/${slug} ≥ 0`).toBeGreaterThanOrEqual(0)
        expect(amt, `${id}/${slug} afgerond`).toBe(Math.round(amt))
      }
    }
  })
})

describe('Template-categorieën — slug-uniciteit en catalogus-dekking', () => {
  // (2) Geen enkele slug mag binnen één template in twee categorieën zitten.
  it('geen slug komt binnen een template in twee categorieën voor', () => {
    for (const tpl of BUDGET_TEMPLATES) {
      const seen = new Set<string>()
      for (const cat of tpl.categories) {
        for (const slug of cat.slugs) {
          expect(seen.has(slug), `${tpl.id}: '${slug}' dubbel`).toBe(false)
          seen.add(slug)
        }
      }
    }
  })

  // (3) Alle template-slugs bestaan in BUDGET_SLUGS én BUDGET_LEAF_META.
  it('alle template-slugs bestaan in BUDGET_SLUGS en BUDGET_LEAF_META', () => {
    const knownSlugs = new Set<string>(Object.values(BUDGET_SLUGS))
    for (const tpl of BUDGET_TEMPLATES) {
      for (const cat of tpl.categories) {
        expect(knownSlugs.has(cat.parentSlug), `${tpl.id}: parent '${cat.parentSlug}' onbekend`).toBe(true)
        expect(BUDGET_PARENT_META[cat.parentSlug], `${tpl.id}: parent-meta '${cat.parentSlug}'`).toBeDefined()
        for (const slug of cat.slugs) {
          expect(knownSlugs.has(slug), `${tpl.id}: '${slug}' niet in BUDGET_SLUGS`).toBe(true)
          expect(BUDGET_LEAF_META[slug], `${tpl.id}: '${slug}' niet in BUDGET_LEAF_META`).toBeDefined()
          // De leaf moet onder de juiste parent hangen.
          expect(BUDGET_LEAF_META[slug].parentSlug, `${tpl.id}: '${slug}' onder verkeerde parent`).toBe(cat.parentSlug)
        }
      }
    }
  })

  it('labels matchen de canonieke parent-namen', () => {
    for (const tpl of BUDGET_TEMPLATES) {
      for (const cat of tpl.categories) {
        expect(cat.label).toBe(BUDGET_PARENT_META[cat.parentSlug].name)
      }
    }
  })
})

describe('buildTemplateSeed — hiërarchische structuur', () => {
  const NET = 3000

  // (4) Elk template heeft exact 1 Vervoer-parent; nibud/uitgebreid met 4 children.
  it('elk template heeft exact één Vervoer-hoofdbudget', () => {
    for (const id of TEMPLATE_IDS) {
      const seed = buildTemplateSeed(id, NET)
      const vervoer = seed.filter((p) => p.slug === BUDGET_SLUGS.VERVOER)
      expect(vervoer.length, `${id}: één Vervoer-parent`).toBe(1)
    }
  })

  it('nibud/uitgebreid: 4 vervoer-slugs hangen als children onder Vervoer', () => {
    const vervoerLeaves = [
      BUDGET_SLUGS.BRANDSTOF_OV,
      BUDGET_SLUGS.AUTO_VASTE_LASTEN,
      BUDGET_SLUGS.AUTO_ONDERHOUD,
      BUDGET_SLUGS.FIETS_DEELVERVOER,
    ]
    for (const id of ['nibud', 'uitgebreid'] as BudgetTemplateId[]) {
      const seed = buildTemplateSeed(id, NET)
      const vervoer = seed.find((p) => p.slug === BUDGET_SLUGS.VERVOER)!
      const childSlugs = (vervoer.children ?? []).map((c) => c.slug)
      expect(childSlugs.sort()).toEqual([...vervoerLeaves].sort())
    }
  })

  // (5) Minimalistisch: vaste-lasten-wonen childless en limit > 0.
  it('minimalistisch: Vaste lasten heeft géén children en limit > 0', () => {
    const seed = buildTemplateSeed('minimalistisch', NET)
    const wonen = seed.find((p) => p.slug === BUDGET_SLUGS.VASTE_LASTEN_WONEN)!
    expect(wonen.children ?? []).toHaveLength(0)
    expect(wonen.default_limit).toBeGreaterThan(0)
  })

  // (6) Som van parent default_limits (excl. income/archive) = netIncome.
  it('som van parent-limits (excl. inkomen + eigen rekening) = netIncome', () => {
    for (const income of [3000, 2347]) {
      for (const id of TEMPLATE_IDS) {
        const seed = buildTemplateSeed(id, income)
        const sum = seed
          .filter((p) => p.slug !== INCOME_PARENT && p.slug !== ARCHIVE_PARENT)
          .reduce((n, p) => n + p.default_limit, 0)
        expect(sum, `${id} @ €${income}`).toBe(income)
      }
    }
  })

  it('alle 8 canonieke hoofdbudgetten zitten in elke seed, in sort_order', () => {
    const expectedOrder = Object.keys(BUDGET_PARENT_META).sort(
      (a, b) => BUDGET_PARENT_META[a].sort_order - BUDGET_PARENT_META[b].sort_order,
    )
    for (const id of TEMPLATE_IDS) {
      const seed = buildTemplateSeed(id, NET)
      expect(seed.map((p) => p.slug)).toEqual(expectedOrder)
    }
  })

  it('minimalistisch: inkomen heeft 1 child; nibud/uitgebreid: 4 children', () => {
    const mini = buildTemplateSeed('minimalistisch', NET)
    const miniIncome = mini.find((p) => p.slug === INCOME_PARENT)!
    expect(miniIncome.children ?? []).toHaveLength(1)
    expect(miniIncome.default_limit).toBe(NET)

    for (const id of ['nibud', 'uitgebreid'] as BudgetTemplateId[]) {
      const seed = buildTemplateSeed(id, NET)
      const income = seed.find((p) => p.slug === INCOME_PARENT)!
      expect(income.children ?? [], id).toHaveLength(4)
      expect(income.children![0].default_limit).toBe(NET)
    }
  })

  it('eigen rekening blijft canoniek: archive parent + 1 child, €0', () => {
    for (const id of TEMPLATE_IDS) {
      const seed = buildTemplateSeed(id, NET)
      const er = seed.find((p) => p.slug === ARCHIVE_PARENT)!
      expect(er.budget_type).toBe('archive')
      expect(er.default_limit).toBe(0)
      expect(er.children ?? []).toHaveLength(1)
      expect(er.children![0].slug).toBe(BUDGET_SLUGS.EIGEN_REKENING_SUB)
    }
  })

  it('minimalistisch: Schulden-hoofdbudget aangemaakt op €0 zonder children', () => {
    const seed = buildTemplateSeed('minimalistisch', NET)
    const schulden = seed.find((p) => p.slug === BUDGET_SLUGS.SCHULDEN_AFLOSSINGEN_PARENT)!
    expect(schulden.default_limit).toBe(0)
    expect(schulden.children ?? []).toHaveLength(0)
  })

  // (7) Uitgebreid bevat de 6 nieuwe potjes-slugs onder de juiste parents.
  it('uitgebreid bevat de 6 nieuwe slugs onder de juiste hoofdbudgetten', () => {
    const seed = buildTemplateSeed('uitgebreid', NET)
    const childrenBy = (parentSlug: string) =>
      (seed.find((p) => p.slug === parentSlug)?.children ?? []).map((c) => c.slug)

    const wonen = childrenBy(BUDGET_SLUGS.VASTE_LASTEN_WONEN)
    expect(wonen).toContain(BUDGET_SLUGS.TELEFOON_INTERNET_TV)
    expect(wonen).toContain(BUDGET_SLUGS.ABONNEMENTEN_CONTRIBUTIES)
    expect(wonen).toContain(BUDGET_SLUGS.ONDERHOUD_HUIS_TUIN)
    expect(wonen).toContain(BUDGET_SLUGS.INVENTARIS_APPARATEN)

    const dagelijks = childrenBy(BUDGET_SLUGS.DAGELIJKSE_UITGAVEN)
    expect(dagelijks).toContain(BUDGET_SLUGS.HUISDIEREN)

    const leuk = childrenBy(BUDGET_SLUGS.LEUKE_DINGEN)
    expect(leuk).toContain(BUDGET_SLUGS.CADEAUS_FEESTDAGEN)
  })

  it('parent-limit = som van children (waar children bestaan)', () => {
    for (const id of TEMPLATE_IDS) {
      const seed = buildTemplateSeed(id, 2347)
      for (const parent of seed) {
        if (parent.slug === ARCHIVE_PARENT || parent.slug === INCOME_PARENT) continue
        const kids = parent.children ?? []
        if (kids.length === 0) continue
        const childSum = kids.reduce((n, c) => n + c.default_limit, 0)
        expect(parent.default_limit, `${id}/${parent.slug}`).toBe(childSum)
      }
    }
  })
})
