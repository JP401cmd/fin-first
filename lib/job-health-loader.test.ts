import { describe, expect, it } from 'vitest'
import { JOB_LIST } from '@/lib/job-catalog'
import { loadJobStanden, verliesRegels } from './job-health-loader'

/**
 * De leesactie achter `/beheer/jobs` en het beheerdashboard. De afleiding zelf
 * (`deriveJobHealth`) is apart getest; hier gaat het om wát er gelezen wordt en
 * wat een leesfout oplevert.
 */

const NU = new Date('2026-09-29T10:00:00Z')

interface Antwoord {
  data: unknown
  error: unknown
}

/** Onthoudt per query de taak en of er op status gefilterd is. */
function maakClient(antwoord: (job: string, alleenGeslaagd: boolean) => Antwoord) {
  const vragen: { job: string; alleenGeslaagd: boolean }[] = []
  const client = {
    from() {
      let job = ''
      let alleenGeslaagd = false
      const keten = {
        select: () => keten,
        eq: (_kolom: string, waarde: string) => {
          job = waarde
          return keten
        },
        in: () => {
          alleenGeslaagd = true
          return keten
        },
        order: () => keten,
        limit: () => keten,
        maybeSingle: () => {
          vragen.push({ job, alleenGeslaagd })
          return Promise.resolve(antwoord(job, alleenGeslaagd))
        },
      }
      return keten
    },
  }
  return { client: client as unknown as Parameters<typeof loadJobStanden>[0], vragen }
}

function rij(job: string, status: string, created_at: string) {
  return {
    id: `${job}-1`,
    job,
    status,
    started_at: created_at,
    finished_at: created_at,
    duration_ms: 10,
    summary: null,
    error: null,
    created_at,
  }
}

const VERS = '2026-09-29T05:00:00Z'

describe('loadJobStanden', () => {
  it('geeft elke taak uit de catalogus terug, in catalogusvolgorde', async () => {
    const { client } = maakClient((job) => ({ data: rij(job, 'success', VERS), error: null }))
    const standen = await loadJobStanden(client, NU)
    expect(standen.map((s) => s.job.key)).toEqual(JOB_LIST.map((j) => j.key))
  })

  it('een geslaagde laatste run: actueel, en geen tweede query', async () => {
    const { client, vragen } = maakClient((job) => ({ data: rij(job, 'success', VERS), error: null }))
    const standen = await loadJobStanden(client, NU)
    const ingest = standen.find((s) => s.job.key === 'news-ingest')
    expect(ingest?.health).toBe('ok')
    expect(ingest?.lastSuccessAt).toBe(VERS)
    expect(vragen.filter((v) => v.alleenGeslaagd)).toEqual([])
  })

  it('een deels geslaagde run telt als "draaide": actueel, geen tweede query', async () => {
    const { client, vragen } = maakClient((job) => ({ data: rij(job, 'partial', VERS), error: null }))
    const standen = await loadJobStanden(client, NU)
    expect(standen.find((s) => s.job.key === 'news-ingest')?.health).toBe('ok')
    expect(vragen.some((v) => v.alleenGeslaagd)).toBe(false)
  })

  it('een gefaalde laatste run vraagt de laatste GESLAAGDE run op, alleen voor bewaakte taken', async () => {
    const { client, vragen } = maakClient((job, alleenGeslaagd) =>
      alleenGeslaagd
        ? { data: { created_at: '2026-09-28T05:00:00Z' }, error: null }
        : { data: rij(job, 'error', VERS), error: null },
    )
    const standen = await loadJobStanden(client, NU)

    const bewaakt = JOB_LIST.filter((j) => j.maxAgeHours != null).map((j) => j.key)
    expect(
      vragen
        .filter((v) => v.alleenGeslaagd)
        .map((v) => v.job)
        .sort(),
    ).toEqual([...bewaakt].sort())

    const ingest = standen.find((s) => s.job.key === 'news-ingest')
    // Gisteren 05:00 geslaagd, venster 26 + 3 uur: nu (10:00) precies op de rand, dus nog actueel.
    expect(ingest?.lastSuccessAt).toBe('2026-09-28T05:00:00Z')
    expect(ingest?.health).toBe('ok')
    expect(ingest?.last?.status).toBe('error')
  })

  it('een taak die elke keer faalt en nooit slaagde, loopt achter', async () => {
    const { client } = maakClient((job, alleenGeslaagd) =>
      alleenGeslaagd ? { data: null, error: null } : { data: rij(job, 'error', VERS), error: null },
    )
    const standen = await loadJobStanden(client, NU)
    expect(standen.find((s) => s.job.key === 'news-ingest')?.health).toBe('overdue')
  })

  it('geen enkele run: "nog niet uitgevoerd" voor bewaakte taken, "niet bewaakt" voor de rest', async () => {
    const { client } = maakClient(() => ({ data: null, error: null }))
    const standen = await loadJobStanden(client, NU)
    expect(standen.find((s) => s.job.key === 'news-ingest')?.health).toBe('never')
    expect(standen.find((s) => s.job.key === 'alerts-sweep')?.health).toBe('unmonitored')
    expect(standen.every((s) => s.last === null)).toBe(true)
  })

  it('een leesfout is "niet af te lezen", nooit "nog niet uitgevoerd"', async () => {
    const { client } = maakClient(() => ({ data: null, error: { message: 'rls' } }))
    const standen = await loadJobStanden(client, NU)
    expect(new Set(standen.map((s) => s.health))).toEqual(new Set(['unknown']))
  })

  it('een leesfout op alleen de tweede query maakt de stand ook "niet af te lezen"', async () => {
    const { client } = maakClient((job, alleenGeslaagd) =>
      alleenGeslaagd ? { data: null, error: { message: 'boom' } } : { data: rij(job, 'error', VERS), error: null },
    )
    const standen = await loadJobStanden(client, NU)
    expect(standen.find((s) => s.job.key === 'news-ingest')?.health).toBe('unknown')
    // Een niet-bewaakte taak doet die tweede query niet en blijft dus leesbaar.
    expect(standen.find((s) => s.job.key === 'alerts-sweep')?.health).toBe('unmonitored')
  })
})

describe('verliesRegels', () => {
  it('leest de regels uit de summary', () => {
    expect(verliesRegels({ verlies: ['stap a verloor 3', 'stap b verloor 1'] })).toEqual([
      'stap a verloor 3',
      'stap b verloor 1',
    ])
  })

  it('laat alles wat geen tekst is weg', () => {
    expect(verliesRegels({ verlies: ['ok', 3, null, { a: 1 }] })).toEqual(['ok'])
  })

  it('geeft een lege lijst bij een ontbrekende of vreemde summary', () => {
    expect(verliesRegels(null)).toEqual([])
    expect(verliesRegels('tekst')).toEqual([])
    expect(verliesRegels({})).toEqual([])
    expect(verliesRegels({ verlies: 'geen lijst' })).toEqual([])
  })
})
