import { describe, it, expect } from 'vitest'
import {
  toetsAntwoord,
  keuzesUitOpslag,
  antwoordAlsTekst,
  openVerplichteVragen,
  AntwoordBodySchema,
  type VraagDefinitie,
} from './antwoord'

function vraag(overrides: Partial<VraagDefinitie> = {}): VraagDefinitie {
  return {
    id: 'v1',
    type: 'open',
    question_text: 'Wat vind je?',
    options: null,
    scale_min_label: null,
    scale_max_label: null,
    is_required: true,
    is_multi_select: false,
    ...overrides,
  }
}

describe('toetsAntwoord', () => {
  it('open: trimt en weigert leeg', () => {
    expect(toetsAntwoord(vraag(), { answer_text: '  prima  ' })).toEqual({
      ok: true,
      antwoord: { answer_text: 'prima', answer_scale: null, answer_choice: null },
    })
    expect(toetsAntwoord(vraag(), { answer_text: '   ' }).ok).toBe(false)
    expect(toetsAntwoord(vraag(), {}).ok).toBe(false)
  })

  it('schaal: bewaart alleen het cijfer, ook als er tekst meekomt', () => {
    const r = toetsAntwoord(vraag({ type: 'scale' }), { answer_scale: 7, answer_text: 'x' })
    expect(r).toEqual({ ok: true, antwoord: { answer_text: null, answer_scale: 7, answer_choice: null } })
    expect(toetsAntwoord(vraag({ type: 'scale' }), {}).ok).toBe(false)
  })

  it('meerkeuze (één): moet een bestaande optie zijn, precies één', () => {
    const mc = vraag({ type: 'multiple_choice', options: ['Ja', 'Nee'] })
    expect(toetsAntwoord(mc, { answer_choices: ['Nee'] })).toEqual({
      ok: true,
      antwoord: { answer_text: null, answer_scale: null, answer_choice: 'Nee' },
    })
    expect(toetsAntwoord(mc, { answer_choices: ['Misschien'] }).ok).toBe(false)
    expect(toetsAntwoord(mc, { answer_choices: ['Ja', 'Nee'] }).ok).toBe(false)
    expect(toetsAntwoord(mc, { answer_choices: [] }).ok).toBe(false)
  })

  it('meerkeuze (meer): JSON-array in de volgorde van de opties, zonder dubbelen', () => {
    const mc = vraag({ type: 'multiple_choice', options: ['A', 'B', 'C'], is_multi_select: true })
    expect(toetsAntwoord(mc, { answer_choices: ['C', 'A', 'C'] })).toEqual({
      ok: true,
      antwoord: { answer_text: null, answer_scale: null, answer_choice: '["A","C"]' },
    })
  })
})

describe('AntwoordBodySchema', () => {
  const ids = { session_id: '3f2b6c1e-8a4d-4c2b-9f1e-2d3c4b5a6f70', question_id: '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' }

  it('accepteert een geldig schaalantwoord en weigert een cijfer buiten 1-10', () => {
    expect(AntwoordBodySchema.safeParse({ ...ids, answer_scale: 10 }).success).toBe(true)
    expect(AntwoordBodySchema.safeParse({ ...ids, answer_scale: 11 }).success).toBe(false)
    expect(AntwoordBodySchema.safeParse({ ...ids, answer_scale: 2.5 }).success).toBe(false)
  })

  it('weigert een ongeldige verwijzing', () => {
    expect(AntwoordBodySchema.safeParse({ ...ids, session_id: 'nope', answer_scale: 3 }).success).toBe(false)
  })
})

describe('hulpjes', () => {
  it('keuzesUitOpslag leest zowel JSON-array als gewone string', () => {
    expect(keuzesUitOpslag('["A","B"]')).toEqual(['A', 'B'])
    expect(keuzesUitOpslag('Ja')).toEqual(['Ja'])
    expect(keuzesUitOpslag(null)).toEqual([])
  })

  it('antwoordAlsTekst geeft per type een leesbare regel', () => {
    expect(antwoordAlsTekst({ answer_text: 'hoi', answer_scale: null, answer_choice: null })).toBe('hoi')
    expect(antwoordAlsTekst({ answer_text: null, answer_scale: 8, answer_choice: null })).toBe('8 van 10')
    expect(antwoordAlsTekst({ answer_text: null, answer_scale: null, answer_choice: '["A","B"]' })).toBe('A, B')
  })

  it('openVerplichteVragen negeert niet-verplichte vragen', () => {
    const vragen = [
      { id: 'a', is_required: true },
      { id: 'b', is_required: false },
      { id: 'c', is_required: true },
    ]
    expect(openVerplichteVragen(vragen, new Set(['a']))).toEqual(['c'])
    expect(openVerplichteVragen(vragen, new Set(['a', 'c']))).toEqual([])
  })
})

