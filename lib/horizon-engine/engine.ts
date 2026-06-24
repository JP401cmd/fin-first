/**
 * Horizon grootboek-engine — forward (V_op) + backward (V_nodig) + snijpunt.
 *
 * Tabel-georiënteerde FIRE-rekenmotor. Accepteert dezelfde `UnifiedProjectionInput`
 * als de huidige engine (drop-in), maar rekent intern als grootboek in REËLE
 * termen, **per individueel asset en per individuele schuld**.
 *
 * Model (twee passes — zoals het referentieprototype):
 *  - Pass 1: forward "werk tot AOW" → V_op (liquide). Backward V_nodig (retire-now).
 *    Snijpunt = FIRE.
 *  - Pass 2: forward "stop met werken op FIRE" → de getoonde lijn. Vanaf FIRE wordt
 *    onttrokken volgens de **onttrekkingsstrategie + eindstrategie** (deplete → ~€0,
 *    legacy → nalatenschap, perpetual → koopkracht, guardrails/vpw/bucket).
 *
 * Reëel: rendement (1+nom)/(1+infl)−1; uitgaven/sparen vlak reëel; de adapter
 * rekent terug naar nominaal (Route 2). Pure functie, geen Supabase.
 */

import type { AssetType } from '@/lib/asset-data'
import type { UnifiedProjectionInput, AssetLiquidation } from '@/lib/unified-projection'
import { NL_AOW_AGE, NL_HOME_MAINTENANCE_PCT } from '@/lib/constants'
import { BOX3_PARAMS, classifyAsset, type Box3Category } from '@/lib/box3-data'
import type { SimCashflow } from '@/lib/fire-simulation'
import { applyWithdrawalStrategy, type WithdrawalContext } from '@/lib/withdrawal-strategy'
import {
  type HorizonStrategyOptions,
  DEFAULT_STRATEGY_OPTIONS,
  INVESTABLE_TYPES,
  allocateProRata,
  withdrawSequential,
  withdrawProRata,
} from './strategies'
import type {
  LedgerRow,
  LedgerEvent,
  AssetBeweging,
  SchuldBeweging,
  HorizonLedgerResult,
} from './types'

// Vermogensgroepen die NIET als liquide (besteedbaar) vermogen tellen.
const NON_LIQUID: Set<AssetType> = new Set(['eigen_huis', 'vehicle', 'physical'])

/**
 * DRIE ORTHOGONALE eigenschappen van een asset in het grootboek — bewust apart
 * gehouden zodat ze niet per ongeluk weer samengevoegd worden (ADR 0028):
 *
 *  (a) type-default-liquiditeit — een `eigen_huis`/`vehicle`/`physical` is van
 *      nature niet-liquide (`NON_LIQUID`); alle andere types zijn liquide pot.
 *  (b) `spendable` (= FIRE-eligible besteedbaar) — markeert dat een van nature
 *      niet-liquide asset TÓCH als besteedbaar/liquide FIRE-vermogen MEETELT (op
 *      zijn inclusion-gewogen engine-waarde, met zijn eigen reële return). Geldt
 *      bij housing-strategie `include_full` ÉN — sinds Fase 2 (ADR 0028) — bij de
 *      v2-`downsize` ("Verkopen"): het huis tilt dan de FIRE-eligibility op tijdens
 *      de OPBOUW, waardoor de FIRE-leeftijd vervroegt.
 *  (c) `saleManaged` — markeert dat een asset als UNIT verkocht wordt via een
 *      verkoop-config (`sale_config`/downsize → `assetLiquidations`), mét
 *      verkoopkosten + schuld-aflossing. Zo'n asset wordt NOOIT rauw onttrokken;
 *      het verlaat het grootboek UITSLUITEND via de verkoop (engine-block 6b).
 *
 * `spendable` (b) en `saleManaged` (c) waren vóór Fase 2 wederzijds uitsluitend
 * ("geen overlap in de praktijk"). Voor de v2-downsize-woning gelden ze nu BEIDE:
 * de woning telt mee voor eligibility (b) maar mag niet rauw leeggetrokken worden
 * en verlaat de pot enkel via de downsize-verkoop (c). Daarom splitsen we de twee
 * vroeger-samenvallende vragen expliciet in twee predikaten:
 *
 *  • `countsAsEligibilityLiquid` — telt dit asset mee in het BESTEEDBARE/FIRE-
 *    eligible liquide vermogen (liquidValue / liquidSumStart / blendedRealReturnStart
 *    / de afbouw-annuïteit / de FIRE-gate)? Ja als het van nature liquide is, of als
 *    het `spendable` is. `saleManaged` op zichzelf sluit hier NIET uit (de spendable
 *    downsize-woning telt mee), maar een `saleManaged` asset dat NIET spendable is
 *    (generieke voertuig/inboedel/deelneming-liquidatie, ADR 0021) blijft tot de
 *    verkoop buiten de eligibility-pot.
 *  • `mayBeRawWithdrawn` — mag dit asset rauw onttrokken worden in de onttrekkings-/
 *    tekort-volgorde? Alléén als het van nature liquide is ÉN NIET `saleManaged`.
 *    Een `saleManaged` asset is hier ALTIJD uitgesloten, ongeacht `spendable` — dus
 *    de spendable downsize-woning telt wél mee voor eligibility maar wordt nóóit rauw
 *    leeggetrokken; ze verlaat de pot enkel via de downsize-verkoop.
 *
 * DERDE perspectief op DEZELFDE drie predikaten — de DRAWDOWN-GRONDSLAG (de pot
 * waarop de afbouw-annuïteit teert + de echte uitputtings-meting), ADR 0030/Optie B:
 *  • `withdrawableLiquidValue` / `withdrawableRealReturn` — som (resp. waarde-gewogen
 *    reële return) over EXACT de `mayBeRawWithdrawn`-set. Dit is de pot die de
 *    annuïteit RAUW kàn opnemen. Cruciaal apart van `liquidValue` (de eligibility-
 *    grondslag-som): bij de spendable+saleManaged downsize-woning telt het
 *    huis WÉL in `liquidValue` (eligibility/FIRE-gate) maar NIET in
 *    `withdrawableLiquidValue` (de annuïteit kan het huis immers niet rauw opnemen —
 *    het verlaat de pot enkel via de verkoop). Lieten we de annuïteit op
 *    `liquidValue` rekenen (huis-inclusief, ~€1M), dan spreidt ze de onttrekking over
 *    een pot die ze niet kan aanspreken → ze onttrekt te wéinig uit de échte cash →
 *    de cash loopt stil leeg vóór de verkoop terwijl de getoonde lijn (huis groeit
 *    door) juist STIJGT, en de verkoop-trigger vuurt jaren te laat (ADR 0030-bug).
 *    Daarom: eligibility = `liquidValue` (ongemoeid, voor de FIRE-gate/opbouw);
 *    drawdown = `withdrawable*` (de decum-ctx-grondslag). Voor een spendable-ZONDER-
 *    saleManaged woning (include_full) vallen beide samen (het huis zit dan óók in
 *    `mayBeRawWithdrawn` → byte-identiek). reverse_mortgage: het huis zit in geen van
 *    beide (de leen-ruimte is een apart kanaal, geen rauwe pot) → ongemoeid.
 *
 * De trigger-EX-huis-meting (`resolveDownsizeTriggerV2`, on_depletion) gebruikt een
 * DERDE perspectief: het liquide vermogen ZÓNDER het te-verkopen huis. Dat valt
 * automatisch samen met `countsAsEligibilityLiquid` op de TRIGGER-MEETRUN, waarin
 * het huis NIET als spendable is gemarkeerd (de meetrun-`baseInput` zet
 * `spendableAssetIds` niet) → het huis telt daar niet mee in `liquideVermogen`. Zo
 * deelt de meetrun exact dezelfde liquide-definitie als de echte run, maar zonder de
 * spendable-vlag → ex-huis. De gerapporteerde trigger-leeftijd is dáárdoor per
 * constructie gelijk aan de leeftijd waarop de echte run het huis verkoopt
 * (`fixed_age`-liquidatie op die leeftijd) — de SSoT-invariant.
 *
 * VIERDE liquiditeit-aspect — OPEETHYPOTHEEK-leen-ruimte (ADR 0029). Bij
 * `reverse_mortgage` is de woning NÓCH spendable NÓCH saleManaged: ze blijft
 * `eigen_huis`-asset (groeit, telt NIET mee in `countsAsEligibilityLiquid`, mag NOOIT
 * rauw onttrokken — `mayBeRawWithdrawn` = false op de raw huiswaarde). Tóch is een
 * FRACTIE van haar overwaarde FIRE-eligible besteedbaar: de leen-RUIMTE (overwaarde ×
 * maxLoanPct). Die telt mee via een EXPLICIET eligibility-BEDRAG (`collateralBorrowableById`,
 * Optie B) — opgeteld in `liquidSumStart`/`blendedRealReturnStart` (met de huis-return
 * als voet) — NIET via de spendable-boolean (die zou de hele woning eligible maken).
 * In het grootboek wordt die ruimte opgenomen als een synthetische, aflossingsvrije
 * RunningDebt ("Opeethypotheek", `isReverseMortgage`) die bij een liquiditeitstekort
 * NÁ de echte liquide pot leent, gecapt op overwaarde × maxLoanPct. Eligibility-meting
 * en drawdown-cap delen dus één grondslag (`reverseMortgageBorrowable`).
 */
type AssetLiquidityFlags = { type: AssetType; spendable?: boolean; saleManaged?: boolean }

/** (eligibility) telt dit asset mee in het besteedbare/FIRE-eligible liquide vermogen? */
function countsAsEligibilityLiquid(a: AssetLiquidityFlags): boolean {
  if (a.spendable) return true
  if (a.saleManaged) return false
  return !NON_LIQUID.has(a.type)
}

/** (raw withdrawal) mag dit asset rauw onttrokken worden in de volgorde? saleManaged → nooit. */
function mayBeRawWithdrawn(a: AssetLiquidityFlags): boolean {
  if (a.saleManaged) return false
  return !NON_LIQUID.has(a.type) || a.spendable === true
}

const ONDERHOUD_PCT = NL_HOME_MAINTENANCE_PCT
const BOX3_YEAR = 2026 as const

/** Stabiele id van de synthetische opeethypotheek-schuld in het grootboek (ADR 0029). */
export const REVERSE_MORTGAGE_DEBT_ID = 'reverse-mortgage' as const

function realReturn(nominal: number, inflation: number): number {
  return (1 + nominal) / (1 + inflation) - 1
}

function vpwPct(remainingYears: number, realRate: number): number {
  if (remainingYears <= 1) return 1.0
  const r = Math.max(0.001, realRate)
  return r / (1 - Math.pow(1 + r, -remainingYears))
}

