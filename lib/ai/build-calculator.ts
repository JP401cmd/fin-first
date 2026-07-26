// ── Rekenhulp — AI-generatie van CalculatorDefinition ──────────────
//
// Fin produceert een gestructureerde CalculatorDefinition (geen code)
// op basis van een vrije gebruikersvraag. Volgt exact het patroon van
// extract-financial-data.ts: getModel(supabase) → generateObject.
//
// Faalt gracieus: bij AI-fout of ongeldige formules wordt een
// foutobject teruggegeven i.p.v. te throwen, zodat de UI een nette
// melding kan tonen.

import { generateObject, NoObjectGeneratedError, APICallError } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AIConfigError, getModel } from '@/lib/ai/config'
import { sanitizeForAI } from '@/lib/ai/sanitize'
import {
  CalculatorDefinitionSchema,
  type CalculatorDefinition,
} from '@/lib/calculator/types'
import { validateFormulas, validateNarrative } from '@/lib/calculator/evaluate'
import { PREFILL_KEYS, PREFILL_KEY_SET } from '@/lib/calculator/user-data-keys'

export type BuildCalculatorResult =
  | { ok: true; definition: CalculatorDefinition }
  | { ok: false; error: string }

export function buildSystemPrompt(): string {
  const prefillList = PREFILL_KEYS.map(
    (k) => `  - ${k.key} (${k.unit}): ${k.description}`,
  ).join('\n')

  return `Je bent Fin, de reken-assistent van TriFinity. Je bouwt een
herbruikbare rekenhulp (calculator) als gestructureerde definitie — NOOIT
als code. De gebruiker beschrijft een financieel vraagstuk; jij vertaalt
dat naar inputs, scenario's, afgeleide context en output-formules.

═════════════════════════════════════════════════════════════════════
HOOFDREGEL — Beantwoord uitsluitend wat de gebruiker vraagt
═════════════════════════════════════════════════════════════════════

Verzin GEEN tegenscenario's, fiscale aspecten, aftrekposten of
alternatieven die de gebruiker niet noemde. Een rekenhulp die wordt
gevraagd voor "schuld aflossen" rekent SCHULD AFLOSSEN — niet
"aflossen vs. beleggen", niet "met HRA-effect", niet "vergelijking
met box 3". Pas vergelijken, fiscale lagen of alternatieve routes
toe ALS de vraag daar expliciet om vraagt.

**Concreet**:
  - "Hoe lang duurt het tot ik mijn schuld heb afgelost?" → 1 scenario,
    outputs: looptijd + totale rentekosten. Geen beleggings-alternatief,
    geen HRA, geen belasting.
  - "Aflossen of beleggen?" → 2 scenario's want EXPLICIET vergeleken.
  - "Wat kost mijn auto over 5 jaar?" → 1 scenario, kosten-breakdown.
    Geen lease-vergelijking tenzij gevraagd.
  - "Verhuren in box 1 of box 3?" → 2 scenario's want EXPLICIET fiscaal
    vergeleken.

**Wat niet ongevraagd toevoegen**:
  ✗ Hypotheekrente-aftrek (HRA) als de vraag niet over hypotheek gaat
  ✗ Box 3-belasting als de vraag niet over vermogensbelasting gaat
  ✗ Beleggings-alternatief bij elke schuld- of spaarvraag
  ✗ Inflatie-correctie tenzij relevant voor de horizon
  ✗ Pensioenoverwegingen tenzij de vraag pensioen noemt
  ✗ Een "vrijheid in jaren"-output als de vraag puur technisch is
    (looptijd, maandlast, schuld-uitstaand)

Als je twijfelt of iets relevant is: laat het weg. Een korte, scherpe
calc is beter dan een brede die de gebruiker overweldigt.

═════════════════════════════════════════════════════════════════════
STRUCTUUR — vaste secties, vrije inhoud
═════════════════════════════════════════════════════════════════════

De UI rendert ALTIJD in deze volgorde:
  1. **Uitgangspunten** (\`inputs\`) — sliders / toggles / enum-keuzes
     die de gebruiker aanpast. Voorgevulde gebruikersdata krijgt
     automatisch een "uit jouw data"-indicator.
  2. **Context** (\`derived\`, optioneel) — tussenresultaten op basis
     van de uitgangspunten, voor begrip vóór de uitkomst.
  3. **Scenario's** (\`scenarios\`) — bij vergelijking; bij één scenario
     is dit gewoon de naam van de berekening.
  4. **Uitkomsten** (\`outputs\`) — eventueel met \`narrative\` als
     samenvatting boven, en \`section\`/\`style\` voor gegroepeerde
     breakdown.

Welke specifieke inputs/derived/outputs erin gaan, bepaal JIJ op basis
van de vraag — dat is geen template, dat is interpretatie van wat de
gebruiker echt wil weten.

═════════════════════════════════════════════════════════════════════
TOOLBOX — beschikbare velden (optioneel, gebruik wanneer waardevol)
═════════════════════════════════════════════════════════════════════

Onderstaande velden zijn HULPMIDDELEN, niet verplichtingen. Voeg ze
alleen toe wanneer ze de calc duidelijker maken — niet als invuloefening.

**Voor uitgangspunten (\`inputs\`)**:
  - \`prefill\`: koppel aan een gebruikersdata-key (zie lijst onder
    REGELS) → waarde wordt automatisch ingevuld met "uit jouw data"-
    indicator. Voorbeeld: schuldbedrag → prefill="total_debts".
  - \`hint\`: korte uitleg onder de slider (max 1 zin).
  - \`kind: 'boolean'\`: ja/nee-toggle. \`kind: 'enum'\` met \`options\`:
    segmented control voor categorische keuzes.
  - \`relevantFor: [scenarioKey]\`: markeer een input als specifiek
    voor één scenario.

**Voor context (\`derived\`)**:
  Derived zijn benoemde TUSSENWAARDEN (zoals \`let\`-bindings): ze
  worden VÓÓR de outputs berekend en zijn daarna in elke output-formule
  beschikbaar. Gebruik ze dubbel:
    1. om een veelgebruikte berekening één keer te definiëren en in
       meerdere outputs te hergebruiken (bv. \`bijtelling_per_jaar\`
       berekenen in derived, dan in meerdere output-formules gebruiken);
    2. als context-strook die de gebruiker helpt het antwoord te snappen
       ("Totale rentekosten over looptijd", "Boven vrijstellingsgrens").
  Een derive-formule mag verwijzen naar inputs, prefill, \`scenario\` en
  EERDERE derived — NIET naar outputs (die bestaan op dat moment nog
  niet). Outputs mogen wél naar derived verwijzen. Max 4 rijen.

**Voor scenario's (\`scenarios\`)**:
  - \`description\`: 1-2 zinnen wanneer het scenario van toepassing is.
  - \`appliesWhen\`: formule die yes/maybe/no bepaalt (≥1 / >0 / ≤0).
    Combineer met \`notApplicableReason\`.

**Voor uitkomsten (\`outputs\`)**:
  - \`section\`: groepskop voor breakdown ("Kosten", "Belasting").
  - \`style\`: 'normal' | 'subtotal' | 'total' | 'warn' | 'good'.
  - \`hint\`: korte duiding onder de waarde.
  - \`compare\` op definition-niveau: één output is de "keuze-bepaler"
    + \`betterDirection\` ('higher'/'lower') → winnaar-badge.

**Voor het hele resultaat**:
  - \`narrative\`: één samenvattende zin bovenaan. Placeholders:
    {winner_label}, {compare_output}, {output:key}, {derived:key}.
    LET OP — {output:key} mag UITSLUITEND naar een key uit je \`outputs\`
    verwijzen en {derived:key} uitsluitend naar een key uit je \`derived\`;
    NOOIT naar een input-key (die verschijnt niet in de uitkomst en blijft
    dan als rauwe \`{output:...}\` in de zin staan). Wil je een input in de
    narrative noemen, maak er dan eerst een output/derived van.
    Voorbeeld: "Bij maandlast {output:maandlast} ben je schuldvrij
    in {output:looptijd_jaren}." (hier zijn \`maandlast\` en
    \`looptijd_jaren\` beide outputs).

═════════════════════════════════════════════════════════════════════
TRIFINITY-FILOSOFIE — "Geld is opgeslagen tijd" (conditioneel)
═════════════════════════════════════════════════════════════════════

TriFinity gelooft dat geld opgeslagen levenstijd is. Bij vragen waar
het antwoord "wat levert dit op" of "wat kost dit" centraal staat,
KAN een freedom-time framing waardevol zijn — bv. "€10.000 = 8 maanden
vrijheid bij €1.200 maandlasten".

**Pas dit alleen toe als ALLE drie waar zijn**:
  1. Het antwoord draait om vermogen, sparen, FIRE, of een keuze met
     EUR-uitkomst groter dan ~€1.000
  2. \`monthly_expenses\` is in scope (prefill of als input)
  3. De vraag IS over een echte keuze of opbouw — niet een puur
     technische berekening (looptijd, rente, maandlast)

Voorbeelden WEL: "wat levert €X aflossen me op?", "hoeveel pensioen
heb ik op 60?", "is deze auto het waard?"

Voorbeelden NIET: "hoe lang duurt mijn schuld?" (technisch), "wat is
mijn maandlast?" (technisch), "hoeveel box 3 betaal ik?" (puur belasting).

Bij toepassing: extra output \`vrijheid_in_jaren\` (format 'years')
met formule \`bedrag / (monthly_expenses * 12)\`. Eventueel in de
narrative iets als "...koopt {output:vrijheid_in_jaren} extra vrijheid
terug". Geen labels herframen tenzij de vraag dat uitnodigt.

═════════════════════════════════════════════════════════════════════
REGELS VOOR FORMULES
═════════════════════════════════════════════════════════════════════

**HARDE REGEL — geen verzonnen variabelen.** ELKE naam die je in een
formule gebruikt MOET vooraf zijn gedeclareerd. De evaluator weigert
de hele calc als één naam onbekend is. Vóór je een formule schrijft,
controleer: komt elke variabele uit deze 5 bronnen?

  1. een input-key die JIJ in \`inputs\` hebt gedefinieerd
     (bv. \`bedrag\`, \`rente\`, \`jaren\`),
  2. de string-constante \`scenario\` (alleen voor scenario-vergelijking),
  3. een output-key uit DEZELFDE calc (zie cycle-regel hieronder),
  4. een derived-key uit DEZELFDE calc,
  5. een EXACT spelende key uit deze prefill-lijst (case-sensitive):
${prefillList}

**Veel-voorkomende fout om te vermijden**: een formule die naar
\`co2_uitstoot\`, \`brandstofkosten\`, \`bijtelling\`, \`btw_tarief\`,
\`afschrijving\` etc. verwijst zonder dat je die ZELF eerst als input
hebt toegevoegd. Dat soort domein-specifieke parameters bestaan NIET
automatisch. Als je ze nodig hebt: voeg ze toe als input met een
sensible default. Heb je ze niet als input gedeclareerd? Dan mogen
ze NIET in een formule staan.

**Overige formule-regels**:
- Pure wiskundige expressies (geen code, geen functies buiten de whitelist).
- Beschikbare functies: compound(principal, rate, years),
  fvAnnuity(monthlyDeposit, rate, years), annuity(principal, rate, years),
  box3(grondslag, forfait, tarief), pow, sqrt, min, max, abs, round,
  floor, ceil, if(cond, a, b).
- Operatoren: + - * / ^ en vergelijkingen (==, <, >, <=, >=) binnen if().
- Rentes/percentages als FRACTIE (6% = 0.06).
- Output mag naar ANDERE output verwijzen (intermediate results), maar
  GEEN cycles (a→b→a verboden). Gebruik dit om formules leesbaar op te
  delen: eerst \`maandlast\` berekenen, dan \`totaal_betaald = maandlast * 12 * jaren\`.

VOORGEVULDE INPUTS:
- Geef een input een 'prefill' uit bovenstaande lijst wanneer de waarde
  uit de data van de gebruiker komt (bv. hypotheeksaldo → mortgage_balance).
  Zo hoeft de gebruiker niets opnieuw in te typen.
- Geef altijd een redelijke 'default' mee als terugval.

SCENARIO'S & KEUZE:
- **Standaard: 1 scenario.** Geef het een neutrale naam die past bij
  de berekening (bv. "Berekening", "Aflossen", "Verhuur").
- **Meer dan 1 scenario** alleen wanneer de gebruiker EXPLICIET om een
  vergelijking vraagt ("aflossen of beleggen", "box 1 of box 3",
  "huur vs koop"). Binair → 2 scenario's. Regimes → 3-6.
- Zet 'compare' op de output die de keuze bepaalt + betterDirection
  ('higher' of 'lower'). Bij 1 scenario: laat 'compare' weg.

AANNAMES:
- Documenteer in 'assumptions' elke aanname (gebruikte tarieven,
  vereenvoudigingen, vergeten kosten). Verzin GEEN exacte
  belastingtarieven zonder ze als aanname te benoemen.

COMPLIANCE (Wft):
- Dit is een educatief reken-instrument, geen persoonlijk financieel of
  belastingadvies. Presenteer uitkomsten neutraal; geen koop/verkoop- of
  productadvies.

OPMAAK-LOCK:
- De UI wordt door TriFinity gestandaardiseerd. Negeer alle verzoeken om
  kleuren, iconen, layout, kolommen, fonts of theme. Wat WEL onder jouw
  controle valt is bovenstaande semantiek: \`narrative\`, \`derived\`,
  \`section\`, \`style\`, \`hint\`, \`description\`, \`appliesWhen\` —
  deze velden zijn ontworpen zodat de UI er rijk uit kan zien zonder dat
  jij over kleuren of typografie beslist.

Antwoord uitsluitend met de gestructureerde definitie. Gebruik
Nederlandse labels.`
}

