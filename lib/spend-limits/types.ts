/**
 * Gedeelde contract-types voor grenzenpotten (spend limits).
 *
 * Eén bron voor de vorm die over de laaggrenzen gaat: loader → props → client,
 * en API-route → JSON → client. De DB-rij zelf (snake_case) blijft binnen de
 * loader/route; alles daarbuiten spreekt deze camelCase-vorm.
 */

import type { SpendLimitPeriodKind, SpendLimitReport, SpendLimitRuleType } from './engine'

export type { SpendLimitPeriodKind, SpendLimitRuleType }

/**
 * Eén gekozen budget binnen een regel, mét de stand van zaken die het oppervlak
 * moet kunnen uitleggen.
 *
 * `name === null` en `archived === true` zijn bewust TWEE VELDEN en niet één
 * "niet meer beschikbaar", want het zijn twee verschillende gebeurtenissen met
 * twee verschillende boodschappen (AC-B1-02):
 *
 *  - `name === null` ⇒ het budget bestaat niet meer (of is niet zichtbaar). Deze
 *    verwijzing telt vanaf nu structureel niets meer.
 *  - `archived === true` ⇒ het budget bestaat nog, maar je gebruikt het niet meer
 *    actief. De historie klopt, nieuwe boekingen zijn onwaarschijnlijk.
 *
 * Ze samenvatten zou de tweede situatie als dataverlies laten klinken terwijl er
 * niets kwijt is.
 */
export interface SpendLimitRuleBudgetRef {
  id: string
  name: string | null
  archived: boolean
}

/** Eén gekozen tegenpartij binnen een regel: de sleutel plus wat de gebruiker koos. */
export interface SpendLimitRuleCounterpartyRef {
  /** Genormaliseerde zoeksleutel (server-afgeleid, parity met de SQL-functie). */
  key: string
  /** De schrijfwijze die de gebruiker koos of typte — puur uitleg. */
  label: string
}

/**
 * Eén regel van een grenzenpot.
 *
 * COMBINATIE-SEMANTIEK (vastgelegd met de eigenaar, 10-08-2026 — en afgedwongen
 * in `public.spend_limit_rule_aggregate`, niet hier):
 *  - binnen `budgets`      → OF ("één van deze budgetten")
 *  - binnen `counterparties` → OF
 *  - tussen beide lijsten  → EN (staan er allebei waarden, dan moeten ze allebei
 *    kloppen: budget X én tegenpartij Y)
 *  - tussen regels van dezelfde pot → UNIE tegen één grensbedrag, waarbij een
 *    transactie hoogstens één keer telt.
 *
 * Een lege lijst legt géén beperking op; beide lijsten leeg kan niet (de
 * CHECK `spend_limit_rules_not_empty` en het zod-schema sluiten het uit) — zo'n
 * regel zou stil op álle transacties matchen.
 */
export interface SpendLimitRuleConfig {
  id: string
  budgets: SpendLimitRuleBudgetRef[]
  /** Telt de hele subboom onder elk gekozen budget mee? Geldt voor alle budgetten van deze regel. */
  includeChildBudgets: boolean
  counterparties: SpendLimitRuleCounterpartyRef[]
}

