import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regressietest voor bevestigde bug: `/api/assets/toggle-budget` selecteert
 * een niet-bestaande kolom `iban` op de `assets`-tabel (moet `account_number`
 * zijn) — zie route.ts regel ~45. PostgREST/Postgres geeft daardoor een
 * 42703-fout ("column assets.iban does not exist") terug, waarna de route
 * ALTIJD in de generieke 500 eindigt ("Er ging iets mis. Probeer het later
 * opnieuw.").
 *
 * Deze tests zijn NU rood door precies dat defect en horen groen te worden
 * zodra de route `account_number` selecteert én die waarde op het
 * companion-inputveld `iban` terechtkomt (bv. via PostgREST-aliasing
 * `iban:account_number` in de select-string, zodat `data` — dat ongewijzigd
 * doorgaat naar `syncBankAccountCompanion(supabase, user.id, data, ...)` —
 * automatisch een correct gevuld `.iban`-veld heeft).
 */

// ── Echte kolommenlijst van `assets` (bron: supabase/migrations) ──────────
// 20260215000000_create_base_tables.sql (basistabel) +
// 20260218000001_add_household_support.sql (ownership/household_id) +
// 20260408000001_encrypt_bank_credentials.sql (account_number_encrypted/hash).
// Bewust GEEN 'iban' — dat veld heet hier `account_number`.
const ASSETS_COLUMNS = [
  'id', 'user_id', 'name', 'asset_type', 'current_value', 'purchase_value',
  'purchase_date', 'expected_return', 'monthly_contribution', 'institution',
  'account_number', 'notes', 'is_active', 'sort_order', 'subtype',
  'risk_profile', 'tax_benefit', 'is_liquid', 'lock_end_date', 'ticker_symbol',
  'rental_income', 'woz_value', 'retirement_provider_type', 'depreciation_rate',
  'address_postcode', 'address_house_number', 'expiry_date', 'beneficiary',
  'kvk_number', 'ownership_percentage', 'annual_dividend', 'linked_asset_id',
  'net_worth_inclusion_pct', 'has_budget_tracking', 'has_holdings_tracking',
  'created_at', 'updated_at', 'ownership', 'household_id',
  'account_number_encrypted', 'account_number_hash',
]

class SchemaError extends Error {
  constructor(public column: string) {
    super(`column assets.${column} does not exist`)
  }
}

/** Parseert een PostgREST select-string ('a, b:c, d') naar {alias, column}[]. */
function parseSelect(selectStr: string): { alias: string; column: string }[] {
  return selectStr
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((tok) => {
      const idx = tok.indexOf(':')
      if (idx === -1) return { alias: tok, column: tok }
      return { alias: tok.slice(0, idx).trim(), column: tok.slice(idx + 1).trim() }
    })
}

/** Projecteert een select-string op een 'echte' DB-rij; gooit SchemaError bij onbekende kolom. */
function projectAssetsRow(
  row: Record<string, unknown>,
  selectStr: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const { alias, column } of parseSelect(selectStr)) {
    if (!ASSETS_COLUMNS.includes(column)) throw new SchemaError(column)
    out[alias] = row[column] ?? null
  }
  return out
}

/** Simuleert PostgREST .single()-gedrag: geldige select → rij; onbekende kolom → 42703. */
function resolveAssetsSelectSingle(
  row: Record<string, unknown>,
  selectStr: string,
): { data: Record<string, unknown> | null; error: { code: string; message: string } | null } {
  try {
    return { data: projectAssetsRow(row, selectStr), error: null }
  } catch (e) {
    if (e instanceof SchemaError) {
      return { data: null, error: { code: '42703', message: e.message } }
    }
    throw e
  }
}

/** Daadwerkelijk aangevraagde DB-kolomnamen (ná alias-resolutie) uit een select-string. */
function requestedColumns(selectStr: string): string[] {
  return parseSelect(selectStr).map((t) => t.column)
}

