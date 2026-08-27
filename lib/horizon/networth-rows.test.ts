import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildSimNetWorthRows } from './networth-rows'
import { deflate } from '@/lib/euro-display'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import {
  deriveHousingContext,
  type HousingStrategyConfig,
} from '@/lib/housing-strategy'

/**
 * Variant-tabel-test voor de grafiek-dip-fix (jun 2026), na de v2-verwijdering
 * (FASE 6 stap 5A: de horizon-kernel is de enige motor — `useV2`/`v1DownsizeSaleAge`
 * bestaan niet meer).
 *
 * `buildSimNetWorthRows` levert het GEPROJECTEERDE VOLLEDIGE netto vermogen per
 * jaar (FIRE-pot + meegroeiende niet-liquide assets). Deze test valideert:
 *   - continuïteit vandaag→jaar-1: |simNetWorthRows[0] − currentNetWorth| < ε;
 *   - include_full/reverse_mortgage: reeks ≡ endPortfolio (geen optelling);
 *   - exclude_from_fire (zonder houseInLedger): reeks > endPortfolio met
 *     meegroeiende huiswaarde, geen dip;
 *   - houseInLedger (kernel-tak): huis al in endPortfolio, nooit bijtellen.
 */

const EPS = 1 // €1 tolerantie (afronding)

// Eigen huis €400k @ 2%/jr nominaal, hypotheek €200k annuïteit.
const DOB = '1986-01-01' // ~40 jr op 2026 (deterministisch; hier alleen relatief)
const HOUSE_VALUE = 400_000
const HOUSE_RETURN = 2 // %
const MORTGAGE_BALANCE = 200_000

function makeAssets(): Asset[] {
  return [
    {
      id: 'huis',
      name: 'Eigen woning',
      asset_type: 'eigen_huis',
      current_value: HOUSE_VALUE,
      woz_value: HOUSE_VALUE,
      expected_return: HOUSE_RETURN,
      is_active: true,
      net_worth_inclusion_pct: 100,
      depreciation_rate: 0,
    },
    {
      id: 'beleggingen',
      name: 'Beleggingen',
      asset_type: 'investment',
      current_value: 100_000,
      woz_value: null,
      expected_return: 7,
      is_active: true,
      net_worth_inclusion_pct: 100,
      depreciation_rate: 0,
    },
  ] as unknown as Asset[]
}

function makeDebts(): Debt[] {
  return [
    {
      id: 'hyp',
      name: 'Hypotheek',
      debt_type: 'mortgage',
      current_balance: MORTGAGE_BALANCE,
      interest_rate: 2.9,
      monthly_payment: 1100,
      repayment_type: 'annuiteit',
      is_tax_deductible: true,
      linked_asset_id: 'huis',
      end_date: null,
      net_worth_inclusion_pct: 100,
      include_aflossing_in_savings: false,
      is_active: true,
    },
  ] as unknown as Debt[]
}

const assets = makeAssets()
const debts = makeDebts()
const ctx = deriveHousingContext(assets, debts)
// Overwaarde vandaag (= huiswaarde − hypotheeksaldo).
const houseEquityNow = Math.max(0, ctx.eigenHuisValue - ctx.mortgageBalance)

const currentAge = 40
const fireAge = 52

/**
 * Weergave-deflator per fixture-jaar. Spiegelt de kernel: jaar 0 = exact 1.0,
 * daarna oplopend. Fixture-waarde, geen weergave-berekening.
 */
const TEST_INFLATION = 0.025
function factorAt(age: number): number {
  return Math.pow(1 + TEST_INFLATION, age - currentAge)
}

// De kernel levert per leeftijdsJAAR twee standen: `startPortfolio` (stand ÓP
// `age`) en `endPortfolio` (stand op `age + 1`). De weergavereeks leest de
// eerste; de fixtures dragen daarom beide, zodat ze de echte SimRow-vorm
// spiegelen i.p.v. één veld dat "de waarde van dit jaar" moet voorstellen.
type FixtureRow = {
  age: number
  startPortfolio: number
  endPortfolio: number
  inflationFactor: number
}

