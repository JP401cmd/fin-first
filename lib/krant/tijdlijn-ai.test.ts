import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * De AI-stap (Krant 1E, ADR 0190) — élke poort blokkeert echt, en elke fout
 * wordt een verversing zonder AI. GEEN echte modelcall: `getModel` en
 * `generateObject` zijn gemockt; `NoObjectGeneratedError` blijft de echte
 * klasse zodat de salvage-tak het echte `isInstance` raakt.
 */

const mockGenerate = vi.fn()
vi.mock('ai', async (importActual) => {
  const actual = await importActual<typeof import('ai')>()
  return { ...actual, generateObject: (...a: unknown[]) => mockGenerate(...a) }
})
const mockGetModel = vi.fn()
vi.mock('@/lib/ai/config', () => ({ getModel: (...a: unknown[]) => mockGetModel(...a) }))
const mockTier = vi.fn()
vi.mock('@/lib/require-tier', () => ({ checkTierGate: (...a: unknown[]) => mockTier(...a) }))
const mockCredit = vi.fn()
vi.mock('@/lib/ai/credit-gate', () => ({ checkCreditBudget: (...a: unknown[]) => mockCredit(...a) }))
const mockRecord = vi.fn()
vi.mock('@/lib/ai-credits', () => ({ recordAiUsage: (...a: unknown[]) => mockRecord(...a) }))

import { NoObjectGeneratedError } from 'ai'
import { AI_LAAG_SYSTEM_PROMPT } from './ai-laag-prompt'
import { ARTIKELEN, PROFIEL_TESSA } from './editie.fixture'
import type { EditieItem } from './matcher'
import type { AiKandidaat } from './ai-laag'
import { maakNepClient, type NepRij } from './nep-client.fixture'
import {
  AI_LAAG_MARGE_MS,
  AI_LAAG_MIN_CALL_MS,
  AI_LAAG_TIMEOUT_MS,
  KRANT_AI_FEATURE,
  aiTimeoutMs,
  maakAiStap,
  telAiAanroepen,
  type AiStapInvoer,
} from './tijdlijn-ai'

const UID = 'user-a'
const NU = new Date('2026-09-29T12:00:00Z')
const MODEL = { modelId: 'nep-model' }

function item(p: Partial<EditieItem> & { artikelId: string }): EditieItem {
  return {
    titel: ARTIKELEN[0].title,
    rubriek: 'fiscaal',
    bron: 'Rijksoverheid',
    url: 'https://www.rijksoverheid.nl/a',
    gepubliceerd: '2026-09-20',
    gezienOp: null,
    vorm: 'direct',
    score: 5,
    mechanisme: null,
    impact: null,
    sjabloonId: 'editie-leeg',
    variant: 0,
    slots: {},
    tekst: 'Voor jou scheelt dit tussen € 120 en € 240 per jaar.',
    deadline: null,
    watMist: [],
    waarom: [],
    samenvatting: 'Het heffingsvrij vermogen gaat in 2027 naar 60.000 euro.',
    ...p,
  }
}

const ITEMS = [item({ artikelId: 'a01-box3-heffingsvrij' })]
const KANDIDATEN: AiKandidaat[] = [{ ...(ARTIKELEN[2] as AiKandidaat), id: 'k1', title: 'Minister De Vries over de AOW' }]

const invoer = (p: Partial<AiStapInvoer> = {}): AiStapInvoer => ({
  userId: UID,
  now: NU,
  profiel: PROFIEL_TESSA,
  items: ITEMS,
  kandidaten: KANDIDATEN,
  duidingVan: (id) => ARTIKELEN.find((a) => a.id === id)?.duiding ?? null,
  ...p,
})

function profiel(p: Partial<NepRij> = {}): NepRij {
  return { id: UID, active_modules: null, krant_schaduw_bezwaar_at: null, full_name: 'Jan de Vries', date_of_birth: '1984-03-02', ...p }
}

/** `n` eerdere aanroepen binnen het venster (+ ruis die niet mag tellen). */
function edities(n: number): NepRij[] {
  const binnen = Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    user_id: UID,
    bron: 'tijdlijn',
    ai_uitkomst: i % 2 === 0 ? 'met-ai' : 'teruggevallen',
    created_at: new Date(NU.getTime() - (i + 1) * 3_600_000).toISOString(),
  }))
  return [
    ...binnen,
    { id: 'oud', user_id: UID, bron: 'tijdlijn', ai_uitkomst: 'met-ai', created_at: new Date(NU.getTime() - 8 * 86_400_000).toISOString() },
    { id: 'quotum', user_id: UID, bron: 'tijdlijn', ai_uitkomst: 'quotum', created_at: NU.toISOString() },
    { id: 'geweigerd', user_id: UID, bron: 'tijdlijn', ai_uitkomst: 'geweigerd', created_at: NU.toISOString() },
    { id: 'partner', user_id: 'partner', bron: 'tijdlijn', ai_uitkomst: 'met-ai', created_at: NU.toISOString() },
  ]
}