interface RunningAsset {
  id: string
  naam: string
  type: AssetType
  value: number
  realRet: number
  box3Cat: Box3Category
  /**
   * (b) True = tel als besteedbaar/FIRE-eligible liquide ondanks het niet-liquide
   * type (include_full-woning ÉN v2-downsize-woning, ADR 0028). Tilt de eligibility
   * tijdens de opbouw → vervroegt FIRE. Orthogonaal aan `saleManaged`: een asset kan
   * BEIDE zijn (de downsize-woning telt mee maar verlaat de pot enkel via de verkoop).
   */
  spendable: boolean
  /**
   * (c) True = dit asset wordt als UNIT verkocht via een verkoop-config
   * (`assetLiquidations`), nooit rauw onttrokken; het verlaat het grootboek
   * uitsluitend via de verkoop (block 6b, mét verkoopkosten + schuld-aflossing).
   * `saleManaged` sluit RAUWE onttrekking altijd uit (zie mayBeRawWithdrawn), maar
   * sluit eligibility NIET uit als het asset óók `spendable` is (downsize-woning).
   * Zie de countsAsEligibilityLiquid/mayBeRawWithdrawn-doc.
   */
  saleManaged: boolean
}

interface RunningDebt {
  id: string
  naam: string
  balance: number
  rate: number
  annualPayment: number
  repayment: 'aflossingsvrij' | 'annuiteit' | 'lineair'
  isMortgage: boolean
  deductible: boolean
  flagged: boolean
  /**
   * Rente uit het LAATSTE lopende jaar van een geflagde schuld (`begin * rate`,
   * dus AL gewogen met net_worth_inclusion_pct via de balance). Wordt elk jaar
   * bijgewerkt zolang `begin > 0`; zodra de schuld volledig is afgelost valt
   * uitsluitend dit rente-deel vrij als extra surplus (de aflossing is al
   * hersteld doordat flaggedAflossing → 0). Zie de schuld-loop.
   */
  lastActiveRente: number
  /**
   * True = synthetische opeethypotheek (ADR 0029). Deze schuld start op saldo 0,
   * is aflossingsvrij, en groeit UITSLUITEND door (a) opnames bij liquiditeitstekort
   * (gecapt op de leen-ruimte) en (b) gestapelde rente — niet via het reguliere
   * schuldschema (blok 3). De normale schuld-loop slaat 'm daarom over.
   */
  isReverseMortgage: boolean
}

interface ForwardResult {
  rows: LedgerRow[]
  /** Retire-now netto behoefte per jaar — bron voor backward V_nodig. */
  netNeed: number[]
}

