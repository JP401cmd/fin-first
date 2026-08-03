// ── Lokale vrije-tekst-extractie: parser ─────────────────────────────────────
//
// Zusje van `parse.ts` — die bezit de MODEL-faalmodi (markdown-fences,
// <think>-preambles, afgekapte arrays) en wordt hier read-only hergebruikt via
// `extractLocalJsonObjects`. Wat hier bij komt is de taak-specifieke helft:
//
//  1. NORMALISATIE van wat een klein model er werkelijk van maakt — bedragen als
//     "€ 12.345,67", "280k" of "15.000", een `null` die als string "null"
//     terugkomt, een type in hoofdletters.
//  2. ENUM-HARDENING: een onbekend `asset_type`/`debt_type` wordt 'other' in
//     plaats van het item te laten vervallen. Dat mag hier — anders dan bij de
//     categorisatie, waar een fout budget stilzwijgend geld verplaatst — omdat
//     er ná deze stap altijd een review-scherm zit waarin de gebruiker de soort
//     kan bijstellen. Een onbekende SOORT LEVENSGEBEURTENIS vervalt wél: daar
//     hangt geen 'other'-rij onder maar de catalogus die de bedragen levert.
//  3. AANVULLING met de deterministische defaults en daarna een zod-`safeParse`
//     per item tegen de gedeelde vorm (lib/ai/extraction-schema.ts). Een
//     ongeldig item wordt GEDROPT, niet gerepareerd, en laat de rest van de
//     extractie staan — bij drie micro-calls is "alles weg om één rot object"
//     veel te grof.

import {
  extractionAssetSchema,
  extractionDebtSchema,
  extractionLifeEventSchema,
  EXTRACTION_ASSET_TYPES,
  EXTRACTION_DEBT_TYPES,
  type ExtractionAsset,
  type ExtractionAssetType,
  type ExtractionDebt,
  type ExtractionDebtType,
  type ExtractionLifeEvent,
} from '@/lib/ai/extraction-schema'
import { extractLocalJsonObjects } from './parse'
import {
  completeAsset,
  completeDebt,
  completeLifeEvent,
  normalizeEventType,
} from './local-extraction-defaults'

/** Maximale lengte van een door het model geleverde naam / contextzin. */
const MAX_NAME_CHARS = 60
const MAX_CONTEXT_CHARS = 300

/** Bovengrens per bedrag. Alles daarboven is een parse-artefact, geen vermogen. */
const MAX_AMOUNT = 100_000_000

const ASSET_TYPE_SET: ReadonlySet<string> = new Set(EXTRACTION_ASSET_TYPES)
const DEBT_TYPE_SET: ReadonlySet<string> = new Set(EXTRACTION_DEBT_TYPES)

/**
 * Bedrag uit modeluitvoer naar een getal. Behandelt de vormen die in de praktijk
 * langskomen: een echt getal, "15000", "15.000", "€ 12.345,67" en "280k".
 *
 * Geeft `null` bij alles wat niet ondubbelzinnig een positief bedrag is —
 * liever geen bezitting dan een bezitting met een verzonnen waarde.
 */
export function parseLocalAmount(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 && raw <= MAX_AMOUNT ? raw : null
  }
  if (typeof raw !== 'string') return null

  let s = raw.trim().toLowerCase().replace(/[€\s]/g, '')
  if (!s) return null

  // "280k" / "1,5m" — schaalachtervoegsel afsplitsen vóór de scheidingstekens.
  let scale = 1
  const suffix = s.match(/^(.*?)(k|m)$/)
  if (suffix) {
    s = suffix[1]!
    scale = suffix[2] === 'k' ? 1_000 : 1_000_000
  }

  // Nederlandse notatie: punt = duizendtal, komma = decimaal. Een enkele punt
  // met precies twee decimalen erachter is echter Engelse notatie ("1234.50").
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '')
  }

  const n = Number(s)
  if (!Number.isFinite(n) || n < 0 || n * scale > MAX_AMOUNT) return null
  return n * scale
}

