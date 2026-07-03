/**
 * Unit-tests voor lib/widget-catalog.ts
 *
 * Pint het gedrag dat in juni 2026 is gewijzigd:
 *   DEFAULT_WIDGET_PREFS — alle widgets nu enabled: false (was: 7 aan).
 *   Een onaangeraakt account toont de standaard Voortgang-doelen + Vrijheidsstrip
 *   in de /overzicht hero-rail; de widget-grid verschijnt alleen wanneer de
 *   gebruiker zelf een widget aanzet of een budget/holding favoriet maakt.
 *
 * Keuze: pure logica → Vitest unit-tests (lib/*.test.ts). De volledige
 * in-app regressiesuite (`dashboard-widgets.ts`) loopt via zijn eigen CI-
 * wrapper in test/dashboard-widgets-suite-check.test.ts.
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_WIDGET_PREFS,
  WIDGET_CATALOG,
  downsizeForMobile,
  mergeWidgetPrefs,
  type WidgetPrefs,
} from './widget-catalog'

// ── 1. DEFAULT_WIDGET_PREFS: alle widgets disabled ────────────────────────────

describe('DEFAULT_WIDGET_PREFS — onaangeraakt account', () => {
  it('bevat precies evenveel entries als WIDGET_CATALOG', () => {
    expect(DEFAULT_WIDGET_PREFS.widgets.length).toBe(WIDGET_CATALOG.length)
  })

  it('heeft 0 enabled widgets — onaangeraakt account ziet doelen + fire-line', () => {
    const enabled = DEFAULT_WIDGET_PREFS.widgets.filter(w => w.enabled)
    expect(enabled.length).toBe(0)
  })

  it('elke pref verwijst naar een bestaand catalog-id', () => {
    const catalogIds = new Set(WIDGET_CATALOG.map(w => w.id))
    for (const pref of DEFAULT_WIDGET_PREFS.widgets) {
      expect(catalogIds.has(pref.id), `${pref.id} moet in catalog staan`).toBe(true)
    }
  })
})

// ── 2. mergeWidgetPrefs(null) → defaults, 0 enabled ──────────────────────────

describe('mergeWidgetPrefs(null) — retourneert defaults', () => {
  it('retourneert dezelfde lengte als catalog', () => {
    const result = mergeWidgetPrefs(null)
    expect(result.widgets.length).toBe(WIDGET_CATALOG.length)
  })

  it('0 widgets enabled bij null saved prefs', () => {
    const result = mergeWidgetPrefs(null)
    const enabled = result.widgets.filter(w => w.enabled)
    expect(enabled.length).toBe(0)
  })
})

// ── 3. Gebruiker met ≥1 enabled widget — grid zichtbaar ───────────────────────

describe('mergeWidgetPrefs(saved) — expliciet aangezette widgets blijven behouden', () => {
  it('behoudt enabled=true voor opgeslagen widget', () => {
    const saved: WidgetPrefs = {
      widgets: [
        { id: 'netto_vermogen', enabled: true, size: 'half', order: 0 },
        { id: 'cash_flow', enabled: true, size: 'half', order: 1 },
        { id: 'budgetten', enabled: false, size: 'half', order: 2 },
      ],
    }
    const result = mergeWidgetPrefs(saved)
    const nv = result.widgets.find(w => w.id === 'netto_vermogen')
    const cf = result.widgets.find(w => w.id === 'cash_flow')
    const bud = result.widgets.find(w => w.id === 'budgetten')
    expect(nv?.enabled).toBe(true)
    expect(cf?.enabled).toBe(true)
    expect(bud?.enabled).toBe(false)
  })

  it('enabled-count klopt: 2 aan, 1 uit, rest nieuw disabled', () => {
    const saved: WidgetPrefs = {
      widgets: [
        { id: 'netto_vermogen', enabled: true, size: 'half', order: 0 },
        { id: 'cash_flow', enabled: true, size: 'half', order: 1 },
        { id: 'budgetten', enabled: false, size: 'half', order: 2 },
      ],
    }
    const result = mergeWidgetPrefs(saved)
    const enabled = result.widgets.filter(w => w.enabled)
    // Alleen netto_vermogen en cash_flow zijn enabled; nieuw toegevoegde catalog-
    // widgets krijgen enabled: false — dus exact 2 enabled in totaal.
    expect(enabled.length).toBe(2)
  })

  it('behoudt opgeslagen size en order', () => {
    const saved: WidgetPrefs = {
      widgets: [
        { id: 'fire_prognose', enabled: true, size: 'full', order: 7 },
      ],
    }
    const result = mergeWidgetPrefs(saved)
    const fp = result.widgets.find(w => w.id === 'fire_prognose')
    expect(fp?.size).toBe('full')
    expect(fp?.order).toBe(7)
  })
})

// ── 4. Favoriet-injectie: budget_fav: en holding_fav: prefs worden bewaard ───

describe('mergeWidgetPrefs — favoriet-prefs (budget_fav: / holding_fav:)', () => {
  it('budget_fav:* pref in saved blijft aanwezig na merge', () => {
    const saved: WidgetPrefs = {
      widgets: [
        { id: 'netto_vermogen', enabled: true, size: 'half', order: 0 },
        { id: 'budget_fav:abc123', enabled: true, size: 'quarter', order: 50 },
      ],
    }
    const result = mergeWidgetPrefs(saved)
    const fav = result.widgets.find(w => w.id === 'budget_fav:abc123')
    expect(fav).toBeDefined()
    expect(fav?.enabled).toBe(true)
    expect(fav?.size).toBe('quarter')
  })

  it('holding_fav:* pref in saved blijft aanwezig na merge', () => {
    const saved: WidgetPrefs = {
      widgets: [
        { id: 'holding_fav:xyz456', enabled: true, size: 'half', order: 51 },
      ],
    }
    const result = mergeWidgetPrefs(saved)
    const fav = result.widgets.find(w => w.id === 'holding_fav:xyz456')
    expect(fav).toBeDefined()
    expect(fav?.enabled).toBe(true)
  })

  it('meerdere budget_fav: prefs blijven allemaal behouden', () => {
    const saved: WidgetPrefs = {
      widgets: [
        { id: 'budget_fav:bood', enabled: true, size: 'quarter', order: 60 },
        { id: 'budget_fav:huur', enabled: true, size: 'quarter', order: 61 },
        { id: 'budget_fav:sparen', enabled: false, size: 'quarter', order: 62 },
      ],
    }
    const result = mergeWidgetPrefs(saved)
    const favs = result.widgets.filter(w => w.id.startsWith('budget_fav:'))
    expect(favs.length).toBe(3)
    expect(favs.find(w => w.id === 'budget_fav:huur')?.enabled).toBe(true)
    expect(favs.find(w => w.id === 'budget_fav:sparen')?.enabled).toBe(false)
  })

  /**
   * Loader-pad: de server-loader injecteert budget_fav:/holding_fav: prefs
   * in de opgeslagen WidgetPrefs vóórdat mergeWidgetPrefs wordt aangeroepen.
   * Dit pad loopt via lib/dashboard-data-loader.ts (server-only) en is niet
   * unit-testbaar zonder Supabase stub. De bovenstaande tests dekken dat
   * mergeWidgetPrefs de ingespoten prefs bewaart; de loader-injectie zelf
   * is enkel afdekbaar via een integratietest of de in-app regressiesuite.
   */
})

