import type { ActivityModule } from '@/lib/activity/modules'
import { amsterdamParts } from '@/lib/tz'

/**
 * meldModuleGebruik — "vandaag dit app-deel gebruikt" (ADR 0147, fase 2).
 *
 * Client-veilig, geen React. Schrijfdiscipline zoals `use-feature-visit`: een
 * sessionStorage-vlag per Amsterdamse kalenderdag per module houdt navigatie
 * heen-en-weer buiten de database. De route is idempotent (één rij per
 * gebruiker × dag × module), dus een dubbele POST is hooguit verspilling.
 *
 * WAT HIER NIET GEBEURT: geen route, geen tijdstip, geen aantal, geen inhoud.
 * Alleen de gesloten modulesleutel gaat over de lijn.
 *
 * Meten mag de app nooit breken: elke fout (geen sessionStorage, geen fetch,
 * netwerk) wordt ingeslikt.
 */

const SESSION_PREFIX = 'activity_module:'

/** YYYY-MM-DD in Europe/Amsterdam. */
function amsterdamDag(nu: Date): string {
  const { year, month, day } = amsterdamParts(nu)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function moduleSessieSleutel(module: ActivityModule, nu: Date = new Date()): string {
  return `${SESSION_PREFIX}${amsterdamDag(nu)}:${module}`
}

function lees(sleutel: string): boolean {
  try {
    return sessionStorage.getItem(sleutel) === '1'
  } catch {
    return false
  }
}

function zet(sleutel: string): void {
  try {
    sessionStorage.setItem(sleutel, '1')
  } catch {
    /* no-op */
  }
}

function wis(sleutel: string): void {
  try {
    sessionStorage.removeItem(sleutel)
  } catch {
    /* no-op */
  }
}

export function meldModuleGebruik(module: ActivityModule): void {
  const sleutel = moduleSessieSleutel(module)
  if (lees(sleutel)) return

  // Optimistisch: een tweede aanroep terwijl deze POST nog loopt, post niet.
  zet(sleutel)
  try {
    fetch('/api/activity/module', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module }),
      keepalive: true,
    }).catch(() => wis(sleutel))
  } catch {
    // fetch ontbreekt of gooit synchroon — volgende navigatie probeert opnieuw.
    wis(sleutel)
  }
}
