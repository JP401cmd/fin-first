import { describe, it, expect } from 'vitest'
import {
  buildKnowledgeContext,
  selectKnowledgeForQuestion,
  estimateTokens,
  parseLocalKnowledge,
  LOCAL_KNOWLEDGE_TOKEN_BUDGET,
  type LocalKnowledgeItem,
} from './knowledge-context'

/**
 * Kennisbank lokale AI (fase K1) — pure injectie-helper.
 * Contract: filtert op actief, sorteert op volgorde, schat tokens (chars/4) en
 * kapt af op het budget op ITEM-grens (nooit een half item). Leeg → lege string.
 */

function makeItem(overrides: Partial<LocalKnowledgeItem> = {}): LocalKnowledgeItem {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    titel: overrides.titel ?? 'A',
    tekst: overrides.tekst ?? 'x'.repeat(40),
    tags: overrides.tags ?? [],
    actief: overrides.actief ?? true,
    volgorde: overrides.volgorde ?? 0,
    bijgewerkt: overrides.bijgewerkt ?? '2026-07-19T00:00:00.000Z',
  }
}

describe('estimateTokens', () => {
  it('schat op chars/4, naar boven afgerond', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abcd')).toBe(1) // 4/4
    expect(estimateTokens('abcde')).toBe(2) // ceil(5/4)
  })
})

describe('buildKnowledgeContext', () => {
  it('leeg → lege string, geen ids, 0 tokens', () => {
    expect(buildKnowledgeContext([])).toEqual({ text: '', includedIds: [], estTokens: 0 })
  })

  it('geeft alleen inactieve items níet terug (actief gefilterd)', () => {
    const items = [
      makeItem({ id: 'a', titel: 'Actief', tekst: 'uitleg', actief: true, volgorde: 0 }),
      makeItem({ id: 'b', titel: 'Uit', tekst: 'verborgen', actief: false, volgorde: 1 }),
    ]
    const ctx = buildKnowledgeContext(items)
    expect(ctx.includedIds).toEqual(['a'])
    expect(ctx.text).toContain('Actief')
    expect(ctx.text).not.toContain('verborgen')
  })

  it('sorteert op volgorde (oplopend), niet op invoervolgorde', () => {
    const items = [
      makeItem({ id: 'tweede', volgorde: 2 }),
      makeItem({ id: 'eerste', volgorde: 1 }),
      makeItem({ id: 'derde', volgorde: 3 }),
    ]
    const ctx = buildKnowledgeContext(items)
    expect(ctx.includedIds).toEqual(['eerste', 'tweede', 'derde'])
  })

  it('kapt af op de item-grens zodra het budget vol is (nooit half item)', () => {
    // Elk blok = "### A\n" (6 chars) + 40-char tekst = 46 chars; separator = 2.
    // 1 blok = 46 → 12 tokens · 2 blokken = 94 → 24 · 3 blokken = 142 → 36.
    const items = [
      makeItem({ id: '1', volgorde: 1 }),
      makeItem({ id: '2', volgorde: 2 }),
      makeItem({ id: '3', volgorde: 3 }),
    ]
    // Budget 24 laat exact 2 items toe; het 3e (36 tokens) valt volledig af.
    const ctx = buildKnowledgeContext(items, 24)
    expect(ctx.includedIds).toEqual(['1', '2'])
    expect(ctx.estTokens).toBe(24)
    expect(ctx.text.split('\n\n')).toHaveLength(2)
  })

  it('neemt geen gedeeltelijk item op bij een krap budget', () => {
    const items = [makeItem({ id: '1', volgorde: 1 }), makeItem({ id: '2', volgorde: 2 })]
    // 1 blok = 12 tokens ≤ 23; 2 blokken = 24 > 23 → alleen het eerste.
    const ctx = buildKnowledgeContext(items, 23)
    expect(ctx.includedIds).toEqual(['1'])
  })

  it('estTokens is de chars/4-schatting van de teruggegeven text', () => {
    const items = [makeItem({ id: '1', volgorde: 1 }), makeItem({ id: '2', volgorde: 2 })]
    const ctx = buildKnowledgeContext(items)
    expect(ctx.estTokens).toBe(Math.ceil(ctx.text.length / 4))
  })

  it('gebruikt standaard het LOCAL_KNOWLEDGE_TOKEN_BUDGET', () => {
    // Eén ruim item past binnen 3000 tokens.
    const ctx = buildKnowledgeContext([makeItem({ id: '1', tekst: 'korte uitleg' })])
    expect(ctx.includedIds).toEqual(['1'])
    expect(LOCAL_KNOWLEDGE_TOKEN_BUDGET).toBe(3000)
  })
})

