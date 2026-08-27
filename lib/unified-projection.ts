/**
 * Unified Projection — het CONSUMER-CONTRACT tussen de horizon-kernel en de UI.
 *
 * (FASE 6 stap 5A — na de v2-verwijdering.) Sinds de grootboek-engine (v2) weg is, is
 * dit module NIET langer een rekenmotor: het levert de gedeelde TYPES + mapping die de
 * kernel-bridge (`lib/horizon-kernel/bridge.ts#kernelToUnifiedResult`) en de consumenten
 * delen. WAT BLIJFT (en waarom):
 *  - `UnifiedProjectionInput` / `UnifiedProjectionRow` / `UnifiedProjectionResult` +
 *    `AssetBucketDetail` / `DebtBalanceDetail` — het rij-/resultaatcontract dat de bridge
 *    produceert en grafiek/tabel/freedomPct consumeren;
 *  - `AssetLiquidation` / `ReverseMortgagePlan` — nog door consumenten/types gerefereerd;
 *  - `toSimRow()` / `toSimResult()` — de backwards-compatible `SimResult`-mapping die elke
 *    kernel-consument draait.
 *
 * De per-jaar v2-rekenhelpers (asset-groei, Box 3-drag, heffingsvrij, schuld-amortisatie,
 * bucket-mapping) zijn met de engine mee verwijderd — dit bestand bevat geen rekenlogica meer.
 *
 * Pure types/mappers, geen Supabase dependency.
 */

import type { Asset, AssetType } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { SimCashflow, SimRow, SimResult } from '@/lib/fire-simulation'
import { type FireEndStrategy, type FireStrategyConfig } from '@/lib/fire-strategy'
import {
  type WithdrawalStrategyConfig,
} from '@/lib/withdrawal-strategy'
import type { Box3Method } from '@/lib/bucket-projection'

// ── Per-asset-type bucket detail ────────────────────────────────────────────

/** Per-asset-type financiele snapshot voor een enkel projectiejaar. */
export interface AssetBucketDetail {
  /** Waarde aan het begin van het jaar */
  startValue: number
  /** Rendement over het jaar (nominaal) */
  growth: number
  /** Bijdragen / besparingen dit jaar */
  contributions: number
  /** Box 3 belastingdrag dit jaar */
  box3Drag: number
  /** Waarde aan het einde van het jaar */
  endValue: number
}

// ── Per-schuld afbouwdetail ─────────────────────────────────────────────────

/** Per-schuld aflossingsdetail voor een enkel projectiejaar. */
export interface DebtBalanceDetail {
  /** Uitstaand saldo aan begin van het jaar */
  startBalance: number
  /** Betaalde rente dit jaar */
  interestPaid: number
  /** Afgeloste hoofdsom dit jaar */
  principalPaid: number
  /** Uitstaand saldo aan einde van het jaar */
  endBalance: number
}

// ── Read-only weergave-decomposities (kernel-bridge, spread-gated) ──────────

/**
 * Onttrekkings-behoefte-decompositie per jaarrij — **read-only WEERGAVEVELD**
 * (precedent feature #876), spread-gated door de kernel-bridge. Toont de
 * BEHOEFTE-kant (de ONGECAPTE Ont!D-termen) náást `row.withdrawal` (= de gecapte
 * Verdeling-eindtoewijzing). GEEN rekeninput, GEEN kern-wijziging.
 *
 * Bronformule — Ont!D per maand (`lib/horizon-kernel/tables/ont.ts:169-181`):
 *   `Ont!D = MAX(0, uitgaveTerm + Bez!BA − Bez!BB + CF!K − PT!K)` met
 *   `uitgaveTerm = (uitgaveNaPensioen/12)·inflatie-idx·Ont!I` (de profielfactor
 *   Ont!I grijpt ALLEEN op de uitgave-term; huur/hyplast/box3/partner ongefactord).
 *
 * **Sign-conventie:** elk term-veld is de RAUWE jaar-som van zijn kern-term (alle
 * ≥ 0). De reconciliatie past de Ont!D-tekens toe:
 *   `uitgaveTerm + huurNaVerkoop − vervallenHypotheeklast + box3 − partnerBijdrage
 *    + restMaandClamp === totaalNeed` (float-exact).
 * `restMaandClamp` (≥ 0) vangt de per-maand-`MAX(0,·)`-opwaartse correctie: in
 * "normale" maanden (inner ≥ 0) is hij 0 en tellen de vijf termen exact op tot
 * `totaalNeed`; in maanden waar partnerbijdrage/vervallen hypotheeklast de behoefte
 * onder 0 zouden duwen ligt `totaalNeed` (= Σ MAX(0,·)) boven de rauwe som en draagt
 * `restMaandClamp` het verschil. Zo kan de UI kassabon-gewijs sommeren.
 *
 * Aanwezig alléén wanneer `totaalNeed > 0` (post-FIRE behoefte-jaren), zodat de
 * rij-vorm in accumulatie-/nul-behoefte-jaren identiek blijft.
 */
