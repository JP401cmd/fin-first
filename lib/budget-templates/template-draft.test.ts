import { describe, it, expect } from 'vitest'
import { BUDGET_SLUGS, BUDGET_LEAF_META, BUDGET_PARENT_META } from '@/lib/budget-data'
import { BUDGET_TEMPLATES } from '@/lib/budget-templates/onboarding-presets'
import { computeBudgetPlanDiff } from '@/lib/budget-plan-diff'
import {
  buildEmptyDraft,
  buildTemplateDraft,
  computeTeVerdelen,
  ensureEigenRekening,
  isProtectedBudget,
} from './template-draft'

const S = BUDGET_SLUGS

describe('buildEmptyDraft', () => {
  it('bevat alleen Eigen rekening (hoofd- en deelbudget)', () => {
    const draft = buildEmptyDraft()
    expect(draft.map((r) => r.slug)).toEqual([S.EIGEN_REKENING, S.EIGEN_REKENING_SUB])
    const [parent, sub] = draft
    expect(parent.parentId).toBeNull()
    expect(parent.budgetType).toBe('archive')
    expect(parent.name).toBe(BUDGET_PARENT_META[S.EIGEN_REKENING].name)
    expect(parent.icon).toBe(BUDGET_PARENT_META[S.EIGEN_REKENING].icon)
    expect(sub.parentId).toBe(parent.id)
    expect(sub.budgetType).toBe('archive')
    expect(sub.description).toBe(BUDGET_LEAF_META[S.EIGEN_REKENING_SUB].description)
  })
})

describe('ensureEigenRekening', () => {
  it('is idempotent', () => {
    const once = ensureEigenRekening([])
    const twice = ensureEigenRekening(once)
    expect(twice).toBe(once)
    expect(twice.filter(isProtectedBudget)).toHaveLength(2)
  })

  it('voegt alleen het deelbudget toe als het hoofdbudget er al is', () => {
    const [parent] = buildEmptyDraft()
    const result = ensureEigenRekening([parent])
    expect(result).toHaveLength(2)
    expect(result[0]).toBe(parent)
    expect(result[1].slug).toBe(S.EIGEN_REKENING_SUB)
    expect(result[1].parentId).toBe(parent.id)
  })

  it('hangt een los deelbudget onder een nieuw hoofdbudget', () => {
    const [, sub] = buildEmptyDraft()
    const result = ensureEigenRekening([{ ...sub, parentId: null }])
    const parent = result.find((r) => r.slug === S.EIGEN_REKENING)!
    expect(result).toHaveLength(2)
    expect(result.find((r) => r.slug === S.EIGEN_REKENING_SUB)!.parentId).toBe(parent.id)
  })
})

describe('buildTemplateDraft', () => {
  it.each(BUDGET_TEMPLATES.map((t) => t.id))('%s bevat Eigen rekening precies één keer', (id) => {
    const draft = buildTemplateDraft(id, 3000)
    expect(draft.filter((r) => r.slug === S.EIGEN_REKENING)).toHaveLength(1)
    expect(draft.filter((r) => r.slug === S.EIGEN_REKENING_SUB)).toHaveLength(1)
  })

  it('levert een diff tegen een leeg plan waarin Eigen rekening wordt ingevoegd', () => {
    const diff = computeBudgetPlanDiff([], buildTemplateDraft('nibud', 3000), [], '2026-09-01')
    const slugs = diff.to_insert.map((r) => r.slug)
    expect(slugs).toContain(S.EIGEN_REKENING)
    expect(slugs).toContain(S.EIGEN_REKENING_SUB)
    expect(diff.to_delete).toEqual([])
  })
})

describe('isProtectedBudget', () => {
  it('herkent alleen de twee Eigen-rekening-slugs', () => {
    expect(isProtectedBudget({ slug: S.EIGEN_REKENING })).toBe(true)
    expect(isProtectedBudget({ slug: S.EIGEN_REKENING_SUB })).toBe(true)
    expect(isProtectedBudget({ slug: S.BOODSCHAPPEN })).toBe(false)
    expect(isProtectedBudget({ slug: null })).toBe(false)
  })
})

describe('computeTeVerdelen', () => {
  it('template verdeelt het hele inkomen: niets meer te verdelen', () => {
    for (const tpl of BUDGET_TEMPLATES) {
      expect(computeTeVerdelen(buildTemplateDraft(tpl.id, 3000), 0).teVerdelen).toBe(0)
    }
  })

  it('leeg plan valt terug op het meegegeven inkomen', () => {
    expect(computeTeVerdelen(buildEmptyDraft(), 2500).teVerdelen).toBe(2500)
  })
})
