import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import type { LocalChatMessage } from './litert-runtime'

// ── Mock de LiteRT-LM-laag ────────────────────────────────────────────────────
// De pure delen (id-echo-mapping, enum-whitelist, prompt) testen we direct; de
// resolver-integratie (chunking op 10, sessieherstel) met een gemockte
// generate/dispose. Geen model-download, geen GPU.

let generateImpl: (messages: LocalChatMessage[], maxNewTokens: number) => Promise<string>
const disposeSpy = vi.fn(async () => {})
const generateSpy = vi.fn((messages: LocalChatMessage[], maxNewTokens: number) => generateImpl(messages, maxNewTokens))

vi.mock('./litert-runtime', () => ({
  loadModelSession: async () => ({
    generate: (messages: LocalChatMessage[], maxNewTokens: number) => generateSpy(messages, maxNewTokens),
  }),
  disposeSession: () => disposeSpy(),
}))

import {
  createLocalVasteKostenResolver,
  mapVasteKostenChunkResults,
  buildVasteKostenUserPrompt,
  suggestVasteKostenMaxNewTokens,
  meetHintVolgzaamheid,
  hintKlasse,
  vasteKostenItemId,
  LOCAL_VASTE_KOSTEN_CHUNK_SIZE,
  LOCAL_VASTE_KOSTEN_CANDIDATE_CAP,
  VASTE_KOSTEN_KLASSEN,
  type VasteKostenCandidate,
} from './local-vaste-kosten-resolver'
import { extractLocalJsonObjects } from './parse'
import { VASTE_KOSTEN_ANALYSE_PROMPT } from '@/lib/ai/dna/wil'
import type { RecurringCategory } from '@/lib/recurring-detection'

function candidate(id: string, over: Partial<VasteKostenCandidate> = {}): VasteKostenCandidate {
  return {
    id,
    name: `Naam ${id}`,
    monthlyAmount: 10,
    averageAmount: 10,
    frequency: 'monthly',
    occurrences: 12,
    autoCategory: 'other_expense',
    autoCategoryLabel: 'Overige uitgave',
    confidence: 'high',
    ...over,
  }
}

/** Ruwe modeloutput: één JSON-object per regel, zoals het uitvoercontract vraagt. */
function echoLines(rows: { id: string; klasse: string; reden?: string }[]): string {
  return rows
    .map((r) => JSON.stringify({ id: r.id, klasse: r.klasse, reden: r.reden ?? 'reden' }))
    .join('\n')
}

const objectsOf = (text: string) => extractLocalJsonObjects(text).objects

