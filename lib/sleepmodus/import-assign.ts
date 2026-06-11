/**
 * Sleepmodus in de import-flow: de rijen staan nog niet in de DB, dus een drop
 * werkt de lokale ImportRow-lijst bij in plaats van Supabase. Pure functie —
 * spiegelt de semantiek van `updateRowBudget` (manual, vol vertrouwen) en
 * `markRowsAsTransfer` (transfer-velden) in app/(app)/core/cash/import/page.tsx.
 */

export type AssignableImportRow = {
  import_hash: string
  bank_seq: string | null
  budget_id: string | null
  budgetName: string | null
  confidence: number
  category_source: string | null
  isTransfer: boolean
  transaction_type: string | null
  aiAccepted?: boolean
  userManuallyChanged?: boolean
}

/** Zelfde sleutel als `rowDedupKey` op de import-pagina: `import_hash|bank_seq`. */
export function importRowKey(r: { import_hash: string; bank_seq: string | null }): string {
  return `${r.import_hash}|${r.bank_seq ?? ''}`
}

export type ImportAssignRequest = {
  /** Rij-sleutels (importRowKey) van de toe te wijzen rijen (tx + siblings). */
  keys: string[]
  budgetId: string
  budgetName: string | null
  /** Eigen rekening-drop: zet ook isTransfer/transaction_type. */
  isTransfer: boolean
}

export function applyAssignmentToImportRows<T extends AssignableImportRow>(
  rows: T[],
  req: ImportAssignRequest,
): T[] {
  const keys = new Set(req.keys)
  return rows.map((r) => {
    if (!keys.has(importRowKey(r))) return r
    if (req.isTransfer) {
      return {
        ...r,
        budget_id: req.budgetId,
        budgetName: req.budgetName,
        confidence: 1.0,
        category_source: 'transfer',
        isTransfer: true,
        transaction_type: 'transfer',
        aiAccepted: false,
        userManuallyChanged: true,
      }
    }
    return {
      ...r,
      budget_id: req.budgetId,
      budgetName: req.budgetName,
      confidence: 1.0,
      category_source: 'manual',
      aiAccepted: false,
      userManuallyChanged: true,
    }
  })
}
