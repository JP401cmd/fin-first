/**
 * Organic blob layout engine for budget visualization.
 * Pure math — no React dependencies.
 *
 * Produces biological cell-like shapes: irregular blob outlines per cell,
 * puzzle-piece lobe boundaries, organelle dots, and layered membranes.
 */

// ── Seeded PRNG ──────────────────────────────────────────────

export function seededRandom(seed: number) {
  let s = seed | 0 || 1
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

// ── Color palette ────────────────────────────────────────────

export interface GroupColors {
  hue: number
  sat: number
  /** Very light background wash (95% L) */
  wash: string
  /** Lobe fill (90% L) */
  lobe: string
  /** Light cell membrane (82% L) */
  light: string
  /** Mid tone for strokes/accents (60% L) */
  mid: string
  /** Dark center fill (35% L) */
  dark: string
  /** Deep nucleus color (25% L) */
  nucleus: string
}

const GROUP_HUES: Record<string, { h: number; s: number }> = {
  'inkomen': { h: 142, s: 45 },
  'vaste-lasten-wonen': { h: 25, s: 55 },
  'dagelijkse-uitgaven': { h: 350, s: 50 },
  'vervoer': { h: 210, s: 50 },
  'leuke-dingen': { h: 270, s: 45 },
  'sparen-schulden': { h: 45, s: 55 },
}

function hsl(h: number, s: number, l: number, a = 1): string {
  if (a < 1) return `hsla(${h}, ${s}%, ${l}%, ${a})`
  return `hsl(${h}, ${s}%, ${l}%)`
}

export function getGroupColors(slugOrName: string, index: number): GroupColors {
  const preset = GROUP_HUES[slugOrName]
  const hue = preset?.h ?? ((index * 60 + 30) % 360)
  const sat = preset?.s ?? 50
  return {
    hue,
    sat,
    wash: hsl(hue, sat, 95),
    lobe: hsl(hue, sat, 90),
    light: hsl(hue, sat, 82),
    mid: hsl(hue, sat - 5, 60),
    dark: hsl(hue, sat, 35),
    nucleus: hsl(hue, sat + 5, 25),
  }
}

// ── Cell radius ──────────────────────────────────────────────

const MIN_RADIUS = 18
const MAX_RADIUS = 65

export function cellRadius(limit: number, allLimits: number[]): number {
  if (allLimits.length === 0) return MIN_RADIUS
  const areas = allLimits.map((l) => Math.sqrt(Math.max(l, 1)))
  const minA = Math.min(...areas)
  const maxA = Math.max(...areas)
  const area = Math.sqrt(Math.max(limit, 1))
  if (maxA === minA) return (MIN_RADIUS + MAX_RADIUS) / 2
  const t = (area - minA) / (maxA - minA)
  return MIN_RADIUS + t * (MAX_RADIUS - MIN_RADIUS)
}

// ── Types ────────────────────────────────────────────────────

export interface Organelle {
  x: number
  y: number
  r: number
}

export interface CellLayout {
  id: string
  parentId: string
  parentName: string
  name: string
  icon: string
  limit: number
  spent: number
  pctUsed: number
  radius: number
  x: number
  y: number
  colorIndex: number
  /** Organic blob outline for this cell */
  blobPath: string
  /** Inner membrane path (slightly smaller) */
  innerPath: string
  /** Nucleus path (spending-fill region) */
  nucleusPath: string
  /** Small organelle dots */
  organelles: Organelle[]
}

export interface LobeLayout {
  id: string
  name: string
  cx: number
  cy: number
  radius: number
  cells: CellLayout[]
  boundaryPath: string
  colorIndex: number
  /** Tiny decorative dots in lobe background */
  bgDots: Organelle[]
}

export interface BlobLayout {
  lobes: LobeLayout[]
  membranePath: string
  viewBox: { width: number; height: number }
}

// ── Position lobes ───────────────────────────────────────────

interface LobePosition {
  cx: number
  cy: number
  radius: number
}

function positionLobes(
  groupCount: number,
  width: number,
  height: number,
  seed: number,
  lobeRadii: number[],
): LobePosition[] {
  const rng = seededRandom(seed)
  const cx = width / 2
  const cy = height / 2

  // Start on a tight ellipse — just enough to fit, then separate
  const rx = width * 0.18
  const ry = height * 0.16

  const positions: LobePosition[] = []
  for (let i = 0; i < groupCount; i++) {
    const angle = (i / groupCount) * Math.PI * 2 - Math.PI / 2
    const jitterX = (rng() - 0.5) * 12
    const jitterY = (rng() - 0.5) * 12
    positions.push({
      cx: cx + Math.cos(angle) * rx + jitterX,
      cy: cy + Math.sin(angle) * ry + jitterY,
      radius: lobeRadii[i] ?? 70,
    })
  }

  // Force-separate: push lobes apart so boundaries don't overlap,
  // but keep them close (gap = 10–18px between lobe edges)
  const targetGap = 14
  const separationIters = 60
  const centerGravity = 0.02

  for (let iter = 0; iter < separationIters; iter++) {
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = positions[j].cx - positions[i].cx
        const dy = positions[j].cy - positions[i].cy
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1
        const minDist = positions[i].radius + positions[j].radius + targetGap
        if (dist < minDist) {
          const push = (minDist - dist) / 2
          const nx = dx / dist
          const ny = dy / dist
          positions[i].cx -= nx * push * 0.5
          positions[i].cy -= ny * push * 0.5
          positions[j].cx += nx * push * 0.5
          positions[j].cy += ny * push * 0.5
        }
      }
    }

    // Gentle pull toward canvas center to keep things compact
    for (const p of positions) {
      p.cx += (cx - p.cx) * centerGravity
      p.cy += (cy - p.cy) * centerGravity
    }
  }

  return positions
}

