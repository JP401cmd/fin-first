// ── Lokale (on-device) rekenhulp-bouwer ─────────────────────────────────────
//
// Bouwt een MINI-rekenhulp volledig op het toestel, in vier korte beurten op één
// chatsessie. Levert exact hetzelfde contract als de cloud-route
// (`BuildCalculatorResult`), zodat de UI-naad één functie-swap is.
//
// WAAROM VIER BEURTEN OP ÉÉN SESSIE en niet vier verse sessies: een verse sessie
// per beurt is de categorisatie-valstrik — dan moet elke beurt zijn eigen context
// opnieuw meekrijgen, wat het tokenbudget precies de kant op duwt die we hier
// proberen te vermijden. `createChatSession` houdt de historie NATIEF vast; we
// bewaren die ene sessie voor de duur van de bouw en sluiten 'm daarna.
//
// TEGELIJK IS ELKE BEURT ZELFSTANDIG GESCHREVEN (de toegestane namen staan
// letterlijk in stap 3, de vraag wordt herhaald in stap 3 en 4). Dat is geen
// verdubbeling maar een bewuste vangnet-eigenschap: valt de engine om, dan
// kunnen we een verse sessie openen en alléén de mislukte stap overdoen — zonder
// de al voltooide stappen weg te gooien.
//
// GEEN CLOUD-TERUGVAL. Er staat in dit bestand geen enkele aanroep naar
// `/api/ai/*`. Faalt een stap definitief, dan is de uitkomst een eerlijke fout.
//
// GEEN CLOUD-GUARDRAILS: on-device pad (WebGPU/Gemma), geen egress.
// `sanitizeForAI`/`maskPIIInOutput`/token-logging zijn N.V.T. (ADR 0043 §5).

import { extractLocalJsonObjects } from './parse'
import { createChatSession, disposeSession, type LocalChatSession } from './litert-runtime'
import {
  LOCAL_CALCULATOR_DNA,
  LOCAL_CALC_STEP_LABELS,
  LOCAL_CALC_STEP_WARN_MS,
  buildLocalCalcStep1,
  buildLocalCalcStep2,
  buildLocalCalcStep3,
  buildLocalCalcStep4,
} from './local-calculator-prompt'
import {
  CalculatorDefinitionSchema,
  LocalCalculatorDefinitionSchema,
  LocalStep1InputsSchema,
  LocalStep2PrefillSchema,
  LocalStep3OutputsSchema,
  LocalStep4MetaSchema,
  normalizeLocalKey,
  type LocalCalculatorInput,
  type LocalCalculatorOutput,
} from './local-calculator-schema'
import { assembleLocalDefinition, repairLocalDefinition } from './local-calculator-repair'
import { PREFILL_KEY_SET } from '@/lib/calculator/user-data-keys'
import type { BuildCalculatorResult } from '@/lib/ai/build-calculator'

export type LocalCalcStep = 1 | 2 | 3 | 4

/**
 * Wat er tot nu toe klaar is. De aanroeper krijgt dit bij elke voortgangsmelding
 * mee en kan het bij een volgende poging als `resume` teruggeven — dan slaan we
 * de al voltooide stappen over. Zonder dat zou één hang in stap 4 de drie
 * geslaagde stappen (samen enkele minuten GPU-tijd) weggooien.
 */
export interface LocalCalcPartial {
  inputs?: LocalCalculatorInput[]
  /** Is de prefill-koppeling (stap 2) al gedaan? Ook `true` als er niets paste. */
  prefillsGedaan?: boolean
  outputs?: LocalCalculatorOutput[]
  meta?: { name: string; description?: string; assumptions?: string[] }
}

export interface LocalCalcProgress {
  step: LocalCalcStep
  /** Aantal stappen in totaal — voor "stap 2 van 4" in de UI. */
  totaal: 4
  label: string
  /** 'bezig' = de stap draait, 'klaar' = de stap is verwerkt. */
  fase: 'bezig' | 'klaar'
  partial: LocalCalcPartial
}

export interface BuildLocalCalculatorOptions {
  onProgress?: (p: LocalCalcProgress) => void
  signal?: AbortSignal
  /** Voortgang uit een eerdere, afgebroken poging (zie {@link LocalCalcPartial}). */
  resume?: LocalCalcPartial
}

