'use client'

/**
 * CrossCheckPanel — dev-only check die een sub-pagina-sim vergelijkt met
 * `computeHybridProjection` uit /overzicht.
 *
 * Werking: op /opbouw, /afbouw en /gebeurtenissen draait elke sub-pagina
 * zijn eigen sim via `useDoorrekeningSim`. Dit paneel draait parallel de
 * nieuwe hybrid-projection en laat zien waar de twee uit elkaar lopen —
 * fireAge, eindvermogen, en optioneel per-jaar delta's.
 *
 * Activering: dev-build OF `?check=1` in de URL. In productie is het panel
 * onzichtbaar.
 *
 * Bedoeld om te voorkomen dat de sub-pagina's stilzwijgend divergeren van
 * de hybride view na toekomstige wijzigingen.
 */

import { useEffect, useMemo, useState } from 'react'
import { formatCurrency } from '@/lib/format'
import {
  computeHybridProjection,
  type HybridProjectionInputs,
} from '@/app/(app)/horizon/doorrekening-test/calc/hybrid-projection'

export interface CrossCheckPanelProps {
  pageName: 'opbouw' | 'afbouw' | 'gebeurtenissen'
  hybridInputs: HybridProjectionInputs
  /** FireAge uit de lokale sim (null als geen kruising). */
  localFireAge: number | null
  /** Eindvermogen uit de lokale sim op de laatste rij. */
  localEndPortfolio: number | null
}

export function CrossCheckPanel({
  pageName,
  hybridInputs,
  localFireAge,
  localEndPortfolio,
}: CrossCheckPanelProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const isDev = process.env.NODE_ENV === 'development'
    const hasQuery =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('check') === '1'
    setVisible(isDev || hasQuery)
  }, [])

  const hybrid = useMemo(
    () => (visible ? computeHybridProjection(hybridInputs) : null),
    [visible, hybridInputs],
  )

  if (!visible || !hybrid) return null

  const hybridFireAge = hybrid.fireAgeFractional ?? hybrid.fireAge ?? null
  const hybridEnd = hybrid.rows.at(-1)?.netWorth ?? null

  const fireAgeDelta =
    localFireAge != null && hybridFireAge != null ? hybridFireAge - localFireAge : null
  const endDelta =
    localEndPortfolio != null && hybridEnd != null ? hybridEnd - localEndPortfolio : null
  const endRelPct =
    localEndPortfolio != null && localEndPortfolio !== 0 && endDelta != null
      ? (endDelta / Math.abs(localEndPortfolio)) * 100
      : null

  const fireAgeDivergent = fireAgeDelta != null && Math.abs(fireAgeDelta) > 0.5
  const endDivergent = endRelPct != null && Math.abs(endRelPct) > 5

  return (
    <div
      className="mt-6 rounded-xl border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/40 p-4"
      data-testid="cross-check-panel"
      aria-live="polite"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Cross-check met /overzicht (dev)
        </span>
        <span className="text-[10px] text-[var(--ink-4)]">
          Pagina: {pageName} · Activeer via ?check=1
        </span>
      </div>

      <dl className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-3">
        <div>
          <dt className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">FireAge</dt>
          <dd className="mt-0.5 font-mono tabular-nums text-xs text-[var(--ink-2)]">
            <div>
              lokaal: {localFireAge != null ? `${localFireAge.toFixed(2)}j` : '—'}
            </div>
            <div>
              hybride: {hybridFireAge != null ? `${hybridFireAge.toFixed(2)}j` : '—'}
            </div>
            <div
              className={fireAgeDivergent ? 'text-negative' : 'text-[var(--ink-3)]'}
              data-testid="cross-check-fire-delta"
            >
              Δ{' '}
              {fireAgeDelta != null
                ? `${fireAgeDelta >= 0 ? '+' : ''}${fireAgeDelta.toFixed(2)}j`
                : '—'}
              {fireAgeDivergent && ' ⚠'}
            </div>
          </dd>
        </div>

        <div>
          <dt className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
            Eindvermogen
          </dt>
          <dd className="mt-0.5 font-mono tabular-nums text-xs text-[var(--ink-2)]">
            <div>
              lokaal:{' '}
              {localEndPortfolio != null ? formatCurrency(Math.round(localEndPortfolio)) : '—'}
            </div>
            <div>
              hybride: {hybridEnd != null ? formatCurrency(Math.round(hybridEnd)) : '—'}
            </div>
            <div
              className={endDivergent ? 'text-negative' : 'text-[var(--ink-3)]'}
              data-testid="cross-check-end-delta"
            >
              Δ{' '}
              {endDelta != null ? formatCurrency(Math.round(endDelta)) : '—'}
              {endRelPct != null && ` (${endRelPct.toFixed(1)}%)`}
              {endDivergent && ' ⚠'}
            </div>
          </dd>
        </div>

        <div>
          <dt className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">Status</dt>
          <dd className="mt-0.5 text-xs">
            {fireAgeDivergent || endDivergent ? (
              <span className="text-negative">
                Divergentie: {pageName} loopt uit lijn met /overzicht
              </span>
            ) : (
              <span className="text-emerald-600">Matcht /overzicht binnen tolerantie</span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  )
}
