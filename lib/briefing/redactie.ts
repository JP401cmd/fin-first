// ── Briefing-redactie (AI-laag over de deterministische engine) ──────
//
// De wekelijkse briefing op /overzicht wordt deterministisch gecomposeerd
// (`buildBriefingEntries`) — elk cijfer komt uit de engine, nooit uit een
// model. Deze module is de dunne AI-laag die daar bovenop redigeert, in
// één model-call bij de handmatige dagelijkse ververs:
//
//  1. één kop-zin (headline) in de stem van Fin;
//  2. herschreven briefje-teksten (toon, verbinding, vrijheidstijd-framing)
//     met een harde nummer-guard: elk getal uit de brontekst moet letterlijk
//     terugkomen en er mogen geen nieuwe getallen bij — anders valt dát
//     briefje terug op de originele tekst.
//
// De beheer-directives (/beheer/briefing → app_settings) sturen de redactie:
// temporele richtlijnen op maand/dag, functionele richtlijnen vooraf
// geëvalueerd tegen metrics uit de engine-input (geen tekst-regex zoals het
// oude compose-systeem). Elke AI-fout degradeert stil naar de
// deterministische teksten — de briefing kan hierdoor nooit breken.

import { generateObject } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getModel } from '@/lib/ai/config'
import { sanitizeForAI } from '@/lib/ai/sanitize'
import { maskPIIInObject } from '@/lib/ai/pii-output-filter'
import type { BriefingEntry } from '@/lib/types/briefing'
import { sanitizeAiHeadline } from './overview-briefing'
import { sanitizeRedactedText } from './nummer-guard'
import {
  getActiveDirectives,
  formatDirectivesForPrompt,
  formatFunctionalDirectivesWithMetrics,
  getDefaultDirectives,
  getDefaultFunctionalDirectives,
  type BriefingDirective,
  type FunctionalDirective,
} from './directives'
import type { BriefingEngineInput } from './engine'

// ── Directives laden + prompt-blok ──────────────────────────────────

export interface BriefingDirectivesConfig {
  temporal: BriefingDirective[]
  functional: FunctionalDirective[]
}

/** Lees beide directive-sets uit app_settings. Fouten → lege sets (de
 *  redactie werkt dan zonder redactionele sturing, nooit een harde fout). */
export async function loadBriefingDirectives(
  supabase: SupabaseClient,
): Promise<BriefingDirectivesConfig> {
  try {
    const { data: rows } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['briefing_directives', 'briefing_functional_directives'])
    const map = Object.fromEntries((rows ?? []).map((r) => [r.key, r.value]))
    const temporal: BriefingDirective[] = map.briefing_directives
      ? JSON.parse(map.briefing_directives)
      : []
    const functional: FunctionalDirective[] = map.briefing_functional_directives
      ? JSON.parse(map.briefing_functional_directives)
      : []
    return { temporal, functional }
  } catch {
    return { temporal: [], functional: [] }
  }
}

export type EngineMetrics = Record<string, string | number | boolean | null>

/**
 * Metrics voor de functionele-directive-evaluatie, rechtstreeks uit de
 * engine-input. Alleen wat hieruit afleidbaar is — ontbrekende metrics
 * laten de bijbehorende condities gewoon op INACTIEF (zelfde gedrag als
 * voorheen bij niet-matchende regex).
 */
