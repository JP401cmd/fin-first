// lib/page-status/resolve.ts
//
// PURE mapping (géén IO): reeds-berekende status-bronnen → PageStatusMap voor
// alle in-scope routes onder /overzicht. Geen DB, geen rekenmotor — alleen het
// koppelen van een bestaande status + live cijfer aan gecureerde copy (copy.ts).
//
// "Consume, don't recompute": de statussen komen 1-op-1 uit `loadLeverScores`
// (de hefbomen + Box 1/3-dots) en `buildCashflowCards` (de vier cashflow-kaarten)
// — exact dezelfde bronnen die de sidebar-dots en de kaarten voeden. We
// herberekenen hier dus nooit een drempel; we mappen alleen status + tekst.
//
// VOCABULAIRE-MAPPING (belangrijk):
//   LeverScores-entries gebruiken `LeverStatus` = 'green'|'amber'|'red'|'neutral'.
//   PageStatusInfo.status is `LeverageStatus` = 'good'|'warn'|'bad'|'neutral'.
//   Mapping: green→good, amber→warn, red→bad, neutral→neutral.
//   De cashflow-kaarten en box1/box3-statussen zijn AL LeverageStatus → direct.

import type { LeverScoresResult } from '@/lib/lever-scores-loader'
import type { LeverStatus } from '@/lib/lever-scores'
import type { CashflowCard } from '@/lib/cashflow-cards'
import type { LeverageStatus } from '@/lib/leverage-status'
import type { PageStatusInfo, PageStatusMap } from '@/lib/page-status/types'
import { PAGE_STATUS_COPY, fillFigure, type RouteCopy } from '@/lib/page-status/copy'

/** LeverStatus (kompas-vocabulaire) → LeverageStatus (kaart-/banner-vocabulaire). */
export function leverToLeverageStatus(s: LeverStatus): LeverageStatus {
  return s === 'green' ? 'good' : s === 'amber' ? 'warn' : s === 'red' ? 'bad' : 'neutral'
}

/**
 * Sentinel waarmee `lever-scores.ts` een hefboom zonder echte data markeert
 * ("Geen data — Start", "Geen bezittingen geregistreerd — Start", enz.).
 *
 * Deze gate ontstond als PLEISTER: de schulden-hefboom codeerde 'geen data' als
 * het getal 50, wat in de amber-band valt, dus een lege gebruiker kreeg hier
 * bijna "Je schulden wegen zwaar" te lezen. Sinds UR2-10 is dat bij de bron
 * opgelost — alle vier de hefbomen geven `null` → 'neutral' zodra hun detail dit
 * sentinel draagt, en `buildInfo` filtert 'neutral' al weg. De gate blijft
 * bewust staan als goedkope vangrail voor een toekomstige hefboom die weer een
 * synthetisch middengetal zou invoeren; de échte grendel is de invariant-test in
 * `lib/lever-scores.test.ts` (detail bevat "— Start" ⟺ status is 'neutral').
 */
const LEVER_NO_DATA_MARKER = '— Start'

/**
 * Bouw één PageStatusInfo uit een route + status + live cijfer. Geeft `null`
 * terug voor good/neutral (die tonen geen banner) of als er geen copy bestaat.
 */
function buildInfo(
  route: string,
  status: LeverageStatus,
  figure: string | null | undefined,
): PageStatusInfo | null {
  if (status !== 'warn' && status !== 'bad') return null
  const copy: RouteCopy | undefined = PAGE_STATUS_COPY[route]
  if (!copy) return null
  const sc = status === 'warn' ? copy.warn : copy.bad
  return {
    route,
    kind: 'leverage',
    status,
    title: copy.title,
    reason: fillFigure(sc.reason, figure),
    remedy: sc.remedy,
    action: copy.action,
    will: copy.will,
  }
}

export interface ResolvePageStatusInput {
  /**
   * De vier-hefbomen-scores + Box 1/3-statussen uit loadLeverScores. Optioneel:
   * laat weg om de hefbomen- én Box 1/3-routes over te slaan (route-scoped
   * endpoints laden alleen de familie die de gevraagde route nodig heeft).
   */
  levers?: LeverScoresResult
  /**
   * De vier cashflow-kaarten uit buildCashflowCards (in willekeurige volgorde).
   * Optioneel: laat weg om de cashflow-subkaart-routes over te slaan.
   */
  cashflowCards?: CashflowCard[]
  /**
   * Of de Box 2-positie MATERIEEL is — d.w.z. of er daadwerkelijk een heffing
   * staat (Box 2-belasting over dividend en/of het bovenmatige deel boven de
   * €500.000-leengrens). Canonieke bron: `loadBox2Materiality`
   * (lib/box2-relevance.ts), die op `calculateBox2` leunt.
   *
   * Optioneel: laat weg (undefined) om de Box 2-route over te slaan; `false`
   * → 'neutral' → geen banner.
   *
   * BEWUST NIET de kale relevantie-gate (bevinding L8). Tot 26-08-2026 mapte dit
   * veld `hasBox2Relevance` — pure aanwezigheid — rechtstreeks op 'warn'. Een DGA
   * met een klein belang, geen uitkering en een symbolische rekening-courant
   * kreeg zo een "AANDACHT"-banner bij een heffing van €0. Aandacht vragen mag
   * alleen wanneer er iets te doen is.
   */
  box2Material?: boolean
}