export interface WithdrawalNeedBreakdown {
  /** Jaar-som geïndexeerde basisuitgave × profielfactor: Σ (uitgaveNaPensioen/12)·idx·Ont!I. */
  uitgaveTerm: number
  /** Jaar-som Bez!BA — huur/mnd na woningverkoop (verhoogt de behoefte). */
  huurNaVerkoop: number
  /** Jaar-som Bez!BB — vervallen hypotheeklast/mnd na verkoop (verlaagt de behoefte; afgetrokken). */
  vervallenHypotheeklast: number
  /** Jaar-som CF!K — Box 3-heffing-component in Ont!D (= Bel!N(m−1); verhoogt de behoefte). */
  box3: number
  /** Jaar-som PT!K — partner cashflow-bijdrage (verlaagt de behoefte; afgetrokken). */
  partnerBijdrage: number
  /** Jaar-som Ont!D = Σ MAX(0, per-maand-behoefte) — de ongecapte behoefte na de maand-clamp. */
  totaalNeed: number
  /**
   * `totaalNeed − (uitgaveTerm + huur − hyplast + box3 − partner)` (≥ 0). De
   * opwaartse correctie van de per-maand-`MAX(0,·)`; 0 in normale jaren. Maakt de
   * som-reconciliatie float-exact zodat de UI op de termen kan sommeren.
   */
  restMaandClamp: number
  /** `max(0, totaalNeed − row.withdrawal)` — het onttrekkings-tekort t.o.v. de gecapte realisatie (tekortjaren). */
  nietGedekt: number
}

/**
 * Bruto-inkomen-splitsing per jaarrij — **read-only WEERGAVEVELD**, spread-gated.
 * `row.grossIncome` = CF!D + CF!H gecombineerd; dit veld levert de twee bronnen
 * apart zodat consumenten de splitsing niet uit een heuristiek hoeven af te leiden.
 * Jaar-sommen over de in-horizon maanden; `salaris + gebeurtenisBaten ===
 * grossIncome` (float-exact — `grossIncome` wordt uit deze twee opgeteld). GEEN rekeninput.
 */
export interface GrossIncomeBySource {
  /** Jaar-som CF!D — netto-inkomen + partnerbijdrage + (FIRE-gegate) werk-delta. */
  salaris: number
  /** Jaar-som CF!H — gebeurtenis-baten (incl. AOW/pensioen uit de Geb-posten). */
  gebeurtenisBaten: number
}

/**
 * Box 1-relevante inkomensstromen per jaarrij — **read-only WEERGAVEVELD**,
 * spread-gated door de kernel-bridge (zelfde patroon als `withdrawalNeed` /
 * `grossIncomeBySource`). GEEN rekeninput, GEEN terugkoppeling in de cashflow:
 * de kernel is Excel-oracle-bewezen (ADR 0032) en blijft dat — Box 1 is een
 * RAPPORTAGELAAG NAAST de projectie, geen tabel erín.
 *
 * ## Waarom dit veld moet bestaan
 * `grossIncomeBySource.gebeurtenisBaten` (CF!H) is een MENGSEL waaruit de
 * Box 1-grondslag niet terug te winnen is:
 *  - **AOW** (Geb rij 14) komt daar **NETTO** binnen — `NL_AOW_MONTHLY`
 *    (lib/constants.ts) is het netto SVB-bedrag;
 *  - **pensioen** (Geb rij 15-20) komt daar **BRUTO** binnen en wordt in de
 *    kernel-cashflow **onbelast** geboekt.
 * Beide zitten in dezelfde som. Ze in een consument opnieuw uit het profiel
 * afleiden zou een tweede AOW-/pensioen-afleiding zijn — precies de drift die
 * ADR 0086 opruimde. Daarom levert de bridge de deelstromen apart, uit dezelfde
 * kernel-cellen die CF!H voedt.
 *
 * ## Grondslag per veld (ADR 0073: de grondslag zit in de naam)
 * Alle bedragen zijn **jaar-sommen over de in-horizon maanden van het blok** en
 * **NOMINAAL** (de kernel deflateert niet; deel door `row.inflationFactor` voor
 * koopkracht-nu). `aowNetto + pensioenUitkeringBruto ≤ grossIncomeBySource
 * .gebeurtenisBaten` — het zijn deelsommen van dezelfde CF!H-optelling (tot op
 * float-associativiteit gelijk aan hun aandeel daarin).
 *
 * Aanwezig alléén wanneer minstens één stroom ≠ 0, zodat de rij-vorm in jaren
 * zónder AOW/pensioen/partner identiek blijft.
 */
