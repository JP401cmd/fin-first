/**
 * Shared formatting utilities (server-safe, no 'use client').
 */

import { amsterdamParts, NL_DAY_ABBR, NL_MONTH_ABBR } from './tz'

/**
 * Guard against NaN/undefined/Infinity — returns 0 for any non-finite input.
 */
function safeNumber(value: unknown): number {
  if (value == null || typeof value !== 'number' || !isFinite(value)) {
    return 0
  }
  return value
}

// ── Centrale afrondingshelpers ([Arch F4]) ────────────────────────────
//
// Eén huis voor euro-afronding. Vóór deze helpers waren er twee idiomen naast
// elkaar — `Math.round(x*100)/100` (idioom A) en `parseFloat(x.toFixed(2))`
// (idioom B) — plus losse lokale `round2`/`round1`-helpers. Idioom A en B
// verschillen in exotische floating-point-randgevallen; dit blok legt idioom A
// vast als canoniek (conform de F2-lint die idioom B in app/**+components/**
// verbiedt).
//
// Regel: afronden hoort bij WEERGAVE / response-shaping. Accumulatoren blijven
// ONGEROND — het patroon dat de rekenkernen al volgen. Rond dus pas af op de
// uitvoer-rij, nooit tussentijds in een som.
//
// Alle helpers hergebruiken de `safeNumber`-guard (NaN/Infinity/undefined → 0).
// Dat is essentieel bij het vervangen van een ongeguarde inline-afronding:
// zonder guard zou een niet-eindige tussenwaarde als NaN doorlekken.

/**
 * Halve cent — de drempel waaronder twee geldbedragen als "gelijk" gelden.
 *
 * Vooruitlopende, gedocumenteerde standaard ([Arch F4] beslispunt c): er is nog
 * geen call-site. Gebruik dit i.p.v. een losse `0.005`/`1e-2` zodra euro-
 * bedragen uit verschillende afrondingspaden vergeleken moeten worden, zodat een
 * sub-cent floating-point-residu geen vals verschil oplevert
 * (`Math.abs(a - b) < CENT_EPSILON`).
 */
export const CENT_EPSILON = 0.005

/**
 * Rond een geldbedrag af op hele centen (2 decimalen) — dé centrale euro-
 * afronder. Canoniek idioom A (`Math.round(x*100)/100`); byte-identiek aan de
 * inline-vorm voor eindige input, en NaN/Infinity/undefined → 0 via `safeNumber`.
 */
export function roundCents(value: number): number {
  return Math.round(safeNumber(value) * 100) / 100
}

/**
 * Rond een geldbedrag af op hele euro's (0 decimalen). Zie `roundCents` voor de
 * canonieke-idioom- en guard-motivatie.
 */
export function roundEuro(value: number): number {
  return Math.round(safeNumber(value))
}

/**
 * Rond af op tienden (1 decimaal). Voor afgeleide 1-decimaal-grootheden zoals
 * `freedom_days_per_year` (vrijheidsdagen) die geen centen zijn maar wel een
 * vaste weergaveprecisie hebben.
 */
export function roundTenths(value: number): number {
  return Math.round(safeNumber(value) * 10) / 10
}

/**
 * Algemene afronding op `decimals` decimalen (idioom A). `roundCents`/
 * `roundTenths` zijn de benoemde snelkoppelingen voor 2/1 decimalen; gebruik
 * deze voor een variabel aantal decimalen. Niet-positieve/niet-eindige
 * `decimals` valt terug op 0 decimalen.
 */
export function roundToDecimals(value: number, decimals: number): number {
  const d = Number.isFinite(decimals) && decimals > 0 ? Math.floor(decimals) : 0
  const factor = Math.pow(10, d)
  return Math.round(safeNumber(value) * factor) / factor
}

export function formatCurrency(value: number): string {
  const safe = safeNumber(value)
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safe)
}

export function formatCurrencyDecimals(value: number): string {
  const safe = safeNumber(value)
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe)
}

/**
 * Fixed placeholder for masked monetary amounts.
 *
 * Six U+2022 BULLET characters — render with `font-mono tabular-nums` so the
 * width matches an unmasked currency string and there is no layout shift when
 * the user flips the privacy toggle. The glyph count is deliberate: enough to
 * obscure any realistic balance, short enough to fit in compact widget cells.
 */
export const MASKED_AMOUNT_PLACEHOLDER = '\u2022\u2022\u2022\u2022\u2022\u2022'

