/**
 * Verloop van het gezondheidsgetal en de vrijheidsleeftijd, per maand.
 *
 * Bron: de maandstanden uit `lib/server-data/base.ts#getNetWorthSnapshots12m`
 * (laatste 12 kalendermaanden, één stand per maand, eigen `user_id`). Het verloop
 * toont de opgeslagen scores zoals ze toen berekend werden; "sinds vorige maand"
 * rekent de vorige maand opnieuw met de canonieke functie op de opgeslagen
 * vorige-maand-DATA (netto vermogen, spaarquote) — nooit een opgeslagen score naast
 * het live getal, want de writers rekenen de vrijheidspijler anders.
 *
 * Twee vergelijkbaarheidsregels in het verloop:
 *  · `score_version` — een score uit een andere rekenmethode is niet vergelijkbaar
 *    (ADR 0010); het verloop markeert een wisseling en breekt de lijn.
 *  · `fire_age` — de vrijheidsleeftijd zoals hij tóen berekend werd, door de motor
 *    in `engine_bron`. Historie, geen live getal: de live vrijheidsleeftijd komt uit
 *    de horizon-kernel en wordt nooit uit snapshots afgeleid.
 */
import {
  computeHealthScoreWithTrend,
  healthScoreVerdict,
  type HealthScore,
  type HealthScoreInput,
} from '@/lib/financial-health'
import { computeFreedomPctForPlan, type FreedomProgressBasisInput } from '@/lib/core-metrics'
import { legacyAnchorOf } from '@/lib/fire-strategy'
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

/** De losse "nu"-markering: het live gezondheidsgetal van vandaag. */
export interface HealthVerloopNu {
  /** `YYYY-MM-DD` van vandaag (lokaal). */
  snapshot_date: string
  /** Het live gezondheidsgetal, afgerond. */
  score: number
}

/**
 * Het verloop naast de live stand. De opgeslagen maandstanden en het live getal
 * zijn met verschillende methodes berekend (de writers rekenen de vrijheidspijler
 * als kapitaalratio met de scalar-leeftijd, live rekent de kernel mét stop-anker),
 * dus ze horen niet op één lijn. De lijn van het gezondheidsgetal loopt daarom tot
 * en met de laatste maand vóór de lopende: een opgeslagen score van deze maand
 * valt eruit (zijn vrijheidsleeftijd blijft historie). Het live getal komt als
 * losse markering "nu" terug, niet verbonden. Alleen aanroepen wanneer het live
 * getal een oordeel is (verdict 'score').
 */
