import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { __resetKeyCacheForTests, encryptField } from '@/lib/crypto/field-encryption'

/**
 * Regressietest voor bevestigde bug: `/api/budgetteren/setup` selecteerde een
 * niet-bestaande kolom `iban` op de `assets`-tabel (moet `account_number` zijn)
 * — zie route.ts, stap 1b (historisch). PostgREST/Postgres gaf daardoor een
 * 42703-fout ("column assets.iban does not exist") terug, waarna de route
 * ALTIJD in de generieke 500 eindigde ("Er ging iets mis. Probeer het later
 * opnieuw.").
 *
 * ## Het contract dat hier nu vastligt (na de account-number-seam-refactor)
 *
 * De fix is niet langer een PostgREST-alias (`iban:account_number`), maar een
 * expliciete mapping per cash-asset via `resolveAssetAccountNumber`
 * (`lib/asset-account-number.ts`) vóór de `syncBankAccountCompanion`-aanroep
 * in route.ts. Twee dingen liggen hier gepind, allebei op de RAUWE,
 * ongesplitste select-tokens — niet via de alias-resolvende
 * `requestedColumns()`-helper hieronder, want die zou een regressie naar de
 * oude aliasvorm `iban:account_number` onopgemerkt laten passeren (de alias
 * resolveert naar kolom `account_number`, dus een `.column`-gebaseerde check
 * ziet geen verschil met de huidige, juiste vorm):
 *
 *  1. de select bevat het EXACTE token `account_number` (plaintext-kolom);
 *  2. de select bevat óók het EXACTE token `account_number_encrypted` — sinds
 *     `20260802093000_auto_link_cash_asset_encrypted_iban.sql` vult de
 *     auto-link-trigger bij een bankkoppeling UITSLUITEND die kolom;
 *  3. de select bevat GEEN bare token `iban` en GEEN alias-token
 *     `iban:account_number` — die kolom bestaat niet op `assets`.
 *
 * Zie ook lib/asset-data.test.ts en lib/household/assets-column-contract.test.ts
 * voor dezelfde exacte-lijst-stijl (`select.split(', ')` + `toContain`/
 * `not.toContain` op de losse tokens, nooit een substring-check op de ruwe
 * string).
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

/** Simuleert PostgREST-gedrag: geldige select → rijen; onbekende kolom → 42703 (zoals echte Postgres). */
function resolveAssetsSelect(
  rows: Record<string, unknown>[],
  selectStr: string,
): { data: Record<string, unknown>[] | null; error: { code: string; message: string } | null } {
  try {
    return { data: rows.map((r) => projectAssetsRow(r, selectStr)), error: null }
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

/**
 * Asserteert het account-number-selectcontract op de RAUWE, ongesplitste
 * select-tokens (`selectStr.split(', ')`) — bewust NIET via `requestedColumns`
 * hierboven, want die resolveert een alias-token als `iban:account_number`
 * naar kolom `account_number` en zou een regressie naar de oude aliasvorm dus
 * NIET opmerken. Exacte token-membership (`Array.prototype.includes`), geen
 * substring-check op de ruwe string.
 */
function expectAssetAccountNumberSelectContract(selectStr: string) {
  const tokens = selectStr.split(', ')
  expect(tokens).toContain('account_number')
  expect(tokens).toContain('account_number_encrypted')
  expect(tokens).not.toContain('iban')
  expect(tokens).not.toContain('iban:account_number')
}

// Twee losse 32-byte hex-sleutels, alleen gebruikt in dit testbestand — nodig
// omdat `resolveAssetAccountNumber` hier ECHT ontsleutelt, niet gemockt.
// Zelfde patroon als lib/asset-account-number.test.ts.
const TEST_ENCRYPTION_KEY = 'aa'.repeat(32)
const TEST_INDEX_KEY = 'bb'.repeat(32)

beforeAll(() => {
  process.env.ENCRYPTION_KEY_V1 = TEST_ENCRYPTION_KEY
  process.env.IBAN_INDEX_KEY_V1 = TEST_INDEX_KEY
  __resetKeyCacheForTests()
})

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
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { POST } from './route'

const USER = { id: 'user-1' }
const ACCOUNT_NUMBER = 'NL01TEST0123456789'
// Geldig UUID-formaat (v4) — vereist door de zod-body-schema van de route.
const CASH_ASSET_ID = '11111111-1111-4111-8111-111111111111'

const CASH_ASSET_DB_ROW: Record<string, unknown> = {
  id: CASH_ASSET_ID,
  user_id: USER.id,
  name: 'Betaalrekening',
  account_number: ACCOUNT_NUMBER,
  institution: 'ING',
  subtype: 'checking',
  ownership: 'personal',
  household_id: null,
  current_value: 1500,
  is_active: true,
  has_budget_tracking: true,
  asset_type: 'cash',
}

function postRequest(body: unknown) {
  return { json: () => Promise.resolve(body) } as unknown as Request
}

let capturedSelectCols = ''
let capturedParentRows: Record<string, unknown>[] = []

function setupSupabaseMocks(cashRows: Record<string, unknown>[] = [CASH_ASSET_DB_ROW]) {
  // Call#1 (route.ts stap 1) — clear has_budget_tracking op alle cash-assets:
  // .update(...).eq('user_id').eq('asset_type') — terminal = 2e eq().
  const clearChain: Record<string, unknown> = {}
  clearChain.update = vi.fn(() => clearChain)
  const clearEq = vi.fn()
  clearEq.mockReturnValueOnce(clearChain).mockResolvedValueOnce({ error: null })
  clearChain.eq = clearEq

  // Call#2 — markeer geselecteerde cash-assets:
  // .update(...).eq('user_id').in('id', ids) — terminal = in().
  const markChain: Record<string, unknown> = {}
  markChain.update = vi.fn(() => markChain)
  markChain.eq = vi.fn(() => markChain)
  markChain.in = vi.fn().mockResolvedValue({ error: null })

  // Call#3 (stap 1b) — DE bug-select:
  // .select(cols).eq('user_id').eq('asset_type').eq('is_active') — terminal = 3e eq().
  const selectChain: Record<string, unknown> = {}
  selectChain.select = vi.fn((cols: string) => {
    capturedSelectCols = cols
    return selectChain
  })
  const selectEq = vi.fn()
  selectEq
    .mockReturnValueOnce(selectChain) // eq('user_id', ...)
    .mockReturnValueOnce(selectChain) // eq('asset_type', 'cash')
    .mockImplementationOnce(() =>
      Promise.resolve(resolveAssetsSelect(cashRows, capturedSelectCols)),
    ) // eq('is_active', true) — terminal
  selectChain.eq = selectEq

  // 'profiles' — net_monthly_income voor template-amounts (niet gebruikt bij 'empty').
  const profilesChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { net_monthly_income: 5000 }, error: null }),
  }

  // 'budgets' — delete-first + parent-insert(+select). Bij templateChoice 'empty'
  // heeft geen enkele parent children, dus er volgt geen 2e insert-call.
  const budgetsDeleteChain = {
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: null }),
  }
  const budgetsInsertChain: Record<string, unknown> = {}
  budgetsInsertChain.insert = vi.fn((rows: Record<string, unknown>[]) => {
    capturedParentRows = rows
    return budgetsInsertChain
  })
  budgetsInsertChain.select = vi.fn(() =>
    Promise.resolve({
      data: capturedParentRows.map((r, i) => ({ id: `budget-${i}`, slug: r.slug })),
      error: null,
    }),
  )

  // 'user_feature_visits' — best-effort upsert().then(...) (geen await-chain, direct .then()).
  const upsertChain = {
    upsert: vi.fn(() => ({
      then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(onFulfilled(undefined)),
    })),
  }

  const assetsQueue = [clearChain, markChain, selectChain]
  const budgetsQueue = [budgetsDeleteChain, budgetsInsertChain]

  mockFrom.mockImplementation((table: string) => {
    if (table === 'assets') {
      const chain = assetsQueue.shift()
      if (!chain) throw new Error("Onverwacht extra from('assets')-aanroep in test")
      return chain
    }
    if (table === 'budgets') {
      const chain = budgetsQueue.shift()
      if (!chain) throw new Error("Onverwacht extra from('budgets')-aanroep in test")
      return chain
    }
    if (table === 'profiles') return profilesChain
    if (table === 'user_feature_visits') return upsertChain
    throw new Error(`Onverwachte tabel in test: ${table}`)
  })
}

