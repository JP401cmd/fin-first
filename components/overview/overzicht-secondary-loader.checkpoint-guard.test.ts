/**
 * Bron-grendel op de RICHTING-UITSLUITING in het checkpoint-filter van
 * `OverzichtSecondaryLoader` (ADR 0125).
 *
 * WAAROM EEN BRON-TEST EN GEEN GEDRAGSTEST: het filter dat bepaalt welke
 * doelen een 25/50/75%-checkpoint mogen krijgen zit INLINE in een grote async
 * server-component-functie (`OverzichtSecondaryLoader`) die zelf niet als pure
 * functie is geëxporteerd — hij bouwt de volledige /overzicht-secundaire data
 * op met tientallen Supabase-aanroepen, mijlpaal-detectie en snapshot-writes.
 * Een behaviorale test zou de complete RSC-pijplijn moeten stubben; dat is
 * buiten de scope van deze taak (test-only wijzigingen) en zou vooral de
 * mock-bekabeling testen, niet de guard zelf. Het dichtstbijzijnde testbare
 * niveau is daarom een bron-grendel, in de lijn van
 * `overzicht-secondary-loader.headline-source.test.ts`.
 *
 * DE INVARIANT (bevinding, 1 sep 2026): zonder deze uitsluiting kon een
 * `direction: 'down'`-doel (vrijheidsleeftijd, schuldenvrij-datum,
 * belastingdruk) met een streefdatum ≥2 jaar in één render 25/50/75%
 * tegelijk laten vuren — `pct = target/current` staat bij zo'n doel al hoog
 * wanneer de gebruiker er nog ver vanaf zit, en de mijlpalenlog is
 * APPEND-ONLY: eenmaal geschreven rijen zijn niet meer te herstellen zonder
 * de rij handmatig te verwijderen. `!isParameterGoal` dekte dit vroeger per
 * toeval (het enige down-type was `fire_age`, en dat was lab-exclusief); sinds
 * een gebruiker zelf een down-doel kan aanmaken is de herkomst-uitsluiting
 * niet meer genoeg en moet de RICHTING zelf worden uitgesloten.
 *
 * De losse bouwstenen zijn wél apart getest: `isFarHorizonGoal` in
 * `lib/milestones/detect.test.ts`, `GOAL_TYPE_META[...].direction` in
 * `lib/goal-data.test.ts`. Deze grendel bewijst dat de loader ze ook
 * daadwerkelijk SAMEN toepast, op de checkpoint-tak.
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

/**
 * Het blok tussen "Checkpoint-doelen (plan 3c)" en de `.map(({ goal, progress })`
 * die er na de filter-keten op volgt — precies de `.filter(...)`-body die
 * bepaalt welke doelen een checkpoint-mijlpaal mogen krijgen.
 */
function checkpointFilterBlock(src: string): string {
  const start = src.indexOf('Checkpoint-doelen (plan 3c)')
  expect(start, 'checkpoint-doelen-blok niet gevonden — is de loader herschreven?').toBeGreaterThan(-1)
  const mapAfter = src.indexOf('.map(({ goal, progress })', start)
  expect(mapAfter, 'einde van het checkpoint-filter-blok niet gevonden').toBeGreaterThan(start)
  return src.slice(start, mapAfter)
}

describe('overzicht-secondary-loader — checkpoint-filter sluit down-richting uit (ADR 0125)', () => {
  const block = checkpointFilterBlock(source)

  it('sluit parameter-doelen uit (lab-doelsituatie, geen persoonlijk checkpoint)', () => {
    expect(block).toMatch(/!isParameterGoal\(goal\)/)
  })

  it('sluit de RICHTING zelf uit — niet alleen de herkomst', () => {
    // De harde regel: een `down`-doel (fire_age/debt_free_date/tax_burden) mag
    // nooit door dit filter komen, ook niet als het geen parameter-doel is.
    expect(block).toMatch(/GOAL_TYPE_META\[goal\.goal_type\]\?\.direction\s*!==\s*'down'/)
  })

  it('combineert de richting-uitsluiting met de eigen-doel- en horizon-toetsen (geen losstaand dood stuk code)', () => {
    // Alle vier de voorwaarden moeten in DEZELFDE filter-keten staan, anders
    // bewijst de aanwezigheid van de regex hierboven niets over wat er
    // daadwerkelijk toegepast wordt op de checkpoint-doelen.
    expect(block).toMatch(/goal\.user_id === userId/)
    expect(block).toMatch(/isFarHorizonGoal\(/)
    const directionIdx = block.search(/GOAL_TYPE_META\[goal\.goal_type\]\?\.direction\s*!==\s*'down'/)
    const farHorizonIdx = block.indexOf('isFarHorizonGoal(')
    expect(directionIdx).toBeGreaterThan(-1)
    // De richting-uitsluiting staat vóór de isFarHorizonGoal-toets in dezelfde
    // `&&`-keten (leesvolgorde van de guard, niet functioneel vereist, maar
    // een wijziging die de volgorde omgooit hoort deze test bewust te raken).
    expect(directionIdx).toBeLessThan(farHorizonIdx)
  })

  it('importeert GOAL_TYPE_META (anders zou de guard-regex hierboven een dode letterlijke string zijn)', () => {
    expect(source).toMatch(/import\s*\{[^}]*GOAL_TYPE_META[^}]*\}\s*from\s*['"]@\/lib\/goal-data['"]/)
  })
})
