import { describe, it, expect } from 'vitest'
import { deriveTabFromPath, isTabRoot, resolveBackTarget } from './nav-stack-provider'

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

/**
 * UR3-17 #27c — "Terug naar overzicht" bleef op bezittingen staan.
 *
 * `pop()` besloot met `window.history.length > 1` of het `router.back()` mocht
 * doen. Die teller telt de HELE browsersessie mee: wie via de inlogpagina op
 * `/overzicht/bezittingen` binnenkomt (of de pagina ververst, of een deeplink
 * opent) heeft al `history.length >= 2`, terwijl de vorige history-entry níét
 * de stack-parent is. `router.back()` liep dan de app uit of viel via de
 * redirect terug op dezelfde pagina — de gebruiker zag geen verandering.
 *
 * De juiste maat is de in-app history-diepte: hoeveel stappen déze
 * documentlading zélf binnen de app heeft gezet. Nul bij een directe landing.
 */
describe('resolveBackTarget — ←-knop (#27c)', () => {
  it('doet niets op een stack zonder parent', () => {
    expect(resolveBackTarget(1, 0)).toBe('none')
    expect(resolveBackTarget(1, 5)).toBe('none')
    expect(resolveBackTarget(0, 3)).toBe('none')
  })

  it('pusht expliciet naar de parent bij een directe landing (diepte 0)', () => {
    // Dít is het defect: stack-diepte 2 (root + deeplink-pagina), maar deze
    // lading heeft zelf nog geen enkele in-app stap gezet.
    expect(resolveBackTarget(2, 0)).toBe('push-previous')
    expect(resolveBackTarget(4, 0)).toBe('push-previous')
  })

  it('gebruikt router.back() zodra de app zelf een stap heeft gezet', () => {
    expect(resolveBackTarget(2, 1)).toBe('history-back')
    expect(resolveBackTarget(3, 2)).toBe('history-back')
  })

  it('kijkt niet naar window.history.length', () => {
    // Regressie-anker: de oude regel zou hier 'history-back' geven omdat de
    // browsersessie een inlogpagina bevat. De nieuwe regel kent die teller niet.
    const browserHistoryLength = 3
    expect(resolveBackTarget(2, 0)).not.toBe('history-back')
    expect(browserHistoryLength).toBeGreaterThan(1)
  })
})
