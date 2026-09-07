/**
 * UR3-08 vervolg — de redactionele VRIJHEIDSDAGEN-regel van de drie fase-modals.
 *
 * ── Waarom deze test bestaat ────────────────────────────────────────────────
 * `phase-modal-kassabon.euro-view.test.tsx` bewaakt het klasse-C-kassabonblok
 * (blijft nominaal). De redactionele noot eronder viel daar volledig buiten —
 * en juist dáár stonden drie fouten, elk onzichtbaar in CI:
 *
 *  1. OPBOUW rekende je huidige spaarbedrag om tegen `yearlyMustExpenses / 365`:
 *     je uitgavenniveau NA je stoppen. Een tweede wisselkoers op een pagina die
 *     met KRUIS-20 juist op één koers was gezet.
 *  2. OVERGANG deelde een NOMINALE kernelwaarde op een toekomstige leeftijd
 *     (`startNetWorth`, inclusief de eigen woning) door een dagtarief van nu —
 *     precies de 1,3–1,8× overschatting uit ADR 0093 §11, bovenop een grondslag
 *     die niet-liquide bezit als op te leven vrijheidsdagen presenteerde.
 *  3. ONTTREKKING toonde een tautologie: teller = het inkomen dat per
 *     kernelconstructie exact de noemer dekt, dus ≈365 by design.
 *
 * ── Waarom deze fixture bijt ────────────────────────────────────────────────
 * De drie grondslagen staan expres VER uit elkaar:
 *   · canoniek dagtarief            € 105/dag  (bundel, 12-mnd rolling)
 *   · `yearlyMustExpenses / 365`    ≈ € 82/dag (pensioenniveau — de oude noemer)
 *   · `monthlyExpenses * 12 / 365`  ≈ € 123/dag (de DERDE koers van overgang)
 * en `inflationFactor` loopt op tot ~1,8. Een terugval naar de eigen som ÉN het
 * vergeten van de deflatie rendert dus een zichtbaar ander getal, in plaats van
 * binnen de afrondingsruis te verdwijnen.
 *
 * Verwachtingen worden hier uit `factorAtAge` (lib/euro-display) + de kale
 * deling opgebouwd, NIET uit de productie-helper — anders zou een fout in die
 * helper zichzelf groen verklaren.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'
import { EuroViewProvider } from '@/lib/hooks/use-euro-view'
import { factorAtAge } from '@/lib/euro-display'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import { PhaseModalOpbouw } from './phase-modal-opbouw'
import { PhaseModalOvergang } from './phase-modal-overgang'
import { PhaseModalOnttrekking } from './phase-modal-onttrekking'

// ── Mocks: stub de zware analyse-secties; deze test gaat over één regel ──────
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

// ── De drie grondslagen, expres ver uit elkaar ──────────────────────────────

/** `HorizonPageData.dailyExpenseRate` — 12-mnd rolling consumptie. DE koers. */
const CANONIEK_DAGTARIEF = 105
/** `effectiveInput.yearlyMustExpenses` — pensioenniveau; /365 ≈ € 82/dag (oud). */
const YEARLY_MUST_EXPENSES = 30_000
/** `overgangData.yearlyExp` (= monthlyExpenses × 12); /365 ≈ € 123/dag (derde koers). */
const OVERGANG_YEARLY_EXP = 45_000

const HUIDIGE_LEEFTIJD = 40
const FIRE_LEEFTIJD = 62
const AOW_LEEFTIJD = 65
const EIND_LEEFTIJD = 71

const JAARLIJKSE_BESPARING = 24_000 // → € 2.000/mnd

/**
 * De J-grondslag (netto LIQUIDE) op de startleeftijd van elke fase, en de
 * I-grondslag ernaast. Ze lopen expres ver uiteen (€ 300k eigen woning), zodat
 * een terugval op `startNetWorth` onmiddellijk zichtbaar is.
 */
const OVERGANG_START_LIQUIDE = 500_000
const OVERGANG_START_NETWORTH = 800_000
const ONTTREKKING_START_LIQUIDE = 420_000
const ONTTREKKING_START_NETWORTH = 700_000

const INFLATIE = 0.02

// ── Rijen ───────────────────────────────────────────────────────────────────

