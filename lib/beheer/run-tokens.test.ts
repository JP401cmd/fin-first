import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadRunTokens, wijsTokensToe, type RunVenster } from './run-tokens'

const SONNET = 'claude-sonnet-4-5-20250929'

function rij(created_at: string, input = 1000, output = 100, model = SONNET, provider = 'anthropic') {
  return { provider, model, input_tokens: input, output_tokens: output, created_at }
}

/** Eén run van 05:23:44 t/m 05:24:12 — het venster van de echte news-ingest. */
const RUN: RunVenster = {
  id: 'run-a',
  started_at: '2026-09-26T05:23:44.964Z',
  finished_at: '2026-09-26T05:24:12.978Z',
}

describe('wijsTokensToe — het venster', () => {
  it('claimt een aanroep binnen het venster', () => {
    const uit = wijsTokensToe([RUN], [rij('2026-09-26T05:23:47.000Z')])
    expect(uit.get('run-a')).toMatchObject({ calls: 1, input: 1000, output: 100 })
  })

  /**
   * De grenzen zijn de hele reden dat deze functie bestaat: een aanroep op de
   * millisecond van de start of het einde hoort erbij, één millisecond ervoor
   * of erna niet. Beide uiteinden, beide kanten.
   */
  it('telt een aanroep exact op de startgrens mee', () => {
    const uit = wijsTokensToe([RUN], [rij(RUN.started_at)])
    expect(uit.get('run-a')!.calls).toBe(1)
  })

  it('telt een aanroep exact op de eindgrens mee', () => {
    const uit = wijsTokensToe([RUN], [rij(RUN.finished_at!)])
    expect(uit.get('run-a')!.calls).toBe(1)
  })

  it('laat een aanroep één ms vóór de start buiten', () => {
    const uit = wijsTokensToe([RUN], [rij('2026-09-26T05:23:44.963Z')])
    expect(uit.get('run-a')!.calls).toBe(0)
  })

  it('laat een aanroep één ms ná het einde buiten', () => {
    const uit = wijsTokensToe([RUN], [rij('2026-09-26T05:24:12.979Z')])
    expect(uit.get('run-a')!.calls).toBe(0)
  })

  it('telt meerdere aanroepen binnen hetzelfde venster op', () => {
    const uit = wijsTokensToe([RUN], [
      rij('2026-09-26T05:23:46.000Z', 2000, 200),
      rij('2026-09-26T05:23:48.000Z', 3000, 300),
    ])
    expect(uit.get('run-a')).toMatchObject({ calls: 2, input: 5000, output: 500 })
  })

  it('slaat een run zonder finished_at over — geen venster, dus geen nul', () => {
    const open: RunVenster = { id: 'open', started_at: RUN.started_at, finished_at: null }
    const uit = wijsTokensToe([open], [rij('2026-09-26T05:23:47.000Z')])
    expect(uit.has('open')).toBe(false)
  })

  it('slaat een run met een onleesbare tijdstempel over', () => {
    const stuk: RunVenster = { id: 'stuk', started_at: 'geen-datum', finished_at: 'ook-niet' }
    expect(wijsTokensToe([stuk], [rij('2026-09-26T05:23:47.000Z')]).has('stuk')).toBe(false)
  })

  it('negeert een aanroep met een onleesbare tijdstempel', () => {
    const uit = wijsTokensToe([RUN], [rij('niet-een-datum')])
    expect(uit.get('run-a')!.calls).toBe(0)
  })
})

