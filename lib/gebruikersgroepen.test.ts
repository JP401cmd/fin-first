import { describe, it, expect } from 'vitest'
import { GroepInvoerSchema, GroepLedenSchema, groepMatch, parseGroepRegels, vraagtStromen } from './gebruikersgroepen'
import type { GebruikerContext } from './questionnaires/verspreiding'

/**
 * Gebruikersgroepen (ADR 0147, fase 3): statisch = lidmaatschap, dynamisch =
 * regels (AND), OR over groepen, en alles wat niet klopt matcht nooit.
 */

const NU = new Date('2026-09-15T10:00:00Z')
const G1 = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e'
const G2 = '2b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e'
const G3 = '3b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e'

const ctx: GebruikerContext = {
  registratie: new Date(NU.getTime() - 40 * 86_400_000),
  actieveDagen30: 8,
  laatstActief: NU,
  dominanteStroom: 'toekomst',
  nu: NU,
}

describe('GroepInvoerSchema', () => {
  it('dynamisch vereist minstens één regel', () => {
    expect(GroepInvoerSchema.safeParse({ naam: 'Actief', soort: 'dynamisch' }).success).toBe(false)
    expect(
      GroepInvoerSchema.safeParse({ naam: 'Actief', soort: 'dynamisch', regels: [{ soort: 'actieve_dagen_30', min: 5 }] }).success,
    ).toBe(true)
  })

  it('statisch mag geen regels dragen', () => {
    expect(GroepInvoerSchema.safeParse({ naam: 'Beta', soort: 'statisch', regels: [{ soort: 'actieve_dagen_30', min: 5 }] }).success).toBe(false)
    const ok = GroepInvoerSchema.parse({ naam: '  Beta  ', soort: 'statisch' })
    expect(ok).toEqual({ naam: 'Beta', omschrijving: null, soort: 'statisch', regels: [] })
  })

  it('naam is verplicht en begrensd', () => {
    expect(GroepInvoerSchema.safeParse({ naam: '   ', soort: 'statisch' }).success).toBe(false)
    expect(GroepInvoerSchema.safeParse({ naam: 'x'.repeat(101), soort: 'statisch' }).success).toBe(false)
  })

  it('ledenlijst accepteert alleen uuids', () => {
    expect(GroepLedenSchema.safeParse({ user_ids: [G1] }).success).toBe(true)
    expect(GroepLedenSchema.safeParse({ user_ids: ['nee'] }).success).toBe(false)
  })
})

describe('groepMatch', () => {
  it('statisch lidmaatschap matcht', () => {
    expect(groepMatch([G1], new Set([G1]), [], ctx)).toEqual({ match: true, groepIds: [G1] })
  })

  it('dynamische groep matcht alleen als ALLE regels kloppen', () => {
    const dyn = [{ id: G2, regels: [{ soort: 'actieve_dagen_30' as const, min: 5 }, { soort: 'dominante_stroom' as const, stroom: 'toekomst' }] }]
    expect(groepMatch([G2], new Set(), dyn, ctx).match).toBe(true)
    const streng = [{ id: G2, regels: [{ soort: 'actieve_dagen_30' as const, min: 10 }] }]
    expect(groepMatch([G2], new Set(), streng, ctx).match).toBe(false)
  })

  it('OR over groepen; groepIds noemt alleen de gematchte', () => {
    const dyn = [{ id: G2, regels: [{ soort: 'actieve_dagen_30' as const, min: 99 }] }]
    expect(groepMatch([G1, G2, G3], new Set([G3]), dyn, ctx)).toEqual({ match: true, groepIds: [G3] })
  })

  it('onbekende groep of dynamische groep zonder regels matcht nooit', () => {
    expect(groepMatch([G1], new Set(), [], ctx).match).toBe(false)
    expect(groepMatch([G2], new Set(), [{ id: G2, regels: [] }], ctx).match).toBe(false)
  })

  it('lidmaatschap van een groep die de lijst NIET noemt telt niet', () => {
    expect(groepMatch([G1], new Set([G2]), [], ctx).match).toBe(false)
  })
})

describe('hulpjes', () => {
  it('parseGroepRegels: ongeldig → geen regels', () => {
    expect(parseGroepRegels(null)).toEqual([])
    expect(parseGroepRegels([{ soort: 'onbekend' }])).toEqual([])
    expect(parseGroepRegels([{ soort: 'actieve_dagen_30', min: 3 }])).toEqual([{ soort: 'actieve_dagen_30', min: 3 }])
  })

  it('vraagtStromen', () => {
    expect(vraagtStromen([{ soort: 'actieve_dagen_30', min: 3 }])).toBe(false)
    expect(vraagtStromen([{ soort: 'dominante_stroom', stroom: 'fin' }])).toBe(true)
  })
})
