import { describe, it, expect } from 'vitest'
import {
  parseFinActionIntent,
  resolveFinActionIntent,
  finActionIntentHash,
  finActionFenceStart,
  type ResolvedFinActionIntent,
} from './parse-intent'
import type { LocalChatOverview } from './local-chat-context'
import { LocalChatTransport } from './local-chat-transport'
import type { LocalChatSession } from './litert-runtime'
import type { UIMessage, UIMessageChunk } from 'ai'

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

/** Bouw een minimaal, getypeerd overzicht met de drie match-bronnen. */
function makeOverview(overrides: Partial<LocalChatOverview> = {}): LocalChatOverview {
  return {
    hasData: true,
    nettoVermogen: 100000,
    vrijheidstijd: '2 jaar en 9 maanden',
    fireDoel: 600000,
    vrijheidsPct: 16.7,
    maandinkomen: 4000,
    maanduitgaven: 2500,
    spaarquotePct: 30,
    dagtarief: 82,
    swrPct: 3.5,
    noodbuffer: null,
    jaarruimte: { onbenut: 8000, besparing: 2400, vrijheidsdagen: 29 },
    kansen: [
      { titel: 'Bespaar op boodschappen', besparingPerJaar: 1200, vrijheidsdagen: 15 },
      { titel: 'Verlaag je energiekosten', besparingPerJaar: 600, vrijheidsdagen: 7 },
    ],
    openstaandeActies: [{ titel: 'Zeg dubbele streamingdienst op', vrijheidsdagen: 4, status: 'open' }],
    ...overrides,
  }
}

const FENCE = (json: string) => '```fin-actie\n' + json + '\n```'

/* ── parseFinActionIntent ─────────────────────────────────────────────────── */

describe('parseFinActionIntent', () => {
  it('parseert een schoon fin-actie-blok', () => {
    const text =
      'Je kunt hier vrijheid winnen.\n\n' +
      FENCE(
        '{ "title": "Bespaar op boodschappen", "description": "Kies een voordeliger supermarkt", "freedom_days_impact": 99, "euro_impact_monthly": 999, "priority_score": 2 }',
      )
    const { intent, cleanedText } = parseFinActionIntent(text)
    expect(intent).not.toBeNull()
    expect(intent!.title).toBe('Bespaar op boodschappen')
    expect(intent!.description).toBe('Kies een voordeliger supermarkt')
    expect(intent!.priority_score).toBe(2)
    // Ruwe model-getallen worden HIER wél geparsed (de resolver negeert ze later).
    expect(intent!.freedom_days_impact).toBe(99)
    expect(intent!.euro_impact_monthly).toBe(999)
    // Het blok is uit de zichtbare tekst verwijderd.
    expect(cleanedText).toBe('Je kunt hier vrijheid winnen.')
    expect(cleanedText).not.toContain('fin-actie')
    expect(cleanedText).not.toContain('"title"')
  })

  it('strip-t een <think>-preamble vóór het blok en parseert alsnog', () => {
    const text =
      '<think>De gebruiker vraagt om een tip.</think>\n' +
      'Hier is een concrete stap.\n' +
      FENCE('{ "title": "Verlaag je energiekosten", "freedom_days_impact": 3, "priority_score": 1 }')
    const { intent, cleanedText } = parseFinActionIntent(text)
    expect(intent).not.toBeNull()
    expect(intent!.title).toBe('Verlaag je energiekosten')
    expect(cleanedText).not.toContain('fin-actie')
    expect(cleanedText).toContain('Hier is een concrete stap.')
  })

  it('behoudt omliggende proza vóór én na het blok in cleanedText', () => {
    const text =
      'Intro-zin.\n\n' +
      FENCE('{ "title": "Bespaar op boodschappen", "freedom_days_impact": 1 }') +
      '\n\nSlotzin na het voorstel.'
    const { intent, cleanedText } = parseFinActionIntent(text)
    expect(intent).not.toBeNull()
    expect(cleanedText).toContain('Intro-zin.')
    expect(cleanedText).toContain('Slotzin na het voorstel.')
    expect(cleanedText).not.toContain('```')
    expect(cleanedText).not.toContain('title')
  })

  it('is fail-closed bij een afgekapt/niet-gesloten fence-blok (intent null, geen lek)', () => {
    const text =
      'Advies hier.\n\n```fin-actie\n{ "title": "Half voorstel", "freedom_days_impact": 5'
    const { intent, cleanedText } = parseFinActionIntent(text)
    expect(intent).toBeNull()
    // De onvolledige fence + half-JSON mag NIET in de zichtbare tekst blijven.
    expect(cleanedText).toBe('Advies hier.')
    expect(cleanedText).not.toContain('fin-actie')
    expect(cleanedText).not.toContain('title')
  })

  it('geeft intent null wanneer er geen fence is (cleanedText = ongewijzigd)', () => {
    const text = 'Gewoon een tekstueel antwoord zonder blok.'
    const { intent, cleanedText } = parseFinActionIntent(text)
    expect(intent).toBeNull()
    expect(cleanedText).toBe(text)
  })

  it('geeft intent null bij een fence met onparsebare inhoud, maar strip-t het blok', () => {
    const text = 'Kop.\n\n```fin-actie\ndit is geen json\n```'
    const { intent, cleanedText } = parseFinActionIntent(text)
    expect(intent).toBeNull()
    expect(cleanedText).toBe('Kop.')
    expect(cleanedText).not.toContain('fin-actie')
  })

  it('finActionFenceStart vindt de blok-index (en -1 zonder blok)', () => {
    expect(finActionFenceStart('geen blok')).toBe(-1)
    const t = 'x\n```fin-actie\n{}\n```'
    expect(finActionFenceStart(t)).toBe(t.indexOf('```fin-actie'))
  })
})