export interface Box1Streams {
  /**
   * Jaar-som Geb **rij 14** (AOW) × inflatie-index — **NETTO** binnengekomen.
   * Wie hier Box 1 over wil rekenen moet éérst terug naar bruto
   * (`grossFromNet`), want de heffing is op dit bedrag al ingehouden.
   */
  aowNetto: number
  /**
   * Jaar-som Geb **rij 15-20** (pensioen-multipot) × inflatie-index — **BRUTO**,
   * en in de kernel-cashflow onbelast geboekt. Over dít bedrag is nog geen
   * enkele euro Box 1 verrekend.
   */
  pensioenUitkeringBruto: number
  /**
   * Jaar-som van de Verdeling-eindtoewijzing op de kern-categorie **'Pensioen'**
   * — de daadwerkelijke onttrekking uit pensioen-potten (de "lever" van de
   * optimizer). BRUTO en onbelast geboekt, net als de uitkering hierboven.
   *
   * Bewust de KERN-categorie en niet `withdrawalByType`: die is op app-`AssetType`
   * gesleuteld en bundelt `retirement` + `levensverzekering` pas ná de
   * slot-meta-mapping (die in het fixture-pad ontbreekt).
   */
  pensioenOnttrekkingBruto: number
  /**
   * Jaar-som PT!K — partner-bijdrage (werk-/AOW-/pensioeninkomen van de partner),
   * **NETTO**. Staat hier UITSLUITEND zodat een Box 1-rapportage de partner
   * aantoonbaar en testbaar kan UITSLUITEN: Box 1 is per persoon en het
   * partner-inkomen wordt niet als bruto grootheid vastgehouden (ADR 0036), dus
   * elke partner-Box 1 zou verzonnen zijn. Niet gebruiken als heffingsgrondslag.
   */
  partnerBatenNetto: number
}

// ── Unified Projection Row ──────────────────────────────────────────────────

/**
 * Een enkele rij in de unified projectie — combineert per-asset-type rendement,
 * Box 3 per type, schuldaflossing per schuld, en fase-informatie.
 */
export interface UnifiedProjectionRow {
  /** Jaar-index (0 = huidig jaar) */
  year: number
  /** Leeftijd van de gebruiker in dit projectiejaar */
  age: number
  /** Fase van de simulatie */
  phase: 'accumulation' | 'transition' | 'withdrawal'

  // ── Per-asset-type detail ─────────────────────────────────
  /** Rendement en waardeontwikkeling per vermogenstype */
  assetBuckets: Partial<Record<AssetType, AssetBucketDetail>>

  // ── Per-schuld detail ─────────────────────────────────────
  /** Aflossingsvoortgang per schuld (key = debt.id) */
  debtBalances: Record<string, DebtBalanceDetail>

  // ── Aggregaten ────────────────────────────────────────────
  /** Totale waarde van alle assets */
  totalAssets: number
  /** Totale uitstaande schulden */
  totalDebts: number
  /** Netto vermogen (totalAssets - totalDebts) */
  netWorth: number
  /** Netto vermogen aan het BEGIN van het jaar (totalAssets - totalDebts vóór mutaties) */
  startNetWorth: number
  /**
   * Prognose!J op de blok-eindmaand: netto LIQUIDE vermogen (excl. niet-liquide bezit
   * zoals de eigen woning). Dezelfde grondslag als `requiredFirePortfolio`.
   *
   * GRONDSLAG-WAARSCHUWING: dit is NIET `netWorth`. `netWorth` (Prognose!I) telt het
   * niet-liquide bezit mee, `nettoLiquide` (Prognose!J) niet — meng ze nooit op één
   * Y-as of marker (CLAUDE.md-conventie). Gebruik dit veld voor "besteedbaar/liquide
   * vermogen" naast de FIRE-doellijn, die op dezelfde J-grondslag staat.
   */
  nettoLiquide: number

