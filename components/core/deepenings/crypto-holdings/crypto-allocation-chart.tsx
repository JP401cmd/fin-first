'use client'

// crypto-allocation-chart.tsx — donut + legend voor de portfolio-verdeling
// over crypto-categorieën (Bitcoin, Ethereum, Stablecoins, Layer-1, …) of
// optioneel over chains (Bitcoin-mainnet, Ethereum, Solana, …).
//
// Ontwerp-keuzes:
//   - Eén SVG-donut, geen Recharts/Visx — krant-esthetiek + bestaande
//     `portfolio-allocation-chart` als voorbeeld. Stagger-animatie via
//     `useInViewAnimation`: dasharray groeit van 0 naar de doel-arc-lengte
//     met 60ms per slice.
//   - Toggle "Categorie / Chain" alleen tonen als er ≥2 chains in de data
//     zitten — anders is de toggle ruis.
//   - Legend onder de donut, bedragen rechts uitgelijnd in DM Mono. Hover op
//     een legend-rij accentueert die slice (visueel via opacity op andere
//     slices).

import { useMemo, useState } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import type { CryptoHoldingRow } from '@/lib/crypto-holdings-data'
import {
  CRYPTO_CATEGORY_COLORS,
  CRYPTO_CATEGORY_ORDER,
  type CryptoCategory,
  getCryptoCategory,
} from './crypto-category-mapping'

type AllocationMode = 'category' | 'chain'

interface CryptoAllocationChartProps {
  holdings: CryptoHoldingRow[]
  totalValue: number
}

interface Slice {
  key: string
  label: string
  valueEur: number
  pct: number
  color: string
}

// ── Chain palette ────────────────────────────────────────────────────────
//
// Beperkt palette voor chain-mode. Onbekende chains vallen op grijs.
// Volgorde stuurt de stack-volgorde in de donut.
const CHAIN_COLORS: Record<string, string> = {
  bitcoin: 'oklch(0.68 0.16 55)',
  ethereum: 'oklch(0.55 0.13 270)',
  solana: 'oklch(0.62 0.13 145)',
  polygon: 'oklch(0.55 0.12 295)',
  arbitrum: 'oklch(0.58 0.10 240)',
  base: 'oklch(0.58 0.10 220)',
}

function chainLabel(chain: string): string {
  return chain.charAt(0).toUpperCase() + chain.slice(1)
}

function colorForChain(chain: string): string {
  return CHAIN_COLORS[chain.toLowerCase()] ?? 'oklch(0.55 0.02 95)'
}

