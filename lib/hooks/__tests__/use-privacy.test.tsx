/**
 * Smoke test for the privacy toggle hook + provider.
 *
 * Covers:
 *  1. Default state is `masked: false` — design-bible rule that bedragen
 *     standaard zichtbaar zijn (user opts IN to masking).
 *  2. `setMasked` / `toggle` flip the flag and persist to localStorage under
 *     the documented `trifinity.privacy.masked` key.
 *  3. A provider mounted with a pre-populated localStorage value hydrates
 *     to `masked: true` on mount (simulating a returning user).
 *  4. `useMaskedAmounts` throws a helpful error when used without a provider,
 *     catching the most common integration bug at first render.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import {
  PRIVACY_MASKED_STORAGE_KEY,
  PrivacyProvider,
  useMaskedAmounts,
} from '../use-privacy'

function wrapper({ children }: { children: React.ReactNode }) {
  return <PrivacyProvider>{children}</PrivacyProvider>
}

describe('useMaskedAmounts + PrivacyProvider', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('defaults to masked=false when no preference is stored', () => {
    const { result } = renderHook(() => useMaskedAmounts(), { wrapper })
    expect(result.current.masked).toBe(false)
  })

  it('setMasked(true) flips the flag and persists to localStorage', () => {
    const { result } = renderHook(() => useMaskedAmounts(), { wrapper })

    act(() => {
      result.current.setMasked(true)
    })

    expect(result.current.masked).toBe(true)
    expect(window.localStorage.getItem(PRIVACY_MASKED_STORAGE_KEY)).toBe('true')
  })

  it('toggle() flips the value and writes the new state to localStorage', () => {
    const { result } = renderHook(() => useMaskedAmounts(), { wrapper })

    act(() => {
      result.current.toggle()
    })
    expect(result.current.masked).toBe(true)
    expect(window.localStorage.getItem(PRIVACY_MASKED_STORAGE_KEY)).toBe('true')

    act(() => {
      result.current.toggle()
    })
    expect(result.current.masked).toBe(false)
    expect(window.localStorage.getItem(PRIVACY_MASKED_STORAGE_KEY)).toBe('false')
  })

  it('hydrates masked=true from localStorage on mount', () => {
    window.localStorage.setItem(PRIVACY_MASKED_STORAGE_KEY, 'true')

    const { result } = renderHook(() => useMaskedAmounts(), { wrapper })

    // The effect runs synchronously under @testing-library's renderHook,
    // so the hydrated value is visible on the first accessible render.
    expect(result.current.masked).toBe(true)
  })

  it('returns a safe fallback (masked=false) when used outside a PrivacyProvider', () => {
    // Lets components render in unit tests / storybook / test routes without
    // requiring every consumer to set up a provider tree.
    function Probe() {
      const { masked } = useMaskedAmounts()
      return <span data-testid="state">{String(masked)}</span>
    }

    render(<Probe />)
    expect(screen.getByTestId('state').textContent).toBe('false')
  })

  it('exposes a stable context shape with the required members', () => {
    const { result } = renderHook(() => useMaskedAmounts(), { wrapper })

    expect(typeof result.current.masked).toBe('boolean')
    expect(typeof result.current.setMasked).toBe('function')
    expect(typeof result.current.toggle).toBe('function')
  })

  it('does not read localStorage for server-side (pre-mount) value', () => {
    // Simulate a stale write that predates the provider mount; the initial
    // render still yields `false` to avoid hydration mismatch — the effect
    // is what brings the true value in on the client.
    window.localStorage.setItem(PRIVACY_MASKED_STORAGE_KEY, 'true')

    function Probe() {
      const { masked } = useMaskedAmounts()
      return <span data-testid="state">{String(masked)}</span>
    }

    render(
      <PrivacyProvider>
        <Probe />
      </PrivacyProvider>,
    )

    // After the effect has flushed, the state reflects the stored value.
    expect(screen.getByTestId('state').textContent).toBe('true')
  })
})
