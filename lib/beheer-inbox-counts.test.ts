import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * `loadBeheerInboxCounts` — de tellers op de /beheer-hub.
 * Contract: een teller is een getal óf `null` ("ontbreekt eerlijk"); nooit
 * een nep-0 bij een onbereikbare bron; zonder superadmin-rol alles `null`
 * zonder één DB-aanraking; één falende bron trekt de andere niet mee.
 */

const mockIsSuperAdmin = vi.fn()
const mockLoadErrorGroups = vi.fn()

vi.mock('./admin', () => ({
  isSuperAdmin: (...args: unknown[]) => mockIsSuperAdmin(...args),
}))
vi.mock('./error-groups-loader', () => ({
  ERROR_LOG_COLUMNS_LEAN: 'lean',
  loadErrorGroups: (...args: unknown[]) => mockLoadErrorGroups(...args),
}))

import { loadBeheerInboxCounts } from './beheer-inbox-counts'
import type { ErrorGroup } from './error-groups'

type CountResult = { count: number | null; error: unknown }

let countByTable: Record<string, CountResult | (() => never)>
let touched: Array<{ table: string; status: string }>

function makeClient() {
  return {
    from(table: string) {
      return {
        select: () => ({
          eq: (_col: string, status: string) => {
            touched.push({ table, status })
            const r = countByTable[table]
            if (typeof r === 'function') return Promise.reject(new Error('boom'))
            return Promise.resolve(r ?? { count: null, error: { message: 'onbekende tabel' } })
          },
        }),
      }
    },
  } as unknown as Parameters<typeof loadBeheerInboxCounts>[0]
}

function group(open: boolean): ErrorGroup {
  return { open } as unknown as ErrorGroup
}

beforeEach(() => {
  mockIsSuperAdmin.mockReset().mockResolvedValue(true)
  mockLoadErrorGroups.mockReset().mockResolvedValue({
    groups: [group(true), group(true), group(false)],
    truncated: false,
  })
  countByTable = {
    feedback: { count: 4, error: null },
    calculator_reports: { count: 0, error: null },
  }
  touched = []
})

describe('loadBeheerInboxCounts', () => {
  it('telt open foutsoorten, nieuwe feedback en open rekenhulp-meldingen; een echte 0 blijft 0', async () => {
    const counts = await loadBeheerInboxCounts(makeClient())
    expect(counts).toEqual({ errors: 2, feedback: 4, calculator_reports: 0 })
    expect(touched).toEqual([
      { table: 'feedback', status: 'new' },
      { table: 'calculator_reports', status: 'open' },
    ])
    // Zelfde leesvenster als /beheer/errors, in de lean-kolomset (geen stacktraces).
    expect(mockLoadErrorGroups).toHaveBeenCalledWith(expect.anything(), 'lean')
  })

  it('zonder superadmin-rol: alles null en géén DB-aanraking', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    const counts = await loadBeheerInboxCounts(makeClient())
    expect(counts).toEqual({ errors: null, feedback: null, calculator_reports: null })
    expect(touched).toEqual([])
    expect(mockLoadErrorGroups).not.toHaveBeenCalled()
  })

  it('een falende rolcheck telt als geen rol (fail-closed)', async () => {
    mockIsSuperAdmin.mockRejectedValue(new Error('auth down'))
    const counts = await loadBeheerInboxCounts(makeClient())
    expect(counts).toEqual({ errors: null, feedback: null, calculator_reports: null })
    expect(touched).toEqual([])
  })

  it('een query-fout op één bron geeft daar null, de andere tellers blijven staan', async () => {
    countByTable.feedback = { count: null, error: { message: 'permission denied' } }
    const counts = await loadBeheerInboxCounts(makeClient())
    expect(counts).toEqual({ errors: 2, feedback: null, calculator_reports: 0 })
  })

  it('een exception op één bron wordt null, niet een throw', async () => {
    countByTable.calculator_reports = () => {
      throw new Error('boom')
    }
    const counts = await loadBeheerInboxCounts(makeClient())
    expect(counts.calculator_reports).toBeNull()
    expect(counts.feedback).toBe(4)
  })

  it('errors: leesvenster-fout → null; exception → null', async () => {
    mockLoadErrorGroups.mockResolvedValue({ error: { message: 'rls' } })
    expect((await loadBeheerInboxCounts(makeClient())).errors).toBeNull()
    mockLoadErrorGroups.mockRejectedValue(new Error('boom'))
    expect((await loadBeheerInboxCounts(makeClient())).errors).toBeNull()
  })

  it('een ontbrekende count (null zonder error) is geen 0 maar null', async () => {
    countByTable.feedback = { count: null, error: null }
    expect((await loadBeheerInboxCounts(makeClient())).feedback).toBeNull()
  })
})
