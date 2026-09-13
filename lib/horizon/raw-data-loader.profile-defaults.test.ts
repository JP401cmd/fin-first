/**
 * TPR-11 (13 sep 2026) — één default voor de eind-vorm van het plan.
 *
 * `PROFILE_DEFAULTS` is de terugval van de horizon-loader wanneer de profiel-query
 * faalt. Hij droeg een eigen literal `fire_end_strategy: 'perpetual'`, terwijl
 * `parseFireStrategy` (lib/fire-strategy.ts) élke onbekende/ontbrekende waarde naar
 * `DEFAULT_FIRE_STRATEGY` ('deplete') vouwt. Twee defaults voor hetzelfde veld: bij een
 * queryfout rekende /toekomst een ándere eind-vorm (perpetuïteit, doel = uitgaven/SWR)
 * dan elk ander pad (opeten tot de eindleeftijd). Sindsdien importeert de loader de
 * default; deze test pint dat er geen tweede literal terug kan sluipen.
 */

import { describe, it, expect } from 'vitest'
import { DEFAULT_FIRE_STRATEGY, parseFireStrategy } from '@/lib/fire-strategy'
import { PROFILE_DEFAULTS } from './raw-data-loader'

describe('TPR-11 — PROFILE_DEFAULTS volgt DEFAULT_FIRE_STRATEGY', () => {
  it('eind-vorm, eindleeftijd en nalatenschap komen uit lib/fire-strategy.ts', () => {
    expect(PROFILE_DEFAULTS.fire_end_strategy).toBe(DEFAULT_FIRE_STRATEGY.strategy)
    expect(PROFILE_DEFAULTS.fire_end_age).toBe(DEFAULT_FIRE_STRATEGY.endAge)
    expect(PROFILE_DEFAULTS.fire_legacy_amount).toBe(DEFAULT_FIRE_STRATEGY.legacyAmount)
  })

  it('de loader-terugval parseert naar exact dezelfde config als een leeg profiel', () => {
    const viaDefaults = parseFireStrategy(PROFILE_DEFAULTS)
    const viaLeeg = parseFireStrategy({})
    expect(viaDefaults).toEqual(viaLeeg)
    expect(viaDefaults).toEqual(DEFAULT_FIRE_STRATEGY)
  })
})
