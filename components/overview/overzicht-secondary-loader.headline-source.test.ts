/**
 * Bron-grendel op de HERKOMST van de kop-zin naast "De briefing" (UR2-09).
 *
 * WAAROM EEN BRON-TEST EN GEEN RENDER-TEST: het defect was niet dat de zin
 * verkeerd werd opgemaakt, maar dat hij uit de VERKEERDE BRON kwam. De
 * deterministische kop las het `totalLabel` van de bevroren week-snapshot,
 * terwijl elke andere vrijheids-uitdrukking op /overzicht live herrekende.
 * Gevolg op een net leeggemaakt account: "Je vermogen staat voor 113 jaar en 4
 * maanden aan vrijheid" naast een op-weg-balk van 0% en "0 dagen" — drie
 * waarden voor hetzelfde getal binnen vijf minuten, en de Ververs-knop raakte
 * het niet (die herschrijft alleen de briefjes).
 *
 * Elke unit-test op `buildBriefingHeadline` was gróén tijdens die bug: de
 * functie deed precies wat je haar voerde. Alleen een test op de NAAD — WELKE
 * waarde de loader erin stopt — vangt dit. Vandaar deze grendel, in de lijn van
 * `overzicht-secondary.briefing-props.test.ts` en `horizon-client.euro-view.test.ts`.
 *
 * DE INVARIANT: `buildBriefingHeadline` wordt gevoed met `freedomTotal` — het
 * LIVE `computeFreedomTotal` van dit request — en nooit met een waarde die uit
 * de week-snapshot komt. Dat de snapshot de kop mag OVERSCHRIJVEN blijft goed:
 * `snapshot.headline` is Fin's AI-kop en staat onder de zichtbare
 * "Bijgewerkt …"-stempel, dus die freeze is gedateerd en niet stilzwijgend.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE_PATH = join(
  process.cwd(),
  'components',
  'overview',
  'overzicht-secondary-loader.tsx',
)
const source = readFileSync(SOURCE_PATH, 'utf8')

/** Alle argumenten van elke `buildBriefingHeadline(...)`-aanroep. */
function headlineCallArgs(src: string): string[] {
  return [...src.matchAll(/buildBriefingHeadline\(([^)]*)\)/g)].map((m) => m[1].trim())
}

describe('overzicht-secondary-loader — kop-zin uit de canonieke live bron', () => {
  const calls = headlineCallArgs(source)

  it('roept buildBriefingHeadline aan (anders is deze grendel zinloos groen)', () => {
    expect(calls.length).toBeGreaterThan(0)
  })

  it.each(calls.map((arg, i) => [i, arg] as const))(
    'aanroep %i voedt de LIVE freedomTotal, niet een snapshot-waarde',
    (_i, arg) => {
      expect(
        arg,
        `buildBriefingHeadline(${arg}) — de kop-zin hoort de live computeFreedomTotal ` +
          `van dit request te krijgen (UR2-09).`,
      ).toBe('freedomTotal')
    },
  )

  it('leidt de kop-zin nergens af uit het bevroren vrijheidsmeetpunt', () => {
    // `snapshot.freedomSnapshot` mag blijven bestaan (versheidssignaal + e-mail),
    // maar nooit als invoer voor een zichtbare vrijheidsclaim op /overzicht.
    for (const arg of calls) {
      expect(arg).not.toMatch(/snapshot/i)
      expect(arg).not.toMatch(/freedomHero/i)
    }
  })

  it('bouwt geen week-vrijheid-hero meer voor /overzicht', () => {
    expect(source).not.toContain('buildFreedomHeroProps')
    expect(source).not.toContain('freedomHero')
  })
})