/**
 * Privacy-aware currency formatter.
 *
 * Returns the masked bullet-placeholder when `masked === true`, otherwise
 * delegates to the standard `formatCurrency` so all call sites share a single
 * nl-NL formatting path. Callers are expected to render the result inside an
 * element with `font-mono tabular-nums` to preserve column alignment across
 * masked/unmasked states.
 *
 * Design-bible rule ("Trust & veiligheid"):
 *   Bedragen worden `••••••` in DM Mono — status per device.
 *
 * @param value - EUR amount to format (null/undefined/NaN safe via formatCurrency)
 * @param masked - When true, return the placeholder string
 * @returns Either the masked placeholder or a fully formatted EUR string
 */
export function formatMaskedCurrency(
  value: number | null | undefined,
  masked: boolean,
): string {
  if (masked) return MASKED_AMOUNT_PLACEHOLDER
  // formatCurrency's safeNumber guard handles null/undefined/NaN internally.
  return formatCurrency((value ?? 0) as number)
}

/**
 * Canonieke dagtarief-conversie: maanduitgaven → dagelijkse uitgaven (€/dag).
 *
 * Dé enige toegestane €→vrijheidstijd-dagbasis in de app. Deelt jaaruitgaven
 * door 365 — niet maanduitgaven door 30. Het verschil is subtiel maar reëel:
 *
 *   - Canoniek  (×12/365): maandbedrag × 12 maanden / 365 dagen
 *   - Fout (/30):          maandbedrag / 30  ⇒ impliciet jaar = 12 × 30 = 360 dagen
 *
 * /30 onderschat het dagtarief met ~1,4% (365/360 − 1), waardoor de
 * vrijheidstijd dezelfde fractie té lang oogt. `calculateFreedomTime` en
 * `lib/core-metrics.ts` (regel 273) rekenen al op /365; deze helper is de
 * gedeelde bron zodat élk oppervlak (widgets, loaders, AI) identiek rekent.
 *
 * Let op: dit verandert alléén de dag-conversie (×12/365), niet wélke
 * uitgaven-basis een oppervlak kiest (essentieel/"must" vs. totaal blijft per
 * oppervlak bewust verschillend — zie de FIRE-grondslag).
 *
 * @param monthlyExpenses - Maandelijkse uitgaven in EUR
 * @returns Dagelijkse uitgaven in EUR (0 voor niet-positieve/niet-eindige input)
 *
 * @example
 * dailyExpenseRate(3000) // 98.63  (≠ 100 die /30 zou geven)
 */
export function dailyExpenseRate(monthlyExpenses: number): number {
  const safe = safeNumber(monthlyExpenses)
  if (safe <= 0) return 0
  return (safe * 12) / 365
}

// ── Vrijheidstijd: kalenderbasis van de jaar/maand/dag-decompositie ───
//
// Bewuste, vaste weergaveconventie (géén gebruikersparameter, dus geen plek in
// lib/fire-params.ts): een jaar telt 365 dagen, een maand 30. Die twee zijn
// onderling NIET consistent — 12 × 30 = 360 < 365 — en precies dat gat van bijna
// vijf dagen maakt een expliciete carry noodzakelijk (zie carryFreedomUnits).
// Ze staan hier, in het canonieke huis van de vrijheidstijd (lib/ai/dna/base.ts),
// en niet in lib/constants.ts: dat bestand huisvest financiële AANNAMES
// (rendement/inflatie/SWR), niet de kalenderbasis van een formatter.
export const FREEDOM_DAYS_PER_YEAR = 365
export const FREEDOM_DAYS_PER_MONTH = 30
export const FREEDOM_MONTHS_PER_YEAR = 12

/**
 * Freedom time breakdown from a EUR amount and daily expenses.
 */
export interface FreedomTimeBreakdown {
  years: number
  months: number
  days: number
  totalDays: number
  /** Whether the original amount was negative (deficit/debt) */
  isDeficit: boolean
  /** Whether the result represents infinite freedom (zero daily expenses with positive amount) */
  isInfinite: boolean
}

/**
 * Options for formatWithFreedom().
 */
export interface FormatWithFreedomOptions {
  /** Output format: 'long' = "12 jaar en 3 maanden", 'short' = "12j 3m" */
  format?: 'long' | 'short'
  /** Whether to include the EUR amount before the freedom time. Default: true */
  includeCurrency?: boolean
  /**
   * Whether to append days when years/months are also present. Default: true.
   * NB: days are only ever relevant for sub-month amounts (years===0 && months===0),
   * and a positive sub-month amount ALWAYS shows its days regardless of this flag —
   * showing "0 dagen" for a non-zero amount would be a lie. So in practice this flag
   * only affects nothing today; kept for API stability.
   */
  includeDays?: boolean
}