beforeEach(() => {
  disposeSpy.mockClear()
  generateSpy.mockClear()
  generateImpl = async () => ''
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

// ── ID-ECHO ───────────────────────────────────────────────────────────────────
// De kern van dit contract: koppelen op het teruggeechode id, nooit positioneel.
// Een klein model laat met enige regelmaat een regel vallen; positioneel zou dan
// de hele staart één opschuiven en krijgt de verkeerde betaling de verkeerde
// klasse — een stille, niet te herkennen fout.

describe('mapVasteKostenChunkResults — id-echo-mapping', () => {
  it('mapt op het teruggeechode id, ook als het model de volgorde omdraait', () => {
    const chunk = [candidate('k-a'), candidate('k-b')]
    const raw = echoLines([
      { id: 't2', klasse: 'subscription', reden: 'streamingdienst' },
      { id: 't1', klasse: 'vaste_kosten', reden: 'energieleverancier' },
    ])
    const out = mapVasteKostenChunkResults(chunk, objectsOf(raw))
    expect(out).toEqual([
      { id: 'k-a', klasse: 'vaste_kosten', reden: 'energieleverancier' },
      { id: 'k-b', klasse: 'subscription', reden: 'streamingdienst' },
    ])
  })

  it('model laat een item VALLEN → geen scheve toewijzing; alleen dat item wordt skip', () => {
    // Drie kandidaten, model antwoordt alleen over t1 en t3. Positioneel zou t3's
    // antwoord op k-b landen; met id-echo blijft k-b onbeoordeeld (skip).
    const chunk = [candidate('k-a'), candidate('k-b'), candidate('k-c')]
    const raw = echoLines([
      { id: 't1', klasse: 'subscription', reden: 'eerste' },
      { id: 't3', klasse: 'vaste_kosten', reden: 'derde' },
    ])
    const out = mapVasteKostenChunkResults(chunk, objectsOf(raw))
    expect(out).toHaveLength(3)
    expect(out[0]).toEqual({ id: 'k-a', klasse: 'subscription', reden: 'eerste' })
    expect(out[1].id).toBe('k-b')
    expect(out[1].klasse).toBe('skip')
    expect(out[1].reden).toContain('Geen classificatie')
    // Het bewijs tegen verschuiving: k-c houdt zijn EIGEN antwoord.
    expect(out[2]).toEqual({ id: 'k-c', klasse: 'vaste_kosten', reden: 'derde' })
  })

  it('duplicaat-id → het eerste telt; onbekend id → genegeerd', () => {
    const chunk = [candidate('k-a'), candidate('k-b')]
    const raw = echoLines([
      { id: 't1', klasse: 'subscription', reden: 'eerste' },
      { id: 't1', klasse: 'vaste_kosten', reden: 'herhaling' },
      { id: 't9', klasse: 'vaste_kosten', reden: 'verzonnen id' },
    ])
    const out = mapVasteKostenChunkResults(chunk, objectsOf(raw))
    expect(out[0]).toEqual({ id: 'k-a', klasse: 'subscription', reden: 'eerste' })
    expect(out[1].klasse).toBe('skip') // t2 ontbrak
  })

  it('elke kandidaat krijgt exact één resultaat, ook bij onbruikbare output', () => {
    const chunk = [candidate('k-a'), candidate('k-b')]
    const out = mapVasteKostenChunkResults(chunk, objectsOf('sorry, geen json'))
    expect(out.map((r) => r.id)).toEqual(['k-a', 'k-b'])
    expect(out.every((r) => r.klasse === 'skip')).toBe(true)
  })

  it('ontbrekend id in de output → dat object telt niet mee', () => {
    const chunk = [candidate('k-a')]
    const raw = JSON.stringify({ klasse: 'subscription', reden: 'zonder id' })
    const out = mapVasteKostenChunkResults(chunk, objectsOf(raw))
    expect(out[0].klasse).toBe('skip')
  })
})

// ── ENUM-WHITELIST ────────────────────────────────────────────────────────────

describe('mapVasteKostenChunkResults — harde enum-whitelist', () => {
  it('verzonnen label → skip (gedragspariteit met het cloud-pad)', () => {
    const chunk = [candidate('k-a'), candidate('k-b'), candidate('k-c')]
    const raw = echoLines([
      { id: 't1', klasse: 'abonnement', reden: 'nederlands label' },
      { id: 't2', klasse: 'vast', reden: 'afgekort' },
      { id: 't3', klasse: 'onbekend', reden: 'weet ik niet' },
    ])
    const out = mapVasteKostenChunkResults(chunk, objectsOf(raw))
    expect(out.map((r) => r.klasse)).toEqual(['skip', 'skip', 'skip'])
  })

  it('accepteert alleen de drie geldige klassen', () => {
    const chunk = VASTE_KOSTEN_KLASSEN.map((_, i) => candidate(`k-${i}`))
    const raw = echoLines(VASTE_KOSTEN_KLASSEN.map((k, i) => ({ id: vasteKostenItemId(i), klasse: k })))
    const out = mapVasteKostenChunkResults(chunk, objectsOf(raw))
    expect(out.map((r) => r.klasse)).toEqual([...VASTE_KOSTEN_KLASSEN])
  })

  it('is ongevoelig voor hoofdletters/spaties rond het label', () => {
    const chunk = [candidate('k-a')]
    const raw = JSON.stringify({ id: 't1', klasse: '  Vaste_Kosten ', reden: 'x' })
    const out = mapVasteKostenChunkResults(chunk, objectsOf(raw))
    expect(out[0].klasse).toBe('vaste_kosten')
  })
})

// ── PROMPT ────────────────────────────────────────────────────────────────────

describe('buildVasteKostenUserPrompt', () => {
  it('nummert met id-echo (t1..tN) en draagt de auto-categorie-hint mee', () => {
    const prompt = buildVasteKostenUserPrompt([
      candidate('k-a', { name: 'Spotify', averageAmount: 10.99, occurrences: 12, autoCategoryLabel: 'Abonnement' }),
      candidate('k-b', { name: 'Vattenfall', averageAmount: 142.5, frequency: 'monthly', autoCategoryLabel: 'Nutsvoorziening' }),
    ])
    expect(prompt).toContain('t1: Spotify | monthly | €10.99/keer | 12x gezien | auto-categorie: Abonnement')
    expect(prompt).toContain('t2: Vattenfall')
    expect(prompt).toContain('auto-categorie: Nutsvoorziening')
  })

  it('kapt de reden expliciet af op 8 woorden (snelheidsmaatregel, halveert de decode)', () => {
    const prompt = buildVasteKostenUserPrompt([candidate('k-a')])
    expect(prompt).toContain('maximaal 8 woorden')
  })

  it('noemt de drie toegestane klassen en geen andere', () => {
    const prompt = buildVasteKostenUserPrompt([candidate('k-a')])
    expect(prompt).toContain('alleen subscription, vaste_kosten of skip')
  })
})

// ── PROMPT SINGLE-SOURCE ──────────────────────────────────────────────────────
// Het lokale pad gebruikt LETTERLIJK dezelfde systeemprompt als het cloud-pad.
// Geen gecondenseerde kopie = per definitie nul drift, en dus ook geen nieuw
// parity-artefact (parity-manifest.json blijft ongemoeid).

describe('systeemprompt — single source met het cloud-pad', () => {
  it('stuurt VASTE_KOSTEN_ANALYSE_PROMPT ongewijzigd als system-message mee', async () => {
    let captured: LocalChatMessage[] = []
    generateImpl = async (messages) => {
      captured = messages
      return echoLines([{ id: 't1', klasse: 'skip' }])
    }
    const resolver = createLocalVasteKostenResolver()
    await resolver([candidate('k-a')])

    expect(captured[0].role).toBe('system')
    expect(captured[0].content).toBe(VASTE_KOSTEN_ANALYSE_PROMPT)
  })
})

// ── CHUNKING + HERSTELPAD ─────────────────────────────────────────────────────

describe('createLocalVasteKostenResolver — chunking op 10', () => {
  it('splitst 25 kandidaten in 10 + 10 + 5 en rendert progressief per chunk', async () => {
    generateImpl = async (messages) => {
      // Tel de t{n}:-regels in de user-message om de juiste chunkgrootte te echoën.
      const ids = messages[1].content.match(/(^|\n)t\d+:/g) ?? []
      return echoLines(ids.map((_, i) => ({ id: vasteKostenItemId(i), klasse: 'vaste_kosten' })))
    }
    const chunks: { done: number; total: number; n: number }[] = []
    const resolver = createLocalVasteKostenResolver({
      onChunk: (results, done, total) => chunks.push({ done, total, n: results.length }),
    })
    const out = await resolver(Array.from({ length: 25 }, (_, i) => candidate(`k-${i}`)))

    expect(LOCAL_VASTE_KOSTEN_CHUNK_SIZE).toBe(10)
    expect(generateSpy).toHaveBeenCalledTimes(3)
    expect(out).toHaveLength(25)
    expect(out.every((r) => r.klasse === 'vaste_kosten')).toBe(true)
    // Progressieve weergave: drie tussentijdse leveringen, niet één aan het eind.
    expect(chunks).toEqual([
      { done: 10, total: 25, n: 10 },
      { done: 20, total: 25, n: 10 },
      { done: 25, total: 25, n: 5 },
    ])
  })
})

describe('createLocalVasteKostenResolver — sessieherstel', () => {
  it('herstelt eenmaal na een crash (dispose + verse sessie), dan succes — en logt de fout', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let call = 0
    generateImpl = async () => {
      call++
      if (call === 1) throw new Error('operation does not support unaligned accesses')
      return echoLines([{ id: 't1', klasse: 'subscription', reden: 'ok' }])
    }
    const resolver = createLocalVasteKostenResolver()
    const out = await resolver([candidate('k-a')])

    expect(disposeSpy).toHaveBeenCalledTimes(1)
    expect(generateSpy).toHaveBeenCalledTimes(2) // crash + één retry
    expect(out[0].klasse).toBe('subscription')
    // Diagnostiek: de eerste fout is NIET stil — hij staat in de console.
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0][0])).toContain('[lokale-ai]')
    errorSpy.mockRestore()
  })

  it('faalt de retry óók → werpen (eerlijk falen), NOOIT een cloud-fallback', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    generateImpl = async () => {
      throw new Error('device lost')
    }
    const resolver = createLocalVasteKostenResolver()
    await expect(resolver([candidate('k-a')])).rejects.toThrow()
    expect(disposeSpy).toHaveBeenCalledTimes(1)
    expect(generateSpy).toHaveBeenCalledTimes(2)
    // Beide pogingen zichtbaar — supportbaarheid van "het lukte niet".
    expect(errorSpy).toHaveBeenCalledTimes(2)
    expect(String(errorSpy.mock.calls[1][0])).toContain('definitief')
    errorSpy.mockRestore()
  })
})

