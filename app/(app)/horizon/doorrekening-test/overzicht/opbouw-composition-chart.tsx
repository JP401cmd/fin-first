'use client'

/**
 * OpbouwCompositionChart — stacked bar chart van de vermogens-samenstelling
 * over tijd voor `/horizon/doorrekening-test/overzicht`.
 *
 * Plan-referentie: `kun-je-een-mogelijkheid-glittery-waterfall.md` (Fases A–D).
 * Data-bron: `CompositionResult` uit `../calc/opbouw-composition.ts` — Fase A
 * doet de aggregatie, dit component doet puur presentatie.
 *
 * ── Verantwoordelijkheid ─────────────────────────────────────────────────
 * Eén SVG stacked bar chart per jaar met een positieve stack (assets) en
 * NEGATIEVE GESTAPELDE schulden-bars (Fase D), plus markers voor FIRE-leeftijd
 * en AOW, een optionele netto-lijn-overlay, en een legend met kleur-swatches.
 * Een segmented toggle schakelt tussen `by_type` en `by_asset` view die
 * tegelijk op assets én schulden werkt.
 *
 * ── Waarom een eigen component? (geen `WealthCompositionChart` recyclen) ─
 * `components/app/horizon/wealth-composition-chart.tsx` heeft een vast
 * data-contract met 5 wealth-groepen. De test-pagina vereist een generieke
 * layer-lijst (13 asset-types bij `by_type`, N assets bij `by_asset`) en
 * een view-toggle die daar niet op past. Patronen hergebruiken — ResizeObserver,
 * `useInViewAnimation`, tooltip-layout — zonder de productie-component te
 * raken of koppelen.
 *
 * ── Design language (TriFinity / Editorial Finance) ─────────────────────
 *  - Scherpe hoeken op containers + bars (geen rx > 0). Krant-esthetiek.
 *  - Toggle-knoppen: zelfde styling als de mode-toggle in `DoorrekeningChart`
 *    (border `--border-ed`, actieve tab in `--color-horizon-50` + `-900` tekst).
 *  - Asset-layer kleuren: direct uit `layer.color` (komt uit `ASSET_TYPE_COLORS`).
 *  - Schuld-layer kleuren: direct uit `layer.color` (komt uit `DEBT_TYPE_COLORS`
 *    — warm rood/oranje palet, per debt-type uniek).
 *  - Axis-labels + tooltip-bedragen in DM Mono met `tabular-nums`.
 *  - FIRE-marker in horizon-goud, AOW-marker in `--ink-3` dashed.
 *  - Nullijn in `--border-md` — bewuste visuele scheidslijn tussen
 *    positieve assets en negatieve schulden.
 *  - Netto-overlay: dunne lijn in `--ink-2` — "krantenlijn" bovenop
 *    de stack zonder die te overheersen.
 *
 * ── Motion ──────────────────────────────────────────────────────────────
 *  - `useInViewAnimation({ duration: 900 })` — stacks groeien vanaf de nullijn
 *    met `cubic-bezier(.22,1,.36,1)` (zelfde curve als SimChart/DoorrekeningChart).
 *  - `prefers-reduced-motion` wordt door de hook afgehandeld: `hasEntered`
 *    wordt direct true en alle transitions vallen weg via de `'none'`-guard.
 *  - Stagger per age-column: 10ms × (age − minAge), gecapt op 500ms zodat
 *    lange levens (60+ jaar) niet tot minuut-lange animaties leiden.
 *
 * ── Toegankelijkheid ───────────────────────────────────────────────────
 *  - SVG `role="img"` + `aria-label` — screenreader-vriendelijke samenvatting.
 *  - Segmented = `role="tablist"` + per-knop `role="tab"` + `aria-selected`
 *    + `aria-controls`. Pijltoetsen (←/→) wisselen focus en selectie; Home/End
 *    springen naar eerste/laatste. Volg WAI-ARIA Tabs Pattern.
 *  - Tooltip-content wordt in een `aria-live="polite"` status-regel gespiegeld
 *    zodat keyboard/screenreader-gebruikers dezelfde breakdown horen bij
 *    focus/hover.
 *  - Focus-ring op alle interactieve elementen via
 *    `focus-visible:ring-2 focus-visible:ring-[var(--color-horizon-600)]`.
 *  - Touch targets ≥44px (toggle `min-h-[44px]`, hover/focus rects volledige
 *    kolom-breedte zodat mobiel klikken ook werkt).
 *
 * ── Data-testids (voor component-tests) ────────────────────────────────
 *   composition-chart, composition-toggle, composition-toggle-by-type,
 *   composition-toggle-by-asset, composition-legend,
 *   composition-legend-assets, composition-legend-debts,
 *   bar-{age}, debt-bar-{age}, debt-bar-{age}-{layerIdx},
 *   netto-line, marker-fire, marker-aow, netto-toggle.
 *
 *   NB: `debt-bar-{age}` blijft aanwezig als container-group voor
 *   backwards-compat met Fase B tests; per-layer rects binnen de group
 *   krijgen `debt-bar-{age}-{layerIdx}`.
 */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type SVGProps,
} from 'react'
import * as Lucide from 'lucide-react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { formatCurrency } from '@/lib/format'
import { CHART_PAD } from '@/lib/chart-constants'
import type {
  CompositionResult,
  CompositionView,
} from '../calc/opbouw-composition'

