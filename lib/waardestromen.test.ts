import { describe, it, expect } from 'vitest'
import {
  dominanteStroom,
  parseWaardestromen,
  STANDAARD_WAARDESTROMEN,
  stroomIdVanNaam,
  WaardestromenSchema,
  type ModuleDag,
} from './waardestromen'

/**
 * Waardestromen (ADR 0147, fase 2): standaardindeling, veilige parser, en een
 * dominante stroom die dagen telt (geen kliks), een minimum eist en bij
 * gelijkspel niemand kiest.
 */

function dagen(module: string, n: number, start = 1): ModuleDag[] {
  return Array.from({ length: n }, (_, i) => ({ day: `2026-09-${String(start + i).padStart(2, '0')}`, module }))
}

describe('parseWaardestromen', () => {
  it('ontbrekend, kapot of ongeldig → de standaardindeling', () => {
    expect(parseWaardestromen(null)).toEqual(STANDAARD_WAARDESTROMEN)
    expect(parseWaardestromen('{kapot')).toEqual(STANDAARD_WAARDESTROMEN)
    expect(parseWaardestromen({ stromen: [] })).toEqual(STANDAARD_WAARDESTROMEN)
    expect(parseWaardestromen({ stromen: [{ id: 'x', naam: 'X', modules: ['beheer'] }] })).toEqual(STANDAARD_WAARDESTROMEN)
  })

  it('leest een JSON-string zoals app_settings.value die draagt', () => {
    const cfg = { stromen: [{ id: 'kern', naam: 'Kern', modules: ['overzicht'] }] }
    expect(parseWaardestromen(JSON.stringify(cfg))).toEqual(cfg)
  })

  it('de standaard is Vermogen · Budget · Toekomst · Grip · Fin', () => {
    expect(STANDAARD_WAARDESTROMEN.stromen.map((s) => s.naam)).toEqual(['Vermogen', 'Budget', 'Toekomst', 'Grip', 'Fin'])
    expect(WaardestromenSchema.safeParse(STANDAARD_WAARDESTROMEN).success).toBe(true)
  })

  it('weigert dubbele ids en meer dan zes stromen', () => {
    const s = { id: 'a', naam: 'A', modules: ['fin'] }
    expect(WaardestromenSchema.safeParse({ stromen: [s, s] }).success).toBe(false)
    expect(
      WaardestromenSchema.safeParse({ stromen: Array.from({ length: 7 }, (_, i) => ({ ...s, id: `s${i}` })) }).success,
    ).toBe(false)
  })
})

describe('stroomIdVanNaam', () => {
  it('maakt een stabiele slug en ontwijkt bestaande ids', () => {
    expect(stroomIdVanNaam('Budget & sparen')).toBe('budget-sparen')
    expect(stroomIdVanNaam('Überzicht')).toBe('uberzicht')
    expect(stroomIdVanNaam('Fin', ['fin'])).toBe('fin-2')
    expect(stroomIdVanNaam('!!!')).toBe('stroom')
  })
})

describe('dominanteStroom', () => {
  it('telt VERSCHILLENDE dagen per stroom, over al haar modules', () => {
    // Vermogen: overzicht op 1-3 en bezittingen op 2-5 → dagen 1..5 = 5.
    const r = dominanteStroom([...dagen('overzicht', 3), ...dagen('bezittingen', 4, 2), ...dagen('toekomst', 2)], STANDAARD_WAARDESTROMEN)
    expect(r.dagenPerStroom).toEqual({ vermogen: 5, budget: 0, toekomst: 2, grip: 0, fin: 0 })
    expect(r.stroom).toBe('vermogen')
  })

  it('dezelfde dag twee keer telt één keer', () => {
    const r = dominanteStroom([...dagen('toekomst', 3), ...dagen('toekomst', 3)], STANDAARD_WAARDESTROMEN)
    expect(r.dagenPerStroom.toekomst).toBe(3)
    expect(r.stroom).toBe('toekomst')
  })

  it('onder het minimum (3 dagen) → geen dominante stroom', () => {
    expect(dominanteStroom(dagen('budget', 2), STANDAARD_WAARDESTROMEN).stroom).toBeNull()
  })

  it('gelijkspel om de eerste plaats → geen dominante stroom', () => {
    expect(dominanteStroom([...dagen('budget', 4), ...dagen('fin', 4)], STANDAARD_WAARDESTROMEN).stroom).toBeNull()
  })

  it('modules buiten elke stroom (mijn) tellen nergens mee', () => {
    const r = dominanteStroom(dagen('mijn', 10), STANDAARD_WAARDESTROMEN)
    expect(r.stroom).toBeNull()
    expect(Object.values(r.dagenPerStroom).every((n) => n === 0)).toBe(true)
  })

  it('geen rijen → geen stroom, geen throw', () => {
    expect(dominanteStroom([], STANDAARD_WAARDESTROMEN)).toEqual({
      stroom: null,
      dagenPerStroom: { vermogen: 0, budget: 0, toekomst: 0, grip: 0, fin: 0 },
    })
  })
})
