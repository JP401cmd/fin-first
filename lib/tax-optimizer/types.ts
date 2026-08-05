// lib/tax-optimizer/types.ts
//
// Types voor de fiscale-strategie-optimizer (roadmap J). De optimizer is een
// ORCHESTRATIE-laag bovenop de bestaande belastingmotoren — GEEN nieuwe
// rekenkern. Hij kiest een fiscaal doel, genereert doorgerekende scenario's
// (strategieën) op basis van de canonieke engines (lib/box3-data.ts) en rankt
// ze in euro's én vrijheidsdagen.
//
// Wft: alles is een "doorgerekend scenario / kans", nooit imperatief advies.
// Ranken = tonen wat het meeste oplevert, niet aanraden-als-advies.

import type { TaxYear } from '@/lib/box3-data'

// ── Fiscale doelen ───────────────────────────────────────────────

export type TaxOptimizerGoalId =
  | 'box3-minimaal'
  | 'box3-geen-rendementsverlies'
  | 'jaarruimte-maximaal'
  | 'levenslang-minimaal'

export interface TaxOptimizerGoal {
  id: TaxOptimizerGoalId
  /** Korte doel-label voor de kiezer, in "ik wil…"-taal. */
  label: string
  /** Eén zin die het doel uitlegt. */
  description: string
  /**
   * Welke fiscale as het doel raakt — bepaalt de icoon-codering en waar het
   * later ingehangen wordt.
   */
  box: 'box3' | 'box1' | 'meerdere'
  /**
   * false → getoond als "binnenkort" (disabled) in de kiezer. In de MVP zijn
   * alleen de twee Box 3-doelen beschikbaar; jaarruimte en levenslange druk
   * zijn gedocumenteerde vervolgfasen.
   */
  available: boolean
}

// ── Verloop over de belastingjaren ───────────────────────────────
//
// Hetzelfde vermogen, drie momenten: het vorige belastingjaar, het actieve jaar
// en een INDICATIE onder het beoogde stelsel-2028 (heffing over werkelijk
// rendement). Alle drie komen uit de canonieke motoren — 2025/2026 uit
// `calculateBox3` op de jaartabel BOX3_PARAMS, de 2028-indicatie uit de
// tegenbewijs-tak (`compareForfaitairVsWerkelijk`, lib/box3-tegenbewijs.ts).
// Er staat GEEN eigen tarief- of forfait-constante in de optimizer.
//
// Het jaar zit bewust in de VELDNAAM (grondslag in de naam, ADR 0073): komt er
// een belastingjaar bij (BOX3_PARAMS + CURRENT_TAX_YEAR), dan verhuizen deze
// namen mee — een stil doorschuivend "actief jaar" achter een vaste veldnaam is
// precies de drift die dit contract wil voorkomen.

export interface TaxTrajectory {
  /** Heffing in belastingjaar 2025 voor dezelfde samenstelling; null = niet bepaalbaar. */
  tax2025: number | null
  /** Heffing in belastingjaar 2026 (het actieve jaar). */
  tax2026: number
  /** Indicatieve heffing onder het beoogde 2028-stelsel (werkelijk rendement × tarief); null = n.v.t. */
  tax2028Indicatie: number | null
}

// ── Shift-curve (samenstelling-verloop) ──────────────────────────
//
// De doorgerekende reeks "wat gebeurt er met de heffing als ik X van mijn
// beleggingen naar spaargeld verschuif". Een PUNTENREEKS uit dezelfde engine als
// het samenstelling-shift-scenario (`calculateBox3`) — de UI interpoleert alleen
// visueel en rekent zelf niets. Het laatste punt (alles verschoven) valt per
// constructie exact samen met dat scenario in `strategies`: zelfde `tax`,
// `savings`, `returnCostEur` en `netEffect` (vergrendeld in de unit-test).

