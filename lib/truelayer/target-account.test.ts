import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isSelectableTargetOption,
  loadOccupyingLink,
  loadOccupyingLinks,
  occupiedTargetAccountMessage,
  occupyingProviderLabel,
  resolveTargetAccount,
  TARGET_ACCOUNT_UNAVAILABLE_MESSAGE,
  type TargetAccountOption,
} from './target-account'

/**
 * De GESCHIKTHEIDSREGEL van een doelrekening, en dan specifiek het stuk dat
 * fase 6 toevoegde: FR5 — één ACTIEVE koppeling per TriFinity-rekening.
 *
 * Waarom dit een eigen suite verdient: deze regel wordt door vier oppervlakken
 * gelezen (de keuzelijst, `auth-link`, `relink`, de callback). Liep hij op één
 * plek uit de pas, dan biedt de wizard iets aan dat de route met een 409 weigert
 * — precies het defect dat fase 4 wegnam. Wat hier gepind wordt is de regel zelf,
 * niet het gedrag van één aanroeper.
 */

/**
 * Piepkleine Supabase-stub die de filters écht toepast: alleen zo bewijst een
 * test scope-gedrag (eigen rijen, `is_active`, de `neq`-uitzondering) in plaats
 * van aanroepvolgorde.
 */
type LinkRow = {
  id: string
  user_id: string
  bank_account_id: string | null
  is_active: boolean
  provider_name: string | null
}

type AccountRow = {
  id: string
  user_id: string
  name: string
  bank_name: string | null
  iban: string | null
  is_active: boolean
  linked_asset_id: string | null
}

type AssetRow = { id: string; user_id: string; is_active: boolean; has_budget_tracking: boolean | null }

function makeSupabase(fixture: {
  links?: LinkRow[]
  accounts?: AccountRow[]
  assets?: AssetRow[]
}) {
  function builder(table: string) {
    const eqs: Record<string, unknown> = {}
    const neqs: Record<string, unknown> = {}
    const notNull: string[] = []

    const b: Record<string, unknown> = {}
    b.select = () => b
    b.eq = (col: string, val: unknown) => { eqs[col] = val; return b }
    b.neq = (col: string, val: unknown) => { neqs[col] = val; return b }
    b.not = (col: string, op: string, val: unknown) => {
      if (op !== 'is' || val !== null) throw new Error(`stub kent .not(${col}, ${op}, ...) niet`)
      notNull.push(col)
      return b
    }
    b.limit = () => b

    function rows(): Record<string, unknown>[] {
      const source: Record<string, unknown>[] =
        table === 'bank_connection_accounts' ? (fixture.links ?? [])
        : table === 'bank_accounts' ? (fixture.accounts ?? [])
        : table === 'assets' ? (fixture.assets ?? [])
        : []

      return source.filter((row) =>
        Object.entries(eqs).every(([col, val]) => row[col] === val) &&
        Object.entries(neqs).every(([col, val]) => row[col] !== val) &&
        notNull.every((col) => row[col] !== null && row[col] !== undefined),
      )
    }

    function project(row: Record<string, unknown>) {
      if (table !== 'bank_connection_accounts') return row
      return {
        id: row.id,
        bank_account_id: row.bank_account_id,
        bank_connections: { provider_name: row.provider_name },
      }
    }

    b.maybeSingle = () => Promise.resolve({ data: rows().map(project)[0] ?? null, error: null })
    b.then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows().map(project), error: null }).then(onFulfilled)

    return b
  }

  return { from: (table: string) => builder(table) } as unknown as SupabaseClient
}

const USER = 'user-1'
const PARTNER = 'user-2'

const OWN_ACCOUNT: AccountRow = {
  id: 'acc-vrij',
  user_id: USER,
  name: 'Betaalrekening',
  bank_name: 'ING',
  iban: 'NL91ABNA0417164300',
  is_active: true,
  linked_asset_id: 'asset-1',
}
const OCCUPIED_ACCOUNT: AccountRow = { ...OWN_ACCOUNT, id: 'acc-bezet' }
const LIVE_ASSET: AssetRow = { id: 'asset-1', user_id: USER, is_active: true, has_budget_tracking: true }

