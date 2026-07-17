// ── Lokale model-manager (download / staat / verwijderen) ─────────────────────
//
// Beheert de levenscyclus van het on-device Gemma 4 E2B-model voor de fase-2-UI
// op /mijn/privacy (parallelle agent) én voor de categorisatie-sheet, die de
// staat leest om te beslissen of het lokale pad beschikbaar is.
//
// Bewust dynamische import van de runtime: de zware Transformers.js-bundel komt
// pas binnen bij een echte download/inferentie, niet bij het lezen van de staat.

export type LocalModelState = 'niet-gedownload' | 'downloaden' | 'klaar' | 'fout'

export type LocalModelProgress = {
  loadedBytes: number
  totalBytes: number | null
  file?: string
}

/**
 * Gemeten download-omvang (GB) uit het fase-0-meetrapport (per-module q4f16,
 * tekst-only kern + kleine vision/audio-shards). Getoond in de consent-stap als
 * eerlijke verwachting — geen aanname meer.
 */
export const LOCAL_MODEL_DOWNLOAD_GB = 3.2

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
    const { isModelCached } = await import('./transformers-runtime')
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
    const { loadModelSession } = await import('./transformers-runtime')
    await loadModelSession((p) => onProgress(p))

    // Persistente opslag aanvragen zodat de ~3,2 GB shards behouden blijven.
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

/** Verwijder het model uit de cache en ontkoppel de sessie ("model verwijderen"). */
export async function deleteLocalModel(): Promise<void> {
  const { clearModelCache, disposeSession } = await import('./transformers-runtime')
  await disposeSession()
  await clearModelCache()
  transientState = null
}