/**
 * Bouw een gefilterd `endPortfolio`-pad (zónder huis): het LIQUIDE deel groeit
 * van currentNetWorth − overwaarde naar boven. Dit is wat de engine voor
 * exclude_from_fire teruggeeft.
 */
function buildEndPortfolioFiltered(): FixtureRow[] {
  const rows: FixtureRow[] = []
  let v = 100_000 // start liquide (beleggingen)
  for (let age = currentAge; age <= fireAge; age++) {
    const next = v * 1.06 + 15_000
    rows.push({
      age,
      startPortfolio: Math.round(v),
      endPortfolio: Math.round(next),
      inflationFactor: factorAt(age),
    })
    v = next
  }
  return rows
}

/**
 * Bouw een VOLLEDIG `endPortfolio`-pad (mét huis): voor de niet-filterende modi
 * geeft de engine het volledige netto vermogen terug.
 */
function buildEndPortfolioFull(): FixtureRow[] {
  return buildEndPortfolioFiltered().map((r) => ({
    age: r.age,
    // Voeg de overwaarde-van-nu erbij als ruwe benadering van "huis zit erin".
    startPortfolio: r.startPortfolio + houseEquityNow,
    endPortfolio: r.endPortfolio + houseEquityNow,
    inflationFactor: r.inflationFactor,
  }))
}

/** Zelfde bedragen, alle factoren maal `k` — om te bewijzen dat ze nergens meerekenen. */
function scaleFactors(rows: FixtureRow[], k: number): FixtureRow[] {
  return rows.map((r) => ({ ...r, inflationFactor: r.inflationFactor * k }))
}

// currentNetWorth = volledig netto vermogen vandaag (liquide + overwaarde).
const currentNetWorth = 100_000 + houseEquityNow

const NON_FILTERING: { mode: HousingStrategyConfig; label: string }[] = [
  { mode: { mode: 'include_full' }, label: 'include_full' },
  {
    mode: {
      mode: 'reverse_mortgage',
      trigger: 'fixed_age',
      triggerAge: 67,
      depletionThresholdYears: 0,
      maxLoanPct: 0.5,
      interestRate: 0.055,
      monthlyPayout: null,
    },
    label: 'reverse_mortgage',
  },
]

describe('buildSimNetWorthRows — niet-filterende modi: reeks ≡ endPortfolio', () => {
  for (const variant of NON_FILTERING) {
    it(`${variant.label}: simNetWorthRows ≡ endPortfolio (geen huis-optelling)`, () => {
      const simRows = buildEndPortfolioFull()
      const out = buildSimNetWorthRows({
        simRows,
        currentNetWorth,
        housingStrategy: variant.mode,
        assets,
        debts,
        dateOfBirth: DOB,
      })
      // currentNetWorth ≈ endPortfolio[0] (volledig pad), dus de reconcile-offset
      // is ~0 en de reeks blijft gelijk aan endPortfolio.
      expect(out.length).toBe(simRows.length)
      for (let i = 0; i < out.length; i++) {
        expect(Math.abs(out[i].netWorth - simRows[i].startPortfolio)).toBeLessThanOrEqual(EPS)
      }
    })

    it(`${variant.label}: continuïteit vandaag→jaar-1 (|rij0 − currentNetWorth| < ε)`, () => {
      const simRows = buildEndPortfolioFull()
      const out = buildSimNetWorthRows({
        simRows,
        currentNetWorth,
        housingStrategy: variant.mode,
        assets,
        debts,
        dateOfBirth: DOB,
      })
      expect(Math.abs(out[0].netWorth - currentNetWorth)).toBeLessThanOrEqual(EPS)
    })
  }
})