describe('wijsTokensToe — kosten', () => {
  it('rekent de kosten van een bekend model', () => {
    // 1M in ($3) + 1M uit ($15) = $18.
    const uit = wijsTokensToe([RUN], [rij('2026-09-26T05:23:47.000Z', 1_000_000, 1_000_000)])
    expect(uit.get('run-a')!.costUsd).toBeCloseTo(18, 10)
  })

  it('is 0 bij een run zonder aanroepen — niet null', () => {
    const uit = wijsTokensToe([RUN], [])
    expect(uit.get('run-a')).toMatchObject({ calls: 0, costUsd: 0, onbekendeModellen: [] })
  })

  /**
   * Given een run waarin één van twee aanroepen op een onbekend model liep
   * When de kosten worden samengevat
   * Then is het TOTAAL onbekend (null), niet de deelsom van het bekende deel.
   *
   * Een deelsom als totaal presenteren onderschat de rekening stil.
   */
  it('maakt het totaal onbekend zodra één aanroep een onbekend model gebruikt', () => {
    const uit = wijsTokensToe([RUN], [
      rij('2026-09-26T05:23:46.000Z', 1_000_000, 0),
      rij('2026-09-26T05:23:47.000Z', 1_000_000, 0, 'gpt-4o'),
    ])
    const agg = uit.get('run-a')!
    expect(agg.calls).toBe(2)
    expect(agg.input).toBe(2_000_000)
    expect(agg.costUsd).toBeNull()
    expect(agg.onbekendeModellen).toEqual(['gpt-4o'])
  })

  it('noemt elk onbekend model één keer, gesorteerd', () => {
    const uit = wijsTokensToe([RUN], [
      rij('2026-09-26T05:23:46.000Z', 1, 1, 'zeta-1'),
      rij('2026-09-26T05:23:47.000Z', 1, 1, 'alfa-1'),
      rij('2026-09-26T05:23:48.000Z', 1, 1, 'zeta-1'),
    ])
    expect(uit.get('run-a')!.onbekendeModellen).toEqual(['alfa-1', 'zeta-1'])
  })

  /**
   * Een lokaal model draait zonder factuur. De gelogde modelnaam bij Ollama is
   * een vrije instelling, dus de gratis-regel hangt aan de PROVIDER — een run op
   * een zelfgekozen Ollama-modelnaam mag niet als "onbekend" tonen.
   */
  it('rekent een lokale provider als kosteloos, ongeacht de modelnaam', () => {
    const uit = wijsTokensToe([RUN], [
      rij('2026-09-26T05:23:47.000Z', 1_000_000, 1_000_000, 'llama3.2', 'ollama'),
    ])
    const agg = uit.get('run-a')!
    expect(agg.costUsd).toBe(0)
    expect(agg.onbekendeModellen).toEqual([])
  })

  it('maakt een cloud-provider met onbekend model wél onbekend', () => {
    const uit = wijsTokensToe([RUN], [
      rij('2026-09-26T05:23:47.000Z', 1_000, 1_000, 'gpt-4o', 'openai'),
    ])
    expect(uit.get('run-a')!.costUsd).toBeNull()
  })
})

describe('wijsTokensToe — overlappende runs', () => {
  it('markeert twee runs die elkaars venster raken', () => {
    const a: RunVenster = {
      id: 'a',
      started_at: '2026-09-26T05:00:00.000Z',
      finished_at: '2026-09-26T05:00:30.000Z',
    }
    const b: RunVenster = {
      id: 'b',
      started_at: '2026-09-26T05:00:20.000Z',
      finished_at: '2026-09-26T05:00:50.000Z',
    }
    const uit = wijsTokensToe([a, b], [rij('2026-09-26T05:00:25.000Z')])
    expect(uit.get('a')!.overlaptMetAndereRun).toBe(true)
    expect(uit.get('b')!.overlaptMetAndereRun).toBe(true)
    // De aanroep valt in béíde vensters — vandaar de markering.
    expect(uit.get('a')!.calls).toBe(1)
    expect(uit.get('b')!.calls).toBe(1)
  })

  it('markeert niet bij runs die na elkaar lopen', () => {
    // Het echte patroon: integraties-health start ~37 ms ná holdings-prices.
    const eerst: RunVenster = {
      id: 'eerst',
      started_at: '2026-09-25T18:57:05.761Z',
      finished_at: '2026-09-25T18:57:34.346Z',
    }
    const daarna: RunVenster = {
      id: 'daarna',
      started_at: '2026-09-25T18:57:34.382Z',
      finished_at: '2026-09-25T18:57:34.566Z',
    }
    const uit = wijsTokensToe([eerst, daarna], [])
    expect(uit.get('eerst')!.overlaptMetAndereRun).toBe(false)
    expect(uit.get('daarna')!.overlaptMetAndereRun).toBe(false)
  })

  it('negeert een run zonder venster bij de overlap-toets', () => {
    const open: RunVenster = { id: 'open', started_at: RUN.started_at, finished_at: null }
    const uit = wijsTokensToe([RUN, open], [])
    expect(uit.get('run-a')!.overlaptMetAndereRun).toBe(false)
  })
})

