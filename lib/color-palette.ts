/**
 * OKLCH-based palette generator for dynamic module accent colors.
 *
 * Generates 11-step color palettes (50–950) from a single hex color,
 * using the OKLCH color model — the same model Tailwind v4 uses internally.
 *
 * No external dependencies. ~100 lines of pure TypeScript.
 */

export type ModuleColorConfig = {
  kern: string   // hex, e.g. "#f59e0b"
  wil: string    // hex, e.g. "#14b8a6"
  horizon: string // hex, e.g. "#a855f7"
}

export const DEFAULT_MODULE_COLORS: ModuleColorConfig = {
  kern: '#6b4339',
  wil: '#3d3048',
  horizon: '#c4a06b',
}

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
export type Shade = (typeof SHADES)[number]

// ── Lightness & chroma curves (derived from Tailwind palette analysis) ──

const LIGHTNESS: Record<Shade, number> = {
  50: 0.977, 100: 0.949, 200: 0.903, 300: 0.837,
  400: 0.748, 500: 0.675, 600: 0.596, 700: 0.516,
  800: 0.447, 900: 0.395, 950: 0.277,
}

// Chroma multipliers (fraction of max chroma; peak at 600)
const CHROMA_MULT: Record<Shade, number> = {
  50: 0.055, 100: 0.135, 200: 0.27, 300: 0.48,
  400: 0.72, 500: 0.90, 600: 1.0, 700: 0.88,
  800: 0.73, 900: 0.59, 950: 0.40,
}

// ── Color space conversions ─────────────────────────────────────────────

function hexToSrgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ]
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

function linearRgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ]
}

function oklabToLinearRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b
  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ]
}

export function hexToOklch(hex: string): { L: number; C: number; h: number } {
  const [sr, sg, sb] = hexToSrgb(hex)
  const [lr, lg, lb] = [srgbToLinear(sr), srgbToLinear(sg), srgbToLinear(sb)]
  const [L, a, b] = linearRgbToOklab(lr, lg, lb)
  const C = Math.sqrt(a * a + b * b)
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
  return { L, C, h }
}

function oklchToLinearRgb(L: number, C: number, h: number): [number, number, number] {
  const hRad = (h * Math.PI) / 180
  const a = C * Math.cos(hRad)
  const b = C * Math.sin(hRad)
  return oklabToLinearRgb(L, a, b)
}

function isInGamut(r: number, g: number, b: number): boolean {
  const eps = 0.0001
  return r >= -eps && r <= 1 + eps && g >= -eps && g <= 1 + eps && b >= -eps && b <= 1 + eps
}

/** Binary-search chroma clamping to keep color within sRGB gamut */
function clampChromaToGamut(L: number, C: number, h: number): number {
  if (C <= 0) return 0
  let lo = 0, hi = C
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    const [r, g, b] = oklchToLinearRgb(L, mid, h)
    if (isInGamut(r, g, b)) lo = mid
    else hi = mid
  }
  return lo
}

