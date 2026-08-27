// lib/asset-parameter-bands.ts
//
// DE geldige bandbreedtes voor de getallen op `assets` — één bron voor de
// zod-validatie in `POST /api/assets`, voor het formulier in
// `components/core/assets-client.tsx`, en voor de CHECK-constraint in
// `supabase/migrations/20260827140000_assets_bedrag_en_rendement_grenzen.sql`.
//
// ── Waarom dit een eigen module is en NIET `lib/parameters-band.ts` ──────────
//
// `parameters-band.ts` bewaakt `profiles.expected_return` / `inflation_rate` en
// staat in FRACTIES (0,07 = 7%). De kolom `assets.expected_return` draagt
// PERCENTAGES (7 = 7%) — gemeten tegen productie op 27-08-2026: waarden 3, 6, 7
// en negatieve −10/−12 bij afschrijvende types. Dezelfde module hergebruiken zou
// twee eenheden in één band persen; dat is exact de klasse fout die de
// migratie-toelichting van `20260805120000` beschrijft (`DEFAULT 7` in een
// kolom die de app als fractie las = 700%). Twee kolommen, twee eenheden, twee
// modules — en die scheiding staat hier zwart-op-wit zodat niemand ze samenvoegt.
//
// ── Waarom de band PER TYPE is (bevinding H8) ────────────────────────────────
//
// `assets.expected_return` had op geen enkele laag een grens: niet in de HTML
// (`type="number"` zonder `min`/`max`), niet in `handleSave()`, niet in de DB.
// Dat is de bron van de gemelde 665,5% (H1/H7). Eén uniforme band lost dat niet
// op: 'vehicle' MOET negatief kunnen (afschrijving), 'crypto' verdient een
// ruimere band dan 'savings'. Een te strakke uniforme band weigert legitieme
// invoer; een te ruime vangt de bug niet.
//
// ── Twee lagen, bewust verschillend streng ──────────────────────────────────
//
// 1. `EXPECTED_RETURN_DB_BAND` (−100…100) is de DATABASEGRENS. Bewust ruim en
//    bewust NIET per type: hij is het slot op de deur die de RLS openlaat. De
//    policy op `assets` is eigen-rij maar KOLOM-onafhankelijk, dus een gebruiker
//    met de anon-key en zijn eigen token kan élke route omzeilen met een directe
//    PostgREST-call — precies de redenering die `parameters-band.ts` voor
//    `profiles` opschrijft. Een per-type CHECK zou een CASE over dertien types
//    zijn, die bij elke productwijziging een migratie vraagt; de app-band
//    hieronder doet dat werk zonder DDL. −100% is de wiskundige bodem (daaronder
//    wordt het bezit negatief), +100% de plausibiliteitsgrens voor een
//    PLANNINGSaanname over een heel jaar.
// 2. `ASSET_RETURN_BANDS` is de APPLICATIEBAND, per type, strenger, en de laag
//    die de gebruiker daadwerkelijk als foutmelding ziet.
//
// ── Bedragen: server ruim, client vraagt (besluit eigenaar 26-08-2026) ───────
//
// Voor `current_value` / `purchase_value` / `monthly_contribution` is bewust
// GEEN strakke cap gekozen: dat zou een legitieme UHNW-gebruiker blokkeren. In
// plaats daarvan blijft de server ruim (`ASSET_AMOUNT_LIMITS`, een grens die
// alleen het onmogelijke afvangt) en toont de CLIENT vanaf
// `ASSET_AMOUNT_CONFIRM_THRESHOLD` een bevestigingsstap mét vrijheidstijd-
// vertaling ("dat is X jaar vrijheid — klopt dat?"). De fat-finger uit de
// bevinding (999.999.999.999 op een auto) sneuvelt op beide lagen: de client
// vraagt door, en wie de client omzeilt loopt tegen de servergrens.

import type { AssetType } from './asset-data'

// ── Rendement ───────────────────────────────────────────────────────────────

export interface ReturnBand {
  /** Ondergrens in PROCENTEN per jaar (inclusief). */
  min: number
  /** Bovengrens in PROCENTEN per jaar (inclusief). */
  max: number
}

/**
 * De harde databasegrens op `assets.expected_return` (PERCENT).
 * Spiegelt `assets_expected_return_check`; wijzig je 'm hier, schrijf dan óók
 * een nieuwe migratie.
 */
export const EXPECTED_RETURN_DB_BAND: ReturnBand = { min: -100, max: 100 }

/**
 * Applicatieband per asset-type, in PROCENTEN per jaar.
 *
 * Geijkt op de werkelijke productiewaarden (gemeten 27-08-2026, 88 rijen): geen
 * enkele bestaande rij valt buiten z'n band, dus dit weigert vandaag niets wat
 * er al staat. De ruimte erboven is bewust royaal — de band moet het ONMOGELIJKE
 * vangen (665,5%), niet het ongebruikelijke bekritiseren.
 */
