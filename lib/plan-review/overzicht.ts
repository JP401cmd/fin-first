/**
 * Plan-review Toekomst (TPR-01, ADR 0142) — de INHOUD van één review-stap.
 *
 * Elke stap draagt drie dingen zichtbaar (eigenaarsnorm formulier-uitleg, 13 sep 2026):
 *  - KEUZE   `rekentNu` + `details` — "De app rekent nu met …", nooit een leeg veld (A3);
 *  - EFFECT  `effect` + `vergelijking` — wat de keuze met de uitkomst doet, in de
 *            effectmaat van de stap (drie treden, TPR-15: vrijheidsleeftijd → tot waar
 *            je liquide vermogen reikt → wat er aan het einde over is) (A4);
 *  - WAAROM  `waarom` — waarom dit ertoe doet.
 *
 * CONSUME, DON'T RECOMPUTE. Elke uitkomst komt uit een kernel-run: de basis is de
 * canonieke run (`computeHorizonFireSim`, dezelfde als de Tijdas), een vergelijking is
 * `runRegelProjection` op de snapshot van díe run met één kandidaat-kolom erop geplakt.
 * Hier wordt geen vermogen, doel of uitputtingsmoment berekend — alleen gelezen en in
 * woorden gezet (`ankerReachFromSim`, `leeftijdJaar`, `formatAowAge`).
 *
 * SCHRIJVEN (A5). `schrijf` is de body voor de BESTAANDE route van het domein, gevuld
 * met de huidige waarde. Bevestigen maakt een stille default daarmee expliciet; er komt
 * geen tweede schrijfpad bij. De markering zelf gaat apart via `PUT /api/plan-review`.
 *
 * TOON (Wft, A8). Beschrijvend: wat de app rekent en wat een andere keuze doet. Nooit
 * "aanbevolen", "past bij jou" of een aansporing tot een product; de woonstrategieën
 * staan in een vaste volgorde zonder rangorde. De kopij is getoetst met de
 * compliance-check (zie ADR 0142).
 *
 * Pure module (geen `'use client'`, geen I/O): de GET-route bouwt, de pane toont.
 */

import { END_AGE_MAX, type FirePlan } from '@/lib/fire-strategy'
import { housingChoiceToConfig } from '@/lib/housing-choice'
import type { SimResult } from '@/lib/fire-simulation'
import type { Asset } from '@/lib/asset-data'
import { ASSET_TYPE_LABELS } from '@/lib/asset-data'
import type { LifeEvent } from '@/lib/horizon-data'
import { formatCurrency } from '@/lib/format'
import { deflate } from '@/lib/euro-display'
import { formatAowAge } from '@/lib/aow-leeftijd'
import { ankerReachFromSim, formatStopAge, type AnkerReach } from '@/lib/horizon/anker-copy'
import { leeftijdJaar } from '@/lib/horizon/leeftijd-jaar'
import {
  END_FORM_OPTIONS,
  STOP_ANCHOR_OPTIONS,
  endFormShowsEndAge,
  planDraftFromPlan,
  planDraftToFireSettingsBody,
  validatePlanDraft,
} from '@/lib/horizon/plan-draft'
import type { RegelProjection, RegelSimOverride } from '@/lib/future/regel-sim'
import {
  DEFAULT_REVERSE_MORTGAGE_CONFIG,
  parseHousingStrategy,
  type HousingStrategyConfig,
  type HousingStrategyMode,
} from '@/lib/housing-strategy'
import { parseSaleConfig, type SaleStand } from '@/lib/sale-config'
import { resolvePotRules, type SurplusGroup } from '@/lib/pot-rules'
import { WEALTH_GROUP_LABELS, type WealthGroup } from '@/lib/wealth-composition'
import {
  resolveWithdrawalProfiel,
  type WithdrawalProfiel,
} from '@/lib/withdrawal-strategy'
import type { RetirementExpenseMethod } from '@/lib/budget-utils'
import { bouwStrategieRij } from '@/lib/life-events/strategie-write'
import { NIET_LIQUIDE_ASSET_TYPES } from './niet-liquide'
import { EFFECT_BEDRAG_AFRONDING, PLAN_REVIEW_STAP_TITELS, type PlanReviewFacts, type PlanReviewStap } from './types'

// ── Contract naar de pane ────────────────────────────────────────────────────

/** De bestaande schrijfroutes die een bevestiging mag raken (A5) — en geen andere. */
export type PlanReviewSchrijfUrl =
  | '/api/fire-settings'
  | '/api/withdrawal-strategy'
  | '/api/pot-rules'
  | '/api/housing-strategy'

export interface PlanReviewSchrijfActie {
  url: PlanReviewSchrijfUrl
  body: Record<string, unknown>
}

export interface PlanReviewRegel {
  label: string
  waarde: string
}

export interface PlanReviewLink {
  href: string
  label: string
}

/** Eén kiesbare optie binnen een stap (stap 4: de vier woonstrategieën naast elkaar). */
export interface PlanReviewKeuze {
  id: string
  label: string
  beschrijving: string
  /** De uitkomst onder deze keuze, uit een kernel-run. */
  uitkomst: string
  /** Rekent de app nu met deze keuze? */
  huidig: boolean
  schrijf: PlanReviewSchrijfActie[]
}

