// ── Rekenhulp — AI-generatie van CalculatorDefinition ──────────────
//
// Will produceert een gestructureerde CalculatorDefinition (geen code)
// op basis van een vrije gebruikersvraag. Volgt exact het patroon van
// extract-financial-data.ts: getModel(supabase) → generateObject.
//
// Faalt gracieus: bij AI-fout of ongeldige formules wordt een
// foutobject teruggegeven i.p.v. te throwen, zodat de UI een nette
// melding kan tonen.

import { generateObject } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getModel } from '@/lib/ai/config'
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
    console.error(
      '[build-calculator] generatie mislukt:',
      err instanceof Error ? err.message : err,
    )
    return {
      ok: false,
      error: 'Kon geen rekenhulp genereren. Probeer het opnieuw of herformuleer je vraag.',
    }
  }
}
