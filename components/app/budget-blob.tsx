'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import './budget-blob.css'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

import {
  computeBlobLayout,
  getGroupColors,
  seededRandom,
  type CellLayout,
  type BlobInputGroup,
} from '@/lib/blob-layout'
import { BudgetIcon } from '@/components/app/budget-shared'
import { MaskedAmount } from '@/components/app/masked-amount'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import type { BudgetWithChildren } from '@/lib/budget-data'

interface BudgetBlobProps {
  groups: BudgetWithChildren[]
  spending: Record<string, number>
  onNavigate: (budgetId: string) => void
}

export function BudgetBlob({ groups, spending, onNavigate }: BudgetBlobProps) {
  const { masked } = useMaskedAmounts()
  const { ref: inViewRef, hasEntered } = useInViewAnimation({ duration: 600 })
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(900)
  const [hoveredCell, setHoveredCell] = useState<CellLayout | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [activeGroups, setActiveGroups] = useState<Set<number>>(new Set())
  const [showOverspendOnly, setShowOverspendOnly] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setContainerWidth(w)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const blobGroups: BlobInputGroup[] = useMemo(
    () =>
      groups.map((g) => ({
        id: g.id,
        name: g.name,
        slug: g.slug ?? null,
        icon: g.icon,
        default_limit: g.default_limit,
        children: g.children.map((c) => ({
          id: c.id,
          name: c.name,
          icon: c.icon,
          default_limit: c.default_limit,
        })),
      })),
    [groups],
  )

  const isSmall = containerWidth < 640
  const vbWidth = 900
  const vbHeight = isSmall ? 900 : 700

  const layout = useMemo(
    () => computeBlobLayout(blobGroups, spending, vbWidth, vbHeight),
    [blobGroups, spending, vbWidth, vbHeight],
  )

  const groupColorsList = useMemo(
    () => groups.map((g, i) => getGroupColors(g.slug ?? g.name, i)),
    [groups],
  )

  const isCellVisible = useCallback(
    (cell: CellLayout) => {
      if (activeGroups.size > 0 && !activeGroups.has(cell.colorIndex)) return false
      if (showOverspendOnly && cell.pctUsed <= 1) return false
      return true
    },
    [activeGroups, showOverspendOnly],
  )

  function toggleGroup(idx: number) {
    setActiveGroups((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function handleMouseMove(e: React.MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  const dp = 'blob-'

  return (
    <div className="mt-8" ref={inViewRef}>
    <div ref={containerRef} onMouseMove={handleMouseMove}>
      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {groups.map((g, i) => {
          const colors = groupColorsList[i]
          const isActive = activeGroups.size === 0 || activeGroups.has(i)
          return (
            <button
              key={g.id}
              onClick={() => toggleGroup(i)}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all"
              style={{
                borderColor: isActive ? colors.mid : '#d4d4d8',
                backgroundColor: isActive ? colors.wash : 'transparent',
                color: isActive ? colors.dark : '#71717a',
                opacity: isActive ? 1 : 0.5,
              }}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: colors.mid }}
              />
              {g.name}
            </button>
          )
        })}
        <button
          onClick={() => setShowOverspendOnly((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
            showOverspendOnly
              ? 'border-red-300 bg-red-50 text-red-700'
              : 'border-[var(--border-md)] text-[var(--ink-3)] hover:border-[var(--border-md)]'
          }`}
        >
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${showOverspendOnly ? 'bg-red-500' : 'bg-[var(--ink-4)]'}`} />
          Alleen overschrijdingen
        </button>
      </div>

      {/* SVG organism */}
      <div className="relative rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)]/30">
        <svg
          viewBox={`0 0 ${vbWidth} ${vbHeight}`}
          className="h-auto w-full"
          preserveAspectRatio="xMidYMid meet"
          style={{ opacity: hasEntered ? 1 : 0, transition: 'opacity 0.3s ease-out' }}
        >
          <defs>
            {/* Lobe radial gradients — watercolor wash with off-center origin */}
            {layout.lobes.map((lobe) => {
              const c = groupColorsList[lobe.colorIndex]
              return (
                <radialGradient
                  key={`lobe-grad-${lobe.id}`}
                  id={`${dp}lobe-${lobe.id}`}
                  cx="45%"
                  cy="40%"
                  r="58%"
                >
                  <stop offset="0%" stopColor={c.lobe} stopOpacity="0.95" />
                  <stop offset="20%" stopColor={c.lobeMid} stopOpacity="0.8" />
                  <stop offset="40%" stopColor={c.wash} stopOpacity="0.65" />
                  <stop offset="60%" stopColor={c.wash} stopOpacity="0.45" />
                  <stop offset="80%" stopColor={c.washFade} stopOpacity="0.25" />
                  <stop offset="100%" stopColor={c.washFade} stopOpacity="0.05" />
                </radialGradient>
              )
            })}

            {/* Per-cell nucleus gradient — deep, off-center */}
            {layout.lobes.flatMap((lobe) =>
              lobe.cells.map((cell) => {
                const c = groupColorsList[cell.colorIndex]
                return (
                  <radialGradient
                    key={cell.id}
                    id={`${dp}nuc-${cell.id}`}
                    cx="45%"
                    cy="42%"
                    r="55%"
                  >
                    <stop offset="0%" stopColor={c.nucleus} stopOpacity="0.95" />
                    <stop offset="25%" stopColor={c.dark} stopOpacity="0.85" />
                    <stop offset="45%" stopColor={c.deepMid} stopOpacity="0.7" />
                    <stop offset="65%" stopColor={c.mid} stopOpacity="0.55" />
                    <stop offset="85%" stopColor={c.light} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={c.light} stopOpacity="0.15" />
                  </radialGradient>
                )
              }),
            )}

            {/* Overspend glow — cell level */}
            <filter id={`${dp}glow`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="blur" />
              {/* eslint-disable-next-line no-restricted-syntax -- overspend-glow in SVG-filterprimitief; var()-support in flood-color is wisselvallig */}
              <feFlood floodColor="#ef4444" floodOpacity="0.5" result="color" />
              <feComposite in="color" in2="blur" operator="in" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Overspend glow — lobe level (bigger blur) */}
            <filter id={`${dp}lobe-glow`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="8" result="blur" />
              {/* eslint-disable-next-line no-restricted-syntax -- overspend-glow in SVG-filterprimitief; var()-support in flood-color is wisselvallig */}
              <feFlood floodColor="#ef4444" floodOpacity="0.35" result="color" />
              <feComposite in="color" in2="blur" operator="in" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Soft shadow for membrane */}
            <filter id={`${dp}soft`} x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
            </filter>

            {/* Watercolor texture — fractal displacement (stronger for organic feel) */}
            <filter id={`${dp}watercolor`} x="-8%" y="-8%" width="116%" height="116%">
              <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="4" seed="2" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="14" xChannelSelector="R" yChannelSelector="G" />
            </filter>

            {/* Soft lobe edge — blurred stroke effect */}
            <filter id={`${dp}soft-edge`} x="-15%" y="-15%" width="130%" height="130%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" />
            </filter>

            {/* Cell watercolor — subtle displacement on cell fills */}
            <filter id={`${dp}cell-wc`} x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" seed="5" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" xChannelSelector="R" yChannelSelector="G" />
            </filter>

            {/* Cell inner glow */}
            <filter id={`${dp}cell-glow`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur" />
              <feFlood floodColor="#ffffff" floodOpacity="0.6" result="white" />
              <feComposite in="white" in2="blur" operator="in" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* ── Layer 1: Outer membrane (4-layer biological rendering) ── */}
          {layout.membranePath && (
            <g
              className="organism-membrane"
              style={{
                transformOrigin: `${vbWidth / 2}px ${vbHeight / 2}px`,
                animation: hasEntered && !reducedMotion ? 'membrane-breathe 6s ease-in-out infinite' : 'none',
              }}
            >
              {/* Outer glow (blurred shadow) */}
              <path
                d={layout.membranePath}
                fill="#f5f5f4"
                stroke="none"
                filter={`url(#${dp}soft)`}
                opacity="0.5"
              />
              {/* Semi-transparent fill */}
              <path
                d={layout.membranePath}
                fill="#faf9f6"
                fillOpacity="0.7"
                stroke="none"
              />
              {/* Soft edge stroke (blurred) */}
              <path
                d={layout.membranePath}
                fill="none"
                stroke="#a8a29e"
                strokeWidth="2"
                strokeOpacity="0.25"
                filter={`url(#${dp}soft-edge)`}
              />
              {/* Inner highlight */}
              <path
                d={layout.membranePath}
                fill="none"
                stroke="#ffffff"
                strokeWidth="0.5"
                strokeOpacity="0.5"
              />
            </g>
          )}

          {/* ── Layer 2: Lobe backgrounds (watercolor gradient) ── */}
          {layout.lobes.map((lobe) => {
            const lobeVisible = activeGroups.size === 0 || activeGroups.has(lobe.colorIndex)
            const c = groupColorsList[lobe.colorIndex]
            const lobeSpent = lobe.cells.reduce((sum, cell) => sum + cell.spent, 0)
            const group = groups[lobe.colorIndex]
            const lobeLimit = group && group.children.length > 0
              ? group.children.reduce((sum, c) => sum + Number(c.default_limit), 0)
              : Number(group?.default_limit ?? 0)
            const lobeIsOver = lobeLimit > 0 && lobeSpent > lobeLimit
            return (
              <g key={`lobe-${lobe.id}`} opacity={lobeVisible ? 1 : 0.15}>
                {/* Gradient fill */}
                <path
                  d={lobe.boundaryPath}
                  fill={`url(#${dp}lobe-${lobe.id})`}
                  filter={lobeIsOver && lobeVisible ? `url(#${dp}lobe-glow)` : undefined}
                />
                {/* Secondary watercolor layer — pigment pooling simulation */}
                <path
                  d={lobe.boundaryPath}
                  fill={`url(#${dp}lobe-${lobe.id})`}
                  opacity="0.4"
                  filter={`url(#${dp}watercolor)`}
                />
                {/* Soft blurred edge (normal) or red dashed stroke (overspend) */}
                {lobeIsOver ? (
                  <path
                    d={lobe.boundaryPath}
                    fill="none"
                    stroke="var(--negative)"
                    strokeWidth={2.5}
                    strokeOpacity={0.7}
                    strokeDasharray="8 4"
                  />
                ) : (
                  <path
                    d={lobe.boundaryPath}
                    fill="none"
                    stroke={c.light}
                    strokeWidth={6}
                    strokeOpacity={0.25}
                    filter={`url(#${dp}soft-edge)`}
                  />
                )}
                {/* Background organelle dots */}
                {lobe.bgDots.map((dot, di) => (
                  <circle
                    key={di}
                    cx={dot.x}
                    cy={dot.y}
                    r={dot.r}
                    fill={c.light}
                    opacity={0.4}
                  />
                ))}
                {/* Lobe label — always visible: name + spent/limit + percentage */}
                {lobeVisible && (
                  <g style={{ pointerEvents: 'none' }}>
                    <text
                      x={lobe.cx}
                      y={lobe.cy - lobe.radius + 12}
                      textAnchor="middle"
                      fontSize="9"
                      fill={lobeIsOver ? 'var(--negative)' : c.dark}
                      fontWeight="700"
                      fontFamily="Inter, sans-serif"
                    >
                      {lobe.name}
                    </text>
                    <text
                      x={lobe.cx}
                      y={lobe.cy - lobe.radius + 24}
                      textAnchor="middle"
                      fontSize="7.5"
                      fill={lobeIsOver ? 'var(--negative)' : c.mid}
                      fontWeight="500"
                      fontFamily="'DM Mono', monospace"
                    >
                      {formatMaskedCurrency(lobeSpent, masked)} / {formatMaskedCurrency(lobeLimit, masked)} ({lobeLimit > 0 ? Math.round((lobeSpent / lobeLimit) * 100) : 0}%)
                    </text>
                  </g>
                )}
              </g>
            )
          })}

          {/* ── Layer 2b: Inter-lobe blending — color bleeding where lobes overlap ── */}
          {layout.lobes.map((lobe) => {
            const lobeVisible = activeGroups.size === 0 || activeGroups.has(lobe.colorIndex)
            if (!lobeVisible) return null
            const c = groupColorsList[lobe.colorIndex]
            return (
              <path
                key={`blend-${lobe.id}`}
                d={lobe.boundaryPath}
                fill={c.wash}
                fillOpacity="0.25"
                stroke="none"
                filter={`url(#${dp}watercolor)`}
                style={{ mixBlendMode: 'multiply' }}
              />
            )
          })}

          {/* ── Layer 3: Cells — biological look ── */}
          {layout.lobes.map((lobe, gi) =>
            lobe.cells.map((cell, idx) => {
              const visible = isCellVisible(cell)
              const isOver = cell.pctUsed > 1
              const c = groupColorsList[cell.colorIndex]
              const isHovered = hoveredCell?.id === cell.id
              const showLabel = cell.radius >= 28
              const entranceDelay = gi * 100 + idx * 60
              const breatheDuration = 3 + (idx % 3) * 0.4

              return (
                <g
                  key={cell.id}
                  opacity={visible ? 1 : 0.12}
                  className="organism-cell cursor-pointer"
                  style={{
                    transformOrigin: `${cell.x}px ${cell.y}px`,
                    animation: hasEntered && !reducedMotion
                      ? `cell-grow-in 0.5s cubic-bezier(0.22,1,0.36,1) ${entranceDelay}ms both, cell-breathe ${breatheDuration}s ease-in-out ${entranceDelay + 500}ms infinite`
                      : hasEntered ? 'none' : undefined,
                    opacity: hasEntered ? undefined : 0,
                    transition: 'opacity 0.3s',
                  }}
                  onMouseEnter={() => setHoveredCell(cell)}
                  onMouseLeave={() => setHoveredCell(null)}
                  onClick={() => onNavigate(cell.id)}
                  filter={isOver && visible ? `url(#${dp}glow)` : undefined}
                >
                  {/* Outer blob membrane — soft glow, no hard stroke in normal state */}
                  <path
                    d={cell.blobPath}
                    fill={c.wash}
                    stroke={isOver ? 'var(--negative)' : 'none'}
                    strokeWidth={isOver ? 1.5 : 0}
                    strokeDasharray={isOver ? '6 3' : 'none'}
                    filter={!isOver ? `url(#${dp}cell-glow)` : undefined}
                  />
                  {/* Hover ring — only on hover */}
                  {isHovered && (
                    <path
                      d={cell.blobPath}
                      fill="none"
                      stroke={c.dark}
                      strokeWidth={2}
                      strokeOpacity={0.6}
                    />
                  )}

                  {/* Inner membrane ring — with subtle watercolor texture */}
                  <path
                    d={cell.innerPath}
                    fill={c.light}
                    fillOpacity="0.5"
                    stroke={c.mid}
                    strokeWidth="0.5"
                    strokeOpacity="0.15"
                    filter={`url(#${dp}cell-wc)`}
                  />

                  {/* Cytoplasm ring (between inner membrane and nucleus) */}
                  <path
                    d={cell.cytoplasmPath}
                    fill={c.cytoplasm}
                    fillOpacity="0.35"
                  />

                  {/* Nucleus (spending fill) — pulses when nearly full */}
                  {cell.nucleusPath && (
                    <path
                      className="organism-nucleus"
                      d={cell.nucleusPath}
                      fill={`url(#${dp}nuc-${cell.id})`}
                      style={cell.pctUsed > 0.85 && !reducedMotion
                        ? { animation: 'nucleus-pulse 2s ease-in-out infinite' }
                        : undefined
                      }
                    />
                  )}

                  {/* Organelle dots — variable opacity by size, subtle drift */}
                  {cell.organelles.map((o, oi) => (
                    <circle
                      key={oi}
                      className="organism-organelle"
                      cx={o.x}
                      cy={o.y}
                      r={o.r}
                      fill={c.mid}
                      opacity={0.2 + (o.r / 6) * 0.35}
                      style={!reducedMotion
                        ? { animation: `organelle-drift ${4 + oi * 0.7}s ease-in-out infinite` }
                        : undefined
                      }
                    />
                  ))}

                  {/* Golden accent dots — always shown as organelles (radius > 25) */}
                  {cell.radius > 25 && (
                    <AccentDots cx={cell.x} cy={cell.y} radius={cell.radius} seed={cell.colorIndex * 17 + 3} />
                  )}

                  {/* Icon */}
                  {showLabel && (
                    <foreignObject
                      x={cell.x - 10}
                      y={cell.y - cell.radius * 0.35}
                      width={20}
                      height={20}
                    >
                      <div className="flex h-full w-full items-center justify-center">
                        <BudgetIcon
                          name={cell.icon}
                          className="h-3.5 w-3.5"
                        />
                      </div>
                    </foreignObject>
                  )}

                  {/* Name label */}
                  {showLabel && (
                    <text
                      x={cell.x}
                      y={cell.y + cell.radius * 0.15}
                      textAnchor="middle"
                      fontSize={cell.radius >= 45 ? 9 : 7}
                      fill={cell.pctUsed > 0.6 ? '#ffffff' : c.dark}
                      fontWeight="600"
                      fontFamily="Inter, sans-serif"
                      style={{ pointerEvents: 'none' }}
                    >
                      {truncateLabel(cell.name, cell.radius)}
                    </text>
                  )}

                  {/* Percentage */}
                  {showLabel && (
                    <text
                      x={cell.x}
                      y={cell.y + cell.radius * 0.15 + (cell.radius >= 45 ? 13 : 10)}
                      textAnchor="middle"
                      fontSize={cell.radius >= 45 ? 8 : 6.5}
                      fill={cell.pctUsed > 0.6 ? 'rgba(255,255,255,0.75)' : c.mid}
                      fontFamily="'DM Mono', monospace"
                      style={{ pointerEvents: 'none' }}
                    >
                      {Math.round(cell.pctUsed * 100)}%
                    </text>
                  )}
                </g>
              )
            }),
          )}

          {/* Hover ring is now rendered inline per cell */}
        </svg>

        {/* Tooltip */}
        {hoveredCell && (
          <Tooltip
            cell={hoveredCell}
            mousePos={mousePos}
            containerWidth={containerWidth}
            colors={groupColorsList[hoveredCell.colorIndex]}
          />
        )}
      </div>
    </div>
    </div>
  )
}

// ── Small accent dots (yellow highlights like in reference image) ─

function AccentDots({ cx, cy, radius, seed }: { cx: number; cy: number; radius: number; seed: number }) {
  const rng = seededRandom(seed)
  const dots: { x: number; y: number; r: number }[] = []
  const count = Math.min(3, Math.floor(radius / 20))
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2
    const dist = radius * (0.25 + rng() * 0.35)
    dots.push({
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
      r: 2 + rng() * 2,
    })
  }
  return (
    <>
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.x}
          cy={d.y}
          r={d.r}
          fill="#facc15"
          opacity={0.7}
        />
      ))}
    </>
  )
}

