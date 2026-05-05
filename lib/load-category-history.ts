/**
 * Cumulatieve waarde-historie per categorie voor de
 * `<CategoryHistoryChart>` op `/core/assets/[type]` en
 * `/core/debts/[type]`. Spiegelt de aggregatie-idiomen van
 * `load-entity-sparklines.ts`, maar dan over een configureerbaar
 * window (3/6/12/'all') en mét entity-metadata + per-maand totalen.
 *
 * Output: één tijdreeks per entity (forward-filled, nooit `null`),
 * gewogen met `net_worth_inclusion_pct`, plus een palet van
 * familie-coherente kleuren afgeleid van de subtype-basistint.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { ASSET_TYPE_COLORS, type AssetType } from './asset-data'
import { DEBT_TYPE_COLORS, type DebtType } from './debt-data'
import { hexToOklch, oklchToHex } from './color-palette'

type EntityType = 'asset' | 'debt'
type Period = 3 | 6 | 12 | 'all'

interface SnapRow {
  snapshot_date: string
  entity_id: string
  entity_name: string
  balance: number | string
  net_worth_inclusion_pct: number | string | null
}

interface AssetRow {
  id: string
  name: string
  is_active: boolean
  current_value: number | string | null
  asset_type: string
}

interface DebtRow {
  id: string
  name: string
  is_active: boolean
  current_balance: number | string | null
  debt_type: string
}

export type CategoryHistoryEntity = {
  id: string
  name: string
  isActive: boolean
  /** Hex color, derived from base subtype color + per-entity HSL rotation. */
  color: string
}

export type CategoryHistoryData = {
  /** Month keys YYYY-MM, oldest → newest. */
  months: string[]
  /** Per-entity series, same length as months, forward-filled (number — never null). */
  byEntityId: Record<string, number[]>
  /** Sum across all entities per month. */
  totals: number[]
  /** All entities included in the chart, in stable order (active first by current value desc, then inactive). */
  entities: CategoryHistoryEntity[]
}

const EMPTY: CategoryHistoryData = { months: [], byEntityId: {}, totals: [], entities: [] }

// ── Datum-helpers ────────────────────────────────────────────────

function monthKey(year: number, monthZeroBased: number): string {
  return `${year}-${String(monthZeroBased + 1).padStart(2, '0')}`
}

function buildMonthRange(fromYear: number, fromMonth: number, toYear: number, toMonth: number): string[] {
  const keys: string[] = []
  let y = fromYear
  let m = fromMonth
  // Bovengrens-bewaking: bij corrupte data nooit oneindig draaien.
  for (let safety = 0; safety < 1200; safety++) {
    keys.push(monthKey(y, m))
    if (y === toYear && m === toMonth) return keys
    m++
    if (m > 11) { m = 0; y++ }
  }
  return keys
}

// ── Kleur-helpers ────────────────────────────────────────────────
//
// De type-kleuren in `ASSET_TYPE_COLORS` / `DEBT_TYPE_COLORS` zijn
// `oklch(L C h)` strings (geen hex). We parsen die één keer naar een
// basis-hex via de bestaande `oklchToHex`-helper en doen daarna de
// per-entity hue-rotatie in HSL — zoals de spec beschrijft. Hue-rotatie
// in HSL houdt de visuele waardering (saturation + lightness) constant
// terwijl de tint per entity een paar graden opschuift.

function parseOklchString(s: string): { L: number; C: number; h: number } | null {
  const m = s.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/i)
  if (!m) return null
  const L = parseFloat(m[1])
  const C = parseFloat(m[2])
  const h = parseFloat(m[3])
  if (!isFinite(L) || !isFinite(C) || !isFinite(h)) return null
  return { L, C, h }
}

function ensureHex(color: string): string {
  if (color.startsWith('#')) return color
  const parsed = parseOklchString(color)
  if (parsed) return oklchToHex(parsed.L, parsed.C, parsed.h)
  // Onbekend formaat → val terug op een neutrale kern-tint zodat de
  // chart niet crasht. Liever een dof bruintje dan een undefined fill.
  return '#6b4339'
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const v = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)); break
      case gn: h = (bn - rn) / d + 2; break
      default: h = (rn - gn) / d + 4
    }
    h *= 60
  }
  return [h, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = ((h % 360) + 360) % 360 / 360
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue2rgb = (t: number): number => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [hue2rgb(hh + 1 / 3) * 255, hue2rgb(hh) * 255, hue2rgb(hh - 1 / 3) * 255]
}

function rotateHueHex(hex: string, deg: number): string {
  const [r, g, b] = hexToRgb(hex)
  const [h, s, l] = rgbToHsl(r, g, b)
  const [r2, g2, b2] = hslToRgb(h + deg, s, l)
  return rgbToHex(r2, g2, b2)
}

