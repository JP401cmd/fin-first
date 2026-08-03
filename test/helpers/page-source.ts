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

/**
 * Strip block- en regelcommentaar, zodat proza in de kop niet meetelt.
 *
 * BEPERKING: regelcommentaar wordt alleen aan het REGELBEGIN herkend — de regex
 * ankert op `^` met hooguit witruimte ervoor. Een TRAILING comment, bv.
 * `const x = 1` gevolgd door een dubbele slash en "niet via loadDashboardData",
 * blijft dus staan en kan een import-assertie vals doen falen. Dat is de veilige
 * kant (een valse positief, nooit een stilzwijgende verzwakking), en bewust zo:
 * een dubbele slash middenin een regel is net zo goed een URL of een regex, en
 * die wegknippen zou juist wél code kunnen verminken. Loop je ertegenaan,
 * verplaats dan het commentaar naar zijn eigen regel.
 */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

/**
 * Het lichaam van de functie waarvan de declaratie met `signature` begint — tot
 * de MATCHENDE accolade, niet tot het einde van het bestand. Dat verschil telt:
 * met een slice tot EOF is "precies één await" gescoped op bestandspositie, en
 * zou de assertie stil verbreden zodra er iets áchter de component wordt gezet.
 *
 * De body begint ná de PARAMETERLIJST, niet bij de eerste `{` na de signature.
 * Dat is geen detail: een page-component met gedestructureerde props
 * (`function Page({ searchParams })` — de normaalvorm zodra een pagina
 * searchParams/params leest) zet daar een accolade die niets met het lichaam te
 * maken heeft. Zonder de haakjes-matching zou de "body" dan de parameterlijst
 * zijn: de await-telling komt op 0 uit en de test wordt groen om de verkeerde
 * reden. Vandaar eerst `(` … `)` matchen, dan pas naar `{` zoeken.
 *
 * Twee bekende grenzen, allebei luid en niet stil:
 *  · De bron mag geen accolades/haakjes binnen string-literals dragen — zou dat
 *    veranderen, dan loopt de teller uit de pas en faalt deze helper met "geen
 *    matchende sluitende accolade" i.p.v. door te gaan.
 *  · Een inline object-return-type (`): { a: number } {`) zou de eerste `{` ná de
 *    parameterlijst opeisen. Komt in page-components niet voor; verschijnt het
 *    toch, dan valt dat direct op in de gestripte body.
 *
 * @param src        De volledige bestandsbron (mét commentaar).
 * @param signature  Begin van de functie-declaratie, bv.
 *                   `'export default async function OverzichtCashflowPage'`.
 */
export function componentBody(src: string, signature: string): string {
  const stripped = stripComments(src)
  const start = stripped.indexOf(signature)
  expect(start, `functie-declaratie "${signature}" niet gevonden`).toBeGreaterThan(-1)

  // Eerst de parameterlijst overslaan — zie de doc-comment hierboven.
  const paramsOpen = stripped.indexOf('(', start)
  expect(paramsOpen, 'geen parameterlijst na de signature').toBeGreaterThan(-1)

  let parenDepth = 0
  let paramsClose = -1
  for (let i = paramsOpen; i < stripped.length; i++) {
    if (stripped[i] === '(') parenDepth++
    else if (stripped[i] === ')') {
      parenDepth--
      if (parenDepth === 0) {
        paramsClose = i
        break
      }
    }
  }
  expect(paramsClose, 'geen matchende sluit-haak voor de parameterlijst').toBeGreaterThan(-1)

  const open = stripped.indexOf('{', paramsClose)
  expect(open, 'geen openende accolade na de parameterlijst').toBeGreaterThan(-1)

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
