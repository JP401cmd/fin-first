// ── Lokaal pensioen-uitlezen: prompt + blokindeling ──────────────────────────
//
// HERONTWERP, GEEN OMZETTING. Het cloud-pad (app/api/pension/parse/route.ts) is
// MULTIMODAAL: het stuurt de PDF zelf mee als `{type:'file'}` en het model KIJKT
// naar het document. On-device bestaat dat niet — `LocalChatMessage` is
// `{role, content: string}` en de bundel `gemma-4-E2B-it-web.litertlm` is de
// tekstvariant. Er is geen image-part en geen OCR in de repo.
//
// De lokale taak is daarom een ANDERE taak: pdfjs wint eerst deterministisch de
// tekstlaag (lib/pdf/extract-text.ts), en het model doet alleen nog
// tekst→JSON op platte tekst. Wat het model NIET doet: rekenen. Jaar→maand,
// NL-getalnotatie, euroteken en minteken zijn deterministisch in TS afgehandeld
// (local-pension-parse.ts) — hetzelfde principe als de cijfer-guardrail in
// parse-intent.ts: het model levert labels en tekst, de code levert getallen.
//
// WOORDING VS. ASSEMBLAGE. De condensatie hieronder is een lokale prompt voor
// een 2B-model, geboren uit `PENSION_PARSE_PROMPT` (lib/ai/pension-parse-prompt.ts).
// Dit bestand bezit de ASSEMBLAGE (blokindeling, budget, uitvoercontract). Moet
// er aan de FORMULERING iets veranderen, dan loopt dat via `ai-specialist-prompt-dna`.
//
// GEEN CLOUD-GUARDRAILS: on-device, geen egress. `sanitizeForAI`/`maskPIIInOutput`/
// token-logging zijn N.V.T. (ADR 0043 §5). De aanroeper draait wél
// `stripSensitiveData` over de tekstlaag: niet omdat het moet (er vertrekt
// niets), maar omdat een BSN nergens in een promptstring hoeft te staan.

/**
 * De gecondenseerde lokale pensioen-DNA.
 *
 * Drie bewuste afwijkingen van de cloud-prompt:
 *  - GEEN markdown-koppen en geen genummerde proza-lijst. Een 2B-model volgt
 *    "per veld één regel" merkbaar beter dan een opsomming met sub-bullets.
 *  - GEEN rekeninstructie. De cloud-prompt zegt "deel door 12 als het per jaar
 *    staat"; dat is precies wat je een klein model níet moet vragen. Hier vraagt
 *    de prompt het BEDRAG ZOALS HET ER STAAT plus een losse `periode`-label, en
 *    doet TS de conversie.
 *  - EXPLICIETE UITVOER-DISCIPLINE, woordelijk in de stijl van
 *    `buildCategorizeUserPrompt`: uitsluitend JSON, geen fences, begin met { en
 *    eindig met }. Zonder die zin komt er structureel proza omheen.
 *
 * De prompt vraagt precies ÉÉN regeling per aanroep, omdat de blokindeling
 * hieronder per regeling snijdt. Eén plat object per call houdt elke aanroep ver
 * onder het promptbudget en voorkomt de afkap-faalmodus van lange arrays.
 */
export const LOCAL_PENSION_DNA = `Je leest Nederlandse pensioenoverzichten van mijnpensioenoverzicht.nl.
Je krijgt de ruwe tekstlaag van EEN blok uit zo'n overzicht. De kolommen kunnen door elkaar staan.
Haal uit dit blok precies EEN pensioenregeling en geef deze velden:
fondsNaam: naam van het pensioenfonds, de verzekeraar of de uitvoerder, letterlijk uit de tekst.
bedrag: het bruto pensioenbedrag als tekst, exact zoals het er staat, met punten en komma's.
periode: "maand" of "jaar" — de periode die bij dat bedrag hoort.
ingangLeeftijd: de leeftijd waarop dit pensioen ingaat, als heel getal.
geindexeerd: true als er staat dat het pensioen waardevast of geindexeerd is, anders false.
type: ouderdomspensioen, nabestaandenpensioen, arbeidsongeschiktheidspensioen of overig.
Weet je een veld niet zeker, zet dan null. Verzin niets.
Reken niets uit: deel geen bedragen door twaalf en tel niets op — dat doet de app.
Staat er geen pensioenregeling in dit blok, antwoord dan {"leeg": true}.
Antwoord UITSLUITEND met een geldig JSON-object, zonder extra tekst en zonder markdown-fences. Begin je antwoord direct met { en eindig met }.`

/**
 * Minimale hoeveelheid tekst waarbij we een PDF als "heeft een tekstlaag"
 * beschouwen. Dezelfde drempelgedachte als `MIN_TEXT_LENGTH` in
 * lib/aangifte/extract-aangifte-data.ts (50): daaronder is het vrijwel altijd een
 * gescande of gefotografeerde pagina, en die is on-device onleesbaar — er is
 * geen OCR en het tekstmodel kan geen afbeelding bekijken.
 *
 * Bewust wat hoger dan 50: een UPO met tekstlaag levert al op de eerste pagina
 * honderden tekens op, terwijl een scan soms een handvol losse tekens uit een
 * watermerk of een ingesloten formulierveld teruggeeft. 200 zit ruim boven die
 * ruis en ruim onder een echte tekstlaag.
 */
