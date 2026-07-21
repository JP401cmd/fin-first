/**
 * OFX/QFX parser for bank transaction files.
 * OFX is an SGML-like format used by many banks.
 */

import type { ParsedTransaction, ImportWarning } from './shared'
import { computeHash, parseAmountOrNull } from './shared'

/** Resultaat van {@link parseOFXWithWarnings}: geldige transacties + overgeslagen blokken. */
export interface OFXParseResult {
  transactions: ParsedTransaction[]
  warnings: ImportWarning[]
}

/**
 * Parse an OFX date string (YYYYMMDD or YYYYMMDDHHMMSS) into YYYY-MM-DD.
 */
function parseOFXDate(value: string): string {
  const cleaned = value.replace(/\[.*\]/, '').trim()
  if (cleaned.length >= 8) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`
  }
  return cleaned
}

/**
 * Extract a tag value from OFX content.
 * OFX tags are like <TAGNAME>value (no closing tag in SGML mode).
 */
function extractTag(block: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}>([^<\\r\\n]+)`, 'i')
  const match = block.match(regex)
  return match ? match[1].trim() : null
}

/**
 * Split OFX content into transaction blocks (<STMTTRN>...</STMTTRN>).
 */
function extractTransactionBlocks(content: string): string[] {
  const blocks: string[] = []
  const regex = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>))/gi
  let match

  while ((match = regex.exec(content)) !== null) {
    blocks.push(match[1])
  }

  // Fallback: if no closing tags, split on <STMTTRN>
  if (blocks.length === 0) {
    const parts = content.split(/<STMTTRN>/i)
    for (let i = 1; i < parts.length; i++) {
      const endIdx = parts[i].search(/<\/STMTTRN>/i)
      blocks.push(endIdx > 0 ? parts[i].slice(0, endIdx) : parts[i])
    }
  }

  return blocks
}

/**
 * Parse an OFX/QFX file, returning both the valid transactions and any blocks
 * skipped because their TRNAMT could not be read. Prefer this over
 * {@link parseOFX} on surfaces that can surface warnings to the user.
 */
export async function parseOFXWithWarnings(content: string): Promise<OFXParseResult> {
  const blocks = extractTransactionBlocks(content)
  const transactions: ParsedTransaction[] = []
  const warnings: ImportWarning[] = []

  for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
    const block = blocks[blockIdx]
    const datePosted = extractTag(block, 'DTPOSTED')
    const trnAmt = extractTag(block, 'TRNAMT')
    const memo = extractTag(block, 'MEMO')
    const name = extractTag(block, 'NAME')
    const fitid = extractTag(block, 'FITID')
    const trnType = extractTag(block, 'TRNTYPE')

    if (!datePosted || !trnAmt) continue

    const date = parseOFXDate(datePosted)
    // Onleesbaar bedrag (bv. onverwacht TRNAMT-formaat) → blok overslaan +
    // waarschuwing i.p.v. stil €0 te importeren dat de saldi vervuilt.
    const amount = parseAmountOrNull(trnAmt)
    if (amount === null) {
      warnings.push({
        line: blockIdx + 1,
        code: 'unparseable_amount',
        message: `Transactie ${blockIdx + 1} overgeslagen: het bedrag "${trnAmt.trim()}" is onleesbaar.`,
      })
      continue
    }
    const description = (memo || name || 'Geen omschrijving').replace(/\s+/g, ' ').trim()
    const counterpartyName = name ? name.trim() : null

    const hash = await computeHash(date, amount, description)

    transactions.push({
      date,
      amount,
      description,
      counterparty_name: counterpartyName,
      counterparty_iban: null,
      reference: fitid || null,
      // OFX <TRNTYPE> (bv. "DEBIT"/"CREDIT") is een bank-eigen code — die hoort in
      // bank_code, NIET in transaction_type (DB-enum met CHECK-constraint; een rauwe
      // code daarin doet de import-commit falen — WF-CASH-23).
      transaction_type: null,
      source_type: null,
      bank_code: trnType || null,
      bank_seq: null,
      running_balance: null,
      creditor_id: null,
      fx_amount: null,
      fx_currency: null,
      fx_rate: null,
      import_hash: hash,
    })
  }

  return { transactions, warnings }
}

/**
 * Parse an OFX/QFX file content into normalized transactions.
 *
 * Backwards-compatible thin wrapper around {@link parseOFXWithWarnings} that
 * returns only the transactions. Skipped/unreadable blocks are dropped silently
 * here — call `parseOFXWithWarnings` when you need to surface those to the user.
 */
export async function parseOFX(content: string): Promise<ParsedTransaction[]> {
  return (await parseOFXWithWarnings(content)).transactions
}