describe('buildSimNetWorthRows — exclude_from_fire (zonder houseInLedger): huis-overwaarde erbij, geen dip', () => {
  const cfg: HousingStrategyConfig = { mode: 'exclude_from_fire' }

  it('reeks > endPortfolio met meegroeiende huiswaarde', () => {
    const simRows = buildEndPortfolioFiltered()
    const out = buildSimNetWorthRows({
      simRows,
      currentNetWorth,
      housingStrategy: cfg,
      assets,
      debts,
      dateOfBirth: DOB,
    })
    // Elke rij telt overwaarde bij → reeks ligt boven het gefilterde endPortfolio.
    for (let i = 0; i < out.length; i++) {
      expect(out[i].netWorth).toBeGreaterThan(simRows[i].startPortfolio)
    }
    // De huiswaarde groeit → de bijdrage neemt toe over de jaren.
    const contribFirst = out[0].netWorth - simRows[0].startPortfolio
    const contribLast = out[out.length - 1].netWorth - simRows[simRows.length - 1].startPortfolio
    expect(contribLast).toBeGreaterThan(contribFirst)
  })

  it('continuïteit — geen dip direct na vandaag (rij0 ≈ currentNetWorth)', () => {
    const simRows = buildEndPortfolioFiltered()
    const out = buildSimNetWorthRows({
      simRows,
      currentNetWorth,
      housingStrategy: cfg,
      assets,
      debts,
      dateOfBirth: DOB,
    })
    expect(Math.abs(out[0].netWorth - currentNetWorth)).toBeLessThanOrEqual(EPS)
    // Geen dip: rij 1 ligt niet structureel ónder currentNetWorth door het
    // wegvallen van het huis (zoals de bug deed). De reeks stijgt of blijft.
    expect(out[1].netWorth).toBeGreaterThanOrEqual(out[0].netWorth - EPS)
  })
})

describe('buildSimNetWorthRows — kernel-tak (houseInLedger): huis al in het grootboek', () => {
  // Op de kernel-tak zit het eigen huis voor ÉLKE modus al in endPortfolio
  // (= LedgerRow nettoVermogen). De helper mag dan nooit overwaarde bijtellen —
  // ook niet bij exclude_from_fire, waar de filterende modus dat juist WÉL doet.
  // Spiegelt de `houseInLedger`-kortsluiting van applyHousingToComposition op /toekomst.
  for (const mode of ['exclude_from_fire', 'downsize'] as const) {
    const cfg: HousingStrategyConfig =
      mode === 'exclude_from_fire'
        ? { mode: 'exclude_from_fire' }
        : {
            mode: 'downsize',
            trigger: 'fixed_age',
            triggerAge: 67,
            depletionThresholdYears: 0,
            salePricePct: 1,
            salesCostsPct: 0.04,
            newMonthlyHousingCost: null,
          }

    it(`${mode} + houseInLedger → reeks ≡ endPortfolio (geen huis-optelling)`, () => {
      // Kernel geeft het VOLLEDIGE pad (huis zit in endPortfolio).
      const simRows = buildEndPortfolioFull()
      const out = buildSimNetWorthRows({
        simRows,
        currentNetWorth,
        housingStrategy: cfg,
        houseInLedger: true,
        assets,
        debts,
        dateOfBirth: DOB,
      })
      expect(out.length).toBe(simRows.length)
      for (let i = 0; i < out.length; i++) {
        expect(Math.abs(out[i].netWorth - simRows[i].startPortfolio)).toBeLessThanOrEqual(EPS)
      }
    })
  }

  it('exclude_from_fire: houseInLedger onderdrukt de overwaarde-optelling van de filterende modus', () => {
    const cfg: HousingStrategyConfig = { mode: 'exclude_from_fire' }
    // Zelfde (gefilterde) endPortfolio-invoer; alleen de kernel-vlag verschilt.
    const simRows = buildEndPortfolioFiltered()
    const base = {
      simRows,
      currentNetWorth,
      housingStrategy: cfg,
      assets,
      debts,
      dateOfBirth: DOB,
    }
    const filtered = buildSimNetWorthRows({ ...base, houseInLedger: false })
    const kernel = buildSimNetWorthRows({ ...base, houseInLedger: true })
    // De filterende modus telt de meegroeiende overwaarde bij; de kernel-tak niet.
    // In de latere jaren (huiswaarde gegroeid) ligt de filterende reeks strikt boven.
    const last = simRows.length - 1
    expect(filtered[last].netWorth).toBeGreaterThan(kernel[last].netWorth + EPS)
  })

  it('houseInLedger weggelaten ≡ houseInLedger:false (byte-identiek, default-veilig)', () => {
    const cfg: HousingStrategyConfig = { mode: 'exclude_from_fire' }
    const simRows = buildEndPortfolioFiltered()
    const base = {
      simRows,
      currentNetWorth,
      housingStrategy: cfg,
      assets,
      debts,
      dateOfBirth: DOB,
    }
    const omitted = buildSimNetWorthRows(base)
    const explicitFalse = buildSimNetWorthRows({ ...base, houseInLedger: false })
    expect(omitted).toEqual(explicitFalse)
  })
})

