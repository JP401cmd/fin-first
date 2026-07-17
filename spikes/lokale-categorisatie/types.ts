// Gedeelde types voor het meetharnas.

// Systeemprompt-as: hoeveel context/budgetnotatie (full = echte app-prompt).
export type PromptVariant = 'full' | 'compact'

// Uitvoer-as (los van de prompt-as): hoeveel het model per transactie teruggeeft.
// 'reasoning' = {budget_slug, confidence, reasoning}; 'kort' = {budget_slug, confidence}.
// 'kort' is de grootste snelheidshefboom omdat decode de wandkloktijd domineert.
export type OutputVariant = 'reasoning' | 'kort'

export type ChatMessage = { role: 'system' | 'user'; content: string }

/** Eén rij uit dataset/dev-set-v1.json. */
export type DevTransaction = {
  id: string
  description: string
  counterparty_name: string | null
  amount: number
  reference: string | null
  date: string
  /** Ground-truth leaf-slug (of null wanneer geen budget hoort te matchen). */
  label_slug: string | null
  edge_case: boolean
  edge_note?: string
  /** Alleen op goud-sets: herkomst van de ground truth ('manual' = sterkst). */
  bron?: 'manual' | 'ai'
}

export type DevSet = {
  version: string
  note: string
  transactions: DevTransaction[]
}

/** Wat het model per transactie teruggaf, plus de beoordeling. */
export type TxResult = {
  id: string
  batchIndex: number
  expected: string | null
  rawSlug: string | null
  /** rawSlug na validatie tegen de aangeboden budgetlijst (onbekend → null). */
  validatedSlug: string | null
  /** Parsebaar item én (slug === null of slug ∈ budgetlijst). */
  valid: boolean
  correct: boolean
  confidence: number
  reasoning: string
  edge_case: boolean
  /** Herkomst van de ground truth op goud-sets ('manual' sterkst), null op dev-set. */
  bron: 'manual' | 'ai' | null
}

/** Diagnose van de ruwe modeloutput per batch (voor de validiteits-analyse, metriek 9). */
export type BatchDiagnostics = {
  hadFence: boolean
  hadThink: boolean
  truncated: boolean
  salvaged: boolean
  itemCount: number
  expectedCount: number
}

/** Timing/doorvoer per batch (metriek 6) + diagnose (metriek 9). */
export type BatchTiming = {
  index: number
  size: number
  ttftMs: number | null
  decodeTokPerSec: number | null
  wallMs: number
  inputTokens: number
  generatedTokens: number
  parseOk: boolean
  rawOutput: string
  diagnostics: BatchDiagnostics
}
