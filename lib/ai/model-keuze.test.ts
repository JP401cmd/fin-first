import { describe, it, expect } from 'vitest'
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_EFFORT,
  featureSleutels,
  kiesAnthropicModel,
  kiesEffort,
  ondersteuntEffort,
} from './model-keuze'

describe('kiesAnthropicModel — model per feature', () => {
  it('feature-sleutel wint van de globale', () => {
    const settings = {
      ai_model_anthropic: 'claude-sonnet-5',
      'ai_model_anthropic:nieuws_ingest': 'claude-haiku-4-5',
    }
    expect(kiesAnthropicModel(settings, 'nieuws_ingest')).toBe('claude-haiku-4-5')
    expect(kiesAnthropicModel(settings, 'chat')).toBe('claude-sonnet-5')
  })

  it('zonder feature of override: het globale model, daarna de code-default', () => {
    expect(kiesAnthropicModel({ ai_model_anthropic: 'claude-sonnet-5' }, undefined)).toBe('claude-sonnet-5')
    expect(kiesAnthropicModel({}, 'chat')).toBe(DEFAULT_ANTHROPIC_MODEL)
  })

  it('een lege of witruimte-override telt als niet gezet', () => {
    const settings = { ai_model_anthropic: 'claude-sonnet-5', 'ai_model_anthropic:chat': '  ' }
    expect(kiesAnthropicModel(settings, 'chat')).toBe('claude-sonnet-5')
  })

  it('een feature-string met een uid krijgt nooit een eigen sleutel', () => {
    const uid = '3f2a9c1e-0b4d-4e8a-9f11-2c7d5e6a8b90'
    const settings = { ai_model_anthropic: 'claude-sonnet-5', [`ai_model_anthropic:rapport:${uid}`]: 'claude-fable-5-1' }
    expect(kiesAnthropicModel(settings, `rapport:${uid}`)).toBe('claude-sonnet-5')
    expect(featureSleutels(`rapport:${uid}`)).toEqual(['ai_effort_anthropic'])
  })

  it('leest de feature-sleutels mee uit app_settings', () => {
    expect(featureSleutels('chat')).toEqual(['ai_effort_anthropic', 'ai_model_anthropic:chat', 'ai_effort_anthropic:chat'])
    expect(featureSleutels(undefined)).toEqual(['ai_effort_anthropic'])
  })
})

describe('kiesEffort — alleen op modellen die effort kennen', () => {
  it('Sonnet 4.5 en Haiku 4.5 krijgen nooit effort (400 bij de provider)', () => {
    expect(ondersteuntEffort('claude-sonnet-4-5-20250929')).toBe(false)
    expect(ondersteuntEffort('claude-haiku-4-5')).toBe(false)
    expect(kiesEffort({ ai_effort_anthropic: 'high' }, 'chat', 'claude-haiku-4-5')).toBeNull()
  })

  it('Sonnet 5 krijgt standaard low', () => {
    expect(kiesEffort({}, 'chat', 'claude-sonnet-5')).toBe(DEFAULT_EFFORT)
    expect(DEFAULT_EFFORT).toBe('low')
  })

  it('xhigh valt terug op modellen die hem niet kennen (4.6-familie)', () => {
    expect(kiesEffort({ ai_effort_anthropic: 'xhigh' }, 'chat', 'claude-sonnet-4-6')).toBe(DEFAULT_EFFORT)
    expect(kiesEffort({ ai_effort_anthropic: 'xhigh' }, 'chat', 'claude-sonnet-5')).toBe('xhigh')
  })

  it('feature-effort wint van globale; een ongeldige waarde valt terug', () => {
    const settings = { ai_effort_anthropic: 'medium', 'ai_effort_anthropic:rapport': 'high' }
    expect(kiesEffort(settings, 'rapport', 'claude-sonnet-5')).toBe('high')
    expect(kiesEffort(settings, 'chat', 'claude-sonnet-5')).toBe('medium')
    expect(kiesEffort({ 'ai_effort_anthropic:chat': 'hoog' }, 'chat', 'claude-sonnet-5')).toBe(DEFAULT_EFFORT)
  })
})
