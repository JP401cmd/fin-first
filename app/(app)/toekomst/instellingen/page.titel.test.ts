import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { stripComments } from '@/test/helpers/page-source'

/**
 * /toekomst/instellingen — broncontrole op de titel (verhuisd van /toekomst/gebeurtenissen, ADR 0179).
 *
 * Given: het aantal gebeurtenissen dat de gebruiker ziet is de tijdlijn ván de view:
 *   de server-events plus het door de kernel afgeleide verkoopmoment (dat bestaat alleen
 *   client-side, in `useHorizonFireSim`).
 * When: de server-pagina zelf een telling in de shell-titel zet, geteld op
 *   `horizonData.events`.
 * Then: die telling mist het kernel-verkoopmoment ("2" in de kop, "3" kaarten eronder)
 *   en staat bovendien dubbel naast de sectiekop van de view.
 *
 * Een render-test kan dit niet zien: de pagina is een async server-component en het
 * verkoopmoment ontstaat pas ná hydration. Daarom een broncontrole (zelfde soort als
 * `page.streaming.test.ts` elders): de titel is de kale paginanaam; de telling woont in
 * `GebeurtenissenView` (zie `gebeurtenissen-view.test.tsx`).
 */

const PAGE_SRC = stripComments(readFileSync(path.resolve(__dirname, 'page.tsx'), 'utf-8'))

describe('/toekomst/instellingen — één telling, in de view', () => {
  it('de shell-titel is de kale paginanaam (verdict={null})', () => {
    expect(PAGE_SRC).toMatch(/verdict=\{null\}/)
  })

  it('de pagina telt zelf niet op horizonData.events', () => {
    expect(PAGE_SRC).not.toMatch(/events\.length/)
  })
})

describe('/toekomst/instellingen — samengevoegde server-opbouw', () => {
  it('leest de horizon-bundel en de strategie-editordata precies één keer', () => {
    expect(PAGE_SRC.match(/loadHorizonRaw\(/g)).toHaveLength(1)
    expect(PAGE_SRC.match(/buildStrategieEditorsData\(/g)).toHaveLength(1)
  })

  it('zet de mobiele TopBar-titel expliciet op "Instellingen"', () => {
    expect(PAGE_SRC).toMatch(/<NavStackMeta title="Instellingen" \/>/)
  })

  it('mount de plan-review-provider, zodat de wizard-ingang de pane zonder routewissel opent', () => {
    expect(PAGE_SRC).toMatch(/<PlanReviewProvider initialProgress=\{planReviewProgress\}>/)
  })
})