function makeRow(
  age: number,
  phase: UnifiedProjectionRow['phase'],
  overrides: Partial<UnifiedProjectionRow> = {},
): UnifiedProjectionRow {
  const year = age - HUIDIGE_LEEFTIJD
  return {
    year,
    age,
    phase,
    assetBuckets: {
      investment: { startValue: 200_000, growth: 14_000, contributions: 12_000, box3Drag: 1_500, endValue: 224_500 },
    },
    debtBalances: {},
    totalAssets: 224_500,
    totalDebts: 0,
    netWorth: 224_500,
    startNetWorth: 200_000,
    nettoLiquide: 224_500,
    startNettoLiquide: 200_000,
    grossIncome: 0,
    savings: 0,
    withdrawal: 0,
    withdrawalByType: {},
    cashflowNet: 0,
    oneTimeNet: 0,
    totalGrowth: 14_000,
    totalBox3: 1_500,
    cumulativeBox3: 1_500 * (year + 1),
    // 2% over ~31 jaar → factor loopt op tot ~1,85.
    inflationFactor: Math.pow(1 + INFLATIE, year),
    ...overrides,
  }
}

/** Volledige projectie: opbouw 40→61, overgang 62→64, onttrekking 65→71. */
function alleRijen(): UnifiedProjectionRow[] {
  const rijen: UnifiedProjectionRow[] = []
  for (let age = HUIDIGE_LEEFTIJD; age < FIRE_LEEFTIJD; age++) {
    rijen.push(makeRow(age, 'accumulation', { savings: JAARLIJKSE_BESPARING }))
  }
  for (let age = FIRE_LEEFTIJD; age < AOW_LEEFTIJD; age++) {
    rijen.push(
      makeRow(age, 'transition', {
        withdrawal: 45_000,
        startNetWorth: age === FIRE_LEEFTIJD ? OVERGANG_START_NETWORTH : 750_000,
        startNettoLiquide: age === FIRE_LEEFTIJD ? OVERGANG_START_LIQUIDE : 470_000,
      }),
    )
  }
  for (let age = AOW_LEEFTIJD; age <= EIND_LEEFTIJD; age++) {
    rijen.push(
      makeRow(age, 'withdrawal', {
        withdrawal: 40_000,
        startNetWorth: age === AOW_LEEFTIJD ? ONTTREKKING_START_NETWORTH : 650_000,
        startNettoLiquide: age === AOW_LEEFTIJD ? ONTTREKKING_START_LIQUIDE : 390_000,
      }),
    )
  }
  return rijen
}

const ROWS = alleRijen()

// ── Verwachting: teller exact één keer deflateren, noemer nooit ─────────────

/** De canonieke som, met de hand — géén productie-helper. */
function verwachteDagen(nominaalBedrag: number, leeftijd: number | null): number {
  const factor = leeftijd == null ? 1 : factorAtAge(ROWS, leeftijd)
  return Math.round(nominaalBedrag / factor / CANONIEK_DAGTARIEF)
}

const nl = (n: number) => n.toLocaleString('nl-NL')

function renderIn(view: 'nominal' | 'real', node: ReactNode) {
  return render(<EuroViewProvider initialView={view}>{node}</EuroViewProvider>)
}

/**
 * De redactionele noot. Primair op de testid die de fix aanbrengt; met een
 * terugval op de PROZA van de huidige (foute) regels, zodat deze test vóór de
 * fix bijt op het GETAL en niet slechts op een ontbrekende testid.
 */
const NOOT_PROZA = /vrijheidsdag|eerder verdiende vrijheid|vrijheid geleefd|opgebouwde vrijheid/i

function noot(container: HTMLElement): HTMLElement | null {
  const viaTestid = container.querySelector<HTMLElement>('[data-testid="vrijheidsdagen-noot"]')
  if (viaTestid) return viaTestid
  const kandidaten = Array.from(container.querySelectorAll<HTMLElement>('p'))
  return kandidaten.find(el => NOOT_PROZA.test(el.textContent ?? '')) ?? null
}

// ── Nodes ───────────────────────────────────────────────────────────────────

function opbouwNode(overrides: Record<string, unknown> = {}) {
  return (
    <PhaseModalOpbouw
      open
      onClose={() => {}}
      currentAge={HUIDIGE_LEEFTIJD}
      fireAge={FIRE_LEEFTIJD}
      currentNetWorth={200_000}
      expectedPortfolioAtFire={OVERGANG_START_NETWORTH}
      yearlySavings={JAARLIJKSE_BESPARING}
      yearlyExpenses={YEARLY_MUST_EXPENSES}
      expectedReturn={0.07}
      inflationRate={INFLATIE}
      rows={ROWS}
      canonicalDailyRate={CANONIEK_DAGTARIEF}
      dailyRateSource="transactions"
      {...overrides}
    />
  )
}