export interface PlanReviewStapOverzicht {
  stap: PlanReviewStap
  titel: string
  /** KEUZE — de opening "De app rekent nu met …". */
  rekentNu: string
  details: PlanReviewRegel[]
  /** EFFECT — zinnen over de uitkomst. */
  effect: string[]
  /** EFFECT — dezelfde uitkomst onder een andere keuze (bereik, geen punt). */
  vergelijking: PlanReviewRegel[]
  /** WAAROM. */
  waarom: string
  /** Kiesbare opties (leeg = alleen bevestigen van de huidige keuze). */
  keuzes: PlanReviewKeuze[]
  /** `true` = er is nog geen keuze; bevestigen vraagt eerst een optie. */
  keuzeVerplicht: boolean
  /** Writes voor "Bevestigen" met de huidige waarde (leeg = alleen de markering). */
  schrijf: PlanReviewSchrijfActie[]
  /** Waarom bevestigen nu niet kan (dan staat de knop uit); `null` = kan. */
  blokkade: string | null
  aanpassen: PlanReviewLink[]
  /** Wat de review hier (nog) niet laat zien — eerlijk benoemd. */
  beperking: string | null
}

// ── Bronnen ──────────────────────────────────────────────────────────────────

export interface PlanReviewBronnen {
  /** De canonieke run (`computeHorizonFireSim().sim`); `null` = geen run mogelijk. */
  sim: SimResult | null
  /** Het plan waarmee die run rekende. */
  firePlan: FirePlan
  /** Fractionele AOW-leeftijd uit dezelfde run. */
  aowAge: number | null
  /** De rauwe profielrij die de kern leest (keuzekolommen). */
  profile: Record<string, unknown> | null
  events: readonly Pick<LifeEvent, 'event_type' | 'is_active' | 'metadata'>[]
  assets: readonly Pick<Asset, 'asset_type' | 'is_active' | 'sale_config'>[]
  /** `KernelInput.inkomenUitgaven.uitgaveNaPensioenPerJaar` (euro's van vandaag). */
  uitgaveNaPensioenPerJaar: number | null
  facts: PlanReviewFacts
  /**
   * Vergelijkingsrun: dezelfde snapshot met één kandidaat-kolom. `null` = geen snapshot,
   * dan valt de vergelijking weg (eerlijk benoemd in de stap).
   */
  run: ((override: RegelSimOverride) => RegelProjection) | null
}

// ── Uitkomst in woorden ──────────────────────────────────────────────────────

type Uitkomst = Pick<RegelProjection, 'fireAgeFractional' | 'reach' | 'eindeLiquide'>

const ONBEKEND = 'nog niet te bepalen'

// Bedragen in de vergelijking afgerond op duizenden (`EFFECT_BEDRAG_AFRONDING`, gedeeld met de
// live footer): een weergavekeuze, geen aanname.

function isVastAnker(plan: FirePlan): boolean {
  return plan.anchor.kind !== 'solved'
}

function uitkomstVanSim(sim: SimResult | null): Uitkomst | null {
  if (!sim) return null
  return {
    fireAgeFractional: sim.fireAgeFractional,
    reach: ankerReachFromSim({
      startAge: sim.rows[0]?.age ?? null,
      kernelDepletionMonth: sim.kernelDepletionMonth,
      endAge: sim.displayEndAge,
    }),
  }
}

/**
 * EFFECTMAAT (besluit eigenaar 13 sep 2026, TPR-15) — drie treden, per stap één keer
 * gekozen op de BASISRUN, zodat alle regels van één vergelijking dezelfde grootheid tonen:
 *
 *  1. `vrijheidsleeftijd` — onder "zo vroeg als het kan", zolang je nog niet kunt stoppen;
 *  2. `reikt-tot`         — onder een vast stopmoment (daar is de vrijheidsleeftijd per
 *                           constructie het stopmoment, ADR 0129), of wanneer je nu al kunt
 *                           stoppen (dan is die bij elke keuze gewoon je huidige leeftijd);
 *  3. `over-aan-einde`    — wanneer het liquide vermogen al tot het einde van het plan reikt,
 *                           zodat ook trede 2 bij elke keuze hetzelfde zegt: wat er dan aan
 *                           liquide vermogen over is, in euro's van vandaag.
 *
 * Een keuze die van de maat afwijkt, zegt dat erbij: hij reikt dan níét meer tot het einde
 * (dan de reikt-frase), of je kunt dan niet meer direct stoppen.
 */
export type EffectMaatKind = 'vrijheidsleeftijd' | 'reikt-tot' | 'over-aan-einde'

export interface EffectMaat {
  kind: EffectMaatKind
  vast: boolean
  /** Leeftijd in rij 0 van de basisrun; `null` = geen run. */
  startLeeftijd: number | null
}

function kanNuStoppen(u: Uitkomst | null, startLeeftijd: number | null): boolean {
  return (
    u?.fireAgeFractional != null &&
    startLeeftijd != null &&
    leeftijdJaar(u.fireAgeFractional) <= leeftijdJaar(startLeeftijd)
  )
}

/**
 * De basis-uitkomst van een stap plus de maat. Trede 3 heeft het liquide eindvermogen
 * nodig; dat draagt de canonieke `SimResult` niet, dus dan leest hij het uit de
 * snapshot-run zónder override (per constructie dezelfde run als de Tijdas).
 */