/** Interne, herkenbare fout voor een afgekapte modeluitvoer. */
class LocalCalcTruncatedError extends Error {
  constructor(public readonly step: LocalCalcStep) {
    super(`stap ${step} werd afgekapt`)
    this.name = 'LocalCalcTruncatedError'
  }
}

/** Interne fout voor een stap die wél afmaakte maar geen bruikbare JSON gaf. */
class LocalCalcShapeError extends Error {
  constructor(
    public readonly step: LocalCalcStep,
    public readonly detail: string,
  ) {
    super(`stap ${step}: ${detail}`)
    this.name = 'LocalCalcShapeError'
  }
}

const ABORT_ERROR = 'Bouwen afgebroken.'

/**
 * Eén sessie voor de hele bouw, met herstel. Bij een inferentiefout gooien we de
 * engine weg (`disposeSession` — het herstelpad na een WebGPU device-loss) en
 * openen we een verse chatsessie voor de volgende poging. De historie is dan
 * weg; dat kan omdat elke beurt zelfstandig is geschreven (zie kop).
 */
class LocalCalcRunner {
  private session: LocalChatSession | null = null

  private async ensureSession(): Promise<LocalChatSession> {
    if (!this.session) {
      this.session = await createChatSession(LOCAL_CALCULATOR_DNA)
    }
    return this.session
  }

  /** Sluit de conversatie; de gedeelde engine blijft staan voor andere functies. */
  dispose(): void {
    this.session?.dispose()
    this.session = null
  }

  /** Verstuur één beurt, met precies één sessieherstel + retry. */
  async run(step: LocalCalcStep, message: string): Promise<string> {
    const attempt = async (): Promise<string> => {
      const session = await this.ensureSession()
      const t0 = Date.now()
      const raw = await session.send(message, () => {})
      const ms = Date.now() - t0
      if (ms > LOCAL_CALC_STEP_WARN_MS) {
        // We kappen bewust NIET af: de generatie loopt op een gedeelde
        // GPU-wachtrij door, dus een "afgebroken" call zou de volgende stap
        // alleen maar achter zichzelf laten wachten. Meten en melden dus.
        console.warn(`[lokale-ai] rekenhulp-stap ${step} duurde ${Math.round(ms / 1000)}s (> ${LOCAL_CALC_STEP_WARN_MS / 1000}s)`)
      }
      return raw
    }

    try {
      return await attempt()
    } catch (err) {
      // ALTIJD loggen: zonder deze regel is een lokale-AI-fout voor gebruiker
      // én support onzichtbaar (de UI toont alleen een generieke melding).
      console.error(`[lokale-ai] rekenhulp-stap ${step} faalde — sessieherstel + één retry volgt:`, err)
      this.dispose()
      await disposeSession()
      return attempt()
    }
  }
}

/**
 * Haal de JSON-objecten uit één modelantwoord, of gooi.
 *
 * AFKAPPING IS HIER EEN HARDE FOUT. De cloud-route herkent dit via
 * `NoObjectGeneratedError.finishReason === 'length'`; lokaal bestaat dat signaal
 * niet (de web-SDK levert geen finishReason en kent geen max_new_tokens). De
 * `truncated`-vlag uit `parse.ts` is het enige signaal dat we hebben — en een
 * half-geldige definitie doorlaten is precies wat we niet willen: die zou als
 * een complete rekenhulp worden opgeslagen.
 */
function extractStepObjects(step: LocalCalcStep, raw: string): unknown[] {
  const { objects, truncated } = extractLocalJsonObjects(raw)
  if (truncated) throw new LocalCalcTruncatedError(step)
  if (!objects || objects.length === 0) {
    throw new LocalCalcShapeError(step, 'geen bruikbare JSON in het antwoord')
  }
  return objects
}

/**
 * Bouw een mini-rekenhulp on-device.
 *
 * @returns hetzelfde contract als `buildCalculator` (cloud): `{ok:true, definition}`
 *          of `{ok:false, error}`. Nooit een half-geldige definitie.
 */
