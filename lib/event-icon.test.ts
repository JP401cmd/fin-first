import { describe, it, expect } from 'vitest'
import {
  Baby, Hammer, Home, Sunset, Globe, GraduationCap, Gift, Landmark, Wallet, Briefcase,
} from 'lucide-react'
import {
  resolveEventIcon,
  EVENT_ICON_COMPONENTS,
  EVENT_ICON_NODES,
  DEFAULT_EVENT_ICON,
} from './event-icon'

/**
 * Regressie voor de bug "iconen tonen standaard Wallet i.p.v. het catalogus-
 * icoon" op /toekomst/gebeurtenissen. Eén canonieke bron (lib/event-icon.ts);
 * resolutie eerst op `event.icon` (Lucide-naam), dan event_type-fallback.
 */

describe('resolveEventIcon — primair via event.icon (catalogus Lucide-naam)', () => {
  it('sabbatical (icon=Palmtree) → Sunset-glyph (Palmtree bestaat niet als Lucide-glyph)', () => {
    expect(resolveEventIcon('sabbatical', 'Palmtree')).toBe(Sunset)
  })
  it('children (icon=Baby) → Baby', () => {
    expect(resolveEventIcon('children', 'Baby')).toBe(Baby)
  })
  it('renovation (icon=Hammer) → Hammer', () => {
    expect(resolveEventIcon('renovation', 'Hammer')).toBe(Hammer)
  })
  it('house_purchase (icon=Home) → Home', () => {
    expect(resolveEventIcon('house_purchase', 'Home')).toBe(Home)
  })
  it('world_trip (icon=Globe) → Globe', () => {
    expect(resolveEventIcon('world_trip', 'Globe')).toBe(Globe)
  })
  it('study (icon=GraduationCap) → GraduationCap', () => {
    expect(resolveEventIcon('study', 'GraduationCap')).toBe(GraduationCap)
  })
  it('inheritance (icon=Gift) → Gift', () => {
    expect(resolveEventIcon('inheritance', 'Gift')).toBe(Gift)
  })
  it('aow (icon=Landmark) → Landmark', () => {
    expect(resolveEventIcon('aow', 'Landmark')).toBe(Landmark)
  })
})

describe('resolveEventIcon — legacy fallback via event_type (geen icon-veld)', () => {
  it('sabbatical zonder icon → Sunset-glyph (catalogus Palmtree)', () => {
    expect(resolveEventIcon('sabbatical')).toBe(Sunset)
  })
  it('renovation zonder icon → Hammer', () => {
    expect(resolveEventIcon('renovation', '')).toBe(Hammer)
  })
  it('legacy korte type "kind" → Baby', () => {
    expect(resolveEventIcon('kind')).toBe(Baby)
  })
  it('legacy korte type "career" → Briefcase', () => {
    expect(resolveEventIcon('career')).toBe(Briefcase)
  })
  it('hoofdletter-ongevoelig: "House_Purchase" → Home', () => {
    expect(resolveEventIcon('House_Purchase')).toBe(Home)
  })
})

describe('resolveEventIcon — defaults', () => {
  it('onbekend type zonder icon → Wallet-default', () => {
    expect(resolveEventIcon('iets_geheel_onbekends')).toBe(Wallet)
    expect(DEFAULT_EVENT_ICON).toBe(Wallet)
  })
  it('valt NIET naar Wallet terug voor bekende catalogus-types', () => {
    // De kern van de bug: bekende types mochten NOOIT meer op Wallet uitkomen.
    const knownTypes = ['sabbatical', 'children', 'renovation', 'house_purchase', 'study', 'aow']
    for (const t of knownTypes) {
      expect(resolveEventIcon(t)).not.toBe(Wallet)
    }
  })
  it('onbekende icon-naam valt door naar event_type-fallback', () => {
    expect(resolveEventIcon('renovation', 'NietBestaandeNaam')).toBe(Hammer)
  })
})

describe('canonieke maps', () => {
  it('EVENT_ICON_COMPONENTS mapt Palmtree → Sunset (gedrag gelijk aan oude log-timeline)', () => {
    expect(EVENT_ICON_COMPONENTS.Palmtree).toBe(Sunset)
  })
  it('EVENT_ICON_NODES bevat dezelfde sleutels als de component-map', () => {
    expect(Object.keys(EVENT_ICON_NODES).sort()).toEqual(
      Object.keys(EVENT_ICON_COMPONENTS).sort(),
    )
  })
})
