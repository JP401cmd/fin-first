/**
 * WAT WE DE GEBRUIKER OVER ZIJN EIGEN UITGAVENGRENZEN MELDEN — pure beslislogica.
 *
 * Spiegelt `lib/notifications/bank-signalen.ts`: geen Supabase, geen React, geen
 * `new Date()`. In gaan de doorgerekende potten (`SpendLimitWithReport[]`, uit de
 * canonieke loader/motor), de dedupe-staat en de alias; uit komen de meldingen én
 * de bijgewerkte dedupe-staat. De route doet daarna alleen nog I/O.
 *
 * ── GEEN TWEEDE DREMPELLOGICA ───────────────────────────────────────────────
 * Er staat hier GEEN 80%, geen venster en geen statusregel. `isNearLimit`,
 * `status` en `streaks` komen kant-en-klaar uit `lib/spend-limits/engine.ts`; die
 * motor is de enige plek waar een grens-uitkomst ontstaat (consume, don't
 * recompute). Zodra hier een eigen percentage of vergelijking verschijnt, kan de
 * melding iets anders zeggen dan het scherm — precies de drift die de motor
 * moet voorkomen.
 *
 * ── VIER EVENTS, TWEE SOORTEN ───────────────────────────────────────────────
 *  - `near` en `exceeded` zijn LIVE STATUSSEN over de lopende periode, zonder
 *    gate: ze verdwijnen vanzelf zodra de toestand of de periode wisselt (exact
 *    het budget-alert-model). Ze sluiten elkaar per definitie uit, want
 *    `isNearLimit` eist zelf al `status === 'within'` — er staat hier bewust geen
 *    tweede check omheen.
 *  - `recovered` en `streak_milestone` zijn EENMALIG en lopen via de gate.
 *
 * `recovered` is bewust een DATAFEIT (laatst afgesloten periode binnen, de
 * periode daarvóór erboven) en niet "er stond eerder een melding": het eerste is
 * idempotent uit het rapport af te leiden, het tweede zou meldingsgeschiedenis
 * als rekenbron gebruiken.
 *
 * ── DE AANMAAKDATUM IS DE ONDERGRENS VAN BETEKENIS ──────────────────────────
 * Een lege periode telt in de motor als "binnen de grens" (je gaf niets uit), dus
 * een splinternieuwe pot heeft meteen een volle reeks over periodes van vóór zijn
 * bestaan. Alleen `streak_milestone` leunt op die reeks als PRESTATIE en heeft
 * daarom `config.createdAt` als poort — zie `streakStartsAfterCreation`. `near`
 * en `exceeded` gaan over de lopende periode en `recovered` eist een
 * overschrijding daarvóór (onmogelijk in een lege historie), dus die drie hebben
 * de poort niet nodig.
 *
 * ── MOMENT-IN-TIJD ──────────────────────────────────────────────────────────
 * De tekst wordt samengesteld met de alias die op GENERATIEMOMENT geldt en
 * daarna als string bewaard. Wisselt de gebruiker later van naam, dan houdt een
 * oude melding de naam die er toen stond. Even bewust: een refund kan een
 * `exceeded` achteraf onwaar maken — de historie wordt niet herschreven, want de
 * melding beschrijft de stand op dat moment en het actuele cijfer staat altijd
 * in de app.
 */

import { formatCurrency } from '@/lib/format'
import { spendLimitCopy, type SpendLimitAlias } from '@/lib/spend-limits/copy'
import type { SpendLimitPeriodKind, SpendLimitPeriodOutcome } from '@/lib/spend-limits/engine'
import type { SpendLimitWithReport } from '@/lib/spend-limits/types'

// ── Contract ─────────────────────────────────────────────────────────────────

export type SpendLimitEventKind = 'near' | 'exceeded' | 'recovered' | 'streak_milestone'

/**
 * De dedupe-staat voor de EENMALIGE events: `{ [potId]: { [periodKey]: marker[] } }`.
 *
 * Eén `app_settings`-sleutel per gebruiker (`spend_limit_events_<uid>`), niet één
 * sleutel per event: dat laatste zou een rij-explosie in `app_settings` geven
 * zonder opruimpad.
 *
 * De markers zijn de SUFFIXEN van het notificatie-id (`'recovered'`, `'streak6'`),
 * niet het hele id: pot en periode staan al in de sleutels eromheen.
 */
export type SpendLimitEventGate = Record<string, Record<string, string[]>>