export function oklchToHex(L: number, C: number, h: number): string {
  const clamped = clampChromaToGamut(L, C, h)
  const [lr, lg, lb] = oklchToLinearRgb(L, clamped, h)
  const r = Math.round(Math.min(1, Math.max(0, linearToSrgb(lr))) * 255)
  const g = Math.round(Math.min(1, Math.max(0, linearToSrgb(lg))) * 255)
  const b = Math.round(Math.min(1, Math.max(0, linearToSrgb(lb))) * 255)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

// ── WCAG contrast ───────────────────────────────────────────────────────

/**
 * Relative luminance of an sRGB hex color per WCAG 2.x.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(hex: string): number {
  const [sr, sg, sb] = hexToSrgb(hex)
  const [r, g, b] = [srgbToLinear(sr), srgbToLinear(sg), srgbToLinear(sb)]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * WCAG 2.x contrast ratio between two hex colors (1:1 .. 21:1).
 * Order-independent. Pure & testable: contrastRatio('#000000', '#ffffff') === 21.
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA)
  const lB = relativeLuminance(hexB)
  const lighter = Math.max(lA, lB)
  const darker = Math.min(lA, lB)
  return (lighter + 0.05) / (darker + 0.05)
}

// ── Palette generation ──────────────────────────────────────────────────

export type Palette = Record<Shade, { oklch: string; hex: string }>

/**
 * Generates an 11-step palette from a single hex color (the "500" shade).
 * Keeps hue constant, varies lightness and chroma using curves derived
 * from Tailwind's built-in palettes.
 */
export function generatePalette(hex: string): Palette {
  const { L: inputL, C: inputC, h } = hexToOklch(hex)

  // Compute L-offset: how far the input's lightness is from the reference shade-500
  const refL500 = LIGHTNESS[500]
  const lOffset = inputL - refL500

  // Determine max chroma for this hue (at shade 600, where chroma peaks)
  // We scale from the input chroma at shade 500 (mult = 0.90)
  const maxChroma = inputC / CHROMA_MULT[500]

  const palette = {} as Palette

  for (const shade of SHADES) {
    const refL = LIGHTNESS[shade]

    // Apply L-offset with tapering towards extremes (50 and 950)
    const distFromCenter = Math.abs(shade - 500) / 450 // 0 at 500, ~1 at extremes
    const taper = 1 - distFromCenter * 0.7
    const L = Math.min(0.995, Math.max(0.1, refL + lOffset * taper))

    // Chroma from bell curve
    const C = maxChroma * CHROMA_MULT[shade]

    // Gamut clamp
    const clampedC = clampChromaToGamut(L, C, h)

    const lRound = Math.round(L * 1000) / 1000
    const cRound = Math.round(clampedC * 10000) / 10000

    palette[shade] = {
      oklch: `oklch(${lRound} ${cRound} ${Math.round(h * 10) / 10})`,
      hex: oklchToHex(L, C, h),
    }
  }

  return palette
}

// ── CSS variable generation ─────────────────────────────────────────────

export type ModuleName = 'kern' | 'wil' | 'horizon'
const MODULE_NAMES: ModuleName[] = ['kern', 'wil', 'horizon']

/**
 * Generates a flat object of CSS custom property name → oklch value
 * for all 3 modules (33 variables total).
 *
 * Example: { '--color-kern-50': 'oklch(0.977 0.012 84.4)', ... }
 */
export function generateModuleColorVars(
  config: ModuleColorConfig = DEFAULT_MODULE_COLORS
): Record<string, string> {
  const vars: Record<string, string> = {}

  for (const mod of MODULE_NAMES) {
    const hex = config[mod] || DEFAULT_MODULE_COLORS[mod]
    const palette = generatePalette(hex)

    for (const shade of SHADES) {
      vars[`--color-${mod}-${shade}`] = palette[shade].oklch
    }
  }

  return vars
}

/**
 * Returns the hex value for a specific module shade.
 * Useful for chart libraries that need hex colors.
 */
export function getModuleHex(
  config: ModuleColorConfig,
  module: ModuleName,
  shade: Shade = 500
): string {
  const hex = config[module] || DEFAULT_MODULE_COLORS[module]
  const palette = generatePalette(hex)
  return palette[shade].hex
}

// ── Budget color config ─────────────────────────────────────────────────

export type BudgetColorConfig = {
  income: string
  expense: string
  savings: string
  debt: string
  other: string
}

export const DEFAULT_BUDGET_COLORS: BudgetColorConfig = {
  income:  '#2d6a4f',   // donkergroen — groei
  expense: '#6b3a2d',   // terracotta — uitstroom
  savings: '#1d4e6b',   // staalsblauw — opbouw
  debt:    '#7a2d3a',   // bordeaux — verplichting
  other:   '#4a4840',   // neutraal ink-2
}

export type BudgetTypeName = keyof BudgetColorConfig
const BUDGET_TYPE_NAMES: BudgetTypeName[] = ['income', 'expense', 'savings', 'debt', 'other']

/**
 * Generates CSS variables for all 5 budget types (55 variables total).
 * Example: { '--color-income-50': 'oklch(...)' }
 */
export function generateBudgetColorVars(
  config: BudgetColorConfig = DEFAULT_BUDGET_COLORS
): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const type of BUDGET_TYPE_NAMES) {
    const hex = config[type] || DEFAULT_BUDGET_COLORS[type]
    const palette = generatePalette(hex)
    for (const shade of SHADES) {
      vars[`--color-${type}-${shade}`] = palette[shade].oklch
    }
  }
  return vars
}

// ── Phase color config ──────────────────────────────────────────────────

export type PhaseColorConfig = {
  phase_recovery:  string
  phase_stability: string
  phase_momentum:  string
  phase_mastery:   string
}

export const DEFAULT_PHASE_COLORS: PhaseColorConfig = {
  phase_recovery:  '#8b3a3a',   // donkerrood — urgentie/herstel
  phase_stability: '#355a78',   // staalsblauw — fundament
  phase_momentum:  '#3d3048',   // zelfde als wil-paars (ontkoppeld na instellen)
  phase_mastery:   '#c4a06b',   // zelfde als horizon-goud (ontkoppeld na instellen)
}

export type PhaseColorName = keyof PhaseColorConfig
const PHASE_COLOR_NAMES: PhaseColorName[] = ['phase_recovery', 'phase_stability', 'phase_momentum', 'phase_mastery']

/**
 * Generates CSS variables for all 4 phase types (44 variables total).
 * Example: { '--color-phase-recovery-50': 'oklch(...)' }
 */
export function generatePhaseColorVars(
  config: PhaseColorConfig = DEFAULT_PHASE_COLORS
): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const phase of PHASE_COLOR_NAMES) {
    const hex = config[phase] || DEFAULT_PHASE_COLORS[phase]
    const palette = generatePalette(hex)
    // CSS var key: --color-phase-recovery-50 → replace underscore with hyphen
    const cssKey = phase.replace('_', '-')
    for (const shade of SHADES) {
      vars[`--color-${cssKey}-${shade}`] = palette[shade].oklch
    }
  }
  return vars
}

/**
 * Generates all CSS color variables: module (33) + budget (55) + phase (44) = 132 total.
 */
export function generateAllColorVars(config: {
  modules: ModuleColorConfig
  budget: BudgetColorConfig
  phase: PhaseColorConfig
}): Record<string, string> {
  return {
    ...generateModuleColorVars(config.modules),
    ...generateBudgetColorVars(config.budget),
    ...generatePhaseColorVars(config.phase),
  }
}
