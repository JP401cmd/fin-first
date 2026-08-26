/**
 * Gedeelde engine-checks voor de UAT-Belasting-acceptatiecriteria (`belast.ts`).
 *
 * PURE module — geen vitest/DOM-afhankelijkheden — zodat dezelfde lijst
 * checks kan draaien onder:
 *  1. `belast.engine.test.ts` (vitest/CI): `expect(actual).toBe(expected)` per check.
 *  2. de in-app regressietest-pagina (`lib/regression-tests/suites/uat-belast.ts`):
 *     `assertEqual(actual, expected, label)` per check.
 *
 * Elke `run()` roept UITSLUITEND de échte rekenmotor(en)/constante(n) aan op
 * gedefinieerde brondata (persona of representatief bedrag), zoals de
 * belasting-subpagina's dat doen — geen herimplementatie van bedrijfslogica.
 * Twee bewuste inline-spiegelingen (analoog aan schuld-checks.ts):
 *  - de subpagina-bruto-afleiding = `grossFromNet(netto-jaar)` (spiegelt
 *    resolveBox1GrossIncome.estimateGross, box1-income.ts);
 *  - de gecombineerde Vpb+Box2-druk = Vpb + (1−Vpb)×Box2 op de canonieke
 *    VPB_PARAMS/BOX2_PARAMS (spiegelt box2-gecombineerde-druk.tsx).
 *
 * De DERDE spiegeling — de eigenwoning-rente `round(saldo × rente%)` — is
 * 26-08-2026 opgeheven (bevinding C8): die formule woont nu als
 * `estimateMortgageRenteJaar` in `lib/box1-tax.ts` (pure module, dus gewoon
 * importeerbaar) en wordt hier geconsumeerd i.p.v. nagebouwd.
 *
 * Alle gebruikte engine-functies zijn client-veilig (geen `server-only` /
 * `@/lib/supabase/*` / `next/headers` in hun import-graaf): `lib/box1-tax.ts`,
 * `lib/box2-data.ts`, `lib/box3-data.ts`, `lib/box3-tegenbewijs.ts` en
 * `lib/jaarruimte.ts` zijn pure reken-/constanten-modules.
 *
 * Meerdere samenhangende cijfers worden samengevoegd tot één `key=waarde; …`
 * string met VASTE precisie per veld, zodat de strikte `!==`-vergelijking stabiel
 * is ondanks floating-point-ruis. Alle jaren = 2026 (box1/2/3-defaults).
 */

