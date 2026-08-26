import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
  useExecutionMode,
  LOCAL_SUBSCRIPTION_REVOKED_MESSAGE,
  AI_DISABLED_MESSAGE,
} from './use-execution-mode'
import { checkLocalAiCapability } from './webgpu-capability'
import { getLocalModelState } from './model-manager'

/**
 * Tests voor het REVOCATIE-GAT op het lokale pad.
 *
 * De zuiver lokale paden (pensioen-PDF, aangifte-PDF, rekenhulp, vaste lasten,
 * categorisatie) doen tijdens het genereren nul server-calls: het model draait
 * on-device. Er is dus geen route waar een tier-gate alsnog aanslaat. Wie ooit
 * met geldig abonnement een groep op 'lokaal' zette, bleef daarna onbeperkt
 * genereren — ook lang nadat het abonnement was verlopen.
 *
 * Deze hook is nu de plek waar dat stopt. De twee eisen zitten in dezelfde
 * suite, want ze horen bij elkaar:
 *   1. een verlopen abonnement STOPT het lokale genereren ('blocked'),
 *   2. en sluit niemand op: er wordt niet stil naar de cloud uitgeweken, en de
 *      keuze terugzetten blijft vrij (dat laatste wordt op de route bewezen —
 *      zie app/api/ai-execution-prefs/route.test.ts).
 */

vi.mock('./webgpu-capability', () => ({ checkLocalAiCapability: vi.fn() }))
vi.mock('./model-manager', () => ({ getLocalModelState: vi.fn() }))

const mockedCapability = vi.mocked(checkLocalAiCapability)
const mockedModelState = vi.mocked(getLocalModelState)

