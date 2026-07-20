// ── Spike-bewijs: LocalChatTransport ↔ useChat-vertaling (fase C2a-deel-1) ─────
//
// DOEL (architect rode vlag 5): valideer VÓÓR de volledige integratie dat een
// handgeschreven `ChatTransport<UIMessage>` (AI-SDK v6, Early Preview) de lokale
// LiteRT-chat kan aandrijven binnen de bestaande `useChat`-flow.
//
// ORAKEL: `readUIMessageStream` uit 'ai' is EXACT de machinerie die `useChat`
// intern gebruikt om een `ReadableStream<UIMessageChunk>` tot een `UIMessage`
// (met `parts`) te vouwen — dezelfde `processUIMessageStream`-consumer. Als deze
// test de transport-output door `readUIMessageStream` haalt en er een correcte
// `TextUIPart` uitkomt, dan zou `useChat`'s render-laag dat identiek renderen.
// Zo bewijzen we de vertaling HEADLESS (geen WebGPU/WASM in vitest/jsdom).

import { describe, it, expect, vi } from 'vitest'
import { readUIMessageStream, type UIMessage } from 'ai'
import { LocalChatTransport } from './local-chat-transport'
import type { LocalChatSession } from './litert-runtime'
import type { LocalChatOverview } from './local-chat-context'

const OVERVIEW: LocalChatOverview = {
  hasData: true,
  nettoVermogen: 85000,
  vrijheidstijd: '2 jaar en 9 maanden',
  fireDoel: 750000,
  vrijheidsPct: 11.3,
  maandinkomen: 3200,
  maanduitgaven: 2100,
  spaarquotePct: 34,
  dagtarief: 69,
  swrPct: 3.4,
  noodbuffer: { bedrag: 12600, maanden: 6 },
  jaarruimte: null,
  kansen: [],
  openstaandeActies: [],
}

/** Mock-sessie die `reply` in vaste stukjes streamt via `onDelta`. */
function mockSession(
  reply: string,
  opts: { throwOnSend?: boolean } = {},
): { session: LocalChatSession; sends: string[]; disposed: () => number } {
  const sends: string[] = []
  let disposeCount = 0
  const session: LocalChatSession = {
    async send(text, onDelta) {
      sends.push(text)
      if (opts.throwOnSend) throw new Error('[lokale-ai] chat-inferentie mislukt')
      // Stream in woord-brokjes zodat we meerdere text-delta's krijgen.
      const chunks = reply.match(/\S+\s*/g) ?? [reply]
      for (const c of chunks) onDelta(c)
      return reply.trim()
    },
    dispose() {
      disposeCount++
    },
  }
  return { session, sends, disposed: () => disposeCount }
}

/** Eén user-UIMessage met een enkele tekst-part. */
function userMessage(text: string, id = crypto.randomUUID()): UIMessage {
  return { id, role: 'user', parts: [{ type: 'text', text }] }
}

/** Roep sendMessages aan met de verplichte ChatTransport-optievorm. */
function sendOpts(messages: UIMessage[]) {
  return {
    trigger: 'submit-message' as const,
    chatId: 'chat-will',
    messageId: undefined,
    messages,
    abortSignal: undefined,
  }
}

/**
 * Fold de transport-stream tot de uiteindelijke UIMessage — exact zoals useChat
 * de chunks consumeert. Een `controller.error(...)` in de transport laat
 * `readUIMessageStream` (terminateOnError) de async-iteratie THROWEN; dat is de
 * bron van useChat's `status === 'error'`. We vangen 'm hier en reiken 'm aan
 * `onError` door (mirror: useChat vangt de throw en zet de foutstatus).
 */
async function foldToMessage(
  stream: ReadableStream<import('ai').UIMessageChunk>,
  onError?: (e: unknown) => void,
): Promise<UIMessage | undefined> {
  let final: UIMessage | undefined
  try {
    for await (const m of readUIMessageStream({ stream, terminateOnError: true })) {
      final = m
    }
  } catch (e) {
    onError?.(e)
  }
  return final
}

function textParts(msg: UIMessage | undefined) {
  return (msg?.parts ?? []).filter((p) => p.type === 'text') as Array<{ type: 'text'; text: string; state?: string }>
}

function textOf(msg: UIMessage | undefined): string {
  return textParts(msg).map((p) => p.text).join('')
}