describe('createLocalVasteKostenResolver — sessiestart-signaal', () => {
  it('meldt "starten" vóór en "klaar" ná het laden van de sessie', async () => {
    generateImpl = async () => echoLines([{ id: 't1', klasse: 'skip' }])
    const states: Array<'starten' | 'klaar'> = []
    const resolver = createLocalVasteKostenResolver({ onSessionState: (s) => states.push(s) })
    await resolver([candidate('k-a')])
    expect(states).toEqual(['starten', 'klaar'])
  })
})

// ── HINT-VOLGZAAMHEID ─────────────────────────────────────────────────────────
// Zie het toelichtingsblok in local-vaste-kosten-resolver.ts: als het model de
// deterministische hint alleen napraat, voegt de AI-stap niets toe. Deze meting
// maakt dat aflees­baar in plaats van een aanname.

describe('hintKlasse / meetHintVolgzaamheid', () => {
  it('geeft een eenduidige klasse voor de categorieën die de klasse al vastleggen', () => {
    const vast: RecurringCategory[] = ['rent', 'mortgage', 'utility', 'insurance', 'taxes', 'childcare', 'housing_other', 'loan']
    for (const c of vast) expect(hintKlasse(c)).toBe('vaste_kosten')
    expect(hintKlasse('subscription')).toBe('subscription')
    expect(hintKlasse('salary')).toBe('skip')
    expect(hintKlasse('other_income')).toBe('skip')
  })

  it('geeft null waar de hint niets zegt — dáár moet het model oordelen', () => {
    const open: RecurringCategory[] = ['other_expense', 'transport', 'healthcare', 'savings', 'donation']
    for (const c of open) expect(hintKlasse(c)).toBeNull()
  })

  it('telt gevolgde hints en zelfstandige oordelen los van elkaar', () => {
    const cands = [
      candidate('k-1', { autoCategory: 'subscription' }),
      candidate('k-2', { autoCategory: 'rent' }),
      candidate('k-3', { autoCategory: 'other_expense' }),
      candidate('k-4', { autoCategory: 'other_expense' }),
    ]
    const meting = meetHintVolgzaamheid(cands, [
      { id: 'k-1', klasse: 'subscription', reden: '' }, // hint gevolgd
      { id: 'k-2', klasse: 'skip', reden: '' }, // hint NIET gevolgd
      { id: 'k-3', klasse: 'vaste_kosten', reden: '' }, // zelfstandig oordeel
      { id: 'k-4', klasse: 'skip', reden: '' },
    ])
    expect(meting).toEqual({ eenduidig: 2, gevolgd: 1, open: 2, openBeoordeeld: 1 })
  })
})

