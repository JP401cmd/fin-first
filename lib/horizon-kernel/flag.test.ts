import { describe, it, expect } from 'vitest'
import {
  KERNEL_FLAG_KEYS,
  isKernelFlagEnabled,
  readKernelFlags,
  type KernelFlagName,
} from './flag'

/**
 * Pure-helper-dekking voor de horizon-kernel FASE 5-vlaggen (ADR 0032 §6).
 * Borgt de twee invarianten waar de uitrol op leunt:
 *   1. default = alles UIT (alleen letterlijke `true` schakelt in);
 *   2. de opslag-sleutels zijn een vast contract (contract-lock).
 */

const ALL_FLAGS: KernelFlagName[] = ['convergentie', 'whatif', 'household', 'scalar']

describe('KERNEL_FLAG_KEYS — contract-lock', () => {
  it('bevat exact de vier horizon_kernel_*-sleutels', () => {
    expect(KERNEL_FLAG_KEYS).toEqual({
      convergentie: 'horizon_kernel_convergentie',
      whatif: 'horizon_kernel_whatif',
      household: 'horizon_kernel_household',
      scalar: 'horizon_kernel_scalar',
    })
  })

  it('heeft precies vier vlaggen', () => {
    expect(Object.keys(KERNEL_FLAG_KEYS)).toHaveLength(4)
  })
})

describe('readKernelFlags — default alles UIT', () => {
  it('null-profiel → alles false', () => {
    expect(readKernelFlags(null)).toEqual({
      convergentie: false,
      whatif: false,
      household: false,
      scalar: false,
    })
  })

  it('undefined-profiel → alles false', () => {
    expect(readKernelFlags(undefined)).toEqual({
      convergentie: false,
      whatif: false,
      household: false,
      scalar: false,
    })
  })

  it('leeg feature_preferences → alles false', () => {
    expect(readKernelFlags({ feature_preferences: {} })).toEqual({
      convergentie: false,
      whatif: false,
      household: false,
      scalar: false,
    })
  })

  it('ontbrekend feature_preferences-veld → alles false', () => {
    expect(readKernelFlags({})).toEqual({
      convergentie: false,
      whatif: false,
      household: false,
      scalar: false,
    })
  })

  it('feature_preferences === null → alles false', () => {
    expect(readKernelFlags({ feature_preferences: null })).toEqual({
      convergentie: false,
      whatif: false,
      household: false,
      scalar: false,
    })
  })
})

describe('isKernelFlagEnabled — alleen letterlijke true telt', () => {
  it('boolean true → aan', () => {
    const profile = { feature_preferences: { horizon_kernel_convergentie: true } }
    expect(isKernelFlagEnabled(profile, 'convergentie')).toBe(true)
  })

  it('string "true" → uit', () => {
    const profile = { feature_preferences: { horizon_kernel_convergentie: 'true' } }
    expect(isKernelFlagEnabled(profile, 'convergentie')).toBe(false)
  })

  it('getal 1 → uit', () => {
    const profile = { feature_preferences: { horizon_kernel_convergentie: 1 } }
    expect(isKernelFlagEnabled(profile, 'convergentie')).toBe(false)
  })

  it('boolean false → uit', () => {
    const profile = { feature_preferences: { horizon_kernel_convergentie: false } }
    expect(isKernelFlagEnabled(profile, 'convergentie')).toBe(false)
  })

  it('ontbrekende sleutel → uit', () => {
    const profile = { feature_preferences: { iets_anders: true } }
    expect(isKernelFlagEnabled(profile, 'convergentie')).toBe(false)
  })
})

describe('per-vlag onafhankelijkheid', () => {
  it.each(ALL_FLAGS)('alleen %s aan laat de andere drie uit', (flag) => {
    const profile = { feature_preferences: { [KERNEL_FLAG_KEYS[flag]]: true } }
    const flags = readKernelFlags(profile)
    expect(flags[flag]).toBe(true)
    for (const other of ALL_FLAGS) {
      if (other !== flag) expect(flags[other]).toBe(false)
    }
  })

  it('alle vier tegelijk aan', () => {
    const feature_preferences = Object.fromEntries(
      ALL_FLAGS.map((f) => [KERNEL_FLAG_KEYS[f], true]),
    )
    expect(readKernelFlags({ feature_preferences })).toEqual({
      convergentie: true,
      whatif: true,
      household: true,
      scalar: true,
    })
  })
})
