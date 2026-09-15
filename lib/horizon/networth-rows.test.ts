import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { buildSimNetWorthRows } from './networth-rows'
import { deflate } from '@/lib/euro-display'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import {
  deriveHousingContext,
  getFireEligibleNetWorth,
  netWorthExcludingHome,
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

/* ───────────────────────────────────────────────────────────────────────────
 * Dubbele grondslag — `netWorthExclHome` (geprojecteerd netto vermogen EXCL.
 * eigen woning, kernel-J-grondslag).
 *
 * De kernel houdt het huis voor élke modus in het grootboek (houseInLedger) en
 * levert per rij naast Prognose!I (startPortfolio) ook Prognose!J
 * (`startNettoLiquide` = I − eigen-woningblok). Deze suite bewijst:
 *   (a) zonder dubbele grondslag (include_full / geen woning) of zonder J ontbreekt
 *       de sleutel volledig — bestaande bundels byte-identiek;
 *   (b) exclude_from_fire: rij 0 == netWorthExcludingHome (exact), latere rijen =
 *       netWorth − de kernel-overwaarde van dát jaar;
 *   (c) downsize: ná de kernel-verkoop excl. == incl. (geen dubbele aftrek);
 *   (d) reverse_mortgage: de ZUIVERE definitie (huis + álle woningschulden weg,
 *       opnames in de liquide pot), niet de leen-ruimte-variant;
 *   (e) `netWorth`/`inflationFactor` ongewijzigd (regressie);
 *   (f) een grondslagverschil op t0 aan de huis-kant vervuilt de excl.-reeks niet;
 *   (g) grendel op de aanname dat J in de app exact "zonder eigen woning" is.
 * ─────────────────────────────────────────────────────────────────────────── */

type KernelFixture = {
  simRows: FixtureRow[]
  /** Prognose!J ÓP de leeftijd — wat de bridge als `startNettoLiquide` levert. */
  jByAge: Map<number, number>
  /** Liquide pot per rij (de "waarheid" waar excl. op moet uitkomen). */
  liquid: number[]
  /** Kernel-overwaarde per rij (huis − hypotheek − opeetschuld). */
  ovw: number[]
}

const SALE_AGE = 46 // downsize: kernel-verkoopleeftijd (Bez!AY 0→1)
const OPEET_START_AGE = 46 // reverse_mortgage: opname-startleeftijd (P!B64)
const SALE_COSTS_PCT = 0.04
const OPEET_PAYOUT_PER_YEAR = 12_000

/**
 * Kernel-rijen in de ECHTE vorm: startPortfolio = I ÓP age, J = I − woningblok.
 * `ovwAt(i)` beschrijft wat de kernel met het woningblok doet; `liquidAt(i)` de
 * liquide pot (incl. verkoopopbrengst/opeetopnames die de kernel erin stort).
 */
function buildKernelFixture(
  liquidAt: (i: number) => number,
  ovwAt: (i: number) => number,
): KernelFixture {
  const n = fireAge - currentAge + 1
  const liquid: number[] = []
  const ovw: number[] = []
  for (let i = 0; i < n; i++) {
    liquid.push(liquidAt(i))
    ovw.push(ovwAt(i))
  }
  const simRows: FixtureRow[] = []
  const jByAge = new Map<number, number>()
  for (let i = 0; i < n; i++) {
    const age = currentAge + i
    const startI = liquid[i] + ovw[i]
    const endI = i + 1 < n ? liquid[i + 1] + ovw[i + 1] : startI * 1.05
    simRows.push({ age, startPortfolio: startI, endPortfolio: endI, inflationFactor: factorAt(age) })
    jByAge.set(age, liquid[i])
  }
  return { simRows, jByAge, liquid, ovw }
}

/** Liquide pot zonder woning-stromen: 100k @ 6% + 15k/jr (zelfde pad als de rest). */
const liquidPlain = (i: number) => {
  let v = 100_000
  for (let k = 0; k < i; k++) v = v * 1.06 + 15_000
  return v
}
/** Meegroeiende overwaarde: t0 = context-overwaarde (huis 400k − hyp 200k). */
const ovwGrowing = (i: number) => houseEquityNow + 5_000 * i

const DOWNSIZE_CFG: HousingStrategyConfig = {
  mode: 'downsize',
  trigger: 'fixed_age',
  triggerAge: SALE_AGE,
  depletionThresholdYears: 0,
  salePricePct: 1,
  salesCostsPct: SALE_COSTS_PCT,
  newMonthlyHousingCost: null,
}
const REVERSE_CFG: HousingStrategyConfig = {
  mode: 'reverse_mortgage',
  trigger: 'fixed_age',
  triggerAge: OPEET_START_AGE,
  depletionThresholdYears: 0,
  maxLoanPct: 0.5,
  interestRate: 0.055,
  monthlyPayout: null,
}

function kernelBase(fx: KernelFixture, cfg: HousingStrategyConfig, currentNw = fx.simRows[0].startPortfolio) {
  return {
    simRows: fx.simRows,
    currentNetWorth: currentNw,
    housingStrategy: cfg,
    houseInLedger: true,
    assets,
    debts,
    dateOfBirth: DOB,
    startNettoLiquideByAge: fx.jByAge,
  }
}

describe('buildSimNetWorthRows — netWorthExclHome (a): sleutel ontbreekt zonder dubbele grondslag of zonder J', () => {
  it('include_full → géén netWorthExclHome-sleutel, uitvoer byte-identiek aan de aanroep zonder J', () => {
    const fx = buildKernelFixture(liquidPlain, ovwGrowing)
    const withJ = buildSimNetWorthRows(kernelBase(fx, { mode: 'include_full' }))
    const withoutJ = buildSimNetWorthRows({ ...kernelBase(fx, { mode: 'include_full' }), startNettoLiquideByAge: undefined })
    expect(withJ).toEqual(withoutJ)
    for (const row of withJ) expect('netWorthExclHome' in row).toBe(false)
  })

  it('geen eigen woning → géén sleutel, ook niet onder exclude_from_fire', () => {
    const fx = buildKernelFixture(liquidPlain, () => 0)
    const out = buildSimNetWorthRows({
      ...kernelBase(fx, { mode: 'exclude_from_fire' }),
      assets: [assets[1]],
      debts: [],
    })
    for (const row of out) expect('netWorthExclHome' in row).toBe(false)
  })

  it('exclude_from_fire zónder kernel-J → géén sleutel (geen eigen overwaarde-projectie als terugval)', () => {
    const fx = buildKernelFixture(liquidPlain, ovwGrowing)
    const out = buildSimNetWorthRows({ ...kernelBase(fx, { mode: 'exclude_from_fire' }), startNettoLiquideByAge: undefined })
    for (const row of out) expect('netWorthExclHome' in row).toBe(false)
  })

  it('J mist voor één leeftijd → de HELE reeks laat de sleutel weg (nooit half gevuld)', () => {
    const fx = buildKernelFixture(liquidPlain, ovwGrowing)
    const gappy = new Map(fx.jByAge)
    gappy.delete(currentAge + 5)
    const out = buildSimNetWorthRows({ ...kernelBase(fx, { mode: 'exclude_from_fire' }), startNettoLiquideByAge: gappy })
    for (const row of out) expect('netWorthExclHome' in row).toBe(false)
  })
})

describe('buildSimNetWorthRows — netWorthExclHome (b): exclude_from_fire', () => {
  const fx = buildKernelFixture(liquidPlain, ovwGrowing)
  const out = buildSimNetWorthRows(kernelBase(fx, { mode: 'exclude_from_fire' }))

  it('rij 0 is EXACT netWorthExcludingHome(currentNetWorth, housingContext) — het getal van de linker kaart', () => {
    const anker = netWorthExcludingHome(fx.simRows[0].startPortfolio, ctx)
    expect(out[0].netWorthExclHome).toBe(anker)
  })

  it('latere rijen: netWorthExclHome = netWorth − kernel-overwaarde van dat jaar (= de liquide pot)', () => {
    for (let i = 0; i < out.length; i++) {
      expect(out[i].netWorthExclHome).toBeCloseTo(out[i].netWorth - fx.ovw[i], 6)
      expect(out[i].netWorthExclHome).toBeCloseTo(fx.liquid[i], 6)
      expect(out[i].netWorthExclHome!).toBeLessThan(out[i].netWorth)
    }
  })

  it('zelfde leeftijd, zelfde deflator: excl. en incl. dragen dezelfde inflationFactor per rij', () => {
    expect(out.map((r) => r.age)).toEqual(fx.simRows.map((r) => r.age))
    expect(out.map((r) => r.inflationFactor)).toEqual(fx.simRows.map((r) => r.inflationFactor))
  })
})

describe('buildSimNetWorthRows — netWorthExclHome (c): downsize — ná de kernel-verkoop geen dubbele aftrek', () => {
  // Kernel-waarheid: vóór de verkoop meegroeiende overwaarde; op de verkoopmaand
  // huis-slot 0, hypotheek 0 en de netto-opbrengst als inleg in de liquide pot.
  const saleIdx = SALE_AGE - currentAge
  const proceeds = ovwGrowing(saleIdx) * (1 - SALE_COSTS_PCT)
  const fx = buildKernelFixture(
    (i) => liquidPlain(i) + (i >= saleIdx ? proceeds : 0),
    (i) => (i >= saleIdx ? 0 : ovwGrowing(i)),
  )
  const out = buildSimNetWorthRows(kernelBase(fx, DOWNSIZE_CFG))

  it('rij 0 exact het anker', () => {
    expect(out[0].netWorthExclHome).toBe(netWorthExcludingHome(fx.simRows[0].startPortfolio, ctx))
  })

  it('vóór de verkoop ligt excl. onder incl.; vanaf de verkoopleeftijd excl. == incl. (huis is al geld)', () => {
    for (let i = 0; i < out.length; i++) {
      if (out[i].age < SALE_AGE) {
        expect(out[i].netWorthExclHome!).toBeLessThan(out[i].netWorth - 1)
      } else {
        expect(out[i].netWorthExclHome).toBeCloseTo(out[i].netWorth, 6)
      }
    }
  })

  it('de verkoopopbrengst komt in excl. terecht (springt op de verkoopleeftijd omhoog met de opbrengst)', () => {
    const before = out[saleIdx - 1].netWorthExclHome!
    const at = out[saleIdx].netWorthExclHome!
    // liquide groei van één jaar + de netto-opbrengst; een dubbele aftrek zou dit
    // ~overwaarde te laag laten uitkomen.
    expect(at - before).toBeCloseTo(liquidPlain(saleIdx) - liquidPlain(saleIdx - 1) + proceeds, 6)
  })
})

describe('buildSimNetWorthRows — netWorthExclHome (d): reverse_mortgage — de zuivere definitie', () => {
  // Kernel-waarheid: huis groeit, hypotheek loopt af, vanaf de opname-start loopt de
  // opeetschuld (categorie 'Woning', niet-liquide) op en gaan de opnames naar de
  // liquide pot. J = I − (huis − hypotheek − opeetschuld) = liquide pot mét opnames.
  const opeetIdx = OPEET_START_AGE - currentAge
  const house = (i: number) => HOUSE_VALUE + 8_000 * i
  const hyp = (i: number) => MORTGAGE_BALANCE - 5_000 * i
  const opeet = (i: number) => (i >= opeetIdx ? OPEET_PAYOUT_PER_YEAR * (i - opeetIdx + 1) : 0)
  const fx = buildKernelFixture(
    (i) => liquidPlain(i) + opeet(i),
    (i) => house(i) - hyp(i) - opeet(i),
  )
  const out = buildSimNetWorthRows(kernelBase(fx, REVERSE_CFG))

  it('rij 0: ZUIVER netWorth − overwaarde (exact), NIET de leen-ruimte-variant (getFireEligibleNetWorth)', () => {
    const nw0 = fx.simRows[0].startPortfolio
    expect(out[0].netWorthExclHome).toBe(netWorthExcludingHome(nw0, ctx))
    expect(out[0].netWorthExclHome).not.toBe(getFireEligibleNetWorth(nw0, ctx, REVERSE_CFG))
  })

  it('latere rijen: huis én álle woningschulden (hypotheek + opeetschuld) weggestreept = liquide pot mét opnames', () => {
    for (let i = 0; i < out.length; i++) {
      expect(out[i].netWorthExclHome).toBeCloseTo(out[i].netWorth - (house(i) - hyp(i) - opeet(i)), 6)
      expect(out[i].netWorthExclHome).toBeCloseTo(liquidPlain(i) + opeet(i), 6)
    }
  })

  it('de opeetopname verhoogt excl. jaar op jaar (het geld is er wél; de schuld ertegenover hoort bij de woning)', () => {
    const delta = out[opeetIdx + 1].netWorthExclHome! - out[opeetIdx].netWorthExclHome!
    const liquidGrowth = liquidPlain(opeetIdx + 1) - liquidPlain(opeetIdx)
    expect(delta).toBeCloseTo(liquidGrowth + OPEET_PAYOUT_PER_YEAR, 6)
  })
})

describe('buildSimNetWorthRows — netWorthExclHome (e): regressie — netWorth en inflationFactor ongewijzigd', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(GOLDEN_CLOCK)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('kernel-tak golden blijft byte-identiek terwijl netWorthExclHome erbij komt', () => {
    const simRows = buildEndPortfolioFull()
    const jByAge = new Map(simRows.map((r) => [r.age, r.startPortfolio - houseEquityNow]))
    const out = buildSimNetWorthRows({
      simRows,
      currentNetWorth,
      housingStrategy: { mode: 'exclude_from_fire' },
      houseInLedger: true,
      assets,
      debts,
      dateOfBirth: DOB,
      startNettoLiquideByAge: jByAge,
    })
    expect(out.map((r) => r.netWorth)).toEqual(GOLDEN_HOUSE_IN_LEDGER)
    expect(out.map((r) => r.inflationFactor)).toEqual(simRows.map((r) => r.inflationFactor))
    expect(out.every((r) => typeof r.netWorthExclHome === 'number')).toBe(true)
  })

  it('met en zonder J: netWorth/inflationFactor per rij identiek', () => {
    const fx = buildKernelFixture(liquidPlain, ovwGrowing)
    const withJ = buildSimNetWorthRows(kernelBase(fx, DOWNSIZE_CFG))
    const withoutJ = buildSimNetWorthRows({ ...kernelBase(fx, DOWNSIZE_CFG), startNettoLiquideByAge: undefined })
    expect(withJ.map((r) => r.netWorth)).toEqual(withoutJ.map((r) => r.netWorth))
    expect(withJ.map((r) => r.inflationFactor)).toEqual(withoutJ.map((r) => r.inflationFactor))
  })

  it('een ANDERE J-reeks verandert nul euro aan netWorth (J zit in geen enkele incl.-som)', () => {
    const fx = buildKernelFixture(liquidPlain, ovwGrowing)
    const doubled = new Map([...fx.jByAge].map(([age, j]) => [age, j * 2] as const))
    const a = buildSimNetWorthRows(kernelBase(fx, DOWNSIZE_CFG))
    const b = buildSimNetWorthRows({ ...kernelBase(fx, DOWNSIZE_CFG), startNettoLiquideByAge: doubled })
    expect(b.map((r) => r.netWorth)).toEqual(a.map((r) => r.netWorth))
  })
})