function basisEnMaat(b: PlanReviewBronnen): { basis: Uitkomst | null; maat: EffectMaat } {
  const vast = isVastAnker(b.firePlan)
  const startLeeftijd = b.sim?.rows[0]?.age ?? null
  let basis = uitkomstVanSim(b.sim)
  if (!basis || (!vast && !kanNuStoppen(basis, startLeeftijd))) {
    return { basis, maat: { kind: 'vrijheidsleeftijd', vast, startLeeftijd } }
  }
  if (basis.reach?.kind === 'gedekt' && b.run) {
    basis = { ...basis, eindeLiquide: b.run({}).eindeLiquide ?? null }
    if (basis.eindeLiquide) return { basis, maat: { kind: 'over-aan-einde', vast, startLeeftijd } }
  }
  return { basis, maat: { kind: 'reikt-tot', vast, startLeeftijd } }
}

function bedragOverFrase(u: Uitkomst): string | null {
  const reach = u.reach
  if (reach?.kind !== 'gedekt' || !u.eindeLiquide) return null
  // Precies één keer deflateren, met de kernel-factor van dezelfde eindrij (ADR 0090).
  const vandaag = deflate(u.eindeLiquide.nominaal, u.eindeLiquide.inflationFactor, 'real')
  const bedrag = formatCurrency(Math.round(vandaag / EFFECT_BEDRAG_AFRONDING) * EFFECT_BEDRAG_AFRONDING)
  // Label = de leeftijd van DEZELFDE rij als het bedrag (de laatste weergaverij, eindleeftijd
  // − 1), niet de eindleeftijd zelf: onder "opmaken" is die per constructie ≈ € 0.
  return `${bedrag} liquide vermogen over in het laatste jaar van je plan (je ${leeftijdJaar(u.eindeLiquide.leeftijd)}e), in euro's van vandaag`
}

/** De uitkomst als korte frase, in de maat van de stap. */
export function uitkomstFrase(u: Uitkomst | null, maat: EffectMaat): string {
  if (!u) return ONBEKEND
  if (maat.kind === 'vrijheidsleeftijd') {
    return u.fireAgeFractional != null
      ? `vrijheidsleeftijd ${leeftijdJaar(u.fireAgeFractional)}`
      : 'geen vrijheidsleeftijd binnen je plan'
  }
  const kern =
    (maat.kind === 'over-aan-einde' ? bedragOverFrase(u) : null) ?? reachFrase(u.reach ?? { kind: 'onbekend' })
  // Onder "zo vroeg als het kan": verschuift deze keuze het stopmoment naar later, zeg dat.
  if (!maat.vast && !kanNuStoppen(u, maat.startLeeftijd)) {
    return u.fireAgeFractional != null
      ? `${kern}; stoppen kan dan pas op je ${leeftijdJaar(u.fireAgeFractional)}e`
      : `${kern}; stoppen kan dan niet binnen je plan`
  }
  return kern
}

function reachFrase(reach: AnkerReach): string {
  switch (reach.kind) {
    case 'gedekt':
      return reach.endAge != null
        ? `liquide vermogen reikt tot het einde van je plan (${leeftijdJaar(reach.endAge)})`
        : 'liquide vermogen reikt tot het einde van je plan'
    case 'reikt-tot':
      return `liquide vermogen reikt tot je ${leeftijdJaar(reach.age)}e`
    case 'nu-op':
      return 'liquide vermogen dekt je uitgaven vanaf vandaag niet'
    case 'onbekend':
      return ONBEKEND
  }
}

/**
 * Numerieke sleutel voor een bereik over keuzes, in de maat van de stap: leeftijd bij
 * trede 1 en 2, afgerond bedrag bij trede 3. Een keuze die in trede 3 níét tot het einde
 * reikt, valt buiten het bedragbereik (`null`) — die noemt zijn eigen frase.
 */
function uitkomstSleutel(u: Uitkomst | null, maat: EffectMaat): number | null {
  if (!u) return null
  if (maat.kind === 'vrijheidsleeftijd') return u.fireAgeFractional != null ? leeftijdJaar(u.fireAgeFractional) : null
  const r = u.reach
  if (maat.kind === 'over-aan-einde') {
    if (r?.kind !== 'gedekt' || !u.eindeLiquide) return null
    const vandaag = deflate(u.eindeLiquide.nominaal, u.eindeLiquide.inflationFactor, 'real')
    return Math.round(vandaag / EFFECT_BEDRAG_AFRONDING) * EFFECT_BEDRAG_AFRONDING
  }
  if (!r) return null
  if (r.kind === 'reikt-tot') return leeftijdJaar(r.age)
  if (r.kind === 'gedekt' && r.endAge != null) return leeftijdJaar(r.endAge)
  return null
}

function hoofdletter(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Alleen de eerste letter klein — "Op mijn AOW-leeftijd" → "op mijn AOW-leeftijd". */
function kleineLetter(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1)
}

// ── Stap 1 — Je plan ─────────────────────────────────────────────────────────

/** Zoveel jaar verder laat de vergelijking het geld reiken. Weergavekeuze, geen aanname. */
const PLAN_VERGELIJKING_EXTRA_JAREN = 5