export function runHorizonLedger(
  input: UnifiedProjectionInput,
  optsOverride?: Partial<HorizonStrategyOptions>,
): HorizonLedgerResult {
  const opts: HorizonStrategyOptions = { ...DEFAULT_STRATEGY_OPTIONS, ...optsOverride }
  const inflation = input.inflationRate
  const aowAge = input.forcedFireAge != null ? Math.round(input.forcedFireAge) : NL_AOW_AGE
  const startAge = Math.round(input.currentAge)
  const strategy = input.strategyConfig.strategy
  const endAge =
    strategy === 'perpetual' ? Math.max(input.strategyConfig.endAge, 100) : input.strategyConfig.endAge
  const withdrawalType = input.withdrawalStrategy.strategy

  // ── VPW × legacy/perpetual/pensioen is onverenigbaar (spiegelt de v1-block;
  //    was in fire-simulation.ts vóór 1417a4568). VPW (`applyVpw`) onttrekt per
  //    definitie het volledige restant binnen de horizon (vpwRate = 1.0 in het
  //    laatste jaar → portfolio → ~€0), wat botst met nalatenschap (legacy),
  //    eeuwigdurend vermogensbehoud (perpetual) en de vaste pensioen-onttrekking.
  //    VPW is alléén compatibel met 'deplete'. Zonder deze guard gaf v2
  //    misleidende uitkomsten: vpw×legacy → fireReachable=false ("verhoog je
  //    spaarquote"), vpw×perpetual → stil fireReachable=true op fireAge=100 met
  //    €0 eindvermogen. Vroege uitgang met de lege/onbereikbare resultaat-shape
  //    die de adapter/toSimResult verwacht. ──
  if (
    withdrawalType === 'vpw' &&
    (strategy === 'legacy' || strategy === 'perpetual' || strategy === 'pensioen')
  ) {
    return {
      rows: [],
      vNodig: [],
      fireAge: null,
      fireAgeFractional: null,
      fireReachable: false,
      requiredFirePortfolioAtFire: 0,
      liquideAtFire: 0,
      displayEndAge: endAge,
      strategy,
      inflationRate: inflation,
      legacyTargetUnavoidablyExceeded: false,
    }
  }

  const box3Params = BOX3_PARAMS[BOX3_YEAR]
  const box3Vrij = input.hasPartner ? box3Params.heffingsvrijPartner : box3Params.heffingsvrijSingle
  const annualSavings = Math.max(0, input.annualSavings)
  const grossAnnualIncome = Math.max(0, input.monthlyIncome) * 12
  // Assets die ondanks hun (niet-liquide) type tóch als besteedbaar meetellen —
  // de include_full-woning (ADR 0015) ÉN de v2-downsize-woning (ADR 0028). Zie
  // countsAsEligibilityLiquid/mayBeRawWithdrawn.
  const spendableIds = new Set(input.spendableAssetIds ?? [])
  // Assets die via een verkoop-config (`assetLiquidations`) als UNIT verkocht
  // worden — nooit rauw onttrokken (ADR 0020), verlaten het grootboek enkel via de
  // verkoop. Geldt voor zowel fixed_age (huis-downsize / vast_moment) als on_demand.
  //
  // BEWUSTE OVERLAP (Fase 2, ADR 0028): de v2-downsize-woning is BÉIDE spendable
  // (telt mee voor FIRE-eligibility, vervroegt FIRE) ÉN saleManaged (verlaat de pot
  // enkel via de downsize-verkoop). Daarom mág `spendable` hier NIET uit
  // `saleManagedIds` filteren — anders zou de spendable woning rauw onttrokken
  // mogen worden (mayBeRawWithdrawn=true via spendable) i.p.v. uitsluitend via de
  // verkoop. countsAsEligibilityLiquid laat de spendable-saleManaged-woning wél
  // meetellen in het liquide vermogen; mayBeRawWithdrawn houdt 'm uit de
  // onttrekkingsvolgorde. (Voorheen sloot dit filter `spendable` uit op de aanname
  // "geen overlap" — die aanname is per Fase 2 vervallen.)
  const saleManagedIds = new Set((input.assetLiquidations ?? []).map((l) => l.assetId))

  // ── Fresh running-state per pass (assets/debts worden gemuteerd) ──
  function buildAssets(): RunningAsset[] {
    const out: RunningAsset[] = []
    for (const a of input.assets) {
      if (a.is_active === false) continue
      // FIRE-eligible engine-waarde = current_value × inclusion_pct (EIGENDOM,
      // geldt altijd, voor elk asset). Identiek aan het elders getoonde netto
      // vermogen — geen desync meer. `include_full` is een ORTHOGONALE as: die
      // zet hieronder de `spendable`-vlag (FIRE-behandeling: het eigen deel telt
      // volledig als liquide/besteedbaar met eigen reële return), maar raakt de
      // grondslag NIET. Gedeeld met liquidSumStart/blendedRealReturnStart via
      // assetEngineValue.
      const value = assetEngineValue(a)
      let nom = (a.expected_return ?? 0) / 100
      if (a.depreciation_rate && a.depreciation_rate > 0) nom = -(a.depreciation_rate / 100)
      nom += input.returnDeltaByAssetType?.[a.asset_type] ?? input.returnDelta ?? 0
      out.push({
        id: a.id,
        naam: a.name,
        type: a.asset_type,
        value,
        realRet: realReturn(nom, inflation),
        box3Cat: classifyAsset(a).category,
        spendable: spendableIds.has(a.id),
        saleManaged: saleManagedIds.has(a.id),
      })
    }
    if (input.bankAccountCash && input.bankAccountCash > 0) {
      out.push({ id: 'bank-cash', naam: 'Bankrekeningen (los)', type: 'cash', value: input.bankAccountCash, realRet: realReturn(0, inflation), box3Cat: 'spaargeld', spendable: false, saleManaged: false })
    }
    return out
  }
  function buildDebts(): RunningDebt[] {
    const debts: RunningDebt[] = input.debts
      .filter((d) => d.is_active !== false)
      .map((d) => ({
        id: d.id,
        naam: d.name,
        balance: (d.current_balance ?? 0) * ((d.net_worth_inclusion_pct ?? 100) / 100),
        rate: (d.interest_rate ?? 0) / 100,
        annualPayment: (d.monthly_payment ?? 0) * 12,
        repayment: (d.repayment_type ?? 'annuiteit') as RunningDebt['repayment'],
        isMortgage: d.debt_type === 'mortgage',
        deductible: d.is_tax_deductible === true,
        flagged: d.include_aflossing_in_savings === true,
        lastActiveRente: 0,
        isReverseMortgage: false,
      }))
    // ADR 0029: synthetische opeethypotheek-schuld (saldo 0, aflossingsvrij,
    // onderpand-rente). Opent op de trigger-leeftijd; groeit via opnames + rente
    // (zie de opeethypotheek-blok in de loop). De normale schuld-loop slaat 'm over.
    if (input.reverseMortgage) {
      debts.push({
        id: REVERSE_MORTGAGE_DEBT_ID,
        naam: 'Opeethypotheek',
        balance: 0,
        rate: input.reverseMortgage.interestRate,
        annualPayment: 0,
        repayment: 'aflossingsvrij',
        isMortgage: true,
        deductible: false,
        flagged: false,
        lastActiveRente: 0,
        isReverseMortgage: true,
      })
    }
    return debts
  }

  // ── Forward pass ──────────────────────────────────────────────────────────
  function runForward(stopWorkAtAge: number | null): ForwardResult {
    const assets = buildAssets()
    const debts = buildDebts()

    const investableIds = assets.filter((a) => INVESTABLE_TYPES.includes(a.type)).map((a) => a.id)
    // RAW-bestemmingen voor surplus/verkoopopbrengst: alléén assets die rauw
    // beschreven mogen worden — NOOIT een saleManaged asset (een opbrengst die in
    // de zojuist-verkochte/spendable downsize-woning belandt zou die herleven en
    // de verkooplus laten herhalen). Daarom `mayBeRawWithdrawn`, niet eligibility.
    const liquidIds = assets.filter((a) => mayBeRawWithdrawn(a)).map((a) => a.id)
    // Surplus-doel (pot-regel "verdeling bij toename"): specifieke types indien gezet,
    // anders investable → liquide → eerste asset.
    let surplusTargets =
      opts.surplusTargetTypes && opts.surplusTargetTypes.length
        ? assets.filter((a) => opts.surplusTargetTypes!.includes(a.type)).map((a) => a.id)
        : []
    if (surplusTargets.length === 0) {
      surplusTargets = investableIds.length ? investableIds : liquidIds.length ? liquidIds : assets.length ? [assets[0].id] : []
    }
    // Verkoop-opbrengst-bestemming: ALLEEN liquide doelen. Een verkoopopbrengst
    // (cash) mag nooit teruggestopt worden in een niet-liquide / sale-managed asset
    // (bv. het zojuist verkochte beleggingspand) — dat zou de asset herleven en de
    // on_demand-verkooplus laten herhalen (oneindige lus). Houdt de
    // surplusTargets-VOORKEUR (pot-regel) maar valt terug op de algemene liquide pot.
    const liquidProceedsTargets = (() => {
      const liquidPreferred = surplusTargets.filter((id) => liquidIds.includes(id))
      if (liquidPreferred.length) return liquidPreferred
      if (liquidIds.length) return liquidIds
      const cashId = assets.find((a) => a.type === 'cash')?.id
      return cashId ? [cashId] : []
    })()
    const firstInvestId = investableIds[0] ?? surplusTargets[0]
    const firstCashId = assets.find((a) => a.type === 'cash')?.id ?? surplusTargets[0]
    // Volgorde-helper op type-niveau. `liquidOnly` (default true) beperkt de lijst
    // tot assets die RAUW onttrokken mogen worden (`mayBeRawWithdrawn`): niet-liquide
    // assets (eigen_huis/vehicle/physical) worden NIET rauw onttrokken, en een
    // `saleManaged` asset NOOIT — óók niet als het `spendable` is (de spendable
    // downsize-woning telt mee voor eligibility maar verlaat het grootboek uitsluitend
    // via de verkoop, fixed_age/on_demand block 6b, mét verkoopkosten en schuld-
    // aflossing). Zo blijft een `niet_verkopen`-bezitting én een downsize-woning staan
    // i.p.v. ongemerkt leeggetrokken te worden. `liquidOnly:false` (volledige staart,
    // niet-liquide laatst) blijft beschikbaar voor de on_demand-verkoopvolgorde, die
    // juist de niet-liquide staart nodig heeft.
    const orderIdsFor = (types: AssetType[], liquidOnly = true): string[] => {
      const ids: string[] = []
      const want = (a: RunningAsset) => (liquidOnly ? mayBeRawWithdrawn(a) : true)
      for (const t of types) for (const a of assets) if (a.type === t && want(a)) ids.push(a.id)
      for (const a of assets) if (want(a) && !ids.includes(a.id)) ids.push(a.id)
      return ids
    }
    // Onttrekkingsvolgorde (decumulatie) + aparte tekort-volgorde (opbouwfase) —
    // beide LIQUIDE-only (zie hierboven). De niet-liquide on_demand-verkoopvolgorde
    // (`onDemandOrderIds`) is apart en volgt de volledige staart.
    const withdrawalOrderIds = orderIdsFor(opts.withdrawalOrder)
    const deficitOrderIds = orderIdsFor(opts.deficitOrder ?? opts.withdrawalOrder)
    // Volledige onttrekkingsvolgorde (incl. niet-liquide staart, eigen_huis laatst):
    // de bron voor de on_demand-verkoopvolgorde. Tie-break binnen één type =
    // assets.sort_order (al gerespecteerd via de input-volgorde van buildAssets,
    // die de assets-array volgt), anders asset-id. Géén nieuw sorteersysteem.
    const fullOrderIds = orderIdsFor(opts.withdrawalOrder, false)
    // Map asset-id → on_demand-liquidatie (alleen niet-liquide assets met trigger
    // 'on_demand'). Liquide assets worden direct als pot besteed; een on_demand-
    // config op een liquide asset is daarom inert (geen entry hier).
    const onDemandById = new Map<string, AssetLiquidation>()
    for (const liq of input.assetLiquidations ?? []) {
      if (liq.trigger !== 'on_demand') continue
      const a = assets.find((x) => x.id === liq.assetId)
      // Alléén niet-direct-besteedbare assets (generieke voertuig/inboedel/
      // deelneming-liquidatie): een asset dat NIET als eligibility-liquide telt en
      // dus via een echte verkoop gemonetariseerd moet worden. De spendable
      // downsize-woning telt wél als eligibility-liquide (en is bovendien fixed_age,
      // niet on_demand) → valt hier nooit door, zoals bedoeld.
      if (a && !countsAsEligibilityLiquid(a)) onDemandById.set(liq.assetId, liq)
    }
    // Verkoop-volgorde: niet-liquide on_demand-assets in de volledige onttrekkings-
    // volgorde (minst-liquide laatst, eigen_huis allerlaatst).
    const onDemandOrderIds = fullOrderIds.filter((id) => onDemandById.has(id))

    const stopAt = stopWorkAtAge ?? aowAge
    const rows: LedgerRow[] = []
    const netNeed: number[] = []
    let decumStartAge: number | null = null
    let decumStartLiquide = 0
    let prevWithdrawal = 0

    for (let age = startAge; age <= endAge; age++) {
      const jaar = age - startAge
      const werkt = age < stopAt
      const beginById: Record<string, number> = {}
      for (const a of assets) beginById[a.id] = a.value

      // 1. Marktschok
      const shock = oneTimeShock(input.cashflows, age)
      if (shock !== 0) for (const a of assets) if (INVESTABLE_TYPES.includes(a.type)) a.value *= 1 + shock

      // 2. Rendement (reëel) per asset
      const rendById: Record<string, number> = {}
      for (const a of assets) {
        const r = a.value * a.realRet
        rendById[a.id] = r
        a.value += r
      }

      // 2b. Box 3-drag per asset (na heffingsvrij)
      const box3ById: Record<string, number> = {}
      let box3Value = 0
      for (const a of assets) if (a.box3Cat) box3Value += Math.max(0, a.value)
      const taxable = box3Value > box3Vrij ? (box3Value - box3Vrij) / box3Value : 0
      if (taxable > 0) {
        for (const a of assets) {
          if (!a.box3Cat) continue
          const forfait = a.box3Cat === 'spaargeld' ? box3Params.forfaitSpaargeld : box3Params.forfaitBeleggingen
          const rate = input.box3Method === 'werkelijk' ? Math.max(0, a.realRet) * box3Params.tarief : forfait * box3Params.tarief
          const drag = Math.max(0, a.value) * rate * taxable
          box3ById[a.id] = drag
          a.value -= drag
        }
      }

      // 3. Schuldschema
      const schuldenRow: SchuldBeweging[] = []
      let schuldlasten = 0
      let flaggedAflossing = 0
      // Vrijval van de woonlast-RENTE bij payoff (Fase B, gecorrigeerd):
      // de spaarquote-baseline (`annualSavings = inkomen − uitgaven + flagged_aflossing`)
      // heeft van een geflagde schuld de héle jaarlast (rente + aflossing) als
      // "uitgave" verrekend en daarna de aflossing weer teruggeteld. NETTO blijft
      // binnen annualSavings dus alleen de RENTE permanent afgetrokken; de aflossing
      // valt weg (uitgave − terugtelling = 0). Zodra de schuld is afgelost brengt
      // `flaggedAflossing → 0` de aflossing AL terug in het surplus. Daarom mag
      // uitsluitend het RENTE-deel nog vrijvallen — niet de volledige jaarlast.
      // Anders zou de aflossing dubbel hersteld worden (R te hoog).
      // We onthouden per geflagde schuld de rente van haar LAATSTE lopende jaar
      // (`lastActiveRente`, bijgewerkt zolang begin > 0) en laten die vrijvallen
      // zodra de schuld dit jaar op begin === 0 staat (volledig afgelost).
      // De rente = `begin * rate`, met `begin = d.balance` AL gewogen via
      // net_worth_inclusion_pct (buildDebts) → automatisch consistent met
      // flaggedAflossing en de baseline. Aflossingsvrij: begin daalt nooit naar 0
      // → valt nooit vrij (correct, woonlast verdwijnt immers niet).
      let freedHousingCost = 0
      for (const d of debts) {
        // ADR 0029: de synthetische opeethypotheek volgt NIET het reguliere schema
        // (geen vaste jaarlast/aflossing). Haar rente + opname + saldo worden in het
        // dedicated opeethypotheek-blok hieronder afgehandeld (na de onttrekking) en
        // daar als eigen schuldenRow-entry geschreven. Sla 'm hier over.
        if (d.isReverseMortgage) continue
        const begin = d.balance
        const rente = begin * d.rate
        let aflossing = 0
        if (d.repayment !== 'aflossingsvrij' && begin > 0) aflossing = Math.max(0, Math.min(d.annualPayment, begin + rente) - rente)
        aflossing = Math.min(aflossing, begin)
        d.balance = Math.max(0, begin - aflossing)
        schuldlasten += rente + aflossing
        if (d.flagged) {
          flaggedAflossing += aflossing
          if (begin > 0) {
            // Schuld loopt nog: onthoud de rente van dit (mogelijk laatste) jaar.
            d.lastActiveRente = rente
          } else {
            // begin === 0 → volledig afgelost: alléén de rente uit het laatste
            // lopende jaar valt vrij (de aflossing kwam al terug via flaggedAflossing).
            freedHousingCost += d.lastActiveRente
          }
        }
        schuldenRow.push({ id: d.id, naam: d.naam, begin, rente, aflossing, extraAflossing: 0, eind: d.balance })
      }
      const eigenHuisWaarde = assets.filter((a) => a.type === 'eigen_huis').reduce((s, a) => s + Math.max(0, a.value), 0)
      const onderhoud = eigenHuisWaarde > 0 ? eigenHuisWaarde * ONDERHOUD_PCT : 0
      const woonkosten = schuldlasten + onderhoud

      // 4. Cashflows
      const rec = activeRecurring(input.cashflows, age, inflation, startAge, werkt)
      const one = oneTimeFlows(input.cashflows, age)
      const recurringIncome = rec.income
      const eventsUitgave = rec.expense + one.expense
      const eventsInkomen = one.income

      // 5. Inkomen (display) — bruto; loonheffing/HRA zitten al in de spaarquote.
      const salaris = werkt ? grossAnnualIncome : 0

      // 6. Eenmalig inkomen wordt belegd (instroom) vóór onttrekking
      const instroomById: Record<string, number> = {}
      const uitstroomById: Record<string, number> = {}
      if (eventsInkomen > 0) {
        const alloc = allocateProRata(snapshot(assets), surplusTargets, eventsInkomen)
        for (const [id, v] of Object.entries(alloc)) {
          instroomById[id] = (instroomById[id] ?? 0) + v
          const a = assets.find((x) => x.id === id)
          if (a) a.value += v
        }
      }

      // 6b. Asset-liquidatie: verkoop het asset BINNEN het grootboek i.p.v. het uit
      // de pot te filteren + de verkoop als inkomen in te spuiten. Het niet-liquide
      // asset (marktwaarde, na groei dit jaar) verlaat het grootboek; de gekoppelde
      // schuld wordt afgelost (saldo → 0, woonlast stopt vanaf volgend jaar); de
      // netto-opbrengst stroomt naar liquide. Netto vermogen blijft daardoor continu
      // (alleen −verkoopkosten), alléén de liquiditeit verspringt. Zie ADR 0015/0020.
      //
      // Gedeelde mechaniek voor zowel `fixed_age` (hier, onvoorwaardelijk op `age`)
      // als `on_demand` (in de withdraw-helper, bij liquiditeitstekort). Retourneert
      // de NETTO-opbrengst (na aflossing) zodat de on_demand-caller weet hoeveel er
      // aan de pot is toegevoegd. Een onderwater-verkoop (negatieve netto-opbrengst)
      // wordt hier NIET verder onttrokken — dat is de verantwoordelijkheid van de
      // aanroepende fase (de on_demand-helper onttrekt het restant alsnog liquide).
      const sellAsset = (liq: AssetLiquidation): number => {
        const asset = assets.find((a) => a.id === liq.assetId)
        if (!asset || asset.value <= 0) return 0
        const marktwaarde = asset.value
        const verkoopprijs = marktwaarde * liq.salePricePct
        let afgelost = 0
        for (const debtId of liq.payoffDebtIds) {
          const d = debts.find((x) => x.id === debtId)
          if (!d || d.balance <= 0) continue
          afgelost += d.balance
          const drow = schuldenRow.find((s) => s.id === d.id)
          if (drow) {
            drow.extraAflossing += d.balance
            drow.eind = 0
          }
          d.balance = 0
        }
        const opbrengstNetto = verkoopprijs * (1 - liq.salesCostsPct) - afgelost
        // Het asset verlaat het grootboek (uitstroom = volledige marktwaarde).
        uitstroomById[asset.id] = (uitstroomById[asset.id] ?? 0) + marktwaarde
        asset.value = 0
        // Netto-opbrengst → LIQUIDE pot (nooit terug in een niet-liquide/sale-managed
        // asset; zie liquidProceedsTargets — anders herleeft het zojuist verkochte
        // asset en loopt de on_demand-verkooplus eeuwig door).
        if (opbrengstNetto > 0) {
          const alloc = allocateProRata(snapshot(assets), liquidProceedsTargets, opbrengstNetto)
          for (const [id, v] of Object.entries(alloc)) {
            instroomById[id] = (instroomById[id] ?? 0) + v
            const a = assets.find((x) => x.id === id)
            if (a) a.value += v
          }
        }
        return opbrengstNetto
      }

      // `fixed_age`-liquidaties (incl. eigen-huis-downsize en `vast_moment`-verkopen):
      // onvoorwaardelijk op de vaste leeftijd. Entries zonder expliciete `trigger`
      // tellen als `fixed_age` (achterwaartse compatibiliteit). Een onderwater-
      // verkoop onttrekt het tekort in de tekort-volgorde.
      for (const liq of input.assetLiquidations ?? []) {
        if (liq.trigger === 'on_demand') continue // afgehandeld in de withdraw-helper
        if (Math.round(liq.age) !== age) continue
        const asset = assets.find((a) => a.id === liq.assetId)
        if (!asset || asset.value <= 0) continue
        const opbrengstNetto = sellAsset(liq)
        if (opbrengstNetto < 0) {
          withdrawFrom(assets, deficitOrderIds, opts.shortfall, -opbrengstNetto, uitstroomById)
        }
      }

      // 6c. On_demand-fallback-plafond: een on_demand-asset met een eindig `age`-
      // plafond ≤ huidige leeftijd wordt uiterlijk nu verkocht, ook zónder tekort.
      // (Een tekort verkoopt het eerder via de withdraw-helper; deze regel garandeert
      // dat het plafond niet wordt overschreden.)
      for (const id of onDemandOrderIds) {
        const liq = onDemandById.get(id)!
        if (!Number.isFinite(liq.age) || age < Math.round(liq.age)) continue
        const a = assets.find((x) => x.id === id)
        if (a && a.value > 0) sellAsset(liq)
      }

      // Verkoop het eerstvolgende niet-liquide on_demand-asset (verkoopvolgorde =
      // onttrekkingsvolgorde) en geef de netto-opbrengst terug; 0 als er niets meer
      // te verkopen valt. Gebruikt door de withdraw-helper bij een onbedekt tekort.
      const sellNextOnDemand = (): number => {
        for (const id of onDemandOrderIds) {
          const a = assets.find((x) => x.id === id)
          if (!a || a.value <= 0) continue
          return sellAsset(onDemandById.get(id)!)
        }
        return 0
      }

      // Onttrek `need` liquide; dekt de liquide pot het niet, verkoop dan het
      // eerstvolgende on_demand-asset (proper sale) en onttrek het restant opnieuw
      // uit de nu-aangevulde pot. Herhaalt tot het tekort gedekt is of er geen
      // on_demand-assets meer zijn. Een verkoop kan het tekort méér dan dekken
      // (lumpy) → het overschot blijft als liquide pot staan voor latere jaren
      // (zelf-regulerend). Zonder on_demand-assets is dit byte-identiek aan een
      // kale `withdrawFrom` (de while-lus draait dan nul keer).
      // Retourneert het ONBEDEKTE restant (shortfall) na de liquide pot + alle
      // on_demand-verkopen. De opeethypotheek-draw (ADR 0029) gebruikt dit om te
      // weten hoeveel er nog uit de woning-onderpand geleend moet worden — ná de
      // echte liquide pot in de onttrekkingsvolgorde, precies zoals voorgeschreven.
      const withdrawWithOnDemand = (orderIds: string[], need: number): number => {
        let tekort = withdrawFrom(assets, orderIds, opts.shortfall, need, uitstroomById)
        while (tekort > 0.01) {
          const opbrengst = sellNextOnDemand()
          if (opbrengst <= 0) break // niets meer te verkopen → tekort blijft (zoals voorheen)
          tekort = withdrawFrom(assets, orderIds, opts.shortfall, tekort, uitstroomById)
        }
        return tekort
      }

      // ── Opeethypotheek-draw (ADR 0029) ────────────────────────────────────────
      // Open op de trigger-leeftijd; neem `gevraagd` op (tekort-gedreven of vast
      // monthlyPayout × 12) tegen de woning, GECAPT op de leen-ruimte:
      //   cap = overwaarde(jaar) × maxLoanPct
      //   ruimte = max(0, cap − (saldo + rente_dit_jaar))
      // De opname (≤ ruimte) stroomt naar de LIQUIDE pot; het opeetschuld-saldo
      // stijgt met diezelfde opname. De rente stapelt elk jaar op het (nieuwe) saldo
      // (aflossingsvrij, blok-3-stijl). Géén rauwe onttrekking uit de woning; géén
      // oneindig lenen (de cap groeit alleen mee met de woningwaarde). De rente is
      // NOMINAAL genoteerd maar wordt — consistent met de reguliere schuldrente in
      // blok 3 — direct op het reëel-gegroeide saldo toegepast zónder reëel-conversie.
      // Retourneert het bedrag dat NIET door de opeethypotheek gedekt kon worden
      // (onbedekt → bestaande shortfall-mechaniek → FIRE-later/lijn onder doel).
      // Cap = overwaarde(jaar) × maxLoanPct op het LEEN-bedrag (loan-to-value-grens).
      // Overwaarde = huiswaarde (engine-waarde dit jaar, na groei) − Σ saldo van de
      // bestaande hypotheken op deze woning. De opeetschuld zelf telt NIET mee
      // (we leggen er juist tegenaan). Gedeeld door de draw én de rente-accrual-clamp
      // (blok 6d) zodat eligibility-meting en het werkelijke maximum één grondslag delen.
      const reverseMortgageCap = (): number => {
        const rm = input.reverseMortgage
        if (!rm) return 0
        const houseAsset = assets.find((a) => a.id === rm.houseAssetId)
        const houseValue = houseAsset ? Math.max(0, houseAsset.value) : 0
        const mortgageIds = new Set(rm.mortgageDebtIds)
        const mortgageBalance = debts
          .filter((d) => mortgageIds.has(d.id))
          .reduce((s, d) => s + Math.max(0, d.balance), 0)
        return Math.max(0, houseValue - mortgageBalance) * rm.maxLoanPct
      }

      const drawReverseMortgage = (gevraagd: number): number => {
        const rm = input.reverseMortgage
        if (!rm || gevraagd <= 0.01 || age < Math.round(rm.triggerAge)) return gevraagd
        const debt = debts.find((d) => d.isReverseMortgage)
        if (!debt) return gevraagd
        const cap = reverseMortgageCap()
        // Cap op het JAAR-EIND-saldo: na de opname stapelt de rente nog op het VOLLE
        // (begin + opname)-saldo (blok 6d). Het eindsaldo = (begin + opname) × (1+rate)
        // mag de cap niet overschrijden → opname ≤ cap/(1+rate) − begin. Zo blijft het
        // gerapporteerde eindsaldo (incl. dit-jaar-rente) gegarandeerd ≤ overwaarde ×
        // maxLoanPct — geen oneindig lenen, ook niet via de rente-accrual.
        const maxBalanceNaOpname = cap / (1 + debt.rate)
        const ruimte = Math.max(0, maxBalanceNaOpname - debt.balance)
        const opname = Math.max(0, Math.min(gevraagd, ruimte))
        if (opname > 0) {
          // Naar de liquide pot (zelfde bestemming als verkoop-opbrengst).
          const alloc = allocateProRata(snapshot(assets), liquidProceedsTargets, opname)
          for (const [id, v] of Object.entries(alloc)) {
            instroomById[id] = (instroomById[id] ?? 0) + v
            const a = assets.find((x) => x.id === id)
            if (a) a.value += v
          }
          debt.balance += opname
        }
        return Math.max(0, gevraagd - opname)
      }

      let leefuitgaven: number
      let cashflowNetto: number

      if (werkt) {
        // ── Accumulatie ──
        leefuitgaven = Math.max(0, salaris - woonkosten - annualSavings)
        // freedHousingCost is 0 zolang een geflagde schuld nog loopt → BYTE-IDENTIEK
        // aan de pre-feature baseline tijdens de looptijd (cruciaal voor regressie).
        // Pas na payoff valt alleen het RENTE-deel van die schuld vrij; de aflossing
        // is dan al hersteld doordat flaggedAflossing → 0 (zie de schuld-loop).
        const surplus = annualSavings - flaggedAflossing + freedHousingCost + (recurringIncome - rec.expense) - one.expense
        cashflowNetto = surplus + eventsInkomen
        if (surplus > 0) {
          let rem = surplus
          if (opts.surplus === 'aflossen-eerst') {
            const byRate = [...debts].sort((a, b) => b.rate - a.rate)
            for (const d of byRate) {
              if (rem <= 0 || d.balance <= 0) continue
              const extra = Math.min(rem, d.balance * 0.1, d.balance)
              d.balance -= extra
              rem -= extra
              const drow = schuldenRow.find((s) => s.id === d.id)
              if (drow) {
                drow.extraAflossing += extra
                drow.eind = d.balance
              }
            }
          }
          const alloc = allocateSurplus(snapshot(assets), rem, opts, surplusTargets, firstInvestId, firstCashId)
          for (const [id, v] of Object.entries(alloc)) {
            instroomById[id] = (instroomById[id] ?? 0) + v
            const a = assets.find((x) => x.id === id)
            if (a) a.value += v
          }
        } else if (surplus < 0) {
          // Tekort in de opbouwfase: eerst de liquide pot + on_demand-verkopen, dan
          // (ADR 0029) de opeethypotheek als er onderpand-ruimte is. Mocht het huis
          // al vóór de werk-stop "nodig" zijn (zeldzaam), dan dekt de opeethypotheek
          // het na de echte liquide pot — net als in de decumulatiefase.
          const tekortNaLiquide = withdrawWithOnDemand(deficitOrderIds, -surplus)
          drawReverseMortgage(tekortNaLiquide)
        }
      } else {
        // ── Decumulatie: onttrekking volgens strategie ──
        // ADR 0029 — vaste maand-uitkering (monthlyPayout != null): de opeethypotheek
        // keert PROACTIEF `monthlyPayout × 12` uit naar de liquide pot vóór de
        // onttrekkingsberekening (gecapt op de leen-ruimte). Dat verlaagt de behoefte
        // die uit de eigen pot onttrokken moet worden — net als een recurring
        // inkomensstroom, maar nu als echte schuld-opname in het grootboek. De tekort-
        // gedreven variant (monthlyPayout == null) leent juist REACTIEF, ná de
        // onttrekking (zie hieronder), zodat alleen het werkelijke tekort wordt geleend.
        if (input.reverseMortgage?.monthlyPayout != null && input.reverseMortgage.monthlyPayout > 0) {
          drawReverseMortgage(input.reverseMortgage.monthlyPayout * 12)
        }
        if (decumStartAge === null) {
          decumStartAge = age
          // DRAWDOWN-grondslag (ADR 0030): de guardrails-anchor (startPortfolio) is de
          // pot die de annuïteit RAUW kan opnemen, niet de eligibility-pot incl. een
          // nog-niet-verkocht huis. Voor include_full/geen-huis identiek aan vroeger.
          decumStartLiquide = withdrawableLiquidValue(assets)
        }
        leefuitgaven = input.yearlyExpenses
        const baseExpenses = leefuitgaven + woonkosten + rec.expense + one.expense
        const ctx: WithdrawalContext = {
          baseExpenses,
          recurringIncome,
          // DRAWDOWN-grondslag (ADR 0030 / Optie B): de annuïteit teert op de RAUW
          // besteedbare pot (`withdrawableLiquidValue`), NIET op `liquidValue` (de
          // eligibility-pot incl. de spendable downsize-woning). Zo onttrekt ze op
          // precies de pot die ze kàn aanspreken → geen stille shortfall vóór de
          // verkoop (de cash loopt niet leeg terwijl de getoonde lijn door de
          // groeiende woning juist stijgt). include_full-woning: het huis zit óók in
          // `mayBeRawWithdrawn` → byte-identiek aan vroeger.
          currentPortfolio: withdrawableLiquidValue(assets),
          startPortfolio: decumStartLiquide,
          previousWithdrawal: prevWithdrawal,
          // Werkelijk gewogen reëel rendement van de RAUW besteedbare portefeuille
          // (cash/crypto drukken dit onder grossReturn) — op exact dezelfde pot als
          // currentPortfolio, zodat de deplete-annuïteit niet te veel/te weinig
          // onttrekt en de lijn correct op ~€0 eindigt i.p.v. vroegtijdig leeg.
          yearReturn: withdrawableRealReturn(assets),
          yearsIntoRetirement: age - decumStartAge,
          currentAge: age,
          endAge,
          endStrategy: strategy,
          legacyAmount: input.strategyConfig.legacyAmount,
          // Verenigd eindstrategie-model (Fase 1, architect-beslissing): deplete ≡
          // legacy(€0) via de GEFLOORDE schuivende annuïteit richting doelsaldo €0
          // (opeten ≡ nalatenschap met doelsaldo €0). De annuïteit (`computeAnnuityBase`)
          // wordt elk jaar herberekend op de resterende pot richting €0 op endAge, met
          // een uitgaven-bodem `Math.max(annuïteit, netto leefbehoefte)`: een gepensio-
          // neerde onttrekt minimaal zijn leefkosten. Die bodem is essentieel — zónder
          // bodem (puur de annuïteit op de LIQUIDE pot) onttrek je bij een kleine liquide
          // pot náást een groot niet-liquide on_demand-vermogen veel te weinig (~€2,5k/jr
          // i.p.v. €30k), waardoor het tekort de on_demand-verkoop nóóit triggert en de
          // estate (huis/caravan) ONverkocht op endAge blijft staan i.p.v. opgemaakt.
          // De annuïteit + bodem laat de liquide pot leeglopen → de niet-liquide assets
          // worden "wanneer nodig" verkocht (ADR 0020) en het GEHELE vermogen landt op
          // ~€0 op endAge. Eén reële voet (yearReturn = blended reële return van de
          // liquide pot) voor doel én afbouw, geen 0,6×.
          //
          // Legacy(€>0) blijft NEED-ONLY (ADR 0014/0017): onttrek de behoefte, het
          // residu groeit naar de nalatenschap. Een annuïteit-naar-L undershoot het
          // doel (jaar-op-jaar return-mismatch → afbouw landt ~€5k ónder L → de gate
          // `endLiquide ≥ L` faalt voor élke FIRE-leeftijd → kunstmatig onbereikbaar).
          // perpetual/pensioen: eigen tak (need-only).
          floorlessAnnuityToTarget: false,
          legacyPreserveOnly:
            strategy === 'legacy' && input.strategyConfig.legacyAmount > 0,
          inflation: 0, // reëel: geen inflatie in de annuïteit
        }
        const withdrawal = applyWithdrawalStrategy(input.withdrawalStrategy, ctx)
        prevWithdrawal = withdrawal
        const tekortNaLiquide = withdrawWithOnDemand(withdrawalOrderIds, withdrawal)
        // Tekort-gedreven opeethypotheek (monthlyPayout == null): leen ná de echte
        // liquide pot precies het onbedekte tekort, gecapt op de leen-ruimte. Bij een
        // vaste payout is de RM-opname hierboven al gedaan; een resterend tekort blijft
        // dan onbedekt (geen dubbele opname).
        if (input.reverseMortgage && input.reverseMortgage.monthlyPayout == null) {
          drawReverseMortgage(tekortNaLiquide)
        }
        cashflowNetto = recurringIncome + eventsInkomen - withdrawal
      }

      // 6d. Opeethypotheek-rente-accrual + schuldenRow (ADR 0029). NA alle opnames
      // dit jaar: het saldo (begin + opnames) stapelt zijn rente erbovenop
      // (aflossingsvrij — geen aflossing, woonlast verdwijnt niet). De opname is de
      // instroom-naar-liquide van dit jaar (begin → eind − rente). Zo verschijnt de
      // opeethypotheek als ECHTE schuld in de nalatenschap (`nettoVermogen = assets −
      // debts`) i.p.v. een display-only schaduwschuld.
      {
        const rm = debts.find((d) => d.isReverseMortgage)
        if (rm) {
          const beginRm = rm.balance
          if (beginRm > 0) {
            // Rente stapelt op het saldo (aflossingsvrij). De LTV-cap geldt óók op het
            // EINDsaldo: zou de gestapelde rente de schuld bóven overwaarde × maxLoanPct
            // tillen, dan klemt de bank op de cap (de LTV-grens wordt nooit overschreden).
            // Zo blijft de nalatenschap (huis − opeetschuld) gegarandeerd niet-negatief:
            // de opeetschuld kan het huis nooit méér dan maxLoanPct "opeten".
            const cap = reverseMortgageCap()
            const ongeklemd = beginRm * (1 + rm.rate)
            const eindRm = cap > 0 ? Math.min(ongeklemd, cap) : ongeklemd
            const renteRm = eindRm - beginRm
            rm.balance = eindRm
            // begin = saldo vóór de rente-accrual van dit jaar (= na de opnames);
            // de opname zelf zit al in beginRm (geen aparte instroom-kolom op een
            // schuld). aflossing/extraAflossing = 0 (aflossingsvrij). eind incl. (geklemde) rente.
            schuldenRow.push({ id: rm.id, naam: rm.naam, begin: beginRm, rente: renteRm, aflossing: 0, extraAflossing: 0, eind: rm.balance })
          } else {
            // Nog niet geopend / geen opname dit jaar → 0-rij voor consistentie.
            schuldenRow.push({ id: rm.id, naam: rm.naam, begin: 0, rente: 0, aflossing: 0, extraAflossing: 0, eind: 0 })
          }
        }
      }

      // 7. Totalen + bracketing
      const totaalAssets = assets.reduce((s, a) => s + a.value, 0)
      const totaalSchuld = debts.reduce((s, d) => s + d.balance, 0)
      // Eligibility-pot (FIRE-gate/V_op) — ONGEMOEID, incl. spendable downsize-woning.
      const liquideVermogen = liquidValue(assets)
      // RAUW besteedbare pot (ADR 0030) — wat de afbouw-annuïteit kàn opnemen + de
      // grondslag voor de verkoop-trigger. Ex de spendable+saleManaged downsize-woning.
      const besteedbaarVermogen = withdrawableLiquidValue(assets)
      const box3Grondslag = Math.max(0, box3Value - box3Vrij)
      const box3Total = Object.values(box3ById).reduce((s, v) => s + v, 0)

      const assetsRow: AssetBeweging[] = assets.map((a) => ({
        id: a.id,
        naam: a.naam,
        type: a.type,
        begin: beginById[a.id] ?? 0,
        rendement: rendById[a.id] ?? 0,
        instroom: instroomById[a.id] ?? 0,
        uitstroom: uitstroomById[a.id] ?? 0,
        box3: box3ById[a.id] ?? 0,
        eind: a.value,
      }))

      rows.push({
        jaar,
        leeftijd: age,
        fase: 'opbouw',
        werkt,
        salaris,
        aowEnPensioen: recurringIncome,
        overigInkomen: eventsInkomen,
        box3Grondslag,
        box3: box3Total,
        woonkosten,
        leefuitgaven,
        eventsUitgave,
        totaleUitgaven: leefuitgaven + woonkosten + eventsUitgave,
        cashflowNetto,
        assets: assetsRow,
        schulden: schuldenRow,
        totaalAssets,
        totaalSchuld,
        nettoVermogen: totaalAssets - totaalSchuld,
        liquideVermogen,
        besteedbaarVermogen,
        vNodig: 0,
        dekking: 0,
        events: collectEvents(input.cashflows, age),
      })

      // Retire-now behoefte (bron voor V_nodig/doelbedrag): je STOPT met werken,
      // dus werk-gebonden salaris-delta's (onlyWhileWorking) tellen hier NIET mee —
      // evalueer de recurring cashflows met werkt=false. Voor niet-werk-events is
      // dit identiek aan `rec` (byte-identiek voor bestaande projecties).
      const recRetired = activeRecurring(input.cashflows, age, inflation, startAge, false)
      netNeed.push(
        Math.max(0, input.yearlyExpenses + woonkosten + recRetired.expense + one.expense - recRetired.income - eventsInkomen),
      )
    }

    return { rows, netNeed }
  }

  // ── V_nodig (backward referentielijn) ──
  // De backward-annuïteit discounteert op de WAARDE-GEWOGEN BLENDED REËLE VOET van de
  // FIRE-eligible startpot (`blendedRealReturnStart`) — exact het rendement waarop de
  // afbouw teert. Drie opmerkingen over samenvallen / precisie:
  //
  // (a) DOEL-LIJN ↔ DRAWDOWN INTRINSIEK: doel-lijn en drawdown-curve delen ÉÉN voet
  //     (blendedReal) — dat valt intrinsiek samen.
  // (b) GETEKENDE STIP OP DE LIJN: `fireAgeFractional` = crossingAge is het sub-jaar-
  //     snijpunt waar de getekende nominale vermogenscurve de horizontale doel-lijn
  //     kruist — de stip en de lijn vallen op de grafiek samen.
  // (c) INTEGER-PRECISIE: de integer `liquideAtFire` kan tot één discrete jaarstap
  //     boven `requiredFirePortfolioAtFire` liggen, omdat de stijgende opbouwcurve
  //     de dalende V_nodig-lijn discreet (per jaar) passeert. Dit is geen mismatch,
  //     maar de inherente granulariteit van een jaarlijks grootboek.
  //
  // De oude 0,6×-buffer is verwijderd (Fase 1). Bodem-eerlijkheid komt nu
  // van de expliciete premature-collapse-guard in `meetsStrategyTarget` (criterium 7).
  const pass1 = runForward(null)
  const vNodig = backwardVnodig(
    pass1.rows,
    pass1.netNeed,
    blendedRealReturnStart(input, inflation, spendableIds),
    strategy,
    input.strategyConfig.legacyAmount,
    liquidSumStart(input),
    withdrawalType,
  )

  // ── FIRE via forward doel-zoektocht (zelf-consistent) ──
  // FIRE = vroegste leeftijd waarop "stop met werken + onttrek volgens de
  // strategie" het einddoel haalt:
  //  - deplete/pensioen → liquide ≥ V_nodig op de FIRE-leeftijd (ADR 0027): de
  //    FIRE-detectie deelt ÉÉN grondslag met de doel-lijn (dezelfde backward-
  //    annuïteit `vNodig`). De integer `liquideAtFire` kan tot één discrete
  //    jaarstap boven `requiredFirePortfolioAtFire` liggen (zie V_nodig-comment
  //    hierboven, punt c). Dit vervangt de oude forward-deplete-feasibility-test
  //    (een over-agressieve volledige-pot-spend-down liet FIRE ~4 jaar te laat
  //    vuren — zie ADR 0027 / INV-3-herziening);
  //  - perpetual → koopkracht behouden (eindvermogen ≥ vermogen op FIRE);
  //  - legacy → nalatenschap intact (need-only, ADR 0014/0017).
  // De getoonde lijn ÍS die run, dus de grafiek en de FIRE-leeftijd kloppen per
  // constructie. NB: vNodig[i] is positie-geïndexeerd en runForward(f) levert
  // dezelfde leeftijd-sequentie als pass1 → de index lijnt 1-op-1 uit.
  let fireAge: number | null = null
  let displayRows = pass1.rows
  // Legacy-signaal (ADR 0017): de vroegst mogelijke FIRE-leeftijd (stoppen = nu)
  // eindigt al ≥ nalatenschap → de lijn schiet onvermijdelijk over het doel.
  let legacyTargetUnavoidablyExceeded = false
  if (input.forcedFireAge != null) {
    fireAge = Math.round(input.forcedFireAge)
    displayRows = runForward(fireAge).rows
  } else {
    for (let f = startAge; f <= endAge; f++) {
      const run = runForward(f)
      const fIdx = run.rows.findIndex((r) => r.leeftijd === f)
      const vNodigAtFire = fIdx >= 0 ? vNodig[fIdx] : Number.POSITIVE_INFINITY
      if (meetsStrategyTarget(run.rows, f, strategy, input.strategyConfig.legacyAmount, vNodigAtFire)) {
        fireAge = f
        displayRows = run.rows
        // De vroegste passerende leeftijd is meteen de start → onvermijdelijke
        // overshoot (alléén betekenisvol voor legacy met een POSITIEF doel; need-only
        // laat het residu boven het doel uitgroeien). Geen onbereikbaarheid: FIRE = nu.
        // legacy(€0) ≡ deplete → geen overshoot-semantiek (signaal blijft false, gelijk
        // aan deplete).
        if (strategy === 'legacy' && f === startAge && input.strategyConfig.legacyAmount > 0) {
          legacyTargetUnavoidablyExceeded = true
        }
        break
      }
    }
  }

  const fireIdx = fireAge != null ? displayRows.findIndex((r) => r.leeftijd === fireAge) : -1
  for (let i = 0; i < displayRows.length; i++) {
    displayRows[i].vNodig = vNodig[i]
    displayRows[i].dekking = displayRows[i].liquideVermogen - vNodig[i]
  }
  const fa = fireAge ?? Number.POSITIVE_INFINITY
  for (const r of displayRows) {
    r.fase = r.leeftijd < fa ? 'opbouw' : r.leeftijd < aowAge ? 'overbrugging' : 'onttrekking'
  }

  // ── Fractionele FIRE-leeftijd: het ECHTE sub-jaar-snijpunt (ADR 0027) ────────
  // De integer `fireAge` is het EERSTE jaar waarop de retire-at-f-run het strategie-
  // doel haalt (meetsStrategyTarget / Optie B). De FIRE-stip op de grafiek wordt op
  // `fireAgeFractional` op de (bij include_full netto≈liquide) vermogenscurve getekend.
  // Stond die gelijk aan de integer `fireAge`, dan lag de stip een vól jaar vermogens-
  // opbouw ná het visuele snijpunt — op groot vermogen €100–220k bóven de dalende
  // V_nodig-doel-lijn.
  //
  // De stip moet liggen waar de GETOONDE liquide-curve (`displayRows`) de GETOONDE
  // V_nodig-doel-lijn kruist: dat is het punt op de grafiek waar lijn en doel elkaar
  // raken. We zoeken in `displayRows` de laatste sign-change van `dekking`
  // (= liquide − V_nodig) van < 0 naar ≥ 0 op/vóór de FIRE-leeftijd, en interpoleren
  // lineair binnen dat ene jaar-segment. (De integer-detectie kan een jaar later
  // vuren dan de getoonde curve kruist, omdat ze op de retire-at-f-run i.p.v. de
  // displayRows-run is geëvalueerd; de stip volgt bewust de GETOONDE curve.)
  //
  // De integer `fireAge` (freedomPct, snapshots, requiredFirePortfolioAtFire,
  // liquideAtFire) blijft ONGEWIJZIGD — alléén de decimale stip-positie wordt
  // preciezer. Forced-fire (gebruiker kiest expliciet de gehele leeftijd) en legacy/
  // perpetual (geen liquide↑×V_nodig↓-crossing-semantiek) houden fireAgeFractional =
  // fireAge.
  let fireAgeFractional: number | null = fireAge
  if (
    fireAge != null &&
    input.forcedFireAge == null &&
    (strategy === 'deplete' || strategy === 'pensioen') &&
    fireIdx >= 0
  ) {
    // Doel = de getekende horizontale deplete-doel-lijn = V_nodig op de FIRE-leeftijd,
    // NOMINAAL (× inflatiefactor van het FIRE-jaar) — exact zoals de adapter `fireTarget`
    // levert (requiredFirePortfolio = vNodig[fireIdx] × (1+i)^jaar_FIRE).
    const fireFactor = Math.pow(1 + inflation, displayRows[fireIdx].jaar)
    const targetNominal = vNodig[fireIdx] * fireFactor
    fireAgeFractional = crossingAge(displayRows, targetNominal, fireIdx, inflation)
  }

  return {
    rows: displayRows,
    vNodig,
    fireAge,
    fireAgeFractional,
    fireReachable: fireAge != null,
    requiredFirePortfolioAtFire: fireIdx >= 0 ? vNodig[fireIdx] : 0,
    liquideAtFire: fireIdx >= 0 ? displayRows[fireIdx].liquideVermogen : 0,
    displayEndAge: endAge,
    strategy,
    inflationRate: inflation,
    legacyTargetUnavoidablyExceeded,
  }
}