  // ── Kasstromen ────────────────────────────────────────────
  /**
   * Bruto inkomen dit jaar = CF!D (netto-inkomen + partnerbijdrage + FIRE-gegate
   * werk-delta) **+** CF!H (gebeurtenis-baten incl. AOW/pensioen) gecombineerd,
   * jaar-som over de in-horizon maanden. Consumenten die de twee bronnen apart
   * nodig hebben lezen `grossIncomeBySource` (i.p.v. een heuristiek), niet dit
   * gecombineerde totaal.
   */
  grossIncome: number
  /** Besparingen / inleg dit jaar */
  savings: number
  /** Onttrekking dit jaar (alleen in withdrawal fase) */
  withdrawal: number
  /** Onttrekking per asset type (waterfall breakdown) — alleen gevuld bij withdrawal > 0 */
  withdrawalByType: Partial<Record<AssetType, number>>
  /** Netto kasstroom uit recurring life events / extra cashflows */
  cashflowNet: number
  /** Netto eenmalige kasstromen dit jaar */
  oneTimeNet: number
  /** Totaal rendement over alle asset types */
  totalGrowth: number
  /**
   * Rendement over alleen de LIQUIDE bezittingen — `totalGrowth` minus het rendement
   * van de categorieën die de kern als niet-liquide vlagt (TS!H; vandaag uitsluitend
   * 'Eigen huis', en alléén bij een niet-meetellen-woonstrategie). Optioneel omdat
   * test-/preview-rijfabrieken het veld mogen weglaten; de kernel-bridge zet het altijd.
   *
   * GRONDSLAG-WAARSCHUWING (spiegel van `nettoLiquide` hierboven): dit is het deel van
   * het rendement dat daadwerkelijk BESTEEDBAAR is en dus als instroom in een
   * vermogensstromen-/kassabonweergave hoort. `totalGrowth` telt de waardestijging van
   * de eigen woning mee; die euro's duwen wél de vermogenslijn (Prognose!I) omhoog maar
   * zijn geen onttrekbaar inkomen — ze als "Rendement portfolio" tonen is een
   * weergave-dubbeltelling. Bij `include_full` is niets niet-liquide en geldt
   * `totalGrowthLiquide === totalGrowth` exact (net als J ≡ I).
   *
   * `toSimRow`/`SimRow.growth` blijven bewust op het TOTAAL staan: die voeden de
   * vermogens-/compositiegrafieken, die op de netWorth-grondslag (incl. woning) staan.
   */
  totalGrowthLiquide?: number
  /** Totale Box 3 belasting dit jaar (som van alle asset types) */
  totalBox3: number
  /** Cumulatieve Box 3 belasting tot en met dit jaar */
  cumulativeBox3: number

  // ── Inflatie ──────────────────────────────────────────────
  /** Inflatiefactor: (1 + inflationRate)^year, altijd >= 1.0 */
  inflationFactor: number

  // ── Opeethypotheek-weergavevelden (kernel-bridge, alléén in opeet-modus) ──
  /**
   * Jaarsom van de opeethypotheek-opnames (Bez!BE) — read-only WEERGAVEVELD,
   * gezet door de kernel-bridge en uitsluitend wanneer de woning-strategie
   * 'Opeethypotheek' is. Consument: `deriveOpeetLifespanFromRows`
   * (lib/horizon/kernel-strategy-moments.ts). Geen rekeninput.
   */
  opeetOpname?: number
  /**
   * Hoogste opeet-leenruimte-cap (Bez!BD) binnen het jaar — read-only
   * WEERGAVEVELD (zelfde bron/voorwaarde als `opeetOpname`). `> 0` betekent:
   * het opeet-venster is dit jaar actief; samen met `opeetOpname === 0` is dat
   * het uitputtingssignaal ("pot 0 ná start"). Geen rekeninput.
   */
  opeetCap?: number

  // ── Kassabon-decomposities (kernel-bridge, read-only weergave, spread-gated) ──
  /**
   * Onttrekkings-behoefte-decompositie — read-only WEERGAVEVELD, gezet door de
   * kernel-bridge en **alléén wanneer `totaalNeed > 0`** (post-FIRE behoefte-jaren),
   * zodat de rij-vorm in accumulatie-/nul-behoefte-jaren identiek blijft. Toont de
   * BEHOEFTE-kant náást de gecapte `withdrawal`. Zie `WithdrawalNeedBreakdown`.
   * Geen rekeninput.
   */
  withdrawalNeed?: WithdrawalNeedBreakdown
  /**
   * Bruto-inkomen-splitsing (CF!D vs CF!H) — read-only WEERGAVEVELD, gezet door de
   * kernel-bridge wanneer er inkomen is (`salaris !== 0 || gebeurtenisBaten !== 0`).
   * Zie `GrossIncomeBySource`. Geen rekeninput.
   */
  grossIncomeBySource?: GrossIncomeBySource
  /**
   * Box 1-relevante inkomensstromen (AOW netto / pensioen bruto / pensioen-
   * onttrekking bruto / partner netto) — read-only WEERGAVEVELD, gezet door de
   * kernel-bridge en **alléén wanneer minstens één stroom ≠ 0**. Zie
   * `Box1Streams`. Geen rekeninput, géén terugkoppeling in de cashflow.
   *
   * BEWUST GEEN `totalBox1`/`cumulativeBox1`/`cumulativeTotalTax` op deze rij:
   * de kernel berekent GEEN Box 1: zo'n veld zou suggereren van wel. Het
   * aggregaat leeft in `lib/tax-lifetime` (`LifetimeTaxSeries`), dat déze
   * stromen consumeert.
   */
  box1Streams?: Box1Streams
}

// ── Unified Projection Input ────────────────────────────────────────────────

/**
 * Gecombineerde invoer voor de unified projection engine.
 * Bevat alle data die zowel bucket-projection als fire-simulation nodig hebben.
 */
export interface UnifiedProjectionInput {
  // ── Vermogen & schulden ───────────────────────────────────
  /** Alle actieve assets van de gebruiker */
  assets: Asset[]
  /** Alle actieve schulden van de gebruiker */
  debts: Debt[]

