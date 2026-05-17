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
