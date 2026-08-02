import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { __resetKeyCacheForTests, encryptField } from '@/lib/crypto/field-encryption'

// Twee losse 32-byte hex-sleutels, alleen gebruikt in dit testbestand — nodig
// omdat `resolveAssetAccountNumber` (via `setBudgetTracking`) hier ECHT
// ontsleutelt, niet gemockt. Zelfde patroon als lib/asset-account-number.test.ts.
const TEST_ENCRYPTION_KEY = 'aa'.repeat(32)
const TEST_INDEX_KEY = 'bb'.repeat(32)

beforeAll(() => {
  process.env.ENCRYPTION_KEY_V1 = TEST_ENCRYPTION_KEY
  process.env.IBAN_INDEX_KEY_V1 = TEST_INDEX_KEY
  __resetKeyCacheForTests()
})

/**
 * Regressietest voor bevestigde bug: `/api/assets/toggle-budget` selecteerde
 * een niet-bestaande kolom `iban` op de `assets`-tabel (moet `account_number`
 * zijn) — zie route.ts regel ~45 (historisch). PostgREST/Postgres gaf daardoor
 * een 42703-fout ("column assets.iban does not exist") terug, waarna de route
 * ALTIJD in de generieke 500 eindigde ("Er ging iets mis. Probeer het later
 * opnieuw.").
 *
 * ## Het contract dat hier nu vastligt (na de account-number-seam-refactor)
 *
 * De fix is niet langer een PostgREST-alias (`iban:account_number`), maar een
 * expliciete mapping via `resolveAssetAccountNumber` (`lib/asset-account-
 * number.ts`, aangeroepen vanuit `lib/budget-tracking.ts#setBudgetTracking`).
 * Twee dingen liggen hier gepind, allebei op de RAUWE, ongesplitste select-
 * tokens — niet via de alias-resolvende `requestedColumns()`-helper hieronder,
 * want die zou een regressie naar de oude aliasvorm `iban:account_number`
 * onopgemerkt laten passeren (de alias resolveert naar kolom `account_number`,
 * dus een `.column`-gebaseerde check ziet geen verschil met de huidige,
 * juiste vorm):
 *
 *  1. de select bevat het EXACTE token `account_number` (plaintext-kolom);
 *  2. de select bevat óók het EXACTE token `account_number_encrypted` — sinds
 *     `20260802093000_auto_link_cash_asset_encrypted_iban.sql` vult de
 *     auto-link-trigger bij een bankkoppeling UITSLUITEND die kolom; ontbreekt
 *     hij in de select, dan krijgt elke via de bank aangemaakte cash-bezitting
 *     géén IBAN op zijn companion — en een companion zonder IBAN valt uit de
 *     eigen-rekeningherkenning, waarna interne overboekingen als échte
 *     inkomst én uitgave meetellen;
 *  3. de select bevat GEEN bare token `iban` en GEEN alias-token
 *     `iban:account_number` — die kolom bestaat niet op `assets`.
 *
 * `expect(cols).toContain('account_number')` op een array van EXACTE,
 * gesplitste tokens is zelf geen substring-check (`Array.prototype.includes`,
 * geen `String.prototype.includes`) — maar zonder de aparte
 * `account_number_encrypted`-assertie hierboven zou de test niet merken als
 * die kolom uit de select verdween. Zie ook lib/asset-data.test.ts en
 * lib/household/assets-column-contract.test.ts voor dezelfde exacte-lijst-stijl.
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

function setupSupabaseMocks(row: Record<string, unknown> = CASH_ASSET_DB_ROW) {
  // .update(...).eq('id').eq('user_id').select(cols).single() — terminal = single().
  const chain: Record<string, unknown> = {}
  chain.update = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.select = vi.fn((cols: string) => {
    capturedSelectCols = cols
    return chain
  })
  chain.single = vi.fn(() =>
    Promise.resolve(resolveAssetsSelectSingle(row, capturedSelectCols)),
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
  it('selecteert zowel account_number als account_number_encrypted, niet de niet-bestaande kolom iban', async () => {
    await POST(postRequest({ id: CASH_ASSET_ID, enabled: true }))

    expectAssetAccountNumberSelectContract(capturedSelectCols)
    // Aanvullend op de raw-token-check: ook via de alias-resolvende helper
    // (dekt de historische regressie letterlijk, niet alleen de vorm).
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

describe('POST /api/assets/toggle-budget — resolveAssetAccountNumber-precedence op wat syncBankAccountCompanion binnenkrijgt', () => {
  it('geval (a): plaintext gevuld wint — ook met een AFWIJKENDE ciphertext op de rij (anti-staleness)', async () => {
    const staleCiphertext = encryptField('NL99STALE0000000000')
    setupSupabaseMocks({
      ...CASH_ASSET_DB_ROW,
      account_number: ACCOUNT_NUMBER,
      account_number_encrypted: staleCiphertext,
    })

    await POST(postRequest({ id: CASH_ASSET_ID, enabled: true }))

    const [, , assetArg] = mockSyncCompanion.mock.calls[0] as [unknown, unknown, { iban?: unknown }]
    expect(assetArg.iban).toBe(ACCOUNT_NUMBER)
  })

  it('geval (b): plaintext null + ciphertext gevuld → de ontsleutelde waarde (bankkoppeling-geval)', async () => {
    const bankValue = 'NL88BANK1111111111'
    const bankCiphertext = encryptField(bankValue)
    setupSupabaseMocks({
      ...CASH_ASSET_DB_ROW,
      account_number: null,
      account_number_encrypted: bankCiphertext,
    })

    await POST(postRequest({ id: CASH_ASSET_ID, enabled: true }))

    const [, , assetArg] = mockSyncCompanion.mock.calls[0] as [unknown, unknown, { iban?: unknown }]
    expect(assetArg.iban).toBe(bankValue)
  })

  it('geval (c): beide leeg → companion-iban is null', async () => {
    setupSupabaseMocks({
      ...CASH_ASSET_DB_ROW,
      account_number: null,
      account_number_encrypted: null,
    })

    await POST(postRequest({ id: CASH_ASSET_ID, enabled: true }))

    const [, , assetArg] = mockSyncCompanion.mock.calls[0] as [unknown, unknown, { iban?: unknown }]
    expect(assetArg.iban).toBeNull()
  })
})

describe('POST /api/assets/toggle-budget — zod-validatie (parseBody, ADR 0044)', () => {
  it('400 bij ontbrekende id (client-veilige envelope, geen from()-call)', async () => {
    const res = await POST(postRequest({ enabled: true }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('validation_error')
    expect(body.error).toMatch(/id/)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij ontbrekende enabled (client-veilige envelope, geen from()-call)', async () => {
    const res = await POST(postRequest({ id: CASH_ASSET_ID }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('validation_error')
    expect(body.error).toMatch(/enabled/)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij ongeldig JSON in de request body', async () => {
    const req = { json: () => Promise.reject(new SyntaxError('bad json')) } as unknown as Request

    const res = await POST(req)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Ongeldig JSON-formaat in request body')
  })
})

describe('POST /api/assets/toggle-budget — budgeting_active in de respons', () => {
  it('geeft de herberekende module-gate terug zoals syncBudgetingActive die oplevert', async () => {
    mockSyncBudgetingActive.mockResolvedValueOnce(false)

    const res = await POST(postRequest({ id: CASH_ASSET_ID, enabled: false }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.budgeting_active).toBe(false)
  })

  it('valt terug op budgeting_active: false wanneer syncBudgetingActive faalt (veilige kant voor de client-navigatie)', async () => {
    mockSyncBudgetingActive.mockRejectedValueOnce(new Error('db down'))

    const res = await POST(postRequest({ id: CASH_ASSET_ID, enabled: false }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.budgeting_active).toBe(false)
  })
})

describe('POST /api/assets/toggle-budget — uitzetten (enabled=false) gebruikt dezelfde select', () => {
  it('selecteert account_number + account_number_encrypted (niet iban) en roept syncBankAccountCompanion aan met enabled=false', async () => {
    const res = await POST(postRequest({ id: CASH_ASSET_ID, enabled: false }))
    const json = await res.json()
    expect(res.status, `verwacht 200, kreeg ${res.status} met body ${JSON.stringify(json)}`).toBe(
      200,
    )
    expect(json.ok).toBe(true)

    expectAssetAccountNumberSelectContract(capturedSelectCols)

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
