import { describe, it, expect } from 'vitest'
import { importRowKey, applyAssignmentToImportRows, type AssignableImportRow } from './import-assign'

function row(import_hash: string, overrides: Partial<AssignableImportRow> = {}): AssignableImportRow & { extra?: string } {
  return {
    import_hash,
    bank_seq: null,
    budget_id: null,
    budgetName: null,
    confidence: 0,
    category_source: null,
    isTransfer: false,
    transaction_type: null,
    aiAccepted: false,
    userManuallyChanged: false,
    ...overrides,
  }
}

describe('importRowKey', () => {
  it('spiegelt de dedup-sleutel import_hash|bank_seq', () => {
    expect(importRowKey({ import_hash: 'h1', bank_seq: null })).toBe('h1|')
    expect(importRowKey({ import_hash: 'h1', bank_seq: '003' })).toBe('h1|003')
  })
})

describe('applyAssignmentToImportRows', () => {
  const rows = [row('a'), row('b', { bank_seq: '1' }), row('c')]

  it('wijst budget toe aan de gevraagde rijen (manual, vol vertrouwen)', () => {
    const next = applyAssignmentToImportRows(rows, {
      keys: ['a|', 'c|'],
      budgetId: 'b-1',
      budgetName: 'Boodschappen',
      isTransfer: false,
    })
    expect(next[0]).toMatchObject({
      budget_id: 'b-1',
      budgetName: 'Boodschappen',
      confidence: 1,
      category_source: 'manual',
      userManuallyChanged: true,
      aiAccepted: false,
    })
    expect(next[1].budget_id).toBeNull() // b|1 niet gevraagd
    expect(next[2].budget_id).toBe('b-1')
  })

  it('eigen-rekening-drop zet de transfer-velden (markRowsAsTransfer-semantiek)', () => {
    const next = applyAssignmentToImportRows(rows, {
      keys: ['b|1'],
      budgetId: 'eigen-1',
      budgetName: 'Eigen rekening',
      isTransfer: true,
    })
    expect(next[1]).toMatchObject({
      budget_id: 'eigen-1',
      budgetName: 'Eigen rekening',
      isTransfer: true,
      transaction_type: 'transfer',
      category_source: 'transfer',
    })
    expect(next[0].isTransfer).toBe(false)
  })

  it('laat niet-gematchte rijen referentieel ongemoeid en behoudt extra velden', () => {
    const input = [{ ...row('a'), extra: 'x' }, { ...row('b'), extra: 'y' }]
    const next = applyAssignmentToImportRows(input, {
      keys: ['a|'],
      budgetId: 'b-1',
      budgetName: 'Boodschappen',
      isTransfer: false,
    })
    expect(next[1]).toBe(input[1])
    expect((next[0] as { extra?: string }).extra).toBe('x')
  })
})