describe('toetsAntwoord — uitgebreide vraagtypes', () => {
  it('schaal: toetst tegen het bereik van de vraag (0–10 NPS, 1–5)', () => {
    const nps = vraag({ type: 'scale', scale_min: 0, scale_max: 10 })
    expect(toetsAntwoord(nps, { answer_scale: 0 }).ok).toBe(true)
    const vijf = vraag({ type: 'scale', scale_min: 1, scale_max: 5 })
    expect(toetsAntwoord(vijf, { answer_scale: 5 }).ok).toBe(true)
    expect(toetsAntwoord(vijf, { answer_scale: 6 })).toEqual({ ok: false, fout: 'Kies een cijfer van 1 tot 5' })
    expect(toetsAntwoord(vijf, { answer_scale: 0 }).ok).toBe(false)
  })

  it('schaal: oude rijen zonder bereik vallen terug op 1–10', () => {
    const oud = vraag({ type: 'scale', scale_min: undefined, scale_max: undefined })
    expect(toetsAntwoord(oud, { answer_scale: 0 }).ok).toBe(false)
    expect(toetsAntwoord(oud, { answer_scale: 10 }).ok).toBe(true)
  })

  it('ja/nee: alleen Ja of Nee, precies één', () => {
    const jn = vraag({ type: 'yes_no' })
    expect(toetsAntwoord(jn, { answer_choices: ['Ja'] })).toEqual({
      ok: true,
      antwoord: { answer_text: null, answer_scale: null, answer_choice: 'Ja' },
    })
    expect(toetsAntwoord(jn, { answer_choices: ['Misschien'] }).ok).toBe(false)
    expect(toetsAntwoord(jn, { answer_choices: ['Ja', 'Nee'] }).ok).toBe(false)
  })

  it('rangschikken: moet een volledige volgorde van alle opties zijn', () => {
    const rk = vraag({ type: 'ranking', options: ['A', 'B', 'C'] })
    expect(toetsAntwoord(rk, { answer_choices: ['C', 'A', 'B'] })).toEqual({
      ok: true,
      antwoord: { answer_text: null, answer_scale: null, answer_choice: '["C","A","B"]' },
    })
    expect(toetsAntwoord(rk, { answer_choices: ['C', 'A'] }).ok).toBe(false)
    expect(toetsAntwoord(rk, { answer_choices: ['C', 'A', 'A'] }).ok).toBe(false)
    expect(toetsAntwoord(rk, { answer_choices: ['C', 'A', 'X'] }).ok).toBe(false)
  })

  it('meerkeuze met "Anders": vereist allow_other én een eigen tekst', () => {
    const zonder = vraag({ type: 'multiple_choice', options: ['A', 'B'] })
    expect(toetsAntwoord(zonder, { answer_choices: ['Anders, namelijk'], answer_other: 'x' }).ok).toBe(false)

    const met = vraag({ type: 'multiple_choice', options: ['A', 'B'], allow_other: true })
    expect(toetsAntwoord(met, { answer_choices: ['Anders, namelijk'] }).ok).toBe(false)
    expect(toetsAntwoord(met, { answer_choices: ['Anders, namelijk'], answer_other: '  eigen  ' })).toEqual({
      ok: true,
      antwoord: { answer_text: 'eigen', answer_scale: null, answer_choice: 'Anders, namelijk' },
    })

    const meer = vraag({ type: 'multiple_choice', options: ['A', 'B'], allow_other: true, is_multi_select: true })
    expect(toetsAntwoord(meer, { answer_choices: ['Anders, namelijk', 'B'], answer_other: 'C' })).toEqual({
      ok: true,
      antwoord: { answer_text: 'C', answer_scale: null, answer_choice: '["B","Anders, namelijk"]' },
    })
  })

  it('antwoordAlsTekst: per type met de vraag als context', () => {
    expect(antwoordAlsTekst({ answer_text: null, answer_scale: 4, answer_choice: null }, vraag({ type: 'scale', scale_min: 1, scale_max: 5 }))).toBe('4 van 5')
    expect(antwoordAlsTekst({ answer_text: null, answer_scale: null, answer_choice: '["B","A"]' }, vraag({ type: 'ranking' }))).toBe('1. B · 2. A')
    expect(antwoordAlsTekst({ answer_text: 'eigen', answer_scale: null, answer_choice: '["A","Anders, namelijk"]' }, vraag({ type: 'multiple_choice' }))).toBe('A, Anders: eigen')
  })
})
