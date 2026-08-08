/**
 * Tests voor de weergavenaam-hook + provider (use-spend-limit-alias).
 *
 * Covers:
 *  1. Seed uit de server-prop `initialAlias` (geen always-default → geen flash).
 *  2. Optimistisch zetten: state flipt direct, PUT naar /api/spend-limit-alias
 *     met body { alias }.
 *  3. Rollback bij een niet-ok PUT-response en bij een netwerk-reject (AC-B5-07).
 *  4. Dezelfde waarde nogmaals zetten doet geen PUT.
 *  5. `useSpendLimitCopy()` levert de teksten van de actieve alias en beweegt
 *     direct mee met een wissel (AC-B5-01/08: geen herladen nodig).
 *  6. Veilige fallback buiten een provider: default-alias + no-op setter.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import {
  SpendLimitAliasProvider,
  useSpendLimitAlias,
  useSpendLimitCopy,
  type SpendLimitAlias,
} from '../use-spend-limit-alias'
import { spendLimitCopy } from '@/lib/spend-limits/copy'

function makeWrapper(initialAlias: SpendLimitAlias) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <SpendLimitAliasProvider initialAlias={initialAlias}>{children}</SpendLimitAliasProvider>
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

describe('useSpendLimitAlias + SpendLimitAliasProvider', () => {
  it('seedt uit de server-prop initialAlias (geen always-default)', () => {
    const { result } = renderHook(() => useSpendLimitAlias(), {
      wrapper: makeWrapper('schaamtepot'),
    })
    expect(result.current.alias).toBe('schaamtepot')
  })

  it('setAlias zet optimistisch en schrijft één PUT met { alias }', () => {
    const { result } = renderHook(() => useSpendLimitAlias(), {
      wrapper: makeWrapper('grenzenpot'),
    })

    act(() => {
      result.current.setAlias('schaamtepot')
    })

    // Optimistisch: meteen gezet, vóór de PUT-afhandeling.
    expect(result.current.alias).toBe('schaamtepot')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/spend-limit-alias')
    expect(opts.method).toBe('PUT')
    expect(JSON.parse(opts.body)).toEqual({ alias: 'schaamtepot' })
  })

  it('rolt terug naar de vorige naam bij een niet-ok PUT-response', async () => {
    fetchMock.mockResolvedValue({ ok: false })
    const { result } = renderHook(() => useSpendLimitAlias(), {
      wrapper: makeWrapper('grenzenpot'),
    })

    act(() => {
      result.current.setAlias('schaamtepot')
    })
    expect(result.current.alias).toBe('schaamtepot')
    await waitFor(() => expect(result.current.alias).toBe('grenzenpot'))
  })

  it('rolt terug bij een netwerkfout (rejected fetch)', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useSpendLimitAlias(), {
      wrapper: makeWrapper('schaamtepot'),
    })

    act(() => {
      result.current.setAlias('grenzenpot')
    })
    expect(result.current.alias).toBe('grenzenpot')
    await waitFor(() => expect(result.current.alias).toBe('schaamtepot'))
  })

  it('setAlias naar dezelfde waarde is een no-op (geen PUT)', () => {
    const { result } = renderHook(() => useSpendLimitAlias(), {
      wrapper: makeWrapper('grenzenpot'),
    })
    act(() => {
      result.current.setAlias('grenzenpot')
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('useSpendLimitCopy', () => {
  it('levert de teksten van de actieve alias en flipt zonder herladen', () => {
    const { result } = renderHook(
      () => ({ copy: useSpendLimitCopy(), ctrl: useSpendLimitAlias() }),
      { wrapper: makeWrapper('grenzenpot') },
    )

    expect(result.current.copy).toEqual(spendLimitCopy('grenzenpot'))

    act(() => {
      result.current.ctrl.setAlias('schaamtepot')
    })

    expect(result.current.copy).toEqual(spendLimitCopy('schaamtepot'))
  })

  it('valt buiten een provider veilig terug op de default + no-op setter', () => {
    function Probe() {
      const { alias, setAlias } = useSpendLimitAlias()
      return (
        <button data-testid="state" onClick={() => setAlias('schaamtepot')}>
          {alias}
        </button>
      )
    }
    render(<Probe />)
    expect(screen.getByTestId('state').textContent).toBe('grenzenpot')
    act(() => {
      screen.getByTestId('state').click()
    })
    expect(screen.getByTestId('state').textContent).toBe('grenzenpot')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
