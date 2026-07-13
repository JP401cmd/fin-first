import { describe, it, expect } from 'vitest'
import { isUserAlreadyRegisteredError, translateAuthError } from './auth-errors'

/**
 * Anti-enumeratie: `isUserAlreadyRegisteredError` herkent exact de gevallen die
 * de signup-pagina naar het neutrale succes-scherm routeert i.p.v. de
 * onthullende melding. De bestaande mapping in `translateAuthError` blijft
 * ongewijzigd (andere consumers mogen de NL-copy blijven tonen); deze test pint
 * enkel de predicate + dat 'ie op dezelfde brontekst/-code matcht als de mapping.
 * (De bestaande mapping-suite in auth-errors.test.ts blijft bewust ongemoeid.)
 */
describe('isUserAlreadyRegisteredError', () => {
  it('matcht op de message-variant (case-insensitief)', () => {
    expect(isUserAlreadyRegisteredError({ message: 'User already registered' })).toBe(true)
    expect(isUserAlreadyRegisteredError({ message: 'USER ALREADY REGISTERED' })).toBe(true)
  })

  it('matcht op de code-variant', () => {
    expect(isUserAlreadyRegisteredError({ code: 'user_already_exists' })).toBe(true)
  })

  it('matcht NIET op andere fouten of lege waarden', () => {
    expect(isUserAlreadyRegisteredError({ message: 'Invalid login credentials' })).toBe(false)
    expect(
      isUserAlreadyRegisteredError({ message: 'Password should be at least 6 characters.' }),
    ).toBe(false)
    expect(isUserAlreadyRegisteredError(null)).toBe(false)
    expect(isUserAlreadyRegisteredError(undefined)).toBe(false)
    expect(isUserAlreadyRegisteredError({})).toBe(false)
  })

  it('blijft consistent met de (ongewijzigde) mapping voor andere consumers', () => {
    expect(translateAuthError({ code: 'user_already_exists' })).toBe(
      "Dit e-mailadres is al geregistreerd — log in of gebruik 'wachtwoord vergeten'.",
    )
  })
})
