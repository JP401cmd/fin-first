/**
 * Verkoop-/liquidatie-configuratie per niet-liquide bezitting (`assets.sale_config`).
 *
 * EÉN canonieke bron voor het *of* en *wanneer* van het verkopen van een
 * niet-liquide asset in de horizon v2-grootboek-engine. Vervangt het oude pad waar
 * een verkoop-life-event met `linked_asset_id` de driver was: voor een asset met
 * `sale_config` prevaleert `sale_config` (single source of truth). Het huis (`eigen_huis`)
 * houdt zijn eigen downsize-pad (`profiles.housing_strategy_config`,
 * `buildV2DownsizeHousing`) en valt nooit onder `sale_config`.
 *
 * Drie standen:
 *   • niet_verkopen — de bezitting blijft staan (huidig gedrag).
 *   • vast_moment   — verkoop op een vaste leeftijd of datum.
 *   • wanneer_nodig — verkoop zodra de liquide middelen tekortschieten (DEFAULT).
 *
 * RESOLVE-TIME DEFAULT: NULL in de DB → `wanneer_nodig` voor alle niet-liquide types
 * (geen backfill). Alleen een expliciete `niet_verkopen` zet de verkoop uit. Bij een
 * malformed config valt de parser óók terug op `wanneer_nodig`.
 *
 * Pure functie, geen Supabase.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type SaleStand = 'niet_verkopen' | 'vast_moment' | 'wanneer_nodig'

/** De bezitting blijft staan — wordt nooit automatisch verkocht. */
export interface NietVerkopenConfig {
  stand: 'niet_verkopen'
}

/** Verkoop op een vaste leeftijd (`triggerAge`) of datum (`triggerDate`). */
export interface VastMomentConfig {
  stand: 'vast_moment'
  /** Leeftijd waarop verkocht wordt (heeft voorrang op `triggerDate` als beide gezet). */
  triggerAge?: number | null
  /** ISO-datum waarop verkocht wordt (alternatief voor `triggerAge`). */
  triggerDate?: string | null
  /** Verkoopkosten als fractie van de verkoopprijs (undefined = type-default). */
  salesCostsPct?: number
  /** Gekoppelde schulden die met de opbrengst worden afgelost. */
  payoffDebtIds?: string[]
}

/** Verkoop zodra de liquide pot een tekort niet meer dekt (DEFAULT). */
export interface WanneerNodigConfig {
  stand: 'wanneer_nodig'
  /** Optioneel fallback-plafond: verkoop uiterlijk op deze leeftijd, ook zónder tekort. */
  triggerAge?: number | null
  /** Verkoopkosten als fractie van de verkoopprijs (undefined = type-default). */
  salesCostsPct?: number
  /** Gekoppelde schulden die met de opbrengst worden afgelost. */
  payoffDebtIds?: string[]
}

export type SaleConfig = NietVerkopenConfig | VastMomentConfig | WanneerNodigConfig

/** De resolve-time default: een niet-liquide asset zonder config wordt "wanneer nodig" verkocht. */
export const DEFAULT_SALE_CONFIG: WanneerNodigConfig = { stand: 'wanneer_nodig' }

// ── Parser (parse-met-fallback, patroon: parseHousingStrategy) ────────────────

function toFiniteNumberOrNull(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? n : null
}

/** Verkoopkosten alleen overnemen als geldig in [0, 0.20]; anders undefined (→ type-default). */
function parseSalesCostsPct(raw: unknown): number | undefined {
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) && n >= 0 && n <= 0.2 ? n : undefined
}

function parsePayoffDebtIds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const ids = raw.filter((d): d is string => typeof d === 'string')
  return ids.length > 0 ? ids : undefined
}

function parseTriggerDate(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

/**
 * Parse de `sale_config`-JSONB met fallback. NULL/missing/malformed → de
 * resolve-time default `wanneer_nodig` (zodat een niet-liquide asset zónder config
 * automatisch verkocht wordt zodra dat nodig is). Alleen een expliciete, geldige
 * `niet_verkopen` zet verkoop uit.
 */
export function parseSaleConfig(raw: unknown): SaleConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_SALE_CONFIG
  const obj = raw as Record<string, unknown>
  const stand = obj.stand

  if (stand === 'niet_verkopen') return { stand: 'niet_verkopen' }

  if (stand === 'vast_moment') {
    const cfg: VastMomentConfig = { stand: 'vast_moment' }
    const triggerAge = toFiniteNumberOrNull(obj.triggerAge)
    if (triggerAge !== null) cfg.triggerAge = triggerAge
    const triggerDate = parseTriggerDate(obj.triggerDate)
    if (triggerDate !== null) cfg.triggerDate = triggerDate
    const salesCostsPct = parseSalesCostsPct(obj.salesCostsPct)
    if (salesCostsPct !== undefined) cfg.salesCostsPct = salesCostsPct
    const payoffDebtIds = parsePayoffDebtIds(obj.payoffDebtIds)
    if (payoffDebtIds !== undefined) cfg.payoffDebtIds = payoffDebtIds
    return cfg
  }

  if (stand === 'wanneer_nodig') {
    const cfg: WanneerNodigConfig = { stand: 'wanneer_nodig' }
    const triggerAge = toFiniteNumberOrNull(obj.triggerAge)
    if (triggerAge !== null) cfg.triggerAge = triggerAge
    const salesCostsPct = parseSalesCostsPct(obj.salesCostsPct)
    if (salesCostsPct !== undefined) cfg.salesCostsPct = salesCostsPct
    const payoffDebtIds = parsePayoffDebtIds(obj.payoffDebtIds)
    if (payoffDebtIds !== undefined) cfg.payoffDebtIds = payoffDebtIds
    return cfg
  }

  // Onbekende/ontbrekende `stand` → default (wanneer_nodig).
  return DEFAULT_SALE_CONFIG
}
