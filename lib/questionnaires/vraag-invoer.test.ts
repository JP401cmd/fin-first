import { describe, it, expect } from 'vitest'
import { parseBody } from '@/lib/api/parse-body'
import { VraagInvoerSchema, VragenlijstAanmaakSchema, VragenlijstWijzigSchema, vertaalVeldpad, vraagNaarRij } from './vraag-invoer'

describe('vertaalVeldpad — op de échte parseBody-melding', () => {
  async function melding(body: unknown): Promise<string> {
    const res = await parseBody(VragenlijstAanmaakSchema, new Request('http://x', { method: 'POST', body: JSON.stringify(body) }))
    if (res.ok) throw new Error('verwachtte een keuringsfout')
    return ((await res.response.json()) as { error: string }).error
  }

  it('lege optie in een nieuwe meerkeuzevraag (de standaardsituatie: opties starten als ["", ""])', async () => {
    const ruw = await melding({ title: 'T', questions: [{ type: 'multiple_choice', question_text: 'Q', options: ['', ''] }] })
    expect(ruw).toMatch(/^questions\.0\.options\.\d: /)
    expect(vertaalVeldpad(ruw)).toBe('Vraag 1: Een optie mag niet leeg zijn')
  })

  it('lege vraagtekst op de tweede vraag', async () => {
    const ruw = await melding({ title: 'T', questions: [{ type: 'open', question_text: 'Q' }, { type: 'open', question_text: '' }] })
    expect(vertaalVeldpad(ruw)).toBe('Vraag 2: Een vraag mag niet leeg zijn')
  })

  it('laat een melding zonder vraagpad ongemoeid', () => {
    expect(vertaalVeldpad('title: Geef de vragenlijst een titel')).toBe('title: Geef de vragenlijst een titel')
  })
})

const basis = { type: 'open' as const, question_text: 'Wat vind je?' }

describe('VraagInvoerSchema', () => {
  it('weigert een lege vraagtekst', () => {
    expect(VraagInvoerSchema.safeParse({ ...basis, question_text: '   ' }).success).toBe(false)
  })

  it('meerkeuze en rangschikken: minstens twee unieke, niet-lege opties', () => {
    for (const type of ['multiple_choice', 'ranking'] as const) {
      expect(VraagInvoerSchema.safeParse({ ...basis, type, options: [] }).success).toBe(false)
      expect(VraagInvoerSchema.safeParse({ ...basis, type, options: ['A'] }).success).toBe(false)
      expect(VraagInvoerSchema.safeParse({ ...basis, type, options: ['A', ''] }).success).toBe(false)
      expect(VraagInvoerSchema.safeParse({ ...basis, type, options: ['A', 'a'] }).success).toBe(false)
      expect(VraagInvoerSchema.safeParse({ ...basis, type, options: ['A', 'B'] }).success).toBe(true)
    }
  })

  it('"Anders, namelijk" is geen gewone optie', () => {
    expect(VraagInvoerSchema.safeParse({ ...basis, type: 'multiple_choice', options: ['A', 'anders, namelijk'] }).success).toBe(false)
  })

  it('rangschikken: maximaal tien opties', () => {
    const elf = Array.from({ length: 11 }, (_, i) => `Optie ${i}`)
    expect(VraagInvoerSchema.safeParse({ ...basis, type: 'ranking', options: elf }).success).toBe(false)
    expect(VraagInvoerSchema.safeParse({ ...basis, type: 'multiple_choice', options: elf }).success).toBe(true)
  })

  it('schaal: alleen geldige bereiken', () => {
    expect(VraagInvoerSchema.safeParse({ ...basis, type: 'scale', scale_min: 0, scale_max: 10 }).success).toBe(true)
    expect(VraagInvoerSchema.safeParse({ ...basis, type: 'scale', scale_min: 1, scale_max: 5 }).success).toBe(true)
    expect(VraagInvoerSchema.safeParse({ ...basis, type: 'scale', scale_min: 2, scale_max: 10 }).success).toBe(false)
    expect(VraagInvoerSchema.safeParse({ ...basis, type: 'scale', scale_min: 1, scale_max: 11 }).success).toBe(false)
    expect(VraagInvoerSchema.safeParse({ ...basis, type: 'scale', scale_min: 1, scale_max: 1 }).success).toBe(false)
  })

  it('weigert een onbekend type', () => {
    expect(VraagInvoerSchema.safeParse({ ...basis, type: 'slider' }).success).toBe(false)
  })
})

describe('vragenlijst-schema’s', () => {
  it('aanmaken vereist titel en minstens één vraag', () => {
    expect(VragenlijstAanmaakSchema.safeParse({ title: '', questions: [basis] }).success).toBe(false)
    expect(VragenlijstAanmaakSchema.safeParse({ title: 'T', questions: [] }).success).toBe(false)
    expect(VragenlijstAanmaakSchema.safeParse({ title: 'T', questions: [basis] }).success).toBe(true)
  })

  it('wijzigen mag alleen de actief-schakelaar dragen', () => {
    expect(VragenlijstWijzigSchema.safeParse({ is_active: true }).success).toBe(true)
  })
})

describe('vraagNaarRij', () => {
  it('ruimt velden op die niet bij het type horen', () => {
    const rij = vraagNaarRij(
      { type: 'open', question_text: 'Q', options: ['A', 'B'], scale_min: 0, scale_max: 5, is_multi_select: true, allow_other: true },
      3,
    )
    expect(rij).toMatchObject({ sort_order: 3, options: null, scale_min: 1, scale_max: 10, is_multi_select: false, allow_other: false, is_required: true })
  })

  it('bewaart bereik en opties waar ze horen', () => {
    expect(vraagNaarRij({ type: 'scale', question_text: 'Q', scale_min: 0, scale_max: 10 }, 1)).toMatchObject({ scale_min: 0, scale_max: 10 })
    expect(vraagNaarRij({ type: 'ranking', question_text: 'Q', options: ['A', 'B'], is_required: false }, 1)).toMatchObject({ options: ['A', 'B'], is_required: false })
  })
})
