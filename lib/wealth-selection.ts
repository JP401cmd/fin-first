/**
 * DE ENE BRON voor de vorm van de "vermogens-widget met eigen selectie"
 * (ADR 0120) — de pref, de validatie ervan, en de pure omzetting van rijen +
 * snapshot-reeksen naar het bundelveld `wealthSelectionWidget`.
 *
 * ── WAAROM DIT EEN EIGEN BESTAND IS ────────────────────────────────────────
 * De selectie is een WEERGAVE-VOORKEUR, geen domein-data: één selectie per
 * gebruiker onder `profiles.feature_preferences.wealth_widget_selection`
 * (ADR 0120 besluit 1). Géén tabel, géén kolom. Precies daarom moet de vórm
 * op één plek wonen: hij wordt gelezen én geschreven door drie partijen die
 * elkaar niet kennen —
 *
 *  1. `lib/dashboard-data-loader.ts` (lezen + gaten van het bundelveld),
 *  2. `app/api/wealth-selection/route.ts` (GET keuzelijst, PUT read-modify-write),
 *  3. de bewerk-sheet in de widget-laag (leest de keuzelijst lazy via die route).
 *
 * Herhaalde die vorm zich per plek, dan is de eerste uitbreiding (meerdere
 * benoemde selecties — bewust een latere stap, ADR 0120 besluit 1) meteen een
 * drie-plekken-migratie. Zo is het er één.
 *
 * ── WAAROM DE WEGING HIER HARD VASTLIGT ────────────────────────────────────
 * De historie komt uit `balance_snapshots` via `loadEntitySparklines`, en die
 * weegt zijn punten al met `net_worth_inclusion_pct`. De ACTUELE som moet dus
 * identiek wegen (`current_value × pct/100`, schuld `current_balance × pct/100`),
 * anders ligt er een knik op de naad actueel↔historie — de fout die ADR 0090/0093
 * elders uitbanden. Vandaar dat `weightedAssetValue`/`weightedDebtValue` hier
 * wonen en niemand zijn eigen som schrijft.
 *
 * Puur en server/client-neutraal: geen supabase, geen React, geen fetch.
 *
 * NB — naamgeving: geen `compute*`/`simulate*`-exports. Dit is een projectie
 * (selecteren, wegen, optellen), geen rekenmotor; die prefixen zijn in
 * top-level `lib/` gereserveerd voor de gecatalogiseerde motoren
 * (`lib/architecture/calc-coverage.test.ts`).
 */

import { z } from 'zod'
import type { WealthSelectionWidgetData } from '@/lib/types/dashboard'

// ── Pref-vorm ───────────────────────────────────────────────────────────────

/** De opgeslagen selectie: welke bezittingen en schulden telt de widget op. */
export interface WealthSelection {
  assetIds: string[]
  debtIds: string[]
}

/** Sleutel binnen de `profiles.feature_preferences`-JSONB. */
export const WEALTH_SELECTION_PREF_KEY = 'wealth_widget_selection'

/** Widget-id in `profiles.widget_prefs` (catalogus-entry leeft in de widget-laag). */
export const WEALTH_SELECTION_WIDGET_ID = 'vermogen_selectie'

/**
 * Bovengrens per lijst. Ruim boven elk realistisch aantal bezittingen/schulden,
 * maar hard genoeg dat een geknoeide pref geen `.in(...)`-query van duizenden
 * id's kan afdwingen (de PUT-route valideert op hetzelfde getal).
 */
export const WEALTH_SELECTION_MAX_IDS = 200

/** Aantal posten in `topItems` (het full-formaat van de widget). */
export const WEALTH_SELECTION_TOP_ITEMS = 4

/**
 * Minimum aantal maanden met échte snapshot-data vóór we een lijn tonen.
 * Onder deze grens is `history` leeg en toont de widget "nog geen verloop" —
 * nooit een verzonnen lijn (ADR 0120, gevolgen).
 */
export const WEALTH_SELECTION_MIN_HISTORY_POINTS = 2

/** Naam-terugval voor een post zonder ingevulde naam. */
const UNNAMED = 'Naamloos'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Defensieve id-lijst-lezing: alleen echte uuid-strings, ontdubbeld, afgekapt op
 * `WEALTH_SELECTION_MAX_IDS`. De JSONB-kolom is door de gebruiker beschrijfbaar
 * (own-row RLS), dus alles wat hier binnenkomt is onbetrouwbaar tot het tegendeel
 * blijkt — een niet-uuid zou anders ongefilterd in een `.in(...)` belanden.
 */
function sanitizeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of raw) {
    if (typeof v !== 'string') continue
    const id = v.toLowerCase()
    if (!UUID_RE.test(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= WEALTH_SELECTION_MAX_IDS) break
  }
  return out
}

