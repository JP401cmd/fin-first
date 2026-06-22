/**
 * Tests voor de weergavemodus-hook + provider (use-display-mode).
 *
 * Covers:
 *  1. Seed uit de server-prop `initialMode` (geen always-default → geen flash).
 *  2. `toggle()` / `setMode()` flippen optimistisch en schrijven één PUT.
 *  3. Rollback: bij een niet-ok PUT-response rolt de modus terug naar de vorige.
 *  4. Veilige fallback buiten een provider: 'simple' + no-op setters.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { DisplayModeProvider, useDisplayMode, type DisplayMode } from '../use-display-mode'

function makeWrapper(initialMode: DisplayMode) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <DisplayModeProvider initialMode={initialMode}>{children}</DisplayModeProvider>
  }
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useDisplayMode + DisplayModeProvider', () => {
  it('seedt uit de server-prop initialMode (geen always-default)', () => {
    const { result } = renderHook(() => useDisplayMode(), { wrapper: makeWrapper('full') })
    expect(result.current.mode).toBe('full')
  })

  it('toggle() flipt optimistisch en schrijft één PUT naar /api/display-mode', async () => {
    const { result } = renderHook(() => useDisplayMode(), { wrapper: makeWrapper('simple') })

    act(() => {
      result.current.toggle()
    })

    // Optimistisch: meteen geflipt, vóór de PUT-afhandeling.
    expect(result.current.mode).toBe('full')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/display-mode')
    expect(opts.method).toBe('PUT')
    expect(JSON.parse(opts.body)).toEqual({ mode: 'full' })
  })

  it('rolt terug naar de vorige modus bij een niet-ok PUT-response', async () => {
    fetchMock.mockResolvedValue({ ok: false })
    const { result } = renderHook(() => useDisplayMode(), { wrapper: makeWrapper('simple') })

    act(() => {
      result.current.setMode('full')
    })
    // Optimistisch geflipt...
    expect(result.current.mode).toBe('full')
    // ...maar na de gefaalde PUT terug naar 'simple'.
    await waitFor(() => expect(result.current.mode).toBe('simple'))
  })

  it('rolt terug bij een netwerkfout (rejected fetch)', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useDisplayMode(), { wrapper: makeWrapper('full') })

    act(() => {
      result.current.setMode('simple')
    })
    expect(result.current.mode).toBe('simple')
    await waitFor(() => expect(result.current.mode).toBe('full'))
  })

  it('setMode naar dezelfde waarde is een no-op (geen PUT)', () => {
    const { result } = renderHook(() => useDisplayMode(), { wrapper: makeWrapper('simple') })
    act(() => {
      result.current.setMode('simple')
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('valt buiten een provider veilig terug op simple + no-op', () => {
    function Probe() {
      const { mode, toggle } = useDisplayMode()
      // toggle mag niet gooien buiten de provider
      return (
        <button data-testid="state" onClick={toggle}>
          {mode}
        </button>
      )
    }
    render(<Probe />)
    expect(screen.getByTestId('state').textContent).toBe('simple')
    act(() => {
      screen.getByTestId('state').click()
    })
    expect(screen.getByTestId('state').textContent).toBe('simple')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