/**
 * Rol een jaar/maand-decompositie op zodat de maandteller nooit zijn eigen
 * overloop bereikt: "10 jaar en 12 maanden" is geen bestaande hoeveelheid tijd,
 * "11 jaar" wel.
 *
 * Waarom dit een aparte, geëxporteerde helper is en geen regel bínnen
 * calculateFreedomTime: er is een TWEEDE plek die zelf maanden optelt. De
 * AI-contextbouwers (lib/ai/context/tax-context.ts en
 * lib/ai/context/aandachtspunten-context.ts) ronden restdagen ≥ 15 naar boven af
 * op een hele maand (`bd.months + 1`) en kunnen zo op eigen kracht op 12
 * uitkomen — óók met een correcte breakdown. Zonder gedeelde carry vertelt Fin
 * "10 jaar en 12 maanden" terwijl het scherm ernaast "11 jaar" toont. Eén huis
 * voor de carry-regel, twee consumenten.
 *
 * DAGEN NA EEN CARRY = 0 (bewuste keuze). De carry verklaart de resterende
 * 360–364 dagen tot een VOL jaar; die zijn daarmee al in `years` opgegaan. Ze
 * laten staan telt ze een tweede keer mee (11 × 365 + 4 = 4019 dagen voor een
 * totaal van 4014), en ze opnieuw uitrekenen tegen het nieuwe jaartal geeft een
 * NEGATIEVE rest (4014 − 4015 = −1). Nul is de enige waarde die geen van beide
 * fouten maakt; de prijs is dat de decompositie in dit venster maximaal vijf
 * dagen naar boven afrondt. `totalDays` blijft onafgerond de exacte waarheid.
 */
export function carryFreedomUnits(
  years: number,
  months: number,
  days: number
): { years: number; months: number; days: number } {
  if (months < FREEDOM_MONTHS_PER_YEAR) {
    return { years, months, days }
  }
  const carriedYears = Math.floor(months / FREEDOM_MONTHS_PER_YEAR)
  return {
    years: years + carriedYears,
    months: months - carriedYears * FREEDOM_MONTHS_PER_YEAR,
    days: 0,
  }
}

/**
 * Calculate freedom time breakdown from EUR amount and daily expenses.
 *
 * Handles edge cases:
 * - NaN/undefined/Infinity inputs → returns zero breakdown
 * - Zero daily expenses with non-zero amount → isInfinite: true
 * - Negative amounts → isDeficit: true (uses absolute value for calculation)
 * - Very large amounts → capped at 9999 years
 *
 * @param amount - EUR amount to convert
 * @param dailyExpenses - Daily expenses in EUR (amount / dailyExpenses = freedom days)
 * @returns Breakdown of years, months, days, totalDays, isDeficit, and isInfinite
 */
export function calculateFreedomTime(
  amount: number,
  dailyExpenses: number
): FreedomTimeBreakdown {
  const safeAmount = safeNumber(amount)
  const safeExpenses = safeNumber(dailyExpenses)

  // Handle zero or negative daily expenses
  if (safeExpenses <= 0) {
    return {
      years: 0,
      months: 0,
      days: 0,
      totalDays: 0,
      isDeficit: safeAmount < 0,
      isInfinite: safeAmount !== 0,
    }
  }

  // Track deficit state before using absolute value
  const isDeficit = safeAmount < 0

  // Handle negative amounts (debt / spending)
  const absoluteAmount = Math.abs(safeAmount)
  const totalDays = absoluteAmount / safeExpenses

  // Cap at a reasonable maximum (9999 years) to prevent display issues
  const cappedDays = Math.min(totalDays, 9999 * FREEDOM_DAYS_PER_YEAR)

  const rawYears = Math.floor(cappedDays / FREEDOM_DAYS_PER_YEAR)
  const remainingAfterYears = cappedDays - rawYears * FREEDOM_DAYS_PER_YEAR
  const rawMonths = Math.floor(remainingAfterYears / FREEDOM_DAYS_PER_MONTH)
  const rawDays = Math.round(remainingAfterYears - rawMonths * FREEDOM_DAYS_PER_MONTH)

  // `remainingAfterYears` loopt tot net onder 365, terwijl twaalf maanden maar
  // 360 dagen beslaan — in dat venster van bijna vijf dagen wordt `rawMonths`
  // exact 12. Rol dat door naar een heel jaar (H3/M37).
  const { years, months, days } = carryFreedomUnits(rawYears, rawMonths, rawDays)

  return {
    years,
    months,
    days,
    totalDays: Math.round(totalDays * 10) / 10,
    isDeficit,
    isInfinite: false,
  }
}