/**
 * Hoeveel periodesleutels per pot bewaard blijven. Alles daarboven wordt gepruned
 * — de gate hoeft alleen te weten wat er recent gemeld is, en een map die eeuwig
 * groeit is een lek in een JSON-blob.
 */
export const SPEND_LIMIT_GATE_PERIOD_LIMIT = 6

/**
 * De inhoud van één melding. Spiegelt `Notification` uit
 * `app/api/notifications/route.ts` mínus de velden die de aggregator zet
 * (`createdAt`, `read`).
 */
/**
 * De bedragen van één melding, APART van de tekst.
 *
 * ── WAAROM NIET IN DE ZIN ───────────────────────────────────────────────────
 * Bedragmaskering is client-side en per call-site opt-in: een bedrag dat eenmaal
 * ín `title`/`description` staat, kan de privacy-toggle nooit meer verbergen.
 * `notification-item.tsx` rendert deze velden daarom live via `<MaskedAmount>`,
 * precies zoals de opzeg-actie dat doet sinds migratie
 * `20260807120000_strip_baked_amount_from_cancellation_actions` (ADR 0091, laag 2).
 *
 * `aiContext` houdt zijn bedragen bewust wél: dat is geen weergave maar een
 * chat-prefill die de gebruiker zelf aanzet met "Vraag Fin".
 */
export interface SpendLimitNotificationAmounts {
  // De index-signature houdt dit type toewijsbaar aan `Notification['metadata']`
  // (`Record<string, unknown>`) in app/api/notifications/route.ts, zonder de
  // benoemde velden hun eigen type te ontnemen.
  [key: string]: number | undefined
  /** Besteed binnen de pot in de betreffende periode. */
  matched: number
  /** De grens die de gebruiker zelf stelde. */
  limit: number
  /** Bedrag boven de grens — alleen bij `exceeded`. */
  over?: number
  /** Resterende ruimte — alleen bij `near`. */
  headroom?: number
}

export interface SpendLimitNotificationContent {
  id: string
  type: 'spend_limit'
  priority: number
  title: string
  description: string
  icon: string
  color: string
  actionUrl: string
  aiContext: string
  /**
   * Draagt de bedragen naar de renderer. Ontbreekt bij events die er geen
   * hebben (`streak_milestone` telt periodes, geen euro's).
   */
  metadata?: SpendLimitNotificationAmounts
}

export interface SpendLimitEvent {
  kind: SpendLimitEventKind
  /** De pot waar dit event bij hoort — sleutel in de dedupe-map. */
  potId: string
  /** De periode waar dit event over gaat; zit ALTIJD ook in `notification.id`. */
  periodKey: string
  /** True voor de eenmalige events (`recovered`, `streak_milestone`). */
  once: boolean
  notification: SpendLimitNotificationContent
}

export interface SpendLimitDecision {
  events: SpendLimitEvent[]
  /** De gate ná dit request, al gepruned. */
  gate: SpendLimitEventGate
  /** Alleen wegschrijven wanneer dit waar is — anders schrijft elke poll dezelfde blob. */
  gateChanged: boolean
}

export interface DecideSpendLimitEventsInput {
  /** Alle niet-gearchiveerde potten uit `loadSpendLimitsSection`. */
  limits: SpendLimitWithReport[]
  /** `profiles.spend_limit_alias` zoals die NU is; onbekende waarden vallen terug op de default. */
  alias: string | null | undefined
  gate: SpendLimitEventGate
  /**
   * Staat het `spend_limit`-berichttype aan? Bij `false` komt er geen melding ÉN
   * blijft de gate onaangeroerd, zodat een latere aan-zet de melding alsnog toont.
   * De route kort dit pad ook al af (dat scheelt queries); deze vlag maakt de
   * regel toetsbaar op de plek waar hij geldt.
   */
  enabled: boolean
}

// ── Mijlpalen ────────────────────────────────────────────────────────────────

/**
 * De reeks-mijlpalen: 3, en daarna elke verdubbeling vanaf 6 (6, 12, 24, 48 …).
 *
 * Bewust een regel en geen lijst met een plafond: het venster van de motor
 * (13 maanden = 12 afgesloten) maakt vandaag alles boven 12 onbereikbaar, maar
 * een lijst die stilzwijgend op het huidige venster is geknipt, wordt fout zodra
 * dat venster verandert.
 */
export function isStreakMilestone(streak: number): boolean {
  if (!Number.isInteger(streak) || streak < 3) return false
  if (streak === 3) return true
  if (streak < 6 || streak % 6 !== 0) return false
  // 6 · 2^k → deel weg tot 1 overblijft; elke andere veelvoud van 6 valt af.
  let rest = streak / 6
  while (rest % 2 === 0) rest /= 2
  return rest === 1
}