/**
 * Minimale decumulatie-horizon voor een geldige deplete/legacy(€0)-FIRE.
 *
 * De gate `liquide ≥ V_nodig` is TRIVIAAL waar op f = endAge: dan is er ~0 afbouw
 * en V_nodig ≈ 0 (de backward-annuïteit landt op het doelsaldo op endAge). Zonder
 * een minimum-horizon zou een onhoudbaar pad (uitgaven ≫ vermogen) "FIRE op endAge"
 * claimen. We eisen daarom dat er minstens MIN_DECUM_YEARS afbouwjaren ná de FIRE-
 * leeftijd liggen — een betekenisvol pensioen — én gebruiken dezelfde marge als de
 * tail die we van de collapse-check uitsluiten (de annuïteit naar het doelsaldo brengt
 * de pot uitsluitend in de LAATSTE ~MIN_DECUM_YEARS jaar onder één-jaar-behoefte; dat
 * is de natuurlijke staart, geen ineenstorting). 3 jaar is ruim genoeg om de
 * legitieme (ook late) afbouw niet te blokkeren, scherp genoeg om de triviale
 * endAge-pass en een vroege leegloop te weren.
 */
const MIN_DECUM_YEARS = 3

/**
 * Haalt een retire-at-FIRE-run het einddoel van de strategie?
 *  - deplete/pensioen/legacy(€0): liquide vermogen op de FIRE-leeftijd ≥ V_nodig op
 *    die leeftijd (ADR 0027), MÉT een minimale-decumulatie-horizon en een premature-
 *    collapse-guard (bodem-eerlijk, criterium 7). FIRE-detectie en doel-lijn delen
 *    één grondslag (dezelfde backward-annuïteit `vNodig`). opeten ≡ nalatenschap(€0):
 *    legacy(€0) routeert door EXACT dezelfde gate als deplete (verenigd model).
 *  - perpetual: niet vroegtijdig leeg + eindvermogen ≥ vermogen op FIRE (koopkracht);
 *  - legacy (positief doel): eindvermogen ≥ nalatenschapsbedrag, de brug mág richting
 *    €0 dippen maar het liquide pad mag nóóit negatief worden (ADR 0017).
 *
 * `vNodigAtFire` is V_nodig op de FIRE-leeftijd (deplete/pensioen/legacy(€0)).
 */
