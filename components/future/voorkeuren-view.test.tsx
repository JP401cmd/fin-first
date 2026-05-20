import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VoorkeurenView } from './voorkeuren-view'

// VoorkeurenView mount nu VoorkeurBewerkenSheet (plan §6.3 Tab 4 inline-
// editor) die next/navigation + supabase client gebruikt. Mock beide.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
    },
  }),
}))
import type { FireParams } from '@/lib/fire-params'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'

/**
 * Tests voor VoorkeurenView — Voorkeuren-tab op /toekomst. Toont
 * read-only samenvatting van fireParams + fireStrategy + withdrawalStrategy
 * met deeplinks naar /identity/parameters voor bewerken.
 */

const mockFireParams: FireParams = {
  grossReturn: 0.07,
  inflationRate: 0.025,
  effectiveSwr: 0.04,
  box3Method: 'forfaitair',
  marginaalTarief: 0.3697,
}

const mockFireStrategy: FireStrategyConfig = {
  strategy: 'deplete',
  endAge: 90,
  legacyAmount: 0,
}

const mockWithdrawal: WithdrawalStrategyConfig = {
  strategy: 'guardrails',
  guardrailFloor: 0.8,
  guardrailCeiling: 1.2,
  guardrailCutStep: 0.1,
  guardrailRaiseStep: 0.1,
}

describe('VoorkeurenView — toekomst-regels', () => {
  it('rendert vier toekomst-regel cards', () => {
    render(
      <VoorkeurenView
        fireParams={mockFireParams}
        fireStrategy={mockFireStrategy}
        withdrawalStrategy={mockWithdrawal}
      />,
    )
    expect(screen.getByText('Eindstrategie')).toBeTruthy()
    expect(screen.getByText('Onttrekkingsstrategie')).toBeTruthy()
    expect(screen.getByText('Onttrekkingsvolgorde')).toBeTruthy()
    expect(screen.getByText('Verdeling bij toename')).toBeTruthy()
  })

  it('toont eindstrategie-naam uit STRATEGY_LABELS', () => {
    render(
      <VoorkeurenView
        fireParams={mockFireParams}
        fireStrategy={mockFireStrategy}
        withdrawalStrategy={mockWithdrawal}
      />,
    )
    // 'deplete' → "Vermogen opeten"
    expect(screen.getByText('Vermogen opeten')).toBeTruthy()
  })

  it('toont onttrekkingsstrategie-naam (guardrails)', () => {
    render(
      <VoorkeurenView
        fireParams={mockFireParams}
        fireStrategy={mockFireStrategy}
        withdrawalStrategy={mockWithdrawal}
      />,
    )
    expect(screen.getByText('Guardrails')).toBeTruthy()
  })

  it('toont guardrail floor/ceiling-badge bij guardrails-strategie', () => {
    render(
      <VoorkeurenView
        fireParams={mockFireParams}
        fireStrategy={mockFireStrategy}
        withdrawalStrategy={mockWithdrawal}
      />,
    )
    // Floor 80.0% · Ceiling 120.0%
    expect(screen.getByText(/Floor 80\.0%/)).toBeTruthy()
    expect(screen.getByText(/Ceiling 120\.0%/)).toBeTruthy()
  })

  it('toont endAge-badge op eindstrategie-card', () => {
    render(
      <VoorkeurenView
        fireParams={mockFireParams}
        fireStrategy={mockFireStrategy}
        withdrawalStrategy={mockWithdrawal}
      />,
    )
    expect(screen.getByText('Tot 90 jaar')).toBeTruthy()
  })
})

describe('VoorkeurenView — markt-aannames', () => {
  it('rendert drie markt-aanname cards', () => {
    render(
      <VoorkeurenView
        fireParams={mockFireParams}
        fireStrategy={mockFireStrategy}
        withdrawalStrategy={mockWithdrawal}
      />,
    )
    expect(screen.getByText('Inflatie')).toBeTruthy()
    expect(screen.getByText('Bruto rendement')).toBeTruthy()
    // "Effectief" + GlossaryTerm("SWR") rendert split — controleer via
    // de body-content of beide aanwezig zijn.
    expect(document.body.textContent).toMatch(/Effectief/)
    expect(document.body.textContent).toMatch(/SWR/)
  })

  it('formatteert percentages met 1 decimaal', () => {
    render(
      <VoorkeurenView
        fireParams={mockFireParams}
        fireStrategy={mockFireStrategy}
        withdrawalStrategy={mockWithdrawal}
      />,
    )
    expect(screen.getByText('2.5%')).toBeTruthy() // inflatie
    expect(screen.getByText('7.0%')).toBeTruthy() // grossReturn
    expect(screen.getByText('4.0%')).toBeTruthy() // effectiveSwr
  })
})

describe('VoorkeurenView — deeplinks', () => {
  it('alle cards linken naar /identity/parameters met focus-param', () => {
    const { container } = render(
      <VoorkeurenView
        fireParams={mockFireParams}
        fireStrategy={mockFireStrategy}
        withdrawalStrategy={mockWithdrawal}
      />,
    )
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(hrefs.some((h) => h?.includes('focus=eindstrategie'))).toBe(true)
    expect(hrefs.some((h) => h?.includes('focus=onttrekking'))).toBe(true)
    expect(hrefs.some((h) => h?.includes('focus=inflatie'))).toBe(true)
    expect(hrefs.some((h) => h?.includes('focus=rendement'))).toBe(true)
  })

  it('linkt expliciet naar /overzicht/bezittingen voor per-groep rendement', () => {
    const { container } = render(
      <VoorkeurenView
        fireParams={mockFireParams}
        fireStrategy={mockFireStrategy}
        withdrawalStrategy={mockWithdrawal}
      />,
    )
    const link = container.querySelector('a[href="/overzicht/bezittingen"]')
    expect(link).toBeTruthy()
  })
})
