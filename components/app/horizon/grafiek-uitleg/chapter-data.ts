/**
 * chapter-data.ts — PURE afleidingen voor de "Zo werkt jouw grafiek"-walkthrough.
 *
 * Géén Supabase, géén herberekening van kerngetallen. Alléén aggregatie van wat
 * al in `SimResult.rows` / `SimResult` zit, zodat de 4 hoofdstukken hun eigen
 * getallen kunnen tonen. Consume, don't recompute (CLAUDE.md).
 *
 * Alle bedragen blijven nominaal zoals de engine ze levert; de UI doet de
 * vrijheidstijd-framing via lib/format.ts.
 */

import type { SimResult, SimRow, SimCashflow } from '@/lib/fire-simulation'
import type { FireEndStrategy } from '@/lib/fire-strategy'
import {
  ankerGrafiekZin,
  ankerReachFromSim,
  ankerStopFromSim,
  ankerZin,
  type AnkerReach,
  type AnkerStop,
} from '@/lib/horizon/anker-copy'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'

/**
 * GEVERIFIEERDE SCHAAL-SEMANTIEK (zie toSimRow + runUnifiedProjection):
 *
 * - `SimRow.savings`     = JAARLIJKS bedrag (indexedSavings = annualSavings × (1+infl)^jaar).
 *                          De OUDE runSimulation zette ook savings = annualSavings (jaarlijks).
 *                          ⇒ Σ savings over opbouwjaren = totale eigen inleg, ZONDER ×12.
 * - `SimRow.growth`      = JAARLIJKS rendementsbedrag (netto na Box 3). Σ = totaal rendement.
 * - `SimRow.withdrawal`  = JAARLIJKSE onttrekking.
 * - `SimRow.endPortfolio`= netto vermogen aan het EIND van het jaar.
 * - `SimRow.incomeBreakdown`/`expenseBreakdown` = UNDEFINED in productie (toSimRow vult ze
 *   niet) — bewust NIET gebruikt.
 *
 * LET OP: `OpbouwData.yearlyInleg` neemt `SimRow.savings` van de eerste opbouwrij ÉÉN-OP-ÉÉN
 * over (géén ×12) — savings is al een jaarbedrag. Daardoor reconcilieert yearlyInleg met de
 * jaarlijkse termen van `cumulativeContributions` (= Σ savings, óók jaarlijks).
 *
 * SimRow-fase ⇄ unified-fase (toSimRow, unified-projection.ts:808-810):
 *   unified 'accumulation' én 'transition'  → SimRow 'accumulation'
 *   unified 'withdrawal'                     → SimRow 'retirement'
 * Een TRANSITION-rij (FIRE → AOW) onttrekt al uit het vermogen (withdrawal > 0) maar valt in
 * SimRow onder 'accumulation'. Daarom:
 *   - de eerste ECHTE onttrekking is `rows.find(r => r.withdrawal > 0)`, NIET retirementRows[0];
 *   - de vrije jaren beginnen op het FIRE-moment (transition + withdrawal), niet pas op AOW;
 *   - de "opbouwfase" voor groei/aflossing = unified `phase !== 'withdrawal'` (incl. transition),
 *     zodat de per-asset-aggregaten reconciliëren met cumulativeGrowth over SimRow-accumulation.
 *
 * UnifiedProjectionRow-velden die v1 (runUnifiedProjection → toSimResult) ÉCHT vult en die
 * we hier consumeren: assetBuckets{startValue,growth,contributions,box3Drag,endValue},
 * debtBalances{startBalance,interestPaid,principalPaid,endBalance}, withdrawalByType (alleen
 * decumulation-rijen met withdrawal>0), cumulativeBox3, inflationFactor. De `unifiedRows`-
 * param is OPTIONEEL: zonder rows blijven de unifiedRows-only velden `undefined`.
 */

