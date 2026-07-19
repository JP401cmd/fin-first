// ── On-device LiteRT-LM-runtime (Gemma 4 E2B, WebGPU) ─────────────────────────
//
// Dunne facade rond @litert-lm/core (Early Preview), met een BEWUST dynamische
// import zodat de zware WASM-bundle pas binnenkomt wanneer de gebruiker de lokale
// privé-modus echt gebruikt — nooit in het reguliere pad.
//
// Deze runtime vervangt de eerdere Transformers.js/ONNX-facade en implementeert
// exact hetzelfde publieke contract (LocalChatMessage / LocalModelLoadProgress /
// LocalSession / loadModelSession / disposeSession / isModelCached /
// clearModelCache), zodat consumenten (resolver + model-manager) alleen hun
// import-pad hoeven te wijzigen.
//
// Recept (geverifieerd 19 jul 2026, spike spikes/litert-lm/litert-engine.ts —
// meetrapport L1: 7 volledige runs, 0 fouten):
//   const engine = await Engine.create({ model: <Blob>, mainExecutorSettings: { maxNumTokens: 8192 } })
//   const conversation = await engine.createConversation({ preface: { messages: [systeem] } })
//   const stream = conversation.sendMessageStreaming(user)   // consume → part.type==='text' → part.text
//   await engine.delete()
// WebGPU is default (geen backend-config). GEEN sampling-parameters op de web-SDK.
//
// De @litert-lm/core-API wordt achter een handgeschreven, smalle facade benaderd
// en de dynamische import wordt daarop gecast: dat ontkoppelt tsc van de precieze
// interne type-namen (Early Preview → API-breuk-risico) en houdt de generatie-
// callsite `any`-vrij.

// Type-only import (erased bij compile — trekt de WASM-bundel NIET eager mee).
// De runtime laadt @litert-lm/core dynamisch (loadCore); door de facade van de
// ECHTE package-typen af te leiden wordt een Early-Preview-API-breuk een
// compile-fout i.p.v. een stille runtime-verrassing.
import type { Engine } from '@litert-lm/core'

export type LocalChatMessage = { role: 'system' | 'user'; content: string }

export type LocalModelLoadProgress = {
  loadedBytes: number
  totalBytes: number | null
  file?: string
}

/**
 * Directe download-URL van de ongegate, Apache-2.0 web-build van Gemma 4 E2B-it
 * in het .litertlm-formaat (~2,0 GB, HF litert-community). We cachen 'm zelf in
 * Cache Storage (zie hieronder) en serveren 'm daarna als Blob aan Engine.create.
 */
export const LOCAL_MODEL_URL =
  'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm'

/** Cache-Storage-cachenaam; key = LOCAL_MODEL_URL. */
const CACHE_NAME = 'litert-lm-model'

/** mainExecutorSettings.maxNumTokens uit het integratierecept. */
const MAX_NUM_TOKENS = 8192

/**
 * Eigen-origin pad naar de zelf-gehoste WASM-assets (public/litert-wasm/*,
 * gekopieerd uit node_modules door scripts/copy-litert-wasm.mjs op predev/
 * prebuild). NO-EGRESS: zonder dit pad laadt @litert-lm/core zijn WASM van
 * `LiteRtLm.DEFAULT_WASM_PATH` = de jsdelivr-CDN — dat injecteert een
 * third-party script (géén SRI) en haalt de .wasm van buiten, ín de
 * privacy-origin die juist NIETS naar buiten mag sturen. Door de globale
 * LiteRT-LM-instantie vóór Engine.create met dit eigen-origin-pad te laden,
 * blijft alles op 'self' en hoeft de CSP niet verbreed te worden.
 */
const LOCAL_WASM_PATH = '/litert-wasm'

export type LocalSession = {
  /** Genereer tekst voor de chat-messages; retourneert de ruwe uitvoer. */
  generate(messages: LocalChatMessage[], maxNewTokens: number): Promise<string>
}

// ── Dynamische, lui geladen core-import (WASM komt hier pas binnen) ────────────
// De facade IS het echte module-type: `typeof import(...)` geeft volledige,
// correcte typing (Engine.create/getOrLoadGlobalLiteRtLm/Conversation/Message)
// zonder blinde cast — breekt de Early-Preview-API, dan breekt de compile.
type LitertModule = typeof import('@litert-lm/core')
let cachedCore: LitertModule | null = null
async function loadCore(): Promise<LitertModule> {
  if (!cachedCore) {
    // Literal specifier zodat de bundler 'm kan resolven/chunken.
    cachedCore = await import('@litert-lm/core')
  }
  return cachedCore
}