export const ASSET_RETURN_BANDS: Record<AssetType, ReturnBand> = {
  // Geen negatieve rente op eigen liquide middelen; ruim naar boven voor
  // spaaracties en hoogrentende rekeningen.
  cash: { min: 0, max: 15 },
  savings: { min: 0, max: 15 },
  // Beleggen mag een negatieve VERWACHTING dragen (defensieve aanname), maar
  // geen rendement dat geen enkele markt levert.
  investment: { min: -20, max: 30 },
  retirement: { min: -20, max: 30 },
  eigen_huis: { min: -20, max: 30 },
  real_estate: { min: -20, max: 30 },
  // Volatiel: ruimer aan beide kanten, bewust geen aanmoediging (de default
  // blijft 0 in TYPICAL_RETURNS).
  crypto: { min: -50, max: 50 },
  // Afschrijvende types: de ondergrens is de wiskundige bodem, niet een aanname.
  vehicle: { min: -100, max: 10 },
  physical: { min: -100, max: 30 },
  deelneming: { min: -100, max: 50 },
  levensverzekering: { min: -20, max: 20 },
  vordering: { min: -20, max: 30 },
  other: { min: -100, max: 50 },
}

/** De band van één type. Onbekend type → de ruime DB-band als terugval. */
export function assetReturnBand(type: string): ReturnBand {
  return ASSET_RETURN_BANDS[type as AssetType] ?? EXPECTED_RETURN_DB_BAND
}

/** true wanneer `pct` (PERCENT) binnen de band van dit type valt. NaN → false. */
export function isWithinAssetReturnBand(type: string, pct: number): boolean {
  const band = assetReturnBand(type)
  return Number.isFinite(pct) && pct >= band.min && pct <= band.max
}

/**
 * Foutmelding "wat ging mis + hoe fix je het", gedeeld zodat server en client
 * letterlijk dezelfde tekst tonen.
 */
export function assetReturnBandError(type: string): string {
  const band = assetReturnBand(type)
  return `Rendement moet tussen ${band.min}% en ${band.max}% per jaar liggen`
}

// ── Bedragen ────────────────────────────────────────────────────────────────

/** De bedragvelden op `assets` met een servergrens. */
export type AssetAmountField = 'current_value' | 'purchase_value' | 'monthly_contribution'

export interface AmountLimit {
  min: number
  /** Bewust ruim: vangt het onmogelijke af, niet het ongebruikelijke. */
  max: number
  /** Label voor de foutmelding, bv. "Huidige waarde". */
  label: string
}

export const ASSET_AMOUNT_LIMITS: Record<AssetAmountField, AmountLimit> = {
  current_value: { min: 0, max: 100_000_000_000, label: 'Waarde' },
  purchase_value: { min: 0, max: 100_000_000_000, label: 'Aankoopwaarde' },
  monthly_contribution: { min: 0, max: 1_000_000_000, label: 'Maandelijkse inleg' },
}

/**
 * Drempel waarboven de CLIENT een bevestigingsstap toont met de
 * vrijheidstijd-vertaling. Geen servergrens — de server accepteert dit bedrag
 * gewoon zodra de gebruiker bevestigd heeft (besluit eigenaar: optie B).
 */
export const ASSET_AMOUNT_CONFIRM_THRESHOLD = 10_000_000

/** true wanneer het bedrag binnen de servergrens van dit veld valt. */
export function isWithinAssetAmountLimit(field: AssetAmountField, value: number): boolean {
  const limit = ASSET_AMOUNT_LIMITS[field]
  return Number.isFinite(value) && value >= limit.min && value <= limit.max
}

/** Foutmelding bij een bedrag buiten de servergrens. */
export function assetAmountLimitError(field: AssetAmountField): string {
  const limit = ASSET_AMOUNT_LIMITS[field]
  return `${limit.label} moet tussen ${formatGrens(limit.min)} en ${formatGrens(limit.max)} liggen`
}

/** Compacte euro-notatie voor foutmeldingen — geen Intl, geen locale-verrassing. */
function formatGrens(value: number): string {
  return `€${value.toLocaleString('nl-NL')}`
}

// ── Datums ──────────────────────────────────────────────────────────────────

/**
 * Een aankoopdatum in de TOEKOMST is per definitie onmogelijk (je kunt niets
 * kopen dat je nog niet gekocht hebt) en heeft een echte doorwerking: de
 * afschrijvings- en rendementsberekeningen rekenen vanaf die datum.
 *
 * Bewust GEEN CHECK-constraint: Postgres eist dat een CHECK-expressie IMMUTABLE
 * is, en `CURRENT_DATE` is dat niet (STABLE). Dit blijft dus een server- én
 * clientregel; zie de migratie-toelichting.
 *
 * @param iso  datum als `YYYY-MM-DD`
 * @param today referentiedag (default: vandaag) — injecteerbaar voor tests
 */
export function isPurchaseDateInFuture(iso: string, today: Date = new Date()): boolean {
  if (!iso) return false
  const parsed = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(parsed)) return false
  const vandaag = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return parsed > vandaag
}

/** `YYYY-MM-DD` van vandaag — de waarde voor het `max`-attribuut op een datumveld. */
export function todayIso(today: Date = new Date()): string {
  return today.toISOString().slice(0, 10)
}

export const PURCHASE_DATE_FUTURE_ERROR = 'Aankoopdatum kan niet in de toekomst liggen'
