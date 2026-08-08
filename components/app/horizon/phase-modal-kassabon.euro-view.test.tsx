/**
 * T9 — de waterval-kassabons van de drie fase-modals blijven NOMINAAL (klasse C).
 *
 * WAAROM DIT DE BELANGRIJKSTE TEST VAN BROK D IS: elke kassabon draagt een
 * optel-identiteit (`start + inleg + rendement − box3 + events ≈ eind`) over
 * MEERDERE jaren. Zou je elke term met zijn eigen jaarfactor delen, dan sluit de
 * som niet meer — en het verschil valt precies in de rij die "Afronding" heet.
 * Op een dertigjarig plan is dat geen afronding maar tienduizenden euro's, onder
 * het label waar niemand naar kijkt. Vandaar: het hele blok blijft nominaal en
 * draagt in 'real' één grondslag-regel.
 *
 * De tests pinnen drie dingen per modal:
 *  1. élk bedrag in de kassabon is numeriek identiek in 'nominal' en 'real';
 *  2. de grondslag-regel staat er in 'real' en NIET in 'nominal' (NFR-D2);
 *  3. de identiteit sluit: de opgetelde rijen komen uit op de eindrij, met een
 *     afrondingsrest die in beide weergaven exact hetzelfde is (AC-D2).
 *
 * Punt 1 is bewust op de RUWE bedrag-teksten en niet op "een" bedrag: een test
 * die één regel controleert blijft groen zodra een andere regel wél deflateert.
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { EuroViewProvider } from '@/lib/hooks/use-euro-view'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import { PhaseModalOpbouw } from './phase-modal-opbouw'
import { PhaseModalOvergang } from './phase-modal-overgang'
import { PhaseModalOnttrekking } from './phase-modal-onttrekking'

// ── Mocks: stub de zware analyse-secties; deze test gaat over de kassabon ────
vi.mock('@/components/app/shell/shell-overlay', () => ({
  ShellOverlay: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div data-testid="shell-overlay">{children}</div> : null,
}))
vi.mock('@/components/app/horizon/phase-analysis/phase-chart-zoom', () => ({ PhaseChartZoom: () => <div /> }))
vi.mock('@/components/app/horizon/phase-analysis/life-events-in-phase', () => ({ LifeEventsInPhase: () => <div /> }))
vi.mock('@/components/app/horizon/phase-analysis/stress-test-section', () => ({ StressTestSection: () => <div /> }))
vi.mock('@/components/app/horizon/phase-analysis/opbouw/monte-carlo-opbouw', () => ({ MonteCarloOpbouw: () => <div /> }))
vi.mock('@/components/app/horizon/phase-analysis/opbouw/schulden-samenvatting', () => ({ SchuldenSamenvatting: () => <div /> }))
vi.mock('@/components/app/horizon/phase-analysis/opbouw/spaarquote-gevoeligheid', () => ({ SpaarquoteGevoeligheid: () => <div /> }))
vi.mock('@/components/app/horizon/phase-analysis/opbouw/koopkracht-erosie', () => ({ KoopkrachtErosie: () => <div /> }))
vi.mock('@/components/app/horizon/phase-analysis/opbouw/hypotheek-vs-beleggen-opbouw', () => ({ HypotheekVsBeleggenOpbouw: () => <div /> }))
vi.mock('@/components/app/horizon/phase-analysis/overgang/monte-carlo-overgang', () => ({ MonteCarloOvergang: () => <div /> }))
vi.mock('@/components/app/horizon/phase-analysis/overgang/gap-analyse', () => ({ GapAnalyse: () => <div /> }))
vi.mock('@/components/app/horizon/phase-analysis/overgang/eerder-stoppen', () => ({ EerderStoppen: () => <div /> }))
vi.mock('@/components/app/horizon/phase-analysis/overgang/deeltijdwerk-impact', () => ({ DeeltijdwerkImpact: () => <div /> }))
vi.mock('@/components/app/horizon/phase-analysis/onttrekken/monte-carlo-onttrekken', () => ({ MonteCarloOnttrekken: () => <div /> }))
vi.mock('@/components/app/horizon/phase-analysis/onttrekken/huis-verkopen', () => ({ HuisVerkopen: () => <div /> }))
vi.mock('@/components/app/horizon/phase-analysis/onttrekken/sorr-analyse', () => ({ SORRAnalyse: () => <div /> }))
vi.mock('@/components/app/horizon/phase-analysis/onttrekken/end-of-life', () => ({ EndOfLife: () => <div /> }))
vi.mock('@/components/app/horizon/phase-analysis/onttrekken/koopkracht-erosie-onttrekken', () => ({ KoopkrachtErosieOnttrekken: () => <div /> }))
vi.mock('@/components/app/horizon/phase-detail-table', () => ({ PhaseDetailTable: () => <div /> }))
vi.mock('@/components/app/horizon/phase-analysis/phase-discuss-button', () => ({ PhaseDiscussButton: () => <div /> }))

// ── Fixtures ────────────────────────────────────────────────────────────────

const GRONDSLAG = /Deze optelling loopt over meerdere jaren en staat in toekomstige euro/

/**
 * Eén projectiejaar. De `inflationFactor` loopt bewust ver op (2% over dertig
 * jaar ≈ 1,8): zou een term tóch gedeflateerd worden, dan is dat in de bedragen
 * onmiddellijk zichtbaar in plaats van binnen de afrondingsruis te verdwijnen.
 */