/** Hoofdstuk 1 — Opbouw. */
export interface OpbouwData {
  /** Startvermogen = vermogen vandaag (rows[0].startPortfolio). */
  startPortfolio: number
  /** Representatieve jaarlijkse inleg (eerste opbouwrij). SimRow.savings is al een jaarbedrag — géén ×12. */
  yearlyInleg: number
  /** Gemiddelde jaarlijkse groei (rendement) over de opbouwjaren. */
  averageGrowth: number
  /** Aantal opbouwjaren. */
  opbouwjaren: number
  /** Vermogen aan het einde van de opbouwfase (= vermogen op FIRE-moment, indien bereikbaar). */
  endOfAccumulation: number
  /**
   * Totaal wat de gebruiker over de opbouwfase zélf inlegt (Σ SimRow.savings over de
   * accumulation-rijen, JAARLIJKS — géén ×12). 0 bij 0 opbouwjaren.
   */
  cumulativeContributions: number
  /**
   * Totaal rendement dat het vermogen over de opbouwfase verdient (Σ SimRow.growth over de
   * accumulation-rijen). 0 bij 0 opbouwjaren.
   *
   * GRONDSLAG (bewust TOTAAL, niet liquide): `SimRow.growth` = `totalGrowth`, dus
   * inclusief de waardestijging van een niet-liquide eigen woning. Dat is hier
   * correct: dit hoofdstuk vertelt het verhaal van de VERMOGENSLIJN (netWorth /
   * Prognose!I, óók incl. woning) — "wat je vermogen verdiende". Het besteedbare
   * tegendeel (`UnifiedProjectionRow.totalGrowthLiquide`) hoort in de
   * vermogensSTROMEN-weergaven (IE-strip, Sankey, jaar-detailkassabon), niet hier;
   * die twee mengen zou de som van dit hoofdstuk laten afwijken van de lijn erboven.
   */
  cumulativeGrowth: number
  /**
   * Per vermogenstype de gesommeerde groei over de opbouwfase, aflopend gesorteerd
   * (top-bijdragers eerst). Vereist `unifiedRows`; `undefined` als die ontbreken.
   */
  assetTypeGrowth?: { type: string; growth: number }[]
  /**
   * Totaal afgeloste hoofdsom over de opbouwfase ("vrijheid die je terugkoopt").
   * Vereist `unifiedRows` én een schuld met aflossing; `undefined` als geen schuld/rows.
   */
  debtPrincipalPaidDuringAccumulation?: number
}

/** Hoofdstuk 2 — Terugrekening (benodigd vermogen / V_nodig). */
export interface TerugrekeningData {
  /** Ankerbedrag: het door de simulatie berekende benodigd vermogen. */
  requiredFirePortfolio: number
  /**
   * M6: `true` ⇒ `requiredFirePortfolio` komt NIET van een echt FIRE-moment maar
   * van de geprojecteerde eindstand op de horizon (leeftijd ~100) — een andere
   * grootheid dan "benodigd vermogen". Doorgeleid uit
   * `SimResult.requiredFireIsEndOfHorizonFallback` zodat dit hoofdstuk dezelfde
   * `guardFireTarget`-invoer heeft als de KPI-tegel en de sim-widget; zonder dit
   * veld toonde de walkthrough een bedrag terwijl de tegel op dezelfde pagina
   * "We missen gegevens" zei.
   */
  requiredFireIsEndOfHorizonFallback: boolean
  /** Klassiek 25× doel ter vergelijking (4%-regel). De UI verbergt de WEERGAVE; het veld blijft. */
  classic25xTarget: number
  /** Of er periodieke inkomstenbodem (AOW/pensioen) meespeelt — dan daalt V_nodig sterker. */
  hasIncomeFloor: boolean
  /**
   * Som van de terugkerende INKOMEN-kasstromen (AOW/pensioen) op MAANDBASIS die het benodigd
   * vermogen verlagen. `undefined` als er geen inkomensbodem is. Consume-only: somt de
   * `amount` (maandbedrag) van recurring income-cashflows, géén herberekening.
   */
  incomeFloorMonthly?: number
  /**
   * Inflatiefactor op (of nabij) het FIRE-moment uit `unifiedRows`, voor de "reëel vs nominaal"-
   * uitleg. Vereist `unifiedRows` (en, voor het juiste jaar, een bekende FIRE-leeftijd);
   * `undefined` als niet beschikbaar.
   */
  inflationFactorAtFire?: number
}

