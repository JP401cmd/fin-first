/**
 * Declaratieve formaat-contracten voor alle ondersteunde import-formaten.
 *
 * Doel: één centrale, expliciete bron van waarheid voor kolomnamen en
 * detectie-markers — zodat import-routes header-drift kunnen signaleren
 * (Laag A van het contract-bewaking-plan, zie docs/plan: Fase 4).
 *
 * Conventies:
 * - `requiredHeaders`    : kolommen die ALTIJD aanwezig moeten zijn.
 * - `knownOptionalHeaders`: kolommen die in de praktijk voorkomen maar niet
 *                           verplicht zijn (bv. valuta-kolommen, saldo).
 * - `detectMarkers`      : lowercase substrings die de broker/bank uniek
 *                           identificeren — geïmporteerd uit broker-csv.ts
 *                           als enige bron van waarheid (geen duplicaten).
 * - `delimiter`          : optioneel; bank-CSV's hebben een vaste delimiter.
 */

import {
  DEGIRO_PORTFOLIO_MARKERS,
  DEGIRO_TRANSACTION_MARKERS,
  SAXO_MARKERS,
  ING_BELEGGEN_MARKERS,
  TRADING212_MARKERS,
  ETORO_MARKERS,
} from './broker-csv'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Alle ondersteunde formaat-id's. */
export type FormatId =
  // Bank-CSV (transacties)
  | 'ing'
  | 'rabobank'
  | 'abn'
  | 'paypal'
  // Broker-CSV (beleggingen)
  | 'degiro-portfolio'
  | 'degiro-transaction'
  | 'saxo'
  | 'ing-beleggen'
  | 'trading212'
  | 'etoro'
  // Pensioen-JSON
  | 'pension-json'

export interface FormatContract {
  /** Leesbare naam voor logging en UI. */
  label: string
  /**
   * Optionele delimiter voor CSV-formaten.
   * Niet aanwezig voor JSON-formaten.
   */
  delimiter?: string
  /**
   * Kolomnamen die altijd aanwezig moeten zijn in het bestand.
   * Voor JSON-formaten: verplichte top-level sleutels.
   */
  requiredHeaders: string[]
  /**
   * Kolomnamen die in de praktijk voorkomen maar niet verplicht zijn.
   * Wordt gebruikt door `diffHeaders` om "onbekende kolommen" te onderscheiden
   * van "bewust optionele kolommen".
   */
  knownOptionalHeaders: string[]
  /**
   * Lowercase substrings waarmee het formaat gedetecteerd wordt.
   * Voor broker-CSV's: geïmporteerd uit broker-csv.ts (één bron van waarheid).
   * Voor bank-CSV's en JSON: lege array (detection via preset/extensie).
   */
  detectMarkers: string[]
}

// ---------------------------------------------------------------------------
// Formaat-contracten
// ---------------------------------------------------------------------------

