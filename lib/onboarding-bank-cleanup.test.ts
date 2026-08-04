import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  selectEmptyBankAccountIds,
  deleteEmptyOnboardingBankAccounts,
  type BankAccountCleanupCandidate,
} from './onboarding-bank-cleanup'

/**
 * De onboarding-opruiming ruimde placeholder-rekeningen op met
 * `.eq('iban', '')` — een filter óp de kolom die Stage B laat vallen. De
 * vervanging mag NIET de kale vertaling `iban_encrypted IS NULL` zijn: die
 * matcht op remote 13 rijen in plaats van 2, waarvan er vijf samen ruim 27.000
 * transacties dragen (`transactions.account_id` = ON DELETE **CASCADE**, gemeten
 * tegen `pg_constraint` op 04-08-2026 en gecodificeerd in `20260804110000` — het
 * migratiebestand `20260215000000:219` zegt SET NULL en loopt achter; die
 * boekingen zouden dus niet verweesd raken maar onherroepelijk MEEVERDWIJNEN,
 * en via de cascade ook buiten RLS om) en één aan een
 * `bank_connection_accounts`-rij hangt (FK zonder ON DELETE = NO ACTION, dus de
 * hele delete zou eraan stuklopen).
 *
 * Deze tests leggen die uitsluitingen vast. Ze zijn de reden dat het verschil
 * tussen "geen IBAN" en "leeg" hier bestaat. De derde uitsluiting kwam er later
 * bij: de archief-rekening (`is_archive_bucket`) voldoet vers aan alle drie de
 * "leeg"-criteria en zou anders door de eerstvolgende onboarding-opslag worden
 * weggegooid.
 */

describe('selectEmptyBankAccountIds', () => {
  const geen = <T extends string>(...ids: T[]) => new Set<string>(ids)

  it('houdt rekeningen mét een versleutelde IBAN buiten de opruiming', () => {
    const kandidaten: BankAccountCleanupCandidate[] = [
      { id: 'leeg', iban_encrypted: null, is_archive_bucket: false },
      { id: 'gevuld', iban_encrypted: 'v1:abc', is_archive_bucket: false },
    ]
    expect(selectEmptyBankAccountIds(kandidaten, geen(), geen())).toEqual(['leeg'])
  })

  it('spaart een IBAN-loze rekening die transacties draagt', () => {
    // Dit is het pad dat ~27.000 boekingen zou vernietigen (FK = CASCADE).
    const kandidaten: BankAccountCleanupCandidate[] = [
      { id: 'met-tx', iban_encrypted: null, is_archive_bucket: false },
      { id: 'echt-leeg', iban_encrypted: null, is_archive_bucket: false },
    ]
    expect(selectEmptyBankAccountIds(kandidaten, geen('met-tx'), geen())).toEqual(['echt-leeg'])
  })

  it('spaart een IBAN-loze rekening waar een bankkoppeling aan hangt', () => {
    // Zonder deze uitsluiting faalt de DELETE op de NO ACTION-FK en wordt er
    // helemaal niets opgeruimd.
    const kandidaten: BankAccountCleanupCandidate[] = [
      { id: 'gekoppeld', iban_encrypted: null, is_archive_bucket: false },
      { id: 'echt-leeg', iban_encrypted: null, is_archive_bucket: false },
    ]
    expect(selectEmptyBankAccountIds(kandidaten, geen(), geen('gekoppeld'))).toEqual(['echt-leeg'])
  })

  it('spaart de archief-rekening, ook al voldoet die aan alle "leeg"-criteria', () => {
    // Een vers archief heeft geen IBAN, geen transacties en geen koppeling. Zonder
    // deze uitsluiting gooit de eerstvolgende onboarding-opslag hem weg.
    const kandidaten: BankAccountCleanupCandidate[] = [
      { id: 'archief', iban_encrypted: null, is_archive_bucket: true },
      { id: 'echt-leeg', iban_encrypted: null, is_archive_bucket: false },
    ]
    expect(selectEmptyBankAccountIds(kandidaten, geen(), geen())).toEqual(['echt-leeg'])
  })

  it('geeft een lege lijst als er niets écht leeg is', () => {
    const kandidaten: BankAccountCleanupCandidate[] = [
      { id: 'a', iban_encrypted: 'v1:x', is_archive_bucket: false },
      { id: 'b', iban_encrypted: null, is_archive_bucket: false },
    ]
    expect(selectEmptyBankAccountIds(kandidaten, geen('b'), geen())).toEqual([])
  })
})

/**
 * Fake supabase-client: net genoeg om de leesronde en de delete te volgen.
 * `deleteCapture` legt de doorgegeven filters vast zodat de test kan bewijzen
 * dat er op ID wordt verwijderd én dat het eigenaarsfilter meegaat.
 */