  // ── Leeftijd & horizon ────────────────────────────────────
  /** Huidige leeftijd van de gebruiker */
  currentAge: number
  /** Eindleeftijd van de simulatie */
  endAge: number

  // ── Kasstromen ────────────────────────────────────────────
  /** Jaarlijkse uitgaven (bruto) */
  yearlyExpenses: number
  /** Jaarlijkse besparingen */
  annualSavings: number
  /** Maandelijks surplus (inkomen - uitgaven) uit transactieanalyse */
  monthlySurplus: number
  /** Bruto maandinkomen */
  monthlyIncome: number
  /** Jaarlijkse inkomensgroei (decimaal, bijv. 0.02) */
  incomeGrowthRate: number

  // ── Rendement & inflatie ──────────────────────────────────
  /** Bruto verwacht rendement als fallback (decimaal, bijv. 0.07) */
  grossReturn: number
  /** Inflatiepercentage (decimaal, bijv. 0.02) */
  inflationRate: number
  /**
   * Optionele rendement-delta in decimaal (bv. +0.02 = +2 pp). Wordt uniform
   * opgeteld bij elke asset-rendement (per-asset expected_return + delta) én
   * bij de fallback. Schulden (interest_rate) blijven onaangeroerd.
   * Default 0 = geen effect, identiek aan zonder delta.
   */
  returnDelta?: number
  /**
   * Per-asset-type rendement-delta (decimal). Wint van `returnDelta` voor
   * types die in de map staan; types die niet in de map staan vallen terug
   * op `returnDelta`. Maakt scenario's mogelijk waarin alleen 'investment'
   * +3 pp krijgt terwijl 'cash' onaangeroerd blijft.
   */
  returnDeltaByAssetType?: Record<string, number>

  // ── Box 3 ─────────────────────────────────────────────────
  /** Box 3 berekeningsmethode */
  box3Method: Box3Method

  // ── Life events & extra cashflows ─────────────────────────
  /** Externe kasstromen (AOW, pensioen, life events, etc.) */
  cashflows: SimCashflow[]

  // ── Strategie ─────────────────────────────────────────────
  /** FIRE eindstrategie configuratie */
  strategyConfig: FireStrategyConfig
  /** Onttrekkingsstrategie configuratie */
  withdrawalStrategy: WithdrawalStrategyConfig

  // ── Overig ────────────────────────────────────────────────
  /** Geforceerde FIRE-leeftijd (voor pensioen-modus) */
  forcedFireAge?: number
  /** Heeft de gebruiker een partner (voor Box 3 vrijstelling) */
  hasPartner: boolean

  // ── Bankrekeningen ────────────────────────────────────────
  /**
   * Totaal saldo van ontkoppelde bankrekeningen (niet gekoppeld aan assets).
   * Wordt als cash-bucket geïnjecteerd in de projectie zodat het startportfolio
   * overeenkomt met het netto vermogen op de kernpagina.
   */
  bankAccountCash?: number

  // ── Accumulation-only modus (voor Kern vermogensprognose) ───
  /**
   * Als true, wordt de binary search voor FIRE-leeftijd overgeslagen
   * en worden alleen accumulation-rijen gesimuleerd (geen decumulation).
   * Gebruikt voor de Kern vermogensprognose met een korte horizon (bijv. 20 jaar).
   */
  skipFireDetection?: boolean

  // ── Asset-liquidaties (v2 grootboek-engine; v1 negeert dit veld) ──
  /**
   * Geplande asset-liquidaties. Gebruikt door de horizon v2-grootboek-engine voor
   * de eigen-huis-downsize: op de trigger-leeftijd verkoopt de engine het asset
   * (binnen het grootboek) i.p.v. het huis uit de FIRE-pot te filteren en de
   * verkoop als eenmalig inkomen in te spuiten. Daardoor blijft het netto vermogen
   * continu (alleen −verkoopkosten) en verspringt alléén de liquiditeit. v1
   * (`runUnifiedProjection`) leest dit veld niet — daar blijft het filter+inkomen-
   * model gelden. Zie ADR 0015.
   */
  assetLiquidations?: AssetLiquidation[]

  /**
   * Asset-ids die normaal NIET-liquide zijn (bv. `eigen_huis`) maar voor déze
   * projectie tóch als besteedbaar/liquide FIRE-vermogen meetellen. Gebruikt door
   * de v2-grootboek-engine bij housing-strategie `include_full`: de woning telt dan
   * volledig mee in de besteedbare pot (zoals v1), zodat een spend-down/deplete 'm
   * óók afbouwt (laatst in de onttrekkingsvolgorde) en de lijn richting €0 loopt
   * i.p.v. dat de woning onbespeelbaar blijft groeien. v1 (`runUnifiedProjection`)
   * leest dit veld niet. Zie ADR 0015.
   */
  spendableAssetIds?: string[]

