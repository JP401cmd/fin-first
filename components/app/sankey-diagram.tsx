'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { formatCurrency } from '@/components/app/budget-shared'

export interface SankeyNode {
  id: string
  label: string
  value: number
  color: string
  column: number // 0=left, 1=middle, 2=right
}

export interface SankeyLink {
  source: string
  target: string
  value: number
  color: string
}

interface SankeyDiagramProps {
  nodes: SankeyNode[]
  links: SankeyLink[]
  height?: number
  onNodeClick?: (nodeId: string) => void
}

const NODE_PAD = 8
const NODE_WIDTH = 14
// Spread columns to use full width
const COLUMN_POSITIONS = [0.01, 0.38, 0.76]

interface LayoutNode {
  id: string
  label: string
  value: number
  color: string
  column: number
  x: number
  y: number
  height: number
}

interface LayoutLink {
  source: string
  target: string
  value: number
  color: string
  sourceColor: string
  targetColor: string
  sourceY: number
  sourceHeight: number
  targetY: number
  targetHeight: number
  sourceX: number
  targetX: number
}

function computeLayout(
  nodes: SankeyNode[],
  links: SankeyLink[],
  width: number,
  height: number
): { layoutNodes: LayoutNode[]; layoutLinks: LayoutLink[] } {
  if (nodes.length === 0) return { layoutNodes: [], layoutLinks: [] }

  const columns: Map<number, SankeyNode[]> = new Map()
  for (const n of nodes) {
    const col = columns.get(n.column) ?? []
    col.push(n)
    columns.set(n.column, col)
  }

  let maxColumnValue = 0
  for (const [, colNodes] of columns) {
    const total = colNodes.reduce((s, n) => s + n.value, 0)
    if (total > maxColumnValue) maxColumnValue = total
  }

  if (maxColumnValue === 0) return { layoutNodes: [], layoutLinks: [] }

  const layoutNodeMap = new Map<string, LayoutNode>()

  for (const [colIdx, colNodes] of columns) {
    const colTotal = colNodes.reduce((s, n) => s + n.value, 0)
    const availableHeight = height - (colNodes.length - 1) * NODE_PAD
    const x = COLUMN_POSITIONS[colIdx] * width

    let y = (height - (colTotal / maxColumnValue) * availableHeight - (colNodes.length - 1) * NODE_PAD) / 2
    if (y < 0) y = 0

    for (const n of colNodes) {
      const nodeHeight = Math.max((n.value / maxColumnValue) * availableHeight, 4)
      layoutNodeMap.set(n.id, {
        id: n.id,
        label: n.label,
        value: n.value,
        color: n.color,
        column: n.column,
        x,
        y,
        height: nodeHeight,
      })
      y += nodeHeight + NODE_PAD
    }
  }

  const sourceOffset = new Map<string, number>()
  const targetOffset = new Map<string, number>()
  const layoutLinks: LayoutLink[] = []

  const sortedLinks = [...links].sort((a, b) => {
    const sa = layoutNodeMap.get(a.source)
    const sb = layoutNodeMap.get(b.source)
    const ta = layoutNodeMap.get(a.target)
    const tb = layoutNodeMap.get(b.target)
    if (!sa || !sb || !ta || !tb) return 0
    if (sa.y !== sb.y) return sa.y - sb.y
    return ta.y - tb.y
  })

  for (const link of sortedLinks) {
    const sNode = layoutNodeMap.get(link.source)
    const tNode = layoutNodeMap.get(link.target)
    if (!sNode || !tNode) continue

    const sOff = sourceOffset.get(link.source) ?? 0
    const tOff = targetOffset.get(link.target) ?? 0

    const linkSourceHeight = sNode.value > 0
      ? (link.value / sNode.value) * sNode.height : 0
    const linkTargetHeight = tNode.value > 0
      ? (link.value / tNode.value) * tNode.height : 0

    layoutLinks.push({
      source: link.source,
      target: link.target,
      value: link.value,
      color: link.color,
      sourceColor: sNode.color,
      targetColor: tNode.color,
      sourceY: sNode.y + sOff,
      sourceHeight: linkSourceHeight,
      targetY: tNode.y + tOff,
      targetHeight: linkTargetHeight,
      sourceX: sNode.x + NODE_WIDTH,
      targetX: tNode.x,
    })

    sourceOffset.set(link.source, sOff + linkSourceHeight)
    targetOffset.set(link.target, tOff + linkTargetHeight)
  }

  return {
    layoutNodes: Array.from(layoutNodeMap.values()),
    layoutLinks,
  }
}

