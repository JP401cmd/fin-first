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
import {
  DEBT_TYPE_COLORS,
  type DebtType,
  type DebtGroup,
  getDebtGroup,
} from './debt-data'
import { type WealthGroup, WEALTH_GROUPS } from './wealth-composition'
import { hexToOklch, oklchToHex } from './color-palette'
import { localMonthStart, localMonthStartMonthsAgo } from './month-range'

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

// ── Gedeelde aggregatie ──────────────────────────────────────────
//
// De maand-bucketing + weging is één keer gedefinieerd en wordt gedeeld door
// `loadCategoryHistory` (één subtype) én `loadWealthGroupHistory` (alle groepen).
// Zo kan de "laatste-snapshot-per-entity-per-maand, gewogen met inclusion_pct"-
// logica niet driften tussen de twee oppervlakken.

/** Rij-vorm die de aggregatie leest — een superset (entity_name etc.) mag. */
interface WeightedSnapRow {
  snapshot_date: string
  entity_id: string
  balance: number | string
  net_worth_inclusion_pct: number | string | null
}

/**
 * Aggregeer snapshot-rijen tot een `${entity_id}|${YYYY-MM}` → gewogen waarde-map.
 * Per (entity, maand) telt uitsluitend de LAATSTE `snapshot_date` in die maand,
 * gewogen met `net_worth_inclusion_pct / 100`. Bewust niet sommeren over meerdere
 * snapshots in dezelfde maand — anders zou een mid-month correctie de waarde
 * verdubbelen. Maanden buiten `monthIdx` worden overgeslagen.
 *
 * De aanwezigheid van een key betekent tevens: deze entity had een ECHTE
 * snapshot in die maand (basis voor de measured/locf-provenance).
 */
