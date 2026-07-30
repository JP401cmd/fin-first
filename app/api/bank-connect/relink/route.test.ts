import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST /api/bank-connect/relink — het correctiemoment (fase 5, SC-07).
 *
 * Wat hier bewezen wordt: (a) de eigenaarschaps- én FR5-grens ligt bij
 * `resolveTargetAccount`, niet bij de client; (b) een rekening die al door een
 * andere bank bezet is levert 409 in plaats van de dubbele koppeling die de
 * partiële unieke index van fase 6 hard blokkeert; (c) `sync_cursor` gaat mee op
 * `null`, want die cursor was een uitspraak over de vórige rekening; (d) het
 * cash-bezit wordt gegarandeerd NÁ de verhuizing — ervóór zou een gefaalde
 * verhuizing een zwevend €0-bezit achterlaten op een rekening die de koppeling
 * niet kreeg.
 */

const { mockCreateClient, mockResolveTargetAccount, mockEnsureCashAsset, mockRevertBalance } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockResolveTargetAccount: vi.fn(),
  mockEnsureCashAsset: vi.fn(),
  mockRevertBalance: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))

vi.mock('@/lib/truelayer/target-account', () => ({
  resolveTargetAccount: mockResolveTargetAccount,
}))

vi.mock('@/lib/truelayer/cash-asset-backfill', () => ({
  ensureCashAssetForBankAccount: mockEnsureCashAsset,
}))

vi.mock('@/lib/truelayer/balance-valuation', () => ({
  revertBankBalanceRevaluation: mockRevertBalance,
}))

import { POST } from './route'

const LINK_ID = '11111111-1111-4111-8111-111111111111'
const TARGET_ID = '22222222-2222-4222-8222-222222222222'
const CURRENT_ID = '33333333-3333-4333-8333-333333333333'

