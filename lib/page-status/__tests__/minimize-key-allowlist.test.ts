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
} from '@/lib/page-status/compute'
import { DEFICIT_NOTICE_MINIMIZE_KEY } from '@/lib/horizon/deficit-loan-minimize'

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

  it('laat de pref-only sleutel NIET door (de GET-scope groeit bewust niet mee)', () => {
    expect(normalizePageStatusRoute(DEFICIT_NOTICE_MINIMIZE_KEY)).toBeNull()
  })
})

describe('normalizeMinimizeKey — schrijf-allowlist', () => {
  it('laat de /overzicht-routes door', () => {
    expect(normalizeMinimizeKey('/overzicht/cashflow/budget')).toBe('/overzicht/cashflow/budget')
  })

  it('laat de extra pref-only sleutel door', () => {
    expect(EXTRA_MINIMIZE_KEYS).toContain(DEFICIT_NOTICE_MINIMIZE_KEY)
    expect(normalizeMinimizeKey(DEFICIT_NOTICE_MINIMIZE_KEY)).toBe(DEFICIT_NOTICE_MINIMIZE_KEY)
    expect(normalizeMinimizeKey(`${DEFICIT_NOTICE_MINIMIZE_KEY}/`)).toBe(DEFICIT_NOTICE_MINIMIZE_KEY)
  })

  it('weigert prototype-sleutels → 400', () => {
    for (const sleutel of PROTOTYPE_SLEUTELS) {
      expect(normalizeMinimizeKey(sleutel), `prototype-sleutel "${sleutel}"`).toBeNull()
    }
  })

  it('weigert onbekende sleutels', () => {
    expect(normalizeMinimizeKey('/toekomst')).toBeNull()
    expect(normalizeMinimizeKey('/toekomst/verzonnen')).toBeNull()
    expect(normalizeMinimizeKey(null)).toBeNull()
  })
})
