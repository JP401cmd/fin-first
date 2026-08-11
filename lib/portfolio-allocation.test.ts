/**
 * Tests voor de portefeuille-verdeling.
 *
 * De aanleiding: de donut op /core/assets/holdings toonde een taartpunt met het
 * label "equity". Dat was geen vertaalfout maar een vocabulaire-botsing — de
 * database droeg `equity`/`bonds` uit een oudere classificatie-ronde, terwijl
 * de labels Nederlands zijn (`aandelen`/`obligaties`). Een onbekende sleutel
 * viel door de lookup heen en werd rauw getoond.
 *
 * Sindsdien vertaalt de allocatie bij het LEZEN, zodat oude rijen correct
 * renderen zonder migratie. Deze suite pint dat vast, plus de twee andere
 * keuzes die met de classificatie-uitbreiding meekwamen: `etf` als eigen
 * categorie, en het vervallen van de sector-dimensie.
 */

import { describe, it, expect } from 'vitest'
import {
  normalizeCategory,
  computeAllocationSlices,
  computeRebalancingSuggestions,
  ASSET_CLASS_LABELS,
  VIEW_MODE_LABELS,
  CATEGORY_LABELS,
  DEFAULT_TARGETS,
  type HoldingForAllocation,
} from './portfolio-allocation'

function h(over: Partial<HoldingForAllocation> & { value: number }): HoldingForAllocation {
  return {
    id: 'x',
    name: 'Positie',
    ticker: null,
    ...over,
  } as HoldingForAllocation
}

describe('normalizeCategory — legacy-vocabulaire opvangen', () => {
  it('vertaalt de Engelse sleutels die in de database staan', () => {
    expect(normalizeCategory('equity')).toBe('aandelen')
    expect(normalizeCategory('bonds')).toBe('obligaties')
  })

  it('is hoofdletter- en spatie-ongevoelig', () => {
    expect(normalizeCategory('  EQUITY ')).toBe('aandelen')
  })

  it('laat een canonieke waarde ongemoeid', () => {
    expect(normalizeCategory('aandelen')).toBe('aandelen')
    expect(normalizeCategory('etf')).toBe('etf')
  })

  it('laat een ONBEKENDE waarde staan in plaats van hem te raden', () => {
    // Zichtbaar blijven is hier het doel: een rauwe sleutel in de grafiek is
    // een signaal dat er iets niet gemapt is. Stilzwijgend op 'anders' gooien
    // zou dat signaal wegpoetsen.
    expect(normalizeCategory('iets-nieuws')).toBe('iets-nieuws')
  })
})

describe('computeAllocationSlices', () => {
  it('geeft een legacy-rij het Nederlandse label in plaats van "equity"', () => {
    const slices = computeAllocationSlices(
      [h({ id: 'a', value: 300, asset_class: 'equity' })],
      'asset_class',
    )
    expect(slices).toHaveLength(1)
    expect(slices[0].key).toBe('aandelen')
    expect(slices[0].label).toBe('Aandelen')
  })

  it('voegt oude en nieuwe schrijfwijze samen tot één taartpunt', () => {
    // Zonder normalisatie stonden `equity` en `aandelen` als twee losse
    // categorieën naast elkaar — dezelfde bezitting, dubbel geteld in de legenda.
    const slices = computeAllocationSlices(
      [
        h({ id: 'a', value: 300, asset_class: 'equity' }),
        h({ id: 'b', value: 100, asset_class: 'aandelen' }),
      ],
      'asset_class',
    )
    expect(slices).toHaveLength(1)
    expect(slices[0].value).toBe(400)
    expect(slices[0].holdingCount).toBe(2)
    expect(slices[0].pct).toBe(100)
  })

  it('houdt ETF apart van losse aandelen', () => {
    // `instrumentType` beschrijft de verpakking, niet de inhoud: een
    // obligatie-ETF onder "Aandelen" scharen zou een fout getal zijn.
    const slices = computeAllocationSlices(
      [
        h({ id: 'a', value: 600, asset_class: 'etf' }),
        h({ id: 'b', value: 400, asset_class: 'aandelen' }),
      ],
      'asset_class',
    )
    expect(slices.map((s) => s.key).sort()).toEqual(['aandelen', 'etf'])
    expect(slices.find((s) => s.key === 'etf')!.label).toBe('ETF/fondsen')
  })

  it('groepeert ongeclassificeerde posities onder Overig', () => {
    const slices = computeAllocationSlices(
      [h({ id: 'a', value: 100, asset_class: null })],
      'asset_class',
    )
    expect(slices[0].key).toBe('anders')
  })

  it('negeert posities zonder waarde', () => {
    const slices = computeAllocationSlices(
      [h({ id: 'a', value: 0, asset_class: 'aandelen' }), h({ id: 'b', value: 50, asset_class: 'aandelen' })],
      'asset_class',
    )
    expect(slices[0].holdingCount).toBe(1)
  })
})

describe('de sector-dimensie is vervallen', () => {
  it('biedt nog twee verdelingen aan, zonder sector', () => {
    // Er was geen bron: de koersfeed levert sector niet en Yahoo's
    // quoteSummary is achter cookie-authenticatie afgeschermd. Een tab die
    // structureel "Overig 100%" toont suggereert een meting die niet bestaat.
    expect(Object.keys(VIEW_MODE_LABELS).sort()).toEqual(['asset_class', 'geography'])
    expect(Object.keys(CATEGORY_LABELS).sort()).toEqual(['asset_class', 'geography'])
    expect(Object.keys(DEFAULT_TARGETS).sort()).toEqual(['asset_class', 'geography'])
  })
})

describe('computeRebalancingSuggestions', () => {
  it('labelt een ETF-doel met de nieuwe categorie', () => {
    const slices = computeAllocationSlices(
      [h({ id: 'a', value: 1000, asset_class: 'etf' })],
      'asset_class',
    )
    const [suggestion] = computeRebalancingSuggestions(
      slices,
      [{ category: 'etf', target_pct: 60 }],
      1000,
    )
    expect(suggestion.label).toBe(ASSET_CLASS_LABELS.etf)
    // 100% werkelijk tegen 60% doel → verkopen.
    expect(suggestion.action).toBe('sell')
  })
})
