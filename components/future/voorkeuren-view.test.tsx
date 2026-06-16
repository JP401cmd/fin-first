import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VoorkeurenView } from './voorkeuren-view'

// VoorkeurenView mount nu VoorkeurBewerkenSheet (markt-aannames) + RegelBewerkenPane
// (de 5 regels). Mock next/navigation + supabase client, en stub de pane (die op
// matchMedia/ShellOverlay leunt) zodat de card-tests gefocust blijven.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/toekomst/voorkeuren',
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
vi.mock('./regel-bewerken-pane', () => ({
  RegelBewerkenPane: () => null,
}))
import type { FireParams } from '@/lib/fire-params'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import { POT_RULES_DEFAULTS } from '@/lib/pot-rules'
import type { WealthGroup } from '@/lib/wealth-composition'

/**
 * Tests voor VoorkeurenView — Voorkeuren-tab op /toekomst. Toont de vijf
 * "Regels op de hele tijdas" (elk opent RegelBewerkenPane) + markt-aannames.
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

const mockPotBalances: Record<WealthGroup, number> = {
  spaargeld: 10000,
  beleggingen: 50000,
  pensioen: 20000,
  vastgoed: 0,
  overig: 0,
}

const baseProps = {
  fireParams: mockFireParams,
  fireStrategy: mockFireStrategy,
  withdrawalStrategy: mockWithdrawal,
  simSnapshot: null,
  regelVoorkeuren: POT_RULES_DEFAULTS,
  potBalances: mockPotBalances,
}

describe('VoorkeurenView — toekomst-regels', () => {
  it('rendert vijf toekomst-regel cards', () => {
    render(<VoorkeurenView {...baseProps} />)
    expect(screen.getByText('Eindstrategie')).toBeTruthy()
    expect(screen.getByText('Onttrekkingsstrategie')).toBeTruthy()
    expect(screen.getByText('Onttrekkingsvolgorde')).toBeTruthy()
    expect(screen.getByText('Verdeling bij toename')).toBeTruthy()
    expect(screen.getByText('Onttrekking bij afname')).toBeTruthy()
  })

  it('toont eindstrategie-naam uit STRATEGY_LABELS', () => {
    render(<VoorkeurenView {...baseProps} />)
    // 'deplete' → "Vermogen opeten"
    expect(screen.getByText('Vermogen opeten')).toBeTruthy()
  })

  it('toont onttrekkingsstrategie-naam (guardrails)', () => {
    render(<VoorkeurenView {...baseProps} />)
    expect(screen.getAllByText('Guardrails').length).toBeGreaterThan(0)
  })

  it('toont guardrail floor/ceiling-badge bij guardrails-strategie', () => {
    render(<VoorkeurenView {...baseProps} />)
    expect(screen.getByText(/Floor 80\.0%/)).toBeTruthy()
    expect(screen.getByText(/Ceiling 120\.0%/)).toBeTruthy()
  })

  it('toont endAge-badge op eindstrategie-card', () => {
    render(<VoorkeurenView {...baseProps} />)
    expect(screen.getByText('Tot 90 jaar')).toBeTruthy()
  })
})

describe('VoorkeurenView — markt-aannames', () => {
  it('rendert drie markt-aanname cards', () => {
    render(<VoorkeurenView {...baseProps} />)
    expect(screen.getByText('Inflatie')).toBeTruthy()
    expect(screen.getByText('Bruto rendement')).toBeTruthy()
    expect(document.body.textContent).toMatch(/Effectief/)
    expect(document.body.textContent).toMatch(/SWR/)
  })

  it('formatteert percentages met 1 decimaal', () => {
    render(<VoorkeurenView {...baseProps} />)
    expect(screen.getByText('2.5%')).toBeTruthy() // inflatie
    expect(screen.getByText('7.0%')).toBeTruthy() // grossReturn
    expect(screen.getByText('4.0%')).toBeTruthy() // effectiveSwr
  })
})

describe('VoorkeurenView — pot-regels zijn nu instelbaar', () => {
  it('cards bevatten geen /identity/parameters-href', () => {
    const { container } = render(<VoorkeurenView {...baseProps} />)
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href') ?? '',
    )
    expect(hrefs.some((h) => h.includes('/identity/parameters'))).toBe(false)
  })

  it('linkt expliciet naar /overzicht/bezittingen voor per-groep rendement', () => {
    const { container } = render(<VoorkeurenView {...baseProps} />)
    const link = container.querySelector('a[href="/overzicht/bezittingen"]')
    expect(link).toBeTruthy()
  })

  it('toont geen "Binnenkort instelbaar"-placeholders meer', () => {
    render(<VoorkeurenView {...baseProps} />)
    expect(screen.queryByText('Binnenkort instelbaar')).toBeNull()
  })

  it('toont de live pot-regel-waarden (verdeling → beleggingen)', () => {
    render(<VoorkeurenView {...baseProps} />)
    // surplusGroup 'beleggingen' → "Naar beleggingen"
    expect(screen.getByText('Naar beleggingen')).toBeTruthy()
  })
})
