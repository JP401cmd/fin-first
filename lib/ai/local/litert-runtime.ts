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

/**
 * Een lopende, ON-DEVICE chatsessie (fase C1b — lokale Fin-chat). Wrapt één
 * LiteRT-`Conversation` met een vaste systeem-preface, zodat de meerdere beurten
 * hun geschiedenis NATIEF in die ene conversatie bijhouden (geen handmatige
 * historie-heropbouw per bericht, geen tweede promptvariant).
 *
 * NO-EGRESS / GEEN CLOUD-GUARDRAILS: net als de categorisatie-resolver draait
 * dit volledig op het toestel (WebGPU/Gemma). De cloud-guardrails uit ADR 0035
 * (`sanitizeForAI` in, `maskPIIInOutput` uit, token-logging) zijn hier N.V.T. —
 * er is geen externe provider, geen egress en geen kosten. Faalt de inferentie,
 * dan werpt `send` (fail-closed): de UI toont een eerlijke melding en valt NOOIT
 * stil terug op /api/ai/chat.
 */
export type LocalChatSession = {
  /**
   * Stuur één gebruikersbericht en stream het antwoord. `onDelta` krijgt elk
   * tekst-fragment zodra het binnenkomt (streaming-UX); de Promise levert de
   * volledige, getrimde tekst. Werpt bij een inferentiefout (fail-closed).
   */
  send(text: string, onDelta: (delta: string) => void): Promise<string>
  /** Sluit de sessie af — verdere `send`-aanroepen werpen. Laat de gedeelde engine intact. */
  dispose(): void
}

/**
 * Extraheer de tekst-delta('s) uit één streaming-`Message` en geef ze door aan
 * `onDelta`. Dezelfde vorm-afhandeling als `generate` (string- of parts-content),
 * maar per fragment i.p.v. accumulerend — dat maakt de streaming-UX mogelijk.
 */
function emitMessageText(value: unknown, onDelta: (delta: string) => void): void {
  const content = (value as { content?: unknown } | undefined)?.content
  if (typeof content === 'string') {
    if (content) onDelta(content)
    return
  }
  if (Array.isArray(content)) {
    for (const part of content) {
      const p = part as { type?: unknown; text?: unknown }
      if (p?.type === 'text' && typeof p.text === 'string' && p.text) onDelta(p.text)
    }
  }
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
 * Open een ON-DEVICE chatsessie met een vaste systeem-preface (fase C1b).
 *
 * Hergebruikt de GEDEELDE, dure engine (via `loadModelSession` — idempotent, pint
 * ook de WASM op de eigen origin) en maakt daarbinnen één eigen `Conversation`
 * aan. De conversatie houdt de beurten natief bij; `send` kan er meerdere keren
 * op worden aangeroepen. `dispose` laat de gedeelde engine intact (die kan ook de
 * categorisatie bedienen) en sluit alleen deze conversatie af.
 *
 * Streaming loopt via `sendMessageStreaming().getReader()` — exact het patroon
 * van `generate` (getReader i.p.v. `for await`, expliciete lock-release). Fouten
 * worden met de '[lokale-ai]'-kanarie gelogd en doorgeworpen (fail-closed).
 */
export async function createChatSession(systemPrompt: string): Promise<LocalChatSession> {
  // Zorgt dat de engine geladen is én de WASM op de eigen origin is gepind.
  await loadModelSession()
  const engine = loadedEngine
  if (!engine) {
    // Defensief: loadModelSession zou de engine gezet moeten hebben. Zonder
    // engine kan er geen conversatie starten — fail-closed.
    throw new Error('[lokale-ai] engine niet beschikbaar na loadModelSession')
  }

  const conversation = await engine.createConversation({
    preface: { messages: [{ role: 'system', content: systemPrompt }] },
  })

  let disposed = false

  const send = async (text: string, onDelta: (delta: string) => void): Promise<string> => {
    if (disposed) throw new Error('[lokale-ai] chatsessie is al afgesloten')
    let full = ''
    try {
      const stream = conversation.sendMessageStreaming(text)
      const reader = stream.getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          emitMessageText(value, (delta) => {
            full += delta
            onDelta(delta)
          })
        }
      } finally {
        reader.releaseLock()
      }
      return full.trim()
    } catch (err) {
      console.error('[lokale-ai] chat-inferentie mislukt:', err)
      throw err
    }
  }

  const dispose = (): void => {
    disposed = true
    // Best-effort: geef de conversatie-resources vrij als de Early-Preview-API
    // dat ondersteunt. Nooit awaiten of laten werpen — de gedeelde engine blijft.
    const closable = conversation as { delete?: () => Promise<void> }
    if (typeof closable.delete === 'function') {
      void Promise.resolve()
        .then(() => closable.delete?.())
        .catch((err) => console.error('[lokale-ai] conversation.delete mislukt (genegeerd):', err))
    }
  }

  return { send, dispose }
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