/** Hoofdstuk 3 — Snijpunt = vrijheid. */
export interface SnijpuntData {
  /** Of FIRE bereikbaar is binnen de projectie. */
  reachable: boolean
  /** Fractionele vrijheidsleeftijd (bv. 52.7) — null als niet bereikbaar. */
  fireAgeFractional: number | null
  /** Vermogen op het FIRE-moment. */
  firePortfolioAtFire: number
  /** Impliciete opnamerate op het FIRE-moment. */
  implicitWithdrawalRate: number
  /** Strategie-bewuste eerlijke tekst wanneer niet bereikbaar. */
  unreachableMessage: string | null
  /** Huidige leeftijd (rows[0].age), voor "over X jaar"-framing. 0 bij lege rows. */
  currentAge: number
  /**
   * ADR 0129 — het stopmoment ligt VAST (aow/now/age, `SimResult.stopAnker`). Dan is
   * `fireAgeFractional` het gekozen stopmoment en geen vrijheidsleeftijd, en is de
   * impliciete opnamerate op dat punt betekenisloos (bevinding 6) — de walkthrough
   * laat die rij dan weg en noemt het punt "Stopmoment".
   */
  ankerVast: boolean
  /** Het bereik onder een vast anker (uit dezelfde run); `undefined` onder `solved`. */
  ankerReach?: AnkerReach
  /** Het stopmoment bij `ankerReach` ("nu" / "op 58,5"); `undefined` onder `solved`. */
  ankerStop?: AnkerStop
  /**
   * Aantal jaren vanaf nu tot vrijheid: round(fireAgeFractional − currentAge). `undefined`
   * als FIRE niet bereikbaar is.
   */
  yearsFromNow?: number
}

/** Één impact-marker (AOW/pensioen of levensgebeurtenis) in de onttrekkingsfase. */
export interface OnttrekkingImpact {
  id: string
  label: string
  direction: 'income' | 'expense'
  type: 'recurring' | 'one_time'
  /** Maandbedrag (recurring) of eenmalig bedrag (one_time), altijd positief. */
  amount: number
  fromAge: number
  toAge: number | null
}

/** Hoofdstuk 4 — Onttrekking. */
export interface OnttrekkingData {
  strategy: FireEndStrategy
  /**
   * Aantal vrije jaren vanaf het FIRE-moment t/m het eind van de projectie: ALLE rijen met
   * `age >= fireAge` (transition + withdrawal). 0 als FIRE niet bereikbaar is. Voor perpetual
   * zijn dit de behoudjaren; voor deplete/legacy/pensioen de onttrekkingsjaren.
   */
  withdrawalYears: number
  /** Display-eindleeftijd van de projectie. */
  displayEndAge: number
  /** Doel-eindvermogen (legacy/pensioen) — 0 voor deplete/perpetual. */
  targetEndPortfolio: number
  /** Impact-markers (AOW/pensioen + levensgebeurtenissen) die de opname beïnvloeden. */
  impacts: OnttrekkingImpact[]
  /** Strategie-afhankelijke afsluitende zin. */
  closingSentence: string
  /**
   * Opname in het eerste vrijheidsjaar: de eerste rij die daadwerkelijk onttrekt
   * (`rows.find(r => r.withdrawal > 0)`). Dat is de transition-fase (FIRE → AOW), die in SimRow
   * onder 'accumulation' valt — NIET retirementRows[0] (= pas de withdrawal-fase op AOW).
   * `undefined` als geen enkele rij onttrekt óf de strategie feitelijk niet onttrekt (perpetual).
   */
  firstYearWithdrawal?: number
  /** Restvermogen aan het eind van de projectie (rows[laatste].endPortfolio). 0 bij lege rows. */
  endPortfolio: number
  /**
   * Volgorde van potten die daadwerkelijk worden aangesproken tijdens de onttrekking
   * (cash → spaargeld → beleggingen → …), alleen potten met >0 onttrekking, eerste-keer-volgorde.
   * Vereist `unifiedRows`; `undefined` als die ontbreken of er niets onttrokken wordt.
   */
  withdrawalOrder?: string[]
  /**
   * Totale Box 3-belastingdruk over de horizon (cumulativeBox3 van de laatste unifiedRow).
   * Vereist `unifiedRows`; `undefined` als die ontbreken.
   */
  totalBox3?: number
}

