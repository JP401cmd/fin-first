/**
 * Bron-grendel op de briefing-doorgifte in `overzicht-secondary.tsx` (H5).
 *
 * WAAROM EEN BRON-TEST EN GEEN RENDER-TEST: de fout die deze test moet
 * uitsluiten zat NIET in `BriefingPanel` — die verwerkte `dataChanged` vanaf de
 * eerste commit correct — en ook niet in de loader, die de vlag correct
 * berekende en doorgaf. Hij zat in het tussenliggende component, dat de prop
 * stilletjes liet vallen. Gevolg: 2,5 maand dode code, twee refactors lang
 * onopgemerkt, want elke laag was op zichzelf groen. Een render-test op het
 * paneel was gróén geweest tijdens de hele bug. Alleen een test op de NAAD
 * vangt dit.
 *
 * DE INVARIANT: `OverzichtSecondary` is voor briefing-data een pure
 * doorgeefluik. Elke `briefing*`-prop die hij declareert, hoort in de
 * `<BriefingPanel>`-aanroep terecht te komen (soms onder een kortere naam:
 * `briefingRefreshedAt` → `refreshedAt`). Declareren zonder doorgeven is per
 * definitie een dode draad — precies het defect uit H5.
 *
 * Deze test is bewust naam-gestuurd en niet lijst-gestuurd: een NIEUWE
 * briefing-prop wordt automatisch meegenomen zonder dat iemand deze test moet
 * bijwerken. Dat is het punt — de vorige keer werd de doorgifte juist vergeten.
 *
 * (Precedent voor het lezen van de bron: `horizon-client.euro-view.test.ts` en
 * `lib/fire-target-shared.test.ts`.)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE_PATH = join(process.cwd(), 'components', 'overview', 'overzicht-secondary.tsx')
const source = readFileSync(SOURCE_PATH, 'utf8')

/** Propdeclaraties in de props-interface, bv. `briefingDataChanged?: boolean`. */
const DECLARATION = /^\s*(briefing[A-Za-z0-9]*)\??:/gm

/**
 * De `<BriefingPanel …/>`-aanroep. We knippen op de zelfsluitende `/>` zodat
 * losse JSX eronder (de "alles bekijken"-linkenrij) niet meetelt en de test
 * niet per ongeluk groen wordt door een naam elders in het bestand.
 */
function extractBriefingPanelCall(src: string): string {
  const start = src.indexOf('<BriefingPanel')
  expect(start, 'geen <BriefingPanel>-aanroep gevonden in overzicht-secondary.tsx').toBeGreaterThan(-1)
  const end = src.indexOf('/>', start)
  expect(end, '<BriefingPanel>-aanroep is niet zelfsluitend').toBeGreaterThan(start)
  return src.slice(start, end + 2)
}

describe('overzicht-secondary — briefing-props bereiken BriefingPanel', () => {
  const declared = [...source.matchAll(DECLARATION)].map((m) => m[1])
  const call = extractBriefingPanelCall(source)

  it('declareert überhaupt briefing-props (anders is deze test zinloos groen)', () => {
    expect(declared.length).toBeGreaterThan(0)
    // Vangt het geval dat iemand de props hernoemt en deze grendel stil uitzet.
    expect(declared).toContain('briefingDataChanged')
  })

  it.each(declared.map((name) => [name] as const))(
    '%s wordt doorgegeven aan <BriefingPanel>',
    (name) => {
      expect(
        call.includes(name),
        `${name} is gedeclareerd maar komt niet voor in de <BriefingPanel>-aanroep — ` +
          `dode draad (zie H5). Geef 'm door of verwijder de prop.`,
      ).toBe(true)
    },
  )

  it('geeft dataChanged expliciet door (het versheidssignaal uit H5)', () => {
    expect(call).toMatch(/dataChanged=\{/)
  })
})