export function CryptoAllocationChart({ holdings, totalValue }: CryptoAllocationChartProps) {
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)
  // Chain-toggle alleen aanbieden als de data het rechtvaardigt — anders is
  // het een lege keuze en breekt het rasterritme van de strip eronder.
  const chainsAvailable = useMemo(() => {
    const set = new Set<string>()
    for (const h of holdings) {
      if (h.chain) set.add(h.chain.toLowerCase())
    }
    return set.size >= 2
  }, [holdings])

  const [mode, setMode] = useState<AllocationMode>('category')
  const effectiveMode: AllocationMode = chainsAvailable ? mode : 'category'

  const slices = useMemo(() => {
    if (effectiveMode === 'category') {
      const buckets = new Map<CryptoCategory, number>()
      for (const h of holdings) {
        if (h.valueEur <= 0) continue
        const cat = getCryptoCategory({ symbol: h.symbol, isFiatBalance: h.isFiatBalance })
        buckets.set(cat, (buckets.get(cat) ?? 0) + h.valueEur)
      }
      const ordered: Slice[] = []
      for (const cat of CRYPTO_CATEGORY_ORDER) {
        const v = buckets.get(cat)
        if (v == null || v <= 0) continue
        ordered.push({
          key: cat,
          label: cat,
          valueEur: v,
          pct: totalValue > 0 ? (v / totalValue) * 100 : 0,
          color: CRYPTO_CATEGORY_COLORS[cat],
        })
      }
      return ordered
    }
    // Chain-modus
    const buckets = new Map<string, number>()
    for (const h of holdings) {
      if (h.valueEur <= 0) continue
      const chain = h.chain?.toLowerCase() || (h.isFiatBalance ? 'cash' : 'overig')
      buckets.set(chain, (buckets.get(chain) ?? 0) + h.valueEur)
    }
    return Array.from(buckets.entries())
      .map<Slice>(([chain, v]) => ({
        key: chain,
        label: chain === 'cash' ? 'Cash' : chain === 'overig' ? 'Overig' : chainLabel(chain),
        valueEur: v,
        pct: totalValue > 0 ? (v / totalValue) * 100 : 0,
        color: colorForChain(chain),
      }))
      .sort((a, b) => b.valueEur - a.valueEur)
  }, [holdings, effectiveMode, totalValue])

  const [hoverKey, setHoverKey] = useState<string | null>(null)

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
          Verdeling
        </p>
        {chainsAvailable && (
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.08em]">
            <ToggleButton active={mode === 'category'} onClick={() => setMode('category')}>
              Categorie
            </ToggleButton>
            <ToggleButton active={mode === 'chain'} onClick={() => setMode('chain')}>
              Chain
            </ToggleButton>
          </div>
        )}
      </div>

      {slices.length === 0 ? (
        <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-4 py-6 text-center">
          <p className="font-serif italic text-sm text-[var(--ink-2)]">
            Nog geen waarde-data om te verdelen.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-[180px_1fr]">
          <AllocationDonut
            slices={slices}
            total={totalValue}
            hoverKey={hoverKey}
          />
          <ul className="space-y-1.5">
            {slices.map((s) => (
              <li
                key={s.key}
                onMouseEnter={() => setHoverKey(s.key)}
                onMouseLeave={() => setHoverKey(null)}
                className="grid grid-cols-[12px_1fr_auto_auto] items-baseline gap-2 text-[12px]"
              >
                <span
                  className="h-2 w-2 self-center"
                  style={{ background: s.color }}
                  aria-hidden="true"
                />
                <span className="truncate text-[var(--ink-2)]">{s.label}</span>
                <span className="font-mono tabular-nums text-[var(--ink-3)]">
                  {fc(s.valueEur)}
                </span>
                <span className="font-mono tabular-nums text-[var(--ink-4)] w-12 text-right">
                  {s.pct.toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// ── Donut ────────────────────────────────────────────────────────────────

interface DonutProps {
  slices: Slice[]
  total: number
  hoverKey: string | null
}

function AllocationDonut({ slices, total, hoverKey }: DonutProps) {
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)
  const { ref, hasEntered } = useInViewAnimation({ duration: 600 })
  const size = 180
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.36
  const strokeWidth = size * 0.16
  const circumference = 2 * Math.PI * r
  // Pre-compute cumulatieve offsets om reassignment-tijdens-render te
  // vermijden — de lint-regel `react-hooks/immutability` blokkeert
  // `offset += dash` in een map-callback. Eenmalige reduce vóór de render is
  // semantisch identiek (geen state-mutatie tijdens render).
  const offsets: number[] = []
  let cumulative = 0
  for (const s of slices) {
    offsets.push(cumulative)
    cumulative += (s.pct / 100) * circumference
  }
  return (
    <div ref={ref} className="relative mx-auto w-[180px]">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Donut-grafiek met ${slices.length} categorieën`}
      >
        {slices.length === 0 && (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border-ed)" strokeWidth={strokeWidth} />
        )}
        {slices.map((s, idx) => {
          const dash = (s.pct / 100) * circumference
          const gap = circumference - dash
          const currentOffset = offsets[idx]
          const animDelay = idx * 60
          const dimmed = hoverKey != null && hoverKey !== s.key
          return (
            <circle
              key={s.key}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={strokeWidth}
              strokeDasharray={hasEntered ? `${dash} ${gap}` : `0 ${circumference}`}
              strokeDashoffset={-currentOffset}
              transform={`rotate(-90 ${cx} ${cy})`}
              opacity={dimmed ? 0.25 : 1}
              style={{
                transition: hasEntered
                  ? `stroke-dasharray 500ms cubic-bezier(.22,1,.36,1) ${animDelay}ms, opacity 150ms ease-out`
                  : 'none',
              }}
            />
          )
        })}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fill="var(--ink)"
          style={{ fontFamily: 'var(--font-mono, monospace)' }}
        >
          {fc(total)}
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          fontSize="9"
          fill="var(--ink-4)"
          style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}
        >
          Totaal
        </text>
      </svg>
    </div>
  )
}

// ── Toggle button ────────────────────────────────────────────────────────

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-7 items-center px-2 transition-colors ${
        active ? 'bg-kern-100 text-kern-800' : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
      }`}
    >
      {children}
    </button>
  )
}
