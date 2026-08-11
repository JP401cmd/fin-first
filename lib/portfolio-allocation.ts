/**
 * Portfolio allocation computation utilities.
 *
 * Pure functions for computing allocation slices and rebalancing suggestions.
 * Can be imported from both client components and server-side routes.
 */

// ── Types ────────────────────────────────────────────────────

/**
 * De dimensies waarlangs de portefeuille verdeeld getoond kan worden.
 *
 * 'sector' stond hier ook, maar is aug 2026 vervallen. Reden: er was geen bron.
 * De classificatie komt uit de koersfeed (Yahoo's chart-meta levert
 * `instrumentType` en de beurs mee in de call die de prijsvernieuwing tóch
 * doet), en sector zit daar níét bij — dat vraagt Yahoo's `quoteSummary`, dat
 * met cookie-authenticatie is afgeschermd (401 "Invalid Crumb"). In productie
 * had 1 van de 116 posities een sector. Een tab die structureel "Overig 100%"
 * toont, suggereert een verdeling die niet gemeten is; dan is hem weglaten
 * eerlijker dan hem vullen. Voor een breed gespreide ETF is "sector" bovendien
 * betekenisloos.
 */
export type AllocationViewMode = 'asset_class' | 'geography'

export type HoldingForAllocation = {
  id: string
  name: string
  ticker: string | null
  value: number
  // Classification fields
  asset_class?: string | null
  sector?: string | null
  geography?: string | null
}

export type TargetAllocation = {
  category: string
  target_pct: number
}

export type AllocationSlice = {
  key: string
  label: string
  value: number
  pct: number
  color: string
  holdingCount: number
}

export type RebalancingSuggestion = {
  category: string
  current_pct: number
  target_pct: number
  drift: number
  action: 'buy' | 'sell' | 'hold'
  amount: number
  label: string
}

// ── Constants ────────────────────────────────────────────────

export const ASSET_CLASS_LABELS: Record<string, string> = {
  aandelen: 'Aandelen',
  // Bewust een eigen categorie naast 'aandelen'/'obligaties': de koersfeed
  // levert `instrumentType`, en dat beschrijft de VERPAKKING, niet de inhoud.
  // Een obligatie-ETF is óók instrumentType ETF; die onder "Aandelen" scharen
  // zou een fout getal opleveren, geen ruwe benadering.
  etf: 'ETF/fondsen',
  obligaties: 'Obligaties',
  vastgoed: 'Vastgoed',
  grondstoffen: 'Grondstoffen',
  crypto: 'Crypto',
  cash: 'Cash/Spaargeld',
  anders: 'Overig',
}

/**
 * Waarden uit een ouder vocabulaire, vertaald bij het LEZEN.
 *
 * De database draagt nog rijen met `equity`/`bonds` (uit een eerdere
 * classificatie-ronde) terwijl de labels hierboven Nederlands zijn. Zonder deze
 * vertaling viel zo'n rij door de label-lookup heen en verscheen de rauwe
 * sleutel in de grafiek — precies wat er stond: een taartpunt met het label
 * "equity". Vertalen bij het lezen houdt oude rijen correct zonder migratie;
 * de koersvernieuwing normaliseert ze daarnaast bij het schrijven.
 */
const LEGACY_CATEGORY_ALIASES: Record<string, string> = {
  equity: 'aandelen',
  equities: 'aandelen',
  stock: 'aandelen',
  stocks: 'aandelen',
  bond: 'obligaties',
  bonds: 'obligaties',
  fund: 'etf',
  fonds: 'etf',
  fondsen: 'etf',
  realestate: 'vastgoed',
  real_estate: 'vastgoed',
  commodities: 'grondstoffen',
}

export const GEOGRAPHY_LABELS: Record<string, string> = {
  wereld: 'Wereld (breed)',
  europa: 'Europa',
  noord_amerika: 'Noord-Amerika',
  azie: 'Azië-Pacific',
  opkomend: 'Opkomende markten',
  nederland: 'Nederland',
  anders: 'Overig',
}

export const VIEW_MODE_LABELS: Record<AllocationViewMode, string> = {
  asset_class: 'Assetklasse',
  geography: 'Geografie',
}

export const CATEGORY_LABELS: Record<AllocationViewMode, Record<string, string>> = {
  asset_class: ASSET_CLASS_LABELS,
  geography: GEOGRAPHY_LABELS,
}