// ── CONSTANTEN ────────────────────────────────────────────────────────────────

describe('constanten', () => {
  it('suggestVasteKostenMaxNewTokens schaalt met de chunkgrootte binnen grenzen', () => {
    expect(suggestVasteKostenMaxNewTokens(1)).toBeGreaterThanOrEqual(128)
    expect(suggestVasteKostenMaxNewTokens(10)).toBe(10 * 32 + 96)
    expect(suggestVasteKostenMaxNewTokens(1000)).toBeLessThanOrEqual(4096)
  })

  it('de lokale kandidaat-cap (30) is de spiegel van MAX_LOCAL_AI_CANDIDATES in de route', () => {
    // De route mag deze module niet importeren (dat zou de LiteRT/WebGPU-runtime
    // de serverbundel in trekken), dus het getal staat op twee plekken. Deze test
    // is de brug: loopt het uiteen, dan wordt het hier rood i.p.v. stil verkeerd.
    const routeSrc = fs.readFileSync(
      path.join(process.cwd(), 'app/api/subscriptions/analyse-ai/route.ts'),
      'utf-8',
    )
    const m = routeSrc.match(/const\s+MAX_LOCAL_AI_CANDIDATES\s*=\s*(\d+)/)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBe(LOCAL_VASTE_KOSTEN_CANDIDATE_CAP)
    // En lager dan de cloud-cap: on-device is elke kandidaat wachttijd.
    const cloud = routeSrc.match(/const\s+MAX_AI_CANDIDATES\s*=\s*(\d+)/)
    expect(Number(cloud![1])).toBeGreaterThan(LOCAL_VASTE_KOSTEN_CANDIDATE_CAP)
  })
})
