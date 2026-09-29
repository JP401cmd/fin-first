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
// Sinds catalogus v2 (Krant 1C) staat hier GEEN lezerstekst meer: ook de
// fragmenten ("of meer", "tot", "maanden", de veldnamen) komen uit de
// catalogus, zodat ze onder het attest vallen. sjablonen-bron.test.ts bewaakt
// dat.
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
  if (band.hi == null) return renderSjabloon('fragment-vanaf', 0, { bedrag: eur(band.lo) })
  if (band.lo === 0) return band.hi === 0 ? renderSjabloon('fragment-geen', 0) : renderSjabloon('fragment-onder', 0, { bedrag: eur(band.hi) })
  return renderSjabloon('fragment-tussen', 0, { lo: eur(band.lo), hi: eur(band.hi) })
}

/** Een impactbereik als bedrag: "€ 40", "€ 38 tot € 100", "minstens € 120", "hoogstens € 107". */
export function bereikTekst(b: Pick<ImpactBereik, 'lo' | 'hi'>): string {
  if (b.hi == null) return renderSjabloon('fragment-minstens', 0, { bedrag: eur(b.lo) })
  if (b.lo === b.hi) return eur(b.lo)
  if (b.lo === 0) return renderSjabloon('fragment-hoogstens', 0, { bedrag: eur(b.hi) })
  return renderSjabloon('fragment-tussen', 0, { lo: eur(b.lo), hi: eur(b.hi) })
}

/** "3 maanden" / "1 maand". */
export function maandenTekst(maanden: number): string {
  const m = Math.abs(Math.round(maanden))
  return m === 1 ? renderSjabloon('fragment-maand', 0) : renderSjabloon('fragment-maanden', 0, { aantal: String(m) })
}

/** Een AOW-leeftijd of een bereik daarvan, via de canonieke schrijfwijze. */
export function aowTekst(lo: number, hi: number): string {
  const a = formatAowAge(lo)
  const b = formatAowAge(hi)
  return a === b ? a : renderSjabloon('fragment-tussen', 0, { lo: a, hi: b })
}

/** De stap van de gevoeligheidsvorm: "0,25 procentpunt". */
export function stapTekst(stapPp: number): string {
  return renderSjabloon('fragment-procentpunt', 0, { getal: new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 }).format(stapPp) })
}

/** Een ISO-datum als "1 oktober 2026". */
export function datumTekst(iso: string): string {
  const [j, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(j, m - 1, d)),
  )
}

/** De catalogus-id van de leesbare naam per profielsleutel, voor "wat mist". */
export const VELD_SJABLOON: Record<DoelgroepSleutel, SjabloonId> = {
  geboortejaar: 'veld-geboortejaar',
  huishouden: 'veld-huishouden',
  kinderen: 'veld-kinderen',
  werk: 'veld-werk',
  inkomen: 'veld-inkomen',
  wonen: 'veld-wonen',
  hypotheek_restschuld: 'veld-hypotheek_restschuld',
  hypotheek_rentevast: 'veld-hypotheek_rentevast',
  woonplan: 'veld-woonplan',
  spaargeld: 'veld-spaargeld',
  beleggingen: 'veld-beleggingen',
  beleggingen_vorm: 'veld-beleggingen_vorm',
  schulden: 'veld-schulden',
  pensioen_werkgever: 'veld-pensioen_werkgever',
  pensioen_lijfrente: 'veld-pensioen_lijfrente',
}

/** Leesbare naam per profielsleutel (uit de catalogus). */
export function veldLabel(veld: DoelgroepSleutel): string {
  return renderSjabloon(VELD_SJABLOON[veld], 0)
}

/** "je spaargeld", "je spaargeld en je huishouden", "je spaargeld, je beleggingen en je huishouden". */
export function veldenTekst(velden: readonly DoelgroepSleutel[]): string {
  const labels = [...new Set(velden.map(veldLabel))]
  if (labels.length <= 1) return labels[0] ?? ''
  return renderSjabloon('fragment-opsomming', 0, { eerdere: labels.slice(0, -1).join(', '), laatste: labels[labels.length - 1] })
}
