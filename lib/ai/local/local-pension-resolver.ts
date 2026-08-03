// ── Lokaal (on-device) pensioenoverzicht uitlezen ────────────────────────────
//
// De structurele tweeling van lib/ai/local/local-vaste-kosten-resolver.ts:
// sessieherstel (dispose + één retry, dan werpen), een sessiestart-signaal voor
// de stille GPU-warmup, en NOOIT een stille cloud-fallback. Wie die resolver
// begrijpt, begrijpt deze.
//
// Wat hier ANDERS is, en waarom:
//
//  1. DE TAAK IS HERONTWORPEN, NIET OMGEZET. Het cloud-pad stuurt de PDF mee als
//     `{type:'file'}` en het model KIJKT naar het document. Dat kan on-device
//     niet: de runtime kent alleen `{role, content: string}` en de bundel is de
//     tekstvariant. Hier wint pdfjs eerst deterministisch de tekstlaag, en doet
//     het model alleen nog tekst→JSON.
//
//  2. ER IS GEEN ZOD-POORT BIJ HET MODEL. `generateObject` bestaat lokaal niet.
//     Daarom staat `PensionParseResultSchema.safeParse` er als HARDE POORT
//     achter: komt het geaggregeerde resultaat daar niet doorheen, dan is er
//     geen resultaat — een eerlijke melding, en nooit alsnog /api/pension/parse.
//
//  3. HET MODEL REKENT NIET. Jaar→maand, NL-notatie, euroteken en minteken zijn
//     deterministisch in local-pension-parse.ts afgehandeld, met sanity-grenzen
//     erachter. Zie de kop van dat bestand.
//
//  4. GEEN CONSENT-GATE, GEEN CREDITS. De AVG-consent (`pension_pdf_ai_v1`) en
//     `recordAiUsage('extraction')` horen bij het cloud-pad: die bestaan omdat er
//     een derde partij en een rekening zijn. Hier is er geen van beide.
//
// GEEN CLOUD-GUARDRAILS: on-device (WebGPU/Gemma), geen egress. `sanitizeForAI`/
// `maskPIIInOutput`/token-logging zijn N.V.T. (ADR 0043 §5). De aanroeper draait
// wél `stripSensitiveData` over de tekstlaag — niet omdat het moet, maar omdat
// een BSN nergens in een promptstring hoeft te staan.
//
// GEHEUGEN. Een UPO van 10 MB ligt naast ~2 GB modelgewicht op gedeeld
// iGPU-geheugen. Daarom komt de tekstlaag hier al PAGINA VOOR PAGINA binnen
// (lib/pdf/extract-text.ts geeft elke pagina direct vrij) en verwerken we blok
// voor blok, zonder het hele document ooit als één string vast te houden.

import { PensionParseResultSchema, type PensionParseResult } from '@/lib/pension/types'
import {
  LOCAL_PENSION_DNA,
  buildLocalPensionUserPrompt,
  splitPensionBlocks,
  MIN_PENSION_TEXT_LENGTH,
} from './local-pension-prompt'
import {
  parseLocalPensionBlock,
  normalizeLocalRegeling,
  isAowRegeling,
  type PensionOnzekerVeld,
  type Regeling,
} from './local-pension-parse'
// Statische import: litert-runtime laadt de zware @litert-lm/core-WASM-bundel pas
// lazy in zijn eigen functies (dynamic import), dus dit trekt die bundel NIET
// eager mee. De statische import maakt de generatie-callsite bovendien expliciet
// zodat de sanitize-scan ('m op de allowlist) 'm herkent (ADR 0035/0043).
import { loadModelSession, disposeSession } from './litert-runtime'

/**
 * max_new_tokens-schatting voor één blok: één plat object van zes velden past
 * ruim in 160 tokens. De LiteRT-web-SDK kent geen per-call cap en negeert deze
 * waarde; hij blijft in de signatuur zodat het contract gelijkloopt met de
 * andere lokale resolvers en een toekomstige runtime 'm kan honoreren.
 */
export const LOCAL_PENSION_MAX_NEW_TOKENS = 160

/** Eén overgenomen regeling plus de velden die 'minder zeker' zijn. */
export interface LocalPensionRegeling {
  regeling: Regeling
  onzeker: PensionOnzekerVeld[]
}

/** Waarom het lokale uitlezen niets opleverde. */
export type LocalPensionFaalreden = 'geen-tekstlaag' | 'geen-regelingen' | 'schema'

