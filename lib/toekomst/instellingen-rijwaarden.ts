/**
 * Rijwaarden en kopij van katern Instellingen (ADR 0179 fase 3).
 *
 * Per rij één korte leesregel: waar de app nu mee rekent. Alles uit de bestaande bundel
 * (profielrij, plan, onttrekking, pot-regels, markt-aannames, beheerde gebeurtenissen) —
 * hier wordt niets berekend (consume, don't recompute). Eén uitzondering op "tekst": een
 * bedrag gaat als `{ bedrag }` mee, zodat de rij het gemaskeerd kan tonen.
 *
 * Twee regels uit de spec:
 *  - Een rijwaarde noemt geen getal dat de kop al zegt (§4.9): de rij Stopmoment toont de
 *    KEUZE ("zo vroeg als het kan"), nooit de opgeloste vrijheidsleeftijd.
 *  - Taal beschrijvend, geen imperatief (ADR 0165, kopij-toets): "stopmoment", niet "stoppen op".
 *
 * Pure module: geen React, geen Supabase. De teksten staan hier (eigen kopij van het
 * katern) en gaan nog langs merkstem en compliance.
 */

import type { FirePlan, FireStrategyConfig } from '@/lib/fire-strategy'
import { STOP_ANCHOR_OPTIONS, formatPlanAge } from '@/lib/horizon/plan-draft'
import type { WithdrawalProfiel, WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import type { PotRulesConfig, SurplusGroup } from '@/lib/pot-rules'
import { WEALTH_GROUP_LABELS, type WealthGroup } from '@/lib/wealth-composition'
import { BOX3_METHOD_LABELS } from '@/lib/box3-method'
import type { Box3Method } from '@/lib/bucket-projection'
import { HOUSING_STRATEGY_LABELS, type HousingStrategyConfig } from '@/lib/housing-strategy'
import type { LifeEvent } from '@/lib/horizon-data'
import type { RijSectie, RijSleutel } from './instellingen-rij'

// ── Kopij ──────────────────────────────────────────────────────────────────

export const INSTELLINGEN_SECTIE_KOP: Record<RijSectie, string> = {
  plan: 'Je plan',
  levensstrategieen: 'Levensstrategieën',
  markt: 'Marktaannames',
}

export const INSTELLINGEN_SECTIE_DECK: Record<RijSectie, string> = {
  plan: 'Wanneer je stopt, tot wanneer je geld moet reiken en hoe je het opneemt.',
  levensstrategieen: 'Wat er later binnenkomt of vrijkomt: je AOW, je pensioen, je werk en je huis.',
  markt: 'De aannames over prijzen, rendement en belasting waar je hele plan mee rekent.',
}

export const RIJ_LABEL: Record<RijSleutel, string> = {
  stopmoment: 'Stopmoment',
  eindleeftijd: 'Tot welke leeftijd, en wat blijft over',
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

/** Titel van de disclosure in Eenvoudig (ADR 0026: bedieningsvlak → `DepthSection`). */
export const MEER_OVER_JE_PLAN = 'Meer over je plan'
/** Leesrij zonder ✎ in Marktaannames. */
export const EFFECTIEF_SWR_LABEL = 'Opnamerate (afgeleid)'
export const EFFECTIEF_SWR_HINT = 'volgt uit rendement, inflatie en Box 3'
/** Link onder de inflatie-rij (besluit §11 #8). */
export const INFLATIE_LINK = { label: 'Wat doet inflatie met je plan?', href: '/toekomst/inflatie-koopkracht' } as const

// ── Waarden ────────────────────────────────────────────────────────────────

/** Eén deel van een rijwaarde: tekst, of een bedrag dat gemaskeerd getoond wordt. */
export type RijDeel = string | { bedrag: number; achter?: string }

export interface RijwaardenInput {
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
  /** `profiles.deficit_loan_rate` (fractie) of null (Excel-default). */
  tekortLeningRente: number | null
  potRules: PotRulesConfig
  events: readonly LifeEvent[]
  housingStrategy: HousingStrategyConfig | null
  inflationRate: number
  grossReturn: number
  effectiveSwr: number
  box3Method: Box3Method
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

/** Stopmoment: de keuze, nooit de opgeloste leeftijd (die staat in de kop). */
function stopmoment(plan: FirePlan | null): string {
  if (!plan) return 'zo vroeg als het kan'
  const a = plan.anchor
  if (a.kind === 'age') return `op ${formatPlanAge(a.age)}`
  const opt = STOP_ANCHOR_OPTIONS.find((o) => o.kind === a.kind)
  return opt ? klein(opt.name) : 'zo vroeg als het kan'
}

function eind(plan: FirePlan | null, fs: FireStrategyConfig): RijDeel[] {
  const endForm = plan?.endForm ?? (fs.strategy === 'legacy' || fs.strategy === 'perpetual' ? fs.strategy : 'deplete')
  const endAge = plan?.endAge ?? fs.endAge
  const legacy = plan?.legacyAmount ?? fs.legacyAmount
  if (endForm === 'perpetual') return ['je vermogen mag niet slinken']
  const tot = `tot je ${endAge}e`
  if (endForm === 'legacy') return [tot, { bedrag: legacy, achter: 'over' }]
  return [tot, 'niets over']
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
        { bedrag: i.uitgaveNaPensioen, achter: 'per jaar' },
      ]
    case 'geen-tekort-lening':
      return i.geenTekortLening ? ['aan'] : ['uit', `rente ${pct(i.tekortLeningRente ?? 0.05)}`]
    case 'onttrekkingsvolgorde':
      return [volgorde(i.potRules.withdrawalOrderGroups)]
    case 'verdeling-toename':
      return [overschot(i.potRules.surplusGroup)]
    case 'onttrekking-afname':
      return [volgorde(i.potRules.deficitOrderGroups)]
    case 'aow': {
      const e = i.events.find((ev) => ev.event_type === 'aow' && ev.is_active !== false)
      if (!e) return ['niet op je tijdas']
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
    case 'inflatie':
      return [`${pct(i.inflationRate)} per jaar`]
    case 'rendement':
      return [`${pct(i.grossReturn)} per jaar`]
    case 'box3':
      return [klein(BOX3_METHOD_LABELS[i.box3Method])]
  }
}

/** Platte tekst (tests, schermlezer-samenvatting). Bedragen als "€ n". */
export function rijwaardeTekst(delen: readonly RijDeel[], formatBedrag: (n: number) => string): string {
  return delen
    .map((d) => (typeof d === 'string' ? d : `${formatBedrag(d.bedrag)}${d.achter ? ` ${d.achter}` : ''}`))
    .join(' · ')
}
