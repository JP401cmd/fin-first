/**
 * DE WEERGAVE-STANDEN van een grenzenpot — één plek voor het stoplicht en de
 * score-kleur, zodat de pane, de kaart en de tegel niet uit elkaar lopen.
 *
 * ── WAAROM DIT BESTAAT ──────────────────────────────────────────────────────
 * De drie-standen-ternary (`over ? … : isNearLimit ? … : …`) stond letterlijk
 * drie keer in de app, met in elk bestand een comment dat de andere twee moesten
 * meebewegen. Dat is precies één plek te weinig: één keer is die ternary al
 * binair geweest, waardoor "dicht bij je grens" groen kleurde terwijl de tegel
 * amber waarschuwde voor dezelfde toestand.
 *
 * ── DIT IS WEERGAVE, GEEN BEREKENING ────────────────────────────────────────
 * `resolveSpendLimitDisplayStatus` leest alleen wat de motor al besliste
 * (`status`, `isNearLimit`, `periodHeadroom`) — er wordt hier geen drempel
 * toegepast en geen bedrag opnieuw gesommeerd. De 80%-grens blijft van
 * `SPEND_LIMIT_NEAR_LIMIT_PCT` in de motor, en de rekenkundige grens
 * (`matched > limit` ⇒ 'exceeded', exact op de grens telt als BINNEN) blijft van
 * `computePeriodOutcome`. Zie ADR 0136.
 *
 * ── DE VIERDE STAND IS WEERGAVE, GEEN AFWIJKING VAN DE MOTOR ────────────────
 * Exact op de grens levert de motor `status: 'within'` én `periodHeadroom: 0`.
 * Reken-technisch klopt dat (je bent niet eroverheen), maar de tekst die eraan
 * hing beloofde ruimte die er niet is: "Er is nog ruimte, maar niet veel" naast
 * "€ 0 ruimte". Daarom kent de WEERGAVE een vierde stand — `reached` — tussen
 * `near` en `exceeded`. De motor, de reeksen, de score en de
 * `exceeded`-telling zien 'm niet: daar blijft dit gewoon een periode binnen de
 * grens.
 *
 * ── KLEUR VOLGT DE SEMANTIEK, NIET HET ACCENT ───────────────────────────────
 * Binnen/dichtbij/boven is stoplicht-semantiek en volgt de gekozen accentkleur
 * dus NIET (CLAUDE.md-kleurregel). Vandaar `positive`/`warning`/`negative` en
 * niet `kern-*`.
 */

import type { SpendLimitPeriodPace, SpendLimitScoreLabel, SpendLimitStatus } from './engine'

/** De vier standen die elk oppervlak toont. */
export type SpendLimitDisplayStatus = 'within' | 'near' | 'reached' | 'exceeded'

/**
 * De standen die ook over een AFGESLOTEN periode iets zeggen: waar stond je aan
 * het eind van die periode. `near` hoort hier bewust niet bij — "je nadert je
 * grens" gaat over een periode die nog loopt, en een afgesloten maand op 85%
 * bleef gewoon binnen.
 */
export type SpendLimitOutcomeState = Extract<
  SpendLimitDisplayStatus,
  'within' | 'reached' | 'exceeded'
>

/**
 * Cent-tolerantie voor "er is geen ruimte meer".
 *
 * `periodHeadroom` is een euro-float: een som van transactiebedragen afgetrokken
 * van een grensbedrag. Een strikte `=== 0` laat een afrondingsrest van een
 * duizendste cent door, waarna het scherm "€ 0 ruimte" toont en de tekst ernaast
 * alsnog ruimte belooft — precies de tegenspraak die deze stand moet opheffen.
 * Een halve cent is de kleinste eenheid die er in euro's toe doet, en tegelijk
 * exact de grens waaronder het bedrag naar "€ 0,00" afrondt: de stand zegt
 * daarmee hetzelfde als het getal ernaast.
 *
 * Bewust hetzelfde getal als `CENT_EPSILON` in `lib/budget-alerts.ts`, waar
 * `budgetLimitStatus` de budget-limiet al in drie toestanden leest
 * (onder/bereikt/over). Die constante is daar niet geëxporteerd; ze samenvoegen
 * is een aparte opruiming, geen onderdeel van deze fix.
 */
