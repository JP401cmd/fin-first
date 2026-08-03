import { expect } from 'vitest'

/**
 * Broncontrole-helpers voor de streaming-vorm van server-pagina's
 * (perf Fase 2 — /overzicht/cashflow en zijn sub-pagina's).
 *
 * ## Waarom BRON-tests en geen gedragstests
 *
 * Het defect dat die taken wegnemen is niet "een verkeerd getal" maar "de eerste
 * byte komt pas na de traagste loader": alle loaders in één `Promise.all` bóven
 * de return. De uitkomst van de pagina is daar niet anders van — dezelfde HTML,
 * alleen seconden later. Een render-test kan dat per definitie niet zien; wat het
 * verschil máákt is de vorm van de module.
 *
 * En die vorm is precies wat stilletjes terugvalt. Eén `await createClient()` of
 * `await loadX()` erbij boven de return en de hele pagina wacht weer, terwijl de
 * `<Suspense>`-grenzen er nog volkomen correct uitzien.
 *
 * Deze twee helpers zijn gedeeld i.p.v. per pagina gekopieerd: `componentBody`
 * heeft één subtiele eigenschap (accolade-matching, zie hieronder) die in een
 * tweede kopie stil kan wegdrijven — en dan verwatert de "precies één await"-
 * assertie op de pagina die de kopie gebruikt, zonder dat iets rood wordt.
 * De eigenschap zelf staat vastgepind in `page-source.test.ts`.
 */

/** Strip block- en regelcommentaar, zodat proza in de kop niet meetelt. */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

/**
 * Het lichaam van de functie waarvan de declaratie met `signature` begint — tot
 * de MATCHENDE accolade, niet tot het einde van het bestand. Dat verschil telt:
 * met een slice tot EOF is "precies één await" gescoped op bestandspositie, en
 * zou de assertie stil verbreden zodra er iets áchter de component wordt gezet.
 *
 * Het commentaar gaat er eerst af, en de bron bevat geen accolades binnen
 * string-literals — zou dat veranderen, dan loopt de teller uit de pas en faalt
 * deze helper luid (geen sluitende accolade gevonden) in plaats van stil door.
 *
 * @param src        De volledige bestandsbron (mét commentaar).
 * @param signature  Begin van de functie-declaratie, bv.
 *                   `'export default async function OverzichtCashflowPage'`.
 */
export function componentBody(src: string, signature: string): string {
  const stripped = stripComments(src)
  const start = stripped.indexOf(signature)
  expect(start, `functie-declaratie "${signature}" niet gevonden`).toBeGreaterThan(-1)

  const open = stripped.indexOf('{', start)
  expect(open, 'geen openende accolade na de signature').toBeGreaterThan(-1)

  let depth = 0
  for (let i = open; i < stripped.length; i++) {
    if (stripped[i] === '{') depth++
    else if (stripped[i] === '}') {
      depth--
      if (depth === 0) return stripped.slice(open, i + 1)
    }
  }
  throw new Error(`geen matchende sluitende accolade voor "${signature}"`)
}
