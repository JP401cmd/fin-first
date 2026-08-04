import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AiExecutionSettings } from './local-categorization-settings'
import { writeProofVerdict } from '@/lib/ai/local/proof-verdict'
import type { AiExecutionGroup, AiExecutionMode } from '@/lib/ai/execution-groups'

/**
 * Tests voor de sectie "Waar draait de AI?" op /mijn/privacy (ADR 0043).
 *
 * Dekking uit de vorige monoliet blijft één-op-één staan — alleen de namen en
 * teksten volgen de nieuwe opbouw (hoofdkeuze → voor/nadelen → lokaal model →
 * per functionaliteit):
 *  1. capability-fail → keuze blijft uit + de reasons (NL) zijn zichtbaar,
 *     geen download en geen schrijfactie op /api/privacy-mode.
 *  2. happy path → capability ok → consent → download-progress → POST true.
 *  3. verwijderen → deleteLocalModel + POST false.
 *  4. tier-gate: zonder 'ai'-abonnement is aanzetten geblokkeerd + de gedeelde
 *     AiSubscriptionUpsell is zichtbaar en via aria-describedby aan de schakelaar
 *     gekoppeld; met lokaal al aan blijft uitzetten mogelijk (niemand opgesloten)
 *     en meldt het beheer-blok eerlijk dat het abonnement verlopen is.
 *  5. nieuw: de voor-en-nadelen-vergelijking staat er, en de "Experimenteel"-badge
 *     hangt niet meer aan de sectie als geheel.
 *
 * De lib/ai/local-primitieven worden gemockt; de twee API's (/api/privacy-mode en
 * /api/ai-execution-prefs) lopen via één URL-bewuste fetch-mock.
 */

const mocks = vi.hoisted(() => ({
  checkLocalAiCapability: vi.fn(),
  getLocalModelState: vi.fn(),
  downloadLocalModel: vi.fn(),
  deleteLocalModel: vi.fn(),
  proveLocalModel: vi.fn(),
  selectLocalModel: vi.fn(),
}))

vi.mock('@/lib/ai/local/webgpu-capability', () => ({
  checkLocalAiCapability: mocks.checkLocalAiCapability,
}))
vi.mock('@/lib/ai/local/model-manager', () => ({
  getLocalModelState: mocks.getLocalModelState,
  downloadLocalModel: mocks.downloadLocalModel,
  deleteLocalModel: mocks.deleteLocalModel,
  proveLocalModel: mocks.proveLocalModel,
  selectLocalModel: mocks.selectLocalModel,
  LOCAL_MODEL_DOWNLOAD_GB: 3.2,
}))

// Profiel-load: ai_enabled + privacy_mode + active_subscriptions via één select.
// Per test instelbaar; default bevat de 'ai'-tier zodat bestaande cases groen blijven.
let profileRow: { ai_enabled: boolean; privacy_mode: boolean; active_subscriptions: string[] } = {
  ai_enabled: true,
  privacy_mode: false,
  active_subscriptions: ['ai'],
}
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: vi.fn().mockResolvedValue({ data: profileRow }),
        }),
      }),
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
    },
  }),
}))

let fetchMock: ReturnType<typeof vi.fn>

/** Alle groepen op cloud — de groepenlijst hoeft hier alleen te kunnen laden. */
const ALL_CLOUD: Record<AiExecutionGroup, AiExecutionMode> = {
  gesprek: 'cloud',
  transacties: 'cloud',
  briefing: 'cloud',
  tips: 'cloud',
  rapporten: 'cloud',
  documenten: 'cloud',
  nieuws: 'cloud',
}

/** Werden er schrijfacties op /api/privacy-mode gedaan? */
function privacyModeCalls(): unknown[][] {
  return fetchMock.mock.calls.filter((call) => call[0] === '/api/privacy-mode')
}

/**
 * Stub navigator.storage.persisted() (jsdom levert de StorageManager niet).
 * `null` → géén persisted-methode (best-effort onbekend); true/false → de
 * gemockte uitkomst. persist() wordt altijd meegemockt zodat de download-flow
 * niet valt over een ontbrekende methode.
 */
