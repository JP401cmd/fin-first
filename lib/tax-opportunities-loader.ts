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
//   · eigen woning (WOZ + rente)    → `resolveEigenWoningBox1Input` (C8)
//   · onbenutte ruimte              → `computeJaarruimte`
//   · besparing van de inleg        → `jaarruimteBesparing` (ADR 0040/0041)
//   · Box 1-heffing                 → `computeBox1Tax`
//   · verwacht beleggingsrendement  → `horizonData.fireParams.grossReturn`
//                                     (resolveFireParams, lib/fire-params.ts)
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
import { loadHorizonRaw } from '@/lib/horizon-data-loader'
import {
  resolveBox1GrossIncome,
  resolveEigenWoningBox1Input,
  GEEN_EIGEN_WONING,
} from '@/lib/box1-income'
import { computeBox1Tax } from '@/lib/box1-tax'
import { computeJaarruimte, jaarruimteBesparing, type JaarruimteResult } from '@/lib/jaarruimte'
import { DEFAULT_RETURN } from '@/lib/constants'
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
  /**
   * Het verwachte bruto beleggingsrendement waarmee de scenario's hierboven
   * ZIJN doorgerekend (fractie, bv. 0.055). Komt uit `resolveFireParams` via
   * `horizonData.fireParams.grossReturn` — dus de profiel-instelling
   * `profiles.expected_return`, of DEFAULT_RETURN wanneer die leeg is.
   *
   * Meegegeven zodat het oppervlak het GEBRUIKTE percentage kan tonen in plaats
   * van de constante nog eens zelf te importeren (dat was de bug: de chip zei
   * 7,0% terwijl de projectie van dezelfde gebruiker met 5% rekende).
   */
  expectedReturn: number
  /**
   * true = `expectedReturn` is een eigen profiel-instelling; false = de
   * app-standaard DEFAULT_RETURN. Bepaald door vergelijking met die constante,
   * zodat de UI het onderscheid kan tonen zonder zelf het profiel te lezen.
   *
   * Randgeval 1: zet een gebruiker zijn rendement handmatig op exact 7,0%, dan
   * leest dit false. Dat is de juiste kant om op te falen.
   *
   * Randgeval 2, ANDERSOM en nog niet opgelost: `loadHorizonData` schuift een
   * beheerde jaarlaag uit `fire_assumptions` ín het profielveld vóórdat
   * `resolveFireParams` draait. `grossReturn` is dus "profielwaarde óf
   * beheerderswaarde-voor-dat-jaar óf DEFAULT_RETURN", en zodra een beheerder
   * het jaargetal op iets anders dan 7,0% zet, leest dit veld `true` voor
   * IEDEREEN die zelf niets heeft ingesteld — dan claimt de chip "eigen
   * instelling" waar niets eigen is. Vandaag latent (de seed is exact 0.07).
   * Echt oplossen vraagt een herkomst-vlag die vanaf `horizon-data-loader.ts`
   * meereist (de shadow gebeurt daar, en `rawProfile` is post-shadow) — bewust
   * apart gehouden, staat op de restpuntenlijst.
   *
   * In beide gevallen geldt: het getoonde percentage is hoe dan ook het
   * GEBRUIKTE percentage; alleen de herkomst-markering kan onnauwkeurig zijn.
   */
  expectedReturnIsPersonal: boolean

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
  /**
   * Effectief tarief over `grossYearly` (fractie) — `computeBox1Tax(...)
   * .effectiveRate`, uit DEZELFDE motoraanroep als `box1Tax`. Null zonder
   * inkomen.
   *
   * BESTAAT sinds bevinding C9: de hub rekende zijn eigen "effectief tarief"
   * als (Box 1 + Box 3) / Box 1-inkomen — een vermogensheffing in de teller van
   * een inkomens-quotiënt. Nu leest de hub hetzelfde percentage als
   * /overzicht/belasting/box1.
   */
  box1EffectiveRate: number | null
  /**
   * Marginaal tarief over de volgende euro (fractie) — `computeBox1Tax(...)
   * .marginalRate`, uit DEZELFDE motoraanroep. Null zonder inkomen.
   *
   * BESTAAT sinds bevinding C9/M4: de hub toonde `fireParams.marginaalTarief`
   * → `deriveMarginaalTarief()`, de FIRE-vuistregel die per constructie altijd
   * een van twee vaste schijftarieven teruggeeft (35,75%/49,5% in 2026) en dus
   * nooit de afbouw-gecorrigeerde 56,0% van de motor kón tonen — 20,2
   * procentpunt verschil met de Box 1-subpagina over hetzelfde inkomen. Die
   * vuistregel blijft correct voor haar EIGEN doel (netto→bruto-schattingen in
   * de FIRE-laag), maar is geen user-facing tarief-KPI.
   */
  box1MarginalRate: number | null
}

