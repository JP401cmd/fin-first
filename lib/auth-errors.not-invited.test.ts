import { describe, it, expect } from 'vitest'
import {
  translateAuthError,
  isUserAlreadyRegisteredError,
  SIGNUP_NOT_INVITED_SENTINEL,
} from './auth-errors'

/**
 * Besloten testfase (ADR 0047): de `before_user_created`-hook weigert een
 * niet-uitgenodigd adres met de `SIGNUP_NOT_INVITED_SENTINEL` in de
 * foutmelding. `translateAuthError` moet die sentinel case-insensitief
 * herkennen en een eigen NL-copy tonen — vóór de generieke fallback en
 * onafhankelijk van de "al geregistreerd"-tak (dat blijft anti-enumeratie:
 * allowlist-membership onthult geen accountstatus).
 */
describe('translateAuthError — besloten testfase (ADR 0047)', () => {
  const expected =
    'TriFinity zit in een besloten testfase. Dit e-mailadres heeft nog geen toegang.'

  it('vertaalt de sentinel-message naar de besloten-testfase-copy', () => {
    expect(
      translateAuthError({
        message: `${SIGNUP_NOT_INVITED_SENTINEL}: dit e-mailadres staat niet op de uitnodigingslijst.`,
      }),
    ).toBe(expected)
  })

  it('is case-insensitief op de sentinel', () => {
    expect(
      translateAuthError({ message: 'trifinity_not_invited: nope' }),
    ).toBe(expected)
    expect(
      translateAuthError({ message: 'Trifinity_Not_Invited: nope' }),
    ).toBe(expected)
  })

  it('herkent de sentinel ook als die in de `code` zit i.p.v. de message', () => {
    expect(
      translateAuthError({ message: 'Signup not allowed', code: SIGNUP_NOT_INVITED_SENTINEL }),
    ).toBe(expected)
  })

  it('weegt zwaarder dan de generieke fallback (geen "iets ging mis")', () => {
    const result = translateAuthError({
      message: `Some wrapper text ${SIGNUP_NOT_INVITED_SENTINEL} more text`,
    })
    expect(result).not.toBe('Er ging iets mis. Probeer het opnieuw.')
    expect(result).toBe(expected)
  })

  it('blijft losstaand van de "al geregistreerd"-detectie (geen enumeratie-lek via de sentinel)', () => {
    // Een sentinel-fout mag NOOIT als "already registered" herkend worden —
    // dat zou allowlist-weigering en accountstatus door elkaar halen.
    expect(
      isUserAlreadyRegisteredError({
        message: `${SIGNUP_NOT_INVITED_SENTINEL}: geen toegang`,
      }),
    ).toBe(false)
  })

  it('SIGNUP_NOT_INVITED_SENTINEL is het stabiele cross-brok-contract-token', () => {
    // Vastgepind: dit token wordt ook door de SQL-hook (migratie) en de
    // OAuth-callback gebruikt. Wijzig 'm alleen bewust en overal tegelijk.
    expect(SIGNUP_NOT_INVITED_SENTINEL).toBe('TRIFINITY_NOT_INVITED')
  })
})