// ── Model-Blob: warm uit Cache Storage of cold via streaming-download ──────────
/**
 * Haal de model-Blob op: uit de cache (warm) of via een streaming-download met
 * byteteller (cold). Bij een cold download wordt de Blob in Cache Storage gezet
 * zodat een herstart 'm warm kan serveren. Faalt de cache-put (bv. quota), dan is
 * dat GEEN run-blokker: we loggen het en gaan door met de al gedownloade Blob.
 */
async function getModelBlob(onProgress?: (p: LocalModelLoadProgress) => void): Promise<Blob> {
  const file = LOCAL_MODEL_URL.split('/').pop() ?? undefined
  const cache = typeof caches !== 'undefined' ? await caches.open(CACHE_NAME) : null

  // ── Warm pad: uit cache ─────────────────────────────────────────────────────
  if (cache) {
    const hit = await cache.match(LOCAL_MODEL_URL)
    if (hit) {
      const blob = await hit.blob()
      onProgress?.({ loadedBytes: blob.size, totalBytes: blob.size, file })
      return blob
    }
  }

  // ── Cold pad: streaming-download met eigen byteteller ───────────────────────
  const resp = await fetch(LOCAL_MODEL_URL)
  if (!resp.ok || !resp.body) {
    throw new Error(`Model-download faalde: HTTP ${resp.status} ${resp.statusText}`)
  }
  const totalBytes = Number(resp.headers.get('content-length')) || 0
  const reader = resp.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      loaded += value.byteLength
      onProgress?.({ loadedBytes: loaded, totalBytes: totalBytes > 0 ? totalBytes : null, file })
    }
  }

  // Sticky-poisoning-guard (integriteit): een schone vroege EOF (loaded <
  // totalBytes, geen netwerkfout) leverde eerder een half-bestand op dat als
  // 'volledige' bundel werd gecachet. Cache-API-entries zijn atomair, dus zo'n
  // corrupte entry ziet er permanent 'compleet' uit: Engine.create faalt telkens
  // en het herstelpad (disposeSession → verse sessie, NIET clearModelCache) komt
  // er nooit meer uit. Daarom: NIET cachen én transient falen zodat een verse
  // retry (loadModelSession na reset) de bundel opnieuw kan halen.
  if (totalBytes > 0 && loaded !== totalBytes) {
    throw new Error(`Model-download onvolledig: ${loaded} van ${totalBytes} bytes ontvangen.`)
  }
  // totalBytes 0 = geen content-length → completeness niet verifieerbaar; check
  // bewust overgeslagen (we vertrouwen dan op done zonder netwerkfout).

  const blob = new Blob(chunks as BlobPart[], { type: 'application/octet-stream' })
  // Geheugen: de Blob kopieert de chunks; zonder deze reset houden we ~2× de
  // bundel (~4 GB) transiënt vast tot de GC de array opruimt. Direct vrijgeven.
  chunks.length = 0

  // Opslaan voor warme herstarts. Quota-fout → loggen en doorgaan met de Blob.
  if (cache) {
    try {
      await cache.put(
        LOCAL_MODEL_URL,
        new Response(blob, { headers: { 'content-type': 'application/octet-stream' } }),
      )
    } catch (err) {
      console.error('[lokale-ai] model-cache put mislukt (mogelijk quota) — doorgaan met Blob:', err)
    }
  }

  return blob
}

let sessionPromise: Promise<LocalSession> | null = null
let loadedEngine: Engine | null = null