// ── Pack cells (force-directed) ──────────────────────────────

function packCells(
  cells: { radius: number; x: number; y: number }[],
  lobeCx: number,
  lobeCy: number,
  lobeRadius: number,
): void {
  cells.sort((a, b) => b.radius - a.radius)

  for (let i = 0; i < cells.length; i++) {
    const angle = (i / cells.length) * Math.PI * 2
    const dist = (i / cells.length) * lobeRadius * 0.35
    cells[i].x = lobeCx + Math.cos(angle) * dist
    cells[i].y = lobeCy + Math.sin(angle) * dist
  }

  const gravity = 0.035
  const iterations = 80

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const dx = cells[j].x - cells[i].x
        const dy = cells[j].y - cells[i].y
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1
        const minDist = cells[i].radius + cells[j].radius + 6
        if (dist < minDist) {
          const overlap = (minDist - dist) / 2
          const nx = dx / dist
          const ny = dy / dist
          cells[i].x -= nx * overlap
          cells[i].y -= ny * overlap
          cells[j].x += nx * overlap
          cells[j].y += ny * overlap
        }
      }
    }

    for (const cell of cells) {
      cell.x += (lobeCx - cell.x) * gravity
      cell.y += (lobeCy - cell.y) * gravity
    }

    for (const cell of cells) {
      const dx = cell.x - lobeCx
      const dy = cell.y - lobeCy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const maxDist = lobeRadius - cell.radius - 4
      if (dist > maxDist && maxDist > 0) {
        const scale = maxDist / dist
        cell.x = lobeCx + dx * scale
        cell.y = lobeCy + dy * scale
      }
    }
  }
}

// ── Generate organic blob path ───────────────────────────────

/**
 * Creates an irregular blob outline around a center point with given radius.
 * `bumpiness` controls how jagged; `samples` controls smoothness.
 */
export function generateCellBlob(
  cx: number,
  cy: number,
  radius: number,
  bumpiness: number,
  seed: number,
  samples = 32,
): string {
  const rng = seededRandom(seed)
  const contour: { x: number; y: number }[] = []

  for (let i = 0; i < samples; i++) {
    const angle = (i / samples) * Math.PI * 2
    // Low-frequency sinusoidal noise for smooth, rounded wobble
    const noise1 = Math.sin(angle * 2 + seed * 0.7) * 0.5
    const noise2 = Math.cos(angle * 3 + seed * 1.3) * 0.3
    const noise3 = (rng() - 0.5) * 0.15
    const r = radius * (1 + bumpiness * (noise1 + noise2 + noise3))

    contour.push({
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    })
  }

  return catmullRomToBezier(contour)
}

