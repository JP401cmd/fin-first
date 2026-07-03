import { describe, it, expect } from 'vitest'
import {
  KERNEL_FLAG_KEYS,
  isKernelFlagEnabled,
  readKernelFlags,
  type KernelFlagName,
} from './flag'

/**
 * Pure-helper-dekking voor de horizon-kernel-vlaggen (ADR 0032 §6).
 * Borgt de twee invarianten waar de cutover op leunt — sinds de default-flip
 * (FASE 6, stap 3, eigenaar-besluit 2026-07-03) gespiegeld t.o.v. FASE 5:
 *   1. default = alles AAN (alleen een letterlijke `false` schakelt uit);
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

describe('readKernelFlags — default alles AAN (de default-flip)', () => {
  it('null-profiel → alles true', () => {
    expect(readKernelFlags(null)).toEqual({
      convergentie: true,
      whatif: true,
      household: true,
      scalar: true,
    })
  })

  it('undefined-profiel → alles true', () => {
    expect(readKernelFlags(undefined)).toEqual({
      convergentie: true,
      whatif: true,
      household: true,
      scalar: true,
    })
  })

  it('leeg feature_preferences → alles true', () => {
    expect(readKernelFlags({ feature_preferences: {} })).toEqual({
      convergentie: true,
      whatif: true,
      household: true,
      scalar: true,
    })
  })

  it('ontbrekend feature_preferences-veld → alles true', () => {
    expect(readKernelFlags({})).toEqual({
      convergentie: true,
      whatif: true,
      household: true,
      scalar: true,
    })
  })

  it('feature_preferences === null → alles true', () => {
    expect(readKernelFlags({ feature_preferences: null })).toEqual({
      convergentie: true,
      whatif: true,
      household: true,
      scalar: true,
    })
  })
})

describe('isKernelFlagEnabled — alleen een letterlijke false schakelt uit', () => {
  it('boolean false → uit (de noodklep)', () => {
    const profile = { feature_preferences: { horizon_kernel_convergentie: false } }
    expect(isKernelFlagEnabled(profile, 'convergentie')).toBe(false)
  })

  it('boolean true (legacy FASE 5-opt-in) → aan', () => {
    const profile = { feature_preferences: { horizon_kernel_convergentie: true } }
    expect(isKernelFlagEnabled(profile, 'convergentie')).toBe(true)
  })

  it('string "false" → aan (niet letterlijk boolean false)', () => {
    const profile = { feature_preferences: { horizon_kernel_convergentie: 'false' } }
    expect(isKernelFlagEnabled(profile, 'convergentie')).toBe(true)
  })

  it('getal 0 → aan (niet letterlijk boolean false)', () => {
    const profile = { feature_preferences: { horizon_kernel_convergentie: 0 } }
    expect(isKernelFlagEnabled(profile, 'convergentie')).toBe(true)
  })

  it('ontbrekende sleutel → aan', () => {
    const profile = { feature_preferences: { iets_anders: false } }
    expect(isKernelFlagEnabled(profile, 'convergentie')).toBe(true)
  })
})

describe('per-vlag onafhankelijkheid', () => {
  it.each(ALL_FLAGS)('alleen %s uit laat de andere drie aan', (flag) => {
    const profile = { feature_preferences: { [KERNEL_FLAG_KEYS[flag]]: false } }
    const flags = readKernelFlags(profile)
    expect(flags[flag]).toBe(false)
    for (const other of ALL_FLAGS) {
      if (other !== flag) expect(flags[other]).toBe(true)
    }
  })

  it('alle vier tegelijk uit (volledige noodklep)', () => {
    const feature_preferences = Object.fromEntries(
      ALL_FLAGS.map((f) => [KERNEL_FLAG_KEYS[f], false]),
    )
    expect(readKernelFlags({ feature_preferences })).toEqual({
      convergentie: false,
      whatif: false,
      household: false,
      scalar: false,
    })
  })
})
