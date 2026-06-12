import { describe, it, expect } from 'vitest'
import { buildBudgetOptions, resolveSlug, isAssignableType, type BudgetRow } from './budget-options'

// ── Test-fixture helpers ──────────────────────────────────────────────────────

function row(
  id: string,
  name: string,
  slug: string | null,
  budget_type: string | null = 'expense',
  parent_id: string | null = null,
  ownership: string | null = 'personal',
  description: string | null = null,
): BudgetRow {
  return { id, parent_id, name, slug, budget_type, description, ownership }
}

// ── isAssignableType ──────────────────────────────────────────────────────────

describe('isAssignableType', () => {
  it('accepteert income, expense, savings, debt', () => {
    expect(isAssignableType('income')).toBe(true)
    expect(isAssignableType('expense')).toBe(true)
    expect(isAssignableType('savings')).toBe(true)
    expect(isAssignableType('debt')).toBe(true)
  })

  it('weigert archive en overige strings', () => {
    expect(isAssignableType('archive')).toBe(false)
    expect(isAssignableType('onbekend')).toBe(false)
    expect(isAssignableType(null)).toBe(false)
  })
})

// ── resolveSlug ───────────────────────────────────────────────────────────────

describe('resolveSlug', () => {
  const valid = new Set(['eten-thuis', 'nutsvoorzieningen', 'netto-salaris'])

  it('geeft de slug terug als die in de aangeboden set zit (bugrapport geval a)', () => {
    expect(resolveSlug('eten-thuis', valid)).toBe('eten-thuis')
  })

  it('normaliseert naar lowercase en trim', () => {
    expect(resolveSlug('  Eten-Thuis  ', valid)).toBe('eten-thuis')
  })

  it('geeft null als de slug niet in de set zit (bugrapport geval b)', () => {
    // Oude bug: model retourneert een slug maar die valt buiten de set →
    // verwacht: budget_id null, niet een crash of template-fallback.
    expect(resolveSlug('boodschappen', valid)).toBeNull()
    expect(resolveSlug('uit-eten-horeca', valid)).toBeNull()
  })

  it('geeft null voor null/undefined input', () => {
    expect(resolveSlug(null, valid)).toBeNull()
    expect(resolveSlug(undefined, valid)).toBeNull()
    expect(resolveSlug('', valid)).toBeNull()
  })
})

// ── buildBudgetOptions: leaf-detectie ────────────────────────────────────────

describe('buildBudgetOptions — leaf-detectie', () => {
  it('sluit een parent-met-children uit als toewijsdoel (bugrapport geval c)', () => {
    // "Huishouden" is een parent, "Eten thuis" is het child.
    const rows: BudgetRow[] = [
      row('p1', 'Huishouden', 'huishouden', 'expense', null),
      row('c1', 'Eten thuis', 'eten-thuis', 'expense', 'p1'),
    ]
    const { validSlugs, options } = buildBudgetOptions(rows)
    expect(validSlugs.has('eten-thuis')).toBe(true)
    expect(validSlugs.has('huishouden')).toBe(false)
    expect(options.find((o) => o.slug === 'huishouden')).toBeUndefined()
  })

  it('neemt een top-level budget zonder children wel op', () => {
    const rows: BudgetRow[] = [
      row('a1', 'Vakantiegeld', 'vakantiegeld', 'income'),
    ]
    const { validSlugs } = buildBudgetOptions(rows)
    expect(validSlugs.has('vakantiegeld')).toBe(true)
  })

  it('slaat budgetten zonder slug over', () => {
    const rows: BudgetRow[] = [
      row('a1', 'Eigen rekening', null, 'archive'),
      row('a2', 'Boodschappen', 'boodschappen', 'expense'),
    ]
    const { validSlugs } = buildBudgetOptions(rows)
    expect(validSlugs.size).toBe(1)
    expect(validSlugs.has('boodschappen')).toBe(true)
  })
})

// ── buildBudgetOptions: budget_type-filter ────────────────────────────────────

describe('buildBudgetOptions — budget_type filter', () => {
  it('sluit archive-type uit', () => {
    const rows: BudgetRow[] = [
      row('a1', 'Eigen rekening', 'eigen-rekening', 'archive'),
      row('a2', 'Sparen', 'sparen', 'savings'),
    ]
    const { validSlugs } = buildBudgetOptions(rows)
    expect(validSlugs.has('eigen-rekening')).toBe(false)
    expect(validSlugs.has('sparen')).toBe(true)
  })
})

// ── buildBudgetOptions: slug-collisie (bugrapport geval d) ────────────────────

