// ── Lokale mini-rekenhulp: gecondenseerde prompt + de vier deelbeurten ───────
//
// WAAROM DIT BESTAND BESTAAT (en niet gewoon de cloud-prompt hergebruikt):
// `buildSystemPrompt()` uit lib/ai/build-calculator.ts is 12.090 tekens ≈ 3.023
// tokens, en die route begroot haar eigen uitvoer op 4.000-7.000 tokens
// (`maxOutputTokens: 8000`). Samen ~9.150 tokens. Het lokale model heeft 8.192
// tokens IN TOTAAL (in + out samen). Pariteit is dus niet "moeilijk" maar
// rekenkundig onmogelijk — met `refineFrom` erbij loopt het op naar ~10.600.
//
// Daarom is de taak hersneden in plaats van verkleind:
//  1. Een GEREDUCEERD SCHEMA (lib/ai/local/local-calculator-schema.ts): één
//     scenario, ≤4 inputs, ≤3 outputs, geen derived, geen narrative, geen enum-
//     inputs. Dat brengt de uitvoer van 4-7k naar ~500-900 tokens én haalt in
//     één klap de moeilijkste integriteitsregels weg (cycles, {output:key}-
//     placeholders, appliesWhen, compare).
//  2. VIER KLEINE BEURTEN op één sessie in plaats van één grote generatie. De
//     echte moeilijkheid van deze taak zit namelijk niet in de JSON maar in de
//     KRUISVERWIJZINGEN: elke naam in elke formule moet uit de eigen inputs of
//     uit exact één van de 13 prefill-keys komen. De cloud heeft daar al een
//     auto-retry voor nodig; lokaal kost een retry minuten. Door eerst de
//     grootheden te laten benoemen, dan de prefill-keys te laten KIEZEN (gesloten
//     keuze) en pas dáárna de formules te vragen — met de toegestane namen
//     letterlijk in de opdracht — is de kruisverwijzing grotendeels weg-ontworpen.
//
// WAT ER BIJ HET INDIKKEN IS GESNEUVELD (bewust): de TOOLBOX-sectie (die gaat
// over derived/narrative/appliesWhen/compare — allemaal niet in het lokale
// schema), de TRIFINITY-FILOSOFIE-sectie (conditionele vrijheidstijd-output; een
// extra output past niet in het budget en is optioneel in de cloud óók) en de
// OPMAAK-LOCK (die verdedigt tegen opmaak-verzoeken in een vrije chat; hier
// vraagt elke beurt om een vast JSON-skelet).
//
// WAT NIET MOCHT SNEUVELEN: de HOOFDREGEL (ingedikt), de HARDE REGEL over
// verzonnen variabelen, de functie-whitelist, de 13 prefill-keys en — niet
// onderhandelbaar — de COMPLIANCE-alinea (educatief reken-instrument, geen
// persoonlijk advies, geen productadvies).
//
// GEEN CLOUD-GUARDRAILS: on-device pad (WebGPU/Gemma), geen egress.
// `sanitizeForAI`/`maskPIIInOutput`/token-logging zijn N.V.T. (ADR 0043 §5).
// Wóórding hoort bij `ai-specialist-prompt-dna`; dit bestand bezit de assemblage.

import { PREFILL_KEYS } from '@/lib/calculator/user-data-keys'
import { LOCAL_MAX_FORMULA_CHARS, LOCAL_MAX_INPUTS, LOCAL_MAX_OUTPUTS } from './local-calculator-schema'

/** De 13 prefill-keys als compacte promptregels (één bron: user-data-keys.ts). */
const PREFILL_LIST = PREFILL_KEYS.map((k) => `- ${k.key} (${k.unit}): ${k.description}`).join('\n')

/**
 * Gecondenseerde rekenhulp-DNA voor het on-device model — de systeem-preface van
 * de vier-beurten-sessie. Bevat rol, de ingedikte HOOFDREGEL, de HARDE REGEL over
 * verzonnen namen, de functie-whitelist, de 13 prefill-keys en de COMPLIANCE-
 * alinea. Zie de kop van dit bestand voor wat er bewust NIET in zit.
 *
 * De gemeten omvang (tekens/4) staat in de rapportage van de bouwsessie; hij is
 * BEWUST niet in `parity-manifest.json` opgenomen — dat manifest bewaakt de
 * chat-DNA tegen drift met lib/ai/dna/*, en deze prompt heeft een andere bron
 * (lib/ai/build-calculator.ts).
 */