function generateBlobPath(
  points: { x: number; y: number; radius: number }[],
  padding: number,
  wobble: number,
  seed: number,
): string {
  if (points.length === 0) return ''

  let cenX = 0
  let cenY = 0
  for (const p of points) {
    cenX += p.x
    cenY += p.y
  }
  cenX /= points.length
  cenY /= points.length

  const samples = 64
  const contour: { x: number; y: number }[] = []

  for (let i = 0; i < samples; i++) {
    const angle = (i / samples) * Math.PI * 2
    let maxDist = 0

    for (const p of points) {
      const dx = p.x - cenX
      const dy = p.y - cenY
      const pAngle = Math.atan2(dy, dx)
      let angleDiff = Math.abs(pAngle - angle)
      if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff
      if (angleDiff < Math.PI / (samples * 0.4)) {
        const dist = Math.sqrt(dx * dx + dy * dy) + p.radius
        if (dist > maxDist) maxDist = dist
      }
    }

    if (maxDist === 0) {
      let avgDist = 0
      for (const p of points) {
        const dx = p.x - cenX
        const dy = p.y - cenY
        avgDist += Math.sqrt(dx * dx + dy * dy) + p.radius
      }
      avgDist /= points.length
      maxDist = avgDist
    }

    // Low-frequency noise only — smooth, flowing curves
    const noise =
      wobble * Math.sin(angle * 2 + seed) * Math.cos(angle * 1.7 + seed * 1.3) +
      wobble * 0.3 * Math.sin(angle * 3.5 + seed * 0.8)
    const r = maxDist + padding + noise

    contour.push({
      x: cenX + Math.cos(angle) * r,
      y: cenY + Math.sin(angle) * r,
    })
  }

  return catmullRomToBezier(contour)
}

function catmullRomToBezier(points: { x: number; y: number }[]): string {
  const n = points.length
  if (n < 2) return ''

  const parts: string[] = []
  parts.push(`M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`)

  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]
    const p1 = points[i]
    const p2 = points[(i + 1) % n]
    const p3 = points[(i + 2) % n]

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    parts.push(
      `C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`,
    )
  }

  parts.push('Z')
  return parts.join(' ')
}

// ── Organelle generation ─────────────────────────────────────

function generateOrganelles(
  cx: number,
  cy: number,
  cellRadius: number,
  count: number,
  seed: number,
): Organelle[] {
  const rng = seededRandom(seed)
  const dots: Organelle[] = []
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2
    const dist = rng() * cellRadius * 0.65
    dots.push({
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
      r: 1 + rng() * 2.5,
    })
  }
  return dots
}

function generateBgDots(
  cx: number,
  cy: number,
  lobeRadius: number,
  cells: { x: number; y: number; radius: number }[],
  count: number,
  seed: number,
): Organelle[] {
  const rng = seededRandom(seed)
  const dots: Organelle[] = []
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2
    const dist = rng() * lobeRadius * 0.85
    const x = cx + Math.cos(angle) * dist
    const y = cy + Math.sin(angle) * dist

    // Skip if inside any cell
    let inside = false
    for (const c of cells) {
      const dx = x - c.x
      const dy = y - c.y
      if (Math.sqrt(dx * dx + dy * dy) < c.radius + 4) {
        inside = true
        break
      }
    }
    if (!inside) {
      dots.push({ x, y, r: 1.5 + rng() * 3 })
    }
  }
  return dots
}

// ── Compute full layout ──────────────────────────────────────

export interface BlobInputGroup {
  id: string
  name: string
  slug: string | null
  icon: string
  default_limit: number
  children: {
    id: string
    name: string
    icon: string
    default_limit: number
  }[]
}

