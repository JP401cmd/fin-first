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
/** Noemer van de NORM — netto maandsalaris (3× is het doel). */
const NETTO_SALARIS = 6_200
/** Noemer van de runway — effectieve maanduitgaven. */
const MAAND_UITGAVEN = 3_100
/** Noemer van de vrijheidstijd — 12-mnd rolling uitgavenniveau (uit de bundel). */
const ROLLING_MAAND_UITGAVEN = 9_300

const RESOLVED = resolveEmergencyFund({
  liquidPot: LIQUID_POT,
  effectiveMonthlyExpenses: MAAND_UITGAVEN,
  netMonthlyIncome: NETTO_SALARIS,
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
      runwayMonths: Math.round(RESOLVED.runwayMonths * 10) / 10,
      source: RESOLVED.source,
    },
    ...overrides,
  }
}

/**
 * Tweede scenario, ONDER de norm (9.300 pot → 1,5 van 3). Nodig omdat de widget
 * boven de norm afkapt op "Doel bereikt": assertions over het getoonde CIJFER
 * moeten op een niet-bereikt scenario draaien, anders toetsen ze niets meer.
 */
const ONDER_NORM = resolveEmergencyFund({
  liquidPot: 9_300,
  effectiveMonthlyExpenses: MAAND_UITGAVEN,
  netMonthlyIncome: NETTO_SALARIS,
})

function makeOnderNorm(overrides: Partial<DashboardData> = {}): DashboardData {
  return makeData({
    emergencyFund: {
      currentAmount: ONDER_NORM.currentAmount,
      targetAmount: ONDER_NORM.targetAmount,
      monthsCovered: Math.round(ONDER_NORM.monthsCovered * 10) / 10,
      targetMonths: Math.round(ONDER_NORM.targetMonths * 2) / 2,
      isComplete: ONDER_NORM.monthsCovered >= ONDER_NORM.targetMonths,
      runwayMonths: Math.round(ONDER_NORM.runwayMonths * 10) / 10,
      source: ONDER_NORM.source,
    },
    ...overrides,
  })
}

/** nbsp uit formatCurrency normaliseren (zie ui-ux-kwaliteitstoets). */
function text(container: HTMLElement): string {
  return (container.textContent ?? '').replace(/ /g, ' ')
}