export const ALLOCATION_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#f97316', // orange
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#6366f1', // indigo
  '#84cc16', // lime
  '#d946ef', // fuchsia
  '#14b8a6', // teal
  '#e11d48', // rose
]

export const DEFAULT_TARGETS: Record<AllocationViewMode, TargetAllocation[]> = {
  asset_class: [
    { category: 'aandelen', target_pct: 60 },
    { category: 'obligaties', target_pct: 20 },
    { category: 'vastgoed', target_pct: 10 },
    { category: 'cash', target_pct: 5 },
    { category: 'crypto', target_pct: 5 },
  ],
  geography: [
    { category: 'wereld', target_pct: 50 },
    { category: 'europa', target_pct: 20 },
    { category: 'noord_amerika', target_pct: 15 },
    { category: 'opkomend', target_pct: 10 },
    { category: 'azie', target_pct: 5 },
  ],
}

// ── Utility: classify a holding based on its metadata ────────

/**
 * Normaliseert een opgeslagen categorie naar het canonieke vocabulaire.
 * Onbekende waarden blijven ongemoeid — ze verschijnen dan als eigen groep met
 * hun rauwe sleutel, wat zichtbaar maakt dát er iets niet gemapt is.
 */
export function normalizeCategory(value: string): string {
  const key = value.trim().toLowerCase()
  return LEGACY_CATEGORY_ALIASES[key] ?? key
}

function classifyHolding(
  holding: HoldingForAllocation,
  mode: AllocationViewMode,
): string {
  const field = holding[mode]
  if (field && field !== '') return normalizeCategory(field)
  return 'anders'
}

// ── Utility: compute allocation slices ──────────────────────

export function computeAllocationSlices(
  holdings: HoldingForAllocation[],
  mode: AllocationViewMode,
): AllocationSlice[] {
  const groups: Record<string, { value: number; count: number }> = {}
  const total = holdings.reduce((s, h) => s + h.value, 0)

  for (const h of holdings) {
    if (h.value <= 0) continue
    const key = classifyHolding(h, mode)
    if (!groups[key]) groups[key] = { value: 0, count: 0 }
    groups[key].value += h.value
    groups[key].count += 1
  }

  const labels = CATEGORY_LABELS[mode]
  return Object.entries(groups)
    .map(([key, data], i) => ({
      key,
      label: labels[key] || key,
      value: data.value,
      pct: total > 0 ? (data.value / total) * 100 : 0,
      color: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
      holdingCount: data.count,
    }))
    .sort((a, b) => b.value - a.value)
}

// ── Utility: compute rebalancing suggestions ────────────────

export function computeRebalancingSuggestions(
  slices: AllocationSlice[],
  targets: TargetAllocation[],
  totalValue: number,
): RebalancingSuggestion[] {
  if (targets.length === 0 || totalValue <= 0) return []

  const DRIFT_THRESHOLD = 2 // Only suggest if drift > 2%

  return targets
    .map((t) => {
      // De doelrij draagt het vocabulaire waarin hij ooit is opgeslagen
      // ('equity', 'bonds'), de slice-sleutel is genormaliseerd ('aandelen',
      // 'obligaties'). Zonder deze normalisatie vindt `find` niets, valt
      // `current_pct` terug op 0 en adviseert een volbelegde portefeuille om
      // 80% bij te kopen. Normaliseren op de ONTMOETING, niet in de DB: de
      // opgeslagen rij blijft zoals hij is.
      const key = normalizeCategory(t.category)
      const slice = slices.find((s) => s.key === key)
      const currentPct = slice?.pct ?? 0
      const drift = currentPct - t.target_pct
      const absDrift = Math.abs(drift)
      const amount = (absDrift / 100) * totalValue
      const labels = { ...ASSET_CLASS_LABELS, ...GEOGRAPHY_LABELS }
      const label = labels[key] || labels[t.category] || t.category

      let action: 'buy' | 'sell' | 'hold' = 'hold'
      if (drift < -DRIFT_THRESHOLD) action = 'buy'
      if (drift > DRIFT_THRESHOLD) action = 'sell'

      return {
        category: t.category,
        current_pct: Math.round(currentPct * 10) / 10,
        target_pct: t.target_pct,
        drift: Math.round(drift * 10) / 10,
        action,
        amount: Math.round(amount),
        label,
      }
    })
    .filter((s) => s.action !== 'hold')
    .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))
}
