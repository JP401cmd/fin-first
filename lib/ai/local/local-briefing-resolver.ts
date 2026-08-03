// ── Lokale (on-device) briefing-redactie ─────────────────────────────────────
//
// De dagelijkse briefing op /overzicht wordt DETERMINISTISCH gecomposeerd
// (lib/briefing/overview-briefing.ts); Fin herschrijft daarna alleen de woorden.
// Staat de uitvoergroep 'briefing' op lokaal, dan gebeurt dat herschrijven hier,
// in de browser, op WebGPU/Gemma — en verlaat er geen enkel gegeven het toestel
// (ADR 0043). Deze module is de tegenhanger van `redactBriefing` in
// lib/briefing/redactie.ts en levert bewust hetzelfde soort resultaat.
//
// GEEN JSON — ZEVEN LOSSE CALLS. Het cloudpad doet één `generateObject` met een
// schema over alle briefjes tegelijk. Dat is precies wat een 2B-model níet
// betrouwbaar kan: één ontbrekende komma of één afgekapte array maakt de hele
// redactie waardeloos. Daarom hier zes losse calls (één per briefje) plus één
// voor de kopzin, elk met PLATTE TEKST als uitvoer. Daarmee verdwijnt de hele
// JSON-fragiliteitsklasse en is elke fout LOKAAL: één mislukt of afgekeurd
// briefje kost precies dat ene briefje, de rest blijft staan.
//
// STILLE DEGRADATIE MAG HIER — en is GEEN cloud-fallback. Elke AI-fout valt
// vandaag al terug op de deterministische briefjes: dat is de bestaande,
// bedoelde werking (zie de kop van lib/briefing/redactie.ts). Er wordt hier dus
// nooit alsnog een cloud-call gedaan; "mislukt" betekent uitsluitend "de
// oorspronkelijke, feitelijk correcte tekst blijft staan". De UI toont eerlijk
// hoeveel briefjes daadwerkelijk herschreven zijn, zodat stil-niets-veranderen
// niet als succes voelt.
//
// GEEN CLOUD-GUARDRAILS: on-device, geen egress. `sanitizeForAI`/
// `maskPIIInOutput`/token-logging zijn N.V.T. (ADR 0043 §5) — de briefjes komen
// bovendien uit de eigen engine en gaan naar de eigen browser terug.
//
// DE SERVER BLIJFT BESLISSEN. De nummer-guard hieronder is een vóórfilter dat
// bepaalt of het lokale model iets bruikbaars maakte. Gezaghebbend is de
// persist-stap van app/api/briefing/refresh: die recomposeert de briefjes zelf
// en draait `sanitizeRedactedText`/`sanitizeAiHeadline` opnieuw tegen zijn eigen
// bron. Een gemanipuleerde client wint hier dus niets.

import type { BriefingEntry } from '@/lib/types/briefing'
import { extractNumericTokens, sanitizeRedactedText } from '@/lib/briefing/nummer-guard'
import { LOCAL_BRIEFING_DNA } from './local-briefing-prompt'
import { stripThink } from './parse'
// Statische import: litert-runtime laadt de zware @litert-lm/core-WASM-bundel
// pas lazy in zijn eigen functies, dus dit trekt die bundel NIET eager mee. De
// statische import maakt de generatie-callsite bovendien expliciet zodat de
// sanitize-scan ('m op de allowlist) 'm herkent (ADR 0035/0043).
import { loadModelSession, disposeSession } from './litert-runtime'

/** Maximale kopzin-lengte die we het model toestaan (spiegelt sanitizeAiHeadline). */
export const LOCAL_HEADLINE_MAX_LENGTH = 160

/**
 * max_new_tokens per call. Een briefje is hard begrensd op 240 tekens (≈60
 * tokens) en de kopzin op ~90; de marge vangt een aanloopzin op zonder dat een
 * uitweidend model minutenlang doorratelt.
 */
export const LOCAL_BRIEFING_MAX_NEW_TOKENS = 160
export const LOCAL_HEADLINE_MAX_NEW_TOKENS = 96

// ── Promptassemblage (puur) ──────────────────────────────────────────────────

/** Systeemprompt: de DNA-stem + (optioneel) de beheer-directives. */
export function buildLocalBriefingSystem(directivesBlock?: string): string {
  const block = directivesBlock?.trim()
  return block ? `${LOCAL_BRIEFING_DNA}\n\n${block}` : LOCAL_BRIEFING_DNA
}

