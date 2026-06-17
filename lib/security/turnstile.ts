/**
 * Cloudflare Turnstile (CAPTCHA) server-side verificatie.
 *
 * Bedoeld voor het PUBLIEKE, niet-geauthenticeerde schrijfpad van de
 * Vrijheidscheck (`/api/check/submit`). Een anonieme bezoeker lost in de
 * browser een Turnstile-challenge op en stuurt het resulterende token mee;
 * deze module verifieert dat token server-side bij Cloudflare met het
 * geheime `TURNSTILE_SECRET_KEY`.
 *
 * Scheiding van zorgen: deze module weet niets van HTTP-routes of de
 * rate-limit. De route doet `await verifyTurnstile(token, ip)` vóór het
 * service-role-write en bepaalt zélf het policy-gedrag (zie env-guard).
 *
 * ── Benodigde env-vars ──────────────────────────────────────────────────
 *   TURNSTILE_SECRET_KEY          (server-only) — geheime sleutel, siteverify.
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY (client)     — de publieke widget-sitekey
 *                                                 die de browser-widget rendert.
 *                                                 NIET in deze module gebruikt,
 *                                                 wel hier benoemd zodat de
 *                                                 frontend 'm uit dezelfde
 *                                                 config kan lezen.
 *
 * Het secret wordt NOOIT gelogd of in een fout/return-waarde teruggegeven.
 *
 * ── Env-guard (fail-open in dev, fail-closed in prod is de ROUTE-keuze) ──
 * `verifyTurnstile` doet geen netwerk-call wanneer er geen secret is
 * geconfigureerd. In plaats van hard te falen (wat e2e/dev zonder
 * Cloudflare-keys onmogelijk zou maken) geeft het dan een EXPLICIETE,
 * controleerbare uitkomst terug via `TurnstileResult`:
 *
 *   { success: false, reason: 'not-configured' }
 *
 * De aanroepende route beslist het beleid op basis van die `reason`:
 *   - in dev / zonder key (NODE_ENV !== 'production'): mag doorgaan;
 *   - in productie: MOET weigeren (fail-closed) — een ontbrekende
 *     CAPTCHA-config in prod is een misconfiguratie, geen vrijbrief.
 *
 * `isTurnstileConfigured()` is de simpele boolean voor die routebeslissing.
 * De boolean-variant `verifyTurnstile` blijft `false` zodra de challenge
 * niet aantoonbaar geslaagd is — een caller die alleen `boolean` checkt is
 * dus per definitie fail-closed.
 */

const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Time-out op de Cloudflare-call zodat een trage siteverify de route niet ophangt. */
const SITEVERIFY_TIMEOUT_MS = 5_000

/**
 * Reden waarom een verificatie niet (aantoonbaar) is geslaagd. Hiermee kan de
 * route onderscheid maken tussen "geen key geconfigureerd" (beleidskeuze) en
 * een echte afwijzing/fout (altijd weigeren).
 */
export type TurnstileFailReason =
  | 'not-configured' // TURNSTILE_SECRET_KEY ontbreekt — route beslist dev/prod-beleid
  | 'empty-token' // caller leverde geen/leeg token
  | 'rejected' // Cloudflare gaf success:false terug
  | 'error' // netwerk/parse/time-out bij siteverify

export interface TurnstileResult {
  /** True alleen wanneer Cloudflare de challenge aantoonbaar heeft goedgekeurd. */
  success: boolean
  /** Aanwezig wanneer `success === false`; stuurt de policy-keuze van de route. */
  reason?: TurnstileFailReason
}

/**
 * True wanneer `TURNSTILE_SECRET_KEY` aanwezig is. Gebruikt door de route om
 * te beslissen of een ontbrekende CAPTCHA-config in productie fail-closed
 * moet zijn (weigeren) of in dev mag passeren. Laadt/valideert het secret
 * verder niet en logt het niet.
 */
export function isTurnstileConfigured(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY
}

/**
 * Rijke verificatie met expliciete `reason`. Gebruik deze in de route wanneer
 * je onderscheid wilt maken tussen "niet geconfigureerd" (dev mag door) en een
 * echte afwijzing.
 *
 * @param token    Het `cf-turnstile-response`-token uit de client-widget.
 * @param remoteIp Optioneel client-IP (eerste hop) — Cloudflare gebruikt dit
 *                 als extra signaal. Mag weggelaten worden.
 */
export async function verifyTurnstileDetailed(
  token: string,
  remoteIp?: string,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY

  // Env-guard: geen secret → geen netwerk-call, expliciete uitkomst.
  // De ROUTE beslist of dit in dev mag passeren of in prod moet weigeren.
  if (!secret) {
    return { success: false, reason: 'not-configured' }
  }

  if (!token) {
    return { success: false, reason: 'empty-token' }
  }

  const body = new URLSearchParams()
  body.set('secret', secret)
  body.set('response', token)
  if (remoteIp) {
    body.set('remoteip', remoteIp)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SITEVERIFY_TIMEOUT_MS)

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    })

    if (!res.ok) {
      // HTTP-fout bij Cloudflare zelf — behandel als (tijdelijke) fout, niet
      // als geslaagd. Geen secret/response in de boodschap.
      return { success: false, reason: 'error' }
    }

    const data = (await res.json()) as { success?: boolean }
    return data.success === true
      ? { success: true }
      : { success: false, reason: 'rejected' }
  } catch {
    // Netwerk-, time-out- of parse-fout: nooit als geslaagd behandelen.
    // Bewust geen logging van het secret of de volledige response.
    return { success: false, reason: 'error' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Boolean-variant: `true` alleen wanneer Cloudflare de challenge aantoonbaar
 * heeft goedgekeurd. Elke andere uitkomst (niet geconfigureerd, leeg token,
 * afwijzing, fout) levert `false` — een caller die alléén deze boolean checkt
 * is dus per definitie fail-closed.
 *
 * Wil de route in dev/zonder key bewust doorlaten, gebruik dan
 * `isTurnstileConfigured()` + `verifyTurnstileDetailed()` en route op
 * `reason === 'not-configured'`.
 */
export async function verifyTurnstile(
  token: string,
  remoteIp?: string,
): Promise<boolean> {
  const result = await verifyTurnstileDetailed(token, remoteIp)
  return result.success
}