// ── Constanten ─────────────────────────────────────────────────────────

const VIEW_TABS: { key: CompositionView; label: string; aria: string }[] = [
  {
    key: 'by_type',
    label: 'Per type',
    aria: 'Groepeer stack per asset-type en schuld-type',
  },
  {
    key: 'by_asset',
    label: 'Per asset',
    aria: 'Toon elke asset en schuld als aparte layer',
  },
]

const COLOR_FIRE = 'var(--hor-t, var(--color-horizon-700, #8a6e42))'
const COLOR_AOW = 'var(--ink-3, #8a8680)'
const COLOR_NETTO = 'var(--ink-2, #4a453d)'

// ── Hulpfuncties ───────────────────────────────────────────────────────

/**
 * Compacte EUR-formatter voor axis-labels (`€1.2M`, `€850k`, `€0`).
 * Identiek aan `doorrekening-chart.tsx` — bewust gedupliceerd omdat die
 * helper lokaal-privé is en een import zou een onnodige coupling creëren.
 */
function fmtAxisAmount(val: number): string {
  if (val === 0) return '€0'
  const abs = Math.abs(val)
  const sign = val < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}€${Math.round(abs / 1_000)}k`
  return `${sign}€${Math.round(abs)}`
}

/**
 * Bereken de tick-granulariteit voor de X-as op basis van beschikbare
 * breedte. Mobiel (<640px) toont alleen elke 5 jaar; tablet elke 3 jaar;
 * desktop elke 2 jaar; heel grote schermen elk jaar. Doel: leesbare
 * labels zonder overlap, ongeacht levensspan (30–70 jaar).
 */
function computeXTickStep(width: number, span: number): number {
  const smallScreen = width < 640
  const mediumScreen = width < 900
  const largeScreen = width < 1200
  if (smallScreen) return 5
  if (mediumScreen) return span <= 20 ? 3 : 5
  if (largeScreen) return span <= 20 ? 2 : 3
  return span <= 10 ? 1 : 2
}

/**
 * Dynamische Lucide-icon lookup. `layer.icon` is een component-naam
 * ("Wallet", "TrendingUp", …) uit `ASSET_TYPE_ICONS` of `DEBT_TYPE_ICONS`.
 * Fallback op `null` als de naam niet in Lucide zit (voorkomt crashes bij
 * nieuwe iconen die nog niet bestaan).
 */
type LucideIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>

function resolveIcon(name: string | undefined): LucideIcon | null {
  if (!name) return null
  const icons = Lucide as unknown as Record<string, LucideIcon | undefined>
  return icons[name] ?? null
}

// ── Props ──────────────────────────────────────────────────────────────

export interface OpbouwCompositionChartProps {
  /** Reeds-berekend aggregaat (Fase A). */
  result: CompositionResult
  /** Laagste getoonde leeftijd. */
  currentAge: number
  /** Hoogste getoonde leeftijd. */
  endAge: number
  /** Fractionele FIRE-leeftijd voor gladde marker (null = geen marker). */
  fireAgeFractional: number | null
  /** Fractionele AOW-leeftijd — altijd gerenderd als dashed verticaal. */
  aowAge: number
  /** Actieve view — controlled via parent. */
  view: CompositionView
  /** Callback bij toggle-wissel. */
  onViewChange: (view: CompositionView) => void
  /**
   * Optionele callback bij klik (of Enter/Space) op een age-column. Wanneer
   * gezet wordt de kolom expliciet klikbaar (cursor-pointer + hover-accent);
   * wanneer `undefined` gedraagt de chart zich zoals voorheen (alleen hover).
   */
  onYearClick?: (age: number) => void
}

// ── Component ──────────────────────────────────────────────────────────

export const OpbouwCompositionChart = memo(function OpbouwCompositionChart({
  result,
  currentAge,
  endAge,
  fireAgeFractional,
  aowAge,
  view,
  onViewChange,
  onYearClick,
}: OpbouwCompositionChartProps) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 900 })

  // ── Netto-overlay toggle ─────────────────────────────────────────
  // Default aan — netto is de meest intuïtieve samenvatting van de stack.
  const [showNetto, setShowNetto] = useState(true)

  // ── Hover-state voor tooltip ────────────────────────────────────
  const [hoveredAge, setHoveredAge] = useState<number | null>(null)

  // ── Responsive container-width ──────────────────────────────────
  const [containerW, setContainerW] = useState(640)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setContainerW(Math.round(w))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  const isDesktop = containerW >= 768
  const W = containerW
  const H = isDesktop ? 340 : 280
  const PAD = CHART_PAD
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  // ── Keyboard handling voor segmented control (tablist pattern) ───
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([])
  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent, idx: number) => {
      if (
        e.key !== 'ArrowRight' &&
        e.key !== 'ArrowLeft' &&
        e.key !== 'Home' &&
        e.key !== 'End'
      ) {
        return
      }
      e.preventDefault()
      const last = VIEW_TABS.length - 1
      let next = idx
      if (e.key === 'ArrowRight') next = idx === last ? 0 : idx + 1
      else if (e.key === 'ArrowLeft') next = idx === 0 ? last : idx - 1
      else if (e.key === 'Home') next = 0
      else if (e.key === 'End') next = last
      onViewChange(VIEW_TABS[next].key)
      tabsRef.current[next]?.focus()
    },
    [onViewChange],
  )

  // ── Schaling ─────────────────────────────────────────────────────
  const { rows, assetLayers, debtLayers } = result
  const minAge = currentAge
  const maxAge = endAge

  // Y-bereik: symmetrische as op max(|assets|, |debts|) × 1.1 zodat
  // de nullijn altijd in beeld zit en de schaal visueel stabiel blijft
  // tussen views.
  const { yMin, yMax } = useMemo(() => {
    let maxAssets = 0
    let maxDebts = 0
    for (const row of rows) {
      const assetsTotal = row.assetLayers.reduce((s, v) => s + v, 0)
      if (assetsTotal > maxAssets) maxAssets = assetsTotal
      const debtsTotal = row.debtLayers.reduce((s, v) => s + v, 0)
      if (debtsTotal > maxDebts) maxDebts = debtsTotal
    }
    const headroom = Math.max(maxAssets, maxDebts, 1) * 1.1
    // Als er geen schulden zijn → minimale negatieve strook zodat de
    // nullijn onderaan zit i.p.v. midden (esthetisch ruimer voor assets).
    const hasDebts = maxDebts > 0
    return {
      yMin: hasDebts ? -headroom : -headroom * 0.04,
      yMax: headroom,
    }
  }, [rows])

  const xScale = useCallback(
    (age: number): number => {
      if (maxAge <= minAge) return 0
      return ((age - minAge) / (maxAge - minAge)) * innerW
    },
    [minAge, maxAge, innerW],
  )

  const yScale = useCallback(
    (val: number): number => {
      if (yMax === yMin) return innerH / 2
      return innerH - ((val - yMin) / (yMax - yMin)) * innerH
    },
    [yMin, yMax, innerH],
  )

  const yZero = PAD.top + yScale(0)

  // ── Axis-ticks ───────────────────────────────────────────────────
  const yTicks = useMemo(() => {
    // 5 evenly-spaced ticks, inclusief 0.
    const steps = [0, 0.25, 0.5, 0.75, 1.0]
    const raw = steps.map((f) => {
      const val = yMin + (yMax - yMin) * f
      return { val, y: PAD.top + yScale(val) }
    })
    // Forceer 0-tick expliciet zodat de nullijn-label altijd exact €0 is.
    return raw.map((t) => (Math.abs(t.val) < (yMax - yMin) * 0.02 ? { ...t, val: 0 } : t))
  }, [yMin, yMax, yScale, PAD.top])

  const xTickAges = useMemo(() => {
    const span = maxAge - minAge
    const step = computeXTickStep(containerW, span)
    const ages: number[] = []
    for (let a = Math.ceil(minAge / step) * step; a <= maxAge; a += step) {
      ages.push(a)
    }
    return ages
  }, [minAge, maxAge, containerW])

  // ── Bar-geometrie ───────────────────────────────────────────────
  const yearStep = innerW / Math.max(maxAge - minAge, 1)
  const barWidth = Math.max(2, yearStep * (isDesktop ? 0.78 : 0.68))

  // ── Netto-pad (overlay) ─────────────────────────────────────────
  const nettoPath = useMemo(() => {
    if (!showNetto) return ''
    const segments: string[] = []
    rows.forEach((row, i) => {
      const x = PAD.left + xScale(row.age)
      const y = PAD.top + yScale(row.netWorth)
      segments.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
    })
    return segments.join(' ')
  }, [showNetto, rows, xScale, yScale, PAD.left, PAD.top])

  // ── Markers ──────────────────────────────────────────────────────
  const fireMarkerX =
    fireAgeFractional !== null &&
    fireAgeFractional >= minAge &&
    fireAgeFractional <= maxAge
      ? PAD.left + xScale(fireAgeFractional)
      : null

  const aowInRange = aowAge >= minAge && aowAge <= maxAge
  const aowMarkerX = aowInRange ? PAD.left + xScale(aowAge) : null

  // ── Hover-lookup voor tooltip ───────────────────────────────────
  const hoveredRow = useMemo(
    () => (hoveredAge !== null ? rows.find((r) => r.age === hoveredAge) : null),
    [hoveredAge, rows],
  )

  // Breakdown voor tooltip + aria-live — percentages op basis van assets-totaal
  // (positief) en debts-totaal (negatief, eigen percentage-basis).
  const tooltipBreakdown = useMemo(() => {
    if (!hoveredRow) return null
    const assetsTotal = hoveredRow.assetLayers.reduce((s, v) => s + v, 0)
    const debtsTotal = hoveredRow.debtLayers.reduce((s, v) => s + v, 0)

    const assetItems = assetLayers
      .map((layer, i) => ({
        label: layer.label,
        color: layer.color,
        value: hoveredRow.assetLayers[i] ?? 0,
        pct: assetsTotal > 0 ? (hoveredRow.assetLayers[i] ?? 0) / assetsTotal : 0,
      }))
      .filter((item) => item.value > 0)

    const debtItems = debtLayers
      .map((layer, i) => ({
        label: layer.label,
        color: layer.color,
        value: hoveredRow.debtLayers[i] ?? 0,
        pct: debtsTotal > 0 ? (hoveredRow.debtLayers[i] ?? 0) / debtsTotal : 0,
      }))
      .filter((item) => item.value > 0)

    return {
      age: hoveredRow.age,
      assetItems,
      debtItems,
      assetsTotal,
      debtsTotal,
      netWorth: hoveredRow.netWorth,
    }
  }, [hoveredRow, assetLayers, debtLayers])

  // Aria-live samenvatting — compact, feitelijk, krant-toon.
  const ariaLiveText = useMemo(() => {
    if (!tooltipBreakdown) return ''
    const { age, assetsTotal, debtsTotal, netWorth } = tooltipBreakdown
    return `Leeftijd ${age}: bezit ${formatCurrency(assetsTotal)}, schulden ${formatCurrency(debtsTotal)}, netto ${formatCurrency(netWorth)}.`
  }, [tooltipBreakdown])

  // ── SVG aria-label — statische samenvatting voor screenreaders die ──
  // geen aria-live oppakken.
  const svgAriaLabel = useMemo(() => {
    const firstAge = rows[0]?.age ?? minAge
    const lastAge = rows[rows.length - 1]?.age ?? maxAge
    const subject = view === 'by_type' ? 'asset-types en schuld-types' : 'assets en schulden'
    return `Stacked bar chart: samenstelling van netto-vermogen van leeftijd ${firstAge} tot ${lastAge}, per ${subject}.`
  }, [rows, minAge, maxAge, view])

  // Reset hoveredAge wanneer rows wijzigen (bv. view-wissel).
  useEffect(() => {
    setHoveredAge(null)
  }, [result])

  const hasAnyDebt = rows.some((r) => r.debtLayers.some((v) => v > 0))

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="w-full" data-testid="composition-chart">
      {/* ── Header: titel + ondertitel + toggle ──────────────────────── */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg leading-tight text-[var(--ink)]">
            Opbouw-samenstelling over tijd
          </h3>
          <p className="mt-0.5 text-xs italic text-[var(--ink-3)] leading-relaxed">
            Waaruit je netto-vermogen bestaat, per jaar — inclusief schulden en
            de cumulatieve Box 3-belasting.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Compositie-weergave"
          data-testid="composition-toggle"
          className="flex flex-wrap gap-0 border border-[var(--border-ed)] bg-[var(--paper)]"
        >
          {VIEW_TABS.map((tab, idx) => {
            const active = view === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={tab.aria}
                aria-controls="composition-chart-panel"
                tabIndex={active ? 0 : -1}
                ref={(el) => {
                  tabsRef.current[idx] = el
                }}
                onClick={() => onViewChange(tab.key)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
                data-testid={`composition-toggle-${tab.key.replace('_', '-')}`}
                className={[
                  'px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors',
                  'min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-horizon-600)] focus-visible:ring-inset',
                  idx > 0 ? 'border-l border-[var(--border-ed)]' : '',
                  active
                    ? 'bg-[var(--color-horizon-50)] text-[var(--color-horizon-900)]'
                    : 'bg-transparent text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink)]',
                ].join(' ')}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Chart body ────────────────────────────────────────────── */}
      <div
        ref={ref}
        id="composition-chart-panel"
        role="tabpanel"
        aria-label={`Chart — ${view === 'by_type' ? 'per type' : 'per asset'}`}
        className="relative w-full"
        style={{ minHeight: H }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height: H }}
          role="img"
          aria-label={svgAriaLabel}
          onMouseLeave={() => setHoveredAge(null)}
        >
          {/* Horizontale grid-lines */}
          {yTicks.map(({ val, y }) => (
            <line
              key={`grid-${val.toFixed(0)}`}
              x1={PAD.left}
              x2={PAD.left + innerW}
              y1={y}
              y2={y}
              stroke="var(--border-ed)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ))}

          {/* Y-axis labels */}
          {yTicks.map(({ val, y }) => (
            <text
              key={`ylabel-${val.toFixed(0)}`}
              x={PAD.left - 6}
              y={y + 4}
              textAnchor="end"
              fontSize={9}
              fill="var(--ink-4)"
              fontFamily="var(--font-dm-mono, monospace)"
            >
              {fmtAxisAmount(val)}
            </text>
          ))}

          {/* X-axis labels */}
          {xTickAges.map((age) => (
            <text
              key={`xlabel-${age}`}
              x={PAD.left + xScale(age)}
              y={H - 6}
              textAnchor="middle"
              fontSize={9}
              fill="var(--ink-4)"
              fontFamily="var(--font-dm-mono, monospace)"
            >
              {age}
            </text>
          ))}

          {/* Nullijn — geaccentueerd (schuld + asset scheiding) */}
          <line
            x1={PAD.left}
            x2={PAD.left + innerW}
            y1={yZero}
            y2={yZero}
            stroke="var(--border-md, var(--ink-3))"
            strokeWidth={1.2}
          />

          {/* Stacked bars per jaar */}
          {rows.map((row) => {
            const colX = PAD.left + xScale(row.age)
            const barX = colX - barWidth / 2
            const isHovered = hoveredAge === row.age

            // Stagger: 10ms per jaar offset, capped op 500ms.
            const staggerDelay = Math.min(
              (row.age - minAge) * 0.01,
              0.5,
            )

            // ── Positieve stack — cumulatief vanaf yZero omhoog.
            // Stack-volgorde: eerst virtueel savings-asset (onderste
            // positie boven yZero), daarna de overige asset-layers in
            // hun oorspronkelijke index-volgorde. `computeOpbouwComposition`
            // plaatst savings al op positie 0, maar we sorteren hier
            // defensief zodat een toekomstige refactor van het calc-pad
            // de visuele ordering niet stilzwijgend breekt.
            let cumY = yZero
            const orderedIndices = assetLayers
              .map((_, i) => i)
              .sort((a, b) => {
                const aIsSavings =
                  assetLayers[a].isVirtualSavings ||
                  assetLayers[a].key === '__savings'
                const bIsSavings =
                  assetLayers[b].isVirtualSavings ||
                  assetLayers[b].key === '__savings'
                if (aIsSavings && !bIsSavings) return -1
                if (!aIsSavings && bIsSavings) return 1
                return a - b
              })

            const positiveBars = orderedIndices
              .map((layerIdx) => {
                const value = row.assetLayers[layerIdx]
                if (!value || value <= 0) return null
                const layer = assetLayers[layerIdx]
                if (!layer) return null
                const barH = (value / (yMax - yMin)) * innerH
                cumY -= barH
                return {
                  key: layer.key,
                  color: layer.color,
                  y: cumY,
                  height: barH,
                  isVirtualSavings:
                    layer.isVirtualSavings || layer.key === '__savings',
                }
              })
              .filter((b): b is NonNullable<typeof b> => b !== null)

            // ── Negatieve stack — cumulatief vanaf yZero naar beneden.
            // Elke debt-layer krijgt een eigen rect met zijn eigen kleur;
            // stacking-order volgt `debtLayers[]` (= `DEBT_TYPE_COLORS`
            // volgorde bij by_type, of asset.id-sort bij by_asset).
            let cumYDebt = yZero
            const negativeBars = row.debtLayers
              .map((value, layerIdx) => {
                if (value <= 0) return null
                const layer = debtLayers[layerIdx]
                if (!layer) return null
                const barH = (value / (yMax - yMin)) * innerH
                const bar = {
                  key: layer.key,
                  color: layer.color,
                  y: cumYDebt,
                  height: barH,
                  layerIdx,
                }
                cumYDebt += barH
                return bar
              })
              .filter((b): b is NonNullable<typeof b> => b !== null)

            const animProgress = hasEntered ? 1 : 0

            return (
              <g
                key={`col-${row.age}`}
                style={{
                  opacity: hasEntered ? 1 : 0,
                  transition: hasEntered
                    ? `opacity 0.4s ease ${staggerDelay}s`
                    : 'none',
                }}
              >
                {/* Positieve stacked bars */}
                {positiveBars.length > 0 && (
                  <g data-testid={`bar-${row.age}`}>
                    {positiveBars.map((bar) => (
                      <rect
                        key={`${row.age}-${bar.key}`}
                        data-testid={bar.isVirtualSavings ? 'savings-layer' : undefined}
                        x={barX}
                        y={yZero - (yZero - bar.y) * animProgress}
                        width={barWidth}
                        height={bar.height * animProgress}
                        fill={bar.color}
                        opacity={isHovered ? 1 : 0.88}
                        style={{
                          transition: hasEntered
                            ? `y 0.9s cubic-bezier(.22,1,.36,1) ${staggerDelay}s, height 0.9s cubic-bezier(.22,1,.36,1) ${staggerDelay}s, opacity 150ms ease`
                            : 'none',
                        }}
                      />
                    ))}
                  </g>
                )}

                {/* Negatieve stacked schuld-bars */}
                {negativeBars.length > 0 && (
                  // Container-group houdt het oude `debt-bar-{age}` testid
                  // voor backwards-compat met Fase B tests.
                  <g data-testid={`debt-bar-${row.age}`}>
                    {negativeBars.map((bar) => (
                      <rect
                        key={`${row.age}-debt-${bar.key}`}
                        data-testid={`debt-bar-${row.age}-${bar.layerIdx}`}
                        x={barX}
                        y={bar.y}
                        width={barWidth}
                        height={bar.height * animProgress}
                        fill={bar.color}
                        opacity={isHovered ? 1 : 0.88}
                        style={{
                          transition: hasEntered
                            ? `height 0.9s cubic-bezier(.22,1,.36,1) ${staggerDelay}s, opacity 150ms ease`
                            : 'none',
                        }}
                      />
                    ))}
                  </g>
                )}

                {/* Transparante hover/focus rect — volledige kolom-hoogte
                    zodat de gebruiker makkelijk de tooltip triggert zonder
                    precies op de bar te hoeven richten.

                    Wanneer `onYearClick` is gezet fungeert de kolom ook als
                    klikbare trigger voor de jaar-detail sheet. Keyboard-
                    gebruikers activeren via Enter of Space (conform WAI-ARIA
                    button-pattern). Zonder callback blijft het gedrag
                    zoals voorheen: hover/focus toont alleen de tooltip. */}
                <rect
                  x={colX - yearStep / 2}
                  y={PAD.top}
                  width={Math.max(yearStep, 4)}
                  height={innerH}
                  fill={onYearClick && isHovered ? 'var(--color-horizon-50)' : 'transparent'}
                  fillOpacity={onYearClick && isHovered ? 0.5 : 1}
                  tabIndex={0}
                  role="button"
                  aria-label={
                    onYearClick
                      ? `Bekijk details voor leeftijd ${row.age}: netto ${formatCurrency(row.netWorth)}`
                      : `Jaar op leeftijd ${row.age}: netto ${formatCurrency(row.netWorth)}`
                  }
                  onMouseMove={() => setHoveredAge(row.age)}
                  onFocus={() => setHoveredAge(row.age)}
                  onBlur={() => setHoveredAge(null)}
                  onClick={onYearClick ? () => onYearClick(row.age) : undefined}
                  onKeyDown={
                    onYearClick
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onYearClick(row.age)
                          }
                        }
                      : undefined
                  }
                  style={{ cursor: 'pointer', outline: 'none' }}
                />
              </g>
            )
          })}

          {/* AOW-marker — dashed, ink-3 */}
          {aowMarkerX !== null && (
            <g data-testid="marker-aow">
              <line
                x1={aowMarkerX}
                x2={aowMarkerX}
                y1={PAD.top}
                y2={PAD.top + innerH}
                stroke={COLOR_AOW}
                strokeWidth={1.2}
                strokeDasharray="3 3"
                opacity={0.7}
              />
              <text
                x={aowMarkerX - 4}
                y={PAD.top + 12}
                textAnchor="end"
                fontSize={8}
                fontWeight={600}
                fill="var(--ink-3)"
                fontFamily="var(--font-inter, sans-serif)"
              >
                AOW
              </text>
              <text
                x={aowMarkerX - 4}
                y={PAD.top + 22}
                textAnchor="end"
                fontSize={7}
                fill="var(--ink-4)"
                fontFamily="var(--font-dm-mono, monospace)"
              >
                {aowAge.toFixed(1)}
              </text>
            </g>
          )}

          {/* FIRE-marker — horizon-goud verticaal */}
          {fireMarkerX !== null && fireAgeFractional !== null && (
            <g data-testid="marker-fire">
              <line
                x1={fireMarkerX}
                x2={fireMarkerX}
                y1={PAD.top}
                y2={PAD.top + innerH}
                stroke={COLOR_FIRE}
                strokeWidth={1.5}
                strokeDasharray="4 2"
                opacity={0.85}
              />
              <text
                x={fireMarkerX + 4}
                y={PAD.top + 12}
                fontSize={8}
                fontWeight={700}
                fill={COLOR_FIRE}
                fontFamily="var(--font-inter, sans-serif)"
              >
                FIRE
              </text>
              <text
                x={fireMarkerX + 4}
                y={PAD.top + 22}
                fontSize={7}
                fill={COLOR_FIRE}
                fontFamily="var(--font-dm-mono, monospace)"
                fontWeight={500}
              >
                {fireAgeFractional.toFixed(1)}
              </text>
            </g>
          )}

          {/* ── Kruispunt-stippellijn ──────────────────────────────
              Subtiele ink-3 dashed-lijn op de FIRE-crossover die de
              fase-overgang opbouw→afbouw onderstreept. Visueel lichter
              dan `marker-fire` (ink-3 i.p.v. horizon-goud) zodat de
              stacked-bars het verhaal blijven dragen. Label "Kruispunt"
              in uppercase Inter boven de chart — krant-typografie voor
              meta-info. Gerenderd na de FIRE-marker zodat hij er bovenop
              ligt maar door de lagere opacity de goud-lijn nog licht
              doorschemert. */}
          {fireMarkerX !== null && fireAgeFractional !== null && (
            <g data-testid="crossover-line">
              <line
                x1={fireMarkerX}
                x2={fireMarkerX}
                y1={PAD.top}
                y2={PAD.top + innerH}
                stroke="var(--ink-3)"
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.45}
              />
              <text
                x={fireMarkerX}
                y={PAD.top - 4}
                textAnchor="middle"
                fontSize={8}
                fontWeight={600}
                fill="var(--ink-3)"
                fontFamily="var(--font-inter, sans-serif)"
                style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}
              >
                Kruispunt
              </text>
            </g>
          )}

          {/* Netto-lijn overlay — dunne ink-2 lijn bovenop de stack */}
          {showNetto && nettoPath && (
            <path
              data-testid="netto-line"
              d={nettoPath}
              fill="none"
              stroke={COLOR_NETTO}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={hasEntered ? 0 : 1}
              opacity={0.75}
              style={{
                transition: hasEntered
                  ? 'stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1) 0.1s'
                  : 'none',
              }}
            />
          )}
        </svg>

        {/* ── Tooltip ─────────────────────────────────────────────── */}
        {tooltipBreakdown && (
          <OpbouwCompositionTooltip
            breakdown={tooltipBreakdown}
            containerW={containerW}
            xPixel={
              hoveredAge !== null ? PAD.left + xScale(hoveredAge) : 0
            }
          />
        )}
      </div>

      {/* ── Aria-live region (spiegel van hover-inhoud voor screenreaders) ── */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {ariaLiveText}
      </div>

      {/* ── Legend + netto-toggle ─────────────────────────────────── */}
      {/*
        Legend is opgedeeld in twee visueel gescheiden blokken — "Bezit" (assets)
        en "Schulden" (debts) — gescheiden door een verticale separator. Dat
        maakt het direct duidelijk welke kleuren tot welke stack-kant (boven /
        onder de nullijn) horen, en dat schulden een eigen warm-rood palet
        hebben in plaats van arbitraire kleuren.
      */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div
          data-testid="composition-legend"
          className="flex flex-wrap items-start gap-x-4 gap-y-2"
        >
          {/* Asset-legend-blok */}
          <div
            data-testid="composition-legend-assets"
            className={[
              'flex flex-wrap items-center gap-x-3 gap-y-1.5',
              view === 'by_asset' && assetLayers.length > 12
                ? 'max-h-[96px] overflow-y-auto pr-1'
                : '',
            ].join(' ')}
          >
            <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--ink-4)]">
              Bezit
            </span>
            {assetLayers.map((layer) => {
              const Icon = resolveIcon(layer.icon)
              return (
                <div
                  key={layer.key}
                  className="flex items-center gap-1.5"
                  title={layer.label}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0"
                    style={{ backgroundColor: layer.color }}
                    aria-hidden="true"
                  />
                  {Icon && (
                    <Icon
                      size={10}
                      className="shrink-0 text-[var(--ink-3)]"
                      aria-hidden="true"
                    />
                  )}
                  <span className="text-[10px] font-medium text-[var(--ink-3)]">
                    {layer.label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Visuele separator — alleen zichtbaar als er ook schulden zijn. */}
          {hasAnyDebt && debtLayers.length > 0 && (
            <span
              aria-hidden="true"
              className="hidden h-4 w-px shrink-0 bg-[var(--border-ed)] sm:inline-block"
            />
          )}

          {/* Debt-legend-blok */}
          {debtLayers.length > 0 && (
            <div
              data-testid="composition-legend-debts"
              className={[
                'flex flex-wrap items-center gap-x-3 gap-y-1.5',
                view === 'by_asset' && debtLayers.length > 12
                  ? 'max-h-[96px] overflow-y-auto pr-1'
                  : '',
              ].join(' ')}
            >
              <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--ink-4)]">
                Schulden
              </span>
              {debtLayers.map((layer) => {
                const Icon = resolveIcon(layer.icon)
                return (
                  <div
                    key={layer.key}
                    className="flex items-center gap-1.5"
                    title={layer.label}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0"
                      style={{ backgroundColor: layer.color }}
                      aria-hidden="true"
                    />
                    {Icon && (
                      <Icon
                        size={10}
                        className="shrink-0 text-[var(--ink-3)]"
                        aria-hidden="true"
                      />
                    )}
                    <span className="text-[10px] font-medium text-[var(--ink-3)]">
                      {layer.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Netto-toggle — checkbox met krant-label */}
        <label
          className="inline-flex cursor-pointer items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)] hover:text-[var(--ink)]"
          data-testid="netto-toggle"
        >
          <input
            type="checkbox"
            checked={showNetto}
            onChange={(e) => setShowNetto(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-[var(--color-horizon-700)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-horizon-600)]"
            aria-label="Toon netto-vermogen als overlay-lijn"
          />
          <span>Netto-lijn</span>
        </label>
      </div>
    </div>
  )
})

// ── Tooltip sub-component ──────────────────────────────────────────────

/**
 * Tooltip-layout als aparte sub-component gehouden zodat de hoofdfile
 * overzichtelijker blijft. Bewust HTML (niet SVG) zodat flexbox + tekst-
 * wrapping werken zonder handmatige y-berekening per item.
 *
 * Structuur: assets-breakdown (per layer-item) → debt-sub-kop + debts-breakdown
 * (per layer-item) → netto-totaal. Schuld-bedragen worden met een
 * leading-minteken getoond zodat "negatief" visueel herkenbaar is, ook al
 * zijn de waarden in de data positief.
 */
function OpbouwCompositionTooltip({
  breakdown,
  containerW,
  xPixel,
}: {
  breakdown: {
    age: number
    assetItems: { label: string; color: string; value: number; pct: number }[]
    debtItems: { label: string; color: string; value: number; pct: number }[]
    assetsTotal: number
    debtsTotal: number
    netWorth: number
  }
  containerW: number
  xPixel: number
}) {
  // Positioneer links of rechts van de cursor afhankelijk van ruimte.
  const TOOLTIP_W = 220
  const OFFSET = 12
  const goLeft = xPixel + TOOLTIP_W + OFFSET > containerW
  const left = goLeft ? xPixel - TOOLTIP_W - OFFSET : xPixel + OFFSET

  return (
    <div
      className="pointer-events-none absolute z-10 border border-[var(--border-md)] bg-[var(--ink)] text-[var(--paper)] shadow-lg"
      style={{
        left: Math.max(8, left),
        top: 8,
        width: TOOLTIP_W,
      }}
      role="tooltip"
    >
      <div className="px-3 pt-2 pb-1.5">
        <div className="text-[10px] font-bold uppercase tracking-[0.08em] opacity-90">
          Leeftijd {breakdown.age}
        </div>
      </div>
      <div className="px-3 pb-2">
        {/* Assets */}
        {breakdown.assetItems.map((item) => (
          <div
            key={`a-${item.label}`}
            className="flex items-center gap-2 py-0.5 text-[10px]"
          >
            <span
              className="h-2 w-2 shrink-0"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            <span className="flex-1 truncate">{item.label}</span>
            <span className="font-mono tabular-nums">
              {formatCurrency(item.value)}
            </span>
            <span className="w-9 text-right font-mono tabular-nums opacity-80">
              {Math.round(item.pct * 100)}%
            </span>
          </div>
        ))}

        {/* Debts — sub-kop + breakdown + totaal */}
        {breakdown.debtItems.length > 0 && (
          <>
            <div className="mt-1 border-t border-white/20 pt-1 text-[9px] font-bold uppercase tracking-[0.08em] opacity-80">
              Schulden
            </div>
            {breakdown.debtItems.map((item) => (
              <div
                key={`d-${item.label}`}
                className="flex items-center gap-2 py-0.5 text-[10px]"
              >
                <span
                  className="h-2 w-2 shrink-0"
                  style={{ backgroundColor: item.color }}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate">{item.label}</span>
                <span className="font-mono tabular-nums">
                  −{formatCurrency(item.value)}
                </span>
                <span className="w-9 text-right font-mono tabular-nums opacity-80">
                  {Math.round(item.pct * 100)}%
                </span>
              </div>
            ))}
            <div className="mt-0.5 flex items-center gap-2 pt-0.5 text-[10px] font-semibold opacity-90">
              <span className="h-2 w-2 shrink-0" aria-hidden="true" />
              <span className="flex-1 truncate">Totaal schulden</span>
              <span className="font-mono tabular-nums">
                −{formatCurrency(breakdown.debtsTotal)}
              </span>
              <span className="w-9" />
            </div>
          </>
        )}

        {/* Netto-totaal */}
        <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-white/30 pt-1.5 text-[10px] font-bold">
          <span>Netto</span>
          <span className="font-mono tabular-nums">
            {formatCurrency(breakdown.netWorth)}
          </span>
        </div>
      </div>
    </div>
  )
}
