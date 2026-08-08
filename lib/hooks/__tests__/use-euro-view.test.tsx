/**
 * Tests voor de euro-weergave-hook + provider (use-euro-view).
 *
 * Covers:
 *  1. Seed uit de server-prop `initialView` (geen always-default → geen flash).
 *  2. Optimistisch zetten: state flipt direct, PUT naar /api/euro-view met
 *     body { view }.
 *  3. Rollback bij een niet-ok PUT-response en bij een netwerk-reject.
 *  4. toggle() flipt heen en weer.
 *  5. Dezelfde waarde nogmaals zetten doet geen PUT.
 *  6. Veilige fallback buiten een provider: 'nominal' + no-op setters.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { EuroViewProvider, useEuroView, type EuroView } from '../use-euro-view'

function makeWrapper(initialView: EuroView) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <EuroViewProvider initialView={initialView}>{children}</EuroViewProvider>
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

describe('useEuroView + EuroViewProvider', () => {
  it("seedt uit de server-prop initialView (geen always-default)", () => {
    const { result } = renderHook(() => useEuroView(), { wrapper: makeWrapper('real') })
    expect(result.current.view).toBe('real')
  })

  it('setView zet optimistisch en schrijft één PUT naar /api/euro-view met { view }', async () => {
    const { result } = renderHook(() => useEuroView(), { wrapper: makeWrapper('nominal') })

    act(() => {
      result.current.setView('real')
    })

    // Optimistisch: meteen gezet, vóór de PUT-afhandeling.
    expect(result.current.view).toBe('real')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/euro-view')
    expect(opts.method).toBe('PUT')
    expect(JSON.parse(opts.body)).toEqual({ view: 'real' })
  })

  it('toggle() flipt optimistisch en schrijft een PUT naar /api/euro-view', async () => {
    const { result } = renderHook(() => useEuroView(), { wrapper: makeWrapper('nominal') })

    act(() => {
      result.current.toggle()
    })

    expect(result.current.view).toBe('real')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/euro-view')
    expect(opts.method).toBe('PUT')
    expect(JSON.parse(opts.body)).toEqual({ view: 'real' })
  })

  it('toggle() flipt heen en weer', async () => {
    const { result } = renderHook(() => useEuroView(), { wrapper: makeWrapper('nominal') })

    act(() => {
      result.current.toggle()
    })
    expect(result.current.view).toBe('real')

    act(() => {
      result.current.toggle()
    })
    expect(result.current.view).toBe('nominal')

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rolt terug naar de vorige weergave bij een niet-ok PUT-response', async () => {
    fetchMock.mockResolvedValue({ ok: false })
    const { result } = renderHook(() => useEuroView(), { wrapper: makeWrapper('nominal') })

    act(() => {
      result.current.setView('real')
    })
    // Optimistisch geflipt...
    expect(result.current.view).toBe('real')
    // ...maar na de gefaalde PUT terug naar 'nominal'.
    await waitFor(() => expect(result.current.view).toBe('nominal'))
  })

  it('rolt terug bij een netwerkfout (rejected fetch)', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useEuroView(), { wrapper: makeWrapper('real') })

    act(() => {
      result.current.setView('nominal')
    })
    expect(result.current.view).toBe('nominal')
    await waitFor(() => expect(result.current.view).toBe('real'))
  })

  it('setView naar dezelfde waarde is een no-op (geen PUT)', () => {
    const { result } = renderHook(() => useEuroView(), { wrapper: makeWrapper('nominal') })
    act(() => {
      result.current.setView('nominal')
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('valt buiten een provider veilig terug op nominal + no-op setters', () => {
    function Probe() {
      const { view, toggle } = useEuroView()
      // toggle mag niet gooien buiten de provider
      return (
        <button data-testid="state" onClick={toggle}>
          {view}
        </button>
      )
    }
    render(<Probe />)
    expect(screen.getByTestId('state').textContent).toBe('nominal')
    act(() => {
      screen.getByTestId('state').click()
    })
    expect(screen.getByTestId('state').textContent).toBe('nominal')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