function meetsStrategyTarget(rows: LedgerRow[], fireAge: number, strategy: string, legacyAmount: number, vNodigAtFire: number): boolean {
  const ret = rows.filter((r) => r.leeftijd >= fireAge)
  if (ret.length === 0) return false
  const endLiquide = ret[ret.length - 1].liquideVermogen

  // Positief nalatenschapsbedrag — doel-zoekende selectie (ADR 0017). De brug naar
  // pensioen mág richting €0 dippen (de buffer zit al in het ingevoerde
  // nalatenschapsbedrag); geen −2%-tolerantie: eindvermogen ≥ legacyAmount (nooit
  // ónder het doel). Eindvermogen stijgt monotoon in de FIRE-leeftijd, dus de
  // vroegste passerende leeftijd eindigt automatisch het dichtst bij — en ≥ — het doel.
  if (strategy === 'legacy' && legacyAmount > 0) {
    // Geen liquide-pad mag négatief worden vóór endAge.
    for (let i = 0; i < ret.length - 1; i++) if (ret[i].liquideVermogen < 0) return false
    return endLiquide >= legacyAmount
  }

  if (strategy === 'perpetual') {
    // Mag tussendoor niet leeg raken; eindvermogen ≥ vermogen op FIRE (koopkracht).
    let minMid = Number.POSITIVE_INFINITY
    for (let i = 0; i < ret.length - 1; i++) minMid = Math.min(minMid, ret[i].liquideVermogen)
    if (minMid <= 1) return false
    return endLiquide >= ret[0].liquideVermogen * 0.99
  }

  // ── deplete / pensioen / legacy(€0) — verenigde annuity-to-doelsaldo-gate ──────
  // (ADR 0027 + Fase 1). FIRE = liquide ≥ V_nodig op de FIRE-leeftijd; één grondslag
  // met de doel-lijn (backward-annuïteit op de blended reële voet), zodat de stip op de
  // doel-lijn ligt. legacy(€0) gebruikt endVal=legacyAmount(=0) in backwardVnodig →
  // `vNodigAtFire` identiek aan deplete → identieke fireAge én eind-curve.
  //
  // CRITERIUM 7 — bodem-eerlijk (geen stille leegloop):
  //  (a) De gate is triviaal waar op f = endAge (V_nodig ≈ 0, ~0 afbouwjaren). Eis
  //      daarom een betekenisvol pensioen: endAge − fireAge ≥ MIN_DECUM_YEARS.
  //  (b) Premature-collapse-guard. De floorless annuïteit-naar-doelsaldo laat een
  //      LEGITIEME pot vloeiend dalen en pas in de LAATSTE ~MIN_DECUM_YEARS jaar onder
  //      één-jaar-behoefte komen (dat is de natuurlijke staart). Een ONHOUDBAAR pad
  //      (uitgaven ≫ vermogen) stort al in het EERSTE afbouwjaar in naar ~€0 en zou —
  //      doordat de need-only/annuïteit het onbedekte tekort stil wegcapt (withdrawFrom
  //      geeft de shortfall terug, de niet-on_demand-caller laat 'm vallen) — daarna
  //      "opveren" en alsnog ≥ V_nodig uitkomen → valse FIRE. We eisen daarom dat het
  //      liquide pad > één-jaar-behoefte blijft tot en met endAge − MIN_DECUM_YEARS
  //      (de tail-jaren waarin de annuïteit de pot bewust naar het doelsaldo brengt
  //      sluiten we uit). Zo passeert de legitieme (ook late) afbouw en valt een
  //      ineenstorting door de mand.
  if (endAgeOf(ret) - fireAge < MIN_DECUM_YEARS) return false
  const need = ret[0].totaleUitgaven - ret[0].aowEnPensioen
  const collapseFloor = Math.max(0, need)
  const lastCheckedAge = endAgeOf(ret) - MIN_DECUM_YEARS
  for (const r of ret) {
    if (r.leeftijd > lastCheckedAge) break
    if (r.liquideVermogen < collapseFloor) return false
  }
  return ret[0].liquideVermogen >= vNodigAtFire
}

