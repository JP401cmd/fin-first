/**
 * Bron-grendel op de copy van de WhatIf-beslishulp (`whatif-beslishulp.tsx`).
 *
 * WAAROM DEZE TEST BESTAAT: de beslishulp zet drie legitieme bestemmingen voor extra
 * maandgeld naast elkaar op de EIGEN cijfers van de gebruiker. Dat is precies het
 * oppervlak waar inzicht in vergunningsplichtig advies kan omslaan. Twee dingen zijn
 * daarbij hard verboden:
 *  1. het woord "gegarandeerd" — een absolute rendements-/zekerheidsclaim, expliciet
 *     op de verboden-lijst in `.claude/skills/compliance-check/SKILL.md` (§De claimlijst);
 *  2. een vergelijkend oordeel tussen twee legitieme geldkeuzes ("kleiner dan beleggen",
 *     "winnaar", "beter") — de regel uit `lib/ai/dna/base.ts` (§BEPERKINGEN): benoem het
 *     feit beschrijvend, laat de keuze aan de gebruiker.
 *
 * WAAROM EEN BRON-TEST EN GEEN RENDER-TEST: de kaarten ontstaan pas na een volledige
 * kernel-run (`computeWhatifProjection`) met profiel, assets, AOW-rijen en scenario-events;
 * de aflossen-kaart bestaat bovendien alleen mét actieve schuld. Een render-test zou die
 * hele bundel moeten optuigen om één zin te bewijzen, en zou de doc-comments — waar de
 * verboden claim óók stond — juist niet zien. Precedent: `horizon-client.wat-hoort-daarbij.test.ts`.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE_PATH = join(process.cwd(), 'components', 'app', 'horizon', 'whatif-beslishulp.tsx')

function source(): string {
  return readFileSync(SOURCE_PATH, 'utf8')
}

describe('whatif-beslishulp — blijft binnen de Wft-grens (inzicht, geen advies)', () => {
  it('gebruikt het woord "gegarandeerd" nergens — ook niet in een doc-comment', () => {
    // Comments tellen mee: de formulering in de doc-block was de bron waaruit de
    // zichtbare copy is overgenomen. Laat je 'm daar staan, dan komt hij terug.
    expect(source().toLowerCase()).not.toContain('gegarandeerd')
  })

  it('velt geen vergelijkend oordeel tussen de bestemmingen', () => {
    const src = source().toLowerCase()
    for (const verboden of [
      /\bwinnaar\b/,
      /\bwint\b/,
      /\bbeter dan\b/,
      /\bde beste\b/,
      /\bverstandig/,
      /\bslimste\b/,
      /\bvrijheidswinst dan\b/,
      /\bje moet\b/,
      /\bwij raden\b/,
      /\bons advies\b/,
    ]) {
      expect(src, `oordelende formulering in de bron: ${verboden}`).not.toMatch(verboden)
    }
  })

  it('draagt de app-brede disclaimer-conventie', () => {
    expect(source()).toContain('Indicatie, geen advies —')
  })

  it('laat de keuze expliciet bij de gebruiker', () => {
    expect(source()).toContain('Wat bij jou past, kies je zelf')
  })

  it('markeert de vroegste uitkomst beschrijvend, niet als prijs', () => {
    const src = source()
    // "Snelst" op een gekleurde badge leest als een winnaarslabel; de marker hoort te
    // benoemen wát er gemeten is (de vroegste vrijheidsdatum van de doorrekening).
    expect(src).toContain('Vroegst vrij')
    expect(src).not.toMatch(/>\s*Snelst\s*</)
  })
})
