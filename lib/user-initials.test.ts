import { describe, it, expect } from 'vitest'
import { userInitials, userDisplayName } from './user-initials'

/**
 * UR3-17 #27b — het avatar-rondje in de TopBar toonde `email[0]`, waardoor een
 * gebruiker met een profielnaam de eerste letter van zijn INLOGADRES zag. De
 * naam wint; e-mail is de terugval.
 */
describe('userInitials — de profielnaam wint van het e-mailadres', () => {
  it('neemt de eerste letter van het eerste en het laatste woord', () => {
    expect(userInitials('Tessa Compleet', 'bas@test.trifinity.nl')).toBe('TC')
  })

  it('slaat tussenvoegsels over en pakt het laatste woord', () => {
    expect(userInitials('Jan van der Berg', 'jan@example.com')).toBe('JB')
  })

  it('geeft één letter bij een naam van één woord', () => {
    expect(userInitials('Tessa', 'bas@test.nl')).toBe('T')
  })

  it('valt terug op de eerste twee tekens vóór de @ zonder naam', () => {
    expect(userInitials(null, 'jpsmit@jps-holding.nl')).toBe('JP')
    expect(userInitials('   ', 'a@b.com')).toBe('A')
  })

  it('geeft ? als er niets bekend is', () => {
    expect(userInitials(null, '')).toBe('?')
  })

  it('negeert leestekens als initiaal', () => {
    expect(userInitials('"Bas" de Vries', 'bas@test.nl')).toBe('BV')
  })
})

describe('userDisplayName', () => {
  it('toont de profielnaam wanneer die er is', () => {
    expect(userDisplayName('Tessa Compleet', 'bas@test.nl')).toBe('Tessa Compleet')
  })

  it('valt terug op het deel vóór de @', () => {
    expect(userDisplayName(null, 'jpsmit@jps-holding.nl')).toBe('jpsmit')
  })

  it('geeft Account als er niets bekend is', () => {
    expect(userDisplayName('   ', '')).toBe('Account')
  })
})