function overgangNode(overrides: Record<string, unknown> = {}) {
  return (
    <PhaseModalOvergang
      open
      onClose={() => {}}
      transitionScenario="gap"
      startAge={FIRE_LEEFTIJD}
      endAge={AOW_LEEFTIJD}
      fireAge={FIRE_LEEFTIJD}
      aowAge={67}
      yearlyWithdrawal={45_000}
      yearlyAowIncome={0}
      yearlyExpenses={OVERGANG_YEARLY_EXP}
      portfolioAtTransitionStart={OVERGANG_START_NETWORTH}
      nettoLiquideAtStart={OVERGANG_START_LIQUIDE}
      rows={ROWS}
      inflationRate={INFLATIE}
      expectedReturn={0.07}
      currentAge={HUIDIGE_LEEFTIJD}
      canonicalDailyRate={CANONIEK_DAGTARIEF}
      dailyRateSource="transactions"
      {...overrides}
    />
  )
}

function onttrekkingNode(overrides: Record<string, unknown> = {}) {
  return (
    <PhaseModalOnttrekking
      open
      onClose={() => {}}
      startAge={AOW_LEEFTIJD}
      endAge={EIND_LEEFTIJD}
      startPortfolio={ONTTREKKING_START_NETWORTH}
      nettoLiquideAtStart={ONTTREKKING_START_LIQUIDE}
      strategy="deplete"
      targetEndPortfolio={0}
      yearlyWithdrawal={40_000}
      yearlyAowIncome={0}
      rows={ROWS}
      inflationRate={INFLATIE}
      expectedReturn={0.07}
      yearlyExpenses={YEARLY_MUST_EXPENSES}
      currentAge={HUIDIGE_LEEFTIJD}
      canonicalDailyRate={CANONIEK_DAGTARIEF}
      dailyRateSource="transactions"
      {...overrides}
    />
  )
}

// ── 1. Opbouw ───────────────────────────────────────────────────────────────

describe('Opbouwfase — vrijheidsdagen per maand op het CANONIEKE dagtarief', () => {
  it('deelt de maandbesparing door het canonieke tarief, niet door yearlyMustExpenses/365', () => {
    const verwacht = verwachteDagen(JAARLIJKSE_BESPARING / 12, null)
    const oud = Math.round(JAARLIJKSE_BESPARING / 12 / (YEARLY_MUST_EXPENSES / 365))

    expect(verwacht, 'fixture stuk: beide koersen geven hetzelfde getal').not.toBe(oud)

    const { container } = renderIn('nominal', opbouwNode())
    const tekst = noot(container)?.textContent ?? ''

    expect(tekst).toContain(`${nl(verwacht)} vrijheidsdagen`)
    expect(tekst).not.toContain(`${nl(oud)} vrijheidsdagen`)
  })

  it('verbergt de regel bij yearlySavings <= 0 (klasse-C-terugval vervallen)', () => {
    // De oude terugval was `totalInleg / yearsAccumulation / 12` — een gemiddelde
    // over de héle opbouwfase (klasse C, ADR 0093 §1) en dus niet eerlijk
    // vertaalbaar. Geen besparing = geen regel, geen verzonnen gemiddelde.
    const { container } = renderIn('nominal', opbouwNode({ yearlySavings: 0 }))
    expect(noot(container)).toBeNull()
  })
})

// ── 2. Overgang ─────────────────────────────────────────────────────────────

