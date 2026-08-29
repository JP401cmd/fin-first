import { describe, it, expect } from 'vitest'
import { errorSignature, normalizeMessage, signatureBasis } from './error-signature'
import { errorFingerprint } from './fingerprint'

/**
 * De normalisator is na de splitsing (ADR 0113) GEDEELD door twee afgeleiden.
 * Deze suite bewaakt de eigenschap waar de groepeersleutel op leunt — dezelfde
 * fout met andere ids/bedragen/datums is één groep — en de eigenschap waarom de
 * splitsing er is: de resolutie-sleutel hangt NIET aan `CRON_SECRET`.
 */

describe('normalizeMessage — variabele delen verdwijnen', () => {
  it('maskeert ids, bedragen, datums, urls en e-mail', () => {
    const norm = normalizeMessage(
      'Budget 550e8400-e29b-41d4-a716-446655440000 van 1.234,56 op 2026-08-11 via https://x.test/a?b=1 voor jan@trifinity.nl',
    )
    expect(norm).not.toMatch(/550e8400/)
    expect(norm).not.toMatch(/1\.234,56/)
    expect(norm).not.toMatch(/2026-08-11/)
    expect(norm).not.toMatch(/x\.test/)
    expect(norm).not.toMatch(/@trifinity/)
  })
})

describe('errorSignature — één groep per foutsoort', () => {
  it('zelfde fout met andere ids/bedragen/datums → dezelfde signature', () => {
    const a = errorSignature('window.onerror', 'Budget 550e8400-e29b-41d4-a716-446655440000 niet gevonden (1.234,56)')
    const b = errorSignature('window.onerror', 'Budget 9f1c2d3e-1111-4222-8333-444455556666 niet gevonden (98,10)')
    expect(a).toBe(b)
  })

  it('andere fout → andere signature', () => {
    expect(errorSignature('window.onerror', 'Budget niet gevonden')).not.toBe(
      errorSignature('window.onerror', 'Verbinding met de database verbroken'),
    )
  })

  it('dezelfde melding in een andere context is een andere soort', () => {
    expect(errorSignature('window.onerror', 'boem')).not.toBe(
      errorSignature('unhandledrejection', 'boem'),
    )
  })

  it('vorm: 16 hex-tekens', () => {
    expect(errorSignature('x', 'y')).toMatch(/^[0-9a-f]{16}$/)
  })

  it('null/undefined levert een stabiele sleutel, geen crash', () => {
    expect(errorSignature(null, null)).toBe(errorSignature(undefined, undefined))
  })
})

describe('de twee afgeleiden zijn bewust verschillend', () => {
  it('sleutelloos: rotatie van CRON_SECRET raakt de signature niet', () => {
    const orig = process.env.CRON_SECRET
    try {
      process.env.CRON_SECRET = 'sleutel-een'
      const sigA = errorSignature('ctx', 'boem')
      const fpA = errorFingerprint('ctx', 'boem')
      process.env.CRON_SECRET = 'sleutel-twee'
      expect(errorSignature('ctx', 'boem')).toBe(sigA)
      // Contrast: de HMAC-variant is per definitie wél sleutelafhankelijk.
      expect(errorFingerprint('ctx', 'boem')).not.toBe(fpA)
    } finally {
      if (orig === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = orig
    }
  })

  it('beide leunen op dezelfde basis — één normalisator', () => {
    expect(signatureBasis(' WINDOW.onerror ', 'Fout 42')).toBe('window.onerror|fout <n>')
  })
})
