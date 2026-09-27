/**
 * Rijwaarden en kopij van katern Instellingen (ADR 0179 fase 3; herontwerp R1 "checklist
 * van je plan", 27 sep 2026) en van het blok Levensstrategieën op katern Plan.
 *
 * Per rij één korte leesregel: waar de app nu mee rekent, en of dat een eigen keuze, de
 * standaard of iets ontbrekends is (`rijStaat`). Alles uit de bestaande bundel
 * (profielrij, plan, onttrekking, pot-regels, markt-aannames, beheerde gebeurtenissen) —
 * hier wordt niets berekend (consume, don't recompute). Eén uitzondering op "tekst": een
 * bedrag gaat als `{ bedrag }` mee, zodat de rij het gemaskeerd kan tonen; de vrijheidstijd
 * erbij komt uit de canonieke helper `freedomDaysToday` met het dagtarief uit de bundel.
 *
 * Twee regels uit de spec:
 *  - Een rijwaarde noemt geen getal dat de kop al zegt (§4.9): de rij Stopmoment toont de
 *    KEUZE ("zo vroeg mogelijk"), nooit de opgeloste vrijheidsleeftijd.
 *  - Taal beschrijvend, geen imperatief (ADR 0165, kopij-toets): "stopmoment", niet "stoppen op".
 *
 * Pure module: geen React, geen Supabase. De teksten staan hier (eigen kopij van het
 * katern) en gaan nog langs merkstem en compliance.
 */

