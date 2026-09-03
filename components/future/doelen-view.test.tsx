import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
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
    // DoelBewerkenSheet (bewerken/voltooien) hangt óók aan deze mock zodra een
    // doel-kaart wordt aangeklikt: update().eq(), delete().eq() en de lazy
    // select().order() voor de volledig-bewerken-flow.
    from: () => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      select: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: [] }) })),
    }),
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
          { current: 20000, target: 50000, pct: 40, onTrack: false, measured: true, requiredMonthly: null, eta: 'over 2 jaar', paceSkipped: false },
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
          { current: 30000, target: 50000, pct: 60, onTrack: true, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
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
          { current: 50000, target: 50000, pct: 100, onTrack: true, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
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
          { current: 30000, target: 50000, pct: 60, onTrack: false, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
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
          { current: 5000, target: 50000, pct: 10, onTrack: false, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
        ]}
      />,
    )
    expect(screen.getByText('Achter op planning')).toBeTruthy()
  })

  // ── Bevinding UR2-17: geen tempo-oordeel op een live stand-doel ───────
  it('toont "Loopt mee" i.p.v. "Op koers" wanneer de motor de tempo-toets oversloeg', () => {
    render(
      <DoelenView
        goals={[mockGoal({ target_value: 1650000, current_value: 960000 })]}
        goalProgresses={[
          { current: 960000, target: 1650000, pct: 58, onTrack: true, measured: true, requiredMonthly: 4507, eta: 'jun 2039', paceSkipped: true },
        ]}
      />,
    )
    expect(screen.getByText('Loopt mee')).toBeTruthy()
    // Dít is de gemelde bevinding: "OP KOERS" naast €4.507 per maand nodig
    // terwijl er €0 wordt ingelegd.
    expect(screen.queryByText('Op koers')).toBeNull()
    // De lat blijft wél zichtbaar — die is niet onwaar geworden.
    expect(screen.getByText(/per maand nodig/)).toBeTruthy()
  })

  it('noemt de grondslag van het live vrijheidsgetal-doel (incl./excl. eigen woning)', () => {
    const doel = mockGoal({
      name: 'Volledige vrijheid (FIRE)',
      target_value: 1650000,
      current_value: 960000,
      metadata: { standaardDoel: 'vrijheidsgetal' },
    })
    const progress = {
      current: 960000, target: 1650000, pct: 58, onTrack: true, measured: true,
      requiredMonthly: 4507, eta: 'jun 2039', paceSkipped: true,
    }
    const { unmount } = render(
      <DoelenView goals={[doel]} goalProgresses={[progress]} vrijheidsgetalLive vrijheidsgetalHomeExcluded={false} />,
    )
    expect(screen.getByText(/Volgt automatisch je vrijheidsgetal — met je huis/)).toBeTruthy()
    unmount()

    render(
      <DoelenView goals={[doel]} goalProgresses={[progress]} vrijheidsgetalLive vrijheidsgetalHomeExcluded />,
    )
    expect(screen.getByText(/Volgt automatisch je vrijheidsgetal — zonder je huis/)).toBeTruthy()
  })

  it('laat de kwalificatie weg wanneer de grondslag onbekend is (geen gegokt label)', () => {
    render(
      <DoelenView
        goals={[mockGoal({ metadata: { standaardDoel: 'vrijheidsgetal' } })]}
        goalProgresses={[
          { current: 960000, target: 1650000, pct: 58, onTrack: true, measured: true, requiredMonthly: null, eta: null, paceSkipped: true },
        ]}
        vrijheidsgetalLive
      />,
    )
    expect(screen.getByText('Volgt automatisch je vrijheidsgetal')).toBeTruthy()
    expect(screen.queryByText(/je huis/)).toBeNull()
  })

  // ── Bevinding M31: een vers doel krijgt geen oordeel ──────────────────
  it('toont "Net begonnen" i.p.v. een stoplicht zolang er niets te meten valt', () => {
    render(
      <DoelenView
        goals={[mockGoal({ current_value: 0 })]}
        goalProgresses={[
          { current: 0, target: 50000, pct: 0, onTrack: true, measured: false, requiredMonthly: 1000, eta: 'jul 2027', paceSkipped: false },
        ]}
      />,
    )
    expect(screen.getByText('Net begonnen')).toBeTruthy()
    expect(screen.queryByText('Achter op planning')).toBeNull()
    expect(screen.queryByText('Op koers')).toBeNull()
  })

  // ── Bevinding M32: het oordeel moet navolgbaar zijn ───────────────────
  it('toont de benodigde maandinleg bij een EUR-doel, zodat de status navolgbaar is', () => {
    render(
      <DoelenView
        goals={[mockGoal()]}
        goalProgresses={[
          { current: 1500, target: 9000, pct: 17, onTrack: false, measured: true, requiredMonthly: 1875, eta: 'dec 2026', paceSkipped: false },
        ]}
      />,
    )
    // formatCurrency zet een non-breaking space tussen € en het bedrag.
    const regel = screen.getByText(/per maand nodig/)
    expect(regel.textContent?.replace(/ /g, ' ')).toBe('€ 1.875 per maand nodig')
  })

  it('toont GEEN maandinleg bij een behaald doel', () => {
    render(
      <DoelenView
        goals={[mockGoal()]}
        goalProgresses={[
          { current: 50000, target: 50000, pct: 100, onTrack: true, measured: true, requiredMonthly: 0, eta: null, paceSkipped: false },
        ]}
      />,
    )
    expect(screen.queryByText(/per maand nodig/)).toBeNull()
  })

  it('toont GEEN maandinleg bij een niet-euro doel (geen tempo van een tempo)', () => {
    render(
      <DoelenView
        goals={[mockGoal({ goal_type: 'savings_rate', target_value: 40, current_value: 20 })]}
        goalProgresses={[
          { current: 20, target: 40, pct: 50, onTrack: false, measured: true, requiredMonthly: 3.5, eta: 'dec 2026', paceSkipped: false },
        ]}
      />,
    )
    expect(screen.queryByText(/per maand nodig/)).toBeNull()
  })

  // ── Eenheid-bewuste weergave: niet alles is een euro ──────────────────
  it('rendert een schuldenvrij-doel als datum, niet als euro-bedrag', () => {
    render(
      <DoelenView
        goals={[
          mockGoal({
            id: 'sv',
            name: 'Schuldenvrij',
            goal_type: 'debt_free_date',
            target_value: 2031.5,
            current_value: 2035.5,
          } as Partial<GoalWithBudget>),
        ]}
        goalProgresses={[
          { current: 2035.5, target: 2031.5, pct: 99, onTrack: false, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
        ]}
      />,
    )
    // formatGoalValue kent de 'datum'-eenheid: decimaal jaar → maand + jaar.
    expect(screen.getByText(/juli 2035/)).toBeTruthy()
    expect(screen.getByText(/van juli 2031/)).toBeTruthy()
    // ... en nergens het oude "€ 2.035 van € 2.031".
    expect(screen.queryByText(/€\s*2\.03/)).toBeNull()
  })

  it('rendert een vrijheidsleeftijd-doel in jaren', () => {
    render(
      <DoelenView
        goals={[
          mockGoal({
            id: 'fa',
            name: 'Eerder vrij',
            goal_type: 'fire_age',
            target_value: 55,
            current_value: 46,
          } as Partial<GoalWithBudget>),
        ]}
        goalProgresses={[
          { current: 46, target: 55, pct: 100, onTrack: true, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
        ]}
      />,
    )
    expect(screen.getByText('46 jaar')).toBeTruthy()
    expect(screen.getByText('van 55 jaar')).toBeTruthy()
  })

  // ── "Loopt automatisch mee" ───────────────────────────────────────────
  it('markeert een auto-sync-doel als meelopend', () => {
    render(
      <DoelenView
        goals={[
          mockGoal({
            id: 'auto',
            name: 'Netto vermogen',
            goal_type: 'net_worth',
            metadata: { sync: 'auto' },
          } as Partial<GoalWithBudget>),
        ]}
        goalProgresses={[
          { current: 20000, target: 50000, pct: 40, onTrack: true, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
        ]}
      />,
    )
    expect(screen.getByTestId('doel-loopt-mee').textContent).toMatch(/Loopt automatisch mee/)
  })

  it('markeert een gekoppeld doel als meelopend', () => {
    render(
      <DoelenView
        goals={[mockGoal({ links: [{ asset_id: 'a1', debt_id: null }] } as Partial<GoalWithBudget>)]}
        goalProgresses={[
          { current: 20000, target: 50000, pct: 40, onTrack: true, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
        ]}
      />,
    )
    expect(screen.getByTestId('doel-loopt-mee')).toBeTruthy()
  })

  it('markeert een doel dat de loader als gekoppeld aanlevert (linkedGoalIds)', () => {
    render(
      <DoelenView
        goals={[mockGoal({ id: 'gk' } as Partial<GoalWithBudget>)]}
        goalProgresses={[
          { current: 20000, target: 50000, pct: 40, onTrack: true, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
        ]}
        linkedGoalIds={['gk']}
      />,
    )
    expect(screen.getByTestId('doel-loopt-mee')).toBeTruthy()
  })

  it('een gewoon handmatig doel krijgt GEEN meeloop-regel', () => {
    render(
      <DoelenView
        goals={[mockGoal()]}
        goalProgresses={[
          { current: 20000, target: 50000, pct: 40, onTrack: true, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
        ]}
      />,
    )
    expect(screen.queryByTestId('doel-loopt-mee')).toBeNull()
  })

  it('sorteert off-track doelen bovenaan', () => {
    const goals = [
      mockGoal({ id: 'g1', name: 'Op koers doel' }),
      mockGoal({ id: 'g2', name: 'Off-track doel' }),
    ]
    const progresses = [
      { current: 30000, target: 50000, pct: 60, onTrack: true, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
      { current: 5000, target: 50000, pct: 10, onTrack: false, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
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
          { current: 20000, target: 50000, pct: 40, onTrack: false, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
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
          { current: 20000, target: 50000, pct: 40, onTrack: false, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
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
          { current: 10, target: 100, pct: 10, onTrack: false, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
          { current: 20, target: 100, pct: 20, onTrack: false, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
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
          { current: 20000, target: 50000, pct: 40, onTrack: false, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
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
          { current: 38, target: 45, pct: 84, onTrack: true, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
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
          { current: 54.5, target: 52, pct: 95, onTrack: true, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
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
          { current: 0, target: 45, pct: 0, onTrack: false, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
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
          { current: 38, target: 45, pct: 84, onTrack: true, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
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
          { current: 38, target: 45, pct: 84, onTrack: true, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
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
          { current: 38, target: 45, pct: 84, onTrack: true, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
          { current: 20000, target: 50000, pct: 40, onTrack: false, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
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
      { current: 54.5, target: 52, pct: 95, onTrack: true, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
      { current: 20000, target: 50000, pct: 40, onTrack: false, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
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

// ── Voorstel 3a: het Bereikt-archief ─────────────────────────────────────

/**
 * Behaalde doelen (`is_completed`) verlaten de actieve lijst en verhuizen naar
 * een standaard ingeklapte `<details>`-sectie "Bereikt" onderaan. Criterium is
 * de opgeslagen vlag, niet `pct >= 100` — daarom dragen deze fixtures die vlag
 * expliciet.
 */
function behaaldGoal(overrides: Partial<GoalWithBudget> = {}): GoalWithBudget {
  return mockGoal({
    id: 'b1',
    name: 'Noodfonds',
    is_completed: true,
    completed_at: '2026-08-31T12:00:00.000Z',
    current_value: 50000,
    ...overrides,
  } as Partial<GoalWithBudget>)
}

describe('DoelenView — Bereikt-archief (3a)', () => {
  it('haalt een behaald doel uit de actieve lijst en zet het in Bereikt, met datum', () => {
    // Loader-getrouwe vorm: behaalde doelen komen APART binnen via
    // `completedGoals` (FinPageData) — de actieve `goals`-lijst bevat ze per
    // constructie niet (splitActiveGoals filtert op !is_completed).
    render(<DoelenView goals={[]} goalProgresses={[]} completedGoals={[behaaldGoal()]} />)

    // Niet als actieve doel-kaart (die dragen een h3 met de naam).
    expect(screen.queryByRole('heading', { level: 3, name: /Noodfonds/ })).toBeNull()
    expect(screen.getByText(/Je hebt nog geen eigen doelen/)).toBeTruthy()

    // Wel in het archief, met aantal in de summary en de behaald-datum.
    const archief = screen.getByTestId('bereikt-archief')
    expect(archief.textContent).toContain('Bereikt (1)')
    expect(archief.textContent).toContain('Noodfonds')
    expect(archief.textContent).toMatch(/Behaald 31 [a-z]{3}\.? 2026/)
    // Standaard ingeklapt.
    expect((archief as HTMLDetailsElement).open).toBe(false)
  })

  it('valt terug op kaal "Behaald" zonder completed_at (oude rijen)', () => {
    render(
      <DoelenView
        goals={[]}
        goalProgresses={[]}
        completedGoals={[behaaldGoal({ completed_at: null } as Partial<GoalWithBudget>)]}
      />,
    )
    const archief = screen.getByTestId('bereikt-archief')
    expect(archief.textContent).toContain('Behaald')
    expect(archief.textContent).not.toMatch(/Behaald \d/)
  })

  it('toont GEEN Bereikt-sectie zonder behaalde doelen', () => {
    render(
      <DoelenView
        goals={[mockGoal()]}
        goalProgresses={[
          { current: 20000, target: 50000, pct: 40, onTrack: false, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
        ]}
      />,
    )
    expect(screen.queryByTestId('bereikt-archief')).toBeNull()
  })

  it('telt een behaald doel niet mee als "actief doel"', () => {
    render(
      <DoelenView
        goals={[mockGoal({ id: 'a1', name: 'Vakantiepot' })]}
        goalProgresses={[
          { current: 500, target: 3000, pct: 17, onTrack: false, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
        ]}
        completedGoals={[behaaldGoal()]}
      />,
    )
    expect(screen.getByText('1 actief doel')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: /Vakantiepot/ })).toBeTruthy()
    expect(screen.getByTestId('bereikt-archief').textContent).toContain('Noodfonds')
  })

  it('een archief-regel opent de bestaande bewerken-sheet', async () => {
    render(<DoelenView goals={[]} goalProgresses={[]} completedGoals={[behaaldGoal()]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Bewerk doel Noodfonds' }))
    expect(
      await screen.findByRole('dialog', { name: /Voortgang bijwerken/i }),
    ).toBeTruthy()
  })

  it('Eenvoudig: dezelfde splitsing — behaald uit de lijst, in Bereikt', () => {
    render(
      <DoelenView
        goals={[mockGoal({ id: 'a1', name: 'Vakantiepot' })]}
        goalProgresses={[
          { current: 500, target: 3000, pct: 17, onTrack: false, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
        ]}
        completedGoals={[behaaldGoal()]}
      />,
      'simple',
    )
    const namen = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent ?? '')
    expect(namen.some((n) => n.includes('Vakantiepot'))).toBe(true)
    expect(namen.some((n) => n.includes('Noodfonds'))).toBe(false)
    expect(screen.getByTestId('bereikt-archief').textContent).toContain('Noodfonds')
  })

  it('Eenvoudig: zonder lopend doel verwijst de lijst naar het archief', () => {
    render(
      <DoelenView goals={[]} goalProgresses={[]} completedGoals={[behaaldGoal()]} />,
      'simple',
    )
    expect(screen.getByText(/geen lopend doel/)).toBeTruthy()
    expect(screen.getByTestId('bereikt-archief')).toBeTruthy()
  })

  it('sorteert het archief op behaald-datum, nieuwste eerst', () => {
    render(
      <DoelenView
        goals={[]}
        goalProgresses={[]}
        completedGoals={[
          behaaldGoal({
            id: 'oud',
            name: 'Oud doel',
            completed_at: '2025-02-01T12:00:00.000Z',
          } as Partial<GoalWithBudget>),
          behaaldGoal({
            id: 'nieuw',
            name: 'Nieuw doel',
            completed_at: '2026-08-31T12:00:00.000Z',
          } as Partial<GoalWithBudget>),
        ]}
      />,
    )
    const regels = screen.getByTestId('bereikt-archief').querySelectorAll('li')
    expect(regels[0]?.textContent).toContain('Nieuw doel')
    expect(regels[1]?.textContent).toContain('Oud doel')
  })
})

// ── Voorstel 3b: de brug naar het volgende doel ──────────────────────────

/**
 * Bij de 0→100%-overgang viert MilestoneCelebration het doel en biedt het
 * meteen de brug: een suggestieregel uit lib/goal-suggestions plus de knop
 * "Kies je volgende doel". Die knop sluit de viering en opent
 * DoelToevoegenSheet via de `openRequest`-teller.
 */
async function haalDoelBehaald(goalType = 'savings') {
  render(
    <DoelenView
      goals={[
        mockGoal({
          id: 'vier1',
          name: 'Noodfonds',
          goal_type: goalType,
        } as Partial<GoalWithBudget>),
      ]}
      goalProgresses={[
        { current: 20000, target: 50000, pct: 40, onTrack: false, measured: true, requiredMonthly: null, eta: null, paceSkipped: false },
      ]}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Bewerk doel Noodfonds' }))
  await screen.findByRole('dialog', { name: /Voortgang bijwerken/i })
  fireEvent.change(document.querySelector('input[type="number"]')!, {
    target: { value: '50000' },
  })
  fireEvent.submit(document.querySelector('form')!)
  await new Promise((r) => setTimeout(r, 20))
}

describe('DoelenView — brug naar het volgende doel (3b)', () => {
  beforeEach(() => {
    // MilestoneCelebration heeft een localStorage-once-guard per doel-id.
    window.localStorage.clear()
  })

  it('toont de viering met suggestieregel en de knop', async () => {
    await haalDoelBehaald('savings')

    expect(screen.getByText(/Doel behaald:/)).toBeTruthy()
    // Suggestietekst komt ongewijzigd uit lib/goal-suggestions (savings[0]).
    expect(screen.getByTestId('volgend-doel-suggestie').textContent).toContain(
      'automatische maandoverboeking',
    )
    expect(screen.getByRole('button', { name: /Kies je volgende doel/ })).toBeTruthy()
  })

  it('knop sluit de viering en opent de toevoegen-sheet (openRequest)', async () => {
    await haalDoelBehaald('savings')

    // Sheet staat nog dicht vóór de klik.
    expect(screen.queryByRole('dialog', { name: /Doel toevoegen/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Kies je volgende doel/ }))

    expect(await screen.findByRole('dialog', { name: /Doel toevoegen/i })).toBeTruthy()
    expect(screen.queryByText(/Doel behaald:/)).toBeNull()
  })

  it('zonder suggestie voor het doeltype blijft alleen de knop over', async () => {
    // 'custom' heeft geen suggestion-set in lib/goal-suggestions.
    await haalDoelBehaald('custom')

    expect(screen.getByText(/Doel behaald:/)).toBeTruthy()
    expect(screen.queryByTestId('volgend-doel-suggestie')).toBeNull()
    expect(screen.getByRole('button', { name: /Kies je volgende doel/ })).toBeTruthy()
  })
})
