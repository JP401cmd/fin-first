import { NL_MONTH_ABBR, amsterdamParts } from '@/lib/tz'
import { amsterdamWeekKey } from '@/lib/briefing/snapshot'

/**
 * Kalenderrekenen voor het beheerdashboard, altijd in Nederlandse wandkloktijd
 * (zie lib/tz.ts: de server draait in UTC, de beheerder leest in Amsterdam).
 *
 * Een dag is hier een sleutel `YYYY-MM-DD`; rekenen met dagen gebeurt op een
 * UTC-anker, zodat zomertijd geen dag laat verspringen.
 */

const pad2 = (n: number) => String(n).padStart(2, '0')

/** De Amsterdamse kalenderdag van een moment, als `YYYY-MM-DD`. */
export function amsterdamDag(moment: Date): string {
  const a = amsterdamParts(moment)
  return `${a.year}-${pad2(a.month)}-${pad2(a.day)}`
}

/** Dagsleutel van een ISO-tijdstempel; `null` bij een onleesbare waarde. */
export function dagVanIso(iso: string | null | undefined): string | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : amsterdamDag(new Date(ms))
}

function alsUtc(dag: string): Date {
  const [j, m, d] = dag.split('-').map(Number)
  return new Date(Date.UTC(j, m - 1, d))
}

/** De dag `delta` dagen verder (negatief = eerder). */
export function verschuifDag(dag: string, delta: number): string {
  const d = alsUtc(dag)
  d.setUTCDate(d.getUTCDate() + delta)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

/** Aantal dagen van `van` tot `tot` (positief als `tot` later is). */
export function dagenTussen(van: string, tot: string): number {
  return Math.round((alsUtc(tot).getTime() - alsUtc(van).getTime()) / 86_400_000)
}

/** `aantal` opeenvolgende dagen die eindigen op `laatste`, oplopend. */
export function dagenTotEnMet(laatste: string, aantal: number): string[] {
  const uit: string[] = []
  for (let i = aantal - 1; i >= 0; i--) uit.push(verschuifDag(laatste, -i))
  return uit
}

/**
 * Het moment waarop een Amsterdamse kalenderdag begint, als ISO-tijdstempel.
 * Nodig om een database op kalenderdagen te bevragen: "de laatste 7 dagen" is
 * op het dashboard overal zeven kalenderdagen, vandaag inbegrepen, en niet op
 * de ene plek 168 uur terug en op de andere zeven dagen.
 */
export function beginVanDag(dag: string): string {
  const middernachtUtc = alsUtc(dag).getTime()
  // Amsterdam loopt één (winter) of twee (zomer) uur vóór op UTC.
  for (const uren of [2, 1]) {
    const kandidaat = new Date(middernachtUtc - uren * 3_600_000)
    if (amsterdamDag(kandidaat) === dag && amsterdamParts(kandidaat).hour === 0) return kandidaat.toISOString()
  }
  // Niet bereikbaar zolang Amsterdam op UTC+1/+2 staat; ruim terugvallen leest
  // hoogstens een uur te veel, nooit te weinig.
  return new Date(middernachtUtc - 2 * 3_600_000).toISOString()
}

/** `5 sep` — krant-notatie, zonder jaar. */
export function dagLabel(dag: string): string {
  const [, m, d] = dag.split('-').map(Number)
  return `${d} ${NL_MONTH_ABBR[m - 1]}`
}

/** `5 sep 2026`. */
export function dagLabelMetJaar(dag: string): string {
  const [j, m, d] = dag.split('-').map(Number)
  return `${d} ${NL_MONTH_ABBR[m - 1]} ${j}`
}

/** `22–28 sep` of `29 aug – 4 sep`: een periode in krant-notatie. */
export function periodeLabel(van: string, tot: string): string {
  if (van === tot) return dagLabel(van)
  const [, vm, vd] = van.split('-').map(Number)
  const [, tm] = tot.split('-').map(Number)
  return vm === tm ? `${vd}–${dagLabel(tot)}` : `${dagLabel(van)} – ${dagLabel(tot)}`
}

/** ISO-weeksleutel (`2026-W39`) van een dagsleutel. */
export function weekVanDag(dag: string): string {
  // Twaalf uur UTC valt in Amsterdam altijd op dezelfde kalenderdag.
  return amsterdamWeekKey(new Date(`${dag}T12:00:00Z`))
}
