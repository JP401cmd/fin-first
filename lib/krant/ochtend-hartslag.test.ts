import { describe, expect, it } from 'vitest'
import { OCHTEND_HARTSLAG_MAX_UUR, isHartslagVers, leesOchtendHartslag } from './ochtend-hartslag'

const NU = new Date('2026-09-30T05:20:00.000Z')
const uurTerug = (u: number) => new Date(NU.getTime() - u * 3_600_000).toISOString()

describe('isHartslagVers', () => {
  it('vers tot en met de grens van 48 uur, daarna vangnet', () => {
    expect(OCHTEND_HARTSLAG_MAX_UUR).toBe(48)
    expect(isHartslagVers(uurTerug(20), NU)).toBe(true) // gisterochtend
    expect(isHartslagVers(uurTerug(45), NU)).toBe(true) // één sessie gemist
    expect(isHartslagVers(uurTerug(48), NU)).toBe(true)
    expect(isHartslagVers(uurTerug(48.1), NU)).toBe(false) // twee gemist → cron neemt over
  })

  it('geen, onleesbare of ver-in-de-toekomst hartslag telt niet', () => {
    expect(isHartslagVers(null, NU)).toBe(false)
    expect(isHartslagVers('geen datum', NU)).toBe(false)
    expect(isHartslagVers(uurTerug(-1), NU)).toBe(false)
    expect(isHartslagVers(uurTerug(-0.05), NU)).toBe(true) // 3 min klokverschil
  })
})

function client(uitkomst: { data?: unknown; error?: unknown; werpt?: boolean }) {
  const filters: unknown[][] = []
  const q = {
    select: () => q,
    eq: (...a: unknown[]) => (filters.push(a), q),
    lte: (...a: unknown[]) => (filters.push(['lte', ...a]), q),
    order: () => q,
    limit: async () => {
      if (uitkomst.werpt) throw new Error('netwerk')
      return { data: uitkomst.data ?? null, error: uitkomst.error ?? null }
    },
  }
  return { sb: { from: (t: string) => (filters.push(['from', t]), q) } as never, filters }
}

describe('leesOchtendHartslag', () => {
  it('leest de laatste GESLAAGDE krant-ochtend-rij', async () => {
    const { sb, filters } = client({ data: [{ finished_at: uurTerug(3) }] })
    expect(await leesOchtendHartslag(sb, NU)).toEqual({ laatste: uurTerug(3), vers: true })
    expect(filters.slice(0, 3)).toEqual([['from', 'job_runs'], ['job', 'krant-ochtend'], ['status', 'success']])
    // Toekomstige rijen tellen niet als "laatste" (klokverschil ≤ 5 min).
    expect(filters[3]).toEqual(['lte', 'finished_at', new Date(NU.getTime() + 5 * 60 * 1000).toISOString()])
  })

  it('fail-open naar de API: DB-fout of exception = niet vers', async () => {
    expect(await leesOchtendHartslag(client({ error: { message: 'x' } }).sb, NU)).toEqual({ laatste: null, vers: false })
    expect(await leesOchtendHartslag(client({ werpt: true }).sb, NU)).toEqual({ laatste: null, vers: false })
    expect(await leesOchtendHartslag(client({ data: [] }).sb, NU)).toEqual({ laatste: null, vers: false })
  })
})