async function loadFiscaleKansenInner(
  supabase: SupabaseClient,
  perspective: Perspective,
  year: TaxYear,
): Promise<FiscaleKansen> {
  // Twee onafhankelijke takken (Box 3-grondslag vs. Box 1-inkomen) —
  // parallel, zodat de extra bron geen extra serieel wachtblok wordt.
  //
  // VOLGORDE (M22): de rauwe horizon-laag levert het canonieke dagtarief, en
  // `loadPerspectiveBox3` heeft datzelfde tarief nodig. We halen het hier één
  // keer op en geven het dóór, i.p.v. de Box 3-loader zijn eigen
  // transactie-query te laten draaien. Dat kost dus een serieel stapje op de
  // Box 3-tak — bewust: één noemer met één query is beter dan twee queries die
  // uit elkaar kúnnen lopen zodra iemand aan één van beide sleutelt.
  const [user, horizonData] = await Promise.all([
    getCachedUser(supabase),
    loadHorizonRaw(supabase),
  ])
  const box3 = await loadPerspectiveBox3(
    supabase,
    perspective,
    year,
    undefined,
    horizonData.dailyExpenseRateDetail,
  )

  // ÉÉN grondslag voor de hele vergelijking, bepaald door het gekozen
  // perspectief (zelfde regel als box3-detail.tsx): alleen de huishoud-weergave
  // rekent op het gecombineerde resultaat; persoonlijk én partner-weergave
  // gebruiken het perspectief-eigen resultaat (`box3.personal` ís in
  // partner-weergave het resultaat van de partner). Zo staan er nooit
  // huishoudcijfers zonder huishoud-markering.
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
  // CANONIEK = `horizonData.dailyExpenseRate`: het 12-mnd ROLLING dagtarief uit
  // `lib/expense-rate.ts`, dezelfde bron/keten als `DashboardData.dailyExpenseRate`
  // en dus als de belastingdruk op de hub, de widgets en de aandachtspunt-
  // producenten (schuld, bezit).
  //
  // Was `dailyExpenseRate(horizonData.effectiveInput?.monthlyExpenses ?? 0)` —
  // de EFFECTIVE grondslag (losse huidige kalendermaand, of de profielschatting
  // bij `income_source='manual'`). Die conversie is met KRUIS-17/20 juist
  // afgeschaft: vroeg in de maand kan hij een factor 20+ te laag uitvallen,
  // waardoor élke vrijheidsregel in de optimizer-katernen een ander aantal jaren
  // toonde dan de widget met hetzelfde bedrag. Dit tarief stroomt door naar
  // `optimizer-client` → `optimizer-levenslang` (alle `vrijheid()`-regels,
  // inclusief de verschilrijen) en naar `generateBox3Strategies`.
  //
  // `box3.dailyExpenses` WAS hier een gevaarlijke terugval: de som van
  // budget-LIMIETEN gedeeld door 30 — een andere teller én een andere noemer
  // (op productie gemeten −68% tot +441%). Sinds M22 is dat exact hetzelfde
  // object als hierboven (we geven het zelfs dóór aan `loadPerspectiveBox3`),
  // dus de `||`-terugval is nu een identiteit en geen tweede koers meer.
  const canonicalDaily = horizonData.dailyExpenseRate || box3.dailyExpenses

  // ── Verwacht beleggingsrendement (aanname achter het netto effect) ────
  // CONSUMEER `fireParams`, leid niet opnieuw af: `loadHorizonData` heeft
  // `resolveFireParams(profile)` al gedraaid, dus `grossReturn` ís de
  // geresolvede gebruikerswaarde (profiel-instelling, of DEFAULT_RETURN als
  // terugval). Een tweede `resolveFireParams`-aanroep hier zou dezelfde
  // grootheid een tweede bron geven — precies de drift die deze wijziging
  // opheft: de optimizer rekende met een hardcoded 7% terwijl de
  // FIRE-/horizon-projectie van dezelfde gebruiker met zijn eigen percentage
  // rekende, waardoor het netto effect (en dus de rangschikking en de
  // "grootste kans") structureel verkeerd kon uitvallen.
  const expectedReturn = horizonData.fireParams.grossReturn
  const expectedReturnIsPersonal = expectedReturn !== DEFAULT_RETURN

  // Scenario-generatie is doel-onafhankelijk (één keer); de ranking per doel
  // gebeurt server-side.
  const { baseline, strategies, shiftCurve } = generateBox3Strategies({
    goalId: DEFAULT_GOAL_ID,
    year,
    dailyExpenses: canonicalDaily,
    hasPartner: current.hasPartner,
    current,
    optimalAllocation,
    expectedReturn,
  })

  // ── Box 1-inputs voor het jaarruimte-doel ─────────────────────────────
  // EIGEN persoon only — jaarruimte is per-persoon (ADR 0036), geen partner.
  // `resolveBox1GrossIncome` is de canonieke bruto-bron: hij kent de handmatige
  // `profiles.box1_gross_income`-override én de schijfinversie van de
  // cashflow-schatting. Dit is bewust NIET `box1JaarruimteStatus` — die is een
  // sync status-heuristiek voor de sidebar-dot (netto/(1−marginaal), geen
  // DB-read) en kent de override niet.
  //
  // De eigen woning is de TWEEDE helft van diezelfde Box 1-invoer en komt uit
  // dezelfde resolutielaag (`resolveEigenWoningBox1Input`, naast de bruto-bron).
  // Bevinding C8: die stond hier NIET, terwijl de Box 1-subpagina 'm wél
  // meegaf — zelfde motor, zelfde bruto, twee heffingen. Parallel opgehaald:
  // twee onafhankelijke bronnen, geen extra serieel wachtblok.
  const [grossResolution, eigenWoning] = await Promise.all([
    user ? resolveBox1GrossIncome(supabase, user.id, year) : Promise.resolve(null),
    user ? resolveEigenWoningBox1Input(supabase) : Promise.resolve(GEEN_EIGEN_WONING),
  ])
  const grossYearly = grossResolution?.grossYearly ?? 0
  const pensionFactorA = horizonData.pensioenFactorA
  // NULL ≠ 0 (bevinding H23): dezelfde `JaarruimteCard` hangt óók in de fiscale
  // optimizer, dus de "factor A onbekend → bovengrens"-markering moet dáár uit
  // dezelfde bundelbron komen als op de Box 1-subpagina. Anders toont het ene
  // oppervlak de onzekerheid en het andere niet.
  const pensionFactorAKnown = horizonData.pensioenFactorAKnown

  const jaarruimte = computeJaarruimte(grossYearly, pensionFactorA, year)
  const jaarruimteSavings = jaarruimteBesparing(grossYearly, jaarruimte.jaarruimte, year)
  const jaarruimteFreedomDays =
    canonicalDaily > 0 ? Math.round(jaarruimteSavings / canonicalDaily) : 0

  // Box 1-heffing over dezelfde bruto-grondslag ÉN dezelfde eigen-woning-invoer
  // als /overzicht/belasting/box1 — daarmee is `box1Tax` hier A=B met de
  // subpagina (bevinding C8). Vóór deze fix ontbrak de eigenwoning-invoer,
  // waardoor de aftrekpost wegviel en de hub-heffing structureel te HOOG stond
  // (en bij een (bijna) afgeloste hypotheek — forfait > rente, Wet Hillen —
  // juist te laag). `dailyExpenses` voedt alleen de (hier ongebruikte)
  // vrijheidsdagen-velden van de motor; `tax` is er onafhankelijk van.
  //
  // ÉÉN motoraanroep, DRIE uitkomsten (bevinding C9): heffing, effectief tarief
  // en marginaal tarief komen alle drie uit dit ene resultaat. Zo kan de hub
  // geen tarief tonen dat bij een andere heffing hoort, en is de gate
  // "inkomen bekend" (grossYearly > 0) er precies één — valt die dicht, dan
  // vallen heffing én beide tarieven samen weg (bevinding M4).
  const box1Result =
    grossYearly > 0
      ? computeBox1Tax({
          grossYearlyIncome: grossYearly,
          year,
          wozValue: eigenWoning.wozValue,
          hypotheekRente: eigenWoning.hypotheekRente,
          dailyExpenses: canonicalDaily,
        })
      : null
  const box1Tax = box1Result != null ? Math.round(box1Result.tax) : null
  const box1EffectiveRate = box1Result?.effectiveRate ?? null
  const box1MarginalRate = box1Result?.marginalRate ?? null

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
          pensionFactorAKnown,
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
    expectedReturn,
    expectedReturnIsPersonal,
    grossYearly,
    pensionFactorA,
    jaarruimte,
    jaarruimteSavings,
    box1Tax,
    box1EffectiveRate,
    box1MarginalRate,
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
