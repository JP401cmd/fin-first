// ── LocalChatTransport — on-device transport voor useChat (fase C2a) ──────────
//
// SPIKE-STATUS: dit is de gevalideerde transport-vertaling uit C2a-deel-1. Het
// bewijst dat een handgeschreven `ChatTransport<UIMessage>` (AI-SDK v6, Early
// Preview) de lokale LiteRT-chat (`createChatSession`) kan aandrijven binnen de
// bestaande `useChat`-flow van `components/app/chat/chat-panel.tsx`, ZONDER dat
// er ook maar één byte naar `/api/ai/chat` gaat.
//
// Naad (niet heronderhandelbaar, uit de requirements §"Vastgestelde naad"): de
// gedeelde interface is `ChatTransport<UIMessage>` — exact wat
// `DefaultChatTransport` vandaag implementeert. `chat-panel.tsx`'s bestaande
// `transport`-`useMemo` (regel 475-478) wisselt op `privacy_mode` + gereedheid
// tussen `DefaultChatTransport` (cloud) en deze `LocalChatTransport` (lokaal).
// Alles ná die `useMemo` (useChat, rendering) blijft ongewijzigd.
//
// KERN-ONTWERP (FR-C2a.3):
//  - De `LocalChatSession` wordt ÉÉNMALIG geopend (op het eerste bericht) en in
//    een INSTANCE-veld bewaard over beurten heen — NIET per beurt vers. Vers per
//    beurt zou de native multi-turn-historie wissen (de "categorisatie-valstrik"
//    uit ADR 0043: sessie-per-call = geheugenloos).
//  - Alleen het LAATSTE user-bericht gaat naar `session.send`; de sessie houdt de
//    beurten zelf native bij (litert-runtime.ts:71-93).
//  - `onDelta`-callbacks worden vertaald naar `UIMessageChunk`'s
//    (`text-start` → `text-delta`* → `text-end`, omkaderd door `start`/`finish`),
//    exact de chunk-vorm die `processUIMessageStream` (de consumer binnen
//    `useChat`/`readUIMessageStream`) tot een `TextUIPart` vouwt.
//  - Faalt `session.send` (fail-closed, litert-runtime.ts), dan wordt de stream
//    met `controller.error(...)` afgesloten → `useChat`-status wordt 'error'.
//    NOOIT een stille retry op de cloud-transport.
//  - `reconnectToStream` retourneert altijd `null` (geen server om een
//    onderbroken stream te hervatten — expliciet non-goal).
//
// GEEN CLOUD-GUARDRAILS: on-device pad (WebGPU/Gemma), geen egress.
// `sanitizeForAI`/`maskPIIInOutput`/token-logging zijn N.V.T. (ADR 0043 §5) —
// er is geen externe provider, geen kosten. De guardrails blijven volledig
// intact op het CLOUD-pad (`/api/ai/chat` draait ongewijzigd wanneer privacy
// uit staat); de server-403 in die route zorgt dat privacy-AAN nóóit via cloud
// gaat (FR-C2a.6).

import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai'
import type { LocalChatSession } from './litert-runtime'
import type { LocalChatOverview } from './local-chat-context'
import type { LocalKnowledgeItem } from './knowledge-context'
import { buildLocalChatSystemPrompt } from './local-chat-prompt'
import {
  parseFinActionIntent,
  finActionFenceStart,
  resolveFinActionIntent,
  finActionIntentHash,
} from './parse-intent'

/**
 * Factory die één on-device chatsessie opent. Default (productie) importeert
 * `createChatSession` dynamisch zodat de zware WASM-bundel pas binnenkomt bij het
 * eerste bericht (mirror `local-chat-panel.tsx:128`). Injecteerbaar zodat de
 * spike-test een mock-sessie kan meegeven zonder WebGPU/WASM.
 */
export type LocalChatSessionFactory = (systemPrompt: string) => Promise<LocalChatSession>

const defaultSessionFactory: LocalChatSessionFactory = async (systemPrompt) => {
  const { createChatSession } = await import('./litert-runtime')
  return createChatSession(systemPrompt)
}

export type LocalChatTransportOptions = {
  /** Het canonieke financiële overzicht (consume-only) — voedt de systeemprompt. */
  overview: LocalChatOverview
  /** De volledige kennisbank (actief én inactief) — gerichte selectie op de eerste vraag. */
  knowledgeItems: LocalKnowledgeItem[]
  /** Injecteerbare sessie-factory (default: dynamische `createChatSession`-import). */
  createSession?: LocalChatSessionFactory
  /** Injecteerbare id-generator (default: `crypto.randomUUID`) — deterministisch te maken in tests. */
  generateId?: () => string
}