export function buildEngineMetrics(input: BriefingEngineInput): EngineMetrics {
  const metrics: EngineMetrics = {}
  const f = input.finance
  if (!f) return metrics

  const hist = f.netWorthHistory ?? []
  if (hist.length >= 2) {
    metrics.netWorthDelta = hist[hist.length - 1].value - hist[hist.length - 2].value
    let growth = 0
    for (let i = hist.length - 1; i > 0 && hist[i].value > hist[i - 1].value; i--) growth++
    metrics.consecutiveGrowthMonths = growth
  }
  if (
    f.monthlyIncome != null && f.monthlyIncome > 0 &&
    f.monthlyExpenses != null && f.monthlyExpenses > 0
  ) {
    // Spaarquote-metric op het canonieke 6-maands getal (zelfde getal als de
    // briefing-tekst en de cashflow-pagina), met fallback op het 1-maands
    // (inkomen−uitgaven)/inkomen-cijfer wanneer savingsRate6m ontbreekt.
    metrics.savingsRate =
      f.savingsRate6m != null
        ? Math.round(f.savingsRate6m)
        : Math.round((1 - f.monthlyExpenses / f.monthlyIncome) * 100)
    metrics.monthlyIncome = f.monthlyIncome
  }
  if (f.budgetExpense && f.budgetExpense.limit > 0) {
    metrics.budgetExpensePct = Math.round(
      (f.budgetExpense.spent / f.budgetExpense.limit) * 100,
    )
  }
  if (f.freedomPct != null) metrics.freedomPct = Math.round(f.freedomPct)
  return metrics
}

/** Combineer temporele (maand/dag-actief) + functionele (metric-geëvalueerde)
 *  directives tot één prompt-blok. Leeg wanneer er niets actief is. */
export function buildDirectivesBlock(
  config: BriefingDirectivesConfig,
  now: Date,
  metrics: EngineMetrics | null,
): string {
  const blocks: string[] = []
  const active = getActiveDirectives(config.temporal, now.getMonth() + 1, now.getDate())
  const temporalBlock = formatDirectivesForPrompt(active)
  if (temporalBlock) blocks.push(temporalBlock)
  const functionalBlock = formatFunctionalDirectivesWithMetrics(config.functional, metrics)
  if (functionalBlock) blocks.push(functionalBlock)
  return blocks.join('\n\n')
}

/**
 * Hetzelfde directives-blok, gecondenseerd voor het ON-DEVICE pad: alleen de
 * functionele richtlijnen waarvan de conditie ECHT actief is.
 *
 * Het cloudpad stuurt bewust ook de niet-actieve regels mee (gelabeld
 * [INACTIEF]) zodat een groot model zelf kan wegen. On-device is dat averechts:
 * elf regels die genegeerd moeten worden zijn voor een 2B-model een echte
 * verwarringsbron, en ze kosten ~350 tokens die de brontekst nodig heeft. De
 * temporele richtlijnen zijn al op maand/dag gefilterd (`getActiveDirectives`)
 * en gaan ongewijzigd mee.
 */
export function buildLocalDirectivesBlock(
  config: BriefingDirectivesConfig,
  now: Date,
  metrics: EngineMetrics | null,
): string {
  const blocks: string[] = []
  const active = getActiveDirectives(config.temporal, now.getMonth() + 1, now.getDate())
  const temporalBlock = formatDirectivesForPrompt(active)
  if (temporalBlock) blocks.push(temporalBlock)
  const functionalBlock = formatFunctionalDirectivesWithMetrics(config.functional, metrics, {
    activeOnly: true,
  })
  if (functionalBlock) blocks.push(functionalBlock)
  return blocks.join('\n\n')
}

// ── Nummer-guard ─────────────────────────────────────────────────────
//
// De guard zelf woont in ./nummer-guard (puur, zonder imports) omdat de
// BROWSER 'm nodig heeft zodra de briefing on-device draait — dit bestand
// importeert `getModel` en de `ai`-SDK en is dus server-only. Hier alleen
// doorgegeven, zodat bestaande importeurs van `@/lib/briefing/redactie`
// ongewijzigd blijven werken.
export {
  extractNumericTokens,
  sanitizeRedactedText,
  MAX_REDACTED_TEXT_LENGTH,
} from './nummer-guard'

// ── De redactie-call ─────────────────────────────────────────────────