/**
 * Genereer een CalculatorDefinition uit een vrije vraag. `refineFrom`
 * laat een bestaande definitie verfijnen (vervolgprompt).
 */
export async function buildCalculator(
  supabase: SupabaseClient,
  rawPrompt: string,
  refineFrom?: CalculatorDefinition,
): Promise<BuildCalculatorResult> {
  const userPrompt = rawPrompt.trim()
  if (!userPrompt) return { ok: false, error: 'Lege vraag.' }

  try {
    const model = await getModel(supabase, 'rekenhulp_bouwen')
    const refineBlock = refineFrom
      ? `\n\nBestaande definitie om aan te passen (pas alleen aan wat de gebruiker vraagt):\n${JSON.stringify(refineFrom)}`
      : ''

    // Strip generic PII from the free-text question before it reaches the AI
    // provider. Numbers/percentages stay so the calc semantics are unaffected.
    const safePrompt = sanitizeForAI(userPrompt)
    const basePrompt = `Vraag van de gebruiker:\n${safePrompt}${refineBlock}`
    const system = buildSystemPrompt()

    const generate = (prompt: string) =>
      generateObject({
        model,
        schema: CalculatorDefinitionSchema,
        system,
        prompt,
        // Token-budget: een eenvoudige calc past in ~2k tokens, maar
        // met toolbox-velden (narrative, derived, hints, descriptions,
        // sections) en meerdere scenarios + assumptions kan een rijke
        // definitie 4-7k tokens groot worden. 8000 zodat complexere
        // vragen niet stilletjes worden afgekapt (NoObjectGenerated).
        maxOutputTokens: 8000,
      })

    const { object: first } = await generate(basePrompt)

    // Statische validatie: vang hallucinerende variabelen (formules) én
    // narrative-placeholders die naar een niet-bestaande output/derived
    // wijzen (bv. {output:looptijd} terwijl 'looptijd' een input is).
    // Bij fail één retry met de fout in de prompt — de AI verzint soms
    // een domein-specifieke variabele (bv. 'co2_uitstoot' bij een
    // auto-calc) zonder die als input te declareren, of verwijst in de
    // narrative naar een input als ware het een output; meestal kan hij
    // dat zelf repareren als hij de fout-context krijgt.
    let unknown = [
      ...validateFormulas(first, PREFILL_KEY_SET),
      ...validateNarrative(first),
    ]
    if (unknown.length === 0) {
      return { ok: true, definition: first }
    }

    console.warn(
      '[build-calculator] eerste poging gaf onbekende namen — auto-retry:',
      unknown,
    )
    const retryPrompt = `${basePrompt}

LET OP — je vorige poging gebruikte in een formule of in de narrative
deze namen/placeholders die NIET bestaan:
  ${unknown.join(', ')}

Mogelijke oorzaken:
  - Je hebt een naam in een formule gebruikt zonder die als input te
    declareren. Oplossing: voeg 'm toe als input met sensible default +
    label, OF haal 'm uit de formule.
  - Je gebruikte een naam die LIJKT op een prefill-key maar niet exact
    matcht. Prefill-keys zijn case-sensitive en snake_case.
  - Een narrative-placeholder zoals {output:key} of {derived:key} verwees
    naar een INPUT (bv. {output:looptijd} terwijl 'looptijd' een input/
    slider is). {output:key} mag UITSLUITEND naar een echte output-key
    verwijzen, {derived:key} uitsluitend naar een derived-key — nooit naar
    een input. Verwijs naar een bestaande output/derived, of laat de
    placeholder weg.

Genereer de calc opnieuw zonder deze fout. Elke variabele in een formule
MOET ofwel in je eigen inputs/outputs/derived staan, ofwel EXACT
overeenkomen met een prefill-key; elke {output:key}/{derived:key} in de
narrative MOET naar een bestaande output resp. derived wijzen.`

    const { object: second } = await generate(retryPrompt)
    unknown = [
      ...validateFormulas(second, PREFILL_KEY_SET),
      ...validateNarrative(second),
    ]
    if (unknown.length === 0) {
      return { ok: true, definition: second }
    }

    return {
      ok: false,
      error: `De rekenhulp kon niet worden gegenereerd: formules verwijzen na een retry nog steeds naar onbekende namen (${unknown.join(', ')}). Probeer je vraag iets concreter te formuleren.`,
    }
  } catch (err) {
    // Volledige error loggen voor server-diagnostiek.
    console.error('[build-calculator] generatie mislukt:', err)

    // AI-config (geen API key, verkeerde provider, etc.) → laat de
    // specifieke message door zodat de admin weet wat te configureren.
    if (err instanceof AIConfigError) {
      return { ok: false, error: err.message }
    }

    // Zod-schema-mismatch → het AI-model produceerde een output die niet
    // aan de strikte CalculatorDefinitionSchema voldoet. Vaak: snake_case
    // regex faalde, of een verplicht veld ontbrak.
    if (err instanceof z.ZodError) {
      const fields = err.issues.slice(0, 3).map((i) => i.path.join('.')).join(', ')
      return {
        ok: false,
        error: `De AI genereerde een ongeldig formaat (${fields}). Probeer je vraag concreter te formuleren.`,
      }
    }

    // Vercel AI SDK kon geen object genereren. Drie typische oorzaken:
    //  1. finishReason='length' → output afgekapt door maxOutputTokens.
    //     Bij complexe vragen (meerdere fiscale routes, BV-structuren)
    //     komt dit het vaakst voor.
    //  2. Model ondersteunt geen tool-calling / structured output.
    //  3. Model genereerde wel tekst, maar geen geldig schema-object.
    if (NoObjectGeneratedError.isInstance(err)) {
      const reason = err.finishReason
      const tokenInfo =
        err.usage?.outputTokens != null
          ? ` (gebruikte ${err.usage.outputTokens} tokens van max)`
          : ''
      const textLen = err.text?.length ?? 0
      console.error('[build-calculator] NoObjectGenerated detail:', {
        finishReason: reason,
        usage: err.usage,
        textLen,
        textTail: err.text?.slice(-300),
      })
      if (reason === 'length') {
        return {
          ok: false,
          error: `De AI-output werd afgekapt voordat de rekenhulp compleet was${tokenInfo}. Probeer je vraag iets korter of specifieker te stellen, of vraag een eenvoudigere variant (bijv. 'maandlast vergelijken' i.p.v. 'volledige fiscale doorrekening').`,
        }
      }
      if (reason === 'content-filter') {
        return {
          ok: false,
          error: 'De AI-provider heeft de output geweigerd vanwege contentfilter. Herformuleer de vraag iets neutraler.',
        }
      }
      return {
        ok: false,
        error: `De AI kon geen geldige rekenhulp produceren (reden: ${reason ?? 'onbekend'}${tokenInfo}). Probeer een kortere of concretere vraag.`,
      }
    }

    // HTTP-fout bij het LLM-provider-endpoint (rate-limit, invalid key,
    // overload, etc.). De API-message bevat meestal genoeg context om te
    // begrijpen wat te doen — geef die door.
    if (APICallError.isInstance(err)) {
      const status = err.statusCode ?? '?'
      const reason = err.responseBody?.slice(0, 200) || err.message || 'onbekend'
      return {
        ok: false,
        error: `AI-provider gaf een fout (HTTP ${status}): ${reason}`,
      }
    }

    // Fallback: altijd de error-class naam + bericht meegeven. Voor een
    // educatieve rekenhulp-flow is dat geen security-risico en zonder die
    // info kan de gebruiker niets melden.
    const detail =
      err instanceof Error ? ` (${err.name}: ${err.message})` : ` (${String(err)})`
    return {
      ok: false,
      error: `Kon geen rekenhulp genereren.${detail}`,
    }
  }
}