/** Pak de tekst van het LAATSTE user-bericht uit de UIMessage-historie. */
function lastUserText(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== 'user') continue
    const text = msg.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text' && typeof (p as { text?: unknown }).text === 'string')
      .map((p) => p.text)
      .join('')
      .trim()
    return text.length > 0 ? text : null
  }
  return null
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `local-${Math.random().toString(36).slice(2)}-${Date.now()}`
}

/**
 * Hoeveel tekens de streaming-strip achter de staart vasthoudt zodra er een
 * backtick opduikt: ruim genoeg voor een half-geëmitteerde ` ```fin-actie `-start
 * (incl. spaties) zodat die nooit als zichtbare delta lekt. Kleine tail-hold —
 * gewone proza zonder backticks stroomt direct door.
 */
const FENCE_TAIL_HOLD = 16

/**
 * Bepaal tot welke index van `buffer` we VEILIG zichtbare tekst mogen emitten,
 * zónder ooit (een deel van) het fin-actie-fence-blok te laten lekken:
 *  - Is er een complete fence-open? → boundary = die index (blok wordt gestript).
 *  - Anders, bevat de staart binnen het hold-venster een backtick-run? → houd
 *    vanaf die run vast (het kan een half-getypte fence-start zijn).
 *  - Anders → de hele buffer is veilig.
 * Puur op strings; de definitieve strip gebeurt canoniek in `parseFinActionIntent`.
 */
function safeVisibleBoundary(buffer: string): number {
  const fence = finActionFenceStart(buffer)
  if (fence !== -1) return fence
  const tick = buffer.lastIndexOf('`')
  if (tick === -1) return buffer.length
  // Backtick te ver van de staart om nog een korte fence-start te vormen → veilig.
  if (buffer.length - tick > FENCE_TAIL_HOLD) return buffer.length
  // Houd vanaf het begin van de backtick-run vast.
  let start = tick
  while (start > 0 && buffer[start - 1] === '`') start--
  return start
}

/**
 * On-device `ChatTransport` die de lokale LiteRT-chat aan `useChat` koppelt.
 *
 * De sessie leeft in `#session` (instance-veld) over `sendMessages`-beurten heen;
 * `dispose()` sluit 'm af bij transport-wissel/unmount. Bewust GEEN React-state.
 */
export class LocalChatTransport implements ChatTransport<UIMessage> {
  #session: LocalChatSession | null = null
  #sessionPromise: Promise<LocalChatSession> | null = null
  readonly #overview: LocalChatOverview
  readonly #knowledgeItems: LocalKnowledgeItem[]
  readonly #createSession: LocalChatSessionFactory
  readonly #generateId: () => string

  constructor(options: LocalChatTransportOptions) {
    this.#overview = options.overview
    this.#knowledgeItems = options.knowledgeItems
    this.#createSession = options.createSession ?? defaultSessionFactory
    this.#generateId = options.generateId ?? randomId
  }

  /**
   * Open (of hergebruik) de native multi-turn sessie. De eerste vraag stuurt de
   * kennis-selectie in de systeemprompt (eenmalig, FR-C2a.3); volgende beurten
   * hergebruiken dezelfde sessie — geen nieuwe `createChatSession`.
   */
  async #ensureSession(firstQuestion: string): Promise<LocalChatSession> {
    if (this.#session) return this.#session
    if (!this.#sessionPromise) {
      const systemPrompt = buildLocalChatSystemPrompt({
        overview: this.#overview,
        question: firstQuestion,
        knowledgeItems: this.#knowledgeItems,
      })
      this.#sessionPromise = this.#createSession(systemPrompt)
        .then((session) => {
          this.#session = session
          return session
        })
        .catch((err) => {
          // Faalt de sessie-opbouw, gooi de gecachte promise weg zodat een
          // volgende poging opnieuw probeert i.p.v. de fout te blijven herhalen.
          this.#sessionPromise = null
          throw err
        })
    }
    return this.#sessionPromise
  }

