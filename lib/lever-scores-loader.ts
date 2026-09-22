// lib/lever-scores-loader.ts
//
// SINGLE SOURCE OF TRUTH voor de vier-hefbomen-scores (Bezittingen, Schulden,
// Cashflow, Belasting) én de Belasting-box-statussen (Box 1/2/3) die de sidebar-
// dots tonen.
//
// Achtergrond: de berekening stond voorheen INLINE in app/(app)/layout.tsx (de
// sidebar-shell). De status-duiding-melding (lib/page-status/*) moet EXACT
// dezelfde status tonen als de nav-dot van een pagina — anders spreekt de banner
// de sidebar tegen. Door deze ene `cache()`-wrapped loader te delen tussen de
// shell én loadPageStatusMap kan er per definitie geen drift ontstaan, en wordt
// de query maar één keer per request uitgevoerd (React `cache()` dedupliceert op
// argument-identiteit).
//
// "Consume, don't recompute": niemand assembleert de lever-scores-input of roept
// computeLeverScores/box1JaarruimteStatus/box3TaxStatus/computeFiscaleRuimte
// zelf opnieuw aan — men importeert `loadLeverScores`.
//
// ADR 0177: de Belasting-hefboom oordeelt hier sinds 22 sep 2026 op ONBENUTTE
// FISCALE RUIMTE (`computeFiscaleRuimte`, lib/fiscale-ruimte.ts) in plaats van
// op de euro-banden van `box3TaxStatus`. Die laatste blijft bestaan als Box
// 3-kaartlabel (ADR 0177 D6). De vijf scalars achter de nieuwe grondslag komen
// uit de canonieke motoren op rijen die deze loader al in handen heeft — zie
// het blok "ONBENUTTE FISCALE RUIMTE" onderaan: GEEN enkele extra query.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedUser } from '@/lib/supabase/cached-user'
import {
  computeLeverScores,
  type LeverScores,
} from '@/lib/lever-scores'
import {
  computeBox3TaxableInput,
  box3TaxStatus,
  type Box3TaxableInput,
} from '@/lib/box3-taxable-input'
import {
  calculateBox3,
  optimizePartnerAllocation,
  CURRENT_TAX_YEAR,
  type Box3Input,
} from '@/lib/box3-data'
import { generateBox3Strategies, DEFAULT_GOAL_ID } from '@/lib/tax-optimizer'
import { computeBox1Tax, grossFromNet } from '@/lib/box1-tax'
import { buildEigenWoningBox1Input } from '@/lib/box1-income'
import {
  computeFiscaleRuimte,
  type FiscaleRuimteInput,
  type FiscaleRuimteResult,
} from '@/lib/fiscale-ruimte'
import { hasPartner as deriveHasPartner } from '@/lib/household-type'
import type { Asset } from '@/lib/asset-data'
import { buildBudgetSpendingMap, type SpendingSplitRow } from '@/lib/budget-spending'
import { getCurrentMonthSplits } from '@/lib/budget-spending-fetch'
import { buildBudgetTypeMap } from '@/lib/budget-utils'
import {
  box1JaarruimteVerdict,
  computeJaarruimte,
  jaarruimteBesparing,
  resolvePensionFactorA,
} from '@/lib/jaarruimte'
import {
  resolveAmountWithBasis,
  resolveEffectiveIncomeExpenses,
} from '@/lib/effective-financials'
import { transactionAnnualIncome } from '@/lib/budget-realized'
import { loadBudgetBasis } from '@/lib/household/budget-share'
import type { BudgetBasisRow } from '@/lib/budget-basis'
import { resolveFireParams } from '@/lib/fire-params'
import { SAVINGS_RATE_WINDOW_MONTHS } from '@/lib/constants'
import {
  computeSavingsRate6m,
  computeDebtAflossingMonthly,
  resolveSavingsSource,
  savingsRateWindow,
  savingsRateDataMonths,
} from '@/lib/savings-source'
import {
  getActiveAssets,
  getActiveDebts,
  getOwnProfile,
  getBudgets,
  getUnlinkedBankAccounts,
  getCurrentMonthTx,
  getEarliestIncomeDate,
} from '@/lib/server-data/base'
import { resolveUnlinkedCashShare, unlinkedCashTotal } from '@/lib/unlinked-cash'
import {
  getTxAgg12m,
  aggSumPositief,
  aggSumNegatiefAbs,
  type TxMonthAggregateRow,
} from '@/lib/server-data/tx-aggregates'
import type { Debt } from '@/lib/debt-data'
import type { LeverageStatus } from '@/lib/leverage-status'
import type { Perspective } from '@/lib/household-data'
import { loadPerspectiveDataServer } from '@/lib/household/perspective-loader-server'

/** Resultaat van de gedeelde lever-scores-loader. */
export interface LeverScoresResult {
  /** De vier-hefbomen-scores (Bezittingen/Schulden/Cashflow/Belasting). */
  scores: LeverScores
  /**
   * Box 3-belast-vermogen-signaal — de canonieke input voor `box3TaxStatus`.
   * Gedeeld zodat de Box 3-dot, de Belasting-lever én de status-banner exact
   * dezelfde uitkomst geven.
   */
  taxInput: Box3TaxableInput
  /**
   * Box 3-status (good/warn/bad/neutral) afgeleid uit `taxInput`.
   *
   * LET OP — dit is sinds ADR 0177 NIET meer de status van de Belasting-
   * HEFBOOM. Hij blijft het Box 3-kaartlabel op de belasting-hub en de
   * kop van /overzicht/belasting/box3 ("Ruim boven de vrijstelling" — een
   * feitelijke constatering over de grondslag, ADR 0177 D6). Het oordeel van de
   * hefboom staat in `fiscaleRuimte` / `scores.tax`.
   */
  box3Status: LeverageStatus
  /** ADR 0177: onbenutte fiscale ruimte — voedt de Belasting-hefboom én de melding. */
  fiscaleRuimte: FiscaleRuimteResult
  /**
   * Box 1-status (onbenutte jaarruimte → belastingbesparingskans). Afgeleid uit
   * het effectieve maandinkomen + marginaal tarief, identiek aan de Belasting-
   * landingskaart en de sidebar-dot.
   */
  box1Status: LeverageStatus
  /**
   * Canoniek netto vermogen (bezittingen − schulden), perspectief-correct en
   * INCLUSIEF de niet-gekoppelde bankrekening-saldi (`bank_accounts` met
   * `linked_asset_id IS NULL`). Dit is exact dezelfde grondslag als de
   * /overzicht-hero/-grafiek (`healthScoreInput.totalAssets − totalDebts`,
   * lib/horizon-data-loader.ts): de sidebar consumeert dit i.p.v. een eigen
   * inline-som, zodat sidebar == hero == dashboard per definitie gelijk zijn.
   */
  netWorth: number
  /**
   * Aantal top-level expense/savings-budgets dat deze maand OVER de limiet zit
   * (kompas cashflow-indicator #847). Voedt het sidebar-`budgetOver`-signaal.
   * Intern al berekend uit dezelfde budget-health-queries; hier ge-expose-d
   * zodat de shell het consumeert i.p.v. een eigen inline-blok met dubbele
   * queries te draaien ("consume, don't recompute").
   */
  budgetsOver: number
}