/**
 * Ligt de hele reeks waar deze mijlpaal over gaat NÁ het aanmaken van de pot?
 *
 * ── HET PROBLEEM DAT DIT OPLOST ─────────────────────────────────────────────
 * De motor telt een periode ZONDER transacties als "binnen de grens" — een
 * bewuste keuze, want je hebt dan niets uitgegeven. Gevolg: een splinternieuwe
 * pot erft meteen een volledige reeks over de twaalf lege maanden vóór zijn
 * bestaan, en zou zonder deze poort direct een mijlpaal-melding afvuren
 * ("12 maanden op rij binnen je grens!") over maanden waarin die grens niet
 * bestond. Dat is geen prestatie maar een rekenartefact, en het devalueert elke
 * échte mijlpaal die erna komt.
 *
 * ── DE SEMANTIEK (bewust streng) ────────────────────────────────────────────
 * Een mijlpaal telt alleen als ELKE periode in de reeks volledig ná de aanmaak
 * begint. Een pot die halverwege maart is aangemaakt, krijgt dus geen mijlpaal
 * waar maart in zit: die maand liep al voordat de grens er was, dus "je bleef er
 * die maand binnen" is niet iets wat de gebruiker gedaan heeft. Reeksen die
 * vanaf april lopen tellen wél gewoon mee.
 *
 * ── ONBEKENDE AANMAAKDATUM ──────────────────────────────────────────────────
 * Bij een lege of onleesbare `createdAt` wordt NIET onderdrukt. De keuze is
 * asymmetrisch en met opzet: onderdrukken-bij-twijfel zou een datavlek de
 * mijlpalen permanent laten uitzetten zonder dat iemand het merkt, terwijl
 * doorlaten-bij-twijfel hooguit één keer een te vroege felicitatie oplevert.
 * Zichtbaar fout is beter dan stil kapot.
 *
 * De vergelijking is een kale ISO-datumvergelijking: `since` is een lokale
 * kalenderdatum, `createdAt` een UTC-tijdstempel. Rond middernacht kan dat een
 * dag schelen — irrelevant, want de grens ligt hier op periodegrenzen die
 * maanden uit elkaar liggen.
 */
export function streakStartsAfterCreation(
  closedPeriods: SpendLimitPeriodOutcome[],
  streak: number,
  createdAt: string | null | undefined,
): boolean {
  const createdDate = typeof createdAt === 'string' ? createdAt.slice(0, 10) : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(createdDate)) return true
  if (streak <= 0 || streak > closedPeriods.length) return true
  const first = closedPeriods[closedPeriods.length - streak]
  return first.since >= createdDate
}

// ── Gate-serialisatie ────────────────────────────────────────────────────────

/**
 * Lees de gate uit de `app_settings`-waarde. Alles wat niet de verwachte vorm
 * heeft, telt als "nog niets gemeld": een kapotte blob mag hooguit één melding
 * herhalen, nooit een request laten crashen.
 */
export function parseSpendLimitEventGate(raw: string | null | undefined): SpendLimitEventGate {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

  const gate: SpendLimitEventGate = {}
  for (const [potId, periods] of Object.entries(parsed as Record<string, unknown>)) {
    if (!periods || typeof periods !== 'object' || Array.isArray(periods)) continue
    const byPeriod: Record<string, string[]> = {}
    for (const [periodKey, markers] of Object.entries(periods as Record<string, unknown>)) {
      if (!Array.isArray(markers)) continue
      byPeriod[periodKey] = markers.filter((m): m is string => typeof m === 'string')
    }
    gate[potId] = byPeriod
  }
  return gate
}

// ── Copy-hulpjes ─────────────────────────────────────────────────────────────

/**
 * Hoe we over de periode praten. Eén map, zodat "deze maand" niet op vier
 * plekken los wordt bedacht en een kwartaalpot niet stilzwijgend "deze maand"
 * zegt.
 */
const PERIOD_WORDS: Record<SpendLimitPeriodKind, { lopend: string; meervoud: string }> = {
  day: { lopend: 'vandaag', meervoud: 'dagen' },
  week: { lopend: 'deze week', meervoud: 'weken' },
  month: { lopend: 'deze maand', meervoud: 'maanden' },
  quarter: { lopend: 'dit kwartaal', meervoud: 'kwartalen' },
  year: { lopend: 'dit jaar', meervoud: 'jaren' },
}

