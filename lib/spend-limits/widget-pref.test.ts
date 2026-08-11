/**
 * Tests voor de ENE BRON van "staat de grenzenpot-tegel aan?".
 *
 * Dit bestand claimt in zijn kop dat het de enige plek is waar die regel woont —
 * en het is tegelijk de risicovolste functie van de grenzenpot-uitbreiding: hij
 * herschrijft de complete `profiles.widget_prefs`-kolom. Een docstring wordt niet
 * rood; deze tests wel.
 *
 * De belangrijkste is de PARITEIT tussen de twee schrijvers: een teruggezette
 * tegel moet op exact dezelfde plek en maat landen als een vers geïnjecteerde.
 * Die belofte werd tot nu toe alleen gedragen door twee losse constanten die
 * toevallig door beide paden werden gelezen.
 */

import { describe, it, expect } from 'vitest'
import { DEFAULT_WIDGET_PREFS, type WidgetPref } from '@/lib/widget-catalog'
import {
  SPEND_LIMIT_WIDGET_ORDER_OFFSET,
  SPEND_LIMIT_WIDGET_SIZE,
  isSpendLimitWidgetEnabled,
  lowestWidgetOrder,
  newSpendLimitWidgetPref,
  newSpendLimitWidgetPrefs,
  setSpendLimitWidgetEnabled,
  spendLimitWidgetId,
} from './widget-pref'

const POT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const ID = spendLimitWidgetId(POT)

function pref(id: string, order: number, enabled = true): WidgetPref {
  return { id, enabled, size: 'quarter', order }
}

describe('isSpendLimitWidgetEnabled — de opgeslagen keuze wint van de injectie', () => {
  it('zonder pref volgt de tegel de pauzestand', () => {
    expect(isSpendLimitWidgetEnabled([], POT, true)).toBe(true)
    expect(isSpendLimitWidgetEnabled([], POT, false)).toBe(false)
    expect(isSpendLimitWidgetEnabled(null, POT, true)).toBe(true)
    expect(isSpendLimitWidgetEnabled(undefined, POT, false)).toBe(false)
  })

  it('mét pref wint die altijd — óók tegen de pauzestand in', () => {
    // Precies de reden dat dit één functie is: een bewuste "widget uit" moet een
    // pauze/hervat-cyclus overleven, en een teruggezette tegel een pauze.
    expect(isSpendLimitWidgetEnabled([pref(ID, 0, false)], POT, true)).toBe(false)
    expect(isSpendLimitWidgetEnabled([pref(ID, 0, true)], POT, false)).toBe(true)
  })

  it('kijkt naar de juiste pot en niet naar een andere tegel', () => {
    const anderePot = [pref(spendLimitWidgetId('ffffffff-0000-0000-0000-000000000000'), 0, false)]
    expect(isSpendLimitWidgetEnabled(anderePot, POT, true)).toBe(true)
  })
})

