/**
 * PII-uitvoerfilter voor een STREAMENDE tekst — streaming-variant van
 * `maskPIIInOutput` (lib/ai/pii-output-filter.ts).
 *
 * WAAROM DIT BESTAAT. `maskPIIInOutput` is een functie over een volledige tekst.
 * De chat levert die tekst in fragmenten (`text-delta`), en een IBAN of BSN valt
 * vrijwel altijd over een fragmentgrens: "NL91 " | "ABNA 0417 " | "1643 00".
 * Per fragment maskeren vindt daar niets — het filter zou dan opnieuw stil
 * niets doen, precies het defect dat deze module hoort te verhelpen. Daarom
 * houdt dit filter per tekstblok een KORTE STAART vast tot vaststaat dat die
 * geen begin van een patroon meer kan zijn.
 *
 * WELKE STAART. Beide patronen uit `pii-output-filter.ts` hebben een herkenbare
 * aanhef: een IBAN begint op een woordgrens met twee letters gevolgd door twee
 * controlecijfers en daarna groepen van vier; een BSN is een run cijfers. Alleen
 * zo'n aanhef wordt vastgehouden — gewone woorden ("spaarquote", "op koers")
 * matchen niet en stromen onvertraagd door. De maximale staart is per
 * constructie ~44 tekens (de langste IBAN mét spaties).
 *
 * CONTEXT VOOR DE VALS-POSITIEF-REM. `maskPIIInOutput` kijkt bij een 9-cijferig
 * getal naar de vijf tekens ervóór (€/EUR/,/.) om bedragen niet te maskeren. Bij
 * een gesplitste stroom staat dat teken in een eerder vrijgegeven fragment, dus
 * we plakken de laatst vrijgegeven tekens er tijdelijk vóór en knippen ze na de
 * maskering weer af. Zonder die context wordt "€123456789" alsnog gemaskeerd
 * zodra het bedrag toevallig over een grens breekt.
 */

import { maskPIIInOutput } from './pii-output-filter'

/**
 * Aanhef van een IBAN: landcode (1-2 letters op een woordgrens), dan de
 * controlecijfers, dan groepen van vier. Elke stap is optioneel maar alleen ná
 * de vorige — "op koers" is dus géén aanhef (na de landcode moet een cijfer
 * volgen), "NL91 ABNA 04" wél.
 */
const IBAN_AANHEF = String.raw`\b[A-Za-z]{1,2}(?:[ ]?\d(?:\d(?:[ ]?(?:[A-Za-z0-9]{4}[ ]?){0,7}[A-Za-z0-9]{0,3})?)?)?`

/**
 * Aanhef van een BSN: een run van maximaal negen cijfers, plus het
 * scheidingsteken waarop `maskPIIInOutput` besluit een groot getal NIET te
 * maskeren. Dat teken hoort bij de staart, anders valt de beslissing anders uit
 * dan bij dezelfde tekst in één stuk.
 */
const BSN_AANHEF = String.raw`\b\d{1,9}[.,]?`

/** Staart aan het EIND van de buffer die nog tot een patroon kan uitgroeien. */
const PII_PENDING = new RegExp(`(?:${IBAN_AANHEF}|${BSN_AANHEF})$`)

/**
 * Plafond op de vastgehouden staart. Per constructie onbereikbaar (de langste
 * aanhef is ~44 tekens), maar het houdt een toekomstige patroonwijziging ervan
 * af de stream te laten stokken.
 */
const MAX_PENDING = 48

/**
 * Aantal tekens context dat vóór de maskering wordt geplakt. `maskPIIInOutput`
 * kijkt vijf tekens terug; acht geeft marge zonder een tweede patroon te kunnen
 * vormen.
 */
const CONTEXT = 8

/** Lengte van de nog niet vrij te geven staart (0 als de tekst veilig is). */
export function pendingPIITailLength(text: string): number {
  const match = PII_PENDING.exec(text)
  if (!match) return 0
  return Math.min(match[0].length, MAX_PENDING)
}

export type PIITextFilter = {
  /** Maskeer één tekst-delta van tekstblok `id`; geeft terug wat vrij mag. */
  delta(id: string, text: string): string
  /** Sluit tekstblok `id` af: maskeer de staart plus `trailing` en geef die terug. */
  end(id: string, trailing?: string): string
}

/**
 * Streaming-variant van `maskPIIInOutput`: houdt per tekstblok een korte staart
 * vast zodat een IBAN of BSN die over een chunkgrens valt alsnog wordt herkend.
 *
 * Per `id` en niet globaal, om dezelfde reden als de emoji-variant: één antwoord
 * kan meerdere tekstblokken hebben (tekst → tool-call → tekst).
 */
export function createPIITextFilter(): PIITextFilter {
  const pending = new Map<string, string>()
  /** Laatst vrijgegeven tekens per tekstblok — context voor de vals-positief-rem. */
  const context = new Map<string, string>()

  /** Maskeer `tekst` mét de eerder vrijgegeven context als lookbehind. */
  function maskeer(id: string, tekst: string): string {
    if (!tekst) return tekst
    const prefix = context.get(id) ?? ''
    let uit: string
    if (prefix) {
      const samen = maskPIIInOutput(prefix + tekst)
      // Raakte de context zelf gemaskeerd, dan klopt de knip niet meer; val dan
      // terug op maskeren zónder context (strenger, nooit lekkender).
      uit = samen.startsWith(prefix) ? samen.slice(prefix.length) : maskPIIInOutput(tekst)
    } else {
      uit = maskPIIInOutput(tekst)
    }
    if (uit) context.set(id, (prefix + uit).slice(-CONTEXT))
    return uit
  }

  return {
    delta(id: string, text: string): string {
      const buffered = (pending.get(id) ?? '') + text
      const tailLength = pendingPIITailLength(buffered)
      if (tailLength > 0) {
        pending.set(id, buffered.slice(buffered.length - tailLength))
      } else {
        pending.delete(id)
      }
      const safe = tailLength > 0 ? buffered.slice(0, buffered.length - tailLength) : buffered
      return maskeer(id, safe)
    },
    end(id: string, trailing = ''): string {
      const rest = (pending.get(id) ?? '') + trailing
      const uit = maskeer(id, rest)
      pending.delete(id)
      context.delete(id)
      return uit
    },
  }
}
