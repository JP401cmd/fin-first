import { describe, it, expect } from 'vitest'
import { MECHANISMEN, MECHANISME_IDS } from './mechanismen'
import { DOELGROEP_SLEUTEL_LIJST } from './profiel-velden'

describe('mechanismecatalogus v1', () => {
  it('telt twaalf mechanismen, elk met zijn eigen id', () => {
    expect(MECHANISME_IDS).toHaveLength(12)
    for (const id of MECHANISME_IDS) expect(MECHANISMEN[id].id).toBe(id)
  })

  it('leest uitsluitend bekende profielsleutels', () => {
    for (const id of MECHANISME_IDS) {
      for (const sleutel of MECHANISMEN[id].leest) {
        expect(DOELGROEP_SLEUTEL_LIJST as readonly string[]).toContain(sleutel)
      }
    }
  })

  it('rekent ⇔ vorm direct of gevoeligheid; relevant rekent nooit', () => {
    for (const id of MECHANISME_IDS) {
      const def = MECHANISMEN[id]
      expect(def.rekent).toBe(def.vorm !== 'relevant')
    }
  })

  it('elke numerieke param in het schema heeft eenheid en plausibiliteit — en andersom', () => {
    for (const id of MECHANISME_IDS) {
      const def = MECHANISMEN[id]
      const shape = (def.params as unknown as { shape: Record<string, { def?: { type?: string; innerType?: { def?: { type?: string } } } }> }).shape
      for (const [naam, veld] of Object.entries(shape)) {
        const type = veld.def?.type
        const isNummer = type === 'number' || (type === 'nullable' && veld.def?.innerType?.def?.type === 'number')
        if (isNummer) {
          expect(def.numeriek[naam], `${id}.${naam} heeft geen ParamRegel`).toBeDefined()
          expect(def.numeriek[naam].min).toBeLessThanOrEqual(def.numeriek[naam].max)
        }
      }
      for (const naam of Object.keys(def.numeriek)) {
        expect(shape[naam], `${id}.numeriek.${naam} staat niet in het params-schema`).toBeDefined()
      }
    }
  })

  it('B2: inflatie-cijfer en beursbeweging dragen geen enkel getal', () => {
    for (const id of ['inflatie-cijfer', 'beursbeweging'] as const) {
      expect(Object.keys(MECHANISMEN[id].numeriek)).toHaveLength(0)
      expect(MECHANISMEN[id].params.safeParse({}).success).toBe(true)
      expect(MECHANISMEN[id].params.safeParse({ bedrag: 100 }).success).toBe(false)
    }
  })

  it('params-schema is gesloten: een onbekende param wordt geweigerd', () => {
    expect(MECHANISMEN['studieschuld-rente'].params.safeParse({ jaar: 2027, rente_pct: 2.5 }).success).toBe(true)
    expect(MECHANISMEN['studieschuld-rente'].params.safeParse({ jaar: 2027, rente_pct: 2.5, bedrag: 12 }).success).toBe(false)
  })
})
