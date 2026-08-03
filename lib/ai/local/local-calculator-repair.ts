// ── Assemblage + DETERMINISTISCHE reparatie van een lokale mini-rekenhulp ────
//
// De cloud-route repareert een formule met een onbekende variabele door het
// model een tweede keer te laten genereren, met de fout in de prompt
// (lib/ai/build-calculator.ts r293-333). Dat kan daar: een retry kost seconden.
//
// LOKAAL IS DAT DE VERKEERDE KEUZE. Een tweede generatie kost bij ~9-12 tok/s
// minuten, en de slaagkans is laag — het model dat de naam net verzon, is niet
// het model dat 'm nu wél kan plaatsen. Bovendien is de reparatie zelf helemaal
// geen taalprobleem: je weet exact wélke naam ontbreekt, en er zijn maar twee
// verdedigbare uitkomsten. Die twee doen we hier, in TypeScript:
//
//   1. de naam is een geldige identifier → voeg 'm toe als input met een
//      passende soort en een verdedigbare default. De gebruiker ziet 'm dan als
//      slider en kan 'm zelf goedzetten — dat is precies wat een input ís;
//   2. dat kan niet (te veel inputs, of de fout is structureel: een cyclus of
//      een parse-fout) → laat die ene output vallen. Zijn er daarna geen
//      outputs meer, dan falen we eerlijk.
//
// `validateFormulas` uit lib/calculator/evaluate.ts is hier ongewijzigd de
// autoriteit over "welke namen kloppen niet". Dat is bewust: het lokale pad mag
// geen tweede, mildere waarheid over formule-geldigheid krijgen — dan drift de
// evaluator (die de calc straks draait) weg van de poort die 'm doorliet.

import { validateFormulas } from '@/lib/calculator/evaluate'
import type { CalculatorDefinition } from '@/lib/calculator/types'
import {
  LOCAL_REPAIR_MAX_INPUTS,
  type LocalCalculatorInput,
  type LocalCalculatorOutput,
} from './local-calculator-schema'

/** De losse brokken uit de vier deelstappen, klaar om samen te voegen. */
export interface LocalCalcParts {
  inputs: LocalCalculatorInput[]
  outputs: LocalCalculatorOutput[]
  name: string
  description?: string
  assumptions?: string[]
}

/** Vaste sleutel/label van het enige scenario — er wordt lokaal niet vergeleken. */
export const LOCAL_SCENARIO_KEY = 'berekening'
export const LOCAL_SCENARIO_LABEL = 'Berekening'

/**
 * Voeg de deelstappen samen tot één definitie. Puur samenstellen — geen
 * validatie, geen reparatie (die volgen als aparte, testbare stappen).
 */
export function assembleLocalDefinition(parts: LocalCalcParts): CalculatorDefinition {
  return {
    name: parts.name,
    ...(parts.description ? { description: parts.description } : {}),
    inputs: parts.inputs,
    scenarios: [{ key: LOCAL_SCENARIO_KEY, label: LOCAL_SCENARIO_LABEL }],
    outputs: parts.outputs,
    ...(parts.assumptions && parts.assumptions.length > 0
      ? { assumptions: parts.assumptions }
      : {}),
  }
}

/** Een naam die als input kan worden bijgemaakt (geen cyclus-/parse-melding). */
function isPlainIdentifier(name: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(name)
}

/**
 * Raad de soort + een verdedigbare startwaarde bij een naam die het model in een
 * formule gebruikte zonder 'm te declareren.
 *
 * De heuristiek is opzettelijk grof: we gokken niet op de bedoeling maar op de
 * EENHEID, want daar hangt de rendering aan (een percentage als euro-slider is
 * onbruikbaar, een euro-bedrag als percentage even zo goed). De waarde zelf is
 * een startpunt dat de gebruiker meteen ziet en zelf kan bijstellen.
 */
function guessInputShape(key: string): Pick<LocalCalculatorInput, 'kind' | 'default'> {
  const k = key.toLowerCase()
  if (/(rente|rendement|percentage|inflatie|tarief|groei|stijging|pct)/.test(k)) {
    return { kind: 'percent', default: 0.05 }
  }
  if (/(jaar|jaren|looptijd|termijn|leeftijd|duur|periode|maanden)/.test(k)) {
    return { kind: 'years', default: 10 }
  }
  if (/(aantal|factor|ratio|graad)/.test(k)) {
    return { kind: 'number', default: 1 }
  }
  return { kind: 'euro', default: 1000 }
}