function service(opts: { profiel?: NepRij | null; edities?: NepRij[]; tokens?: NepRij[]; fouten?: Record<string, string> } = {}) {
  return maakNepClient(
    {
      profiles: opts.profiel === null ? [] : [opts.profiel ?? profiel()],
      krant_edities: opts.edities ?? [],
      ai_token_usage: opts.tokens ?? [],
    },
    { fouten: opts.fouten },
  )
}

/** `n` tokenlog-rijen van de laag binnen het venster (+ ruis die niet mag tellen). */
function tokens(n: number): NepRij[] {
  return [
    ...Array.from({ length: n }, (_, i) => ({ id: `t${i}`, user_id: UID, feature: 'krant_ai', created_at: new Date(NU.getTime() - (i + 1) * 3_600_000).toISOString() })),
    { id: 'chat', user_id: UID, feature: 'chat', created_at: NU.toISOString() },
    { id: 'oud', user_id: UID, feature: 'krant_ai', created_at: new Date(NU.getTime() - 8 * 86_400_000).toISOString() },
    { id: 'ander', user_id: 'partner', feature: 'krant_ai', created_at: NU.toISOString() },
  ]
}

const TOELICHTING = { toelichtingen: [{ artikelId: 'a01-box3-heffingsvrij', tekst: 'In 2027 gaat de grens naar 60.000 euro; met jouw spaargeld raakt dat je.' }] }

beforeEach(() => {
  vi.clearAllMocks()
  mockTier.mockResolvedValue(null)
  mockCredit.mockResolvedValue({ allowed: true })
  mockGetModel.mockResolvedValue(MODEL)
  mockGenerate.mockResolvedValue({ object: TOELICHTING })
  mockRecord.mockResolvedValue(undefined)
})

const stap = (cloudToegestaan = true) => maakAiStap({ cloudToegestaan })