/**
 * Opdracht voor één briefje. De regel met de letterlijke getallen is geen
 * sier: de nummer-guard keurt af zodra een bron-token niet exact terugkomt, en
 * een klein model normaliseert "€1.234" uit zichzelf naar "1234 euro". Door de
 * te bewaren tekenreeksen expliciet op te sommen, kost dat ~10 tokens in plaats
 * van een weggegooid briefje.
 */
export function buildLocalEntryPrompt(entry: Pick<BriefingEntry, 'text'>): string {
  const tokens = extractNumericTokens(entry.text)
  const lines = [
    'Herschrijf dit ene briefje in jouw stem. Antwoord met alleen de herschreven tekst.',
    '',
    `Briefje: ${entry.text}`,
  ]
  if (tokens.length > 0) {
    lines.push(
      `Deze tekenreeksen moeten letterlijk in je antwoord staan: ${tokens.join(' · ')}`,
    )
  }
  return lines.join('\n')
}

/** Opdracht voor de kopzin, op basis van de (deterministische) briefjes. */
export function buildLocalHeadlinePrompt(entries: Pick<BriefingEntry, 'text'>[]): string {
  return [
    'Schrijf één kopzin die deze briefing samenvat. Antwoord met alleen de kopzin.',
    '',
    'Briefjes:',
    ...entries.map((e) => `- ${e.text}`),
  ].join('\n')
}

/**
 * Ruwe modeltekst → kale zin. Vangt de drie bekende lokale faalmodi voor
 * PLATTE-tekst-uitvoer af: een <think>-preamble, een markdown-fence en een
 * beleefde aanloop ("Hier is de herschreven tekst:"). Puur en los getest.
 */
