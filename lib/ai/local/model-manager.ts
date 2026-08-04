// ── Lokale model-manager (download / staat / verwijderen) ─────────────────────
//
// Beheert de levenscyclus van het on-device Gemma 4 E2B-model voor de fase-2-UI
// op /mijn/privacy (parallelle agent) én voor de categorisatie-sheet, die de
// staat leest om te beslissen of het lokale pad beschikbaar is.
//
// Bewust dynamische import van de runtime: de zware LiteRT-LM/WASM-bundel komt
// pas binnen bij een echte download/inferentie, niet bij het lezen van de staat.

import type { ProofOptions, ProofOutcome } from './output-proof'
import { storeSelectedLocalModelId } from './selected-model'
import type { LocalModelId } from './model-catalog'

export type LocalModelState = 'niet-gedownload' | 'downloaden' | 'klaar' | 'fout'

export type LocalModelProgress = {
  loadedBytes: number
  totalBytes: number | null
  file?: string
}

/**
 * Gemeten download-omvang (GB) uit het L1-meetrapport (LiteRT-LM .litertlm
 * webbundel, gemeten 2,01 GB). Getoond in de consent-stap als eerlijke
 * verwachting — geen aanname.
 */
export const LOCAL_MODEL_DOWNLOAD_GB = 2.0

// In-memory staat voor de duur van deze pagina/sessie. Een lopende download
// ('downloaden') of een zojuist gefaalde poging ('fout') is niet uit de Cache
// Storage af te leiden; die transiënte statussen houden we hier vast. Na een
// herlaad valt de staat terug op de cache-afgeleide waarde (klaar/niet-gedownload).
let transientState: LocalModelState | null = null

/**
 * Huidige staat van het lokale model + best-effort byte-omvang.
 *
 * - Loopt er nu een download / net gefaald → die transiënte staat wint.
 * - Anders: uit de Cache Storage afgeleid (aanwezig = 'klaar', anders
 *   'niet-gedownload'). Een onderbroken download laat hooguit partiële shards
 *   achter; die tellen bewust NIET als 'klaar' (de gebruiker ziet "in
 *   afwachting"/niet-gedownload en kan opnieuw starten — FR-2.3).
 */
export async function getLocalModelState(): Promise<{ state: LocalModelState; bytes: number | null }> {
  if (transientState === 'downloaden' || transientState === 'fout') {
    return { state: transientState, bytes: null }
  }
  try {
    const { isModelCached } = await import('./litert-runtime')
    const cached = await isModelCached()
    return { state: cached ? 'klaar' : 'niet-gedownload', bytes: null }
  } catch {
    return { state: 'niet-gedownload', bytes: null }
  }
}

/**
 * Download (warmt) het model in de browser-cache. Rapporteert voortgang per
 * aggregaat-snapshot. Vraagt na succes `navigator.storage.persist()` aan zodat
 * de browser de shards minder snel evict (FR-2.3). Werpt bij een fout — de
 * caller (fase-2-UI) toont dan de melding en biedt opnieuw-proberen.
 */
export async function downloadLocalModel(onProgress: (p: LocalModelProgress) => void): Promise<void> {
  transientState = 'downloaden'
  try {
    const { loadModelSession } = await import('./litert-runtime')
    await loadModelSession((p) => onProgress(p))

    // Persistente opslag aanvragen zodat de ~2,0 GB bundel behouden blijft.
    try {
      if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
        await navigator.storage.persist()
      }
    } catch {
      /* persist is best-effort; falen mag de download niet ongeldig maken */
    }

    transientState = null // vanaf nu leidt de cache de staat af ('klaar')
  } catch (err) {
    transientState = 'fout'
    throw err
  }
}

/**
 * Draai de uitvoer-toets op dit toestel: laadt (of hergebruikt) de sessie en
 * legt het model drie korte proefvragen voor. Zie output-proof.ts voor waarom
 * dit náást de capability-check nodig is — kort gezegd: een toestel kan de
 * GPU-lat halen en tóch onzin produceren, en alleen deze toets ziet dat.
 *
 * Werpt nooit: een engine die niet wil laden is voor de gebruiker hetzelfde als
 * een toestel dat zakt, en verdient dus ook een leesbare reden.
 */
export async function proveLocalModel(opts?: ProofOptions): Promise<ProofOutcome> {
  try {
    const { loadModelSession } = await import('./litert-runtime')
    const { runLocalOutputProof } = await import('./output-proof')
    const session = await loadModelSession()
    return await runLocalOutputProof(session, opts)
  } catch (err) {
    console.error('[lokale-ai] uitvoer-toets kon niet draaien:', err)
    return {
      ok: false,
      reasons: ['Het model kon op dit toestel niet gestart worden voor de proef.'],
      results: [],
    }
  }
}

/**
 * Kies een ander lokaal model op dit toestel.
 *
 * Meer dan een voorkeur wegschrijven: de geladen engine draait nog de óúde
 * bundel, dus die moet weg. Zonder die teardown zou de volgende inferentie
 * stilzwijgend het vorige model gebruiken terwijl de UI het nieuwe toont —
 * precies het soort onzichtbare afwijking waar de uitvoer-toets over gaat.
 *
 * Het bewaarde proefoordeel hoeft hier niet gewist: dat is aan het model-URL
 * gekoppeld en telt vanzelf niet meer mee (zie proof-verdict.ts).
 */
export async function selectLocalModel(id: LocalModelId): Promise<void> {
  const changed = storeSelectedLocalModelId(id)
  if (!changed) return
  const { disposeSession } = await import('./litert-runtime')
  await disposeSession()
  transientState = null
}

/** Verwijder het model uit de cache en ontkoppel de sessie ("model verwijderen"). */
export async function deleteLocalModel(): Promise<void> {
  const { clearModelCache, disposeSession } = await import('./litert-runtime')
  await disposeSession()
  await clearModelCache()
  transientState = null
}