export const FORMAT_CONTRACTS: Record<FormatId, FormatContract> = {
  // ── Bank-CSV: ING ──────────────────────────────────────────────────────────
  // Preset: delimiter ';', kolomindices gebaseerd op positie (geen header-lookup).
  // Headers bevestigd via csv.test.ts (ING_HEADER).
  ing: {
    label: 'ING Download',
    delimiter: ';',
    requiredHeaders: [
      'Datum',
      'Naam / Omschrijving',
      'Rekening',
      'Tegenrekening',
      'Code',
      'Af Bij',
      'Bedrag (EUR)',
      'Mutatiesoort',
      'Mededelingen',
    ],
    knownOptionalHeaders: [],
    detectMarkers: [],
  },

  // ── Bank-CSV: Rabobank ─────────────────────────────────────────────────────
  // Preset: delimiter ',', kolomindices gebaseerd op positie.
  // Headers bevestigd via csv.test.ts (HEADER-string).
  rabobank: {
    label: 'Rabobank CSV',
    delimiter: ',',
    requiredHeaders: [
      'IBAN/BBAN',
      'Munt',
      'BIC',
      'Volgnr',
      'Datum',
      'Rentedatum',
      'Bedrag',
      'Saldo na trn',
      'Tegenrekening IBAN/BBAN',
      'Naam tegenpartij',
      'Code',
      'Omschrijving-1',
    ],
    knownOptionalHeaders: [
      'Naam uiteindelijke partij',
      'Naam initiërende partij',
      'BIC tegenpartij',
      'Batch ID',
      'Transactiereferentie',
      'Machtigingskenmerk',
      'Incassant ID',
      'Betalingskenmerk',
      'Omschrijving-2',
      'Omschrijving-3',
      'Reden retour',
      'Oorspr bedrag',
      'Oorspr munt',
      'Koers',
    ],
    detectMarkers: [],
  },

  // ── Bank-CSV: ABN AMRO ─────────────────────────────────────────────────────
  // Preset: delimiter '\t', kolomindices gebaseerd op positie.
  abn: {
    label: 'ABN AMRO',
    delimiter: '\t',
    requiredHeaders: [
      'Rekeningnummer',
      'Muntsoort',
      'Transactiedatum',
      'Rentedatum',
      'Beginsaldo',
      'Eindsaldo',
      'Bedrag',
      'Omschrijving',
    ],
    knownOptionalHeaders: [],
    detectMarkers: [],
  },

  // ── Bank-CSV: PayPal ───────────────────────────────────────────────────────
  // Preset: delimiter ',', statusColumn filtert op 'Voltooid'.
  // Headers bevestigd via csv.test.ts (PP_HEADER-string).
  paypal: {
    label: 'PayPal (CSV export)',
    delimiter: ',',
    requiredHeaders: [
      'Datum',
      'Tijd',
      'Tijdzone',
      'Naam',
      'Type',
      'Status',
      'Valuta',
      'Bruto',
      'Kosten',
      'Netto',
      'Saldo',
      'Ref',
      'Transactie-ID',
    ],
    knownOptionalHeaders: [],
    detectMarkers: [],
  },

  // ── Broker-CSV: DEGIRO portfolio ───────────────────────────────────────────
  // detectMarkers = DEGIRO_PORTFOLIO_MARKERS (geïmporteerd, geen duplicaat).
  'degiro-portfolio': {
    label: 'DEGIRO Portfolio',
    delimiter: ';',
    requiredHeaders: ['Product', 'ISIN', 'Beurs', 'Aantal', 'Slotkoers'],
    knownOptionalHeaders: ['Symbool', 'Lokale waarde', 'Waarde in EUR', 'Wijziging %'],
    detectMarkers: DEGIRO_PORTFOLIO_MARKERS,
  },

  // ── Broker-CSV: DEGIRO transacties ────────────────────────────────────────
  // Transactie-export kan zowel ';' als ',' als delimiter hebben (auto-detect
  // in broker-csv.ts via detectDelimiter). Hier slaan we de meest voorkomende
  // op; de runtime-detectie overschrijft dit indien nodig.
  'degiro-transaction': {
    label: 'DEGIRO Transacties',
    delimiter: ',',
    requiredHeaders: ['Datum', 'Product', 'ISIN', 'Beurs', 'Aantal', 'Koers'],
    knownOptionalHeaders: [
      'Tijd',
      'Uitvoeringsplaats',
      'Lokale waarde',
      'Waarde EUR',
      'Wisselkoers',
      'AutoFX Kosten',
      'Transactiekosten en/of kosten van derden EUR',
      'Totaal EUR',
      'Order ID',
    ],
    detectMarkers: DEGIRO_TRANSACTION_MARKERS,
  },

  // ── Broker-CSV: Saxo Bank ──────────────────────────────────────────────────
  saxo: {
    label: 'Saxo Bank',
    delimiter: ';',
    requiredHeaders: ['Instrument', 'Symbool', 'ISIN', 'Gemiddelde openingsprijs'],
    knownOptionalHeaders: ['Aantal', 'Huidige prijs', 'Waarde', 'Valuta', 'Wisselkoers'],
    detectMarkers: SAXO_MARKERS,
  },

  // ── Broker-CSV: ING Beleggen ───────────────────────────────────────────────
  'ing-beleggen': {
    label: 'ING Beleggen',
    delimiter: ';',
    requiredHeaders: ['Naam effect', 'ISIN-code', 'Aantal', 'Koers'],
    knownOptionalHeaders: ['Waarde', 'Datum'],
    detectMarkers: ING_BELEGGEN_MARKERS,
  },

  // ── Broker-CSV: Trading 212 ────────────────────────────────────────────────
  trading212: {
    label: 'Trading 212',
    delimiter: ',',
    requiredHeaders: ['Action', 'Time', 'ISIN', 'Ticker', 'No. of shares'],
    knownOptionalHeaders: [
      'Name',
      'Price / share',
      'Currency (Price / share)',
      'Exchange rate',
      'Result',
      'Currency (Result)',
      'Total',
      'Currency (Total)',
      'Notes',
      'ID',
    ],
    detectMarkers: TRADING212_MARKERS,
  },

  // ── Broker-CSV: eToro ──────────────────────────────────────────────────────
  // Let op: eToro detection vereist ook 'realized equity change' (zie detectBroker).
  etoro: {
    label: 'eToro',
    delimiter: ',',
    requiredHeaders: ['Date', 'Type', 'Details', 'Amount', 'Units', 'Realized Equity Change'],
    knownOptionalHeaders: [
      'Realized Equity',
      'Balance',
      'Position ID',
      'Asset type',
      'NWA',
      'ISIN',
    ],
    detectMarkers: [...ETORO_MARKERS, 'realized equity change'],
  },

  // ── Pensioen-JSON ─────────────────────────────────────────────────────────
  // Top-level sleutels van PensionParseResultSchema (app/api/pension/parse/route.ts).
  'pension-json': {
    label: 'Pensioen-JSON (UPO)',
    requiredHeaders: ['aowBedrag', 'regelingen', 'nabestaandenpensioen', 'samenvatting'],
    knownOptionalHeaders: [],
    detectMarkers: [],
  },
}

