import type { LaatstActief } from '@/lib/beheer/gebruik-analyse/loader'
import type { Aandeel, Cel } from '@/lib/beheer/gebruik-analyse/onderdrukking'
import { GEBRUIK_K, GEBRUIK_PERCENTAGE_MIN_N } from '@/lib/beheer/gebruik-analyse/onderdrukking'

/**
 * Pure opmaak voor /beheer/gebruik. Geen berekening van kerngetallen: alleen
 * labels en percentages van tellingen die het view-model al levert.
 */

const WEEK_RE = /^(\d{4})-W(\d{2})$/
const MAAND_RE = /^(\d{4})-(\d{2})$/

const MAANDEN = [
  'januari',
  'februari',
  'maart',
  'april',
  'mei',
  'juni',
  'juli',
  'augustus',
  'september',
  'oktober',
  'november',
  'december',
] as const

/** `2026-W38` → "week 38, 2026". Onbekende vorm → ongewijzigd. */
export function weekLabel(iso: string): string {
  const m = WEEK_RE.exec(iso)
  if (!m) return iso
  return `week ${Number(m[2])}, ${m[1]}`
}

/** `2026-W38` → "wk 38" (as-labels). */
export function weekKort(iso: string): string {
  const m = WEEK_RE.exec(iso)
  if (!m) return iso
  return `wk ${Number(m[2])}`
}

/** `2026-09` → "september 2026"; `null` → "Eerder" (alle aanmelders vóór de getoonde maanden). */
export function maandLabel(maand: string | null): string {
  if (maand == null) return 'Eerder'
  const m = MAAND_RE.exec(maand)
  if (!m) return maand
  const idx = Number(m[2]) - 1
  const naam = MAANDEN[idx]
  return naam ? `${naam} ${m[1]}` : maand
}

/** Fractie → "42%" (geheel), of "0,5%" onder 1%. */
export function procent(fractie: number): string {
  const p = fractie * 100
  if (p > 0 && p < 1) return `${p.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}%`
  return `${Math.round(p)}%`
}

/**
 * "42% van 118" — een percentage nooit zonder zijn noemer, en onder
 * {@link GEBRUIK_PERCENTAGE_MIN_N} altijd met de waarschuwing erbij. Eén plek,
 * zodat geen oppervlak de waarschuwing kan vergeten (eindreview 17-09-2026, A).
 */
export function aandeelTekst(a: Aandeel, noemerTekst = ''): string {
  const basis = `${procent(a.fractie)} van ${a.noemer.toLocaleString('nl-NL')}${noemerTekst ? ` ${noemerTekst}` : ''}`
  return a.waarschuwing ? `${basis} (n < ${GEBRUIK_PERCENTAGE_MIN_N}, lees als richting)` : basis
}

/** "gearceerd = < 5 of verborgen" — de legenda bij onderdrukte markeringen. */
export function arceringLegenda(k: number = GEBRUIK_K): string {
  return `gearceerd = < ${k} of verborgen`
}

/** Getal als de cel een waarde draagt, anders null (nooit 0 als vervanger). */
export function celGetal(cel: Cel): number | null {
  return cel.soort === 'waarde' ? cel.n : null
}

/** Toelichting bij een onderdrukte cel (tooltip/aria). */
export function celUitleg(cel: Cel, k: number = GEBRUIK_K): string | null {
  if (cel.soort === 'klein') return `1 t/m ${k - 1} gebruikers — onderdrukt`
  if (cel.soort === 'verborgen') return `${k} of meer, extra verborgen zodat de kleine cellen niet terug te rekenen zijn`
  return null
}

/** "1 gebruiker" / "12 gebruikers". */
export function gebruikersTekst(n: number): string {
  return `${n.toLocaleString('nl-NL')} ${n === 1 ? 'gebruiker' : 'gebruikers'}`
}

/** Mooie bovengrens voor een as (1-2-5-reeks), minimaal 5. */
export function mooieMax(max: number): number {
  if (!Number.isFinite(max) || max <= 5) return 5
  const macht = 10 ** Math.floor(Math.log10(max))
  for (const stap of [1, 2, 2.5, 5, 10]) {
    if (stap * macht >= max) return stap * macht
  }
  return 10 * macht
}

export const RONDLEIDING_LABEL: Record<string, string> = {
  voltooid: 'Voltooid',
  overgeslagen: 'Overgeslagen',
  onderbroken: 'Onderbroken',
  tegoed: 'Nog tegoed',
  geen: 'Geen rondleiding gezien',
}

export const GIDS_LABEL: Record<string, string> = {
  niet_gestart: 'Niet gestart',
  afgesloten: 'Afgesloten (weggeklikt)',
  '0_stappen': 'Geopend, 0 stappen',
  '1_3_stappen': '1–3 stappen',
  '4_plus_stappen': '4 of meer stappen',
}

export const UITGESTELD_LABEL: Record<string, string> = {
  income: 'Inkomen',
  assets: 'Bezittingen',
  spaardoel: 'Spaardoel',
}

export const HOMESCHERM_LABEL: Record<string, string> = {
  overzicht: 'Overzicht',
  budget: 'Budget',
}

export const WEERGAVE_LABEL: Record<string, string> = {
  simple: 'Eenvoudig',
  full: 'Volledig',
}

/** Label uit een map, of een leesbare terugval ("deferred_x" → "deferred x"). */
export function labelVan(map: Record<string, string>, sleutel: string): string {
  return map[sleutel] ?? sleutel.replace(/[_.-]+/g, ' ')
}

/** Labels voor "laatst actief" (partitie van het segment, band-onafhankelijk). */
export const LAATST_ACTIEF_LABEL: Record<LaatstActief, string> = {
  vandaag: 'Vandaag',
  '1_6': '1–6 dagen geleden',
  '7_29': '7–29 dagen geleden',
  '30_89': '30–89 dagen geleden',
  '90_plus': '90 dagen of langer geleden',
  nooit: 'Nooit (in de bewaartermijn)',
}