/** Minimale profiel-velden die de loader nodig heeft. */
interface LeverScoresProfile {
  household_type?: string | null
  net_monthly_income?: number | null
  estimated_monthly_expenses?: number | null
  income_source?: string | null
  expenses_source?: string | null
  expected_return?: number | null
  inflation_rate?: number | null
  box3_method?: string | null
  /** Jaarlijkse pensioenaangroei (factor A) — voedt de Box 1-statusdot. */
  pension_factor_a?: number | null
  pension_factor_a_source?: string | null
  /**
   * Handmatig opgegeven bruto-jaarinkomen (Box 1). Heeft VOORRANG op de
   * schatting uit netto, exact zoals `resolveBox1GrossIncome` het doet
   * (`manual ?? estimateGross`, lib/box1-income.ts).
   *
   * `getOwnProfile` doet `select('*')`, dus deze kolom ligt er al — hem hier
   * opnemen kost geen query. Zonder deze regel rekende het hefboompad altijd op
   * de schattingstak, terwijl /overzicht/belasting/box1 het opgegeven bruto
   * gebruikte: twee bedragen voor één grootheid, één klik uit elkaar.
   */
  box1_gross_income?: number | null
}

type AssetRow = {
  current_value: number | string
  asset_type?: string | null
  net_worth_inclusion_pct?: number | null
  // Nodig voor de canonieke Box 3-indeling (classifyAsset via
  // computeBox3TaxableInput): subtype-nuance (kunst vs. sieraden), de
  // pensioen-vlag en de handmatige vrijstellings-overschrijving.
  // `getActiveAssets` levert ze via ASSET_CLIENT_COLUMNS.
  id?: string | null
  subtype?: string | null
  tax_benefit?: boolean | null
  box3_vrijgesteld?: boolean | null
  box3_vrijstelling_reden?: string | null
  /**
   * `calculateBox3` filtert zélf op `is_active` (lib/box3-data.ts). De query
   * doet dat al (`getActiveAssets` → `.eq('is_active', true)`), maar het VELD
   * moet in de rij staan, anders filtert de motor alles weg en komt de heffing
   * stil op € 0 uit. `ASSET_CLIENT_COLUMNS` levert de kolom.
   */
  is_active?: boolean | null
  /**
   * De WOZ-waarde van een `eigen_huis`-rij — de eerste helft van de canonieke
   * eigen-woning-invoer voor `computeBox1Tax` (`buildEigenWoningBox1Input`,
   * bevinding C8). Zit in `ASSET_CLIENT_COLUMNS`.
   */
  woz_value?: number | string | null
}
type DebtRow = {
  current_balance: number | string
  original_amount?: number | string | null
  net_worth_inclusion_pct?: number | null
  // ── Velden die de canonieke Box 3-schuldindeling leest ──
  // `getActiveDebts` doet select('*'), dus ze liggen er al. Zonder deze vier
  // zou de cast naar `Debt` oneerlijk zijn en `classifyDebt` op `undefined`
  // draaien: een EIGENWONINGHYPOTHEEK zou dan ten onrechte als Box 3-schuld
  // meetellen (en `calculateBox3` zou zonder `is_active` álle schulden
  // wegfilteren).
  is_active?: boolean | null
  debt_type?: string | null
  linked_asset_id?: string | null
  is_tax_deductible?: boolean | null
  /**
   * De tweede helft van de eigen-woning-invoer: `buildEigenWoningBox1Input`
   * leidt de jaarrente af uit saldo × rente% (`estimateMortgageRenteJaar`).
   * `getActiveDebts` doet `select('*')`, dus de kolom ligt er al.
   */
  interest_rate?: number | string | null
}
type BudgetRow = {
  id: string
  default_limit: number
  budget_type: string
  parent_id: string | null
  is_archived: boolean
}
type Tx6mRow = {
  amount: number | string
  budget_id?: string | null
  transaction_type?: string | null
  date: string
}
/**
 * De huidige-maand-rijen uit `getCurrentMonthTx`. Die kolomset is verbreed naar
 * `BUDGET_SPENDING_TX_COLUMNS` (lib/budget-spending-fetch.ts), dus `id` en
 * `is_split` zijn hier beschikbaar — nodig om de split-ouder over te slaan.
 */
type CurrentMonthTxRow = Tx6mRow & {
  id?: string
  is_income?: boolean | null
  is_split?: boolean | null
}

/** De drie budget-health-tellers die de cashflow-hefboom voedt. */
export interface BudgetHealthCounts {
  /** Top-level budgetten met een echte limiet (> 0). */
  budgetsTotal: number
  /** Daarvan: boven de maandlimiet. */
  budgetsOver: number
  /** De rest. */
  budgetsOnTrack: number
}

/**
 * Budget-health voor de kompas-cashflow-indicator: hoeveel top-level
 * expense/savings-budgetten staan deze maand boven hun limiet.
 *
 * De besteed-som is de CANONIEKE (`buildBudgetSpendingMap`, lib/budget-spending.ts)
 * en niet langer een eigen `Math.abs(amount)`-lus. Gevolg, bedoeld: op een
 * uitgaven-budget gaat een inkomst van de besteding AF, dus een budget waar
 * netto geld binnenkwam is NOOIT "over" — het sidebar-statuspunt kleurt niet
 * meer rood op een terugbetaling. Op een savings-budget (inkomsten-richting) is
 * de bijdrage het bedrag zelf, dus een spaarSTORTING (negatieve boeking) telt
 * daar negatief en zet het budget evenmin "over"; dat is dezelfde uitkomst als
 * de budgetten-pagina toont, en de reden dat deze teller die grondslag deelt.
 *
 * TWEE BEWUSTE GRENZEN, allebei ONGEWIJZIGD t.o.v. de vorige implementatie:
 *  - GEEN parent-rollup. `healthBudgets` bevat alleen top-level budgetten, en de
 *    som leest uitsluitend het budget_id van de transactie zelf. Een hoofdbudget
 *    dat zijn uitgaven via kinderen boekt telt hier dus 0. Dat rechttrekken
 *    verandert het aantal "over" budgetten en hoort bij een eigen beoordeling.
 *  - `splits` is VERPLICHT en zonder default — dezelfde compiler-vangrail als op
 *    `buildBudgetSpendingMap`: een aanroep die ze weglaat zou stil de
 *    split-ouder op zijn eigen budget tellen i.p.v. haar regels.
 */
export function deriveBudgetHealthCounts(
  healthBudgets: { id: string; default_limit: number }[],
  monthTx: {
    id?: string
    budget_id?: string | null
    amount: number | string
    transaction_type?: string | null
    is_split?: boolean | null
  }[],
  splits: SpendingSplitRow[],
  budgetTypes: Map<string, string>,
): BudgetHealthCounts {
  const spendPerBudget = buildBudgetSpendingMap(monthTx, splits, budgetTypes)
  const budgetsTotal = healthBudgets.filter((b) => b.default_limit > 0).length
  const budgetsOver = healthBudgets.filter((b) => {
    if (b.default_limit <= 0) return false
    return (spendPerBudget[b.id] ?? 0) > b.default_limit
  }).length
  return { budgetsTotal, budgetsOver, budgetsOnTrack: budgetsTotal - budgetsOver }
}

// ── ONBENUTTE FISCALE RUIMTE — de grondslag van de Belasting-hefboom ─────────
//
// ADR 0177: de hefboom oordeelt niet meer op de HOOGTE van de heffing (de
// euro-banden van `box3TaxStatus`, monotoon dalend in vermogen en zonder weg
// terug) maar op hoeveel ruimte ONBENUT blijft, als aandeel van de eigen
// heffing over Box 1 én Box 3.
//
// HARDE EIS — GEEN ENKELE EXTRA QUERY (ADR 0177 D5). `loadLeverScores` draait
// in app/(app)/layout.tsx op ÉLKE route. `loadFiscaleKansen` (de tweede
// invoerkant, voor de belasting-hub) trekt `loadHorizonRaw` en
// `loadPerspectiveBox3` mee; die hier hangen zou elke pagina in de app de
// horizon-loader laten betalen — precies de regressie die ADR 0083 heeft
// opgeruimd. Alles hieronder is dus PURE rekenkracht op rijen die de loader al
// in handen heeft.
//
// Eén rekenweg, twee invoerkanalen: de verdeling, de banden en de volgorde
// wonen in `computeFiscaleRuimte` (lib/fiscale-ruimte.ts), niet hier. Deze
// functie levert uitsluitend de vijf SCALARS aan.
//
// BEWUST EEN APARTE, GEËXPORTEERDE PURE FUNCTIE (en geen inline blok in de
// loader): hij is daardoor zonder Supabase te testen, en de `try/catch`
// hieronder heeft een scherpe grens.