  /**
   * Opeethypotheek (reverse mortgage) — v2-grootboek (ADR 0029). Wanneer gezet opent
   * de engine op `triggerAge` een synthetische, aflossingsvrije schuld "Opeethypotheek"
   * tegen de woning (saldo start 0). Het maand-/jaar-tekort (ná de echte liquide pot
   * in de onttrekkingsvolgorde) wordt opgenomen als instroom naar liquide MÉT gelijke
   * verhoging van het opeetschuld-saldo; de rente stapelt op het saldo (blok-3-stijl
   * aflossingsvrij). De opname is per jaar gecapt op de LEEN-RUIMTE = overwaarde(jaar)
   * × maxLoanPct (geen oneindig lenen → resterend tekort onbedekt via de bestaande
   * shortfall-mechaniek). De woning blijft `eigen_huis`-asset in de ledger (groeit,
   * NIET spendable, NOOIT rauw onttrokken); de leen-ruimte telt apart mee als FIRE-
   * eligibility-bijdrage via `collateralBorrowableById`. v1 leest dit veld niet.
   */
  reverseMortgage?: ReverseMortgagePlan

  /**
   * Per-asset expliciete FIRE-eligibility-BIJDRAGE in euro's (ADR 0029, Optie B).
   * Optelling bovenop `liquidSumStart`/`blendedRealReturnStart`: het BEDRAG dat een
   * van nature niet-liquide, niet-spendable asset tóch als FIRE-eligible besteedbaar
   * laat meetellen ZÓNDER het asset rauw onttrekbaar of (volledig) spendable te maken.
   *
   * Gebruikt door de opeethypotheek: de woning zelf telt NIET als spendable (telt dus
   * niet voor zijn volle inclusion-waarde mee), maar de leen-RUIMTE (overwaarde ×
   * maxLoanPct, met de huis-return als voet) telt wél als eligibility-bijdrage —
   * eligibility-meting (`liquidSumStart`/`blendedRealReturnStart`/de FIRE-gate) en
   * drawdown (de opeetschuld-cap) delen daardoor één grondslag (`reverseMortgageBorrowable`).
   * v1 leest dit veld niet.
   */
  collateralBorrowableById?: Record<string, number>
}

/**
 * Opeethypotheek-plan voor de v2-grootboek-engine (ADR 0029). Pure-getal-vorm van
 * `ReverseMortgageConfig`, samengesteld in build-input zodat de engine geen
 * housing-strategy hoeft te importeren.
 */
export interface ReverseMortgagePlan {
  /** Asset-id van de woning waartegen geleend wordt (blijft `eigen_huis` in de ledger). */
  houseAssetId: string
  /** Leeftijd waarop de opeethypotheek opent (saldo 0). */
  triggerAge: number
  /** Jaarlijkse (nominale) rente op het opeetschuld-saldo (decimaal, bv. 0.055). */
  interestRate: number
  /** Max % van de overwaarde dat als lening kan worden opgenomen (cap-fractie, bv. 0.50). */
  maxLoanPct: number
  /**
   * Vaste maand-uitkering (euro). null = tekort-gedreven: de engine neemt jaarlijks
   * precies het liquiditeitstekort op (gecapt op de leen-ruimte). Bij een vast bedrag
   * stroomt jaarlijks `monthlyPayout × 12` in (eveneens gecapt op de leen-ruimte).
   */
  monthlyPayout: number | null
  /** Debt-id's van bestaande hypotheken op deze woning — voor de overwaarde-berekening (overwaarde = huiswaarde − Σ saldo). */
  mortgageDebtIds: string[]
}

/**
 * Eén geplande asset-liquidatie voor de v2-grootboek-engine. De engine verkoopt
 * `assetId`: opbrengst = waarde × `salePricePct` × (1 − `salesCostsPct`); de
 * gekoppelde schulden (`payoffDebtIds`) worden afgelost (saldo → 0, woonlast stopt);
 * de netto-opbrengst (na aflossing) stroomt naar het liquide vermogen.
 *
 * De `trigger` bepaalt WANNEER:
 *  - `fixed_age` — verkoop onvoorwaardelijk op de vaste `age` (huidig gedrag; o.a.
 *    de eigen-huis-downsize op de trigger-leeftijd, en `vast_moment`-verkopen).
 *  - `on_demand` — géén vaste `age`; de engine verkoopt het asset IN de loop zodra de
 *    liquide pot een tekort niet meer dekt (Optie A, ADR 0020). De optionele `age`
 *    fungeert dan als fallback-plafond: uiterlijk op die leeftijd verkopen, ook
 *    zónder tekort (NaN/Infinity = geen plafond). De verkoopvolgorde bij meerdere
 *    `on_demand`-assets volgt de bestaande onttrekkingsvolgorde (minst-liquide laatst,
 *    `eigen_huis` allerlaatst). v1 (`runUnifiedProjection`) leest dit veld niet.
 */
