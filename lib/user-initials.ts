/**
 * ── Naam en initialen van de ingelogde gebruiker ─────────────────────────────
 *
 * Eén bron voor wat de shell over de gebruiker toont: de profiel-pill in de
 * Sidebar (desktop) en het avatar-rondje in de TopBar (mobiel). Vóór deze
 * module leidde elk oppervlak zijn eigen letters af uit het e-mailadres —
 * de TopBar zelfs met `email[0]` — waardoor iemand die "Tessa Compleet" heet
 * een "B" van bas@… in beeld kreeg.
 *
 * Regel: de naam uit het profiel wint; het e-mailadres is de terugval voor een
 * profiel dat (nog) geen naam draagt. Bewust géén DB-call hier — `full_name`
 * zit al in de own-row profile-select van `app/(app)/layout.tsx`.
 */

/** Alleen echte letters/cijfers tellen mee — leestekens leveren geen initiaal. */
function firstLetter(word: string): string {
  for (const ch of word) {
    if (/\p{L}|\p{N}/u.test(ch)) return ch.toUpperCase()
  }
  return ''
}

/** Splits op whitespace en gooi lege delen weg. */
function words(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean)
}

/**
 * Vriendelijke gebruikersnaam voor de profiel-pill.
 *
 *   userDisplayName('Tessa Compleet', 'bas@test.nl')  → 'Tessa Compleet'
 *   userDisplayName(null, 'jpsmit@jps-holding.nl')    → 'jpsmit'
 *   userDisplayName('   ', '')                        → 'Account'
 */
export function userDisplayName(fullName: string | null | undefined, email: string): string {
  const naam = (fullName ?? '').trim()
  if (naam) return naam
  const localPart = (email ?? '').split('@')[0] ?? ''
  return localPart || 'Account'
}

/**
 * 1-2 letter initialen voor het avatar-rondje en de profiel-pill.
 *
 * Met naam: eerste letter van het eerste én van het laatste woord (één woord →
 * één letter). Zonder naam: de eerste twee tekens vóór de `@`, zoals de shell
 * dat altijd al deed.
 *
 *   userInitials('Tessa Compleet', 'bas@test.nl')       → 'TC'
 *   userInitials('Jan van der Berg', '…')               → 'JB'
 *   userInitials('Tessa', '…')                          → 'T'
 *   userInitials(null, 'jpsmit@jps-holding.nl')         → 'JP'
 *   userInitials(null, '')                              → '?'
 */
export function userInitials(fullName: string | null | undefined, email: string): string {
  const delen = words(fullName ?? '')
  if (delen.length > 0) {
    const eerste = firstLetter(delen[0]!)
    const laatste = delen.length > 1 ? firstLetter(delen[delen.length - 1]!) : ''
    const uit = `${eerste}${laatste}`
    if (uit) return uit
  }
  const localPart = (email ?? '').split('@')[0] ?? ''
  if (!localPart) return '?'
  return localPart.slice(0, 2).toUpperCase()
}
