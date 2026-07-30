import { describe, it, expect, vi } from 'vitest'
import { syncBankAccountCompanion, type CompanionAssetInput } from './bank-account-companion'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Regressie: aanvinken van een rekening in de Budgetteren-setupwizard zette wél
 * assets.has_budget_tracking, maar maakte géén gekoppelde bank_accounts-rij
 * (companion) aan — waardoor de rekening onzichtbaar bleef op /core/cash/import.
 * Deze helper is de gedeelde companion-sync voor álle schrijfpaden.
 *
 * De uitzet-tak (enabled=false) draagt twee invarianten (besluit B1b, zie de
 * docstring bij de uitzet-tak in bank-account-companion.ts):
 *  1. De companion-rij (`bank_accounts`) wordt NOOIT verwijderd — `bank_
 *     connection_accounts.bank_account_id` verwijst ernaar met ON DELETE NO
 *     ACTION, dus een delete faalt zodra er ooit een bankkoppeling op zit,
 *     terwijl `assets.has_budget_tracking` dan al is weggeschreven (een half
 *     toegepaste mutatie zonder foutmelding).
 *  2. `linked_asset_id` (UNIQUE, permanente 1-op-1-binding) wordt NOOIT genuld
 *     — meerdere surfaces (horizon-client, what-if, check-in) tellen "losse"
 *     rekeningen als `is_active AND linked_asset_id IS NULL` BOVENOP de
 *     cash-asset; nullen betekent dus dubbel geteld vermogen.
 */

const asset: CompanionAssetInput = {
  id: 'asset-1',
  name: 'Betaalrekening',
  iban: 'NL00BANK0123456789',
  institution: 'ING',
  subtype: 'checking',
  ownership: 'personal',
  household_id: null,
  current_value: 1500,
}

type Captured = {
  bankInsert: ReturnType<typeof vi.fn>
  bankUpdate: ReturnType<typeof vi.fn>
  bankDelete: ReturnType<typeof vi.fn>
}

function mockSupabase(opts: {
  existingBankAccountId: string | null
  transactionCount?: number
}): { supabase: SupabaseClient } & Captured {
  const bankInsert = vi.fn().mockResolvedValue({ error: null })
  const bankUpdate = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))
  const bankDelete = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))

  // De companion-lookup filtert op `linked_asset_id` ÉN `user_id` (eigenaarschap,
  // zie de noot in bank-account-companion.ts), dus `.eq()` moet doorschakelbaar zijn.
  const bankAccountsSelectChain: Record<string, unknown> = {
    maybeSingle: vi.fn().mockResolvedValue({
      data: opts.existingBankAccountId ? { id: opts.existingBankAccountId } : null,
      error: null,
    }),
  }
  bankAccountsSelectChain.eq = vi.fn(() => bankAccountsSelectChain)

  const bankAccounts = {
    select: vi.fn(() => bankAccountsSelectChain),
    insert: bankInsert,
    update: bankUpdate,
    delete: bankDelete,
  }

  const transactions = {
    select: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ count: opts.transactionCount ?? 0, error: null }),
    })),
  }

  const from = vi.fn((table: string) =>
    table === 'bank_accounts' ? bankAccounts : transactions,
  )

  return {
    supabase: { from } as unknown as SupabaseClient,
    bankInsert,
    bankUpdate,
    bankDelete,
  }
}

describe('syncBankAccountCompanion', () => {
  it('maakt een companion-rij aan wanneer aangezet en er nog geen bestaat', async () => {
    const { supabase, bankInsert } = mockSupabase({ existingBankAccountId: null })

    await syncBankAccountCompanion(supabase, 'user-1', asset, true)

    expect(bankInsert).toHaveBeenCalledTimes(1)
    const row = bankInsert.mock.calls[0][0]
    expect(row).toMatchObject({
      user_id: 'user-1',
      linked_asset_id: 'asset-1',
      name: 'Betaalrekening',
      bank_name: 'ING',
      account_type: 'checking',
      balance: 1500,
      household_id: null,
    })
  })

  it('werkt de bestaande companion bij (en reactiveert) i.p.v. dubbel aanmaken', async () => {
    const { supabase, bankInsert, bankUpdate } = mockSupabase({ existingBankAccountId: 'ba-1' })

    await syncBankAccountCompanion(supabase, 'user-1', asset, true)

    expect(bankInsert).not.toHaveBeenCalled()
    expect(bankUpdate).toHaveBeenCalledTimes(1)
    expect(bankUpdate.mock.calls[0][0]).toMatchObject({ is_active: true, balance: 1500 })
  })

  it('koppelt household_id bij gedeeld eigendom', async () => {
    const { supabase, bankInsert } = mockSupabase({ existingBankAccountId: null })

    await syncBankAccountCompanion(
      supabase,
      'user-1',
      { ...asset, ownership: 'shared', household_id: 'hh-9' },
      true,
    )

    expect(bankInsert.mock.calls[0][0]).toMatchObject({ ownership: 'shared', household_id: 'hh-9' })
  })

  it('deactiveert de companion bij uitzetten wanneer er geen transacties zijn — nooit delete, nooit linked_asset_id: null', async () => {
    const { supabase, bankDelete, bankUpdate } = mockSupabase({
      existingBankAccountId: 'ba-1',
      transactionCount: 0,
    })

    await syncBankAccountCompanion(supabase, 'user-1', asset, false)

    expect(bankDelete).not.toHaveBeenCalled()
    expect(bankUpdate).toHaveBeenCalledTimes(1)
    expect(bankUpdate.mock.calls[0][0]).toEqual({ is_active: false })
  })

  it('deactiveert de companion bij uitzetten wanneer er wél transacties zijn — nooit delete, nooit linked_asset_id: null', async () => {
    const { supabase, bankDelete, bankUpdate } = mockSupabase({
      existingBankAccountId: 'ba-1',
      transactionCount: 3,
    })

    await syncBankAccountCompanion(supabase, 'user-1', asset, false)

    expect(bankDelete).not.toHaveBeenCalled()
    expect(bankUpdate).toHaveBeenCalledTimes(1)
    expect(bankUpdate.mock.calls[0][0]).toEqual({ is_active: false })
  })

  it('doet niets bij uitzetten wanneer er geen companion bestaat', async () => {
    const { supabase, bankDelete, bankUpdate } = mockSupabase({ existingBankAccountId: null })

    await syncBankAccountCompanion(supabase, 'user-1', asset, false)

    expect(bankDelete).not.toHaveBeenCalled()
    expect(bankUpdate).not.toHaveBeenCalled()
  })
})
