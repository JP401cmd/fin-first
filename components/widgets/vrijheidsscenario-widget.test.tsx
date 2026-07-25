import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VrijheidsScenarioWidget } from './vrijheidsscenario-widget'
import type { DashboardData } from './widget-renderer'
import type { FireProjection, FireRange, FireCountdown } from '@/lib/horizon-data'

// jsdom kent geen ResizeObserver; de WidgetShell-scrollcheck gebruikt 'm bij full-size.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

// ── FireProjection-factory: elk scenario draagt zijn EIGEN rendement (annualReturn),
//    net als in de canonieke bundel (computeScalarFireRange). ──────────────────
function makeProj(annualReturn: number, fireAge: number | null, currentAge: number | null): FireProjection {
  return {
    fireTarget: 500_000,
    netWorth: 100_000,
    freedomPercentage: 20,
    fireAge,
    currentAge,
    fireDate: '2044',
    countdownDays: 0,
    countdownYears: 0,
    countdownMonths: 0,
    freedomYears: 0,
    freedomMonths: 0,
    monthlyPassiveIncome: 0,
    monthlySavings: 1_000,
    savingsRate: 25,
    annualReturn,
  }
}

// Basisrendement 0,06 → offsets 0,08 / 0,06 / 0,03 — bewust ALLE anders dan de
// oude hardcoded 5/7/9, zodat "hardcoded label" onmiddellijk zou opvallen.
function makeRange(baseReturn = 0.06): FireRange {
  return {
    optimistic: makeProj(Math.min(0.2, baseReturn + 0.02), 51, 40),
    expected: makeProj(baseReturn, 54, 40),
    pessimistic: makeProj(Math.max(0.01, baseReturn - 0.03), 59, 40),
  }
}

function makeData(fireRange: FireRange | null, extra: Partial<DashboardData> = {}): DashboardData {
  return { fireRange, ...extra } as unknown as DashboardData
}

describe('VrijheidsScenarioWidget — dynamisch rendement (geen hardcoded 5/7/9)', () => {
  it('full: toont het geconsumeerde scenario-rendement, niet de oude 5/7/9', () => {
    render(<VrijheidsScenarioWidget size="full" data={makeData(makeRange(0.06))} />)
    // base 0,06 → 8% / 6% / 3%
    expect(screen.getByText('8%')).toBeInTheDocument()
    expect(screen.getByText('6%')).toBeInTheDocument()
    expect(screen.getByText('3%')).toBeInTheDocument()
    // De oude hardcoded labels mogen NIET meer verschijnen.
    expect(screen.queryByText('5%')).not.toBeInTheDocument()
    expect(screen.queryByText('7%')).not.toBeInTheDocument()
    expect(screen.queryByText('9%')).not.toBeInTheDocument()
  })

  it('full: labels volgen het door de gebruiker ingestelde rendement', () => {
    // Eigen rendement 0,05 → 7% / 5% / 2%: middenlabel wordt 5%, niet 7%.
    render(<VrijheidsScenarioWidget size="full" data={makeData(makeRange(0.05))} />)
    expect(screen.getByText('7%')).toBeInTheDocument()
    expect(screen.getByText('5%')).toBeInTheDocument()
    expect(screen.getByText('2%')).toBeInTheDocument()
  })
})

describe('VrijheidsScenarioWidget — XL vrijheidstijd-as', () => {
  it('rendert de as met de drie markers + jaren-vanaf-nu', () => {
    render(<VrijheidsScenarioWidget size="xl" data={makeData(makeRange(0.06))} />)
    // Echte vrijheidstijd-as aanwezig (role img met beschrijvend label).
    const axis = screen.getByRole('img', { name: /vrijheidstijd-as/i })
    expect(axis).toBeInTheDocument()
    // Filosofie-aanhef: verwacht 54 − 40 = 14 jaar vanaf nu.
    expect(screen.getByText(/14 jaar/)).toBeInTheDocument()
    // Legenda toont het dynamische scenario-rendement.
    expect(screen.getByText('8%')).toBeInTheDocument()
    expect(screen.getByText('6%')).toBeInTheDocument()
    expect(screen.getByText('3%')).toBeInTheDocument()
  })

  it('XL zonder geboortedatum: valt terug op een nette hint i.p.v. een lege as', () => {
    const noDob: FireRange = {
      optimistic: makeProj(0.08, null, null),
      expected: makeProj(0.06, null, null),
      pessimistic: makeProj(0.03, null, null),
    }
    render(<VrijheidsScenarioWidget size="xl" data={makeData(noDob)} />)
    expect(screen.getByText(/geboortedatum/i)).toBeInTheDocument()
    // Legenda-rendement blijft ook zonder as zichtbaar.
    expect(screen.getByText('6%')).toBeInTheDocument()
  })

  it('empty state bij ontbrekende fireRange', () => {
    render(<VrijheidsScenarioWidget size="xl" data={makeData(null)} />)
    expect(screen.getByText(/Voeg inkomen en vermogen toe/)).toBeInTheDocument()
  })
})

