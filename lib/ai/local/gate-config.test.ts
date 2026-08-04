import { describe, it, expect } from 'vitest'
import {
  parseGateConfig,
  DEFAULT_GATE_CONFIG,
  PROOF_TASK_COUNT,
  MIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  LocalAiGateSchema,
} from './gate-config'
import { LOCAL_PROOF_TASKS } from './output-proof'
import { DEFAULT_LOCAL_MODEL_ID, resolveLocalModel, LOCAL_MODEL_CATALOG } from './model-catalog'

describe('gate-config', () => {
  // De grens van minPassed moet het WERKELIJKE aantal proefvragen zijn. Staat de
  // constante te hoog, dan is de strengste stand onbereikbaar; te laag, dan is
  // een deel van de toets stilzwijgend vrijblijvend.
  it('PROOF_TASK_COUNT loopt gelijk met het aantal proefvragen', () => {
    expect(PROOF_TASK_COUNT).toBe(LOCAL_PROOF_TASKS.length)
  })

  it('de standaard is de STRENGSTE stand — alle vragen goed', () => {
    expect(DEFAULT_GATE_CONFIG.minPassed).toBe(PROOF_TASK_COUNT)
    expect(DEFAULT_GATE_CONFIG.modelId).toBe(DEFAULT_LOCAL_MODEL_ID)
  })

  it('leest een geldige JSON-string', () => {
    const raw = JSON.stringify({
      modelId: 'gemma-4-e4b',
      minPassed: 2,
      timeoutMs: 60_000,
      allowUserModelChoice: false,
    })
    expect(parseGateConfig(raw)).toEqual({
      modelId: 'gemma-4-e4b',
      minPassed: 2,
      timeoutMs: 60_000,
      allowUserModelChoice: false,
    })
  })

  // Een kapotte of half-ingevulde instelling mag NOOIT een soepelere poort
  // opleveren — dan zou een fout in beheer de gate stil openzetten.
  it('onzin valt terug op de strenge standaard', () => {
    expect(parseGateConfig(null)).toEqual(DEFAULT_GATE_CONFIG)
    expect(parseGateConfig('{kapot')).toEqual(DEFAULT_GATE_CONFIG)
    expect(parseGateConfig({ modelId: 'bestaat-niet' }).modelId).toBe(DEFAULT_LOCAL_MODEL_ID)
    expect(parseGateConfig({ minPassed: 'twee' }).minPassed).toBe(PROOF_TASK_COUNT)
  })

  it('minPassed kan niet onder 1 of boven het aantal vragen', () => {
    expect(parseGateConfig({ minPassed: 0 }).minPassed).toBe(1)
    expect(parseGateConfig({ minPassed: -5 }).minPassed).toBe(1)
    expect(parseGateConfig({ minPassed: 99 }).minPassed).toBe(PROOF_TASK_COUNT)
  })

  it('timeoutMs blijft binnen de grenzen', () => {
    expect(parseGateConfig({ timeoutMs: 1 }).timeoutMs).toBe(MIN_TIMEOUT_MS)
    expect(parseGateConfig({ timeoutMs: 10_000_000 }).timeoutMs).toBe(MAX_TIMEOUT_MS)
  })

  it('het zod-schema weigert een drempel van nul', () => {
    const result = LocalAiGateSchema.safeParse({
      modelId: DEFAULT_LOCAL_MODEL_ID,
      minPassed: 0,
      timeoutMs: 45_000,
      allowUserModelChoice: true,
    })
    expect(result.success).toBe(false)
  })
})

describe('model-catalog', () => {
  it('elk model heeft een echte web-bundel-URL en een gemeten omvang', () => {
    for (const model of LOCAL_MODEL_CATALOG) {
      expect(model.url, model.id).toMatch(/^https:\/\/huggingface\.co\/.+\.litertlm$/)
      expect(model.bytes, model.id).toBeGreaterThan(1e9)
    }
  })

  it('onbekend id valt terug op de standaard in plaats van undefined', () => {
    expect(resolveLocalModel('bestaat-niet').id).toBe(DEFAULT_LOCAL_MODEL_ID)
    expect(resolveLocalModel(null).id).toBe(DEFAULT_LOCAL_MODEL_ID)
  })

  // Het contextvenster is de maat waarop de gecondenseerde lokale DNA en het
  // parity-manifest geschreven zijn; dat mag niet per modelkeuze verschuiven.
  it('alle modellen delen hetzelfde contextvenster', () => {
    const budgets = new Set(LOCAL_MODEL_CATALOG.map((m) => m.tokenBudget))
    expect(budgets.size).toBe(1)
  })
})
