/**
 * Shared types and utilities for all parsers.
 */

export type ParsedTransaction = {
  date: string
  amount: number
  description: string
  counterparty_name: string | null
  counterparty_iban: string | null
  reference: string | null
  transaction_type: string | null
  /**
   * Bron-specifiek transactietype uit het bestand (bv. PayPal-kolom "Type":
   * "Bank Deposit to PP Account", "Algemene opname"). Wordt NIET in de DB-kolom
   * `transaction_type` opgeslagen (die heeft een CHECK-constraint op een vaste
   * enum) — puur gebruikt tijdens import om eigen-rekening-verschuivingen te
   * herkennen op rekeningen zonder bruikbare IBAN (zie CSVPreset.transferTypeColumn).
   */
  source_type: string | null
  bank_code: string | null
  /**
   * Per-rij unieke bank-referentie (bv. Rabobank `Volgnr`). NIET in import_hash:
   * de hash blijft stabiel (date|amount|description) zodat re-imports betrouwbaar
   * gedetecteerd worden. bank_seq onderscheidt écht-verschillende transacties met
   * identieke datum/bedrag/omschrijving via de samengestelde unieke index
   * `(user_id, import_hash, coalesce(bank_seq, ''))`.
   */
  bank_seq: string | null
  running_balance: number | null
  creditor_id: string | null
  fx_amount: number | null
  fx_currency: string | null
  fx_rate: number | null
  import_hash: string
}

/**
 * Niet-fatale importwaarschuwing: een rij die is overgeslagen omdat een
 * waardebepalend veld (bv. het bedrag) niet betrouwbaar te lezen viel. Wordt
 * door de bank-CSV/OFX-parsers verzameld en door de import-UI getoond, zodat een
 * corrupte kolom-mapping NIET stil als €0-transactie wordt geïmporteerd.
 */
export interface ImportWarning {
  /** 1-gebaseerde bronregel (CSV) of transactie-index (OFX). */
  line: number
  /** Machine-leesbare reden; nu uitsluitend een onparsbaar bedrag. */
  code: 'unparseable_amount'
  /** Kant-en-klare, mensvriendelijke uitleg voor de UI. */
  message: string
}

/**
 * Normaliseer een bedrag-string naar het `1234.56`-formaat dat `parseFloat`
 * begrijpt. Één gedeelde bron voor alle bankparsers (CSV én OFX) — bewust GEEN
 * tweede parser.
 *
 * Decimaal-/duizendtalscheiding:
 * - Beide `.` en `,` aanwezig → het LAATST voorkomende teken is de decimaal-
 *   scheider. Zo worden zowel NL "1.234,56" (komma-decimaal) als US "1.234,56"'s
 *   spiegelbeeld "1,234.56" (punt-decimaal) correct gelezen i.p.v. het US-geval
 *   stil verkeerd te parsen.
 * - Alleen `,` → komma is de decimaalscheider (NL "12,50").
 * - Alleen `.` of geen scheider → `parseFloat` leest de waarde direct.
 */
export function normaliseAmountString(raw: string): string {
  const hasComma = raw.includes(',')
  const hasDot = raw.includes('.')
  if (hasComma && hasDot) {
    return raw.lastIndexOf(',') > raw.lastIndexOf('.')
      ? raw.replace(/\./g, '').replace(',', '.') // komma = decimaal (NL)
      : raw.replace(/,/g, '') // punt = decimaal (US/EN)
  }
  if (hasComma) return raw.replace(',', '.')
  return raw
}

/**
 * Parse een bedrag-cel strikt: retourneert `null` wanneer de cel leeg is OF een
 * niet-leeg maar onparsbaar getal bevat. De aanroeper onderscheidt leeg
 * (gewoonlijk overslaan zonder waarschuwing) van niet-leeg-onparsbaar (rij
 * overslaan MET waarschuwing) op basis van de ruwe celwaarde. Nooit stil 0:
 * dat was precies de bron van vervuilde saldi bij een verkeerde kolom-mapping.
 */
export function parseAmountOrNull(value: string): number | null {
  const raw = value.replace(/['"]/g, '').trim()
  if (!raw) return null
  const n = parseFloat(normaliseAmountString(raw))
  return Number.isFinite(n) ? n : null
}

/**
 * Compute a stable hash for duplicate detection.
 * Uses date + amount + first 100 chars of description. Bewust GEEN extra entropie
 * (zoals Volgnr) hierin — dan zou re-import-detectie breken en zou bestaande data
 * een migratie-gat krijgen. Distinct-maar-identieke transacties worden onderscheiden
 * via de aparte `bank_seq`-kolom in de samengestelde unieke index, niet via de hash.
 *
 * INVARIANT (load-bearing): `amount` is ALTIJD een direct uit het bronbestand
 * geparsed bedrag — nooit een berekend/afgeleid getal. De hash serialiseert de
 * double via `${amount}` (shortest-round-trip-string), dus zolang alleen
 * geparste bedragen (evt. met tekenwissel) binnenkomen is de string stabiel en
 * blijft re-import-detectie betrouwbaar. Zou hier ooit een BEREKEND bedrag
 * gehasht worden (bv. een som of afgeronde waarde), dan kan een 1-ulp-verschil
 * een andere string en dus een gemiste duplicaat opleveren; introduceer in dat
 * geval eerst een gecanonicaliseerde hash-v2 (`amount.toFixed(2)`) met migratiepad.
 */
export async function computeHash(date: string, amount: number, description: string): Promise<string> {
  const input = `${date}|${amount}|${description.slice(0, 100)}`
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Compute een stabiele SHA-256 fingerprint van een reeks sleutelnamen (API-veld-
 * namen, CSV-headers). Alleen NAMEN worden gehasht — nooit financiële waarden.
 *
 * Normalisatie: lowercase, gesorteerd, samengevoegd met '|'. Hierdoor is de
 * fingerprint volgorde-onafhankelijk en case-insensitief.
 *
 * Vervangt de drie eerder los-staande DJB2-varianten (fingerprintKeys in
 * bitvavo-client.ts, keyprintOf in trading212-client.ts en truelayer/client.ts).
 * Door deze gedeelde helper te hergebruiken is de hash-ruimte consistent SHA-256
 * en zijn collision-risico's van DJB2 (32-bit output) geëlimineerd.
 */
export async function fingerprintKeys(keys: string[]): Promise<string> {
  const normalized = [...keys].map((k) => k.toLowerCase()).sort()
  const input = normalized.join('|')
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
