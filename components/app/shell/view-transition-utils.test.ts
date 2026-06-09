import { describe, it, expect } from 'vitest'
import { shouldLogViewTransitionError } from './view-transition-utils'

// Echte DOMExceptions zijn in moderne Chromium `instanceof Error`; we spiegelen
// dat met Error-objecten + expliciete `.name` zodat de test de náám-gating toetst
// los van of jsdom's DOMException al dan niet van Error erft.
function namedError(name: string, message = name): Error {
  return Object.assign(new Error(message), { name })
}

describe('shouldLogViewTransitionError', () => {
  it('skipt AbortError (transitie vervangen door een nieuwe)', () => {
    expect(shouldLogViewTransitionError(namedError('AbortError'))).toBe(false)
  })

  it('skipt InvalidStateError (document hidden / niet-fully-active)', () => {
    const err = namedError('InvalidStateError', 'Transition was aborted because of invalid state')
    expect(shouldLogViewTransitionError(err)).toBe(false)
  })

  it('logt een echte, onverwachte fout wél', () => {
    expect(shouldLogViewTransitionError(new TypeError('boom'))).toBe(true)
  })

  it('logt niet-Error-waarden niet (behoudt de instanceof-gate)', () => {
    expect(shouldLogViewTransitionError('oeps')).toBe(false)
    expect(shouldLogViewTransitionError(null)).toBe(false)
    expect(shouldLogViewTransitionError(undefined)).toBe(false)
  })
})
