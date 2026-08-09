import { describe, it, expect, vi, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { DoelenView } from './doelen-view'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'
import type { GoalWithBudget } from '@/lib/fin-data-loader'

// DoelenView mount DoelToevoegenSheet die next/navigation + supabase
// client gebruikt. Mock beide zodat de view in isolatie test-baar blijft.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ insert: vi.fn().mockResolvedValue({ error: null }) }),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
  }),
}))

/**
 * Tests voor DoelenView — Doelen-tab op /toekomst met status-flags
 * (on-track / aandacht / off-track / behaald).
 *
 * VERPLICHTE PROVIDER (ADR 0026): `useDisplayMode()` valt BUITEN een
 * DisplayModeProvider stilzwijgend terug op 'simple'. Zonder wrapper zou dit
 * bestand ongemerkt de Eenvoudig-tak testen en groen blijven om de verkeerde
 * reden. Deze helper rendert daarom expliciet in een modus; de default is
 * 'full' omdat alle bestaande tests de Volledig-tak beschrijven.
 */
function render(ui: ReactElement, mode: DisplayMode = 'full') {
  return rtlRender(
    <DisplayModeProvider initialMode={mode}>{ui}</DisplayModeProvider>,
  )
}

function mockGoal(overrides: Partial<GoalWithBudget> = {}): GoalWithBudget {
  return {
    id: 'g1',
    name: 'Spaargeld voor woning',
    description: '',
    goal_type: 'savings',
    target_value: 50000,
    current_value: 20000,
    target_date: '2027-12-31',
    color: 'teal',
    icon: 'Target',
    is_completed: false,
    sort_order: 0,
    user_id: 'u1',
    created_at: '2026-01-01',
    custom_unit: null,
    budgets: null,
    ...overrides,
  } as unknown as GoalWithBudget
}

