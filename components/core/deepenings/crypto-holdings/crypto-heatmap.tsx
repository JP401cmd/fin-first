'use client'

// crypto-heatmap.tsx — treemap-overzicht van de crypto-portfolio.
// Oppervlakte per blok = EUR-waarde, kleur = 24u-rendement (groen ↑ / rood ↓).
//
// Algoritme: squarified treemap (Bruls/Huijing/Van Wijk, 1999) — zelf
// geïmplementeerd in TypeScript zodat we geen Recharts/d3 hoeven te
// importeren. Past bij de bestaande no-chart-library policy van de app.
// Performance: 23 holdings → ~50 vergelijkingen, ruim binnen één frame.
//
// Krant-esthetiek:
//   - Scherpe hoeken (geen rounded), 1px ink-borders tussen blokjes
//   - Symbol in DM Mono uppercase, units in tabular-nums
//   - Hover: tooltip met details + bron-badge, blok schaalt niet (zou ritme breken)
//   - Klik → navigeer naar `/core/assets/crypto/[holdingId]`
//   - Fiat-cash krijgt een neutrale grijze tint (geen 24u-rendement)
//   - Onbekende prijs → grijs blok met "—" + tooltip uitleg

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import type {
  CryptoHoldingRow,
  CryptoHoldingPeriodReturn,
} from '@/lib/crypto-holdings-data'

interface CryptoHeatmapProps {
  holdings: CryptoHoldingRow[]
  /**
   * Per-holding 24u-rendement uit `loadCryptoPeriodReturns`. Optional —
   * zonder data tonen we alle blokjes neutraal-grijs zodat de oppervlakte-
   * verdeling alsnog informatief is.
   */
  perHoldingChange24h?: CryptoHoldingPeriodReturn[]
}

interface Tile {
  id: string
  symbol: string
  name: string
  units: number
  valueEur: number
  changePct: number | null
  isFiat: boolean
  hasPrice: boolean
}

interface LaidOutTile extends Tile {
  x: number
  y: number
  w: number
  h: number
}

const HEATMAP_HEIGHT = 320
const MIN_VALUE_EUR = 0.5 // Onder deze drempel laten we coins weg — anders smearen ze de canvas vol met onleesbare slivers

// Vaste SVG-viewbox; we laten de browser het schalen via preserveAspectRatio.
// Dit houdt het squarify-algoritme in pixel-coördinaten zonder ResizeObserver.
const VIEW_W = 1000
const VIEW_H = HEATMAP_HEIGHT

