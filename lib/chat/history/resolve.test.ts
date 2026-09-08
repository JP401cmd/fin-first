import { describe, it, expect } from 'vitest'
import { resolveBackend } from './resolve'
import type { ChatHistoryMode, ChatOrigin } from './types'

/**
 * De privacyvloer van de gespreksgeschiedenis (ADR 0137, W-004).
 *
 * Deze matrix is géén implementatiedetail maar de toetsbare kern van een
 * belofte aan de gebruiker: wat lokaal gevoerd is, blijft lokaal. De test pint
 * alle vier de gevallen expliciet vast — inclusief het geval dat de vloer
 * daadwerkelijk uitoefent (`account` + `lokaal`), want dat is het enige geval
 * waarin de uitkomst afwijkt van wat de gebruiker letterlijk instelde.
 */
describe('resolveBackend — de vier gevallen', () => {
  it('modus "uit" bewaart niets, ongeacht waar het gesprek draaide', () => {
    expect(resolveBackend('uit', 'cloud')).toBe('geen')
    expect(resolveBackend('uit', 'lokaal')).toBe('geen')
  })

  it('modus "apparaat" houdt alles op dit toestel', () => {
    expect(resolveBackend('apparaat', 'cloud')).toBe('apparaat')
    expect(resolveBackend('apparaat', 'lokaal')).toBe('apparaat')
  })

  it('modus "account" met een cloudgesprek landt op de server', () => {
    expect(resolveBackend('account', 'cloud')).toBe('server')
  })

  it('DE VLOER: modus "account" met een lokaal gesprek landt tóch op het apparaat', () => {
    expect(resolveBackend('account', 'lokaal')).toBe('apparaat')
  })

  it('geeft nooit "server" terug voor een lokaal gevoerd gesprek', () => {
    const modi: ChatHistoryMode[] = ['account', 'apparaat', 'uit']
    for (const modus of modi) {
      expect(resolveBackend(modus, 'lokaal')).not.toBe('server')
    }
  })

  it('is puur — dezelfde invoer geeft altijd dezelfde uitkomst', () => {
    const modi: ChatHistoryMode[] = ['account', 'apparaat', 'uit']
    const origins: ChatOrigin[] = ['cloud', 'lokaal']
    for (const modus of modi) {
      for (const origin of origins) {
        expect(resolveBackend(modus, origin)).toBe(resolveBackend(modus, origin))
      }
    }
  })
})
