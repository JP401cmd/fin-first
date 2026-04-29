/**
 * Opbouw-samenstelling aggregatie — re-shape van `HybridProjectionResult`
 * naar een `CompositionResult` dat direct door een stacked bar chart kan
 * worden geconsumeerd.
 *
 * Twee views delen dezelfde bronnen voor BEIDE assets en schulden:
 *   - `by_type`:  assets gegroepeerd op `asset_type`; schulden op `debt_type`.
 *                 Layer-volgorde volgt de stabiele keys-volgorde van
 *                 `ASSET_TYPE_COLORS` / `DEBT_TYPE_COLORS`. Het virtuele
 *                 savings-asset krijgt een aparte `__savings`-key bovenaan
 *                 (vóór de regular asset-type keys).
 *   - `by_asset`: één layer per asset én per schuld. Kleur komt uit
 *                 `ASSET_TYPE_COLORS` / `DEBT_TYPE_COLORS`; als meerdere
 *                 entities hetzelfde type delen wordt een kleine HSL-
 *                 lightness-variatie toegepast zodat stacks visueel
 *                 onderscheidbaar blijven. Het virtuele savings-asset wordt
 *                 direct als eigen layer meegegeven met `isVirtualSavings: true`.
 *
 * Er wordt GEEN nieuwe math gedaan — dit bestand herschikt uitsluitend de
 * `perAssetValues` / `perDebtValues` uit de hybrid-projection plus zijn
 * `assetMeta` / `debtMeta` zodat de aggregatie-chart exact dezelfde waarden
 * laat zien als de key-metrics en de lijn-grafiek.
 *
 * **Fase G3 signature change**: deze helper accepteert nu `hybridRows`,
 * `assetMeta` en `debtMeta` in plaats van `{ assets, debts, opbouw }`.
 * Dit is een breaking change voor alle consumers.
 */

import type { AssetType } from '@/lib/asset-data'
import type { DebtType } from '@/lib/debt-data'
import {
  ASSET_TYPE_COLORS,
  ASSET_TYPE_LABELS,
  ASSET_TYPE_ICONS,
} from '@/lib/asset-data'
import {
  DEBT_TYPE_COLORS,
  DEBT_TYPE_LABELS,
  DEBT_TYPE_ICONS,
} from '@/lib/debt-data'
import type {
  HybridAssetMeta,
  HybridDebtMeta,
  HybridYearRow,
} from './hybrid-projection'

// ── Public types ─────────────────────────────────────────────────

export type CompositionView = 'by_type' | 'by_asset'

export interface CompositionLayer {
  /** Stabiele identifier — assetType/debtType (by_type) of asset.id/debt.id (by_asset). */
  key: string
  /** Gelokaliseerde label voor legend/tooltip. */
  label: string
  /** Hex-kleur voor stack-fill + legend-swatch. */
  color: string
  /** Lucide icon-naam uit `ASSET_TYPE_ICONS` / `DEBT_TYPE_ICONS` (optioneel voor legend). */
  icon?: string
  /** `true` voor het virtuele `__savings`-asset — laat de UI desgewenst een
   *  eigen visuele aanduiding toevoegen. */
  isVirtualSavings?: boolean
}

export interface CompositionYearRow {
  /** Leeftijd dat jaar — overgenomen uit `hybridRow.age`. */
  age: number
  /** Fase van deze rij (opbouw vóór FIRE, afbouw vanaf FIRE). */
  phase: 'opbouw' | 'afbouw'
  /** Per-layer waarde in dezelfde volgorde als `assetLayers`; niet-bestaande layers zijn 0. */
  assetLayers: number[]
  /**
   * Per-layer schuld-waarde (positieve getallen) in dezelfde volgorde als
   * `debtLayers`. Wordt door het component als negatieve gestapelde bars
   * onder de nullijn gerenderd.
   */
  debtLayers: number[]
  /** Overgenomen uit `hybridRow.netWorth`. */
  netWorth: number
  /** Overgenomen uit `hybridRow.cumulativeBox3Tax`. */
  cumulativeBox3Tax: number
}

export interface CompositionResult {
  view: CompositionView
  /** Asset-layers — legend-volgorde én positieve-stack-volgorde. */
  assetLayers: CompositionLayer[]
  /** Debt-layers — legend-volgorde én negatieve-stack-volgorde. */
  debtLayers: CompositionLayer[]
  rows: CompositionYearRow[]
}

export interface OpbouwCompositionInputs {
  view: CompositionView
  /** Hybride rijen (opbouw + afbouw). Lengte bepaalt het aantal output-rijen. */
  hybridRows: HybridYearRow[]
  /** Asset-metadata — dezelfde index-volgorde als `hybridRow.perAssetValues`. */
  assetMeta: HybridAssetMeta[]
  /** Debt-metadata — dezelfde index-volgorde als `hybridRow.perDebtValues`. */
  debtMeta: HybridDebtMeta[]
}