function stapPlan(b: PlanReviewBronnen): PlanReviewStapOverzicht {
  const plan = b.firePlan
  const draft = planDraftFromPlan(plan)
  const eindvorm = END_FORM_OPTIONS.find((o) => o.form === plan.endForm)?.name ?? plan.endForm
  const stopmoment =
    plan.anchor.kind === 'age'
      ? `op ${formatStopAge(plan.anchor.age)} jaar`
      : (STOP_ANCHOR_OPTIONS.find((o) => o.kind === plan.anchor.kind)?.name ?? plan.anchor.kind)
  const toontEindleeftijd = endFormShowsEndAge(plan.endForm)

  const details: PlanReviewRegel[] = [
    { label: 'Wanneer je stopt', waarde: stopmoment },
    {
      label: 'Tot welke leeftijd je geld moet reiken',
      waarde: toontEindleeftijd ? `${plan.endAge} jaar` : 'geen eindleeftijd',
    },
    { label: 'Wat er dan over moet zijn', waarde: eindvorm },
  ]
  if (plan.endForm === 'legacy') {
    details.push({ label: 'Bedrag dat overblijft', waarde: formatCurrency(plan.legacyAmount) })
  }

  const { basis, maat } = basisEnMaat(b)
  const effect = [`Met dit plan: ${uitkomstFrase(basis, maat)}.`]
  const vergelijking: PlanReviewRegel[] = []
  const langer = plan.endAge + PLAN_VERGELIJKING_EXTRA_JAREN
  if (b.run && basis && toontEindleeftijd && langer <= END_AGE_MAX) {
    const alt = b.run({ firePlan: { ...draft, endAge: langer } })
    vergelijking.push(
      { label: `Geld reikt tot ${plan.endAge} (nu)`, waarde: uitkomstFrase(basis, maat) },
      { label: `Geld reikt tot ${langer}`, waarde: uitkomstFrase(alt, maat) },
    )
  }

  const geldig = validatePlanDraft(draft, { aowAge: b.aowAge })
  return {
    stap: 'plan',
    titel: PLAN_REVIEW_STAP_TITELS.plan,
    rekentNu: toontEindleeftijd
      ? `De app rekent nu met stoppen ${kleineLetter(stopmoment)} en geld dat tot je ${plan.endAge}e moet reiken.`
      : `De app rekent nu met stoppen ${kleineLetter(stopmoment)} en een vermogen dat niet mag slinken.`,
    details,
    effect,
    vergelijking,
    waarom:
      'Je plan legt vast wanneer je stopt, tot welke leeftijd je geld moet reiken en wat er dan over moet zijn. ' +
      'Hoe verder het moet reiken en hoe meer er over moet blijven, hoe meer vermogen de app nodig heeft.',
    keuzes: [],
    keuzeVerplicht: false,
    schrijf: geldig.ok ? [{ url: '/api/fire-settings', body: planDraftToFireSettingsBody(draft) }] : [],
    blokkade: geldig.ok ? null : 'Je plan bevat een combinatie die de app niet kan opslaan. Pas het eerst aan.',
    aanpassen: [{ href: '/toekomst/voorkeuren?regel=eindstrategie', label: 'Plan aanpassen' }],
    beperking: null,
  }
}

// ── Stap 2 — Leven na stoppen ────────────────────────────────────────────────

const RETIREMENT_METHOD_LABELS: Record<RetirementExpenseMethod, string> = {
  essential_budgets: 'je essentiële budgetten',
  custom_amount: 'een eigen bedrag',
  current_income: 'je huidige inkomen',
}

/** Vergelijking: 10% lagere uitgaven na stoppen. Weergavekeuze, geen aanname. */
const UITGAVEN_VERGELIJKING_FACTOR = 0.9
const UITGAVEN_AFRONDING = 100

function retirementMethod(profile: Record<string, unknown> | null): RetirementExpenseMethod {
  const m = profile?.retirement_expense_method
  return m === 'custom_amount' || m === 'current_income' ? m : 'essential_budgets'
}

function stapUitgaven(b: PlanReviewBronnen): PlanReviewStapOverzicht {
  const method = retirementMethod(b.profile)
  const rawCustomValue = b.profile?.retirement_expense_custom_amount
  const rawCustom = rawCustomValue == null ? NaN : Number(rawCustomValue)
  const opgeslagenBedrag = Number.isFinite(rawCustom) && rawCustom > 0 ? rawCustom : null
  const custom = method === 'custom_amount' ? opgeslagenBedrag : null
  const jaar = b.uitgaveNaPensioenPerJaar
  const { basis, maat } = basisEnMaat(b)

  const vergelijking: PlanReviewRegel[] = []
  if (b.run && basis && jaar != null && jaar > 0) {
    const lager = Math.round((jaar * UITGAVEN_VERGELIJKING_FACTOR) / UITGAVEN_AFRONDING) * UITGAVEN_AFRONDING
    const alt = b.run({ retirementExpense: { method: 'custom_amount', customAmount: lager } })
    vergelijking.push(
      { label: `${formatCurrency(jaar)} per jaar (nu)`, waarde: uitkomstFrase(basis, maat) },
      { label: `${formatCurrency(lager)} per jaar`, waarde: uitkomstFrase(alt, maat) },
    )
  }

  return {
    stap: 'uitgaven',
    titel: PLAN_REVIEW_STAP_TITELS.uitgaven,
    rekentNu:
      jaar != null && jaar > 0
        ? `De app rekent nu met ${formatCurrency(jaar)} per jaar aan uitgaven na stoppen, in euro's van vandaag.`
        : 'De app rekent nu nog zonder bedrag voor je uitgaven na stoppen: er is geen grondslag gevonden.',
    details: [
      { label: 'Grondslag', waarde: hoofdletter(RETIREMENT_METHOD_LABELS[method]) },
      ...(custom != null ? [{ label: 'Eigen bedrag', waarde: `${formatCurrency(custom)} per jaar` }] : []),
    ],
    effect: [`Met dit bedrag: ${uitkomstFrase(basis, maat)}.`],
    vergelijking,
    waarom:
      'Dit is het bedrag dat je vermogen, samen met AOW en pensioen, elk jaar na stoppen moet opbrengen. ' +
      'Het is een van de grootste getallen onder je doel: een ander bedrag verschuift direct hoeveel vermogen de app nodig heeft.',
    keuzes: [],
    keuzeVerplicht: false,
    schrijf: [
      {
        url: '/api/fire-settings',
        // Het opgeslagen eigen bedrag gaat altijd mee terug: de route schrijft beide
        // kolommen, en een sluimerend bedrag onder een andere methode hoort bevestigen
        // niet stil te wissen.
        body: { retirement_expense_method: method, retirement_expense_custom_amount: opgeslagenBedrag },
      },
    ],
    blokkade: null,
    aanpassen: [{ href: '/toekomst?uitgaven=open', label: 'Uitgaven na stoppen aanpassen' }],
    beperking: null,
  }
}

