import { readFileSync } from 'node:fs'

/**
 * Leest een bronbestand voor bron-scan-tests, met regeleinden genormaliseerd
 * naar LF.
 *
 * WAAROM: bron-scan-tests matchen de LETTERLIJKE inhoud van bronbestanden
 * (comment-stripping, kolomprojectie, enum-extractie) met regex-idiomen als
 * `.replace(/\/\/.*$/gm, '')` of `.split('\n').map(line => line.replace(...))`.
 * Op een verse checkout met `core.autocrlf=true` eindigt elke regel op
 * `\r\n`. JS-regex `.` matcht geen regeleinde-teken (dus ook geen `\r`), en
 * `$` — óók in /m-modus — matcht alleen vlak vóór `\n` of aan het einde van
 * de string, nooit vóór een los `\r`. Het gevolg: de comment-strip slaat
 * stil terug (geen match, dus geen vervanging), de comment blijft in de
 * "codeOnly"-string staan, en een scan die op comment-inhoud let (positief
 * óf negatief) geeft een foutief resultaat — zonder dat de test faalt op de
 * ontwikkelmachine zelf, want die checkout is meestal gemengd of LF.
 *
 * Empirisch herbewezen (analyse 2 sep 2026, kaart CRLF-scan-tests): een
 * node-simulatie met een volledig-CRLF kopie van
 * `lib/household/partner-items-projection.test.ts`'s brontekst laat de
 * `AS $function$`-slice verschuiven en een verboden kolomnaam uit
 * commentaar de assertie in lekken.
 *
 * Gebruik deze helper overal waar een bron-scan-test `readFileSync(path,
 * 'utf8')` zou doen en de inhoud vervolgens met regex bewerkt of matcht.
 * `.gitattributes` (`* text=auto eol=lf`) lost de checkout zelf al op; deze
 * helper is de tweede verdedigingslaag — voor bestanden die de checkout-regel
 * kunnen omzeilen (bv. via een editor/tool die zelf CRLF schrijft) en om de
 * tests hier verifieerbaar te maken zonder van een specifieke checkout-state
 * afhankelijk te zijn.
 */
export function readSourceLF(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
}