/** Build center-line bezier path for a single link */
function linkCenterPath(link: LayoutLink): string {
  const { sourceX, sourceY, sourceHeight, targetX, targetY, targetHeight } = link
  const sy = sourceY + sourceHeight / 2
  const ty = targetY + targetHeight / 2
  const dx = targetX - sourceX
  const cp = dx * 0.5
  return `M ${sourceX} ${sy} C ${sourceX + cp} ${sy}, ${targetX - cp} ${ty}, ${targetX} ${ty}`
}

/**
 * Build chained paths: income → group → subcategory as one continuous motion path.
 * Euro coins roll from left edge all the way to the right edge.
 */
function buildChainedPaths(
  layoutLinks: LayoutLink[],
  layoutNodes: LayoutNode[],
): { path: string; color: string; thickness: number }[] {
  const nodeMap = new Map<string, LayoutNode>()
  for (const n of layoutNodes) nodeMap.set(n.id, n)

  // Find col0→col1 links and col1→col2 links
  const col01: LayoutLink[] = []
  const col12: LayoutLink[] = []
  for (const l of layoutLinks) {
    const s = nodeMap.get(l.source)
    const t = nodeMap.get(l.target)
    if (!s || !t) continue
    if (s.column === 0 && t.column === 1) col01.push(l)
    if (s.column === 1 && t.column === 2) col12.push(l)
  }

  const chains: { path: string; color: string; thickness: number }[] = []

  // For each col0→col1 link, find matching col1→col2 links to chain
  for (const first of col01) {
    const continuations = col12.filter((l) => l.source === first.target)
    if (continuations.length === 0) {
      // No col2 target — just use single segment, color = target
      const targetNode = nodeMap.get(first.target)
      chains.push({
        path: linkCenterPath(first),
        color: targetNode?.color ?? first.targetColor,
        thickness: Math.max(first.sourceHeight, first.targetHeight),
      })
    } else {
      for (const second of continuations) {
        // Chain: income source → group midpoint → subcategory
        const sy = first.sourceY + first.sourceHeight / 2
        const my = first.targetY + first.targetHeight / 2
        const ey = second.targetY + second.targetHeight / 2

        const sx = first.sourceX
        const mx = first.targetX + NODE_WIDTH // exit from group node right side
        const ex = second.targetX

        const dx1 = first.targetX - sx
        const cp1 = dx1 * 0.5
        const dx2 = ex - mx
        const cp2 = dx2 * 0.5

        // Continuous path: bezier to group node, then bezier to subcategory
        const path = [
          `M ${sx} ${sy}`,
          `C ${sx + cp1} ${sy}, ${first.targetX - cp1} ${my}, ${first.targetX} ${my}`,
          // Small straight through node
          `L ${mx} ${my}`,
          `C ${mx + cp2} ${my}, ${ex - cp2} ${ey}, ${ex} ${ey}`,
        ].join(' ')

        // Color = final destination (subcategory)
        const endNode = nodeMap.get(second.target)
        chains.push({
          path,
          color: endNode?.color ?? second.targetColor,
          thickness: Math.max(second.sourceHeight, second.targetHeight),
        })
      }
    }
  }

  // Also add standalone col1→col2 links that weren't chained (shouldn't happen normally but safety net)
  // Skipped — the chains above cover all meaningful flows

  return chains
}

function LinkPath({
  link,
  isHighlighted,
  onHover,
  gradientId,
}: {
  link: LayoutLink
  isHighlighted: boolean
  onHover: (link: LayoutLink | null) => void
  gradientId: string
}) {
  const { sourceX, sourceY, sourceHeight, targetX, targetY, targetHeight } = link
  const dx = targetX - sourceX
  const cp = dx * 0.5

  const topPath = `M ${sourceX} ${sourceY}
    C ${sourceX + cp} ${sourceY}, ${targetX - cp} ${targetY}, ${targetX} ${targetY}`
  const bottomPath = `L ${targetX} ${targetY + targetHeight}
    C ${targetX - cp} ${targetY + targetHeight}, ${sourceX + cp} ${sourceY + sourceHeight}, ${sourceX} ${sourceY + sourceHeight}
    Z`

  return (
    <path
      d={`${topPath} ${bottomPath}`}
      fill={`url(#${gradientId})`}
      opacity={isHighlighted ? 0.65 : 0.3}
      className="cursor-pointer transition-opacity duration-200"
      onMouseEnter={() => onHover(link)}
      onMouseLeave={() => onHover(null)}
    />
  )
}