const mockAuthGetUser = vi.fn()
const mockFrom = vi.fn()
const mockSyncCompanion = vi.fn()
const mockSyncBudgetingActive = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockAuthGetUser },
    from: mockFrom,
  })),
}))
vi.mock('@/lib/bank-account-companion', () => ({
  syncBankAccountCompanion: (...args: unknown[]) => mockSyncCompanion(...args),
}))
vi.mock('@/lib/budgeting-active', () => ({
  syncBudgetingActive: (...args: unknown[]) => mockSyncBudgetingActive(...args),
}))

import { POST } from './route'

const USER = { id: 'user-1' }
const ACCOUNT_NUMBER = 'NL01TEST0123456789'
const CASH_ASSET_ID = 'asset-1'

const CASH_ASSET_DB_ROW: Record<string, unknown> = {
  id: CASH_ASSET_ID,
  name: 'Betaalrekening',
  account_number: ACCOUNT_NUMBER,
  institution: 'ING',
  subtype: 'checking',
  ownership: 'personal',
  household_id: null,
  current_value: 1500,
  has_budget_tracking: true,
}

function postRequest(body: unknown) {
  return { json: () => Promise.resolve(body) } as unknown as Request
}

let capturedSelectCols = ''

function setupSupabaseMocks() {
  // .update(...).eq('id').eq('user_id').select(cols).single() — terminal = single().
  const chain: Record<string, unknown> = {}
  chain.update = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.select = vi.fn((cols: string) => {
    capturedSelectCols = cols
    return chain
  })
  chain.single = vi.fn(() =>
    Promise.resolve(resolveAssetsSelectSingle(CASH_ASSET_DB_ROW, capturedSelectCols)),
  )
  mockFrom.mockReturnValue(chain)
}

beforeEach(() => {
  mockAuthGetUser.mockReset()
  mockFrom.mockReset()
  mockSyncCompanion.mockReset().mockResolvedValue(undefined)
  mockSyncBudgetingActive.mockReset().mockResolvedValue(true)
  capturedSelectCols = ''
  mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
  setupSupabaseMocks()
})

describe('POST /api/assets/toggle-budget — companion-select kolombug (assets.iban bestaat niet)', () => {
  it('selecteert account_number, niet de niet-bestaande kolom iban', async () => {
    await POST(postRequest({ id: CASH_ASSET_ID, enabled: true }))

    const cols = requestedColumns(capturedSelectCols)
    expect(cols).toContain('account_number')
    expect(cols).not.toContain('iban')
  })

  it('toggle slaagt (200/ok) en companion-iban krijgt de account_number-waarde', async () => {
    const res = await POST(postRequest({ id: CASH_ASSET_ID, enabled: true }))
    const json = await res.json()
    expect(res.status, `verwacht 200, kreeg ${res.status} met body ${JSON.stringify(json)}`).toBe(
      200,
    )
    expect(json.ok).toBe(true)

    expect(mockSyncCompanion).toHaveBeenCalledTimes(1)
    const [, , assetArg] = mockSyncCompanion.mock.calls[0] as [unknown, unknown, { iban?: unknown }]
    expect(assetArg.iban).toBe(ACCOUNT_NUMBER)
  })
})

describe('POST /api/assets/toggle-budget — uitzetten (enabled=false) gebruikt dezelfde alias-select', () => {
  it('selecteert account_number (niet iban) en roept syncBankAccountCompanion aan met enabled=false', async () => {
    const res = await POST(postRequest({ id: CASH_ASSET_ID, enabled: false }))
    const json = await res.json()
    expect(res.status, `verwacht 200, kreeg ${res.status} met body ${JSON.stringify(json)}`).toBe(
      200,
    )
    expect(json.ok).toBe(true)

    const cols = requestedColumns(capturedSelectCols)
    expect(cols).toContain('account_number')
    expect(cols).not.toContain('iban')

    expect(mockSyncCompanion).toHaveBeenCalledTimes(1)
    const [, , assetArg, enabledArg] = mockSyncCompanion.mock.calls[0] as [
      unknown,
      unknown,
      { iban?: unknown },
      boolean,
    ]
    expect(assetArg.iban).toBe(ACCOUNT_NUMBER)
    expect(enabledArg).toBe(false)
  })
})
