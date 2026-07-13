// ── Login-loze unsubscribe-token (HMAC) ──────────────────────────────
//
// De briefing-e-mail bevat een "afmelden"-link die zónder ingelogde sessie
// moet werken (wettelijk vereist: one-click unsubscribe). We geven daarom géén
// rauwe user-id in de URL — dat zou iedereen laten afmelden voor een willekeurige
// gebruiker. In plaats daarvan tekenen we de uid met HMAC-SHA256:
//
//   token = "<uid>.<hmac_hex>"
//
// De unsubscribe-route splitst op de LAATSTE punt (een uid is een UUID zonder
// punten, dus dit is eenduidig), hertekent de uid en vergelijkt de handtekening
// constant-time. Alleen een correct getekend token levert de uid op; knoeien
// (andere uid of andere signature) → null → geen mutatie.
//
// Puur & injecteerbaar: het secret komt als argument binnen (de route resolvet
// het uit de env). Zo is de sign/verify-logica volledig unit-testbaar zonder env.

import { createHmac, timingSafeEqual } from 'node:crypto'

/** Bereken de hex-HMAC-SHA256 van `uid` onder `secret`. */
function sign(uid: string, secret: string): string {
  return createHmac('sha256', secret).update(uid).digest('hex')
}

/**
 * Teken een uid tot een unsubscribe-token `"<uid>.<hmac_hex>"`.
 * `secret` moet server-side zijn (EMAIL_UNSUB_SECRET / CRON_SECRET) — nooit
 * naar de client lekken.
 */
export function signUnsubscribeToken(uid: string, secret: string): string {
  if (!uid || !secret) throw new Error('signUnsubscribeToken: uid en secret zijn verplicht')
  return `${uid}.${sign(uid, secret)}`
}

/**
 * Verifieer een unsubscribe-token. Geeft de uid terug bij een geldige
 * handtekening, anders `null`. Constant-time vergelijking tegen timing-lekken;
 * lengte-mismatch of ontbrekende delen → direct null (geen throw).
 */
export function verifyUnsubscribeToken(
  token: string | null | undefined,
  secret: string | null | undefined,
): string | null {
  if (!token || !secret) return null

  // Split op de LAATSTE punt: uid (UUID, puntloos) vóór, signature ná.
  const lastDot = token.lastIndexOf('.')
  if (lastDot <= 0 || lastDot === token.length - 1) return null

  const uid = token.slice(0, lastDot)
  const providedSig = token.slice(lastDot + 1)
  const expectedSig = sign(uid, secret)

  // timingSafeEqual eist gelijke lengte — anders is de vergelijking sowieso
  // ongeldig. Vergelijk op de hex-bytes.
  const a = Buffer.from(providedSig, 'hex')
  const b = Buffer.from(expectedSig, 'hex')
  if (a.length === 0 || a.length !== b.length) return null
  if (!timingSafeEqual(a, b)) return null

  return uid
}