// ── Tooltip ──────────────────────────────────────────────────

function Tooltip({
  cell,
  mousePos,
  containerWidth,
  colors,
}: {
  cell: CellLayout
  mousePos: { x: number; y: number }
  containerWidth: number
  colors: ReturnType<typeof getGroupColors>
}) {
  const tooltipWidth = 220
  const flipX = mousePos.x + tooltipWidth + 20 > containerWidth
  const flipY = mousePos.y < 100

  const remaining = cell.limit - cell.spent
  const pctDisplay = Math.round(cell.pctUsed * 100)
  const isOver = cell.pctUsed > 1

  return (
    <div
      className="pointer-events-none absolute z-50 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)]/95 p-3 shadow-xl backdrop-blur-sm"
      style={{
        left: flipX ? mousePos.x - tooltipWidth - 10 : mousePos.x + 14,
        top: flipY ? mousePos.y + 10 : mousePos.y - 10,
        width: tooltipWidth,
      }}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: colors.mid }}
        />
        <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: colors.mid }}>
          {cell.parentName}
        </span>
      </div>
      <p className="text-sm font-semibold text-[var(--ink)]">{cell.name}</p>
      <div className="mt-2 space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-[var(--ink-3)]">Budget</span>
          <span className="font-medium text-[var(--ink-2)]">
            <MaskedAmount value={cell.limit} tone="wil" />
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--ink-3)]">Besteed</span>
          <span className={`font-medium ${isOver ? 'text-red-600' : 'text-[var(--ink-2)]'}`}>
            <MaskedAmount value={cell.spent} tone="wil" />
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--ink-3)]">Resterend</span>
          <span className={`font-medium ${remaining < 0 ? 'text-negative' : 'text-positive'}`}>
            <MaskedAmount value={remaining} tone="wil" />
          </span>
        </div>
        {/* Mini bar */}
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
          <div
            className={`h-full rounded-full ${isOver ? 'bg-red-500' : 'bg-current'}`}
            style={{
              width: `${Math.min(pctDisplay, 100)}%`,
              color: colors.mid,
            }}
          />
        </div>
        <p className={`text-right text-[10px] font-semibold ${isOver ? 'text-red-600' : ''}`} style={isOver ? undefined : { color: colors.dark }}>
          {pctDisplay}%
        </p>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────

function truncateLabel(name: string, radius: number): string {
  const maxChars = radius >= 55 ? 16 : radius >= 45 ? 12 : radius >= 35 ? 9 : 6
  if (name.length <= maxChars) return name
  return name.slice(0, maxChars - 1) + '\u2026'
}