// ── Stap 3 — Wat er binnenkomt ───────────────────────────────────────────────

function actief<T extends { is_active?: boolean | null }>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.is_active !== false)
}

function stapInkomsten(b: PlanReviewBronnen): PlanReviewStapOverzicht {
  const events = actief(b.events)
  const aowEvent = events.find((e) => e.event_type === 'aow')
  const pensioenen = events.filter((e) => e.event_type === 'pension').length
  const werkplan = events.some((e) => e.event_type === 'werk')
  const heeftAow = b.facts.hasAowEvent
  const vast = isVastAnker(b.firePlan)
  const { basis, maat } = basisEnMaat(b)

  const meta = (aowEvent?.metadata ?? {}) as Record<string, unknown>
  const leefsituatie = meta.leefsituatie === 'samenwonend' ? 'Samenwonend' : 'Alleenstaand'
  const jarenBuitenNL = Number(meta.jarenBuitenNL ?? meta.jarenInNL ?? 0) // zelfde terugval als het formulier

  const details: PlanReviewRegel[] = []
  if (heeftAow) {
    if (b.aowAge != null) details.push({ label: 'AOW vanaf', waarde: formatAowAge(b.aowAge) })
    details.push({ label: 'Leefsituatie', waarde: leefsituatie })
    details.push({
      label: 'Jaren buiten Nederland',
      waarde: Number.isFinite(jarenBuitenNL) && jarenBuitenNL > 0 ? String(jarenBuitenNL) : 'geen',
    })
  } else {
    details.push({ label: 'AOW', waarde: '€ 0 (geen gegevens)' })
  }
  details.push({ label: 'Pensioenregelingen', waarde: pensioenen > 0 ? String(pensioenen) : 'geen' })
  details.push({ label: 'Werkplan tot stoppen', waarde: werkplan ? 'ja' : 'geen' })

  const effect = [`Met deze inkomsten: ${uitkomstFrase(basis, maat)}.`]

  // TPR-15 — wat AOW en pensioen aan de uitkomst bijdragen, uit dezelfde snapshot: de
  // bestaande rijen weggelaten, of (zonder AOW-gegevens) de AOW die opslaan zou aanmaken
  // met de vooringevulde waarden van het formulier (alleenstaand, 0 jaar buiten Nederland).
  const vergelijking: PlanReviewRegel[] = []
  if (b.run && basis) {
    if (heeftAow) {
      const zonderAow = b.run({ lifeEvent: { vervang: { eventType: 'aow' }, event: null } })
      vergelijking.push(
        { label: 'Met je AOW-gegevens (nu)', waarde: uitkomstFrase(basis, maat) },
        { label: 'Zonder AOW', waarde: uitkomstFrase(zonderAow, maat) },
      )
    } else if (b.aowAge != null) {
      const rij = bouwStrategieRij({
        event_type: 'aow',
        target_age: Math.min(75, Math.max(60, Math.ceil(b.aowAge))),
        leefsituatie: 'alleenstaand',
        jarenBuitenNL: 0,
      })
      const metAow = b.run({
        lifeEvent: { vervang: { eventType: 'aow' }, event: { ...rij, id: 'aow-vergelijking', sort_order: 0 } },
      })
      vergelijking.push(
        { label: 'Zonder AOW (nu)', waarde: uitkomstFrase(basis, maat) },
        { label: 'Met AOW als alleenstaande', waarde: uitkomstFrase(metAow, maat) },
      )
    }
    if (pensioenen > 0) {
      const zonderPensioen = b.run({ lifeEvent: { vervang: { eventType: 'pension' }, event: null } })
      vergelijking.push({
        label: pensioenen === 1 ? 'Zonder je pensioenregeling' : `Zonder je ${pensioenen} pensioenregelingen`,
        waarde: uitkomstFrase(zonderPensioen, maat),
      })
    }
  }

  if (!heeftAow) {
    effect.push(
      'Zonder AOW-gegevens telt de app geen AOW mee. Je vermogen draagt dan ook na je AOW-leeftijd alle uitgaven.',
    )
  } else {
    const stop = vast ? (b.sim?.vastStopLeeftijd ?? null) : (b.sim?.fireAgeFractional ?? null)
    if (stop != null && b.aowAge != null && stop < b.aowAge) {
      effect.push(
        `Tussen je stopmoment (${leeftijdJaar(stop)}) en je AOW-leeftijd (${formatAowAge(b.aowAge)}) leef je van je eigen vermogen en van wat er eventueel eerder aan pensioen ingaat.`,
      )
    }
  }

  return {
    stap: 'inkomsten',
    titel: PLAN_REVIEW_STAP_TITELS.inkomsten,
    rekentNu: heeftAow
      ? `De app rekent nu met AOW vanaf ${b.aowAge != null ? formatAowAge(b.aowAge) : 'je AOW-leeftijd'}${
          pensioenen > 0 ? ` en ${pensioenen} pensioenregeling${pensioenen === 1 ? '' : 'en'}` : ', zonder pensioenregelingen'
        }.`
      : 'De app rekent nu met € 0 AOW: er staan geen AOW-gegevens in je plan.',
    details,
    effect,
    vergelijking,
    waarom:
      'AOW en pensioen zijn het inkomen dat na stoppen binnenkomt. Wat zij dekken, hoeft je eigen vermogen niet op te brengen, ' +
      'dus ontbrekende of verouderde gegevens verschuiven je uitkomst.',
    keuzes: [],
    keuzeVerplicht: false,
    // AOW en pensioen zijn life-events: die zijn per constructie expliciet ingevoerd.
    // Bevestigen zet alleen de markering.
    schrijf: [],
    blokkade: heeftAow ? null : 'Deze stap telt pas als bevestigd wanneer je AOW-gegevens in je plan staan.',
    // Het eerste label is ook de knop van de inline bewerkstand (TPR-15).
    aanpassen: [
      {
        href: '/toekomst/gebeurtenissen?strategie=aow',
        label: heeftAow ? 'AOW, pensioen en werk aanpassen' : 'AOW-gegevens toevoegen',
      },
      { href: '/toekomst/gebeurtenissen?strategie=pensioen', label: 'Pensioen bekijken' },
    ],
    // De upload van je pensioenoverzicht en de jaarruimte blijven op het pensioenscherm.
    beperking:
      'Je pensioenoverzicht uploaden, een pot of werkplan verwijderen en je jaarruimte berekenen doe je op het pensioenscherm onder Gebeurtenissen.',
  }
}

