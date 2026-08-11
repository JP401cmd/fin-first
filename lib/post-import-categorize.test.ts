import { describe, it, expect } from 'vitest'
import {
  pickUncategorized,
  mergeUncategorized,
  retainStillOpen,
  type InsertedTxRow,
  type PostImportTx,
} from './post-import-categorize'

function row(over: Partial<InsertedTxRow> & { id: string }): InsertedTxRow {
  return {
    date: '2026-01-15',
    description: 'Betaling',
    counterparty_name: null,
    counterparty_iban: null,
    amount: -12.5,
    import_hash: 'h',
    budget_id: null,
    reference: null,
    transaction_type: null,
    ...over,
  }
}

describe('pickUncategorized', () => {
  it('houdt alleen rijen zonder budget die geen overboeking zijn', () => {
    const picked = pickUncategorized(
      [
        row({ id: 'open' }),
        row({ id: 'heeft-budget', budget_id: 'b1' }),
        row({ id: 'overboeking', transaction_type: 'transfer' }),
      ],
      'acc-1',
    )
    expect(picked.map((r) => r.id)).toEqual(['open'])
    expect(picked[0].account_id).toBe('acc-1')
    expect(picked[0].budget_id).toBeNull()
  })

  it('normaliseert een bedrag dat als string terugkomt', () => {
    const [picked] = pickUncategorized([row({ id: 'a', amount: '-12.50' })], null)
    expect(picked.amount).toBe(-12.5)
  })

  it('levert een lege lijst als alles al gecategoriseerd is', () => {
    expect(pickUncategorized([row({ id: 'a', budget_id: 'b1' })], 'acc-1')).toEqual([])
  })
})

describe('mergeUncategorized — herstelde rijen bereiken het categoriseer-scherm', () => {
  const first: PostImportTx[] = pickUncategorized([row({ id: 'r1' })], 'acc-1')

  it('vult aan in plaats van te vervangen', () => {
    const recovered = pickUncategorized([row({ id: 'r2' })], 'acc-1')
    expect(mergeUncategorized(first, recovered).map((r) => r.id)).toEqual(['r1', 'r2'])
  })

  it('biedt een rij die al in de set zit niet dubbel aan', () => {
    const recovered = pickUncategorized([row({ id: 'r1' }), row({ id: 'r2' })], 'acc-1')
    expect(mergeUncategorized(first, recovered).map((r) => r.id)).toEqual(['r1', 'r2'])
  })

  it('is idempotent: tweemaal dezelfde herstelde batch verandert de set niet', () => {
    const recovered = pickUncategorized([row({ id: 'r2' })], 'acc-1')
    const once = mergeUncategorized(first, recovered)
    const twice = mergeUncategorized(once, recovered)
    expect(twice.map((r) => r.id)).toEqual(['r1', 'r2'])
  })

  it('laat de set ongemoeid zonder herstelde rijen', () => {
    expect(mergeUncategorized(first, [])).toBe(first)
  })
})

describe('retainStillOpen — de teller volgt de database, niet een lokale aftrekking', () => {
  const set = pickUncategorized([row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })], 'acc-1')

  it('verwijdert rijen die inmiddels een budget hebben', () => {
    expect(retainStillOpen(set, new Set(['b'])).map((r) => r.id)).toEqual(['b'])
  })

  it('leegt de set wanneer alles is ingedeeld', () => {
    expect(retainStillOpen(set, new Set())).toEqual([])
  })

  it('verwijdert ook rijen die retroactief door een opgeslagen regel zijn ingedeeld', () => {
    // De sheet past een nieuwe regel toe op álle nog ongecategoriseerde treffers —
    // ook op rijen die hij nooit expliciet toonde. Alleen een verse lezing vangt dat.
    expect(retainStillOpen(set, new Set(['c'])).map((r) => r.id)).toEqual(['c'])
  })
})