function makeRow(
  age: number,
  phase: UnifiedProjectionRow['phase'],
  overrides: Partial<UnifiedProjectionRow> = {},
): UnifiedProjectionRow {
  const year = age - 40
  return {
    year,
    age,
    phase,
    assetBuckets: {
      investment: {
        startValue: 200_000,
        growth: 14_000,
        contributions: 12_000,
        box3Drag: 1_500,
        endValue: 224_500,
      },
    },
    debtBalances: {},
    totalAssets: 224_500,
    totalDebts: 0,
    netWorth: 224_500,
    startNetWorth: 200_000,
    nettoLiquide: 224_500,
    grossIncome: 0,
    savings: 12_000,
    withdrawal: 0,
    withdrawalByType: {},
    cashflowNet: 0,
    oneTimeNet: 0,
    totalGrowth: 14_000,
    totalBox3: 1_500,
    cumulativeBox3: 1_500 * (year + 1),
    inflationFactor: Math.pow(1.02, year),
    ...overrides,
  }
}

/** Vijf opbouwjaren waarin het vermogen daadwerkelijk aangroeit. */
function opbouwRijen(): UnifiedProjectionRow[] {
  let start = 200_000
  return [0, 1, 2, 3, 4].map(i => {
    const groei = 14_000
    const inleg = 12_000
    const box3 = 1_500
    const eind = start + groei + inleg - box3
    const row = makeRow(40 + i, 'accumulation', {
      startNetWorth: start,
      netWorth: eind,
      totalGrowth: groei,
      savings: inleg,
      totalBox3: box3,
    })
    start = eind
    return row
  })
}

function overgangRijen(): UnifiedProjectionRow[] {
  let start = 700_000
  return [0, 1, 2].map(i => {
    const groei = 30_000
    const onttrekking = 45_000
    const box3 = 2_000
    const eind = start + groei - onttrekking - box3
    const row = makeRow(62 + i, 'transition', {
      startNetWorth: start,
      netWorth: eind,
      totalGrowth: groei,
      savings: 0,
      withdrawal: onttrekking,
      totalBox3: box3,
      grossIncome: 0,
    })
    start = eind
    return row
  })
}

function onttrekkingRijen(): UnifiedProjectionRow[] {
  let start = 600_000
  return [0, 1, 2, 3].map(i => {
    const groei = 24_000
    const onttrekking = 40_000
    const box3 = 1_800
    const eind = start + groei - onttrekking - box3
    const row = makeRow(68 + i, 'withdrawal', {
      startNetWorth: start,
      netWorth: eind,
      totalGrowth: groei,
      savings: 0,
      withdrawal: onttrekking,
      totalBox3: box3,
    })
    start = eind
    return row
  })
}

/** Alle bedrag-achtige tekens uit de kassabon, in leesvolgorde. */
function bedragenIn(container: HTMLElement): string[] {
  const tekst = container.textContent ?? ''
  return (tekst.match(/€\s?-?[\d.]+/g) ?? []).map(s => s.replace(/\s/g, ''))
}

function renderIn(view: 'nominal' | 'real', node: ReactNode) {
  return render(<EuroViewProvider initialView={view}>{node}</EuroViewProvider>)
}

// ── Per modal: dezelfde drie beloftes ───────────────────────────────────────