export const SPEND_LIMIT_HEADROOM_EPSILON = 0.005

/**
 * Waar deze periode eindigde ten opzichte van de grens — zonder de
 * near-nuance.
 *
 * DIT IS GEEN TWEEDE STATUSREGEL: `exceeded` komt onverkort van de motor, en
 * `reached` is een LEZING van `periodHeadroom` (dat de motor al berekende), niet
 * een eigen vergelijking van besteed tegen grens. De `limitAmount > 0`-guard
 * spiegelt die van `isNearLimit`: op een nulgrens is elke uitgave al een
 * overschrijding, en een lege periode zou anders permanent "grens bereikt"
 * melden.
 */
export function resolveSpendLimitOutcomeState(period: {
  status: SpendLimitStatus
  limitAmount: number
  periodHeadroom: number
}): SpendLimitOutcomeState {
  if (period.status === 'exceeded') return 'exceeded'
  if (period.limitAmount > 0 && period.periodHeadroom < SPEND_LIMIT_HEADROOM_EPSILON) {
    return 'reached'
  }
  return 'within'
}

/**
 * Leid de weergave-stand af uit een doorgerekende periode.
 *
 * Neemt bewust het kleinst mogelijke stukje van de uitkomst aan — zo werkt hij
 * zowel op een `SpendLimitPeriodOutcome` (pane, kaart) als op de smallere
 * widget-projectie, zonder dat die twee vormen naar elkaar toe hoeven groeien.
 * De widget-projectie noemt de ruimte `currentHeadroom`; die vertaalt zichzelf
 * op de aanroeproep, zodat hier één veldnaam blijft staan.
 */
export function resolveSpendLimitDisplayStatus(period: {
  status: SpendLimitStatus
  isNearLimit: boolean
  limitAmount: number
  periodHeadroom: number
}): SpendLimitDisplayStatus {
  const state = resolveSpendLimitOutcomeState(period)
  // `reached` gaat vóór `near`: op de grens staan is geen "bijna".
  if (state !== 'within') return state
  return period.isNearLimit ? 'near' : 'within'
}

/** Observationeel, niet prescriptief: wat er is, niet wat je moet doen. */
export const SPEND_LIMIT_STATUS_LABEL: Record<SpendLimitDisplayStatus, string> = {
  within: 'Binnen je grens',
  near: 'Dicht bij je grens',
  reached: 'Grens bereikt',
  exceeded: 'Boven je grens',
}

/** Kleine letter, voor midden-in-de-zin gebruik (de tegel). */
export const SPEND_LIMIT_STATUS_LABEL_INLINE: Record<SpendLimitDisplayStatus, string> = {
  within: 'binnen je grens',
  near: 'dicht bij je grens',
  reached: 'grens bereikt',
  exceeded: 'boven je grens',
}

/**
 * `reached` deelt het WARNING-token met `near` en niet het negative-token: er is
 * niets overschreden, dus rood zou een gebeurtenis beloven die niet plaatsvond —
 * en groen zou ruimte suggereren die er niet is. Het onderscheid met `near` zit
 * in het label ("Grens bereikt" tegen "Dicht bij je grens") en, waar er een vlak
 * getekend wordt, in een sterkere rand (zie `SPEND_LIMIT_STATUS_BAND_CLASS`).
 */
export const SPEND_LIMIT_STATUS_TEXT_CLASS: Record<SpendLimitDisplayStatus, string> = {
  within: 'text-positive',
  near: 'text-warning',
  reached: 'text-warning',
  exceeded: 'text-negative',
}

/** Voor canvas/inline-style, waar een class niet kan (de tegel-stip). */
export const SPEND_LIMIT_STATUS_COLOR_VAR: Record<SpendLimitDisplayStatus, string> = {
  within: 'var(--positive)',
  near: 'var(--warning)',
  reached: 'var(--warning)',
  exceeded: 'var(--negative)',
}