export interface ShiftCurvePoint {
  /** Verschoven bedrag van beleggingen → spaargeld (€), 0 … totaalBeleggingen. */
  shifted: number
  /** Heffing bij deze samenstelling (€/jr). */
  tax: number
  /** Huidige heffing − tax. */
  savings: number
  /** shifted × (DEFAULT_RETURN − EXPECTED_SAVINGS_RETURN), ≥ 0, hele euro's. */
  returnCostEur: number
  /** savings − returnCostEur (kan negatief zijn). */
  netEffect: number
}

// ── Strategieën ──────────────────────────────────────────────────

export type OptimizerStrategyKind =
  | 'baseline'
  | 'samenstelling-shift'
  | 'partnerverdeling'

/**
 * Eén doorgerekend scenario. Elke strategie draagt zijn EIGEN referentie
 * (`currentTax`/`currentLabel`) zodat de vergelijking zelf-beschrijvend is en
 * de getallen sluiten (`savings === currentTax − optimizedTax`). Zo mengen we
 * geen strategieën met verschillende grondslagen op één globale baseline.
 */
export interface OptimizerStrategy {
  id: string
  kind: OptimizerStrategyKind
  /** Redactionele titel. */
  title: string
  /** Wat dit scenario doet (uitleg, geen imperatief). */
  description: string

  /** Referentie-heffing waar dit scenario tegen afzet (€/jaar). */
  currentTax: number
  /** Label voor de referentie, bv. 'Nu' of 'Ieder apart'. */
  currentLabel: string
  /** Heffing ná het scenario (€/jaar). */
  optimizedTax: number
  /** Label voor de uitkomst, bv. 'Alles op spaargeld' of 'Optimaal verdeeld'. */
  optimizedLabel: string

  /** currentTax − optimizedTax (kan 0 of negatief zijn). */
  savings: number
  /** Besparing in vrijheidsdagen (savings / dag-uitgaven, afgerond). */
  freedomDays: number

  /** De huidige situatie zelf (referentie in de vergelijking). */
  isBaseline: boolean
  /**
   * True wanneer het scenario werkelijk rendement kost (bv. beleggingen naar
   * spaargeld schuiven verlaagt de heffing maar doorgaans ook het verwachte
   * rendement). Het doel 'box3-geen-rendementsverlies' deprioriteert deze.
   *
   * Blijft de KWALITATIEVE vlag (ja/nee) waar `rankStrategies` op sorteert; het
   * BEDRAG staat in `returnCostEur`.
   */
  hasReturnCost: boolean
  /** Verwacht misgelopen rendement in €/jr (≥ 0). 0 = geen rendementsimpact. */
  returnCostEur: number
  /** savings − returnCostEur. Kan negatief zijn. */
  netEffect: number
  /** netEffect in vrijheidsdagen (afgerond; 0 wanneer netEffect ≤ 0 of dailyExpenses ≤ 0). */
  netFreedomDays: number

  /**
   * Dezelfde samenstelling over de belastingjaren heen (2025 · 2026 ·
   * indicatie 2028). null = niet doorgerekend voor dit scenario — geldt voor de
   * partnerverdeling: die is uitsluitend voor het ACTIEVE jaar geoptimaliseerd
   * (optimizePartnerAllocation draait op één jaartabel), dus een verloop zou een
   * verdeling suggereren die voor 2025/2028 niet is doorgerekend.
   */
  trajectory: TaxTrajectory | null

  /** Uitlegbaarheid: aanname, regeling, jaar — één regel per punt. */
  detail: string[]
  /** Afweging die de gebruiker zelf moet maken. null = geen kanttekening. */
  caveat: string | null
}

// ── Huidige stand (referentiepaneel) ─────────────────────────────
//
// De "waar sta je nu"-kolom van de vergelijking: puur AFGELEID uit het bestaande
// `Box3Result` (lib/box3-data.ts) — geen tweede forfait-som, geen eigen
// tarief-constanten. Uitsluitend geaggregeerde/combined cijfers; nooit een
// per-partner-splitsing (ADR 0036).

