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

describe('duidingModelSchema — het model levert geen kop (G4 is structureel opgelost)', () => {
  it('heeft geen kop-, titel- of URL-veld: wat de lezer ziet is de BRONkop', () => {
    const velden = Object.keys(duidingModelSchema.shape)
    for (const verboden of ['kop', 'titel', 'title', 'headline', 'url', 'bron']) {
      expect(velden, verboden).not.toContain(verboden)
    }
    // En het schema is gesloten: een kop erbij verzinnen wordt geweigerd, niet genegeerd.
    for (const veld of ['kop', 'titel', 'title']) {
      expect(duidingModelSchema.safeParse({ ...GELDIGE_UITVOER, [veld]: 'Een modelkop' }).success, veld).toBe(false)
    }
  })

  it('accepteert een lege samenvatting (B27) maar geen te korte tekst', () => {
    expect(duidingModelSchema.safeParse({ ...GELDIGE_UITVOER, samenvatting: null }).success).toBe(true)
    expect(duidingModelSchema.safeParse({ ...GELDIGE_UITVOER, samenvatting: 'te kort' }).success).toBe(false)
  })
})

describe('duidingV1Schema — het leescontract voor 1B', () => {
  const meta = {
    grondslag: 'fragment',
    grondslagSha256: 'a'.repeat(64),
    tekens: 120,
    model: 'test',
    kopBron: 'bron',
    modeltekst: false,
    poort: { status: 'groen', reden: null },
  }
  const opgeslagen = {
    ...GELDIGE_UITVOER,
    versie: DUIDING_VERSIE,
    grond: { jaar: 'x', heffingsvrij_single: 'y' },
    meta,
  }

  it('accepteert de opgeslagen vorm met versie, grond-record en meta', () => {
    expect(duidingV1Schema.safeParse(opgeslagen).success).toBe(true)
    expect(duidingV1Schema.safeParse({ ...opgeslagen, samenvatting: null }).success).toBe(true)
    expect(duidingV1Schema.safeParse({ ...opgeslagen, versie: DUIDING_VERSIE + 1 }).success).toBe(false)
    expect(duidingV1Schema.safeParse({ ...opgeslagen, meta: { ...meta, dagen: 3 } }).success).toBe(false)
  })

  it('v1-rijen parsen niet meer: de versie-bump duidt ze opnieuw in plaats van ze te vertrouwen', () => {
    expect(duidingV1Schema.safeParse({ ...opgeslagen, versie: 1, meta: { brontekst: 'teaser', tekens: 1, model: 'x' } }).success).toBe(false)
  })

  it('meta is door code gezet: kopBron en modeltekst zijn literals, de hash is hex', () => {
    expect(duidingV1Schema.safeParse({ ...opgeslagen, meta: { ...meta, kopBron: 'model' } }).success).toBe(false)
    expect(duidingV1Schema.safeParse({ ...opgeslagen, meta: { ...meta, modeltekst: true } }).success).toBe(false)
    expect(duidingV1Schema.safeParse({ ...opgeslagen, meta: { ...meta, grondslagSha256: 'kort' } }).success).toBe(false)
    expect(duidingV1Schema.safeParse({ ...opgeslagen, meta: { ...meta, grondslag: 'volledig' } }).success).toBe(false)
    expect(
      duidingV1Schema.safeParse({ ...opgeslagen, meta: { ...meta, poort: { status: 'gedegradeerd', reden: 'g1:ongegrond-getal' } } })
        .success,
    ).toBe(true)
    expect(duidingV1Schema.safeParse({ ...opgeslagen, meta: { ...meta, poort: { status: 'onbekend', reden: null } } }).success).toBe(false)
  })
})