  sendMessages(
    options: Parameters<ChatTransport<UIMessage>['sendMessages']>[0],
  ): Promise<ReadableStream<UIMessageChunk>> {
    const { messages, abortSignal } = options
    const text = lastUserText(messages)
    const ensureSession = (q: string) => this.#ensureSession(q)
    const partId = this.#generateId()
    const overview = this.#overview

    const stream = new ReadableStream<UIMessageChunk>({
      start: async (controller) => {
        // Fail-closed vóór generatie: zonder bruikbaar user-bericht geen sessie
        // openen — eerlijke fout i.p.v. een lege of hangende stream.
        if (!text) {
          controller.error(new Error('[lokale-ai] geen bruikbaar bericht om te versturen'))
          return
        }
        try {
          const session = await ensureSession(text)

          // Lifecycle-omkadering + tekst-part-opening. `text-start` MOET vóór
          // elke `text-delta` (processUIMessageStream werpt anders).
          controller.enqueue({ type: 'start' })
          controller.enqueue({ type: 'text-start', id: partId })

          // Streaming-strip: buffer de volledige modeltekst maar emit alleen de
          // ZICHTBARE proza; een (deel van een) ` ```fin-actie `-blok mag nooit in
          // de bubbel verschijnen. `emittedLen` telt hoeveel prefix-tekens van
          // `buffer` we al als delta stuurden (we emitten altijd een prefix).
          let buffer = ''
          let emittedLen = 0

          await session.send(text, (delta) => {
            if (abortSignal?.aborted) return
            if (!delta) return
            buffer += delta
            const boundary = safeVisibleBoundary(buffer)
            if (boundary > emittedLen) {
              controller.enqueue({ type: 'text-delta', id: partId, delta: buffer.slice(emittedLen, boundary) })
              emittedLen = boundary
            }
          })

          // Generatie klaar → PARSE precies één keer op de volledige buffer.
          // `cleanedText` is de canonieke zichtbare tekst (fence-blok verwijderd);
          // flush de nog niet-geëmitteerde staart (vastgehouden tail of eventuele
          // proza ná het blok). `cleanedText` behoudt de kop exact, dus de reeds
          // geëmitteerde prefix hoort er per definitie voor te staan — de
          // `startsWith`-guard is defensief tegen een onverwachte divergentie.
          const { cleanedText, intent } = parseFinActionIntent(buffer)
          if (cleanedText.length > emittedLen && cleanedText.startsWith(buffer.slice(0, emittedLen))) {
            controller.enqueue({ type: 'text-delta', id: partId, delta: cleanedText.slice(emittedLen) })
          }
          controller.enqueue({ type: 'text-end', id: partId })

          // Actie-voorstel? Resolve de CANONIEKE cijfers uit het overzicht
          // (cijfer-guardrail — de model-getallen worden genegeerd) en surface de
          // opgeloste intent als NIET-transient `data-finActie`-part, met een
          // stabiele id = de intent-hash (dedupe-sleutel voor de UI). Twee gevallen
          // geven GEEN data-part (beide fail-closed, geen fout):
          //  - parse-miss (`intent: null`): geen bruikbaar blok.
          //  - geen canonieke match (`resolved: null`): de titel matchte geen enkele
          //    overzicht-bron → géén "+0 dagen vrijheid"-kaart uit het niets. Het
          //    fence-blok is dan al uit `cleanedText` gestript; alleen de kaart vervalt.
          if (intent) {
            const resolved = resolveFinActionIntent(intent, overview)
            if (resolved) {
              controller.enqueue({
                type: `data-finActie`,
                id: finActionIntentHash(resolved),
                data: resolved,
              })
            }
          }

          controller.enqueue({ type: 'finish' })
          controller.close()
        } catch (err) {
          // FAIL-CLOSED: sluit de stream met een fout → useChat status 'error'.
          // Nooit stil terugvallen op DefaultChatTransport/cloud.
          controller.error(err instanceof Error ? err : new Error('[lokale-ai] lokale generatie mislukt'))
        }
      },
    })

    return Promise.resolve(stream)
  }

  /**
   * Geen server om een onderbroken stream te hervatten: on-device generatie is
   * niet resumable (FR-C2a.3, stream-resumption expliciet buiten scope). Altijd
   * `null` → `useChat` probeert geen reconnect.
   */
  reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return Promise.resolve(null)
  }

  /**
   * Sluit de lopende `LocalChatSession` af (conversatie-resources vrij; de
   * gedeelde engine blijft intact). Aan te roepen bij transport-wissel/unmount
   * (FR-C2a.4) — geen lekkende WebGPU-resources.
   */
  dispose(): void {
    this.#session?.dispose()
    this.#session = null
    this.#sessionPromise = null
  }
}