async function buildSession(onProgress?: (p: LocalModelLoadProgress) => void): Promise<LocalSession> {
  const core = await loadCore()
  const blob = await getModelBlob(onProgress)

  let engine: Engine
  try {
    // NO-EGRESS: pin de WASM-bron op de eigen origin VÓÓR Engine.create. Anders
    // laadt de interne getOrLoadGlobalLiteRtLm() van de jsdelivr-CDN. Idempotent
    // (zelfde pad → hergebruik), dus veilig na een disposeSession/re-load.
    await core.getOrLoadGlobalLiteRtLm(LOCAL_WASM_PATH)
    engine = await core.Engine.create({ model: blob, mainExecutorSettings: { maxNumTokens: MAX_NUM_TOKENS } })
  } catch (err) {
    // Kanarie voor LiteRT-LM issue #2572 (weight-cache "Access is denied" op de
    // native tak) en overige init-fouten: integraal loggen vóór doorgooien.
    console.error('[lokale-ai] Engine.create mislukt:', err)
    throw err
  }
  loadedEngine = engine

  const generate = async (messages: LocalChatMessage[], _maxNewTokens: number): Promise<string> => {
    // De web-SDK kent GEEN per-call max_new_tokens-cap (Early Preview). De korte,
    // strak-geïnstrueerde categorisatie-prompt begrenst de uitvoer in de praktijk
    // (bewezen in L1); _maxNewTokens wordt daarom bewust genegeerd maar behouden
    // in de signatuur zodat het contract met de Transformers.js-runtime gelijk blijft.
    void _maxNewTokens
    const systemPrompt = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n')
    const userMessage = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join('\n\n')

    try {
      // VERSE conversatie per aanroep: systeemprompt als preface, geen historie.
      const conversation = await engine.createConversation({
        preface: { messages: [{ role: 'system', content: systemPrompt }] },
      })

      let text = ''
      // sendMessageStreaming levert een ReadableStream<Message> (dist/
      // conversation.d.ts:36). Bewust via getReader() i.p.v. `for await`: async-
      // iteratie op ReadableStream vereist Chrome ≥124, getReader werkt overal en
      // maakt de lock-release expliciet.
      const stream = conversation.sendMessageStreaming(userMessage)
      const reader = stream.getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          const content = value?.content
          if (typeof content === 'string') {
            text += content
          } else if (Array.isArray(content)) {
            for (const part of content) {
              if (part.type === 'text' && typeof part.text === 'string') text += part.text
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
      return text.trim()
    } catch (err) {
      console.error('[lokale-ai] inferentie mislukt:', err)
      throw err
    }
  }

  return { generate }
}

/**
 * Laad (of hergebruik) de on-device sessie. Idempotent: meerdere aanroepen delen
 * dezelfde geladen sessie. `onProgress` is alleen zinvol bij de éérste (koude)
 * load; daarna komt het model warm uit de Cache Storage.
 */
export async function loadModelSession(onProgress?: (p: LocalModelLoadProgress) => void): Promise<LocalSession> {
  if (!sessionPromise) {
    sessionPromise = buildSession(onProgress).catch((err) => {
      // Faalt de load, gooi de gecachte promise weg zodat een volgende poging
      // opnieuw probeert i.p.v. de fout te blijven herhalen.
      sessionPromise = null
      loadedEngine = null
      throw err
    })
  }
  return sessionPromise
}

/**
 * Ontkoppel en verwijder de huidige sessie (sessieherstel na een WebGPU
 * device-loss / poisoned session). De volgende loadModelSession bouwt een verse
 * engine.
 */
export async function disposeSession(): Promise<void> {
  const engine = loadedEngine
  sessionPromise = null
  loadedEngine = null
  if (engine) {
    try {
      await engine.delete()
    } catch (err) {
      // delete faalt soms na een device-loss — loggen, de referentie is al weg.
      console.error('[lokale-ai] engine.delete mislukt (genegeerd):', err)
    }
  }
}

/**
 * Zit het model in de Cache Storage? De .litertlm-bundel is één Cache-API-entry
 * onder LOCAL_MODEL_URL: compleet-of-afwezig. Cache-API-entries zijn ATOMAIR —
 * dit vervangt de partial-eviction-les van 19 jul (de ONNX-shard-runtime kon
 * selectief ge-evict raken; één bundel-entry kan dat niet).
 */
export async function isModelCached(): Promise<boolean> {
  if (typeof caches === 'undefined') return false
  try {
    const cache = await caches.open(CACHE_NAME)
    return (await cache.match(LOCAL_MODEL_URL)) !== undefined
  } catch {
    /* geen cache-toegang → behandel als niet-gecacht */
    return false
  }
}

/** Wis de model-cache; volgende laad is weer "cold". Retourneert of er iets is gewist. */
export async function clearModelCache(): Promise<boolean> {
  if (typeof caches === 'undefined') return false
  try {
    return await caches.delete(CACHE_NAME)
  } catch {
    return false
  }
}
