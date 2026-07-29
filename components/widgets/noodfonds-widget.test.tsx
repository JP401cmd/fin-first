import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NoodfondsWidget } from './noodfonds-widget'
import { MOCK_DASHBOARD_DATA } from '@/lib/mock-dashboard-data'
import type { DashboardData } from './widget-renderer'
import { resolveEmergencyFund } from '@/lib/emergency-fund'
import { calculateFreedomTime, formatFreedomTimeString, dailyExpenseRate } from '@/lib/format'

// Privacy default zichtbaar (bedragen niet gemaskeerd) — spiegelt netto-vermogen-widget.test.
const mockPrivacy = { masked: false }
vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => mockPrivacy,
}))

// Voortgangsbalk geforceerd "in view".
vi.mock('@/lib/hooks/use-in-view-animation', () => ({
  useInViewAnimation: () => ({ ref: { current: null }, hasEntered: true, animationComplete: true }),
}))

beforeEach(() => {
  mockPrivacy.masked = false
})

// jsdom kent geen ResizeObserver; WidgetShell gebruikt 'm bij full-size.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

// ── Canonieke bron-scenario (de gemelde W29-situatie) ─────────────────────────
// Dekking en vrijheidstijd delen dezelfde TELLER (de liquide pot) maar hebben
// bewust een andere NOEMER. Beide worden hier uit de ECHTE motor gehaald, zodat
// de test weergave-drift vangt (verkeerd veld / eigen som in de widget).
const LIQUID_POT = 18_600
/** Noemer 1 — effectieve maanduitgaven (huidige maand of profielschatting). */
const MAAND_UITGAVEN = 3_100
/** Noemer 2 — 12-mnd rolling uitgavenniveau (canoniek, uit de bundel). */
const ROLLING_MAAND_UITGAVEN = 9_300

const RESOLVED = resolveEmergencyFund({
  liquidPot: LIQUID_POT,
  effectiveMonthlyExpenses: MAAND_UITGAVEN,
  goal: null,
})

const ROLLING_DAGTARIEF = dailyExpenseRate(ROLLING_MAAND_UITGAVEN)
const VERWACHTE_VRIJHEID = formatFreedomTimeString(
  calculateFreedomTime(LIQUID_POT, ROLLING_DAGTARIEF),
  'short',
)

function makeData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    ...MOCK_DASHBOARD_DATA,
    monthlyExpenses: MAAND_UITGAVEN,
    dailyExpenseRate: ROLLING_DAGTARIEF,
    recentMonthlyExpenses: ROLLING_MAAND_UITGAVEN,
    emergencyFund: {
      currentAmount: RESOLVED.currentAmount,
      targetAmount: RESOLVED.targetAmount,
      monthsCovered: Math.round(RESOLVED.monthsCovered * 10) / 10,
      targetMonths: Math.round(RESOLVED.targetMonths * 2) / 2,
      isComplete: RESOLVED.monthsCovered >= RESOLVED.targetMonths,
    },
    ...overrides,
  }
}

/** nbsp uit formatCurrency normaliseren (zie ui-ux-kwaliteitstoets). */
function text(container: HTMLElement): string {
  return (container.textContent ?? '').replace(/ /g, ' ')
}