function NodeRect({
  node,
  isHighlighted,
  onHover,
  onClick,
  svgWidth,
  gradientId,
}: {
  node: LayoutNode
  isHighlighted: boolean
  onHover: (nodeId: string | null) => void
  onClick?: (nodeId: string) => void
  svgWidth: number
  gradientId: string
}) {
  // Col 0 and 1: labels on right; col 2: labels on left
  const labelOnRight = node.column < 2
  const labelX = labelOnRight ? node.x + NODE_WIDTH + 6 : node.x - 6
  const textAnchor = labelOnRight ? 'start' : 'end'

  return (
    <g
      className={`cursor-pointer transition-opacity duration-200 ${isHighlighted ? 'opacity-100' : 'opacity-80'}`}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick?.(node.id)}
    >
      <rect
        x={node.x}
        y={node.y}
        width={NODE_WIDTH}
        height={Math.max(node.height, 2)}
        rx={3}
        fill={`url(#${gradientId})`}
      />
      {node.height > 12 && (
        <>
          <text
            x={labelX}
            y={node.y + node.height / 2 - 6}
            textAnchor={textAnchor}
            className="fill-zinc-700 text-[10px] font-medium"
          >
            {node.label.length > 22 ? node.label.slice(0, 20) + '...' : node.label}
          </text>
          <text
            x={labelX}
            y={node.y + node.height / 2 + 7}
            textAnchor={textAnchor}
            className="fill-zinc-400 text-[9px]"
          >
            {formatCurrency(node.value)}
          </text>
        </>
      )}
    </g>
  )
}

function lighten(hex: string, amount: number): string {
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  const nr = Math.round(r + (255 - r) * amount)
  const ng = Math.round(g + (255 - g) * amount)
  const nb = Math.round(b + (255 - b) * amount)
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`
}

function darken(hex: string, amount: number): string {
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  const nr = Math.round(r * (1 - amount))
  const ng = Math.round(g * (1 - amount))
  const nb = Math.round(b * (1 - amount))
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`
}

/** Animated euro coin that follows a path, colored to match its target budget */
function EuroCoin({
  pathData,
  delay,
  duration,
  size,
  color,
}: {
  pathData: string
  delay: number
  duration: number
  size: number
  color: string
}) {
  const strokeColor = darken(color, 0.25)
  const textColor = darken(color, 0.45)

  return (
    <g opacity="0.9">
      <circle r={size} fill={lighten(color, 0.3)} stroke={strokeColor} strokeWidth="0.8">
        <animateMotion
          path={pathData}
          dur={`${duration}s`}
          begin={`${delay}s`}
          repeatCount="indefinite"
        />
      </circle>
      <text
        textAnchor="middle"
        dy="0.38em"
        fontSize={size * 1.05}
        fill={textColor}
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
        style={{ pointerEvents: 'none' }}
      >
        <animateMotion
          path={pathData}
          dur={`${duration}s`}
          begin={`${delay}s`}
          repeatCount="indefinite"
        />
        &euro;
      </text>
    </g>
  )
}

