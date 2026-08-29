import { describe, it, expect } from 'vitest'
import {
  buildErrorGroups,
  summarizeErrorGroups,
  type ErrorLogRow,
  type ErrorResolutionRow,
} from './error-groups'

/**
 * De heropenregel is de reden dat dit scherm meer is dan een vinkje (ADR 0113):
 * een afgevinkte fout die terugkomt is een REGRESSIE en hoort zichzelf te
 * heropenen — zonder cron en zonder tweede boekhouding.
 */

function row(over: Partial<ErrorLogRow> & { created_at: string }): ErrorLogRow {
  return {
    id: `id-${over.created_at}`,
    context: 'window.onerror',
    message: 'Budget niet gevonden',
    level: 'error',
    url: null,
    stack: null,
    ...over,
  }
}

function resolution(over: Partial<ErrorResolutionRow> & { signature: string }): ErrorResolutionRow {
  return {
    resolved_at: '2026-08-10T00:00:00.000Z',
    resolved_by: 'admin-1',
    note: null,
    resolved_count: 1,
    last_seen_at: '2026-08-09T00:00:00.000Z',
    ...over,
  }
}

describe('buildErrorGroups — groeperen', () => {
  it('varianten van dezelfde fout vormen één groep met de juiste telling', () => {
    const groups = buildErrorGroups(
      [
        row({ created_at: '2026-08-01T10:00:00.000Z', message: 'Budget 42 niet gevonden' }),
        row({ created_at: '2026-08-02T10:00:00.000Z', message: 'Budget 99 niet gevonden' }),
        row({ created_at: '2026-08-03T10:00:00.000Z', message: 'Verbinding verbroken' }),
      ],
      [],
    )
    expect(groups).toHaveLength(2)
    const budget = groups.find((g) => g.sampleMessage.startsWith('Budget'))
    expect(budget?.count).toBe(2)
    expect(budget?.firstSeenAt).toBe('2026-08-01T10:00:00.000Z')
    expect(budget?.lastSeenAt).toBe('2026-08-02T10:00:00.000Z')
    // Nieuwste voorval is het representatieve voorbeeld.
    expect(budget?.sampleMessage).toBe('Budget 99 niet gevonden')
  })

  it('ongesorteerde invoer geeft dezelfde uitkomst', () => {
    const rows = [
      row({ created_at: '2026-08-02T10:00:00.000Z' }),
      row({ created_at: '2026-08-01T10:00:00.000Z' }),
    ]
    const a = buildErrorGroups(rows, [])
    const b = buildErrorGroups([...rows].reverse(), [])
    expect(a[0].firstSeenAt).toBe(b[0].firstSeenAt)
    expect(a[0].lastSeenAt).toBe(b[0].lastSeenAt)
  })
})

describe('buildErrorGroups — de heropenregel', () => {
  it('nooit afgevinkt → open', () => {
    const [g] = buildErrorGroups([row({ created_at: '2026-08-01T10:00:00.000Z' })], [])
    expect(g.open).toBe(true)
    expect(g.resolution).toBeNull()
    expect(g.countSinceResolved).toBe(0)
  })

  it('afgevinkt en niets nieuws → gesloten', () => {
    const rows = [row({ created_at: '2026-08-01T10:00:00.000Z' })]
    const sig = buildErrorGroups(rows, [])[0].signature
    const [g] = buildErrorGroups(rows, [resolution({ signature: sig })])
    expect(g.open).toBe(false)
    expect(g.countSinceResolved).toBe(0)
    expect(g.resolution?.resolvedBy).toBe('admin-1')
  })

  it('een rij NA het afvinken heropent de groep', () => {
    const rows = [
      row({ created_at: '2026-08-01T10:00:00.000Z' }),
      row({ created_at: '2026-08-12T10:00:00.000Z' }),
    ]
    const sig = buildErrorGroups(rows, [])[0].signature
    const [g] = buildErrorGroups(rows, [resolution({ signature: sig })])
    expect(g.open).toBe(true)
    expect(g.countSinceResolved).toBe(1)
    // De oude resolutie blijft leesbaar — zo zie je wát er is teruggekomen.
    expect(g.resolution?.resolvedAt).toBe('2026-08-10T00:00:00.000Z')
  })

  it('een rij precies OP resolved_at heropent niet (strikt nieuwer)', () => {
    const rows = [row({ created_at: '2026-08-10T00:00:00.000Z' })]
    const sig = buildErrorGroups(rows, [])[0].signature
    const [g] = buildErrorGroups(rows, [
      resolution({ signature: sig, resolved_at: '2026-08-10T00:00:00.000Z' }),
    ])
    expect(g.open).toBe(false)
  })

  it('een resolutie voor een onbekende signature raakt niets', () => {
    const rows = [row({ created_at: '2026-08-01T10:00:00.000Z' })]
    const [g] = buildErrorGroups(rows, [resolution({ signature: '0000000000000000' })])
    expect(g.open).toBe(true)
    expect(g.resolution).toBeNull()
  })
})

describe('sortering en samenvatting', () => {
  it('open groepen staan boven gesloten groepen', () => {
    const open = row({ created_at: '2026-07-01T10:00:00.000Z', message: 'Nog open' })
    const dicht = row({ created_at: '2026-08-20T10:00:00.000Z', message: 'Al afgehandeld' })
    const sigDicht = buildErrorGroups([dicht], [])[0].signature
    const groups = buildErrorGroups(
      [open, dicht],
      [resolution({ signature: sigDicht, resolved_at: '2026-08-25T00:00:00.000Z' })],
    )
    expect(groups[0].sampleMessage).toBe('Nog open')
    expect(groups[1].open).toBe(false)
  })

  it('summarize telt open, teruggekomen, soorten en regels', () => {
    const rows = [
      row({ created_at: '2026-08-01T10:00:00.000Z', message: 'Fout A' }),
      row({ created_at: '2026-08-12T10:00:00.000Z', message: 'Fout A' }),
      row({ created_at: '2026-08-02T10:00:00.000Z', message: 'Fout B' }),
    ]
    const sigA = buildErrorGroups(rows, []).find((g) => g.sampleMessage === 'Fout A')!.signature
    const groups = buildErrorGroups(rows, [resolution({ signature: sigA })])
    expect(summarizeErrorGroups(groups)).toEqual({
      totalGroups: 2,
      openGroups: 2,
      totalRows: 3,
      reopenedGroups: 1,
    })
  })
})
