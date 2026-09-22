import pkg from '../package.json'

/**
 * De ene versiebron van de app: `package.json`.
 *
 * Alles wat een versienummer toont of vergelijkt (`/api/version`,
 * `/beheer/versie`, `/beheer/releases`, de architectuurplaat) leest hier —
 * nooit een eigen constante. `lib/release-notes.test.ts` dwingt af dat de
 * bovenste vrijgavenotitie precies deze versie draagt, zodat notes en
 * package.json niet uit elkaar kunnen lopen.
 *
 * Schema: semver `0.MINOR.PATCH`. De major blijft 0 tot het formele
 * go-besluit voor de livegang; die grens is een test, geen afspraak.
 * Gebruikers zien de patch met drie cijfers (`0.92.001`); dat is alleen
 * weergave — `package.json` blijft geldige semver (`0.92.1`, leading zeros
 * bestaan daar niet). Toon dus `APP_VERSION_DISPLAY`, vergelijk `APP_VERSION`.
 * Bumpen gebeurt uitsluitend in de release-skill (stap "Versie &
 * vrijgavenotitie"), niet per push of checkpoint.
 *
 * Server-only importeren (route handlers, server components): een client-
 * bundel hoeft de hele package.json niet mee te dragen. Client-componenten
 * krijgen de versie als prop of via `/api/version`.
 */
export const APP_VERSION: string = pkg.version

/** `0.92.1` → `0.92.001`: de weergavevorm voor gebruikers. */
export function formatVersionForDisplay(version: string): string {
  const [major, minor, patch] = version.split('.')
  if (patch === undefined) return version
  return `${major}.${minor}.${patch.padStart(3, '0')}`
}

export const APP_VERSION_DISPLAY: string = formatVersionForDisplay(APP_VERSION)