/** Trim, ontdoe van omsluitende aanhalingstekens en kap af op een woordgrens. */
export function tidyLocalText(value: unknown, maxChars: number): string {
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
 * ENUM-HARDENING voor bezittingen/schulden: onbekend type → 'other'.
 * Zie de kop van dit bestand voor waarom dat hier mag.
 */
function hardenAssetType(raw: unknown): ExtractionAssetType {
  const key = typeof raw === 'string' ? raw.trim().toLowerCase().replace(/[\s-]+/g, '_') : ''
  return ASSET_TYPE_SET.has(key) ? (key as ExtractionAssetType) : 'other'
}

function hardenDebtType(raw: unknown): ExtractionDebtType {
  const key = typeof raw === 'string' ? raw.trim().toLowerCase().replace(/[\s-]+/g, '_') : ''
  return DEBT_TYPE_SET.has(key) ? (key as ExtractionDebtType) : 'other'
}

// ── Beurt 1 — bezittingen en schulden ───────────────────────────────────────

export interface LocalAssetsDebtsParseResult {
  assets: ExtractionAsset[]
  debts: ExtractionDebt[]
  /** Ruwe uitvoer leek afgekapt (zie extractLocalJsonObjects). */
  truncated: boolean
  /** Array-parse faalde maar losse objecten zijn alsnog geborgen. */
  salvaged: boolean
  /** Aantal objecten dat na normalisatie/validatie is weggevallen. */
  dropped: number
}

/**
 * Parse de uitvoer van {@link import('./local-extraction-prompt').buildAssetsDebtsPrompt}.
 * Eén array met gemengde rijen ("soort":"bezit"|"schuld") — het model hoeft dan
 * maar één keer door de tekst.
 */
export function parseLocalAssetsDebts(text: string): LocalAssetsDebtsParseResult {
  const { objects, truncated, salvaged } = extractLocalJsonObjects(text)
  const assets: ExtractionAsset[] = []
  const debts: ExtractionDebt[] = []
  let dropped = 0

  for (const obj of objects ?? []) {
    if (!obj || typeof obj !== 'object') {
      dropped++
      continue
    }
    const o = obj as Record<string, unknown>

    const name = tidyLocalText(o.naam ?? o.name, MAX_NAME_CHARS)
    const amount = parseLocalAmount(o.bedrag ?? o.amount)
    if (!name || amount === null || amount <= 0) {
      // Zonder naam of bedrag valt er niets te reviewen — weg ermee.
      dropped++
      continue
    }

    const kind = typeof o.soort === 'string' ? o.soort.trim().toLowerCase() : ''
    const typeRaw = o.type ?? o.asset_type ?? o.debt_type

    if (kind === 'schuld' || kind === 'debt') {
      const candidate = completeDebt({
        name,
        debt_type: hardenDebtType(typeRaw),
        estimated_balance: amount,
      })
      const parsed = extractionDebtSchema.safeParse(candidate)
      if (parsed.success) debts.push(parsed.data)
      else dropped++
      continue
    }

    if (kind === 'bezit' || kind === 'asset' || kind === '') {
      // Lege "soort" → bezit. Het model laat het veld soms weg bij de eerste rij;
      // een bezit is de veilige aanname (een schuld ten onrechte als bezit
      // opvoeren valt in de review meteen op, andersom veel minder).
      const candidate = completeAsset({
        name,
        asset_type: hardenAssetType(typeRaw),
        estimated_value: amount,
      })
      const parsed = extractionAssetSchema.safeParse(candidate)
      if (parsed.success) assets.push(parsed.data)
      else dropped++
      continue
    }

    dropped++
  }

  return { assets, debts, truncated, salvaged, dropped }
}

// ── Beurt 2 — levensgebeurtenissen ──────────────────────────────────────────

export interface LocalLifeEventsParseResult {
  life_events: ExtractionLifeEvent[]
  truncated: boolean
  salvaged: boolean
  dropped: number
}

/**
 * Parse de uitvoer van `buildLifeEventsPrompt`. Dedupliceert op soort (de eerste
 * wint) — het model herhaalt zichzelf, en twee keer "kinderen" op de tijdlijn is
 * twee keer het kostenplaatje.
 */
export function parseLocalLifeEvents(text: string): LocalLifeEventsParseResult {
  const { objects, truncated, salvaged } = extractLocalJsonObjects(text)
  const life_events: ExtractionLifeEvent[] = []
  const seen = new Set<string>()
  let dropped = 0

  for (const obj of objects ?? []) {
    if (!obj || typeof obj !== 'object') {
      dropped++
      continue
    }
    const o = obj as Record<string, unknown>

    const eventType = normalizeEventType(o.soort ?? o.event_type ?? o.type)
    if (!eventType || seen.has(eventType)) {
      dropped++
      continue
    }

    const ageRaw = o.leeftijd ?? o.target_age
    const ageNum = typeof ageRaw === 'number' ? ageRaw : Number(ageRaw)
    // Buiten 18-120 is het geen levensfase maar een parse-artefact (bv. een
    // jaartal). Dan liever de catalogus-default dan een onmogelijke leeftijd.
    const age = Number.isFinite(ageNum) && ageNum >= 18 && ageNum <= 120 ? ageNum : null

    const candidate = completeLifeEvent({ event_type: eventType, target_age: age })
    if (!candidate) {
      dropped++
      continue
    }
    const parsed = extractionLifeEventSchema.safeParse(candidate)
    if (!parsed.success) {
      dropped++
      continue
    }
    seen.add(eventType)
    life_events.push(parsed.data)
  }

  return { life_events, truncated, salvaged, dropped }
}

// ── Beurt 3 — inkomen, uitgaven en de rest ──────────────────────────────────

export interface LocalIncomeExpensesParseResult {
  monthly_income_estimate: number | null
  monthly_expenses_estimate: number | null
  financial_context_remainder: string
}

/**
 * Parse de uitvoer van `buildIncomeExpensesPrompt`. Eén object; ontbreekt het of
 * is het onleesbaar, dan is `null`/lege string het eerlijke antwoord — nooit een
 * schatting uit de profielcontext, want dan zou de app haar eigen aanname als
 * "uitgelezen uit je tekst" presenteren.
 */
export function parseLocalIncomeExpenses(text: string): LocalIncomeExpensesParseResult {
  const { objects } = extractLocalJsonObjects(text)
  const first = (objects ?? []).find((o) => o !== null && typeof o === 'object') as
    | Record<string, unknown>
    | undefined

  if (!first) {
    return {
      monthly_income_estimate: null,
      monthly_expenses_estimate: null,
      financial_context_remainder: '',
    }
  }

  const income = parseLocalAmount(first.inkomen ?? first.monthly_income_estimate)
  const expenses = parseLocalAmount(first.uitgaven ?? first.monthly_expenses_estimate)

  return {
    // 0 is geen inkomen maar een niet-ingevuld veld — als null behandelen.
    monthly_income_estimate: income !== null && income > 0 ? Math.round(income) : null,
    monthly_expenses_estimate: expenses !== null && expenses > 0 ? Math.round(expenses) : null,
    financial_context_remainder: tidyLocalText(
      first.context ?? first.financial_context_remainder,
      MAX_CONTEXT_CHARS,
    ),
  }
}
