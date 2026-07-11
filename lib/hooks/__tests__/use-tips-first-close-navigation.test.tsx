/**
 * Unit-test voor de eenmalige-navigatie-hook na het EERSTE sluiten van de
 * tips-overlay op /toekomst (Notion-kaart "Onboarding – Navigeer na eerste
 * sluiten tipspagina automatisch naar overzicht").
 *
 * Dekt het testplan van de kaart:
 *   1. Eerste sluiting (marker afwezig) → navigeert naar /overzicht + POST marker.
 *   2. Tweede aanroep binnen dezelfde sessie → géén tweede navigatie/POST.
 *   3. Marker al aanwezig (cross-device, andere apparaten) → navigeert nooit.
 *
 * De echte exit-melding-afhandelaars in horizon-client.tsx roepen exact deze
 * functie aan; het OPENEN van de overlay (onViewChart / persistOverlayVisible
 * (true)) roept 'm bewust niet aan — dat is buiten deze hook geborgd.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTipsFirstCloseNavigation } from '../use-tips-first-close-navigation'
import { HORIZON_TIPS_FIRST_CLOSE_NAVIGATED_SLUG } from '@/lib/horizon-data-loader'

// useRouter mocken: één stabiele push-spy die we per test inspecteren.
const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

describe('useTipsFirstCloseNavigation', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    push.mockClear()
    fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('navigeert de eerste keer naar /overzicht en POST de marker', () => {
    const { result } = renderHook(() => useTipsFirstCloseNavigation(false))

    act(() => {
      result.current()
    })

    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/overzicht')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/feature-visits')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({
      feature_slug: HORIZON_TIPS_FIRST_CLOSE_NAVIGATED_SLUG,
    })
  })

  it('navigeert een tweede keer binnen dezelfde sessie niet opnieuw', () => {
    const { result } = renderHook(() => useTipsFirstCloseNavigation(false))

    act(() => {
      result.current()
    })
    act(() => {
      result.current()
    })

    expect(push).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('navigeert nooit wanneer de marker al bestaat (cross-device)', () => {
    const { result } = renderHook(() => useTipsFirstCloseNavigation(true))

    act(() => {
      result.current()
    })

    expect(push).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