describe('NoodfondsWidget — pint de getoonde cijfers op de canonieke motor', () => {
  it('sanity: de motor levert precies de gemelde situatie (6/6 gedekt naast ~2 mnd vrijheid)', () => {
    expect(RESOLVED.monthsCovered).toBe(6)
    expect(RESOLVED.targetMonths).toBe(6)
    expect(VERWACHTE_VRIJHEID).toBe('2m')
  })

  it('full — dekking komt uit emergencyFund (resolver), niet uit een eigen pot ÷ uitgaven-som', () => {
    const { container } = render(<NoodfondsWidget size="full" data={makeData()} />)
    expect(text(container)).toContain('6.0 / 6 maanden gedekt')
  })

  it('full — vrijheidstijd komt uit data.dailyExpenseRate (12-mnd rolling), niet uit monthlyExpenses', () => {
    const { container } = render(<NoodfondsWidget size="full" data={makeData()} />)
    const t = text(container)
    expect(t).toContain(`${VERWACHTE_VRIJHEID} vrijheid op je gemiddelde uitgaven`)
    // De maanduitgaven-noemer zou ~6m vrijheid geven — dat mag hier nooit staan.
    const opMaandbasis = formatFreedomTimeString(
      calculateFreedomTime(LIQUID_POT, dailyExpenseRate(MAAND_UITGAVEN)),
      'short',
    )
    expect(opMaandbasis).toBe('6m')
    expect(t).not.toContain('6m vrijheid')
  })

  it('full — benoemt beide grondslagen expliciet, zodat 6 gedekt naast 2 mnd vrijheid geen tegenspraak leest', () => {
    const { container } = render(<NoodfondsWidget size="full" data={makeData()} />)
    const t = text(container)
    // Grondslag van de dekking …
    expect(t).toContain('van je maanduitgaven')
    // … en die van de vrijheidstijd, mét het canonieke rolling maandbedrag.
    expect(t).toContain('Vrijheidstijd rekent met je gemiddelde uitgaven over 12 maanden')
    expect(t).toContain('9.300')
    // De oude, ongekwalificeerde formulering is weg (dat was de melding).
    expect(t).not.toContain('vrijheid als vangnet')
  })

  it('half — toont de vrijheidsregel mét grondslag, ook wanneer het doel bereikt is', () => {
    const { container } = render(<NoodfondsWidget size="half" data={makeData()} />)
    const t = text(container)
    expect(t).toContain('6.0')
    expect(t).toContain(`${VERWACHTE_VRIJHEID} vrijheid op je gemiddelde uitgaven`)
    expect(t).not.toContain('vrijheid opgebouwd als vangnet')
  })

  it('consume, don-t-recompute — een afwijkende data.monthlyExpenses verandert de dekking niet', () => {
    const { container } = render(
      <NoodfondsWidget size="full" data={makeData({ monthlyExpenses: 500 })} />,
    )
    const t = text(container)
    // Een eigen som (18.600 ÷ 500) zou 37,2 maanden tonen.
    expect(t).toContain('6.0 / 6 maanden gedekt')
    expect(t).not.toContain('37.2')
  })

  // ── Berekening-regel: maanduitgaven uit de bundel, niet gereconstrueerd ──────
  // Vroeger stond hier `targetAmount / targetMonths`. Zodra een eigen €-doel de
  // target stuurt (en targetMonths op 0,5 mnd wordt afgerond) liep die
  // reconstructie uit de pas met de canonieke maanduitgaven.

  it('berekening — toont de canonieke data.monthlyExpenses, niet targetAmount ÷ targetMonths', () => {
    // €-doel van 10.500 bij 3.100 maanduitgaven → 3,387… → afgerond 3,5 mnd.
    // De reconstructie zou 10.500 / 3,5 = 3.000 tonen i.p.v. de echte 3.100.
    const resolved = resolveEmergencyFund({
      liquidPot: LIQUID_POT,
      effectiveMonthlyExpenses: MAAND_UITGAVEN,
      goal: { targetAmount: 10_500 },
    })
    const data = makeData({
      emergencyFund: {
        currentAmount: resolved.currentAmount,
        targetAmount: resolved.targetAmount,
        monthsCovered: Math.round(resolved.monthsCovered * 10) / 10,
        targetMonths: Math.round(resolved.targetMonths * 2) / 2,
        isComplete: resolved.monthsCovered >= resolved.targetMonths,
        source: resolved.source,
      },
    })
    const { container } = render(<NoodfondsWidget size="full" data={data} />)
    const t = text(container)
    expect(t).toContain('3.100') // canonieke maanduitgaven uit de bundel
    expect(t).not.toContain('3.000') // de oude reconstructie
  })

  it('berekening — een eigen doel wordt niet als sluitende vermenigvuldiging gepresenteerd', () => {
    const resolved = resolveEmergencyFund({
      liquidPot: LIQUID_POT,
      effectiveMonthlyExpenses: MAAND_UITGAVEN,
      goal: { targetAmount: 10_500 },
    })
    const data = makeData({
      emergencyFund: {
        currentAmount: resolved.currentAmount,
        targetAmount: resolved.targetAmount,
        monthsCovered: Math.round(resolved.monthsCovered * 10) / 10,
        targetMonths: Math.round(resolved.targetMonths * 2) / 2,
        isComplete: resolved.monthsCovered >= resolved.targetMonths,
        source: resolved.source,
      },
    })
    const { container } = render(<NoodfondsWidget size="full" data={data} />)
    const t = text(container)
    // Bij een eigen doel is het BEDRAG primair — benoemd als zodanig, met ≈.
    expect(t).toContain('Jouw noodfondsdoel')
    expect(t).toContain('≈')
    expect(t).not.toContain('maanduitgaven = ')
  })

  it('berekening — zonder doel blijft de richtlijn een sluitende gelijkheid (6× uitgaven)', () => {
    const { container } = render(
      <NoodfondsWidget size="full" data={makeData({ emergencyFund: { ...makeData().emergencyFund, source: 'liquid' } })} />,
    )
    const t = text(container)
    expect(t).toContain('maanduitgaven = ')
    expect(t).not.toContain('Jouw noodfondsdoel')
    // 6 × 3.100 = 18.600 — beide getallen staan er, de gelijkheid klopt.
    expect(t).toContain('3.100')
    expect(t).toContain('18.600')
  })

  it('niet-bereikt scenario — dekking en vrijheidstijd volgen beide hun eigen canonieke bron', () => {
    const halfVol = resolveEmergencyFund({
      liquidPot: 9_300,
      effectiveMonthlyExpenses: MAAND_UITGAVEN,
      goal: null,
    })
    const data = makeData({
      emergencyFund: {
        currentAmount: halfVol.currentAmount,
        targetAmount: halfVol.targetAmount,
        monthsCovered: Math.round(halfVol.monthsCovered * 10) / 10,
        targetMonths: Math.round(halfVol.targetMonths * 2) / 2,
        isComplete: halfVol.monthsCovered >= halfVol.targetMonths,
      },
    })
    const { container } = render(<NoodfondsWidget size="full" data={data} />)
    const t = text(container)
    expect(t).toContain('3.0 / 6 maanden gedekt')
    const verwacht = formatFreedomTimeString(
      calculateFreedomTime(9_300, ROLLING_DAGTARIEF),
      'short',
    )
    expect(t).toContain(`${verwacht} vrijheid op je gemiddelde uitgaven`)
  })
})