/** Speciale key voor het virtuele savings-asset in de `by_type`-view. */
const SAVINGS_TYPE_KEY = '__savings'

// ── Color variation helpers (by_asset view) ──────────────────────

/**
 * Converteer een hex-kleur (#rrggbb) naar HSL-componenten.
 * Gebruikt alleen voor visuele variatie — de originele hex blijft de
 * basis van elke layer, zodat de kleurtaal identiek is aan `by_type`.
 */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16) / 255
  const g = parseInt(clean.substring(2, 4), 16) / 255
  const b = parseInt(clean.substring(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
    switch (max) {
      case r: h = ((g - b) / delta + (g < b ? 6 : 0)) * 60; break
      case g: h = ((b - r) / delta + 2) * 60; break
      case b: h = ((r - g) / delta + 4) * 60; break
    }
  }

  return { h, s, l: l * 100 }
}

/** HSL → hex conversie (inverse van `hexToHsl`). */
function hslToHex(h: number, s: number, l: number): string {
  const sn = s
  const ln = l / 100
  const a = sn * Math.min(ln, 1 - ln)
  const f = (n: number): string => {
    const k = (n + h / 30) % 12
    const color = ln - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/**
 * Varieer de lightness van een basiskleur voor `by_asset`-view.
 *
 * Strategie: eerste asset/debt binnen een type houdt exact de basiskleur.
 * Volgende entries krijgen stapjes van ±10% lightness in een zigzag-patroon
 * (donkerder, lichter, donkerder-2, lichter-2, …) begrensd op [20%, 80%].
 *
 * Dit is puur cosmetisch — de basiskleur en dus de module-kleuridentiteit
 * blijft dominant, zelfs met 6+ entries van hetzelfde type.
 */
function variantColor(baseHex: string, variantIndex: number): string {
  if (variantIndex === 0) return baseHex
  const { h, s, l } = hexToHsl(baseHex)
  const step = Math.ceil(variantIndex / 2) * 10
  const sign = variantIndex % 2 === 1 ? -1 : 1
  const nextL = Math.max(20, Math.min(80, l + sign * step))
  return hslToHex(h, s, nextL)
}

// ── Core aggregation — assets ────────────────────────────────────

/**
 * Bouw de `by_type`-view voor assets: groepeer op `asset_type` in de
 * volgorde van `ASSET_TYPE_COLORS`. Het virtuele savings-asset krijgt
 * een eigen `__savings`-layer die altijd bovenaan staat (vóór de regular
 * type-layers). Layers zonder enig niet-nul jaar worden weggelaten.
 */
function buildAssetByTypeView(
  assetMeta: HybridAssetMeta[],
  perAssetYearlyValues: number[][],
  projectionYears: number,
): { layers: CompositionLayer[]; layerValues: number[][] } {
  // Splits virtueel savings-asset uit — die krijgt een eigen key boven de
  // reguliere type-groupering.
  const savingsIndex = assetMeta.findIndex((m) => m.isVirtualSavings)
  const realIndices = assetMeta
    .map((_, i) => i)
    .filter((i) => !assetMeta[i].isVirtualSavings)

  const candidateLayers: {
    key: string
    label: string
    color: string
    icon?: string
    isVirtualSavings?: boolean
    values: number[]
  }[] = []

  // 1. Savings-layer eerst (alleen als aanwezig).
  if (savingsIndex >= 0) {
    const meta = assetMeta[savingsIndex]
    const values = perAssetYearlyValues[savingsIndex] ?? new Array<number>(projectionYears).fill(0)
    candidateLayers.push({
      key: SAVINGS_TYPE_KEY,
      label: meta.label,
      color: meta.color,
      icon: ASSET_TYPE_ICONS.cash,
      isVirtualSavings: true,
      values,
    })
  }

  // 2. Reguliere asset-types in ASSET_TYPE_COLORS-volgorde.
  const typeOrder = Object.keys(ASSET_TYPE_COLORS) as AssetType[]
  for (const type of typeOrder) {
    const values = new Array<number>(projectionYears).fill(0)
    for (const i of realIndices) {
      if (assetMeta[i].asset_type !== type) continue
      const yearly = perAssetYearlyValues[i] ?? []
      for (let yr = 0; yr < projectionYears; yr++) {
        values[yr] += yearly[yr] ?? 0
      }
    }
    candidateLayers.push({
      key: type,
      label: ASSET_TYPE_LABELS[type],
      color: ASSET_TYPE_COLORS[type],
      icon: ASSET_TYPE_ICONS[type],
      values,
    })
  }

  // Filter layers zonder enig niet-nul jaar (voorkomt lege legend-entries).
  const kept = candidateLayers.filter((l) => l.values.some((v) => v !== 0))

  const layers: CompositionLayer[] = kept.map((l) => ({
    key: l.key,
    label: l.label,
    color: l.color,
    ...(l.icon !== undefined && { icon: l.icon }),
    ...(l.isVirtualSavings && { isVirtualSavings: true }),
  }))

  return { layers, layerValues: kept.map((l) => l.values) }
}

/**
 * Bouw de `by_asset`-view voor assets: één layer per asset. Het virtuele
 * savings-asset wordt vooraan geplaatst (variant 0, eigen kleur). De echte
 * assets volgen op stabiele id-sortering, met HSL-variatie wanneer meerdere
 * assets hetzelfde type delen.
 */
function buildAssetByAssetView(
  assetMeta: HybridAssetMeta[],
  perAssetYearlyValues: number[][],
  projectionYears: number,
): { layers: CompositionLayer[]; layerValues: number[][] } {
  const candidates = assetMeta.map((meta, i) => ({
    meta,
    values: perAssetYearlyValues[i] ?? new Array<number>(projectionYears).fill(0),
  }))

  // Filter assets zonder enig niet-nul jaar.
  const nonEmpty = candidates.filter((c) => c.values.some((v) => v !== 0))

  // Split savings uit — die blijft vooraan.
  const savings = nonEmpty.find((c) => c.meta.isVirtualSavings)
  const realAssets = nonEmpty
    .filter((c) => !c.meta.isVirtualSavings)
    // Stabiele sortering op asset.id (string compare).
    .sort((a, b) => (a.meta.id < b.meta.id ? -1 : a.meta.id > b.meta.id ? 1 : 0))

  const layers: CompositionLayer[] = []
  const layerValues: number[][] = []

  if (savings) {
    layers.push({
      key: savings.meta.id,
      label: savings.meta.label,
      color: savings.meta.color,
      icon: ASSET_TYPE_ICONS.cash,
      isVirtualSavings: true,
    })
    layerValues.push(savings.values)
  }

  // Ken elke echte asset een variant-index toe binnen zijn type.
  const variantCounter = new Map<string, number>()
  for (const c of realAssets) {
    const type = c.meta.asset_type as AssetType
    const idx = variantCounter.get(type) ?? 0
    variantCounter.set(type, idx + 1)
    const baseColor = ASSET_TYPE_COLORS[type] ?? c.meta.color
    layers.push({
      key: c.meta.id,
      label: c.meta.label,
      color: variantColor(baseColor, idx),
      icon: ASSET_TYPE_ICONS[type],
    })
    layerValues.push(c.values)
  }

  return { layers, layerValues }
}

// ── Core aggregation — debts (spiegel van assets) ────────────────

/**
 * Bouw de `by_type`-view voor schulden: groepeer op `debt_type` in de
 * volgorde van `DEBT_TYPE_COLORS`. Layers zonder enig niet-nul jaar
 * worden weggelaten — identiek patroon als `buildAssetByTypeView`.
 */
function buildDebtByTypeView(
  debtMeta: HybridDebtMeta[],
  perDebtYearlyValues: number[][],
  projectionYears: number,
): { layers: CompositionLayer[]; layerValues: number[][] } {
  const typeOrder = Object.keys(DEBT_TYPE_COLORS) as DebtType[]

  const candidateLayers: { type: DebtType; values: number[] }[] = typeOrder.map(
    (type) => {
      const values = new Array<number>(projectionYears).fill(0)
      for (let di = 0; di < debtMeta.length; di++) {
        if (debtMeta[di].debt_type !== type) continue
        const yearly = perDebtYearlyValues[di] ?? []
        for (let yr = 0; yr < projectionYears; yr++) {
          values[yr] += yearly[yr] ?? 0
        }
      }
      return { type, values }
    },
  )

  const kept = candidateLayers.filter((l) => l.values.some((v) => v !== 0))

  const layers: CompositionLayer[] = kept.map((l) => ({
    key: l.type,
    label: DEBT_TYPE_LABELS[l.type],
    color: DEBT_TYPE_COLORS[l.type],
    icon: DEBT_TYPE_ICONS[l.type],
  }))

  return { layers, layerValues: kept.map((l) => l.values) }
}

/**
 * Bouw de `by_asset`-view voor schulden: één layer per schuld. Sorteer op
 * `debt.id`, filter lege en pas dezelfde HSL-lightness-variatie toe
 * wanneer meerdere schulden hetzelfde type delen.
 */
function buildDebtByAssetView(
  debtMeta: HybridDebtMeta[],
  perDebtYearlyValues: number[][],
  projectionYears: number,
): { layers: CompositionLayer[]; layerValues: number[][] } {
  const candidates = debtMeta.map((meta, i) => ({
    meta,
    values: perDebtYearlyValues[i] ?? new Array<number>(projectionYears).fill(0),
  }))

  const nonEmpty = candidates.filter((c) => c.values.some((v) => v !== 0))

  nonEmpty.sort((a, b) => (a.meta.id < b.meta.id ? -1 : a.meta.id > b.meta.id ? 1 : 0))

  const variantCounter = new Map<string, number>()
  const layers: CompositionLayer[] = nonEmpty.map((c) => {
    const type = c.meta.debt_type as DebtType
    const idx = variantCounter.get(type) ?? 0
    variantCounter.set(type, idx + 1)
    const baseColor = DEBT_TYPE_COLORS[type] ?? c.meta.color
    return {
      key: c.meta.id,
      label: c.meta.label,
      color: variantColor(baseColor, idx),
      icon: DEBT_TYPE_ICONS[type],
    }
  })

  return { layers, layerValues: nonEmpty.map((c) => c.values) }
}

// ── Entry point ──────────────────────────────────────────────────

/**
 * Re-shape hybrid-projection-output naar een `CompositionResult` geschikt
 * voor een stacked bar chart.
 *
 * Asset-layers: waarden komen direct uit `hybridRow.perAssetValues[i]` in de
 * index-volgorde van `assetMeta`. De hybrid-projection past al
 * `net_worth_inclusion_pct`-weging toe op `perAssetYearly` (zie
 * `computeOpbouwProjection`) — maar **alleen voor de aggregaatkolom** in
 * `yearlyRows.assets`. De per-asset raw-waarden in `perAssetValues`
 * komen ongewogen uit `projectAssetYearly` (opbouw) resp. het afbouw-
 * schema. Voor een bar-chart die per-asset layer-waarden stapelt is dat
 * echter consistent: we gebruiken de raw waarden en laten de debt-kant
 * ook unweighted zodat de stack-totalen opbouw- en afbouw-consistent
 * blijven.
 *
 * Debt-layers: waarden komen raw uit `hybridRow.perDebtValues[i]`.
 */
export function computeOpbouwComposition(
  inputs: OpbouwCompositionInputs,
): CompositionResult {
  const { view, hybridRows, assetMeta, debtMeta } = inputs
  const projectionYears = hybridRows.length

  // ── Per-asset waarden over alle rijen (index-volgorde = assetMeta). ──
  const numAssets = assetMeta.length
  const perAssetYearlyValues: number[][] = Array.from({ length: numAssets }, () =>
    new Array<number>(projectionYears).fill(0),
  )
  // ── Per-debt waarden over alle rijen (index-volgorde = debtMeta). ────
  const numDebts = debtMeta.length
  const perDebtYearlyValues: number[][] = Array.from({ length: numDebts }, () =>
    new Array<number>(projectionYears).fill(0),
  )

  for (let yr = 0; yr < projectionYears; yr++) {
    const row = hybridRows[yr]
    for (let i = 0; i < numAssets; i++) {
      perAssetYearlyValues[i][yr] = row.perAssetValues[i] ?? 0
    }
    for (let i = 0; i < numDebts; i++) {
      perDebtYearlyValues[i][yr] = row.perDebtValues[i] ?? 0
    }
  }

  const assetBuilt =
    view === 'by_type'
      ? buildAssetByTypeView(assetMeta, perAssetYearlyValues, projectionYears)
      : buildAssetByAssetView(assetMeta, perAssetYearlyValues, projectionYears)

  const debtBuilt =
    view === 'by_type'
      ? buildDebtByTypeView(debtMeta, perDebtYearlyValues, projectionYears)
      : buildDebtByAssetView(debtMeta, perDebtYearlyValues, projectionYears)

  // Jaar-rijen bouwen — één per jaar, layer-waarden in dezelfde volgorde
  // als respectievelijk `assetLayers` en `debtLayers`.
  const rows: CompositionYearRow[] = []
  for (let yr = 0; yr < projectionYears; yr++) {
    const assetLayerValues = assetBuilt.layerValues.map((values) => values[yr] ?? 0)
    const debtLayerValues = debtBuilt.layerValues.map((values) => values[yr] ?? 0)
    const yearRow = hybridRows[yr]
    rows.push({
      age: yearRow.age,
      phase: yearRow.phase,
      assetLayers: assetLayerValues,
      debtLayers: debtLayerValues,
      netWorth: yearRow.netWorth,
      cumulativeBox3Tax: yearRow.cumulativeBox3Tax,
    })
  }

  return {
    view,
    assetLayers: assetBuilt.layers,
    debtLayers: debtBuilt.layers,
    rows,
  }
}
