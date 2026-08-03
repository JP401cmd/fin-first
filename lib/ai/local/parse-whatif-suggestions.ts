// ── Lokale wat-als-suggesties: parser + deterministische resolver ────────────
//
// Zusje van `parse-intent.ts`: het model stelt voor, de code beslist over de
// cijfers. Waar de fin-actie-resolver de canonieke waarden uit het
// `LocalChatOverview` haalt, haalt deze ze uit de LEVENSGEBEURTENIS-CATALOGUS
// (`LIFE_EVENT_CATALOG` + `computeSuggestedEventValues`) — precies de bron die
// het formulier op /toekomst ook gebruikt wanneer je zo'n gebeurtenis toevoegt.
//
// ── CIJFER-GUARDRAIL — consume, don't recompute (harde regel, CLAUDE.md) ─────
//
// Het model levert alleen `{event_type, name, explanation}`. Zou het toch een
// bedrag noemen (in de naam of de uitleg), dan toetsen we dat tegen de
// opgeloste, canonieke waarden; klopt het niet, dan vervalt de kaart. Geen
// catalogus-match → GEEN kaart (fail-closed), en een match die nergens een
// bedrag oplevert (bv. `custom`) evenmin: een suggestiekaart zonder effect is
// ruis in een scherm dat over effect gaat.
//
// ── TEKEN-CONVENTIE ─────────────────────────────────────────────────────────
//
// `SuggestedEvent` spiegelt de kolommen van `life_events`. De omzetting van
// {amount, direction, durationType} naar die kolommen is één-op-één overgenomen
// uit `saveEvent` in components/app/horizon/horizon-client.tsx:
//
//     eenmalig            → one_time_cost = uitgave ? +bedrag : −bedrag
//     doorlopend inkomen  → monthly_income_change = +bedrag
//     doorlopende uitgave → monthly_cost_change   = +bedrag
//
// Met één gedocumenteerde correctie, zie {@link INCOME_LOSS_TYPES}.

import { LIFE_EVENT_CATALOG } from '@/lib/horizon-data'
import { computeSuggestedEventValues, type EventPrefillContext } from '@/lib/horizon/event-prefill'
import type { SuggestedEvent } from '@/lib/types/horizon-whatif'
import { extractLocalJsonObjects } from './parse'
import { guardFigures } from './figure-guard'
import { LOCAL_WHATIF_EVENT_TYPE_SET, LOCAL_WHATIF_MAX_SUGGESTIONS } from './local-whatif-prompt'

/**
 * Soorten waarbij de prefill-heuristiek een INKOMENSVERLIES als positief bedrag
 * teruggeeft (sabbatical zelfs met `direction: 'income'`). Het formulier zet die
 * in `saveEvent` expliciet om naar een negatieve `monthly_income_change`
 * (horizon-client.tsx: `monthlyIncomeChange = -inkomensverlies`). Zonder deze
 * correctie zou een sabbatical-suggestie als extra inkomen op de kaart staan —
 * exact het tegenovergestelde van wat er gebeurt.
 */
const INCOME_LOSS_TYPES: ReadonlySet<string> = new Set(['sabbatical', 'part_time', 'early_retirement'])

/** Maximale lengte van de door het model geleverde tekstvelden. */
const MAX_NAME_CHARS = 60
const MAX_EXPLANATION_CHARS = 200

/** Ruwe, geparste suggestie — precies de drie velden die het model mag leveren. */
export interface RawLocalWhatifSuggestion {
  event_type: string
  name: string
  explanation: string
}

export interface LocalWhatifParseResult {
  /** De geldige ruwe voorstellen (soort in de gesloten lijst), in volgorde. */
  items: RawLocalWhatifSuggestion[]
  /** Ruwe output leek afgekapt (zie extractLocalJsonObjects). */
  truncated: boolean
  /** Array-parse faalde maar losse objecten zijn alsnog geborgen. */
  salvaged: boolean
}

