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
 *  - de eigenwoning-rente = round(hypotheeksaldo × rente%) (spiegelt
 *    estimateMortgageRente in box1/page.tsx);
 *  - de gecombineerde Vpb+Box2-druk = Vpb + (1−Vpb)×Box2 op de canonieke
 *    VPB_PARAMS/BOX2_PARAMS (spiegelt box2-gecombineerde-druk.tsx).
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
import { computeBox1Tax, grossFromNet } from '@/lib/box1-tax'
import { calculateBox2, VPB_PARAMS, BOX2_PARAMS, DGA_LENING_DREMPEL } from '@/lib/box2-data'
import { dgaLeningTotalForUser } from '@/lib/box2-dga-lening'
import {
  calculateBox3,
  calculatePartnerSplit,
  type Box3Input,
} from '@/lib/box3-data'
import type { Asset, AssetType } from '@/lib/asset-data'
import { compareForfaitairVsWerkelijk } from '@/lib/box3-tegenbewijs'
import { computeJaarruimte, jaarruimteBesparing } from '@/lib/jaarruimte'
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

/** Geschatte aftrekbare hypotheekrente per jaar (spiegelt estimateMortgageRente
 *  in box1/page.tsx: round(saldo × rente%)). */
function estimateMortgageRente(balance: number, ratePct: number): number {
  if (balance <= 0 || ratePct <= 0) return 0
  return Math.round(balance * (ratePct / 100))
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
const hypRente = estimateMortgageRente(hypSaldo, Number(eigenHuisHypotheek.interest_rate))

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
        expected: 'belastbaar=153248; tax=65790; effectief=41.0; marginaal=49.5; ahk=0; arbeidskorting=0; netto=94868',
        actual: `belastbaar=${Math.round(r.belastbaarInkomen)}; tax=${Math.round(r.tax)}; effectief=${fx(r.effectiveRate * 100, 1)}; marginaal=${fx(r.marginalRate * 100, 1)}; ahk=${Math.round(r.algemeneHeffingskorting)}; arbeidskorting=${Math.round(r.arbeidskorting)}; netto=${Math.round(r.nettoBesteedbaar)}`,
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
      const b = computeBox1Tax({ ...base, hypotheekRente: estimateMortgageRente(hypSaldo, 6) }) // 18000
      const c = computeBox1Tax({ ...base, hypotheekRente: 0 })
      return {
        expected: 'forfait=1890; renteaftrek=9300; saldo=-7410; saldo6pct=-16110; hillenOntkoppeld=1357.02; saldoOntkoppeld=532.98',
        actual: `forfait=${Math.round(a.eigenwoningforfait)}; renteaftrek=${Math.round(a.hypotheekrenteaftrek)}; saldo=${Math.round(a.eigenwoningSaldo)}; saldo6pct=${Math.round(b.eigenwoningSaldo)}; hillenOntkoppeld=${fx(c.hillenAftrek, 2)}; saldoOntkoppeld=${fx(c.eigenwoningSaldo, 2)}`,
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
      return {
        expected: 'jaarruimte=35588; franchise=19172; max=35589; besparing=18127',
        actual: `jaarruimte=${jr.jaarruimte}; franchise=${jr.franchise}; max=${jr.max}; besparing=${besparing}`,
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
      return {
        expected: 'totalIncome=100000; taxLaag=16866.54; taxHoog=9658.67; totaleHeffing=26525.21; effectief=26.53',
        actual: `totalIncome=${r.totalIncome}; taxLaag=${fx(r.taxLow, 2)}; taxHoog=${fx(r.taxHigh, 2)}; totaleHeffing=${fx(r.totalTax, 2)}; effectief=${fx(r.effectiveRate * 100, 2)}`,
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
]