function setStorageManager(persisted: boolean | null): void {
  const value =
    persisted === null
      ? { persist: vi.fn().mockResolvedValue(true) }
      : { persisted: vi.fn().mockResolvedValue(persisted), persist: vi.fn().mockResolvedValue(true) }
  Object.defineProperty(navigator, 'storage', { value, configurable: true })
}

beforeEach(() => {
  mocks.checkLocalAiCapability.mockReset()
  mocks.getLocalModelState.mockReset()
  mocks.downloadLocalModel.mockReset()
  mocks.deleteLocalModel.mockReset()
  // Default: dit toestel haalt de uitvoer-toets. Cases die het tegendeel testen
  // zetten 'm zelf om. Bewaarde oordelen mogen niet tussen tests doorlekken.
  mocks.proveLocalModel.mockReset()
  mocks.proveLocalModel.mockResolvedValue({ ok: true, reasons: [], results: [] })
  mocks.selectLocalModel.mockReset()
  mocks.selectLocalModel.mockResolvedValue(undefined)
  localStorage.clear()
  profileRow = { ai_enabled: true, privacy_mode: false, active_subscriptions: ['ai'] }
  fetchMock = vi.fn().mockImplementation(async (url: unknown) => {
    if (typeof url === 'string' && url.startsWith('/api/ai-execution-prefs')) {
      return { ok: true, json: async () => ({ privacyMode: false, prefs: {}, modes: ALL_CLOUD }) }
    }
    return { ok: true, json: async () => ({ ok: true }) }
  })
  vi.stubGlobal('fetch', fetchMock)
  // Schone navigator per test: geen storage-manager tenzij een test 'm zet.
  Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'storage')
})