import { PERSONAS, type PersonaData } from '@/lib/test-personas'
import { computeBox1Tax, estimateMortgageRenteJaar, grossFromNet } from '@/lib/box1-tax'
import { calculateBox2, VPB_PARAMS, BOX2_PARAMS, DGA_LENING_DREMPEL } from '@/lib/box2-data'
import { dgaLeningTotalForUser } from '@/lib/box2-dga-lening'
import {
  calculateBox3,
  calculatePartnerSplit,
  type Box3Input,
} from '@/lib/box3-data'
import type { Asset, AssetType } from '@/lib/asset-data'
import { compareForfaitairVsWerkelijk } from '@/lib/box3-tegenbewijs'
import {
  computeJaarruimte,
  jaarruimteBesparing,
  estimateFactorAFromSalary,
} from '@/lib/jaarruimte'
import {
  generateBox3Strategies,
  rankStrategies,
  pickBest,
  pickTopChoice,
  buildCurrentStanding,
  GOAL_BY_ID,
  JAARRUIMTE_TITLE,
  type GoalSection,
} from '@/lib/tax-optimizer'
import {
  WITHDRAWAL_ORDER_PRESETS,
  POT_RULES_DEFAULTS,
  resolvePotRules,
  type PotRulesConfig,
} from '@/lib/pot-rules'
import { buildTsParams } from '@/lib/horizon-kernel/adapter/prio-overgang'
import { ASSET_TYPE_TO_CATEGORIE } from '@/lib/horizon-kernel/adapter/potten'
import { PENSIOEN_CATEGORIE, pensioenPortfolio } from '@/lib/horizon/pensioen-pot'
import { spendablePortfolio } from '@/lib/horizon/coverage-strip'
import { recentDailyExpenseRateFromRows } from '@/lib/expense-rate'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import type { AssetPot, DebtPot, TsBezitCategorie } from '@/lib/horizon-kernel/types'
import type { ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import {
  VARIANT_SPECS,
  REFERENTIE_VARIANT_ID,
  buildVariantProfile,
  bepaalDiskwalificatie,
  runVariantenSweep,
  type VariantId,
  type VariantUitkomst,
  type VariantenSweepSnapshot,
} from '@/lib/tax-lifetime/varianten-sweep'
import { BELAST_ACCEPTANCE } from './belast'
import type { AcceptanceCriterion } from './types'

const compleet = PERSONAS.compleet
const willem = PERSONAS.willem

export interface BelastEngineCheck {
  /** 'WF-BELAST-07' */
  workflow: string
  /** 'UAT-BELAST-07' */
  scenarioId: string
  /** Korte, mensleesbare omschrijving van wat deze check bewijst. */
  label: string
  /** Roept de échte rekenfunctie(s) aan en levert expected + actual. */
  run: () => { expected: number | string; actual: number | string }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Vindt het criterium in belast.ts — gooit als belast.ts niet meer in sync is. */
function criterion(workflow: string): AcceptanceCriterion {
  const found = BELAST_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — belast.ts is niet in sync.`)
  if (found.assertion.kind !== 'exact') {
    throw new Error(`${workflow} is geen 'exact'-criterium meer in belast.ts (kind=${found.assertion.kind}).`)
  }
  return found
}

function fx(n: number, decimals: number): string {
  return n.toFixed(decimals)
}

/** Volledig getypeerd Asset met alleen de velden die de Box 3-motor leest;
 *  de rest krijgt inerte defaults (spiegelt bezit-checks-stijl). */
function toAsset(name: string, asset_type: AssetType, current_value: number, tax_benefit: boolean | null = null): Asset {
  return {
    id: name,
    user_id: 'test-user',
    name,
    asset_type,
    current_value,
    purchase_value: current_value,
    purchase_date: null,
    expected_return: 0,
    monthly_contribution: 0,
    institution: null,
    account_number: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    subtype: null,
    risk_profile: null,
    tax_benefit,
    is_liquid: null,
    lock_end_date: null,
    ticker_symbol: null,
    rental_income: null,
    woz_value: null,
    retirement_provider_type: null,
    depreciation_rate: null,
    address_postcode: null,
    address_house_number: null,
    expiry_date: null,
    beneficiary: null,
    kvk_number: null,
    ownership_percentage: null,
    annual_dividend: null,
    linked_asset_id: null,
    ownership: 'personal',
    household_id: null,
    net_worth_inclusion_pct: 100,
    has_budget_tracking: false,
    has_woonbalans_tracking: false,
    has_rental_tracking: false,
    monthly_maintenance_cost: 0,
    vva_fee: 0,
    vacancy_log: [],
  }
}

/** Box 3-assets van een persona zoals de live-app ze samenstelt: de
 *  bank_accounts worden door seed-persona als cash-assets weggeschreven
 *  (asset_type 'cash', current_value = balance), plus de expliciete assets. */
function box3AssetsFromPersona(p: PersonaData): Asset[] {
  const cash = p.bank_accounts
    .filter((ba) => ba.is_active)
    .map((ba) => toAsset(ba.name, 'cash', Number(ba.balance)))
  const regular = p.assets.map((a) =>
    toAsset(a.name, a.asset_type as AssetType, Number(a.current_value), a.tax_benefit ?? null),
  )
  return [...cash, ...regular]
}

// ── Box 1-brongegevens uit persona 'compleet' (Tessa) ──────────────────────

const tessaNetYearly = Number(compleet.profile.net_monthly_income ?? 0) * 12 // 91.200
const tessaGross = grossFromNet(tessaNetYearly, 2026) // subpagina-bron
const eigenHuis = compleet.assets.find((a) => a.asset_type === 'eigen_huis' && (a.woz_value ?? 0) > 0)!
const woz = Number(eigenHuis.woz_value)
const eigenHuisHypotheek = compleet.debts.find(
  (d) => d.debt_type === 'mortgage' && d.linked_asset_name === eigenHuis.name,
)!
const hypSaldo = Number(eigenHuisHypotheek.current_balance)
const hypRente = estimateMortgageRenteJaar(hypSaldo, Number(eigenHuisHypotheek.interest_rate))

// ── Variantensweep-fixture (Fase 3-optimizer, WF-BELAST-25) ────────────────

/** Gepinde leeftijd, spiegelt PINNED_AGE in varianten-sweep.test.ts. */
const SWEEP_PINNED_AGE = 42

/** Lege pot-/schuldlijst voor de prio-vector-afleiding (die leest alleen de regels). */
const GEEN_POTTEN: readonly AssetPot[] = []
const GEEN_SCHULDEN: readonly DebtPot[] = []

/** Onttrekkings-prio per kernel-categorie, zoals de kern ze na `buildTsParams` ziet. */
function onttrekkingsPrios(potRules: PotRulesConfig): Record<string, number> {
  const params = buildTsParams(potRules, GEEN_POTTEN, GEEN_SCHULDEN, true)
  const out: Record<string, number> = {}
  for (const c of params.bezitCategorien as readonly TsBezitCategorie[]) {
    out[c.categorie] = c.prioOnttrekking
  }
  return out
}

/** Minimale, volledig getypeerde variant-stub voor de pure vetoregel-toetsen. */
function leegVariant(id: VariantId): VariantUitkomst {
  return {
    id,
    label: id,
    onttrekkingOverlay: id === REFERENTIE_VARIANT_ID ? null : { Pensioen: 5 },
    isReferentie: id === REFERENTIE_VARIANT_ID,
    levenslangeBox3Nominaal: null,
    levenslangeBox1NietVerrekendNominaal: null,
    levenslangeTotaleDrukNominaal: null,
    fireAgeFractional: null,
    eindvermogenNettoNominaal: null,
    eindvermogenBelegbaarNominaal: null,
    eindvermogenPensioenNominaal: null,
    laagsteBuffer: null,
    diskwalificatie: null,
    kernelFout: null,
  }
}

// Echte end-to-end sweep-fixture (persona 'compleet', deplete-strategie zodat de
// onttrekkingsvolgorde er daadwerkelijk toe doet) — spiegelt varianten-sweep.test.ts.
const sweepFixture = buildCompleetHorizonFixture(SWEEP_PINNED_AGE)
const sweepAssetsMetPensioen = sweepFixture.assets.map((a) =>
  a.asset_type === 'retirement' ? { ...a, current_value: 300000 } : a,
)
const sweepProfiel: ConvergentieRawProfileRow = {
  ...buildCompleetKernelProfileBase(SWEEP_PINNED_AGE),
  fire_end_strategy: 'deplete',
  fire_end_age: 90,
  housing_strategy_config: { mode: 'include_full' },
}
const sweepSnapshot: VariantenSweepSnapshot = {
  rawContext: {
    profile: sweepProfiel,
    assets: sweepAssetsMetPensioen,
    debts: sweepFixture.debts,
    lifeEvents: sweepFixture.lifeEvents,
    aowRows: [],
    yearlyExpenses: sweepFixture.financialInput.yearlyMustExpenses,
  },
  aowLeeftijd: 67,
}

// ── Checks — één per 'exact'-workflow in BELAST_ACCEPTANCE ──────────────────

export const BELAST_ENGINE_CHECKS: BelastEngineCheck[] = [
  {
    workflow: 'WF-BELAST-07',
    scenarioId: 'UAT-BELAST-07',
    label: 'Box 1-druk hero (computeBox1Tax @ subpagina-bruto + eigen woning, persona compleet)',
    run: () => {
      criterion('WF-BELAST-07')
      const r = computeBox1Tax({ grossYearlyIncome: tessaGross, year: 2026, wozValue: woz, hypotheekRente: hypRente })
      return {
        expected: 'belastbaar=153248; tax=66675; effectief=41.5; marginaal=49.5; ahk=0; arbeidskorting=0; netto=93983; tariefsaanpassing=885',
        actual: `belastbaar=${Math.round(r.belastbaarInkomen)}; tax=${Math.round(r.tax)}; effectief=${fx(r.effectiveRate * 100, 1)}; marginaal=${fx(r.marginalRate * 100, 1)}; ahk=${Math.round(r.algemeneHeffingskorting)}; arbeidskorting=${Math.round(r.arbeidskorting)}; netto=${Math.round(r.nettoBesteedbaar)}; tariefsaanpassing=${Math.round(r.tariefsaanpassing)}`,
      }
    },
  },
  {
    workflow: 'WF-BELAST-08',
    scenarioId: 'UAT-BELAST-08',
    label: 'Bruto aanpassen: grossFromNet-schatting + round-trip + handmatig €120k',
    run: () => {
      criterion('WF-BELAST-08')
      const estGross = grossFromNet(tessaNetYearly, 2026)
      const nettoRoundTrip = Math.round(computeBox1Tax({ grossYearlyIncome: estGross, year: 2026 }).nettoBesteedbaar)
      const taxBij120k = Math.round(computeBox1Tax({ grossYearlyIncome: 120000, year: 2026 }).tax)
      return {
        expected: 'estimateGross=160658; nettoRoundTrip=91200; taxBij120k=48491',
        actual: `estimateGross=${estGross}; nettoRoundTrip=${nettoRoundTrip}; taxBij120k=${taxBij120k}`,
      }
    },
  },
  {
    workflow: 'WF-BELAST-09',
    scenarioId: 'UAT-BELAST-09',
    label: 'Eigen woning: forfait/renteaftrek/saldo + 6%-randgeval + Hillen-flip bij ontkoppeld',
    run: () => {
      criterion('WF-BELAST-09')
      const base = { grossYearlyIncome: 100000, year: 2026 as const, wozValue: woz }
      const a = computeBox1Tax({ ...base, hypotheekRente: hypRente }) // rente 9300
      const b = computeBox1Tax({ ...base, hypotheekRente: estimateMortgageRenteJaar(hypSaldo, 6) }) // 18000
      const c = computeBox1Tax({ ...base, hypotheekRente: 0 })
      return {
        expected: 'forfait=1890; renteaftrek=9300; saldo=-7410; saldo6pct=-16110; hillenOntkoppeld=1357.02; saldoOntkoppeld=532.98; effect=2783.20; effect6pct=6050.92; effectOntkoppeld=-263.83',
        actual: `forfait=${Math.round(a.eigenwoningforfait)}; renteaftrek=${Math.round(a.hypotheekrenteaftrek)}; saldo=${Math.round(a.eigenwoningSaldo)}; saldo6pct=${Math.round(b.eigenwoningSaldo)}; hillenOntkoppeld=${fx(c.hillenAftrek, 2)}; saldoOntkoppeld=${fx(c.eigenwoningSaldo, 2)}; effect=${fx(a.eigenwoningBelastingEffect, 2)}; effect6pct=${fx(b.eigenwoningBelastingEffect, 2)}; effectOntkoppeld=${fx(c.eigenwoningBelastingEffect, 2)}`,
      }
    },
  },
  {
    workflow: 'WF-BELAST-10',
    scenarioId: 'UAT-BELAST-10',
    label: 'Jaarruimte (computeJaarruimte @ subpagina-bruto, factor A 0) + lijfrente-besparing',
    run: () => {
      criterion('WF-BELAST-10')
      const jr = computeJaarruimte(tessaGross, 0, 2026)
      // Marginaal-correcte besparing (ADR 0040/0041) i.p.v. de oude vlakke
      // jaarruimte × marginaal-benadering — spiegelt de canonieke helper die
      // ook JaarruimteCard/belasting-hub/aandachtspunten-loader/AI-tax-context
      // gebruiken (single source, lib/jaarruimte.ts).
      const besparing = jaarruimteBesparing(tessaGross, jr.jaarruimte, 2026)
      // H23: factor A is bij deze persona ONBEKEND (geen pension_factor_a), dus
      // `jr.jaarruimte` is een BOVENgrens. De kaart toont er sinds 26-08-2026 een
      // bereik bij; de ondergrens komt uit DEZELFDE motor met een geschatte
      // factor A (estimateFactorAFromSalary, 1,875% middelloon-maximum) — geen
      // tweede rekenpad, dus pinbaar in dezelfde oracle.
      const ondergrens = computeJaarruimte(
        tessaGross,
        estimateFactorAFromSalary(tessaGross, { year: 2026 }),
        2026,
      ).jaarruimte
      return {
        expected:
          'jaarruimte=35588; franchise=19172; max=35589; besparing=18127; bereikOndergrens=18955',
        actual: `jaarruimte=${jr.jaarruimte}; franchise=${jr.franchise}; max=${jr.max}; besparing=${besparing}; bereikOndergrens=${ondergrens}`,
      }
    },
  },
  {
    workflow: 'WF-BELAST-11',
    scenarioId: 'UAT-BELAST-11',
    label: 'Jaarruimte per persoon: factor-A-imputatie (6,27×) + partner-guardrail (factor A 0)',
    run: () => {
      criterion('WF-BELAST-11')
      const zonder = computeJaarruimte(tessaGross, 0, 2026).jaarruimte
      const met = computeJaarruimte(tessaGross, 2000, 2026).jaarruimte
      return {
        expected: 'jaarruimteZonderFactorA=35588; jaarruimteMetFactorA2000=23048; imputatieVerschil=12540',
        actual: `jaarruimteZonderFactorA=${zonder}; jaarruimteMetFactorA2000=${met}; imputatieVerschil=${zonder - met}`,
      }
    },
  },
  {
    workflow: 'WF-BELAST-13',
    scenarioId: 'UAT-BELAST-13',
    label: 'Box 2-aanslag: staffel op €100k dividend (calculateBox2, single)',
    run: () => {
      criterion('WF-BELAST-13')
      const r = calculateBox2({
        deelnemingen: [{ name: 'Belang Volkert Compleet Holding BV', annual_dividend: 100000, disposal_gain: 0 }],
        year: 2026,
        hasPartner: false,
        dailyExpenses: 0,
      })
      // H26 — NULL ≠ 0. Een niet-ingevuld dividend geeft dezelfde cijfers als
      // een expliciete nul, maar mag daar niet mee samenvallen: "je betaalt geen
      // Box 2" is een andere mededeling dan "we hebben het nooit gevraagd".
      const base = { year: 2026, hasPartner: false, dailyExpenses: 0 } as const
      const nulOnbekend = calculateBox2({
        ...base,
        deelnemingen: [{ name: 'Leeg BV', annual_dividend: null, disposal_gain: 0 }],
      })
      const nulExpliciet = calculateBox2({
        ...base,
        deelnemingen: [{ name: 'Nul BV', annual_dividend: 0, disposal_gain: 0 }],
      })
      const gemengd = calculateBox2({
        ...base,
        deelnemingen: [
          { name: 'Gevuld BV', annual_dividend: 50000, disposal_gain: 0 },
          { name: 'Leeg BV', annual_dividend: null, disposal_gain: 0 },
        ],
      })
      return {
        expected:
          'totalIncome=100000; taxLaag=16866.54; taxHoog=9658.67; totaleHeffing=26525.21; effectief=26.53; nullOnbekend=true; nullHeffing=0; explicieteNulOnbekend=false; gemengdOnbekendCount=1',
        actual: `totalIncome=${r.totalIncome}; taxLaag=${fx(r.taxLow, 2)}; taxHoog=${fx(r.taxHigh, 2)}; totaleHeffing=${fx(r.totalTax, 2)}; effectief=${fx(r.effectiveRate * 100, 2)}; nullOnbekend=${nulOnbekend.dividendOnbekend}; nullHeffing=${nulOnbekend.totalTaxInclDga}; explicieteNulOnbekend=${nulExpliciet.dividendOnbekend}; gemengdOnbekendCount=${gemengd.dividendOnbekendCount}`,
      }
    },
  },
  {
    workflow: 'WF-BELAST-14',
    scenarioId: 'UAT-BELAST-14',
    label: 'Wet excessief lenen DGA: aggregatie (schuld+vordering) → drempel/excess (box2-dga-lening + calculateBox2)',
    run: () => {
      criterion('WF-BELAST-14')
      const excessFor = (dgaLeningenTotal: number) =>
        calculateBox2({ deelnemingen: [], year: 2026, hasPartner: false, dailyExpenses: 0, dgaLeningenTotal })
          .dgaLeningenExcess

      // (a) Kernbug: alleen een dga_schuld €600k, geen vordering. Vroeger trok de
      //     route de vordering (0) van de schuld af → netto −600k → excess €0.
      //     Optie B: totaal = €600k → bovenmatig deel €100k.
      const totaalA = dgaLeningTotalForUser(
        { schulden: [{ userId: 'u', ownership: 'personal', amount: 600000 }], vorderingen: [] },
        'u',
      )
      // (b) Som van beide bronnen kruist de drempel waar geen enkele bron dat
      //     alleen doet: €400k schuld + €200k vordering = €600k.
      const totaalB = dgaLeningTotalForUser(
        {
          schulden: [{ userId: 'u', ownership: 'personal', amount: 400000 }],
          vorderingen: [{ userId: 'u', ownership: 'personal', amount: 200000 }],
        },
        'u',
      )
      // (c) Persona 'compleet' (Tessa) na de subtype-fix: €9k schuld + €35k
      //     vordering (subtype dga_lening) = €44k → onder de drempel, excess €0.
      const tessaSchulden = compleet.debts
        .filter((d) => d.debt_type === 'dga_schuld')
        .map((d) => ({ userId: 'tessa', ownership: 'personal', amount: Number(d.current_balance) }))
      const tessaVorderingen = compleet.assets
        .filter((a) => a.asset_type === 'vordering' && a.subtype === 'dga_lening')
        .map((a) => ({ userId: 'tessa', ownership: 'personal', amount: Number(a.current_value) }))
      const tessaTotaal = dgaLeningTotalForUser(
        { schulden: tessaSchulden, vorderingen: tessaVorderingen },
        'tessa',
      )

      return {
        expected:
          'drempel=500000; totaalA=600000; excessA=100000; totaalB=600000; excessB=100000; tessaTotaal=44000; tessaExcess=0',
        actual: `drempel=${DGA_LENING_DREMPEL}; totaalA=${totaalA}; excessA=${excessFor(totaalA)}; totaalB=${totaalB}; excessB=${excessFor(totaalB)}; tessaTotaal=${tessaTotaal}; tessaExcess=${excessFor(tessaTotaal)}`,
      }
    },
  },
  {
    workflow: 'WF-BELAST-15',
    scenarioId: 'UAT-BELAST-15',
    label: 'Dividend-schijf omslag: €50k (onder grens) vs €80k (boven grens)',
    run: () => {
      criterion('WF-BELAST-15')
      const mk = (dividend: number) =>
        calculateBox2({ deelnemingen: [{ name: 'x', annual_dividend: dividend, disposal_gain: 0 }], year: 2026, hasPartner: false, dailyExpenses: 0 })
      const onder = mk(50000)
      const boven = mk(80000)
      return {
        expected: 'onderGrensTaxHoog=0; onderGrensTotaal=12250; bovenGrensTaxLaag=16866.54; bovenGrensTaxHoog=3458.67; bovenGrensTotaal=20325.21',
        actual: `onderGrensTaxHoog=${onder.taxHigh}; onderGrensTotaal=${onder.totalTax}; bovenGrensTaxLaag=${fx(boven.taxLow, 2)}; bovenGrensTaxHoog=${fx(boven.taxHigh, 2)}; bovenGrensTotaal=${fx(boven.totalTax, 2)}`,
      }
    },
  },
  {
    workflow: 'WF-BELAST-16',
    scenarioId: 'UAT-BELAST-16',
    label: 'Gecombineerde druk Vpb + Box 2 band (VPB_PARAMS + BOX2_PARAMS 2026)',
    run: () => {
      criterion('WF-BELAST-16')
      const combined = (vpb: number, box2: number) => vpb + (1 - vpb) * box2
      const min = combined(VPB_PARAMS[2026].tariefLaag, BOX2_PARAMS[2026].tariefLaag)
      const max = combined(VPB_PARAMS[2026].tariefHoog, BOX2_PARAMS[2026].tariefHoog)
      return {
        expected: 'minDrukPct=38.84; maxDrukPct=48.80',
        actual: `minDrukPct=${fx(min * 100, 2)}; maxDrukPct=${fx(max * 100, 2)}`,
      }
    },
  },
  {
    workflow: 'WF-BELAST-17',
    scenarioId: 'UAT-BELAST-17',
    label: 'Box 3-aanslag berekeningsstappen (calculateBox3 op persona willem, cash+assets)',
    run: () => {
      criterion('WF-BELAST-17')
      const input: Box3Input = { assets: box3AssetsFromPersona(willem), debts: [], hasPartner: false, dailyExpenses: 0, year: 2026 }
      const r = calculateBox3(input)
      return {
        expected: 'spaargeld=57700; beleggingen=627000; rendementsgrondslag=684700; grondslagSparen=625343; box3Income=35033.24; tax=12612',
        actual: `spaargeld=${r.totaalSpaargeld}; beleggingen=${r.totaalBeleggingen}; rendementsgrondslag=${r.rendementsgrondslag}; grondslagSparen=${r.grondslagSparen}; box3Income=${fx(r.box3Income, 2)}; tax=${Math.round(r.tax)}`,
      }
    },
  },
  {
    workflow: 'WF-BELAST-18',
    scenarioId: 'UAT-BELAST-18',
    label: 'Tegenbewijs werkelijk 3% vs forfaitair (compareForfaitairVsWerkelijk, willem)',
    run: () => {
      criterion('WF-BELAST-18')
      const input: Box3Input = { assets: box3AssetsFromPersona(willem), debts: [], hasPartner: false, dailyExpenses: 0, year: 2026 }
      const box3Result = calculateBox3(input)
      const tb = compareForfaitairVsWerkelijk({ box3Result, werkelijkRendementPct: 3 })
      return {
        expected: 'forfaitair=12612; werkelijkEur=20541.00; werkelijkeHeffing=7394.76; gunstigste=werkelijk; besparing=5217.21',
        actual: `forfaitair=${Math.round(tb.forfaitaireHeffing)}; werkelijkEur=${fx(tb.werkelijkRendementEur, 2)}; werkelijkeHeffing=${fx(tb.werkelijkeHeffing, 2)}; gunstigste=${tb.gunstigste}; besparing=${fx(tb.besparing, 2)}`,
      }
    },
  },
  {
    workflow: 'WF-BELAST-19',
    scenarioId: 'UAT-BELAST-19',
    label: 'Partner-split 50/50: eigen heffingsvrij p.p. vs solo (calculatePartnerSplit, willem)',
    run: () => {
      criterion('WF-BELAST-19')
      const input: Box3Input = { assets: box3AssetsFromPersona(willem), debts: [], hasPartner: false, dailyExpenses: 0, year: 2026 }
      const solo = calculateBox3(input)
      const totalS = solo.totaalSpaargeld
      const totalB = solo.totaalBeleggingen
      const split = calculatePartnerSplit(totalS / 2, totalB / 2, 0, totalS / 2, totalB / 2, 0, 2026)
      return {
        expected: 'partner1Tax=5707; partner2Tax=5707; totaleTax=11415; soloTax=12612',
        actual: `partner1Tax=${split.partner1Tax}; partner2Tax=${split.partner2Tax}; totaleTax=${split.totalTax}; soloTax=${Math.round(solo.tax)}`,
      }
    },
  },
  {
    workflow: 'WF-BELAST-23',
    scenarioId: 'UAT-BELAST-23',
    label:
      'Optimizer pickTopChoice: netto-negatieve Box 3-kans (Willem) valt af, netto-positieve jaarruimte-kans wint; buildCurrentStanding spiegelt Box3Result',
    run: () => {
      criterion('WF-BELAST-23')
      const input: Box3Input = { assets: box3AssetsFromPersona(willem), debts: [], hasPartner: false, dailyExpenses: 100, year: 2026 }
      const current = calculateBox3(input)
      const { baseline, strategies, shiftCurve } = generateBox3Strategies({
        goalId: 'box3-minimaal',
        year: 2026,
        dailyExpenses: 100,
        hasPartner: false,
        current,
      })
      const ranked = rankStrategies(strategies, 'box3-minimaal')
      const shift = ranked.find((s) => s.kind === 'samenstelling-shift')

      // Representatief (zelfde precedent als WF-BELAST-13): jaarruimte-kans op
      // het bruto-inkomen van persona compleet — netto-positief want zonder
      // rendementsverlies (netEffect = besparing).
      const jrJaarruimte = computeJaarruimte(tessaGross, 0, 2026).jaarruimte
      const jrBesparing = jaarruimteBesparing(tessaGross, jrJaarruimte, 2026)

      const sections: GoalSection[] = [
        {
          kind: 'box3',
          goalId: 'box3-minimaal',
          goal: GOAL_BY_ID['box3-minimaal'],
          baseline,
          ranked,
          shiftCurve,
          best: pickBest(ranked, 'box3-minimaal'),
        },
        {
          kind: 'jaarruimte',
          goalId: 'jaarruimte-maximaal',
          goal: GOAL_BY_ID['jaarruimte-maximaal'],
          grossYearlyIncome: tessaGross,
          pensionFactorA: 0,
          // De persona heeft geen pension_factor_a → factor A is ONBEKEND, niet
          // "expliciet 0" (H23). Raakt de ranking niet (dezelfde `besparing`),
          // maar de kaart toont er de bovengrens-markering bij.
          pensionFactorAKnown: false,
          dailyExpenses: 100,
          hasData: true,
          besparing: jrBesparing,
          freedomDays: Math.round(jrBesparing / 100),
          // Geen rendementsverlies (de inleg blijft renderen in de lijfrente),
          // dus netto == bruto — zie GoalSection kind:'jaarruimte'.
          netEffect: jrBesparing,
          netFreedomDays: Math.round(jrBesparing / 100),
        },
      ]
      const top = pickTopChoice(sections)
      const standing = buildCurrentStanding(current, 100)

      return {
        expected: `shiftNetNegative=true; topKind=jaarruimte; topTitle=${JAARRUIMTE_TITLE}; standingTax=12612; standingSpaargeld=57700; standingBeleggingen=627000`,
        actual: `shiftNetNegative=${!!shift && shift.netEffect < 0}; topKind=${top?.kind}; topTitle=${top?.title}; standingTax=${Math.round(standing.tax)}; standingSpaargeld=${standing.totaalSpaargeld}; standingBeleggingen=${standing.totaalBeleggingen}`,
      }
    },
  },
  {
    workflow: 'WF-BELAST-24',
    scenarioId: 'UAT-BELAST-24',
    label:
      'Optimizer verloop + shift-verkenner (Fase 2): TaxTrajectory 2025/2026/2028-indicatie op de baseline, trajectory=null bij partnerverdeling/jaarruimte, curve-eindpunt ≡ samenstelling-shift-strategie, affiene (constante) marginale besparing (Willem)',
    run: () => {
      criterion('WF-BELAST-24')
      const input: Box3Input = { assets: box3AssetsFromPersona(willem), debts: [], hasPartner: false, dailyExpenses: 100, year: 2026 }
      const current = calculateBox3(input)
      // optimalAllocation representatief meegegeven zodat de partnerverdeling-
      // kans verschijnt (Willem heeft zelf geen fiscaal partner) — puur om de
      // trajectory=null-tak van die kans te bewijzen (spiegelt het
      // representatieve-cijfer-precedent van WF-BELAST-13/-19).
      const { baseline, strategies, shiftCurve } = generateBox3Strategies({
        goalId: 'box3-minimaal',
        year: 2026,
        dailyExpenses: 100,
        hasPartner: false,
        current,
        optimalAllocation: { totalTax: Math.round(current.tax) - 500, savingsVsEqual: 500 },
      })
      const shift = strategies.find((s) => s.kind === 'samenstelling-shift')
      const partnerverdeling = strategies.find((s) => s.kind === 'partnerverdeling')
      const curve = shiftCurve ?? []
      const end = curve[curve.length - 1]

      // Curve-eindpunt ≡ de shift-strategie (byte-identiek, buildShiftCurve-
      // commentaar in box3-strategies.ts): dezelfde tax/savings/returnCostEur/netEffect.
      const endMatchesShift =
        !!shift && !!end && end.tax === shift.optimizedTax && end.savings === shift.savings &&
        end.returnCostEur === shift.returnCostEur && end.netEffect === shift.netEffect

      // Affiene curve: de marginale besparing per stap (savings[i]−savings[i−1])
      // is constant — geen knik door de vrijstelling (vergrendeld in
      // lib/tax-optimizer/box3-optimizer.test.ts, 'de curve is affien'-groep).
      // Ronde op 6 decimalen om float-ruis van herhaalde vermenigvuldigingen
      // (box3Income × tarief) te absorberen, niet om de uitkomst te verzachten.
      const marginalSteps: number[] = []
      for (let i = 1; i < curve.length; i++) {
        marginalSteps.push(Number((curve[i].savings - curve[i - 1].savings).toFixed(6)))
      }
      const marginalConstant = marginalSteps.every((s) => s === marginalSteps[0])
      // baselineStrategy() zet trajectory altijd (nooit null) — zie box3-strategies.ts.
      if (!baseline.trajectory) throw new Error('baseline.trajectory onverwacht null')
      const baselineTrajectory = baseline.trajectory

      return {
        expected:
          `curvePoints=21; endMatchesShift=true; marginalConstant=true; ` +
          `baselineTax2026=${Math.round(current.tax)}; baselineTax2026EqCurrent=true; ` +
          `partnerverdelingTrajectory=null; jaarruimteNote=n.v.t. — deze kans zit in Box 1`,
        actual:
          `curvePoints=${curve.length}; endMatchesShift=${endMatchesShift}; marginalConstant=${marginalConstant}; ` +
          `baselineTax2026=${Math.round(baselineTrajectory.tax2026)}; baselineTax2026EqCurrent=${baselineTrajectory.tax2026 === current.tax}; ` +
          `partnerverdelingTrajectory=${partnerverdeling ? partnerverdeling.trajectory : 'geen-partnerverdeling-kans'}; jaarruimteNote=n.v.t. — deze kans zit in Box 1`,
      }
    },
  },
  {
    workflow: 'WF-BELAST-25',
    scenarioId: 'UAT-BELAST-25',
    label:
      'Variantensweep (Fase 3): prio-vectoren per variant + de V1-val bij de presets, vetovolgorde (buffer-uitgeput > fire-later), kernelFout krijgt geen diskwalificatie, eindvermogen op alle drie de grondslagen (incl. de resterende pensioenpot op de kern-categorie) uit een echte sweep-run',
    run: () => {
      criterion('WF-BELAST-25')

      // (b) De drie sweep-varianten leveren aantoonbaar VERSCHILLENDE prio-
      // vectoren op `categorie_prios.onttrekking.Pensioen`; de twee presets die
      // ná de kernel-klem (min(i+1,4)) samenvallen doen dat NIET (de V1-val).
      const basisProfielVoorPrio: ConvergentieRawProfileRow = {
        ...buildCompleetKernelProfileBase(SWEEP_PINNED_AGE),
        pot_rules: undefined,
      }
      const vectoren = VARIANT_SPECS.map((spec) =>
        onttrekkingsPrios(resolvePotRules(buildVariantProfile(basisProfielVoorPrio, spec))),
      )
      const variantOverlaysDiffer =
        vectoren[1].Pensioen === 5 && vectoren[2].Pensioen === 1 && vectoren[0].Pensioen === 4

      const liquideEerst = WITHDRAWAL_ORDER_PRESETS.find((p) => p.id === 'liquide-eerst')!
      const pensioenSparen = WITHDRAWAL_ORDER_PRESETS.find((p) => p.id === 'pensioen-sparen')!
      const presetA = onttrekkingsPrios({ ...POT_RULES_DEFAULTS, withdrawalOrderGroups: liquideEerst.order })
      const presetB = onttrekkingsPrios({ ...POT_RULES_DEFAULTS, withdrawalOrderGroups: pensioenSparen.order })
      const presetsCollide = JSON.stringify(presetA) === JSON.stringify(presetB)

      // (c) Vetovolgorde: buffer-uitgeput gaat vóór fire-later-dan-referentie —
      // en een kernelFout-variant krijgt GEEN diskwalificatie-reden.
      const referentieStub: VariantUitkomst = {
        ...leegVariant('huidige-volgorde'),
        levenslangeTotaleDrukNominaal: 100000,
        fireAgeFractional: 58,
        laagsteBuffer: { bedrag: 10000, age: 70 },
        kernelFout: null,
      }
      const beideOvertredingen: VariantUitkomst = {
        ...leegVariant('pensioen-laatst'),
        levenslangeTotaleDrukNominaal: 1,
        fireAgeFractional: 62,
        laagsteBuffer: { bedrag: 0, age: 70 },
        kernelFout: null,
      }
      const vetoOrder = bepaalDiskwalificatie(beideOvertredingen, referentieStub)

      const kernFoutVariant: VariantUitkomst = { ...leegVariant('pensioen-laatst'), kernelFout: 'kern-fout' }
      const kernelFoutNoDisq = bepaalDiskwalificatie(kernFoutVariant, referentieStub) === null

      // (d) Eindvermogen op alle DRIE de grondslagen, per variant, uit een echte
      // sweep — inclusief de resterende pensioenpot. Die derde is geen extraatje:
      // `spendablePortfolio` slaat de pensioenpot per constructie over, dus zonder
      // dat getal toont katern IV de variant die het pensioen uitstelt als de
      // armste terwijl ze juist het meeste overhoudt.
      const resultaat = runVariantenSweep(sweepSnapshot)
      const eindvermogenCompleet = resultaat.varianten.every(
        (v) =>
          Number.isFinite(v.eindvermogenNettoNominaal as number) &&
          Number.isFinite(v.eindvermogenBelegbaarNominaal as number),
      )
      const nettoGteBelegbaar = resultaat.varianten.every(
        (v) => (v.eindvermogenNettoNominaal as number) >= (v.eindvermogenBelegbaarNominaal as number) - 1,
      )
      const pensioenpotCompleet = resultaat.varianten.every((v) =>
        Number.isFinite(v.eindvermogenPensioenNominaal as number),
      )
      // De pot volgt de lever: prio 5 (uitstellen) houdt meer over dan de
      // ongewijzigde volgorde, en die weer meer dan prio 1 (vroeg opnemen).
      const [refV, laatstV, eerstV] = resultaat.varianten
      const pensioenpotVolgtLever =
        (laatstV.eindvermogenPensioenNominaal as number) > (refV.eindvermogenPensioenNominaal as number) &&
        (refV.eindvermogenPensioenNominaal as number) > (eerstV.eindvermogenPensioenNominaal as number)
      // …en de grondslag is de KERN-CATEGORIE, niet het app-type `retirement`:
      // `levensverzekering` mapt op dezelfde categorie en moet meetellen.
      // Bewust een AANROEP van de échte functie op een rij met béíde
      // pensioentypen, niet alleen een vergelijking van twee map-entries: die
      // eerdere opzet bleef groen als `pensioenPortfolio` uitsluitend
      // `retirement` zou tellen — precies de fout die dit criterium moet vangen.
      // Het niet-pensioentype hoort er NIET in: dat bewijst dat de functie op de
      // categorie filtert en niet simpelweg alles optelt.
      const proefRij = {
        assetBuckets: {
          retirement: { endValue: 1_000 },
          levensverzekering: { endValue: 250 },
          investment: { endValue: 9_000 },
        },
      } as unknown as UnifiedProjectionRow
      const pensioenpotVolgtCategorie =
        pensioenPortfolio(proefRij) === 1_250 &&
        ASSET_TYPE_TO_CATEGORIE.retirement === PENSIOEN_CATEGORIE &&
        ASSET_TYPE_TO_CATEGORIE.levensverzekering === PENSIOEN_CATEGORIE

      // (e) De twee GETOONDE vermogensgrondslagen delen geen enkel app-type meer.
      // Tot 10 aug 2026 telde `levensverzekering` in béide (belegbaar én
      // pensioenpot); sinds het eigenaarsbesluit (optie A) staat die polis in
      // NON_SPENDABLE_ASSET_TYPES. Per app-type geprobeerd op een rij met precies
      // één bucket — waarde-onafhankelijk, dus een fixture zonder polis kan dit
      // criterium niet stil groen houden.
      const grondslagenDisjunct = (Object.keys(ASSET_TYPE_TO_CATEGORIE) as AssetType[]).every((t) => {
        const enkelRij = { assetBuckets: { [t]: { endValue: 1_000 } } } as unknown as UnifiedProjectionRow
        return !(spendablePortfolio(enkelRij) > 0 && pensioenPortfolio(enkelRij) > 0)
      })

      return {
        expected:
          'prioReferentie=4; prioLaatst=5; prioEerst=1; variantOverlaysDiffer=true; presetsCollide=true; vetoOrder=buffer-uitgeput; kernelFoutNoDisq=true; eindvermogenCompleet=true; nettoGteBelegbaar=true; pensioenpotCompleet=true; pensioenpotVolgtLever=true; pensioenpotVolgtCategorie=true; grondslagenDisjunct=true',
        actual: `prioReferentie=${vectoren[0].Pensioen}; prioLaatst=${vectoren[1].Pensioen}; prioEerst=${vectoren[2].Pensioen}; variantOverlaysDiffer=${variantOverlaysDiffer}; presetsCollide=${presetsCollide}; vetoOrder=${vetoOrder}; kernelFoutNoDisq=${kernelFoutNoDisq}; eindvermogenCompleet=${eindvermogenCompleet}; nettoGteBelegbaar=${nettoGteBelegbaar}; pensioenpotCompleet=${pensioenpotCompleet}; pensioenpotVolgtLever=${pensioenpotVolgtLever}; pensioenpotVolgtCategorie=${pensioenpotVolgtCategorie}; grondslagenDisjunct=${grondslagenDisjunct}`,
      }
    },
  },
  {
    workflow: 'WF-BELAST-26',
    scenarioId: 'UAT-BELAST-26',
    label: 'Vrijheidsdagen op /api/household/box2 + box3: canoniek rolling dagtarief, geen budget-limiet-fictie',
    run: () => {
      criterion('WF-BELAST-26')
      // Vóór 11 aug 2026 bouwden beide routes 'monthlyExpenses' zelf op als de
      // som van budget-LIMIETEN (`budgets.default_limit`), met een verzonnen
      // €100/dag-terugval zodra er geen budgetten waren. Sinds de fix lezen
      // beide routes `getRecentDailyExpenseRate(supabase)`, dat op exact deze
      // pure functie (`recentDailyExpenseRateFromRows`) uitkomt — dezelfde bron
      // als `DashboardData.dailyExpenseRate` en de rapport-routes.
      const referenceDate = new Date('2026-08-11T12:00:00Z')

      // (a) Géén transactierijen én géén schatting-fallback → dailyRate 0. De
      // OUDE code gaf hier stiekem €100/dag; de heffingsmotoren zelf guarden al
      // op `dailyExpenses > 0` en geven dan freedomDays 0 — geen verzonnen getal.
      const leeg = recentDailyExpenseRateFromRows([], referenceDate)
      const box2Leeg = calculateBox2({
        deelnemingen: [{ name: 'Belang', annual_dividend: 100_000, disposal_gain: 0 }],
        year: 2026,
        hasPartner: false,
        dailyExpenses: leeg.dailyRate,
      })
      const box3Leeg = calculateBox3({
        assets: box3AssetsFromPersona(willem),
        debts: [],
        hasPartner: false,
        dailyExpenses: leeg.dailyRate,
        year: 2026,
      })

      // (b) Realistische 3 maanden transactierijen (€2.000/mnd) → hetzelfde
      // rolling dagtarief als elk ander KRUIS-20-oppervlak, en freedomDays volgt
      // rechtstreeks uit round(heffing / dagtarief) — geen tweede formule.
      const rows = [
        { amount: -2000, date: '2026-06-15' },
        { amount: -2000, date: '2026-07-15' },
        { amount: -2000, date: '2026-08-05' },
      ]
      const gevuld = recentDailyExpenseRateFromRows(rows, referenceDate)
      const box2Gevuld = calculateBox2({
        deelnemingen: [{ name: 'Belang', annual_dividend: 100_000, disposal_gain: 0 }],
        year: 2026,
        hasPartner: false,
        dailyExpenses: gevuld.dailyRate,
      })

      return {
        expected:
          'dailyRateLeeg=0; box2FreedomDaysLeeg=0; box3FreedomDaysLeeg=0; dailyRateGevuld=65.7534; box2TotaleHeffing=26525.21; box2FreedomDaysGevuld=403',
        actual:
          `dailyRateLeeg=${leeg.dailyRate}; box2FreedomDaysLeeg=${box2Leeg.freedomDays}; box3FreedomDaysLeeg=${box3Leeg.freedomDays}; ` +
          `dailyRateGevuld=${fx(gevuld.dailyRate, 4)}; box2TotaleHeffing=${fx(box2Gevuld.totalTaxInclDga, 2)}; box2FreedomDaysGevuld=${box2Gevuld.freedomDays}`,
      }
    },
  },
]
