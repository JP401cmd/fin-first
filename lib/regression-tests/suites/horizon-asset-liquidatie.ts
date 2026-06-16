/**
 * Regressie-suite: generieke niet-liquide asset-liquidatie (v2-grootboek).
 *
 * Bewaakt ADR 0015 (generiek): een verkoop-life-event met `linked_asset_id` dat
 * naar een niet-liquide, niet-`eigen_huis` asset wijst (bv. stacaravan, voertuig,
 * beleggingspand) laat het asset het grootboek verlaten en stroomt de
 * netto-opbrengst naar de besteedbare pot (beleggingen default). De engine zelf
 * (`engine.ts`) is ongewijzigd — alleen `buildGenericAssetLiquidations` in
 * `build-input.ts` is nieuw.
 *
 * Determinisme: gepinde geboortedatum (1957-01-01 → leeftijd 69 in 2026),
 * vaste parameters, geen kalenderafhankelijkheid.
 */
import { registerCategory, registerTests } from '../test-registry'
import {
  assert,
  assertEqual,
  assertNotNull,
  assertGreaterThan,
  assertLessThan,
  assertLessThanOrEqual,
} from '../assert'
import type { TestCase } from '../test-types'
import { buildHorizonInput } from '@/lib/horizon-engine/build-input'
import { runHorizonLedger } from '@/lib/horizon-engine'
import { lifeEventsToCashflows } from '@/lib/fire-simulation'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'

const CAT = 'horizon.asset-liquidatie'

// ── Fixture ────────────────────────────────────────────────────────────────
// Marijke-achtige persona: gepensioneerde vrouw (67), geen schulden.
// Stacaravan = physical, current_value 25k, verkoopprijs 20k → salePricePct 0.8.
// Leeftijd gepind op 69 (geboortedatum 1957-01-01), verkoop op 73.

const DATE_OF_BIRTH = '1957-01-01' // ~69 in 2026 — stabiel
const SALE_AGE = 73

const ASSETS: Asset[] = (
  [
    ['bel', 'Beleggen', 'investment', 320000, 5, null],
    ['cash', 'Spaar', 'cash', 50000, 0, null],
    ['caravan', 'Stacaravan Drenthe', 'physical', 25000, -5, 5],
  ] as const
).map(
  ([id, name, t, v, r, dep]) =>
    ({
      id,
      name,
      asset_type: t,
      current_value: v,
      expected_return: r,
      is_active: true,
      net_worth_inclusion_pct: 100,
      depreciation_rate: dep,
      // sale_config vast_moment: de caravan-verkoop wordt gestuurd door sale_config (ADR 0020),
      // niet meer door het life-event alleen. Het life-event levert nog de kalibratie
      // (verkoopprijs 20k → salePricePct 0.8). Zonder sale_config krijgt de caravan
      // de resolve-time default wanneer_nodig (on_demand) en is age = Infinity, niet 73.
      ...(id === 'caravan' ? { sale_config: { stand: 'vast_moment', triggerAge: SALE_AGE } } : {}),
    }) as unknown as Asset,
)

const NO_DEBTS: Debt[] = []

function saleEvent(
  assetId: string | null,
  age: number | null,
  meta: Record<string, unknown>,
  overrides: Partial<LifeEvent> = {},
): LifeEvent {
  return {
    id: `sale-${assetId ?? 'none'}`,
    name: 'Stacaravan verkopen',
    event_type: 'custom',
    target_age: age,
    target_date: null,
    one_time_cost: 0,
    monthly_cost_change: -100, // wegvallend onderhoud
    monthly_income_change: 0,
    duration_months: 0,
    icon: 'Home',
    is_active: true,
    sort_order: 1,
    is_indexed: false,
    metadata: meta,
    linked_asset_id: assetId,
    ...overrides,
  } as unknown as LifeEvent
}