export type LocalPensionUitkomst =
  | {
      ok: true
      /** Het gevalideerde resultaat — identiek contract aan het cloud-pad. */
      result: PensionParseResult
      /** Per regeling (zelfde volgorde als `result.regelingen`) de onzekere velden. */
      onzeker: PensionOnzekerVeld[][]
      /** Aantal blokken dat op een sanity-grens is afgevallen (voor de melding). */
      afgevallen: number
    }
  | { ok: false; reden: LocalPensionFaalreden; message: string }

/**
 * De melding bij een PDF zonder bruikbare tekstlaag. Concreet en met een uitweg,
 * want dit is het meest voorkomende eerlijke falen: een gescande of
 * gefotografeerde UPO heeft geen tekst, en on-device is er geen OCR en kan het
 * tekstmodel geen afbeelding bekijken.
 */
export const GEEN_TEKSTLAAG_MELDING =
  'Dit PDF-type kunnen we op dit apparaat niet lezen — er zit geen tekstlaag in (bijvoorbeeld bij een scan of een foto). Gebruik de JSON-export van mijnpensioen.nl; die lezen we volledig op je eigen apparaat.'

const GEEN_REGELINGEN_MELDING =
  'We konden in dit overzicht geen pensioenregeling herkennen. Gebruik de JSON-export van mijnpensioen.nl voor een betrouwbare overname.'

const SCHEMA_MELDING =
  'Het uitlezen leverde geen bruikbaar resultaat op. Gebruik de JSON-export van mijnpensioen.nl.'

export interface LocalPensionOptions {
  /**
   * Rond het laden van de on-device sessie: 'starten' vlak vóór
   * loadModelSession(), 'klaar' zodra die resolved. De eerste (koude) load is de
   * trage GPU-warmup (~45-60 s, volledig stil); zonder dit signaal voelt dat als
   * een hang.
   */
  onSessionState?: (s: 'starten' | 'klaar') => void
  /** Voortgang per verwerkt blok — de lokale flow duurt merkbaar langer dan cloud. */
  onProgress?: (done: number, total: number) => void
}

/**
 * Bouwt de lokale pensioen-resolver. Geeft een functie die de per-pagina
 * tekstlaag omzet naar een gevalideerd {@link PensionParseResult}.
 *
 * Werpt wanneer een blok ook ná sessieherstel faalt — de UI toont dan een
 * eerlijke foutmelding. Er is GEEN cloud-fallback: dat zou de privacybelofte
 * breken die de gebruiker juist heeft gekozen.
 */