function requestWith(body: unknown) {
  return new Request('https://app.trifinity.nl/api/bank-connect/relink', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/**
 * Tabel-gequeuede stub, zelfde vorm als in de callback-test: `.from(table)`
 * levert een chainable die de eerstvolgende canned response van die tabel
 * consumeert. `.neq()` en `.select()` ná een update horen erbij omdat de route
 * die gebruikt.
 */
function makeStub(queues: Record<string, Array<{ data: unknown; error?: unknown }>>, user: unknown = { id: 'user-1' }) {
  const calls: Array<{ table: string; op: 'insert' | 'update'; data: Record<string, unknown> }> = []

  function next(table: string) {
    const queue = queues[table]
    if (!queue || queue.length === 0) {
      throw new Error(`Geen canned response meer gequeued voor tabel "${table}"`)
    }
    return queue.shift()!
  }

  function makeBuilder(table: string): any {
    const builder: any = {
      select: () => builder,
      insert: (data: Record<string, unknown>) => {
        calls.push({ table, op: 'insert', data })
        return builder
      },
      update: (data: Record<string, unknown>) => {
        calls.push({ table, op: 'update', data })
        return builder
      },
      eq: () => builder,
      neq: () => builder,
      limit: () => builder,
      order: () => builder,
      maybeSingle: () => Promise.resolve(next(table)),
      single: () => Promise.resolve(next(table)),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(next(table)).then(resolve, reject),
    }
    return builder
  }

  return {
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    from: (table: string) => makeBuilder(table),
    calls,
  }
}

const TARGET = {
  ok: true as const,
  account: {
    id: TARGET_ID,
    name: 'ING Betaalrekening',
    bank_name: 'ING',
    iban: 'NL91ABNA0417164300',
    is_active: true,
    linked_asset_id: 'asset-1',
  },
  asset: { id: 'asset-1', is_active: true, has_budget_tracking: true },
}

beforeEach(() => {
  mockCreateClient.mockReset()
  mockResolveTargetAccount.mockReset().mockResolvedValue(TARGET)
  mockEnsureCashAsset.mockReset().mockResolvedValue({ assetId: 'asset-1', created: false })
  mockRevertBalance.mockReset().mockResolvedValue({ reverted: false })
})

describe('POST /api/bank-connect/relink', () => {
  it('zonder sessie → 401 met de app-brede tekst', async () => {
    mockCreateClient.mockResolvedValue(makeStub({}, null))

    const res = await POST(requestWith({ connection_account_id: LINK_ID, bank_account_id: TARGET_ID }))

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual(expect.objectContaining({ error: 'Niet ingelogd' }))
  })

  it('body zonder geldige uuids → 400, niets weggeschreven', async () => {
    const stub = makeStub({})
    mockCreateClient.mockResolvedValue(stub)

    const res = await POST(requestWith({ connection_account_id: 'geen-uuid', bank_account_id: TARGET_ID }))

    expect(res.status).toBe(400)
    expect(stub.calls).toHaveLength(0)
  })

  it('onbekende of andermans koppeling → 404, geen update', async () => {
    const stub = makeStub({ bank_connection_accounts: [{ data: null }] })
    mockCreateClient.mockResolvedValue(stub)

    const res = await POST(requestWith({ connection_account_id: LINK_ID, bank_account_id: TARGET_ID }))

    expect(res.status).toBe(404)
    expect(stub.calls).toHaveLength(0)
    // De doelrekening wordt niet eens bevraagd: geen existentie-orakel.
    expect(mockResolveTargetAccount).not.toHaveBeenCalled()
  })

  it('doelrekening niet van deze gebruiker (of niet geschikt) → 400, geen update', async () => {
    mockResolveTargetAccount.mockResolvedValue({
      ok: false,
      reason: 'unavailable',
      message: 'Deze rekening bestaat niet of is niet van jou',
    })
    const stub = makeStub({
      bank_connection_accounts: [{ data: { id: LINK_ID, bank_account_id: CURRENT_ID, account_name: 'Main', last_synced_at: null, sync_cursor: null } }],
    })
    mockCreateClient.mockResolvedValue(stub)

    const res = await POST(requestWith({ connection_account_id: LINK_ID, bank_account_id: TARGET_ID }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({ error: 'Deze rekening bestaat niet of is niet van jou' }),
    )
    expect(stub.calls).toHaveLength(0)
  })

  it('dezelfde rekening opnieuw kiezen → 200 met changed: false, geen write', async () => {
    const stub = makeStub({
      bank_connection_accounts: [
        { data: { id: LINK_ID, bank_account_id: TARGET_ID, account_name: 'Main', last_synced_at: null, sync_cursor: null } },
      ],
    })
    mockCreateClient.mockResolvedValue(stub)

    const res = await POST(requestWith({ connection_account_id: LINK_ID, bank_account_id: TARGET_ID }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ bank_account_id: TARGET_ID, changed: false })
    expect(stub.calls).toHaveLength(0)
    expect(mockEnsureCashAsset).not.toHaveBeenCalled()
  })

  it('doelrekening al bezet door een andere bank → 409 met de banknaam, geen update', async () => {
    // FR5 wordt niet meer hier uitgevraagd maar in `resolveTargetAccount`, zodat
    // de wizard, `auth-link` en deze route één regel delen.
    mockResolveTargetAccount.mockResolvedValue({
      ok: false,
      reason: 'occupied',
      message: 'Deze rekening is al gekoppeld aan Rabobank. Verbreek die koppeling eerst bij de rekening; daarna kun je hem aan een andere bank koppelen.',
    })
    const stub = makeStub({
      bank_connection_accounts: [
        { data: { id: LINK_ID, bank_account_id: CURRENT_ID, account_name: 'Main', last_synced_at: null, sync_cursor: null } },
      ],
    })
    mockCreateClient.mockResolvedValue(stub)

    const res = await POST(requestWith({ connection_account_id: LINK_ID, bank_account_id: TARGET_ID }))

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({ error: expect.stringContaining('Rabobank') }),
    )
    expect(stub.calls).toHaveLength(0)
    expect(mockEnsureCashAsset).not.toHaveBeenCalled()
  })

  it('sluit de eigen koppeling uit van de bezet-toets (anders 409 op de voorselectie)', async () => {
    const stub = makeStub({
      bank_connection_accounts: [
        { data: { id: LINK_ID, bank_account_id: CURRENT_ID, account_name: 'Main', last_synced_at: null, sync_cursor: null } },
        { data: { id: LINK_ID } },
      ],
    })
    mockCreateClient.mockResolvedValue(stub)

    await POST(requestWith({ connection_account_id: LINK_ID, bank_account_id: TARGET_ID }))

    expect(mockResolveTargetAccount).toHaveBeenCalledWith(
      stub,
      'user-1',
      TARGET_ID,
      { exceptConnectionAccountId: LINK_ID },
    )
  })

  it('verhangt de koppeling, nult sync_cursor en garandeert het cash-bezit', async () => {
    const stub = makeStub({
      bank_connection_accounts: [
        { data: { id: LINK_ID, bank_account_id: CURRENT_ID, account_name: 'Main', last_synced_at: null, sync_cursor: null } }, // de te verhangen rij
        { data: { id: LINK_ID } }, // de update, met .select() erop
      ],
    })
    mockCreateClient.mockResolvedValue(stub)

    const res = await POST(requestWith({ connection_account_id: LINK_ID, bank_account_id: TARGET_ID }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ bank_account_id: TARGET_ID, changed: true })

    // Het bezit wordt gegarandeerd ná de verhuizing: zonder cash-bezit blijft de
    // rekening onzichtbaar in élk vermogens- en cash-oppervlak, maar een vers bezit
    // op een rekening die de koppeling niet kreeg ruimt niets op.
    expect(mockEnsureCashAsset).toHaveBeenCalledWith(
      stub,
      expect.objectContaining({ userId: 'user-1', bankAccountId: TARGET_ID }),
    )

    const update = stub.calls.find((c) => c.table === 'bank_connection_accounts' && c.op === 'update')
    expect(update?.data.bank_account_id).toBe(TARGET_ID)
    // De cursor hoorde bij de vórige rekening; laten staan zou de eerstvolgende
    // ophaal op de nieuwe rekening afkappen bij een datum die daar niets betekent.
    expect(update?.data.sync_cursor).toBeNull()
  })

  // ── Fase 8: het saldo van de OUDE drager gaat mee terug ──────────────────
  // Sinds fase 1 schrijft de callback het saldo al vóór dit moment, dus "relink
  // is gratis want er is nog niets geschreven" gold alleen nog voor transacties.

  it('draait het banksaldo van de vórige drager terug na een geslaagde verhanging', async () => {
    mockRevertBalance.mockResolvedValue({ reverted: true, from: 2543.67, to: 1000 })
    const stub = makeStub({
      bank_connection_accounts: [
        { data: { id: LINK_ID, bank_account_id: CURRENT_ID, account_name: 'Main', last_synced_at: null, sync_cursor: null } },
        { data: { id: LINK_ID } },
      ],
    })
    mockCreateClient.mockResolvedValue(stub)

    const res = await POST(requestWith({ connection_account_id: LINK_ID, bank_account_id: TARGET_ID }))

    expect(res.status).toBe(200)
    // De OUDE drager, niet de nieuwe: daar staat het saldo dat de callback
    // schreef en dat nergens meer bij hoort.
    expect(mockRevertBalance).toHaveBeenCalledWith(
      stub,
      expect.objectContaining({ userId: 'user-1', bankAccountId: CURRENT_ID }),
    )
  })

  it('compenseert niet wanneer er niets is verhangen (changed: false)', async () => {
    const stub = makeStub({
      bank_connection_accounts: [
        { data: { id: LINK_ID, bank_account_id: TARGET_ID, account_name: 'Main', last_synced_at: null, sync_cursor: null } },
      ],
    })
    mockCreateClient.mockResolvedValue(stub)

    await POST(requestWith({ connection_account_id: LINK_ID, bank_account_id: TARGET_ID }))

    expect(mockRevertBalance).not.toHaveBeenCalled()
  })

  it('al gesynchroniseerd → 409, want de al geïmporteerde transacties verhuizen niet mee (ADR 0069)', async () => {
    const stub = makeStub({
      bank_connection_accounts: [
        {
          data: {
            id: LINK_ID,
            bank_account_id: CURRENT_ID,
            account_name: 'Main',
            last_synced_at: '2026-07-29T10:00:00.000Z',
            sync_cursor: '2026-07-26',
          },
        },
      ],
    })
    mockCreateClient.mockResolvedValue(stub)

    const res = await POST(requestWith({ connection_account_id: LINK_ID, bank_account_id: TARGET_ID }))

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({ error: expect.stringContaining('vóór de eerste synchronisatie') }),
    )
    // De grens is een SERVERregel: geen write, geen backfill, en de doelrekening
    // wordt niet eens bevraagd.
    expect(stub.calls).toHaveLength(0)
    expect(mockResolveTargetAccount).not.toHaveBeenCalled()
    expect(mockEnsureCashAsset).not.toHaveBeenCalled()
  })

  it('een update die 0 rijen raakt meldt geen succes (RLS-stilte)', async () => {
    const stub = makeStub({
      bank_connection_accounts: [
        { data: { id: LINK_ID, bank_account_id: CURRENT_ID, account_name: 'Main', last_synced_at: null, sync_cursor: null } },
        { data: null }, // update raakte niets
      ],
    })
    mockCreateClient.mockResolvedValue(stub)

    const res = await POST(requestWith({ connection_account_id: LINK_ID, bank_account_id: TARGET_ID }))

    expect(res.status).toBe(500)
    // Client-veilige tekst, geen driverdetails (ADR 0044).
    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(body.error).not.toContain('0 rijen')

    // De backfill draait NÁ de geslaagde verhanging: stond hij ervóór, dan liet
    // een gefaalde verhuizing een zwevend €0-cash-bezit achter op een rekening
    // die de koppeling niet kreeg.
    expect(mockEnsureCashAsset).not.toHaveBeenCalled()
    // Zelfde volgorde-argument voor de compensatie: een gefaalde verhanging mag
    // het saldo niet terugdraaien op een rekening die de koppeling gewoon houdt.
    expect(mockRevertBalance).not.toHaveBeenCalled()
  })
})