// ── Stap 4 — Je huis en ander vast bezit ─────────────────────────────────────

/** Vaste volgorde, geen rangorde (Wft): van "telt mee" naar "verzilveren". */
const WOON_VOLGORDE: readonly HousingStrategyMode[] = [
  'include_full',
  'exclude_from_fire',
  'downsize',
  'reverse_mortgage',
]

/** Eigen, beschrijvende kopij — bewust niet `HOUSING_STRATEGY_DESCRIPTIONS` (die oordeelt). */
const WOON_KOPIJ: Record<HousingStrategyMode, { label: string; beschrijving: string }> = {
  include_full: {
    label: 'Telt volledig mee',
    beschrijving: 'De woning telt voor de volle waarde mee als vermogen waaruit je uitgaven gedekt worden.',
  },
  exclude_from_fire: {
    label: 'Blijft buiten je vermogen',
    beschrijving: 'De woning telt niet mee voor je uitgaven. Je blijft erin wonen en je woonlasten lopen door.',
  },
  downsize: {
    label: 'Verkopen',
    beschrijving:
      'De woning wordt verkocht. De opbrengst na aflossing en kosten gaat naar je vermogen, en er komt een nieuwe woonlast voor terug.',
  },
  reverse_mortgage: {
    label: 'Opeethypotheek',
    beschrijving:
      'Je blijft wonen en neemt geld op uit de overwaarde. De rente wordt bij de schuld opgeteld en verlaagt wat er van de woning overblijft.',
  },
}

const SALE_STAND_LABELS: Record<SaleStand, string> = {
  niet_verkopen: 'niet verkopen',
  vast_moment: 'verkopen op een vast moment',
  wanneer_nodig: 'verkopen wanneer het nodig is',
}

function woonKeuzeSchrijf(
  mode: HousingStrategyMode,
  huidig: HousingStrategyConfig | null,
): { config: HousingStrategyConfig; schrijf: PlanReviewSchrijfActie[] } {
  // Een eerder gekozen verkoop-/opeet-instelling blijft staan; zonder die keuze gelden
  // de canonieke beginners-/standaardconfiguraties (housingChoiceToConfig via `choice`).
  if (huidig && huidig.mode === mode) {
    return { config: huidig, schrijf: [{ url: '/api/housing-strategy', body: { config: huidig } }] }
  }
  switch (mode) {
    case 'include_full': {
      const config: HousingStrategyConfig = { mode: 'include_full' }
      return { config, schrijf: [{ url: '/api/housing-strategy', body: { config } }] }
    }
    case 'exclude_from_fire':
      return {
        config: { mode: 'exclude_from_fire' },
        schrijf: [{ url: '/api/housing-strategy', body: { choice: 'exclude' } }],
      }
    case 'downsize':
      return {
        config: housingChoiceToConfig('sell'),
        schrijf: [{ url: '/api/housing-strategy', body: { choice: 'sell' } }],
      }
    case 'reverse_mortgage':
      return {
        config: DEFAULT_REVERSE_MORTGAGE_CONFIG,
        schrijf: [{ url: '/api/housing-strategy', body: { config: DEFAULT_REVERSE_MORTGAGE_CONFIG } }],
      }
  }
}