/** De inerte invoer: geen enkele fiscale bron → 'neutral', nooit groen. */
const GEEN_FISCALE_BRON: FiscaleRuimteInput = {
  partnerverdelingBesparing: null,
  jaarruimteBesparing: null,
  samenstellingNetEffect: null,
  box1Tax: null,
  box3Tax: null,
}

export interface DeriveFiscaleRuimteInput {
  /** Actieve bezittingen (RLS-scope: eigen + huishoud-gedeeld). */
  assetRows: AssetRow[]
  /** Actieve schulden. */
  debtRows: DebtRow[]
  /** `profiles.household_type` — bepaalt de fiscale partner (dubbele voet/drempel). */
  householdType: string | undefined
  /** Uit `computeBox3TaxableInput`: heeft deze gebruiker box 3-belastbaar bezit? */
  hasBox3Assets: boolean
  /** Het EFFECTIEVE netto maandinkomen (`resolveEffectiveIncomeExpenses`). */
  netMonthlyIncome: number
  /** Jaarlijkse pensioenaangroei (factor A, €) uit `resolvePensionFactorA`. */
  factorA: number
  /** `resolvePensionFactorA(...).isKnown` — NULL ≠ 0, zie hieronder. */
  factorAKnown: boolean
  /**
   * `profiles.box1_gross_income` — het handmatig opgegeven bruto-jaarinkomen,
   * of `null`. Heeft voorrang op de schatting uit netto (`manual ??
   * estimateGross`), dezelfde precedentie als `resolveBox1GrossIncome`.
   */
  manualGrossYearly: number | null
  /** `resolveFireParams(profile).grossReturn` — de rendementsaanname van DEZE gebruiker. */
  expectedReturn: number
}

/**
 * HET BRUTO-JAARINKOMEN VAN HET HEFBOOMPAD — één afleiding, twee consumenten:
 * de Box 1-statusdot (`box1Status`) en de jaarruimte-post van de hefboom.
 *
 * Spiegelt `resolveBox1GrossIncome` (lib/box1-income.ts) op de twee punten die
 * ertoe doen: de handmatige override wint van de schatting (`manual ??
 * estimateGross`), en de schatting loopt via `grossFromNet` — de echte inverse
 * van de Box 1-motor inclusief heffingskortingen.
 *
 * Tot 22 sep 2026 gebruikte de statusdot hier een goedkopere lineaire vuistregel
 * (`netto × 12 / (1 − marginaalTarief)`). Die OVERschat bruto structureel: bij
 * € 1.500 netto/mnd gaf hij € 28.016 waar de canonieke inverse op € 18.475
 * uitkomt — ruim 50% te hoog. Zolang die vuistregel alleen een stipje voedde was
 * dat verdedigbaar; sinds ADR 0177 voedt dezelfde grootheid óók een EURO-BEDRAG
 * in de melding, en dan geldt de single-source-regel onverkort. Eigenaarsbesluit
 * 22 sep 2026: allebei op de canonieke bruto. Gemeten gevolg voor de dot: alleen
 * onder ± € 1.800 netto/mnd verschuift hij (oranje → groen); daarboven is de
 * verdict-tak grof genoeg om zelfs € 14.000 heffingsverschil op te vangen.
 *
 * ENIGE RESTERENDE INVOERVERSCHIL met `resolveBox1GrossIncome`: die leidt zijn
 * netto af uit `loadCashflowSettingsData(...).effectiveAnnualIncome` (een
 * 12-maands jaarcijfer), hier is het het effectieve MAANDinkomen × 12. Dezelfde
 * ADR 0103-grondslagmachinerie, ander venster. Gelijktrekken vraagt die loader
 * in het shell-pad en dus een extra query — bewust niet gedaan.
 */
export function resolveLeverGrossYearly(
  netMonthlyIncome: number,
  manualGrossYearly: number | null,
): number {
  const manual = Number(manualGrossYearly)
  if (manualGrossYearly != null && Number.isFinite(manual) && manual > 0) return manual
  const netYearly = Math.max(0, Math.round(netMonthlyIncome * 12))
  return netYearly > 0 ? grossFromNet(netYearly, CURRENT_TAX_YEAR) : 0
}

/**
 * `net_worth_inclusion_pct` als factor; ontbreekt/onzin → 100%.
 *
 * De `?? 100` staat er VÓÓR de `Number()` en dat is het hele punt:
 * `Number(null)` is `0` en `Number.isFinite(0)` is `true`, dus een afwezig
 * percentage zou anders als 0% doorgaan en de hele post laten verdampen.
 * Exact dezelfde vorm als `computeBox3TaxableInput` gebruikt.
 */
function inclusionFactor(pct: number | null | undefined): number {
  const n = Number(pct ?? 100)
  return Number.isFinite(n) ? n / 100 : 1
}

/**
 * De vijf scalars van ADR 0177 uit al-geladen rijen — puur, fail-soft.
 *
 * FAIL-SOFT IS HIER GEEN LUXE. `loadLeverScores` wordt ge-`await`-ed in
 * app/(app)/layout.tsx, dus een throw uit dit blok legt ÉLKE ingelogde route
 * plat — inclusief /mijn en uitloggen. Vóór ADR 0177 bleef zo'n fout
 * paginalokaal. De `catch` valt daarom terug op "geen enkele bron bekend", wat
 * de kern als `neutral` leest ("we weten het niet") en nooit als groen — exact
 * wat ADR 0177 D3 eist van een gefaalde bron.
 */
