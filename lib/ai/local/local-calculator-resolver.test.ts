import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor de ON-DEVICE rekenhulp-bouwer.
 *
 * De kern van het ontwerp — en dus van deze suite: VIER KLEINE BEURTEN op één
 * sessie, met een deterministische reparatie erachter en een HARDE afkap-detectie
 * ervoor. Wat hier bewezen wordt:
 *   - de vier stappen worden in volgorde gesteld en de uitkomst is één geldige,
 *     canonieke CalculatorDefinition;
 *   - afkapping (de `truncated`-vlag uit parse.ts — lokaal het enige signaal,
 *     want de web-SDK kent geen finishReason) leidt tot een EERLIJKE fout en
 *     nooit tot een half-geldige definitie;
 *   - een mislukte stap 2 (prefill-koppeling) is niet fataal: zonder prefill
 *     werkt de rekenhulp gewoon;
 *   - een onbekende variabele wordt in TypeScript gerepareerd — er komt géén
 *     vijfde generatie aan te pas.
 */

const send = vi.fn()
const dispose = vi.fn()
const createChatSession = vi.fn()
const disposeSession = vi.fn()

vi.mock('./litert-runtime', () => ({
  createChatSession: (...args: unknown[]) => createChatSession(...args),
  disposeSession: (...args: unknown[]) => disposeSession(...args),
}))

import { buildLocalCalculator, type LocalCalcProgress } from './local-calculator-resolver'
import { LOCAL_CALCULATOR_DNA } from './local-calculator-prompt'
import { validateFormulas } from '@/lib/calculator/evaluate'
import { PREFILL_KEY_SET } from '@/lib/calculator/user-data-keys'

const STAP1 = JSON.stringify([
  { key: 'schuld', label: 'Openstaande schuld', kind: 'euro', default: 10000 },
  { key: 'maandbedrag', label: 'Maandbedrag', kind: 'euro', default: 250 },
])
const STAP2 = JSON.stringify([{ input: 'schuld', prefill: 'total_debts' }])
const STAP3 = JSON.stringify([
  { key: 'looptijd', label: 'Looptijd', formula: 'schuld / (maandbedrag * 12)', format: 'years' },
])
const STAP4 = JSON.stringify([
  { name: 'Schuld aflossen', description: 'Hoe lang tot je schuldvrij bent.', assumptions: ['Rente buiten beschouwing.'] },
])

/** Antwoorden in volgorde teruggeven, één per `send`. */
function beantwoordMet(...antwoorden: string[]) {
  let i = 0
  send.mockImplementation(async () => antwoorden[i++] ?? '[]')
}

beforeEach(() => {
  vi.clearAllMocks()
  createChatSession.mockResolvedValue({ send, dispose })
})

describe('gelukkig pad', () => {
  it('bouwt in vier beurten één geldige definitie', async () => {
    beantwoordMet(STAP1, STAP2, STAP3, STAP4)
    const res = await buildLocalCalculator('Hoe lang duurt het tot mijn schuld weg is?')

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(send).toHaveBeenCalledTimes(4)
    expect(res.definition.name).toBe('Schuld aflossen')
    expect(res.definition.scenarios).toHaveLength(1)
    expect(res.definition.derived).toBeUndefined()
    expect(res.definition.narrative).toBeUndefined()
    expect(res.definition.inputs.find((i) => i.key === 'schuld')?.prefill).toBe('total_debts')
    expect(validateFormulas(res.definition, PREFILL_KEY_SET)).toEqual([])
  })

  it('opent de sessie met de gecondenseerde rekenhulp-DNA en sluit die daarna', async () => {
    beantwoordMet(STAP1, STAP2, STAP3, STAP4)
    await buildLocalCalculator('Hoe lang duurt het tot mijn schuld weg is?')

    expect(createChatSession).toHaveBeenCalledWith(LOCAL_CALCULATOR_DNA)
    expect(dispose).toHaveBeenCalled()
  })

  it('meldt voortgang per stap, mét de tot dan toe verzamelde brokken', async () => {
    beantwoordMet(STAP1, STAP2, STAP3, STAP4)
    const meldingen: LocalCalcProgress[] = []
    await buildLocalCalculator('Vraag', { onProgress: (p) => meldingen.push(p) })

    expect(meldingen.map((m) => `${m.step}${m.fase[0]}`)).toEqual([
      '1b', '1k', '2b', '2k', '3b', '3k', '4b', '4k',
    ])
    // Na stap 1 zitten de inputs in de snapshot — dát is wat een volgende
    // poging als `resume` kan hergebruiken.
    expect(meldingen[1].partial.inputs).toHaveLength(2)
  })

  it('stript markdown-fences en think-preambles (via parse.ts)', async () => {
    beantwoordMet(
      '<think>even nadenken</think>\n```json\n' + STAP1 + '\n```',
      STAP2,
      STAP3,
      STAP4,
    )
    const res = await buildLocalCalculator('Vraag')
    expect(res.ok).toBe(true)
  })
})