/** Antwoord van GET /api/ai-execution-prefs, met de velden die de hook leest. */
function prefsResponse(body: Record<string, unknown>) {
  return {
    ok: true,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  mockedCapability.mockResolvedValue({ ok: true, reasons: [] } as never)
  mockedModelState.mockResolvedValue({ state: 'klaar' } as never)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useExecutionMode — abonnement op het lokale pad', () => {
  it('VERLOPEN abonnement + groep op lokaal → blocked, en er mag niets draaien', async () => {
    fetchMock.mockResolvedValue(
      prefsResponse({ modes: { documenten: 'lokaal' }, hasAiSubscription: false, aiEnabled: true }),
    )

    const { result } = renderHook(() => useExecutionMode('documenten'))

    await waitFor(() => expect(result.current.status).toBe('blocked'))
    // Niet lokaal genereren...
    expect(result.current.canUseLocal).toBe(false)
    // ...en ook geen stille uitwijk naar de cloud: die keuze is niet aan ons.
    expect(result.current.canUseCloud).toBe(false)
    // De melding benoemt allebei de helften: het stopt, en je zit nergens aan vast.
    expect(result.current.message).toBe(LOCAL_SUBSCRIPTION_REVOKED_MESSAGE)
    expect(result.current.message).toMatch(/terugzetten op cloud-AI/)
  })

  it('de abonnementscheck gaat VÓÓR de GPU-/modelcontrole', async () => {
    fetchMock.mockResolvedValue(
      prefsResponse({ modes: { documenten: 'lokaal' }, hasAiSubscription: false, aiEnabled: true }),
    )

    const { result } = renderHook(() => useExecutionMode('documenten'))
    await waitFor(() => expect(result.current.status).toBe('blocked'))

    // "Je abonnement is verlopen" is de fundamentelere reden; een GPU-probe die
    // tot niets kan leiden slaan we over.
    expect(mockedCapability).not.toHaveBeenCalled()
    expect(mockedModelState).not.toHaveBeenCalled()
  })

  it('GELDIG abonnement + groep op lokaal → gewoon lokaal', async () => {
    fetchMock.mockResolvedValue(
      prefsResponse({ modes: { documenten: 'lokaal' }, hasAiSubscription: true, aiEnabled: true }),
    )

    const { result } = renderHook(() => useExecutionMode('documenten'))

    await waitFor(() => expect(result.current.status).toBe('lokaal'))
    expect(result.current.canUseLocal).toBe(true)
  })

  it('verlopen abonnement maar groep op CLOUD → de hook blokkeert het terugzetten niet', async () => {
    fetchMock.mockResolvedValue(
      prefsResponse({ modes: { documenten: 'cloud' }, hasAiSubscription: false, aiEnabled: true }),
    )

    const { result } = renderHook(() => useExecutionMode('documenten'))

    // Wie zijn keuze terugzet naar cloud, komt hier gewoon door — de
    // cloudroutes hebben hun eigen tier-gate. De hook is niet de plek om iemand
    // extra op te sluiten.
    await waitFor(() => expect(result.current.status).toBe('cloud'))
    expect(result.current.canUseCloud).toBe(true)
  })

  it('antwoord ZONDER hasAiSubscription telt als onbekend → resolving, niets draait', async () => {
    fetchMock.mockResolvedValue(
      prefsResponse({ modes: { documenten: 'lokaal' }, aiEnabled: true }),
    )

    const { result } = renderHook(() => useExecutionMode('documenten'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    // Een half antwoord is geen antwoord: fail-closed, zoals bij een
    // onleesbare voorkeur.
    expect(result.current.status).toBe('resolving')
    expect(result.current.canUseLocal).toBe(false)
    expect(result.current.canUseCloud).toBe(false)
  })

  it('inactief oppervlak doet geen enkele lezing', async () => {
    const { result } = renderHook(() => useExecutionMode('documenten', false))

    expect(result.current.status).toBe('resolving')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

/**
 * De KILL-SWITCH (`profiles.ai_enabled`, de knop "AI uit" op /mijn/privacy).
 *
 * Op de zuiver lokale paden is er tijdens het genereren geen route meer die kan
 * handhaven — daar is de prefs-GET de laatste server-uitspraak, en die zweeg
 * erover, dus "AI uit" genereerde on-device gewoon door.
 *
 * Op het cloudpad handhaaft `assertCloudAllowed` 'm sinds M26 server-side; deze
 * hook is daar de spiegel van, zodat een oppervlak al vóór het typen blokkeert
 * in plaats van pas ná het versturen (zie de tweede describe hieronder).
 */
describe('useExecutionMode — kill-switch op het lokale pad', () => {
  it('AI UIT + groep op lokaal → blocked, er draait niets on-device', async () => {
    fetchMock.mockResolvedValue(
      prefsResponse({ modes: { documenten: 'lokaal' }, hasAiSubscription: true, aiEnabled: false }),
    )

    const { result } = renderHook(() => useExecutionMode('documenten'))

    await waitFor(() => expect(result.current.status).toBe('blocked'))
    expect(result.current.canUseLocal).toBe(false)
    // Ook geen stille uitwijk naar de cloud: AI uit is AI uit.
    expect(result.current.canUseCloud).toBe(false)
    expect(result.current.message).toBe(AI_DISABLED_MESSAGE)
  })

  it('de kill-switch gaat VÓÓR de GPU-/modelcontrole', async () => {
    fetchMock.mockResolvedValue(
      prefsResponse({ modes: { documenten: 'lokaal' }, hasAiSubscription: true, aiEnabled: false }),
    )

    const { result } = renderHook(() => useExecutionMode('documenten'))
    await waitFor(() => expect(result.current.status).toBe('blocked'))

    expect(mockedCapability).not.toHaveBeenCalled()
    expect(mockedModelState).not.toHaveBeenCalled()
  })

  it('AI uit meldt de EIGEN KEUZE, niet een verlopen abonnement', async () => {
    // Beide zijn 'blocked', maar de reden verschilt en dus ook de weg terug.
    fetchMock.mockResolvedValue(
      prefsResponse({ modes: { documenten: 'lokaal' }, hasAiSubscription: false, aiEnabled: false }),
    )

    const { result } = renderHook(() => useExecutionMode('documenten'))
    await waitFor(() => expect(result.current.status).toBe('blocked'))

    expect(result.current.message).toBe(AI_DISABLED_MESSAGE)
    expect(result.current.message).not.toBe(LOCAL_SUBSCRIPTION_REVOKED_MESSAGE)
  })

  it('antwoord ZONDER aiEnabled telt als onbekend → resolving, niets draait', async () => {
    // Fail-closed, net als bij een ontbrekende hasAiSubscription: een oude
    // server-versie mag de kill-switch niet stilzwijgend teruggeven.
    fetchMock.mockResolvedValue(
      prefsResponse({ modes: { documenten: 'lokaal' }, hasAiSubscription: true }),
    )

    const { result } = renderHook(() => useExecutionMode('documenten'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(result.current.status).toBe('resolving')
    expect(result.current.canUseLocal).toBe(false)
    expect(result.current.canUseCloud).toBe(false)
  })
})

/**
 * M26 — DE KILL-SWITCH OP HET CLOUDPAD.
 *
 * Het gemelde symptoom (de Fin-chat liet typen en versturen terwijl de app al
 * wist dat AI uit stond) was de zichtbare rand van een groter gat: de `mode ===
 * 'cloud'`-tak gaf meteen `canUseCloud: true` terug, zónder `aiEnabled` te
 * lezen. Voor de default-modus — vrijwel elk account — werd "AI uit" dus
 * nergens afgedwongen: het bericht vertrok en werd door de echte cloud-AI
 * beantwoord.
 *
 * Deze suite bewaakt de volgorde in de hook: kill-switch VÓÓR de modus-tak.
 */
describe('useExecutionMode — kill-switch op het CLOUDpad (M26)', () => {
  it('AI UIT + groep op cloud → blocked; er vertrekt niets naar de cloud-AI', async () => {
    fetchMock.mockResolvedValue(
      prefsResponse({ modes: { gesprek: 'cloud' }, hasAiSubscription: true, aiEnabled: false }),
    )

    const { result } = renderHook(() => useExecutionMode('gesprek'))

    await waitFor(() => expect(result.current.status).toBe('blocked'))
    // De regressie in één regel: dit was `true` en daarmee een bruikbaar
    // invoerveld plus een echt AI-antwoord ondanks "AI uit".
    expect(result.current.canUseCloud).toBe(false)
    expect(result.current.canUseLocal).toBe(false)
    expect(result.current.message).toBe(AI_DISABLED_MESSAGE)
    expect(result.current.reason).toBe('ai_uit')
  })

  it('de melding noemt beide bestemmingen — niet alleen het eigen toestel', async () => {
    fetchMock.mockResolvedValue(
      prefsResponse({ modes: { gesprek: 'cloud' }, hasAiSubscription: true, aiEnabled: false }),
    )

    const { result } = renderHook(() => useExecutionMode('gesprek'))
    await waitFor(() => expect(result.current.status).toBe('blocked'))

    expect(result.current.message).toMatch(/niet in de cloud/)
    expect(result.current.message).toMatch(/eigen toestel/)
    // De bestemming die de gebruiker had staan blijft leesbaar voor UI-tekst.
    expect(result.current.intended).toBe('cloud')
  })

  it('AI AAN + groep op cloud → gewoon cloud, ongewijzigd gedrag', async () => {
    fetchMock.mockResolvedValue(
      prefsResponse({ modes: { gesprek: 'cloud' }, hasAiSubscription: true, aiEnabled: true }),
    )

    const { result } = renderHook(() => useExecutionMode('gesprek'))

    await waitFor(() => expect(result.current.status).toBe('cloud'))
    expect(result.current.canUseCloud).toBe(true)
    expect(result.current.reason).toBeUndefined()
    // De cloud-tak doet nog steeds geen GPU-/modelprobe.
    expect(mockedCapability).not.toHaveBeenCalled()
    expect(mockedModelState).not.toHaveBeenCalled()
  })
})