describe('buildBudgetOptions — slug-collisie: shared wint', () => {
  it('een shared-rij verdringt de personal-rij bij dezelfde slug', () => {
    const personalRow = row('id-personal', 'Boodschappen', 'boodschappen', 'expense', null, 'personal')
    const sharedRow = row('id-shared', 'Boodschappen (huishouden)', 'boodschappen', 'expense', null, 'shared')
    const rows = [personalRow, sharedRow]
    const { slugToId } = buildBudgetOptions(rows)
    expect(slugToId.get('boodschappen')).toBe('id-shared')
  })

  it('personal-rij blijft staan als er geen shared-rij is', () => {
    const rows: BudgetRow[] = [
      row('id-p', 'Netto salaris', 'netto-salaris', 'income', null, 'personal'),
    ]
    const { slugToId } = buildBudgetOptions(rows)
    expect(slugToId.get('netto-salaris')).toBe('id-p')
  })

  it('shared-rij die ná de personal-rij staat in de array wint nog steeds', () => {
    // Volgorde in de array mag de uitkomst niet bepalen — de logica werkt
    // doordat een bestaande non-shared entry overschreven wordt door shared.
    const rows: BudgetRow[] = [
      row('id-p', 'Loon', 'loon', 'income', null, 'personal'),
      row('id-s', 'Loon (gedeeld)', 'loon', 'income', null, 'shared'),
    ]
    const { slugToId } = buildBudgetOptions(rows)
    expect(slugToId.get('loon')).toBe('id-s')
  })
})

// ── buildBudgetOptions: parentName-resolutie ──────────────────────────────────

describe('buildBudgetOptions — parentName-resolutie', () => {
  it('vult parentName in met de naam van de parent (bugrapport geval 1 — Huishouden)', () => {
    const rows: BudgetRow[] = [
      row('p1', 'Huishouden', 'huishouden', 'expense', null),
      row('c1', 'Eten thuis', 'eten-thuis', 'expense', 'p1'),
    ]
    const { options } = buildBudgetOptions(rows)
    const opt = options.find((o) => o.slug === 'eten-thuis')
    expect(opt?.parentName).toBe('Huishouden')
  })

  it('laat parentName null wanneer het budget top-level is', () => {
    const rows: BudgetRow[] = [
      row('a1', 'Netto salaris', 'netto-salaris', 'income'),
    ]
    const { options } = buildBudgetOptions(rows)
    expect(options[0].parentName).toBeNull()
  })

  it('vult parentName in voor Nutsvoorzieningen onder Vaste lasten (bugrapport geval 2)', () => {
    const rows: BudgetRow[] = [
      row('p2', 'Vaste lasten', 'vaste-lasten', 'expense', null),
      row('c2', 'Nutsvoorzieningen', 'nutsvoorzieningen', 'expense', 'p2'),
      row('c3', 'Huur', 'huur', 'expense', 'p2'),
    ]
    const { options } = buildBudgetOptions(rows)
    const nuts = options.find((o) => o.slug === 'nutsvoorzieningen')
    expect(nuts?.parentName).toBe('Vaste lasten')
    expect(options.find((o) => o.slug === 'vaste-lasten')).toBeUndefined()
  })

  it('vult parentName in voor alle drie subbudgetten onder Leuke dingen (bugrapport geval 3)', () => {
    const rows: BudgetRow[] = [
      row('p3', 'Leuke dingen', 'leuke-dingen', 'expense', null),
      row('c4', 'Eten buiten', 'eten-buiten', 'expense', 'p3'),
      row('c5', 'Bezorgd thuis', 'bezorgd-thuis', 'expense', 'p3'),
      row('c6', 'Entertainment', 'entertainment', 'expense', 'p3'),
    ]
    const { options } = buildBudgetOptions(rows)
    for (const slug of ['eten-buiten', 'bezorgd-thuis', 'entertainment']) {
      const opt = options.find((o) => o.slug === slug)
      expect(opt?.parentName, `parentName van ${slug}`).toBe('Leuke dingen')
    }
    // De parent zelf is geen toewijsdoel
    expect(options.find((o) => o.slug === 'leuke-dingen')).toBeUndefined()
  })
})

// ── buildBudgetOptions: income-budget netto-salaris (bugrapport geval 4) ──────

describe('buildBudgetOptions — income budget netto-salaris', () => {
  it('neemt netto-salaris op als income-optie', () => {
    const rows: BudgetRow[] = [
      row('inc1', 'Netto salaris', 'netto-salaris', 'income'),
    ]
    const { options, validSlugs, slugToId } = buildBudgetOptions(rows)
    expect(validSlugs.has('netto-salaris')).toBe(true)
    expect(slugToId.get('netto-salaris')).toBe('inc1')
    expect(options[0].type).toBe('income')
  })
})

// ── buildBudgetOptions: lege input ────────────────────────────────────────────

describe('buildBudgetOptions — lege input', () => {
  it('retourneert lege arrays/sets voor een lege rij-lijst', () => {
    const { options, validSlugs, slugToId } = buildBudgetOptions([])
    expect(options).toHaveLength(0)
    expect(validSlugs.size).toBe(0)
    expect(slugToId.size).toBe(0)
  })
})
