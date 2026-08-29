/**
 * Regressie — **Prognose!J-grondslag bij een beleggingshypotheek** (defect B, bug-fix pijplijn).
 *
 * Given: een persona met een eigen woning (met eigen-woninghypotheek, gelinkt via
 * `linked_asset_id`) ÉN een los verhuurd pand (`real_estate`) met zijn eigen
 * ("beleggings-")hypotheek, eveneens gelinkt via `linked_asset_id`. Rente 0% en
 * `aflossingsvrij` op beide hypotheken zodat de saldi op de eerste prognose-maand
 * exact de startbalansen zijn (geen amortisatie-/rendementsdrift die de assertie
 * zou vertroebelen).
 *
 * When: de woonstrategie is `exclude_from_fire` (TS!nietLiquide = true voor de
 * eigen-woning-categorieën, `adapter/prio-overgang.ts#buildTsParams`).
 *
 * Then: Prognose!J (nettoLiquide, de FIRE-grondslag, `tables/prognose.ts#computePrognose`)
 * sluit ALLEEN het eigen huis en zijn hypotheek uit — het verhuurde pand en zijn
 * hypotheek blijven liquide en dus in J. `adapter/potten.ts#isNietEigenWoningHypotheek`
 * herkent de beleggingshypotheek aan zijn koppeling (`linked_asset_id` naar een
 * actief, niet-`eigen_huis`-bezit) en zet 'm op schuldcategorie 'Overig' i.p.v.
 * 'Woning', zodat hij NIET meetelt in de M-kolom (niet-liquide schuld).
 *
 * Onder `include_full` is niets nietLiquide → J === I, ongeacht die koppeling.
 */
import { describe, it, expect } from 'vitest'
import { buildKernelInputFromAppWithNotices } from '@/lib/horizon-kernel/adapter'
import { solveFire } from '@/lib/horizon-kernel/solver'
import type { PrognoseComputedRow } from '@/lib/horizon-kernel/tables/prognose'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { KernelInput } from '@/lib/horizon-kernel/types'
import {
  nettoLiquidePerLeeftijd,
  nettoVermogenPerLeeftijd,
  startNettoLiquide,
  startNettoVermogen,
} from '@/lib/horizon-kernel/jaarrand'
import { runMonteCarlo } from '@/lib/horizon-kernel/wrappers/mc'
import { runMarktcheckOnKernelInput } from '@/lib/horizon-kernel/marktcheck'

const HUISWAARDE = 400_000
const EIGEN_HYP_SALDO = 300_000
const PAND_WAARDE = 200_000
const BELEGGINGS_HYP_SALDO = 110_000

const assets: Asset[] = [
  {
    id: 'house', name: 'Eigen woning', asset_type: 'eigen_huis', current_value: HUISWAARDE,
    expected_return: 0, monthly_contribution: 0, is_active: true, net_worth_inclusion_pct: 100,
  } as unknown as Asset,
  {
    id: 'pand', name: 'Verhuurd pand', asset_type: 'real_estate', current_value: PAND_WAARDE,
    expected_return: 0, monthly_contribution: 0, is_active: true, net_worth_inclusion_pct: 100,
  } as unknown as Asset,
  {
    id: 'sav', name: 'Spaarrekening', asset_type: 'savings', current_value: 50_000,
    expected_return: 0, monthly_contribution: 0, is_active: true, net_worth_inclusion_pct: 100,
  } as unknown as Asset,
]

const debts: Debt[] = [
  {
    id: 'hyp-eigen', name: 'Hypotheek eigen woning', debt_type: 'mortgage', current_balance: EIGEN_HYP_SALDO,
    interest_rate: 0, monthly_payment: 0, repayment_type: 'aflossingsvrij', is_active: true,
    linked_asset_id: 'house', net_worth_inclusion_pct: 100, include_aflossing_in_savings: false,
  } as unknown as Debt,
  {
    id: 'hyp-beleg', name: 'Hypotheek verhuurd pand', debt_type: 'mortgage', current_balance: BELEGGINGS_HYP_SALDO,
    interest_rate: 0, monthly_payment: 0, repayment_type: 'aflossingsvrij', is_active: true,
    linked_asset_id: 'pand', net_worth_inclusion_pct: 100, include_aflossing_in_savings: false,
  } as unknown as Debt,
]

