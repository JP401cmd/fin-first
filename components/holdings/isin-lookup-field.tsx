'use client'

// ISIN-lookup field — shared by both the holdings add-form and edit-form.
//
// Design (per ui-ux skill, krant-esthetiek):
//   - Top of the form, above ticker.
//   - 500ms debounce on input → server-side proxy at
//     /api/integrations/market-data/isin-lookup?isin=...
//   - On hit: subtle green inline confirmation "Gevonden via FMP" + ✓
//   - On miss: neutral italic warning "ISIN niet gevonden — vul handmatig in"
//   - On quota exhausted (429): same italic warning, distinct copy
//   - On 503 (FMP not configured): silent — backend reports via koppelingen
//
// Privacy: the request only includes the ISIN string. The FMP key never
// reaches the browser.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'

const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/
const DEBOUNCE_MS = 500

export interface IsinResolved {
  ticker: string
  name: string
  currency: string
  exchange?: string
}

type LookupState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'hit'; result: IsinResolved; cache: 'hit' | 'miss' }
  | { kind: 'miss' }
  | { kind: 'quota_exhausted'; reason: 'user_quota' | 'fmp_quota' }
  | { kind: 'invalid_format' }

interface IsinLookupFieldProps {
  value: string
  onChange: (next: string) => void
  /**
   * Called with the resolved data when the lookup hits. The caller decides
   * whether to overwrite already-filled ticker/name/currency fields.
   */
  onResolved?: (result: IsinResolved) => void
  /** Optional id for the input — useful for label-for / ARIA. */
  id?: string
}

export function IsinLookupField({ value, onChange, onResolved, id = 'isin' }: IsinLookupFieldProps) {
  const [state, setState] = useState<LookupState>({ kind: 'idle' })
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightController = useRef<AbortController | null>(null)
  const lastResolvedIsinRef = useRef<string | null>(null)

  const resolveIsin = useCallback(async (isin: string) => {
    if (inFlightController.current) inFlightController.current.abort()
    const controller = new AbortController()
    inFlightController.current = controller

    try {
      const res = await fetch(`/api/integrations/market-data/isin-lookup?isin=${encodeURIComponent(isin)}`, {
        signal: controller.signal,
      })
      const cacheHeader = res.headers.get('x-cache')
      const cache: 'hit' | 'miss' = cacheHeader === 'hit' ? 'hit' : 'miss'

      if (res.status === 200) {
        const json = (await res.json()) as IsinResolved
        if (lastResolvedIsinRef.current !== isin) {
          lastResolvedIsinRef.current = isin
          onResolved?.(json)
        }
        setState({ kind: 'hit', result: json, cache })
        return
      }
      if (res.status === 404) {
        setState({ kind: 'miss' })
        return
      }
      if (res.status === 429) {
        const json = (await res.json().catch(() => ({}))) as { reason?: string }
        const reason = json.reason === 'fmp_quota' ? 'fmp_quota' : 'user_quota'
        setState({ kind: 'quota_exhausted', reason })
        return
      }
      // 503 / 502 / other — degrade silently, treat as miss for the UX.
      setState({ kind: 'miss' })
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return
      setState({ kind: 'miss' })
    }
  }, [onResolved])

  // Debounced effect on `value`.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const normalized = value.trim().toUpperCase().replace(/\s+/g, '')
    if (!normalized) {
      lastResolvedIsinRef.current = null
      setState({ kind: 'idle' })
      return
    }
    if (!ISIN_REGEX.test(normalized)) {
      lastResolvedIsinRef.current = null
      setState({ kind: 'invalid_format' })
      return
    }
    if (lastResolvedIsinRef.current === normalized && state.kind === 'hit') {
      return
    }

    setState({ kind: 'checking' })
    debounceRef.current = setTimeout(() => {
      void resolveIsin(normalized)
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, resolveIsin])

  // Cleanup inflight on unmount.
  useEffect(() => {
    return () => {
      if (inFlightController.current) inFlightController.current.abort()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
        ISIN <span className="font-normal text-[var(--ink-3)]">(optioneel — vul ticker automatisch in)</span>
      </label>
      <div className="relative">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          maxLength={12}
          spellCheck={false}
          autoComplete="off"
          inputMode="text"
          aria-describedby={`${id}-status`}
          aria-invalid={state.kind === 'invalid_format' ? true : undefined}
          className="w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 pr-10 font-mono text-sm tracking-[0.04em] tabular-nums uppercase placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-[var(--ink-4)] focus:border-[var(--ink-3)] focus:outline-none"
          placeholder="bv. NL0011794037"
        />
        {state.kind === 'checking' && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[var(--ink-3)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          </span>
        )}
        {state.kind === 'hit' && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-positive">
            <Check className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>

      <div id={`${id}-status`} className="mt-1 min-h-[16px]" aria-live="polite">
        {state.kind === 'checking' && (
          <p className="font-sans text-[11px] text-[var(--ink-3)]">ISIN opzoeken…</p>
        )}
        {state.kind === 'hit' && (
          <p className="flex flex-wrap items-center gap-1.5 font-sans text-[11px] text-[var(--ink-2)]">
            <span className="inline-flex items-center gap-1 border border-[color-mix(in_oklab,var(--positive)_30%,transparent)] bg-[color-mix(in_oklab,var(--positive)_8%,transparent)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-positive">
              <Check className="h-2.5 w-2.5" aria-hidden="true" />
              Gevonden via FMP
            </span>
            <span className="text-[var(--ink-2)]">
              {state.result.name} · <span className="font-mono tabular-nums">{state.result.ticker}</span>
              {state.result.exchange ? ` · ${state.result.exchange}` : ''} · {state.result.currency}
            </span>
            {state.cache === 'hit' && (
              <span className="text-[var(--ink-4)]">(uit cache)</span>
            )}
          </p>
        )}
        {state.kind === 'miss' && (
          <p className="font-serif text-[11px] italic text-[var(--ink-3)]">
            ISIN niet gevonden — vul ticker en naam handmatig in.
          </p>
        )}
        {state.kind === 'quota_exhausted' && (
          <p className="font-serif text-[11px] italic text-[var(--ink-3)]">
            {state.reason === 'fmp_quota'
              ? 'ISIN-resolver vandaag uitgeput — vul handmatig in.'
              : 'Je dagelijks zoekbudget is bereikt — vul handmatig in.'}
          </p>
        )}
        {state.kind === 'invalid_format' && value.trim().length >= 4 && (
          <p className="font-serif text-[11px] italic text-[var(--ink-3)]">
            Een ISIN bestaat uit 12 tekens (bv. NL0011794037).
          </p>
        )}
      </div>
    </div>
  )
}