import type { FirePlan, FireStrategyConfig } from '@/lib/fire-strategy'
import { STOP_ANCHOR_OPTIONS, formatPlanAge } from '@/lib/horizon/plan-draft'
import type { WithdrawalProfiel, WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import {
  DEFAULT_GROUP_ORDER,
  POT_RULES_DEFAULTS,
  WITHDRAWAL_ORDER_PRESETS,
  detectOrderPreset,
  type PotRulesConfig,
  type SurplusGroup,
} from '@/lib/pot-rules'
import { WEALTH_GROUP_LABELS, type WealthGroup } from '@/lib/wealth-composition'
import { BOX3_METHOD_LABELS } from '@/lib/box3-method'
import type { Box3Method } from '@/lib/bucket-projection'
import { HOUSING_STRATEGY_LABELS, type HousingStrategyConfig } from '@/lib/housing-strategy'
import type { LifeEvent } from '@/lib/horizon-data'
import type { FreedomRateSource } from '@/lib/format'
import { DEFAULT_RETURN, INFLATION } from '@/lib/constants'
import { freedomDaysToday } from '@/lib/horizon/vrijheidsdagen'
import { ORDER_PRESET_COPY } from '@/lib/future/order-preset-copy'
import type { LevensstrategieRij, RijSectie, RijSleutel } from './instellingen-rij'

// ── Kopij ──────────────────────────────────────────────────────────────────

export const INSTELLINGEN_SECTIE_KOP: Record<RijSectie, string> = {
  plan: 'Je plan',
  potten: 'Hoe je potten meebewegen',
  markt: 'Marktaannames',
  levensstrategieen: 'Je levensstrategieën',
}

/** De kicker boven de sectiekop (mono, klein) — waar de sectie over gaat, in twee woorden. */
export const INSTELLINGEN_SECTIE_KICKER: Record<RijSectie, string> = {
  plan: 'Wanneer en hoelang',
  potten: 'Waar je geld heen gaat',
  markt: 'Waar de app mee rekent',
  levensstrategieen: 'Wat later binnenkomt',
}

export const INSTELLINGEN_SECTIE_DECK: Record<RijSectie, string> = {
  plan: 'Wanneer je stopt, tot wanneer je geld moet reiken en hoe je het opneemt.',
  potten:
    'Welke pot eerst aan de beurt is als je geld opneemt of iets tegenvalt, waar een overschot heen gaat, en of je plan een tekort mag overbruggen.',
  markt: 'De aannames over prijzen, rendement en belasting waar je hele plan mee rekent.',
  levensstrategieen: 'Wat er later binnenkomt of vrijkomt: je AOW, je pensioen, je werk en je huis.',
}

export const RIJ_LABEL: Record<RijSleutel, string> = {
  stopmoment: 'Stopmoment',
  eindleeftijd: 'Einde van je plan',
  onttrekking: 'Onttrekking',
  'uitgave-na-pensioen': 'Uitgave na pensioen',
  'geen-tekort-lening': 'Geen tekort-lening',
  onttrekkingsvolgorde: 'Onttrekkingsvolgorde',
  'verdeling-toename': 'Verdeling bij toename',
  'onttrekking-afname': 'Onttrekking bij afname',
  aow: 'AOW',
  pensioen: 'Pensioen',
  werk: 'Werk',
  huis: 'Eigen woning',
  inflatie: 'Inflatie',
  rendement: 'Rendement',
  box3: 'Box 3',
}

/** Hint onder de inflatie-rij: de verdieping (besluit §11 #8). */
export const INFLATIE_LINK = { label: 'Wat doet inflatie met je plan?', href: '/toekomst/inflatie-koopkracht' } as const
/** Hint onder de rendement-rij: het rendement per bezitting gaat vóór. */
export const RENDEMENT_HINT = {
  voor: 'Geldt voor bezittingen zonder eigen rendement. Een rendement dat je bij ',
  link: { label: 'je bezittingen', href: '/overzicht/bezittingen' },
  na: ' invult, gaat vóór.',
} as const

/** Stille markering op een rij die de wizard nog niet bevestigd heeft. */
export const NOG_NIET_BEVESTIGD = 'nog niet bevestigd'
/** Het woord achter een waarde die de standaard van de app is. */
export const STANDAARD = 'standaard'
/** De actie op een rij waar nog iets ontbreekt (in plaats van ✎). */
export const TOEVOEGEN = 'Toevoegen'

/**
 * De duidingsregel bovenaan Instellingen bij een plan dat niet (volledig) haalbaar is: de
 * titel van de bestaande Plan-melding, gevolgd door BEIDE vervolgacties van die melding in
 * haar volgorde, als neutrale zin ("Verken je opties in Doelen, of pas je stopmoment aan").
 * Geen rangorde, geen advies: dezelfde twee plekken als de melding zelf (review 27 sep).
 */
export const DUIDING_KOPIJ = {
  verken: 'verken je opties in Doelen',
  rij: (label: string) => `pas je ${klein(label)} aan`,
  of: ', of ',
} as const

/** De titel zonder slotpunctuatie (een ankerzin eindigt al op een punt: geen "90e.."). */
export function duidingTitel(titel: string): string {
  return titel.replace(/[\s.…!?]+$/u, '')
}

/**
 * De zinsdeel-tekst voor één vervolgactie van de melding. Een rij-actie (`?rij=`) noemt de
 * rij ("pas je stopmoment aan"), de Doelen-actie het katern; anders het eigen label.
 */
export function duidingActieTekst(actie: { label: string; href: string }, eerste: boolean): string {
  const q = actie.href.split('#')[0].split('?')[1]
  const rij = q ? new URLSearchParams(q).get('rij') : null
  const tekst =
    rij && Object.prototype.hasOwnProperty.call(RIJ_LABEL, rij)
      ? DUIDING_KOPIJ.rij(RIJ_LABEL[rij as RijSleutel])
      : actie.href.split(/[?#]/)[0] === '/toekomst/doelen'
        ? DUIDING_KOPIJ.verken
        : klein(actie.label)
  return eerste ? tekst.charAt(0).toUpperCase() + tekst.slice(1) : tekst
}

/**
 * De knoptekst van de wizard-ingang volgt de stand: niets bevestigd → "Beginnen",
 * deels → "Verder", alles → "Opnieuw doorlopen".
 */
export function wizardIngangActie(progress: { bevestigd: number; voltooid: boolean }): string {
  if (progress.voltooid) return 'Opnieuw doorlopen'
  return progress.bevestigd === 0 ? 'Beginnen' : 'Verder'
}

// ── Waarden ────────────────────────────────────────────────────────────────

/** Eén deel van een rijwaarde: tekst, of een bedrag dat gemaskeerd getoond wordt. */
export type RijDeel =
  | string
  | {
      bedrag: number
      achter?: string
      /**
       * Vrijheidstijd van dit bedrag in dagen (`freedomDaysToday`, dagtarief uit de bundel);
       * `null`/weg = geen regel (geen dagtarief of een bedrag van nul).
       */
      vrijheidsdagen?: number | null
    }

/** Ingesteld (eigen keuze), de standaard van de app, of nog niet ingevuld. */
export type RijStaat = 'ingesteld' | 'standaard' | 'ontbreekt'

/** Wat de levensstrategie-rijen lezen (ook op katern Plan beschikbaar). */
export interface LevensRijInput {
  events: readonly LifeEvent[]
  housingStrategy: HousingStrategyConfig | null
  /**
   * Staat er een eigen woonstrategie op het profiel (`housing_strategy_config` gezet)? De
   * bundel levert altijd een geparste config (met default), dus "standaard" is alleen aan de
   * rauwe kolom te zien. Weggelaten = afgeleid uit `housingStrategy != null`.
   */
  woonstrategieGekozen?: boolean
}

export interface RijwaardenInput extends LevensRijInput {
  firePlan: FirePlan | null
  fireStrategy: FireStrategyConfig
  withdrawalProfiel: WithdrawalProfiel
  withdrawalStrategy: WithdrawalStrategyConfig
  /** `profiles.retirement_expense_method`. */
  retirementMethod: string | null
  /** De uitgave na pensioen per jaar — dezelfde bron als KPI 4 (`effectiveInput.yearlyMustExpenses`). */
  uitgaveNaPensioen: number
  /** `profiles.fire_no_deficit_loan !== false` (NULL = aan, ADR 0149). */
  geenTekortLening: boolean
  /**
   * De tekort-leningrente waar de kern mee rekent (fractie): `resolveDeficitLoanRate` op de
   * profielrij — default én klem 0..1 zitten dáár, niet hier (review Y2).
   */
  tekortLeningRente: number
  potRules: PotRulesConfig
  inflationRate: number
  grossReturn: number
  box3Method: Box3Method
  /** Het canonieke dagtarief uit de bundel (`HorizonPageData.dailyExpenseRate`). */
  dagtarief: number
  /** Grondslag van dat dagtarief (ADR 0131: `none` = geen vrijheidstijd). */
  dagtariefBron?: FreedomRateSource
}

const PROFIEL_LABEL: Record<WithdrawalProfiel, string> = {
  vast: 'vast bedrag',
  afnemend: 'afnemend',
  oplopend: 'oplopend',
  guardrails: 'guardrails',
}

const METHODE_LABEL: Record<string, string> = {
  essential_budgets: 'je essentiële budgetten',
  custom_amount: 'een eigen bedrag',
  current_income: 'je huidige inkomen',
}

/** "2,0%" — nl-NL, één decimaal. */
export function pct(fractie: number, decimalen = 1): string {
  return `${(fractie * 100).toFixed(decimalen).replace('.', ',')}%`
}

function klein(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1)
}

function volgorde(groups: readonly WealthGroup[], max = 3): string {
  const l = groups.map((g) => klein(WEALTH_GROUP_LABELS[g]))
  return l.length <= max ? l.join(' → ') : `${l.slice(0, max).join(' → ')} → …`
}

function overschot(s: SurplusGroup): string {
  return s === 'schuld_aflossen' ? 'schulden aflossen' : `naar ${klein(WEALTH_GROUP_LABELS[s])}`
}

function zelfdeVolgorde(a: readonly WealthGroup[], b: readonly WealthGroup[]): boolean {
  return a.length === b.length && a.every((g, i) => g === b[i])
}

/** Stopmoment: de keuze, nooit de opgeloste leeftijd (die staat in de kop). */
function stopmoment(plan: FirePlan | null): string {
  if (!plan || plan.anchor.kind === 'solved') return ZO_VROEG_MOGELIJK
  const a = plan.anchor
  if (a.kind === 'age') return `op ${formatPlanAge(a.age)}`
  const opt = STOP_ANCHOR_OPTIONS.find((o) => o.kind === a.kind)
  // De optienaam is een keuze in ik-vorm ("Op mijn AOW-leeftijd"); de samenvattingsrij
  // spreekt in je-vorm, net als "tot je 90e" en "vermogen blijft staan" (kopij §12).
  return opt ? klein(opt.name).replace(/\bmijn\b/g, 'je') : ZO_VROEG_MOGELIJK
}

/** Dezelfde woorden als de aannamesregel op Plan ("stopmoment zo vroeg mogelijk"). */
export const ZO_VROEG_MOGELIJK = 'zo vroeg mogelijk'

/** "Einde van je plan": tot welke leeftijd, en wat er dan over is. */
function eind(plan: FirePlan | null, fs: FireStrategyConfig): RijDeel[] {
  const endForm = plan?.endForm ?? (fs.strategy === 'legacy' || fs.strategy === 'perpetual' ? fs.strategy : 'deplete')
  const endAge = plan?.endAge ?? fs.endAge
  const legacy = plan?.legacyAmount ?? fs.legacyAmount
  if (endForm === 'perpetual') return ['vermogen blijft staan']
  const tot = `tot ${endAge}`
  return [tot, { bedrag: endForm === 'legacy' ? legacy : 0, achter: 'over' }]
}

/** De onttrekkingsvolgorde als presetnaam ("Spaargeld eerst"), anders de eigen volgorde. */
function onttrekkingsvolgorde(groups: readonly WealthGroup[]): string {
  const preset = detectOrderPreset([...groups], WITHDRAWAL_ORDER_PRESETS)
  return preset === 'aangepast' ? volgorde(groups) : ORDER_PRESET_COPY[preset].title
}

/** De waarde van een levensstrategie-rij — alleen gebeurtenissen en woonstrategie nodig. */
export function levensstrategieRijwaarde(rij: LevensstrategieRij, i: LevensRijInput): RijDeel[] {
  switch (rij) {
    case 'aow': {
      const e = i.events.find((ev) => ev.event_type === 'aow' && ev.is_active !== false)
      if (!e) return ['nog niet op je tijdas']
      const leef = (e.metadata as { leefsituatie?: string } | null)?.leefsituatie === 'alleenstaand' ? 'alleenstaand' : 'samenwonend'
      return [e.target_age != null ? `vanaf ${e.target_age}` : 'wettelijke leeftijd', leef]
    }
    case 'pensioen': {
      const n = i.events.filter((ev) => ev.event_type === 'pension' && ev.is_active !== false).length
      return [n === 0 ? 'nog geen pensioenpotten' : n === 1 ? '1 pensioenpot' : `${n} pensioenpotten`]
    }
    case 'werk':
      return [i.events.some((ev) => ev.event_type === 'werk' && ev.is_active !== false) ? 'inkomenslijn ingesteld' : 'nog niet ingesteld']
    case 'huis':
      return [klein(HOUSING_STRATEGY_LABELS[i.housingStrategy?.mode ?? 'include_full'])]
  }
}

/** Ingesteld, standaard of ontbrekend — voor een levensstrategie-rij. */
export function levensstrategieRijStaat(rij: LevensstrategieRij, i: LevensRijInput): RijStaat {
  switch (rij) {
    case 'aow':
      return i.events.some((ev) => ev.event_type === 'aow' && ev.is_active !== false) ? 'ingesteld' : 'ontbreekt'
    case 'pensioen':
      return i.events.some((ev) => ev.event_type === 'pension' && ev.is_active !== false) ? 'ingesteld' : 'ontbreekt'
    case 'werk':
      return i.events.some((ev) => ev.event_type === 'werk' && ev.is_active !== false) ? 'ingesteld' : 'ontbreekt'
    case 'huis':
      return (i.woonstrategieGekozen ?? i.housingStrategy != null) ? 'ingesteld' : 'standaard'
  }
}

export function rijwaarde(rij: RijSleutel, i: RijwaardenInput): RijDeel[] {
  switch (rij) {
    case 'stopmoment':
      return [stopmoment(i.firePlan)]
    case 'eindleeftijd':
      return eind(i.firePlan, i.fireStrategy)
    case 'onttrekking':
      return i.withdrawalProfiel === 'guardrails'
        ? [PROFIEL_LABEL.guardrails, `vloer ${pct(i.withdrawalStrategy.guardrailFloor, 0)} · plafond ${pct(i.withdrawalStrategy.guardrailCeiling, 0)}`]
        : [PROFIEL_LABEL[i.withdrawalProfiel]]
    case 'uitgave-na-pensioen':
      return [
        METHODE_LABEL[i.retirementMethod ?? 'essential_budgets'] ?? METHODE_LABEL.essential_budgets,
        {
          bedrag: i.uitgaveNaPensioen,
          achter: 'per jaar',
          // Het bedrag staat al in euro's van vandaag (de uitgave-invoer van de kern).
          vrijheidsdagen: freedomDaysToday({
            nominalAmount: i.uitgaveNaPensioen,
            canonicalDailyRate: i.dagtarief,
            source: i.dagtariefBron,
          }),
        },
      ]
    case 'geen-tekort-lening':
      return i.geenTekortLening ? ['aan'] : ['uit', `rente ${pct(i.tekortLeningRente)}`]
    case 'onttrekkingsvolgorde':
      return [onttrekkingsvolgorde(i.potRules.withdrawalOrderGroups)]
    case 'verdeling-toename':
      return [overschot(i.potRules.surplusGroup)]
    case 'onttrekking-afname':
      return [volgorde(i.potRules.deficitOrderGroups)]
    case 'aow':
    case 'pensioen':
    case 'werk':
    case 'huis':
      return levensstrategieRijwaarde(rij, i)
    case 'inflatie':
      return [`${pct(i.inflationRate)} per jaar`]
    case 'rendement':
      return [`${pct(i.grossReturn)} per jaar`]
    case 'box3':
      return [klein(BOX3_METHOD_LABELS[i.box3Method])]
  }
}

/**
 * Ingesteld, standaard of ontbrekend. "Standaard" alleen waar de app een eigen default
 * heeft (pot-regels, tekort-lening, stopmoment, markt-aannames); de rest is een keuze.
 */
export function rijStaat(rij: RijSleutel, i: RijwaardenInput): RijStaat {
  switch (rij) {
    case 'stopmoment':
      return !i.firePlan || i.firePlan.anchor.kind === 'solved' ? 'standaard' : 'ingesteld'
    case 'uitgave-na-pensioen':
      return i.uitgaveNaPensioen > 0 ? 'ingesteld' : 'ontbreekt'
    case 'geen-tekort-lening':
      return i.geenTekortLening ? 'standaard' : 'ingesteld'
    case 'onttrekkingsvolgorde':
      return zelfdeVolgorde(i.potRules.withdrawalOrderGroups, DEFAULT_GROUP_ORDER) ? 'standaard' : 'ingesteld'
    case 'verdeling-toename':
      return i.potRules.surplusGroup === POT_RULES_DEFAULTS.surplusGroup ? 'standaard' : 'ingesteld'
    case 'onttrekking-afname':
      return zelfdeVolgorde(i.potRules.deficitOrderGroups, DEFAULT_GROUP_ORDER) ? 'standaard' : 'ingesteld'
    case 'aow':
    case 'pensioen':
    case 'werk':
    case 'huis':
      return levensstrategieRijStaat(rij, i)
    case 'inflatie':
      return Math.abs(i.inflationRate - INFLATION) < 1e-9 ? 'standaard' : 'ingesteld'
    case 'rendement':
      return Math.abs(i.grossReturn - DEFAULT_RETURN) < 1e-9 ? 'standaard' : 'ingesteld'
    case 'box3':
      return i.box3Method === 'forfaitair' ? 'standaard' : 'ingesteld'
    case 'eindleeftijd':
    case 'onttrekking':
      return 'ingesteld'
  }
}

/** Samenvatting van een ingeklapte sectie: "4 regels · alle standaard" of "1 aangepast". */
export function sectieSamenvatting(rijen: readonly RijSleutel[], i: RijwaardenInput): string {
  const aangepast = rijen.filter((r) => rijStaat(r, i) === 'ingesteld').length
  if (aangepast === 0) return `${rijen.length} regels · alle standaard`
  return `${rijen.length} regels · ${aangepast} aangepast`
}

/** Platte tekst (tests, schermlezer-samenvatting). Bedragen als "€ n". */
export function rijwaardeTekst(delen: readonly RijDeel[], formatBedrag: (n: number) => string): string {
  return delen
    .map((d) => (typeof d === 'string' ? d : `${formatBedrag(d.bedrag)}${d.achter ? ` ${d.achter}` : ''}`))
    .join(' · ')
}
