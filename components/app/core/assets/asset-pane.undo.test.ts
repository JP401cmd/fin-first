/**
 * Bron-grendel op de "Ongedaan maken"-toast van de bezitting-delete (M7).
 *
 * WAAROM EEN BRON-TEST EN GEEN RENDER-TEST: `asset-pane.tsx` importeert
 * `components/core/assets-client` (detail-modal, form, valuation-modal) en doet
 * bij mount een batch-fetch via de Supabase-browserclient. Een render-test die
 * de verwijderknop echt indrukt, moet die hele omgeving wegmocken — inclusief
 * `<ShellOverlay>`, want de verwijderknop is een header-action daarvan. Wat je
 * dan test is voornamelijk je eigen mock-scaffolding, niet de wiring.
 *
 * Het defect uit M7 was juist heel scherp omschreven: de bevestigingsdialoog
 * én de succes-toast beloven "je kunt deze bezitting later weer toevoegen",
 * maar de `addToast`-call had geen `action`. De belofte stond in de tekst, de
 * weg terug ontbrak. Deze test grendelt precies dat: de succes-toast van
 * `handleDelete` DRAAGT een undo-actie, die undo roept het restore-endpoint
 * aan, en de actie leunt niet op state die na het sluiten van de pane weg is.
 * (Precedent voor de vorm: `components/app/horizon/horizon-client.euro-view.test.ts`.)
 *
 * Regel 4 is de minst voor de hand liggende en de reden dat dit meer is dan
 * een tekstcontrole: de toast overleeft de pane (`finishSuccessfully()` roept
 * `onClose()` aan), dus een `onClick` die `currentAsset.id` uitleest, leest die
 * pas ná het sluiten uit — op een component dat er dan niet meer is. De id en
 * naam moeten vóór de toast in locals vastgepind zijn.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE_PATH = join(
  process.cwd(),
  'components',
  'app',
  'core',
  'assets',
  'asset-pane.tsx',
)

const source = readFileSync(SOURCE_PATH, 'utf8')

/**
 * Het blok van `handleDelete` — vanaf de declaratie tot de dependency-array
 * die 'm afsluit. Alle assertions hieronder kijken uitsluitend binnen dit blok,
 * zodat een undo-knop die ergens ánders in het bestand zou staan de test niet
 * groen maakt.
 */
function handleDeleteBlock(): string {
  const start = source.indexOf('const handleDelete = useCallback(')
  expect(start, 'handleDelete niet gevonden in asset-pane.tsx').toBeGreaterThan(-1)
  const end = source.indexOf('[currentAsset, addToast, onClose, onChanged, router])', start)
  expect(end, 'einde van handleDelete (deps-array) niet gevonden').toBeGreaterThan(start)
  return source.slice(start, end)
}

/** De succes-tak: van de `addToast` mét de belofte tot `finishSuccessfully()`. */
function successToastBlock(): string {
  const block = handleDeleteBlock()
  const start = block.indexOf('Je kunt deze bezitting later weer toevoegen.')
  expect(start, 'de belofte-tekst staat niet meer in de succes-toast').toBeGreaterThan(-1)
  const end = block.indexOf('finishSuccessfully()', start)
  expect(end, 'succes-tak eindigt niet op finishSuccessfully()').toBeGreaterThan(start)
  return block.slice(start, end)
}

describe('asset-pane — undo op de verwijder-toast (M7)', () => {
  it('1. de succes-toast draagt een actie met het label "Ongedaan maken"', () => {
    const tak = successToastBlock()
    expect(tak).toMatch(/action:\s*\{/)
    expect(tak).toMatch(/label:\s*'Ongedaan maken'/)
  })

  it('2. die actie roept het restore-endpoint aan met PATCH + het restore-contract', () => {
    const tak = successToastBlock()
    // Zonder de PATCH is de knop een lege belofte — precies het defect.
    expect(tak).toMatch(/fetch\(`\/api\/assets\/\$\{deletedId\}`/)
    expect(tak).toMatch(/method:\s*'PATCH'/)
    // Het body-contract van `app/api/assets/[id]/route.ts` is `.strict()`; een
    // afwijkende payload levert een 400 en dus een stille kapotte undo-knop.
    expect(tak).toMatch(/JSON\.stringify\(\{\s*action:\s*'restore'\s*\}\)/)
  })

  it('3. de toast blijft langer staan dan de 4s-default — undo is de enige weg terug', () => {
    const tak = successToastBlock()
    const match = tak.match(/duration:\s*(\d+)/)
    expect(match, 'succes-toast zet geen expliciete duration').not.toBeNull()
    expect(Number(match![1])).toBeGreaterThan(4000)
  })

  it('4. de actie leest geen state die na het sluiten van de pane weg is', () => {
    const tak = successToastBlock()
    // De toast overleeft `onClose()`. Alles wat de onClick nodig heeft, moet
    // dus vóór de toast in een local zijn vastgepind.
    expect(tak).not.toMatch(/currentAsset\./)
    const block = handleDeleteBlock()
    expect(block).toMatch(/const deletedId = currentAsset\.id/)
    expect(block).toMatch(/const deletedName = currentAsset\.name/)
  })

  it('5. een mislukte undo meldt via de error-envelope, nooit een rauwe melding', () => {
    const tak = successToastBlock()
    expect(tak).toMatch(/Ongedaan maken mislukt/)
    // De tekst komt uit `data.error` (platte envelope, ADR 0044) met een
    // generieke terugval — geen `err.message` in de UI.
    expect(tak).toMatch(/typeof data\?\.error === 'string'/)
    expect(tak).not.toMatch(/\berr(or)?\.message\b/)
  })
})
