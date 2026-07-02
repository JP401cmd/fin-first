/**
 * Horizon-kernel · tabel **Geb** (auto-rijen) — Excel-tab `Geb`, rij 14-30.
 *
 * De automatische gebeurtenissen uit `Auto-gebeurtenissen` (AOW, pensioen-
 * multipot, kinderen, erfenis) landen als koppeling op vaste Geb-rijen. Deze
 * module reproduceert die auto-rijen: de **event-cellen** (naam/type/bedrag/
 * geïnd.-start/start/eind per post) én de **machine-leesbare helper-kolommen
 * W:AE** (sIdx/eIdx/bn per post) die CF!H (baten) en Af!D (kosten) consumeren.
 *
 * Vaste rij-toewijzing (structuur.md):
 *   - rij 14      → AOW (post 1)
 *   - rij 15-20   → pensioen multi-pot (6 slots, post 1)
 *   - rij 21-26   → kinderen (2 rijen p. kind × 3 posten = alle 3 posts)
 *   - rij 27-29   → blanco (geen event)
 *   - rij 30      → erfenis (post 1)
 * (Rij 4-13 = handmatige invoer, rij 32-37 = werk-strategie-resultaat — beide
 * buiten deze module.)
 *
 * ## Helper-kolommen (W:AE), per post
 *   - sIdx = `(startLt−P!B7)·12 + (startMnd−1)`   · leeg → **99999**
 *   - eIdx = `(eindLt−P!B7)·12 + (eindMnd−1)`      · leeg → **99998** (eenmalig: = sIdx)
 *   - bn   = koopkracht-nu bedrag (CF!H indexeert per maand) · leeg → **0**
 * De sentinel 99999>99998 maakt een lege post structureel inactief (sIdx>eIdx).
 *
 * ## Beproevings-beperking
 * In alle 16 fixtures is uitsluitend de **AOW-post (rij 14)** actief; pensioen/
 * kinderen/erfenis zijn leeg, dus rij 15-30 leveren enkel de inactieve helper-
 * markers (99999/99998/0). De event-cel-reproductie is daarom cel-voor-cel
 * bewezen op rij 14; de lege-tekst-artefacten van de inactieve event-rijen
 * (Excel-""-vs-blanco-patroon) vallen bewust buiten de vergelijking — het
 * deterministische, downstream-geconsumeerde resultaat van elke rij zit volledig
 * in W:AE. Zie parity-test + rapport.
 *
 * Pure functie — geen fs/Supabase/Date.now/Math.random.
 */

import type { KernelInput } from '../types'
import { computeAutoEvents, type AutoEvent } from './auto-gebeurtenissen'

/** Sentinel-startindex voor een lege post (Geb W/Z/AC). */
export const EMPTY_SIDX = 99999
/** Sentinel-eindindex voor een lege post (Geb X/AA/AD); < sentinel-sIdx = nooit actief. */
export const EMPTY_EIDX = 99998

/** Eerste en laatste auto-rij op de Geb-tab (1-gebaseerd Excel-rijnummer). */
export const GEB_AUTO_ROW_FIRST = 14
export const GEB_AUTO_ROW_LAST = 30

/** De sIdx/eIdx/bn-drieluik van één post (Geb-helperkolommen). */
export interface GebPostHelpers {
  readonly sIdx: number
  readonly eIdx: number
  readonly bn: number
}

/** De event-cellen A-H van een actieve post-1-rij (naam t/m eind-maand). */
export interface GebEventCells {
  readonly naam: string // A
  readonly type: 'Periodiek' | 'Eenmalig' // B
  readonly bedrag: number // C
  readonly geindStart: number // D — geïndexeerd bedrag op de startmaand
  readonly startLeeftijd: number // E
  readonly startMaand: number // F
  readonly eindLeeftijd: number | Empty // G — leeg bij eenmalig
  readonly eindMaand: number | Empty // H
}

/** Excel-""-resultaat (leeg tekstresultaat), voor niet-ingevulde eind-cellen. */
type Empty = ''
const EMPTY: Empty = ''