export function SankeyDiagram({ nodes, links, height = 350, onNodeClick }: SankeyDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(800)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [hoveredLink, setHoveredLink] = useState<LayoutLink | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    observer.observe(el)
    setContainerWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])

  const { layoutNodes, layoutLinks } = useMemo(
    () => computeLayout(nodes, links, containerWidth, height),
    [nodes, links, containerWidth, height]
  )

  const highlightedLinkSet = useMemo(() => {
    const set = new Set<string>()
    if (hoveredNode) {
      for (const l of layoutLinks) {
        if (l.source === hoveredNode || l.target === hoveredNode) {
          set.add(`${l.source}->${l.target}`)
        }
      }
    }
    if (hoveredLink) {
      set.add(`${hoveredLink.source}->${hoveredLink.target}`)
    }
    return set
  }, [hoveredNode, hoveredLink, layoutLinks])

  const highlightedNodeSet = useMemo(() => {
    const set = new Set<string>()
    if (hoveredNode) {
      set.add(hoveredNode)
      for (const l of layoutLinks) {
        if (l.source === hoveredNode) set.add(l.target)
        if (l.target === hoveredNode) set.add(l.source)
      }
    }
    if (hoveredLink) {
      set.add(hoveredLink.source)
      set.add(hoveredLink.target)
    }
    return set
  }, [hoveredNode, hoveredLink, layoutLinks])

  // Build chained paths for euro coins (income → group → subcategory)
  const euroCoins = useMemo(() => {
    const chains = buildChainedPaths(layoutLinks, layoutNodes)
    const coins: { pathData: string; delay: number; duration: number; size: number; color: string }[] = []
    const maxCoins = 25
    let coinCount = 0

    // Sort by thickness descending — larger flows get coins first
    const sorted = [...chains].sort((a, b) => b.thickness - a.thickness)

    for (const chain of sorted) {
      if (coinCount >= maxCoins) break
      const numCoins = chain.thickness > 18 ? 3 : chain.thickness > 7 ? 2 : 1

      for (let i = 0; i < numCoins && coinCount < maxCoins; i++) {
        // Longer duration for chained (cross-boundary) paths
        const duration = 4.5 + Math.random() * 2.5
        const delay = i * (duration / numCoins) + Math.random() * 0.8
        const size = Math.min(Math.max(chain.thickness * 0.22, 3.5), 7)
        coins.push({
          pathData: chain.path,
          delay,
          duration,
          size,
          color: chain.color,
        })
        coinCount++
      }
    }
    return coins
  }, [layoutLinks, layoutNodes])

  const anyHighlighted = highlightedLinkSet.size > 0

  if (nodes.length === 0) return null

  return (
    <div ref={containerRef} className="w-full">
      <svg
        width={containerWidth}
        height={height}
        viewBox={`0 0 ${containerWidth} ${height}`}
        className="block"
      >
        <defs>
          {/* Link gradients */}
          {layoutLinks.map((link, i) => (
            <linearGradient
              key={`link-grad-${i}`}
              id={`link-grad-${i}`}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor={link.sourceColor} stopOpacity="0.8" />
              <stop offset="40%" stopColor={link.color} stopOpacity="0.55" />
              <stop offset="100%" stopColor={link.targetColor} stopOpacity="0.8" />
            </linearGradient>
          ))}

          {/* Node gradients */}
          {layoutNodes.map((node) => (
            <linearGradient
              key={`node-grad-${node.id}`}
              id={`node-grad-${node.id}`}
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop offset="0%" stopColor={darken(node.color, 0.1)} />
              <stop offset="50%" stopColor={node.color} />
              <stop offset="100%" stopColor={lighten(node.color, 0.2)} />
            </linearGradient>
          ))}
        </defs>

        {/* Links */}
        <g>
          {layoutLinks.map((link, i) => {
            const key = `${link.source}->${link.target}`
            const isHighlighted = !anyHighlighted || highlightedLinkSet.has(key)
            return (
              <LinkPath
                key={`${key}-${i}`}
                link={link}
                isHighlighted={isHighlighted}
                onHover={setHoveredLink}
                gradientId={`link-grad-${i}`}
              />
            )
          })}
        </g>

        {/* Nodes */}
        <g>
          {layoutNodes.map((node) => {
            const isHighlighted = !anyHighlighted || highlightedNodeSet.has(node.id)
            return (
              <NodeRect
                key={node.id}
                node={node}
                isHighlighted={isHighlighted}
                onHover={setHoveredNode}
                onClick={onNodeClick}
                svgWidth={containerWidth}
                gradientId={`node-grad-${node.id}`}
              />
            )
          })}
        </g>

        {/* Animated euro coins — rolling through income → group → subcategory */}
        <g>
          {euroCoins.map((coin, i) => (
            <EuroCoin
              key={i}
              pathData={coin.pathData}
              delay={coin.delay}
              duration={coin.duration}
              size={coin.size}
              color={coin.color}
            />
          ))}
        </g>
      </svg>

      {/* Tooltip */}
      {hoveredLink && (
        <div className="pointer-events-none absolute right-4 top-4 rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 shadow-xl backdrop-blur-sm">
          <p className="text-xs font-medium text-zinc-700">
            {layoutNodes.find((n) => n.id === hoveredLink.source)?.label} →{' '}
            {layoutNodes.find((n) => n.id === hoveredLink.target)?.label}
          </p>
          <p className="mt-0.5 text-sm font-bold text-zinc-900">
            {formatCurrency(hoveredLink.value)}
          </p>
        </div>
      )}
    </div>
  )
}