export const LOCAL_CALCULATOR_DNA = `Je bent Fin, de reken-assistent van TriFinity. Samen met de gebruiker bouw je één kleine rekenhulp, in vier korte stappen. Je schrijft NOOIT code — per stap lever je alleen de gevraagde JSON.

HOOFDREGEL: beantwoord uitsluitend wat de gebruiker vraagt. Verzin geen tegenscenario's, fiscale lagen of alternatieven die hij niet noemde. "Hoe lang duurt het tot mijn schuld weg is?" wordt looptijd en rentekosten — geen beleggingsvergelijking, geen hypotheekrenteaftrek, geen box 3, geen inflatiecorrectie. Twijfel je of iets erbij hoort? Laat het weg. Kort en scherp is beter dan breed.

HARDE REGEL — geen verzonnen namen. Elke naam in een formule moet vooraf zijn gedeclareerd: een input die je in stap 1 zelf hebt gemaakt, of een prefill-key uit de lijst hieronder (exact overgenomen, kleine letters). Namen als brandstofkosten, bijtelling, afschrijving of btw_tarief bestaan NIET vanzelf. Heb je zo'n grootheid nodig, maak er dan in stap 1 een input van. Staat hij daar niet, dan mag hij niet in een formule.

FORMULES: pure wiskunde, geen code. Toegestane functies: compound(bedrag, rente, jaren), fvAnnuity(maandinleg, rente, jaren), annuity(hoofdsom, rente, jaren), box3(grondslag, forfait, tarief), pow, sqrt, min, max, abs, round, floor, ceil, if(voorwaarde, a, b). Operatoren: + - * / ^ en vergelijkingen binnen if(). Rentes en percentages zijn FRACTIES: 6% schrijf je als 0.06.

PREFILL-KEYS — de enige gegevens die de app al van de gebruiker heeft:
${PREFILL_LIST}

COMPLIANCE (Wft): dit is een educatief reken-instrument, geen persoonlijk financieel of belastingadvies. Presenteer uitkomsten neutraal; geen koop- of verkoopadvies en geen productadvies.

UITVOER: antwoord per stap met UITSLUITEND de gevraagde JSON-array. Geen uitleg eromheen, geen markdown-fences, geen denkstappen. Begin met [ en eindig met ]. Nederlandse labels.`

/**
 * Ruw plafond op de uitvoer per deelstap. De web-SDK kent géén per-call
 * `max_new_tokens` (zie litert-runtime.ts), dus dit getal begrenst niets
 * technisch — het houdt de contract-signatuur van `LocalSession.generate` gelijk
 * en documenteert waar we op mikken. De échte begrenzing is de opdrachtvorm:
 * één klein JSON-skelet per beurt.
 */
export const LOCAL_CALC_MAX_NEW_TOKENS = 320

/**
 * Boven deze duur loggen we een waarschuwing per deelstap. Gemeten gedrag: na
 * ~3 minuten aaneengesloten GPU-last hangt het toestel; opgeknipt in korte calls
 * bleef dezelfde belasting 25 minuten stabiel. We kappen de call NIET af — de
 * generatie loopt op een gedeelde GPU-wachtrij door en een "afgebroken" call zou
 * de volgende stap alleen maar achter zichzelf laten wachten. We meten en melden.
 */
export const LOCAL_CALC_STEP_WARN_MS = 60_000

/** Label per deelstap — voedt de voortgangsregel in de UI. */
export const LOCAL_CALC_STEP_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: 'Welke gegevens heeft je vraag nodig?',
  2: 'Wat kunnen we uit jouw gegevens vullen?',
  3: 'De formules opstellen',
  4: 'Naam en aannames',
}

/**
 * STAP 1 — welke grootheden moet de gebruiker zelf kunnen instellen?
 *
 * Bewust de éérste vraag: zolang de inputs niet vastliggen, kan geen enkele
 * formule geldig zijn. Alles wat het model hier declareert is later een geldige
 * naam — dat is precies de kruisverwijzing die de cloud-route met een retry moet
 * repareren.
 */