describe('Overgangsfase — J-grondslag, exact één keer gedeflateerd', () => {
  it('rekent startNettoLiquide op de startleeftijd om, niet startNetWorth van nu', () => {
    const verwacht = verwachteDagen(OVERGANG_START_LIQUIDE, FIRE_LEEFTIJD)

    // (a) niet gedeflateerd — de ADR 0093 §11-overschatting
    const zonderDeflatie = Math.round(OVERGANG_START_LIQUIDE / CANONIEK_DAGTARIEF)
    // (b) I-grondslag i.p.v. J — de eigen woning meegeteld
    const metHuis = verwachteDagen(OVERGANG_START_NETWORTH, FIRE_LEEFTIJD)
    // (c) de derde koers: monthlyExpenses × 12 / 365
    const derdeKoers = Math.round(
      OVERGANG_START_NETWORTH / (OVERGANG_YEARLY_EXP / 365),
    )

    expect(new Set([verwacht, zonderDeflatie, metHuis, derdeKoers]).size,
      'fixture stuk: de vier varianten moeten alle vier verschillen').toBe(4)

    const { container } = renderIn('nominal', overgangNode())
    const tekst = noot(container)?.textContent ?? ''

    expect(tekst).toContain(nl(verwacht))
    expect(tekst).not.toContain(nl(zonderDeflatie))
    expect(tekst).not.toContain(nl(metHuis))
    expect(tekst).not.toContain(nl(derdeKoers))
  })
})

// ── 3. Onttrekking ──────────────────────────────────────────────────────────

describe('Onttrekkingsfase — de tautologie is vervangen door de klasse-S-spiegel', () => {
  it('toont de beginstand in vrijheidsdagen, niet "gemiddeld N per jaar"', () => {
    const verwacht = verwachteDagen(ONTTREKKING_START_LIQUIDE, AOW_LEEFTIJD)

    const { container } = renderIn('nominal', onttrekkingNode())
    const tekst = noot(container)?.textContent ?? ''

    expect(tekst).toContain(nl(verwacht))
    // De oude tautologie: (onttrekking + AOW) / (uitgaven/365) ≈ 365 by design.
    expect(tekst).not.toMatch(/per jaar/i)
    expect(tekst).not.toContain(nl(Math.round(40_000 / (YEARLY_MUST_EXPENSES / 365))))
  })

  it('valt niet terug op startNetWorth (inclusief eigen woning)', () => {
    const metHuis = verwachteDagen(ONTTREKKING_START_NETWORTH, AOW_LEEFTIJD)
    const { container } = renderIn('nominal', onttrekkingNode())
    expect(noot(container)?.textContent ?? '').not.toContain(nl(metHuis))
  })
})

// ── 4. Real-verankering: identiek in beide weergaven ────────────────────────

describe('Vrijheidstijd is real-verankerd — identiek in "nominal" en "real"', () => {
  const GEVALLEN = [
    { naam: 'opbouw', node: opbouwNode },
    { naam: 'overgang', node: overgangNode },
    { naam: 'onttrekking', node: onttrekkingNode },
  ] as const

  it.each(GEVALLEN)('$naam springt niet bij het wisselen van de euro-weergave', ({ node }) => {
    const nominaal = renderIn('nominal', node())
    const nominaleTekst = noot(nominaal.container)?.textContent ?? ''
    cleanup()

    const reeel = renderIn('real', node())
    const reeleTekst = noot(reeel.container)?.textContent ?? ''

    expect(nominaleTekst, 'noot ontbreekt — dan bewijst deze test niets').not.toBe('')
    expect(reeleTekst).toBe(nominaleTekst)
  })
})

// ── 5. ADR 0131: onbekend is geen nul ───────────────────────────────────────

describe("Geen regel bij dailyRateSource 'none' (ADR 0131)", () => {
  const GEVALLEN = [
    { naam: 'opbouw', node: opbouwNode },
    { naam: 'overgang', node: overgangNode },
    { naam: 'onttrekking', node: onttrekkingNode },
  ] as const

  // canonicalDailyRate blijft BEWUST geldig: zou hij hier op 0 staan, dan vangt
  // de `canonicalDailyRate <= 0`-guard het geval al af en blijft deze suite groen
  // ook als je de `source === 'none'`-regel sloopt — terwijl dat de enige regel
  // is die ADR 0131 afdwingt. Eén knop tegelijk omzetten.
  it.each(GEVALLEN)('$naam toont geen vrijheidsdagen zonder geloofwaardige grondslag', ({ node }) => {
    const { container } = renderIn('nominal', node({ dailyRateSource: 'none', canonicalDailyRate: 105 }))
    expect(noot(container)).toBeNull()
  })

  it.each(GEVALLEN)('$naam toont de regel WEL bij een geldige grondslag (tegenproef)', ({ node }) => {
    const { container } = renderIn('nominal', node({ dailyRateSource: 'transactions', canonicalDailyRate: 105 }))
    expect(noot(container)).not.toBeNull()
  })
})