describe('LocalChatTransport — spike: chunk-vertaling naar useChat (C2a)', () => {
  it('vertaalt onDelta-stukjes naar een correcte TextUIPart (readUIMessageStream-orakel)', async () => {
    const { session } = mockSession('Je netto vermogen is 85.000 euro, dat is vrijheid.')
    const transport = new LocalChatTransport({
      overview: OVERVIEW,
      knowledgeItems: [],
      createSession: async () => session,
    })

    const stream = await transport.sendMessages(sendOpts([userMessage('Hoe sta ik ervoor?')]))
    const msg = await foldToMessage(stream)

    // Kern-bewijs: de gevouwen UIMessage bevat één tekst-part met de volledige,
    // geconcateneerde tekst en is als 'done' gemarkeerd (afsluitende text-end).
    const parts = textParts(msg)
    expect(parts).toHaveLength(1)
    expect(textOf(msg)).toBe('Je netto vermogen is 85.000 euro, dat is vrijheid.')
    expect(parts[0].state).toBe('done')
  })

  it('opent de sessie EENMALIG en hergebruikt die over beurten (native multi-turn, geen categorisatie-valstrik)', async () => {
    const { session, sends } = mockSession('antwoord')
    const createSession = vi.fn(async () => session)
    const transport = new LocalChatTransport({ overview: OVERVIEW, knowledgeItems: [], createSession })

    await foldToMessage(await transport.sendMessages(sendOpts([userMessage('eerste vraag')])))
    await foldToMessage(
      await transport.sendMessages(
        sendOpts([
          userMessage('eerste vraag'),
          { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'antwoord' }] },
          userMessage('tweede vraag'),
        ]),
      ),
    )

    // Sessie precies één keer aangemaakt (ref-hergebruik), en per beurt ging
    // alleen het LAATSTE user-bericht naar send.
    expect(createSession).toHaveBeenCalledTimes(1)
    expect(sends).toEqual(['eerste vraag', 'tweede vraag'])
  })

  it('bouwt de systeemprompt uit overview + eerste vraag (kennis-selectie eenmalig)', async () => {
    const { session } = mockSession('ok')
    let capturedPrompt = ''
    const transport = new LocalChatTransport({
      overview: OVERVIEW,
      knowledgeItems: [],
      createSession: async (systemPrompt) => {
        capturedPrompt = systemPrompt
        return session
      },
    })

    await foldToMessage(await transport.sendMessages(sendOpts([userMessage('Wat is mijn dagtarief?')])))

    // De canonieke cijfers uit het overzicht staan in de systeemprompt en de DNA
    // (Fin) is aanwezig — bewijst dat buildLocalChatSystemPrompt is aangeroepen.
    expect(capturedPrompt).toContain('FINANCIEEL OVERZICHT')
    expect(capturedPrompt).toContain('Je bent Fin')
    expect(capturedPrompt).toContain('85.000')
  })

  it('FAIL-CLOSED: send-fout sluit de stream met een error (useChat-status → error), geen cloud-fallback', async () => {
    const { session } = mockSession('', { throwOnSend: true })
    const transport = new LocalChatTransport({ overview: OVERVIEW, knowledgeItems: [], createSession: async () => session })
    const onError = vi.fn()

    const stream = await transport.sendMessages(sendOpts([userMessage('Kraakt dit?')]))
    await foldToMessage(stream, onError)

    expect(onError).toHaveBeenCalledTimes(1)
    const err = onError.mock.calls[0][0] as Error
    expect(err.message).toContain('mislukt')
  })

  it('lege/ontbrekende user-tekst → fail-closed error, geen sessie-opbouw', async () => {
    const createSession = vi.fn(async () => mockSession('x').session)
    const transport = new LocalChatTransport({ overview: OVERVIEW, knowledgeItems: [], createSession })
    const onError = vi.fn()

    const stream = await transport.sendMessages(sendOpts([userMessage('   ')]))
    await foldToMessage(stream, onError)

    expect(onError).toHaveBeenCalledTimes(1)
    expect(createSession).not.toHaveBeenCalled()
  })

  it('reconnectToStream retourneert altijd null (geen stream-resumption)', async () => {
    const transport = new LocalChatTransport({ overview: OVERVIEW, knowledgeItems: [], createSession: async () => mockSession('x').session })
    await expect(transport.reconnectToStream()).resolves.toBeNull()
  })

  it('dispose() sluit de lopende sessie af (geen lekkende WebGPU-resources)', async () => {
    const { session, disposed } = mockSession('klaar')
    const transport = new LocalChatTransport({ overview: OVERVIEW, knowledgeItems: [], createSession: async () => session })

    await foldToMessage(await transport.sendMessages(sendOpts([userMessage('start')])))
    transport.dispose()

    expect(disposed()).toBe(1)
  })
})