export function computeBlobLayout(
  groups: BlobInputGroup[],
  spending: Record<string, number>,
  width: number,
  height: number,
): BlobLayout {
  if (groups.length === 0) {
    return { lobes: [], membranePath: '', viewBox: { width, height } }
  }

  const allLimits: number[] = []
  for (const g of groups) {
    if (g.children.length === 0) {
      allLimits.push(Number(g.default_limit))
    } else {
      for (const c of g.children) {
        allLimits.push(Number(c.default_limit))
      }
    }
  }

  const seed = 42

  // Pre-compute lobe radii so positionLobes can use them for separation
  const preLobeRadii: number[] = []
  for (const group of groups) {
    const items = group.children.length > 0
      ? group.children.map((c) => Number(c.default_limit))
      : [Number(group.default_limit)]
    const radii = items.map((lim) => cellRadius(lim, allLimits))
    const totalArea = radii.reduce((sum, r) => sum + Math.PI * r * r, 0)
    preLobeRadii.push(Math.max(Math.sqrt(totalArea / Math.PI) * 1.8, 70))
  }

  const lobePositions = positionLobes(groups.length, width, height, seed, preLobeRadii)

  const lobes: LobeLayout[] = []
  const allCellsForMembrane: { x: number; y: number; radius: number }[] = []

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi]
    const pos = lobePositions[gi]

    const items = group.children.length > 0
      ? group.children.map((c) => ({
          id: c.id,
          name: c.name,
          icon: c.icon,
          limit: Number(c.default_limit),
        }))
      : [{
          id: group.id,
          name: group.name,
          icon: group.icon,
          limit: Number(group.default_limit),
        }]

    const cellRadii = items.map((item) => cellRadius(item.limit, allLimits))

    const lobeR = preLobeRadii[gi]
    pos.radius = lobeR

    const packData = items.map((_item, idx) => ({
      radius: cellRadii[idx],
      x: pos.cx,
      y: pos.cy,
    }))

    packCells(packData, pos.cx, pos.cy, lobeR)

    const cells: CellLayout[] = items.map((item, idx) => {
      const spent = spending[item.id] ?? 0
      const limit = item.limit
      const pctUsed = limit > 0 ? spent / limit : 0
      const r = cellRadii[idx]
      const x = packData[idx].x
      const y = packData[idx].y
      const cellSeed = seed + gi * 100 + idx * 13

      // Outer blob (smooth organic membrane)
      const blobPath = generateCellBlob(x, y, r, 0.04, cellSeed, 32)
      // Inner membrane (slightly smaller, subtle wobble)
      const innerPath = generateCellBlob(x, y, r * 0.85, 0.03, cellSeed + 7, 28)
      // Nucleus (spending fill — scaled by pctUsed)
      const nucleusR = r * 0.7 * Math.min(pctUsed, 1.15)
      const nucleusPath = nucleusR > 3
        ? generateCellBlob(x, y, nucleusR, 0.04, cellSeed + 13, 24)
        : ''

      // Organelle dots
      const organelleCount = Math.max(2, Math.floor(r / 12))
      const organelles = generateOrganelles(x, y, r * 0.7, organelleCount, cellSeed + 21)

      return {
        id: item.id,
        parentId: group.id,
        parentName: group.name,
        name: item.name,
        icon: item.icon,
        limit,
        spent,
        pctUsed,
        radius: r,
        x,
        y,
        colorIndex: gi,
        blobPath,
        innerPath,
        nucleusPath,
        organelles,
      }
    })

    // Lobe boundary
    const lobePoints = cells.map((c) => ({ x: c.x, y: c.y, radius: c.radius }))
    const boundaryPath = generateBlobPath(lobePoints, 18, 2, seed + gi * 7)

    // Background dots
    const bgDots = generateBgDots(
      pos.cx,
      pos.cy,
      lobeR,
      cells.map((c) => ({ x: c.x, y: c.y, radius: c.radius })),
      Math.floor(lobeR / 5),
      seed + gi * 31,
    )

    for (const c of cells) {
      allCellsForMembrane.push({ x: c.x, y: c.y, radius: c.radius })
    }

    lobes.push({
      id: group.id,
      name: group.name,
      cx: pos.cx,
      cy: pos.cy,
      radius: lobeR,
      cells,
      boundaryPath,
      colorIndex: gi,
      bgDots,
    })
  }

  const membranePath = generateBlobPath(allCellsForMembrane, 30, 2.5, seed + 99)

  return { lobes, membranePath, viewBox: { width, height } }
}