// ── 4b. downsizeForMobile — xl (Double) zakt naar full ────────────────────────

describe('downsizeForMobile', () => {
  it('xl → full (Double bestaat niet op mobiel)', () => {
    expect(downsizeForMobile('xl')).toBe('full')
  })

  it('overige stappen blijven: full→half, half→quarter, quarter→mini, mini→mini', () => {
    expect(downsizeForMobile('full')).toBe('half')
    expect(downsizeForMobile('half')).toBe('quarter')
    expect(downsizeForMobile('quarter')).toBe('mini')
    expect(downsizeForMobile('mini')).toBe('mini')
  })
})

// ── 5. Randgevallen ───────────────────────────────────────────────────────────

describe('mergeWidgetPrefs — randgevallen', () => {
  it('lege widgets array → alle catalog widgets disabled', () => {
    const result = mergeWidgetPrefs({ widgets: [] })
    expect(result.widgets.length).toBe(WIDGET_CATALOG.length)
    const enabled = result.widgets.filter(w => w.enabled)
    expect(enabled.length).toBe(0)
  })

  it('mini size wordt gesanitized naar niet-mini (fallback naar defaultSize)', () => {
    // netto_vermogen heeft 'mini' niet in .sizes — valt terug op defaultSize
    const saved: WidgetPrefs = {
      widgets: [
        { id: 'netto_vermogen', enabled: true, size: 'mini', order: 0 },
      ],
    }
    const result = mergeWidgetPrefs(saved)
    const nv = result.widgets.find(w => w.id === 'netto_vermogen')
    expect(nv?.size).not.toBe('mini')
  })

  it("xl (Double) blijft behouden voor widgets die 'xl' ondersteunen", () => {
    // maandoverzicht heeft 'xl' in zijn catalog-sizes
    const saved: WidgetPrefs = {
      widgets: [{ id: 'maandoverzicht', enabled: true, size: 'xl', order: 0 }],
    }
    const result = mergeWidgetPrefs(saved)
    expect(result.widgets.find(w => w.id === 'maandoverzicht')?.size).toBe('xl')
  })

  it("xl op een widget zónder xl-support wordt gesanitized naar defaultSize", () => {
    // netto_vermogen heeft 'xl' niet in .sizes → fallback naar defaultSize
    const saved: WidgetPrefs = {
      widgets: [{ id: 'netto_vermogen', enabled: true, size: 'xl', order: 0 }],
    }
    const result = mergeWidgetPrefs(saved)
    const nv = result.widgets.find(w => w.id === 'netto_vermogen')
    expect(nv?.size).not.toBe('xl')
    expect(nv?.size).toBe('half') // defaultSize van netto_vermogen
  })

  it('onbekende catalog-id (stale widget) wordt uit resultaat gefilterd', () => {
    const saved: WidgetPrefs = {
      widgets: [
        { id: 'netto_vermogen', enabled: true, size: 'half', order: 0 },
        { id: 'widget_dat_niet_bestaat_xyz', enabled: true, size: 'half', order: 1 },
      ],
    }
    const result = mergeWidgetPrefs(saved)
    const stale = result.widgets.find(w => w.id === 'widget_dat_niet_bestaat_xyz')
    // Stale catalog-ids worden niet overgenomen (savedMap wordt gebruikt maar
    // de output wordt gebouwd vanuit WIDGET_CATALOG, niet vanuit saved.widgets)
    expect(stale).toBeUndefined()
  })
})