export function buildLocalCalcStep1(question: string): string {
  return `STAP 1 van 4. De vraag van de gebruiker:
"${question}"

Welke ${LOCAL_MAX_INPUTS === 4 ? '2 tot 4' : `1 tot ${LOCAL_MAX_INPUTS}`} grootheden moet de gebruiker zelf kunnen instellen om deze vraag te beantwoorden? Alleen grootheden die je écht nodig hebt.

Antwoord met UITSLUITEND deze JSON-array:
[{"key": "<snake_case>", "label": "<Nederlands label>", "kind": "euro|percent|years|number", "default": <getal>}]

kind "percent" betekent een fractie: 6% is 0.06. Geef altijd een realistische default.`
}

/**
 * STAP 2 — welke prefill-keys passen bij de zojuist gemaakte inputs?
 *
 * GESLOTEN KEUZE. Het model mag hier alleen KIEZEN uit de 13 keys, niet
 * verzinnen; de keuze wordt in TypeScript nog eens tegen `PREFILL_KEY_SET`
 * gehouden. Dit is de stap die "prefill-key die lijkt op maar niet exact is"
 * — de klassieke faalmodus van de cloud-route — onmogelijk maakt.
 */
export function buildLocalCalcStep2(inputKeys: readonly string[]): string {
  return `STAP 2 van 4. Je hebt deze inputs gemaakt: ${inputKeys.join(', ')}.

Welke daarvan zijn dezelfde grootheid als een prefill-key uit de lijst in je instructies? Dan vult de app die waarde alvast in uit de gegevens van de gebruiker.

KIES uitsluitend uit de prefill-keys die je hebt gekregen — schrijf ze exact over. Verzin geen nieuwe keys. Past er bij een input niets, laat die input dan gewoon weg. Past er nergens iets, antwoord dan met [].

Antwoord met UITSLUITEND deze JSON-array:
[{"input": "<een van jouw input-keys>", "prefill": "<een key uit de lijst>"}]`
}

/**
 * STAP 3 — de output-formules, met de toegestane namen LETTERLIJK in de opdracht.
 *
 * De namenlijst wordt hier herhaald (en niet aan de sessie-historie overgelaten)
 * om twee redenen: een klein model leest sequentieel en hecht het meest aan wat
 * vlak vóór de generatie staat, én deze herhaling maakt de beurt zelfstandig —
 * na een sessieherstel kan dezelfde stap opnieuw zonder de historie.
 */
export function buildLocalCalcStep3(question: string, allowedNames: readonly string[]): string {
  return `STAP 3 van 4. De vraag was: "${question}"

Geef 1 tot ${LOCAL_MAX_OUTPUTS} uitkomsten die deze vraag beantwoorden.

In de formules mag je UITSLUITEND deze namen gebruiken:
${allowedNames.join(', ')}
Plus de toegestane functies uit je instructies. Elke andere naam is fout en maakt de hele rekenhulp ongeldig. Houd elke formule korter dan ${LOCAL_MAX_FORMULA_CHARS} tekens.

Antwoord met UITSLUITEND deze JSON-array:
[{"key": "<snake_case>", "label": "<Nederlands label>", "formula": "<wiskundige expressie>", "format": "euro|percent|years|number"}]`
}

/**
 * STAP 4 — naam, korte omschrijving en aannames.
 *
 * Bewust als laatste: pas als de inputs en formules vastliggen, weet het model
 * welke vereenvoudigingen het feitelijk heeft gemaakt. Andersom (naam eerst)
 * levert aannames op die nergens op slaan.
 */
export function buildLocalCalcStep4(question: string): string {
  return `STAP 4 van 4. De vraag was: "${question}"

Geef een korte naam voor deze rekenhulp, één zin uitleg, en 1 tot 3 aannames die je hebt gemaakt (gebruikte tarieven, vereenvoudigingen, kosten die je buiten beschouwing laat).

Antwoord met UITSLUITEND deze JSON-array met precies één object:
[{"name": "<max 8 woorden>", "description": "<één zin>", "assumptions": ["<aanname>"]}]`
}