export function CryptoHeatmap({ holdings, perHoldingChange24h }: CryptoHeatmapProps) {
  const router = useRouter()
  const { ref, hasEntered } = useInViewAnimation({ duration: 600 })
  const [hoverId, setHoverId] = useState<string | null>(null)

  const tiles = useMemo<Tile[]>(() => {
    const changeById = new Map<string, number | null>()
    if (perHoldingChange24h) {
      for (const r of perHoldingChange24h) changeById.set(r.holdingId, r.changePct)
    }
    const list: Tile[] = []
    for (const h of holdings) {
      if (h.valueEur < MIN_VALUE_EUR) continue
      list.push({
        id: h.id,
        symbol: h.symbol,
        name: h.name?.trim() || h.symbol,
        units: h.units,
        valueEur: h.valueEur,
        changePct: h.isFiatBalance ? null : changeById.get(h.id) ?? null,
        isFiat: h.isFiatBalance,
        hasPrice: h.currentPrice != null,
      })
    }
    list.sort((a, b) => b.valueEur - a.valueEur)
    return list
  }, [holdings, perHoldingChange24h])

  const layout = useMemo(() => {
    if (tiles.length === 0) return [] as LaidOutTile[]
    return squarify(tiles, 0, 0, VIEW_W, VIEW_H)
  }, [tiles])

  if (tiles.length === 0) {
    return (
      <section className="space-y-3">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
          Heatmap · waarde × 24u
        </p>
        <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-4 py-8 text-center">
          <p className="font-serif italic text-sm text-[var(--ink-2)]">
            Nog geen waarde om in een heatmap te tonen.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
          Heatmap · oppervlakte = waarde, kleur = 24u
        </p>
        <p className="font-mono text-[11px] text-[var(--ink-4)]">
          {tiles.length} {tiles.length === 1 ? 'positie' : 'posities'}
        </p>
      </div>

      <div ref={ref} className="relative">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Heatmap van ${tiles.length} crypto-posities`}
          className="w-full"
          style={{ height: HEATMAP_HEIGHT, display: 'block' }}
        >
          {layout.map((tile, idx) => {
            const fill = tileFill(tile)
            const dimmed = hoverId != null && hoverId !== tile.id
            const animDelay = Math.min(idx * 30, 600)
            return (
              <g
                key={tile.id}
                onMouseEnter={() => setHoverId(tile.id)}
                onMouseLeave={() => setHoverId(null)}
                onClick={() => router.push(`/core/assets/crypto/${tile.id}`)}
                style={{
                  cursor: 'pointer',
                  opacity: hasEntered ? (dimmed ? 0.45 : 1) : 0,
                  transform: hasEntered ? 'scale(1)' : 'scale(0.96)',
                  transformOrigin: `${tile.x + tile.w / 2}px ${tile.y + tile.h / 2}px`,
                  transition: hasEntered
                    ? `opacity 320ms cubic-bezier(.22,1,.36,1) ${animDelay}ms, transform 320ms cubic-bezier(.22,1,.36,1) ${animDelay}ms`
                    : 'none',
                }}
              >
                <rect
                  x={tile.x}
                  y={tile.y}
                  width={tile.w}
                  height={tile.h}
                  fill={fill}
                  stroke="var(--paper)"
                  strokeWidth={1.5}
                />
                <TileLabel tile={tile} />
              </g>
            )
          })}
        </svg>

        {hoverId && <HeatmapTooltip tile={layout.find((t) => t.id === hoverId) ?? null} />}
      </div>

      <HeatmapLegend />
    </section>
  )
}

// ── Tile label (alleen tonen als blok groot genoeg) ──────────────────────

function TileLabel({ tile }: { tile: LaidOutTile }) {
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)
  // Heuristiek: alleen tekst als blok minimaal ~90×40 px in viewbox-ruimte.
  // Een SVG met preserveAspectRatio="none" rekt tekst lelijk uit; daarom
  // gebruiken we een vaste pixel-font die mee-rekt — bewuste keuze, past
  // bij de geometrische krant-stijl (zie ook portfolio-allocation-chart).
  const showSymbol = tile.w >= 60 && tile.h >= 30
  const showSub = tile.w >= 110 && tile.h >= 60
  const showValue = tile.w >= 130 && tile.h >= 90
  if (!showSymbol) return null

  const textColor = labelInkFor(tile)
  const subColor = subInkFor(tile)
  const cx = tile.x + 8
  const cy = tile.y + 18

  return (
    <g pointerEvents="none">
      <text
        x={cx}
        y={cy}
        fontSize={14}
        fontWeight={700}
        fill={textColor}
        style={{ fontFamily: 'var(--font-mono, monospace)' }}
      >
        {tile.symbol}
      </text>
      {showSub && tile.changePct != null && (
        <text
          x={cx}
          y={cy + 18}
          fontSize={11}
          fill={textColor}
          style={{ fontFamily: 'var(--font-mono, monospace)' }}
        >
          {tile.changePct >= 0 ? '+' : ''}
          {tile.changePct.toFixed(1)}%
        </text>
      )}
      {showSub && tile.changePct == null && !tile.isFiat && (
        <text
          x={cx}
          y={cy + 18}
          fontSize={11}
          fill={subColor}
          style={{ fontFamily: 'var(--font-mono, monospace)' }}
        >
          —
        </text>
      )}
      {showValue && (
        <text
          x={cx}
          y={cy + 36}
          fontSize={10}
          fill={subColor}
          style={{ fontFamily: 'var(--font-mono, monospace)' }}
        >
          {fc(tile.valueEur)}
        </text>
      )}
    </g>
  )
}

// ── Tooltip ──────────────────────────────────────────────────────────────

function HeatmapTooltip({ tile }: { tile: LaidOutTile | null }) {
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)
  if (!tile) return null
  // Positionering: absoluut binnen de relative-container, vanaf het
  // midden-boven van het blok. Klem aan de randen om uit-viewport te voorkomen.
  // Coördinaten zijn percentages van de container — werkt ongeacht responsive
  // scaling van de SVG.
  const leftPct = ((tile.x + tile.w / 2) / VIEW_W) * 100
  const topPct = (tile.y / VIEW_H) * 100
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full border border-[var(--ink)] bg-[var(--paper)] px-3 py-2 text-[11px] shadow-[2px_2px_0_var(--ink)]"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        marginTop: -8,
        minWidth: 140,
      }}
      role="tooltip"
    >
      <p className="font-mono text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--ink)]">
        {tile.symbol}
      </p>
      <p className="font-serif text-[11px] italic text-[var(--ink-3)]">{tile.name}</p>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono tabular-nums text-[var(--ink-2)]">
        <dt className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">Waarde</dt>
        <dd className="text-right">{fc(tile.valueEur)}</dd>
        <dt className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">Units</dt>
        <dd className="text-right">{formatUnits(tile.units)}</dd>
        {tile.changePct != null && (
          <>
            <dt className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">24u</dt>
            <dd
              className={`text-right ${
                tile.changePct >= 0 ? 'text-positive' : 'text-negative'
              }`}
            >
              {tile.changePct >= 0 ? '+' : ''}
              {tile.changePct.toFixed(2)}%
            </dd>
          </>
        )}
        {tile.changePct == null && !tile.isFiat && (
          <>
            <dt className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">24u</dt>
            <dd className="text-right text-[var(--ink-3)]">—</dd>
          </>
        )}
      </dl>
      {!tile.hasPrice && (
        <p className="mt-1 font-serif italic text-[10px] leading-snug text-[var(--ink-3)]">
          Geen huidige prijs beschikbaar.
        </p>
      )}
    </div>
  )
}

// ── Legend ───────────────────────────────────────────────────────────────

function HeatmapLegend() {
  // Gradient van negatief (rood) → neutraal → positief (groen). Match met
  // tileFill kleur-functie hieronder.
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-4)]">
        −10%
      </span>
      <div
        className="h-2 w-32"
        style={{
          background: `linear-gradient(to right,
            oklch(0.50 0.10 25),
            oklch(0.78 0.04 25),
            oklch(0.92 0.01 88),
            oklch(0.78 0.04 162),
            oklch(0.50 0.10 162))`,
        }}
        aria-hidden="true"
      />
      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-4)]">
        +10%
      </span>
    </div>
  )
}

// ── Color logic ──────────────────────────────────────────────────────────

function tileFill(tile: Tile): string {
  if (tile.isFiat) return 'oklch(0.86 0.012 88)' // neutraal warm-grijs voor cash
  if (!tile.hasPrice) return 'oklch(0.88 0.005 88)' // licht-grijs voor missing-price
  if (tile.changePct == null) return 'oklch(0.92 0.01 88)' // neutraal — geen rendement-data
  // Intensiteit op basis van absolute %, geclamped op 10% voor visuele balans.
  // Onder 10% schalen we lineair tussen "subtle tint" en "verzadigd".
  const pct = tile.changePct
  const magnitude = Math.min(Math.abs(pct), 10) / 10 // 0..1
  if (pct >= 0) {
    // Positief: groen, oklch hue 162 (matcht --positive)
    const lightness = 0.92 - magnitude * 0.42 // 0.92 → 0.50
    const chroma = 0.01 + magnitude * 0.09 // 0.01 → 0.10
    return `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} 162)`
  }
  // Negatief: rood, oklch hue 25
  const lightness = 0.92 - magnitude * 0.42
  const chroma = 0.01 + magnitude * 0.09
  return `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} 25)`
}

function labelInkFor(tile: Tile): string {
  // Donkere ink op alle tinten — onze treemap-kleuren blijven licht genoeg
  // dat zwart/dark-ink leesbaar is, behalve in het diepste rood/groen.
  if (tile.changePct != null && Math.abs(tile.changePct) >= 6) {
    return 'var(--paper)'
  }
  return 'var(--ink)'
}

function subInkFor(tile: Tile): string {
  if (tile.changePct != null && Math.abs(tile.changePct) >= 6) {
    return 'oklch(0.96 0.005 88)'
  }
  return 'var(--ink-3)'
}

// ── Squarified treemap algoritme ─────────────────────────────────────────
//
// Vereenvoudigde implementatie van het Bruls et al. algoritme. Gegeven een
// rechthoek (x, y, w, h) en een aflopend-gesorteerde lijst tegels (op
// `valueEur`): laad rijen met tegels totdat de aspect-ratio van de tegels
// in de rij begint te verslechteren, dan render die rij en herhaal op de
// resterende ruimte.
//
// Output: per tegel { x, y, w, h } in dezelfde viewbox-coördinaten als de
// SVG. Geen state-mutatie buiten de lokale arrays.

function squarify(
  tiles: Tile[],
  x: number,
  y: number,
  w: number,
  h: number,
): LaidOutTile[] {
  const result: LaidOutTile[] = []
  if (tiles.length === 0 || w <= 0 || h <= 0) return result

  const totalValue = tiles.reduce((sum, t) => sum + t.valueEur, 0)
  if (totalValue <= 0) return result

  // Schaal alle waarden zodat hun som overeenkomt met het pixel-oppervlak.
  const scale = (w * h) / totalValue
  const queue = tiles.map((t) => ({ tile: t, area: t.valueEur * scale }))

  // Iteratief: eet rijen op vanuit de korte kant.
  let curX = x
  let curY = y
  let curW = w
  let curH = h

  while (queue.length > 0) {
    const shortSide = Math.min(curW, curH)
    const row: { tile: Tile; area: number }[] = []
    let rowSum = 0

    // Voeg tegels toe zolang de worst-aspect verbetert.
    while (queue.length > 0) {
      const next = queue[0]
      const tentative = [...row, next]
      const tentativeSum = rowSum + next.area
      if (worstAspect(tentative, shortSide, tentativeSum) <= worstAspect(row, shortSide, rowSum) || row.length === 0) {
        row.push(next)
        rowSum = tentativeSum
        queue.shift()
      } else {
        break
      }
    }

    // Render de rij langs de korte kant.
    const rowThickness = rowSum / shortSide
    let rowOffset = 0
    if (curW <= curH) {
      // Rij is horizontaal langs de boven-rand
      for (const item of row) {
        const tw = item.area / rowThickness
        result.push({
          ...item.tile,
          x: curX + rowOffset,
          y: curY,
          w: tw,
          h: rowThickness,
        })
        rowOffset += tw
      }
      curY += rowThickness
      curH -= rowThickness
    } else {
      // Rij is verticaal langs de linker-rand
      for (const item of row) {
        const th = item.area / rowThickness
        result.push({
          ...item.tile,
          x: curX,
          y: curY + rowOffset,
          w: rowThickness,
          h: th,
        })
        rowOffset += th
      }
      curX += rowThickness
      curW -= rowThickness
    }
  }

  return result
}

/**
 * Worst aspect-ratio binnen een tentatieve rij — de kern van het squarified
 * algoritme. Hoge waardes = magere/extreem-rechthoekige tegels (slecht);
 * 1.0 = perfect vierkant. We minimaliseren de slechtste tegel in de rij.
 */
function worstAspect(
  row: { tile: Tile; area: number }[],
  shortSide: number,
  rowSum: number,
): number {
  if (row.length === 0 || rowSum <= 0) return Infinity
  const s2 = shortSide * shortSide
  const sum2 = rowSum * rowSum
  let max = -Infinity
  let min = Infinity
  for (const r of row) {
    if (r.area > max) max = r.area
    if (r.area < min) min = r.area
  }
  return Math.max((s2 * max) / sum2, sum2 / (s2 * min))
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatUnits(units: number): string {
  if (units === 0) return '0'
  // Crypto-balansen hebben sterk variabele orde-van-grootte. We tonen 4
  // significante cijfers en vermijden wetenschappelijke notatie.
  if (units >= 1000) return units.toLocaleString('nl-NL', { maximumFractionDigits: 2 })
  if (units >= 1) return units.toLocaleString('nl-NL', { maximumFractionDigits: 4 })
  if (units >= 0.0001) return units.toLocaleString('nl-NL', { maximumFractionDigits: 6 })
  return units.toExponential(2)
}