describe('DoelenView — basis-render', () => {
  it('rendert empty-state met toevoeg-CTA', () => {
    // Toevoeg-affordance is altijd zichtbaar (geen Kijken/Plannen-modus meer).
    render(<DoelenView goals={[]} goalProgresses={[]} />)
    expect(screen.getByText('Nog geen doelen')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Doel toevoegen' })).toBeTruthy()
    expect(screen.queryByText(/Activeer Plannen-modus/)).toBeNull()
  })

  it('rendert doel-cards met naam en bedragen', () => {
    render(
      <DoelenView
        goals={[mockGoal()]}
        goalProgresses={[
          { current: 20000, target: 50000, pct: 40, onTrack: false, eta: 'over 2 jaar' },
        ]}
      />,
    )
    expect(screen.getByText('Spaargeld voor woning')).toBeTruthy()
    // formatCurrency rendert €
    expect(screen.getAllByText(/€/).length).toBeGreaterThan(0)
  })

  it('toont status "Op koers" bij onTrack progress', () => {
    render(
      <DoelenView
        goals={[mockGoal()]}
        goalProgresses={[
          { current: 30000, target: 50000, pct: 60, onTrack: true, eta: null },
        ]}
      />,
    )
    expect(screen.getByText('Op koers')).toBeTruthy()
  })

  it('toont status "Behaald" bij pct >= 100', () => {
    render(
      <DoelenView
        goals={[mockGoal()]}
        goalProgresses={[
          { current: 50000, target: 50000, pct: 100, onTrack: true, eta: null },
        ]}
      />,
    )
    expect(screen.getByText('Behaald')).toBeTruthy()
  })

  it('toont status "Aandacht" bij pct >= 50 maar niet onTrack', () => {
    render(
      <DoelenView
        goals={[mockGoal()]}
        goalProgresses={[
          { current: 30000, target: 50000, pct: 60, onTrack: false, eta: null },
        ]}
      />,
    )
    expect(screen.getByText('Aandacht')).toBeTruthy()
  })

  it('toont status "Achter op planning" bij pct < 50 en niet onTrack', () => {
    render(
      <DoelenView
        goals={[mockGoal()]}
        goalProgresses={[
          { current: 5000, target: 50000, pct: 10, onTrack: false, eta: null },
        ]}
      />,
    )
    expect(screen.getByText('Achter op planning')).toBeTruthy()
  })

  it('sorteert off-track doelen bovenaan', () => {
    const goals = [
      mockGoal({ id: 'g1', name: 'Op koers doel' }),
      mockGoal({ id: 'g2', name: 'Off-track doel' }),
    ]
    const progresses = [
      { current: 30000, target: 50000, pct: 60, onTrack: true, eta: null },
      { current: 5000, target: 50000, pct: 10, onTrack: false, eta: null },
    ]
    render(<DoelenView goals={goals} goalProgresses={progresses} />)
    const headings = screen.getAllByRole('heading', { level: 3 })
    // Off-track moet vóór Op koers staan
    expect(headings[0]?.textContent).toContain('Off-track doel')
    expect(headings[1]?.textContent).toContain('Op koers doel')
  })

  it('rendert progressbar met juiste aria-valuenow', () => {
    const { container } = render(
      <DoelenView
        goals={[mockGoal()]}
        goalProgresses={[
          { current: 20000, target: 50000, pct: 40, onTrack: false, eta: null },
        ]}
      />,
    )
    const bar = container.querySelector('[role="progressbar"]')
    expect(bar?.getAttribute('aria-valuenow')).toBe('40')
  })

  it('rendert mijlpaal-markers op 25/50/75% van progressbar', () => {
    const { container } = render(
      <DoelenView
        goals={[mockGoal()]}
        goalProgresses={[
          { current: 20000, target: 50000, pct: 40, onTrack: false, eta: null },
        ]}
      />,
    )
    const bar = container.querySelector('[role="progressbar"]')
    expect(bar).toBeTruthy()
    // Drie aria-hidden mijlpaal-spans als directe children
    const markers = bar?.querySelectorAll('span[aria-hidden="true"]')
    expect(markers?.length).toBe(3)
    // Posities 25%, 50%, 75%
    const positions = Array.from(markers ?? []).map((s) =>
      (s as HTMLElement).style.left,
    )
    expect(positions).toEqual(['25%', '50%', '75%'])
  })

  it('toont aantal doelen in header', () => {
    render(
      <DoelenView
        goals={[mockGoal({ id: 'a' }), mockGoal({ id: 'b' })]}
        goalProgresses={[
          { current: 10, target: 100, pct: 10, onTrack: false, eta: null },
          { current: 20, target: 100, pct: 20, onTrack: false, eta: null },
        ]}
      />,
    )
    expect(screen.getByText('2 actieve doelen')).toBeTruthy()
  })
})

// ── Groep "Jouw doelsituatie" (lab-parameter-doelen) ─────────────────────

function paramGoal(overrides: Partial<GoalWithBudget> = {}): GoalWithBudget {
  return mockGoal({
    metadata: { bron: 'parameter', oorsprong: 'lab' },
    ...overrides,
  } as Partial<GoalWithBudget>)
}

describe('DoelenView — doelsituatie-groep', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('toont GEEN doelsituatie-groep zonder parameter-doelen', () => {
    render(
      <DoelenView
        goals={[mockGoal()]}
        goalProgresses={[
          { current: 20000, target: 50000, pct: 40, onTrack: false, eta: null },
        ]}
      />,
    )
    expect(screen.queryByText('Jouw doelsituatie')).toBeNull()
  })

  it('toont de doelsituatie-groep zodra er een parameter-doel is', () => {
    render(
      <DoelenView
        goals={[
          paramGoal({ id: 'p1', name: 'Spaarquote-doel', goal_type: 'savings_rate' }),
        ]}
        goalProgresses={[
          { current: 38, target: 45, pct: 84, onTrack: true, eta: null },
        ]}
      />,
    )
    expect(screen.getByText('Jouw doelsituatie')).toBeTruthy()
  })

  it('FIRE-kaart toont richting-bewuste regel + marge-subregel', () => {
    render(
      <DoelenView
        goals={[
          paramGoal({
            id: 'pf',
            name: 'Vrijheidsleeftijd',
            goal_type: 'fire_age',
            metadata: { bron: 'parameter', oorsprong: 'lab', margeDoelJaren: 5 },
          }),
        ]}
        goalProgresses={[
          { current: 54.5, target: 52, pct: 95, onTrack: true, eta: null },
        ]}
      />,
    )
    expect(screen.getByText(/nu 54,5 jaar → doel 52 jaar/)).toBeTruthy()
    expect(
      screen.getByText('≥ 5 jr marge — bekijk live in het lab'),
    ).toBeTruthy()
  })

  it('degradeert naar "nog geen meting" bij current_value 0', () => {
    render(
      <DoelenView
        goals={[
          paramGoal({ id: 'ps', name: 'Spaarquote-doel', goal_type: 'savings_rate' }),
        ]}
        goalProgresses={[
          { current: 0, target: 45, pct: 0, onTrack: false, eta: null },
        ]}
      />,
    )
    expect(
      screen.getByText('nog geen meting — bekijk live in het lab'),
    ).toBeTruthy()
    // Geen misleidende status-pill in dit geval.
    expect(screen.queryByText('Achter op planning')).toBeNull()
  })

  it('parameter-kaart linkt naar het lab i.p.v. GoalForm te openen', () => {
    render(
      <DoelenView
        goals={[
          paramGoal({ id: 'ps', name: 'Spaarquote-doel', goal_type: 'savings_rate' }),
        ]}
        goalProgresses={[
          { current: 38, target: 45, pct: 84, onTrack: true, eta: null },
        ]}
      />,
    )
    const link = screen.getByRole('link', { name: /Bekijk .* in het lab/ })
    expect(link.getAttribute('href')).toBe('/toekomst#verken-je-aannames')
  })

  it('overflow-menu → "Doelsituatie loslaten" → confirm → PUT loslaten', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <DoelenView
        goals={[
          paramGoal({ id: 'ps', name: 'Spaarquote-doel', goal_type: 'savings_rate' }),
        ]}
        goalProgresses={[
          { current: 38, target: 45, pct: 84, onTrack: true, eta: null },
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Doelsituatie-opties' }))
    fireEvent.click(screen.getByText('Doelsituatie loslaten'))
    // Confirm-modal verschijnt.
    expect(screen.getByText(/Je laat je vastgelegde doelsituatie los/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Loslaten' }))
    await new Promise((r) => setTimeout(r, 10))

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/toekomst-doel',
      expect.objectContaining({ method: 'PUT' }),
    )
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
    expect(body.action).toBe('loslaten')
  })

  it('parameter-doel telt niet mee in de handmatige tel-header', () => {
    render(
      <DoelenView
        goals={[
          paramGoal({ id: 'ps', name: 'Spaarquote-doel', goal_type: 'savings_rate' }),
          mockGoal({ id: 'm1', name: 'Noodfonds' }),
        ]}
        goalProgresses={[
          { current: 38, target: 45, pct: 84, onTrack: true, eta: null },
          { current: 20000, target: 50000, pct: 40, onTrack: false, eta: null },
        ]}
      />,
    )
    // Eén handmatig doel → "1 actief doel"; parameter-doel zit in eigen groep.
    expect(screen.getByText('1 actief doel')).toBeTruthy()
    expect(screen.getByText('Jouw doelsituatie')).toBeTruthy()
  })
})

// ── Weergavemodus: Eenvoudig vs. Volledig (audit TOE-2) ───────────────────

/**
 * TOE-2: in Eenvoudig verdwijnt de tweedeling "Jouw doelsituatie" vs.
 * handmatige doelen en staat alles onder één kop "Je doelen". In Volledig
 * blijft de tweedeling exact zoals hij was.
 */
describe('DoelenView — weergavemodus (TOE-2)', () => {
  const gemengd = {
    goals: [
      paramGoal({ id: 'pf', name: 'Vrijheidsleeftijd', goal_type: 'fire_age' }),
      mockGoal({ id: 'm1', name: 'Noodfonds' }),
    ],
    goalProgresses: [
      { current: 54.5, target: 52, pct: 95, onTrack: true, eta: null },
      { current: 20000, target: 50000, pct: 40, onTrack: false, eta: null },
    ],
  }

  it('Eenvoudig: één lijst onder de kop "Je doelen", geen herkomst-scheiding', () => {
    render(<DoelenView {...gemengd} />, 'simple')

    expect(screen.getByText('Je doelen')).toBeTruthy()
    expect(screen.queryByText('Jouw doelsituatie')).toBeNull()
    expect(screen.queryByText('1 actief doel')).toBeNull()
    // Precies één lijst-kop (h2) → er staat geen tweede groep meer.
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBe(1)
    // Beide doelen staan er nog — samenvoegen is presentatie, geen filter.
    expect(screen.getByText('Vrijheidsleeftijd')).toBeTruthy()
    expect(screen.getByText('Noodfonds')).toBeTruthy()
  })

  it('Eenvoudig: beide doelen in één grid, doelsituatie-doel eerst', () => {
    render(<DoelenView {...gemengd} />, 'simple')
    const namen = screen
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent ?? '')
    // Gedocumenteerde sorteerkeuze: doelsituatie eerst, dan handmatig.
    expect(namen[0]).toContain('Vrijheidsleeftijd')
    expect(namen[1]).toContain('Noodfonds')
    // ... en ze staan in dezelfde grid-container (in Volledig zijn dat er twee).
    const eersteGrid = screen
      .getByText('Vrijheidsleeftijd')
      .closest('div.grid') as HTMLElement | null
    expect(eersteGrid).toBeTruthy()
    expect(eersteGrid?.textContent).toContain('Noodfonds')
  })

  it('Eenvoudig: beide kaart-typen houden hun gedrag (lab-link én bewerken)', () => {
    render(<DoelenView {...gemengd} />, 'simple')
    expect(
      screen.getByRole('link', { name: 'Bekijk Vrijheidsleeftijd in het lab' })
        .getAttribute('href'),
    ).toBe('/toekomst#verken-je-aannames')
    expect(screen.getByRole('button', { name: 'Bewerk doel Noodfonds' })).toBeTruthy()
  })

  it('Eenvoudig: de groepsactie "Doelsituatie loslaten" is uit beeld', () => {
    render(<DoelenView {...gemengd} />, 'simple')
    expect(screen.queryByRole('button', { name: 'Doelsituatie-opties' })).toBeNull()
  })

  it('Volledig: de tweedeling blijft ongewijzigd', () => {
    render(<DoelenView {...gemengd} />, 'full')
    expect(screen.getByText('Jouw doelsituatie')).toBeTruthy()
    expect(screen.getByText('1 actief doel')).toBeTruthy()
    expect(screen.queryByText('Je doelen')).toBeNull()
    // Twee koppen = twee groepen.
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBe(2)
    expect(screen.getByRole('button', { name: 'Doelsituatie-opties' })).toBeTruthy()
  })
})