export function normalizeLocalText(raw: string | null | undefined): string {
  if (!raw) return ''
  let t = stripThink(raw).trim()

  const fence = t.match(/```(?:\w+)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()

  // Beleefde aanloop op de EERSTE regel ("Hier is …:", "Herschreven briefje:").
  // Alleen wanneer er daarna nog tekst volgt — anders zou een geldig antwoord
  // dat toevallig een dubbele punt bevat volledig verdwijnen.
  const opener = t.match(/^[^\n:]{0,60}:\s*\n?([\s\S]+)$/)
  if (opener && /\b(hier|onderstaand|herschreven|kopzin|briefje|antwoord)\b/i.test(t.slice(0, t.indexOf(':')))) {
    t = opener[1].trim()
  }

  return t.replace(/\s+/g, ' ').replace(/^["'\s]+|["'\s]+$/g, '').trim()
}

// ── Resultaatvorm ────────────────────────────────────────────────────────────

export interface LocalBriefingRedactie {
  /** Genormaliseerde kopzin, of null wanneer die niet gelukt is. */
  headline: string | null
  /** Alleen de briefjes die de nummer-guard client-side doorstonden. */
  texts: { id: string; text: string }[]
  /** Aantal aangeboden briefjes (de noemer in "X van Y herschreven"). */
  totaal: number
  /** Aantal calls dat met een runtime-fout eindigde (ná sessieherstel). */
  fouten: number
}

export type LocalBriefingFase = 'model-laden' | 'briefjes' | 'kopzin'

export interface LocalBriefingProgress {
  fase: LocalBriefingFase
  /** Afgeronde stappen binnen de fase. */
  gedaan: number
  /** Totaal aantal stappen binnen de fase. */
  van: number
}

// ── De redactie ──────────────────────────────────────────────────────────────

/**
 * Eén generatie met sessieherstel: bij een runtime-fout (device-loss, poisoned
 * session) één keer disposen + verse sessie + opnieuw. Faalt het weer, dan
 * propageert de fout naar de caller, die 'm per briefje opvangt. NOOIT een
 * stille cloud-uitwijk (privacy fail-closed).
 */
async function generateWithRecovery(
  system: string,
  user: string,
  maxNewTokens: number,
): Promise<string> {
  const run = async () => {
    const session = await loadModelSession()
    return session.generate(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      maxNewTokens,
    )
  }
  try {
    return await run()
  } catch (err) {
    // ALTIJD loggen: zonder deze regel is een lokale-AI-fout voor gebruiker én
    // support onzichtbaar — de UI toont alleen een geteld "niet herschreven".
    console.error('[lokale-ai] briefing-call mislukt — sessieherstel + één retry volgt:', err)
    await disposeSession()
    return run()
  }
}

/**
 * Herschrijf de briefing on-device: één call per briefje plus één voor de
 * kopzin. Werpt alleen wanneer er niets te doen is misgegaan dat de caller moet
 * weten — een mislukt of afgekeurd briefje is géén fout maar een stille
 * terugval op de deterministische tekst (zie de kop van dit bestand).
 *
 * @param entries         De server-gecomposeerde briefjes (bron van waarheid).
 * @param opts.directivesBlock  Het gecondenseerde, alleen-actieve directives-blok.
 * @param opts.onProgress Voortgang voor de UI (de eerste sessie-load is een
 *                        stille GPU-warmup van ~45-60s; zonder signaal voelt dat
 *                        als een hang).
 */
export async function redactBriefingLocally(
  entries: BriefingEntry[],
  opts: {
    directivesBlock?: string
    onProgress?: (p: LocalBriefingProgress) => void
  } = {},
): Promise<LocalBriefingRedactie> {
  const { directivesBlock, onProgress } = opts
  if (entries.length === 0) {
    return { headline: null, texts: [], totaal: 0, fouten: 0 }
  }

  const system = buildLocalBriefingSystem(directivesBlock)
  const texts: { id: string; text: string }[] = []
  let fouten = 0

  // Warmup expliciet vóór de eerste briefje-call, zodat de UI "model laden" en
  // "briefje 1 van 6" niet in één stille wachttijd op elkaar plakken.
  onProgress?.({ fase: 'model-laden', gedaan: 0, van: 1 })
  try {
    await loadModelSession()
    onProgress?.({ fase: 'model-laden', gedaan: 1, van: 1 })
  } catch (err) {
    // Zonder model is er niets te redigeren. Werpen, zodat de caller de
    // gebruiker een eerlijke melding kan tonen i.p.v. "0 van 6 herschreven".
    console.error('[lokale-ai] model laden mislukt — briefing-redactie stopt:', err)
    throw err
  }

  for (const [i, entry] of entries.entries()) {
    onProgress?.({ fase: 'briefjes', gedaan: i, van: entries.length })
    try {
      const raw = await generateWithRecovery(
        system,
        buildLocalEntryPrompt(entry),
        LOCAL_BRIEFING_MAX_NEW_TOKENS,
      )
      // Vóórfilter met dezelfde guard die de server straks gezaghebbend draait:
      // afgekeurd → dit briefje niet meesturen, het origineel blijft staan.
      const approved = sanitizeRedactedText(normalizeLocalText(raw), entry.text)
      if (approved) texts.push({ id: entry.id, text: approved })
    } catch (err) {
      fouten++
      console.error(`[lokale-ai] briefje "${entry.id}" niet herschreven:`, err)
    }
  }
  onProgress?.({ fase: 'briefjes', gedaan: entries.length, van: entries.length })

  // Kopzin als laatste: hij vat de briefing samen, dus de deterministische
  // bronteksten zijn de juiste input (niet de herschreven varianten — die
  // kunnen deels ontbreken en zouden het beeld scheeftrekken).
  onProgress?.({ fase: 'kopzin', gedaan: 0, van: 1 })
  let headline: string | null = null
  try {
    const raw = await generateWithRecovery(
      system,
      buildLocalHeadlinePrompt(entries),
      LOCAL_HEADLINE_MAX_NEW_TOKENS,
    )
    const cleaned = normalizeLocalText(raw)
    // Geen nummer-guard op de kop (die kent geen vaste bron) — wel dezelfde
    // lengtegrens als sanitizeAiHeadline server-side, zodat we niets posten
    // wat daar toch wordt afgekeurd.
    headline = cleaned && cleaned.length <= LOCAL_HEADLINE_MAX_LENGTH ? cleaned : null
  } catch (err) {
    fouten++
    console.error('[lokale-ai] kopzin niet gegenereerd:', err)
  }
  onProgress?.({ fase: 'kopzin', gedaan: 1, van: 1 })

  return { headline, texts, totaal: entries.length, fouten }
}