export interface AssetLiquidation {
  /** Asset dat verkocht wordt (bv. het eigen_huis). */
  assetId: string
  /**
   * Bij `fixed_age`: de leeftijd waarop onvoorwaardelijk verkocht wordt.
   * Bij `on_demand`: een optioneel fallback-plafond (uiterlijk-verkoopleeftijd);
   * gebruik `Number.POSITIVE_INFINITY` (of `NaN`) voor "geen plafond".
   */
  age: number
  /**
   * Verkoopmoment-discriminator. `fixed_age` = vaste leeftijd (default voor
   * achterwaartse compatibiliteit met bestaande callers die `trigger` weglaten).
   * `on_demand` = in-loop verkoop bij liquiditeitstekort.
   */
  trigger?: 'fixed_age' | 'on_demand'
  /** Verkoopprijs als fractie van de (geprojecteerde) marktwaarde (bv. 1.0). */
  salePricePct: number
  /** Verkoopkosten als fractie van de verkoopprijs (bv. 0.04). */
  salesCostsPct: number
  /** Gekoppelde schulden die met de opbrengst worden afgelost. */
  payoffDebtIds: string[]
}

// ── Unified Projection Result ───────────────────────────────────────────────

/**
 * Resultaat van de unified projection engine.
 * Backwards-compatible met bestaand SimResult via toSimResult().
 */
export interface UnifiedProjectionResult {
  /** Alle projectierijen */
  rows: UnifiedProjectionRow[]

  // ── FIRE uitkomsten (compatibel met SimResult) ────────────
  /** Berekende FIRE-leeftijd als geheel getal (null als niet bereikbaar) */
  fireAge: number | null
  /** Fractionele FIRE-leeftijd met sub-jaar precisie (bijv. 52.3) */
  fireAgeFractional: number | null
  /** Of FIRE bereikbaar is binnen de eindhorizon */
  fireReachable: boolean
  /** Portfoliowaarde op het moment van FIRE */
  firePortfolioAtFire: number
  /** Minimaal benodigde portfolio bij FIRE (LIQUIDE, excl. eigen woning = Prognose!J@FIRE) */
  requiredFirePortfolio: number
  /**
   * FIRE-doel INCL. eigen woning = TOTAAL netto vermogen bij FIRE (Prognose!I@FIRE,
   * nominaal). Spiegelt `requiredFirePortfolio` (liquide); puur doorgeleid, parity-gedekt
   * summary-veld uit de horizon-kernel-bridge — géén eigen berekening. Optioneel/additief:
   * stub-/mock-/preview-resultaten die dit veld niet zetten blijven geldig. In het echte
   * kernel-pad altijd gevuld en ≥ `requiredFirePortfolio` (overwaarde ≥ 0).
   */
  requiredFireNetWorth?: number
  /**
   * `true` ⇒ `requiredFirePortfolio`/`requiredFireNetWorth` komen NIET van een echt
   * FIRE-moment maar van de geprojecteerde EINDSTAND op de horizon (leeftijd ~100) —
   * een andere grootheid dan "benodigd vermogen". Bij een structureel tekort is die
   * stand negatief. Weergave-oppervlakken tonen dan een gegevensmelding i.p.v. een
   * bedrag (bevinding M6; guard in `lib/horizon/outcome-guard.ts`). Optioneel/additief:
   * stub-/mock-/preview-resultaten die het veld niet zetten blijven geldig.
   */
  requiredFireIsEndOfHorizonFallback?: boolean
  /** Impliciete onttrekkingsratio (jaarlijkse uitgaven / benodigde portfolio) */
  implicitWithdrawalRate: number
  /** Gebruikte eindstrategie */
  strategy: FireEndStrategy
  /** Doel-eindvermogen (0 voor deplete, legacy bedrag, 0 voor perpetual) */
  targetEndPortfolio: number
  /** Effectieve eindleeftijd voor weergave (grafiek x-as) */
  displayEndAge: number
}

// ── Backwards-compatible mapping functies ────────────────────────────────────

/**
 * Converteer een UnifiedProjectionRow naar een legacy SimRow.
 *
 * Alle bestaande SimRow velden zijn afleidbaar uit de UnifiedProjectionRow:
 * - startPortfolio → startNetWorth (netto vermogen begin van jaar)
 * - growth → totalGrowth
 * - savings → savings
 * - withdrawal → withdrawal
 * - cashflowNet → cashflowNet
 * - endPortfolio → netWorth (netto vermogen einde van jaar)
 * - grossIncome → grossIncome
 * - grossExpenses → yearlyExpenses afgeleid uit withdrawal + savings context
 * - phase → 'accumulation' | 'retirement' (transition → accumulation voor legacy)
 * - age → age
 */
