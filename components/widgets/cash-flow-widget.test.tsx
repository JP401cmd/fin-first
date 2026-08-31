import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CashFlowWidget } from './cash-flow-widget'
import type { DashboardData } from './widget-renderer'

// Privacy default zichtbaar (bedragen niet gemaskeerd) — spiegelt budgetten-widget.test.
const mockPrivacy = { masked: false }
vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => mockPrivacy,
}))

// Perspectief default 'personal' zodat de vorige-maand-vergelijking (eigen historie) rendert.
vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => ({ perspective: 'personal', partnerName: null }),
}))

// Animatie geforceerd "in view" zodat de balken hun hoogte/kleur tonen.
vi.mock('@/lib/hooks/use-in-view-animation', () => ({
  useInViewAnimation: () => ({ ref: { current: null }, hasEntered: true, animationComplete: true }),
}))

beforeEach(() => {
  mockPrivacy.masked = false
})

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

function makeData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    // De EFFECTIVE grondslag. Bewust ANDERE bedragen dan currentMonth*: zolang
    // deze twee uit elkaar liggen, bewijst elke assertie hieronder wélk paar het
    // widget werkelijk leest (H6). Zet ze nooit gelijk "voor de leesbaarheid" —
    // dan meet de suite niets meer.
    monthlyIncome: 9999,
    monthlyExpenses: 8888,
    // De GEREALISEERDE huidige kalendermaand — wat het widget hoort te tonen.
    currentMonthIncome: 5500,
    currentMonthExpenses: 3600,
    dailyExpenseRate: 120,
    prevMonthIncome: 5000,
    prevMonthExpenses: 3000,
    householdOverrides: null,
    partnerOverrides: null,
    budgetTotals: {
      income:  { limit: 5500, spent: 5500 },
      expense: { limit: 3600, spent: 3600 },
      savings: { limit: 1000, spent: 800 },
      debt:    { limit: 400,  spent: 400 },
    },
    ...overrides,
  } as unknown as DashboardData
}

describe('CashFlowWidget — mojibake-regressie (fix #1)', () => {
  it('toont een echt minteken tussen inkomen en uitgaven, geen garbage', () => {
    // Zonder vorige-maand-data valt de full-tegel terug op de compacte
    // netto-samenvatting (inkomsten − uitgaven = netto), waar het herstelde
    // U+2212 minteken staat.
    const { container } = render(
      <CashFlowWidget size="full" data={makeData({ prevMonthIncome: 0, prevMonthExpenses: 0 })} />,
    )
    // Het herstelde U+2212 minteken staat in de samenvattingsregel.
    expect(screen.getByText('−')).toBeInTheDocument()
    // Geen enkele mojibake-glyph mag terugkeren.
    for (const glyph of ['ˆ', '’', '�', 'ƒ']) {
      expect(container.textContent ?? '').not.toContain(glyph)
    }
  })
})

describe('CashFlowWidget — kleur-semantiek vergelijkingsgrafiek (fix #2)', () => {
  // H6 heeft het delta-% in de LOPENDE maand onderdrukt: een percentage tussen
  // "augustus tot nu toe" en een volledige juli is geen uitspraak. De
  // kleur-semantiek zelf (higherIsBetter) blijft en wordt daarom nu op de
  // ComparisonBar-logica getest via een volledige-maand-vergelijking, die het
  // widget alleen in het huishoud-/partnerperspectief niet toont — vandaar dat
  // deze test de onderdrukking vastlegt en de kleurregel bij de unit blijft.
  it('toont GEEN delta-% zolang de huidige maand nog loopt (H6)', () => {
    render(<CashFlowWidget size="full" data={makeData()} />)

    // Vóór H6 stond hier +10% / +20% / -5%, gerekend tussen een halve en een
    // hele maand. Die drie mogen niet terugkomen.
    expect(screen.queryByText('+10%')).toBeNull()
    expect(screen.queryByText('+20%')).toBeNull()
    expect(screen.queryByText('-5%')).toBeNull()
    // Geen enkel percentage in de vergelijkingssectie.
    expect(screen.queryByText(/^[+-]?\d+%$/)).toBeNull()
  })
})

