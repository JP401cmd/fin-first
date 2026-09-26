/**
 * Grendel op de allowlists van het status-/minimaliseer-schrijfpad.
 *
 * WAAROM: beide normalizers checkten met `key in ROUTE_FAMILY`. De `in`-operator
 * volgt de PROTOTYPE-KETEN, dus 'toString', 'constructor' en 'hasOwnProperty'
 * passeerden een allowlist die op een object-literal staat — en zouden als
 * junk-sleutel in de eigen JSONB-pref landen (`profiles.status_banner_minimized`).
 * Impact was laag (own-row, geen cross-user-pollution), maar een allowlist die
 * niet-toegestane sleutels doorlaat is per definitie kapot. Deze test pint de
 * `Object.prototype.hasOwnProperty.call`-vorm vast; zonder die fix wordt hij rood.
 *
 * De API-route vertaalt `null` uit deze normalizers rechtstreeks naar een
 * 400 ('Onbekende route'), dus dit is de bewijslast voor "prototype-sleutel → 400".
 */

import { describe, it, expect } from 'vitest'
import {
  normalizePageStatusRoute,
  normalizeMinimizeKey,
  EXTRA_MINIMIZE_KEYS,
  NUMERIC_MINIMIZE_NARROWERS,
  STOPLICHT_MINIMIZE_KEYS,
  ROUTE_FAMILY,
  narrowMinimizeValue,
} from '@/lib/page-status/compute'
import { KATERN_ROUTE } from '@/lib/horizon/katern-meldingen'
import { DEFICIT_NOTICE_MINIMIZE_KEY } from '@/lib/horizon/deficit-loan-minimize'
import { STALE_TX_NOTICE_MINIMIZE_KEY } from '@/lib/transaction-staleness-minimize'
import { AOW_NOTICE_MINIMIZE_KEY } from '@/lib/horizon/aow-notice-minimize'
import { EINDSITUATIE_NOTICE_MINIMIZE_KEY } from '@/lib/horizon/eindsituatie-notice-minimize'

/** Sleutels die via Object.prototype op élk object-literal "bestaan". */
const PROTOTYPE_SLEUTELS = [
  'toString',
  'constructor',
  'hasOwnProperty',
  'valueOf',
  '__proto__',
  'isPrototypeOf',
  'propertyIsEnumerable',
]

describe('normalizePageStatusRoute — allowlist is echt een allowlist', () => {
  it('laat een geldige /overzicht-route door (met en zonder trailing slash)', () => {
    expect(normalizePageStatusRoute('/overzicht/bezittingen')).toBe('/overzicht/bezittingen')
    expect(normalizePageStatusRoute('/overzicht/bezittingen/')).toBe('/overzicht/bezittingen')
  })

  it('weigert prototype-sleutels (zouden met `in` zijn doorgeglipt) → 400', () => {
    for (const sleutel of PROTOTYPE_SLEUTELS) {
      expect(normalizePageStatusRoute(sleutel), `prototype-sleutel "${sleutel}"`).toBeNull()
    }
  })

  it('weigert onbekende en lege routes', () => {
    expect(normalizePageStatusRoute('/onzin')).toBeNull()
    expect(normalizePageStatusRoute('')).toBeNull()
    expect(normalizePageStatusRoute(null)).toBeNull()
  })

  it('laat de pref-only sleutels NIET door (de GET-scope groeit bewust niet mee)', () => {
    expect(normalizePageStatusRoute(DEFICIT_NOTICE_MINIMIZE_KEY)).toBeNull()
    expect(normalizePageStatusRoute(STALE_TX_NOTICE_MINIMIZE_KEY)).toBeNull()
  })
})

