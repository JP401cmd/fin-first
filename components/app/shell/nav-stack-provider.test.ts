import { describe, it, expect } from 'vitest'
import { deriveTabFromPath, isTabRoot } from './nav-stack-provider'

/**
 * Regressie: de mobiele TopBar toont de utility-cluster (vier-hefbomen-kompas
 * + privacy + nieuws + meldingen + account-avatar) alleen op tab-ROOTS, want
 * de pathname-watcher zet daar `topBar.kind = 'rich'`. Sub-pages krijgen
 * `'simple'` (alleen ←-knop + titel, geen cluster).
 *
 * De canonieke IA is `/overzicht`, `/toekomst`, `/mijn` (lib/nav-config.ts) —
 * NIET de legacy `/core`, `/will`, `/horizon`, `/identity`. Toen de mapping
 * nog uitsluitend de legacy-routes kende viel `/overzicht` in tab `'other'`
 * (nooit een root) → `kind: 'simple'` → de bovenste balk met de "4 puntjes"
 * en het account-icoon ontbrak op de homescreen.
 *
 * Deze suite pint vast dat de canonieke hoofd-routes hun juiste tab krijgen
 * én als root herkend worden — terwijl de legacy backing-routes blijven werken.
 */
describe('deriveTabFromPath — canonieke IA', () => {
  it('mapt /overzicht (+ subroutes) op de kern-tab', () => {
    expect(deriveTabFromPath('/overzicht')).toBe('kern')
    expect(deriveTabFromPath('/overzicht/bezittingen')).toBe('kern')
    expect(deriveTabFromPath('/overzicht/belasting/box3')).toBe('kern')
  })

  it('mapt /toekomst (+ subroutes) op de horizon-tab', () => {
    expect(deriveTabFromPath('/toekomst')).toBe('horizon')
    expect(deriveTabFromPath('/toekomst/doelen')).toBe('horizon')
  })

  it('mapt /mijn (+ subroutes) op de identity-tab', () => {
    expect(deriveTabFromPath('/mijn')).toBe('identity')
    expect(deriveTabFromPath('/mijn/profiel')).toBe('identity')
  })

  it('houdt de legacy backing-routes werkend', () => {
    expect(deriveTabFromPath('/core')).toBe('kern')
    expect(deriveTabFromPath('/core/assets')).toBe('kern')
    expect(deriveTabFromPath('/will')).toBe('wil')
    expect(deriveTabFromPath('/horizon')).toBe('horizon')
    expect(deriveTabFromPath('/identity')).toBe('identity')
  })

  it('laat onbekende routes in de other-tab vallen', () => {
    expect(deriveTabFromPath('/nieuws')).toBe('other')
    expect(deriveTabFromPath('/berichten')).toBe('other')
  })
})

describe('isTabRoot — rich-TopBar gating', () => {
  it('herkent de canonieke hoofd-routes als root (→ rich TopBar)', () => {
    expect(isTabRoot('/overzicht', 'kern')).toBe(true)
    expect(isTabRoot('/toekomst', 'horizon')).toBe(true)
    expect(isTabRoot('/mijn', 'identity')).toBe(true)
  })

  it('herkent de legacy roots nog steeds als root', () => {
    expect(isTabRoot('/core', 'kern')).toBe(true)
    expect(isTabRoot('/will', 'wil')).toBe(true)
    expect(isTabRoot('/horizon', 'horizon')).toBe(true)
    expect(isTabRoot('/identity', 'identity')).toBe(true)
  })

  it('behandelt sub-pages NIET als root (→ simple TopBar)', () => {
    expect(isTabRoot('/overzicht/bezittingen', 'kern')).toBe(false)
    expect(isTabRoot('/toekomst/doelen', 'horizon')).toBe(false)
    expect(isTabRoot('/mijn/profiel', 'identity')).toBe(false)
  })
})