export function verloopMetNu(
  verloop: readonly HealthVerloopPunt[],
  live: { liveTotal: number; now: Date },
): { punten: HealthVerloopPunt[]; nu: HealthVerloopNu } {
  const vandaag = localDateString(live.now)
  const dezeMaand = vandaag.slice(0, 7)
  return {
    punten: verloop.map((p) =>
      p.snapshot_date.slice(0, 7) === dezeMaand && p.resilience_score !== null ? { ...p, resilience_score: null } : p,
    ),
    nu: { snapshot_date: vandaag, score: Math.round(live.liveTotal) },
  }
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
 * De maandstand van de vorige KALENDERMAAND (t.o.v. `now`) als invoer voor
 * "sinds vorige maand": het netto vermogen en de spaarquote zoals opgeslagen —
 * data, geen berekende score. Null zonder stand in die maand.
 */
export function vorigeMaandStand(
  rows: readonly { snapshot_date: string; net_worth: number | string; savings_rate?: number | string | null }[],
  now: Date,
): { netWorth: number; savingsRatePct: number | null } | null {
  const vorigeMaand = localMonthStartMonthsAgo(now, 1).slice(0, 7)
  const stand = [...rows].reverse().find((r) => String(r.snapshot_date).slice(0, 7) === vorigeMaand)
  if (!stand) return null
  const netWorth = Number(stand.net_worth)
  if (!Number.isFinite(netWorth)) return null
  return { netWorth, savingsRatePct: toNumberOrNull(stand.savings_rate) }
}

/**
 * De live grondslag van `healthScoreInput.freedomPct` uit de horizon-bundel —
 * precies de velden die `lib/horizon-data-loader.ts` aan `computeFreedomPctForPlan`
 * gaf. Eén mapping voor de hub en de briefing.
 */
export function liveFreedomBasis(h: {
  freedomBasis: { homeExcludedFromFire: boolean; netWorthInclHome: number; fireEligibleNetWorth: number }
  requiredNetWorthInclHome: number | null
  requiredPortfolioExclHome: number | null
}): FreedomProgressBasisInput {
  return {
    homeExcludedFromFire: h.freedomBasis.homeExcludedFromFire,
    netWorthInclHome: h.freedomBasis.netWorthInclHome,
    fireEligibleNetWorth: h.freedomBasis.fireEligibleNetWorth,
    requiredNetWorthInclHome: h.requiredNetWorthInclHome,
    requiredPortfolioExclHome: h.requiredPortfolioExclHome,
  }
}

/** Afrondingsruis tussen twee identieke `computeFreedomPctForPlan`-aanroepen. */
const FREEDOM_PARITEIT_MARGE = 1e-9

/**
 * "Sinds vorige maand": de verandering van het gezondheidsgetal in hele punten,
 * met de trend van `computeHealthScoreWithTrend` — DEZELFDE canonieke functie op
 * vorige-maand-invoer (het opgeslagen netto vermogen en de spaarquote van vorige
 * maand), op dezelfde actieve pijlerset. Nooit een opgeslagen score naast het
 * live getal: die zijn met een andere methode berekend.
 *
 * De vrijheidspijler van vorige maand komt uit `computeFreedomPctForPlan` op de
 * live grondslag, verschoven met het verschil in netto vermogen. Pariteit is een
 * voorwaarde: reproduceert die grondslag het live `freedomPct` niet exact, dan
 * geen vergelijking.
 *
 * Null — geen vergelijking — bij:
 *  · een onbekend oordeel (ADR 0131);
 *  · een vast stop-anker (`aow`/`now`/`age`): live is de vrijheidspijler daar de
 *    DEKKING uit een kernel-run, en een vorige-maand-dekking vergt een run op het
 *    vermogen van toen die hier niet is. Liever geen regel dan een valse stijging;
 *  · geen stand vorige maand, of een grondslag zonder pariteit.
 */
export function healthScoreSinceLastMonth(args: {
  /** Het huidige gezondheidsgetal uit de canonieke bron. */
  health: HealthScore
  /** De canonieke invoer waarmee `health` berekend is. */
  input: HealthScoreInput
  budgetingActive: boolean
  /** De live grondslag van `input.freedomPct` (solved: kapitaalratio). */
  freedomBasis: FreedomProgressBasisInput
  vorigeMaand: { netWorth: number; savingsRatePct: number | null } | null
}): number | null {
  const { health, input, budgetingActive, freedomBasis, vorigeMaand } = args
  if (!vorigeMaand) return null
  if (healthScoreVerdict(health).kind !== 'score') return null
  const anker = input.fireStopAnchor ?? legacyAnchorOf(input.fireEndStrategy)?.kind ?? 'solved'
  if (anker !== 'solved') return null
  const nuFreedomPct = computeFreedomPctForPlan({ anchorFixed: false, coverage: null, basis: freedomBasis })
  if (Math.abs(nuFreedomPct - input.freedomPct) > FREEDOM_PARITEIT_MARGE) return null

  const verschil = vorigeMaand.netWorth - freedomBasis.netWorthInclHome
  const prevFreedomPct = computeFreedomPctForPlan({
    anchorFixed: false,
    coverage: null,
    basis: {
      ...freedomBasis,
      netWorthInclHome: freedomBasis.netWorthInclHome + verschil,
      fireEligibleNetWorth: freedomBasis.fireEligibleNetWorth + verschil,
    },
  })
  const metTrend = computeHealthScoreWithTrend(input, budgetingActive, {
    prevNetWorth: input.totalAssets - input.totalDebts + verschil,
    prevSavingsRate: vorigeMaand.savingsRatePct,
    requiredPortfolio: null,
    prevFreedomPct,
  })
  if (metTrend.previousMonth == null) return null
  return Math.round(metTrend.total) - Math.round(metTrend.previousMonth)
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