describe('buildSimNetWorthRows — netWorthExclHome (f): eigen reconcile-offset per grondslag', () => {
  it('grondslagverschil aan de LIQUIDE kant: beide reeksen schuiven evenveel, rij 0 exact', () => {
    const fx = buildKernelFixture(liquidPlain, ovwGrowing)
    const delta = 1_000
    const currentNw = fx.simRows[0].startPortfolio + delta
    const out = buildSimNetWorthRows(kernelBase(fx, { mode: 'exclude_from_fire' }, currentNw))
    expect(out[0].netWorthExclHome).toBe(netWorthExcludingHome(currentNw, ctx))
    for (let i = 0; i < out.length; i++) {
      expect(out[i].netWorth).toBeCloseTo(fx.simRows[i].startPortfolio + delta, 6)
      expect(out[i].netWorthExclHome).toBeCloseTo(fx.liquid[i] + delta, 6)
    }
  })

  it('grondslagverschil aan de HUIS-kant (kernel start op WOZ, context op marktwaarde): excl.-reeks blijft de liquide pot', () => {
    const wozPremium = 30_000
    // Kernel rekende het huis 30k hoger (WOZ-basis); de context (marktwaarde) niet.
    const fx = buildKernelFixture(liquidPlain, (i) => ovwGrowing(i) + wozPremium)
    const currentNw = fx.liquid[0] + houseEquityNow // loader-netWorth op marktwaarde
    const out = buildSimNetWorthRows(kernelBase(fx, DOWNSIZE_CFG, currentNw))
    // incl. schuift −30k (zoals altijd al); excl. is verankerd op de liquide pot en
    // draagt dat huis-verschil NIET mee — dezelfde offset op beide zou hier 30k te laag zijn.
    expect(out[0].netWorthExclHome).toBe(netWorthExcludingHome(currentNw, ctx))
    for (let i = 0; i < out.length; i++) {
      expect(out[i].netWorth).toBeCloseTo(fx.simRows[i].startPortfolio - wozPremium, 6)
      expect(out[i].netWorthExclHome).toBeCloseTo(fx.liquid[i], 6)
    }
  })
})

describe('buildSimNetWorthRows — netWorthExclHome (g): grendel op de J-aanname in de kernel-adapter', () => {
  // `netWorthExclHome` leest Prognose!J als "netto vermogen zonder eigen woning". Dat
  // klopt alléén zolang de adapter UITSLUITEND bezitcategorie 'Eigen huis' en
  // schuldcategorie 'Woning' als niet-liquide vlagt (en alleen bij ≠ Meerekenen).
  // Vlagt iemand ooit een derde categorie, dan is J "zonder al het niet-liquide"
  // en moet deze reeks een eigen woningblok-veld uit de bridge gaan lezen.
  it('adapter/prio-overgang.ts vlagt precies twee categorieën niet-liquide: Eigen huis en Woning', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'lib', 'horizon-kernel', 'adapter', 'prio-overgang.ts'),
      'utf8',
    )
    const flags = src.match(/nietLiquide:\s*[^,\n]+/g) ?? []
    expect(flags).toHaveLength(2)
    expect(flags[0]).toMatch(/categorie === 'Eigen huis' \? !woningMeerekenen : false/)
    expect(flags[1]).toMatch(/categorie === 'Woning' \? !woningMeerekenen : false/)
  })
})
