/**
 * Verloop van het gezondheidsgetal en de vrijheidsleeftijd, per maand.
 *
 * Bron: de maandstanden uit `lib/server-data/base.ts#getNetWorthSnapshots12m`
 * (laatste 12 kalendermaanden, één stand per maand, eigen `user_id`). Deze module
 * rekent niets opnieuw uit: hij kiest velden uit die rijen en vergelijkt het
 * huidige gezondheidsgetal (uit de canonieke bron) met de opgeslagen stand van de
 * vorige maand.
 *
 * Twee vergelijkbaarheidsregels:
 *  · `score_version` — een score uit een andere rekenmethode is niet vergelijkbaar
 *    (ADR 0010). "Sinds vorige maand" vergelijkt alleen binnen dezelfde versie, en
 *    het verloop markeert een wisseling.
 *  · `fire_age` — de vrijheidsleeftijd zoals hij tóen berekend werd, door de motor
 *    in `engine_bron`. Historie, geen live getal: de live vrijheidsleeftijd komt uit
 *    de horizon-kernel en wordt nooit uit snapshots afgeleid.
 */
import { HEALTH_SCORE_VERSION } from '@/lib/financial-health'
import { localDateString, localMonthStartMonthsAgo } from '@/lib/month-range'

/**
 * Datum van de grondslagbreuk in de budgetdiscipline-pijler (eigenaarsbesluit
 * 30 aug 2026, zonder backfill): vanaf deze dag telt de pijler de canonieke
 * bestedingssom (inkomsten eraf, eigen-rekening-overboekingen niet mee); rijen
 * van daarvóór telden de ongefilterde som. Zelfde rekenmethode (`score_version`),
 * andere telling van één pijler — het verloop markeert hem, maar breekt de lijn
 * niet. De snapshot-writers verwijzen in hun "GRONDSLAG-BREUK"-commentaar hierheen.
 */
export const BUDGETDISCIPLINE_GRONDSLAG_BREUK = '2026-08-30'

/** Eén maandpunt in het verloop — geen bedragen, alleen wat de reeksen tonen. */
export interface HealthVerloopPunt {
  /** `YYYY-MM-DD` van de maandstand (de laatste snapshot in die maand). */
  snapshot_date: string
  /** Gezondheidsgetal zoals het toen berekend werd (0–100). */
  resilience_score: number | null
  /** Rekenmethode van `resilience_score`; null = onbekend. */
  score_version: number | null
  /** Vrijheidsleeftijd zoals hij toen berekend werd. */
  fire_age: number | null
  /** Motor die `fire_age` schreef ('kernel' | 'v2'; null telt als 'v2'). */
  engine_bron: string | null
  /** Waar: het gezondheidsgetal van dit punt is de live stand (lopende maand). */
  live?: true
}

/** Minimale rijvorm van een maandstand (subset van `NetWorthSnapshot12mRow`). */
export interface VerloopBronRij {
  snapshot_date: string
  resilience_score?: number | string | null
  score_version?: number | string | null
  fire_age?: number | string | null
  engine_bron?: string | null
}