export function deriveFiscaleRuimte(input: DeriveFiscaleRuimteInput): FiscaleRuimteResult {
  try {
    const hasPartner = deriveHasPartner(input.householdType)

    // ── Box 3-zijde ──────────────────────────────────────────────────────────
    // GEWOGEN met `net_worth_inclusion_pct`, in een MAPPED KOPIE (de rijen zelf
    // blijven onaangeraakt — de netto-vermogen-aggregaten hierboven lezen ze
    // ook). `calculateBox3` telt zelf rauw op, terwijl de assets-SELECT
    // huishoud-gedeeld is: een gezamenlijke rekening van € 400.000 op 50% zou
    // anders voor € 400.000 in de heffing van deze gebruiker landen, en dat
    // bedrag komt via de grootste post letterlijk in zijn melding te staan.
    // `computeBox3TaxableInput` weegt om precies dezelfde reden.
    const box3CalcInput: Box3Input = {
      assets: input.assetRows.map((a) => ({
        ...a,
        current_value: Number(a.current_value) * inclusionFactor(a.net_worth_inclusion_pct),
      })) as unknown as Asset[],
      debts: input.debtRows.map((d) => ({
        ...d,
        current_balance: Number(d.current_balance) * inclusionFactor(d.net_worth_inclusion_pct),
      })) as unknown as Debt[],
      hasPartner,
      // De €→vrijheidstijd-vertaling speelt hier geen rol: we lezen alleen `tax`
      // en `netEffect`. Een dagtarief zou een extra bron (en query) vragen.
      dailyExpenses: 0,
      year: CURRENT_TAX_YEAR,
    }
    const box3Full = calculateBox3(box3CalcInput)
    // Alleen de SCALAR verlaat dit blok. `Box3Result` draagt
    // `assetClassifications`/`debtClassifications` met de complete rijen —
    // inclusief huishoud-gedeelde — en daar heeft niets buiten deze functie iets
    // te zoeken (zelfde reden als de scalaire `optimalAllocation` hieronder).
    const box3Tax = box3Full.tax

    // Post 1 — fiscale partnerverdeling. ALLEEN de scalaire winst t.o.v. gelijk
    // verdelen; nooit de per-partner-splitsing (ADR 0036).
    const optimalAllocation = hasPartner
      ? optimizePartnerAllocation(box3Full, box3CalcInput)
      : null
    const partnerverdelingBesparing = optimalAllocation?.savingsVsEqual ?? null

    // Post 3 — samenstelling-shift, NETTO (besparing ná gemist rendement). Puur;
    // geen DB. Het rendement is de profiel-instelling van deze gebruiker, niet
    // DEFAULT_RETURN: het netto effect (en dus of deze post meetelt) kantelt erop.
    const samenstellingNetEffect =
      generateBox3Strategies({
        goalId: DEFAULT_GOAL_ID,
        year: CURRENT_TAX_YEAR,
        dailyExpenses: 0,
        hasPartner,
        current: box3Full,
        optimalAllocation: optimalAllocation
          ? {
              totalTax: optimalAllocation.totalTax,
              savingsVsEqual: optimalAllocation.savingsVsEqual,
            }
          : undefined,
        expectedReturn: input.expectedReturn,
      }).strategies.find((s) => s.kind === 'samenstelling-shift')?.netEffect ?? null

    // ── Box 1-zijde ──────────────────────────────────────────────────────────
    // DE CANONIEKE BRUTO-INVERSIE, niet de sidebar-vuistregel. `grossFromNet`
    // (lib/box1-tax.ts) is de echte inverse van de Box 1-motor inclusief
    // heffingskortingen — dezelfde functie waarmee `resolveBox1GrossIncome` het
    // bruto van /overzicht/belasting/box1 bepaalt, en met dezelfde afronding.
    // `box1JaarruimteStatus` gebruikt bewust een goedkopere lineaire opslag
    // (netto / (1 − marginaal)) die bruto structureel OVERschat; die heuristiek
    // mag een grijs/oranje stipje voeden, maar niet een EURO-BEDRAG dat de
    // gebruiker in zijn melding leest. Dat verschil is bestaand en
    // gedocumenteerd — zie app/(app)/overzicht/belasting/page.tsx — en wordt
    // hier NIET stilzwijgend rechtgetrokken door de VORM van de heuristiek over
    // te nemen; beide kanten lezen sinds het eigenaarsbesluit van 22 sep 2026
    // dezelfde canonieke bruto (zie `resolveLeverGrossYearly`).
    const grossYearly = resolveLeverGrossYearly(
      input.netMonthlyIncome,
      input.manualGrossYearly,
    )

    // De tweede helft van de Box 1-invoer (bevinding C8): zonder eigen woning
    // zou de noemer de renteaftrek missen en tot ~1,9× te hoog uitvallen, en
    // dan meldt de banner een ander getal dan de Box 1-pagina één klik verder.
    // `buildEigenWoningBox1Input` is de canonieke, pure mapping; hij verwacht de
    // woning-rijen op WOZ AFLOPEND gesorteerd (de DB-variant doet dat in de
    // query), dus dat doen we hier zelf.
    //
    // BEWUST ONGEWOGEN, anders dan de Box 3-zijde hierboven: de canonieke
    // `resolveEigenWoningBox1Input` weegt `net_worth_inclusion_pct` óók niet, en
    // afwijken zou deze noemer laten verschillen van /overzicht/belasting/box1 —
    // precies het A=B dat C8 heeft hersteld. Dat gedeeld eigendom daar de volle
    // WOZ meetelt is een bekend, apart belegd besluit.
    const eigenWoning = buildEigenWoningBox1Input(
      input.assetRows
        .filter((a) => a.asset_type === 'eigen_huis' && a.id != null)
        .map((a) => ({ id: String(a.id), woz_value: a.woz_value ?? null }))
        .sort((x, y) => (Number(y.woz_value) || 0) - (Number(x.woz_value) || 0)),
      input.debtRows
        .filter((d) => d.debt_type === 'mortgage')
        .map((d) => ({
          linked_asset_id: d.linked_asset_id ?? null,
          current_balance: d.current_balance,
          interest_rate: d.interest_rate ?? null,
        })),
    )

    // Post 2 — onbenutte jaarruimte.
    //
    // NULL ≠ 0 OP FACTOR A (bevinding H23, en de scherpste faalvorm van deze
    // hefboom). `resolvePensionFactorA` geeft bij een lege kolom `factorA: 0`
    // MÉT `isKnown: false`: "niet ingevuld", niet "bouwt geen pensioen op".
    // Rekenen met die 0 levert de BOVENGRENS van de jaarruimte, en die is zo
    // groot t.o.v. de eigen heffing dat de ratio bij élk inkomen in de rode band
    // valt (gemeten: 35–45%). Dan is "nooit groen behalve minder vermogen
    // bezitten" vervangen door "nooit groen behalve je UPO invullen" — dezelfde
    // fout in een nieuw jasje. Onbekend → `null` → de post valt weg, en omdat
    // box1Tax/box3Tax wél bekend zijn wordt dat groen als er verder niets
    // openstaat, niet grijs.
    const jaarruimte = computeJaarruimte(grossYearly, input.factorA, CURRENT_TAX_YEAR)
    const jaarruimteBesparingEur =
      input.factorAKnown && grossYearly > 0
        ? jaarruimteBesparing(grossYearly, jaarruimte.jaarruimte, CURRENT_TAX_YEAR)
        : null

    // De NOEMER: de eigen heffing over Box 1 + Box 3. Beide kunnen `null` zijn —
    // "we weten het niet" — en dat is iets anders dan 0 ("berekend, levert niets
    // op"). Geen box 3-belastbare bezittingen → geen Box 3-uitspraak; geen
    // bekend bruto inkomen → geen Box 1-uitspraak. Allebei null → hefboom grijs.
    return computeFiscaleRuimte({
      partnerverdelingBesparing,
      jaarruimteBesparing: jaarruimteBesparingEur,
      samenstellingNetEffect,
      box1Tax:
        grossYearly > 0
          ? computeBox1Tax({
              grossYearlyIncome: grossYearly,
              year: CURRENT_TAX_YEAR,
              wozValue: eigenWoning.wozValue,
              hypotheekRente: eigenWoning.hypotheekRente,
            }).tax
          : null,
      box3Tax: input.hasBox3Assets ? box3Tax : null,
    })
  } catch {
    return computeFiscaleRuimte(GEEN_FISCALE_BRON)
  }
}

