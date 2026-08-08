/**
 * Gedeelde contract-types voor grenzenpotten (spend limits).
 *
 * Eén bron voor de vorm die over de laaggrenzen gaat: loader → props → client,
 * en API-route → JSON → client. De DB-rij zelf (snake_case) blijft binnen de
 * loader/route; alles daarbuiten spreekt deze camelCase-vorm.
 */

import type { SpendLimitPeriodKind, SpendLimitReport, SpendLimitRuleType } from './engine'

export type { SpendLimitPeriodKind, SpendLimitRuleType }

/** De configuratie van één grenzenpot, zoals de UI 'm toont en bewerkt. */
export interface SpendLimitConfig {
  id: string
  name: string
  purpose: string | null
  ruleType: SpendLimitRuleType
  budgetId: string | null
  /** Naam van het gekozen budget — opgelost door de loader, niet in de DB-rij. */
  budgetName: string | null
  /**
   * Is het gekoppelde budget GEARCHIVEERD? Bewust een eigen veld naast
   * `budgetName`, want het zijn twee verschillende gebeurtenissen met twee
   * verschillende boodschappen:
   *
   *  - `budgetName === null` ⇒ het budget bestaat niet meer (of is niet
   *    zichtbaar). De pot telt vanaf nu structureel niets meer.
   *  - `budgetArchived === true` ⇒ het budget bestaat nog, maar je gebruikt het
   *    niet meer actief. De historie klopt, nieuwe boekingen zijn onwaarschijnlijk.
   *
   * Ze samenvatten tot één "budget niet meer beschikbaar" zou de tweede situatie
   * als dataverlies laten klinken terwijl er niets kwijt is (AC-B1-02).
   * `false` bij tegenpartij-potten — daar bestaat geen budget om te archiveren.
   */
  budgetArchived: boolean
  includeChildBudgets: boolean
  counterpartyKey: string | null
  counterpartyLabel: string | null
  limitAmount: number
  period: SpendLimitPeriodKind
  isActive: boolean
  /**
   * Wanneer deze pot is aangemaakt (`spend_limits.created_at`, ISO-tijdstempel).
   *
   * Geen weergaveveld: het is de ONDERGRENS VAN BETEKENIS voor alles wat over
   * historie iets beweert. De motor telt een periode zonder transacties als
   * "binnen de grens" — een bewuste keuze (je gaf niets uit) — maar daardoor
   * erft een splinternieuwe pot een volle reeks over periodes van vóór zijn
   * bestaan. Zonder dit veld vuurt de meldingenlaag daar meteen een
   * mijlpaal-melding op af. Zie `decideSpendLimitEvents` in
   * lib/notifications/spend-limit.ts.
   */
  createdAt: string
}

/**
 * Eén (kind)budget binnen één periode van een budget-pot. De uitsplitsing die de
 * prestatieweergave toont zónder extra fetch: `tx_month_aggregate` levert de
 * rijen tóch al per `budget_id` × maand, de loader gooide ze alleen weg.
 *
 * Bewust PLAT en SCHAARS (alleen bedragen ≠ 0) — geen tweede rapport naast
 * `SpendLimitReport`, en dus ook geen tweede plek waar een status of een
 * overschrijding wordt uitgerekend.
 */
export interface SpendLimitBudgetSplitRow {
  periodKey: string
  budgetId: string
  budgetName: string | null
  /** Netto gerealiseerde uitgave op dit budget in deze periode (refunds verrekend). */
  matchedAmount: number
  matchedTransactionCount: number
}

/** Configuratie + doorgerekende uitkomst. Dit is wat elk oppervlak consumeert. */
export interface SpendLimitWithReport {
  config: SpendLimitConfig
  report: SpendLimitReport
  /**
   * Per-(kind)budget-uitsplitsing per periode; leeg bij tegenpartij-potten (die
   * halen hun per-naam-uitsplitsing on-demand via de breakdown-route, omdat de
   * namen niet in het maandaggregaat zitten).
   */
  budgetSplit: SpendLimitBudgetSplitRow[]
}

