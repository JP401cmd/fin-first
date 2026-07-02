/**
 * Horizon-kernel — maand-scaffold (leeftijd, maand-in-jaar, horizon-guard).
 *
 * Elke maandtabel in het Excel deelt dezelfde A/B/C-kolommen (maandindex /
 * leeftijd / maand-in-jaar) met dezelfde horizon-guard `IF(P!B7 + m/12 > 100,
 * "", …)`. Empirisch laat Excel kolom **A** altijd numeriek en leegt het
 * **B/C** (→ "") zodra de leeftijd 100 voorbij is. De réken-kolommen zijn
 * **tabel-specifiek**: Bel leegt ze óók, maar bv. Ont zet ze op hun
 * neutrale/nul-waarde (D=0, factoren=1) of laat ze een upstream-venster volgen,
 * en Werk-strategie (kolommen N:S) rekent bewust voorbij de horizon door —
 * verifieer de horizon-guard per tabel tegen de fixtures. Deze helpers zijn de
 * canonieke bron voor de A/B/C-scaffold, zodat elke tabel-port ze hergebruikt
 * in plaats van de guard opnieuw te implementeren.
 *
 * Pure functies; geen fs/Supabase.
 */

import type { KernelInput, MonthIndex } from './types'
import { MAX_AGE } from './types'

/** Fractionele leeftijd op maand m: `P!B7 + m/12` (nominaal, geen afronding). */
export function ageAtMonth(input: KernelInput, m: MonthIndex): number {
  return input.startLeeftijd + m / 12
}

/**
 * Ligt maand m voorbij de horizon? Excel-guard is strikt `> 100`, dus de maand
 * waarin de leeftijd exact 100 wordt telt nog mee (bv. B7=36 → m=768 = leeftijd
 * 100 is in-horizon, m=769 = 100,083 is voorbij).
 */
export function isBeyondHorizon(input: KernelInput, m: MonthIndex): boolean {
  return ageAtMonth(input, m) > MAX_AGE
}

/** Kolom B: hele-jaren leeftijd `INT(P!B7 + m/12)`. */
export function leeftijdJaren(input: KernelInput, m: MonthIndex): number {
  return Math.floor(ageAtMonth(input, m))
}

/** Kolom C: maand-in-jaar `MOD(m, 12)`. */
export function maandInJaar(m: MonthIndex): number {
  return m % 12
}

/** Indexatie-factor `(1 + inflatie)^(m/12)` (reëel → nominaal, Excel-getrouw). */
export function inflationIndex(input: KernelInput, m: MonthIndex): number {
  return Math.pow(1 + input.inflatie, m / 12)
}