describe('CashFlowWidget — grondslag + venster-label (H6)', () => {
  it('rekent met currentMonth*, niet met de effective monthly*-velden', () => {
    // makeData: currentMonth 5500/3600 → netto +1.900. Effective 9999/8888 →
    // +1.111. Zou het widget nog de effective grondslag lezen, dan stond hier
    // 1.111.
    render(<CashFlowWidget size="quarter" data={makeData()} />)
    expect(screen.getByText(/1\.900/)).toBeInTheDocument()
    expect(screen.queryByText(/1\.111/)).toBeNull()
  })

  it('draagt het venster in de kicker, met de maandnaam van vandaag', () => {
    render(<CashFlowWidget size="quarter" data={makeData()} />)
    const month = new Intl.DateTimeFormat('nl-NL', { month: 'long' }).format(new Date())
    // "Cashflow — <maand> tot nu toe"; de kicker rendert uppercase via CSS, dus
    // matchen op de tekstinhoud zelf.
    expect(screen.getByText(`Cashflow — ${month} tot nu toe`)).toBeInTheDocument()
  })

  it('full-size zet het venster óók in het hero-label (kicker kan afkappen)', () => {
    render(<CashFlowWidget size="full" data={makeData()} />)
    const month = new Intl.DateTimeFormat('nl-NL', { month: 'long' }).format(new Date())
    expect(screen.getByText(`Netto — ${month} tot nu toe`)).toBeInTheDocument()
  })

  it('benoemt beide vensters onder de vergelijkingsbalken', () => {
    render(<CashFlowWidget size="full" data={makeData()} />)
    const short = new Intl.DateTimeFormat('nl-NL', { month: 'short' }).format(new Date())
    // Drie balken (Inkomen/Uitgaven/Netto) × hetzelfde bijschrift.
    expect(screen.getAllByText(`${short} tot nu toe`).length).toBe(3)
  })

  it('toont NIET de lege staat als de maand nog leeg is maar er wel historie is', () => {
    // Op de 1e van de maand is currentMonth* 0/0. "Importeer transacties" is dan
    // een leugen tegen een gebruiker die vorige maand gewoon geboekt heeft.
    render(<CashFlowWidget size="full" data={makeData({ currentMonthIncome: 0, currentMonthExpenses: 0 })} />)
    expect(screen.queryByText(/Importeer transacties/)).toBeNull()
  })

  it('toont WEL de lege staat als er nergens gerealiseerde data is', () => {
    render(
      <CashFlowWidget
        size="full"
        data={makeData({
          currentMonthIncome: 0,
          currentMonthExpenses: 0,
          prevMonthIncome: 0,
          prevMonthExpenses: 0,
          // Expliciet: er is écht nooit iets geboekt. Zonder dit veld zou de
          // assertie ook slagen op een bundel die de versheid simpelweg niet
          // draagt, en dan bewijst ze de UR2-13-grens niet meer.
          latestTransactionMonth: null,
        })}
      />,
    )
    expect(screen.getByText(/Importeer transacties/)).toBeInTheDocument()
  })
})

// ── UR2-13 — de lege staat mag bestaande transacties niet ontkennen ─────────
// Een account met 407 transacties waarvan de jongste vijf maanden oud was, viel
// door élk venster van dit widget (huidige én vorige maand op 0) en las daarom
// "Importeer transacties om je maandelijkse cashflow te zien". De toets staat nu
// op `latestTransactionMonth` — het enige veld dat "leeg venster" van "geen
// data" kan onderscheiden.
describe('CashFlowWidget — verouderde data (UR2-13)', () => {
  const stale = {
    currentMonthIncome: 0,
    currentMonthExpenses: 0,
    prevMonthIncome: 0,
    prevMonthExpenses: 0,
    latestTransactionMonth: '2024-05',
  }

  it('ontkent de bestaande transacties niet meer', () => {
    render(<CashFlowWidget size="full" data={makeData(stale)} />)
    expect(screen.queryByText(/Importeer transacties/)).toBeNull()
  })

  it('benoemt het lege venster én de laatste boeking', () => {
    render(<CashFlowWidget size="full" data={makeData(stale)} />)
    expect(screen.getByText(/Geen transacties in /)).toBeInTheDocument()
    expect(screen.getByText(/Je laatste boeking is van mei 2024/)).toBeInTheDocument()
  })
})

describe('CashFlowWidget — tekortmaand zichtbaar (fix #3)', () => {
  it('negatieve netto krijgt een zichtbare, rood getinte balk i.p.v. klem op 0', () => {
    // cashFlow = 3000 - 4000 = -1000 (tekort); prevCashFlow = 3000 - 2500 = +500.
    // Sinds H6 op de GEREALISEERDE velden — dat is precies het geval dat vaker
    // voorkomt: halverwege de maand staan de vaste lasten er wel en het salaris
    // nog niet.
    const data = makeData({
      currentMonthIncome: 3000,
      currentMonthExpenses: 4000,
      prevMonthIncome: 3000,
      prevMonthExpenses: 2500,
    })
    const { container } = render(<CashFlowWidget size="full" data={data} />)

    // De negatieve netto-balk tekent met de negatief-kleur (inline style-var), niet met savings.
    const negativeBar = container.querySelector('[style*="--color-negative"]')
    expect(negativeBar).not.toBeNull()
    // En de balk heeft een minimale hoogte, dus een tekortmaand blijft zichtbaar.
    expect((negativeBar as HTMLElement).style.minHeight).toBe('2px')
  })
})