export interface ChapterData {
  opbouw: OpbouwData
  terugrekening: TerugrekeningData
  snijpunt: SnijpuntData
  onttrekking: OnttrekkingData
}

// ── Helpers ────────────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * Eerlijke, strategie-bewuste tekst wanneer FIRE niet bereikbaar is.
 * Spiegelt de bestaande copy in sim-chart-widget.tsx (regel ~506-517).
 */
export function unreachableMessageFor(
  strategy: FireEndStrategy,
  displayEndAge: number,
  reach?: AnkerReach,
  stop?: AnkerStop,
): string {
  // ADR 0129 — onder ÉLK vast anker (aow/now/age) valt er niets "niet te halen": het
  // stopmoment ligt vast; de enige uitspraak is hoe ver het liquide vermogen reikt.
  // Geen aansporing ("verhoog je spaarquote"), geen AOW in de zin.
  if (reach != null) return ankerZin(reach, stop ?? { kind: 'now' })
  switch (strategy) {
    case 'legacy':
      return `Je haalt je nalatenschapsdoel niet binnen je projectie (tot leeftijd ${displayEndAge}). Verlaag het nalatenschapsbedrag, verhoog je spaarquote of verlaag je uitgaven.`
    case 'perpetual':
      return `Je vermogen is niet groot genoeg om er blijvend van te leven binnen je projectie (tot leeftijd ${displayEndAge}). Verhoog je spaarquote of verlaag je uitgaven.`
    case 'pensioen':
      return `Je haalt je doel niet binnen je projectie (tot leeftijd ${displayEndAge}). Verhoog je spaarquote of verlaag je uitgaven.`
    // Legacy-label (F4 verwijdert 'm): zonder bereik-invoer de kale beschrijving.
    case 'nu-stoppen':
      return `Je liquide vermogen reikt niet tot je ${displayEndAge}e als je nu stopt.`
    case 'deplete':
    default:
      return `Vrijheid niet haalbaar binnen je projectie (tot leeftijd ${displayEndAge}). Verhoog je spaarquote of verlaag je uitgaven.`
  }
}

/**
 * Strategie-bewuste leek-zin (lead) voor het onttrekking-hoofdstuk (h4).
 *
 * `perpetual` teert niet in — het rendement draagt de uitgaven, het vermogen
 * blijft op peil. De overige strategieën (`deplete`/`legacy`/`pensioen`)
 * onttrekken wél uit het vermogen, dus voor die houden we de onttrekking-tekst
 * aan. Pure functie zodat de wording testbaar blijft (spiegelt closingSentenceFor).
 */
export function leadSentenceForWithdrawal(strategy: FireEndStrategy): string {
  switch (strategy) {
    case 'perpetual':
      return 'Je vermogen blijft op peil — het rendement draagt je uitgaven, je teert niet in. Inkomsten als AOW of pensioen verlichten dat verder.'
    // ADR 0127 — 'Nu stoppen': de onttrekking begint niet "daarna" maar vandaag.
    // De default-tak beloofde hier een toekomstig omslagpunt dat er niet is.
    case 'nu-stoppen':
      return 'Je onttrekt vanaf vandaag: je inkomen uit werk valt weg en je uitgaven komen uit je vermogen. Inkomsten als AOW of pensioen verlagen die opname later.'
    case 'deplete':
    case 'legacy':
    case 'pensioen':
    default:
      return 'Daarna leeft je vermogen mee met je keuzes: je onttrekt wat je nodig hebt, en inkomsten als AOW of pensioen verlagen die opname.'
  }
}

