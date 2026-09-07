import { describe, it, expect } from 'vitest'
import { createChatOutputFilter } from './chat-output-filter'

/**
 * BIJT-PROEF. Deze suite is geschreven om ROOD te staan op de situatie van vóór
 * de fix. De transform in `app/api/ai/chat/route.ts` maskeerde alleen wanneer
 * `typeof chunk === 'string'`, terwijl `result.toUIMessageStream()` in AI SDK 6
 * uitsluitend OBJECTEN levert (`AsyncIterableStream<InferUIMessageChunk>`; de
 * union in `node_modules/ai/dist/index.d.ts` kent geen string-variant). Elke test
 * hieronder voert dus échte `UIMessageChunk`-objecten in — niet strings — en
 * faalt zodra de maskering weer op de chunk-vorm misgrijpt.
 *
 * Geverifieerd door de oude tak tijdelijk terug te zetten: de vier
 * PII-verwachtingen werden rood (IBAN/BSN kwamen onvermomd door), de
 * emoji-verwachtingen bleven groen.
 */

async function doorFilter(chunks: unknown[]): Promise<unknown[]> {
  const bron = new ReadableStream<unknown>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
  const uit: unknown[] = []
  const reader = bron.pipeThrough(createChatOutputFilter()).getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    uit.push(value)
  }
  return uit
}

/** Een compleet antwoord zoals `toUIMessageStream()` het levert. */
function antwoord(deltas: string[], id = 'blok-1'): unknown[] {
  return [
    { type: 'start' },
    { type: 'start-step' },
    { type: 'text-start', id },
    ...deltas.map((delta) => ({ type: 'text-delta', id, delta })),
    { type: 'text-end', id },
    { type: 'finish-step' },
    { type: 'finish' },
  ]
}

/** De tekst die de gebruiker uiteindelijk ziet. */
function zichtbareTekst(uit: unknown[]): string {
  return uit
    .filter((c): c is { type: string; delta: string } => (c as { type?: string })?.type === 'text-delta')
    .map((c) => c.delta)
    .join('')
}

describe('chat-uitvoerfilter — PII op de echte chunk-vorm', () => {
  it('maskeert een IBAN die in één text-delta zit', async () => {
    const uit = await doorFilter(antwoord(['Je rekening NL91ABNA0417164300 is actief.']))
    expect(zichtbareTekst(uit)).toBe('Je rekening **** is actief.')
  })

  it('maskeert een IBAN die over drie text-deltas is verdeeld', async () => {
    // Dit is de praktijk: een provider levert losse fragmenten, dus een filter
    // dat per fragment maskeert vindt hier niets.
    const uit = await doorFilter(antwoord(['Je rekening NL91 ', 'ABNA 0417 ', '1643 00 is actief.']))
    expect(zichtbareTekst(uit)).toBe('Je rekening **** is actief.')
  })

  it('maskeert een BSN die over een chunkgrens breekt', async () => {
    const uit = await doorFilter(antwoord(['Je BSN is 1234', '56789 en dat klopt.']))
    expect(zichtbareTekst(uit)).toBe('Je BSN is **** en dat klopt.')
  })

  it('maskeert de staart ook als het tekstblok bij text-end nog openstaat', async () => {
    const uit = await doorFilter(antwoord(['Rekening: ', 'NL91 ABNA 0417 1643 00']))
    expect(zichtbareTekst(uit)).toBe('Rekening: ****')
  })
})

describe('chat-uitvoerfilter — wat bewust ongemoeid blijft', () => {
  it('laat een bedrag met negen cijfers staan, ook als het over een grens breekt', async () => {
    const uit = await doorFilter(antwoord(['Je vermogen is €1234', '56789 op dit moment.']))
    expect(zichtbareTekst(uit)).toBe('Je vermogen is €123456789 op dit moment.')
  })

  it('geeft gewone tekst volledig en ongewijzigd door', async () => {
    const zinnen = ['Je spaarquote is ', '18% en dat is ', 'ruim boven het gemiddelde.']
    const uit = await doorFilter(antwoord(zinnen))
    expect(zichtbareTekst(uit)).toBe(zinnen.join(''))
  })

  it('laat niet-tekst-chunks onaangeroerd passeren', async () => {
    const toolChunk = { type: 'tool-output-available', toolCallId: 'x', output: { saldo: 1234 } }
    const uit = await doorFilter([{ type: 'start' }, toolChunk, { type: 'finish' }])
    expect(uit).toEqual([{ type: 'start' }, toolChunk, { type: 'finish' }])
  })
})

describe('chat-uitvoerfilter — emoji-toets van UR3-11 blijft staan', () => {
  it('strijkt de emoji uit de tekst, inclusief de spatie ervoor', async () => {
    const uit = await doorFilter(antwoord(['je komt uit met ruimte over. \u{1F4AA}']))
    expect(zichtbareTekst(uit)).toBe('je komt uit met ruimte over.')
  })

  it('vangt een emoji die precies op de chunkgrens valt', async () => {
    // Het surrogaatpaar breekt tussen de twee deltas; zonder staart-buffer zou
    // de helft doorglippen als vervangingsteken.
    const uit = await doorFilter(antwoord(['dat is enorm! \u{1F3AF}'.slice(0, -1), '\u{1F3AF}'.slice(-1)]))
    expect(zichtbareTekst(uit)).toBe('dat is enorm!')
  })

  it('houdt het oneindig-symbool en de pijl heel', async () => {
    const uit = await doorFilter(antwoord(['passief inkomen dekt je uitgaven ∞ → altijd']))
    expect(zichtbareTekst(uit)).toBe('passief inkomen dekt je uitgaven ∞ → altijd')
  })
})

describe('chat-uitvoerfilter — afgebroken stream', () => {
  it('geeft de vastgehouden staart alsnog vrij als text-end nooit komt', async () => {
    const uit = await doorFilter([
      { type: 'start' },
      { type: 'text-start', id: 'blok-1' },
      { type: 'text-delta', id: 'blok-1', delta: 'Rekening NL91 ABNA 0417 1643 00' },
      { type: 'abort', reason: 'client weg' },
    ])
    expect(zichtbareTekst(uit)).toBe('Rekening ****')
  })
})