/* ── resolveFinActionIntent — cijfer-guardrail ────────────────────────────── */

describe('resolveFinActionIntent (consume, don\'t recompute)', () => {
  const overview = makeOverview()

  it('neemt canonieke getallen over bij een kans-match en NEGEERT de model-getallen', () => {
    const { intent } = parseFinActionIntent(
      FENCE(
        '{ "title": "Bespaar op boodschappen", "description": "x", "freedom_days_impact": 9999, "euro_impact_monthly": 9999, "priority_score": 1 }',
      ),
    )
    const resolved = resolveFinActionIntent(intent!, overview)
    expect(resolved).not.toBeNull()
    // Canoniek uit kansen[0]: 15 vrijheidsdagen, 1200/jaar → 100/mnd.
    expect(resolved!.freedom_days_impact).toBe(15)
    expect(resolved!.euro_impact_monthly).toBe(100)
    // Model-getallen (9999) zijn NIET overgenomen.
    expect(resolved!.freedom_days_impact).not.toBe(9999)
    expect(resolved!.euro_impact_monthly).not.toBe(9999)
    expect(resolved!.priority_score).toBe(1)
    expect(resolved!.title).toBe('Bespaar op boodschappen')
  })

  it('geeft NULL bij geen enkele match (fail-closed → geen kaart, geen 0/null-kaart)', () => {
    const { intent } = parseFinActionIntent(
      FENCE('{ "title": "Iets totaal ongerelateerds", "freedom_days_impact": 500, "euro_impact_monthly": 500 }'),
    )
    const resolved = resolveFinActionIntent(intent!, overview)
    expect(resolved).toBeNull()
  })

  it('geeft NULL bij een geparafraseerde titel die geen enkele bron matcht', () => {
    // Het model formuleert de kans anders dan de canonieke titel; er is geen
    // substring-overlap met kansen/acties/jaarruimte → geen canonieke match →
    // geen kaart (i.p.v. een misleidende "+0 dagen vrijheid"-kaart).
    const { intent } = parseFinActionIntent(
      FENCE('{ "title": "Overweeg je vaste lasten te herzien", "freedom_days_impact": 42, "euro_impact_monthly": 42 }'),
    )
    const resolved = resolveFinActionIntent(intent!, overview)
    expect(resolved).toBeNull()
  })

  it('matcht een openstaande actie → vrijheidsdagen canoniek, euro null (geen bron)', () => {
    const { intent } = parseFinActionIntent(
      FENCE('{ "title": "Zeg dubbele streamingdienst op", "freedom_days_impact": 77, "euro_impact_monthly": 77 }'),
    )
    const resolved = resolveFinActionIntent(intent!, overview)
    expect(resolved).not.toBeNull()
    expect(resolved!.freedom_days_impact).toBe(4)
    expect(resolved!.euro_impact_monthly).toBeNull()
  })

  it('matcht de jaarruimte-lever op titel-trefwoord', () => {
    const { intent } = parseFinActionIntent(
      FENCE('{ "title": "Benut je jaarruimte dit jaar", "freedom_days_impact": 1 }'),
    )
    const resolved = resolveFinActionIntent(intent!, overview)
    expect(resolved).not.toBeNull()
    // jaarruimte: 29 dagen, 2400/jaar → 200/mnd.
    expect(resolved!.freedom_days_impact).toBe(29)
    expect(resolved!.euro_impact_monthly).toBe(200)
  })

  it('prefereert de expliciete euroImpactMonthly van een kans boven JAAR÷12 (L1)', () => {
    // Kans met een expliciet maandbedrag dat AFWIJKT van besparingPerJaar/12:
    // 1200/12 = 100, maar de canonieke maand-impact is 137 (bv. NIBUD-overschrijding).
    // De resolver moet 137 tonen — hetzelfde als /overzicht — niet 100.
    const ov = makeOverview({
      kansen: [{ titel: 'Bespaar op boodschappen', besparingPerJaar: 1200, vrijheidsdagen: 15, euroImpactMonthly: 137 }],
    })
    const { intent } = parseFinActionIntent(
      FENCE('{ "title": "Bespaar op boodschappen", "freedom_days_impact": 1 }'),
    )
    const resolved = resolveFinActionIntent(intent!, ov)
    expect(resolved).not.toBeNull()
    expect(resolved!.euro_impact_monthly).toBe(137)
    expect(resolved!.euro_impact_monthly).not.toBe(100)
  })

  it('valt terug op JAAR÷12 wanneer een kans geen expliciete euroImpactMonthly draagt (L1-fallback)', () => {
    // kansen[0] uit de fixture heeft geen euroImpactMonthly → 1200/12 = 100.
    const { intent } = parseFinActionIntent(
      FENCE('{ "title": "Bespaar op boodschappen", "freedom_days_impact": 1 }'),
    )
    const resolved = resolveFinActionIntent(intent!, overview)
    expect(resolved).not.toBeNull()
    expect(resolved!.euro_impact_monthly).toBe(100)
  })

  it('klemt priority_score naar 1–5 en default 3 bij ontbreken', () => {
    const a = resolveFinActionIntent(
      { title: 'Bespaar op boodschappen', description: null, freedom_days_impact: null, euro_impact_monthly: null, priority_score: 9 },
      overview,
    )
    expect(a).not.toBeNull()
    expect(a!.priority_score).toBe(5)
    const b = resolveFinActionIntent(
      { title: 'Bespaar op boodschappen', description: null, freedom_days_impact: null, euro_impact_monthly: null, priority_score: null },
      overview,
    )
    expect(b).not.toBeNull()
    expect(b!.priority_score).toBe(3)
  })
})