/** Eén keuze in de budget-kiezer van het formulier. */
export interface SpendLimitBudgetOption {
  id: string
  name: string
  /** True als dit budget kinderen heeft — dan is "inclusief subbudgetten" zinvol. */
  hasChildren: boolean
  /**
   * Het bovenliggende budget, of `null` voor een hoofdbudget.
   *
   * De KLEINST mogelijke vorm om de kiezer als boom te kunnen tonen: één veld per
   * optie in plaats van een tweede, parallelle `childrenByParent`-map die naast de
   * lijst zou kunnen wegdrijven. Wie de boom nodig heeft, groepeert zelf op dit
   * veld.
   *
   * LET OP: de lijst bevat alleen NIET-gearchiveerde uitgavenbudgetten, dus een
   * `parentId` kan naar een budget wijzen dat niet in de lijst staat (een
   * gearchiveerde ouder). Behandel zo'n optie als hoofdniveau in plaats van 'm
   * weg te laten — anders verdwijnt een bruikbaar subbudget uit de kiezer.
   */
  parentId: string | null
}

/**
 * Eén suggestie in de tegenpartij-kiezer, uit `tx_counterparty_suggestions`.
 * Bewust NIET in de pagina-bundel: die lijst is alleen nodig zodra iemand het
 * formulier opent, en zou anders op élke laadbeurt van de transactiepagina een
 * extra aggregaat kosten voor gebruikers zonder grenzenpot. Wordt on-demand
 * opgehaald via GET /api/spend-limits/counterparties.
 */
export interface SpendLimitCounterpartyOption {
  key: string
  label: string
  /** Totaal uitgegeven aan deze tegenpartij in het venster (positief bedrag). */
  totalSpentInWindow: number
  transactionCount: number
}

/**
 * De volledige bundel die de transactiepagina als props doorgeeft.
 *
 * `windowClosedPeriods` bestond hier tot fase 5 als één getal voor álle potten.
 * Dat klopt niet meer zodra periodesoorten door elkaar lopen (12 maanden naast 8
 * kwartalen naast 3 jaren): de enige juiste bron is `report.streaks.closedPeriodCount`
 * PER POT, dat al bestond. Er is bewust geen vervangend bundelveld.
 */
export interface SpendLimitsSectionData {
  limits: SpendLimitWithReport[]
  budgetOptions: SpendLimitBudgetOption[]
  /**
   * €/dag voor de vrijheidstijd-vertaling (`formatWithFreedom`), uit de canonieke
   * 12-MAANDS ROLLING bron — exact dezelfde keten die `DashboardData.dailyExpenseRate`
   * produceert (`getTxAgg12m` → `aggToExpenseRows` → `recentDailyExpenseRateFromRows`,
   * ×12/365 via `dailyExpenseRate`). NIET de effective maanduitgaven: die dienen
   * uitsluitend als fallback wanneer er geen uitgaven-rijen in het venster zijn.
   * Zo tonen de sectie (dit veld) en de widget (`DashboardData.dailyExpenseRate`)
   * dezelfde vrijheidstijd bij hetzelfde bedrag — één metriek, één grondslag.
   * `null` = geen potten, geen uitgaven-grondslag, of bewust niet berekend
   * (`withDailyExpenseRate: false`); het oppervlak toont dan het bedrag zónder
   * tijdregel en verzint NOOIT een eigen /30-benadering.
   */
  dailyExpenseRate: number | null
  /**
   * Een aggregaat-chunk kwam terug op de PostgREST `max_rows`-cap, dus de sommen
   * kunnen stil te laag zijn. De UI toont dan een betrouwbaarheids-melding bij
   * het cijfer — een stil te laag getal is erger dan geen getal.
   */
  aggregateTruncationSuspected: boolean
}