describe('loadOccupyingLinks — welke rekening draagt al een actieve koppeling', () => {
  it('neemt alleen ACTIEVE koppelingen mee: een zacht ontkoppelde rij bezet niets', async () => {
    const supabase = makeSupabase({
      links: [
        { id: 'l1', user_id: USER, bank_account_id: 'acc-a', is_active: true, provider_name: 'ING' },
        { id: 'l2', user_id: USER, bank_account_id: 'acc-b', is_active: false, provider_name: 'Rabobank' },
      ],
    })

    const map = await loadOccupyingLinks(supabase, USER)

    // Dat is precies het reconnect-pad van fase 7: de rij blijft bestaan, de
    // rekening blijft kiesbaar, en de callback hergebruikt haar.
    expect([...map.keys()]).toEqual(['acc-a'])
    expect(map.get('acc-a')).toEqual({ id: 'l1', bankAccountId: 'acc-a', providerName: 'ING' })
  })

  it('een koppeling van de partner bezet mijn rekening niet', async () => {
    const supabase = makeSupabase({
      links: [
        { id: 'l1', user_id: PARTNER, bank_account_id: 'acc-a', is_active: true, provider_name: 'ING' },
      ],
    })

    expect((await loadOccupyingLinks(supabase, USER)).size).toBe(0)
  })

  it('een koppelrij zonder drager bezet niets', async () => {
    const supabase = makeSupabase({
      links: [{ id: 'l1', user_id: USER, bank_account_id: null, is_active: true, provider_name: 'ING' }],
    })

    expect((await loadOccupyingLinks(supabase, USER)).size).toBe(0)
  })
})

describe('loadOccupyingLink — per rekening, met uitzondering voor de eigen koppeling', () => {
  const links: LinkRow[] = [
    { id: 'l1', user_id: USER, bank_account_id: 'acc-a', is_active: true, provider_name: 'ING' },
  ]

  it('vindt de bezetter', async () => {
    const link = await loadOccupyingLink(makeSupabase({ links }), USER, 'acc-a')
    expect(link?.providerName).toBe('ING')
  })

  it('sluit de eigen koppeling uit — anders levert de voorselectie van het correctiemoment een 409', async () => {
    const link = await loadOccupyingLink(makeSupabase({ links }), USER, 'acc-a', {
      exceptConnectionAccountId: 'l1',
    })
    expect(link).toBeNull()
  })
})