/** Strategie-afhankelijke afsluitende zin voor het onttrekking-hoofdstuk. */
export function closingSentenceFor(
  strategy: FireEndStrategy,
  displayEndAge: number,
  targetEndPortfolio: number,
  reach?: AnkerReach,
  stop?: AnkerStop,
): string {
  // ADR 0129 — onder een vast anker volgt de afsluiting het BEREIK (uit de run), niet
  // de eind-vorm-belofte: het geld kan ook vóór de eindleeftijd op zijn.
  if (reach != null) return ankerGrafiekZin(reach, stop ?? { kind: 'now' })
  switch (strategy) {
    case 'perpetual':
      return 'Je leeft alleen van het rendement, zodat je koopkracht behouden blijft — je vermogen raakt nooit op.'
    case 'legacy':
      return `Je houdt bewust vermogen over: een nalatenschap van zo'n ${Math.round(targetEndPortfolio).toLocaleString('nl-NL')} euro op leeftijd ${displayEndAge}.`
    case 'pensioen':
      return targetEndPortfolio > 0
        ? `Je onttrekt een vast bedrag; wat overblijft (zo'n ${Math.round(targetEndPortfolio).toLocaleString('nl-NL')} euro op leeftijd ${displayEndAge}) is je nalatenschap.`
        : `Je onttrekt een vast bedrag op basis van je ingestelde jaarbudget tot leeftijd ${displayEndAge}.`
    // Legacy-label (F4 verwijdert 'm): zonder bereik-invoer de 'onbekend'-zin.
    case 'nu-stoppen':
      return ankerGrafiekZin({ kind: 'onbekend' }, { kind: 'now' })
    case 'deplete':
    default:
      return `Je bouwt je vermogen rustig af naar nul rond leeftijd ${displayEndAge} — precies genoeg voor de rest van je leven.`
  }
}

/**
 * Bouwt de impact-markers (AOW/pensioen + levensgebeurtenissen) die in de
 * onttrekkingsfase spelen. We tonen alleen kasstromen die ná de FIRE-leeftijd
 * actief zijn (of doorlopen), zodat de lijst over de onttrekkingsfase gaat.
 */
function buildImpacts(
  cashflows: SimCashflow[],
  fireAge: number | null,
  displayEndAge: number,
): OnttrekkingImpact[] {
  const cutoff = fireAge ?? 0
  return cashflows
    .filter(cf => {
      // recurring: actief als het bereik de onttrekkingsfase raakt
      if (cf.type === 'recurring') {
        const end = cf.toAge ?? displayEndAge
        return end >= cutoff
      }
      // one_time: na (of op) de FIRE-leeftijd
      return cf.fromAge >= cutoff
    })
    .map(cf => ({
      id: cf.id,
      label: cf.id === 'aow-prefill' ? 'AOW (staatspensioen)' : cf.name,
      direction: cf.direction,
      type: cf.type,
      amount: cf.amount,
      fromAge: cf.fromAge,
      toAge: cf.toAge,
    }))
}

/**
 * Som per vermogenstype de groei over een set unifiedRows (de opbouwfase), aflopend
 * gesorteerd. Consume-only: leest `assetBuckets[type].growth` zoals de engine die levert.
 * Retourneert een lege array als er geen positieve bijdragers zijn.
 */
function aggregateAssetTypeGrowth(
  rows: UnifiedProjectionRow[],
): { type: string; growth: number }[] {
  const byType = new Map<string, number>()
  for (const r of rows) {
    for (const [type, detail] of Object.entries(r.assetBuckets)) {
      if (!detail) continue
      byType.set(type, (byType.get(type) ?? 0) + detail.growth)
    }
  }
  return [...byType.entries()]
    .map(([type, growth]) => ({ type, growth: Math.round(growth) }))
    .filter(g => g.growth !== 0)
    .sort((a, b) => b.growth - a.growth)
}