/* ── finActionIntentHash ──────────────────────────────────────────────────── */

describe('finActionIntentHash', () => {
  const base: ResolvedFinActionIntent = {
    title: 'Bespaar op boodschappen',
    description: 'Kies voordeliger',
    freedom_days_impact: 15,
    euro_impact_monthly: 100,
    priority_score: 3,
  }

  it('is stabiel voor identieke identiteitsvelden', () => {
    expect(finActionIntentHash(base)).toBe(finActionIntentHash({ ...base }))
  })

  it('verandert wanneer een identiteitsveld wijzigt', () => {
    expect(finActionIntentHash(base)).not.toBe(finActionIntentHash({ ...base, title: 'Anders' }))
    expect(finActionIntentHash(base)).not.toBe(finActionIntentHash({ ...base, freedom_days_impact: 16 }))
  })
})

/* ── Transport-strip (optioneel) ──────────────────────────────────────────── */

/** Mock-sessie die een vaste modeltekst in kleine brokjes streamt. */
function mockSession(full: string, chunkSize = 5): LocalChatSession {
  return {
    async send(_text, onDelta) {
      for (let i = 0; i < full.length; i += chunkSize) {
        onDelta(full.slice(i, i + chunkSize))
      }
      return full
    },
    dispose() {},
  }
}