export interface OptimizerCurrentStanding {
  /** Heffing nu (€/jr) — `Box3Result.tax`. */
  tax: number
  /** `tax` omgerekend in vrijheidsdagen per jaar (0 bij dailyExpenses ≤ 0). */
  taxFreedomDays: number
  /** Totaal spaargeld in Box 3 (€). */
  totaalSpaargeld: number
  /** Totaal beleggingen in Box 3 (€). */
  totaalBeleggingen: number
  /** Totaal Box 3-schulden (€, vóór schuldendrempel). */
  totaalBox3Schulden: number
  /** Toegepaste vrijstelling (heffingsvrij vermogen; partners = dubbel). */
  heffingsvrijVermogen: number
  /** Hoeveel van de vrijstelling daadwerkelijk benut is, 0..100. */
  vrijstellingBenutPct: number
  /** Heffing als % van het Box 3-vermogen (spaargeld + beleggingen). */
  effectieveDrukPct: number
  /** Fiscaal partner van toepassing (dubbele vrijstelling/drempel). */
  hasPartner: boolean
}

// ── Invoer / uitvoer ─────────────────────────────────────────────

import type { Box3Result, PartnerAllocation } from '@/lib/box3-data'

export interface Box3OptimizerInput {
  goalId: TaxOptimizerGoalId
  year: TaxYear
  /** Canonieke dag-uitgaven (uit loadPerspectiveBox3) voor de €→tijd-vertaling. */
  dailyExpenses: number
  hasPartner: boolean
  /**
   * De huidige-situatie-heffing: solo → `personal`, huishouden → `combined`.
   * Bron = loadPerspectiveBox3 (canoniek, partner-privacy via ADR 0036).
   */
  current: Box3Result
  /**
   * Alleen huishouden: de optimale fiscale partnerverdeling. We consumeren
   * uitsluitend de twee scalaire uitkomsten (totalTax + savingsVsEqual) — nooit
   * de per-partner-splitsing — zodat er geen partner-private bedragen lekken.
   */
  optimalAllocation?: Pick<PartnerAllocation, 'totalTax' | 'savingsVsEqual'>
}

export interface CompareResult {
  goalId: TaxOptimizerGoalId
  goal: TaxOptimizerGoal
  year: TaxYear
  dailyExpenses: number
  hasPartner: boolean
  /** De huidige situatie (referentie). */
  baseline: OptimizerStrategy
  /** Niet-baseline scenario's, gerankt volgens het gekozen doel. */
  strategies: OptimizerStrategy[]
  /**
   * De doorgerekende reeks "0 … alle beleggingen verschoven". null = geen
   * shift-scenario (te weinig beleggingen, geen heffing, of geen besparing).
   */
  shiftCurve: ShiftCurvePoint[] | null
  /**
   * Het best passende scenario met een positieve besparing, of null wanneer er
   * geen scenario is dat de heffing verlaagt (voor dit doel).
   */
  best: OptimizerStrategy | null
  /** Wft-disclaimer voor het oppervlak. */
  disclaimer: string
}

// ── Doel-secties (gestapelde weergave) ───────────────────────────
//
// De optimizer toont ALLE doelen onder elkaar (niet één-tegelijk via een
// kiezer). Server-side bouwt de page één `GoalSection` per doel in de volgorde
// van `TAX_OPTIMIZER_GOALS`; de client rendert ze puur. Discriminated union op
// `kind` zodat elk doel-type zijn eigen, zelf-beschrijvende data draagt. De
// jaarruimte-sectie is bewust GEEN StrategyCard-variant (geen extra
// `OptimizerStrategyKind`), maar een dunne wrapper om de bestaande
// `JaarruimteCard` (Box 1, per persoon — ADR 0036).

