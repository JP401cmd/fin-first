// lib/budget-merge.test.ts
//
// Dekt de pure merge-laag: kandidaat-detectie (incl. kind-zonder-ouder-match),
// canonical-default op txCount, kant-erving voor kinderen, en validatie per regel.

import { describe, it, expect } from 'vitest'
import {
  detectMergeCandidates,
  buildMergeMapping,
  validateMergeMapping,
  type BudgetLike,
  type MergePair,
} from './budget-merge'

// ── Helpers ──────────────────────────────────────────────────────────

let seq = 0
function bud(over: Partial<BudgetLike> = {}): BudgetLike {
  seq += 1
  return {
    id: over.id ?? `b${seq}`,
    user_id: over.user_id ?? 'me',
    parent_id: over.parent_id ?? null,
    name: over.name ?? `Budget ${seq}`,
    slug: over.slug ?? `slug-${seq}`,
    budget_type: over.budget_type ?? 'expense',
    ownership: over.ownership,
    is_archived: over.is_archived,
    merged_into: over.merged_into,
    default_limit: over.default_limit,
    icon: over.icon,
  }
}

// ── detectMergeCandidates ────────────────────────────────────────────

describe('detectMergeCandidates', () => {
  it('koppelt root-budgetten op slug + budget_type', () => {
    const own = [bud({ id: 'o1', slug: 'boodschappen', budget_type: 'expense', user_id: 'me' })]
    const partner = [bud({ id: 'p1', slug: 'boodschappen', budget_type: 'expense', user_id: 'partner' })]

    const candidates = detectMergeCandidates(own, partner)
    expect(candidates).toHaveLength(1)
    expect(candidates[0].canonical.id).toBe('o1')
    expect(candidates[0].duplicate.id).toBe('p1')
  })

  it('matcht NIET wanneer slug verschilt', () => {
    const own = [bud({ slug: 'boodschappen' })]
    const partner = [bud({ slug: 'auto', user_id: 'partner' })]
    expect(detectMergeCandidates(own, partner)).toHaveLength(0)
  })

  it('matcht NIET wanneer budget_type verschilt', () => {
    const own = [bud({ slug: 'vakantie', budget_type: 'expense' })]
    const partner = [bud({ slug: 'vakantie', budget_type: 'savings', user_id: 'partner' })]
    expect(detectMergeCandidates(own, partner)).toHaveLength(0)
  })

  it('sluit income- en archive-budgetten uit', () => {
    const own = [
      bud({ slug: 'salaris', budget_type: 'income' }),
      bud({ slug: 'oud', budget_type: 'archive' }),
    ]
    const partner = [
      bud({ slug: 'salaris', budget_type: 'income', user_id: 'partner' }),
      bud({ slug: 'oud', budget_type: 'archive', user_id: 'partner' }),
    ]
    expect(detectMergeCandidates(own, partner)).toHaveLength(0)
  })

  it('sluit gearchiveerde, gemergede en slug-loze budgetten uit', () => {
    const own = [
      bud({ slug: 'a', is_archived: true }),
      bud({ slug: 'b', merged_into: 'x' }),
      bud({ slug: null }),
    ]
    const partner = [
      bud({ slug: 'a', user_id: 'partner' }),
      bud({ slug: 'b', user_id: 'partner' }),
      bud({ slug: null, user_id: 'partner' }),
    ]
    expect(detectMergeCandidates(own, partner)).toHaveLength(0)
  })

  it('koppelt een kind alleen wanneer de ouders ook matchen', () => {
    const ownParent = bud({ id: 'op', slug: 'wonen', parent_id: null })
    const ownChild = bud({ id: 'oc', slug: 'energie', parent_id: 'op' })
    const partnerParent = bud({ id: 'pp', slug: 'wonen', parent_id: null, user_id: 'partner' })
    const partnerChild = bud({ id: 'pc', slug: 'energie', parent_id: 'pp', user_id: 'partner' })

    const candidates = detectMergeCandidates([ownParent, ownChild], [partnerParent, partnerChild])
    expect(candidates).toHaveLength(2)
    // Ouder eerst, dan kind.
    expect(candidates[0].canonical.id).toBe('op')
    expect(candidates[1].canonical.id).toBe('oc')
  })

  it('koppelt een kind NIET wanneer de ouder niet matcht (kind-zonder-ouder-match)', () => {
    // Eigen ouder = 'wonen', partner ouder = 'huis' → ouders matchen niet.
    const ownParent = bud({ id: 'op', slug: 'wonen', parent_id: null })
    const ownChild = bud({ id: 'oc', slug: 'energie', parent_id: 'op' })
    const partnerParent = bud({ id: 'pp', slug: 'huis', parent_id: null, user_id: 'partner' })
    const partnerChild = bud({ id: 'pc', slug: 'energie', parent_id: 'pp', user_id: 'partner' })

    const candidates = detectMergeCandidates([ownParent, ownChild], [partnerParent, partnerChild])
    // Geen ouder-paar → ook geen kind-paar.
    expect(candidates).toHaveLength(0)
  })

  it('levert deterministische volgorde: ouders eerst, daarna kinderen, op slug', () => {
    const ownP1 = bud({ id: 'op1', slug: 'wonen', parent_id: null })
    const ownP2 = bud({ id: 'op2', slug: 'auto', parent_id: null })
    const ownC1 = bud({ id: 'oc1', slug: 'benzine', parent_id: 'op2' })
    const ownC2 = bud({ id: 'oc2', slug: 'energie', parent_id: 'op1' })
    const pP1 = bud({ id: 'pp1', slug: 'wonen', parent_id: null, user_id: 'partner' })
    const pP2 = bud({ id: 'pp2', slug: 'auto', parent_id: null, user_id: 'partner' })
    const pC1 = bud({ id: 'pc1', slug: 'benzine', parent_id: 'pp2', user_id: 'partner' })
    const pC2 = bud({ id: 'pc2', slug: 'energie', parent_id: 'pp1', user_id: 'partner' })

    const candidates = detectMergeCandidates(
      [ownP1, ownP2, ownC1, ownC2],
      [pP1, pP2, pC1, pC2],
    )
    const slugs = candidates.map((c) => c.canonical.slug)
    // Roots gesorteerd (auto, wonen), dan kinderen gesorteerd (benzine, energie).
    expect(slugs).toEqual(['auto', 'wonen', 'benzine', 'energie'])
  })
})

