import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { usePrivacyMode, readPrivacyModeOnce, __resetPrivacyModeCache } from './use-privacy-mode'

/**
 * Tests voor de gedeelde privé-modus-singleton die passieve labels voedt
 * (AiPrivacyIndicator, WhatIfChat's cloud-label). Bewust GEEN ChatPanel-
 * transport-swap-tests hier: die doet een verse fetch per open i.p.v. deze
 * gedeelde singleton (zie het commentaarblok in de bron).
 */

beforeEach(() => {
  __resetPrivacyModeCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readPrivacyModeOnce', () => {
  it('leest privacyMode uit GET /api/privacy-mode', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ privacyMode: true }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    await expect(readPrivacyModeOnce()).resolves.toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith('/api/privacy-mode')
  })

  it('deelt één fetch over meerdere aanroepen (module-singleton)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ privacyMode: false }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    await Promise.all([readPrivacyModeOnce(), readPrivacyModeOnce(), readPrivacyModeOnce()])

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('valt terug op false wanneer de response niet ok is', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }))

    await expect(readPrivacyModeOnce()).resolves.toBe(false)
  })

  it('valt terug op false wanneer de fetch faalt (netwerkfout)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('netwerkfout')))

    await expect(readPrivacyModeOnce()).resolves.toBe(false)
  })

  it('valt terug op false wanneer privacyMode ontbreekt in de response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }))

    await expect(readPrivacyModeOnce()).resolves.toBe(false)
  })

  it('__resetPrivacyModeCache forceert een verse fetch', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ privacyMode: true }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    await readPrivacyModeOnce()
    __resetPrivacyModeCache()
    await readPrivacyModeOnce()

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})

describe('usePrivacyMode', () => {
  it('retourneert null tijdens het laden, daarna de boolean', async () => {
    let resolveJson!: (v: { privacyMode: boolean }) => void
    const jsonPromise = new Promise<{ privacyMode: boolean }>((resolve) => {
      resolveJson = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => jsonPromise }),
    )

    const { result } = renderHook(() => usePrivacyMode())
    expect(result.current).toBeNull()

    resolveJson({ privacyMode: true })
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('geeft false terug wanneer privé-modus uit staat', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ privacyMode: false }) }),
    )

    const { result } = renderHook(() => usePrivacyMode())
    await waitFor(() => expect(result.current).toBe(false))
  })
})