describe('de poorten — elk blokkeert echt, geen call', () => {
  it('leeg (geen berichten én geen kandidaten): "leeg", geen enkele poort of call (K5)', async () => {
    const nep = service()
    const uit = await stap()(nep.client as never, invoer({ items: [], kandidaten: [] }))
    expect(uit).toMatchObject({ uitkomst: 'leeg', reden: 'leeg', items: [], naSchrijven: null })
    expect(mockTier).not.toHaveBeenCalled()
    expect(mockGetModel).not.toHaveBeenCalled()
    expect(nep.queries).toHaveLength(0)
  })

  it('alleen kandidaten, geen berichten: de laag draait wél (hij mag toevoegen); een schoon leeg antwoord is "met-ai" en telt (Y4)', async () => {
    mockGenerate.mockResolvedValue({ object: { toevoegingen: [] } })
    const uit = await stap()(service().client as never, invoer({ items: [] }))
    expect(mockGenerate).toHaveBeenCalledTimes(1)
    expect(uit).toMatchObject({ uitkomst: 'met-ai', reden: null })
    expect(uit.tellers.terugvalLaag).toBe(0)
    expect(uit.naSchrijven).not.toBeNull()
  })

  it('K6: privacy-poort / kill-switch dicht (cloudToegestaan false) → "geweigerd", niets naar een aanbieder, zelfs geen tier-lezing', async () => {
    const nep = service()
    const uit = await stap(false)(nep.client as never, invoer())
    expect(uit).toMatchObject({ uitkomst: 'geweigerd', reden: 'privacy', items: ITEMS })
    expect(mockTier).not.toHaveBeenCalled()
    expect(mockGetModel).not.toHaveBeenCalled()
    expect(mockGenerate).not.toHaveBeenCalled()
    expect(nep.queries).toHaveLength(0)
  })

  it('tier-gate weigert (geen AI-abonnement) → "geweigerd"/tier', async () => {
    mockTier.mockResolvedValue({ subscriptions: [], error: 'x' })
    const uit = await stap()(service().client as never, invoer())
    expect(uit).toMatchObject({ uitkomst: 'geweigerd', reden: 'tier' })
    expect(mockTier).toHaveBeenCalledWith(expect.anything(), UID, 'ai')
    expect(mockGetModel).not.toHaveBeenCalled()
  })

  it('K2: een Krant-account — via de tier-gate (reason krant) én via de eigen toets als de gate hem zou doorlaten', async () => {
    mockTier.mockResolvedValueOnce({ subscriptions: ['ai'], error: 'x', reason: 'krant' })
    expect((await stap()(service().client as never, invoer())).reden).toBe('krant')
    mockTier.mockResolvedValueOnce(null)
    const uit = await stap()(service({ profiel: profiel({ active_modules: ['nieuws'] }) }).client as never, invoer())
    expect(uit).toMatchObject({ uitkomst: 'geweigerd', reden: 'krant' })
    expect(mockGetModel).not.toHaveBeenCalled()
  })

  it('een bezwaar stopt óók de AI-laag', async () => {
    const uit = await stap()(service({ profiel: profiel({ krant_schaduw_bezwaar_at: '2026-09-28T00:00:00Z' }) }).client as never, invoer())
    expect(uit).toMatchObject({ uitkomst: 'geweigerd', reden: 'bezwaar' })
    expect(mockGetModel).not.toHaveBeenCalled()
  })

  it('geen profielrij of een leesfout → "geweigerd" (fail-closed)', async () => {
    expect((await stap()(service({ profiel: null }).client as never, invoer())).reden).toBe('profiel-onleesbaar')
    expect((await stap()(service({ fouten: { 'profiles:select': 'kapot' } }).client as never, invoer())).reden).toBe('profiel-onleesbaar')
    expect(mockGetModel).not.toHaveBeenCalled()
  })

  it('K5 quotum: 4 eerdere aanroepen mag nog, 5 is op — telt alleen met-ai/teruggevallen van de eigen lezer binnen 7 dagen', async () => {
    const vier = await stap()(service({ edities: edities(4) }).client as never, invoer())
    expect(vier.uitkomst).toBe('met-ai')
    vi.clearAllMocks()
    mockTier.mockResolvedValue(null)
    mockCredit.mockResolvedValue({ allowed: true })
    const vijf = await stap()(service({ edities: edities(5) }).client as never, invoer())
    expect(vijf).toMatchObject({ uitkomst: 'quotum', reden: 'quotum', items: ITEMS })
    expect(mockGetModel).not.toHaveBeenCalled()
  })

  it('Y1: het quotum is niet te resetten door de eigen verversingen te wissen — ai_token_usage telt mee (maximum van beide)', async () => {
    // Geen enkele verversing meer (gewist via de eigen-rij DELETE-policy), maar 5 calls in de tokenlog.
    const uit = await stap()(service({ edities: [], tokens: tokens(5) }).client as never, invoer())
    expect(uit).toMatchObject({ uitkomst: 'quotum', reden: 'quotum' })
    expect(mockGetModel).not.toHaveBeenCalled()
    expect(await telAiAanroepen(service({ edities: edities(2), tokens: tokens(4) }).client as never, UID, NU)).toBe(4)
    expect(await telAiAanroepen(service({ edities: edities(3), tokens: tokens(1) }).client as never, UID, NU)).toBe(3)
  })

  it('Y1: een onleesbare tokenlog is óók fail-closed (zonder AI)', async () => {
    const uit = await stap()(service({ fouten: { 'ai_token_usage:select': 'kapot' } }).client as never, invoer())
    expect(uit).toMatchObject({ uitkomst: 'geweigerd', reden: 'quotum-onleesbaar' })
  })

  it('Y5: te weinig tijd over voor een call plus marge → geen call ("geweigerd"/tijd, niets betaald)', async () => {
    const krap = maakAiStap({ cloudToegestaan: true, deadline: Date.now() + AI_LAAG_MARGE_MS + AI_LAAG_MIN_CALL_MS - 1000 })
    const uit = await krap(service().client as never, invoer())
    expect(uit).toMatchObject({ uitkomst: 'geweigerd', reden: 'tijd', naSchrijven: null })
    expect(mockGetModel).not.toHaveBeenCalled()
  })

  it('Y5: aiTimeoutMs = min(45 s, rest − marge), en null onder het minimum — beide uiteinden', () => {
    const nu = 1_000_000
    expect(aiTimeoutMs(undefined, nu)).toBe(AI_LAAG_TIMEOUT_MS)
    expect(aiTimeoutMs(nu + 10 * 60_000, nu)).toBe(AI_LAAG_TIMEOUT_MS)
    expect(aiTimeoutMs(nu + AI_LAAG_MARGE_MS + 20_000, nu)).toBe(20_000)
    expect(aiTimeoutMs(nu + AI_LAAG_MARGE_MS + AI_LAAG_MIN_CALL_MS, nu)).toBe(AI_LAAG_MIN_CALL_MS)
    expect(aiTimeoutMs(nu + AI_LAAG_MARGE_MS + AI_LAAG_MIN_CALL_MS - 1, nu)).toBeNull()
    expect(aiTimeoutMs(nu - 1, nu)).toBeNull()
  })

  it('telAiAanroepen: de telling zelf (in de database, niet in het geheugen)', async () => {
    const nep = service({ edities: edities(3) })
    expect(await telAiAanroepen(nep.client as never, UID, NU)).toBe(3)
    const q = nep.queriesOp('krant_edities')[0]
    expect(q.stappen).toEqual(expect.arrayContaining([{ m: 'eq', args: ['user_id', UID] }, { m: 'in', args: ['ai_uitkomst', ['met-ai', 'teruggevallen']] }]))
  })

  it('een onleesbaar quotum → zonder AI (fail-closed), geen call', async () => {
    const uit = await stap()(service({ fouten: { 'krant_edities:select': 'kapot' } }).client as never, invoer())
    expect(uit).toMatchObject({ uitkomst: 'geweigerd', reden: 'quotum-onleesbaar' })
    expect(mockGetModel).not.toHaveBeenCalled()
  })

  it('het maandtegoed op → "geweigerd"/tegoed, geen call', async () => {
    mockCredit.mockResolvedValue({ allowed: false })
    const uit = await stap()(service().client as never, invoer())
    expect(uit).toMatchObject({ uitkomst: 'geweigerd', reden: 'tegoed' })
    expect(mockCredit).toHaveBeenCalledWith(expect.anything(), UID, 'news', NU)
    expect(mockGetModel).not.toHaveBeenCalled()
  })

  it('getModel gooit (platform-kill-switch, geen sleutel) → "geweigerd"/model-config, geen generate, telt niet voor het quotum', async () => {
    mockGetModel.mockRejectedValue(new Error('AI is tijdelijk uitgeschakeld door beheer.'))
    const uit = await stap()(service().client as never, invoer())
    expect(uit).toMatchObject({ uitkomst: 'geweigerd', reden: 'model-config', naSchrijven: null })
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('een onverwachte fout in een poort gooit nooit door: "geweigerd"/fout, de berichten blijven', async () => {
    mockTier.mockRejectedValue(new Error('db hik'))
    const uit = await stap()(service().client as never, invoer())
    expect(uit).toMatchObject({ uitkomst: 'geweigerd', reden: 'fout', items: ITEMS })
  })
})

describe('de call zelf', () => {
  it('getModel met feature krant_ai + userId (token-logging, model per feature) — geen AI-SDK buiten getModel om', async () => {
    const nep = service()
    await stap()(nep.client as never, invoer())
    expect(KRANT_AI_FEATURE).toBe('krant_ai')
    expect(mockGetModel).toHaveBeenCalledWith(nep.client, 'krant_ai', { userId: UID })
    const args = mockGenerate.mock.calls[0][0] as { model: unknown; system: string; abortSignal: AbortSignal; providerOptions: unknown }
    expect(args.model).toBe(MODEL)
    expect(args.system).toBe(AI_LAAG_SYSTEM_PROMPT)
    expect(args.abortSignal).toBeInstanceOf(AbortSignal)
    expect(AI_LAAG_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('PII gaat er niet in: de naam (uit profiles.full_name) gaat uit de regel voor jou, geen geboortejaar; een openbare kop blijft heel (G2)', async () => {
    await stap()(service().client as never, invoer({ items: [item({ artikelId: 'a01-box3-heffingsvrij', tekst: 'Voor Jan de Vries, geboren in 1984, scheelt dit € 120.' })] }))
    const { prompt } = mockGenerate.mock.calls[0][0] as { prompt: string }
    expect(prompt).not.toContain('Jan de Vries')
    expect(prompt).not.toContain('1984')
    expect(prompt).toContain('Voor gebruiker, geboren in [je geboortejaar], scheelt dit € 120.')
    // De openbare kandidaatkop met toevallig dezelfde achternaam blijft staan.
    expect(prompt).toContain('Minister De Vries over de AOW')
  })

  it('het schema dat meegaat kent alleen de aangeleverde id’s (enum)', async () => {
    await stap()(service().client as never, invoer())
    const { schema } = mockGenerate.mock.calls[0][0] as { schema: { safeParse: (v: unknown) => { success: boolean } } }
    expect(schema.safeParse({ toelichtingen: [{ artikelId: 'a01-box3-heffingsvrij', tekst: 'x' }] }).success).toBe(true)
    expect(schema.safeParse({ toelichtingen: [{ artikelId: 'onbekend', tekst: 'x' }] }).success).toBe(false)
    expect(schema.safeParse({ toevoegingen: [{ artikelId: 'k1', tekst: 'x' }] }).success).toBe(true)
  })

  it('succes: "met-ai", de toelichting staat onder de regel; naSchrijven meet het tegoed (recordAiUsage news)', async () => {
    const nep = service()
    const uit = await stap()(nep.client as never, invoer())
    expect(uit.uitkomst).toBe('met-ai')
    expect(uit.items[0]).toMatchObject({ tekst: ITEMS[0].tekst, aiTekst: expect.stringContaining('60.000 euro') })
    expect(mockRecord).not.toHaveBeenCalled() // pas na het schrijven
    await uit.naSchrijven!()
    expect(mockRecord).toHaveBeenCalledWith(nep.client, UID, 'news')
  })

  it('PII komt er niet uit: een rekeningnummer in de modeltekst haalt de uitvoer nooit', async () => {
    mockGenerate.mockResolvedValue({ object: { toelichtingen: [{ artikelId: 'a01-box3-heffingsvrij', tekst: 'Je rekening NL91ABNA0417164300 merkt dit.' }] } })
    const uit = await stap()(service().client as never, invoer())
    expect(JSON.stringify(uit.items)).not.toContain('NL91ABNA0417164300')
    expect(uit.uitkomst).toBe('teruggevallen')
  })

  it('K4: een verzonnen getal laat de matcherregel staan — "teruggevallen", maar de call telt (naSchrijven)', async () => {
    mockGenerate.mockResolvedValue({ object: { toelichtingen: [{ artikelId: 'a01-box3-heffingsvrij', tekst: 'Dit scheelt je € 999.' }] } })
    const uit = await stap()(service().client as never, invoer())
    expect(uit.items).toEqual(ITEMS)
    expect(uit).toMatchObject({ uitkomst: 'teruggevallen', reden: 'guards' })
    expect(uit.tellers.getallenTegengehouden).toBe(1)
    expect(uit.naSchrijven).not.toBeNull()
  })

  it('een modelfout (timeout, tegoed op, 5xx) → dezelfde verversing zonder AI: "teruggevallen"/model', async () => {
    mockGenerate.mockRejectedValue(new Error('overloaded'))
    const uit = await stap()(service().client as never, invoer())
    expect(uit).toMatchObject({ uitkomst: 'teruggevallen', reden: 'model', items: ITEMS })
    expect(uit.tellers).toMatchObject({ terugvalLaag: 1, terugvalBericht: 1 })
  })

  it('een schemabreuk kost niet het hele antwoord: een id buiten de set valt af, de rest blijft (salvage uit NoObjectGeneratedError)', async () => {
    const ruw = {
      toelichtingen: [
        { artikelId: 'a01-box3-heffingsvrij', tekst: 'In 2027 gaat de grens naar 60.000 euro.' },
        { artikelId: 'verzonnen-id', tekst: 'x' },
      ],
    }
    mockGenerate.mockRejectedValue(
      new NoObjectGeneratedError({ message: 'schema', text: JSON.stringify(ruw), response: {} as never, usage: {} as never, finishReason: 'stop' }),
    )
    const uit = await stap()(service().client as never, invoer())
    expect(uit.uitkomst).toBe('met-ai')
    expect(uit.items[0].aiTekst).toContain('60.000 euro')
    expect(uit.tellers.schemaTegengehouden).toBe(1)
  })

  it('een schemabreuk zonder leesbare tekst → "teruggevallen"/onbruikbaar', async () => {
    mockGenerate.mockRejectedValue(new NoObjectGeneratedError({ message: 'x', text: 'geen json', response: {} as never, usage: {} as never, finishReason: 'stop' }))
    const uit = await stap()(service().client as never, invoer())
    expect(uit).toMatchObject({ uitkomst: 'teruggevallen', reden: 'onbruikbaar', items: ITEMS })
  })
})