describe('afkapping', () => {
  it('afgekapte stap 3 → eerlijke fout, GEEN halve definitie', async () => {
    // Array geopend, nooit gesloten: precies de faalmodus die parse.ts als
    // `truncated` markeert. Lokaal is dit het enige afkap-signaal dat bestaat.
    beantwoordMet(STAP1, STAP2, '[{"key": "looptijd", "label": "Loop', STAP4)
    const res = await buildLocalCalculator('Vraag')

    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toContain('afgekapt')
    expect(res).not.toHaveProperty('definition')
  })

  it('afgekapte stap 1 stopt de bouw meteen — de rest wordt niet meer gevraagd', async () => {
    beantwoordMet('[{"key": "schu')
    const res = await buildLocalCalculator('Vraag')

    expect(res.ok).toBe(false)
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('stap 2 is niet fataal', () => {
  it('onbruikbare prefill-koppeling → rekenhulp zonder prefill, wel klaar', async () => {
    beantwoordMet(STAP1, 'ik weet het niet zo goed', STAP3, STAP4)
    const res = await buildLocalCalculator('Vraag')

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.definition.inputs.every((i) => i.prefill === undefined)).toBe(true)
  })

  it('een verzonnen prefill-key wordt genegeerd (gesloten keuze)', async () => {
    beantwoordMet(STAP1, JSON.stringify([{ input: 'schuld', prefill: 'schuld_totaal' }]), STAP3, STAP4)
    const res = await buildLocalCalculator('Vraag')

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.definition.inputs.every((i) => i.prefill === undefined)).toBe(true)
  })
})

describe('deterministische reparatie', () => {
  it('onbekende naam in een formule wordt input — zonder extra generatie', async () => {
    const stap3 = JSON.stringify([
      { key: 'kosten', label: 'Kosten', formula: 'schuld + boeterente_bedrag', format: 'euro' },
    ])
    beantwoordMet(STAP1, STAP2, stap3, STAP4)
    const res = await buildLocalCalculator('Vraag')

    expect(res.ok).toBe(true)
    if (!res.ok) return
    // Vier beurten, niet vijf: de reparatie is TypeScript, geen model.
    expect(send).toHaveBeenCalledTimes(4)
    expect(res.definition.inputs.map((i) => i.key)).toContain('boeterente_bedrag')
    expect(validateFormulas(res.definition, PREFILL_KEY_SET)).toEqual([])
  })
})

describe('sessieherstel', () => {
  it('een inferentiefout geeft één herstel + retry op dezelfde stap', async () => {
    let call = 0
    send.mockImplementation(async () => {
      call += 1
      if (call === 1) throw new Error('WebGPU device lost')
      return [STAP1, STAP2, STAP3, STAP4][call - 2] ?? '[]'
    })

    const res = await buildLocalCalculator('Vraag')
    expect(disposeSession).toHaveBeenCalledTimes(1)
    expect(createChatSession).toHaveBeenCalledTimes(2)
    expect(res.ok).toBe(true)
  })

  it('faalt het ook ná herstel, dan is de uitkomst een eerlijke fout (geen cloud)', async () => {
    send.mockRejectedValue(new Error('kapot'))
    const res = await buildLocalCalculator('Vraag')

    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toMatch(/lokale AI/i)
  })
})

describe('hervatten', () => {
  it('overgeslagen stappen kosten geen nieuwe beurt', async () => {
    beantwoordMet(STAP4)
    const res = await buildLocalCalculator('Vraag', {
      resume: {
        inputs: [{ key: 'schuld', label: 'Schuld', kind: 'euro', default: 10000 }],
        prefillsGedaan: true,
        outputs: [{ key: 'dubbel', label: 'Dubbel', formula: 'schuld * 2', format: 'euro' }],
      },
    })

    expect(send).toHaveBeenCalledTimes(1)
    expect(res.ok).toBe(true)
  })
})

describe('afbreken', () => {
  it('een afgebroken signaal stuurt niets meer naar het model', async () => {
    beantwoordMet(STAP1, STAP2, STAP3, STAP4)
    const controller = new AbortController()
    controller.abort()
    const res = await buildLocalCalculator('Vraag', { signal: controller.signal })

    expect(send).not.toHaveBeenCalled()
    expect(res.ok).toBe(false)
  })

  it('een lege vraag doet helemaal niets', async () => {
    const res = await buildLocalCalculator('   ')
    expect(res.ok).toBe(false)
    expect(createChatSession).not.toHaveBeenCalled()
  })
})
