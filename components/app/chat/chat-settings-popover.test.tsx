import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ChatSettingsPopover } from './chat-settings-popover'
import type { AiExecutionGroup, AiExecutionMode } from '@/lib/ai/execution-groups'

/**
 * De compacte instellingen in het chatvenster. Drie dingen moeten hier hard
 * staan: de keuzes lopen door dezelfde API als het volledige scherm, er kan
 * vanuit deze popover NOOIT een modeldownload van gigabytes beginnen, en de
 * inhoud volgt de keuze van dit gesprek — cloud toont het centrale cloud-model,
 * lokaal toont het lokale bedieningspaneel.
 */

const mocks = vi.hoisted(() => ({
  selectLocalModel: vi.fn(),
  isModelCached: vi.fn(),
}))

vi.mock('@/lib/ai/local/model-manager', () => ({
  selectLocalModel: mocks.selectLocalModel,
}))
vi.mock('@/lib/ai/local/litert-runtime', () => ({
  isModelCached: mocks.isModelCached,
}))

const ALL_CLOUD: Record<AiExecutionGroup, AiExecutionMode> = {
  gesprek: 'cloud',
  transacties: 'cloud',
  briefing: 'cloud',
  tips: 'cloud',
  rapporten: 'cloud',
  documenten: 'cloud',
  nieuws: 'cloud',
}

/** Zelfde stand, maar het gesprek zelf draait lokaal — het lokale paneel toont. */
const GESPREK_LOKAAL: Record<AiExecutionGroup, AiExecutionMode> = {
  ...ALL_CLOUD,
  gesprek: 'lokaal',
}

const GATE_OPEN = { modelId: 'gemma-4-e2b', minPassed: 3, timeoutMs: 45000, allowUserModelChoice: true }
const CLOUD_MODEL = { provider: 'anthropic', label: 'Anthropic', modelId: 'claude-sonnet-4-5-20250929' }

let fetchMock: ReturnType<typeof vi.fn>

/** Alleen het E2B-model staat op dit toestel; E4B niet. */
function setCachedModels(ids: string[]): void {
  mocks.isModelCached.mockImplementation(async (url?: string) =>
    ids.some((id) => (url ?? '').toLowerCase().includes(id)),
  )
}

/** Beide leesroutes mocken; per test aan te passen via de opties. */
function mockApis({
  modes = ALL_CLOUD,
  gate = GATE_OPEN,
  cloudModel = CLOUD_MODEL,
}: {
  modes?: Record<AiExecutionGroup, AiExecutionMode>
  gate?: typeof GATE_OPEN
  cloudModel?: typeof CLOUD_MODEL
} = {}): void {
  fetchMock.mockImplementation(async (url: unknown) => {
    if (typeof url === 'string' && url.startsWith('/api/local-ai-gate')) {
      return { ok: true, json: async () => ({ config: gate, cloudModel }) }
    }
    return { ok: true, json: async () => ({ modes, prefs: {} }) }
  })
}

beforeEach(() => {
  localStorage.clear()
  mocks.selectLocalModel.mockReset().mockResolvedValue(undefined)
  mocks.isModelCached.mockReset()
  setCachedModels(['e2b'])
  fetchMock = vi.fn()
  mockApis()
  vi.stubGlobal('fetch', fetchMock)
})

/** Open de popover en wacht tot de inhoud geladen is. */
async function open(): Promise<void> {
  render(<ChatSettingsPopover />)
  fireEvent.click(screen.getByRole('button', { name: /Instellingen voor dit gesprek/i }))
  await screen.findByRole('dialog', { name: /Instellingen voor dit gesprek/i })
}

