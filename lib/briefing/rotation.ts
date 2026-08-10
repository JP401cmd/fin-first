/**
 * Briefing-rotatie voor de Eenvoudige weergave.
 *
 * De engine schrijft tot 6 briefjes per week; Eenvoudig toont er 3 (desktop) of
 * 1 (mobiel). Zonder rotatie zou je in Eenvoudig de andere briefjes nooit zien.
 * Daarom schuift het venster bij élke vernieuwing van /overzicht één plek op:
 * 1-2-3 → 2-3-4 → … → 6-1-2, cyclisch.
 *
 * WAAR STAAT DE CURSOR? In een cookie, niet in de database en niet in
 * localStorage:
 *   - een cookie is server-leesbaar, dus /overzicht rendert meteen het júiste
 *     venster (localStorage zou pas ná hydratatie kunnen schuiven — zichtbare
 *     flits waarbij briefje 1 even verschijnt en dan wegspringt);
 *   - het is een weergave-cursor, geen gebruikerskeuze, dus hij hoort niet als
 *     cross-device profielvoorkeur op `profiles` (vgl. de weergavemodus zelf,
 *     die dat wél is).
 *
 * De cookie draagt geen persoonsgegeven — alleen een klein getal.
 */

/** Naam van de cookie met de rotatiecursor. */
export const BRIEFING_ROTATION_COOKIE = 'tf_briefing_rot'

/**
 * De cursor telt door en wordt bij het lezen gemodulo'd op het aantal briefjes.
 * Deze cap houdt de cookiewaarde klein (en is een veelvoud van 1..6, zodat het
 * omslagpunt geen sprong in de volgorde geeft).
 */
export const BRIEFING_ROTATION_MODULO = 60

/** Hoe lang de cursor meegaat — een jaar; hij verloopt vanzelf op een gedeeld toestel. */
export const BRIEFING_ROTATION_MAX_AGE = 60 * 60 * 24 * 365

/** Lees een cookiewaarde naar een geldige cursor (defensief: alles fout → 0). */
export function parseRotationOffset(raw: string | null | undefined): number {
  if (!raw) return 0
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 0) return 0
  return n % BRIEFING_ROTATION_MODULO
}

/** Eén plek opschuiven, cyclisch binnen de cap. */
export function nextRotationOffset(offset: number): number {
  return (parseRotationOffset(String(offset)) + 1) % BRIEFING_ROTATION_MODULO
}

/**
 * Pak `size` opeenvolgende items vanaf `offset`, cyclisch doorlopend.
 * Korter dan `size` aan items → alles wat er is, zonder herhaling.
 */
export function rotateEntries<T>(entries: T[], offset: number, size: number): T[] {
  const total = entries.length
  if (total === 0 || size <= 0) return []
  const take = Math.min(size, total)
  const start = ((Math.trunc(offset) % total) + total) % total
  return Array.from({ length: take }, (_, i) => entries[(start + i) % total])
}