beforeEach(() => {
  mockAuthGetUser.mockReset()
  mockFrom.mockReset()
  mockSyncCompanion.mockReset().mockResolvedValue(undefined)
  mockSyncBudgetingActive.mockReset().mockResolvedValue(true)
  capturedSelectCols = ''
  capturedParentRows = []
  mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
  setupSupabaseMocks()
})

describe('POST /api/budgetteren/setup — companion-select kolombug (assets.iban bestaat niet)', () => {
  it('selecteert zowel account_number als account_number_encrypted, niet de niet-bestaande kolom iban', async () => {
    await POST(postRequest({ selectedCashAssetIds: [CASH_ASSET_ID], templateChoice: 'empty' }))

    expectAssetAccountNumberSelectContract(capturedSelectCols)
    // Aanvullend op de raw-token-check: ook via de alias-resolvende helper
    // (dekt de historische regressie letterlijk, niet alleen de vorm).
    const cols = requestedColumns(capturedSelectCols)
    expect(cols).toContain('account_number')
    expect(cols).not.toContain('iban')
  })

  it('setup slaagt (200) en companion-iban krijgt de account_number-waarde', async () => {
    const res = await POST(
      postRequest({ selectedCashAssetIds: [CASH_ASSET_ID], templateChoice: 'empty' }),
    )
    const json = await res.json()
    expect(res.status, `verwacht 200, kreeg ${res.status} met body ${JSON.stringify(json)}`).toBe(
      200,
    )

    expect(mockSyncCompanion).toHaveBeenCalledTimes(1)
    const [, , assetArg] = mockSyncCompanion.mock.calls[0] as [unknown, unknown, { iban?: unknown }]
    expect(assetArg.iban).toBe(ACCOUNT_NUMBER)
  })
})

