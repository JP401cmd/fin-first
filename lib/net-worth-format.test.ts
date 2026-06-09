import { describe, it, expect } from 'vitest'
import { formatNetWorthShort } from './net-worth-format'
import { MASKED_AMOUNT_PLACEHOLDER } from './format'

/**
 * Tests voor formatNetWorthShort — de compacte netto-vermogen-notatie in de
 * sidebar-module-rij (€ 142k / € 1,2M). Sinds de privacy-masking-fix honoreert
 * deze ook de masked-state: een saldo in de sidebar moet verborgen worden
 * wanneer de gebruiker "Bedragen verbergen" aanzet.
 */
describe('formatNetWorthShort — zichtbaar', () => {
  it('formatteert duizenden als € {n}k', () => {
    expect(formatNetWorthShort(142_000)).toBe('€ 142k')
  })

  it('formatteert miljoenen als € {n}M met komma-decimaal', () => {
    expect(formatNetWorthShort(1_200_000)).toBe('€ 1,2M')
  })

  it('formatteert bedragen onder 1000 zonder suffix', () => {
    expect(formatNetWorthShort(750)).toBe('€ 750')
  })
})

describe('formatNetWorthShort — gemaskeerd', () => {
  it('toont de bullet-placeholder wanneer masked=true', () => {
    expect(formatNetWorthShort(142_000, true)).toBe(MASKED_AMOUNT_PLACEHOLDER)
  })

  it('lekt geen cijfers bij een miljoenenbedrag wanneer gemaskeerd', () => {
    expect(formatNetWorthShort(1_200_000, true)).toBe(MASKED_AMOUNT_PLACEHOLDER)
    expect(formatNetWorthShort(1_200_000, true)).not.toContain('1,2')
  })
})
