import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { stripComments } from '@/test/helpers/page-source'

/**
 * /toekomst/gebeurtenissen — broncontrole op de titel.
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

describe('/toekomst/gebeurtenissen — één telling, in de view', () => {
  it('de shell-titel is de kale paginanaam (verdict={null})', () => {
    expect(PAGE_SRC).toMatch(/verdict=\{null\}/)
  })

  it('de pagina telt zelf niet op horizonData.events', () => {
    expect(PAGE_SRC).not.toMatch(/events\.length/)
  })
})