/** Deeplink naar de pot; met periode voor events die over een afgesloten periode gaan. */
function limitUrl(potId: string, periodKey?: string): string {
  const base = `/overzicht/cashflow/transacties?limit=${encodeURIComponent(potId)}`
  return periodKey ? `${base}&periode=${encodeURIComponent(periodKey)}` : base
}

// ── De beslissing ────────────────────────────────────────────────────────────

/**
 * Welke meldingen deze gebruiker nu over zijn potten hoort te krijgen.
 *
 * Alleen ACTIEVE potten tellen mee: een gepauzeerde pot is de expliciete wens om
 * er even niet aan herinnerd te worden. De pot blijft wél in de gate staan, zodat
 * hervatten geen oude mijlpaal opnieuw afvuurt.
 *
 * Eenmalige events worden uitsluitend voor de LAATST AFGESLOTEN periode
 * gegenereerd — nooit historisch terugvullen. Dat houdt de id-groei op ongeveer
 * 3 id's per pot per periode, ruim onder de 200-id-cap van
 * `app_settings.notifications_read_*`.
 */
export function decideSpendLimitEvents(input: DecideSpendLimitEventsInput): SpendLimitDecision {
  const { limits, gate, enabled } = input

  // Uit ⇒ niets melden en niets vastleggen. De gate mag niet "opbranden" op een
  // melding die de gebruiker nooit gezien heeft.
  if (!enabled || limits.length === 0) {
    return { events: [], gate, gateChanged: false }
  }

  // Onbekende alias-waarden (profielrij van vóór de migratie, of een waarde die
  // de CHECK-constraint ooit toelaat) vangt `spendLimitCopy` zelf af.
  const copy = spendLimitCopy(input.alias as SpendLimitAlias | null | undefined)

  const next: SpendLimitEventGate = {}
  for (const [potId, periods] of Object.entries(gate)) {
    next[potId] = { ...periods }
  }
  let gateChanged = false

  const events: SpendLimitEvent[] = []

  const markOnce = (potId: string, periodKey: string, marker: string): boolean => {
    const byPeriod = next[potId] ?? {}
    const markers = byPeriod[periodKey] ?? []
    if (markers.includes(marker)) return false
    next[potId] = { ...byPeriod, [periodKey]: [...markers, marker] }
    gateChanged = true
    return true
  }

  for (const limit of limits) {
    const { config, report } = limit
    if (!config.isActive) continue

    const potId = config.id
    const words = PERIOD_WORDS[config.period] ?? PERIOD_WORDS.month
    const current = report.currentPeriod

    // ── Live statussen over de lopende periode ──────────────────────────────
    if (current.status === 'exceeded') {
      events.push({
        kind: 'exceeded',
        potId,
        periodKey: current.periodKey,
        once: false,
        notification: {
          id: `spend_limit_${potId}_${current.periodKey}_exceeded`,
          type: 'spend_limit',
          priority: 2,
          title: `${config.name}: boven je grens`,
          description:
            `Je gaf ${words.lopend} meer uit binnen je ${copy.singularLower} dan de grens die je ` +
            'jezelf stelde.',
          icon: 'AlertTriangle',
          color: 'red',
          actionUrl: limitUrl(potId),
          metadata: {
            matched: current.periodMatchedAmount,
            limit: current.limitAmount,
            over: current.periodOverAmount,
          },
          aiContext:
            `Ik zit ${words.lopend} ${formatCurrency(current.periodOverAmount)} boven mijn eigen grens voor ` +
            `${config.name}. Welke uitgaven zitten daarin?`,
        },
      })
    } else if (current.isNearLimit) {
      // `isNearLimit` eist zelf al `status === 'within'`; deze `else` is dus geen
      // extra regel maar de plek waar de uitsluiting zichtbaar is.
      events.push({
        kind: 'near',
        potId,
        periodKey: current.periodKey,
        once: false,
        notification: {
          id: `spend_limit_${potId}_${current.periodKey}_near`,
          type: 'spend_limit',
          priority: 3,
          title: `${config.name}: bijna aan je grens`,
          description:
            `Je ${copy.singularLower} nadert ${words.lopend} de grens die je jezelf stelde. ` +
            'Er is nog ruimte, maar niet veel.',
          icon: 'Gauge',
          color: 'amber',
          actionUrl: limitUrl(potId),
          metadata: {
            matched: current.periodMatchedAmount,
            limit: current.limitAmount,
            headroom: current.periodHeadroom,
          },
          aiContext:
            `Mijn ${copy.singularLower} "${config.name}" staat ${words.lopend} op ` +
            `${formatCurrency(current.periodMatchedAmount)} van mijn grens van ` +
            `${formatCurrency(current.limitAmount)}. Waar gaat dat geld heen?`,
        },
      })
    }

    // ── Eenmalige events over de laatst afgesloten periode ──────────────────
    const last = report.lastClosedPeriod
    if (!last) continue

    const closed = report.closedPeriods
    const previous = closed.length >= 2 ? closed[closed.length - 2] : null

    if (last.status === 'within' && previous?.status === 'exceeded') {
      if (markOnce(potId, last.periodKey, 'recovered')) {
        events.push({
          kind: 'recovered',
          potId,
          periodKey: last.periodKey,
          once: true,
          notification: {
            id: `spend_limit_${potId}_${last.periodKey}_recovered`,
            type: 'spend_limit',
            priority: 4,
            title: `${config.name}: weer binnen je grens`,
            description:
              `In ${last.label} bleef je ${copy.singularLower} binnen de grens. ` +
              'De periode daarvoor ging je er nog overheen.',
            icon: 'CheckCircle2',
            color: 'green',
            actionUrl: limitUrl(potId, last.periodKey),
            metadata: {
              matched: last.periodMatchedAmount,
              limit: last.limitAmount,
            },
            aiContext:
              `Mijn ${copy.singularLower} "${config.name}" bleef in ${last.label} binnen de grens, na een ` +
              'periode erboven. Wat is er veranderd in mijn uitgaven?',
          },
        })
      }
    }

    // Een reeks > 0 betekent per definitie dat de laatst afgesloten periode
    // binnen de grens bleef (`computeStreaks` zet 'm op 0 bij een overschrijding),
    // dus daar is geen aparte status-check voor nodig.
    //
    // `streakStartsAfterCreation` staat VÓÓR `markOnce`, net als de
    // voorkeurscheck: een mijlpaal die we niet vieren mag de gate niet opbranden.
    // Zonder die volgorde zou dezelfde pot de mijlpaal ook later — als de reeks
    // wél volledig ná de aanmaak ligt — nooit meer krijgen.
    const streak = report.streaks.currentStreak
    if (
      isStreakMilestone(streak) &&
      streakStartsAfterCreation(closed, streak, config.createdAt) &&
      markOnce(potId, last.periodKey, `streak${streak}`)
    ) {
      events.push({
        kind: 'streak_milestone',
        potId,
        periodKey: last.periodKey,
        once: true,
        notification: {
          id: `spend_limit_${potId}_${last.periodKey}_streak${streak}`,
          type: 'spend_limit',
          priority: 4,
          title: `${config.name}: ${streak} ${words.meervoud} op rij binnen je grens`,
          description:
            `Tot en met ${last.label} bleef je ${copy.singularLower} ${streak} ${words.meervoud} ` +
            'achter elkaar binnen de grens.',
          icon: 'Sparkles',
          color: 'green',
          actionUrl: limitUrl(potId, last.periodKey),
          aiContext:
            `Ik bleef ${streak} ${words.meervoud} op rij binnen mijn eigen grens voor ${config.name}. ` +
            'Wat zegt dat over mijn uitgavenpatroon?',
        },
      })
    }
  }

  // ── Prunen ────────────────────────────────────────────────────────────────
  // Potten die niet meer bestaan (gearchiveerd/verwijderd) verdwijnen uit de
  // gate, en per pot blijven alleen de laatste periodesleutels staan. Sorteren
  // is lexicografisch: '2026-08' < '2026-09', '2026-Q1' < '2026-Q3', '2025' <
  // '2026' — binnen één periodesoort exact chronologisch. Na een periodewissel
  // kunnen twee vormen naast elkaar staan; dan is de volgorde niet meer strikt
  // chronologisch, wat voor een opruimregel geen kwaad kan.
  const knownPotIds = new Set(limits.map((l) => l.config.id))
  for (const potId of Object.keys(next)) {
    if (!knownPotIds.has(potId)) {
      delete next[potId]
      gateChanged = true
      continue
    }
    const periodKeys = Object.keys(next[potId])
    if (periodKeys.length <= SPEND_LIMIT_GATE_PERIOD_LIMIT) continue
    const keep = new Set(periodKeys.sort().slice(-SPEND_LIMIT_GATE_PERIOD_LIMIT))
    const pruned: Record<string, string[]> = {}
    for (const key of periodKeys) {
      if (keep.has(key)) pruned[key] = next[potId][key]
    }
    next[potId] = pruned
    gateChanged = true
  }

  return { events, gate: next, gateChanged }
}
