import { errorSignature } from '@/lib/alerts/error-signature'

/**
 * Groepeert `error_logs`-rijen tot afvinkbare FOUTSOORTEN — de leeslaag onder
 * `/beheer/errors` (ADR 0113).
 *
 * Waarom groeperen en niet een vlag per rij: gemeten op de productiestapel zijn
 * honderden regels een handvol unieke problemen (ontdubbelfactor ~6x). Een
 * vinkje per rij lost het ontdubbelen niet op — het vermenigvuldigt het.
 *
 * Waarom de sleutel HIER berekend wordt en niet als kolom op `error_logs`
 * (besluit A2): een kolom vraagt een SQL-backfill, en dat is een tweede
 * normalisator naast de TypeScript-versie. Twee normalisatoren die uiteenlopen
 * is het defect dat je hier zou bouwen in plaats van oplossen. `error_logs`
 * blijft daarmee volledig append-only — de eerlijke eigenschap van een logboek.
 *
 * Alles in deze module is PUUR: geen DB, geen tijd-van-nu, geen I/O. De route
 * levert de rijen aan, deze module bepaalt de betekenis.
 */

/** De kolommen die het leespad van `error_logs` nodig heeft. */
export interface ErrorLogRow {
  id: string
  context: string | null
  message: string
  level: string
  url: string | null
  stack: string | null
  created_at: string
}

/** Eén rij uit `error_log_resolutions` — de boekhouding "dit is afgehandeld". */
export interface ErrorResolutionRow {
  signature: string
  resolved_at: string
  resolved_by: string | null
  note: string | null
  resolved_count: number
  last_seen_at: string
}

/** Wat er van een afvinkactie bewaard is, in de vorm die het scherm toont. */
export interface ErrorGroupResolution {
  resolvedAt: string
  resolvedBy: string | null
  note: string | null
  /** Volume op het moment van afvinken — maakt "hoeveel erbij" leesbaar. */
  resolvedCount: number
  lastSeenAt: string
}

/** Eén foutsoort: de eenheid waarop beheer werkt. */
export interface ErrorGroup {
  signature: string
  context: string | null
  /** Nieuwste voorkomen; representatief voor de soort. */
  sampleMessage: string
  sampleUrl: string | null
  sampleLevel: string
  /** Stacktrace van het nieuwste voorval; de details achter de soort. */
  sampleStack: string | null
  /** Id van het nieuwste voorval — anker voor de detailweergave. */
  sampleId: string
  count: number
  firstSeenAt: string
  lastSeenAt: string
  resolution: ErrorGroupResolution | null
  /** Voorvallen strikt NA het afvinken. > 0 betekent: teruggekomen. */
  countSinceResolved: number
  /**
   * OPEN = nooit afgevinkt, of sinds het afvinken opnieuw voorgekomen.
   * Pure afleiding: een opgeloste fout die terugkomt heropent zichzelf, zonder
   * cron en zonder tweede boekhouding.
   */
  open: boolean
}

function isNewer(a: string, b: string): boolean {
  return new Date(a).getTime() > new Date(b).getTime()
}

/**
 * Bouwt de groepen. `rows` mag in willekeurige volgorde staan; de uitkomst is
 * deterministisch gesorteerd (open eerst, daarbinnen nieuwste voorval eerst).
 */
export function buildErrorGroups(
  rows: readonly ErrorLogRow[],
  resolutions: readonly ErrorResolutionRow[],
): ErrorGroup[] {
  const bySignature = new Map<string, ErrorLogRow[]>()
  for (const row of rows) {
    const sig = errorSignature(row.context, row.message)
    const bucket = bySignature.get(sig)
    if (bucket) bucket.push(row)
    else bySignature.set(sig, [row])
  }

  const resolutionBySignature = new Map(resolutions.map((r) => [r.signature, r]))

  const groups: ErrorGroup[] = []
  for (const [signature, bucket] of bySignature) {
    // Nieuwste eerst — het jongste voorval is het representatieve voorbeeld.
    const sorted = [...bucket].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    const newest = sorted[0]
    const oldest = sorted[sorted.length - 1]
    const stored = resolutionBySignature.get(signature) ?? null

    const countSinceResolved = stored
      ? sorted.filter((r) => isNewer(r.created_at, stored.resolved_at)).length
      : 0

    groups.push({
      signature,
      context: newest.context,
      sampleMessage: newest.message,
      sampleUrl: newest.url,
      sampleLevel: newest.level,
      sampleStack: newest.stack,
      sampleId: newest.id,
      count: sorted.length,
      firstSeenAt: oldest.created_at,
      lastSeenAt: newest.created_at,
      resolution: stored
        ? {
            resolvedAt: stored.resolved_at,
            resolvedBy: stored.resolved_by,
            note: stored.note,
            resolvedCount: stored.resolved_count,
            lastSeenAt: stored.last_seen_at,
          }
        : null,
      countSinceResolved,
      open: !stored || countSinceResolved > 0,
    })
  }

  return groups.sort((a, b) => {
    if (a.open !== b.open) return a.open ? -1 : 1
    return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
  })
}

/** Kerncijfers boven de lijst: hoeveel soorten staan er nog open. */
export function summarizeErrorGroups(groups: readonly ErrorGroup[]): {
  totalGroups: number
  openGroups: number
  totalRows: number
  reopenedGroups: number
} {
  return {
    totalGroups: groups.length,
    openGroups: groups.filter((g) => g.open).length,
    totalRows: groups.reduce((sum, g) => sum + g.count, 0),
    reopenedGroups: groups.filter((g) => g.resolution !== null && g.open).length,
  }
}