export const MIN_PENSION_TEXT_LENGTH = 200

/**
 * Maximum aantal tekens dat één blok mee de prompt in gaat.
 *
 * Budget-rekensom (~4 tekens per token, de schatting die ook
 * `scripts/ai-parity/scan.mjs` hanteert): de DNA hierboven is ~330 tokens en de
 * omkadering van de gebruikersprompt ~25. Met 2.800 tekens (~700 tokens) blok
 * komt één aanroep op ~1.055 prompt-tokens — onder de ~1.200 die we onszelf
 * opleggen, en ruim binnen het 8192-contextvenster van de runtime.
 */
export const MAX_PENSION_BLOCK_CHARS = 2800

/**
 * Minimale bloklengte. Een snipper van een paar tekens (paginanummer,
 * kopregel) kost een volledige decode van tientallen seconden en levert
 * gegarandeerd `{"leeg": true}` op. Die slaan we over.
 */
export const MIN_PENSION_BLOCK_CHARS = 60

/**
 * Ankers waarop een pagina in meerdere regeling-blokken wordt gesneden.
 *
 * WAAROM PER REGELING EN NIET PER DOCUMENT: het hele overzicht in één prompt is
 * bij een UPO van drie pagina's al enkele duizenden tokens, en dwingt het model
 * tot een array — precies de vorm waar de afkap-faalmodus uit `parse.ts` op
 * loert. Per regeling één plat object is korter, robuuster, en een mislukt blok
 * kost hoogstens één regeling in plaats van het hele document.
 *
 * De ankers zijn de woorden waarmee een UPO een nieuwe uitvoerder aankondigt.
 * Ze zijn bewust RUIM: een gemist anker kost niets (dan blijft het één groter
 * blok), een te vaak gevonden anker levert kleinere blokken die elk nog steeds
 * los te lezen zijn.
 */
const REGELING_ANKERS =
  /(?=\b(?:pensioenuitvoerder|pensioenfonds|pensioenverzekeraar|uitvoerder|verzekeraar|werkgever|pensioenregeling)\b)/gi

/** Normaliseer witruimte: pdfjs levert veel dubbele spaties en harde spaties. */
function normalizeWhitespace(text: string): string {
  return text.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim()
}

/**
 * Knip een te lang blok in stukken van hoogstens {@link MAX_PENSION_BLOCK_CHARS},
 * bij voorkeur op een spatie zodat er geen woord (en dus geen bedrag) doormidden
 * valt.
 */
function hardWrap(block: string): string[] {
  if (block.length <= MAX_PENSION_BLOCK_CHARS) return [block]
  const out: string[] = []
  let rest = block
  while (rest.length > MAX_PENSION_BLOCK_CHARS) {
    const window = rest.slice(0, MAX_PENSION_BLOCK_CHARS)
    // Zoek de laatste spatie in de achterste 20% — knip liever iets vroeger dan
    // midden in "1.234,56".
    const breakAt = window.lastIndexOf(' ', MAX_PENSION_BLOCK_CHARS)
    const cut = breakAt > MAX_PENSION_BLOCK_CHARS * 0.8 ? breakAt : MAX_PENSION_BLOCK_CHARS
    out.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) out.push(rest)
  return out
}

/**
 * Deel de per-pagina-tekstlaag op in blokken die elk hoogstens één regeling
 * horen te bevatten.
 *
 * Puur (geen pdfjs, geen model) → los unit-testbaar. Volgorde:
 *   1. per pagina normaliseren;
 *   2. snijden op de regeling-ankers (paginagrens is sowieso al een grens);
 *   3. te korte fragmenten weggooien, te lange hard afkappen.
 *
 * Levert een lege lijst wanneer er niets bruikbaars in zit — de aanroeper mag
 * dan GEEN modelaanroep doen (zie de resolver: fail-closed, eerlijke melding).
 */
export function splitPensionBlocks(pages: string[]): string[] {
  const blocks: string[] = []

  for (const rawPage of pages) {
    const page = normalizeWhitespace(rawPage)
    if (!page) continue

    // `split` met een lookahead-regex houdt het anker zélf bij het volgende
    // stuk, zodat de fondsnaam niet aan het vorige blok blijft plakken.
    const parts = page.split(REGELING_ANKERS)
    for (const part of parts) {
      const trimmed = part.trim()
      if (trimmed.length < MIN_PENSION_BLOCK_CHARS) continue
      blocks.push(...hardWrap(trimmed))
    }
  }

  return blocks
}

/**
 * Het gebruikersbericht voor één blok. Kort gehouden: de instructie zit al in de
 * systeem-preface ({@link LOCAL_PENSION_DNA}) en elke herhaling kost decode-tijd
 * die on-device in seconden telt.
 */
export function buildLocalPensionUserPrompt(block: string): string {
  return `BLOK:\n${block}\n\nGeef nu het JSON-object.`
}