// ── Kern van W36-bug: de scalar-band is FALLBACK-ONLY en kan onterecht 'Bereikt'
//    zeggen (band-fireAge == currentAge → 0 jaar). Zolang de canonieke aftelling
//    (simFireCountdown / fireAgeFractional) een echte toekomstige leeftijd geeft,
//    MOET de widget die volgen en NOOIT 'je bent al vrij' tonen bij lage freedomPct.
describe('VrijheidsScenarioWidget — canonieke verankering (W36-bug)', () => {
  // Band collabeert naar 'Bereikt' (fireAge == currentAge == 46 → 0 jaar).
  const collapsedBand: FireRange = {
    optimistic: makeProj(0.09, 46, 46),
    expected: makeProj(0.07, 46, 46),
    pessimistic: makeProj(0.04, 46, 46),
  }
  const futureCountdown: FireCountdown = {
    countdownYears: 14,
    countdownMonths: 0,
    countdownDays: 5113,
    fireDate: 'mrt 2040',
  }

  it('XL: volgt de canonieke aftelling i.p.v. de collabeerde band', () => {
    render(
      <VrijheidsScenarioWidget
        size="xl"
        data={makeData(collapsedBand, {
          simFireCountdown: futureCountdown,
          fireAgeFractional: 60,
          freedomPct: 27.5,
        })}
      />,
    )
    // Canoniek verankerd: 14 jaar vanaf nu, op je 60e — NIET 0 jaar / 'Bereikt'.
    expect(screen.getByText(/14 jaar/)).toBeInTheDocument()
    expect(screen.getByText(/op je 60e/)).toBeInTheDocument()
    // Toont de echte tijd-as, NIET de 'Bereikt'-staat bij 27,5% freedomPct.
    expect(screen.getByRole('img', { name: /vrijheidstijd-as/i })).toBeInTheDocument()
    expect(screen.queryByText(/dekt je uitgaven blijvend/i)).not.toBeInTheDocument()
  })

  it('XL: canonieke reached (freedomPct >= 100) toont nette Bereikt-staat', () => {
    render(
      <VrijheidsScenarioWidget
        size="xl"
        data={makeData(collapsedBand, {
          simFireCountdown: { ...futureCountdown, fireDate: 'Bereikt!', countdownYears: 0 },
          fireAgeFractional: 46,
          freedomPct: 100,
        })}
      />,
    )
    expect(screen.getByText(/volledig vrij/i)).toBeInTheDocument()
    // Geen degenererende as / botsende nul-markers meer.
    expect(screen.queryByRole('img', { name: /vrijheidstijd-as/i })).not.toBeInTheDocument()
  })

  it('XL: behoudt de rendement-spreiding rond het canonieke midden', () => {
    // Band met echte spreiding (11/14/19 jaar) + canonieke verwacht = 14 jaar.
    render(
      <VrijheidsScenarioWidget
        size="xl"
        data={makeData(makeRange(0.06), {
          simFireCountdown: futureCountdown,
          fireAgeFractional: 60,
          freedomPct: 40,
        })}
      />,
    )
    // Verwacht verankerd op 14; opt = 14 + (11−14) = 11, pes = 14 + (19−14) = 19.
    expect(screen.getByText(/14 jaar/)).toBeInTheDocument()
    expect(screen.getByText(/11–19/)).toBeInTheDocument()
  })

  it('mini: canonieke reached toont "Vrij"', () => {
    render(
      <VrijheidsScenarioWidget
        size="mini"
        data={makeData(collapsedBand, { fireAgeFractional: 46, freedomPct: 100 })}
      />,
    )
    expect(screen.getByText('Vrij')).toBeInTheDocument()
  })
})