function profileWith(mode: 'exclude_from_fire' | 'include_full') {
  return {
    date_of_birth: '1980-01-01',
    net_monthly_income: 4000,
    estimated_monthly_expenses: 2500,
    expected_return: 0.05,
    inflation_rate: 0.02,
    box3_method: 'forfaitair',
    fire_end_strategy: 'deplete',
    fire_end_age: 90,
    housing_strategy_config: { mode },
  }
}

function firstPrognoseRow(mode: 'exclude_from_fire' | 'include_full'): PrognoseComputedRow {
  const input = buildKernelInputFromAppWithNotices({ profile: profileWith(mode), assets, debts }).input
  const solve = solveFire(input)
  const row = solve.projection.prognose[0]
  if (row === undefined || row.beyondHorizon) {
    throw new Error('geen bruikbare eerste prognose-rij (buiten horizon) — fixture ongeldig')
  }
  return row
}

describe('kernel · Prognose!J-grondslag bij een beleggingshypotheek (defect B)', () => {
  it('exclude_from_fire: J sluit ALLEEN het eigen huis + zijn hypotheek uit (pand + beleggingshypotheek blijven liquide)', () => {
    const row = firstPrognoseRow('exclude_from_fire')
    // J = I − (L − M), waarbij L/M uitsluitend het eigen-woningblok zijn:
    // L = huiswaarde, M = eigen-woninghypotheeksaldo. De beleggingshypotheek
    // (110k) telt NIET mee in M — anders viel J ~110k te hoog uit.
    const expectedJ = row.nettoVermogen - HUISWAARDE + EIGEN_HYP_SALDO
    expect(row.nettoLiquide).toBeCloseTo(expectedJ, 2)
  })

  it('include_full: niets is nietLiquide → J === I', () => {
    const row = firstPrognoseRow('include_full')
    expect(row.nettoLiquide).toBeCloseTo(row.nettoVermogen, 2)
  })
})

// -----------------------------------------------------------------------------
// SPOOR B / ROUTE 1 - de J-grondslag als PRIMAIRE grafiek-lijn
//
// /toekomst tekende zijn hoofdlijn altijd op Prognose!I (netto vermogen incl. woning),
// terwijl de voortgangsbalk en het vrijheids-% eronder bij `exclude_from_fire` al op
// Prognose!J stonden. De grafieklaag krijgt daarom een `primaryBasis`-schakelaar; de
// KERNEL levert daarvoor twee dingen die hij nog niet had:
//
//  1. de BEGINSTAND op J (`jaarrand.ts#startNettoLiquide` -> `UnifiedProjectionRow
//     .startNettoLiquide`) - zonder die zou het eerste punt van een J-lijn nog op de
//     I-grondslag liggen;
//  2. de onzekerheidsBAND op J (`wrappers/mc.ts#bandLiquide`) - niet onderhandelbaar:
//     een I-band om een J-lijn omhult een andere grootheid dan de lijn die erin ligt,
//     en de bandtop bepaalt bovendien de ashoogte mee. Grondslagvermenging op een
//     Y-as is verboden (CLAUDE.md).
//
// Beide zijn PUUR AFGELEID: `outcomes`/`successProbability` (het Excel-oracle) en de
// bestaande `band` blijven ongemoeid - dit is een weergave-toevoeging, geen rekenwijziging.

/**
 * Het niet-liquide NETTO-blok van de fixture bij `exclude_from_fire`: de eigen woning
 * (L) minus haar eigen-woninghypotheek (M). De beleggingshypotheek zit bewust NIET in
 * M (zie de defect-B-suite hierboven) en telt dus gewoon liquide mee.
 *
 * Rendement en rente staan in deze fixture op 0 en de hypotheek is aflossingsvrij, dus
 * dit blok is CONSTANT over de hele horizon - daardoor is `I - J` op elke blokrand
 * exact dit bedrag, wat de band-assertie hieronder scherp maakt in plaats van "ongeveer
 * lager".
 */
const NIET_LIQUIDE_NETTO = HUISWAARDE - EIGEN_HYP_SALDO // 400k - 300k = 100k

/**
 * MC-parameters van de test: klein aantal runs, echte spreiding. Oneven N zodat de
 * nearest-rank-mediaan een bestaand element aanwijst (geen interpolatie).
 */