/* ───────────────────────────────────────────────────────────────────────────
 * Euro-weergave (ADR 0090) — `inflationFactor` reist mee, de wiskunde niet.
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * AC-E5 — BYTE-IDENTIEKE RECONCILE-OFFSET.
 *
 * Deze arrays zijn vastgelegd door de implementatie te draaien VÓÓR
 * `inflationFactor` bestond, met exact deze fixtures en een vastgezette klok.
 * Ze zijn dus geen her-afleiding van de huidige code maar een foto van de oude:
 * wijkt één cent af, dan heeft het doorgeven van de factor de her-ankering
 * geraakt en is de grens uit D7 (offset nominaal, deflatie pas in de render)
 * gebroken. Regenereren mag alleen bij een bewuste wijziging aan de offset zelf.
 *
 * De klok staat vast omdat `buildSimNetWorthRows` de huidige leeftijd uit de
 * geboortedatum leest (`ageAtDate`) en de huisbijdrage daarop projecteert —
 * zonder pin zouden deze goldens in januari 2027 vanzelf verschuiven.
 */
const GOLDEN_CLOCK = new Date('2026-08-08T12:00:00Z')

/** include_full (volledig endPortfolio-pad) — reconcile-offset ≈ 0. */
const GOLDEN_INCLUDE_FULL = [
  300000, 321000, 343260, 366856, 391867, 418379, 446482,
  476271, 507847, 541318, 576797, 614404, 654269,
]

/** exclude_from_fire zónder houseInLedger — meegroeiende overwaarde erbij. */
const GOLDEN_EXCLUDE_FROM_FIRE = [
  300000, 336499.15, 374638.7, 414504.31000000006, 456184.924,
  499776.72128000006, 545380.1677056, 593101.007059712, 643051.2524009063,
  695350.2074489244, 750122.4979979029, 807500.023357861, 867625.0178250181,
]

/** kernel-tak (houseInLedger) — huis zit al in endPortfolio, niets bijtellen. */
const GOLDEN_HOUSE_IN_LEDGER = GOLDEN_INCLUDE_FULL

