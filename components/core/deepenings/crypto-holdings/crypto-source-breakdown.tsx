'use client'

// crypto-source-breakdown.tsx — verticaal staaf-overzicht per bron
// (exchange / wallet / handmatig). Geëxtraheerd uit de oorspronkelijke
// `crypto-holdings-tab` zodat de Holdings-app er ook gebruik van kan maken
// zonder de full-tab in te slepen.
//
// Klikbaar (optioneel via `onSelect`): de host-pagina kan dit gebruiken om
// de holdings-grid te filteren op bron. We tonen geen filter-state hier —
// dat is verantwoordelijkheid van de host (decoupling).

import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import type { CryptoHoldingRow } from '@/lib/crypto-holdings-data'

interface CryptoSourceBreakdownProps {
  holdings: CryptoHoldingRow[]
  totalValue: number
  /** Actieve bron-filter (label-string). NULL = geen filter. */
  activeLabel?: string | null
  /**
   * Klik-handler: ontvangt het label of NULL als het al actief was (toggle).
   * Zonder handler is de breakdown puur informatief.
   */
  onSelect?: (label: string | null) => void
}

export function CryptoSourceBreakdown({
  holdings,
  totalValue,
  activeLabel,
  onSelect,
}: CryptoSourceBreakdownProps) {
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)
  const sources = aggregateSources(holdings)
  if (sources.length <= 1) return null

  return (
    <section className="space-y-2">
      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
        Verdeling per bron
      </p>
      <div className="space-y-1.5">
        {sources.map((s) => {
          const pct = totalValue > 0 ? (s.value / totalValue) * 100 : 0
          const isActive = activeLabel === s.label
          const Wrapper: React.ElementType = onSelect ? 'button' : 'div'
          return (
            <Wrapper
              key={s.label}
              type={onSelect ? 'button' : undefined}
              onClick={
                onSelect ? () => onSelect(isActive ? null : s.label) : undefined
              }
              aria-pressed={onSelect ? isActive : undefined}
              className={`block w-full text-left ${
                onSelect ? 'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]' : ''
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p
                  className={`truncate text-[11px] ${
                    isActive ? 'font-semibold text-kern-700' : 'text-[var(--ink-2)]'
                  }`}
                >
                  {s.label}
                </p>
                <p className="font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
                  {fc(s.value)}
                  <span className="ml-2 text-[var(--ink-4)]">{pct.toFixed(0)}%</span>
                </p>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden bg-[var(--subtle)]">
                <div
                  className={isActive ? 'h-full bg-kern-700' : 'h-full bg-kern-500'}
                  style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                />
              </div>
            </Wrapper>
          )
        })}
      </div>
    </section>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

interface SourceAggregate {
  label: string
  value: number
}

/**
 * Groepeer holdings per bron-label en sorteer op waarde-aflopend. Het label
 * volgt het bestaande contract uit `crypto-holdings-tab` zodat externe
 * filters (bv. `holding.source.exchangeLabel`) blijven matchen.
 */
function aggregateSources(holdings: CryptoHoldingRow[]): SourceAggregate[] {
  const map = new Map<string, number>()
  for (const h of holdings) {
    const label = labelForSource(h)
    map.set(label, (map.get(label) ?? 0) + h.valueEur)
  }
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
}

/**
 * Eenduidige label-resolver — wordt gebruikt door zowel de breakdown als de
 * host-filter zodat strings altijd matchen. Public-export zodat de
 * holdings-grid (die filtert op label) niet hoeft te dupliceren.
 */
export function labelForSource(holding: CryptoHoldingRow): string {
  const s = holding.source
  if (s.kind === 'exchange') return s.exchangeLabel
  if (s.kind === 'wallet') return `${s.walletChain} · ${s.walletAddressMask}`
  return 'Handmatig'
}