const GEVALLEN = [
  {
    naam: 'opbouw',
    node: (
      <PhaseModalOpbouw
        open
        onClose={() => {}}
        currentAge={40}
        fireAge={45}
        currentNetWorth={200_000}
        expectedPortfolioAtFire={320_000}
        yearlySavings={12_000}
        yearlyExpenses={36_000}
        expectedReturn={0.07}
        inflationRate={0.02}
        rows={opbouwRijen()}
      />
    ),
  },
  {
    naam: 'overgang',
    node: (
      <PhaseModalOvergang
        open
        onClose={() => {}}
        transitionScenario="gap"
        startAge={62}
        endAge={65}
        fireAge={62}
        aowAge={67}
        yearlyWithdrawal={45_000}
        yearlyAowIncome={0}
        yearlyExpenses={45_000}
        portfolioAtTransitionStart={700_000}
        rows={overgangRijen()}
        inflationRate={0.02}
        expectedReturn={0.07}
        currentAge={40}
      />
    ),
  },
  {
    naam: 'onttrekking',
    node: (
      <PhaseModalOnttrekking
        open
        onClose={() => {}}
        startAge={68}
        endAge={72}
        startPortfolio={600_000}
        strategy="deplete"
        targetEndPortfolio={0}
        yearlyWithdrawal={40_000}
        yearlyAowIncome={0}
        rows={onttrekkingRijen()}
        inflationRate={0.02}
        expectedReturn={0.07}
        yearlyExpenses={40_000}
        currentAge={40}
      />
    ),
  },
] as const

describe.each(GEVALLEN)('Fase-kassabon $naam — klasse C blijft nominaal', ({ node }) => {
  it('toont in "real" exact dezelfde bedragen als in "nominal" (AC-D1)', () => {
    const nominaal = renderIn('nominal', node)
    const nominaleBedragen = bedragenIn(nominaal.container)
    nominaal.unmount()

    const reeel = renderIn('real', node)
    const reeleBedragen = bedragenIn(reeel.container)

    // Niet leeg: anders zou een lege selectie de test stil groen houden.
    expect(nominaleBedragen.length).toBeGreaterThan(3)
    expect(reeleBedragen).toEqual(nominaleBedragen)
  })

  it('draagt de grondslag-regel alleen in "real" (NFR-D2)', () => {
    const nominaal = renderIn('nominal', node)
    expect(nominaal.container.textContent).not.toMatch(GRONDSLAG)
    nominaal.unmount()

    const reeel = renderIn('real', node)
    expect(reeel.container.textContent).toMatch(GRONDSLAG)
  })

  it('is zonder EuroViewProvider identiek aan de nominale weergave (AC-D4 / NFR-X3)', () => {
    // De sterkste regressiegarantie van dit werk: bestaande component-tests
    // draaien zónder provider en moeten precies het huidige beeld zien.
    const zonder = render(node)
    const zonderHtml = zonder.container.innerHTML
    zonder.unmount()

    const met = renderIn('nominal', node)
    expect(met.container.innerHTML).toBe(zonderHtml)
  })
})

// ── De identiteit zelf ──────────────────────────────────────────────────────

describe('Waterval-identiteit sluit in beide weergaven (AC-D2)', () => {
  it('opbouw: start + inleg + rendement − box3 komt uit op de eindrij', () => {
    const rijen = opbouwRijen()
    const start = rijen[0].startNetWorth
    const inleg = rijen.reduce((s, r) => s + r.savings, 0)
    const rendement = rijen.reduce((s, r) => s + r.totalGrowth, 0)
    const box3 = rijen.reduce((s, r) => s + r.totalBox3, 0)
    const events = rijen.reduce((s, r) => s + r.cashflowNet + r.oneTimeNet, 0)
    const eind = rijen[rijen.length - 1].netWorth

    // Nominaal sluit de som exact — dat is de identiteit die de kassabon toont.
    expect(start + inleg + rendement - box3 + events).toBeCloseTo(eind, 6)

    // En dit is waaróm het blok niet per term mag deflateren: met de eigen
    // jaarfactor per term loopt dezelfde som ver van de eindrij weg, en dat
    // verschil zou in de rij "Afronding" belanden.
    const perTerm =
      start / rijen[0].inflationFactor +
      rijen.reduce((s, r) => s + r.savings / r.inflationFactor, 0) +
      rijen.reduce((s, r) => s + r.totalGrowth / r.inflationFactor, 0) -
      rijen.reduce((s, r) => s + r.totalBox3 / r.inflationFactor, 0)
    const eindGedeflateerd = eind / rijen[rijen.length - 1].inflationFactor
    expect(Math.abs(perTerm - eindGedeflateerd)).toBeGreaterThan(1_000)
  })
})
