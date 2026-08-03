// ── Lokale vrije-tekst-extractie: gecondenseerde prompts ─────────────────────
//
// De cloud-prompt (`DEFAULT_EXTRACTION_PROMPT`, ~7,9k tekens ≈ 2.000 tokens)
// doet vier dingen tegelijk: rol, extractieregels, een tabel met standaard-
// rendementen/rentes/aflossingen, en drie volledig uitgeschreven voorbeelden.
// Voor Gemma 4 E2B in een venster van 8192 tokens is dat de verkeerde verdeling:
// de tabel is inmiddels TypeScript (local-extraction-defaults.ts) en de
// voorbeelden kosten meer dan ze opleveren bij een model dat sequentieel leest.
//
// DRIE MICRO-CALLS, NIET ÉÉN. De belangrijkste afkap-bron on-device is een lange
// uitvoer: de web-SDK kent geen `max_new_tokens`, dus een model dat besluit om
// bezittingen, schulden, plannen én context in één JSON-object te zetten, loopt
// halverwege het venster leeg en levert een afgekapte array op. Drie beurten op
// dezelfde sessie houden elke uitvoer onder ~300 tokens.
//
// SCHEMA-AFDWINGING ZONDER ZOD: er is lokaal geen constrained decoding. We
// hergebruiken het bewezen recept uit `buildCategorizeUserPrompt`
// (lib/ai/categorize-system-prompt.ts): letterlijk JSON-skelet, "zonder
// markdown-fences", en "begin met [ en eindig met ]".
//
// GEEN ADMIN-OVERRIDE. De cloud-extractie leest `app_settings
// .extraction_system_prompt` en gebruikt die in plaats van de default. Dat pad
// bestaat hier bewust NIET: een superadmin die daar een uitgebreide prompt in
// plakt, zou het zorgvuldig gecondenseerde budget stilzwijgend opblazen en de
// extractie op het toestel laten afkappen — zonder dat iemand het merkt. De
// override hoort bij het cloud-model dat er ruimte voor heeft.
//
// GEEN CLOUD-GUARDRAILS: on-device pad, geen egress (ADR 0043 §5). Wóórding
// hoort bij `ai-specialist-prompt-dna`; dit bestand bezit de assemblage.

import {
  EXTRACTION_ASSET_TYPES,
  EXTRACTION_DEBT_TYPES,
} from '@/lib/ai/extraction-schema'
import { LOCAL_EXTRACTION_EVENT_TYPES } from './local-extraction-defaults'

/** Profielcontext die het model helpt bij relatieve tijdsaanduidingen. */
export interface LocalExtractionContext {
  age?: number
  householdType?: string
  monthlyIncome?: number
  monthlyExpenses?: number
}

/**
 * Gedeelde systeem-DNA voor alle drie de beurten (~0,6k tekens ≈ 150 tokens).
 * Rol, de harde "verzin niets"-regel en het uitvoerformaat. De typelijsten en
 * getallen staan bewust NIET hier: die zitten in de beurt zelf (typelijst) of
 * in TypeScript (getallen).
 */
export const LOCAL_EXTRACTION_DNA = `Je bent de data-extractor van TriFinity, een Nederlandse app voor financiële vrijheid. Je leest een korte beschrijving die iemand over zijn eigen geldsituatie schrijft en haalt daar gestructureerde gegevens uit.

REGELS: extraheer UITSLUITEND wat er letterlijk staat. Verzin nooit een bedrag, een percentage of een gebeurtenis. Noem hetzelfde bezit maar één keer ("mijn huis", "koopwoning" en "eigen woning" zijn hetzelfde). Bedragen zijn euro's; "280k" betekent 280000. Staat er niets relevants, geef dan een lege lijst terug.

ANTWOORD ALTIJD met alleen JSON — geen uitleg, geen markdown-fences, geen \`\`\`.`

function contextBlock(ctx: LocalExtractionContext): string {
  const parts: string[] = []
  if (ctx.age != null) parts.push(`leeftijd ${ctx.age}`)
  if (ctx.householdType) parts.push(`huishouden ${ctx.householdType}`)
  if (ctx.monthlyIncome != null) parts.push(`maandinkomen €${Math.round(ctx.monthlyIncome)}`)
  if (ctx.monthlyExpenses != null) parts.push(`maanduitgaven €${Math.round(ctx.monthlyExpenses)}`)
  return parts.length > 0 ? `Bekend van deze persoon: ${parts.join(', ')}.\n\n` : ''
}