// ---------------------------------------------------------------------------
// Header-fingerprinting
// ---------------------------------------------------------------------------

/**
 * Normaliseer een reeks kolomnamen tot een consistente, volgorde-onafhankelijke
 * vorm voor fingerprinting:
 * 1. Strip BOM (﻿) van elk item.
 * 2. Verwijder omringende witruimte (trim).
 * 3. Maak lowercase.
 * 4. Sorteer alfabetisch (maakt volgorde-onafhankelijk).
 *
 * Deze normalisatie spiegelt `normaliseHeaders` in broker-csv.ts en de
 * BOM-strip in `detectBroker`, zodat een bestand met of zonder BOM tot
 * dezelfde fingerprint leidt.
 */
export function normalizeHeadersForFingerprint(headers: string[]): string[] {
  return headers
    .map((h) => h.replace(/^﻿/, '').trim().toLowerCase())
    .sort()
}

/**
 * Bereken een SHA-256-fingerprint van een reeks kolomnamen.
 *
 * De headers worden genormaliseerd (BOM-strip, trim, lowercase, gesorteerd)
 * en samengevoegd met '|' als scheidingsteken vóór hashing. Hierdoor is de
 * fingerprint:
 * - Volgorde-onafhankelijk: "A,B" en "B,A" geven dezelfde hash.
 * - BOM-tolerant: bestanden met UTF-8 BOM geven dezelfde hash.
 * - Witruimte-tolerant: spaties rondom kolomnamen worden genegeerd.
 *
 * Gebruik: importeer het resultaat als golden value in tests. Een gewijzigde
 * fingerprint duidt op formaat-drift en activeert een `contract_events`-rij.
 */
export async function fingerprintHeaders(headers: string[]): Promise<string> {
  const normalized = normalizeHeadersForFingerprint(headers)
  const input = normalized.join('|')
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------------------
// Header-diff
// ---------------------------------------------------------------------------

/**
 * Vergelijk geobserveerde kolomnamen met het formaat-contract.
 *
 * Geeft terug:
 * - `missing`    : verplichte kolommen die ONTBREKEN in het geüploade bestand.
 * - `unexpected` : kolommen die aanwezig zijn maar NIET in required of
 *                  knownOptional staan → mogelijke drift of verkeerd formaat.
 *
 * Let op: vergelijking is case-insensitief (lowercase na trim) voor
 * robuustheid tegen kleine export-variaties.
 */
export function diffHeaders(
  observed: string[],
  formatId: FormatId,
): { missing: string[]; unexpected: string[] } {
  const contract = FORMAT_CONTRACTS[formatId]

  // Normaliseer observed (lowercase, trim, BOM-strip)
  const observedNorm = new Set(
    observed.map((h) => h.replace(/^﻿/, '').trim().toLowerCase()),
  )

  // Normaliseer required en knownOptional
  const requiredNorm = contract.requiredHeaders.map((h) => h.trim().toLowerCase())
  const allKnownNorm = new Set([
    ...requiredNorm,
    ...contract.knownOptionalHeaders.map((h) => h.trim().toLowerCase()),
  ])

  const missing = requiredNorm.filter((r) => !observedNorm.has(r))
  const unexpected = [...observedNorm].filter((o) => !allKnownNorm.has(o))

  return { missing, unexpected }
}
