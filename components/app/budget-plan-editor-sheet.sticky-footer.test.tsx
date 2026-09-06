/**
 * B-018 / B-020 — "Plan bewerken" op een 384px-viewport.
 *
 * Wat er misging: de rij "Te verdelen + Annuleren + Opslaan — N wijzigingen"
 * stond in een `sticky`-blok ONDERIN de scroll-content en liep zijwaarts uit
 * beeld; de bodempadding reserveerde bovendien `--mobile-nav-clearance` —
 * ruimte voor de zwevende nav-pill, die bij een open overlay juist verborgen
 * wordt (lib/overlay-signal.ts).
 *
 * Wat deze test vastlegt (de plek en de driewegregel, niet het uiterlijk):
 *  1. de afsluitknop zit in de niet-scrollende footer van de BottomSheet;
 *  2. hij heet "Terug" zolang er niets gewijzigd is (B-022-regel);
 *  3. de footer reserveert géén `--mobile-nav-clearance`.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BudgetPlanEditorSheet } from './budget-plan-editor-sheet'
import { ToastProvider } from './toast-provider'
import type { BudgetWithChildren } from '@/lib/budget-data'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }) },
  }),
}))

const BUDGETS: BudgetWithChildren[] = [
  {
    id: 'b-1',
    name: 'Boodschappen',
    slug: 'boodschappen',
    icon: 'Circle',
    description: null,
    default_limit: 400,
    budget_type: 'expense',
    parent_id: null,
    sort_order: 0,
    interval: 'monthly',
    rollover_type: 'none',
    is_essential: false,
    priority_score: 3,
    limit_type: 'soft',
    alert_threshold: 80,
    is_inflation_indexed: false,
    goal_type: null,
    goal_amount: null,
    goal_date: null,
    goal_frequency: null,
    children: [],
  } as unknown as BudgetWithChildren,
]

function renderSheet() {
  render(
    <ToastProvider>
      <BudgetPlanEditorSheet
        open
        onClose={() => {}}
        onSaved={() => {}}
        budgets={BUDGETS}
        budgetAmounts={[{ budget_id: 'b-1', effective_from: '2026-09-01', amount: 400 }]}
        rollovers={[]}
        totalIncome={3000}
        monthDate={new Date(2026, 8, 1)}
        monthlyAverages={{}}
      />
    </ToastProvider>,
  )
  return screen.getByTestId('bottom-sheet-footer')
}

describe('BudgetPlanEditorSheet — sticky footer (B-018/B-020)', () => {
  it('zet de afsluitknop in de niet-scrollende sheet-footer', () => {
    const footer = renderSheet()
    const terug = screen.getByRole('button', { name: 'Terug' })
    expect(footer.contains(terug)).toBe(true)
  })

  it('noemt de knop "Terug" zolang er niets gewijzigd is', () => {
    renderSheet()
    expect(screen.queryByRole('button', { name: /Opslaan/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Terug' })).toBeTruthy()
  })

  it('reserveert geen ruimte meer voor de zwevende nav-pill', () => {
    const footer = renderSheet()
    expect(footer.className).not.toContain('mobile-nav-clearance')
    expect(footer.getAttribute('style') ?? '').not.toContain('mobile-nav-clearance')
  })
})
