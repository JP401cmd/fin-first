import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  aiSubscriptionRequired,
  aiCreditLimitReached,
  aiModelUnavailable,
  aiConfigErrorCode,
  isAIConfigError,
} from './gate-responses'
import { AI_ERROR_CODE, describeAiError } from './error-copy'

/** Lokale stand-in: gelijk aan `AIConfigError` uit config.ts, zonder de provider-SDK's te laden. */
class FakeAIConfigError extends Error {
  constructor(message: string, public provider: string, public reason: string = AI_ERROR_CODE.unavailable) {
    super(message)
    this.name = 'AIConfigError'
  }
}

afterEach(() => vi.restoreAllMocks())

describe('aiSubscriptionRequired', () => {
  it('geeft 403 + ai_subscription met de generieke copy', async () => {
    const res = aiSubscriptionRequired()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({
      error: describeAiError(AI_ERROR_CODE.subscription).text,
      code: 'ai_subscription',
    })
  })

  it('laat een route-specifieke tekst toe, de code blijft gelijk', async () => {
    const res = aiSubscriptionRequired({ message: 'Delen hoort bij het AI-abonnement.', withOkFalse: true })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ ok: false, error: 'Delen hoort bij het AI-abonnement.', code: 'ai_subscription' })
  })
})

describe('aiCreditLimitReached', () => {
  it('geeft 429 + ai_credit_limit, behoudt de servertekst en zet Retry-After', async () => {
    const res = aiCreditLimitReached('Je hebt je maandelijkse AI-limiet bereikt (100 credits).', 3600)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('3600')
    expect(await res.json()).toEqual({
      error: 'Je hebt je maandelijkse AI-limiet bereikt (100 credits).',
      code: 'ai_credit_limit',
    })
  })
})

describe('aiModelUnavailable', () => {
  it('lekt nooit de beheerderstekst van een AIConfigError (422 ai_unavailable)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new FakeAIConfigError('Anthropic API key is niet geconfigureerd. Stel een API key in via Beheer.', 'anthropic')
    const res = aiModelUnavailable(err, 'test-route')
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body).toEqual({ error: describeAiError(AI_ERROR_CODE.unavailable).text, code: 'ai_unavailable' })
    expect(JSON.stringify(body)).not.toMatch(/API key|Beheer|anthropic/i)
    // De echte reden staat wél in het serverlog, met grep-bare tag.
    expect(String(log.mock.calls[0]?.[0])).toContain('[test-route:config]')
    expect(String(log.mock.calls[0]?.[0])).toContain('Stel een API key in')
  })

  it('mapt de kill-switch op 422 ai_disabled_platform', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new FakeAIConfigError('AI is uitgeschakeld door beheer', 'platform', AI_ERROR_CODE.disabledPlatform)
    const res = aiModelUnavailable(err, 't')
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({
      error: describeAiError(AI_ERROR_CODE.disabledPlatform).text,
      code: 'ai_disabled_platform',
    })
  })

  it('andere fouten → 500 ai_unavailable, zonder err.message in de body', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = aiModelUnavailable(new Error('ECONNRESET db-host-internal'), 't', { withOkFalse: true })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ ok: false, error: describeAiError(AI_ERROR_CODE.unavailable).text, code: 'ai_unavailable' })
  })
})

describe('isAIConfigError / aiConfigErrorCode', () => {
  it('herkent op naam en valt veilig terug op ai_unavailable', () => {
    expect(isAIConfigError(new FakeAIConfigError('x', 'p'))).toBe(true)
    expect(isAIConfigError(new Error('x'))).toBe(false)
    expect(isAIConfigError({ name: 'AIConfigError' })).toBe(false)
    expect(aiConfigErrorCode(new FakeAIConfigError('x', 'p', 'iets-onbekends'))).toBe('ai_unavailable')
    expect(aiConfigErrorCode(new Error('x'))).toBe('ai_unavailable')
  })
})
