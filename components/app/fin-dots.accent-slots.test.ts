import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * UR3-32, acceptatiecriterium 3 + 4: als de gebruiker zijn accenten wijzigt,
 * kleurt Fins linkeroog mee met Bezittingen, zijn rechteroog met Schulden en
 * zijn onderste stip met Budget — en Fins eigen accent blijft beperkt tot de
 * omtrek (bubbel, chat, /berichten, /nieuws).
 *
 * Die toewijzing is niet af te leiden uit de gerenderde DOM (de vars resolven
 * pas in de browser tot een kleur), maar wél uit de bron: elke stip leest
 * letterlijk één `var(--color-<accent>-500)`. Deze test pint die volgorde, dus
 * een latere veeg over de kleurnamen kan Fins gezicht niet stil omdraaien.
 */

const SRC = readFileSync(
  join(process.cwd(), 'components/app/fin-dots.tsx'),
  'utf8',
)

/** Alle `fill="var(--color-X-500)"` in bronvolgorde. */
function fillAccentsInOrder(src: string): string[] {
  return [...src.matchAll(/fill="var\(--color-([a-z]+)-500\)"/g)].map((m) => m[1])
}

describe('FinDots — vaste accent-toewijzing per stip', () => {
  it('de zes fills staan in de volgorde kern, kern, wil, wil, horizon, horizon', () => {
    // Per stip twee cirkels: eerst de trail (schaduw), dan de stip zelf.
    expect(fillAccentsInOrder(SRC)).toEqual([
      'kern', 'kern',       // linkeroog  = Bezittingen
      'wil', 'wil',         // rechteroog = Schulden
      'horizon', 'horizon', // onderste stip = Budget
    ])
  })

  it('de luisterring volgt de onderste stip (Budget)', () => {
    expect(SRC).toContain('stroke="var(--color-horizon-500)"')
  })

  it('Fins eigen accent kleurt geen enkele stip of ring', () => {
    const geverfd = [...SRC.matchAll(/(?:fill|stroke)="var\(--color-([a-z]+)-\d+\)"/g)]
      .map((m) => m[1])
    expect(new Set(geverfd)).toEqual(new Set(['kern', 'wil', 'horizon']))
  })
})

describe('Fins omtrek draagt wél zijn eigen accent', () => {
  const BUBBEL = readFileSync(
    join(process.cwd(), 'components/app/fin/fin-home.css'),
    'utf8',
  )

  it('de zwevende bubbel gebruikt --color-fin-*, niet meer het wil-accent', () => {
    expect(BUBBEL).toContain('var(--color-fin-200)')
    expect(BUBBEL).not.toContain('var(--color-wil-')
  })

  it('/berichten en /nieuws zetten hun route-accent op fin', () => {
    for (const route of ['berichten', 'nieuws']) {
      const layout = readFileSync(
        join(process.cwd(), `app/(app)/${route}/layout.tsx`),
        'utf8',
      )
      expect(layout, route).toContain("'var(--color-fin-500)'")
      expect(layout, route).not.toContain('--color-wil-')
    }
  })
})