const TEST_RUNS = 9
const TEST_SIGMA = 0.15

function kernelInput(mode: 'exclude_from_fire' | 'include_full'): KernelInput {
  const input = buildKernelInputFromAppWithNotices({ profile: profileWith(mode), assets, debts }).input
  return {
    ...input,
    onzekerheid: {
      ...input.onzekerheid,
      mc: { ...input.onzekerheid.mc, aantalRuns: TEST_RUNS, sigma: TEST_SIGMA },
    },
  }
}

// TOLERANTIE - bewuste keuze per assertie:
//  - include_full J === I (start en band): EXACT (`toBe` / `toEqual`). Zonder
//    niet-liquide categorie is L = M = 0 en rekent de kern J = I - (0 - 0) = I;
//    de startfunctie reduceert dan over dezelfde arrays in dezelfde volgorde. Beide
//    zijn dus bit-identiek - een tolerantie zou hier zwakker zijn dan de waarheid en
//    een echt grondslag-lek onzichtbaar maken.
//  - exclude_from_fire I - J = huis - hypotheek: ABSOLUTE cent-tolerantie
//    (`toBeCloseTo(., 2)` => |delta| < EUR 0,005). De assertie herschikt zelf de
//    optelvolgorde (I - huis + hypotheek), dus float-associativiteit mag ~1e-10 kosten.
//    Bewust NIET relatief: J loopt in een deplete-plan richting nul, en een procentuele
//    marge op een bedrag rond nul is geen toets meer.
describe('kernel - J-grondslag als primaire lijn: startstand + MC-band (spoor B, route 1)', () => {
  describe('include_full - J === I, dus de schakelaar mag niets veranderen', () => {
    it('startNettoLiquide === startNettoVermogen (exact, geen enkele niet-liquide categorie)', () => {
      const input = kernelInput('include_full')
      expect(startNettoLiquide(input)).toBe(startNettoVermogen(input))
    })

    it('bandLiquide is element-voor-element gelijk aan band (zelfde startAge, zelfde percentielen)', () => {
      const mc = runMonteCarlo(kernelInput('include_full'))
      expect(mc.bandLiquide.startAge).toBe(mc.band.startAge)
      expect(mc.bandLiquide.p10).toEqual(mc.band.p10)
      expect(mc.bandLiquide.p25).toEqual(mc.band.p25)
      expect(mc.bandLiquide.p50).toEqual(mc.band.p50)
      expect(mc.bandLiquide.p75).toEqual(mc.band.p75)
      expect(mc.bandLiquide.p90).toEqual(mc.band.p90)
    })
  })

  describe('exclude_from_fire - J ligt het niet-liquide netto-blok onder I', () => {
    it('startNettoLiquide = startNettoVermogen - woningstartwaarde + hypotheekstartwaarde', () => {
      const input = kernelInput('exclude_from_fire')
      // De niet-liquide SCHULD komt er weer bij: J sluit huis EN eigen-woninghypotheek uit.
      expect(startNettoLiquide(input)).toBeCloseTo(
        startNettoVermogen(input) - HUISWAARDE + EIGEN_HYP_SALDO,
        2,
      )
      // Sanity: het verhuurde pand + zijn beleggingshypotheek blijven WEL in J.
      expect(startNettoLiquide(input)).toBeCloseTo(PAND_WAARDE + 50_000 - BELEGGINGS_HYP_SALDO, 2)
    })

    it('bandLiquide.p50 ligt structureel onder band.p50 - op elke leeftijd het volle blok', () => {
      const mc = runMonteCarlo(kernelInput('exclude_from_fire'))
      expect(mc.bandLiquide.p50.length).toBe(mc.band.p50.length)
      expect(mc.bandLiquide.p50.length).toBeGreaterThan(1)
      for (let i = 0; i < mc.band.p50.length; i++) {
        expect(mc.bandLiquide.p50[i]).toBeLessThan(mc.band.p50[i])
        expect(mc.band.p50[i] - mc.bandLiquide.p50[i]).toBeCloseTo(NIET_LIQUIDE_NETTO, 2)
      }
    })

    it('de HELE band schuift mee - p10..p90 allemaal op de J-grondslag', () => {
      const mc = runMonteCarlo(kernelInput('exclude_from_fire'))
      for (const q of ['p10', 'p25', 'p50', 'p75', 'p90'] as const) {
        expect(mc.bandLiquide[q].length).toBe(mc.band[q].length)
        for (let i = 0; i < mc.band[q].length; i++) {
          expect(mc.band[q][i] - mc.bandLiquide[q][i]).toBeCloseTo(NIET_LIQUIDE_NETTO, 2)
        }
      }
    })

    it('index 0 van de band is de startstand: I(0) resp. J(0) uit de potten', () => {
      const input = kernelInput('exclude_from_fire')
      const mc = runMonteCarlo(input)
      expect(mc.band.p50[0]).toBeCloseTo(startNettoVermogen(input), 2)
      expect(mc.bandLiquide.p50[0]).toBeCloseTo(startNettoLiquide(input), 2)
    })
  })

  describe('de leeftijdsas is dezelfde - anders liggen band en lijn uit elkaar', () => {
    for (const mode of ['include_full', 'exclude_from_fire'] as const) {
      it(mode + ': nettoLiquidePerLeeftijd en nettoVermogenPerLeeftijd delen lengte + startAge', () => {
        const input = kernelInput(mode)
        const proj = solveFire(input).projection
        const reeksI = nettoVermogenPerLeeftijd(input, proj)
        const reeksJ = nettoLiquidePerLeeftijd(input, proj)

        expect(reeksJ.length).toBe(reeksI.length)
        expect(reeksJ.length).toBeGreaterThan(1)
        expect(reeksJ.every((v) => Number.isFinite(v))).toBe(true)

        // De as zelf: beide reeksen worden door `wrappers/mc.ts` op dezelfde
        // `startAge = round(startLeeftijd)` gehangen, en `bridge.ts` tekent de
        // hoofdlijn op precies die as.
        const mc = runMonteCarlo(input)
        expect(mc.band.startAge).toBe(Math.round(input.startLeeftijd))
        expect(mc.bandLiquide.startAge).toBe(mc.band.startAge)
        expect(mc.band.p50.length).toBe(reeksI.length)
        expect(mc.bandLiquide.p50.length).toBe(reeksJ.length)
      })
    }
  })

  describe('doorgifte naar het product-oppervlak (marktcheck)', () => {
    it('runMarktcheckOnKernelInput levert bandLiquide naast band, beide op dezelfde as', () => {
      const uitkomst = runMarktcheckOnKernelInput(kernelInput('exclude_from_fire'), {
        maxRuns: TEST_RUNS,
      })
      expect(uitkomst.ok).toBe(true)
      if (!uitkomst.ok) return
      expect(uitkomst.bandLiquide.startAge).toBe(uitkomst.band.startAge)
      expect(uitkomst.bandLiquide.p50.length).toBe(uitkomst.band.p50.length)
      for (let i = 0; i < uitkomst.band.p50.length; i++) {
        expect(uitkomst.bandLiquide.p50[i]).toBeLessThan(uitkomst.band.p50[i])
      }
    })

    it('bandLiquide is structured-clone-veilig (plain arrays over de worker-grens)', () => {
      const uitkomst = runMarktcheckOnKernelInput(kernelInput('include_full'), {
        maxRuns: TEST_RUNS,
      })
      expect(uitkomst.ok).toBe(true)
      if (!uitkomst.ok) return
      const rondtrip = JSON.parse(JSON.stringify(uitkomst.bandLiquide))
      expect(rondtrip).toEqual(uitkomst.bandLiquide)
      expect(Array.isArray(uitkomst.bandLiquide.p50)).toBe(true)
    })
  })

  describe('de oracle-velden blijven ongemoeid (puur additief)', () => {
    it('bandLiquide toevoegen raakt outcomes/successProbability niet', () => {
      const mc = runMonteCarlo(kernelInput('exclude_from_fire'))
      expect(mc.outcomes.length).toBe(TEST_RUNS)
      expect(mc.outcomes.every((o) => o === 0 || o === 1)).toBe(true)
      expect(mc.successProbability).toBeCloseTo(
        mc.outcomes.reduce((sum, o) => sum + o, 0) / TEST_RUNS,
        12,
      )
    })
  })
})
