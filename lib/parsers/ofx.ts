/**
 * OFX/QFX parser for bank transaction files.
 * OFX is an SGML-like format used by many banks.
 */

import type { ParsedTransaction } from './shared'
import { computeHash } from './shared'

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
 * Parse an OFX/QFX file content into normalized transactions.
 */
export async function parseOFX(content: string): Promise<ParsedTransaction[]> {
  const blocks = extractTransactionBlocks(content)
  const transactions: ParsedTransaction[] = []

  for (const block of blocks) {
    const datePosted = extractTag(block, 'DTPOSTED')
    const trnAmt = extractTag(block, 'TRNAMT')
    const memo = extractTag(block, 'MEMO')
    const name = extractTag(block, 'NAME')
    const fitid = extractTag(block, 'FITID')
    const trnType = extractTag(block, 'TRNTYPE')

    if (!datePosted || !trnAmt) continue

    const date = parseOFXDate(datePosted)
    const amount = parseFloat(trnAmt.replace(',', '.')) || 0
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
      transaction_type: trnType || null,
      import_hash: hash,
    })
  }

  return transactions
}