// ── buildMergeMapping ────────────────────────────────────────────────

describe('buildMergeMapping', () => {
  it('default canonical = de kant met de meeste transacties', () => {
    const own = bud({ id: 'o1', slug: 'boodschappen', user_id: 'me' })
    const partner = bud({ id: 'p1', slug: 'boodschappen', user_id: 'partner' })
    const mapping = buildMergeMapping([
      { canonical: own, duplicate: partner, txCountCanonical: 3, txCountDuplicate: 10 },
    ])
    // Partner heeft meer transacties → partner wordt canonical.
    expect(mapping[0]).toEqual({ canonical_budget_id: 'p1', duplicate_budget_id: 'o1' })
  })

  it('gelijkspel (of onbekend) → eigen kant wordt canonical', () => {
    const own = bud({ id: 'o1', slug: 'boodschappen', user_id: 'me' })
    const partner = bud({ id: 'p1', slug: 'boodschappen', user_id: 'partner' })

    const tie = buildMergeMapping([
      { canonical: own, duplicate: partner, txCountCanonical: 5, txCountDuplicate: 5 },
    ])
    expect(tie[0]).toEqual({ canonical_budget_id: 'o1', duplicate_budget_id: 'p1' })

    const unknown = buildMergeMapping([{ canonical: own, duplicate: partner }])
    expect(unknown[0]).toEqual({ canonical_budget_id: 'o1', duplicate_budget_id: 'p1' })
  })

  it('canonicalChoice overschrijft de default per root', () => {
    const own = bud({ id: 'o1', slug: 'boodschappen', user_id: 'me' })
    const partner = bud({ id: 'p1', slug: 'boodschappen', user_id: 'partner' })
    // Default zou own zijn (gelijkspel), maar we kiezen partner.
    const mapping = buildMergeMapping(
      [{ canonical: own, duplicate: partner, txCountCanonical: 9, txCountDuplicate: 1 }],
      { o1: 'partner' },
    )
    expect(mapping[0]).toEqual({ canonical_budget_id: 'p1', duplicate_budget_id: 'o1' })
  })

  it('kinderen erven de gekozen kant van hun ouder-paar', () => {
    const ownParent = bud({ id: 'op', slug: 'wonen', parent_id: null, user_id: 'me' })
    const ownChild = bud({ id: 'oc', slug: 'energie', parent_id: 'op', user_id: 'me' })
    const pParent = bud({ id: 'pp', slug: 'wonen', parent_id: null, user_id: 'partner' })
    const pChild = bud({ id: 'pc', slug: 'energie', parent_id: 'pp', user_id: 'partner' })

    const candidates = [
      { canonical: ownParent, duplicate: pParent },
      { canonical: ownChild, duplicate: pChild },
    ]
    // Kies de partnerkant voor de ouder → het kind moet dezelfde kant volgen.
    const mapping = buildMergeMapping(candidates, { op: 'partner' })

    const parentPair = mapping.find((p) => p.canonical_budget_id === 'pp' || p.duplicate_budget_id === 'pp')!
    const childPair = mapping.find((p) => p.canonical_budget_id === 'pc' || p.duplicate_budget_id === 'pc')!
    // Ouder: partner canonical.
    expect(parentPair).toEqual({ canonical_budget_id: 'pp', duplicate_budget_id: 'op' })
    // Kind volgt: partner canonical (genegeerd dat het kind ander txCount zou hebben).
    expect(childPair).toEqual({ canonical_budget_id: 'pc', duplicate_budget_id: 'oc' })
  })

  it('de canonical-ouder van de mapping bevat altijd de canonical van het kind', () => {
    const ownParent = bud({ id: 'op', slug: 'wonen', parent_id: null, user_id: 'me' })
    const ownChild = bud({ id: 'oc', slug: 'energie', parent_id: 'op', user_id: 'me' })
    const pParent = bud({ id: 'pp', slug: 'wonen', parent_id: null, user_id: 'partner' })
    const pChild = bud({ id: 'pc', slug: 'energie', parent_id: 'pp', user_id: 'partner' })

    const candidates = [
      { canonical: ownParent, duplicate: pParent },
      { canonical: ownChild, duplicate: pChild },
    ]
    // Default (eigen kant canonical).
    const mapping = buildMergeMapping(candidates)
    const all = [ownParent, ownChild, pParent, pChild]
    // De mapping moet de RPC-validatie doorstaan (ouder-paar aanwezig).
    expect(validateMergeMapping(mapping, all)).toEqual([])
  })
})

