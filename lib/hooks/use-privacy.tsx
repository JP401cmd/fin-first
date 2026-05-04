'use client'

/**
 * Privacy toggle — masked amounts across TriFinity.
 *
 * Codifies the "Trust & veiligheid" design-bible rule:
 *   "Saldi op primaire dashboards standaard zichtbaar — gebruiker kiest maskeren, niet andersom."
 *
 * The provider keeps a single boolean flag (`masked`) in React context and
 * persists it under `trifinity.privacy.masked` in `localStorage` so the
 * preference survives reloads on the same device. State is NOT synced to the
 * server: masking is a device-local affordance, not an account setting.
 *
 * SSR-safety: the initial server render always yields `masked = false`. On
 * mount the hook reads `localStorage` inside a `useEffect`, avoiding hydration
 * mismatch while still restoring user preference on the first client paint.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/** Single source of truth for the localStorage key — consumers should NEVER read it directly. */
export const PRIVACY_MASKED_STORAGE_KEY = 'trifinity.privacy.masked'

interface PrivacyContextValue {
  /** True when monetary amounts should render as bullet placeholders. */
  masked: boolean
  /** Programmatic setter — use when a dedicated UI surface drives the flag. */
  setMasked: (next: boolean) => void
  /** Idempotent flipper — used by the header eye-icon toggle. */
  toggle: () => void
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null)

/**
 * Read the persisted preference without throwing on SSR / private-mode
 * browsers that deny localStorage access. Defaults to `false` (visible amounts)
 * per design-bible: bedragen standaard zichtbaar.
 */
function readStoredMasked(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(PRIVACY_MASKED_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * Best-effort persistence — swallow quota / disabled-storage errors so a
 * failing write never breaks the in-memory toggle.
 */
function writeStoredMasked(value: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PRIVACY_MASKED_STORAGE_KEY, value ? 'true' : 'false')
  } catch {
    // ignore — memory state still works for this session
  }
}

export function PrivacyProvider({ children }: { children: ReactNode }) {
  // Always start as `false` so server and client markup agree on first render.
  // The useEffect below hydrates the persisted value on the client only.
  const [masked, setMaskedState] = useState(false)

  useEffect(() => {
    const stored = readStoredMasked()
    if (stored) setMaskedState(true)
  }, [])

  const setMasked = useCallback((next: boolean) => {
    setMaskedState(next)
    writeStoredMasked(next)
  }, [])

  const toggle = useCallback(() => {
    setMaskedState(prev => {
      const next = !prev
      writeStoredMasked(next)
      return next
    })
  }, [])

  // Memoise so children don't re-render on every parent update.
  const value = useMemo<PrivacyContextValue>(
    () => ({ masked, setMasked, toggle }),
    [masked, setMasked, toggle],
  )

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>
}

// Fallback context used when the hook is called outside a provider — keeps
// unit tests, storybook stories, and dev sandboxes working without forcing
// every render tree to wrap in a provider. The toggle is a no-op there since
// there's no UI driving it anyway. The real provider is mounted at the
// authenticated app-layout so all real routes get the live, persisted state.
const FALLBACK_CONTEXT: PrivacyContextValue = {
  masked: false,
  setMasked: () => {},
  toggle: () => {},
}

/**
 * Access the current masking state. Returns a safe fallback (masked=false,
 * no-op setters) when called outside a PrivacyProvider so currency-rendering
 * components work in isolation.
 */
export function useMaskedAmounts(): PrivacyContextValue {
  return useContext(PrivacyContext) ?? FALLBACK_CONTEXT
}
