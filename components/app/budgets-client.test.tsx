/**
 * Tests voor de Eenvoudig-modus op de budgetpagina.
 *
 * De volledige `BudgetsPage` (>4900 regels, zware Supabase-effects) is te groot
 * om in jsdom te mounten. De drie door de kaart gevraagde gedragingen zijn
 * daarom als geëxporteerde, pure presentatie-componenten getest:
 *   - BudgetEditorialHeader  → hoofdgetallen-blok (plan/werkelijk) verbergen
 *   - BudgetFiguresStrip     → figures-strip naar Inkomen+Uitgaven beperken
 *   - BudgetViewToggle       → view-toggle-pillgroep verbergen (pil-only)
 *   - BudgetPeriodToggle     → periode-schakel verbergen (maand-only, BUD-1)
 *   - BudgetReportActions    → Rapport + "Kopieer vorige maand" verbergen (BUD-2)
 *
 * Elke render wordt expliciet in een DisplayModeProvider gewrapt: buiten een
 * provider valt useDisplayMode terug op 'simple', dus de full-mode spiegel-
 * tests MOETEN initialMode="full" zetten.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import {
  BudgetEditorialHeader,
  BudgetFiguresStrip,
  BudgetPeriodToggle,
  BudgetReportActions,
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
  totalExpenseBudget: 1800,
  totalExpenseSpent: 1500,
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
  it('simple: verbergt de hoofdgetallen "Nog te besteden" en "Nog te verdelen"', () => {
    render(
      <DisplayModeProvider initialMode="simple">
        <BudgetEditorialHeader {...HEADER_PROPS} simple />
      </DisplayModeProvider>,
    )
    expect(screen.queryByText('Nog te besteden')).toBeNull()
    expect(screen.queryByText('Nog te verdelen')).toBeNull()
    // Headline (kicker/titel) blijft staan.
    expect(screen.getByText(/heb je nog/i)).toBeTruthy()
  })

  it('full: toont de hoofdgetallen "Nog te besteden" en "Nog te verdelen"', () => {
    render(
      <DisplayModeProvider initialMode="full">
        <BudgetEditorialHeader {...HEADER_PROPS} simple={false} />
      </DisplayModeProvider>,
    )
    expect(screen.getByText('Nog te besteden')).toBeTruthy()
    expect(screen.getByText('Nog te verdelen')).toBeTruthy()
  })

  it('full: het ankergetal is budgetBeschikbaar (limiet − besteed) — zelfde getal als de cashflow-Budget-kaart', () => {
    const { container } = render(
      <DisplayModeProvider initialMode="full">
        <BudgetEditorialHeader {...HEADER_PROPS} simple={false} />
      </DisplayModeProvider>,
    )
    // 1800 − 1500 = 300 restant; grondslag-regel noemt limiet + besteed.
    const text = container.textContent ?? ''
    expect(text).toContain('300')
    expect(text).toMatch(/uitgavenbudget/)
  })

  it('full: zonder actief uitgavenbudget valt de anker-kolom weg, verdelen blijft', () => {
    render(
      <DisplayModeProvider initialMode="full">
        <BudgetEditorialHeader {...HEADER_PROPS} totalExpenseBudget={0} totalExpenseSpent={0} simple={false} />
      </DisplayModeProvider>,
    )
    expect(screen.queryByText('Nog te besteden')).toBeNull()
    expect(screen.getByText('Nog te verdelen')).toBeTruthy()
  })
})

describe('BudgetEditorialHeader — één euroteken (regressie WF-BUDGET-02-bug2)', () => {
  it('positief: hero-getallen tonen geen dubbel euroteken', () => {
    const { container } = render(
      <DisplayModeProvider initialMode="full">
        <BudgetEditorialHeader {...HEADER_PROPS} simple={false} />
      </DisplayModeProvider>,
    )
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/€\s*€/)
  })

  it('negatief: over-toegewezen plan + boven budget tonen "−€" zonder dubbel teken', () => {
    // teVerdelen < 0 → over-toegewezen; besteed > limiet → besteden negatief.
    const { container } = render(
      <DisplayModeProvider initialMode="full">
        <BudgetEditorialHeader
          {...HEADER_PROPS}
          teVerdelen={-500}
          totalExpenseSpent={2500}
          simple={false}
        />
      </DisplayModeProvider>,
    )
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/€\s*€/)
    // Minteken staat vóór het (enkele) euroteken.
    expect(text).toMatch(/−€/)
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

describe('BudgetPeriodToggle — Eenvoudig vs Volledig (BUD-1)', () => {
  it('simple: rendert geen periode-schakel — en dus nergens de afkorting "YTD"', () => {
    const { container } = render(
      <DisplayModeProvider initialMode="simple">
        <BudgetPeriodToggle simple periodMode="maand" onSelect={() => {}} />
      </DisplayModeProvider>,
    )
    expect(screen.queryByRole('button', { name: 'Maand' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'YTD' })).toBeNull()
    expect(screen.queryByRole('button', { name: '12 mnd' })).toBeNull()
    // Jargonregel: "YTD" komt in Eenvoudig niet in beeld.
    expect(container.textContent ?? '').not.toContain('YTD')
    expect(container.firstChild).toBeNull()
  })

  it('simple: rendert óók niets wanneer de bewaarde keuze nog YTD is', () => {
    // Regressie op de terugval: wie in Volledig op YTD stond en terugschakelt
    // naar Eenvoudig mag geen YTD-schakel (of -label) meer zien. De caller zet
    // `effectivePeriodMode` op 'maand'; de toggle zelf verdwijnt volledig.
    const { container } = render(
      <DisplayModeProvider initialMode="simple">
        <BudgetPeriodToggle simple periodMode="ytd" onSelect={() => {}} />
      </DisplayModeProvider>,
    )
    expect(container.firstChild).toBeNull()
    expect(container.textContent ?? '').not.toContain('YTD')
  })

  it('full: toont Maand / YTD / 12 mnd en meldt de keuze terug', () => {
    const onSelect = vi.fn()
    render(
      <DisplayModeProvider initialMode="full">
        <BudgetPeriodToggle simple={false} periodMode="maand" onSelect={onSelect} />
      </DisplayModeProvider>,
    )
    expect(screen.getByRole('button', { name: 'Maand' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'YTD' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '12 mnd' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'YTD' }))
    expect(onSelect).toHaveBeenCalledWith('ytd')
  })
})

describe('BudgetReportActions — Eenvoudig vs Volledig (BUD-2)', () => {
  const ACTION_PROPS = {
    showCopy: true,
    copying: false,
    onOpenReport: () => {},
    onCopyLastMonth: () => {},
  }

  it('simple: verbergt "Rapport" en "Kopieer vorige maand"', () => {
    const { container } = render(
      <DisplayModeProvider initialMode="simple">
        <BudgetReportActions {...ACTION_PROPS} />
      </DisplayModeProvider>,
    )
    expect(screen.queryByRole('button', { name: 'Rapport' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Kopieer vorige maand/ })).toBeNull()
    expect(container.firstChild).toBeNull()
  })

  it('full: toont "Rapport" en "Kopieer vorige maand"', () => {
    render(
      <DisplayModeProvider initialMode="full">
        <BudgetReportActions {...ACTION_PROPS} />
      </DisplayModeProvider>,
    )
    expect(screen.getByRole('button', { name: 'Rapport' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Kopieer vorige maand/ })).toBeTruthy()
  })

  it('full: zonder maand-periode blijft alleen "Rapport" over', () => {
    render(
      <DisplayModeProvider initialMode="full">
        <BudgetReportActions {...ACTION_PROPS} showCopy={false} />
      </DisplayModeProvider>,
    )
    expect(screen.getByRole('button', { name: 'Rapport' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Kopieer vorige maand/ })).toBeNull()
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
