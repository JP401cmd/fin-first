import { describe, it, expect } from 'vitest'
import { resolveRevalueReturnTo } from './page'

/**
 * Pint de terug-navigatie na een bulk-herwaardering (C-01 uit spoor W2.2).
 * Wie vanaf /overzicht/bezittingen herwaardeert moet dáár weer landen, en een
 * `returnTo`-param mag nooit een open-redirect worden.
 */
describe('resolveRevalueReturnTo', () => {
  it('houdt een geldig canoniek /overzicht-pad vast', () => {
    expect(resolveRevalueReturnTo('/overzicht/bezittingen')).toBe(
      '/overzicht/bezittingen',
    )
    expect(resolveRevalueReturnTo('/overzicht/bezittingen/investment')).toBe(
      '/overzicht/bezittingen/investment',
    )
    expect(resolveRevalueReturnTo('/overzicht/bezittingen?type=crypto')).toBe(
      '/overzicht/bezittingen?type=crypto',
    )
  })

  it('valt terug op de legacy /core/assets-route zonder (geldige) param', () => {
    expect(resolveRevalueReturnTo(null)).toBe('/core/assets')
    expect(resolveRevalueReturnTo(undefined)).toBe('/core/assets')
    expect(resolveRevalueReturnTo('')).toBe('/core/assets')
  })

  it('weert open-redirects (off-site doelen) en valt terug op /core/assets', () => {
    expect(resolveRevalueReturnTo('//evil.com')).toBe('/core/assets')
    expect(resolveRevalueReturnTo('https://evil.com')).toBe('/core/assets')
    expect(resolveRevalueReturnTo('/\\evil.com')).toBe('/core/assets')
    expect(resolveRevalueReturnTo('@evil.com')).toBe('/core/assets')
  })
})