/**
 * Map de aangeleverde status-bronnen naar een PageStatusMap. Elke familie is
 * optioneel: ontbreekt een bron, dan worden de bijbehorende routes overgeslagen.
 * Zo kan de volledige layout álle bronnen meegeven, terwijl een route-scoped
 * endpoint alléén de familie laadt die de gevraagde route nodig heeft (egress).
 *
 * good/neutral worden al weggelaten via `buildInfo` (die `null` teruggeeft),
 * zodat de map per definitie alleen toonbare warn/bad-entries bevat. De functie
 * blijft puur & deterministisch (los unit-testbaar).
 *
 * @returns Route → PageStatusInfo, uitsluitend voor warn/bad-routes.
 */
export function resolvePageStatusMap(input: ResolvePageStatusInput): PageStatusMap {
  const { levers, cashflowCards, box2Material } = input

  const entries: Array<PageStatusInfo | null> = []

  // ── Hefbomen + Belasting-subpagina's (alleen als lever-scores geladen zijn) ──
  if (levers) {
    const { scores, box1Status, box3Status } = levers

    // No-data-gate: een hefboom zonder echte data krijgt geen banner, ook niet
    // als z'n synthetische score toevallig amber/red is (zie LEVER_NO_DATA_MARKER).
    const leverInfo = (
      route: string,
      lever: { status: LeverStatus; detail: string },
    ): PageStatusInfo | null =>
      lever.detail.includes(LEVER_NO_DATA_MARKER)
        ? null
        : buildInfo(route, leverToLeverageStatus(lever.status), lever.detail)

    entries.push(
      leverInfo('/overzicht/bezittingen', scores.assets),
      leverInfo('/overzicht/schulden', scores.debts),
      leverInfo('/overzicht/cashflow', scores.cashflow),
      leverInfo('/overzicht/belasting', scores.tax),
      // Belasting-subpagina's (Box 1/3 AL LeverageStatus). Box 1: geen
      // jaarruimte-cijfer-string → null (copy valt terug op de cijferloze vorm).
      // Box 3: het Belasting-lever-detail beschrijft de Box 3-blootstelling
      // ("€ Xk boven vrijstelling") → bruikbaar live cijfer.
      buildInfo('/overzicht/belasting/box1', box1Status, null),
      buildInfo('/overzicht/belasting/box3', box3Status, scores.tax.detail),
    )
  }

  // ── Cashflow-subkaarten (alleen als de kaarten geladen zijn) ──
  if (cashflowCards) {
    const cardByKey = (k: CashflowCard['key']): CashflowCard | undefined =>
      cashflowCards.find((c) => c.key === k)

    /** Live cijfer voor een cashflow-kaart: subText (kort) of anders detail.tip. */
    const cardFigure = (k: CashflowCard['key']): string | null => {
      const card = cardByKey(k)
      if (!card) return null
      return card.subText ?? card.detail?.tip ?? null
    }

    const budget = cardByKey('budget')
    if (budget) {
      entries.push(buildInfo('/overzicht/cashflow/budget', budget.status, cardFigure('budget')))
    }
    const transacties = cardByKey('transacties')
    if (transacties) {
      entries.push(
        buildInfo('/overzicht/cashflow/transacties', transacties.status, cardFigure('transacties')),
      )
    }
    const vasteLasten = cardByKey('vaste-lasten')
    if (vasteLasten) {
      entries.push(
        buildInfo(
          '/overzicht/cashflow/vaste-lasten',
          vasteLasten.status,
          cardFigure('vaste-lasten'),
        ),
      )
    }
    const forecast = cardByKey('forecast')
    if (forecast) {
      entries.push(
        buildInfo('/overzicht/cashflow/forecast', forecast.status, cardFigure('forecast')),
      )
    }
  }

  // ── Box 2: alleen wanneer expliciet meegegeven. undefined → route overslaan;
  // true (= materiële heffing) → 'warn'; false → 'neutral' → geen banner. ──
  if (box2Material !== undefined) {
    entries.push(
      buildInfo('/overzicht/belasting/box2', box2Material ? 'warn' : 'neutral', null),
    )
  }

  const map: PageStatusMap = {}
  for (const info of entries) {
    if (info) map[info.route] = info
  }
  return map
}