describe('buildSimNetWorthRows — euro-weergave: factor erbij, reconcile-offset ongemoeid', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(GOLDEN_CLOCK)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('AC-E5: include_full — netWorth-reeks byte-identiek aan vóór de contractuitbreiding', () => {
    const out = buildSimNetWorthRows({
      simRows: buildEndPortfolioFull(),
      currentNetWorth,
      housingStrategy: { mode: 'include_full' },
      assets,
      debts,
      dateOfBirth: DOB,
    })
    expect(out.map((r) => r.netWorth)).toEqual(GOLDEN_INCLUDE_FULL)
  })

  it('AC-E5: exclude_from_fire — netWorth-reeks byte-identiek (offset + huisbijdrage ongewijzigd)', () => {
    const out = buildSimNetWorthRows({
      simRows: buildEndPortfolioFiltered(),
      currentNetWorth,
      housingStrategy: { mode: 'exclude_from_fire' },
      assets,
      debts,
      dateOfBirth: DOB,
    })
    expect(out.map((r) => r.netWorth)).toEqual(GOLDEN_EXCLUDE_FROM_FIRE)
  })

  it('AC-E5: kernel-tak (houseInLedger) — netWorth-reeks byte-identiek', () => {
    const out = buildSimNetWorthRows({
      simRows: buildEndPortfolioFull(),
      currentNetWorth,
      housingStrategy: { mode: 'exclude_from_fire' },
      houseInLedger: true,
      assets,
      debts,
      dateOfBirth: DOB,
    })
    expect(out.map((r) => r.netWorth)).toEqual(GOLDEN_HOUSE_IN_LEDGER)
  })

  it('AC-E5: een ANDERE factorreeks levert exact dezelfde netWorth-reeks op', () => {
    // De scherpste vorm van "de factor zit in geen enkele som": verdubbel de hele
    // reeks factoren en eis dat er nul euro beweegt. Zou `inflationFactor` ergens
    // in de offset of de huisbijdrage lekken, dan wijkt dit meteen af.
    const base = {
      currentNetWorth,
      housingStrategy: { mode: 'exclude_from_fire' } as HousingStrategyConfig,
      assets,
      debts,
      dateOfBirth: DOB,
    }
    const normal = buildSimNetWorthRows({ ...base, simRows: buildEndPortfolioFiltered() })
    const doubled = buildSimNetWorthRows({
      ...base,
      simRows: scaleFactors(buildEndPortfolioFiltered(), 2),
    })
    expect(doubled.map((r) => r.netWorth)).toEqual(normal.map((r) => r.netWorth))
  })

  it('AC-E1: rij 0 draagt factor exact 1 (vandaag = vandaag)', () => {
    const out = buildSimNetWorthRows({
      simRows: buildEndPortfolioFull(),
      currentNetWorth,
      housingStrategy: { mode: 'include_full' },
      assets,
      debts,
      dateOfBirth: DOB,
    })
    expect(out[0].inflationFactor).toBe(1)
  })

  it('AC-E2: jaar 0 gedeflateerd == currentNetWorth (knikvrije naad historie↔projectie)', () => {
    const out = buildSimNetWorthRows({
      simRows: buildEndPortfolioFiltered(),
      currentNetWorth,
      housingStrategy: { mode: 'exclude_from_fire' },
      assets,
      debts,
      dateOfBirth: DOB,
    })
    // Deflateren gebeurt in de render, met deze factor. Jaar 0 moet daar exact op
    // het Vandaag-punt uitkomen — dat is precies wat D7's volgorde garandeert.
    expect(deflate(out[0].netWorth, out[0].inflationFactor, 'real')).toBeCloseTo(currentNetWorth, 6)
  })

  it('de factor wordt per rij ONGEWIJZIGD doorgegeven (geen herschaling, geen her-indexering)', () => {
    const simRows = buildEndPortfolioFiltered()
    const out = buildSimNetWorthRows({
      simRows,
      currentNetWorth,
      housingStrategy: { mode: 'exclude_from_fire' },
      assets,
      debts,
      dateOfBirth: DOB,
    })
    expect(out.map((r) => r.inflationFactor)).toEqual(simRows.map((r) => r.inflationFactor))
    // en de leeftijd-koppeling blijft één-op-één (join-fouten schuiven een jaar op)
    expect(out.map((r) => r.age)).toEqual(simRows.map((r) => r.age))
  })

  it('onbruikbare factoren (0 / negatief / NaN) reizen ongemoeid mee — afvangen hoort aan de render-grens', () => {
    const simRows = buildEndPortfolioFiltered()
    simRows[1].inflationFactor = 0
    simRows[2].inflationFactor = -1
    simRows[3].inflationFactor = Number.NaN
    const out = buildSimNetWorthRows({
      simRows,
      currentNetWorth,
      housingStrategy: { mode: 'exclude_from_fire' },
      assets,
      debts,
      dateOfBirth: DOB,
    })
    // Deze helper repareert niets en crasht niet: `deflate`/`buildFactorByAge`
    // vangen het onbruikbare geval af (bedrag blijft nominaal).
    expect(out[1].inflationFactor).toBe(0)
    expect(out[2].inflationFactor).toBe(-1)
    expect(Number.isNaN(out[3].inflationFactor)).toBe(true)
    expect(out.map((r) => r.netWorth)).toEqual(GOLDEN_EXCLUDE_FROM_FIRE)
    expect(deflate(out[1].netWorth, out[1].inflationFactor, 'real')).toBe(out[1].netWorth)
  })
})

