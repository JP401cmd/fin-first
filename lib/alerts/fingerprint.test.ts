import { describe, it, expect } from 'vitest'
import { errorFingerprint, normalizeMessage, safeContextTag } from './fingerprint'

describe('normalizeMessage', () => {
  it('maskeert de variabele delen die per voorval verschillen', () => {
    const norm = normalizeMessage(
      'Kan asset 0f8e1a2b-3c4d-5e6f-7a8b-9c0d1e2f3a4b niet laden voor jan@example.com op 2026-08-11T09:12:00Z (€ 1.234,56)',
    )
    expect(norm).not.toContain('0f8e1a2b')
    expect(norm).not.toContain('jan@example.com')
    expect(norm).not.toContain('2026-08-11')
    expect(norm).not.toContain('1.234,56')
    expect(norm).toContain('kan asset')
  })
})

describe('errorFingerprint', () => {
  it('geeft dezelfde vingerafdruk voor hetzelfde fouttype met andere ids', () => {
    const a = errorFingerprint(
      'budget-loader',
      'Budget 41 niet gevonden voor 0f8e1a2b-3c4d-5e6f-7a8b-9c0d1e2f3a4b',
    )
    const b = errorFingerprint(
      'budget-loader',
      'Budget 987 niet gevonden voor 11112222-3333-4444-5555-666677778888',
    )
    expect(a).toBe(b)
  })

  it('BEKENDE GRENS: korte niet-numerieke slugs worden niet gemaskeerd', () => {
    // `abc-1` / `zzz-9` matchen geen enkel maskerpatroon, dus dit levert twee
    // vingerafdrukken op. Bewust niet "opgelost" met een bredere woordmasker:
    // dat zou verschillende fouten tot één type platslaan en juist ECHTE nieuwe
    // fouten verbergen. De storm-bescherming zit een laag hoger — de sweep
    // bundelt alle nieuwe types van een venster tot één melding — en de state
    // blijft begrensd door de cap in sweep.ts (MAX_FINGERPRINTS).
    const a = errorFingerprint('x', 'Gebruiker abc-1 onbekend')
    const b = errorFingerprint('x', 'Gebruiker zzz-9 onbekend')
    expect(a).not.toBe(b)
  })

  it('onderscheidt een ander fouttype', () => {
    const a = errorFingerprint('budget-loader', 'Budget niet gevonden')
    const b = errorFingerprint('budget-loader', 'Verbinding met de database verbroken')
    expect(a).not.toBe(b)
  })

  it('onderscheidt dezelfde tekst uit een andere context', () => {
    expect(errorFingerprint('a', 'boem')).not.toBe(errorFingerprint('b', 'boem'))
  })

  it('is kort en stabiel van vorm', () => {
    expect(errorFingerprint('x', 'y')).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('safeContextTag', () => {
  it('laat onze eigen tags ongemoeid', () => {
    expect(safeContextTag('onRequestError:route')).toBe('onrequesterror:route')
    expect(safeContextTag('global-error')).toBe('global-error')
    expect(safeContextTag('window.onerror')).toBe('window.onerror')
    expect(safeContextTag('unhandledrejection')).toBe('unhandledrejection')
  })

  /**
   * UR3-09 / ADR 0132: `ai:<feature>`-tags uit `lib/ai/ai-failure-middleware.ts`
   * horen bij de eigen allowlist, net als de andere machinaal gezette tags.
   */
  it('laat onze eigen ai:<feature>-tags ongemoeid', () => {
    expect(safeContextTag('ai:chat')).toBe('ai:chat')
    expect(safeContextTag('ai:config')).toBe('ai:config')
  })

  /**
   * DE PRECIEZE REGRESSIE die de allowlist moet blijven vangen: een tag die op
   * onze eigen vorm lijkt (`ai:` + toegestaan alfabet) maar in werkelijkheid
   * client-aangeleverde tekst bevat, mag NOOIT doorlekken. Een IBAN past qua
   * tekens niet in `[a-z_]` (cijfers/hoofdletters), dus dit moet 'onbekend'
   * opleveren — exact de klasse fout die de grote allowlist-comment hierboven
   * beschrijft (IBAN die intact bleef onder de oude knijpfilter-aanpak).
   */
  it("safeContextTag('ai:NL91ABNA0417164300') mag NIET doorlaten (IBAN-leak-klasse)", () => {
    expect(safeContextTag('ai:NL91ABNA0417164300')).toBe('onbekend')
  })

  /**
   * ALLOWLIST-gedrag. Een eerdere versie knijpde alleen het alfabet en kapte op
   * 40 tekens; die liet een IBAN volledig intact en maakte van een e-mailadres
   * `jan.smit-trifinity.nl`. Deze gevallen zijn dus geen theorie — het waren de
   * werkelijke uitkomsten. Elke regel hieronder MOET 'onbekend' opleveren.
   */
  it.each([
    ['NL91ABNA0417164300'],
    ['jan.smit@trifinity.nl'],
    ['Jan Pieter Smit, Dorpsstraat 12 Utrecht'],
    ['user 06-12345678 kaart 4111111111111111'],
    ['budget-loader'], // plausibel ogend, maar niet van ons -> ook weg
    ['onRequestError:'], // bijna onze vorm, maar leeg achtervoegsel
  ])('client-aangeleverde context %j wordt onbekend', (input) => {
    expect(safeContextTag(input)).toBe('onbekend')
  })

  it('valt terug op "onbekend" bij lege of onbruikbare context', () => {
    expect(safeContextTag(null)).toBe('onbekend')
    expect(safeContextTag('   ')).toBe('onbekend')
  })
})
