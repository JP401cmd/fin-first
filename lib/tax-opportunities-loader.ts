// lib/tax-opportunities-loader.ts
//
// ÉÉN server-loader voor de fiscale kansen — de laadkant van ADR 0086.
//
// `lib/tax-optimizer/opportunities.ts` is de enige PRODUCENT van kansen; dit
// bestand is de enige plek die de INPUTS voor die producent samenstelt. Vóór
// deze loader deden drie oppervlakken dat elk zelf: de optimizer-pagina (de
// volledige, correcte samenstelling), de belasting-hub (jaarruimte +
// partner-allocatie via `buildTaxOverview`) en de aandachtspunten-loader (een
// eigen kopie van de bruto-formule). Drie samenstellingen van dezelfde kans is
// per definitie drift; nu consumeren alle drie dezelfde uitkomst.
//
// CONSUME, DON'T RECOMPUTE. Elk getal komt uit de canonieke motor:
//   · Box 3-grondslag + dag-uitgaven → `loadPerspectiveBox3` (ADR 0036)
//   · Box 3-scenario's              → `generateBox3Strategies` (→ calculateBox3)
//   · bruto Box 1-inkomen           → `resolveBox1GrossIncome` (override-bewust)
//   · onbenutte ruimte              → `computeJaarruimte`
//   · besparing van de inleg        → `jaarruimteBesparing` (ADR 0040/0041)
//   · Box 1-heffing                 → `computeBox1Tax`
// Hier staat geen forfait, geen tarief en geen tweede €→dagen-conversie.
//
// ADR 0036 — uitsluitend GEAGGREGEERDE scalars verlaten deze loader. De
// partnerverdeling geeft alleen `totalTax` + `savingsVsEqual` door, nooit de
// per-partner-splitsing.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedUser } from '@/lib/supabase/cached-user'
import type { Perspective } from '@/lib/household-data'
import { loadPerspectiveBox3 } from '@/lib/household-tax'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { resolveBox1GrossIncome } from '@/lib/box1-income'
import { computeBox1Tax } from '@/lib/box1-tax'
import { dailyExpenseRate } from '@/lib/format'
import { computeJaarruimte, jaarruimteBesparing, type JaarruimteResult } from '@/lib/jaarruimte'
import type { TaxYear } from '@/lib/box3-data'
import {
  generateBox3Strategies,
  DEFAULT_GOAL_ID,
  TAX_OPTIMIZER_GOALS,
  buildCurrentStanding,
  rankStrategies,
  pickBest,
  pickTopChoice,
  buildOpportunities,
  toTaxOpportunities,
} from '@/lib/tax-optimizer'
import type {
  GoalSection,
  Opportunity,
  OptimizerCurrentStanding,
  OptimizerTopChoice,
  TaxOpportunity,
} from '@/lib/tax-optimizer'

/**
 * Alles wat de drie kansen-oppervlakken nodig hebben, zó dat geen van hen iets
 * hoeft te herberekenen. De optimizer gebruikt de secties + standing, de hub
 * de compacte `taxOpportunities` + de Box 1-onderdelen, de aandachtspunten
 * alleen `taxOpportunities`.
 */
export interface FiscaleKansen {
  /** Belastingjaar waarop alles is doorgerekend. */
  year: TaxYear
  /** Eén sectie per fiscaal doel, in catalogus-volgorde (optimizer-oppervlak). */
  sections: GoalSection[]
  /** De vlakke, volledige kansen-lijst (optimizer-vergelijking). */
  opportunities: Opportunity[]
  /** De compacte projectie voor hub + aandachtspunten — alleen `netEffect > 0`. */
  taxOpportunities: TaxOpportunity[]
  /** "Waar sta je nu" uit het Box 3-resultaat. */
  standing: OptimizerCurrentStanding
  /** De leidende kans over alle doelen heen (netto gekozen), of null. */
  topChoice: OptimizerTopChoice | null
  /** Fiscaal partner van toepassing op de gekozen grondslag. */
  hasPartner: boolean
  /**
   * True = de cijfers horen bij een ANDER perspectief dan je eigen persoonlijke
   * weergave, dus toon de perspectief-chip. Let op: dit is bewust NIET
   * hetzelfde als "de vergelijking draait op een huishoud-grondslag" — in
   * partner-weergave is dit true terwijl de grondslag het persoonlijke
   * resultaat van de partner is (zie `useHouseholdBasis` hieronder). De chip
   * toont dan de partnernaam, dus de markering klopt; de grondslagkeuze
   * hangt aan `useHouseholdBasis`, niet aan dit veld.
   */
  perspectiveAware: boolean
  /**
   * De Box 3-heffing van het GEKOZEN perspectief, of null wanneer dat
   * perspectief geen eigen totaal kan leveren (huishoud-weergave zonder
   * gecombineerd resultaat, bv. omdat de partner geen vermogen deelt).
   *
   * Bewust apart van `standing.tax`: `standing` volgt de grondslagkeuze van de
   * vergelijking (die bij een ontbrekend huishoudtotaal naar persoonlijk
   * terugvalt), terwijl dit veld de vraag "heeft dit perspectief een eigen
   * cijfer?" beantwoordt — precies wat de hub-KPI en de perspectief-chip nodig
   * hebben.
   */
  box3PerspectiveTax: number | null
  /** Canonieke dag-uitgaven bij deze grondslag (€→vrijheidstijd). */
  dailyExpenses: number

