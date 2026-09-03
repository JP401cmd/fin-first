import { describe, it, expect } from 'vitest'
import {
  BUDGET_PAGE_PATH,
  budgetDetailUrl,
  budgetEditUrl,
  newBudgetUrl,
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

/**
 * WF-BUDGET-23 — legacy-deeplinks landden op de cashflow-HUB.
 *
 * De drie legacy-routes (`/core/budgets/<id>`, `…/edit`, `/core/budgets/new`)
 * redirectten naar het tussenpad `/core/budgets?…`. Dat exacte pad matcht de
 * statische redirect in `next.config.ts` (`/core/budgets` →
 * `/overzicht/cashflow`); Next matcht op pathname, plakt de ongebruikte query
 * door en zette de gebruiker op de hub — één niveau te hoog, geen paneel, en een
 * dode `?budget=`-param die in de adresbalk bleef staan.
 *
 * Deze suite pint de eindbestemming van de drie deeplinks: het CANONIEKE pad,
 * en nooit meer het legacy-pad dat de redirect-regel opeet.
 */
describe('budget-deeplinks (WF-BUDGET-23)', () => {
  it('wijst het detail-deeplink naar de canonieke pagina met de budget-param', () => {
    expect(budgetDetailUrl('abc-123')).toBe(`${BUDGET_PAGE_PATH}?budget=abc-123`)
  })

  it('wijst het bewerk-deeplink naar dezelfde pagina met edit=true erbij', () => {
    expect(budgetEditUrl('abc-123')).toBe(`${BUDGET_PAGE_PATH}?budget=abc-123&edit=true`)
  })

  it('wijst het nieuw-deeplink naar de canonieke pagina met newBudget=true', () => {
    expect(newBudgetUrl()).toBe(`${BUDGET_PAGE_PATH}?newBudget=true`)
  })

  it('landt op GEEN van de drie op het legacy-pad dat de statische redirect opeet', () => {
    for (const url of [budgetDetailUrl('x'), budgetEditUrl('x'), newBudgetUrl()]) {
      expect(url.startsWith('/core/budgets')).toBe(false)
      expect(url.startsWith(`${BUDGET_PAGE_PATH}?`)).toBe(true)
    }
  })

  it('gebruikt de canonieke query-sleutels, geen losse magic strings', () => {
    expect(budgetDetailUrl('x')).toContain(`${OVERLAY_QUERY_KEYS.budget}=`)
    expect(budgetEditUrl('x')).toContain(`${OVERLAY_QUERY_KEYS.edit}=true`)
    expect(newBudgetUrl()).toContain(`${OVERLAY_QUERY_KEYS.newBudget}=true`)
  })

  it('codeert de id, zodat een raar teken de query niet openbreekt', () => {
    expect(budgetDetailUrl('a&edit=true')).toBe(`${BUDGET_PAGE_PATH}?budget=a%26edit%3Dtrue`)
  })
})