/**
 * Laad de vier-hefbomen-scores + de Box 1/3-statussen voor de huidige gebruiker.
 *
 * Queries: assets/debts/12m-maandaggregaat (spaarquote)/alle-budgetten/
 * maand-budget-tx/maand-inkomen + vroegste-inkomen (extrapolatie). De cashflow-
 * hefboom consumeert sinds B-030 de EFFECTIEVE spaarquote
 * (`resolveSavingsSource(...).effectiveSavingsRatePct`, ADR 0121) — hetzelfde
 * getal als de hefboomkaart op /overzicht, het cashflow-instellingenblok en de
 * gezondheidsscore, in plaats van de rauwe 6-maands transactiemeting. De overige
 * velden gebruiken dezelfde pure helpers (`computeLeverScores`, `box3TaxStatus`,
 * `box1JaarruimteStatus`).
 *
 * ── DE GRENS VAN DIE PARITEIT (lees dit vóór je "hetzelfde getal" gelooft) ──
 * Gelijk is de GRONDSLAG en de FORMULE, niet de hele fallback-ladder. Deze
 * loader voedt `computeSavingsRate6m` BEWUST zonder `fallbackMonthlyIncome`/
 * `fallbackMonthlyExpenses`, en draait de netto-vermogen-delta-tak niet die
 * `resolveSavingsRate6m` (lib/cashflow-kpis.ts) er bovenop legt. Dat is de in
 * lib/savings-source.ts gedocumenteerde keuze voor "de lichte sidebar-loader":
 * geen uitspraak zonder grondslag, en geen extra snapshot-query op een loader
 * die op ÉLKE route in het shell-pad draait.
 *
 * Praktisch verschil, één venster breed: staan beide grondslagen op
 * 'transaction' (dan en alleen dan telt de meting mee) én is er wél
 * 12-maands transactie-inkomen maar GEEN inkomen in het 6-maands venster, dan
 * blijft de hefboom hier op `null` — "Onvoldoende transactiedata — Start",
 * grijs — terwijl de kaart ernaast via de profiel-fallback (of de
 * vermogens-delta) wél een percentage toont. Buiten die combinatie is de
 * uitkomst gelijk: zodra één van beide grondslagen niet 'transaction' is, wint
 * `effectiveSavingsRatePct` en speelt de meting geen rol.
 *
 * Wil je die grens dichten, dan is dat een eigenaar-besluit in de geest van
 * B-030 (het verandert de statuskleur van de Budget-hefboom op bestaande
 * accounts), geen opruimwerk — en het kost `getNetWorthSnapshots12m` erbij.
 *
 * @param supabase    Server-client (RLS-gescoped op de ingelogde gebruiker).
 * @param perspective Stuurt UITSLUITEND `netWorth` (perspectief-correct, via
 *   `loadPerspectiveDataServer` — privacy reeds server-side toegepast). De vier
 *   LEVER-SCORES + Box 1/3-statussen volgen de PERSPECTIEF-SCHAKELAAR NIET: ze
 *   staan vast op de RLS-scope van de ingelogde gebruiker en veranderen dus niet
 *   als je naar een household/partner-view wisselt. Een household-view toont
 *   daarom dezelfde hefboomstatus, maar wél het perspectief-correcte netto
 *   vermogen — gelijk aan de hero.
 *
 *   WAT DIE RLS-SCOPE PRECIES IS (en wat hier eerder verkeerd stond): dit is
 *   NIET "alleen eigen rijen". De eerdere formulering beloofde `eq('user_id')`,
 *   maar die expliciete filter is vervallen toen de queries naar de gedeelde
 *   basisdata-laag verhuisden (`lib/server-data/base.ts#getActiveAssets`, zie de
 *   toelichting bij de Promise.all hieronder). De SELECT-policy op `assets` is
 *   `auth.uid() = user_id OR (ownership = 'shared' AND household_id =
 *   user_household_id())`, dus de rijen zijn EIGEN + HUISHOUD-GEDEELD bezit.
 *   Partner-PRIVÉ bezit blijft buiten bereik — RLS blokkeert dat, er lekt niets.
 *
 *   Dat is ook de INHOUDELIJK juiste grondslag voor dit signaal, geen toeval:
 *   een gezamenlijke spaarrekening is echt Box 3-vermogen van deze gebruiker, en
 *   `computeBox3TaxableInput` weegt elke post met `net_worth_inclusion_pct` —
 *   precies het mechanisme voor deels-eigen bezit. Zou je hier `eq('user_id')`
 *   terugzetten, dan verdwijnt gedeeld bezit uit de status terwijl de
 *   Belasting-kaart (`app/(app)/overzicht/belasting/page.tsx`) via dezelfde
 *   `getActiveAssets` wél gedeeld bezit meetelt — dan breekt exact de
 *   "kaart-status == sidebar-status"-belofte waarvoor `lib/box3-taxable-input.ts`
 *   bestaat. De twee call-sites van `computeBox3TaxableInput` delen bewust één
 *   scoping; wijzig ze nooit los van elkaar.
 */
