import { describe, it, expect } from 'vitest'
import { duidingModelSchema, duidingV1Schema, mechanismeSchema, DUIDING_VERSIE } from './duiding-schema'
import { MECHANISME_IDS } from './mechanismen'
import { GELDIGE_UITVOER } from './duiding.fixture'

describe('mechanismeSchema — dekt de catalogus precies', () => {
  it('heeft voor elk mechanisme-id precies één lid, in dezelfde volgorde', () => {
    const soorten = mechanismeSchema.options.map((lid) => lid.shape.soort.value)
    expect(soorten).toEqual([...MECHANISME_IDS])
  })
})

describe('duidingModelSchema — gesloten', () => {
  it('accepteert een geldige uitvoer', () => {
    expect(duidingModelSchema.safeParse(GELDIGE_UITVOER).success).toBe(true)
  })

  it('weigert een onbekend veld op elk niveau', () => {
    expect(duidingModelSchema.safeParse({ ...GELDIGE_UITVOER, rubriek: 'fiscaal' }).success).toBe(false)
    expect(
      duidingModelSchema.safeParse({
        ...GELDIGE_UITVOER,
        mechanisme: { ...GELDIGE_UITVOER.mechanisme, params: { ...GELDIGE_UITVOER.mechanisme!.params, bedrag: 1 } },
      }).success,
    ).toBe(false)
  })

  it('weigert een onbekend mechanisme, een onbekende soort en een onbekend profielveld', () => {
    expect(
      duidingModelSchema.safeParse({ ...GELDIGE_UITVOER, mechanisme: { soort: 'erfbelasting', params: {}, drempel: null } }).success,
    ).toBe(false)
    expect(duidingModelSchema.safeParse({ ...GELDIGE_UITVOER, soort: 'gerucht' }).success).toBe(false)
    expect(
      duidingModelSchema.safeParse({ ...GELDIGE_UITVOER, doelgroep: [{ veld: 'uitgaven', op: 'is', waarden: ['hoog'] }] }).success,
    ).toBe(false)
  })

  it('weigert een drempel als bedrag: drempel is een sleutel-enum', () => {
    expect(
      duidingModelSchema.safeParse({ ...GELDIGE_UITVOER, mechanisme: { ...GELDIGE_UITVOER.mechanisme, drempel: 59357 } }).success,
    ).toBe(false)
  })

  it('weigert een datum die geen ISO-datum is', () => {
    expect(duidingModelSchema.safeParse({ ...GELDIGE_UITVOER, ingangsdatum: '1 januari 2027' }).success).toBe(false)
  })
})

describe('duidingV1Schema — het leescontract voor 1B', () => {
  it('accepteert de opgeslagen vorm met versie, grond-record en meta', () => {
    const opgeslagen = {
      ...GELDIGE_UITVOER,
      versie: DUIDING_VERSIE,
      grond: { jaar: 'x', heffingsvrij_single: 'y' },
      meta: { brontekst: 'teaser', tekens: 120, model: 'test' },
    }
    expect(duidingV1Schema.safeParse(opgeslagen).success).toBe(true)
    expect(duidingV1Schema.safeParse({ ...opgeslagen, versie: 2 }).success).toBe(false)
    expect(duidingV1Schema.safeParse({ ...opgeslagen, meta: { ...opgeslagen.meta, dagen: 3 } }).success).toBe(false)
  })
})
