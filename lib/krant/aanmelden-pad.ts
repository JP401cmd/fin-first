// ── De Krant-ingang: paden en parameters (Krant 2C, ADR 0192) ────────────────
//
// PUUR en client-veilig: /signup (een client-pagina) bouwt hiermee de
// callback-URL, de server leest dezelfde namen terug. De beslissingen zelf
// (vers account, bèta-poort) staan server-side in `lib/krant/aanmelden.ts`.

/** De onboarding van de Krant. Bewust ONDER /onboarding: /krant is van 2E (publiek) en 2D (/krant/meer). */
export const KRANT_ONBOARDING_PAD = '/onboarding/krant'

/** De gewone onboarding van het Geheel. */
export const GEWONE_ONBOARDING_PAD = '/onboarding'

/** Querynaam waarmee /signup en de callback het product doorgeven. */
export const PRODUCT_PARAM = 'product'

/** De waarde van de Krant-ingang: `/signup?product=krant`. */
export const KRANT_PRODUCT = 'krant'

/** Ligt dit pad in de Krant-onboarding (de route zelf of eronder)? */
export function isKrantOnboardingPad(pad: string | null | undefined): boolean {
  if (!pad) return false
  const zonderQuery = pad.split('?')[0]!.split('#')[0]!
  return zonderQuery === KRANT_ONBOARDING_PAD || zonderQuery.startsWith(KRANT_ONBOARDING_PAD + '/')
}

/**
 * De callback-URL voor een aanmelding via de Krant-ingang (e-mail én Google):
 * `/auth/callback?next=/onboarding/krant&product=krant`. De callback valideert
 * beide opnieuw — dit is alleen de vorm.
 */
export function krantCallbackUrl(origin: string): string {
  const url = new URL('/auth/callback', origin)
  url.searchParams.set('next', KRANT_ONBOARDING_PAD)
  url.searchParams.set(PRODUCT_PARAM, KRANT_PRODUCT)
  return url.toString()
}
