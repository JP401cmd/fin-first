import { describe, it, expect } from 'vitest'
import {
  AI_ERROR_CODE,
  AI_DISABLED_GATE_MESSAGE,
  classifyAiErrorText,
  describeAiError,
  describeAiThrown,
  isAiErrorCode,
} from './error-copy'

/**
 * Vangrail bij H27. De bevinding was niet "een lelijke zin" maar een structurele
 * verwarring van publiek: de chat toonde de eindgebruiker een beheerdersopdracht
 * ("controleer de API-sleutel in Admin instellingen"). Deze suite bewaakt dat
 * terugvallen daarop rood wordt, én dat elke foutklasse een affordance heeft die
 * daadwerkelijk kan slagen.
 */

/** Termen die per definitie niet in gebruikerscopy horen. */
const BEHEERDERSTERMEN = [
  'sleutel',
  'api key',
  'api-key',
  'admin',
  'beheer',
  'environment',
  'env ',
  'anthropic',
  'openai',
  'mistral',
  'ollama',
  'kill-switch',
]

describe('error-copy — geen beheerderstaal', () => {
  it.each(Object.values(AI_ERROR_CODE))('copy voor %s bevat geen beheerdersterm', (code) => {
    const tekst = describeAiError(code).text.toLowerCase()
    for (const term of BEHEERDERSTERMEN) {
      expect(tekst, `code ${code}`).not.toContain(term)
    }
  })

  it('elke code levert een niet-lege tekst en een affordance', () => {
    for (const code of Object.values(AI_ERROR_CODE)) {
      const copy = describeAiError(code)
      expect(copy.text.length).toBeGreaterThan(10)
      expect(['opnieuw', 'geen', 'upsell', 'link']).toContain(copy.affordance)
      // Een link-affordance zonder doel is een dood eind.
      if (copy.affordance === 'link') expect(copy.href).toBeTruthy()
    }
  })
})

describe('describeAiError', () => {
  it('valt bij een onbekende code terug op het vangnet', () => {
    expect(describeAiError('iets_geks').code).toBe(AI_ERROR_CODE.unknown)
    expect(describeAiError(undefined).code).toBe(AI_ERROR_CODE.unknown)
    expect(describeAiError(null).code).toBe(AI_ERROR_CODE.unknown)
  })

  it('laat de servertekst alleen winnen bij het creditlimiet', () => {
    const server = 'Je hebt je maandelijkse AI-limiet bereikt (50 credits). De teller reset op 1 september.'
    expect(describeAiError(AI_ERROR_CODE.creditLimit, server).text).toBe(server)
    // Bij alle andere codes is de servertekst NIET leidend: die kan
    // beheerderstaal bevatten (dat is precies wat H27 aantrof).
    expect(describeAiError(AI_ERROR_CODE.unavailable, 'Anthropic API key ontbreekt').text)
      .not.toContain('Anthropic')
  })

  it('negeert een lege servertekst bij een preferServerText-code', () => {
    expect(describeAiError(AI_ERROR_CODE.creditLimit, '   ').text).toContain('limiet')
  })

  it('geeft geen retry-affordance bij fouten waar retry niet kan slagen', () => {
    for (const code of [
      AI_ERROR_CODE.disabledPlatform,
      AI_ERROR_CODE.creditLimit,
      AI_ERROR_CODE.privacyGate,
      AI_ERROR_CODE.unauthorized,
    ]) {
      expect(describeAiError(code).affordance, code).toBe('geen')
    }
    expect(describeAiError(AI_ERROR_CODE.subscription).affordance).toBe('upsell')
    expect(describeAiError(AI_ERROR_CODE.aiDisabled).affordance).toBe('link')
  })

  it('hergebruikt de gedeelde kill-switch-tekst voor ai_disabled', () => {
    expect(describeAiError(AI_ERROR_CODE.aiDisabled).text).toBe(AI_DISABLED_GATE_MESSAGE)
  })
})

describe('classifyAiErrorText — vangnet op vrije tekst', () => {
  it('mapt een sleutel-/422-fout op de neutrale klasse, niet op beheerderstaal', () => {
    expect(classifyAiErrorText('API key missing 422')).toBe(AI_ERROR_CODE.unavailable)
    expect(classifyAiErrorText('AI is niet geconfigureerd')).toBe(AI_ERROR_CODE.unavailable)
  })

  it('herkent de overige klassen', () => {
    expect(classifyAiErrorText('Request timeout')).toBe(AI_ERROR_CODE.timeout)
    expect(classifyAiErrorText('Error 504')).toBe(AI_ERROR_CODE.timeout)
    expect(classifyAiErrorText('Unauthorized 401')).toBe(AI_ERROR_CODE.unauthorized)
    expect(classifyAiErrorText('Niet ingelogd')).toBe(AI_ERROR_CODE.unauthorized)
    expect(classifyAiErrorText('Failed to fetch')).toBe(AI_ERROR_CODE.network)
    expect(classifyAiErrorText('Fin vereist een AI abonnement')).toBe(AI_ERROR_CODE.subscription)
    expect(classifyAiErrorText('AI is tijdelijk uitgeschakeld door beheer.')).toBe(AI_ERROR_CODE.disabledPlatform)
    expect(classifyAiErrorText('Privé-modus actief: gesprek met fin draait lokaal.')).toBe(AI_ERROR_CODE.privacyGate)
    expect(classifyAiErrorText('')).toBe(AI_ERROR_CODE.unknown)
    expect(classifyAiErrorText('iets willekeurigs')).toBe(AI_ERROR_CODE.unknown)
  })
})

describe('describeAiThrown — de rauwe body van de AI-SDK-transport', () => {
  it('leest de code uit de envelope', () => {
    const copy = describeAiThrown({
      message: JSON.stringify({ error: 'Fin staat uit', code: AI_ERROR_CODE.disabledPlatform }),
    })
    expect(copy.code).toBe(AI_ERROR_CODE.disabledPlatform)
    expect(copy.affordance).toBe('geen')
  })

  it('behoudt de rijke servertekst bij een creditlimiet-envelope', () => {
    const server = 'Je hebt je maandelijkse AI-limiet bereikt (50 credits). De teller reset op 1 september.'
    const copy = describeAiThrown({ message: JSON.stringify({ error: server, code: AI_ERROR_CODE.creditLimit }) })
    expect(copy.text).toBe(server)
  })

  it('classificeert op de servertekst als de envelope geen bekende code heeft', () => {
    const copy = describeAiThrown({ message: JSON.stringify({ error: 'Het antwoord duurde te lang' }) })
    expect(copy.code).toBe(AI_ERROR_CODE.timeout)
  })

  it('rendert nooit de rauwe body — ook niet bij kapotte JSON', () => {
    const copy = describeAiThrown({ message: '{ kapot json met ANTHROPIC_API_KEY erin' })
    expect(copy.text).not.toContain('ANTHROPIC_API_KEY')
    expect(copy.code).toBe(AI_ERROR_CODE.unknown)
  })

  it('valt terug op het vangnet zonder fout', () => {
    expect(describeAiThrown(undefined).code).toBe(AI_ERROR_CODE.unknown)
    expect(describeAiThrown({ message: '' }).code).toBe(AI_ERROR_CODE.unknown)
  })
})

describe('isAiErrorCode', () => {
  it('accepteert alleen bekende codes', () => {
    expect(isAiErrorCode('ai_unavailable')).toBe(true)
    expect(isAiErrorCode('server_error')).toBe(false)
    expect(isAiErrorCode(42)).toBe(false)
  })
})