function aggregateWeightedByEntityMonth(
  rows: WeightedSnapRow[],
  monthIdx: Map<string, number>,
): Map<string, number> {
  const latestDateByEntityMonth = new Map<string, string>()
  for (const r of rows) {
    const month = r.snapshot_date.substring(0, 7)
    if (!monthIdx.has(month)) continue
    const k = `${r.entity_id}|${month}`
    const cur = latestDateByEntityMonth.get(k)
    if (!cur || r.snapshot_date > cur) {
      latestDateByEntityMonth.set(k, r.snapshot_date)
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
  return valByEntityMonth
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
    const nowYear = now.getFullYear()
    const nowMonth = now.getMonth()

    // Stap 1 — bouw het query-window. Voor numerieke `period` bepalen we
    // `fromDate` vooraf; voor 'all' laten we de gte-clause weg en bouwen
    // de maand-range pas op zodra we de oudste snapshot kennen.
    //
    // TZ: de maandgrens loopt via de lokale-maandgrens-conventie
    // (`localMonthStartMonthsAgo` uit lib/month-range.ts) — NOOIT `toISOString()`
    // voor een maandgrens (dat schuift de grens in NL/UTC+ een dag terug, zie de
    // module-toelichting daar). De maand-bucketing via `snapshot_date.substring(0,7)`
    // blijft ongemoeid: dat is een DATE-kolom en dus al TZ-veilig.
    let fromDate: string | null = null
    if (period !== 'all') {
      fromDate = localMonthStartMonthsAgo(now, period - 1)
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
      // Lokale (TZ-veilige) maandcomponenten — geen Date.UTC/getUTC* meer.
      const startDate = new Date(nowYear, nowMonth - (period - 1), 1)
      monthKeys = buildMonthRange(startDate.getFullYear(), startDate.getMonth(), nowYear, nowMonth)
    }
    const monthIdx = new Map<string, number>(monthKeys.map((k, i) => [k, i]))

    // Stap 3 — aggregeer snapshots per (entity_id, maand): pak per maand de
    // meest recente snapshot_date, gewogen met inclusion_pct/100. Via de
    // gedeelde `aggregateWeightedByEntityMonth`-helper zodat de weeg-/maandlogica
    // identiek blijft aan `loadWealthGroupHistory`. Names verzamelen we apart —
    // die heeft alleen deze single-subtype-chart nodig (voor de legenda).
    const valByEntityMonth = aggregateWeightedByEntityMonth(rows, monthIdx)
    const nameByEntity = new Map<string, string>()
    for (const r of rows) {
      const month = r.snapshot_date.substring(0, 7)
      if (!monthIdx.has(month)) continue
      if (!nameByEntity.has(r.entity_id) && r.entity_name) {
        nameByEntity.set(r.entity_id, r.entity_name)
      }
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

// ── Wealth-group historie (netto-vermogen-verloop, brok B1) ──────
//
// Generaliseert de machinerie hierboven van één `entity_subtype` naar álle
// vermogens- en schuldgroepen tegelijk, via dezelfde gedeelde aggregatie
// (`aggregateWeightedByEntityMonth`). Bewuste scheiding met B2: deze loader
// levert UITSLUITEND de gewogen groepsbanden; de netto-lijn én de restband
// (verschil met het canonieke netto vermogen) komen in B2 apart uit
// `net_worth_snapshots` — hier wordt daar niets van herberekend.

export type ProvKind = 'measured' | 'locf'

export interface GroupHistoryData {
  /** Maand-keys YYYY-MM, oud→nieuw. Altijd `months` lang. */
  months: string[]
  /** Gewogen, LOCF-forward-filled asset-waarde per WealthGroup (>= 0). */
  assetGroups: Record<WealthGroup, number[]>
  /** Gewogen, LOCF-forward-filled schuld-magnitude per DebtGroup (positief). */
  debtGroups: Record<DebtGroup, number[]>
  /**
   * Per groep per maand: 'measured' (elke bijdrager had die maand een echte
   * snapshot) of 'locf' (minstens één waarde is forward-gevuld). Keys:
   * `asset:<WealthGroup>` / `debt:<DebtGroup>`.
   */
  provenance: Record<string, ProvKind[]>
}

interface GroupSnapRow {
  snapshot_date: string
  entity_id: string
  entity_type: 'asset' | 'debt'
  entity_subtype: string | null
  balance: number | string
  net_worth_inclusion_pct: number | string | null
}

const ASSET_GROUP_KEYS: WealthGroup[] = ['spaargeld', 'beleggingen', 'pensioen', 'vastgoed', 'overig']
const DEBT_GROUP_KEYS: DebtGroup[] = ['wonen', 'consumptief', 'overig']

function zeros(n: number): number[] {
  return new Array(n).fill(0)
}

/** Consistente lege uitkomst — alle arrays exact `monthKeys.length` lang. */
function emptyGroupHistory(monthKeys: string[]): GroupHistoryData {
  const n = monthKeys.length
  const assetGroups = Object.fromEntries(
    ASSET_GROUP_KEYS.map((g) => [g, zeros(n)]),
  ) as Record<WealthGroup, number[]>
  const debtGroups = Object.fromEntries(
    DEBT_GROUP_KEYS.map((g) => [g, zeros(n)]),
  ) as Record<DebtGroup, number[]>
  const provenance: Record<string, ProvKind[]> = {}
  for (const g of ASSET_GROUP_KEYS) provenance[`asset:${g}`] = new Array(n).fill('measured') as ProvKind[]
  for (const g of DEBT_GROUP_KEYS) provenance[`debt:${g}`] = new Array(n).fill('measured') as ProvKind[]
  return { months: monthKeys, assetGroups, debtGroups, provenance }
}

/**
 * Historie van gewogen vermogens- en schuldgroepen over een rollend maandvenster,
 * als bron voor de "Netto vermogen — verloop"-grafiek (brok B1).
 *
 * Hergebruikt de machinerie van `loadCategoryHistory` (laatste-snapshot-per-
 * entity-per-maand, weging met `net_worth_inclusion_pct/100`, LOCF forward-fill),
 * maar aggregeert álle groepen tegelijk — via dezelfde gedeelde
 * `aggregateWeightedByEntityMonth`, zodat weeg-/maandlogica niet kan driften.
 *
 * Provenance: een groep-maand is 'measured' alleen als ELKE in die maand
 * bijdragende entiteit (eerste in-venster-snapshot ≤ die maand) daadwerkelijk
 * een snapshot in díe maand had; anders 'locf'. Een groep zonder bijdragers in
 * een maand telt als 'measured' (echte nul, geen carry-forward).
 *
 * Edge case: een entiteit met haar eerste (in-venster) snapshot in maand X draagt
 * vóór X niets bij — geen fictieve €0 en geen terug-LOCF (i.t.t. de leading
 * backfill van `loadCategoryHistory`, die bewust wél terugvult voor de legenda).
 *
 * `ownership`: voorlopig altijd 'personal'-gedrag — de RLS op de meegegeven client
 * scoped al naar de eigen rijen (own-row). De parameter bestaat zodat een latere
 * huishouden-variant ('all') kan worden toegevoegd zonder de handtekening te
 * breken; er wordt nu nog niet op vertakt.
 */
export async function loadWealthGroupHistory(
  supabase: SupabaseClient,
  args: { months?: number; ownership?: 'personal' | 'all' },
): Promise<GroupHistoryData> {
  const months = Math.max(1, Math.floor(args.months ?? 12))

  // Maand-venster — lokale (TZ-veilige) maandgrenzen, NOOIT toISOString.
  const now = new Date()
  const nowYear = now.getFullYear()
  const nowMonth = now.getMonth()
  const startDate = new Date(nowYear, nowMonth - (months - 1), 1)
  const monthKeys = buildMonthRange(startDate.getFullYear(), startDate.getMonth(), nowYear, nowMonth)
  const monthIdx = new Map<string, number>(monthKeys.map((k, i) => [k, i]))
  const fromDate = localMonthStart(startDate)

  try {
    const result = await supabase
      .from('balance_snapshots')
      .select('snapshot_date, entity_id, entity_type, entity_subtype, balance, net_worth_inclusion_pct')
      .in('entity_type', ['asset', 'debt'])
      .gte('snapshot_date', fromDate)
      .order('snapshot_date', { ascending: true })
    const rows = (result.data ?? []) as GroupSnapRow[]
    if (rows.length === 0) return emptyGroupHistory(monthKeys)

    // Gewogen laatste-per-maand-waarde per entity — gedeelde aggregatie.
    const valByEntityMonth = aggregateWeightedByEntityMonth(rows, monthIdx)

    // Per entity: kind + groep (uit subtype). entity_subtype is stabiel per
    // entity; eerste voorkomen wint (defensief bij inconsistente rijen).
    interface EntityMeta {
      kind: 'asset' | 'debt'
      assetGroup?: WealthGroup
      debtGroup?: DebtGroup
      groupKey: string
    }
    const metaByEntity = new Map<string, EntityMeta>()
    for (const r of rows) {
      if (metaByEntity.has(r.entity_id)) continue
      if (r.entity_type === 'asset') {
        const g = WEALTH_GROUPS[(r.entity_subtype ?? '') as AssetType] ?? 'overig'
        metaByEntity.set(r.entity_id, { kind: 'asset', assetGroup: g, groupKey: `asset:${g}` })
      } else {
        const g = getDebtGroup((r.entity_subtype ?? 'other') as DebtType)
        metaByEntity.set(r.entity_id, { kind: 'debt', debtGroup: g, groupKey: `debt:${g}` })
      }
    }

    // Accumulatoren (ruw, ongerond) + provenance (start alles 'measured').
    const assetRaw = Object.fromEntries(
      ASSET_GROUP_KEYS.map((g) => [g, zeros(months)]),
    ) as Record<WealthGroup, number[]>
    const debtRaw = Object.fromEntries(
      DEBT_GROUP_KEYS.map((g) => [g, zeros(months)]),
    ) as Record<DebtGroup, number[]>
    const provenance: Record<string, ProvKind[]> = {}
    for (const g of ASSET_GROUP_KEYS) provenance[`asset:${g}`] = new Array(months).fill('measured') as ProvKind[]
    for (const g of DEBT_GROUP_KEYS) provenance[`debt:${g}`] = new Array(months).fill('measured') as ProvKind[]

    // Per entity: forward-fill ZONDER leading fill (edge case), optellen in de
    // groep, en de provenance naar 'locf' zetten voor bijdragende maar
    // forward-gevulde maanden.
    for (const [id, meta] of metaByEntity) {
      // Eerste in-venster maand met een echte snapshot.
      let firstIdx = -1
      for (let i = 0; i < monthKeys.length; i++) {
        if (valByEntityMonth.has(`${id}|${monthKeys[i]}`)) { firstIdx = i; break }
      }
      if (firstIdx === -1) continue // geen in-venster data → draagt niet bij

      const target = meta.kind === 'asset' ? assetRaw[meta.assetGroup!] : debtRaw[meta.debtGroup!]
      let last = 0
      for (let i = firstIdx; i < monthKeys.length; i++) {
        const v = valByEntityMonth.get(`${id}|${monthKeys[i]}`)
        if (v !== undefined) {
          last = v
        } else {
          // Bijdragend (firstIdx ≤ i) maar deze maand forward-gevuld → groep = locf.
          provenance[meta.groupKey][i] = 'locf'
        }
        target[i] += last
      }
    }

    // Rond af op hele euro's + dwing de contract-tekens af: assets ≥ 0,
    // debts als positieve magnitude.
    const assetGroups = Object.fromEntries(
      ASSET_GROUP_KEYS.map((g) => [g, assetRaw[g].map((v) => Math.max(0, Math.round(v)))]),
    ) as Record<WealthGroup, number[]>
    const debtGroups = Object.fromEntries(
      DEBT_GROUP_KEYS.map((g) => [g, debtRaw[g].map((v) => Math.abs(Math.round(v)))]),
    ) as Record<DebtGroup, number[]>

    return { months: monthKeys, assetGroups, debtGroups, provenance }
  } catch {
    return emptyGroupHistory(monthKeys)
  }
}
