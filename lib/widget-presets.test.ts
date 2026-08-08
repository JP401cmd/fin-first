import { describe, it, expect } from 'vitest'
import {
  WIDGET_PRESETS,
  isKnownPresetWidgetId,
  sanitizePresetWidgets,
  sanitizeStoredPresets,
  type WidgetPreset,
} from './widget-presets'
import { WIDGET_CATALOG, type WidgetPref } from './widget-catalog'

// ── Regressie WF-BEHEER-17-bug2 ────────────────────────────────────
//
// De beheerder-override in app_settings (key 'widget_presets') beweegt niet
// mee wanneer een widget uit WIDGET_CATALOG verdwijnt. De ids 'passief_inkomen'
// (verwijderd apr 2026) en 'jouw_pad' (verwijderd jul 2026) bleven daardoor in
// vier opgeslagen presets staan. Gevolg: /beheer/widget-presets toonde de kale
// interne id zonder foutindicatie, en widget-renderer liet het slot stilzwijgend
// vallen — een gebruiker kreeg minder widgets dan het getoonde aantal.

const pref = (id: string, order: number): WidgetPref => ({
  id,
  enabled: true,
  size: 'quarter',
  order,
})

describe('isKnownPresetWidgetId', () => {
  it('accepteert ids uit de catalogus', () => {
    expect(isKnownPresetWidgetId(WIDGET_CATALOG[0].id)).toBe(true)
  })

  it('accepteert dynamische favoriet-ids die bewust geen catalogus-entry hebben', () => {
    expect(isKnownPresetWidgetId('budget_fav:9f1c-boodschappen')).toBe(true)
    expect(isKnownPresetWidgetId('holding_fav:ae42-asml')).toBe(true)
  })

  it('accepteert dynamische grenzenpot-ids', () => {
    // Zonder deze prefix saneert de preset-LEZER opgeslagen presets met
    // pot-widgets stil weg — de gebruiker krijgt dan minder widgets dan de
    // preset belooft, zonder foutindicatie.
    expect(isKnownPresetWidgetId('spend_limit:7c2a-tankstations')).toBe(true)
  })

  it('wijst de verwijderde widget-ids uit deze bug af', () => {
    expect(isKnownPresetWidgetId('passief_inkomen')).toBe(false)
    expect(isKnownPresetWidgetId('jouw_pad')).toBe(false)
  })

  it('wijst een leeg id af', () => {
    expect(isKnownPresetWidgetId('')).toBe(false)
  })
})

describe('sanitizePresetWidgets', () => {
  it('verwijdert een wees-id en hernummert de volgorde zonder gat', () => {
    // Spiegelt de echte 'pensioenplanner'-rij: passief_inkomen op order 4.
    const stored = [
      pref('fire_prognose', 1),
      pref('netto_vermogen', 2),
      pref('sim_vermogenspad', 3),
      pref('passief_inkomen', 4),
      pref('vrijheidsmijlpalen', 5),
      pref('levensgebeurtenissen', 6),
      pref('cash_flow', 7),
    ]

    const result = sanitizePresetWidgets(stored)

    expect(result.map(w => w.id)).not.toContain('passief_inkomen')
    expect(result).toHaveLength(6)
    // Geen gat in de volgorde: 1..6 aaneengesloten.
    expect(result.map(w => w.order)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('laat een schone lijst exact ongemoeid (zelfde referentie)', () => {
    const stored = [pref('fire_prognose', 1), pref('cash_flow', 2)]
    expect(sanitizePresetWidgets(stored)).toBe(stored)
  })

  it('behoudt dynamische favorieten en grenzenpotten naast catalogus-widgets', () => {
    const stored = [
      pref('fire_prognose', 1),
      pref('budget_fav:abc', 2),
      pref('jouw_pad', 3),
      pref('holding_fav:xyz', 4),
      pref('spend_limit:POT-1', 5),
    ]

    const result = sanitizePresetWidgets(stored)

    expect(result.map(w => w.id)).toEqual([
      'fire_prognose',
      'budget_fav:abc',
      'holding_fav:xyz',
      'spend_limit:POT-1',
    ])
    expect(result.map(w => w.order)).toEqual([1, 2, 3, 4])
  })

  it('geeft een lege lijst terug als alle ids onbekend zijn', () => {
    expect(sanitizePresetWidgets([pref('jouw_pad', 1)])).toEqual([])
  })
})

describe('sanitizeStoredPresets', () => {
  it('schoont per preset op en laat de metadata staan', () => {
    const stored: WidgetPreset[] = [
      {
        id: 'budgetteerder',
        name: 'Budgetteerder',
        description: 'Focus op budget',
        module: 'kern',
        icon: 'Wallet',
        widgets: [pref('cash_flow', 1), pref('jouw_pad', 2), pref('spaarquote', 3)],
      },
    ]

    const [result] = sanitizeStoredPresets(stored)

    expect(result.name).toBe('Budgetteerder')
    expect(result.widgets.map(w => w.id)).toEqual(['cash_flow', 'spaarquote'])
    expect(result.widgets.map(w => w.order)).toEqual([1, 2])
  })
})

describe('de meegeleverde seed-presets', () => {
  it('bevatten uitsluitend bestaande widget-ids', () => {
    // Vangt de volgende widget-verwijdering die de statische seed vergeet.
    for (const preset of WIDGET_PRESETS) {
      for (const widget of preset.widgets) {
        expect(
          isKnownPresetWidgetId(widget.id),
          `preset '${preset.id}' verwijst naar onbekende widget '${widget.id}'`,
        ).toBe(true)
      }
    }
  })
})