export async function buildLocalCalculator(
  rawPrompt: string,
  options: BuildLocalCalculatorOptions = {},
): Promise<BuildCalculatorResult> {
  const question = rawPrompt.trim()
  if (!question) return { ok: false, error: 'Lege vraag.' }

  const { onProgress, signal, resume } = options
  const runner = new LocalCalcRunner()

  // Losse variabelen i.p.v. één muteerbaar object: zo weet TypeScript ná stap 1
  // dat `inputs` bestaat, en blijft de voortgangs-snapshot een expliciete kopie.
  let inputs: LocalCalculatorInput[] | undefined = resume?.inputs
  let prefillsGedaan = resume?.prefillsGedaan ?? false
  let outputs: LocalCalculatorOutput[] | undefined = resume?.outputs
  let meta: LocalCalcPartial['meta'] = resume?.meta

  const snapshot = (): LocalCalcPartial => ({
    ...(inputs ? { inputs: [...inputs] } : {}),
    prefillsGedaan,
    ...(outputs ? { outputs: [...outputs] } : {}),
    ...(meta ? { meta: { ...meta } } : {}),
  })

  const melden = (step: LocalCalcStep, fase: 'bezig' | 'klaar') =>
    onProgress?.({
      step,
      totaal: 4,
      label: LOCAL_CALC_STEP_LABELS[step],
      fase,
      partial: snapshot(),
    })

  try {
    // ── Stap 1 — welke grootheden ─────────────────────────────────────────
    if (!inputs) {
      if (signal?.aborted) return { ok: false, error: ABORT_ERROR }
      melden(1, 'bezig')
      const raw = await runner.run(1, buildLocalCalcStep1(question))
      const parsed = LocalStep1InputsSchema.safeParse(extractStepObjects(1, raw))
      if (!parsed.success) {
        throw new LocalCalcShapeError(1, 'de opgegeven gegevens waren onbruikbaar')
      }
      inputs = parsed.data
      melden(1, 'klaar')
    }
    const inputKeys = inputs.map((i) => i.key)

    // ── Stap 2 — gesloten keuze uit de 13 prefill-keys ────────────────────
    // DEZE STAP IS ALS ENIGE NIET FATAAL — ook niet bij afkapping. Geen prefill
    // is namelijk een volwaardige uitkomst: de rekenhulp werkt dan gewoon, de
    // gebruiker typt de waarde zelf. En een afkapping in de kórtste beurt van de
    // vier (een handvol paren) zegt meer over de vorm van het antwoord dan over
    // het contextvenster. Bij stap 1, 3 en 4 is de uitvoer dragend en blijft
    // afkapping wél fataal — daar zou doorgaan een halve rekenhulp opleveren.
    if (!prefillsGedaan) {
      if (signal?.aborted) return { ok: false, error: ABORT_ERROR }
      melden(2, 'bezig')
      try {
        const raw = await runner.run(2, buildLocalCalcStep2(inputKeys))
        const parsed = LocalStep2PrefillSchema.safeParse(extractStepObjects(2, raw))
        if (parsed.success) {
          const byInput = new Map<string, string>()
          for (const pair of parsed.data) {
            const key = normalizeLocalKey(pair.input)
            // Twee inputs aan dezelfde prefill-key hangen is zinloos (beide
            // sliders zouden dezelfde waarde tonen) — de eerste koppeling wint.
            if (byInput.has(key)) continue
            if (inputKeys.includes(key)) byInput.set(key, pair.prefill)
          }
          inputs = inputs.map((input) => {
            const prefill = byInput.get(input.key)
            return prefill ? { ...input, prefill } : input
          })
        }
      } catch (err) {
        console.warn('[lokale-ai] rekenhulp-stap 2 gaf geen bruikbare koppeling — zonder prefill door:', err)
      }
      prefillsGedaan = true
      melden(2, 'klaar')
    }

    // ── Stap 3 — de formules ──────────────────────────────────────────────
    if (!outputs) {
      if (signal?.aborted) return { ok: false, error: ABORT_ERROR }
      melden(3, 'bezig')
      const gekozenPrefills = inputs
        .map((i) => i.prefill)
        .filter((p): p is string => typeof p === 'string' && PREFILL_KEY_SET.has(p))
      const toegestaan = [...inputKeys, ...gekozenPrefills]
      const raw = await runner.run(3, buildLocalCalcStep3(question, toegestaan))
      const parsed = LocalStep3OutputsSchema.safeParse(extractStepObjects(3, raw))
      if (!parsed.success) {
        throw new LocalCalcShapeError(3, 'de formules waren onbruikbaar')
      }
      outputs = parsed.data
      melden(3, 'klaar')
    }

    // ── Stap 4 — naam, uitleg, aannames ───────────────────────────────────
    if (!meta) {
      if (signal?.aborted) return { ok: false, error: ABORT_ERROR }
      melden(4, 'bezig')
      const raw = await runner.run(4, buildLocalCalcStep4(question))
      const parsed = LocalStep4MetaSchema.safeParse(extractStepObjects(4, raw))
      if (!parsed.success) {
        throw new LocalCalcShapeError(4, 'naam en aannames waren onbruikbaar')
      }
      const first = parsed.data[0]
      meta = {
        name: first.name,
        description: first.description,
        assumptions: first.assumptions,
      }
      melden(4, 'klaar')
    }

    // ── Assemblage + de twee poorten ──────────────────────────────────────
    const parts = {
      inputs,
      outputs,
      name: meta.name,
      description: meta.description,
      assumptions: meta.assumptions,
    }

    const assembled = assembleLocalDefinition(parts)

    // POORT 1 — de generatie: mocht het model tóch een derived/narrative/enum
    // hebben binnengesmokkeld, dan ketst dat hier af (strict schema).
    const lokaal = LocalCalculatorDefinitionSchema.safeParse(assembled)
    if (!lokaal.success) {
      console.warn('[lokale-ai] rekenhulp voldeed niet aan het lokale schema:', lokaal.error.issues.slice(0, 3))
      return {
        ok: false,
        error:
          'De lokale AI leverde een rekenhulp die niet aan de eenvoudige vorm voldeed. Probeer je vraag korter en concreter te stellen.',
      }
    }

    // DETERMINISTISCHE REPARATIE — nooit een tweede generatie (zie
    // local-calculator-repair.ts voor waarom dat lokaal de verkeerde keuze is).
    const { definition, repairs, restUnknown } = repairLocalDefinition(assembled, PREFILL_KEY_SET)
    if (repairs.length > 0) {
      console.info('[lokale-ai] rekenhulp deterministisch gerepareerd:', repairs)
    }
    if (!definition) {
      return {
        ok: false,
        error: `De formules verwezen naar iets dat niet bestaat (${restUnknown.slice(0, 3).join(', ')}) en waren niet te herstellen. Probeer je vraag concreter te formuleren.`,
      }
    }

    // POORT 2 — het opslag- en rendercontract. De reparatie mag boven de lokale
    // caps uitkomen, maar nooit buiten de canonieke definitie.
    const canoniek = CalculatorDefinitionSchema.safeParse(definition)
    if (!canoniek.success) {
      console.warn('[lokale-ai] gerepareerde rekenhulp viel buiten het canonieke schema:', canoniek.error.issues.slice(0, 3))
      return {
        ok: false,
        error: 'De rekenhulp kon niet worden vastgelegd in een geldige vorm. Probeer je vraag anders te formuleren.',
      }
    }

    return { ok: true, definition: canoniek.data }
  } catch (err) {
    if (err instanceof LocalCalcTruncatedError) {
      console.error('[lokale-ai] rekenhulp afgekapt in stap', err.step)
      return {
        ok: false,
        error: `Het antwoord van de lokale AI werd halverwege afgekapt (stap ${err.step} van 4). Een half-afgemaakte rekenhulp bewaren we niet. Stel je vraag korter, of zet 'Rapporten & rekenhulpen' op cloud-AI via Mijn → Privacy voor een uitgebreidere rekenhulp.`,
      }
    }
    if (err instanceof LocalCalcShapeError) {
      console.error('[lokale-ai] rekenhulp-vormfout:', err.message)
      return {
        ok: false,
        error: `De lokale AI gaf een onbruikbaar antwoord (stap ${err.step} van 4). Probeer je vraag korter en concreter te stellen.`,
      }
    }
    console.error('[lokale-ai] rekenhulp bouwen mislukt:', err)
    return {
      ok: false,
      error: 'De lokale AI kon geen rekenhulp maken. Probeer het opnieuw, of stel je vraag eenvoudiger.',
    }
  } finally {
    runner.dispose()
  }
}