/** Eén auto-rij (14-30) van de Geb-tab: helpers per post + evt. post-1 event-cellen. */
export interface GebAutoRow {
  /** 1-gebaseerd Excel-rijnummer (14-30). */
  readonly gebRow: number
  /** Event-cellen A-H van post 1, of `null` als de rij geen actief event draagt. */
  readonly post1Event: GebEventCells | null
  /** Helper-drieluik per post (index 0/1/2 = post 1/2/3). */
  readonly helpers: readonly [GebPostHelpers, GebPostHelpers, GebPostHelpers]
}

/** Lege post-helper: structureel inactief (sIdx > eIdx). */
const EMPTY_HELPERS: GebPostHelpers = { sIdx: EMPTY_SIDX, eIdx: EMPTY_EIDX, bn: 0 }

/** Leeftijd+maand → 0-gebaseerde maandindex (`(lt−P!B7)·12 + (mnd−1)`). */
function monthIndexOf(input: KernelInput, leeftijd: number, maand: number): number {
  return (leeftijd - input.startLeeftijd) * 12 + (maand - 1)
}

/** Bouw het helper-drieluik van een actieve post uit een auto-event. */
function helpersFromEvent(input: KernelInput, ev: AutoEvent): GebPostHelpers {
  const sIdx = monthIndexOf(input, ev.startLeeftijd, ev.startMaand)
  // Eenmalig zonder eind → vuurt één maand (eIdx = sIdx); anders het eind-anker.
  const eIdx =
    ev.eindLeeftijd !== null && ev.eindMaand !== null
      ? monthIndexOf(input, ev.eindLeeftijd, ev.eindMaand)
      : sIdx
  // bn = koopkracht-nu bedrag; CF!H past de maand-indexatie toe (geïndexeerde én
  // reeds-gede-indexeerde posten dragen hun eigen basisbedrag).
  return { sIdx, eIdx, bn: ev.bedrag }
}

/** Bouw de A-H event-cellen van een post-1-event (incl. geïndexeerd startbedrag). */
function eventCells(input: KernelInput, ev: AutoEvent): GebEventCells {
  const sIdx = monthIndexOf(input, ev.startLeeftijd, ev.startMaand)
  return {
    naam: ev.naam,
    type: ev.type,
    bedrag: ev.bedrag,
    // D "Geïnd. (start)" = bedrag geïndexeerd naar de startmaand.
    geindStart: ev.bedrag * Math.pow(1 + input.inflatie, sIdx / 12),
    startLeeftijd: ev.startLeeftijd,
    startMaand: ev.startMaand,
    eindLeeftijd: ev.eindLeeftijd ?? EMPTY,
    eindMaand: ev.eindMaand ?? EMPTY,
  }
}

/**
 * Reproduceer de auto-rijen 14-30 van de Geb-tab uit `KernelInput`. Elke rij
 * start als volledig-inactief (drie lege helper-drieluiken, geen event) en
 * krijgt vervolgens de auto-events uit `computeAutoEvents` op hun vaste
 * (rij, post)-positie geplaatst.
 */
export function computeGebAutoRows(input: KernelInput): GebAutoRow[] {
  const events = computeAutoEvents(input)

  // Muteerbare opbouw per rij; daarna bevriezen tot GebAutoRow.
  const rows = new Map<
    number,
    { post1Event: GebEventCells | null; helpers: [GebPostHelpers, GebPostHelpers, GebPostHelpers] }
  >()
  for (let row = GEB_AUTO_ROW_FIRST; row <= GEB_AUTO_ROW_LAST; row++) {
    rows.set(row, { post1Event: null, helpers: [EMPTY_HELPERS, EMPTY_HELPERS, EMPTY_HELPERS] })
  }

  for (const ev of events) {
    const slot = rows.get(ev.gebRow)
    if (slot === undefined) continue // defensief: buiten 14-30
    slot.helpers[ev.post - 1] = helpersFromEvent(input, ev)
    if (ev.post === 1) {
      slot.post1Event = eventCells(input, ev)
    }
  }

  const out: GebAutoRow[] = []
  for (let row = GEB_AUTO_ROW_FIRST; row <= GEB_AUTO_ROW_LAST; row++) {
    const slot = rows.get(row)! // altijd geïnitialiseerd
    out.push({ gebRow: row, post1Event: slot.post1Event, helpers: slot.helpers })
  }
  return out
}
