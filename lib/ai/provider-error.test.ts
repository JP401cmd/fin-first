import { describe, it, expect } from 'vitest'
import { APICallError, LoadAPIKeyError } from 'ai'
import { classifyProviderError, isRefusedProviderError } from './provider-error'

/**
 * UR3-09 / ADR 0132 — de classificatie die "dit lukt zo weer" (transient) van
 * "dit lukt nooit" (refused) scheidt. Leunt op `APICallError.isRetryable`
 * (AI-SDK) i.p.v. zelf statuscodes te herclassificeren.
 */

function apiCallError(opts: { isRetryable: boolean; statusCode?: number; message?: string }) {
  return new APICallError({
    message: opts.message ?? 'providerfout',
    url: 'https://api.anthropic.com/v1/messages',
    requestBodyValues: {},
    statusCode: opts.statusCode,
    isRetryable: opts.isRetryable,
  })
}

describe('classifyProviderError', () => {
  it('APICallError met isRetryable:false → refused (tegoed op, sleutel ongeldig, geweigerd)', () => {
    const err = apiCallError({ isRetryable: false, statusCode: 400 })
    expect(classifyProviderError(err)).toBe('refused')
  })

  it('APICallError met isRetryable:true → transient (rate limit, 5xx, overloaded)', () => {
    const err = apiCallError({ isRetryable: true, statusCode: 429 })
    expect(classifyProviderError(err)).toBe('transient')
  })

  it('LoadAPIKeyError → refused', () => {
    const err = new LoadAPIKeyError({ message: 'API key ontbreekt' })
    expect(classifyProviderError(err)).toBe('refused')
  })

  it('een AbortError (DOMException) → transient', () => {
    const err = new DOMException('The operation was aborted', 'AbortError')
    expect(classifyProviderError(err)).toBe('transient')
  })

  it('een andersoortige DOMException blijft unknown (alleen AbortError telt)', () => {
    const err = new DOMException('iets anders', 'NotFoundError')
    expect(classifyProviderError(err)).toBe('unknown')
  })

  it('een TypeError met "fetch" in de message → transient (mislukte fetch, geen APICallError)', () => {
    expect(classifyProviderError(new TypeError('fetch failed'))).toBe('transient')
    expect(classifyProviderError(new TypeError('Failed to fetch'))).toBe('transient')
  })

  it('een TypeError zonder "fetch" in de message → unknown', () => {
    expect(classifyProviderError(new TypeError('x is not a function'))).toBe('unknown')
  })

  it('een gewone Error → unknown', () => {
    expect(classifyProviderError(new Error('iets willekeurigs'))).toBe('unknown')
  })

  it('niet-Error-waarden (string, getal, null, undefined, plain object) → unknown', () => {
    expect(classifyProviderError('boom')).toBe('unknown')
    expect(classifyProviderError(42)).toBe('unknown')
    expect(classifyProviderError(null)).toBe('unknown')
    expect(classifyProviderError(undefined)).toBe('unknown')
    expect(classifyProviderError({ message: 'geen echte Error' })).toBe('unknown')
  })
})

describe('isRefusedProviderError', () => {
  it('true bij refused, false bij transient/unknown', () => {
    expect(isRefusedProviderError(apiCallError({ isRetryable: false }))).toBe(true)
    expect(isRefusedProviderError(apiCallError({ isRetryable: true }))).toBe(false)
    expect(isRefusedProviderError(new LoadAPIKeyError({ message: 'x' }))).toBe(true)
    expect(isRefusedProviderError(new TypeError('fetch failed'))).toBe(false)
    expect(isRefusedProviderError(new Error('iets'))).toBe(false)
  })
})
