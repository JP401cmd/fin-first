/**
 * Pure reeks-helpers voor de maandelijkse geldcheck-in.
 *
 * De check-in is een maandelijks ritueel: `app/api/monthly-checkin/route.ts`
 * houdt per gebruiker een lijst `completedMonths` (`YYYY-MM`) bij in
 * `app_settings`, gecapt op de laatste 13 maanden (13, zodat >12-op-rij meetbaar blijft en de 12-mijlpaal maar één keer kan vallen). Een *reeks* — het aantal
 * aaneengesloten maanden waarin je hebt ingecheckt, t/m de huidige maand — is
 * daaruit volledig af te leiden. Er is dus bewust géén aparte opslag en géén
 * regel in `achieved_milestones`: die log bestaat voor gebeurtenissen die uit
 * de stand niet te reconstrueren zijn, en dit is er geen.
 *
 * Geen Supabase, geen I/O, geen `Date.now()` — `nu` komt altijd van de
 * aanroeper, zodat de afleiding als losse eenheid te pinnen is (reeks.test.ts).
 * Spiegelt daarmee `app/(app)/core/checkin/historie/cadence.ts`, waarvan we de
 * canonieke maandsleutel (`monthKeyFromDate`) hergebruiken — nooit een tweede
 * `YYYY-MM`-opbouw ernaast.
 *
 * Toon: erkennen, niet straffen. Er bestaat hier bewust geen "je reeks is
 * gebroken"-pad; een gat reset stil de telling en dat is het.
 */

/**
 * Canonieke maandsleutel ('YYYY-MM'). Woont hier — in lib/ — zodat de
 * importrichting klopt (lib importeert nooit uit app/**); de historie-cadans
 * (app/(app)/core/checkin/historie/cadence.ts) her-exporteert 'm.
 */
export function monthKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** De reeks-lengtes die een erkenning verdienen. */
export const REEKS_MIJLPALEN = [3, 6, 12] as const

export type ReeksMijlpaal = (typeof REEKS_MIJLPALEN)[number]

/** Telwoorden voor de mijlpaal-lengtes — één bron voor zin én kop. */
const TELWOORDEN: Record<number, string> = {
  3: 'Drie',
  6: 'Zes',
  12: 'Twaalf',
}

/**
 * Het aantal aaneengesloten maanden waarin is ingecheckt, geteld terug vanaf
 * de maand van `nu`.
 *
 * - Ontbreekt de huidige maand in de lijst, dan is de reeks 0 — een reeks
 *   loopt per definitie tot en met nu.
 * - Een gat stopt de telling: alleen de maanden ná het gat tellen mee.
 * - Ongesorteerde invoer en duplicaten worden verdragen (de lijst is een
 *   verzameling, geen volgorde).
 * - De bron capt op 13 maanden; hier wordt niet nóg eens gecapt — het getelde
 *   aantal is de uitkomst.
 */
export function berekenReeks(completedMonths: string[], nu: Date): number {
  if (!Array.isArray(completedMonths) || completedMonths.length === 0) return 0

  const maanden = new Set(completedMonths.filter((m) => typeof m === 'string'))
  if (maanden.size === 0) return 0

  let reeks = 0
  // Loop terug per kalendermaand vanaf `nu`. `new Date(jaar, maand - n, 1)`
  // rolt de jaargrens vanzelf door (2026-01 → 2025-12). De teller kan nooit
  // groter worden dan het aantal unieke maanden in de lijst, dus de lus stopt
  // altijd — de expliciete grens is enkel een vangrail.
  for (let terug = 0; terug <= maanden.size; terug++) {
    const maand = new Date(nu.getFullYear(), nu.getMonth() - terug, 1)
    if (!maanden.has(monthKeyFromDate(maand))) break
    reeks++
  }

  return reeks
}

/** True wanneer deze reeks-lengte een mijlpaal is (3, 6 of 12 maanden). */
export function isReeksMijlpaal(n: number): n is ReeksMijlpaal {
  return (REEKS_MIJLPALEN as readonly number[]).includes(n)
}

/**
 * Het telwoord bij een mijlpaal-lengte ('Drie'/'Zes'/'Twaalf'), of `null`
 * wanneer `n` geen mijlpaal is. Voedt zowel `reeksZin` als de kop van het
 * afsluitmoment, zodat beide dezelfde woorden gebruiken.
 */
export function reeksTelwoord(n: number): string | null {
  if (!isReeksMijlpaal(n)) return null
  return TELWOORDEN[n] ?? null
}

/**
 * De erkenningszin bij een reeks-mijlpaal — krant-toon, constaterend, geen
 * schuldtaal en geen advies. `null` bij elke andere lengte (dan toont de UI de
 * gewone afsluiting).
 */
export function reeksZin(n: number): string | null {
  const telwoord = reeksTelwoord(n)
  if (!telwoord) return null
  return `${telwoord} maanden op rij ingecheckt.`
}