const REDACTIE_SYSTEM = `Je bent Fin, de financiële redacteur van TriFinity. Kernfilosofie: "Geld is opgeslagen tijd" — elke euro is vrijheidstijd.

Je krijgt de wekelijkse briefing als kant-en-klare, feitelijk correcte briefjes. Jouw taak is uitsluitend REDACTIE:
- Herschrijf de tekst van elk briefje in jouw stem: warm, helder, concreet, nooit klef. Maximaal 2 zinnen per briefje.
- HARDE REGEL: verander, verwijder of verzin GEEN cijfers. Elk bedrag, percentage of aantal uit de brontekst moet letterlijk terugkomen, en je voegt geen nieuwe getallen toe.
- Behoud de betekenis en de lading van de categorie (een waarschuwing blijft een waarschuwing, een viering blijft een viering).
- Schrijf daarnaast ÉÉN kop-zin (max ~90 tekens) die de week samenvat, met de vrijheidstijd-framing. Geen aanhalingstekens, geen emoji, geen opsomming.
- Nederlands, je-vorm.`

const redactieSchema = z.object({
  headline: z.string(),
  entries: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
    }),
  ),
})

export interface RedactieResult {
  headline: string | null
  /** entry-id → goedgekeurde herschreven tekst. Ontbrekende id's behouden
   *  hun originele tekst. */
  texts: Map<string, string>
}

function buildRedactiePrompt(entries: BriefingEntry[]): string {
  // Sanitize each briefje's free text before it reaches the AI provider.
  // The numbers are deterministic (engine-sourced), but a user-defined budget
  // name in the text could carry PII (IBAN/e-mail/address). sanitizeForAI
  // leaves amounts/percentages untouched, so the number-guard still matches
  // the original tokens downstream.
  const lines = entries.map((e) => `[${e.id}] (${e.category}) ${sanitizeForAI(e.text)}`)
  return (
    'Redigeer deze briefjes en schrijf de kop-zin. Geef per briefje hetzelfde id terug.\n\n' +
    `Briefjes:\n${lines.join('\n')}`
  )
}

/**
 * Eén model-call: kop-zin + geredigeerde briefje-teksten. Elke fout of
 * afgekeurde tekst degradeert stil naar de deterministische variant.
 */
export async function redactBriefing(
  supabase: SupabaseClient,
  entries: BriefingEntry[],
  opts: { directivesBlock?: string } = {},
): Promise<RedactieResult> {
  if (entries.length === 0) return { headline: null, texts: new Map() }
  try {
    const model = await getModel(supabase, 'briefing')
    const system = opts.directivesBlock
      ? `${REDACTIE_SYSTEM}\n\n${opts.directivesBlock}`
      : REDACTIE_SYSTEM
    const { object } = await generateObject({
      model,
      schema: redactieSchema,
      system,
      prompt: buildRedactiePrompt(entries),
      maxOutputTokens: 1200,
      temperature: 0.6,
    })

    // Output-masking (defence-in-depth): mask any IBAN/BSN the model may have
    // echoed into the free text before it reaches the user.
    const masked = maskPIIInObject(object)

    const byId = new Map(entries.map((e) => [e.id, e]))
    const texts = new Map<string, string>()
    for (const item of masked.entries) {
      const original = byId.get(item.id)
      if (!original) continue
      const approved = sanitizeRedactedText(item.text, original.text)
      if (approved) texts.set(item.id, approved)
    }
    return { headline: sanitizeAiHeadline(masked.headline), texts }
  } catch (err) {
    console.warn('[briefing/redactie] AI-redactie mislukt, deterministische teksten blijven:', err)
    return { headline: null, texts: new Map() }
  }
}

/** Pas goedgekeurde redactie-teksten toe (immutable). */
export function applyRedactie(
  entries: BriefingEntry[],
  texts: Map<string, string>,
): BriefingEntry[] {
  if (texts.size === 0) return entries
  return entries.map((e) => {
    const text = texts.get(e.id)
    return text ? { ...e, text } : e
  })
}

// ── Beheer-preview ───────────────────────────────────────────────────

/** Volledige redactie-systeemprompt met de default-directives, voor het
 *  audit-scherm /beheer/prompts. */
export function buildRedactiePromptPreview(now: Date = new Date()): string {
  const block = buildDirectivesBlock(
    { temporal: getDefaultDirectives(), functional: getDefaultFunctionalDirectives() },
    now,
    null,
  )
  return block ? `${REDACTIE_SYSTEM}\n\n${block}` : REDACTIE_SYSTEM
}
