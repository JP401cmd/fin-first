// ── Rekenhulp — AI-generatie van CalculatorDefinition ──────────────
//
// Will produceert een gestructureerde CalculatorDefinition (geen code)
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
import {
  CalculatorDefinitionSchema,
  type CalculatorDefinition,
} from '@/lib/calculator/types'
import { validateFormulas } from '@/lib/calculator/evaluate'
import { PREFILL_KEYS, PREFILL_KEY_SET } from '@/lib/calculator/user-data-keys'

export type BuildCalculatorResult =
  | { ok: true; definition: CalculatorDefinition }
  | { ok: false; error: string }

function buildSystemPrompt(): string {
  const prefillList = PREFILL_KEYS.map(
    (k) => `  - ${k.key} (${k.unit}): ${k.description}`,
  ).join('\n')

  return `Je bent Will, de reken-assistent van TriFinity. Je bouwt een
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
  Voeg toe als een tussenresultaat de gebruiker helpt het antwoord te
  snappen ("Totale rentekosten over looptijd", "Boven vrijstellingsgrens").
  Niet vergelijkbaar tussen scenario's. Max 4 rijen.

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
    Voorbeeld: "Bij maandlast {output:maandlast} ben je schuldvrij
    in {output:looptijd_jaren}."

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

- Formules zijn pure wiskundige expressies (geen code, geen functies
  buiten de whitelist).
- Beschikbare functies: compound(principal, rate, years),
  fvAnnuity(monthlyDeposit, rate, years), annuity(principal, rate, years),
  box3(grondslag, forfait, tarief), pow, sqrt, min, max, abs, round,
  floor, ceil, if(cond, a, b).
- Operatoren: + - * / ^ en vergelijkingen (==, <, >, <=, >=) binnen if().
- Rentes/percentages als FRACTIE (6% = 0.06).
- Een formule mag verwijzen naar:
  1. de input-keys die je zelf definieert (ook boolean/enum als getal),
  2. de string-constante 'scenario' (de actieve scenario-key) — gebruik
     if(scenario == "x", ..., ...) voor scenario-specifiek gedrag,
  3. ANDERE output-keys uit dezelfde calculator (intermediate results).
     Cyclische verwijzingen zijn verboden (a→b→a). Gebruik dit om
     formules leesbaar op te delen, bv. eerst 'maandlast' berekenen,
     daarna 'totaal_betaald' = maandlast * 12 * jaren.
  4. derived-keys (afgeleide context-rijen, in volgorde gedefinieerd).
  5. de volgende voorgevulde gebruikersdata-keys:
${prefillList}

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
    const model = await getModel(supabase)
    const refineBlock = refineFrom
      ? `\n\nBestaande definitie om aan te passen (pas alleen aan wat de gebruiker vraagt):\n${JSON.stringify(refineFrom)}`
      : ''

    const { object } = await generateObject({
      model,
      schema: CalculatorDefinitionSchema,
      system: buildSystemPrompt(),
      prompt: `Vraag van de gebruiker:\n${userPrompt}${refineBlock}`,
      // Cap token-budget: een CalculatorDefinition is compact; meer ruimte
      // moedigt het model alleen aan tot uitwijdingen. AI SDK v6 noemt
      // het veld `maxOutputTokens` (zie node_modules/ai v6.0.x).
      maxOutputTokens: 4000,
    })

    // Statische formule-validatie: vang hallucinerende variabelen vroeg.
    const unknown = validateFormulas(object, PREFILL_KEY_SET)
    if (unknown.length > 0) {
      return {
        ok: false,
        error: `De gegenereerde formules verwijzen naar onbekende namen: ${unknown.join(', ')}. Probeer je vraag te herformuleren.`,
      }
    }

    return { ok: true, definition: object }
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

    // Vercel AI SDK kon geen object genereren — meestal omdat het model
    // (zoals een lokaal Ollama-model) tool-calling niet ondersteunt of de
    // output afkapte.
    if (NoObjectGeneratedError.isInstance(err)) {
      return {
        ok: false,
        error: 'De AI kon geen geldige rekenhulp produceren. Probeer een kortere of concretere vraag.',
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