describe('setSpendLimitWidgetEnabled', () => {
  it('wijzigt alleen `enabled` van de eigen tegel en laat de rest ongemoeid', () => {
    const before = [pref('netto_vermogen', 0), pref(ID, -300), pref('acties', 1)]
    const after = setSpendLimitWidgetEnabled(before, POT, false)

    expect(after).toHaveLength(3)
    expect(after.find(w => w.id === ID)).toEqual({ ...pref(ID, -300), enabled: false })
    // De buren houden hun maat, volgorde én aan/uit-stand.
    expect(after.filter(w => w.id !== ID)).toEqual([pref('netto_vermogen', 0), pref('acties', 1)])
  })

  it('schrijft óók bij UITzetten een pref wanneer die nog ontbrak', () => {
    // Zonder die rij zou de loader de tegel bij de volgende bundel gewoon
    // opnieuw injecteren en was "weg" niet weg.
    const after = setSpendLimitWidgetEnabled([pref('netto_vermogen', 0)], POT, false)
    expect(after.find(w => w.id === ID)?.enabled).toBe(false)
  })

  it('zaait de catalogus-standaard bij een lege kolom in plaats van hem te vervangen', () => {
    const after = setSpendLimitWidgetEnabled(null, POT, true)

    // Alle standaard-widgets staan er nog, plus de nieuwe tegel.
    expect(after).toHaveLength(DEFAULT_WIDGET_PREFS.widgets.length + 1)
    for (const d of DEFAULT_WIDGET_PREFS.widgets) {
      expect(after.find(w => w.id === d.id)).toEqual(d)
    }
    expect(after.find(w => w.id === ID)?.enabled).toBe(true)
  })

  it('muteert de gedeelde DEFAULT_WIDGET_PREFS-constante NOOIT', () => {
    // De bron kan een module-brede constante zijn; muteren zou hem voor elke
    // volgende lezer in het proces stilzwijgend veranderen.
    const snapshot = JSON.stringify(DEFAULT_WIDGET_PREFS.widgets)
    const after = setSpendLimitWidgetEnabled(null, POT, true)
    after[0].enabled = !after[0].enabled
    expect(JSON.stringify(DEFAULT_WIDGET_PREFS.widgets)).toBe(snapshot)
  })

  it('PARITEIT: een teruggezette tegel landt op dezelfde plek en maat als een verse', () => {
    // De eigenlijke belofte van dit bestand. Loopt dit uiteen, dan springt een
    // teruggezette tegel naar een andere plek dan waar hij vandaan kwam.
    const bestaand = [pref('netto_vermogen', 0), pref('acties', 5)]
    const lowest = lowestWidgetOrder(bestaand)

    const viaInjectie = newSpendLimitWidgetPrefs([{ id: POT, isActive: true }], new Set(), lowest)
    const viaToggle = setSpendLimitWidgetEnabled(bestaand, POT, true).find(w => w.id === ID)

    expect(viaInjectie).toHaveLength(1)
    expect(viaToggle).toEqual(viaInjectie[0])
    expect(viaToggle?.size).toBe(SPEND_LIMIT_WIDGET_SIZE)
    expect(viaToggle?.order).toBe(lowest + SPEND_LIMIT_WIDGET_ORDER_OFFSET)
  })
})

describe('newSpendLimitWidgetPrefs — de injectieregel', () => {
  it('slaat potten met een bestaande pref over, ook een uitgezette', () => {
    const saved = new Set([ID])
    expect(newSpendLimitWidgetPrefs([{ id: POT, isActive: true }], saved, 0)).toEqual([])
  })

  it('injecteert niets voor een gepauzeerde pot', () => {
    expect(newSpendLimitWidgetPrefs([{ id: POT, isActive: false }], new Set(), 0)).toEqual([])
  })

  it('geeft meerdere verse potten oplopende orders vanaf dezelfde basis', () => {
    const b = 'bbbbbbbb-0000-0000-0000-000000000000'
    const out = newSpendLimitWidgetPrefs(
      [{ id: POT, isActive: true }, { id: b, isActive: true }],
      new Set(),
      0,
    )
    expect(out.map(w => w.order)).toEqual([
      SPEND_LIMIT_WIDGET_ORDER_OFFSET,
      SPEND_LIMIT_WIDGET_ORDER_OFFSET + 1,
    ])
  })
})

describe('lowestWidgetOrder', () => {
  it('klemt op 0 zodat een dashboard met alleen positieve orders bovenaan begint', () => {
    expect(lowestWidgetOrder([pref('a', 3), pref('b', 7)])).toBe(0)
    expect(lowestWidgetOrder([])).toBe(0)
  })

  it('pakt de laagste negatieve order als die er is', () => {
    expect(lowestWidgetOrder([pref('a', 3), pref('b', -120)])).toBe(-120)
  })
})

describe('newSpendLimitWidgetPref', () => {
  it('draagt de canonieke maat en de offset t.o.v. de laagste order', () => {
    expect(newSpendLimitWidgetPref(POT, -50, 2)).toEqual({
      id: ID,
      enabled: true,
      size: SPEND_LIMIT_WIDGET_SIZE,
      order: -50 + SPEND_LIMIT_WIDGET_ORDER_OFFSET + 2,
    })
  })
})
