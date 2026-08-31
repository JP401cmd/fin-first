import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Borgt UR2-02: een afgebroken of overgeslagen bezittingen-stap laat GEEN
 * spookrecords achter.
 *
 * Twee invarianten, allebei structureel in de save-route:
 *
 *  1. GEEN VERZONNEN BEZIT. De route seedde tot aug 2026 een placeholder-rij
 *     van € 0 ("Lopende rekening" / "Beleggingsrekening") zodra de modules
 *     `budgetteren` of `aandelenregistratie` actief waren zonder bijpassend
 *     asset-type — óók als de gebruiker de hele stap had overgeslagen. Dat gaf
 *     "Totale waarde € 0 · 2 bezittingen" en een groen afgevinkte welkomst-stap
 *     voor iemand die niets had ingevuld. Alleen door de gebruiker bevestigde
 *     posten mogen de database in.
 *
 *  2. OPRUIMEN STAAT BUITEN DE INSERT-GUARD. De non-cash cleanup-delete zat ín
 *     `if (quickAssets.length > 0)`. Zolang invariant 1 nog gold hield de
 *     seeding die lijst altijd op ≥ 1 en viel dat niet op; zónder seeding is de
 *     lijst bij "overslaan" écht leeg en zouden de non-cash rijen van een
 *     eerdere, gestrande poging blijven staan — precies het defect uit de kaart,
 *     alleen via een andere deur. De delete hoort dus vóór de guard, net als de
 *     cash-delete ernaast.
 *
 * Bron-scan i.p.v. de handler importeren: die trekt de AI-extractielaag mee.
 * Zelfde idioom als `route.test.ts` hiernaast.
 */
describe('onboarding save-own-data — geen placeholder-bezittingen (UR2-02)', () => {
  const routePath = path.resolve(__dirname, 'route.ts')
  const source = readFileSync(routePath, 'utf8')

  // Strip line- en block-commentaar: de comments noemen de verwijderde namen
  // bewust nog, als waarschuwing tegen herintroductie.
  const codeOnly = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')

  it('seedt geen placeholder-bezitting met een verzonnen naam', () => {
    expect(codeOnly).not.toMatch(/Lopende rekening/)
    expect(codeOnly).not.toMatch(/Beleggingsrekening/)
  })

  it('kent geen module-seeding-helper meer', () => {
    expect(codeOnly).not.toMatch(/applyModuleSeeding/)
  })

  it('vult quickAssets uitsluitend met de door de gebruiker bevestigde posten', () => {
    expect(codeOnly).toMatch(
      /const quickAssets:\s*AssetQuickInput\[\]\s*=\s*rawQuickAssets\s*\?\?\s*\[\]/,
    )
  })

  it('ruimt non-cash bezittingen op vóór (niet binnen) de insert-guard', () => {
    const deleteIdx = codeOnly.indexOf(".neq('asset_type', 'cash')")
    const guardIdx = codeOnly.indexOf('if (quickAssets.length > 0)')

    expect(deleteIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeGreaterThan(-1)
    expect(deleteIdx).toBeLessThan(guardIdx)
  })
})