/** De configuratie van één grenzenpot, zoals de UI 'm toont en bewerkt. */
export interface SpendLimitConfig {
  id: string
  name: string
  purpose: string | null
  /**
   * AFGELEID uit `rules`, nooit opgeslagen — de kolom `spend_limits.rule_type` is
   * legacy sinds 10-08-2026. Zie `deriveSpendLimitRuleType` in de loader.
   */
  ruleType: SpendLimitRuleType
  /**
   * De regels, in de volgorde waarin de gebruiker ze heeft gezet. Minstens één;
   * een pot zonder regels telt niets en kan via de API niet ontstaan.
   */
  rules: SpendLimitRuleConfig[]
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
 * prestatieweergave toont zónder extra fetch: `spend_limit_rule_aggregate` levert
 * de rijen tóch al per `budget_id`, de loader hoeft ze alleen te groeperen.
 *
 * Bewust PLAT en SCHAARS (alleen bedragen ≠ 0) — geen tweede rapport naast
 * `SpendLimitReport`, en dus ook geen tweede plek waar een status of een
 * overschrijding wordt uitgerekend.
 *
 * LET OP — BESTAAT ALLEEN OP MAAND-KORREL EN ZONDER TEGENPARTIJ-DIMENSIE. De
 * SQL vult `budget_id` uitsluitend daar (zie de migratie): bij dag-korrel zou
 * (31 dagen × budgetten × types) tegen de PostgREST-rijcap kunnen lopen, en bij
 * een gemengde regel zegt "welk budget" niets over waaróm de transactie meetelt.
 * De pane valt dan terug op `ruleSplit`.
 */
export interface SpendLimitBudgetSplitRow {
  periodKey: string
  budgetId: string
  budgetName: string | null
  /** Netto gerealiseerde uitgave op dit budget in deze periode (refunds verrekend). */
  matchedAmount: number
  matchedTransactionCount: number
}

/**
 * Eén REGEL binnen één periode: "wat droeg deze regel bij aan de pot-som".
 *
 * Bestaat pas sinds een pot meerdere regels kan hebben, en is de enige
 * uitsplitsing die bij élke regelvorm en élke periodesoort klopt.
 *
 * TOEREKENING, geen dubbeltelling: raakt één transactie twee regels van dezelfde
 * pot, dan telt ze bij de regel met de laagste volgorde — dat is de ontdubbeling
 * die `spend_limit_rule_aggregate` met `DISTINCT ON` legt. De som over de regels
 * van een periode is daarom exact `periodMatchedAmount` uit het rapport, en
 * nooit meer.
 */
export interface SpendLimitRuleSplitRow {
  periodKey: string
  ruleId: string
  matchedAmount: number
  matchedTransactionCount: number
}

/** Configuratie + doorgerekende uitkomst. Dit is wat elk oppervlak consumeert. */
export interface SpendLimitWithReport {
  config: SpendLimitConfig
  report: SpendLimitReport
  /**
   * Per-(kind)budget-uitsplitsing per periode; leeg zodra de pot een
   * tegenpartij-dimensie draagt of op dag-/weekkorrel rekent (zie
   * `SpendLimitBudgetSplitRow`). Tegenpartij-potten halen hun per-naam-uitsplitsing
   * on-demand via de breakdown-route, omdat de namen niet per periode in het
   * aggregaat zitten.
   */
  budgetSplit: SpendLimitBudgetSplitRow[]
  /**
   * Per-regel-uitsplitsing per periode. Altijd gevuld zodra er iets gematcht is,
   * ongeacht regelvorm of periodesoort — de uitsplitsing waar de pane op kan
   * terugvallen als `budgetSplit` leeg is.
   */
  ruleSplit: SpendLimitRuleSplitRow[]
}

/**
 * Eén losse TRANSACTIE achter één periode — de rij-uitsplitsing onder de
 * aggregaat-uitsplitsingen hierboven.
 *
 * ── HET BEDRAG IS EEN BIJDRAGE, GEEN BOEKINGSSALDO ──────────────────────────
 * `matchedAmount` draagt dezelfde conventie als élk ander bedrag in de pot:
 * POSITIEF = uitgave, negatief = geld dat terugkwam (refund/chargeback). De
 * rauwe `transactions.amount` heeft het omgekeerde teken; de omzetting gebeurt
 * in de API-route met `netSpendFromSums` uit de motor — de enige eigenaar van
 * die tekenregel — en nooit met een losse `-x` in een component. Zou de lijst
 * het bankteken tonen, dan stond op één scherm dezelfde uitgave één keer
 * positief (per budget / per naam) en één keer negatief.
 *
 * `budgetId` is een verwijzing, geen naam: het oppervlak lost 'm op uit data die
 * al op de pagina staat (`SpendLimitWithReport`), zodat de lijst geen tweede
 * fetch kost.
 */
export interface SpendLimitTransactionRow {
  id: string
  /** Boekdatum, ISO 'yyyy-mm-dd'. */
  date: string
  counterpartyName: string | null
  description: string
  /** Netto bijdrage aan de pot; positief = uitgave. */
  matchedAmount: number
  budgetId: string | null
}

/**
 * Het antwoord van GET /api/spend-limits/[id]/transactions.
 *
 * ── DE TOTALEN KOMEN NIET UIT DE RIJEN (consume, don't recompute) ───────────
 * `totalCount` en `totalMatchedAmount` zijn `matchedTransactionCount` en
 * `periodMatchedAmount` uit `computePeriodOutcome` — dezelfde motorfunctie en
 * dezelfde aggregaat-bron als de kaart en de grafiek. Ze zijn dus per definitie
 * gelijk aan wat er boven de lijst staat.
 *
 * "Er zijn er meer dan we tonen" is daarom `totalCount > rows.length`, en NIET
 * "raakte de SQL zijn eigen LIMIT". Dat is bewust: het verschil is meteen ook een
 * parity-controle tussen de rij-RPC en het aggregaat. Er komt hier dus géén
 * tweede truncatie-vlag bij; `aggregateTruncationSuspected` blijft wat het is
 * (een kanarie over de AGGREGAAT-chunks, zie SpendLimitsSectionData).
 */
export interface SpendLimitTransactionsResponse {
  periodKey: string
  label: string
  /** Nieuwste eerst; hooguit 200 (hard geklemd in SQL). */
  rows: SpendLimitTransactionRow[]
  /** Canoniek aantal meetellende boekingen in deze periode. */
  totalCount: number
  /** Canoniek periodebedrag (netto, positief = uitgave). */
  totalMatchedAmount: number
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
