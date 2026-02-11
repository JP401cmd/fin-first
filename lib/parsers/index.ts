/**
 * Unified parser index.
 * Shared utilities and format detection for MT940, CSV, and OFX imports.
 */

export type { ParsedTransaction } from './shared'
export { computeHash } from './shared'

/**
 * Detect file format from content and filename.
 */
export function detectFormat(content: string, fileName: string): 'mt940' | 'csv' | 'ofx' | 'unknown' {
  const ext = fileName.toLowerCase().split('.').pop() ?? ''

  // OFX/QFX detection
  if (ext === 'ofx' || ext === 'qfx') return 'ofx'
  if (content.includes('<OFX>') || content.includes('OFXHEADER')) return 'ofx'

  // MT940 detection
  if (ext === 'sta' || ext === 'mt940' || ext === '940') return 'mt940'
  if (content.includes(':20:') && content.includes(':60F:')) return 'mt940'

  // CSV detection
  if (ext === 'csv') return 'csv'
  // Check for CSV-like structure (lines with consistent delimiters)
  const lines = content.trim().split('\n')
  if (lines.length >= 2) {
    const commaCount = (lines[0].match(/,/g) || []).length
    const semiCount = (lines[0].match(/;/g) || []).length
    if (commaCount >= 2 || semiCount >= 2) return 'csv'
  }

  return 'unknown'
}

export type CSVPreset = {
  id: string
  label: string
  delimiter: string
  dateColumn: number
  amountColumn: number
  descriptionColumn: number
  counterpartyColumn: number | null
  dateFormat: string
  hasHeader: boolean
  amountIsNegative?: boolean // some banks use separate columns for debit/credit
  debitColumn?: number
  creditColumn?: number
}

export const CSV_PRESETS: CSVPreset[] = [
  {
    id: 'ing',
    label: 'ING Download',
    delimiter: ';',
    dateColumn: 0,
    amountColumn: 6,
    descriptionColumn: 8,
    counterpartyColumn: 1,
    dateFormat: 'YYYYMMDD',
    hasHeader: true,
  },
  {
    id: 'rabobank',
    label: 'Rabobank CSV',
    delimiter: ',',
    dateColumn: 4,
    amountColumn: 6,
    descriptionColumn: 19,
    counterpartyColumn: 9,
    dateFormat: 'YYYY-MM-DD',
    hasHeader: true,
  },
  {
    id: 'abn',
    label: 'ABN AMRO',
    delimiter: '\t',
    dateColumn: 2,
    amountColumn: 6,
    descriptionColumn: 7,
    counterpartyColumn: null,
    dateFormat: 'YYYYMMDD',
    hasHeader: true,
  },
  {
    id: 'custom',
    label: 'Handmatig toewijzen',
    delimiter: ',',
    dateColumn: 0,
    amountColumn: 1,
    descriptionColumn: 2,
    counterpartyColumn: null,
    dateFormat: 'YYYY-MM-DD',
    hasHeader: true,
  },
]
