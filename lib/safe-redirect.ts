/**
 * Veilige redirect-paden — bescherming tegen open redirects.
 *
 * Een redirect-doel dat van buiten komt (querystring, callback-param) mag
 * alleen een RELATIEF pad binnen de eigen origin zijn. Aanvalspatronen die
 * we hier expliciet weigeren:
 *
 * - `//evil.com`      → protocol-relatieve URL, browser navigeert off-site
 * - `/\evil.com`      → backslash wordt door browsers genormaliseerd naar `//`
 * - `@evil.com`       → wordt achter `${origin}` geplakt tot `https://host@evil.com`
 * - `.evil.com`       → wordt achter `${origin}` geplakt tot een attacker-subdomein
 * - `https://evil.com` → absolute URL
 *
 * Regel: het pad moet met precies één '/' beginnen, NIET gevolgd door een
 * tweede '/' of een '\'. Alles wat niet voldoet valt terug op de app-home.
 */

/**
 * Fallback-bestemming wanneer een redirect-doel onveilig of afwezig is.
 * '/dashboard' is het "ga naar home"-doel: de edge-middleware
 * (lib/supabase/proxy.ts) vertaalt hem naar het gekozen homescherm
 * (profiles.home_screen) — zo landen login en auth-callback zonder eigen
 * profielread op het scherm dat de gebruiker koos.
 */
export const SAFE_REDIRECT_FALLBACK = '/dashboard'

/**
 * True als `path` een veilig relatief pad is: begint met precies één '/',
 * niet gevolgd door '/' of '\'.
 */
export function isSafeRelativePath(path: string | null | undefined): path is string {
  if (!path) return false
  return /^\/(?![/\\])/.test(path)
}

/**
 * Geeft `path` terug als het veilig is, anders de fallback (default
 * `/dashboard`, dat de middleware naar het gekozen homescherm vertaalt).
 */
export function safeRelativePath(
  path: string | null | undefined,
  fallback: string = SAFE_REDIRECT_FALLBACK,
): string {
  return isSafeRelativePath(path) ? path : fallback
}
