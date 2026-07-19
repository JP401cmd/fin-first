import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LocalCategorizationSettings } from './local-categorization-settings'

/**
 * Tests voor de kernflows van de lokale-categorisatie-toggle (ADR 0043, fase 2):
 *  1. capability-fail → toggle blijft uit + de reasons (NL) zijn zichtbaar,
 *     geen download.
 *  2. happy path → capability ok → consent → download-progress → POST true.
 *  3. verwijderen → deleteLocalModel + POST false.
 *  4. tier-gate (eigenaarsbesluit, requirements §5 optie 2): zonder 'ai'-abonnement
 *     is aanzetten geblokkeerd + de gedeelde AiSubscriptionUpsell is zichtbaar en
 *     via aria-describedby aan de toggle gekoppeld; met privé-modus al aan blijft
 *     uitzetten mogelijk (niemand opgesloten) en meldt het beheer-blok eerlijk dat
 *     het abonnement verlopen is.
 *
 * De lib/ai/local-primitieven (parallel gebouwd tegen het gedeelde contract)
 * worden gemockt; POST /api/privacy-mode wordt via een fetch-mock afgevangen.
 */

const mocks = vi.hoisted(() => ({
  checkLocalAiCapability: vi.fn(),
  getLocalModelState: vi.fn(),
  downloadLocalModel: vi.fn(),
  deleteLocalModel: vi.fn(),
}))

vi.mock('@/lib/ai/local/webgpu-capability', () => ({
  checkLocalAiCapability: mocks.checkLocalAiCapability,
}))
vi.mock('@/lib/ai/local/model-manager', () => ({
  getLocalModelState: mocks.getLocalModelState,
  downloadLocalModel: mocks.downloadLocalModel,
  deleteLocalModel: mocks.deleteLocalModel,
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
  profileRow = { ai_enabled: true, privacy_mode: false, active_subscriptions: ['ai'] }
  fetchMock = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchMock)
  // Schone navigator per test: geen storage-manager tenzij een test 'm zet.
  Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'storage')
})

