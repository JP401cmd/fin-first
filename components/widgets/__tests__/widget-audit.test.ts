import { describe, it, expect } from 'vitest'
import { WIDGET_CATALOG, WIDGET_HREFS } from '@/lib/widget-catalog'
import {
  WIDGET_CLASSIFICATION,
  runWidgetAudit,
  assertWidgetAuditPasses,
  isInsightWidget,
  isObservationWidget,
} from '@/lib/widget-audit'

describe('Widget Audit — KPI action classification', () => {
  it('every catalog widget has a classification', () => {
    for (const widget of WIDGET_CATALOG) {
      expect(WIDGET_CLASSIFICATION[widget.id]).toBeDefined()
    }
  })

  it('every insight widget has an href in WIDGET_HREFS', () => {
    for (const widget of WIDGET_CATALOG) {
      if (isInsightWidget(widget.id)) {
        expect(WIDGET_HREFS[widget.id]).toBeDefined()
        expect(WIDGET_HREFS[widget.id].length).toBeGreaterThan(0)
      }
    }
  })

  it('observation widgets are not forced to have actions (no violations)', () => {
    // Observation widgets MAY have hrefs but aren't required to.
    // This test simply verifies they are classified correctly.
    const observationWidgets = WIDGET_CATALOG.filter(w =>
      isObservationWidget(w.id)
    )
    expect(observationWidgets.length).toBeGreaterThan(0)
    // All should be classified — no orphans
    for (const widget of observationWidgets) {
      expect(WIDGET_CLASSIFICATION[widget.id]).toBe('observation')
    }
  })

  it('no widget is unclassified (neither observation nor insight)', () => {
    const unclassified = WIDGET_CATALOG.filter(
      w => !WIDGET_CLASSIFICATION[w.id]
    )
    expect(unclassified.map(w => w.id)).toEqual([])
  })

  it('full audit passes with zero violations', () => {
    const violations = runWidgetAudit()
    expect(violations).toEqual([])
  })

  it('assertWidgetAuditPasses() does not throw', () => {
    expect(() => assertWidgetAuditPasses()).not.toThrow()
  })

  it('expected observation widgets are correctly classified', () => {
    // The spec explicitly names these as observations
    expect(WIDGET_CLASSIFICATION['netto_vermogen']).toBe('observation')
    expect(WIDGET_CLASSIFICATION['jouw_pad']).toBe('observation') // fase-bar
    expect(WIDGET_CLASSIFICATION['vrijheidsvoortgang']).toBe('observation')
    expect(WIDGET_CLASSIFICATION['pensioen_aow']).toBe('observation')
  })

  it('classification covers exactly the catalog (no stale entries)', () => {
    const catalogIds = new Set(WIDGET_CATALOG.map(w => w.id))
    const classifiedIds = Object.keys(WIDGET_CLASSIFICATION)
    // Every classified id must exist in catalog
    for (const id of classifiedIds) {
      expect(catalogIds.has(id)).toBe(true)
    }
    // Every catalog id must be classified
    for (const id of catalogIds) {
      expect(WIDGET_CLASSIFICATION[id]).toBeDefined()
    }
  })
})

describe('Observation widgets retain legitimacy without forced actions (#802)', () => {
  it('netto_vermogen widget has optional href (not forced CTA)', () => {
    // NettoVermogenWidget props: { size, data, href? }
    // The href is optional — widget functions as pure observation without it
    expect(WIDGET_CLASSIFICATION['netto_vermogen']).toBe('observation')
    // It MAY have a navigation href but it's for "see more" not "take action"
    expect(WIDGET_HREFS['netto_vermogen']).toBe('/overzicht')
  })

  it('jouw_pad (fase-bar/sovereignty) has no forced action button', () => {
    // JouwPadWidgetWrapper props: { size, data, href? }
    // Shows sovereignty level + phase progress — purely observational
    expect(WIDGET_CLASSIFICATION['jouw_pad']).toBe('observation')
    expect(WIDGET_HREFS['jouw_pad']).toBe('/mijn')
  })

  it('vermogensgrafiek (trend widgets) accepted as observations', () => {
    // Trend widgets show historical data lines — pure observations
    expect(WIDGET_CLASSIFICATION['trend_inkomen']).toBe('observation')
    expect(WIDGET_CLASSIFICATION['trend_uitgaven']).toBe('observation')
    expect(WIDGET_CLASSIFICATION['trend_sparen']).toBe('observation')
    expect(WIDGET_CLASSIFICATION['trend_schulden']).toBe('observation')
    // Beleggingsrendement is portfolio performance display
    expect(WIDGET_CLASSIFICATION['beleggingsrendement']).toBe('observation')
  })

  it('observation widgets are NOT required to have hrefs (only optional)', () => {
    // The audit function only fails for insight widgets missing hrefs.
    // Observation widgets pass the audit regardless of href presence.
    const violations = runWidgetAudit()
    const observationViolations = violations.filter(
      v => WIDGET_CLASSIFICATION[v.widgetId] === 'observation'
    )
    expect(observationViolations).toEqual([])
  })

  it('total observation count is stable (14 widgets)', () => {
    const observations = WIDGET_CATALOG.filter(w =>
      isObservationWidget(w.id)
    )
    // 14 observation widgets: netto_vermogen, vrijheidsvoortgang, jouw_pad,
    // pensioen_aow, vrijheidsmijlpalen, maandoverzicht, weekoverzicht,
    // trend_inkomen, trend_uitgaven, trend_sparen, trend_schulden,
    // huishouden_vergelijking, huishouden_activiteit, beleggingsrendement
    expect(observations.length).toBe(14)
  })
})
