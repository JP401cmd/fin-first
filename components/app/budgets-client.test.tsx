/**
 * Tests voor de Eenvoudig-modus op de budgetpagina.
 *
 * De volledige `BudgetsPage` (>4900 regels, zware Supabase-effects) is te groot
 * om in jsdom te mounten. De drie door de kaart gevraagde gedragingen zijn
 * daarom als geëxporteerde, pure presentatie-componenten getest:
 *   - BudgetEditorialHeader  → hoofdgetallen-blok (plan/werkelijk) verbergen
 *   - BudgetFiguresStrip     → figures-strip naar Inkomen+Uitgaven beperken
 *   - BudgetViewToggle       → view-toggle-pillgroep verbergen (pil-only)
 *
 * Elke render wordt expliciet in een DisplayModeProvider gewrapt: buiten een
 * provider valt useDisplayMode terug op 'simple', dus de full-mode spiegel-
 * tests MOETEN initialMode="full" zetten.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import {
  BudgetEditorialHeader,
  BudgetFiguresStrip,
  BudgetViewToggle,
} from './budgets-client'

// Optimistische PUT bij de modus is geen echte netwerk-call in de test.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const HEADER_PROPS = {
  monthLabel: 'juni 2026',
  teVerdelen: 500,
  totalIncome: 3000,
  totalIncomeActual: 2800,
  totalActualOutflow: 1900,
}

const STRIP_PROPS = {
  totalIncomeActual: 2800,
  totalIncome: 3000,
  totalExpenseSpent: 1500,
  totalExpenseBudget: 1800,
  totalSavingsActual: 300,
  totalSavingsBudget: 400,
  totalDebtActual: 100,
  totalDebtBudget: 200,
  hasIncome: true,
  hasExpense: true,
  hasSavings: true,
  hasDebt: true,
}

describe('BudgetEditorialHeader — Eenvoudig vs Volledig', () => {
  it('simple: verbergt de hoofdgetallen "Volgens plan" en "Werkelijk"', () => {
    render(
      <DisplayModeProvider initialMode="simple">
        <BudgetEditorialHeader {...HEADER_PROPS} simple />
      </DisplayModeProvider>,
    )
    expect(screen.queryByText('Volgens plan')).toBeNull()
    expect(screen.queryByText('Werkelijk')).toBeNull()
    // Headline (kicker/titel) blijft staan.
    expect(screen.getByText(/heb je nog/i)).toBeTruthy()
  })

  it('full: toont de hoofdgetallen "Volgens plan" en "Werkelijk"', () => {
    render(
      <DisplayModeProvider initialMode="full">
        <BudgetEditorialHeader {...HEADER_PROPS} simple={false} />
      </DisplayModeProvider>,
    )
    expect(screen.getByText('Volgens plan')).toBeTruthy()
    expect(screen.getByText('Werkelijk')).toBeTruthy()
  })
})

describe('BudgetFiguresStrip — Eenvoudig vs Volledig', () => {
  it('simple: toont alleen Inkomen + Uitgaven (geen Sparen/Schulden)', () => {
    render(
      <DisplayModeProvider initialMode="simple">
        <BudgetFiguresStrip {...STRIP_PROPS} simple />
      </DisplayModeProvider>,
    )
    expect(screen.getByText('Inkomen')).toBeTruthy()
    expect(screen.getByText('Uitgaven')).toBeTruthy()
    expect(screen.queryByText('Sparen')).toBeNull()
    expect(screen.queryByText('Schulden')).toBeNull()
    // De Sparen/Schulden-taglines (enkel in die cells) zijn afwezig.
    expect(screen.queryByText('vrijheid opbouwen')).toBeNull()
    expect(screen.queryByText('vrijheid terugkopen')).toBeNull()
  })

  it('full: toont alle vier cellen Inkomen/Uitgaven/Sparen/Schulden', () => {
    render(
      <DisplayModeProvider initialMode="full">
        <BudgetFiguresStrip {...STRIP_PROPS} simple={false} />
      </DisplayModeProvider>,
    )
    expect(screen.getByText('Inkomen')).toBeTruthy()
    expect(screen.getByText('Uitgaven')).toBeTruthy()
    expect(screen.getByText('Sparen')).toBeTruthy()
    expect(screen.getByText('Schulden')).toBeTruthy()
    expect(screen.getByText('vrijheid opbouwen')).toBeTruthy()
    expect(screen.getByText('vrijheid terugkopen')).toBeTruthy()
  })
})

describe('BudgetViewToggle — Eenvoudig vs Volledig', () => {
  it('simple: rendert geen view-toggle-pillgroep (pil-only)', () => {
    const { container } = render(
      <DisplayModeProvider initialMode="simple">
        <BudgetViewToggle simple viewMode="pill" onSelect={() => {}} />
      </DisplayModeProvider>,
    )
    expect(screen.queryByRole('button', { name: 'Boom' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ring' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Heatmap' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pillen' })).toBeNull()
    // Component rendert null in simple.
    expect(container.firstChild).toBeNull()
  })

  it('full: toont de volledige view-toggle-pillgroep', () => {
    render(
      <DisplayModeProvider initialMode="full">
        <BudgetViewToggle simple={false} viewMode="tree" onSelect={() => {}} />
      </DisplayModeProvider>,
    )
    expect(screen.getByRole('button', { name: 'Boom' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ring' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Heatmap' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pillen' })).toBeTruthy()
  })
})