/** snake_case → leesbaar Nederlands label ("bruto_rente" → "Bruto rente"). */
function humanizeKey(key: string): string {
  const words = key.replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Welke outputs raken deze onbekende naam? Bewust een tekstuele match met
 * woordgrenzen in plaats van opnieuw parsen: `validateFormulas` heeft de
 * formules al geparseerd en ons de namen gegeven, en een tweede parser-instantie
 * hier zou een tweede waarheid introduceren over wat een "naam" is.
 */
function formulaMentions(formula: string, name: string): boolean {
  return new RegExp(`(^|[^a-z0-9_])${name}([^a-z0-9_]|$)`, 'i').test(formula)
}

export interface LocalRepairResult {
  /** De gerepareerde definitie, of null als er niets bruikbaars overbleef. */
  definition: CalculatorDefinition | null
  /** Wat er is aangepast — bedoeld voor de log en voor de test, niet voor de UI. */
  repairs: string[]
  /** Namen die ook na reparatie onbekend bleven (leeg bij een geslaagde reparatie). */
  restUnknown: string[]
}

/**
 * Repareer een definitie tot `validateFormulas` schoon is, uitsluitend
 * deterministisch. Er wordt in dit hele bestand NOOIT een model aangeroepen.
 *
 * @param prefillKeySet de toegestane gebruikersdata-keys (PREFILL_KEY_SET).
 */
export function repairLocalDefinition(
  input: CalculatorDefinition,
  prefillKeySet: Set<string>,
): LocalRepairResult {
  // Deep clone zodat de aanroeper zijn eigen object onaangetast houdt.
  let def: CalculatorDefinition = JSON.parse(JSON.stringify(input))
  const repairs: string[] = []

  // Drie passes volstaan ruim: elke pass lost óf alle losse namen op, óf laat
  // outputs vallen. Een vierde ronde zou alleen nog kunnen als de reparatie
  // zichzelf nieuwe fouten bezorgt — en dat kan niet, want we voegen alleen
  // bekende namen toe en verwijderen alleen formules.
  for (let pass = 0; pass < 3; pass++) {
    const unknown = validateFormulas(def, prefillKeySet)
    if (unknown.length === 0) {
      return { definition: def, repairs, restUnknown: [] }
    }

    const plain = unknown.filter(isPlainIdentifier)
    const structural = unknown.filter((n) => !isPlainIdentifier(n))

    // ── 1. Losse namen bijmaken als input, zolang dat binnen de cap past ─────
    const ruimte = LOCAL_REPAIR_MAX_INPUTS - def.inputs.length
    const bijTeMaken = plain.slice(0, Math.max(0, ruimte))
    if (bijTeMaken.length > 0) {
      const nieuwe: LocalCalculatorInput[] = bijTeMaken.map((key) => ({
        key,
        label: humanizeKey(key),
        ...guessInputShape(key),
      }))
      def = { ...def, inputs: [...def.inputs, ...nieuwe] }
      for (const n of nieuwe) {
        repairs.push(`onbekende naam '${n.key}' toegevoegd als input (${n.kind}, start ${n.default})`)
      }
    }

    // ── 2. Wat niet bij te maken viel → de betrokken outputs laten vallen ────
    const nietOpgelost = plain.slice(bijTeMaken.length)
    if (nietOpgelost.length > 0 || structural.length > 0) {
      const teVerwijderen = new Set<string>()

      for (const name of nietOpgelost) {
        for (const out of def.outputs) {
          if (formulaMentions(out.formula, name)) teVerwijderen.add(out.key)
        }
      }
      // Structurele meldingen dragen de output-key vóór de dubbele punt
      // ("looptijd: parse-fout") of noemen 'm in een cyclus-pad
      // ("cyclus: a → b → a"). Beide vormen komen uit validateFormulas zelf.
      for (const melding of structural) {
        for (const out of def.outputs) {
          if (
            melding.startsWith(`${out.key}:`) ||
            melding.split(/[:→,\s]+/).includes(out.key)
          ) {
            teVerwijderen.add(out.key)
          }
        }
      }

      if (teVerwijderen.size === 0) {
        // Niets aan te wijzen om te verwijderen → doorrepareren zou blind zijn.
        return { definition: null, repairs, restUnknown: unknown }
      }

      def = { ...def, outputs: def.outputs.filter((o) => !teVerwijderen.has(o.key)) }
      for (const key of teVerwijderen) {
        repairs.push(`uitkomst '${key}' laten vallen (formule verwees naar iets dat niet bestaat)`)
      }

      if (def.outputs.length === 0) {
        // Geen enkele uitkomst meer = geen rekenhulp. Eerlijk falen.
        return { definition: null, repairs, restUnknown: unknown }
      }
    }

    // Ongebruikte inputs opruimen kan hier bewust NIET: een input die door geen
    // enkele formule wordt gebruikt is geen fout, en de gebruiker verwijderen
    // wat het model zinvol vond is een oordeel dat we niet hoeven te vellen.
  }

  const rest = validateFormulas(def, prefillKeySet)
  return rest.length === 0
    ? { definition: def, repairs, restUnknown: [] }
    : { definition: null, repairs, restUnknown: rest }
}