/** Trim, ontdoe van omsluitende aanhalingstekens en kap af op een woordgrens. */
function tidyText(value: unknown, maxChars: number): string {
  if (typeof value !== 'string') return ''
  let s = value.trim().replace(/^["'“„]|["'”]$/g, '').replace(/\s+/g, ' ').trim()
  if (s.length > maxChars) {
    const window = s.slice(0, maxChars)
    const lastSpace = window.lastIndexOf(' ')
    s = (lastSpace > 20 ? window.slice(0, lastSpace) : window).trim()
  }
  return s
}

/**
 * Parse de modeluitvoer naar ruwe voorstellen. Hergebruikt de generieke
 * extractie uit parse.ts (fences, `<think>`-preambles, afkapping-salvage) en
 * filtert daarna hard op de gesloten soortenlijst — de tegenhanger van
 * `resolveSlug` in het categorisatiepad.
 *
 * Liever één geldig voorstel dan drie half-geparste: onbruikbare objecten
 * worden stilzwijgend overgeslagen, niet gerepareerd.
 */
export function parseLocalWhatifSuggestions(text: string): LocalWhatifParseResult {
  const { objects, truncated, salvaged } = extractLocalJsonObjects(text)
  const items: RawLocalWhatifSuggestion[] = []

  for (const obj of objects ?? []) {
    if (!obj || typeof obj !== 'object') continue
    const o = obj as Record<string, unknown>
    const type = typeof o.event_type === 'string' ? o.event_type.trim().toLowerCase() : ''
    if (!LOCAL_WHATIF_EVENT_TYPE_SET.has(type)) continue // onbekende soort → weg
    items.push({
      event_type: type,
      name: tidyText(o.name, MAX_NAME_CHARS),
      explanation: tidyText(o.explanation, MAX_EXPLANATION_CHARS),
    })
  }

  return { items, truncated, salvaged }
}

/**
 * Los één ruw voorstel op tot een volledige `SuggestedEvent` met CANONIEKE
 * bedragen uit de catalogus.
 *
 * FAIL-CLOSED — geeft `null` wanneer:
 *  - de soort niet in de catalogus staat (geen bron voor de cijfers);
 *  - de catalogus geen enkel bedrag oplevert (kaart zonder effect);
 *  - de tekstvelden een bedrag/percentage noemen dat niet klopt met de
 *    opgeloste waarden (cijfer-guardrail).
 */
export function resolveLocalWhatifSuggestion(
  raw: RawLocalWhatifSuggestion,
  ctx: EventPrefillContext,
): SuggestedEvent | null {
  const catalog = LIFE_EVENT_CATALOG[raw.event_type]
  if (!catalog) return null

  const values = computeSuggestedEventValues(raw.event_type, ctx)
  const amount = Math.round(Math.abs(values.amount))

  let oneTimeCost = 0
  let monthlyCostChange = 0
  let monthlyIncomeChange = 0

  if (values.durationType === 'one_time') {
    oneTimeCost = values.direction === 'expense' ? amount : -amount
  } else if (values.direction === 'income') {
    monthlyIncomeChange = amount
  } else {
    monthlyCostChange = amount
  }

  // Inkomensverlies-correctie (zie INCOME_LOSS_TYPES): het bedrag is een verlies,
  // geen bijverdienste.
  if (INCOME_LOSS_TYPES.has(raw.event_type)) {
    monthlyIncomeChange = -amount
    monthlyCostChange = 0
    oneTimeCost = 0
  }

  // Geen enkel bedrag → geen kaart. Dit vangt óók de soorten zonder catalogus-
  // defaults af zonder daar een aparte uitzonderingslijst voor nodig te hebben.
  if (oneTimeCost === 0 && monthlyCostChange === 0 && monthlyIncomeChange === 0) return null

  const durationMonths = values.durationType === 'period' ? Math.round(Number(values.duration) || 0) : 0
  const targetAge =
    typeof values.age === 'number' && Number.isFinite(values.age) ? Math.round(values.age) : null

  const name = raw.name || catalog.label
  const explanation = raw.explanation || catalog.description

  // CIJFER-GUARDRAIL: het model is geïnstrueerd géén getallen te noemen. Doet het
  // dat tóch, dan moet het cijfer kloppen met de canonieke waarden — anders
  // vervalt de kaart in plaats van een verzonnen bedrag te tonen.
  const allowed = [oneTimeCost, monthlyCostChange, monthlyIncomeChange, durationMonths]
  if (targetAge != null) allowed.push(targetAge)
  const guard = guardFigures(`${name} ${explanation}`, allowed)
  if (!guard.ok) {
    console.error('[lokale-ai] wat-als-suggestie verworpen (cijfer-mismatch):', guard.offending)
    return null
  }

  return {
    event_type: raw.event_type,
    name,
    target_age: targetAge,
    one_time_cost: oneTimeCost,
    monthly_cost_change: monthlyCostChange,
    monthly_income_change: monthlyIncomeChange,
    duration_months: durationMonths,
    explanation,
  }
}

/**
 * Los een reeks ruwe voorstellen op: dedupliceer op soort (eerste wint), sla de
 * al actieve soorten over en kap af op `max`. Levert een lege lijst wanneer er
 * niets overblijft — een eerlijke lege staat, NOOIT een stille terugval naar
 * /api/whatif/suggest.
 */
export function resolveLocalWhatifSuggestions(
  raws: RawLocalWhatifSuggestion[],
  ctx: EventPrefillContext,
  opts: { excludeTypes?: Iterable<string>; max?: number } = {},
): SuggestedEvent[] {
  const max = opts.max ?? LOCAL_WHATIF_MAX_SUGGESTIONS
  const seen = new Set<string>(opts.excludeTypes ?? [])
  const out: SuggestedEvent[] = []

  for (const raw of raws) {
    if (out.length >= max) break
    if (seen.has(raw.event_type)) continue
    seen.add(raw.event_type)
    const resolved = resolveLocalWhatifSuggestion(raw, ctx)
    if (resolved) out.push(resolved)
  }

  return out
}