function buildFixture(events: LifeEvent[], assets: Asset[] = ASSETS, debts: Debt[] = NO_DEBTS) {
  return buildHorizonInput({
    horizonInput: {
      monthlyContributions: 0,
      yearlyMustExpenses: 30000,
      dateOfBirth: DATE_OF_BIRTH,
      monthlyIncome: 0,
    } as never,
    lifeEvents: events,
    fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    grossReturn: 0.05,
    inflation: 0.02,
    assets,
    debts,
    box3Method: 'forfaitair',
    hasPartner: true,
    horizonEngineV2: true,
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // (a) Stacaravan-asset heeft eindwaarde €0 vanaf verkoopjaar.
  {
    id: 'gen-liq-asset-nul-na-verkoop',
    name: 'Stacaravan-asset €0 na verkoop op leeftijd 73',
    description:
      'Niet-liquide physical-asset verlaat het v2-grootboek in het verkoopjaar; eindwaarde ≤ €1 op 73+.',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 100,
    requiredRole: 'any',
    fn() {
      const built = buildFixture([saleEvent('caravan', SALE_AGE, { verkoopprijs: 20000 })])
      assertNotNull(built, 'buildHorizonInput retourneert resultaat')
      assert(
        (built!.input.assetLiquidations?.length ?? 0) === 1,
        'exact 1 assetLiquidation aangemaakt',
      )
      assertEqual(built!.input.assetLiquidations![0].assetId, 'caravan', 'assetId = caravan')
      assertEqual(built!.input.assetLiquidations![0].age, SALE_AGE, `leeftijd = ${SALE_AGE}`)

      const r = runHorizonLedger(built!.input)
      const caravanAt = (age: number) =>
        r.rows.find((x) => x.leeftijd === age)?.assets.find((a) => a.type === 'physical')?.eind ??
        0
      // Vóór de verkoop: asset bestaat
      assertGreaterThan(caravanAt(SALE_AGE - 1), 0, 'caravan nog aanwezig op leeftijd 72')
      // Na de verkoop: asset is €0
      assertLessThan(caravanAt(SALE_AGE), 1, 'caravan €0 in het verkoopjaar (73)')
      assertLessThan(caravanAt(SALE_AGE + 1), 1, 'caravan blijft €0 na het verkoopjaar')
    },
  },

  // (b) Beleggingspot verhoogd met ≈ netto-opbrengst (golden-marge 10%).
  {
    id: 'gen-liq-opbrengst-naar-pot',
    name: 'Netto-opbrengst stroomt naar beleggingspot (golden-marge 10%)',
    description:
      'Engine-waarde × salePricePct × (1 − salesCostsPct) verschijnt als instroom bij de beleggingspot op het verkoopjaar.',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 100,
    requiredRole: 'any',
    fn() {
      const built = buildFixture([saleEvent('caravan', SALE_AGE, { verkoopprijs: 20000 })])
      assertNotNull(built, 'build succesvol')
      const r = runHorizonLedger(built!.input)

      const saleRow = r.rows.find((x) => x.leeftijd === SALE_AGE)
      assertNotNull(saleRow, `rij voor leeftijd ${SALE_AGE} bestaat`)

      // salePricePct = 20000/25000 = 0.8, salesCostsPct (physical default) = 0.02
      const caravanRow = saleRow!.assets.find((a) => a.type === 'physical')
      assertNotNull(caravanRow, 'physical-asset-rij aanwezig in het verkoopjaar')
      const marktwaarde = caravanRow!.uitstroom
      assertGreaterThan(marktwaarde, 0, 'uitstroom > 0 (echte engine-waarde)')

      const verwachteOpbrengst = marktwaarde * 0.8 * (1 - 0.02)
      const belInstroom = saleRow!.assets.find((a) => a.id === 'bel')?.instroom ?? 0
      // Golden-marge: ≥ 90% van de verwachte netto-opbrengst bereikt de pot
      assertGreaterThan(
        belInstroom,
        verwachteOpbrengst * 0.9,
        `instroom beleggingen (${belInstroom.toFixed(0)}) ≥ 90% verwacht (${(verwachteOpbrengst * 0.9).toFixed(0)})`,
      )
    },
  },

  // (c) Netto vermogen continu rond het verkoopjaar (geen sprong/verdamping).
  {
    id: 'gen-liq-netto-vermogen-continu',
    name: 'Netto vermogen blijft continu bij verkoop (geen verdamping)',
    description:
      'Sprong in netto vermogen over het verkoopjaar ≤ 15% van de voorgaande waarde; verkoop verhoogt netto vermogen nooit.',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 100,
    requiredRole: 'any',
    fn() {
      const built = buildFixture([saleEvent('caravan', SALE_AGE, { verkoopprijs: 20000 })])
      assertNotNull(built, 'build succesvol')
      const r = runHorizonLedger(built!.input)

      const pre = r.rows.find((x) => x.leeftijd === SALE_AGE - 1)
      const post = r.rows.find((x) => x.leeftijd === SALE_AGE)
      assertNotNull(pre, `rij leeftijd ${SALE_AGE - 1}`)
      assertNotNull(post, `rij leeftijd ${SALE_AGE}`)

      const sprong = Math.abs(post!.nettoVermogen - pre!.nettoVermogen)
      assertLessThan(
        sprong,
        pre!.nettoVermogen * 0.15,
        `sprong netto vermogen (${sprong.toFixed(0)}) < 15% van pre (${(pre!.nettoVermogen * 0.15).toFixed(0)})`,
      )
      // Verkoop verhoogt netto vermogen nooit (verkoopkosten trekken er altijd vanaf)
      assertLessThanOrEqual(
        post!.nettoVermogen,
        pre!.nettoVermogen,
        'verkoop verhoogt netto vermogen niet',
      )
    },
  },

  // (d) Opbrengst stroomt standaard naar de investeerbare surplusTarget (beleggingen).
  // De engine's `surplusTargets` worden bepaald door `opts.surplusTargetTypes`
  // (top-level configuratie); per-event routing bestaat niet in de implementatie.
  // Dit test de canonieke standaard: opbrengst belandt bij beleggingen, niet bij cash.
  {
    id: 'gen-liq-opbrengst-naar-beleggingen-default',
    name: 'Opbrengst stroomt standaard naar beleggingspot (surplusTarget)',
    description:
      'Zonder bijzondere top-level surplusGroup gaat de netto-opbrengst naar de investeerbare pot (beleggingen), niet naar cash.',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 100,
    requiredRole: 'any',
    fn() {
      const built = buildFixture([saleEvent('caravan', SALE_AGE, { verkoopprijs: 20000 })])
      assertNotNull(built, 'build succesvol')
      const r = runHorizonLedger(built!.input)

      const saleRow = r.rows.find((x) => x.leeftijd === SALE_AGE)
      assertNotNull(saleRow, `rij leeftijd ${SALE_AGE}`)

      // Beleggingen-instroom in het verkoopjaar = de opbrengst (surplusTarget)
      const belInstroom = saleRow!.assets.find((a) => a.id === 'bel')?.instroom ?? 0
      // Cash-instroom in het verkoopjaar is kleiner dan de beleggingen-instroom
      const cashInstroom = saleRow!.assets.find((a) => a.id === 'cash')?.instroom ?? 0
      assertGreaterThan(
        belInstroom,
        cashInstroom,
        `opbrengst belandt bij beleggingen (${belInstroom.toFixed(0)}) vóór cash (${cashInstroom.toFixed(0)})`,
      )
      // En de beleggingen-instroom is substantieel (>0)
      assertGreaterThan(belInstroom, 0, 'beleggingen-instroom > 0 in verkoopjaar')
    },
  },

  // (e) Geen dubbeltelling — opbrengst telt één keer.
  {
    id: 'gen-liq-geen-dubbeltelling',
    name: 'Geen dubbeltelling: opbrengst-cashflow onderdrukt bij liquidatie-events',
    description:
      'lifeEventsToCashflows met skipEventIds onderdrukt de one_time opbrengst; monthly_cost_change overleeft.',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    requiredRole: 'any',
    fn() {
      // Event met one_time_cost negatief (= opbrengst) én linked_asset_id.
      const ev = saleEvent(
        'caravan',
        SALE_AGE,
        { verkoopprijs: 20000 },
        { one_time_cost: -20000 },
      )
      const built = buildFixture([ev])
      assertNotNull(built, 'build succesvol')

      // De skip-set onderdrukt de opbrengst-cashflow (one_time le-cost-*)
      const skip = new Set([ev.id])
      const flows = lifeEventsToCashflows([ev], skip)
      const oneTimeProceeds = flows.filter(
        (c) => c.id === `le-cost-${ev.id}` && c.type === 'one_time',
      )
      assertEqual(oneTimeProceeds.length, 0, 'opbrengst-cashflow onderdrukt (geen dubbeltelling)')

      // monthly_cost_change (wegvallend onderhoud) overleeft de skip
      const onderhoud = flows.find((c) => c.id === `le-costchange-${ev.id}`)
      assertNotNull(onderhoud, 'onderhoud-cashflow overleeft skip')
      assertEqual(onderhoud!.direction, 'income', 'kostenverlaging telt als income')

      // Tegelijk: de liquidatie zélf is aangemaakt (bewijs dat de skip niet de engine raakt)
      assertEqual(
        built!.input.assetLiquidations?.length ?? 0,
        1,
        'assetLiquidation aanwezig ondanks skip',
      )
    },
  },

  // Regressie-guard: eigen_huis met linked_asset_id wordt NIET via generiek pad geliquideerd.
  {
    id: 'gen-liq-eigen-huis-uitgesloten',
    name: 'Regressie: eigen_huis wordt niet via generiek liquidatie-pad afgehandeld',
    description:
      'eigen_huis loopt uitsluitend via het downsize-pad (buildV2DownsizeHousing); generiek pad slaat het over.',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    requiredRole: 'any',
    fn() {
      // Bouw een fixture met een eigen_huis-asset en een event dat ernaar verwijst.
      const huisAssets: Asset[] = [
        ...ASSETS.filter((a) => a.id !== 'caravan'),
        {
          id: 'huis',
          name: 'Eigen woning',
          asset_type: 'eigen_huis',
          current_value: 400000,
          expected_return: 3.5,
          is_active: true,
          net_worth_inclusion_pct: 100,
          depreciation_rate: null,
        } as unknown as Asset,
      ]
      const ev = saleEvent('huis', SALE_AGE, { verkoopprijs: 400000 })
      const built = buildFixture([ev], huisAssets, NO_DEBTS)
      assertNotNull(built, 'build succesvol')
      // Generiek pad geeft geen liquidatie voor eigen_huis; downsize-pad is ook niet geconfigureerd.
      assertEqual(
        built!.input.assetLiquidations?.length ?? 0,
        0,
        'eigen_huis levert geen generieke assetLiquidation',
      )
    },
  },

  // Regressie-guard: liquide asset (investment) met linked_asset_id blijft buiten scope.
  {
    id: 'gen-liq-liquide-asset-uitgesloten',
    name: 'Regressie: liquide asset (investment) wordt niet geliquideerd',
    description:
      'Liquide types (investment, cash, retirement, crypto) zijn buiten scope voor asset-liquidatie.',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    requiredRole: 'any',
    fn() {
      // Gebruik een asset-set met ALLEEN liquide types (geen caravan/physical) om te
      // borgen dat een linked_asset_id op een liquid type geen assetLiquidation produceert.
      // ASSETS bevat ook een caravan (physical, sale_config vast_moment) die wél een
      // liquidatie zou produceren; die hoort niet in dit testgeval.
      const liquidOnlyAssets = ASSETS.filter((a) => a.id !== 'caravan')
      const built = buildFixture([saleEvent('bel', SALE_AGE, { verkoopprijs: 300000 })], liquidOnlyAssets)
      assertNotNull(built, 'build succesvol')
      assertEqual(
        built!.input.assetLiquidations?.length ?? 0,
        0,
        'liquide investment-asset levert geen assetLiquidation',
      )
    },
  },

  // salePricePct-berekening: verkoopprijs/huidige waarde, clamp [0, 2].
  {
    id: 'gen-liq-sale-price-pct',
    name: 'salePricePct correct berekend en geclampt',
    description:
      'salePricePct = verkoopprijs/current_value. Bij ratio > 2 → 2.0. Bij ontbrekende prijs → 1.0.',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    requiredRole: 'any',
    fn() {
      // Normaal: 20000/25000 = 0.8
      const builtNormal = buildFixture([saleEvent('caravan', SALE_AGE, { verkoopprijs: 20000 })])
      assertNotNull(builtNormal, 'normal build ok')
      const pctNormal = builtNormal!.input.assetLiquidations![0].salePricePct
      assert(
        Math.abs(pctNormal - 0.8) < 0.0001,
        `salePricePct normaal: verwacht 0.8, gekregen ${pctNormal}`,
      )

      // Geclampte verkoopprijs (100000/25000 = 4 → clamp naar 2.0)
      const builtClamped = buildFixture([saleEvent('caravan', SALE_AGE, { verkoopprijs: 100000 })])
      assertNotNull(builtClamped, 'clamped build ok')
      const pctClamped = builtClamped!.input.assetLiquidations![0].salePricePct
      assert(
        Math.abs(pctClamped - 2.0) < 0.0001,
        `salePricePct geclampd: verwacht 2.0, gekregen ${pctClamped}`,
      )

      // Ontbrekende verkoopprijs → 1.0 (marktwaarde)
      const builtNoPrice = buildFixture([saleEvent('caravan', SALE_AGE, {})])
      assertNotNull(builtNoPrice, 'no-price build ok')
      const pctNoPrice = builtNoPrice!.input.assetLiquidations![0].salePricePct
      assert(
        Math.abs(pctNoPrice - 1.0) < 0.0001,
        `salePricePct geen prijs: verwacht 1.0, gekregen ${pctNoPrice}`,
      )
    },
  },

  // payoffDebtIds: gekoppelde schuld wordt afgelost, residu naar pot.
  {
    id: 'gen-liq-payoff-debt',
    name: 'payoffDebtIds lost gekoppelde schuld af bij verkoop',
    description:
      'Beleggingspand verkopen met payoffDebtIds=[pandlening] → lening afgelost op het verkoopjaar.',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 100,
    requiredRole: 'any',
    fn() {
      // sale_config vast_moment: pand wordt op SALE_AGE verkocht (SSoT ADR 0020).
      // payoffDebtIds komt uit event-metadata (sale_config heeft ze niet) → fallback-pad.
      const pandAssets: Asset[] = (
        [
          ['bel', 'Beleggen', 'investment', 320000, 5, null],
          ['cash', 'Spaar', 'cash', 50000, 0, null],
          ['pand', 'Beleggingspand', 'real_estate', 200000, 3, null],
        ] as const
      ).map(
        ([id, name, t, v, r, dep]) =>
          ({
            id,
            name,
            asset_type: t,
            current_value: v,
            expected_return: r,
            is_active: true,
            net_worth_inclusion_pct: 100,
            depreciation_rate: dep,
            // sale_config vast_moment: de pand-verkoop op SALE_AGE wordt nu gestuurd
            // door sale_config, niet het life-event. Het event levert kalibratie
            // (verkoopprijs, payoffDebtIds via metadata).
            ...(id === 'pand' ? { sale_config: { stand: 'vast_moment', triggerAge: SALE_AGE } } : {}),
          }) as unknown as Asset,
      )
      const pandDebt: Debt[] = [
        {
          id: 'pandlening',
          name: 'Pandlening',
          debt_type: 'other',
          current_balance: 50000,
          interest_rate: 3.0,
          monthly_payment: 300,
          repayment_type: 'annuiteit',
          is_tax_deductible: false,
          linked_asset_id: 'pand',
          end_date: null,
          net_worth_inclusion_pct: 100,
          include_aflossing_in_savings: false,
          is_active: true,
        } as unknown as Debt,
      ]

      const ev = {
        ...saleEvent('pand', SALE_AGE, { verkoopprijs: 200000, payoffDebtIds: ['pandlening'] }),
      }
      const built = buildHorizonInput({
        horizonInput: {
          monthlyContributions: 0,
          yearlyMustExpenses: 30000,
          dateOfBirth: DATE_OF_BIRTH,
          monthlyIncome: 0,
        } as never,
        lifeEvents: [ev],
        fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
        grossReturn: 0.05,
        inflation: 0.02,
        assets: pandAssets,
        debts: pandDebt,
        box3Method: 'forfaitair',
        hasPartner: true,
        horizonEngineV2: true,
      })
      assertNotNull(built, 'build succesvol')
      const liq = built!.input.assetLiquidations![0]
      assert(
        liq.payoffDebtIds?.includes('pandlening') === true,
        'payoffDebtIds bevat pandlening',
      )
      // real_estate-type: verkoopkosten = 0.03 (type-default)
      assert(
        Math.abs(liq.salesCostsPct - 0.03) < 0.0001,
        `salesCostsPct voor real_estate: verwacht 0.03, gekregen ${liq.salesCostsPct}`,
      )

      const r = runHorizonLedger(built!.input)
      const saleRow = r.rows.find((x) => x.leeftijd === SALE_AGE)
      assertNotNull(saleRow, `rij leeftijd ${SALE_AGE}`)
      const lening = saleRow!.schulden.find((d) => d.id === 'pandlening')
      assertNotNull(lening, 'pandlening aanwezig in het verkoopjaar')
      assertLessThan(lening!.eind, 1, 'pandlening afgelost (eind < €1)')
    },
  },
]

// ── Register ───────────────────────────────────────────────────────────────

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'De Horizon — Asset-liquidatie (generiek)',
    description:
      'Bewaakt ADR 0015 generiek: niet-liquide asset-liquidatie via verkoop-life-event in de v2-grootboek-engine.',
    icon: 'PackageOpen',
    testCount: 0,
    defaultRole: 'any',
  })
  registerTests(tests)
}