describe('resolveTargetAccount — 400 en 409 zijn verschillende afwijzingen', () => {
  it('andermans rekening → unavailable, met dezelfde tekst als een onbekende rekening', async () => {
    const supabase = makeSupabase({
      accounts: [{ ...OWN_ACCOUNT, user_id: PARTNER }],
      assets: [LIVE_ASSET],
    })

    const res = await resolveTargetAccount(supabase, USER, OWN_ACCOUNT.id)

    expect(res).toEqual({
      ok: false,
      reason: 'unavailable',
      message: TARGET_ACCOUNT_UNAVAILABLE_MESSAGE,
    })
  })

  it('onbekende rekening → exact hetzelfde antwoord (geen existentie-orakel)', async () => {
    const res = await resolveTargetAccount(makeSupabase({}), USER, 'bestaat-niet')
    expect(res).toEqual({
      ok: false,
      reason: 'unavailable',
      message: TARGET_ACCOUNT_UNAVAILABLE_MESSAGE,
    })
  })

  it('eigen, vrije rekening → ok, met het cash-bezit erbij', async () => {
    const supabase = makeSupabase({ accounts: [OWN_ACCOUNT], assets: [LIVE_ASSET] })

    const res = await resolveTargetAccount(supabase, USER, OWN_ACCOUNT.id)

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.account.id).toBe(OWN_ACCOUNT.id)
    expect(res.asset?.id).toBe('asset-1')
  })

  it('eigen rekening mét actieve koppeling → occupied, mét banknaam en uitweg', async () => {
    const supabase = makeSupabase({
      accounts: [OCCUPIED_ACCOUNT],
      assets: [LIVE_ASSET],
      links: [
        { id: 'l1', user_id: USER, bank_account_id: OCCUPIED_ACCOUNT.id, is_active: true, provider_name: 'Rabobank' },
      ],
    })

    const res = await resolveTargetAccount(supabase, USER, OCCUPIED_ACCOUNT.id)

    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.reason).toBe('occupied')
    expect(res.message).toContain('Rabobank')
    expect(res.message).toContain('Verbreek')
  })

  it('bezet-melding komt NA de eigenaarschapstoets: andermans bezette rekening verklapt niets', async () => {
    const supabase = makeSupabase({
      accounts: [{ ...OCCUPIED_ACCOUNT, user_id: PARTNER }],
      assets: [LIVE_ASSET],
      links: [
        { id: 'l1', user_id: USER, bank_account_id: OCCUPIED_ACCOUNT.id, is_active: true, provider_name: 'Rabobank' },
      ],
    })

    const res = await resolveTargetAccount(supabase, USER, OCCUPIED_ACCOUNT.id)

    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.reason).toBe('unavailable')
    expect(res.message).not.toContain('Rabobank')
  })

  it('gedeactiveerd cash-bezit blijft unavailable, ook als de rekening vrij is (SC-13)', async () => {
    const supabase = makeSupabase({
      accounts: [OWN_ACCOUNT],
      assets: [{ ...LIVE_ASSET, is_active: false }],
    })

    const res = await resolveTargetAccount(supabase, USER, OWN_ACCOUNT.id)

    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.reason).toBe('unavailable')
  })
})

describe('occupiedTargetAccountMessage — één tekst, altijd met een uitweg', () => {
  it('noemt de bank als die bekend is', () => {
    expect(occupiedTargetAccountMessage('ING')).toContain('ING')
  })

  it('blijft bruikbaar zonder banknaam, en noemt nog steeds de uitweg', () => {
    const msg = occupiedTargetAccountMessage(null)
    expect(msg).not.toContain('null')
    expect(msg).toMatch(/verbreek/i)
  })
})

describe('occupyingProviderLabel — bezet mag nooit als "vrij" lezen', () => {
  it('geen koppeling → null (vrij)', () => {
    expect(occupyingProviderLabel(undefined)).toBeNull()
    expect(occupyingProviderLabel(null)).toBeNull()
  })

  it('koppeling zonder leesbare banknaam → een label, geen null', () => {
    // `linked_provider_name` IS het kiesbaarheidsfeit. `null` zou de rekening
    // weer kiesbaar maken en de gebruiker alsnog tegen de 409 laten lopen.
    expect(occupyingProviderLabel({ id: 'l1', bankAccountId: 'acc-a', providerName: null })).toBe(
      'een andere bank',
    )
  })
})

describe('isSelectableTargetOption — de ene predikaat voor beide keuzelijsten', () => {
  const option = (overrides: Partial<Pick<TargetAccountOption, 'id' | 'linked_provider_name'>> = {}) => ({
    id: 'acc-a',
    linked_provider_name: null as string | null,
    ...overrides,
  })

  it('vrije rekening is kiesbaar', () => {
    expect(isSelectableTargetOption(option())).toBe(true)
  })

  it('bezette rekening is niet kiesbaar', () => {
    expect(isSelectableTargetOption(option({ linked_provider_name: 'ING' }))).toBe(false)
  })

  it('de HUIDIGE drager blijft kiesbaar in het correctiemoment', () => {
    // Die is per definitie bezet — door déze koppeling. Hem uitschakelen zou de
    // voorselectie onbruikbaar maken en "opslaan zonder wijziging" blokkeren.
    expect(isSelectableTargetOption(option({ linked_provider_name: 'ING' }), 'acc-a')).toBe(true)
  })

  it('een ándere bezette rekening blijft ook in het correctiemoment uit', () => {
    expect(isSelectableTargetOption(option({ linked_provider_name: 'ING' }), 'acc-anders')).toBe(false)
  })
})