describe('POST /api/budgetteren/setup — resolveAssetAccountNumber-precedence op wat syncBankAccountCompanion binnenkrijgt', () => {
  it('geval (a): plaintext gevuld wint — ook met een AFWIJKENDE ciphertext op de rij (anti-staleness)', async () => {
    const staleCiphertext = encryptField('NL99STALE0000000000')
    setupSupabaseMocks([
      { ...CASH_ASSET_DB_ROW, account_number: ACCOUNT_NUMBER, account_number_encrypted: staleCiphertext },
    ])

    await POST(postRequest({ selectedCashAssetIds: [CASH_ASSET_ID], templateChoice: 'empty' }))

    const [, , assetArg] = mockSyncCompanion.mock.calls[0] as [unknown, unknown, { iban?: unknown }]
    expect(assetArg.iban).toBe(ACCOUNT_NUMBER)
  })

  it('geval (b): plaintext null + ciphertext gevuld → de ontsleutelde waarde (bankkoppeling-geval)', async () => {
    const bankValue = 'NL88BANK1111111111'
    const bankCiphertext = encryptField(bankValue)
    setupSupabaseMocks([
      { ...CASH_ASSET_DB_ROW, account_number: null, account_number_encrypted: bankCiphertext },
    ])

    await POST(postRequest({ selectedCashAssetIds: [CASH_ASSET_ID], templateChoice: 'empty' }))

    const [, , assetArg] = mockSyncCompanion.mock.calls[0] as [unknown, unknown, { iban?: unknown }]
    expect(assetArg.iban).toBe(bankValue)
  })

  it('geval (c): beide leeg → companion-iban is null', async () => {
    setupSupabaseMocks([
      { ...CASH_ASSET_DB_ROW, account_number: null, account_number_encrypted: null },
    ])

    await POST(postRequest({ selectedCashAssetIds: [CASH_ASSET_ID], templateChoice: 'empty' }))

    const [, , assetArg] = mockSyncCompanion.mock.calls[0] as [unknown, unknown, { iban?: unknown }]
    expect(assetArg.iban).toBeNull()
  })
})

// Geldig UUID-formaat, tweede cash-asset die NIET wordt aangevinkt in deze setup-run.
const CASH_ASSET_ID_2 = '22222222-2222-4222-8222-222222222222'
const ACCOUNT_NUMBER_2 = 'NL02TEST9876543210'
const CASH_ASSET_DB_ROW_2: Record<string, unknown> = {
  id: CASH_ASSET_ID_2,
  user_id: USER.id,
  name: 'Spaarrekening',
  account_number: ACCOUNT_NUMBER_2,
  institution: 'ING',
  subtype: 'savings',
  ownership: 'personal',
  household_id: null,
  current_value: 3000,
  is_active: true,
  has_budget_tracking: false,
  asset_type: 'cash',
}

describe('POST /api/budgetteren/setup — niet-geselecteerde cash-asset krijgt companion-opruiming', () => {
  it('roept syncBankAccountCompanion aan met enabled=false voor de niet-aangevinkte cash-asset (en enabled=true voor de gekozen)', async () => {
    // Twee actieve cash-assets in de DB, maar de gebruiker vinkt alleen
    // CASH_ASSET_ID aan — CASH_ASSET_ID_2 moet het companion-opruimpad
    // (enabled=false) doorlopen, niet stilzwijgend overgeslagen worden.
    setupSupabaseMocks([CASH_ASSET_DB_ROW, CASH_ASSET_DB_ROW_2])

    const res = await POST(
      postRequest({ selectedCashAssetIds: [CASH_ASSET_ID], templateChoice: 'empty' }),
    )
    const json = await res.json()
    expect(res.status, `verwacht 200, kreeg ${res.status} met body ${JSON.stringify(json)}`).toBe(
      200,
    )

    expect(mockSyncCompanion).toHaveBeenCalledTimes(2)
    const calls = mockSyncCompanion.mock.calls as [unknown, unknown, { id: string; iban?: unknown }, boolean][]
    const selectedCall = calls.find((c) => c[2].id === CASH_ASSET_ID)
    const unselectedCall = calls.find((c) => c[2].id === CASH_ASSET_ID_2)

    expect(selectedCall?.[2].iban).toBe(ACCOUNT_NUMBER)
    expect(selectedCall?.[3]).toBe(true)

    expect(unselectedCall?.[2].iban).toBe(ACCOUNT_NUMBER_2)
    expect(unselectedCall?.[3]).toBe(false)
  })
})