describe('AiExecutionSettings', () => {
  it('toont de hoofdkeuze zonder sectie-brede Experimenteel-badge', async () => {
    mocks.getLocalModelState.mockResolvedValue({ state: 'niet-gedownload', bytes: null })
    render(<AiExecutionSettings />)

    expect(await screen.findByText('Lokaal waar mogelijk')).toBeTruthy()
    // De badge hangt alleen nog aan de lokale-chat-ingang, niet aan het geheel.
    await waitFor(() => expect(screen.getAllByText('Experimenteel')).toHaveLength(1))
  })

  it('toont de zes vergelijkingsrijen met beide kolommen', async () => {
    mocks.getLocalModelState.mockResolvedValue({ state: 'niet-gedownload', bytes: null })
    render(<AiExecutionSettings />)

    expect(await screen.findByRole('columnheader', { name: /Lokaal op je apparaat/i })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: /Cloud-AI/i })).toBeTruthy()
    for (const criterion of ['Privacy', 'Kwaliteit', 'Snelheid', 'Apparaat', 'AI-tegoed', 'Internet']) {
      expect(screen.getByRole('rowheader', { name: criterion })).toBeTruthy()
    }
    expect(screen.getByText('Je gegevens verlaten je apparaat niet.')).toBeTruthy()
    expect(screen.getByText('Verbruikt je maandtegoed.')).toBeTruthy()
  })

  it('rendert de groepenlijst met alle zeven functionaliteiten', async () => {
    mocks.getLocalModelState.mockResolvedValue({ state: 'niet-gedownload', bytes: null })
    render(<AiExecutionSettings />)

    expect(await screen.findByRole('button', { name: /Gesprek met Fin/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Transacties & vaste lasten/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Documenten lezen/i })).toBeTruthy()
  })

  // ── Toestel-hint is adviserend, niet blokkerend ─────────────────────────────
  //
  // Dit wás een harde poort, en die sloot een echte gebruiker buiten: op zijn
  // laptop wérkte /mijn/lokale-chat (die vraagt het aan de GPU) terwijl dit
  // scherm "alleen op desktop" toonde (die gokte het uit de aanwijzer). De
  // capability-check kost niets en downloadt niets, dus die hoort te beslissen —
  // de hint kondigt alleen aan wat er waarschijnlijk gaat gebeuren.
  describe('toestel-hint', () => {
    // De stub mag niet doorlekken naar de tests hieronder: die gaan uit van een
    // gewone desktop, en een blijvende "mobiel"-stub zou ze om de verkeerde
    // reden laten slagen of falen.
    afterEach(() => {
      Reflect.deleteProperty(globalThis as unknown as Record<string, unknown>, 'matchMedia')
    })

    /** Stub matchMedia voor de twee queries die de component bevraagt. */
    function setPointer({ coarsePrimary, anyFine }: { coarsePrimary: boolean; anyFine: boolean }) {
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({
          matches: query.includes('any-pointer: fine') ? anyFine : coarsePrimary,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      )
    }

    it('laptop met touchscreen krijgt geen hint en geen blokkade', async () => {
      setPointer({ coarsePrimary: true, anyFine: true })
      mocks.getLocalModelState.mockResolvedValue({ state: 'niet-gedownload', bytes: null })
      render(<AiExecutionSettings />)

      const schakelaar = await screen.findByRole('switch')
      expect((schakelaar as HTMLButtonElement).disabled).toBe(false)
      expect(screen.queryByText(/telefoon of tablet/i)).toBeNull()
    })

    // De kern van de fix: ook wie er als telefoon uitziet mag klikken. De
    // capability-check draait dan en geeft een echte reden — geen download, want
    // die begint pas na de consent-stap.
    it('telefoon krijgt de hint maar blijft klikbaar; de echte check beslist', async () => {
      setPointer({ coarsePrimary: true, anyFine: false })
      mocks.getLocalModelState.mockResolvedValue({ state: 'niet-gedownload', bytes: null })
      mocks.checkLocalAiCapability.mockResolvedValue({
        ok: false,
        reasons: ['Je browser ondersteunt WebGPU niet.'],
      })
      render(<AiExecutionSettings />)

      const schakelaar = await screen.findByRole('switch')
      expect(
        (schakelaar as HTMLButtonElement).disabled,
        'een gok mag geen poort zijn — de capability-check oordeelt',
      ).toBe(false)
      expect(screen.getByText(/telefoon of tablet/i)).toBeTruthy()

      fireEvent.click(schakelaar)

      // De echte toets draait, geeft de concrete reden, en zet niets aan.
      await waitFor(() => expect(mocks.checkLocalAiCapability).toHaveBeenCalled())
      expect(await screen.findByText(/WebGPU niet/i)).toBeTruthy()
      expect(mocks.downloadLocalModel, 'nooit downloaden zonder geldige check').not.toHaveBeenCalled()
      expect(privacyModeCalls(), 'en de voorkeur niet schrijven').toEqual([])
    })

    it('gewone desktop met muis krijgt geen hint', async () => {
      setPointer({ coarsePrimary: false, anyFine: true })
      mocks.getLocalModelState.mockResolvedValue({ state: 'niet-gedownload', bytes: null })
      render(<AiExecutionSettings />)

      const schakelaar = await screen.findByRole('switch')
      expect((schakelaar as HTMLButtonElement).disabled).toBe(false)
      expect(screen.queryByText(/telefoon of tablet/i)).toBeNull()
    })
  })

  it('capability-fail: keuze blijft uit en toont de reasons, geen download', async () => {
    mocks.getLocalModelState.mockResolvedValue({ state: 'niet-gedownload', bytes: null })
    mocks.checkLocalAiCapability.mockResolvedValue({
      ok: false,
      reasons: ['Geen WebGPU-ondersteuning gevonden in deze browser'],
    })

    render(<AiExecutionSettings />)
    const toggle = await screen.findByRole('switch', { name: /Lokaal waar mogelijk/i })
    expect(toggle.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(toggle)

    await screen.findByText(/Geen WebGPU-ondersteuning gevonden/i)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(mocks.downloadLocalModel).not.toHaveBeenCalled()
    expect(privacyModeCalls()).toHaveLength(0)
  })

  // ── De twee stappen ─────────────────────────────────────────────────────
  //
  // Downloaden en testen zaten aan elkaar vast; bij een zakking was niet te
  // zien wát er misging. Het zijn nu twee eigen handelingen met een eigen knop.
  it('stap 1 haalt alleen het model op — nog geen proef, nog geen aanzetten', async () => {
    mocks.getLocalModelState.mockResolvedValue({ state: 'niet-gedownload', bytes: null })
    mocks.checkLocalAiCapability.mockResolvedValue({ ok: true, reasons: [] })
    mocks.downloadLocalModel.mockResolvedValue(undefined)

    render(<AiExecutionSettings />)
    fireEvent.click(await screen.findByRole('button', { name: /Model downloaden/i }))

    await waitFor(() => expect(mocks.downloadLocalModel).toHaveBeenCalledTimes(1))
    expect(mocks.proveLocalModel, 'stap 2 hoort een eigen handeling te zijn').not.toHaveBeenCalled()
    expect(privacyModeCalls(), 'bestanden zijn nog geen werkend geheel').toEqual([])
  })

  it('stap 2 slaagt → dan pas gaat lokaal draaien aan', async () => {
    mocks.getLocalModelState.mockResolvedValue({ state: 'klaar', bytes: 2.0e9 })
    mocks.checkLocalAiCapability.mockResolvedValue({ ok: true, reasons: [] })

    render(<AiExecutionSettings />)
    fireEvent.click(await screen.findByRole('button', { name: /Toestel testen/i }))

    await waitFor(() => expect(mocks.proveLocalModel).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/privacy-mode',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ enabled: true }) }),
      ),
    )
    expect(mocks.downloadLocalModel, 'het model stond er al').not.toHaveBeenCalled()
  })

  // TRANSPARANTIE: de proef beslist of dit toestel meedoet, dus moet zichtbaar
  // zijn wát er gevraagd is en wát het model antwoordde. Dat is niet theoretisch
  // — de eerste versie verwierp een prima toestel op een quizvraag.
  it('een gezakte proef toont het echte antwoord en zet niets aan', async () => {
    mocks.getLocalModelState.mockResolvedValue({ state: 'klaar', bytes: 2.0e9 })
    mocks.checkLocalAiCapability.mockResolvedValue({ ok: true, reasons: [] })
    mocks.proveLocalModel.mockResolvedValue({
      ok: false,
      reasons: ['Bij de proef ging het mis.'],
      results: [{ id: 'echo-woord', raw: 'ですです', reason: 'het gevraagde woord kwam niet terug' }],
    })

    render(<AiExecutionSettings />)
    fireEvent.click(await screen.findByRole('button', { name: /Toestel testen/i }))

    expect(await screen.findByText(/ですです/)).toBeTruthy()
    expect(screen.getByText(/het gevraagde woord kwam niet terug/i)).toBeTruthy()
    expect(privacyModeCalls()).toEqual([])
  })

  it('de proefvragen staan er vóór je hem draait', async () => {
    mocks.getLocalModelState.mockResolvedValue({ state: 'klaar', bytes: 2.0e9 })
    render(<AiExecutionSettings />)
    expect(await screen.findByText(/één woord exact teruggeven/i)).toBeTruthy()
    expect(screen.getByText(/een hele zin foutloos teruggeven/i)).toBeTruthy()
  })

  it('verwijderen: deleteLocalModel + POST false', async () => {
    profileRow = { ai_enabled: true, privacy_mode: true, active_subscriptions: ['ai'] }
    mocks.getLocalModelState.mockResolvedValue({ state: 'klaar', bytes: 2.0e9 })
    mocks.deleteLocalModel.mockResolvedValue(undefined)

    render(<AiExecutionSettings />)
    // Beheer-blok is meteen zichtbaar (model klaar).
    const deleteBtn = await screen.findByRole('button', { name: /^Model verwijderen$/i })
    fireEvent.click(deleteBtn)

    // Bevestigingsvraag.
    const confirmBtn = await screen.findByRole('button', { name: /Ja, verwijder het model/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => expect(mocks.deleteLocalModel).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/privacy-mode',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ enabled: false }) }),
      ),
    )
  })

  it('AI uit: de keuze is niet bedienbaar', async () => {
    profileRow = { ai_enabled: false, privacy_mode: false, active_subscriptions: ['ai'] }
    mocks.getLocalModelState.mockResolvedValue({ state: 'niet-gedownload', bytes: null })

    render(<AiExecutionSettings />)
    const toggle = await screen.findByRole('switch', { name: /Lokaal waar mogelijk/i })
    await waitFor(() => expect(toggle).toBeDisabled())
    expect(screen.getByText(/Schakel eerst/i)).toBeTruthy()
  })

  it('zonder AI-tier: keuze disabled + canonieke AiSubscriptionUpsell met aria-koppeling', async () => {
    profileRow = { ai_enabled: true, privacy_mode: false, active_subscriptions: [] }
    mocks.getLocalModelState.mockResolvedValue({ state: 'niet-gedownload', bytes: null })

    render(<AiExecutionSettings />)
    const toggle = await screen.findByRole('switch', { name: /Lokaal waar mogelijk/i })
    // AANzetten vereist het 'ai'-abonnement → schakelaar uitgegrijsd.
    await waitFor(() => expect(toggle).toBeDisabled())
    // De gedeelde upsell (inline-variant) is zichtbaar met CTA naar het abonnement.
    const cta = screen.getByRole('link', { name: /Bekijk AI-abonnement/i })
    expect(cta.getAttribute('href')).toBe('/mijn/account')
    // A11Y: de disabled-reden hangt via aria-describedby aan de schakelaar.
    expect(toggle.getAttribute('aria-describedby')).toBe('lokale-cat-reden-tier')
  })

  it('zonder AI-tier maar lokaal al aan: uitzetten blijft mogelijk (niet disabled)', async () => {
    profileRow = { ai_enabled: true, privacy_mode: true, active_subscriptions: [] }
    mocks.getLocalModelState.mockResolvedValue({ state: 'klaar', bytes: 2.0e9 })

    render(<AiExecutionSettings />)
    const toggle = await screen.findByRole('switch', { name: /Lokaal waar mogelijk/i })
    // Wacht tot de mount-load de opgeslagen 'aan'-stand heeft toegepast.
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'))
    // Niemand blijft opgesloten: uitzetten mag zonder tier.
    expect(toggle).not.toBeDisabled()
    // Geen upsell-blok (lokaal staat immers al aan) → geen aria-describedby.
    expect(toggle.getAttribute('aria-describedby')).toBeNull()
  })

  it('verlopen abonnement met lokaal aan: eerlijke verlopen-notice in het beheer-blok', async () => {
    profileRow = { ai_enabled: true, privacy_mode: true, active_subscriptions: [] }
    mocks.getLocalModelState.mockResolvedValue({ state: 'klaar', bytes: 2.0e9 })

    render(<AiExecutionSettings />)
    // Beheer-blok verschijnt (model klaar); de subtiele verlopen-melding staat erin.
    await screen.findByText(/Je AI-abonnement is verlopen/i)
  })

  it('opslagbescherming actief: beheer-blok meldt dat het model bewaard blijft', async () => {
    profileRow = { ai_enabled: true, privacy_mode: true, active_subscriptions: ['ai'] }
    mocks.getLocalModelState.mockResolvedValue({ state: 'klaar', bytes: 2.0e9 })
    setStorageManager(true)

    render(<AiExecutionSettings />)
    await screen.findByText(/Model staat klaar op dit toestel/i)
    expect(await screen.findByText(/het model blijft bewaard/i)).toBeTruthy()
  })

  it('opslag niet beschermd: beheer-blok toont de eviction-waarschuwing', async () => {
    profileRow = { ai_enabled: true, privacy_mode: true, active_subscriptions: ['ai'] }
    mocks.getLocalModelState.mockResolvedValue({ state: 'klaar', bytes: 2.0e9 })
    setStorageManager(false)

    render(<AiExecutionSettings />)
    await screen.findByText(/Model staat klaar op dit toestel/i)
    expect(await screen.findByText(/Bij ruimtegebrek kan het model verwijderd worden/i)).toBeTruthy()
  })

  it('opslagbescherming onbekend (geen persisted-API): geen extra regel', async () => {
    profileRow = { ai_enabled: true, privacy_mode: true, active_subscriptions: ['ai'] }
    mocks.getLocalModelState.mockResolvedValue({ state: 'klaar', bytes: 2.0e9 })
    setStorageManager(null)

    render(<AiExecutionSettings />)
    await screen.findByText(/Model staat klaar op dit toestel/i)
    expect(screen.queryByText(/het model blijft bewaard/i)).toBeNull()
    expect(screen.queryByText(/Bij ruimtegebrek kan het model verwijderd worden/i)).toBeNull()
  })
})