describe('selectKnowledgeForQuestion', () => {
  const finItems = [
    makeItem({ id: 'jaar', titel: 'Jaarruimte', tags: ['pensioen', 'lijfrente'], volgorde: 1 }),
    makeItem({ id: 'box3', titel: 'Box 3', tags: ['vermogen', 'sparen'], volgorde: 2 }),
  ]

  it('matcht op een woord uit de titel', () => {
    const ctx = selectKnowledgeForQuestion(finItems, 'Wat is jaarruimte eigenlijk?')
    expect(ctx.includedIds).toEqual(['jaar'])
  })

  it('matcht op een tag (synoniem dat niet in de titel staat)', () => {
    const ctx = selectKnowledgeForQuestion(finItems, 'ik wil meer weten over lijfrente')
    expect(ctx.includedIds).toEqual(['jaar'])
  })

  it('is case-insensitief', () => {
    const ctx = selectKnowledgeForQuestion(finItems, 'JAARRUIMTE UITLEG GRAAG')
    expect(ctx.includedIds).toEqual(['jaar'])
  })

  it('geen match → lege context (model antwoordt puur vanuit z’n DNA)', () => {
    const ctx = selectKnowledgeForQuestion(finItems, 'wat is het weer vandaag')
    expect(ctx).toEqual({ text: '', includedIds: [], estTokens: 0 })
  })

  it('negeert te korte fragmenten (geen triviale substring-match)', () => {
    // Titel-woord "is" (2 tekens) mag niet matchen op willekeurige tekst.
    const items = [makeItem({ id: 'x', titel: 'Wat is dit', tags: [], volgorde: 1 })]
    expect(selectKnowledgeForQuestion(items, 'dit is prima').includedIds).toEqual(['x']) // via "dit"/"wat"
    expect(selectKnowledgeForQuestion(items, 'zomaar iets').includedIds).toEqual([])
  })

  it('filtert inactieve items ook als ze zouden matchen', () => {
    const items = [makeItem({ id: 'uit', titel: 'FIRE', tags: ['fire'], actief: false, volgorde: 1 })]
    expect(selectKnowledgeForQuestion(items, 'vertel over fire').includedIds).toEqual([])
  })

  it('kapt matchende items af op de item-grens binnen het budget', () => {
    const items = [
      makeItem({ id: '1', titel: 'FIRE', tags: ['fire'], volgorde: 1 }),
      makeItem({ id: '2', titel: 'FIRE', tags: ['fire'], volgorde: 2 }),
    ]
    // Beide matchen op "fire"; blok = "### FIRE\n" (9) + 40 = 49 → 13 tokens.
    expect(selectKnowledgeForQuestion(items, 'over fire', 13).includedIds).toEqual(['1'])
    expect(selectKnowledgeForQuestion(items, 'over fire').includedIds).toEqual(['1', '2'])
  })
})

describe('parseLocalKnowledge', () => {
  it('parseert een opgeslagen JSON-string (round-trip)', () => {
    const items = [makeItem({ id: 'a', titel: 'Box 3', tekst: 'uitleg', volgorde: 0 })]
    const parsed = parseLocalKnowledge(JSON.stringify(items))
    expect(parsed).toEqual(items)
  })

  it('accepteert een reeds-geparste array', () => {
    const items = [makeItem({ id: 'a' })]
    expect(parseLocalKnowledge(items)).toEqual(items)
  })

  it('geeft [] bij null, undefined, lege string en ongeldige JSON', () => {
    expect(parseLocalKnowledge(null)).toEqual([])
    expect(parseLocalKnowledge(undefined)).toEqual([])
    expect(parseLocalKnowledge('')).toEqual([])
    expect(parseLocalKnowledge('{ niet: geldig')).toEqual([])
  })

  it('geeft [] als de waarde geen array is', () => {
    expect(parseLocalKnowledge('{"titel":"x"}')).toEqual([])
    expect(parseLocalKnowledge(42)).toEqual([])
  })

  it('slaat items zonder id/titel/tekst over', () => {
    const raw = [
      { id: 'ok', titel: 'T', tekst: 'U', tags: [], actief: true, volgorde: 0, bijgewerkt: 'now' },
      { id: '', titel: 'geen id', tekst: 'x' },
      { id: 'x', titel: '', tekst: 'geen titel' },
      { id: 'y', titel: 'geen tekst', tekst: '' },
      'niet-een-object',
    ]
    const parsed = parseLocalKnowledge(raw)
    expect(parsed.map((i) => i.id)).toEqual(['ok'])
  })

  it('vult ontbrekende velden met veilige defaults (tags [], actief true, volgorde 0)', () => {
    const parsed = parseLocalKnowledge([{ id: 'a', titel: 'T', tekst: 'U' }])
    expect(parsed[0]).toMatchObject({ tags: [], actief: true, volgorde: 0, bijgewerkt: '' })
  })

  it('filtert niet-string tags eruit en trimt de rest', () => {
    const parsed = parseLocalKnowledge([
      { id: 'a', titel: 'T', tekst: 'U', tags: ['  box3 ', 3, '', null, 'jaarruimte'] },
    ])
    expect(parsed[0].tags).toEqual(['box3', 'jaarruimte'])
  })
})