async function drain(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const reader = stream.getReader()
  const out: UIMessageChunk[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out.push(value)
  }
  return out
}

const userMsg: UIMessage[] = [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Geef me een tip' }] }]

describe('LocalChatTransport fin-actie streaming-strip', () => {
  it('laat de fin-actie-JSON NOOIT in een text-delta lekken en emit een data-finActie-part', async () => {
    const full =
      'Je kunt echt vrijheid winnen hier.\n\n' +
      FENCE('{ "title": "Bespaar op boodschappen", "freedom_days_impact": 9999, "euro_impact_monthly": 9999, "priority_score": 2 }')
    const transport = new LocalChatTransport({
      overview: makeOverview(),
      knowledgeItems: [],
      createSession: async () => mockSession(full),
      generateId: () => 'part-1',
    })

    const stream = await transport.sendMessages({ messages: userMsg, abortSignal: undefined, trigger: 'submit-message', chatId: 'c1', messageId: undefined } as unknown as Parameters<LocalChatTransport['sendMessages']>[0])
    const chunks = await drain(stream)

    const deltas = chunks.filter((c) => c.type === 'text-delta') as Array<{ type: 'text-delta'; delta: string }>
    const visible = deltas.map((d) => d.delta).join('')
    expect(visible).toContain('Je kunt echt vrijheid winnen hier.')
    expect(visible).not.toContain('fin-actie')
    expect(visible).not.toContain('"title"')
    expect(visible).not.toContain('9999')

    const dataPart = chunks.find((c) => c.type === 'data-finActie') as
      | { type: 'data-finActie'; id: string; data: ResolvedFinActionIntent }
      | undefined
    expect(dataPart).toBeDefined()
    // Canoniek uit het overzicht — niet de model-9999.
    expect(dataPart!.data.freedom_days_impact).toBe(15)
    expect(dataPart!.data.euro_impact_monthly).toBe(100)
    expect(dataPart!.id).toBe(finActionIntentHash(dataPart!.data))
  })

  it('emit geen data-finActie wanneer er geen blok is (gewoon antwoord)', async () => {
    const transport = new LocalChatTransport({
      overview: makeOverview(),
      knowledgeItems: [],
      createSession: async () => mockSession('Een gewoon antwoord zonder voorstel, netjes afgerond.'),
      generateId: () => 'part-1',
    })
    const stream = await transport.sendMessages({ messages: userMsg, abortSignal: undefined, trigger: 'submit-message', chatId: 'c1', messageId: undefined } as unknown as Parameters<LocalChatTransport['sendMessages']>[0])
    const chunks = await drain(stream)
    const visible = (chunks.filter((c) => c.type === 'text-delta') as Array<{ delta: string }>).map((d) => d.delta).join('')
    // Volledige tekst zichtbaar (de tail-hold is aan het eind netjes geflusht).
    expect(visible).toBe('Een gewoon antwoord zonder voorstel, netjes afgerond.')
    expect(chunks.find((c) => c.type === 'data-finActie')).toBeUndefined()
  })
})