describe('normalizeMinimizeKey — schrijf-allowlist', () => {
  it('laat de /overzicht-routes door', () => {
    expect(normalizeMinimizeKey('/overzicht/budget')).toBe('/overzicht/budget')
  })

  it('laat de extra pref-only sleutel door', () => {
    expect(EXTRA_MINIMIZE_KEYS).toContain(DEFICIT_NOTICE_MINIMIZE_KEY)
    expect(normalizeMinimizeKey(DEFICIT_NOTICE_MINIMIZE_KEY)).toBe(DEFICIT_NOTICE_MINIMIZE_KEY)
    expect(normalizeMinimizeKey(`${DEFICIT_NOTICE_MINIMIZE_KEY}/`)).toBe(DEFICIT_NOTICE_MINIMIZE_KEY)
  })

  it('laat de "gegevens verouderd"-sleutel door (B-015)', () => {
    expect(EXTRA_MINIMIZE_KEYS).toContain(STALE_TX_NOTICE_MINIMIZE_KEY)
    expect(normalizeMinimizeKey(STALE_TX_NOTICE_MINIMIZE_KEY)).toBe(
      STALE_TX_NOTICE_MINIMIZE_KEY,
    )
    expect(normalizeMinimizeKey(`${STALE_TX_NOTICE_MINIMIZE_KEY}/`)).toBe(
      STALE_TX_NOTICE_MINIMIZE_KEY,
    )
  })

  it('laat de "AOW ontbreekt"-sleutel door (TPR-04) — en de GET-scope groeit niet mee', () => {
    expect(EXTRA_MINIMIZE_KEYS).toContain(AOW_NOTICE_MINIMIZE_KEY)
    expect(normalizeMinimizeKey(AOW_NOTICE_MINIMIZE_KEY)).toBe(AOW_NOTICE_MINIMIZE_KEY)
    expect(normalizeMinimizeKey(`${AOW_NOTICE_MINIMIZE_KEY}/`)).toBe(AOW_NOTICE_MINIMIZE_KEY)
    expect(normalizePageStatusRoute(AOW_NOTICE_MINIMIZE_KEY)).toBeNull()
  })

  it('laat de eindsituatie-sleutel door (plan 17 sep, D) — en de GET-scope groeit niet mee', () => {
    expect(EXTRA_MINIMIZE_KEYS).toContain(EINDSITUATIE_NOTICE_MINIMIZE_KEY)
    expect(normalizeMinimizeKey(EINDSITUATIE_NOTICE_MINIMIZE_KEY)).toBe(EINDSITUATIE_NOTICE_MINIMIZE_KEY)
    expect(normalizePageStatusRoute(EINDSITUATIE_NOTICE_MINIMIZE_KEY)).toBeNull()
  })

  it('weigert prototype-sleutels → 400', () => {
    for (const sleutel of PROTOTYPE_SLEUTELS) {
      expect(normalizeMinimizeKey(sleutel), `prototype-sleutel "${sleutel}"`).toBeNull()
    }
  })

  it('elke pref-only sleutel heeft een numerieke narrower, en omgekeerd', () => {
    // De twee lijsten MOETEN elkaar dekken. Een extra sleutel zonder narrower
    // valt in de PUT stil terug op de stoplicht-enum en accepteert dan
    // 'warn'/'bad'/'info' waar een getal hoort — geen lek (de lezer verwerpt de
    // string en toont de melding), wél een stille semantische mismatch die pas
    // opvalt als iemand zich afvraagt waarom minimaliseren niets doet.
    expect([...NUMERIC_MINIMIZE_NARROWERS.keys()].sort()).toEqual(
      [...EXTRA_MINIMIZE_KEYS].sort(),
    )
    for (const sleutel of EXTRA_MINIMIZE_KEYS) {
      const narrower = NUMERIC_MINIMIZE_NARROWERS.get(sleutel)
      expect(narrower, `narrower voor "${sleutel}"`).toBeDefined()
      // Elke narrower weigert de stoplicht-strings — dat is het punt van de
      // scheiding: dezelfde JSONB-map draagt beide soorten waarden.
      expect(narrower!('warn')).toBeNull()
      expect(narrower!(Number.NaN)).toBeNull()
      expect(narrower!(-1)).toBeNull()
    }
  })

  it('weigert onbekende sleutels', () => {
    expect(normalizeMinimizeKey('/toekomst/verzonnen')).toBeNull()
    expect(normalizeMinimizeKey('/toekomst/doelen/x')).toBeNull()
    expect(normalizeMinimizeKey('/toekomst/instellingen?regel=aow')).toBeNull()
    expect(normalizeMinimizeKey('/toekomst//')).toBeNull()
    expect(normalizeMinimizeKey('/TOEKOMST')).toBeNull()
    expect(normalizeMinimizeKey('toekomst')).toBeNull()
    expect(normalizeMinimizeKey(null)).toBeNull()
  })
})

describe('STOPLICHT_MINIMIZE_KEYS — de drie katern-routes van /toekomst (ADR 0179 D6)', () => {
  it('is precies de set katern-routes uit KATERN_ROUTE', () => {
    expect([...STOPLICHT_MINIMIZE_KEYS].sort()).toEqual(
      ['/toekomst', '/toekomst/doelen', '/toekomst/instellingen'],
    )
    expect([...STOPLICHT_MINIMIZE_KEYS].sort()).toEqual(
      [...Object.values(KATERN_ROUTE)].sort(),
    )
  })

  it('laat elke katern-route door in de schrijf-allowlist (met en zonder trailing slash)', () => {
    for (const sleutel of STOPLICHT_MINIMIZE_KEYS) {
      expect(normalizeMinimizeKey(sleutel)).toBe(sleutel)
      expect(normalizeMinimizeKey(`${sleutel}/`)).toBe(sleutel)
    }
  })

  it('de GET-scope groeit niet mee: geen ROUTE_FAMILY-entry, geen status', () => {
    for (const sleutel of STOPLICHT_MINIMIZE_KEYS) {
      expect(normalizePageStatusRoute(sleutel), sleutel).toBeNull()
      expect(Object.prototype.hasOwnProperty.call(ROUTE_FAMILY, sleutel)).toBe(false)
    }
  })

  it('staat los van de numerieke sleutels (geen narrower, niet in EXTRA_MINIMIZE_KEYS)', () => {
    for (const sleutel of STOPLICHT_MINIMIZE_KEYS) {
      expect(EXTRA_MINIMIZE_KEYS).not.toContain(sleutel)
      expect(NUMERIC_MINIMIZE_NARROWERS.has(sleutel)).toBe(false)
    }
  })

  it('smalt naar een stoplicht-niveau en weigert al het andere', () => {
    for (const sleutel of STOPLICHT_MINIMIZE_KEYS) {
      expect(narrowMinimizeValue(sleutel, 'warn')).toBe('warn')
      expect(narrowMinimizeValue(sleutel, 'bad')).toBe('bad')
      expect(narrowMinimizeValue(sleutel, 'info')).toBe('info')
      for (const ongeldig of ['good', 'neutral', 'WARN', '', 1, 0, true, {}, [], undefined]) {
        expect(narrowMinimizeValue(sleutel, ongeldig), String(ongeldig)).toBeNull()
      }
    }
  })

  it('numerieke sleutels blijven hun eigen narrower houden', () => {
    expect(narrowMinimizeValue(DEFICIT_NOTICE_MINIMIZE_KEY, 'warn')).toBeNull()
    expect(narrowMinimizeValue('/overzicht/budget', 'warn')).toBe('warn')
    expect(narrowMinimizeValue('/overzicht/budget', 5)).toBeNull()
  })
})
