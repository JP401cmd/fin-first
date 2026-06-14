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

/** Hoofdstuk 1 — Opbouw. */
export interface OpbouwData {
  /** Startvermogen = vermogen vandaag (rows[0].startPortfolio). */
  startPortfolio: number
  /** Representatieve jaarlijkse inleg, ×12 voor weergave (zoals de Kassabon). */
  yearlyInleg: number
  /** Gemiddelde jaarlijkse groei (rendement) over de opbouwjaren. */
  averageGrowth: number
  /** Aantal opbouwjaren. */
  opbouwjaren: number
  /** Vermogen aan het einde van de opbouwfase (= vermogen op FIRE-moment, indien bereikbaar). */
  endOfAccumulation: number
}

/** Hoofdstuk 2 — Terugrekening (benodigd vermogen / V_nodig). */
export interface TerugrekeningData {
  /** Ankerbedrag: het door de simulatie berekende benodigd vermogen. */
  requiredFirePortfolio: number
  /** Klassiek 25× doel ter vergelijking (4%-regel). */
  classic25xTarget: number
  /** Of er periodieke inkomstenbodem (AOW/pensioen) meespeelt — dan daalt V_nodig sterker. */
  hasIncomeFloor: boolean
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
  /** Aantal onttrekkings-/behoudjaren (transition + withdrawal rows). */
  withdrawalYears: number
  /** Display-eindleeftijd van de projectie. */
  displayEndAge: number
  /** Doel-eindvermogen (legacy/pensioen) — 0 voor deplete/perpetual. */
  targetEndPortfolio: number
  /** Impact-markers (AOW/pensioen + levensgebeurtenissen) die de opname beïnvloeden. */
  impacts: OnttrekkingImpact[]
  /** Strategie-afhankelijke afsluitende zin. */
  closingSentence: string
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
export function unreachableMessageFor(strategy: FireEndStrategy, displayEndAge: number): string {
  switch (strategy) {
    case 'legacy':
      return `Je haalt je nalatenschapsdoel niet binnen je projectie (tot leeftijd ${displayEndAge}). Verlaag het nalatenschapsbedrag, verhoog je spaarquote of verlaag je uitgaven.`
    case 'perpetual':
      return `Je vermogen is niet groot genoeg om er blijvend van te leven binnen je projectie (tot leeftijd ${displayEndAge}). Verhoog je spaarquote of verlaag je uitgaven.`
    case 'pensioen':
      return `Je haalt je doel niet binnen je projectie (tot leeftijd ${displayEndAge}). Verhoog je spaarquote of verlaag je uitgaven.`
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
): string {
  switch (strategy) {
    case 'perpetual':
      return 'Je leeft alleen van het rendement, zodat je koopkracht behouden blijft — je vermogen raakt nooit op.'
    case 'legacy':
      return `Je houdt bewust vermogen over: een nalatenschap van zo'n ${Math.round(targetEndPortfolio).toLocaleString('nl-NL')} euro op leeftijd ${displayEndAge}.`
    case 'pensioen':
      return targetEndPortfolio > 0
        ? `Je onttrekt een vast bedrag; wat overblijft (zo'n ${Math.round(targetEndPortfolio).toLocaleString('nl-NL')} euro op leeftijd ${displayEndAge}) is je nalatenschap.`
        : `Je onttrekt een vast bedrag op basis van je ingestelde jaarbudget tot leeftijd ${displayEndAge}.`
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

// ── Hoofd-afleiding ──────────────────────────────────────────────────────────

/**
 * Leidt alle per-hoofdstuk-cijfers af uit een SimResult + cashflows.
 * Pure functie: zelfde input → zelfde output, geen side-effects.
 */
export function deriveChapterData(
  simResult: SimResult,
  cashflows: SimCashflow[],
): ChapterData {
  const {
    rows,
    fireAge,
    fireAgeFractional,
    fireReachable,
    firePortfolioAtFire,
    requiredFirePortfolio,
    classic25xTarget,
    implicitWithdrawalRate,
    strategy,
    displayEndAge,
    targetEndPortfolio,
  } = simResult

  const accumulationRows: SimRow[] = rows.filter(r => r.phase === 'accumulation')
  const retirementRows: SimRow[] = rows.filter(r => r.phase === 'retirement')

  const startPortfolio = rows[0]?.startPortfolio ?? 0
  // Representatieve maandelijkse inleg uit de eerste opbouwrij ×12 (zoals Kassabon).
  const repMonthlySavings = accumulationRows[0]?.savings ?? 0
  const yearlyInleg = repMonthlySavings * 12
  const averageGrowth = mean(accumulationRows.map(r => r.growth))
  // Vermogen aan het einde van de opbouw = laatste opbouwrij-eind, of (bij 0
  // opbouwjaren) het startvermogen zelf.
  const endOfAccumulation = accumulationRows.length > 0
    ? accumulationRows[accumulationRows.length - 1].endPortfolio
    : startPortfolio

  // Inkomensbodem aanwezig? (AOW/pensioen of welke periodieke inkomstenflow dan ook)
  const hasIncomeFloor = cashflows.some(
    cf => cf.type === 'recurring' && cf.direction === 'income',
  )

  const impacts = buildImpacts(cashflows, fireAge, displayEndAge)

  return {
    opbouw: {
      startPortfolio,
      yearlyInleg,
      averageGrowth,
      opbouwjaren: accumulationRows.length,
      endOfAccumulation,
    },
    terugrekening: {
      requiredFirePortfolio,
      classic25xTarget,
      hasIncomeFloor,
    },
    snijpunt: {
      reachable: fireReachable,
      fireAgeFractional: fireReachable ? fireAgeFractional : null,
      firePortfolioAtFire,
      implicitWithdrawalRate,
      unreachableMessage: fireReachable
        ? null
        : unreachableMessageFor(strategy, displayEndAge),
    },
    onttrekking: {
      strategy,
      withdrawalYears: retirementRows.length,
      displayEndAge,
      targetEndPortfolio,
      impacts,
      closingSentence: closingSentenceFor(strategy, displayEndAge, targetEndPortfolio),
    },
  }
}
