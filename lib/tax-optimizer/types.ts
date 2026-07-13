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
   */
  hasReturnCost: boolean

  /** Uitlegbaarheid: aanname, regeling, jaar — één regel per punt. */
  detail: string[]
  /** Afweging die de gebruiker zelf moet maken. null = geen kanttekening. */
  caveat: string | null
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
// kandidaten die de secties eronder voeden (box3-`best` van het
// grootste-besparing-doel + de jaarruimte-opportuniteit) — geen herberekening,
// geen nieuwe rekenwaarden. Gekozen op de meeste teruggekochte vrijheidsdagen
// (savings als tiebreak); kandidaten met savings ≤ 0 vallen af. Geen kandidaat
// → null (neutrale variant).

export interface OptimizerTopChoice {
  goalId: TaxOptimizerGoalId
  /** Titel van de leidende kans (strategie-titel of jaarruimte-label). */
  title: string
  /** Jaarlijkse belastingbesparing (€). */
  savings: number
  /** `savings` in vrijheidsdagen. */
  freedomDays: number
  /** Eerlijke kanttekening (rendementskosten / vastzetten tot pensioen). null = geen. */
  caveat: string | null
  /** Welke fiscale as: bepaalt de accent-kleur van het top-blok. */
  kind: 'box3' | 'jaarruimte'
  /** In-page anchor naar de bijbehorende sectie ("optimizer-box3" / "optimizer-jaarruimte"). */
  anchorId: string
}