  // ── Box 1 (EIGEN persoon — jaarruimte is per-persoon, ADR 0036) ──
  /** Bruto jaarinkomen uit de canonieke bron (handmatige override wint). */
  grossYearly: number
  /** Factor A (pensioenaangroei €) uit het profiel. */
  pensionFactorA: number
  /** Onbenutte jaarruimte + hasData/franchise/cap. */
  jaarruimte: JaarruimteResult
  /** Marginaal-correcte besparing bij VOLLEDIGE benutting (€/jr). */
  jaarruimteSavings: number
  /** Box 1-heffing over `grossYearly` (€/jr), null zonder inkomen. */
  box1Tax: number | null
}

async function loadFiscaleKansenInner(
  supabase: SupabaseClient,
  perspective: Perspective,
  year: TaxYear,
): Promise<FiscaleKansen> {
  // Twee onafhankelijke takken (Box 3-grondslag vs. Box 1-inkomen) —
  // parallel, zodat de extra bron geen extra serieel wachtblok wordt.
  const [box3, user, horizonData] = await Promise.all([
    loadPerspectiveBox3(supabase, perspective, year),
    getCachedUser(supabase),
    loadHorizonData(supabase),
  ])

  // ÉÉN grondslag voor de hele vergelijking, bepaald door het gekozen
  // perspectief (zelfde regel als box3-detail.tsx): alleen de huishoud-weergave
  // rekent op het gecombineerde resultaat; persoonlijk én partner-weergave
  // gebruiken het perspectief-eigen resultaat (`box3.personal` ís in
  // partner-weergave het resultaat van de partner). Zo staan er nooit
  // huishoudcijfers zonder huishoud-markering, en klopt het dagtarief
  // (dailyExpensesByPerspective) bij de heffing die het deelt.
  const useHouseholdBasis = perspective === 'household' && !!box3.combined
  const current = useHouseholdBasis ? box3.combined! : box3.personal

  // De partnerverdeling is een HUISHOUD-hefboom: zijn grondslag (heffing van
  // het hele huishouden) mag niet naast een persoonlijke baseline in dezelfde
  // vergelijking staan. Alleen doorgeven op de huishoud-grondslag — en dan nog
  // uitsluitend de twee geaggregeerde scalars (ADR 0036).
  const optimalAllocation =
    useHouseholdBasis && box3.optimalAllocation
      ? {
          totalTax: box3.optimalAllocation.totalTax,
          savingsVsEqual: box3.optimalAllocation.savingsVsEqual,
        }
      : undefined

  // ── Dagtarief voor de €→vrijheidstijd-vertaling ───────────────────────
  // CANONIEK = `dailyExpenseRate` (maanduitgaven × 12 / 365, lib/format.ts),
  // dezelfde bron waarop de belastingdruk op de hub en de overige
  // aandachtspunt-producenten (schuld, bezit) rekenen. Bewust NIET
  // `box3.dailyExpenses`: dat is de som van budget-LIMIETEN gedeeld door 30 —
  // een andere teller én een andere noemer. Zouden de kansen daarop rekenen,
  // dan stond onder dezelfde totale-druk-sectie een regel met een tot ~48%
  // afwijkend aantal vrijheidsdagen, en zouden fiscale aandachtspunten in de
  // briefing anders rekenen dan de schuld- en bezit-rijen ernaast.
  // Fallback op de Box 3-waarde zolang er geen effectieve uitgaven bekend zijn.
  const canonicalDaily =
    dailyExpenseRate(horizonData.effectiveInput?.monthlyExpenses ?? 0) || box3.dailyExpenses

  // Scenario-generatie is doel-onafhankelijk (één keer); de ranking per doel
  // gebeurt server-side.
  const { baseline, strategies, shiftCurve } = generateBox3Strategies({
    goalId: DEFAULT_GOAL_ID,
    year,
    dailyExpenses: canonicalDaily,
    hasPartner: current.hasPartner,
    current,
    optimalAllocation,
  })

  // ── Box 1-inputs voor het jaarruimte-doel ─────────────────────────────
  // EIGEN persoon only — jaarruimte is per-persoon (ADR 0036), geen partner.
  // `resolveBox1GrossIncome` is de canonieke bruto-bron: hij kent de handmatige
  // `profiles.box1_gross_income`-override én de schijfinversie van de
  // cashflow-schatting. Dit is bewust NIET `box1JaarruimteStatus` — die is een
  // sync status-heuristiek voor de sidebar-dot (netto/(1−marginaal), geen
  // DB-read) en kent de override niet.
  const grossYearly = user
    ? (await resolveBox1GrossIncome(supabase, user.id, year)).grossYearly
    : 0
  const pensionFactorA = horizonData.pensioenFactorA

  const jaarruimte = computeJaarruimte(grossYearly, pensionFactorA, year)
  const jaarruimteSavings = jaarruimteBesparing(grossYearly, jaarruimte.jaarruimte, year)
  const jaarruimteFreedomDays =
    canonicalDaily > 0 ? Math.round(jaarruimteSavings / canonicalDaily) : 0

  // Box 1-heffing over dezelfde bruto-grondslag. `dailyExpenses` voedt alleen
  // de (hier ongebruikte) vrijheidsdagen-velden van de motor — `tax` is er
  // onafhankelijk van, dus de heffing hangt niet aan de grondslagkeuze.
  const box1Tax =
    grossYearly > 0
      ? Math.round(
          computeBox1Tax({
            grossYearlyIncome: grossYearly,
            year,
            dailyExpenses: canonicalDaily,
          }).tax,
        )
      : null

  // ── Bouw ALLE doel-secties, in de volgorde van de catalogus ───────────
  const sections: GoalSection[] = TAX_OPTIMIZER_GOALS.map((goal): GoalSection => {
    switch (goal.id) {
      case 'box3-minimaal':
      case 'box3-geen-rendementsverlies': {
        const ranked = rankStrategies(strategies, goal.id)
        return {
          kind: 'box3',
          goalId: goal.id,
          goal,
          baseline,
          ranked,
          best: pickBest(ranked, goal.id),
          // Doel-onafhankelijk: dezelfde doorgerekende curve voedt de
          // verkenner-slider, ongeacht op welk doel de sectie gerankt is.
          shiftCurve,
        }
      }
      case 'jaarruimte-maximaal':
        return {
          kind: 'jaarruimte',
          goalId: goal.id,
          goal,
          grossYearlyIncome: grossYearly,
          pensionFactorA,
          dailyExpenses: canonicalDaily,
          hasData: grossYearly > 0,
          besparing: jaarruimteSavings,
          freedomDays: jaarruimteFreedomDays,
          // Netto == bruto voor deze kans; de "geen rendementsverlies"-aanname
          // staat bij het `GoalSection`-type gedocumenteerd — hier alleen
          // doorgeven, geen eigen som.
          netEffect: jaarruimteSavings,
          netFreedomDays: jaarruimteFreedomDays,
        }
      case 'levenslang-minimaal':
        return {
          kind: 'preview',
          goalId: goal.id,
          goal,
          previewNote:
            'Straks vergelijkt TriFinity de volgorde waarin je je potten — spaargeld, beleggingen, pensioen en lijfrente — laat leeglopen, en zoekt de route met de laagste belastingdruk over je hele leven, niet alleen dit jaar.',
        }
      default: {
        const _exhaustive: never = goal.id
        throw new Error(`Onbekend fiscaal doel: ${String(_exhaustive)}`)
      }
    }
  })

  // ── Leidende kans + huidige situatie + de vlakke kansenlijst ──────────
  // Alle drie uit de canonieke optimizer-laag, op dezelfde al-gebouwde secties.
  const { opportunities } = buildOpportunities(sections)

  return {
    year,
    sections,
    opportunities,
    taxOpportunities: toTaxOpportunities(opportunities),
    standing: buildCurrentStanding(current, canonicalDaily),
    topChoice: pickTopChoice(sections),
    hasPartner: current.hasPartner,
    perspectiveAware: box3.hasHousehold && !!box3.combined && perspective !== 'personal',
    box3PerspectiveTax:
      perspective === 'household' ? box3.combined?.tax ?? null : box3.personal.tax,
    dailyExpenses: canonicalDaily,
    grossYearly,
    pensionFactorA,
    jaarruimte,
    jaarruimteSavings,
    box1Tax,
  }
}

/**
 * Laad de fiscale kansen voor één perspectief + belastingjaar.
 *
 * React `cache()`-gewrapt op (client, perspectief, jaar): de belasting-hub en
 * de aandachtspunten-laag kunnen binnen één render allebei aankloppen zonder
 * de Box 3-/Box 1-bronnen twee keer te trekken. Verschillende perspectieven
 * zijn bewust aparte entries — dat zijn andere grondslagen.
 */
export const loadFiscaleKansen = cache(loadFiscaleKansenInner)