export const loadLeverScores = cache(async function loadLeverScores(
  supabase: SupabaseClient,
  perspective: Perspective = 'personal',
): Promise<LeverScoresResult> {
  const user = await getCachedUser(supabase)
  if (!user) {
    // Geen sessie → geen enkele fiscale bron. De kern leest dat als 'neutral'
    // ("we weten het niet"), nooit als groen — zie ADR 0177 D3.
    const fiscaleRuimte = computeFiscaleRuimte({
      partnerverdelingBesparing: null,
      jaarruimteBesparing: null,
      samenstellingNetEffect: null,
      box1Tax: null,
      box3Tax: null,
    })
    const empty = computeLeverScores({
      totalAssets: 0,
      totalDebts: 0,
      assetTypeCount: 0,
      savingsRate: null,
      fiscaleRuimte,
    })
    const taxInput: Box3TaxableInput = {
      box3TaxableAboveThreshold: 0,
      hasBox3Assets: false,
    }
    return {
      scores: empty,
      taxInput,
      box3Status: 'neutral',
      fiscaleRuimte,
      box1Status: 'neutral',
      netWorth: 0,
      budgetsOver: 0,
    }
  }

  const now = new Date()

  // 6-maands-venster voor de CANONIEKE spaarquote — grenzen uit `savingsRateWindow`
  // (lib/savings-source.ts), identiek aan de dashboard-, core- en horizon-loader:
  // zes VOLTOOIDE kalendermaanden, de lopende maand EXCLUSIEF (bevinding C6). Hier
  // valt die grens samen met de query zelf: het RPC-venster is `[fromDate, toDate)`,
  // dus er hoeft geen extra maandfilter overheen. Voorheen rekende deze loader een
  // eigen 3-maands quote met een tekenfout (uitgaven negatief zonder Math.abs) →
  // 164% i.p.v. de canonieke ~50% (KRUIS-06).
  const savingsWindow = savingsRateWindow(now)

  // Gedeelde basisdata-laag (lib/server-data/base.ts): assets/debts/profiel/
  // budgetten/bank + het huidige-maand-tx-venster draaien als ÉÉN query per tabel
  // per request, gedeeld met de andere loaders + de shell-layout. De vroegere
  // per-venster/per-teken tx-queries (6-maands, huidige-maand budget-tx, maand-
  // inkomen) worden hieronder in JS uit dit venster + het 6-maands-aggregaat
  // geslicet — byte-identiek, want die vensters zijn subsets. Vroegste-inkomen
  // komt via de aparte all-time `getEarliestIncomeDate` (zie hieronder), niet
  // meer uit een 12-maands-slice. RLS scopet al op de gebruiker, dus de
  // expliciete .eq('user_id') is vervallen.
  const [
    profileRes,
    assetsRes,
    debtsRes,
    budgetsRes,
    bankAccountsRes,
    currentMonthTxRes,
    txAgg12Res,
    earliestIncomeRes,
  ] = await Promise.all([
    getOwnProfile(supabase),
    getActiveAssets(supabase),
    getActiveDebts(supabase),
    getBudgets(supabase),
    getUnlinkedBankAccounts(supabase),
    getCurrentMonthTx(supabase),
    // Het ROLLENDE 12-MAANDS maandaggregaat (transfer-gefilterd via realOnly;
    // spaarbudget-correctie via budgetIds). SQL-aggregaat i.p.v. een rijen-slice:
    // kan niet stil afkappen op max_rows=1000 (correctheid). RLS-breed (geen
    // ownOnly) — identiek aan de scope die T2.1 hier achterliet.
    //
    // WAAROM 12 EN NIET 6 (B-030): deze loader draaide een EIGEN 6-maands
    // `fetchTxMonthAggregate`. Sinds de cashflow-hefboom de EFFECTIEVE spaarquote
    // consumeert (ADR 0121) heeft hij óók het 12-maands transactie-inkomen nodig
    // voor `extrapolateAnnualIncome` — de jaargrondslag die `resolveSavingsSource`
    // gebruikt zodra de grondslag níét op 'transaction' staat. Het 6-maands
    // venster is een strikte SUBSET van het 12-maands venster (beide op
    // maandgrenzen, hetzelfde aggregaat per maand), dus de sommen hieronder zijn
    // byte-identiek; ze worden nu in JS gesliced op `savingsWindow.sinceMonth` /
    // `.beforeMonth` i.p.v. door de RPC-grenzen. Netto GEEN extra query: dit is
    // dezelfde `cache()`-gedeelde RPC die de dashboard-, core- en horizon-loader
    // (en blok 1 van /overzicht) al draaien — waar de vorige 6-maands-variant een
    // eigen cache-entry had, deelt deze aanroep de bestaande.
    getTxAgg12m(supabase),
    // Vroegste inkomens-datum (all-time, één rij) — afkap-vrij, i.p.v. de vroegere
    // reduce over een gecapte 12-maands-slice (die kon bij >1000 positieve rijen
    // stil afkappen → savingsDataMonths te klein → over-extrapolatie). Zelfde
    // gedeelde helper als dashboard-data-loader.ts/horizon-data-loader.ts;
    // cache() dedupliceert met die calls binnen hetzelfde request.
    getEarliestIncomeDate(supabase),
  ])

  const profile = (profileRes.data ?? {}) as LeverScoresProfile
  const assetRows = (assetsRes.data ?? []) as AssetRow[]
  const debtRows = (debtsRes.data ?? []) as DebtRow[]

  // ── Bezittingen / schulden aggregaten (weighted via net_worth_inclusion_pct) ──
  const totalAssets = assetRows.reduce(
    (s, a) => s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100),
    0,
  )
  const totalDebts = debtRows.reduce(
    (s, d) => s + Number(d.current_balance) * ((d.net_worth_inclusion_pct ?? 100) / 100),
    0,
  )
  const totalOriginalDebts = debtRows.reduce(
    (s, d) =>
      s +
      Number(d.original_amount ?? d.current_balance) *
        ((d.net_worth_inclusion_pct ?? 100) / 100),
    0,
  )
  const assetTypeSet = new Set(
    assetRows.map((a) => a.asset_type).filter((t): t is string => Boolean(t)),
  )

  // ── Canoniek netto vermogen (perspectief-correct, incl. unlinkedCash) ─────────
  // Spiegelt lib/horizon-data-loader.ts (healthScoreInput.totalAssets−totalDebts):
  // bezittingen + niet-gekoppelde bankrekeningen − schulden, in eigen weergave
  // byte-gelijk aan de eigen aggregaten hierboven. Bij household/partner via de
  // gedeelde, privacy-veilige `loadPerspectiveDataServer` (zelfde share()-regel).
  // Dit voedt UITSLUITEND de sidebar-netWorth-metric — niet de lever-scores.
  // Losse rekeningen via DE canonieke, huishoud-gewogen optelling
  // (lib/unlinked-cash.ts) — geen eigen reduce, anders drift met dashboard/horizon.
  const unlinkedCashShare = await resolveUnlinkedCashShare(supabase, bankAccountsRes.data)
  const unlinkedCash = unlinkedCashTotal(bankAccountsRes.data, unlinkedCashShare)
  let perspectiveTotalAssets = totalAssets + unlinkedCash
  let perspectiveTotalDebts = totalDebts
  if (perspective !== 'personal') {
    try {
      const pd = await loadPerspectiveDataServer(supabase, perspective)
      const share = (item: { ownership?: string; _myShareFraction?: number }, raw: number): number =>
        item.ownership === 'shared' && perspective !== 'household'
          ? raw * (item._myShareFraction ?? 1)
          : raw
      perspectiveTotalAssets =
        pd.assets.reduce((s, a) => {
          const raw = Number(a.current_value) * ((Number(a.net_worth_inclusion_pct) || 100) / 100)
          return s + share(a, raw)
        }, 0) +
        unlinkedCashTotal(bankAccountsRes.data, {
          perspective,
          mySharePct: unlinkedCashShare.mySharePct,
        })
      perspectiveTotalDebts = pd.debts.reduce((s, d) => {
        const raw = Number(d.current_balance) * ((Number(d.net_worth_inclusion_pct) || 100) / 100)
        return s + share(d, raw)
      }, 0)
    } catch {
      // Perspectief-laden faalt (geen huishouden / RLS) → val terug op eigen data.
    }
  }
  const netWorth = perspectiveTotalAssets - perspectiveTotalDebts

  // ── Budgetten: type-map (parent+child) + spaarbudget-ID-set ──
  // Transacties hangen aan child-budgetten, dus de spaarbudget-correctie op de
  // spaarquote heeft de child-IDs nodig (child erft het type van zijn parent).
  const allBudgets = (budgetsRes.data ?? []) as BudgetRow[]
  // Canonieke erfregel (lib/budget-utils.ts) i.p.v. een handgeschreven kopie
  // ernaast: dezelfde map voedt hieronder óók de richting van de besteed-som,
  // en twee eigenaren van één erfregel is precies de drift die dit domein al
  // eerder opleverde. NULL budget_type → DB-default 'expense' (de veilige kant:
  // inkomsten-semantiek zou een inkomst laten optellen).
  const budgetTypeById = buildBudgetTypeMap(
    allBudgets.map(b => ({
      id: b.id,
      parent_id: b.parent_id,
      budget_type: b.budget_type ?? 'expense',
    })),
  )
  const savingsBudgetIds = new Set<string>()
  for (const [id, type] of budgetTypeById) if (type === 'savings') savingsBudgetIds.add(id)

  // ── De MÉTING: de canonieke 6-maands transactiequote (gedeelde helper) ──
  // Consume, don't recompute: dezelfde formule als het cashflow-instellingenblok
  // en de gezondheidsscore (savingsRateFromAggregates via computeSavingsRate6m):
  // transfer-gefilterd, spaarbudget-stortingen + schuldaflossing tellen als sparen,
  // <6m data geëxtrapoleerd. GEEN profiel-fallback hier (net als de oude 3-maands
  // variant): zonder transactie-inkomen blijft de meting `null`.
  //
  // Dat is de bewuste grens uit de kop van dit bestand, en hij zit precies HIER:
  // `computeSavingsRate6m` krijgt geen `fallbackMonthlyIncome`/`-Expenses` mee
  // (zie de optionele velden in lib/savings-source.ts, die deze loader met naam
  // noemen), en de netto-vermogen-delta-tak van `resolveSavingsRate6m`
  // (lib/cashflow-kpis.ts) draait hier niet. Op het transactie/transactie-pad
  // ZONDER 6-maands inkomen wijkt de hefboom daardoor af van de kaart: grijs
  // "Onvoldoende transactiedata" naast een percentage. Bewust — een profiel-
  // afgeleide uitspraak op een tegel die "6 maanden transacties" belooft is de
  // ergere fout, en de delta-tak zou een snapshot-query toevoegen aan een loader
  // die op élke route meedraait. Wijzig dit niet zonder eigenaar-besluit.
  // De 6-maands sommen komen als SUB-VENSTER uit het 12-maands maandaggregaat
  // (`savingsWindow.sinceMonth`/`.beforeMonth`, exclusieve bovengrens = de lopende
  // maand, bevinding C6) — byte-identiek aan de vroegere eigen 6-maands RPC, maar
  // op de gedeelde `getTxAgg12m`-entry.
  const txAgg12 = (txAgg12Res.data ?? []) as TxMonthAggregateRow[]
  const window6m = { sinceMonth: savingsWindow.sinceMonth, beforeMonth: savingsWindow.beforeMonth }
  const income6m = aggSumPositief(txAgg12, { realOnly: true, ...window6m })
  const expenses6m = aggSumNegatiefAbs(txAgg12, { realOnly: true, ...window6m })
  const savingsBudgetSpent6m = aggSumNegatiefAbs(txAgg12, {
    realOnly: true,
    ...window6m,
    budgetIds: savingsBudgetIds,
  })
  const debtAflossing6m = computeDebtAflossingMonthly(debtRows as unknown as Debt[]) * SAVINGS_RATE_WINDOW_MONTHS

  // Vroegste inkomens-datum: all-time via de gedeelde `getEarliestIncomeDate`
  // (order(date asc).limit(1)) i.p.v. een reduce over een gecapte 12-maands-slice —
  // die kon bij >1000 positieve rijen stil afkappen (savingsDataMonths te klein →
  // over-extrapolatie). Spiegelt dashboard-data-loader.ts/horizon-data-loader.ts.
  // De telling zelf komt uit `savingsRateDataMonths` (lib/savings-source.ts) —
  // dezelfde bron als het venster hierboven, zodat de twee niet uit elkaar kunnen
  // lopen zoals vóór bevinding C6.
  const earliestIncomeDate =
    (earliestIncomeRes.data as { date?: string | null } | null)?.date ?? undefined
  const savingsDataMonths = savingsRateDataMonths(now, earliestIncomeDate)

  const measuredSavingsRate6m: number | null =
    income6m > 0
      ? computeSavingsRate6m({
          income6m,
          expenses6m,
          savingsBudgetSpent6m,
          debtAflossing6m,
          dataMonths: savingsDataMonths,
        }).savingsRate6m
      : null

  // ── Budgetgrondslag (ADR 0103) — gedeelde samenstelling ──
  // Voedt zowel de EFFECTIEVE spaarquote hieronder als het Box 1-maandinkomen
  // verderop. `getBudgets`/`getOwnProfile` staan al in de golf hierboven en
  // `loadBudgetBasis` is intern `cache()`-gedeeld, dus dit is geen extra last;
  // hij staat hier bewust vóór `computeLeverScores` omdat de cashflow-hefboom
  // hem nu nodig heeft.
  const leverBudgetBasis = await loadBudgetBasis(
    supabase,
    profile as unknown as Record<string, unknown>,
    (budgetsRes.data ?? []) as unknown as BudgetBasisRow[],
  )

  // ── De EFFECTIEVE spaarquote — HET spaarquote-getal (ADR 0121) ──
  //
  // WAT HIER MIS WAS (B-030): deze loader gaf de MÉTING hierboven door aan
  // `computeLeverScores`, die er zowel de kompas-detailregel ("Spaarquote 12%")
  // als de STATUS-kleur van de Budget-hefboom mee maakte. De hefboomKAART op
  // /overzicht leest ondertussen `healthScoreInput.effectiveSavingsRatePct` —
  // toen nog `savingsRate6m` geheten, terwijl het veld de EFFECTIEVE quote uit
  // de horizon-loader droeg (naam rechtgezet in R2, 7 sep 2026). Eén
  // hefboom, één scherm, twee percentages: kaart 25 %, kompas 12 %. Erger nog:
  // het stipje op die kaart was van de rauwe meting afgeleid terwijl het getal
  // ernaast effectief was. ADR 0121 kent drie uitzonderingen waar de meting mág
  // verschijnen (transactie-kassabon, check-in-gespreksstarters, geldstroom-gauge
  // — élk mét venster-label); een kompas-detailregel zonder venster hoort daar
  // niet bij.
  //
  // GEEN TWEEDE FORMULE: `resolveSavingsSource` blijft de enige plek waar de
  // grondslagkeuze in een percentage wordt omgezet. Wat hier staat is uitsluitend
  // dezelfde INVOER samenstellen als `loadForecastSectionData`/`loadDashboardData`
  // (het parity-gekoppelde paar): jaarinkomen via `transactionAnnualIncome` op
  // het realisatievenster (twaalf AFGESLOTEN maanden, één deler — ADR 0138),
  // uitgaven op de 6-maands MEETBASIS (`expenses6m / 6` — dezelfde meting waar
  // de quote op staat, bewust niet de lopende maand), en de budgetgrondslag uit
  // `loadBudgetBasis`.
  //
  // GEVOLG, BEWUST (eigenaar-besluit B-030): staat de grondslag NIET op
  // 'transaction', dan verschuiven de detailregel én de STATUSKLEUR van de
  // Budget-hefboom (kompas, sidebar-dot én de status-duiding-melding op
  // /overzicht/budget) mee naar het getal dat de kaart al toonde. Op beide
  // transactie-grondslagen is de uitkomst per definitie identiek aan voorheen —
  // `resolveSavingsSource` geeft daar letterlijk `savingsRate6m` terug.
  // De transactie-extrapolatie apart, want hij heeft TWEE rollen: kandidaat voor
  // de grondslagkeuze hieronder, én de terugval die `resolveSavingsSource`
  // gebruikt zodra de gekozen grondslag geen bruikbaar jaarinkomen oplevert.
  // Die tweede rol is de reden dat hij niet inline mag: gaf je daar
  // `leverAnnualIncome.amount` mee, dan valt de terugval terug op exact dezelfde
  // waarde en vangt hij niets op — precies het randgeval (`income_source =
  // 'manual'` met een leeggemaakt bedrag) waarvoor hij bestaat. Dashboard
  // (`dashboard-data-loader.ts:1225`) en forecast (`cashflow-kpis.ts:869`) geven
  // hier om dezelfde reden de extrapolatie mee.
  const leverExtrapolatedIncome = transactionAnnualIncome(leverBudgetBasis.realized)
  const leverAnnualIncome = resolveAmountWithBasis(
    profile.income_source,
    Number(profile.net_monthly_income ?? 0) * 12,
    leverExtrapolatedIncome,
    leverBudgetBasis.income.annualTotal,
  )
  const leverSavingsExpenses = resolveAmountWithBasis(
    profile.expenses_source,
    Number(profile.estimated_monthly_expenses ?? 0),
    expenses6m / SAVINGS_RATE_WINDOW_MONTHS,
    leverBudgetBasis.expenses.monthlyTotal,
  )
  const { effectiveSavingsRatePct } = resolveSavingsSource({
    incomeSource: profile.income_source,
    expensesSource: profile.expenses_source,
    netMonthlyIncome: Number(profile.net_monthly_income ?? 0),
    estimatedAnnualIncome: leverExtrapolatedIncome,
    estimatedMonthlyExpenses: Number(profile.estimated_monthly_expenses ?? 0),
    // Op het transactie/transactie-pad IS dit de uitkomst; `null` betekent daar
    // "geen meting", en de guard hieronder houdt die `null` in stand.
    savingsRate6m: measuredSavingsRate6m ?? 0,
    basis: {
      income: leverAnnualIncome.basis,
      expenses: leverSavingsExpenses.basis,
      annualIncome: leverAnnualIncome.amount,
      monthlyExpenses: leverSavingsExpenses.amount,
    },
  })

  // GEEN UITSPRAAK ZONDER GRONDSLAG — de `null` van vóór B-030 blijft intact:
  //  · beide grondslagen op 'transaction' → de uitkomst ÍS de meting
  //    (`resolveSavingsSource` geeft daar letterlijk `savingsRate6m` terug), dus
  //    geen transactie-inkomen in het venster blijft `null` = "Onvoldoende
  //    transactiedata — Start". Byte-identiek aan voorheen.
  //  · anders wint de grondslag-geresolveerde quote, TENZIJ `resolveAmountWithBasis`
  //    helemaal doorvalt (`'unknown'` — geen budget, geen transacties, geen
  //    profielbedrag; ADR 0131: onbekend is geen nul). Dan zou de uniforme formule
  //    op een inkomen van €0 draaien en een verzonnen 0 % opleveren.
  const bothTransaction =
    leverAnnualIncome.basis === 'transaction' && leverSavingsExpenses.basis === 'transaction'
  const savingsRate: number | null = bothTransaction
    ? measuredSavingsRate6m
    : leverAnnualIncome.basis === 'unknown'
      ? null
      : effectiveSavingsRatePct

  // ── Box 3-belast-vermogen-signaal (gedeelde helper) ──
  const householdType = (profile.household_type as string | undefined) ?? undefined
  const taxInput = computeBox3TaxableInput(assetRows, debtRows, householdType)

  // ── Budget-health (kompas cashflow-indicator) ──
  // Top-level expense/savings-budgetten die deze maand OVER de limiet zitten. Filter
  // byte-identiek aan de vroegere query (parent_id IS NULL · budget_type ∈
  // {expense,savings} · is_archived = false).
  const healthBudgets = allBudgets.filter(
    (b) =>
      b.parent_id === null &&
      (b.budget_type === 'expense' || b.budget_type === 'savings') &&
      b.is_archived === false,
  )
  // Split-regels bij dezelfde huidige-maand-rijen — gedeelde, `cache()`-
  // gededupeerde fetch die zonder split-ouders geen query doet. De rijen gaan
  // EXPLICIET mee: zonder dat argument haalt de fetcher ze zelf op, en buiten
  // een Next-request (vitest) dedupt `cache()` niet — dan is dat een tweede
  // maand-query op rijen die hier al in scope staan.
  const currentMonthRows = (currentMonthTxRes.data ?? []) as CurrentMonthTxRow[]
  const currentMonthSplits = await getCurrentMonthSplits(supabase, currentMonthRows)
  const { budgetsTotal, budgetsOver, budgetsOnTrack } = deriveBudgetHealthCounts(
    healthBudgets,
    currentMonthRows,
    currentMonthSplits,
    budgetTypeById,
  )

  // ── Box 1-status (onbenutte jaarruimte) ──
  // Huidige-maand transacties (alle) voor het Box 1-maandinkomen — dezelfde
  // gedeelde huidige-maand fetch (de vroegere query had geen budget_id-filter).
  const monthTxRows = (currentMonthTxRes.data ?? []) as Array<{ amount: number | string }>
  let monthTxIncome = 0
  let monthTxExpenses = 0
  for (const t of monthTxRows) {
    const amt = Number(t.amount)
    if (amt > 0) monthTxIncome += amt
    else monthTxExpenses += Math.abs(amt)
  }
  // Budgetgrondslag (ADR 0103) uit dezelfde gedeelde samenstelling als de
  // loaders — `leverBudgetBasis` is hierboven al opgehaald (hij voedt sinds B-030
  // óók de effectieve spaarquote). Zonder deze grondslag zou de sidebar-statusdot
  // — die op ÉLKE route in het shell-pad hangt — het Box 1-inkomen op de
  // transactiegrondslag blijven rekenen terwijl /overzicht/budget het budgetgetal
  // toont.
  const { income: box1MonthlyIncome } = resolveEffectiveIncomeExpenses(
    profile,
    monthTxIncome,
    monthTxExpenses,
    {
      income: leverBudgetBasis.income.monthlyTotal,
      expenses: leverBudgetBasis.expenses.monthlyTotal,
    },
  )
  // Eén afleiding, twee consumenten: het marginale tarief hieronder (Box 1) en
  // het verwachte beleggingsrendement van DEZE gebruiker (het netto effect van
  // de samenstelling-shift). Een tweede `resolveFireParams`-aanroep zou
  // dezelfde grootheid een tweede bron geven.
  const leverFireParams = resolveFireParams(profile)
  // NULL ≠ 0 (bevinding H23): `resolvePensionFactorA` geeft bij een lege kolom
  // bewust `{ factorA: 0, isKnown: false }` — "niet ingevuld", niet "bouwt geen
  // pensioen op". `isKnown` gaat daarom MEE naar de jaarruimte-post hieronder.
  const pensioenFactorA = resolvePensionFactorA(profile)
  const manualGrossYearly =
    profile.box1_gross_income == null ? null : Number(profile.box1_gross_income)

  // ── Box 1-statusdot ──────────────────────────────────────────────────────
  // ÉÉN bruto voor de dot én voor de jaarruimte-post van de hefboom
  // (`resolveLeverGrossYearly`, eigenaarsbesluit 22 sep 2026). Tot dan draaide
  // de dot op een lineaire vuistregel die bruto met ruim 50% kon OVERschatten,
  // terwijl de post ernaast de canonieke inverse gebruikte — twee grondslagen
  // voor één grootheid, met de post als zichtbaar euro-bedrag.
  //
  // Factor A telt hier mee zoals /overzicht/belasting/box1 hem meetelt: een
  // ONBEKENDE factor A leest daar als 0 en levert dus "Onbenutte jaarruimte".
  // Dat is bewust ANDERS dan de hefboom-post, die bij een onbekende factor A
  // helemaal geen post opvoert (je kunt niet tellen wat je niet weet). De dot
  // spiegelt de Box 1-pagina, de post spiegelt de rekenregel — allebei juist
  // voor hun eigen vraag.
  const leverGrossYearly = resolveLeverGrossYearly(box1MonthlyIncome, manualGrossYearly)
  const { status: box1Status } = box1JaarruimteVerdict(
    computeJaarruimte(leverGrossYearly, pensioenFactorA.factorA, CURRENT_TAX_YEAR),
  )

  // ── ONBENUTTE FISCALE RUIMTE — de grondslag van de Belasting-hefboom ─────────
  // Alle vijf de scalars komen uit `deriveFiscaleRuimte` hierboven: puur, fail-
  // soft en zonder één extra query (ADR 0177 D5).
  const fiscaleRuimte = deriveFiscaleRuimte({
    assetRows,
    debtRows,
    householdType,
    hasBox3Assets: taxInput.hasBox3Assets,
    netMonthlyIncome: box1MonthlyIncome,
    factorA: pensioenFactorA.factorA,
    factorAKnown: pensioenFactorA.isKnown,
    manualGrossYearly,
    expectedReturn: leverFireParams.grossReturn,
  })

  const scores = computeLeverScores({
    totalAssets,
    totalDebts,
    totalOriginalDebts,
    debtCount: debtRows.length,
    assetTypeCount: assetTypeSet.size,
    savingsRate,
    fiscaleRuimte,
    budgetsTotal,
    budgetsOnTrack,
    budgetsOver,
  })

  // ── Box 3-status (canonieke helper) ──
  // NIET meer de hefboomstatus (ADR 0177 D6) — alleen nog het Box 3-kaartlabel
  // op de belasting-hub en de kop van /overzicht/belasting/box3.
  const box3Status = box3TaxStatus(taxInput)

  return { scores, taxInput, box3Status, fiscaleRuimte, box1Status, netWorth, budgetsOver }
})
