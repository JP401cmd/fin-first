// ── Lokale wat-als-suggesties: gecondenseerde prompt ─────────────────────────
//
// De cloud-route (app/api/whatif/suggest/route.ts) laat het model acht velden
// per suggestie invullen, waarvan er vijf numeriek zijn. Voor een 2B-model
// on-device is dat de verkeerde taak: die vijf getallen zijn geen redeneerwerk
// maar een CATALOGUS-LOOKUP (LIFE_EVENT_CATALOG + computeSuggestedEventValues),
// en alles wat een klein model daar zelf van maakt is per definitie verzonnen.
//
// Daarom is de taak hersneden: het model levert UITSLUITEND
// `{event_type, name, explanation}` — een keuze uit een gesloten lijst plus twee
// stukjes taal. Alle bedragen, leeftijden en looptijden worden daarna
// deterministisch in TypeScript opgelost (parse-whatif-suggestions.ts). Dat
// maakt de uitvoer ~4× korter én haalt de hallucinatie-euro's er in één klap uit.
//
// SCHEMA-AFDWINGING ZONDER ZOD: er is lokaal geen constrained decoding. We
// hergebruiken het bewezen recept uit `buildCategorizeUserPrompt`
// (lib/ai/categorize-system-prompt.ts): letterlijk JSON-skelet, "UITSLUITEND een
// geldige JSON-array … zonder markdown-fences", en "begin met [ en eindig met ]".
//
// GEEN CLOUD-GUARDRAILS: on-device pad, geen egress (ADR 0043 §5).
// Wóórding hoort bij `ai-specialist-prompt-dna`; dit bestand bezit de assemblage.

/**
 * De gesloten lijst met soorten waaruit het model mag kiezen — letterlijk
 * dezelfde opsomming als de cloud-prompt (`buildSuggestionPrompt`,
 * lib/whatif-suggestions.ts), met één uitzondering: `custom` valt af. Die soort
 * heeft per definitie geen catalogus-bedragen, dus een `custom`-voorstel zou
 * altijd op een lege kaart (0/0/0) uitkomen — en een kaart zonder cijfers is
 * ruis in een scenario-scherm dat juist over effect gaat.
 */
export const LOCAL_WHATIF_EVENT_TYPES = [
  'sabbatical',
  'world_trip',
  'children',
  'renovation',
  'study',
  'career_change',
  'part_time',
  'early_retirement',
  'house_purchase',
  'house_sale',
  'wedding',
  'move',
  'car_purchase',
  'inheritance',
  'side_hustle',
  'werkloosheid',
  'schenking',
] as const

export type LocalWhatifEventType = (typeof LOCAL_WHATIF_EVENT_TYPES)[number]

/** Snelle lidmaatschapstest voor de enum-filter in de parser. */
export const LOCAL_WHATIF_EVENT_TYPE_SET: ReadonlySet<string> = new Set(LOCAL_WHATIF_EVENT_TYPES)

/** Maximaal aantal voorstellen dat we tonen (gelijk aan de cloud-route). */
export const LOCAL_WHATIF_MAX_SUGGESTIONS = 3

/**
 * Gecondenseerde wat-als-DNA (~0,9k tekens ≈ 230 tokens). Rol, de harde
 * "noem zelf geen getallen"-regel, de gesloten soortenlijst en de toon. De
 * instructie-staart van de cloud-prompt is bewust ingedikt en de enum staat als
 * kommalijst — een klein model leest sequentieel en verliest zich in proza.
 */
export const LOCAL_WHATIF_DNA = `Je bent Fin, de scenario-assistent van TriFinity, een Nederlandse app voor financiële vrijheid. De gebruiker verschuift iets in een wat-als-scenario; jij stelt levensgebeurtenissen voor die daar logisch bij passen — gevolgen van de wijziging (minder werken betekent meer vrije tijd) of iets wat de gebruiker vergeet mee te nemen.

REGELS: kies UITSLUITEND een soort uit de lijst hieronder, exact zoals geschreven. Noem NOOIT zelf bedragen, percentages, leeftijden of looptijden — de app vult die zelf in uit haar eigen catalogus; jij levert alleen de soort, een korte naam en één zin uitleg. Stel nooit een gebeurtenis voor die al actief is. Je geeft geen beleggings- of productadvies: noem geen aandelen, crypto, fondsen, banken of verzekeraars.

SOORTEN: ${LOCAL_WHATIF_EVENT_TYPES.join(', ')}.

TOON: Nederlands, je/jij, concreet en bemoedigend — denk in vrijheid en tijd, niet in beperking. De naam is maximaal vier woorden, de uitleg is één zin van maximaal twintig woorden zonder cijfers.`

/** JSON-skelet — letterlijk in de prompt, zoals bij de lokale categorisatie. */
const LOCAL_WHATIF_SCHEMA =
  '[{"event_type": "<soort-uit-de-lijst>", "name": "<max 4 woorden>", "explanation": "<één NL-zin zonder cijfers>"}]'

/**
 * Bouw de gebruikersbeurt: de scenario-wijzigingen, de al actieve
 * gebeurtenissen en de harde uitvoer-instructie.
 *
 * @param changes           Delta-regels uit `buildSuggestionChanges`
 *                          (lib/whatif-suggestions.ts) — dezelfde bron als cloud.
 * @param activeEventNames  Namen van gebeurtenissen die al in het scenario staan.
 * @param max               Bovengrens van het aantal voorstellen.
 */
export function buildLocalWhatifUserPrompt({
  changes,
  activeEventNames,
  max = LOCAL_WHATIF_MAX_SUGGESTIONS,
}: {
  changes: string[]
  activeEventNames: string[]
  max?: number
}): string {
  return [
    'De gebruiker past een wat-als-scenario aan met de volgende wijzigingen:',
    ...(changes.length > 0 ? changes.map((c) => `- ${c}`) : ['- (geen noemenswaardige wijziging)']),
    '',
    activeEventNames.length > 0
      ? `Al actieve gebeurtenissen: ${activeEventNames.join(', ')}`
      : 'Geen gebeurtenissen actief.',
    '',
    `Geef 1 tot ${max} voorstellen. Antwoord UITSLUITEND met een geldige JSON-array van maximaal ${max} objecten, zonder extra tekst en zonder markdown-fences:`,
    LOCAL_WHATIF_SCHEMA,
    "Begin je antwoord direct met '[' en eindig met ']'.",
  ].join('\n')
}

/** Volledige systeemprompt voor het lokale wat-als-suggestiepad. */
export function buildLocalWhatifSystemPrompt(): string {
  return LOCAL_WHATIF_DNA
}