// ── validateMergeMapping ─────────────────────────────────────────────

describe('validateMergeMapping', () => {
  const baseOwn = bud({ id: 'o1', slug: 'boodschappen', budget_type: 'expense', user_id: 'me' })
  const basePartner = bud({ id: 'p1', slug: 'boodschappen', budget_type: 'expense', user_id: 'partner' })
  const validPair: MergePair = { canonical_budget_id: 'o1', duplicate_budget_id: 'p1' }

  it('geldige root-koppeling → geen fouten', () => {
    expect(validateMergeMapping([validPair], [baseOwn, basePartner])).toEqual([])
  })

  it('faalt wanneer een budget niet bestaat', () => {
    const errs = validateMergeMapping([{ canonical_budget_id: 'x', duplicate_budget_id: 'p1' }], [basePartner])
    expect(errs.some((e) => e.includes('bestaat niet'))).toBe(true)
  })

  it('faalt op een gearchiveerd budget', () => {
    const own = { ...baseOwn, is_archived: true }
    const errs = validateMergeMapping([validPair], [own, basePartner])
    expect(errs.some((e) => e.includes('Gearchiveerd'))).toBe(true)
  })

  it('faalt op een al-gemerged budget', () => {
    const partner = { ...basePartner, merged_into: 'zzz' }
    const errs = validateMergeMapping([validPair], [baseOwn, partner])
    expect(errs.some((e) => e.includes('al samengevoegd'))).toBe(true)
  })

  it('faalt wanneer beide budgetten dezelfde eigenaar hebben', () => {
    const partner = { ...basePartner, user_id: 'me' }
    const errs = validateMergeMapping([validPair], [baseOwn, partner])
    expect(errs.some((e) => e.includes('dezelfde eigenaar'))).toBe(true)
  })

  it('faalt wanneer slug of type niet overeenkomt', () => {
    const partner = { ...basePartner, slug: 'auto' }
    const errs = validateMergeMapping([validPair], [baseOwn, partner])
    expect(errs.some((e) => e.includes('categorie of type'))).toBe(true)
  })

  it('faalt op income-budgetten', () => {
    const own = { ...baseOwn, budget_type: 'income' }
    const partner = { ...basePartner, budget_type: 'income' }
    const errs = validateMergeMapping([validPair], [own, partner])
    expect(errs.some((e) => e.includes('Inkomsten'))).toBe(true)
  })

  it('faalt wanneer het bovenliggende budget ontbreekt in de koppeling', () => {
    const ownParent = bud({ id: 'op', slug: 'wonen', parent_id: null, user_id: 'me' })
    const ownChild = bud({ id: 'oc', slug: 'energie', parent_id: 'op', user_id: 'me' })
    const pParent = bud({ id: 'pp', slug: 'wonen', parent_id: null, user_id: 'partner' })
    const pChild = bud({ id: 'pc', slug: 'energie', parent_id: 'pp', user_id: 'partner' })

    // Alleen het kind-paar, ZONDER het ouder-paar.
    const childOnly: MergePair = { canonical_budget_id: 'oc', duplicate_budget_id: 'pc' }
    const errs = validateMergeMapping([childOnly], [ownParent, ownChild, pParent, pChild])
    expect(errs.some((e) => e.includes('Bovenliggend budget ontbreekt'))).toBe(true)
  })

  it('faalt wanneer een root aan een kind wordt gekoppeld', () => {
    const ownRoot = bud({ id: 'or', slug: 'wonen', parent_id: null, user_id: 'me' })
    const pChild = bud({ id: 'pc', slug: 'wonen', parent_id: 'pp', user_id: 'partner' })
    const errs = validateMergeMapping(
      [{ canonical_budget_id: 'or', duplicate_budget_id: 'pc' }],
      [ownRoot, pChild],
    )
    expect(errs.some((e) => e.includes('Ouder- en kindbudget'))).toBe(true)
  })

  it('geldig kind-paar mét ouder-paar → geen fouten', () => {
    const ownParent = bud({ id: 'op', slug: 'wonen', parent_id: null, user_id: 'me' })
    const ownChild = bud({ id: 'oc', slug: 'energie', parent_id: 'op', user_id: 'me' })
    const pParent = bud({ id: 'pp', slug: 'wonen', parent_id: null, user_id: 'partner' })
    const pChild = bud({ id: 'pc', slug: 'energie', parent_id: 'pp', user_id: 'partner' })

    const pairs: MergePair[] = [
      { canonical_budget_id: 'op', duplicate_budget_id: 'pp' },
      { canonical_budget_id: 'oc', duplicate_budget_id: 'pc' },
    ]
    expect(validateMergeMapping(pairs, [ownParent, ownChild, pParent, pChild])).toEqual([])
  })
})