/**
 * De band rond de lopende periode: zachte tint plus bijpassende rand.
 *
 * Vervangt de neutrale `--subtle`-grijs die er stond: die liet de gebruiker het
 * onderscheid binnen/boven alleen aan een regel tekst rechts aflezen. De tinten
 * zijn de bestaande `*-bg`-tokens, dezelfde die de bankkoppeling-kaarten en de
 * budgetplan-editor al gebruiken — geen nieuwe kleuren.
 */
export const SPEND_LIMIT_STATUS_BAND_CLASS: Record<SpendLimitDisplayStatus, string> = {
  within: 'border-positive/25 bg-positive-bg',
  near: 'border-warning/30 bg-warning-bg',
  // Zelfde tint als `near`, stevigere rand: dezelfde kleurfamilie (er is niets
  // overschreden), maar zichtbaar een stap verder.
  reached: 'border-warning/60 bg-warning-bg',
  exceeded: 'border-negative/30 bg-negative-bg',
}

/**
 * De vier score-standen op de bestaande score-kleurschaal (`--score-*`), niet op
 * het stoplicht: de score gaat over je historie, de stoplichtkleur over de
 * lopende periode. Ze naast elkaar tonen in dezelfde kleur zou suggereren dat
 * het twee lezingen van hetzelfde zijn.
 */
export const SPEND_LIMIT_SCORE_TEXT_CLASS: Record<SpendLimitScoreLabel, string> = {
  strak: 'text-[var(--score-good)]',
  netjes: 'text-[var(--score-ok)]',
  wisselend: 'text-[var(--score-warn)]',
  los: 'text-[var(--score-bad)]',
}

/**
 * DE TEMPO-REGEL van de lopende periode, in één zin — "3% van augustus 2026
 * voorbij · 80% van je grens gebruikt".
 *
 * Staat hier en niet drie keer in een component, om exact de reden waarom
 * `resolveSpendLimitDisplayStatus` hier staat: dezelfde zin op drie oppervlakken
 * met drie eigen afrondingen is drift zodra iemand ze naast elkaar ziet.
 *
 * DIT IS WEERGAVE, GEEN BEREKENING. De fracties komen kant-en-klaar uit
 * `computeSpendLimitPace`; hier wordt alleen afgerond. Twee afrondingsregels zijn
 * bewust:
 *
 *  - een verstreken-fractie die op 0% zou afronden (1 januari van een jaarpot)
 *    wordt "minder dan 1%" en NOOIT naar boven bijgeplust. De tempo-regel wordt
 *    naast het gebruikte percentage gelezen; verstreken tijd overdrijven maakt een
 *    te hoog verbruik juist onschuldiger dan het is;
 *  - een NEGATIEF gebruikt-percentage (netto refunds) wordt op 0 geklemd: voor een
 *    UITGAVENgrens is "per saldo niets van je grens gebruikt" precies wat een
 *    negatief netto bedrag betekent.
 *
 * Bevat geen enkel bedrag — daarom blijft deze regel leesbaar onder bedrag-
 * maskering (ADR 0091), terwijl het prognosebedrag ernaast wél maskeert.
 */
export function describeSpendLimitPace(pace: SpendLimitPeriodPace, periodLabel: string): string {
  const elapsedPct = Math.round(pace.elapsedFraction * 100)
  const elapsed =
    elapsedPct < 1
      ? `minder dan 1% van ${periodLabel} voorbij`
      : `${elapsedPct}% van ${periodLabel} voorbij`
  if (pace.usedFraction === null) return elapsed
  const usedPct = Math.max(0, Math.round(pace.usedFraction * 100))
  return `${elapsed} · ${usedPct}% van je grens gebruikt`
}

export const SPEND_LIMIT_SCORE_COLOR_VAR: Record<SpendLimitScoreLabel, string> = {
  strak: 'var(--score-good)',
  netjes: 'var(--score-ok)',
  wisselend: 'var(--score-warn)',
  los: 'var(--score-bad)',
}