describe('LocalCategorizationSettings', () => {
  it('toont kop + experimenteel-badge', async () => {
    mocks.getLocalModelState.mockResolvedValue({ state: 'niet-gedownload', bytes: null })
    render(<LocalCategorizationSettings />)
    expect(await screen.findByText('Categoriseer transacties lokaal')).toBeTruthy()
    expect(screen.getByText('Experimenteel')).toBeTruthy()
  })

  it('capability-fail: toggle blijft uit en toont de reasons, geen download', async () => {
    mocks.getLocalModelState.mockResolvedValue({ state: 'niet-gedownload', bytes: null })
    mocks.checkLocalAiCapability.mockResolvedValue({
      ok: false,
      reasons: ['Geen WebGPU-ondersteuning gevonden in deze browser'],
    })

    render(<LocalCategorizationSettings />)
    const toggle = await screen.findByRole('switch', { name: /Lokale transactiecategorisatie/i })
    expect(toggle.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(toggle)

    await screen.findByText(/Geen WebGPU-ondersteuning gevonden/i)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(mocks.downloadLocalModel).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('happy path: capability ok → consent → download → POST true', async () => {
    mocks.getLocalModelState.mockResolvedValue({ state: 'niet-gedownload', bytes: null })
    mocks.checkLocalAiCapability.mockResolvedValue({ ok: true, reasons: [] })
    mocks.downloadLocalModel.mockImplementation(async (onProgress?: (p: unknown) => void) => {
      onProgress?.({ loadedBytes: 3.2e9, totalBytes: 3.2e9 })
    })

    render(<LocalCategorizationSettings />)
    const toggle = await screen.findByRole('switch', { name: /Lokale transactiecategorisatie/i })

    fireEvent.click(toggle)

    // Consent-stap verschijnt.
    const downloadBtn = await screen.findByRole('button', { name: /Download & zet aan/i })
    // Specifiek de kop (de bullet bevat óók "eenmalige download") → geen ambigue match.
    expect(screen.getByRole('heading', { name: /Eenmalige download/i })).toBeTruthy()

    fireEvent.click(downloadBtn)

    await waitFor(() => expect(mocks.downloadLocalModel).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/privacy-mode',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ enabled: true }) }),
      ),
    )
    // Model staat nu klaar → beheer-blok verschijnt.
    await screen.findByText(/Model staat klaar op dit toestel/i)
  })

  it('verwijderen: deleteLocalModel + POST false', async () => {
    profileRow = { ai_enabled: true, privacy_mode: true, active_subscriptions: ['ai'] }
    mocks.getLocalModelState.mockResolvedValue({ state: 'klaar', bytes: 3.2e9 })
    mocks.deleteLocalModel.mockResolvedValue(undefined)

    render(<LocalCategorizationSettings />)
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

  it('AI uit: toggle is niet bedienbaar', async () => {
    profileRow = { ai_enabled: false, privacy_mode: false, active_subscriptions: ['ai'] }
    mocks.getLocalModelState.mockResolvedValue({ state: 'niet-gedownload', bytes: null })

    render(<LocalCategorizationSettings />)
    const toggle = await screen.findByRole('switch', { name: /Lokale transactiecategorisatie/i })
    await waitFor(() => expect(toggle).toBeDisabled())
    expect(screen.getByText(/Schakel eerst/i)).toBeTruthy()
  })

  it('zonder AI-tier: toggle disabled + canonieke AiSubscriptionUpsell met aria-koppeling', async () => {
    profileRow = { ai_enabled: true, privacy_mode: false, active_subscriptions: [] }
    mocks.getLocalModelState.mockResolvedValue({ state: 'niet-gedownload', bytes: null })

    render(<LocalCategorizationSettings />)
    const toggle = await screen.findByRole('switch', { name: /Lokale transactiecategorisatie/i })
    // AANzetten vereist het 'ai'-abonnement → toggle uitgegrijsd.
    await waitFor(() => expect(toggle).toBeDisabled())
    // De gedeelde upsell (inline-variant) is zichtbaar met CTA naar het abonnement.
    const cta = screen.getByRole('link', { name: /Bekijk AI-abonnement/i })
    expect(cta.getAttribute('href')).toBe('/mijn/account')
    // A11Y: de disabled-reden hangt via aria-describedby aan de toggle.
    expect(toggle.getAttribute('aria-describedby')).toBe('lokale-cat-reden-tier')
  })

  it('zonder AI-tier maar privé-modus al aan: uitzetten blijft mogelijk (toggle niet disabled)', async () => {
    profileRow = { ai_enabled: true, privacy_mode: true, active_subscriptions: [] }
    mocks.getLocalModelState.mockResolvedValue({ state: 'klaar', bytes: 3.2e9 })

    render(<LocalCategorizationSettings />)
    const toggle = await screen.findByRole('switch', { name: /Lokale transactiecategorisatie/i })
    // Wacht tot de mount-load de opgeslagen 'aan'-stand heeft toegepast.
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'))
    // Niemand blijft opgesloten in privé-modus: uitzetten mag zonder tier.
    expect(toggle).not.toBeDisabled()
    // Geen upsell-blok (privé-modus staat immers al aan) → geen aria-describedby.
    expect(toggle.getAttribute('aria-describedby')).toBeNull()
  })

  it('verlopen abonnement met privé-modus aan: eerlijke verlopen-notice in het beheer-blok', async () => {
    profileRow = { ai_enabled: true, privacy_mode: true, active_subscriptions: [] }
    mocks.getLocalModelState.mockResolvedValue({ state: 'klaar', bytes: 3.2e9 })

    render(<LocalCategorizationSettings />)
    // Beheer-blok verschijnt (model klaar); de subtiele verlopen-melding staat erin.
    await screen.findByText(/Je AI-abonnement is verlopen/i)
  })

  it('opslagbescherming actief: beheer-blok meldt dat het model bewaard blijft', async () => {
    profileRow = { ai_enabled: true, privacy_mode: true, active_subscriptions: ['ai'] }
    mocks.getLocalModelState.mockResolvedValue({ state: 'klaar', bytes: 3.2e9 })
    setStorageManager(true)

    render(<LocalCategorizationSettings />)
    await screen.findByText(/Model staat klaar op dit toestel/i)
    expect(await screen.findByText(/het model blijft bewaard/i)).toBeTruthy()
  })

  it('opslag niet beschermd: beheer-blok toont de eviction-waarschuwing', async () => {
    profileRow = { ai_enabled: true, privacy_mode: true, active_subscriptions: ['ai'] }
    mocks.getLocalModelState.mockResolvedValue({ state: 'klaar', bytes: 3.2e9 })
    setStorageManager(false)

    render(<LocalCategorizationSettings />)
    await screen.findByText(/Model staat klaar op dit toestel/i)
    expect(await screen.findByText(/Bij ruimtegebrek kan het model verwijderd worden/i)).toBeTruthy()
  })

  it('opslagbescherming onbekend (geen persisted-API): geen extra regel', async () => {
    profileRow = { ai_enabled: true, privacy_mode: true, active_subscriptions: ['ai'] }
    mocks.getLocalModelState.mockResolvedValue({ state: 'klaar', bytes: 3.2e9 })
    setStorageManager(null)

    render(<LocalCategorizationSettings />)
    await screen.findByText(/Model staat klaar op dit toestel/i)
    expect(screen.queryByText(/het model blijft bewaard/i)).toBeNull()
    expect(screen.queryByText(/Bij ruimtegebrek kan het model verwijderd worden/i)).toBeNull()
  })
})
