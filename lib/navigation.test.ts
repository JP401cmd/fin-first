import { describe, it, expect } from 'vitest'
import {
  OVERLAY_QUERY_KEYS,
  OVERLAY_TRIGGER_PARAMS,
  PANE_QUERY_KEYS,
} from './navigation'

/**
 * Bewaakt de whitelist die de AppSetup-completion-flow gebruikt om binnengekomen
 * overlay-trigger-params (bv. `?newBudget=true`) op te ruimen vóór router.refresh().
 * Regressie-risico uit de bug-analyse: een nieuwe OVERLAY_QUERY_KEY die een overlay
 * auto-opent maar niet in de trigger-lijst staat, laat de bug terugkeren; omgekeerd
 * mag `tab` (embed-route) nooit worden gestript.
 */
describe('OVERLAY_TRIGGER_PARAMS', () => {
  it('bevat alle pane-openers plus de sheet-triggers newBudget en planEditor', () => {
    for (const key of PANE_QUERY_KEYS) {
      expect(OVERLAY_TRIGGER_PARAMS).toContain(OVERLAY_QUERY_KEYS[key])
    }
    expect(OVERLAY_TRIGGER_PARAMS).toContain(OVERLAY_QUERY_KEYS.newBudget)
    expect(OVERLAY_TRIGGER_PARAMS).toContain(OVERLAY_QUERY_KEYS.planEditor)
    // Kaart H7: de rekenmodal "Zo is het rendement berekend" is sinds 27-08-2026
    // ook via de URL bereikbaar, zodat elk rendementsgetal op /overzicht naar
    // dezelfde uitleg kan linken. Staat hij niet in de trigger-lijst, dan blijft
    // de param na een setup-completion staan en opent de modal ongevraagd.
    expect(OVERLAY_TRIGGER_PARAMS).toContain(OVERLAY_QUERY_KEYS.rendementUitleg)
  })

  it('gebruikt de actuele URL-param-values, niet de key-namen (cryptoHolding → "crypto")', () => {
    expect(OVERLAY_TRIGGER_PARAMS).toContain('crypto')
    expect(OVERLAY_TRIGGER_PARAMS).not.toContain('cryptoHolding')
  })

  it('spaart in-page/modifier-params (tab, edit, via, month) zodat embed-routes intact blijven', () => {
    expect(OVERLAY_TRIGGER_PARAMS).not.toContain(OVERLAY_QUERY_KEYS.tab)
    expect(OVERLAY_TRIGGER_PARAMS).not.toContain(OVERLAY_QUERY_KEYS.edit)
    expect(OVERLAY_TRIGGER_PARAMS).not.toContain(OVERLAY_QUERY_KEYS.via)
    expect(OVERLAY_TRIGGER_PARAMS).not.toContain(OVERLAY_QUERY_KEYS.month)
  })

  it('strip-simulatie: newBudget verdwijnt, tab=budgetteren blijft staan', () => {
    const params = new URLSearchParams('tab=budgetteren&newBudget=true')
    for (const param of OVERLAY_TRIGGER_PARAMS) params.delete(param)
    expect(params.toString()).toBe('tab=budgetteren')
  })
})