export function toSimRow(row: UnifiedProjectionRow): SimRow {
  const legacyPhase: 'accumulation' | 'retirement' =
    row.phase === 'withdrawal' ? 'retirement' : 'accumulation'

  const grossExpenses = row.phase === 'withdrawal'
    ? row.withdrawal + row.savings
    : row.grossIncome - row.savings - row.cashflowNet - row.oneTimeNet

  // Vermogensstromen: flows to/from net worth
  // Bruto rendement = netto rendement + Box 3 (totalGrowth is already net of box3)
  //
  // GRONDSLAG: `flowIn`/`flowOut` zijn STROMEN-velden (besteedbare in-/uitstroom),
  // geen compositievelden. Ze voeden de IE-grafiek in 'Lijnen'-modus (de default),
  // de wat-als-pagina en het surplus-gap-widget/-chart — alle drie tonen "wat komt
  // er binnen". De waardestijging van een niet-liquide eigen woning komt daar NIET
  // binnen: die euro's zijn niet onttrekbaar. Daarom telt de instroom het
  // BESTEEDBARE rendement (`totalGrowthLiquide`), met terugval op `totalGrowth` voor
  // rijen zonder het veld (bij woonstrategie 'Meerekenen' zijn ze gelijk).
  // `SimRow.growth` hieronder blijft BEWUST het totaal — dat is het
  // vermogens-/compositieveld op de netWorth-grondslag (incl. woning).
  // NB: de UITSTROOMKANT blijft bewust op kasbasis — `totalDebtInterest`
  // sommeert álle schuldrente, óók die van de eigen-woninghypotheek (rente is
  // echte kasuitstroom, waardestijging geen kasinstroom). `flowIn − flowOut` is
  // daarmee géén spiegel van `nettoLiquide` en van geen enkele
  // vermogensgrootheid de delta — puur een stromenbeeld.
  // Er is geen reconciliatie-invariant tussen flowIn/flowOut en netWorth die dit
  // breekt (geverifieerd: geen consument leidt eindvermogen uit flowIn af).
  const grossGrowth = (row.totalGrowthLiquide ?? row.totalGrowth) + row.totalBox3
  // Totale schuldrente
  let totalDebtInterest = 0
  for (const detail of Object.values(row.debtBalances)) {
    totalDebtInterest += detail.interestPaid
  }
  // Positieve/negatieve cashflows splitsen
  const cfPositive = Math.max(0, row.cashflowNet) + Math.max(0, row.oneTimeNet)
  const cfNegative = Math.abs(Math.min(0, row.cashflowNet)) + Math.abs(Math.min(0, row.oneTimeNet))

  const flowIn = (legacyPhase === 'accumulation' ? Math.max(0, row.savings) : 0)
    + Math.max(0, grossGrowth)
    + cfPositive
  const flowOut = row.totalBox3
    + totalDebtInterest
    + (legacyPhase === 'retirement' ? row.withdrawal : 0)
    + cfNegative

  return {
    age: row.age,
    phase: legacyPhase,
    startPortfolio: row.startNetWorth,
    growth: row.totalGrowth,
    savings: row.savings,
    withdrawal: row.withdrawal,
    cashflowNet: row.cashflowNet,
    oneTimeNet: row.oneTimeNet,
    endPortfolio: row.netWorth,
    grossIncome: row.grossIncome,
    grossExpenses,
    flowIn: Math.round(flowIn),
    flowOut: Math.round(flowOut),
  }
}

/**
 * Converteer een UnifiedProjectionResult naar een legacy SimResult.
 *
 * Alle SimResult velden worden direct overgenomen; alleen de rows
 * worden via toSimRow() geconverteerd. classic25xTarget wordt berekend
 * vanuit de implicitWithdrawalRate en requiredFirePortfolio.
 */
export function toSimResult(result: UnifiedProjectionResult): SimResult {
  // Bereken classic25xTarget: als we requiredFirePortfolio en implicitWithdrawalRate hebben,
  // dan yearlyExpenses = requiredFirePortfolio × implicitWithdrawalRate
  const yearlyExpenses = result.requiredFirePortfolio > 0 && result.implicitWithdrawalRate > 0
    ? Math.round(result.requiredFirePortfolio * result.implicitWithdrawalRate)
    : 0
  const classic25xTarget = Math.round(yearlyExpenses * 25)

  return {
    rows: result.rows.map(toSimRow),
    fireAge: result.fireAge,
    fireAgeFractional: result.fireAgeFractional,
    firePortfolioAtFire: result.firePortfolioAtFire,
    requiredFirePortfolio: result.requiredFirePortfolio,
    requiredFireNetWorth: result.requiredFireNetWorth,
    requiredFireIsEndOfHorizonFallback: result.requiredFireIsEndOfHorizonFallback,
    fireReachable: result.fireReachable,
    implicitWithdrawalRate: result.implicitWithdrawalRate,
    classic25xTarget,
    strategy: result.strategy,
    targetEndPortfolio: result.targetEndPortfolio,
    displayEndAge: result.displayEndAge,
  }
}
