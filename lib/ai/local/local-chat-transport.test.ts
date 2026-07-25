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

/**
 * C2c: het fin-actie-fence-blok end-to-end door de ECHTE stream-machinerie
 * (`readUIMessageStream`, hetzelfde orakel als hierboven), niet alleen de pure
 * `parse-intent.ts`-unittests. Bewijst dat de transport het contract uit
 * `chat-panel.tsx`'s `renderAssistantMessage` (part.type === 'data-finActie' &&
 * part.data) daadwerkelijk aflevert, met de canonieke (cijfer-guardrail)
 * getallen — en dat een afgekapt/onparsebaar blok GEEN data-part oplevert.
 */
describe('LocalChatTransport — data-finActie-part (C2c fin-actie-fence)', () => {
  const OVERVIEW_MET_KANS: LocalChatOverview = {
    ...OVERVIEW,
    kansen: [
      { titel: 'Verhoog je maandelijkse inleg', besparingPerJaar: 600, vrijheidsdagen: 5 },
    ],
  }

  function findDataFinActie(msg: UIMessage | undefined) {
    return (msg?.parts ?? []).find((p) => p.type === 'data-finActie') as
      | { type: 'data-finActie'; id?: string; data?: unknown }
      | undefined
  }

  it('geldig fin-actie-blok → data-finActie-part met CANONIEKE cijfers (model-getallen genegeerd)', async () => {
    // Model suggereert bewust AFWIJKENDE (foute) cijfers — de resolver moet die
    // negeren en de canonieke waarden uit het overzicht gebruiken (999/9999).
    const reply =
      'Hier is een idee.\n' +
      '```fin-actie\n' +
      '{ "title": "Verhoog je maandelijkse inleg", "description": "Doe het nu", ' +
      '"freedom_days_impact": 999, "euro_impact_monthly": 9999, "priority_score": 2 }\n' +
      '```'
    const { session } = mockSession(reply)
    const transport = new LocalChatTransport({
      overview: OVERVIEW_MET_KANS,
      knowledgeItems: [],
      createSession: async () => session,
    })

    const stream = await transport.sendMessages(sendOpts([userMessage('Wat kan ik doen?')]))
    const msg = await foldToMessage(stream)

    // Zichtbare tekst bevat het fence-blok NIET (nooit laten lekken in de bubbel).
    // (.trim() — de reeds-gestreamde prefix vóór de fence-strip kan een
    // onschadelijke staart-nieuweregel bevatten; dat is geen onderwerp van deze
    // test, wél de afwezigheid van het fence-blok zelf.)
    expect(textOf(msg).trim()).toBe('Hier is een idee.')
    expect(textOf(msg)).not.toContain('fin-actie')
    expect(textOf(msg)).not.toContain('999')

    const part = findDataFinActie(msg)
    expect(part).toBeDefined()
    expect(part?.data).toEqual({
      title: 'Verhoog je maandelijkse inleg',
      description: 'Doe het nu',
      freedom_days_impact: 5, // canoniek uit kansen, NIET 999
      euro_impact_monthly: 50, // 600/12, NIET 9999
      priority_score: 2,
    })
    expect(part?.id).toBeTruthy() // stabiele intent-hash (dedupe-sleutel)
  })

  it('bericht dat UITSLUITEND het fin-actie-blok bevat (geen proza) → lege tekst-part + data-finActie-part', async () => {
    const reply =
      '```fin-actie\n' +
      '{ "title": "Verhoog je maandelijkse inleg", "description": null, ' +
      '"freedom_days_impact": 1, "euro_impact_monthly": 1, "priority_score": 3 }\n' +
      '```'
    const { session } = mockSession(reply)
    const transport = new LocalChatTransport({
      overview: OVERVIEW_MET_KANS,
      knowledgeItems: [],
      createSession: async () => session,
    })

    const msg = await foldToMessage(await transport.sendMessages(sendOpts([userMessage('Suggestie?')])))

    expect(textOf(msg)).toBe('')
    expect(findDataFinActie(msg)).toBeDefined()
  })

  it('afgekapt fin-actie-blok (geen sluiting) → GEEN data-finActie-part, blok uit de zichtbare tekst gestript', async () => {
    const reply = 'Nog aan het typen...\n```fin-actie\n{ "title": "Verhoog'
    const { session } = mockSession(reply)
    const transport = new LocalChatTransport({
      overview: OVERVIEW_MET_KANS,
      knowledgeItems: [],
      createSession: async () => session,
    })

    const msg = await foldToMessage(await transport.sendMessages(sendOpts([userMessage('?')])))

    expect(textOf(msg).trim()).toBe('Nog aan het typen...')
    expect(findDataFinActie(msg)).toBeUndefined()
  })

  it('onparsebaar JSON in het blok → GEEN data-finActie-part, proza blijft zichtbaar', async () => {
    const reply = 'Kijk eens.\n```fin-actie\n{ dit is geen geldige JSON }\n```'
    const { session } = mockSession(reply)
    const transport = new LocalChatTransport({
      overview: OVERVIEW_MET_KANS,
      knowledgeItems: [],
      createSession: async () => session,
    })

    const msg = await foldToMessage(await transport.sendMessages(sendOpts([userMessage('?')])))

    expect(textOf(msg).trim()).toBe('Kijk eens.')
    expect(findDataFinActie(msg)).toBeUndefined()
  })

  it('geen match in het overzicht → GEEN data-finActie-part (M1: geen "+0 dagen vrijheid"-kaart), blok wél gestript', async () => {
    // Het model emitteert een geldig blok, maar de titel matcht GEEN enkele
    // overzicht-bron. Fail-closed: geen kaart. Het fence-blok wordt nog steeds uit
    // de zichtbare tekst gestript (nooit JSON in de bubbel), alleen de kaart vervalt.
    const reply =
      'Even meedenken.\n' +
      '```fin-actie\n' +
      '{ "title": "Iets dat nergens op matcht", "description": null, ' +
      '"freedom_days_impact": 42, "euro_impact_monthly": 42, "priority_score": 3 }\n' +
      '```'
    const { session } = mockSession(reply)
    const transport = new LocalChatTransport({
      overview: OVERVIEW_MET_KANS, // heeft alleen de "Verhoog je maandelijkse inleg"-kans
      knowledgeItems: [],
      createSession: async () => session,
    })

    const msg = await foldToMessage(await transport.sendMessages(sendOpts([userMessage('?')])))

    // Proza blijft, blok is weg, en er is GEEN kaart.
    expect(textOf(msg).trim()).toBe('Even meedenken.')
    expect(textOf(msg)).not.toContain('fin-actie')
    expect(textOf(msg)).not.toContain('42')
    expect(findDataFinActie(msg)).toBeUndefined()
  })

  it('een gematchte kans blijft WÉL een data-finActie-part opleveren (M1 onderdrukt alleen de niet-match)', async () => {
    // Regressie-anker naast de no-match: bewijs dat de match-tak intact is en de
    // fail-closed-suppressie niet per ongeluk álle kaarten wegneemt.
    const reply =
      '```fin-actie\n' +
      '{ "title": "Verhoog je maandelijkse inleg", "description": null, ' +
      '"freedom_days_impact": 999, "euro_impact_monthly": 999, "priority_score": 3 }\n' +
      '```'
    const { session } = mockSession(reply)
    const transport = new LocalChatTransport({
      overview: OVERVIEW_MET_KANS,
      knowledgeItems: [],
      createSession: async () => session,
    })

    const msg = await foldToMessage(await transport.sendMessages(sendOpts([userMessage('?')])))
    const part = findDataFinActie(msg)
    expect(part).toBeDefined()
    // Canoniek uit kansen: 5 dagen, 600/12 = 50/mnd (model-999 genegeerd).
    expect(part?.data).toMatchObject({ freedom_days_impact: 5, euro_impact_monthly: 50 })
  })
})
