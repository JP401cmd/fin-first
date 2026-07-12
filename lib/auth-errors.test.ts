import { describe, it, expect } from 'vitest'
import {
  translateAuthError,
  AUTH_NETWORK_MESSAGE,
  AUTH_GENERIC_MESSAGE,
} from './auth-errors'

/**
 * translateAuthError vertaalt rauwe (Engelse) Supabase-authfouten naar NL-copy
 * volgens "wat ging mis + hoe fix je het". De tests dekken de bekende
 * foutcodes/messages plus de netwerk- en generieke fallback.
 */
describe('translateAuthError', () => {
  it('vertaalt "user already registered" (message én code)', () => {
    const expected =
      "Dit e-mailadres is al geregistreerd — log in of gebruik 'wachtwoord vergeten'."
    expect(translateAuthError({ message: 'User already registered' })).toBe(expected)
    expect(translateAuthError({ message: 'x', code: 'user_already_exists' })).toBe(expected)
  })

  it('vertaalt "invalid login credentials" (message én code)', () => {
    const expected = 'E-mailadres of wachtwoord klopt niet.'
    expect(translateAuthError({ message: 'Invalid login credentials' })).toBe(expected)
    expect(translateAuthError({ message: 'x', code: 'invalid_credentials' })).toBe(expected)
  })

  it('vertaalt "email not confirmed" (message én code)', () => {
    const expected = 'Bevestig eerst je e-mailadres via de link in je mail.'
    expect(translateAuthError({ message: 'Email not confirmed' })).toBe(expected)
    expect(translateAuthError({ message: 'x', code: 'email_not_confirmed' })).toBe(expected)
  })

  it('vertaalt rate-limit-fouten (message-varianten én code)', () => {
    const expected = 'Te veel pogingen — wacht even en probeer opnieuw.'
    expect(translateAuthError({ message: 'Email rate limit exceeded' })).toBe(expected)
    expect(
      translateAuthError({
        message: 'For security purposes, you can only request this after 43 seconds.',
      }),
    ).toBe(expected)
    expect(translateAuthError({ message: 'x', code: 'over_request_rate_limit' })).toBe(expected)
  })

  it('vertaalt zwak/te-kort wachtwoord (message-varianten én code)', () => {
    const expected = 'Kies een wachtwoord van minimaal 6 tekens.'
    expect(
      translateAuthError({ message: 'Password should be at least 6 characters.' }),
    ).toBe(expected)
    expect(translateAuthError({ message: 'x', code: 'weak_password' })).toBe(expected)
  })

  it('vertaalt netwerkfouten naar de offline-copy', () => {
    // Supabase geeft een netwerkfout terug als AuthRetryableFetchError...
    expect(
      translateAuthError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }),
    ).toBe(AUTH_NETWORK_MESSAGE)
    // ...of de fetch gooit zelf een TypeError.
    expect(translateAuthError(new TypeError('Failed to fetch'))).toBe(AUTH_NETWORK_MESSAGE)
  })

  it('valt terug op generieke NL-copy bij onbekende fouten', () => {
    expect(translateAuthError({ message: 'Some unexpected server error' })).toBe(
      AUTH_GENERIC_MESSAGE,
    )
    expect(translateAuthError(null)).toBe(AUTH_GENERIC_MESSAGE)
    expect(translateAuthError(undefined)).toBe(AUTH_GENERIC_MESSAGE)
    expect(translateAuthError({})).toBe(AUTH_GENERIC_MESSAGE)
  })

  it('is niet hoofdlettergevoelig op de message', () => {
    expect(translateAuthError({ message: 'INVALID LOGIN CREDENTIALS' })).toBe(
      'E-mailadres of wachtwoord klopt niet.',
    )
  })
})