export function createLocalPensionResolver(
  opts?: LocalPensionOptions,
): (pages: string[]) => Promise<LocalPensionUitkomst> {
  const onSessionState = opts?.onSessionState
  const onProgress = opts?.onProgress

  const runBlock = async (block: string): Promise<string> => {
    onSessionState?.('starten')
    const session = await loadModelSession()
    onSessionState?.('klaar')
    return session.generate(
      [
        { role: 'system', content: LOCAL_PENSION_DNA },
        { role: 'user', content: buildLocalPensionUserPrompt(block) },
      ],
      LOCAL_PENSION_MAX_NEW_TOKENS,
    )
  }

  const runBlockWithRecovery = async (block: string): Promise<string> => {
    try {
      return await runBlock(block)
    } catch (err) {
      // Mogelijke device-loss/poisoned session → dispose + verse sessie, één keer
      // opnieuw. ALTIJD loggen: zonder deze regels is een lokale-AI-fout voor
      // gebruiker én support onzichtbaar — de UI toont alleen een generieke tekst.
      console.error('[lokale-ai] pensioen-blok mislukt — sessieherstel + één retry volgt:', err)
      await disposeSession()
      try {
        return await runBlock(block)
      } catch (err2) {
        console.error('[lokale-ai] pensioen-blok mislukt ná sessieherstel — uitlezen faalt definitief:', err2)
        throw err2
      }
    }
  }

  return async (pages: string[]): Promise<LocalPensionUitkomst> => {
    // ── Poort 1: is er überhaupt een tekstlaag? ───────────────────────────────
    // BEWUST VÓÓR ELKE MODELAANROEP. Een scan levert hooguit wat watermerkruis
    // op; die minutenlang door een 2B-model halen om daarna alsnog niets te
    // kunnen zeggen is verspilde tijd én een misleidende ervaring.
    const totaalTekens = pages.reduce((n, p) => n + p.trim().length, 0)
    if (totaalTekens < MIN_PENSION_TEXT_LENGTH) {
      return { ok: false, reden: 'geen-tekstlaag', message: GEEN_TEKSTLAAG_MELDING }
    }

    const blocks = splitPensionBlocks(pages)
    if (blocks.length === 0) {
      return { ok: false, reden: 'geen-tekstlaag', message: GEEN_TEKSTLAAG_MELDING }
    }

    // ── Per blok één generatie ────────────────────────────────────────────────
    const regelingen: Regeling[] = []
    const onzekerPerRegeling: PensionOnzekerVeld[][] = []
    let aowBedrag: number | null = null
    let afgevallen = 0

    for (const [i, block] of blocks.entries()) {
      const text = await runBlockWithRecovery(block)
      onProgress?.(i + 1, blocks.length)

      const raw = parseLocalPensionBlock(text)
      if (!raw) {
        // Onparsebaar antwoord telt als afgevallen blok, niet als harde fout:
        // één stuk tekst dat het model niet aankan mag het hele overzicht niet
        // onbruikbaar maken.
        afgevallen += 1
        continue
      }

      const genormaliseerd = normalizeLocalRegeling(raw)
      if (!genormaliseerd.ok) {
        // 'leeg' is een geldig antwoord op een blok zonder regeling en telt niet
        // als verlies; een afgekeurd bedrag wél (dat wil de gebruiker weten).
        if (genormaliseerd.reden !== 'leeg') afgevallen += 1
        continue
      }

      // AOW is geen aanvullende regeling maar een eigen veld in het contract.
      // Deterministische naamtoets, zodat de AOW niet óók als pensioenpot in het
      // Horizon-model belandt (dubbeltelling).
      if (isAowRegeling(genormaliseerd.regeling.fondsNaam)) {
        if (aowBedrag === null) aowBedrag = genormaliseerd.regeling.brutoBedrag
        continue
      }

      regelingen.push(genormaliseerd.regeling)
      onzekerPerRegeling.push(genormaliseerd.onzeker)
    }

    if (regelingen.length === 0 && aowBedrag === null) {
      return { ok: false, reden: 'geen-regelingen', message: GEEN_REGELINGEN_MELDING }
    }

    // ── Deterministische afleidingen (het model raakt deze niet aan) ──────────
    const nabestaanden = regelingen
      .filter((r) => r.type === 'nabestaandenpensioen')
      .reduce((sum, r) => sum + r.brutoBedrag, 0)

    // De samenvatting wordt in TS geschreven, niet gegenereerd: een tweede
    // modelaanroep kost on-device tientallen seconden voor één zin, en een
    // gegenereerde samenvatting is precies de plek waar getallen gaan zweven.
    const samenvatting = bouwSamenvatting(regelingen.length, aowBedrag, afgevallen)

    const kandidaat = {
      aowBedrag,
      regelingen,
      nabestaandenpensioen: nabestaanden > 0 ? nabestaanden : null,
      samenvatting,
    }

    // ── Poort 2: het canonieke schema, hard ──────────────────────────────────
    // Lokaal is er geen zod bij het model; deze poort vervangt 'm. Niet
    // doorheen = geen resultaat. Nooit alsnog de cloud.
    const parsed = PensionParseResultSchema.safeParse(kandidaat)
    if (!parsed.success) {
      console.error('[lokale-ai] pensioen-resultaat faalde op het schema:', parsed.error.issues)
      return { ok: false, reden: 'schema', message: SCHEMA_MELDING }
    }

    return { ok: true, result: parsed.data, onzeker: onzekerPerRegeling, afgevallen }
  }
}

/** Feitelijke samenvatting in gewone taal — puur beschrijvend, geen oordeel. */
function bouwSamenvatting(aantal: number, aowBedrag: number | null, afgevallen: number): string {
  const delen: string[] = []
  delen.push(
    aantal === 0
      ? 'Op dit apparaat uitgelezen; geen aanvullende pensioenregeling herkend'
      : `Op dit apparaat uitgelezen: ${aantal} pensioenregeling${aantal === 1 ? '' : 'en'} herkend`,
  )
  if (aowBedrag !== null) delen.push('AOW-bedrag gevonden')
  if (afgevallen > 0) {
    delen.push(
      `${afgevallen} onderdeel${afgevallen === 1 ? '' : 'en'} kon${afgevallen === 1 ? '' : 'den'} niet betrouwbaar gelezen worden`,
    )
  }
  return `${delen.join('. ')}. Controleer de bedragen voordat je ze overneemt.`
}
