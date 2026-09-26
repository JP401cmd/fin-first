import { describe, it, expect } from 'vitest'
import {
  MODEL_TARIEVEN,
  PRIJZEN_PEILDATUM,
  estimateCostUsd,
  normalizeModelId,
  tariefVoor,
} from './token-prices'

describe('normalizeModelId', () => {
  it('knipt het datum-suffix van een provider-id', () => {
    expect(normalizeModelId('claude-sonnet-4-5-20250929')).toBe('claude-sonnet-4-5')
  })

  it('laat een id zonder datum-suffix ongemoeid', () => {
    expect(normalizeModelId('claude-opus-5')).toBe('claude-opus-5')
  })

  it('knipt alleen een suffix van exact acht cijfers', () => {
    // Een versienummer als `-4-5` mag niet als datum worden gelezen.
    expect(normalizeModelId('claude-sonnet-4-5')).toBe('claude-sonnet-4-5')
    expect(normalizeModelId('model-1234567')).toBe('model-1234567')
    expect(normalizeModelId('model-123456789')).toBe('model-123456789')
  })

  it('normaliseert hoofdletters en witruimte', () => {
    expect(normalizeModelId('  Claude-Sonnet-4-5-20250929 ')).toBe('claude-sonnet-4-5')
  })

  it('geeft een lege string terug voor lege invoer', () => {
    expect(normalizeModelId('   ')).toBe('')
  })
})

describe('estimateCostUsd', () => {
  it('rekent het model dat deze app gebruikt ($3 in / $15 uit per MTok)', () => {
    // 1M in + 1M uit op sonnet 4.5 = $3 + $15.
    expect(estimateCostUsd('anthropic', 'claude-sonnet-4-5-20250929', 1_000_000, 1_000_000))
      .toBeCloseTo(18, 10)
  })

  it('rekent met de volledige provider-id, niet alleen met de alias', () => {
    expect(estimateCostUsd('anthropic', 'claude-sonnet-4-5-20250929', 100_000, 0)).toBeCloseTo(0.3, 10)
  })

  /**
   * Given een model waarvan we het tarief niet kennen
   * When de kosten worden geschat
   * Then komt er `null` uit, geen 0.
   *
   * "Gratis" en "niet te bepalen" zijn verschillende uitkomsten; 0 teruggeven
   * zou een onbekend tarief als kosteloos op het beheerscherm zetten. Dit is de
   * werkelijke OpenAI-default uit `lib/ai/config.ts` — die staat bewust niet in
   * de tarieventabel, want we houden die prijslijst niet bij.
   */
  it('geeft null bij een onbekend model — nooit 0', () => {
    expect(estimateCostUsd('openai', 'gpt-4o', 1_000_000, 1_000_000)).toBeNull()
    expect(estimateCostUsd('mistral', 'mistral-large-latest', 1_000_000, 1_000_000)).toBeNull()
    expect(estimateCostUsd('anthropic', '', 10, 10)).toBeNull()
  })

  /**
   * De gratis-regel hangt aan de PROVIDER, niet aan de modelnaam: bij Ollama is
   * de gelogde naam een vrije instelling (`settings.ai_model_ollama ||
   * 'llama3.2'`), dus elke naam die iemand daar invult hoort kosteloos te zijn.
   */
  it('geeft 0 voor een lokale provider, ongeacht de modelnaam', () => {
    expect(estimateCostUsd('ollama', 'llama3.2', 1_000_000, 1_000_000)).toBe(0)
    expect(estimateCostUsd('ollama', 'een-eigen-naam', 1_000_000, 1_000_000)).toBe(0)
    expect(estimateCostUsd('  Ollama  ', 'llama3.2', 1_000, 1_000)).toBe(0)
  })

  it('is nul bij nul tokens op een bekend model', () => {
    expect(estimateCostUsd('anthropic', 'claude-sonnet-4-5', 0, 0)).toBe(0)
  })

  it('weegt outputtokens zwaarder dan inputtokens', () => {
    const inKosten = estimateCostUsd('anthropic', 'claude-sonnet-4-5', 1_000_000, 0)!
    const uitKosten = estimateCostUsd('anthropic', 'claude-sonnet-4-5', 0, 1_000_000)!
    expect(uitKosten).toBeGreaterThan(inKosten)
    expect(uitKosten / inKosten).toBeCloseTo(5, 10)
  })
})

describe('tarieventabel', () => {
  it('dekt het model dat in productie draait', () => {
    expect(tariefVoor('claude-sonnet-4-5-20250929')).not.toBeNull()
  })

  it('heeft voor elk model een output- boven een inputtarief (of beide nul)', () => {
    for (const [model, tarief] of Object.entries(MODEL_TARIEVEN)) {
      if (tarief.inputPerMTok === 0) {
        expect(tarief.outputPerMTok, model).toBe(0)
      } else {
        expect(tarief.outputPerMTok, model).toBeGreaterThan(tarief.inputPerMTok)
      }
    }
  })

  it('draagt een peildatum in ISO-vorm', () => {
    expect(PRIJZEN_PEILDATUM).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
