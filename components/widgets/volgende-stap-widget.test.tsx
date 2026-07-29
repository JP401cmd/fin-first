import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { VolgendeStapWidget } from './volgende-stap-widget'
import type { DashboardData } from './widget-renderer'
import { computeNextSteps, type NextStepInput } from '@/lib/next-steps/engine'

// jsdom kent geen ResizeObserver; WidgetShell gebruikt 'm bij full-size.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

// ── Canonieke motor-invoer ───────────────────────────────────────────────────
// De widget toont uitsluitend wat de motor teruggeeft; de tests pinnen de
// gerénderde tekst tegen computeNextSteps() voor dezelfde invoer, zodat
// weergave-drift (verkeerd veld, stale mapping) zichtbaar wordt.
function input(overrides: Partial<NextStepInput> = {}): NextStepInput {
  return {
    hasBankConnection: true,
    transactionCount: 120,
    assetCount: 4,
    debtCount: 1,
    budgetCount: 8,
    goalCount: 2,
    hasDateOfBirth: true,
    netWorth: 180_000,
    emergencyMonthsCovered: 6,
    emergencyTargetMonths: 6,
    savingsRate6mPct: 32,
    monthlyIncome: 4_500,
    monthlyRecurringAmount: 1_200,
    budgetsOverLimit: 0,
    openActionCount: 0,
    freedomDaysOpen: 0,
    lifeEventCount: 3,
    fireCountdownYears: null,
    completions: new Map(),
    ...overrides,
  }
}

function makeData(nextSteps: DashboardData['nextSteps']): DashboardData {
  return { nextSteps } as unknown as DashboardData
}

// Post-onboarding gebruiker met werk aan de winkel in alle drie de modules.
const GROEI_INPUT = input({
  emergencyMonthsCovered: 1.8,
  savingsRate6mPct: 8,
  budgetsOverLimit: 2,
  openActionCount: 4,
  freedomDaysOpen: 18.4,
  lifeEventCount: 0,
  fireCountdownYears: 12,
})

describe('VolgendeStapWidget — motor-uitvoer wordt onvervormd getoond', () => {
  it('toont bij mini het korte label van de bovenste motor-stap', () => {
    const steps = computeNextSteps(GROEI_INPUT)
    render(<VolgendeStapWidget size="mini" data={makeData(steps)} href="/overzicht/tips" />)
    expect(screen.getByText(steps[0].label)).toBeInTheDocument()
    // Geen volzin-titel op mini (dat was de mono-volzin-bevinding).
    expect(screen.queryByText(steps[0].title)).not.toBeInTheDocument()
  })

  it('toont bij quarter de gemeten waarde van de motor, niet een eigen som', () => {
    const steps = computeNextSteps(GROEI_INPUT)
    render(<VolgendeStapWidget size="quarter" data={makeData(steps)} href="/overzicht/tips" />)
    expect(screen.getByText(steps[0].label)).toBeInTheDocument()
    expect(screen.getByText(steps[0].metric!)).toBeInTheDocument()
    expect(screen.getByText(`${steps.length} stappen open`)).toBeInTheDocument()
  })

  it('toont bij full de canonieke vrijheidsdagen-som van de motor', () => {
    const steps = computeNextSteps(GROEI_INPUT)
    const totaal = steps.reduce((sum, s) => sum + (s.impact != null && s.impact > 0 ? s.impact : 0), 0)
    render(<VolgendeStapWidget size="full" data={makeData(steps)} href="/overzicht/tips" />)
    expect(screen.getByText(`+${totaal}`)).toBeInTheDocument()
    // 18,4 open vrijheidsdagen → motor rondt af op 18; de widget telt alleen op.
    expect(totaal).toBe(18)
  })

  it('verzint geen vrijheidsdagen wanneer de motor er geen levert', () => {
    const steps = computeNextSteps(input({ emergencyMonthsCovered: 1, lifeEventCount: 0 }))
    expect(steps.every(s => s.impact === null)).toBe(true)
    render(<VolgendeStapWidget size="full" data={makeData(steps)} href="/overzicht/tips" />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText(/vrijheidsdagen$/)).not.toBeInTheDocument()
  })
})

describe('VolgendeStapWidget — elke stap linkt naar zijn eigen bestemming', () => {
  it('geeft bij half elke rij de href van die stap', () => {
    const steps = computeNextSteps(GROEI_INPUT)
    const { container } = render(<VolgendeStapWidget size="half" data={makeData(steps)} />)
    const links = Array.from(container.querySelectorAll('a'))
    // Rijen mét meting zijn twee regels hoog → twee rijen, anders drie.
    expect(links.length).toBe(2)
    for (const [i, link] of links.entries()) {
      expect(link.getAttribute('href')).toBe(steps[i].href)
      expect(within(link).getByText(steps[i].label)).toBeInTheDocument()
    }
    // De telregel blijft zichtbaar (mag niet uit de tegel gedrukt worden).
    expect(within(container).getByText(new RegExp(`${steps.length} stappen open`))).toBeInTheDocument()
  })

  it('toont drie rijen wanneer geen enkele stap een meting draagt', () => {
    const steps = computeNextSteps(input({
      hasBankConnection: false, transactionCount: 0, assetCount: 0,
      budgetCount: 0, goalCount: 0, hasDateOfBirth: false, monthlyIncome: 0,
      monthlyRecurringAmount: 0, lifeEventCount: 0,
    }))
    expect(steps.every(s => !s.metric)).toBe(true)
    const { container } = render(<VolgendeStapWidget size="half" data={makeData(steps)} />)
    expect(container.querySelectorAll('a').length).toBe(3)
  })

  it('geeft bij full elke kaart de href van die stap', () => {
    const steps = computeNextSteps(GROEI_INPUT)
    const { container } = render(<VolgendeStapWidget size="full" data={makeData(steps)} />)
    const links = Array.from(container.querySelectorAll('a'))
    expect(links.length).toBe(Math.min(4, steps.length))
    expect(links.map(l => l.getAttribute('href'))).toEqual(steps.slice(0, 4).map(s => s.href))
  })

  it('laat mini/quarter naar de bovenste stap wijzen, niet naar de generieke widget-href', () => {
    const steps = computeNextSteps(GROEI_INPUT)
    for (const size of ['mini', 'quarter'] as const) {
      const { container } = render(
        <VolgendeStapWidget size={size} data={makeData(steps)} href="/overzicht/tips" />,
      )
      expect(container.querySelector('a')?.getAttribute('href')).toBe(steps[0].href)
    }
  })

  it('nest geen anker in een anker', () => {
    const steps = computeNextSteps(GROEI_INPUT)
    for (const size of ['half', 'full'] as const) {
      const { container } = render(<VolgendeStapWidget size={size} data={makeData(steps)} />)
      expect(container.querySelector('a a')).toBeNull()
    }
  })
})

describe('VolgendeStapWidget — lege staat', () => {
  it('toont "Alles op orde" wanneer de motor niets teruggeeft', () => {
    const steps = computeNextSteps(input())
    expect(steps).toEqual([])
    render(<VolgendeStapWidget size="half" data={makeData(steps)} href="/overzicht/tips" />)
    expect(screen.getByText(/Alles op orde/)).toBeInTheDocument()
  })
})
