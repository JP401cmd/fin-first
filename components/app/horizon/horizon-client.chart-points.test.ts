/**
 * Bron-grendel op de TIJDSTIP-conventie van de chart-punten in `horizon-client.tsx`.
 *
 * WAAROM EEN BRON-TEST: dit bestand is >9000 regels en bouwt op meerdere plekken
 * overlay-reeksen die op DEZELFDE leeftijds-as worden getekend als de hoofdlijn.
 * Een render-test kan één overlay controleren, maar niet uitsluiten dat er elders
 * nog een reeks met de andere conventie bijkomt — en juist dát is de fout: een
 * overlay die een jaar naast de hoofdlijn ligt, ziet er plausibel uit.
 * (Precedent: `horizon-client.euro-view.test.ts` leest de bron ook letterlijk.)
 *
 * DE CONVENTIE (één plek: `lib/horizon/sim-chart-geometry.ts#simRowsToChartPoints`):
 * een `SimRow{age: N}` beschrijft het leeftijdsJAAR N. `startPortfolio` is de stand
 * ÓP N, `endPortfolio` de stand aan het EIND van dat jaar — dus op N + 1. Een reeks
 * wordt daarom geplot als een seed `[rows[0].age, rows[0].startPortfolio]` gevolgd
 * door `[r.age + 1, r.endPortfolio]`. De hoofdlijn deed dit al
 * (`sim-chart-geometry.ts`); de overlays plotten `[r.age, r.endPortfolio]` en lagen
 * daardoor structureel één jaar links van de lijn waar ze tegen afgezet worden.
 *
 * Given  de overlay-reeksen in horizon-client (huishoud-partnerlijn, wat-als-
 *        scenario's, de doel-/wat-als-lijn).
 * When   we de bron lezen.
 * Then   geen enkele bouwt zijn punten nog met de rauwe `[r.age, r.endPortfolio]`-
 *        vorm; ze lopen allemaal door de gedeelde helper.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(
  join(process.cwd(), 'components/app/horizon/horizon-client.tsx'),
  'utf-8',
)

describe('horizon-client — chart-punten volgen de tijdstip-conventie', () => {
  it('bouwt geen overlay-punten meer met de rauwe [age, endPortfolio]-vorm', () => {
    // Vangt `[r.age, r.endPortfolio]` en varianten met andere rij-alias/whitespace.
    const rauw = SRC.match(/\[\s*\w+\.age\s*,\s*\w+\.endPortfolio\s*\]/g) ?? []
    expect(rauw).toEqual([])
  })

  it('bouwt elke rijen-gebaseerde overlay via de gedeelde helper', () => {
    // Drie overlay-reeksen leiden punten af uit SimRows: de huishoud-partnerlijn,
    // de wat-als-scenario's en de doel-/wat-als-lijn. De overige `points:`-regels
    // deflateren een al-gebouwde reeks (`deflatePoints`) en bouwen dus zelf geen
    // punten — ze tellen hier niet mee. Let op: "geen punten bouwen" betekent NIET
    // "niets te verifiëren": die regels dragen de tijd-SLEUTEL (`x - 1` resp. het
    // vooropgezette 1-element), en dat is precies waar de x-verschuiving van
    // `simRowsToChartPoints` doorwerkt. Die sleutels staan gepind in
    // `horizon-client.euro-view.test.ts`, niet hier.
    const helperAanroepen = (SRC.match(/simRowsToChartPoints\(/g) ?? []).length
    expect(helperAanroepen).toBeGreaterThanOrEqual(3)

    const puntReeksen = SRC.match(/^[ 	]*points:[ 	]*(.*)$/gm) ?? []
    const eigenBouw = puntReeksen.filter(
      (regel) => !/simRowsToChartPoints|deflatePoints/.test(regel),
    )
    expect(eigenBouw).toEqual([])
  })

  it('importeert de helper uit de canonieke geometrie-module', () => {
    // Booleans, geen toMatch op de bron: een falende toMatch dumpt hier 9000
    // regels in de testuitvoer en maakt de echte oorzaak onleesbaar.
    expect(SRC.includes('simRowsToChartPoints')).toBe(true)
    expect(SRC.includes("from '@/lib/horizon/sim-chart-geometry'")).toBe(true)
  })
})
