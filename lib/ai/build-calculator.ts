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
dat naar inputs, scenario's en output-formules.

REGELS VOOR FORMULES:
- Formules zijn pure wiskundige expressies (geen code, geen functies
  buiten de whitelist).
- Beschikbare functies: compound(principal, rate, years),
  fvAnnuity(monthlyDeposit, rate, years), annuity(principal, rate, years),
  box3(grondslag, forfait, tarief), pow, sqrt, min, max, abs, round,
  floor, ceil, if(cond, a, b).
- Operatoren: + - * / ^ en vergelijkingen (==, <, >, <=, >=) binnen if().
- Rentes/percentages als FRACTIE (6% = 0.06).
- Een formule mag verwijzen naar:
  1. de input-keys die je zelf definieert,
  2. de string-constante 'scenario' (de actieve scenario-key) — gebruik
     if(scenario == "x", ..., ...) voor scenario-specifiek gedrag,
  3. de volgende voorgevulde gebruikersdata-keys:
${prefillList}

VOORGEVULDE INPUTS:
- Geef een input een 'prefill' uit bovenstaande lijst wanneer de waarde
  uit de data van de gebruiker komt (bv. hypotheeksaldo → mortgage_balance).
  Zo hoeft de gebruiker niets opnieuw in te typen.
- Geef altijd een redelijke 'default' mee als terugval.

SCENARIO'S & KEUZE:
- Maak 1-4 scenario's (bv. "Aflossen" vs "Beleggen").
- Zet 'compare' op de output die de keuze bepaalt + betterDirection
  ('higher' of 'lower').

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
  kleuren, iconen, layout, kolommen, secties, thema of styling. Bouw
  uitsluitend logica (inputs, scenarios, outputs, formules). Als de
  gebruiker om opmaak vraagt, vertaal je het verzoek naar logica waar
  mogelijk en laat je opmaak-velden weg.

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