describe('NoodfondsWidget — pint de getoonde cijfers op de canonieke motor', () => {
  it('sanity: de motor levert precies de gemelde situatie (3/3 gedekt naast ~2 mnd vrijheid)', () => {
    expect(RESOLVED.monthsCovered).toBe(3)
    expect(RESOLVED.targetMonths).toBe(3)
    expect(RESOLVED.runwayMonths).toBe(6)
    expect(VERWACHTE_VRIJHEID).toBe('2m')
  })

  it('full — dekking komt uit emergencyFund (resolver), niet uit een eigen pot ÷ salaris-som', () => {
    const { container } = render(<NoodfondsWidget size="full" data={makeOnderNorm()} />)
    expect(text(container)).toContain('1.5 / 3 maanden gedekt')
  })

  it('full — boven de norm kapt de teller af op "Doel bereikt"', () => {
    // 18.600 is 3,0× de norm van 6.200 — precies bereikt. Een pot van 4× de norm
    // zou vroeger als "12.0 / 3 maanden gedekt" doorgroeien; dat leest als een
    // score die blijft stijgen terwijl de buffer af is.
    const { container } = render(<NoodfondsWidget size="full" data={makeData()} />)
    const t = text(container)
    expect(t).toContain('Doel bereikt')
    expect(t).not.toContain('maanden gedekt')
    // Het BEDRAG blijft wél volledig zichtbaar.
    expect(t).toContain('18.600')
  })

  it('full — ver boven de norm groeit de teller niet door', () => {
    const ver = resolveEmergencyFund({
      liquidPot: 55_001, effectiveMonthlyExpenses: 3_500, netMonthlyIncome: 5_000,
    })
    const { container } = render(
      <NoodfondsWidget size="full" data={makeData({
        emergencyFund: {
          currentAmount: ver.currentAmount,
          targetAmount: ver.targetAmount,
          monthsCovered: Math.round(ver.monthsCovered * 10) / 10,
          targetMonths: Math.round(ver.targetMonths * 2) / 2,
          isComplete: ver.monthsCovered >= ver.targetMonths,
          runwayMonths: Math.round(ver.runwayMonths * 10) / 10,
          source: ver.source,
        },
      })} />,
    )
    const t = text(container)
    expect(t).toContain('Doel bereikt')
    expect(t).not.toContain('11.0')
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

  it('full — benoemt beide grondslagen expliciet, zodat 3 gedekt naast 2 mnd vrijheid geen tegenspraak leest', () => {
    const { container } = render(<NoodfondsWidget size="full" data={makeOnderNorm()} />)
    const t = text(container)
    // Grondslag van de dekking …
    expect(t).toContain('van je netto maandsalaris')
    // … en die van de vrijheidstijd, mét het canonieke rolling maandbedrag.
    expect(t).toContain('Vrijheidstijd rekent met je gemiddelde uitgaven over 12 maanden')
    expect(t).toContain('9.300')
    // De oude, ongekwalificeerde formulering is weg (dat was de melding).
    expect(t).not.toContain('vrijheid als vangnet')
  })

  it('half — toont de vrijheidsregel mét grondslag, ook wanneer het doel bereikt is', () => {
    const { container } = render(<NoodfondsWidget size="half" data={makeData()} />)
    const t = text(container)
    expect(t).toContain('Doel bereikt')
    expect(t).toContain(`${VERWACHTE_VRIJHEID} vrijheid op je gemiddelde uitgaven`)
    expect(t).not.toContain('vrijheid opgebouwd als vangnet')
  })

  it('consume, don-t-recompute — een afwijkende data.monthlyExpenses verandert de dekking niet', () => {
    const { container } = render(
      <NoodfondsWidget size="full" data={makeOnderNorm({ monthlyExpenses: 500 })} />,
    )
    const t = text(container)
    // Een eigen som (9.300 ÷ 500) zou 18,6 maanden tonen.
    expect(t).toContain('1.5 / 3 maanden gedekt')
    expect(t).not.toContain('18.6 /')
  })

  // ── Berekening-regel: de norm is een sluitende gelijkheid ───────────────────
  // Sinds de norm 3 × netto maandsalaris is, geldt targetMonths × maandbasis ==
  // targetAmount altijd exact — de widget mag de maandbasis dus reconstrueren.
  // (In het oude doel-gestuurde model was targetAmount een vrij €-bedrag en
  // targetMonths een op 0,5 afgeronde afgeleide; dáár liep die reconstructie
  // scheef, vandaar de eerdere data.monthlyExpenses-uitzondering.)

  it('berekening — toont de salaris-grondslag als sluitende gelijkheid', () => {
    const { container } = render(<NoodfondsWidget size="full" data={makeData()} />)
    const t = text(container)
    expect(t).toContain('netto maandsalaris')
    // 3 × 6.200 = 18.600 — beide getallen staan er, de gelijkheid klopt.
    expect(t).toContain('6.200')
    expect(t).toContain('18.600')
  })

  it('berekening — vermeldt de runway apart, zodat "hoe lang kom ik rond" waar blijft', () => {
    const { container } = render(<NoodfondsWidget size="full" data={makeData()} />)
    expect(text(container)).toContain('6.0 maanden rond van je vaste lasten')
  })

  it('terugval zonder salaris — norm en label schakelen naar de maanduitgaven', () => {
    // Bewust ONDER de norm (9.300 / 3.100 = 3,0 van 6), anders kapt de widget af
    // op "Doel bereikt" en toetst deze test het label niet meer.
    const zonderSalaris = resolveEmergencyFund({
      liquidPot: 9_300,
      effectiveMonthlyExpenses: MAAND_UITGAVEN,
      netMonthlyIncome: 0,
    })
    const data = makeData({
      emergencyFund: {
        currentAmount: zonderSalaris.currentAmount,
        targetAmount: zonderSalaris.targetAmount,
        monthsCovered: Math.round(zonderSalaris.monthsCovered * 10) / 10,
        targetMonths: Math.round(zonderSalaris.targetMonths * 2) / 2,
        isComplete: zonderSalaris.monthsCovered >= zonderSalaris.targetMonths,
        runwayMonths: Math.round(zonderSalaris.runwayMonths * 10) / 10,
        source: zonderSalaris.source,
      },
    })
    const { container } = render(<NoodfondsWidget size="full" data={data} />)
    const t = text(container)
    expect(t).toContain('3.0 / 6 maanden gedekt')
    expect(t).toContain('van je maanduitgaven')
    expect(t).not.toContain('netto maandsalaris')
  })

  it('niet-bereikt scenario — dekking en vrijheidstijd volgen beide hun eigen canonieke bron', () => {
    const { container } = render(<NoodfondsWidget size="full" data={makeOnderNorm()} />)
    const t = text(container)
    expect(t).toContain('1.5 / 3 maanden gedekt')
    const verwacht = formatFreedomTimeString(
      calculateFreedomTime(9_300, ROLLING_DAGTARIEF),
      'short',
    )
    expect(t).toContain(`${verwacht} vrijheid op je gemiddelde uitgaven`)
  })
})