/**
 * Som de afgeloste hoofdsom over een set unifiedRows (de opbouwfase) over alle schulden.
 * Consume-only: leest `debtBalances[id].principalPaid`.
 */
function sumDebtPrincipalPaid(rows: UnifiedProjectionRow[]): number {
  let total = 0
  for (const r of rows) {
    for (const detail of Object.values(r.debtBalances)) {
      total += detail.principalPaid
    }
  }
  return Math.round(total)
}

/**
 * Eerste-keer-volgorde van de potten die tijdens de onttrekking daadwerkelijk worden
 * aangesproken (withdrawalByType > 0), in de volgorde waarin ze voor het eerst verschijnen
 * over de decumulation-rijen. Consume-only.
 */
function deriveWithdrawalOrder(rows: UnifiedProjectionRow[]): string[] {
  const seen: string[] = []
  for (const r of rows) {
    for (const [type, amount] of Object.entries(r.withdrawalByType)) {
      if ((amount ?? 0) > 0 && !seen.includes(type)) seen.push(type)
    }
  }
  return seen
}

// ── Hoofd-afleiding ──────────────────────────────────────────────────────────

/**
 * Leidt alle per-hoofdstuk-cijfers af uit een SimResult + cashflows (+ optioneel de
 * rijkere UnifiedProjectionRows).
 *
 * Pure functie: zelfde input → zelfde output, geen side-effects, geen herberekening van
 * kerngetallen (consume-only). De `unifiedRows`-param is OPTIONEEL: zonder die rows levert
 * de functie dezelfde basis-output als voorheen + de uit SimRow afleidbare aggregaten; de
 * unifiedRows-only velden blijven dan `undefined`.
 */
