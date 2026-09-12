// lib/ai/vaste-kosten-kandidaten.ts
//
// WELKE GEDETECTEERDE PATRONEN MOGEN NAAR DE AI-BEOORDELING?
//
// Eén regel, twee bestemmingen: de cloud-leverancier en het on-device model.
// Hij woont hier en niet in `app/api/subscriptions/analyse-ai/route.ts` omdat een
// App Router-`route.ts` alleen HTTP-handlers mag exporteren — een regel die daar
// staat is per constructie niet los te testen, en dit is precies een regel die
// getest hoort te worden: hij bepaalt welke tegenpartijnamen het pand verlaten.

import { isPatternStale, type DetectedRecurring } from '@/lib/recurring-detection'

/**
 * Draagt deze post een naam die we HERKENNEN — dus een merk uit
 * `CATEGORY_PATTERNS` — in plaats van een onherkende tegenpartij?
 *
 * `detectCategory` valt terug op `other_expense`/`other_income` als geen enkele
 * regel matchte. Dat is dus precies de "onbekende naam"-sentinel. LET OP: er is
 * géén categorie `'other'` — wie daarop filtert, filtert niets weg.
 */
export function heeftHerkendeNaam(categorie: string): boolean {
  return categorie !== 'other_expense' && categorie !== 'other_income'
}

/**
 * Filtert de kandidatenlijst voor de vaste-kosten-analyse.
 *
 * EIGENAARSBESLUIT 12-09-2026. Sinds V-001 gaan óók de 'low'-kandidaten mee ter
 * beoordeling — dat is de toegevoegde waarde van een AI-oordeel: juist de
 * twijfelgevallen. Maar de 'low'-staart bestaat grotendeels uit ONHERKENDE
 * tegenpartijen, en dat zijn de privébetalingen: twee overboekingen naar
 * "M. de Vries" (een lening, alimentatie, een Marktplaats-aankoop) vormen samen
 * een 'low'-patroon en gingen zo als naam + bedrag naar een AI-leverancier.
 *
 * `sanitizeForAI` dekt dit NIET af: die strípt de eigen naam van de gebruiker en
 * generieke PII (IBAN, e-mail, telefoon, adres), maar laat de tegenpartijnaam
 * bewust staan — een handelsnaam is precies wat de classificatie mogelijk maakt.
 * Bij een particuliere naam is diezelfde eigenschap het lek.
 *
 * Daarom is de snede niet "is het zeker genoeg?" maar "kénnen we deze naam?".
 *
 * `lokaal: true` (de `candidatesOnly`-modus) HOUDT DE VOLLE LIJST: daar is geen
 * leverancier. De lijst gaat naar de eigen browser van de gebruiker over dezelfde
 * geauthenticeerde verbinding als elke andere pagina, en het model draait
 * on-device. De begrenzing tóch toepassen zou de privacy-modus een slechter
 * resultaat geven dan de cloud — omgekeerd aan wat hij belooft.
 *
 * REIKWIJDTE — alleen de 'low'-tak. Een 'high'/'medium'-kandidaat met een
 * onherkende naam ging vóór dit besluit ook al mee (het filter was toen puur
 * `confidence !== 'low'`); die grens verschuift hier niet, anders zou dit besluit
 * stilzwijgend bestaand gedrag inperken.
 */
export function selectVasteKostenAiKandidaten<
  T extends Pick<DetectedRecurring, 'confidence' | 'suggestedCategory'> &
    Partial<Pick<DetectedRecurring, 'frequency' | 'dates'>>,
>(kandidaten: T[], opts: { lokaal: boolean; now?: Date }): T[] {
  const now = opts.now ?? new Date()

  // STILGEVALLEN PATRONEN VALLEN AF — beide paden (eigenaarsbesluit 12-09-2026).
  // Een opgezegd abonnement zakt sinds de staarttermijn naar 'low' en verdwijnt uit
  // het totaal, maar een herkende merknaam liet hem hier alsnog door: hij kwam terug
  // als voorstel, en bevestigen zette hem wéér in het totaal. Dat is geen privacy-
  // maar een relevantiegrens, dus hij geldt ook on-device; een lijst met dingen die
  // je niet meer betaalt is voor niemand nuttig. Ontbreekt de datum, dan geldt een
  // patroon niet als stilgevallen — nooit iets weggooien op een gebrek aan gegevens.
  const levend = kandidaten.filter(
    (d) => !isPatternStale(d.frequency ?? '', d.dates?.[d.dates.length - 1], now),
  )

  if (opts.lokaal) return levend
  return levend.filter(
    (d) => d.confidence !== 'low' || heeftHerkendeNaam(d.suggestedCategory),
  )
}
