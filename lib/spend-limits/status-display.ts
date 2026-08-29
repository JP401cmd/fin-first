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
 * (`status`, `isNearLimit`) — er wordt hier geen drempel toegepast en geen
 * bedrag vergeleken. De 80%-grens blijft van `SPEND_LIMIT_NEAR_LIMIT_PCT` in de
 * motor.
 *
 * ── KLEUR VOLGT DE SEMANTIEK, NIET HET ACCENT ───────────────────────────────
 * Binnen/dichtbij/boven is stoplicht-semantiek en volgt de gekozen accentkleur
 * dus NIET (CLAUDE.md-kleurregel). Vandaar `positive`/`warning`/`negative` en
 * niet `kern-*`.
 */

import type { SpendLimitPeriodPace, SpendLimitScoreLabel, SpendLimitStatus } from './engine'

/** De drie standen die elk oppervlak toont. */
export type SpendLimitDisplayStatus = 'within' | 'near' | 'exceeded'

/**
 * Leid de weergave-stand af uit een doorgerekende periode.
 *
 * Neemt bewust het kleinst mogelijke stukje van de uitkomst aan — zo werkt hij
 * zowel op een `SpendLimitPeriodOutcome` (pane, kaart) als op de smallere
 * widget-projectie, zonder dat die twee vormen naar elkaar toe hoeven groeien.
 */
export function resolveSpendLimitDisplayStatus(period: {
  status: SpendLimitStatus
  isNearLimit: boolean
}): SpendLimitDisplayStatus {
  if (period.status === 'exceeded') return 'exceeded'
  return period.isNearLimit ? 'near' : 'within'
}

/** Observationeel, niet prescriptief: wat er is, niet wat je moet doen. */
export const SPEND_LIMIT_STATUS_LABEL: Record<SpendLimitDisplayStatus, string> = {
  within: 'Binnen je grens',
  near: 'Dicht bij je grens',
  exceeded: 'Boven je grens',
}

/** Kleine letter, voor midden-in-de-zin gebruik (de tegel). */
export const SPEND_LIMIT_STATUS_LABEL_INLINE: Record<SpendLimitDisplayStatus, string> = {
  within: 'binnen je grens',
  near: 'dicht bij je grens',
  exceeded: 'boven je grens',
}

export const SPEND_LIMIT_STATUS_TEXT_CLASS: Record<SpendLimitDisplayStatus, string> = {
  within: 'text-positive',
  near: 'text-warning',
  exceeded: 'text-negative',
}

/** Voor canvas/inline-style, waar een class niet kan (de tegel-stip). */
export const SPEND_LIMIT_STATUS_COLOR_VAR: Record<SpendLimitDisplayStatus, string> = {
  within: 'var(--positive)',
  near: 'var(--warning)',
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