export function deriveChapterData(
  simResult: SimResult,
  cashflows: SimCashflow[],
  unifiedRows?: UnifiedProjectionRow[],
): ChapterData {
  const {
    rows,
    fireAge,
    fireAgeFractional,
    fireReachable,
    firePortfolioAtFire,
    requiredFirePortfolio,
    requiredFireIsEndOfHorizonFallback,
    classic25xTarget,
    implicitWithdrawalRate,
    strategy,
    displayEndAge,
    targetEndPortfolio,
  } = simResult

  // SimRow-accumulation = unified accumulation + transition (toSimRow). De vrije jaren en de
  // eerste-echte-onttrekking worden daarom NIET uit retirement-rijen afgeleid maar uit alle
  // rijen vanaf het FIRE-moment (zie withdrawalYears / firstYearWithdrawal hieronder).
  const accumulationRows: SimRow[] = rows.filter(r => r.phase === 'accumulation')

  const hasUnified = unifiedRows != null && unifiedRows.length > 0

  const startPortfolio = rows[0]?.startPortfolio ?? 0
  // Representatieve JAARLIJKSE inleg uit de eerste opbouwrij. SimRow.savings is al een
  // jaarbedrag (fire-simulation.ts:538 rondt annualSavings; unified-projection.ts:113 "inleg
  // dit jaar"); een ×12 zou de inleg 12× overschatten. Géén ×12, zodat dit reconcilieert met
  // cumulativeContributions (= Σ savings, óók jaarlijks).
  const yearlyInleg = accumulationRows[0]?.savings ?? 0
  const averageGrowth = mean(accumulationRows.map(r => r.growth))
  // Vermogen aan het einde van de opbouw = laatste opbouwrij-eind, of (bij 0
  // opbouwjaren) het startvermogen zelf.
  const endOfAccumulation = accumulationRows.length > 0
    ? accumulationRows[accumulationRows.length - 1].endPortfolio
    : startPortfolio

  // Eigen inleg + rendement over de opbouwfase: JAARLIJKSE bedragen sommeren (SimRow.savings
  // en SimRow.growth zijn jaarbedragen — géén ×12). Bij 0 opbouwjaren → 0.
  const cumulativeContributions = Math.round(
    accumulationRows.reduce((sum, r) => sum + r.savings, 0),
  )
  const cumulativeGrowth = Math.round(
    accumulationRows.reduce((sum, r) => sum + r.growth, 0),
  )

  // unifiedRows-only: per-asset-type groei + afgeloste hoofdsom over de OPBOUWFASE.
  // De opbouwfase moet DEZELFDE fase-definitie hanteren als cumulativeGrowth/averageGrowth,
  // die over SimRow-accumulation sommeren — en SimRow-accumulation = unified accumulation +
  // transition (toSimRow). Dus: phase !== 'withdrawal' (incl. transition), NIET enkel
  // 'accumulation'. Anders reconcilieert "WAAR JE GROEI VANDAAN KOMT" niet met "rente-op-rente"
  // zodra FIRE vóór AOW valt (er is dan een transition-fase met groei).
  const accumulationUnifiedRows = hasUnified
    ? unifiedRows!.filter(r => r.phase !== 'withdrawal')
    : []
  const assetTypeGrowth = hasUnified
    ? aggregateAssetTypeGrowth(accumulationUnifiedRows)
    : undefined
  // Alleen tonen als er daadwerkelijk afgelost is (>0); anders undefined ("geen schuld").
  const debtPrincipalPaidDuringAccumulation = (() => {
    if (!hasUnified) return undefined
    const paid = sumDebtPrincipalPaid(accumulationUnifiedRows)
    return paid > 0 ? paid : undefined
  })()

  // Inkomensbodem aanwezig? (AOW/pensioen of welke periodieke inkomstenflow dan ook)
  const incomeFloorCashflows = cashflows.filter(
    cf => cf.type === 'recurring' && cf.direction === 'income',
  )
  const hasIncomeFloor = incomeFloorCashflows.length > 0
  // Maandelijkse inkomensbodem: som van de recurring income-cashflow-bedragen (amount is per
  // maand, zie SimCashflow). undefined als geen inkomensbodem.
  const incomeFloorMonthly = hasIncomeFloor
    ? Math.round(incomeFloorCashflows.reduce((sum, cf) => sum + cf.amount, 0))
    : undefined

  // Inflatiefactor nabij het FIRE-moment, voor "reëel vs nominaal"-uitleg. Pak de unifiedRow
  // op (of dichtstbij) de FIRE-leeftijd; valt terug op de eerste rij als FIRE onbekend is.
  const inflationFactorAtFire = (() => {
    if (!hasUnified) return undefined
    if (fireAge == null) return unifiedRows![0]?.inflationFactor
    const exact = unifiedRows!.find(r => r.age === fireAge)
    if (exact) return exact.inflationFactor
    // Dichtstbijzijnde rij qua leeftijd (defensief bij gaten/afronding).
    let nearest = unifiedRows![0]
    for (const r of unifiedRows!) {
      if (Math.abs(r.age - fireAge) < Math.abs(nearest.age - fireAge)) nearest = r
    }
    return nearest?.inflationFactor
  })()

  const currentAge = rows[0]?.age ?? 0
  const yearsFromNow = fireReachable && fireAgeFractional != null
    ? Math.round(fireAgeFractional - currentAge)
    : undefined

  const impacts = buildImpacts(cashflows, fireAge, displayEndAge)

  // Vrije jaren = alle jaren vanaf het FIRE-moment t/m het eind van de projectie. Dit omvat
  // ZOWEL de transition-fase (FIRE → AOW, valt in SimRow onder 'accumulation') ALS de
  // withdrawal-fase. retirementRows.length alléén zou de transition-jaren missen. Voor perpetual
  // zijn dit de behoudjaren vanaf FIRE; voor deplete/legacy/pensioen de onttrekkingsjaren.
  // fireAge is een integer en matcht de rij-leeftijden (vgl. inflationFactorAtFire: r.age === fireAge).
  const withdrawalYears = fireReachable && fireAge != null
    ? rows.filter(r => r.age >= fireAge).length
    : 0

  // Onttrekking: eerste-jaar-opname alleen als de strategie feitelijk onttrekt. Perpetual
  // teert per definitie niet in (opname ~0) → undefined. Anders het EERSTE jaar dat
  // daadwerkelijk onttrekt — dat is de transition-fase (FIRE → AOW), die in SimRow onder
  // 'accumulation' valt (toSimRow), NIET retirementRows[0] (= pas de withdrawal-fase op AOW).
  const firstWithdrawingRow = rows.find(r => r.withdrawal > 0)
  const firstYearWithdrawal =
    strategy !== 'perpetual' && firstWithdrawingRow != null
      ? firstWithdrawingRow.withdrawal
      : undefined

  const endPortfolio = rows[rows.length - 1]?.endPortfolio ?? 0

  // ADR 0129 — het bereik onder ÉLK vast anker (aow/now/age), uit DEZELFDE run
  // (geconsumeerd, niet herrekend). De sleutel is de kernel-echo `stopAnker`, niet de
  // strategienaam; onder `solved` blijft alles `undefined` en veranderen de zinnen niet.
  // De startleeftijd is de kernel-tijdas (rows[0].age) — nooit `fireAge`, dat is onder
  // een aow-/age-anker het anker zelf.
  const ankerVast = simResult.stopAnker != null
  const ankerReach: AnkerReach | undefined = ankerVast
    ? ankerReachFromSim({
        startAge: rows[0]?.age ?? null,
        kernelDepletionMonth: simResult.kernelDepletionMonth,
        endAge: displayEndAge,
      })
    : undefined
  const ankerStop: AnkerStop | undefined = ankerVast
    ? (ankerStopFromSim({ stopAnker: simResult.stopAnker, vastStopLeeftijd: simResult.vastStopLeeftijd }) ?? undefined)
    : undefined

  // unifiedRows-only onttrekking-detail.
  const withdrawalOrder = (() => {
    if (!hasUnified) return undefined
    const order = deriveWithdrawalOrder(unifiedRows!)
    return order.length > 0 ? order : undefined
  })()
  const totalBox3 = hasUnified
    ? Math.round(unifiedRows![unifiedRows!.length - 1].cumulativeBox3)
    : undefined

  return {
    opbouw: {
      startPortfolio,
      yearlyInleg,
      averageGrowth,
      opbouwjaren: accumulationRows.length,
      endOfAccumulation,
      cumulativeContributions,
      cumulativeGrowth,
      assetTypeGrowth,
      debtPrincipalPaidDuringAccumulation,
    },
    terugrekening: {
      requiredFirePortfolio,
      // Optioneel op SimResult (stub-/preview-resultaten laten het weg) → hier
      // normaliseren naar een harde boolean, zodat de guard niet hoeft te raden.
      requiredFireIsEndOfHorizonFallback: requiredFireIsEndOfHorizonFallback === true,
      classic25xTarget,
      hasIncomeFloor,
      incomeFloorMonthly,
      inflationFactorAtFire,
    },
    snijpunt: {
      reachable: fireReachable,
      fireAgeFractional: fireReachable ? fireAgeFractional : null,
      firePortfolioAtFire,
      implicitWithdrawalRate,
      unreachableMessage: fireReachable
        ? null
        : unreachableMessageFor(strategy, displayEndAge, ankerReach, ankerStop),
      currentAge,
      yearsFromNow,
      ankerVast,
      ankerReach,
      ankerStop,
    },
    onttrekking: {
      strategy,
      withdrawalYears,
      displayEndAge,
      targetEndPortfolio,
      impacts,
      closingSentence: closingSentenceFor(strategy, displayEndAge, targetEndPortfolio, ankerReach, ankerStop),
      firstYearWithdrawal,
      endPortfolio,
      withdrawalOrder,
      totalBox3,
    },
  }
}