export type GoalSection =
  | {
      kind: 'box3'
      goalId: TaxOptimizerGoalId
      goal: TaxOptimizerGoal
      /** De huidige situatie (referentie). */
      baseline: OptimizerStrategy
      /** Niet-baseline scenario's, server-side gerankt volgens dit doel. */
      ranked: OptimizerStrategy[]
      /**
       * De doorgerekende shift-reeks (0 … alle beleggingen) achter het
       * samenstelling-scenario. null = geen shift-scenario voor deze gebruiker.
       */
      shiftCurve: ShiftCurvePoint[] | null
      /** Beste scenario met positieve besparing voor dit doel, of null. */
      best: OptimizerStrategy | null
    }
  | {
      kind: 'jaarruimte'
      goalId: TaxOptimizerGoalId
      goal: TaxOptimizerGoal
      /** Bruto-jaarinkomen Box 1 (eigen persoon). 0 → geen data. */
      grossYearlyIncome: number
      /** Factor A (jaarlijkse pensioenaangroei, €) uit het profiel. */
      pensionFactorA: number
      /** Canonieke dag-uitgaven voor de €→vrijheidstijd-vertaling. */
      dailyExpenses: number
      /** false → JaarruimteCard toont zelf de "vul je inkomen aan"-melding. */
      hasData: boolean
      /**
       * Marginaal-correcte belastingbesparing bij VOLLEDIGE benutting van de
       * onbenutte jaarruimte (via `jaarruimteBesparing`, ADR 0040/0041). Voedt
       * de "grootste kans"-afweging bovenaan — geen herberekening in de client.
       */
      besparing: number
      /** `besparing` uitgedrukt in vrijheidsdagen (savings / dag-uitgaven). */
      freedomDays: number
      /**
       * Netto effect (€/jr) van deze kans. GEEN rendementsverlies — de inleg
       * blijft renderen in de lijfrente, alleen het fiscale regime verschuift —
       * dus netEffect = besparing. Deze sectie is de ENIGE houder van dat
       * gelijkteken: `pickTopChoice` consumeert dit veld en leidt het niet
       * opnieuw af (anders zou de aanname op twee plekken wonen).
       */
      netEffect: number
      /** `netEffect` in vrijheidsdagen — zonder rendementsverlies gelijk aan `freedomDays`. */
      netFreedomDays: number
    }
  | {
      kind: 'preview'
      goalId: TaxOptimizerGoalId
      goal: TaxOptimizerGoal
      /** Korte uitleg van wat dit doel straks doorrekent. Geen getallen. */
      previewNote: string
    }

// ── Leidende aanbeveling ("Je grootste kans nu") ─────────────────
//
// De optimizer opent met ÉÉN duidelijke aanbeveling: de opportuniteit met de
// hoogste impact over ALLE doelen heen. Server-side afgeleid uit dezelfde
// kandidaten die de secties eronder voeden (de Box 3-scenario's + de
// jaarruimte-opportuniteit) — geen herberekening, geen nieuwe rekenwaarden.
//
// Keuzecriterium is NETTO (zie `pickTopChoice`, lib/tax-optimizer/rank.ts):
// kandidaten met `netEffect ≤ 0` vallen af, daarna wint de meeste NETTO
// teruggekochte vrijheidsdagen (`netEffect` als tiebreak). Geen kandidaat → null
// (neutrale variant). Voorheen werd op BRUTO besparing gekozen — daardoor kon
// "€ 47 besparing" als grootste kans bovenaan staan terwijl de onderliggende
// shift per saldo honderden euro's rendement kost.

export interface OptimizerTopChoice {
  goalId: TaxOptimizerGoalId
  /** Titel van de leidende kans (strategie-titel of jaarruimte-label). */
  title: string
  /** Jaarlijkse belastingbesparing (€) — BRUTO, vóór rendementsverlies. */
  savings: number
  /** `savings` in vrijheidsdagen — dus de BRUTO besparing, niet `netEffect`. */
  freedomDays: number
  /** Netto effect (€/jr) van deze kans — savings − verwacht rendementsverlies. */
  netEffect: number
  /** Eerlijke kanttekening (rendementskosten / vastzetten tot pensioen). null = geen. */
  caveat: string | null
  /** Welke fiscale as: bepaalt de accent-kleur van het top-blok. */
  kind: 'box3' | 'jaarruimte'
  /**
   * Id van de winnende kans: het strategie-id voor Box 3 ('samenstelling-shift'
   * / 'partnerverdeling'), het doel-id 'jaarruimte-maximaal' voor jaarruimte.
   * De client koppelt de winnaar-badge hierop aan de rij in de vergelijking.
   */
  opportunityId: string
}