/** Eindleeftijd van een retire-segment (laatste rij). */
function endAgeOf(ret: LedgerRow[]): number {
  return ret[ret.length - 1].leeftijd
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function snapshot(assets: RunningAsset[]): Record<string, number> {
  const m: Record<string, number> = {}
  for (const a of assets) m[a.id] = a.value
  return m
}

/**
 * BESTEEDBAAR/FIRE-eligible liquide vermogen = som van alle assets die als
 * eligibility-liquide tellen (`countsAsEligibilityLiquid`): van nature liquide
 * types + `spendable`-gemarkeerde assets (include_full- én v2-downsize-woning). Een
 * `saleManaged`-niet-spendable asset (generieke liquidatie) telt hier NIET mee tot
 * de verkoop. Dit is de grondslag van de afbouw-annuïteit, de FIRE-gate en de
 * getoonde `liquideVermogen`-rij. NB: op de trigger-MEETRUN is de downsize-woning
 * niet als spendable gemarkeerd → daar is dit ex-huis (zie countsAsEligibilityLiquid-doc).
 */
function liquidValue(assets: RunningAsset[]): number {
  return assets.filter((a) => countsAsEligibilityLiquid(a)).reduce((s, a) => s + Math.max(0, a.value), 0)
}

/**
 * Sub-jaar FIRE-snijpunt: de fractionele leeftijd waar de GETEKENDE vermogenscurve de
 * HORIZONTALE deplete-doel-lijn kruist BINNEN het ADR-0027-detectiejaar — exact zoals
 * de grafiek beide tekent.
 *
 * De grafiek (`sim-chart.tsx`) tekent:
 *  - de hoofdlijn als NOMINALE netto-vermogen-curve, gekeyd op leeftijd+1
 *    (allPts: `[r.age + 1, endPortfolio]`, endPortfolio = nettoVermogen × (1+i)^jaar,
 *    via de adapter; daarvóór het startpunt `[age0, startNetWorth]`). De chart-waarde
 *    "op leeftijd L" = nettoVermogen van de rij met leeftijd L−1 (eind van dat jaar);
 *    dus chart@fireAge = nominalAt(fireIdx−1), chart@(fireAge−1) = nominalAt(fireIdx−2).
 *  - het deplete-doelbedrag als één VLAKKE dashed lijn op `fireTarget`
 *    (= V_nodig op de integer FIRE-leeftijd × diens inflatiefactor, NOMINAAL).
 *
 * BELANGRIJK (ADR 0027-getrouwheid, beslissing architect): we interpoleren UITSLUITEND
 * binnen het detectiejaar — het segment [fireAge−1, fireAge] op de chart-as. We zoeken
 * NIET verder terug naar een eerdere curve-kruising. Reden: de doel-lijn is vlak op de
 * LAGE V_nodig[fireAge]-waarde (V_nodig daalt), terwijl de getekende curve het NETTO
 * vermogen is; bij een include_full-woning is netto veel steiler en kruist die lage
 * vlakke lijn jaren eerder dan de integer-FIRE-detectie vuurt. Vrij terugzoeken zou de
 * getoonde vrijheidsleeftijd jaren naar voren trekken en de bewuste ADR-0027-keuze
 * (deplete-FIRE ~51 i.p.v. ~45 over-agressief) stilzwijgend ongedaan maken. Door binnen
 * het detectiejaar te blijven wijkt `fireAgeFractional` nóóit > 1 jaar van de integer
 * `fireAge` af (precies de "≤ één jaar vermogensopbouw"-marge uit ADR 0027), valt de
 * stip op/vlakbij de doel-lijn én blijft de headline-leeftijd ~de integer FIRE.
 *
 * Is de curve aan het BEGIN van het segment (chart@(fireAge−1)) al ≥ doel, dan vond de
 * echte kruising een jaar eerder plaats; we klemmen dan op het segment-begin (t = 0,
 * leeftijd fireAge−1) — de laagste positie binnen het toegestane 1-jaars-venster, zodat
 * de stip zo dicht mogelijk op de doel-lijn ligt zónder de ADR-0027-leeftijd naar voren
 * te trekken (i.p.v. terug te vallen op fireAge, het HOOGSTE punt van het segment, dat
 * de stip juist een vol jaar opbouw bóven de lijn zou leggen). Voor include_full-
 * woningen blijft dan een kleine zichtbare stip↔lijn-afstand bestaan: dat is het
 * structurele gevolg van een VLAKKE liquide-doel-lijn onder een NETTO-curve (aandachts-
 * punt voor een eventuele ADR 0029 — niet hier stilzwijgend opgelost; ADR 0028 is
 * vergeven aan de downsize-"Verkopen"-herdefinitie, Fase 2).
 */
function crossingAge(rows: LedgerRow[], target: number, fireIdx: number, inflation: number): number {
  if (fireIdx < 1) return rows[fireIdx]?.leeftijd ?? 0
  const nominalAt = (rowIdx: number) =>
    rows[rowIdx].nettoVermogen * Math.pow(1 + inflation, rows[rowIdx].jaar)
  // Chart-segment van het detectiejaar: chart@(fireAge−1) → chart@fireAge.
  const prev = fireIdx >= 2 ? nominalAt(fireIdx - 2) : rows[0].nettoVermogen // chart@(fireAge−1)
  const now = nominalAt(fireIdx - 1) // chart@fireAge
  const denom = now - prev
  // prev ≥ target → t = 0 (klem op segment-begin). prev < target ≤ now → in-segment-kruising.
  const t = prev >= target ? 0 : denom > 0 ? Math.min(1, Math.max(0, (target - prev) / denom)) : 1
  // Segment-eindpunten liggen op leeftijd (fireAge−1) en fireAge → leeftijd = fireAge−1+t.
  return rows[fireIdx].leeftijd - 1 + t
}

/**
 * DRAWDOWN-grondslag (ADR 0030 / Optie B) — het RAUW besteedbare liquide vermogen =
 * som van alle assets die rauw onttrokken mogen worden (`mayBeRawWithdrawn`). Dit is
 * de pot waarop de afbouw-annuïteit teert en die de uitputtings-/verkoop-trigger
 * meet. Verschilt BEWUST van `liquidValue` (eligibility): de spendable+saleManaged
 * downsize-woning telt WÉL in `liquidValue` (FIRE-gate/opbouw) maar NIET hier — de
 * annuïteit kan het huis niet rauw opnemen, het verlaat de pot enkel via de verkoop.
 * Zo onttrekt de annuïteit op precies de pot die ze kàn aanspreken → geen stille
 * shortfall vóór de verkoop. Voor een include_full-woning (spendable, geen sale)
 * valt dit per constructie samen met `liquidValue` (het huis zit dan óók in
 * `mayBeRawWithdrawn`). Zie de orthogonale-eigenschappen-doc bovenaan.
 */
function withdrawableLiquidValue(assets: RunningAsset[]): number {
  return assets.filter((a) => mayBeRawWithdrawn(a)).reduce((s, a) => s + Math.max(0, a.value), 0)
}

/**
 * Waarde-gewogen reëel rendement van de RAUW besteedbare (`mayBeRawWithdrawn`)
 * portefeuille — de voet waarop `computeAnnuityBase` de afbouw discounteert. Deelt
 * exact de set van `withdrawableLiquidValue` zodat grondslag-bedrag én grondslag-
 * return op dezelfde pot rekenen (geen huis-return die de afbouw-voet vertekent
 * terwijl het huis niet rauw onttrokken kan worden).
 */
function withdrawableRealReturn(assets: RunningAsset[]): number {
  let val = 0
  let wr = 0
  for (const a of assets) {
    if (!mayBeRawWithdrawn(a)) continue
    const v = Math.max(0, a.value)
    val += v
    wr += v * a.realRet
  }
  return val > 0 ? wr / val : 0
}

/**
 * Onttrek `need` uit de assets in `orderIds`. Retourneert het ONBEDEKTE restant
 * (shortfall) — voorheen stil weggegooid; de on_demand-verkoop heeft het nodig om
 * te weten of er een niet-liquide asset verkocht moet worden.
 */
function withdrawFrom(
  assets: RunningAsset[],
  orderIds: string[],
  shortfall: 'sequentieel' | 'pro-rata',
  need: number,
  uitstroomById: Record<string, number>,
): number {
  if (need <= 0) return 0
  const values = snapshot(assets)
  const res = shortfall === 'pro-rata' ? withdrawProRata(values, orderIds, need) : withdrawSequential(values, orderIds, need)
  for (const [id, v] of Object.entries(res.taken)) {
    uitstroomById[id] = (uitstroomById[id] ?? 0) + v
    const a = assets.find((x) => x.id === id)
    if (a) a.value -= v
  }
  return res.shortfall
}

function liquidSumStart(input: UnifiedProjectionInput): number {
  const spendable = new Set(input.spendableAssetIds ?? [])
  let s = 0
  for (const a of input.assets) {
    if (a.is_active === false) continue
    if (NON_LIQUID.has(a.asset_type) && !spendable.has(a.id)) continue
    s += assetEngineValue(a)
  }
  s += input.bankAccountCash ?? 0
  // ADR 0029 (Optie B): de opeethypotheek-leen-ruimte telt als expliciete FIRE-
  // eligibility-BIJDRAGE (een BEDRAG, niet de spendable-boolean — reverse_mortgage
  // maakt slechts een FRACTIE van de woning eligible). De woning zelf is NIET
  // spendable (valt hierboven uit via NON_LIQUID) — we tellen alléén de leen-ruimte.
  for (const v of Object.values(input.collateralBorrowableById ?? {})) s += Math.max(0, v)
  return s
}

/**
 * Engine-startwaarde van een asset (FIRE-eligible grondslag) = `current_value ×
 * net_worth_inclusion_pct`. inclusion_pct is EIGENDOM (welk deel van het asset van
 * de gebruiker is) en geldt ALTIJD, voor elk asset, in elke strategie — exact
 * gelijk aan het elders getoonde netto vermogen. `include_full` is een
 * ORTHOGONALE as: die bepaalt uitsluitend de FIRE-BEHANDELING (telt het eigen
 * deel volledig als liquide/besteedbaar met zijn eigen reële return, zie de
 * `spendable`-vlag in buildAssets), NIET de eigendoms-grondslag. Een huis @
 * inclusion 50% krijgt dus engine-waarde `current_value × 50%`, óók onder
 * include_full. Gedeeld door buildAssets, liquidSumStart en
 * blendedRealReturnStart zodat alle drie op exact dezelfde grondslag rekenen.
 */
function assetEngineValue(
  a: { current_value?: number | null; net_worth_inclusion_pct?: number | null },
): number {
  return (a.current_value ?? 0) * ((a.net_worth_inclusion_pct ?? 100) / 100)
}

/**
 * Waarde-gewogen blended REËLE return van de FIRE-eligible/liquide startpot — exact
 * de set die `liquidSumStart` optelt (incl. een include_full-woning op haar
 * inclusion-gewogen engine-waarde met haar EIGEN return, en losse bankrekening-cash
 * @ 0%). Elk asset draagt zijn eigen reële
 * return (uit zijn eigen `expected_return`/`depreciation_rate`, + returnDelta),
 * gewogen op zijn besteedbare engine-waarde. Dit is de ENE voet die `backwardVnodig`
 * gebruikt (geen 0,6×). Mirrort de nominale-return-afleiding van `buildAssets` zodat
 * doel-lijn en drawdown byte-voor-byte hetzelfde rendement zien. Lege pot → 0.
 */
function blendedRealReturnStart(
  input: UnifiedProjectionInput,
  inflation: number,
  spendableIds: Set<string>,
): number {
  let val = 0
  let weighted = 0
  // Per-asset reële return — gedeeld door de asset-loop én de opeethypotheek-leen-
  // ruimte-bijdrage (die de HUIS-return als voet krijgt; ADR 0029).
  const assetRealReturn = (a: typeof input.assets[number]): number => {
    let nom = (a.expected_return ?? 0) / 100
    if (a.depreciation_rate && a.depreciation_rate > 0) nom = -(a.depreciation_rate / 100)
    nom += input.returnDeltaByAssetType?.[a.asset_type] ?? input.returnDelta ?? 0
    return realReturn(nom, inflation)
  }
  for (const a of input.assets) {
    if (a.is_active === false) continue
    if (NON_LIQUID.has(a.asset_type) && !spendableIds.has(a.id)) continue
    const v = assetEngineValue(a)
    if (v <= 0) continue
    // Nominale return — identiek aan buildAssets: depreciation overrulet, dan returnDelta.
    val += v
    weighted += v * assetRealReturn(a)
  }
  // Losse bankrekening-cash teert op 0% nominaal → reëel = realReturn(0, inflation).
  const cash = input.bankAccountCash ?? 0
  if (cash > 0) {
    val += cash
    weighted += cash * realReturn(0, inflation)
  }
  // ADR 0029: de opeethypotheek-leen-ruimte draagt bij met de HUIS-return als voet
  // (de leen-ruimte = overwaarde × maxLoanPct groeit met de woning). Zo delen
  // eligibility-meting en de woning-onderpand-grondslag één rendement.
  const borrowable = input.collateralBorrowableById
  if (borrowable) {
    const assetById = new Map(input.assets.map((a) => [a.id, a]))
    for (const [id, amt] of Object.entries(borrowable)) {
      if (amt <= 0) continue
      const a = assetById.get(id)
      const r = a ? assetRealReturn(a) : realReturn(0, inflation)
      val += amt
      weighted += amt * r
    }
  }
  return val > 0 ? weighted / val : 0
}

function allocateSurplus(
  valueById: Record<string, number>,
  surplus: number,
  opts: HorizonStrategyOptions,
  surplusTargets: string[],
  firstInvestId: string | undefined,
  firstCashId: string | undefined,
): Record<string, number> {
  if (surplus <= 0) return {}
  if (opts.surplus === 'vast') {
    const toBel = Math.min(opts.vastJaarbedrag, surplus)
    const rest = surplus - toBel
    const out: Record<string, number> = {}
    if (toBel > 0 && firstInvestId) out[firstInvestId] = toBel
    if (rest > 0 && firstCashId) out[firstCashId] = (out[firstCashId] ?? 0) + rest
    return out
  }
  // pro-rata / alles-beleggen / aflossen-eerst (restant) → naar de surplus-doelen
  // (default = investable; bij een pot-regel = de gekozen groep).
  return allocateProRata(valueById, surplusTargets, surplus)
}

/**
 * Terugkerende kasstromen voor een projectiejaar, als JAARbedrag in REËLE termen.
 *
 * `SimCashflow.amount` is voor recurring een MAANDbedrag (conventie van
 * `lifeEventsToCashflows`/`computeAowMonthly`; v1 `recurringYearly` doet × maanden).
 * Daarom × 12. In reële termen:
 *  - geïndexeerd (AOW, pensioen, huur): houdt koopkracht → **vlak reëel** (× 12);
 *  - niet-geïndexeerd: nominaal vlak → **erodeert** met inflatie t.o.v. nu.
 */
function activeRecurring(
  cashflows: SimCashflow[],
  age: number,
  inflation: number,
  startAge: number,
  werkt: boolean,
): { income: number; expense: number } {
  let income = 0
  let expense = 0
  for (const cf of cashflows) {
    if (cf.type !== 'recurring') continue
    if (age < cf.fromAge) continue
    if (cf.toAge != null && age >= cf.toAge) continue
    // Werk-gebonden flows (salaris-delta's van de Werk-strategie) volgen de
    // werk-stopgrens, net als het basissalaris — niet de onttrekkingsfase in.
    if (cf.onlyWhileWorking && !werkt) continue
    const realFactor = cf.indexed ? 1 : 1 / Math.pow(1 + inflation, Math.max(0, age - startAge))
    const jaarbedrag = cf.amount * 12 * realFactor
    if (cf.direction === 'income') income += jaarbedrag
    else expense += jaarbedrag
  }
  return { income, expense }
}

function oneTimeFlows(cashflows: SimCashflow[], age: number): { income: number; expense: number } {
  let income = 0
  let expense = 0
  for (const cf of cashflows) {
    if (cf.type !== 'one_time') continue
    if (Math.round(cf.fromAge) !== age) continue
    if (cf.portfolioPct != null) continue
    if (cf.direction === 'income') income += cf.amount
    else expense += cf.amount
  }
  return { income, expense }
}

function oneTimeShock(cashflows: SimCashflow[], age: number): number {
  let pct = 0
  for (const cf of cashflows) if (cf.type === 'one_time' && cf.portfolioPct != null && Math.round(cf.fromAge) === age) pct += cf.portfolioPct
  return pct
}

function collectEvents(cashflows: SimCashflow[], age: number): LedgerEvent[] {
  const out: LedgerEvent[] = []
  for (const cf of cashflows) {
    const hit = cf.type === 'one_time' ? Math.round(cf.fromAge) === age : age === cf.fromAge
    if (!hit) continue
    out.push({ id: cf.id, naam: cf.name, bedrag: cf.amount, richting: cf.direction })
  }
  return out
}

/**
 * Backward V_nodig (benodigd vermogen, dalend vanaf de eindleeftijd terug).
 *
 * Zuiver (Fase 1): de annuïteit-disconto `rOnttrek` is de WERKELIJKE waarde-gewogen
 * blended reële return van de FIRE-eligible startpot (doorgegeven door de caller via
 * `blendedRealReturnStart`) — exact het rendement waarop de onttrekking teert. Geen
 * 0,6×-factor meer: die introduceerde een verborgen buffer en een grondslag-mismatch
 * tussen doel-lijn en drawdown. Doel-lijn en drawdown delen nu één voet. De VPW-tak
 * gebruikt dezelfde voet.
 */
function backwardVnodig(
  rows: LedgerRow[],
  netNeed: number[],
  rOnttrek: number,
  strategy: string,
  legacyAmount: number,
  initialLiquide: number,
  withdrawalType: string,
): number[] {
  const n = rows.length
  const v = new Array<number>(n).fill(0)

  if (withdrawalType === 'vpw') {
    for (let i = 0; i < n; i++) {
      const remaining = rows[n - 1].leeftijd - rows[i].leeftijd + 1
      const pct = vpwPct(remaining, rOnttrek)
      v[i] = pct > 0 ? netNeed[i] / pct : 0
    }
    return v
  }

  let endVal = 0
  if (strategy === 'perpetual') endVal = initialLiquide
  else if (strategy === 'legacy') endVal = legacyAmount
  v[n - 1] = endVal
  for (let i = n - 2; i >= 0; i--) v[i] = (v[i + 1] + netNeed[i]) / (1 + rOnttrek)
  return v
}