describe('buildSimNetWorthRows — edge cases', () => {
  it('lege simRows → lege reeks', () => {
    const out = buildSimNetWorthRows({
      simRows: [],
      currentNetWorth,
      housingStrategy: { mode: 'exclude_from_fire' },
      assets,
      debts,
      dateOfBirth: DOB,
    })
    expect(out).toEqual([])
  })

  it('geen eigen huis → reeks ≡ endPortfolio (niets om bij te tellen)', () => {
    const noHouseAssets = [assets[1]] // alleen beleggingen
    const simRows = buildEndPortfolioFiltered()
    const out = buildSimNetWorthRows({
      simRows,
      currentNetWorth: 100_000, // geen overwaarde
      housingStrategy: { mode: 'exclude_from_fire' },
      assets: noHouseAssets,
      debts: [],
      dateOfBirth: DOB,
    })
    for (let i = 0; i < out.length; i++) {
      expect(Math.abs(out[i].netWorth - simRows[i].startPortfolio)).toBeLessThanOrEqual(EPS)
    }
  })
})

/**
 * ADR 0034-addendum — de endpoint-invariant op de /overzicht-mini-grafiek.
 *
 * Given  een kernel-jaarreeks in de ECHTE `SimRow`-vorm: `startPortfolio` is de
 *        stand ÓP leeftijd `age`, `endPortfolio` de stand op leeftijd `age + 1`
 *        (bridge: `endPortfolio → UnifiedProjectionRow.netWorth`, "netto vermogen
 *        einde van jaar"). Profiel: fractionele FIRE-leeftijd 50,75, eigen woning
 *        op `exclude_from_fire`, huis al in het grootboek (`houseInLedger`).
 * When   `buildSimNetWorthRows` de reeks omzet naar het weergave-vermogen per jaar
 *        en de /overzicht-grafiek de rij op de afgeronde FIRE-leeftijd (51) leest.
 * Then   die rij is het geprojecteerde netto vermogen ÓP leeftijd 51 en ligt dus
 *        binnen één jaargrid-stap van `requiredFireNetWorth` (Prognose!I@FIRE) —
 *        hetzelfde bedrag dat /toekomst als doel-incl-woning toont.
 *
 * Verankerd op de ECHTE eigenaar-cijfers (probe 27-08-2026, jpsmit@jps-holding.nl):
 * stand vandaag €265.401 op leeftijd 46, kernelreeks 46→51, FIRE 50,75,
 * requiredFireNetWorth €562.833.
 */
