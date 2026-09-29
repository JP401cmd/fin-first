import { describe, expect, it } from 'vitest'
import { bouwAiBeeld } from './ai-reeks'
import type { AiAanroep } from './loader'

const NU = new Date('2026-09-29T10:00:00Z')

function aanroep(created_at: string, deel: Partial<AiAanroep> = {}): AiAanroep {
  return {
    created_at,
    feature: 'chat',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    input: 1_000_000,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    systeem: false,
    ...deel,
  }
}

function beeld(aanroepen: AiAanroep[], mislukt: string[] = [], foutenAfgekaptVanaf: string | null = null) {
  return bouwAiBeeld({ aanroepen, mislukt, foutenAfgekaptVanaf, nu: NU, dagen: 2 })
}

describe('bouwAiBeeld — reeksen en vergelijking', () => {
  const aanroepen = [
    aanroep('2026-09-25T09:00:00Z'), // vorige periode (25–26)
    aanroep('2026-09-27T09:00:00Z'), // huidige periode (27–28)
    aanroep('2026-09-28T09:00:00Z'),
    aanroep('2026-09-29T09:00:00Z'), // vandaag: telt niet mee in de vergelijking
  ]

  it('dekt twee periodes plus vandaag', () => {
    const b = beeld(aanroepen)
    expect(b.geslaagd).toHaveLength(5)
    expect(b.geslaagd[b.geslaagd.length - 1]).toMatchObject({ dag: '2026-09-29', aantal: 1, lopend: true })
  })

  it('vergelijkt volle dagen', () => {
    const b = beeld(aanroepen)
    expect(b.vergelijkGeslaagd.huidig.aantal).toBe(2)
    expect(b.vergelijkGeslaagd.vorig.aantal).toBe(1)
    expect(b.vergelijkGeslaagd.verschil).toBe(1)
  })
})

describe('bouwAiBeeld — aandeel mislukt', () => {
  it('mislukt gedeeld door geslaagd plus mislukt, over de huidige periode', () => {
    const b = beeld(
      [aanroep('2026-09-27T09:00:00Z'), aanroep('2026-09-28T09:00:00Z'), aanroep('2026-09-28T10:00:00Z')],
      ['2026-09-28T11:00:00Z', '2026-09-25T11:00:00Z'],
    )
    expect(b.aandeelMislukt).toEqual({ mislukt: 1, pogingen: 4 })
  })

  it('geen enkele aanroep: geen aandeel, geen deling door nul', () => {
    expect(beeld([]).aandeelMislukt).toBeNull()
  })

  it('alleen mislukte aanroepen: alles mislukt', () => {
    expect(beeld([], ['2026-09-28T11:00:00Z']).aandeelMislukt).toEqual({ mislukt: 1, pogingen: 1 })
  })

  it('een afgekapt foutvenster binnen de periode: geen aandeel, want de mislukte zijn niet volledig gemeten', () => {
    const b = beeld([aanroep('2026-09-28T09:00:00Z')], ['2026-09-28T11:00:00Z'], '2026-09-27T12:00:00Z')
    expect(b.vergelijkMislukt.huidig.aantal).toBeNull()
    expect(b.aandeelMislukt).toBeNull()
    // De geslaagde aanroepen zijn wel volledig gemeten.
    expect(b.vergelijkGeslaagd.huidig.aantal).toBe(1)
  })

  it('een afgekapt foutvenster vóór de periode raakt het aandeel niet', () => {
    const b = beeld([aanroep('2026-09-28T09:00:00Z')], ['2026-09-28T11:00:00Z'], '2026-09-26T12:00:00Z')
    expect(b.aandeelMislukt).toEqual({ mislukt: 1, pogingen: 2 })
    expect(b.vergelijkMislukt.vorig.aantal).toBeNull()
    expect(b.vergelijkMislukt.verschil).toBeNull()
  })
})

describe('bouwAiBeeld — verbruik per functie', () => {
  it('telt alleen de volle dagen van de huidige periode', () => {
    const b = beeld([
      aanroep('2026-09-25T09:00:00Z'),
      aanroep('2026-09-27T09:00:00Z'),
      aanroep('2026-09-29T09:00:00Z'),
    ])
    expect(b.perFunctie).toHaveLength(1)
    expect(b.perFunctie[0].aanroepen).toBe(1)
  })

  it('zet de zwaarste functie bovenaan en telt systeemaanroepen apart', () => {
    const b = beeld([
      aanroep('2026-09-27T09:00:00Z', { feature: 'chat', input: 100, output: 50 }),
      aanroep('2026-09-27T10:00:00Z', { feature: 'nieuws_duiding', input: 900, output: 100, systeem: true }),
      aanroep('2026-09-28T10:00:00Z', { feature: 'nieuws_duiding', input: 900, output: 100, systeem: true }),
    ])
    expect(b.perFunctie.map((f) => f.feature)).toEqual(['nieuws_duiding', 'chat'])
    expect(b.perFunctie[0]).toMatchObject({ aanroepen: 2, systeem: 2, tokensIn: 1800, tokensUit: 200 })
    expect(b.perFunctie[1]).toMatchObject({ aanroepen: 1, systeem: 0 })
  })
})

describe('bouwAiBeeld — kosten', () => {
  it('rekent tokens maal het modeltarief', () => {
    // 1 miljoen inputtokens op claude-sonnet-4-5: 3 dollar.
    const b = beeld([aanroep('2026-09-27T09:00:00Z'), aanroep('2026-09-28T09:00:00Z')])
    expect(b.kostenUsd).toBeCloseTo(6, 6)
    expect(b.perFunctie[0].kostenUsd).toBeCloseTo(6, 6)
    expect(b.onbekendeModellen).toEqual([])
  })

  it('geen aanroepen: kosten 0, niet onbekend', () => {
    expect(beeld([]).kostenUsd).toBe(0)
  })

  it('één model zonder tarief maakt het totaal onbekend, en noemt het model', () => {
    const b = beeld([
      aanroep('2026-09-27T09:00:00Z', { feature: 'chat' }),
      aanroep('2026-09-28T09:00:00Z', { feature: 'briefing', provider: 'openai', model: 'gpt-4o' }),
    ])
    expect(b.kostenUsd).toBeNull()
    expect(b.onbekendeModellen).toEqual(['gpt-4o'])
    // De functie met een bekend tarief houdt haar eigen bedrag.
    expect(b.perFunctie.find((f) => f.feature === 'chat')?.kostenUsd).toBeCloseTo(3, 6)
    expect(b.perFunctie.find((f) => f.feature === 'briefing')?.kostenUsd).toBeNull()
  })

  it('een functie blijft onbekend, ook als er na het onbekende model nog een bekende aanroep volgt', () => {
    const b = beeld([
      aanroep('2026-09-27T09:00:00Z', { provider: 'openai', model: 'gpt-4o' }),
      aanroep('2026-09-28T09:00:00Z'),
    ])
    expect(b.perFunctie[0].kostenUsd).toBeNull()
    expect(b.kostenUsd).toBeNull()
  })

  it('een lokale provider kost niets, en dat is iets anders dan onbekend', () => {
    const b = beeld([aanroep('2026-09-27T09:00:00Z', { provider: 'ollama', model: 'llama3.2' })])
    expect(b.kostenUsd).toBe(0)
    expect(b.onbekendeModellen).toEqual([])
  })
})
