import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/api/respond'
import { AI_ERROR_CODE, describeAiError, type AiErrorCode } from '@/lib/ai/error-copy'
import type { AIConfigError } from '@/lib/ai/config'

/**
 * Gedeelde weigeringen voor AI-routes (V-002).
 *
 * EEN CONTRACT voor de client: elke AI-functie die niet beschikbaar is, draagt
 * een stabiele `code` op de platte error-envelope (ADR 0044). De UI herkent
 * daarop "dit kan in de app met een AI-abonnement" en biedt het abonnement aan,
 * zonder op tekst-substrings te hoeven raden.
 *
 *   geen AI-abonnement      → 403 `ai_subscription`
 *   maandlimiet op          → 429 `ai_credit_limit` (servertekst met credits + resetdatum)
 *   kill-switch van beheer  → 422 `ai_disabled_platform`
 *   AI-config / sleutel mist→ 422 `ai_unavailable`
 *
 * De `error`-tekst komt uit `lib/ai/error-copy.ts`. Een `AIConfigError.message`
 * is beheerderstaal ("Stel een API key in…") en gaat UITSLUITEND naar het
 * serverlog — nooit naar de client.
 *
 * Bewust geen runtime-import van `@/lib/ai/config`: die trekt de provider-SDK's
 * mee, en route-tests mocken die module vaak zonder de klasse. De herkenning
 * gebeurt daarom op `name` + `reason` (zie `isAIConfigError`).
 */

interface DenialOptions {
  /**
   * Route-specifieke tekst die rijker is dan de generieke copy (bv. de
   * publicatie-uitleg van rekenhulpen). De `code` blijft altijd gelijk.
   */
  message?: string
  /**
   * Compat voor clients die `data.ok === false` lezen (rekenhulp-bouwen en
   * -publiceren). Voegt `ok: false` toe naast `error` + `code`.
   */
  withOkFalse?: boolean
}

function denial(message: string, status: number, code: AiErrorCode, withOkFalse?: boolean): NextResponse {
  if (!withOkFalse) return errorResponse(message, status, code)
  return NextResponse.json({ ok: false, error: message, code }, { status })
}

/** 403 — de gebruiker heeft geen AI-abonnement (`checkTierGate(..., 'ai')` faalde). */
export function aiSubscriptionRequired(options: DenialOptions = {}): NextResponse {
  const message = options.message ?? describeAiError(AI_ERROR_CODE.subscription).text
  return denial(message, 403, AI_ERROR_CODE.subscription, options.withOkFalse)
}

/**
 * 429 — maandelijks creditbudget op. `message` is de rijke servertekst
 * (`creditLimitMessage(gate)`); de client laat die winnen (`preferServerText`).
 */
export function aiCreditLimitReached(
  message: string,
  retryAfterSeconds?: number,
  options: Pick<DenialOptions, 'withOkFalse'> = {},
): NextResponse {
  const res = denial(message, 429, AI_ERROR_CODE.creditLimit, options.withOkFalse)
  if (retryAfterSeconds != null) res.headers.set('Retry-After', String(retryAfterSeconds))
  return res
}

/** Herkent een `AIConfigError` zonder de config-module (en provider-SDK's) te laden. */
export function isAIConfigError(err: unknown): err is AIConfigError {
  return err instanceof Error && err.name === 'AIConfigError'
}

/** De client-veilige code voor een AIConfigError (kill-switch of onbeschikbaar). */
export function aiConfigErrorCode(err: unknown): AiErrorCode {
  const reason = isAIConfigError(err) ? (err as { reason?: unknown }).reason : undefined
  return reason === AI_ERROR_CODE.disabledPlatform ? AI_ERROR_CODE.disabledPlatform : AI_ERROR_CODE.unavailable
}

/**
 * Model kon niet geladen worden. Logt de echte oorzaak server-side met `tag`
 * (grep-baar) en stuurt de neutrale copy + code:
 *   - `AIConfigError` → 422 met `ai_disabled_platform` of `ai_unavailable`
 *   - andere fout     → 500 met `ai_unavailable`
 */
export function aiModelUnavailable(
  err: unknown,
  tag: string,
  options: Pick<DenialOptions, 'withOkFalse'> = {},
): NextResponse {
  if (isAIConfigError(err)) {
    const provider = (err as { provider?: unknown }).provider
    console.error(`[${tag}:config] ${String(provider ?? 'onbekend')}: ${err.message}`)
    const code = aiConfigErrorCode(err)
    return denial(describeAiError(code).text, 422, code, options.withOkFalse)
  }
  const stack = err instanceof Error ? err.stack : undefined
  console.error(`[${tag}:model] model kon niet worden geladen:`, err instanceof Error ? err.message : err, stack ?? '')
  return denial(describeAiError(AI_ERROR_CODE.unavailable).text, 500, AI_ERROR_CODE.unavailable, options.withOkFalse)
}