describe('buildSimNetWorthRows — ADR 0034 endpoint-invariant (leeftijd-uitlijning)', () => {
  // Kernelreeks zoals de bridge hem levert: index = leeftijdsjaar, waarde = stand
  // ÓP die leeftijd. Echte eigenaar-cijfers.
  const NW_AT_AGE: Record<number, number> = {
    46: 265_401,
    47: 329_170,
    48: 399_066,
    49: 472_725,
    50: 550_269,
    51: 565_847,
    52: 584_482,
  }
  const START_AGE = 46
  const FIRE_AGE_FRACTIONAL = 50.75
  const FIRE_AGE_DISPLAY = 51 // fireAgeForDisplay(50,75)
  const REQUIRED_FIRE_NET_WORTH = 562_833 // Prognose!I@FIRE — /toekomst-doel incl. woning
  const DOB_46 = '1980-01-01'

  /** De ECHTE SimRow-vorm: start = stand óp `age`, end = stand op `age + 1`. */
  function kernelRows() {
    const rows = []
    for (let age = START_AGE; age <= 51; age++) {
      rows.push({
        age,
        startPortfolio: NW_AT_AGE[age],
        endPortfolio: NW_AT_AGE[age + 1],
        inflationFactor: Math.pow(1.02, age - START_AGE),
      })
    }
    return rows
  }

  it('legt op de afgeronde FIRE-leeftijd het vermogen ÓP die leeftijd neer, niet dat van een jaar later', () => {
    const out = buildSimNetWorthRows({
      simRows: kernelRows(),
      currentNetWorth: NW_AT_AGE[START_AGE],
      housingStrategy: { mode: 'exclude_from_fire' },
      houseInLedger: true,
      assets,
      debts,
      dateOfBirth: DOB_46,
    })

    // De reconcile-offset hoort ~0 te zijn: rij 0 IS de stand van vandaag. Is hij
    // dat niet, dan schuift een heel groeijaar als "grondslagverschil" de hele
    // reeks omlaag — precies de fout die deze test vastlegt.
    expect(Math.abs(out[0].netWorth - NW_AT_AGE[START_AGE])).toBeLessThanOrEqual(EPS)

    const atFire = out.find((r) => r.age === FIRE_AGE_DISPLAY)
    expect(atFire).toBeDefined()
    expect(Math.abs(atFire!.netWorth - NW_AT_AGE[FIRE_AGE_DISPLAY])).toBeLessThanOrEqual(EPS)

    // ADR 0034: op de FIRE-maand geldt prognose-nettovermogen == requiredFireNetWorth.
    // Tolerantie RELATIEF (1%) en niet absoluut: het verschil dat overblijft is de
    // afronding van een fractionele FIRE-leeftijd (50,75) naar het jaargrid (51) —
    // die schaalt mee met het bedrag. Een absolute cent-tolerantie zou hier een
    // fout-klasse verbergen die met de vermogensomvang meegroeit.
    const afwijking = Math.abs(atFire!.netWorth - REQUIRED_FIRE_NET_WORTH) / REQUIRED_FIRE_NET_WORTH
    expect(afwijking).toBeLessThan(0.01)
  })

  it('deflateert de FIRE-rij met de factor van diezelfde leeftijd (waarde en factor horen bij hetzelfde jaar)', () => {
    const out = buildSimNetWorthRows({
      simRows: kernelRows(),
      currentNetWorth: NW_AT_AGE[START_AGE],
      housingStrategy: { mode: 'exclude_from_fire' },
      houseInLedger: true,
      assets,
      debts,
      dateOfBirth: DOB_46,
    })
    const atFire = out.find((r) => r.age === FIRE_AGE_DISPLAY)!
    // 5 jaar vooruit vanaf 46 ⇒ factor 1,02^5. Waarde én factor moeten bij
    // leeftijd 51 horen; een jaar-shift in de waarde zou hier een te hoog
    // reëel bedrag geven terwijl de factor onveranderd blijft.
    expect(atFire.inflationFactor).toBeCloseTo(Math.pow(1.02, FIRE_AGE_DISPLAY - START_AGE), 9)
    const reeel = deflate(atFire.netWorth, atFire.inflationFactor, 'real')
    expect(reeel).toBeGreaterThan(505_000)
    expect(reeel).toBeLessThan(520_000)
    void FIRE_AGE_FRACTIONAL
  })
})