/**
 * Nep-querybuilder: legt elke aanroep vast en geeft per `range()` de volgende
 * pagina terug. Zo bewijst de test de QUERYVORM — welke kolommen, welk filter —
 * en niet alleen wat de toewijzing met de rijen doet.
 */
function nepService(paginas: Array<{ data: unknown[] | null; error: unknown }>) {
  const calls: Array<{ methode: string; args: unknown[] }> = []
  let pagina = 0
  const builder: Record<string, (...args: unknown[]) => unknown> = {}
  for (const methode of ['select', 'is', 'gte', 'lte', 'order']) {
    builder[methode] = (...args: unknown[]) => {
      calls.push({ methode, args })
      return builder
    }
  }
  builder.range = (...args: unknown[]) => {
    calls.push({ methode: 'range', args })
    return Promise.resolve(paginas[pagina++] ?? { data: [], error: null })
  }
  const service = {
    from: (tabel: string) => {
      calls.push({ methode: 'from', args: [tabel] })
      return builder
    },
  } as unknown as SupabaseClient
  return { service, calls }
}

describe('loadRunTokens — de queryvorm', () => {
  it('leest alleen user_id IS NULL, en alleen gebruiksmeta (geen user_id, geen feature)', async () => {
    const { service, calls } = nepService([{ data: [rij('2026-09-26T05:24:00.000Z')], error: null }])
    const uit = await loadRunTokens(service, [RUN])

    expect(calls.find((c) => c.methode === 'from')?.args).toEqual(['ai_token_usage'])
    expect(calls.find((c) => c.methode === 'is')?.args).toEqual(['user_id', null])

    const kolommen = String(calls.find((c) => c.methode === 'select')?.args[0])
      .split(',')
      .map((k) => k.trim())
    expect(kolommen).toEqual(['provider', 'model', 'input_tokens', 'output_tokens', 'created_at'])
    expect(kolommen).not.toContain('user_id')
    expect(kolommen).not.toContain('feature')

    expect(calls.find((c) => c.methode === 'gte')?.args).toEqual(['created_at', RUN.started_at])
    expect(calls.find((c) => c.methode === 'lte')?.args).toEqual(['created_at', RUN.finished_at])
    expect(uit.leesfout).toBe(false)
    expect(uit.tokens.get('run-a')).toBeDefined()
  })

  it('pagineert door zolang een pagina vol is (max_rows kapt anders stil af)', async () => {
    const vol = Array.from({ length: 1000 }, () => rij('2026-09-26T05:24:00.000Z'))
    const { service, calls } = nepService([
      { data: vol, error: null },
      { data: [rij('2026-09-26T05:24:01.000Z')], error: null },
    ])
    await loadRunTokens(service, [RUN])
    expect(calls.filter((c) => c.methode === 'range').map((c) => c.args)).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('een leesfout is een melding, geen lege uitkomst', async () => {
    const { service } = nepService([{ data: null, error: { message: 'kapot' } }])
    expect(await loadRunTokens(service, [RUN])).toEqual({ tokens: new Map(), leesfout: true })
  })

  it('zonder afgeronde run wordt er niets gelezen', async () => {
    const { service, calls } = nepService([])
    await loadRunTokens(service, [{ id: 'open', started_at: RUN.started_at, finished_at: null }])
    expect(calls).toHaveLength(0)
  })
})