/** Het bereik over de vier woonkeuzes, in de maat van de stap. */
function woonBereikZin(maat: EffectMaat, lo: number, hi: number, nietAlleKeuzes: boolean): string {
  if (maat.kind === 'over-aan-einde') {
    const bij = nietAlleKeuzes ? 'Bij de keuzes die tot het einde van je plan reiken' : 'Afhankelijk van wat je met je huis doet'
    return lo === hi
      ? `${bij} blijft er in het laatste jaar van je plan evenveel liquide vermogen over (${formatCurrency(lo)}, in euro's van vandaag).`
      : `${bij} blijft er in het laatste jaar van je plan tussen ${formatCurrency(lo)} en ${formatCurrency(hi)} aan liquide vermogen over, in euro's van vandaag.`
  }
  const wat = maat.kind === 'reikt-tot' ? 'reikt je liquide vermogen tot' : 'ligt je vrijheidsleeftijd op'
  return lo === hi
    ? `Bij elk van de vier keuzes ${wat} dezelfde leeftijd (${lo}).`
    : `Afhankelijk van wat je met je huis doet, ${wat} een leeftijd tussen ${lo} en ${hi}.`
}

function stapWoning(b: PlanReviewBronnen): PlanReviewStapOverzicht {
  const { basis, maat } = basisEnMaat(b)
  const assets = actief(b.assets)
  const heeftHuis = b.facts.hasEigenHuis
  const huidig = b.facts.housingConfigured ? parseHousingStrategy(b.profile?.housing_strategy_config) : null
  // Zonder opgeslagen keuze rekent de kern met `include_full` — dat is dan de basisrun.
  const effectieveMode: HousingStrategyMode = huidig?.mode ?? 'include_full'

  const overig = assets.filter((a) => a.asset_type !== 'eigen_huis' && NIET_LIQUIDE_ASSET_TYPES.has(a.asset_type))
  const details: PlanReviewRegel[] = []
  if (heeftHuis) {
    details.push({
      label: 'Eigen woning',
      waarde: huidig ? WOON_KOPIJ[huidig.mode].label : 'nog geen keuze (telt volledig mee)',
    })
  }
  if (overig.length > 0) {
    const perStand = new Map<SaleStand, number>()
    for (const a of overig) {
      const stand = parseSaleConfig(a.sale_config).stand
      perStand.set(stand, (perStand.get(stand) ?? 0) + 1)
    }
    const soorten = [...new Set(overig.map((a) => ASSET_TYPE_LABELS[a.asset_type]))].join(', ').toLowerCase()
    details.push({ label: 'Ander vast bezit', waarde: `${overig.length} (${soorten})` })
    for (const [stand, n] of perStand) {
      details.push({ label: `Verkoopinstelling: ${SALE_STAND_LABELS[stand]}`, waarde: String(n) })
    }
  }

  const keuzes: PlanReviewKeuze[] = []
  const effect: string[] = []
  if (heeftHuis) {
    const sleutels: number[] = []
    for (const mode of WOON_VOLGORDE) {
      const { config, schrijf } = woonKeuzeSchrijf(mode, huidig)
      const isHuidig = mode === effectieveMode
      const u = isHuidig ? basis : b.run ? b.run({ housingStrategyConfig: config as unknown as Record<string, unknown> }) : null
      const sleutel = uitkomstSleutel(u, maat)
      if (sleutel != null) sleutels.push(sleutel)
      keuzes.push({
        id: mode,
        label: WOON_KOPIJ[mode].label,
        beschrijving: WOON_KOPIJ[mode].beschrijving,
        uitkomst: u ? hoofdletter(uitkomstFrase(u, maat)) : hoofdletter(ONBEKEND),
        huidig: huidig != null && isHuidig,
        schrijf,
      })
    }
    if (sleutels.length >= 2) {
      effect.push(woonBereikZin(maat, Math.min(...sleutels), Math.max(...sleutels), sleutels.length < WOON_VOLGORDE.length))
    } else {
      effect.push(`Met de huidige keuze: ${uitkomstFrase(basis, maat)}.`)
    }
  }
  if (overig.length > 0) {
    effect.push(
      'Voor ander vast bezit rekent de app per bezitting met de verkoopinstelling. Zonder instelling verkoopt de app zo’n bezitting pas wanneer je liquide geld tekortschiet.',
    )
  }

  const rekentNu = !b.facts.hasNietLiquideBezit
    ? 'Je hebt geen eigen huis of ander bezit dat niet direct besteedbaar is; deze stap is voor jou niet van toepassing.'
    : heeftHuis
      ? huidig
        ? `De app rekent nu met je huis als: ${WOON_KOPIJ[huidig.mode].label.toLowerCase()}.`
        : 'Je hebt nog geen keuze gemaakt voor je huis. De app rekent nu alsof het volledig meetelt.'
      : `De app rekent nu met ${overig.length} bezitting${overig.length === 1 ? '' : 'en'} die niet direct besteedbaar ${overig.length === 1 ? 'is' : 'zijn'}, volgens de verkoopinstelling per bezitting.`

  return {
    stap: 'woning',
    titel: PLAN_REVIEW_STAP_TITELS.woning,
    rekentNu,
    details,
    effect,
    vergelijking: [],
    waarom:
      'Een huis of ander vast bezit is vermogen, maar geen geld om van te leven. Of en wanneer het meetelt, ' +
      'bepaalt vanaf wanneer je vermogen je uitgaven kan dekken.',
    keuzes,
    keuzeVerplicht: heeftHuis && huidig == null,
    schrijf: huidig ? [{ url: '/api/housing-strategy', body: { config: huidig } }] : [],
    blokkade: null,
    // TPR-15 — de eerste regel is ook het label van de inline bewerkstand (stap 4 heeft een editor).
    aanpassen: [
      ...(heeftHuis
        ? [{ href: '/toekomst/gebeurtenissen?strategie=huis', label: overig.length > 0 ? 'Woonstrategie en verkoop aanpassen' : 'Woonstrategie aanpassen' }]
        : []),
      ...(overig.length > 0 ? [{ href: '/overzicht/bezittingen', label: 'Verkoopinstellingen aanpassen' }] : []),
    ],
    beperking: heeftHuis
      ? 'Verkopen en opeethypotheek rekenen in de keuzes hierboven met de standaardinstellingen (moment, kosten, rente), tenzij je die al eerder koos. Via aanpassen stel je ze zelf in.'
      : null,
  }
}