describe('ChatSettingsPopover', () => {
  it('staat dicht tot je hem opent', () => {
    render(<ChatSettingsPopover />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: /Instellingen voor dit gesprek/i })).toBeTruthy()
  })

  // DE KERN VAN DE SPLITSING. Draait dit gesprek in de cloud, dan is een lijst
  // lokale modellen misleidend: je ziet het model dat beheer voor iedereen
  // instelde, en het lokale bedieningspaneel blijft weg.
  it('bij cloud: het centrale cloud-model, geen lokale modellen of functie-keuzes', async () => {
    await open()
    await screen.findByText('Cloud-model')
    expect(screen.getByText('claude-sonnet-4-5-20250929')).toBeTruthy()
    expect(screen.getByText(/ingesteld door beheer/i)).toBeTruthy()
    expect(screen.queryByText('Lokaal model')).toBeNull()
    expect(screen.queryByText('Overige functies')).toBeNull()
  })

  it('bij lokaal: het lokale model en de overige functies, geen cloud-model', async () => {
    mockApis({ modes: GESPREK_LOKAAL })
    await open()
    await screen.findByText('Lokaal model')
    expect(screen.getByText('Overige functies')).toBeTruthy()
    // De chatgroep zelf staat bovenaan en niet nóg eens in de lijst eronder.
    expect(screen.queryByText('Gesprek met Fin')).toBeNull()
    expect(screen.getByText('Transacties & vaste lasten')).toBeTruthy()
    expect(screen.queryByText('Cloud-model')).toBeNull()
  })

  it('een keuze loopt via dezelfde API als het volledige scherm', async () => {
    await open()
    const lokaalKnoppen = await screen.findAllByRole('button', { name: 'Lokaal' })
    fireEvent.click(lokaalKnoppen[0])

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/ai-execution-prefs',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ group: 'gesprek', mode: 'lokaal' }),
        }),
      ),
    )
  })

  // DE VEILIGHEIDSREGEL. Een model van 2 à 3 GB binnenhalen hoort bij de
  // consent-stap, de voortgangsbalk en de uitvoer-toets op /mijn/privacy — niet
  // bij een klik in een popover.
  it('een model dat hier niet staat is zichtbaar maar niet kiesbaar', async () => {
    mockApis({ modes: GESPREK_LOKAAL })
    await open()
    await screen.findByText(/staat klaar/i)

    const nietGedownload = screen.getByText(/nog niet gedownload/i)
    const knop = nietGedownload.closest('button') as HTMLButtonElement
    expect(knop.disabled).toBe(true)

    fireEvent.click(knop)
    expect(mocks.selectLocalModel, 'nooit stil van model wisselen zonder bundel').not.toHaveBeenCalled()
  })

  it('wisselen naar een model dat er wél staat, wisselt echt', async () => {
    setCachedModels(['e2b', 'e4b'])
    mockApis({ modes: GESPREK_LOKAAL })
    await open()
    await waitFor(() => expect(screen.getAllByText(/staat klaar/i)).toHaveLength(2))

    const e4b = screen.getByText('Gemma 4 E4B').closest('button') as HTMLButtonElement
    fireEvent.click(e4b)

    await waitFor(() => expect(mocks.selectLocalModel).toHaveBeenCalledWith('gemma-4-e4b'))
  })

  it('zet beheer de modelkeuze dicht, dan staat er geen modelblok', async () => {
    mockApis({ modes: GESPREK_LOKAAL, gate: { ...GATE_OPEN, allowUserModelChoice: false } })

    await open()
    await screen.findByText('Overige functies')
    expect(screen.queryByText('Lokaal model')).toBeNull()
  })

  // Zonder dit sein blijft de chat op zijn OUDE bestemming staan tot hij opnieuw
  // opent. Juist na "ik zet dit gesprek op lokaal" is dat het gevaarlijke moment:
  // de volgende vraag zou dan alsnog naar de cloud kunnen.
  it('meldt een wijziging terug zodat de chat zijn bestemming opnieuw bepaalt', async () => {
    const onChanged = vi.fn()
    render(<ChatSettingsPopover onChanged={onChanged} />)
    fireEvent.click(screen.getByRole('button', { name: /Instellingen voor dit gesprek/i }))
    await screen.findByRole('dialog', { name: /Instellingen voor dit gesprek/i })

    fireEvent.click((await screen.findAllByRole('button', { name: 'Lokaal' }))[0])

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  })

  it('Escape sluit de popover', async () => {
    await open()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