/**
 * Format freedom time breakdown as a Dutch string.
 *
 * @param breakdown - Freedom time breakdown from calculateFreedomTime()
 * @param format - 'long' for "12 jaar en 3 maanden", 'short' for "12j 3m"
 * @param includeDays - Legacy flag; a positive sub-month amount always shows its days
 *   (never "0 dagen"/"0d" for a non-zero amount), so this currently has no effect.
 * @returns Formatted Dutch freedom time string
 */
export function formatFreedomTimeString(
  breakdown: FreedomTimeBreakdown,
  format: 'long' | 'short' = 'long',
  includeDays: boolean = true
): string {
  const { years, months, days } = breakdown

  if (years === 0 && months === 0 && days === 0) {
    return format === 'long' ? '0 dagen' : '0d'
  }

  if (format === 'short') {
    const parts: string[] = []
    if (years > 0) parts.push(`${years}j`)
    if (months > 0) parts.push(`${months}m`)
    if (includeDays && years === 0 && months === 0 && days > 0) {
      parts.push(`${days}d`)
    }
    // includeDays:false op een sub-maand-bedrag zou anders een POSITIEF bedrag als
    // "0d" tonen (dagen zijn hier de enige eenheid). Toon ze dan tóch — nooit een
    // positief bedrag als 0 vrijheid presenteren.
    if (parts.length === 0 && days > 0) return `${days}d`
    return parts.join(' ') || '0d'
  }

  // Long format
  const parts: string[] = []
  if (years > 0) {
    parts.push(`${years} jaar`)
  }
  if (months > 0) {
    parts.push(`${months} ${months === 1 ? 'maand' : 'maanden'}`)
  }
  if (includeDays && years === 0 && months === 0 && days > 0) {
    parts.push(`${days} ${days === 1 ? 'dag' : 'dagen'}`)
  }

  if (parts.length === 0) {
    // includeDays:false op een sub-maand-bedrag zou anders een POSITIEF bedrag als
    // "0 dagen" tonen (bv. een tekort-lening-piek van €3.342 ≈ 30 dagen): dagen zijn
    // dan de enige zinvolle eenheid. Toon ze i.p.v. te liegen; alleen een écht nul-
    // bedrag (days === 0, afgevangen bovenaan) blijft "0 dagen".
    if (days > 0) {
      return `${days} ${days === 1 ? 'dag' : 'dagen'}`
    }
    return '0 dagen'
  }

  if (parts.length === 1) {
    return parts[0]
  }

  // Join with "en" for the last part: "12 jaar en 3 maanden"
  return parts.slice(0, -1).join(', ') + ' en ' + parts[parts.length - 1]
}

/**
 * Convert a EUR amount to a formatted string with freedom-time equivalent.
 *
 * Core utility for the TriFinity philosophy: "Geld is opgeslagen tijd"
 * (Money is stored time). Every EUR amount represents freedom time.
 *
 * Edge cases handled:
 * - NaN/undefined/Infinity → returns "€ 0 (0 dagen)" or "0 dagen" (does not crash)
 * - Zero daily expenses → shows "∞ vrijheid" (oneindig, not JavaScript Infinity)
 * - Negative amounts → shows deficit framing: "X dagen achter" (debt = time owed)
 * - Amounts under €100 → shows currency only (no freedom time) when threshold enforced
 * - Very large amounts → capped at 9999 years for display
 *
 * @param amount - EUR amount to convert
 * @param dailyExpenses - User's daily expenses in EUR
 * @param options - Formatting options
 * @returns Formatted string, e.g. "€450.000 (12 jaar en 3 maanden)"
 *
 * @example
 * // Long format (default)
 * formatWithFreedom(450000, 100) // "€ 450.000 (12 jaar en 3 maanden)"
 *
 * // Short format
 * formatWithFreedom(450000, 100, { format: 'short' }) // "€ 450.000 (12j 3m)"
 *
 * // Without currency
 * formatWithFreedom(450000, 100, { includeCurrency: false }) // "12 jaar en 3 maanden"
 *
 * // Zero expenses edge case
 * formatWithFreedom(450000, 0) // "€ 450.000 (∞ vrijheid)"
 *
 * // Negative amount (debt/spending) — deficit framing
 * formatWithFreedom(-5000, 100) // "-€ 5.000 (1 maand en 20 dagen achter)"
 *
 * // NaN/undefined safety
 * formatWithFreedom(NaN, 100) // "€ 0 (0 dagen)"
 * formatWithFreedom(5000, NaN) // "€ 5.000 (∞ vrijheid)"
 */
