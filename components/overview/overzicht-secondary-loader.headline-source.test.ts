/**
 * Bron-grendel op de HERKOMST van de kop-zin naast "De briefing" (UR2-09, ADR 0126).
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
 * DE INVARIANT (sinds ADR 0126 PR B op de runway): `buildBriefingHeadline` wordt
 * gevoed met `runway` — het LIVE `computeHorizonRunway(supabase, perspective)` van
 * dit request (de "stop nu"-onttrekkingsprojectie uit de kernel) — en nooit met
 * een waarde die uit de week-snapshot komt, en ook niet meer met de platte
 * `computeFreedomTotal`-deling. Dat de snapshot de kop mag OVERSCHRIJVEN blijft
 * goed: `snapshot.headline` is Fin's AI-kop en staat onder de zichtbare
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

/** Verwijder commentaar vóór het matchen — de toelichting citeert de oude vormen. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}
const code = stripComments(source)

/** Alle argumenten van elke `buildBriefingHeadline(...)`-aanroep. */
function headlineCallArgs(src: string): string[] {
  return [...src.matchAll(/buildBriefingHeadline\(([^)]*)\)/g)].map((m) => m[1].trim())
}

describe('overzicht-secondary-loader — kop-zin uit de canonieke live bron', () => {
  const calls = headlineCallArgs(code)

  it('roept buildBriefingHeadline aan (anders is deze grendel zinloos groen)', () => {
    expect(calls.length).toBeGreaterThan(0)
  })

  it.each(calls.map((arg, i) => [i, arg] as const))(
    'aanroep %i voedt de LIVE runway van dit request, niet een snapshot- of deling-waarde',
    (_i, arg) => {
      expect(
        arg,
        `buildBriefingHeadline(${arg}) — de kop-zin hoort de live computeHorizonRunway ` +
          `van dit request te krijgen (UR2-09, ADR 0126).`,
      ).toBe('runway')
    },
  )

  it('de runway komt uit computeHorizonRunway op het PERSPECTIEF van dit request (perspectief-correct, live)', () => {
    expect(code).toMatch(/computeHorizonRunway\(\s*supabase\s*,\s*perspective\s*\)/)
  })

  it('leidt de kop-zin nergens af uit het bevroren vrijheidsmeetpunt of de platte deling', () => {
    // `snapshot.freedomSnapshot` en `freedomTotal` mogen blijven bestaan
    // (versheidssignaal + e-mail + week-meetpunt; PR C ruimt ze op), maar nooit
    // als invoer voor de zichtbare vrijheidsclaim op /overzicht.
    for (const arg of calls) {
      expect(arg).not.toMatch(/snapshot/i)
      expect(arg).not.toMatch(/freedomHero/i)
      expect(arg).not.toMatch(/freedomTotal/i)
    }
  })

  it('de AI-kop uit de snapshot mag de deterministische zin nog steeds overschrijven (gedateerde freeze)', () => {
    expect(code).toMatch(/if \(snapshot\.headline\) briefingHeadline = snapshot\.headline/)
  })

  it('bouwt geen week-vrijheid-hero meer voor /overzicht', () => {
    expect(source).not.toContain('buildFreedomHeroProps')
    expect(source).not.toContain('freedomHero')
  })
})