function textBlock(text: string): string {
  return `TEKST:\n${text.trim()}\n`
}

// ── Beurt 1 — bezittingen en schulden ───────────────────────────────────────

/**
 * Bezittingen én schulden in één beurt: ze staan in de tekst vrijwel altijd in
 * dezelfde zin ("koophuis van 350k met hypotheek van 280k") en los vragen zou
 * het model dwingen die zin twee keer te ontleden.
 *
 * Merk op wat er NIET gevraagd wordt: rendement, rente, aflossing, liquiditeit
 * en subtype. Dat zijn allemaal lookups die de app zelf doet
 * (local-extraction-defaults.ts) — het model levert per rij drie velden.
 */
export function buildAssetsDebtsPrompt(text: string, ctx: LocalExtractionContext = {}): string {
  return `${contextBlock(ctx)}${textBlock(text)}
Haal hier de bezittingen en de schulden uit.

SOORTEN bezitting: ${EXTRACTION_ASSET_TYPES.join(', ')}.
SOORTEN schuld: ${EXTRACTION_DEBT_TYPES.join(', ')}.
Twijfel je over de soort? Kies "other" — de gebruiker corrigeert het daarna zelf.

ANTWOORD: één JSON-array, begin met [ en eindig met ], geen andere tekst:
[{"soort":"bezit","naam":"Spaarrekening","type":"savings","bedrag":15000},{"soort":"schuld","naam":"Hypotheek","type":"mortgage","bedrag":280000}]
- "soort": exact "bezit" of "schuld"
- "naam": maximaal vier woorden
- "type": exact één woord uit de bijbehorende soortenlijst
- "bedrag": een positief getal zonder euroteken of punten`
}

// ── Beurt 2 — levensgebeurtenissen ──────────────────────────────────────────

/**
 * Alleen de SOORT en de leeftijd. Alle bedragen en looptijden komen uit
 * `LIFE_EVENT_CATALOG` — dezelfde bron die het formulier op /toekomst gebruikt.
 * Dat is exact de keuze die de lokale wat-als-suggesties ook maken
 * (local-whatif-prompt.ts): een klein model dat zelf "wat kost een kind"
 * invult, verzint.
 */
export function buildLifeEventsPrompt(text: string, ctx: LocalExtractionContext = {}): string {
  const leeftijdHint =
    ctx.age != null
      ? `Bij "over 5 jaar" tel je bij de bekende leeftijd op (${ctx.age} + 5 = ${ctx.age + 5}).`
      : 'Noem alleen een leeftijd als de tekst er één noemt.'

  return `${contextBlock(ctx)}${textBlock(text)}
Haal hier de toekomstplannen uit — alleen plannen die er echt staan.

SOORTEN: ${LOCAL_EXTRACTION_EVENT_TYPES.join(', ')}.
Past een plan bij geen enkele soort, laat het dan weg.
${leeftijdHint}

ANTWOORD: één JSON-array, begin met [ en eindig met ], geen andere tekst:
[{"soort":"children","leeftijd":35}]
- "soort": exact één woord uit de soortenlijst
- "leeftijd": een geheel getal, of null als de tekst geen leeftijd of termijn noemt`
}

// ── Beurt 3 — inkomen, uitgaven en de rest ──────────────────────────────────

/**
 * De kleinste beurt: twee getallen en één zin. Bewust apart gehouden — als deze
 * aan beurt 1 zou hangen, zou een lange bezittingenlijst 'm het venster uit
 * duwen en dan verdwijnt óók de context-zin die de gebruiker heeft ingetypt.
 */
export function buildIncomeExpensesPrompt(text: string, ctx: LocalExtractionContext = {}): string {
  return `${contextBlock(ctx)}${textBlock(text)}
Haal hier het maandinkomen, de maanduitgaven en de overige context uit.

Jaarbedragen deel je door 12. Noemt de tekst een bedrag niet, gebruik dan null — schat niets.
"context" is alles wat de gebruiker verder zegt en wat geen bezit, schuld of plan is: doelen, zorgen, werksituatie. Neem het over in zijn eigen woorden, maximaal één zin. Niets over? Lege string.

ANTWOORD: één JSON-object, begin met { en eindig met }, geen andere tekst:
{"inkomen":4200,"uitgaven":null,"context":"ZZP'er, wil eerder stoppen"}`
}
