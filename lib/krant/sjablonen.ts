// ── Sjablonen: de renderer op de catalogus ───────────────────────────────────
//
// De teksten staan in sjablonen-catalogus.ts (merkstem-oppervlak + attest);
// dit bestand vult de slots. Twee regels die hier hard zijn:
//   · een bedrag komt ALTIJD via formatCurrency (hele euro's) — nooit een
//     eigen toString; een AOW-leeftijd altijd via formatAowAge (één schrijfwijze,
//     UR3-24);
//   · een sjabloon met een ongevuld slot rendert niet maar gooit — beter een
//     rode test dan een editie met "{bedrag}" erin.
//
// De variant is een deterministische keuze op het artikel-id (FNV-1a), zodat
// dezelfde editie twee keer dezelfde zin geeft (golden tests) en twee lezers
// niet allemaal dezelfde formulering zien.
//
// euro-only (B2, ADR 0172): bewaakt door lib/krant/euro-only.test.ts.
//
// PUUR: geen IO.

import { formatCurrency } from '@/lib/format'
import { formatAowAge } from '@/lib/aow-leeftijd'
import { SJABLONEN, SJABLOON_VERSIE, type SjabloonId } from './sjablonen-catalogus'
import type { Band } from './profiel'
import type { DoelgroepSleutel } from './profiel-velden'
import type { ImpactBereik } from './impact'

export { SJABLONEN, SJABLOON_VERSIE, type SjabloonId }

export type Slots = Readonly<Record<string, string>>

const SLOT = /\{([a-zA-Z]+)\}/g

/** Aantal formuleringen van een sjabloon. */
export function aantalVarianten(id: SjabloonId): number {
  return SJABLONEN[id].length
}

/** FNV-1a 32-bit over een string — stabiel, klein, geen crypto nodig. */
export function variantVoor(id: SjabloonId, artikelId: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < artikelId.length; i++) {
    h ^= artikelId.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h % aantalVarianten(id)
}

/** Vul de slots van één formulering; gooit bij een ontbrekend slot. */
export function renderSjabloon(id: SjabloonId, variant: number, slots: Slots = {}): string {
  const tekst = SJABLONEN[id][variant]
  if (tekst == null) throw new Error(`sjabloon ${id} heeft geen variant ${variant}`)
  return tekst.replace(SLOT, (_m, naam: string) => {
    const waarde = slots[naam]
    if (waarde == null) throw new Error(`sjabloon ${id} mist slot {${naam}}`)
    return waarde
  })
}

/** De slotnamen die een sjabloon nodig heeft (over alle varianten). */
export function slotsVan(id: SjabloonId): string[] {
  const namen = new Set<string>()
  for (const tekst of SJABLONEN[id]) for (const m of tekst.matchAll(SLOT)) namen.add(m[1])
  return [...namen].sort()
}

// ── Slot-helpers: één schrijfwijze per grootheid ─────────────────────────────

/** Een bedrag in hele euro's. */
export function eur(bedrag: number): string {
  return formatCurrency(Math.round(bedrag))
}

/**
 * Een bandbeschrijving die na "van", "op" en "met" leest: "minder dan € 5.000",
 * "€ 25.000 tot € 50.000", "€ 250.000 of meer" ("van vanaf …" was de val).
 */
export function bandTekst(band: Band): string {
  if (band.hi == null) return `${eur(band.lo)} of meer`
  if (band.lo === 0) return band.hi === 0 ? 'geen' : `minder dan ${eur(band.hi)}`
  return `${eur(band.lo)} tot ${eur(band.hi)}`
}

/** Een impactbereik als bedrag: "€ 40", "€ 38 tot € 100", "minstens € 120", "hoogstens € 107". */
export function bereikTekst(b: Pick<ImpactBereik, 'lo' | 'hi'>): string {
  if (b.hi == null) return `minstens ${eur(b.lo)}`
  if (b.lo === b.hi) return eur(b.lo)
  if (b.lo === 0) return `hoogstens ${eur(b.hi)}`
  return `${eur(b.lo)} tot ${eur(b.hi)}`
}

/** "3 maanden" / "1 maand". */
export function maandenTekst(maanden: number): string {
  const m = Math.abs(Math.round(maanden))
  return m === 1 ? '1 maand' : `${m} maanden`
}

/** Een AOW-leeftijd of een bereik daarvan, via de canonieke schrijfwijze. */
export function aowTekst(lo: number, hi: number): string {
  const a = formatAowAge(lo)
  const b = formatAowAge(hi)
  return a === b ? a : `${a} tot ${b}`
}

/** De stap van de gevoeligheidsvorm: "0,25 procentpunt". */
export function stapTekst(stapPp: number): string {
  return `${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 }).format(stapPp)} procentpunt`
}

/** Een ISO-datum als "1 oktober 2026". */
export function datumTekst(iso: string): string {
  const [j, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(j, m - 1, d)),
  )
}

/** Leesbare naam per profielsleutel, voor "wat mist". */
export const VELD_LABELS: Record<DoelgroepSleutel, string> = {
  geboortejaar: 'je geboortejaar',
  huishouden: 'je huishouden',
  kinderen: 'je kinderen',
  werk: 'je werk',
  inkomen: 'je inkomen',
  wonen: 'je woonsituatie',
  hypotheek_restschuld: 'je hypotheekschuld',
  hypotheek_rentevast: 'je rentevaste periode',
  woonplan: 'je woonplan',
  spaargeld: 'je spaargeld',
  beleggingen: 'je beleggingen',
  beleggingen_vorm: 'de vorm van je beleggingen',
  schulden: 'je schulden',
  pensioen_werkgever: 'je pensioenopbouw',
  pensioen_lijfrente: 'je lijfrente',
}

/** "je spaargeld", "je spaargeld en je huishouden", "je spaargeld, je beleggingen en je huishouden". */
export function veldenTekst(velden: readonly DoelgroepSleutel[]): string {
  const labels = [...new Set(velden.map((v) => VELD_LABELS[v]))]
  if (labels.length <= 1) return labels[0] ?? ''
  return `${labels.slice(0, -1).join(', ')} en ${labels[labels.length - 1]}`
}