function toNumberOrNull(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Maandstanden → verlooppunten (oplopend, zoals aangeleverd). */
export function deriveHealthVerloop(rows: readonly VerloopBronRij[]): HealthVerloopPunt[] {
  return rows.map((r) => ({
    snapshot_date: String(r.snapshot_date),
    resilience_score: toNumberOrNull(r.resilience_score),
    score_version: toNumberOrNull(r.score_version),
    fire_age: toNumberOrNull(r.fire_age),
    engine_bron: r.engine_bron ?? null,
  }))
}

/**
 * Het verloop met de LOPENDE maand als live stand. De opgeslagen stand van deze
 * maand is eerder in de maand geschreven en rekent de vrijheidspijler met een
 * andere motor; de kaart toont het live getal. Door het punt van de lopende maand
 * het live getal te geven, zeggen "sinds vorige maand" en de grafiek per
 * constructie hetzelfde.
 *
 * Staat er een rij deze maand, dan krijgt die het live getal en de huidige
 * rekenmethode; datum, vrijheidsleeftijd en motor blijven historie. Staat er geen
 * rij, dan komt er een punt van vandaag bij zonder vrijheidsleeftijd. Alleen
 * aanroepen wanneer het live getal een oordeel is (verdict 'score').
 */
export function withLiveCurrentMonth(
  verloop: readonly HealthVerloopPunt[],
  live: { liveTotal: number; now: Date; currentVersion?: number },
): HealthVerloopPunt[] {
  const { liveTotal, now, currentVersion = HEALTH_SCORE_VERSION } = live
  const vandaag = localDateString(now)
  const dezeMaand = vandaag.slice(0, 7)
  const liveScore = Math.round(liveTotal)
  const idx = verloop.findIndex((p) => p.snapshot_date.slice(0, 7) === dezeMaand)
  if (idx === -1) {
    return [
      ...verloop,
      { snapshot_date: vandaag, resilience_score: liveScore, score_version: currentVersion, fire_age: null, engine_bron: null, live: true },
    ]
  }
  return verloop.map((p, i) =>
    i === idx ? { ...p, resilience_score: liveScore, score_version: currentVersion, live: true } : p,
  )
}

/**
 * De eerste wisseling van `score_version` in een chronologische reeks: de
 * `snapshot_date` van het eerste punt waarvan de versie verschilt van het
 * vorige punt mét een bekende versie. Null zonder wisseling, of wanneer de reeks
 * geen versies draagt (oudere selects). Punten zonder score tellen niet mee.
 */
export function detectScoreVersionTransition(
  punten: readonly { snapshot_date: string; resilience_score?: number | null; score_version?: number | null }[],
): string | null {
  let vorige: number | null = null
  for (const p of punten) {
    if (p.resilience_score === null || p.resilience_score === undefined) continue
    if (p.score_version === null || p.score_version === undefined) continue
    if (vorige !== null && p.score_version !== vorige) return p.snapshot_date
    vorige = p.score_version
  }
  return null
}

/**
 * De grondslagbreuk van de budgetdiscipline, als het verloop eroverheen loopt:
 * `BUDGETDISCIPLINE_GRONDSLAG_BREUK` wanneer er een punt mét score vóór die datum
 * én een op of na die datum is, anders null.
 */
export function detectGrondslagBreuk(
  punten: readonly { snapshot_date: string; resilience_score?: number | null }[],
): string | null {
  const metScore = punten.filter((p) => p.resilience_score !== null && p.resilience_score !== undefined)
  const ervoor = metScore.some((p) => p.snapshot_date < BUDGETDISCIPLINE_GRONDSLAG_BREUK)
  const erna = metScore.some((p) => p.snapshot_date >= BUDGETDISCIPLINE_GRONDSLAG_BREUK)
  return ervoor && erna ? BUDGETDISCIPLINE_GRONDSLAG_BREUK : null
}

/**
 * "Sinds vorige maand": het huidige gezondheidsgetal min de opgeslagen stand van
 * de vorige KALENDERMAAND (t.o.v. `now`), afgerond op hele punten.
 *
 * Null — geen vergelijking — wanneer die maand geen stand of geen score heeft,
 * of wanneer de stand met een andere rekenmethode is berekend dan het huidige
 * getal (`currentVersion`, standaard `HEALTH_SCORE_VERSION`).
 */
export function healthScoreSinceLastMonth(input: {
  /** Het huidige gezondheidsgetal uit de canonieke bron. */
  currentTotal: number
  verloop: readonly HealthVerloopPunt[]
  now: Date
  currentVersion?: number
}): number | null {
  const { currentTotal, verloop, now, currentVersion = HEALTH_SCORE_VERSION } = input
  if (!Number.isFinite(currentTotal)) return null
  const vorigeMaand = localMonthStartMonthsAgo(now, 1).slice(0, 7)
  const stand = verloop.find((p) => p.snapshot_date.slice(0, 7) === vorigeMaand)
  if (!stand || stand.resilience_score === null) return null
  if (stand.score_version !== currentVersion) return null
  return Math.round(currentTotal) - Math.round(stand.resilience_score)
}

/**
 * De eerste "rekenwijze gewijzigd"-overgang in een chronologisch geordende reeks
 * (V15, FASE 5 stap 2b): het eerste punt waarop de motor die de FIRE-velden schreef
 * (`engine_bron`) verschilt van het vorige punt. NULL (historisch / vlag-uit) telt als
 * 'v2'. Geeft de `snapshot_date` van dát punt, of null als de hele reeks met één
 * rekenwijze is doorgerekend (dan is er geen knik-uitleg nodig).
 */
export function detectEngineBronTransition(
  snapshots: readonly Pick<HealthVerloopPunt, 'snapshot_date' | 'engine_bron'>[],
): string | null {
  const norm = (bron: string | null | undefined): string => bron ?? 'v2'
  for (let i = 1; i < snapshots.length; i++) {
    if (norm(snapshots[i].engine_bron) !== norm(snapshots[i - 1].engine_bron)) {
      return snapshots[i].snapshot_date
    }
  }
  return null
}

/**
 * Compacte NL-maand+jaar-notatie voor een overgang-annotatie (bv. "jul 2026").
 * Parseert de `YYYY-MM-DD`-string zélf (TZ-onafhankelijk): `new Date(dateStr)` zou
 * UTC-middernacht opleveren en via lokale getters bij negatieve UTC-offsets een dag
 * (en op een maandgrens dus een maand) kunnen verschuiven.
 */
export function formatTransitionDate(dateStr: string): string {
  const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
  const [year, month] = dateStr.split('-')
  const monthIdx = Number(month) - 1
  return monthIdx >= 0 && monthIdx < 12 ? `${months[monthIdx]} ${year}` : dateStr
}