// ── Stap 5 — Hoe je potten werken ────────────────────────────────────────────

const PROFIEL_KOPIJ: Record<WithdrawalProfiel, { naam: string; uitleg: string }> = {
  vast: { naam: 'Vast', uitleg: 'elk jaar hetzelfde uitgavenniveau, meegegroeid met de inflatie' },
  afnemend: { naam: 'Afnemend', uitleg: 'meer uitgeven in je actieve jaren en daarna minder' },
  oplopend: { naam: 'Oplopend', uitleg: 'bescheiden beginnen en later meer uitgeven' },
  guardrails: { naam: 'Guardrails', uitleg: 'minder opnemen na slechte jaren en meer na goede, binnen grenzen' },
}

function surplusFrase(s: SurplusGroup): string {
  return s === 'schuld_aflossen' ? 'schulden aflossen' : WEALTH_GROUP_LABELS[s].toLowerCase()
}

function volgordeFrase(groups: readonly WealthGroup[]): string {
  return groups.map((g) => WEALTH_GROUP_LABELS[g]).join(' → ')
}

function stapPotten(b: PlanReviewBronnen): PlanReviewStapOverzicht {
  const profile = b.profile ?? {}
  const profiel = resolveWithdrawalProfiel(profile as { withdrawal_strategy?: string | null; withdrawal_profile_config?: unknown })
  const potRules = resolvePotRules(profile as { pot_rules?: unknown })
  const { basis, maat } = basisEnMaat(b)

  const rawConfig = profile.withdrawal_profile_config
  const configObject =
    rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig) ? (rawConfig as Record<string, unknown>) : {}

  const vergelijking: PlanReviewRegel[] = []
  const ander: WithdrawalProfiel = profiel === 'vast' ? 'afnemend' : 'vast'
  if (b.run && basis) {
    const alt = b.run({ withdrawalProfileConfig: { ...configObject, profiel: ander } })
    vergelijking.push(
      { label: `${PROFIEL_KOPIJ[profiel].naam} (nu)`, waarde: uitkomstFrase(basis, maat) },
      { label: PROFIEL_KOPIJ[ander].naam, waarde: uitkomstFrase(alt, maat) },
    )
  }

  return {
    stap: 'potten',
    titel: PLAN_REVIEW_STAP_TITELS.potten,
    rekentNu: `De app rekent nu met onttrekkingsprofiel ${PROFIEL_KOPIJ[profiel].naam.toLowerCase()}: ${PROFIEL_KOPIJ[profiel].uitleg}.`,
    details: [
      { label: 'Onttrekkingsprofiel', waarde: PROFIEL_KOPIJ[profiel].naam },
      { label: 'Extra geld gaat naar', waarde: hoofdletter(surplusFrase(potRules.surplusGroup)) },
      { label: 'Opnemen na stoppen, in volgorde', waarde: volgordeFrase(potRules.withdrawalOrderGroups) },
      { label: 'Bij een tegenvaller eerst uit', waarde: volgordeFrase(potRules.deficitOrderGroups) },
    ],
    effect: [`Met deze regels: ${uitkomstFrase(basis, maat)}.`],
    vergelijking,
    waarom:
      'Deze regels bepalen waar extra geld landt, en dus met welk rendement het groeit, en hoe je na stoppen opneemt. ' +
      'Dat verschuift hoe lang je vermogen meegaat.',
    keuzes: [],
    keuzeVerplicht: false,
    schrijf: [
      { url: '/api/withdrawal-strategy', body: { withdrawal_profile_config: { ...configObject, profiel } } },
      {
        url: '/api/pot-rules',
        body: {
          withdrawalOrderGroups: potRules.withdrawalOrderGroups,
          surplusGroup: potRules.surplusGroup,
          deficitOrderGroups: potRules.deficitOrderGroups,
          ...(potRules.categoriePrios ? { categoriePrios: potRules.categoriePrios } : {}),
        },
      },
    ],
    blokkade: null,
    aanpassen: [
      { href: '/toekomst/voorkeuren?regel=onttrekkingsstrategie', label: 'Onttrekkingsprofiel aanpassen' },
      { href: '/toekomst/voorkeuren?regel=verdeling-toename', label: 'Verdeling van extra geld' },
      { href: '/toekomst/voorkeuren?regel=onttrekkingsvolgorde', label: 'Volgorde van opnemen' },
    ],
    beperking: null,
  }
}

// ── Ingang ───────────────────────────────────────────────────────────────────

export function buildPlanReviewStap(stap: PlanReviewStap, bronnen: PlanReviewBronnen): PlanReviewStapOverzicht {
  switch (stap) {
    case 'plan':
      return stapPlan(bronnen)
    case 'uitgaven':
      return stapUitgaven(bronnen)
    case 'inkomsten':
      return stapInkomsten(bronnen)
    case 'woning':
      return stapWoning(bronnen)
    case 'potten':
      return stapPotten(bronnen)
  }
}