// Hex<->OKLCH heeft `lib/color-palette.ts` al; HSL-helpers bewust hier
// inline omdat ze nergens anders gebruikt worden en het klein blijft.

// ── Hoofd-loader ─────────────────────────────────────────────────

export async function loadCategoryHistory(
  supabase: SupabaseClient,
  args: {
    entityType: EntityType
    subtype: string
    period?: Period
    includeInactive?: boolean
  },
): Promise<CategoryHistoryData> {
  const { entityType, subtype, period = 12, includeInactive = false } = args

  try {
    const now = new Date()
    const nowYear = now.getUTCFullYear()
    const nowMonth = now.getUTCMonth()

    // Stap 1 — bouw het query-window. Voor numerieke `period` bepalen we
    // `fromDate` vooraf; voor 'all' laten we de gte-clause weg en bouwen
    // de maand-range pas op zodra we de oudste snapshot kennen.
    let fromDate: string | null = null
    if (period !== 'all') {
      const firstYear = nowYear
      const firstMonth = nowMonth - (period - 1)
      const fromUtc = new Date(Date.UTC(firstYear, firstMonth, 1))
      fromDate = fromUtc.toISOString().split('T')[0]
    }

    let query = supabase
      .from('balance_snapshots')
      .select('snapshot_date, entity_id, entity_name, balance, net_worth_inclusion_pct')
      .eq('entity_type', entityType)
      .eq('entity_subtype', subtype)
      .order('snapshot_date', { ascending: true })
    if (fromDate) query = query.gte('snapshot_date', fromDate)

    const result = await query
    const rows = (result.data ?? []) as SnapRow[]

    // Stap 2 — bepaal monthKeys. Voor 'all' starten we bij min(snapshot_date)
    // (of huidige maand als er geen snapshots zijn), zodat we toch nog
    // een chart kunnen tonen voor net-toegevoegde items.
    let monthKeys: string[]
    if (period === 'all') {
      if (rows.length === 0) {
        monthKeys = [monthKey(nowYear, nowMonth)]
      } else {
        const oldest = rows[0].snapshot_date
        const oy = parseInt(oldest.substring(0, 4), 10)
        const om = parseInt(oldest.substring(5, 7), 10) - 1
        monthKeys = buildMonthRange(oy, om, nowYear, nowMonth)
      }
    } else {
      const startMonth = nowMonth - (period - 1)
      const startDate = new Date(Date.UTC(nowYear, startMonth, 1))
      monthKeys = buildMonthRange(startDate.getUTCFullYear(), startDate.getUTCMonth(), nowYear, nowMonth)
    }
    const monthIdx = new Map<string, number>(monthKeys.map((k, i) => [k, i]))

    // Stap 3 — aggregeer snapshots per (entity_id, maand) volgens dezelfde
    // idiom als `load-entity-sparklines.ts`: pak per maand de meest recente
    // snapshot_date, weeg met inclusion_pct/100. Bewust niet sommeren over
    // meerdere snapshots in dezelfde maand — anders zou een mid-month
    // correctie de waarde verdubbelen.
    const latestDateByEntityMonth = new Map<string, string>()
    const nameByEntity = new Map<string, string>()
    for (const r of rows) {
      const month = r.snapshot_date.substring(0, 7)
      if (!monthIdx.has(month)) continue
      const k = `${r.entity_id}|${month}`
      const cur = latestDateByEntityMonth.get(k)
      if (!cur || r.snapshot_date > cur) {
        latestDateByEntityMonth.set(k, r.snapshot_date)
      }
      if (!nameByEntity.has(r.entity_id) && r.entity_name) {
        nameByEntity.set(r.entity_id, r.entity_name)
      }
    }
    const valByEntityMonth = new Map<string, number>()
    for (const r of rows) {
      const month = r.snapshot_date.substring(0, 7)
      if (!monthIdx.has(month)) continue
      const k = `${r.entity_id}|${month}`
      if (latestDateByEntityMonth.get(k) !== r.snapshot_date) continue
      const weight = Number(r.net_worth_inclusion_pct ?? 100) / 100
      valByEntityMonth.set(k, Number(r.balance) * weight)
    }

    // Stap 4 — haal entity-metadata op (huidige stand uit `assets`/`debts`).
    // We willen ook nieuw-toegevoegde items zien die nog geen snapshot
    // hebben, dus de set bestaat uit alle entity_ids uit snapshots ∪ alle
    // momenteel actieve items in de categorie.
    const valueColumn = entityType === 'asset' ? 'current_value' : 'current_balance'
    const typeColumn = entityType === 'asset' ? 'asset_type' : 'debt_type'
    let metaQuery = supabase
      .from(entityType === 'asset' ? 'assets' : 'debts')
      .select(`id, name, is_active, ${valueColumn}, ${typeColumn}`)
      .eq(typeColumn, subtype)
    if (!includeInactive) metaQuery = metaQuery.eq('is_active', true)
    const metaResult = await metaQuery
    const metaRows = (metaResult.data ?? []) as Array<AssetRow | DebtRow>

    type EntityMeta = { id: string; name: string; isActive: boolean; currentValue: number }
    const metaById = new Map<string, EntityMeta>()
    for (const m of metaRows) {
      const cv = entityType === 'asset'
        ? Number((m as AssetRow).current_value ?? 0)
        : Number((m as DebtRow).current_balance ?? 0)
      metaById.set(m.id, {
        id: m.id,
        name: m.name,
        isActive: !!m.is_active,
        currentValue: isFinite(cv) ? cv : 0,
      })
    }

    // Stap 5 — bouw de uiteindelijke set van entity_ids strikt uit de
    // huidige metadata (actief, of inactief wanneer `includeInactive`).
    // Snapshots zijn slechts tijdreeks-data voor entities die nú bestaan —
    // zwerf-snapshots van fysiek verwijderde items (bijv. opgeruimde
    // testdata) worden bewust genegeerd, anders zou de chart spook-items
    // tonen die de gebruiker niet meer kent.
    const entityIdSet = new Set<string>()
    for (const m of metaById.values()) {
      if (m.isActive || includeInactive) entityIdSet.add(m.id)
    }

    // Stap 6 — bouw forward-filled tijdreeks per entity. Bij ontbrekende
    // maanden gebruiken we de eerste bekende waarde voor maanden ervoor en
    // de laatste bekende waarde voor maanden erna. Items die geen enkele
    // snapshot hebben maar wel een current_value kennen krijgen een
    // platte lijn op die waarde — zo verschijnen ze in de chart als een
    // herkenningspunt zonder valse historie te suggereren.
    const byEntityId: Record<string, number[]> = {}
    for (const id of entityIdSet) {
      const series = monthKeys.map((m) => valByEntityMonth.get(`${id}|${m}`))
      const hasAny = series.some((v) => v !== undefined)
      if (!hasAny) {
        const meta = metaById.get(id)
        const cv = meta?.currentValue ?? 0
        if (cv <= 0 && !includeInactive) continue
        byEntityId[id] = monthKeys.map(() => cv)
        continue
      }
      const firstReal = series.find((v) => v !== undefined) as number
      let last = firstReal
      const filled: number[] = []
      for (const v of series) {
        if (v !== undefined) last = v
        filled.push(last)
      }
      byEntityId[id] = filled
    }

    // Stap 7 — totals per maand (som over alle entities).
    const totals = monthKeys.map((_, i) => {
      let sum = 0
      for (const id of Object.keys(byEntityId)) sum += byEntityId[id][i] ?? 0
      return sum
    })

    // Stap 8 — entiteiten in stabiele volgorde + kleur. Actief eerst,
    // gesorteerd op huidige waarde desc; daarna inactief gesorteerd op
    // de laatste niet-nul waarde uit de eigen reeks.
    const baseColorRaw = entityType === 'asset'
      ? ASSET_TYPE_COLORS[subtype as AssetType]
      : DEBT_TYPE_COLORS[subtype as DebtType]
    const baseHex = ensureHex(baseColorRaw ?? '')

    const idsForOrdering = Object.keys(byEntityId)
    const lastNonZeroByEntity = new Map<string, number>()
    for (const id of idsForOrdering) {
      const series = byEntityId[id]
      let v = 0
      for (let i = series.length - 1; i >= 0; i--) {
        if (series[i] > 0) { v = series[i]; break }
      }
      lastNonZeroByEntity.set(id, v)
    }
    const currentValueOf = (id: string): number => metaById.get(id)?.currentValue ?? lastNonZeroByEntity.get(id) ?? 0
    const isActiveOf = (id: string): boolean => metaById.get(id)?.isActive ?? false

    const sortedIds = idsForOrdering.sort((a, b) => {
      const aActive = isActiveOf(a)
      const bActive = isActiveOf(b)
      if (aActive !== bActive) return aActive ? -1 : 1
      return currentValueOf(b) - currentValueOf(a)
    })

    const entities: CategoryHistoryEntity[] = sortedIds.map((id, i) => {
      const meta = metaById.get(id)
      const name = meta?.name ?? nameByEntity.get(id) ?? 'Onbekend'
      // 12° per stap geeft 3-12 entities een herkenbare familie-look.
      // Wrap bij 360° gebeurt automatisch in `rotateHueHex`.
      const color = i === 0 ? baseHex : rotateHueHex(baseHex, 12 * i)
      return {
        id,
        name,
        isActive: meta?.isActive ?? false,
        color,
      }
    })

    return { months: monthKeys, byEntityId, totals, entities }
  } catch {
    return EMPTY
  }
}