function mockSupabase(opts: {
  accounts: BankAccountCleanupCandidate[]
  txCountByAccount?: Record<string, number | null>
  linkedAccountIds?: string[]
  deleteError?: { message: string } | null
}) {
  const deleteCapture = { userId: null as string | null, ids: null as string[] | null, called: false }

  const supabase = {
    from(table: string) {
      if (table === 'bank_accounts') {
        return {
          select: () => ({
            // Twee `.eq()`-schakels: `user_id` en `is_archive_bucket`. De mock
            // FILTERT bewust niet op de bucket — zo bewijst de test dat de
            // tweede, defensieve uitsluiting in `selectEmptyBankAccountIds` óók
            // werkt als de query-kant hem zou missen.
            eq: () => ({
              eq: () => Promise.resolve({ data: opts.accounts, error: null }),
            }),
          }),
          delete: () => ({
            eq: (_col: string, userId: string) => ({
              in: (_idCol: string, ids: string[]) => {
                deleteCapture.called = true
                deleteCapture.userId = userId
                deleteCapture.ids = ids
                return Promise.resolve({ error: opts.deleteError ?? null })
              },
            }),
          }),
        }
      }
      if (table === 'transactions') {
        return {
          select: () => ({
            // Bewust géén `?? 0`: een test moet een EXPLICIETE `null`-count kunnen
            // opleggen (de fail-closed-tak). Alleen een ontbrekende sleutel is 0.
            eq: (_col: string, accountId: string) =>
              Promise.resolve({
                count: accountId in (opts.txCountByAccount ?? {}) ? opts.txCountByAccount![accountId] : 0,
                error: null,
              }),
          }),
        }
      }
      if (table === 'bank_connection_accounts') {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: (opts.linkedAccountIds ?? []).map((id) => ({ bank_account_id: id })),
                error: null,
              }),
          }),
        }
      }
      throw new Error(`onverwachte tabel: ${table}`)
    },
  } as unknown as SupabaseClient

  return { supabase, deleteCapture }
}

describe('deleteEmptyOnboardingBankAccounts', () => {
  it('verwijdert alleen de écht lege rekeningen, op id en met eigenaarsfilter', async () => {
    const { supabase, deleteCapture } = mockSupabase({
      accounts: [
        { id: 'leeg-1', iban_encrypted: null, is_archive_bucket: false },
        { id: 'leeg-2', iban_encrypted: null, is_archive_bucket: false },
        { id: 'met-iban', iban_encrypted: 'v1:abc', is_archive_bucket: false },
        { id: 'met-tx', iban_encrypted: null, is_archive_bucket: false },
        { id: 'gekoppeld', iban_encrypted: null, is_archive_bucket: false },
      ],
      txCountByAccount: { 'met-tx': 8758 },
      linkedAccountIds: ['gekoppeld'],
    })

    const verwijderd = await deleteEmptyOnboardingBankAccounts(supabase, 'user-1')

    expect(verwijderd).toBe(2)
    expect(deleteCapture.ids?.sort()).toEqual(['leeg-1', 'leeg-2'])
    expect(deleteCapture.userId).toBe('user-1')
  })

  it('raakt de tabel niet aan als er geen enkele IBAN-loze rekening is', async () => {
    const { supabase, deleteCapture } = mockSupabase({
      accounts: [{ id: 'a', iban_encrypted: 'v1:abc', is_archive_bucket: false }],
    })
    expect(await deleteEmptyOnboardingBankAccounts(supabase, 'user-1')).toBe(0)
    expect(deleteCapture.called).toBe(false)
  })

  it('raakt de tabel niet aan als elke IBAN-loze rekening data draagt', async () => {
    const { supabase, deleteCapture } = mockSupabase({
      accounts: [
        { id: 'met-tx', iban_encrypted: null, is_archive_bucket: false },
        { id: 'gekoppeld', iban_encrypted: null, is_archive_bucket: false },
      ],
      txCountByAccount: { 'met-tx': 1 },
      linkedAccountIds: ['gekoppeld'],
    })
    expect(await deleteEmptyOnboardingBankAccounts(supabase, 'user-1')).toBe(0)
    expect(deleteCapture.called).toBe(false)
  })

  it('behoudt een rekening waarvan het transactie-aantal onbekend is (fail-closed)', async () => {
    // `count: 'exact', head: true` leidt het aantal af uit de Content-Range-header.
    // Strip een proxy die, dan is `error` null én `count` null. Zou dat als 0
    // tellen, dan wist deze opruiming een rekening mét transacties — en omdat
    // `transactions.account_id` ON DELETE CASCADE is, zijn die boekingen dan
    // onherroepelijk weg (niet verweesd, zoals SET NULL zou doen).
    const { supabase, deleteCapture } = mockSupabase({
      accounts: [{ id: 'onbekend', iban_encrypted: null, is_archive_bucket: false }],
      txCountByAccount: { onbekend: null },
    })
    expect(await deleteEmptyOnboardingBankAccounts(supabase, 'user-1')).toBe(0)
    expect(deleteCapture.called).toBe(false)
  })

  it('rapporteert 0 en gooit niet als de delete faalt', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { supabase } = mockSupabase({
      accounts: [{ id: 'leeg', iban_encrypted: null, is_archive_bucket: false }],
      deleteError: { message: 'boem' },
    })
    expect(await deleteEmptyOnboardingBankAccounts(supabase, 'user-1')).toBe(0)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
