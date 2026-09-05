/**
 * Het gedeelde aandachtsregister (UR3-10, ADR 0134).
 *
 * Wat hier vastligt is de belofte "één ding tegelijk": wie claimt, legt de
 * anderen stil, en een laag ziet zichzelf nooit als concurrent. De ref-telling
 * is geen luxe — React StrictMode mount → cleanup → mount, en twee exemplaren
 * van dezelfde laag zouden elkaars claim anders vroegtijdig vrijgeven.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  claimAttention,
  hasAttentionClaim,
  isAttentionClaimed,
  getAttentionClaims,
  useAttentionClaimed,
  useAttentionClaimedBy,
  __resetAttentionSignal,
} from './attention-signal'

beforeEach(() => { __resetAttentionSignal() })
afterEach(() => { __resetAttentionSignal() })

describe('attention-signal — claimen en vrijgeven', () => {
  it('begint leeg', () => {
    expect(isAttentionClaimed()).toBe(false)
    expect(getAttentionClaims()).toEqual([])
  })

  it('meldt een claim en geeft hem weer vrij', () => {
    const release = claimAttention('rondleiding')
    expect(hasAttentionClaim('rondleiding')).toBe(true)
    expect(isAttentionClaimed()).toBe(true)
    release()
    expect(hasAttentionClaim('rondleiding')).toBe(false)
    expect(isAttentionClaimed()).toBe(false)
  })

  it('telt dezelfde naam mee: één release laat de andere claim staan', () => {
    const a = claimAttention('fin-melding')
    const b = claimAttention('fin-melding')
    a()
    expect(hasAttentionClaim('fin-melding')).toBe(true)
    b()
    expect(hasAttentionClaim('fin-melding')).toBe(false)
  })

  it('negeert een dubbele release (idempotent)', () => {
    const a = claimAttention('fin-melding')
    const b = claimAttention('fin-melding')
    a(); a(); a()
    expect(hasAttentionClaim('fin-melding')).toBe(true)
    b()
    expect(hasAttentionClaim('fin-melding')).toBe(false)
  })

  it('laat een laag zichzelf overslaan met `exclude`', () => {
    claimAttention('fin-melding')
    // Fin ziet zijn eigen kaart niet als reden om te zwijgen…
    expect(isAttentionClaimed('fin-melding')).toBe(false)
    // …de rondleiding wél.
    claimAttention('rondleiding')
    expect(isAttentionClaimed('fin-melding')).toBe(true)
  })
})

describe('attention-signal — hooks', () => {
  it('useAttentionClaimed volgt het register in beide richtingen', () => {
    const { result } = renderHook(() => useAttentionClaimed())
    expect(result.current).toBe(false)
    let release: (() => void) | null = null
    act(() => { release = claimAttention('rondleiding') })
    expect(result.current).toBe(true)
    act(() => { release?.() })
    expect(result.current).toBe(false)
  })

  it('useAttentionClaimed(self) blijft blind voor de eigen claim', () => {
    const { result } = renderHook(() => useAttentionClaimed('fin-melding'))
    act(() => { claimAttention('fin-melding') })
    expect(result.current).toBe(false)
    act(() => { claimAttention('rondleiding') })
    expect(result.current).toBe(true)
  })

  it('useAttentionClaimedBy kijkt alleen naar de genoemde laag', () => {
    const { result } = renderHook(() => useAttentionClaimedBy('rondleiding'))
    act(() => { claimAttention('fin-melding') })
    expect(result.current).toBe(false)
    act(() => { claimAttention('rondleiding') })
    expect(result.current).toBe(true)
  })
})
