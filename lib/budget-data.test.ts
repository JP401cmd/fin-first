import { describe, it, expect } from 'vitest'
import { buildBudgetSelectEntries, type BudgetSelectGroup } from './budget-data'

function group(
  parent: { id: string; name: string; budget_type: BudgetSelectGroup['parent']['budget_type'] },
  children: { id: string; name: string }[],
): BudgetSelectGroup {
  return { parent, children }
}

describe('buildBudgetSelectEntries', () => {
  it('rendert een normale hoofdcategorie als optgroup met selecteerbare subbudgetten', () => {
    const entries = buildBudgetSelectEntries([
      group({ id: 'p1', name: 'Inkomen', budget_type: 'income' }, [
        { id: 'c1', name: 'Salaris' },
        { id: 'c2', name: 'Toeslagen' },
      ]),
    ])
    expect(entries).toEqual([
      {
        kind: 'group',
        id: 'p1',
        label: 'Inkomen',
        options: [
          { id: 'c1', name: 'Salaris' },
          { id: 'c2', name: 'Toeslagen' },
        ],
      },
    ])
  })

  it('toont de archive-"Eigen rekening"-emmer als direct-selecteerbare optie (geen gelijknamige optgroup-kop)', () => {
    const entries = buildBudgetSelectEntries([
      group({ id: 'er', name: 'Eigen rekening', budget_type: 'archive' }, [
        { id: 'er-sub', name: 'Eigen rekening' },
      ]),
    ])
    // De subpost is dé selecteerbare optie; geen niet-klikbare gelijknamige kop.
    expect(entries).toEqual([{ kind: 'option', id: 'er-sub', name: 'Eigen rekening' }])
    expect(entries.some((e) => e.kind === 'group')).toBe(false)
  })

  it('valt terug op de hoofd-archive-post wanneer er geen subbudget bestaat', () => {
    const entries = buildBudgetSelectEntries([
      group({ id: 'er', name: 'Eigen rekening', budget_type: 'archive' }, []),
    ])
    expect(entries).toEqual([{ kind: 'option', id: 'er', name: 'Eigen rekening' }])
  })

  it('toont een childless niet-archive hoofdbudget als direct-selecteerbare optie (Minimalistisch: boeken op het hoofdbudget)', () => {
    const entries = buildBudgetSelectEntries([
      group({ id: 'p', name: 'Vaste lasten wonen & energie', budget_type: 'expense' }, []),
    ])
    expect(entries).toEqual([
      { kind: 'option', id: 'p', name: 'Vaste lasten wonen & energie' },
    ])
  })

  it('behoudt volgorde: optgroups en losse archive-opties in invoervolgorde', () => {
    const entries = buildBudgetSelectEntries([
      group({ id: 'p1', name: 'Inkomen', budget_type: 'income' }, [{ id: 'c1', name: 'Salaris' }]),
      group({ id: 'er', name: 'Eigen rekening', budget_type: 'archive' }, [{ id: 'er-sub', name: 'Eigen rekening' }]),
    ])
    expect(entries.map((e) => e.kind)).toEqual(['group', 'option'])
  })
})