export function formatWithFreedom(
  amount: number,
  dailyExpenses: number,
  options: FormatWithFreedomOptions = {}
): string {
  const {
    format = 'long',
    includeCurrency = true,
    includeDays = true,
  } = options

  // Sanitize inputs — NaN, undefined, Infinity all become 0
  const safeAmount = safeNumber(amount)
  const safeExpenses = safeNumber(dailyExpenses)

  const currencyStr = formatCurrency(safeAmount)

  // Edge case: zero or negative daily expenses → infinite freedom (oneindig)
  if (safeExpenses <= 0) {
    if (!includeCurrency) {
      return safeAmount === 0 ? (format === 'long' ? '0 dagen' : '0d') : '∞ vrijheid'
    }
    return safeAmount === 0
      ? `${currencyStr} (${format === 'long' ? '0 dagen' : '0d'})`
      : `${currencyStr} (∞ vrijheid)`
  }

  // Edge case: zero amount
  if (safeAmount === 0) {
    const zeroTime = format === 'long' ? '0 dagen' : '0d'
    return includeCurrency ? `${currencyStr} (${zeroTime})` : zeroTime
  }

  const breakdown = calculateFreedomTime(safeAmount, safeExpenses)
  const timeStr = formatFreedomTimeString(breakdown, format, includeDays)

  // Deficit framing for negative amounts: "X dagen achter" (time behind/owed)
  const isNegative = safeAmount < 0
  const deficitSuffix = isNegative ? ' achter' : ''

  if (!includeCurrency) {
    return `${timeStr}${deficitSuffix}`
  }

  return `${currencyStr} (${timeStr}${deficitSuffix})`
}

// ── Newspaper-style timestamp formatting ──────────────────────────────
//
// De NL-woordenlijsten en de tijdzone-vaste kalenderdelen komen uit `lib/tz.ts`
// — één bron, zodat de #418-klasse niet opnieuw per bestand gekopieerd wordt.

/**
 * Kale datum in krantstijl: `d MMM yyyy` (bv. `29 jul 2026`).
 *
 * Voor `YYYY-MM-DD`-datums zonder tijdcomponent — dus zonder de
 * "vandaag/deze week"-regels van `formatTimestamp`, en mét het jaartal, omdat
 * zo'n datum vaak juist over een ander jaar gaat (bv. "historie opgehaald
 * vanaf"). Leest de datum als UTC zodat een tijdzone hem geen dag laat
 * verspringen.
 */
export function formatDateShort(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  if (isNaN(d.getTime())) return ''
  return `${d.getUTCDate()} ${NL_MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/**
 * Format a date in newspaper (krant) style — no relative timestamps.
 *
 * Alle kalender- en klokgrenzen worden in Europe/Amsterdam bepaald, zodat de
 * uitkomst uitsluitend van het MOMENT afhangt en niet van de tijdzone van de
 * runtime. Server-render en eerste client-render leveren daardoor identieke
 * tekst (geen React #418).
 *
 * Rules:
 * - Vandaag:     HH:mm             (bijv. 13:30)
 * - Deze week:   dag HH:mm         (bijv. ma 13:30)
 * - Deze maand:  d MMM             (bijv. 5 mrt)
 * - Ouder:       d MMM yyyy        (bijv. 5 mrt 2026)
 */
export function formatTimestamp(date: Date | string | number, now?: Date): string {
  const d = date instanceof Date ? date : new Date(date)
  const ref = now ?? new Date()

  if (isNaN(d.getTime())) return ''

  const a = amsterdamParts(d)
  const r = amsterdamParts(ref)

  const pad = (n: number) => String(n).padStart(2, '0')
  const hhmm = `${pad(a.hour)}:${pad(a.minute)}`

  // Same calendar day → time only
  if (a.year === r.year && a.month === r.month && a.day === r.day) {
    return hhmm
  }

  // Within 7 calendar days → day abbr + time
  const diffMs = ref.getTime() - d.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  if (diffDays > 0 && diffDays < 7) {
    return `${NL_DAY_ABBR[a.weekday]} ${hhmm}`
  }

  // Same month & year → d MMM
  if (a.year === r.year && a.month === r.month) {
    return `${a.day} ${NL_MONTH_ABBR[a.month - 1]}`
  }

  // Same year → d MMM (no year suffix needed in current year context)
  if (a.year === r.year) {
    return `${a.day} ${NL_MONTH_ABBR[a.month - 1]}`
  }

  // Older → d MMM yyyy
  return `${a.day} ${NL_MONTH_ABBR[a.month - 1]} ${a.year}`
}