/**
 * Leest de selectie uit een `feature_preferences`-JSONB.
 *
 * Geeft `null` terug wanneer er geen bruikbare selectie staat: geen object,
 * sleutel afwezig, sleutel geen object, of beide lijsten leeg na sanitatie.
 * `null` = "de widget heeft niets te tonen" en is voor de loader het signaal om
 * het bundelveld niet te vullen.
 */
export function parseWealthSelection(featurePreferences: unknown): WealthSelection | null {
  if (!featurePreferences || typeof featurePreferences !== 'object') return null
  const raw = (featurePreferences as Record<string, unknown>)[WEALTH_SELECTION_PREF_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const entry = raw as Record<string, unknown>
  const assetIds = sanitizeIds(entry.assetIds)
  const debtIds = sanitizeIds(entry.debtIds)
  if (assetIds.length === 0 && debtIds.length === 0) return null

  return { assetIds, debtIds }
}

/** Zod-schema voor de PUT-body van `/api/wealth-selection`. */
export const WealthSelectionBodySchema = z.object({
  assetIds: z.array(z.uuid()).max(WEALTH_SELECTION_MAX_IDS),
  debtIds: z.array(z.uuid()).max(WEALTH_SELECTION_MAX_IDS),
})

export type WealthSelectionBody = z.infer<typeof WealthSelectionBodySchema>

/**
 * De gate van het bundelveld: de widget staat aan én er staat een selectie.
 * Pure functie zodat de loader-beslissing los getest kan worden (spiegel van
 * `resolveWidgetComputeFlags`).
 */
export function isWealthSelectionWidgetActive(
  activeWidgetIds: readonly string[],
  selection: WealthSelection | null,
): boolean {
  return selection !== null && activeWidgetIds.includes(WEALTH_SELECTION_WIDGET_ID)
}

// ── Rij-vormen + weging ─────────────────────────────────────────────────────

/** Minimale rijvorm van een bezitting die de widget nodig heeft. */
export interface WealthSelectionAssetRow {
  id: string
  name?: string | null
  current_value?: number | string | null
  net_worth_inclusion_pct?: number | string | null
}

/** Minimale rijvorm van een schuld die de widget nodig heeft. */
export interface WealthSelectionDebtRow {
  id: string
  name?: string | null
  current_balance?: number | string | null
  net_worth_inclusion_pct?: number | string | null
}

/** `pct/100`, met 100% als terugval bij null/onleesbaar. */
function weight(pct: number | string | null | undefined): number {
  const n = Number(pct ?? 100)
  return Number.isFinite(n) ? n / 100 : 1
}

function amount(value: number | string | null | undefined): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

/** Gewogen huidige waarde van een bezitting (`current_value × pct/100`). */
export function weightedAssetValue(row: WealthSelectionAssetRow): number {
  return amount(row.current_value) * weight(row.net_worth_inclusion_pct)
}

/**
 * Gewogen huidige saldo van een schuld (`current_balance × pct/100`), als
 * POSITIEF getal. Het minteken zit in de optelling, niet in deze waarde — zo
 * blijft `debtsTotal` leesbaar als "hoeveel schuld" en `topItems[].value` als
 * "hoe groot is deze post".
 */
export function weightedDebtValue(row: WealthSelectionDebtRow): number {
  return amount(row.current_balance) * weight(row.net_worth_inclusion_pct)
}

// ── Historie ────────────────────────────────────────────────────────────────

/**
 * De historie-invoer voor de builder: de reeksen zoals `loadEntitySparklines`
 * ze oplevert, plus de maandsleutels van hetzelfde 12-maands venster.
 *
 * BELANGRIJK over de uitlijning: een reeks uit `loadEntitySparklines` is
 * afgeknipt op de EERSTE echte meting (geen leading forward-fill) en loopt tot
 * de huidige maand. Een reeks van lengte L hoort dus bij de LAATSTE L
 * maandsleutels — daarom lijnt de builder rechts uit, niet links.
 */
export interface WealthSelectionHistoryInput {
  /** 12 maandsleutels `YYYY-MM`, oud → nieuw. */
  monthKeys: readonly string[]
  /** `entity_id` → gewogen maandwaarden (oud → nieuw), uit `loadEntitySparklines`. */
  assetSeries: Readonly<Record<string, number[]>>
  debtSeries: Readonly<Record<string, number[]>>
}

/**
 * Somt de per-entiteit-reeksen op tot één maandreeks van de selectie.
 *
 * Regels (spiegel van `loadEntitySparklines`):
 *  · een entiteit zonder meting in maand M telt in die maand als 0 — dat is de
 *    waarheid ("bestond toen nog niet"), geen gat;
 *  · maanden vóór de eerste meting van ÁLLE entiteiten leveren geen punt op:
 *    geen leading fill, dus geen historie die er niet was;
 *  · onder `WEALTH_SELECTION_MIN_HISTORY_POINTS` echte maanden is er geen lijn,
 *    alleen een punt — dan liever niets dan een schijnverloop.
 */
function buildHistory(
  selection: WealthSelection,
  history: WealthSelectionHistoryInput,
): WealthSelectionWidgetData['history'] {
  const months = history.monthKeys.length
  if (months === 0) return []

  const totals = new Array<number>(months).fill(0)
  const hasData = new Array<boolean>(months).fill(false)

  const add = (ids: readonly string[], series: Readonly<Record<string, number[]>>, sign: 1 | -1) => {
    for (const id of ids) {
      const values = series[id]
      if (!values || values.length === 0) continue
      // Rechts uitlijnen: de laatste waarde hoort bij de laatste maandsleutel.
      const offset = months - values.length
      for (let i = 0; i < values.length; i++) {
        const idx = offset + i
        if (idx < 0 || idx >= months) continue
        totals[idx] += sign * values[i]
        hasData[idx] = true
      }
    }
  }

  add(selection.assetIds, history.assetSeries, 1)
  add(selection.debtIds, history.debtSeries, -1)

  const firstReal = hasData.indexOf(true)
  if (firstReal === -1) return []

  const points = []
  for (let i = firstReal; i < months; i++) {
    points.push({ month: history.monthKeys[i], value: roundCents(totals[i]) })
  }
  return points.length < WEALTH_SELECTION_MIN_HISTORY_POINTS ? [] : points
}

// ── Builder ─────────────────────────────────────────────────────────────────

/**
 * Bouwt het bundelveld `wealthSelectionWidget` uit de selectie, de eigen
 * bezittings-/schuldrijen en de snapshot-reeksen. PUUR: geen IO, geen `now`.
 *
 * STALE-VRIJ (ADR 0120 besluit 5): alleen id's waarvoor een rij is meegegeven
 * tellen mee. Een verwijderde bezitting die nog in de pref staat verdwijnt
 * stil — de som liegt nooit door een dode referentie. De teruggegeven
 * `count` telt dus de LEVENDE posten, niet de opgeslagen id's.
 */
export function buildWealthSelectionWidgetData(
  selection: WealthSelection,
  assets: readonly WealthSelectionAssetRow[],
  debts: readonly WealthSelectionDebtRow[],
  history: WealthSelectionHistoryInput,
): WealthSelectionWidgetData | null {
  const assetById = new Map(assets.map(a => [a.id, a]))
  const debtById = new Map(debts.map(d => [d.id, d]))

  // Een selectie waarvan geen enkele rij meer bestaat is geen "€ 0" maar
  // gewoon géén selectie: null → de widget toont de kies-empty-state. Een
  // gevulde tak met € 0 en "historie groeit vanaf je volgende snapshot" zou
  // op beide punten liegen (review 🟡3; ADR 0120 besluit 5).
  const liveCount =
    selection.assetIds.filter(id => assetById.has(id)).length +
    selection.debtIds.filter(id => debtById.has(id)).length
  if (liveCount === 0) return null

  const liveAssetIds = selection.assetIds.filter(id => assetById.has(id))
  const liveDebtIds = selection.debtIds.filter(id => debtById.has(id))

  const items: WealthSelectionWidgetData['topItems'] = []
  let assetsTotal = 0
  for (const id of liveAssetIds) {
    const row = assetById.get(id)!
    const value = weightedAssetValue(row)
    assetsTotal += value
    items.push({ name: (row.name ?? '').trim() || UNNAMED, value: roundCents(value), kind: 'asset' })
  }

  let debtsTotal = 0
  for (const id of liveDebtIds) {
    const row = debtById.get(id)!
    const value = weightedDebtValue(row)
    debtsTotal += value
    items.push({ name: (row.name ?? '').trim() || UNNAMED, value: roundCents(value), kind: 'debt' })
  }

  const topItems = items
    .slice()
    .sort((a, b) => b.value - a.value)
    .slice(0, WEALTH_SELECTION_TOP_ITEMS)

  return {
    total: roundCents(assetsTotal - debtsTotal),
    assetsTotal: roundCents(assetsTotal),
    debtsTotal: roundCents(debtsTotal),
    count: { assets: liveAssetIds.length, debts: liveDebtIds.length },
    history: buildHistory({ assetIds: liveAssetIds, debtIds: liveDebtIds }, history),
    topItems,
  }
}

/**
 * De 12 maandsleutels `YYYY-MM` (oud → nieuw) van hetzelfde venster dat
 * `loadEntitySparklines` gebruikt. Hier zodat loader en reeksen gegarandeerd
 * op dezelfde maanden uitkomen — twee losse afleidingen zouden op een
 * maandgrens uit elkaar kunnen lopen.
 *
 * LETTERLIJK dezelfde afleiding als daar: lokale jaar/maand van `now`, in een
 * UTC-datum gezet. Wijk hier niet naar `getUTCMonth()` af — dat verschuift op
 * de laatste dag van een maand een tijdzone-uur en zet de reeks één maand
 * scheef t.o.v. de sleutels.
 */
export function wealthSelectionMonthKeys(now: Date): string[] {
  const keys: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1))
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}
