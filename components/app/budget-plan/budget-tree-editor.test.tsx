import { describe, it, expect } from 'vitest'
import { useEffect } from 'react'
import { act, render, screen, fireEvent, within } from '@testing-library/react'
import { BudgetTreeEditor } from './budget-tree-editor'
import { useBudgetDraft, type BudgetDraftState } from './use-budget-draft'
import { NEW_BUDGET_DETAIL_DEFAULTS, type DraftBudget } from '@/lib/budget-plan-diff'
import { buildEmptyDraft } from '@/lib/budget-templates/template-draft'

function row(overrides: Partial<DraftBudget>): DraftBudget {
  return {
    id: 'tmp-x',
    parentId: null,
    name: 'Boodschappen',
    slug: 'boodschappen',
    icon: 'Circle',
    description: null,
    budgetType: 'expense',
    defaultLimit: 400,
    isEssential: false,
    sortOrder: 0,
    interval: 'monthly',
    rolloverType: 'reset',
    amount: 400,
    ...NEW_BUDGET_DETAIL_DEFAULTS,
    ...overrides,
  }
}

// Laatste hook-state, bijgewerkt in een effect (niet tijdens render).
const probe: { current: BudgetDraftState | null } = { current: null }
function Harness({ initial }: { initial: DraftBudget[] }) {
  const state = useBudgetDraft(initial)
  useEffect(() => {
    probe.current = state
  })
  return <BudgetTreeEditor state={state} />
}
const latestState = () => probe.current!

function renderEditor() {
  const initial = [row({ id: 'tmp-boodschappen' }), ...buildEmptyDraft()]
  render(<Harness initial={initial} />)
}

function sectionOf(label: string): HTMLElement {
  return screen.getByRole('heading', { name: label }).closest('section') as HTMLElement
}

describe('BudgetTreeEditor', () => {
  it('voegt een hoofdbudget toe aan het gekozen type', () => {
    renderEditor()
    const uitgaven = sectionOf('Uitgaven')
    expect(within(uitgaven).getAllByRole('textbox')).toHaveLength(1)
    fireEvent.click(within(uitgaven).getByRole('button', { name: /Hoofdbudget/ }))
    const inputs = within(uitgaven).getAllByRole('textbox')
    expect(inputs).toHaveLength(2)
    expect(latestState().draft.filter((r) => r.budgetType === 'expense')).toHaveLength(2)
  })

  it('hernoemt een budget', () => {
    renderEditor()
    fireEvent.change(screen.getByDisplayValue('Boodschappen'), { target: { value: 'Supermarkt' } })
    expect(screen.getByDisplayValue('Supermarkt')).toBeTruthy()
    expect(latestState().draft.find((r) => r.id === 'tmp-boodschappen')!.name).toBe('Supermarkt')
  })

  it('verwijdert een budget na bevestiging', () => {
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Details van Boodschappen' }))
    fireEvent.click(screen.getByRole('button', { name: /Budget verwijderen/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Verwijderen/ }))
    expect(latestState().draft.some((r) => r.id === 'tmp-boodschappen')).toBe(false)
    // Terug in de boom, Eigen rekening staat er nog.
    expect(screen.queryByDisplayValue('Boodschappen')).toBeNull()
    expect(latestState().draft).toHaveLength(2)
  })

  it('Eigen rekening heeft geen verwijderknop en een vaste naam', () => {
    renderEditor()
    const archief = sectionOf('Archief')
    const [parentName] = within(archief).getAllByDisplayValue('Eigen rekening') as HTMLInputElement[]
    expect(parentName.readOnly).toBe(true)
    expect(within(archief).getByText(/Hier landen overboekingen tussen je eigen rekeningen/)).toBeTruthy()

    fireEvent.click(within(archief).getAllByRole('button', { name: 'Details van Eigen rekening' })[0])
    expect(screen.queryByRole('button', { name: /Budget verwijderen/ })).toBeNull()
    expect((screen.getByLabelText('Naam') as HTMLInputElement).readOnly).toBe(true)
  })

  it('de hook weigert Eigen rekening te verwijderen of te hernoemen', () => {
    renderEditor()
    const protectedRow = latestState().draft.find((r) => r.slug === 'eigen-rekening')!
    act(() => latestState().requestDelete(protectedRow.id))
    expect(latestState().pendingDelete).toBeNull()
    act(() => latestState().updateRow(protectedRow.id, { name: 'Iets anders', icon: 'Home' }))
    const after = latestState().draft.find((r) => r.id === protectedRow.id)!
    expect(after.name).toBe('Eigen rekening')
    expect(after.icon).toBe('Home')
  })
})
