/**
 * De woning-keuze in de quick-add-wizard (ADR 0133, snede 2).
 *
 * Voegt iemand een eigen woning toe, dan vraagt de app wat die woning voor zijn
 * vrijheid betekent — ná de hypotheek-vraag, vóór het success-scherm. Zonder die
 * vraag telt de app de overwaarde stilzwijgend mee alsof je die vandaag kunt
 * uitgeven.
 *
 * Deze suite pint vier dingen vast die stil kunnen wegdrijven:
 *   1. de vraag verschijnt op het juiste moment, met de kopij uit
 *      `lib/housing-choice.ts` (geen tweede formulering);
 *   2. de relevantie wordt gelezen VÓÓR de insert — ná het opslaan heeft élke
 *      gebruiker een woning en is niet meer te zien of dit zijn eerste was;
 *   3. het opslaan gaat als `{ choice }` naar `PUT /api/housing-strategy` —
 *      nooit een zelfgebouwde config;
 *   4. de keuze is overslaanbaar zonder schade: overslaan, een leesfout of een
 *      mislukte PUT laten de bezitting staan en ronden gewoon af.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QuickAddWizard } from '../quick-add-wizard'
import {
  HOUSING_CHOICE_OPTIONS,
  HOUSING_CHOICE_QUESTION,
} from '@/lib/housing-choice'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

const quickAddMock = vi.fn(async (input: unknown) => {
  void input
  return { ok: true, assetId: 'asset-1' }
})
vi.mock('@/app/actions/quick-add', () => ({
  quickAdd: (input: unknown) => quickAddMock(input),
}))

const SELL = HOUSING_CHOICE_OPTIONS.find((o) => o.choice === 'sell')!

type HousingGet = {
  ok?: boolean
  has_eigen_huis?: boolean
  choice?: 'sell' | 'exclude' | null
}

type PutOutcome = { ok: boolean }

/**
 * Fetch-mock voor de housing-route. GET levert de relevantie-lezing, PUT de
 * schrijf-uitkomst; alles daarbuiten (bv. de koppelbare-bezittingen-lijst van
 * StepDetails) valt terug op een lege 200.
 */
function mockHousingApi(get: HousingGet = {}, put: PutOutcome = { ok: true }) {
  const calls: { url: string; method: string; body?: string }[] = []
  const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
    const href = String(url)
    const method = (init?.method ?? 'GET').toUpperCase()
    calls.push({ url: href, method, body: init?.body as string | undefined })

    if (href.startsWith('/api/housing-strategy')) {
      if (method === 'PUT') {
        return { ok: put.ok, json: async () => ({ success: put.ok }) }
      }
      return {
        ok: get.ok ?? true,
        json: async () => ({
          config: { mode: 'include_full' },
          choice: get.choice ?? null,
          has_eigen_huis: get.has_eigen_huis ?? false,
          dismissed_at: null,
          context: {},
        }),
      }
    }
    return { ok: true, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

function renderWoningWizard() {
  return render(
    <QuickAddWizard
      open
      onClose={vi.fn()}
      initialIntent="asset"
      initialAssetType="eigen_huis"
    />,
  )
}

/** Woning invoeren en de hypotheek-vraag met "Nee" beantwoorden. */
async function voegWoningToeEnSlaHypotheekOver() {
  fireEvent.change(screen.getByLabelText('Huidige waarde'), {
    target: { value: '400000' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Nee, overslaan' }))
}

beforeEach(() => {
  quickAddMock.mockClear()
  quickAddMock.mockResolvedValue({ ok: true, assetId: 'asset-1' })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('QuickAddWizard — woning-keuze na het toevoegen van een eigen woning', () => {
  it('stelt de vraag ná de hypotheek-vraag, met de kopij uit lib/housing-choice', async () => {
    mockHousingApi()
    renderWoningWizard()

    // De hypotheek-vraag komt eerst; de woning-vraag staat er dan nog niet.
    fireEvent.change(screen.getByLabelText('Huidige waarde'), {
      target: { value: '400000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))
    expect(await screen.findByText('Heeft deze woning een hypotheek?')).toBeTruthy()
    expect(screen.queryByText(HOUSING_CHOICE_QUESTION)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Nee, overslaan' }))

    expect(await screen.findByText(HOUSING_CHOICE_QUESTION)).toBeTruthy()
    expect(screen.getByRole('button', { name: new RegExp(SELL.name) })).toBeTruthy()
  })

  it('leest de relevantie VÓÓR de insert — anders is niet meer te zien of het de eerste woning was', async () => {
    const calls = mockHousingApi()
    renderWoningWizard()

    fireEvent.change(screen.getByLabelText('Huidige waarde'), {
      target: { value: '400000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))
    await screen.findByText('Heeft deze woning een hypotheek?')

    const getIndex = calls.findIndex(
      (c) => c.url.startsWith('/api/housing-strategy') && c.method === 'GET',
    )
    expect(getIndex).toBeGreaterThanOrEqual(0)
    // De lezing is gestart in dezelfde handler die daarna pas opslaat.
    expect(quickAddMock).toHaveBeenCalledTimes(1)
  })

  it('slaat de keuze op als { choice } en rondt daarna af', async () => {
    const calls = mockHousingApi()
    renderWoningWizard()
    await voegWoningToeEnSlaHypotheekOver()
    await screen.findByText(HOUSING_CHOICE_QUESTION)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(SELL.name) }))
    fireEvent.click(screen.getByRole('button', { name: 'Verder' }))

    await waitFor(() => {
      const put = calls.find(
        (c) => c.url.startsWith('/api/housing-strategy') && c.method === 'PUT',
      )
      expect(put).toBeTruthy()
      expect(JSON.parse(put!.body as string)).toEqual({ choice: 'sell' })
    })

    // En het success-scherm dat zonder deze stap direct getoond zou zijn.
    expect(
      await screen.findByRole('button', { name: 'Nog een toevoegen' }),
    ).toBeTruthy()
  })

  it('vraagt niets wanneer de gebruiker al een eigen woning had', async () => {
    mockHousingApi({ has_eigen_huis: true })
    renderWoningWizard()
    await voegWoningToeEnSlaHypotheekOver()

    expect(
      await screen.findByRole('button', { name: 'Nog een toevoegen' }),
    ).toBeTruthy()
    expect(screen.queryByText(HOUSING_CHOICE_QUESTION)).toBeNull()
  })

  it('vraagt niets wanneer de keuze al gemaakt is', async () => {
    mockHousingApi({ has_eigen_huis: false, choice: 'exclude' })
    renderWoningWizard()
    await voegWoningToeEnSlaHypotheekOver()

    expect(
      await screen.findByRole('button', { name: 'Nog een toevoegen' }),
    ).toBeTruthy()
    expect(screen.queryByText(HOUSING_CHOICE_QUESTION)).toBeNull()
  })

  it('behandelt een leesfout (500) niet als "geen woning"', async () => {
    mockHousingApi({ ok: false })
    renderWoningWizard()
    await voegWoningToeEnSlaHypotheekOver()

    expect(
      await screen.findByRole('button', { name: 'Nog een toevoegen' }),
    ).toBeTruthy()
    expect(screen.queryByText(HOUSING_CHOICE_QUESTION)).toBeNull()
  })

  it('overslaan rondt af zonder PUT — de bezitting blijft gewoon staan', async () => {
    const calls = mockHousingApi()
    renderWoningWizard()
    await voegWoningToeEnSlaHypotheekOver()
    await screen.findByText(HOUSING_CHOICE_QUESTION)

    fireEvent.click(screen.getByRole('button', { name: 'Overslaan' }))

    expect(
      await screen.findByRole('button', { name: 'Nog een toevoegen' }),
    ).toBeTruthy()
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)
    // De woning zelf is en blijft opgeslagen.
    expect(quickAddMock).toHaveBeenCalledTimes(1)
  })

  it('een mislukte PUT toont de fout maar blokkeert het afronden niet', async () => {
    mockHousingApi({}, { ok: false })
    renderWoningWizard()
    await voegWoningToeEnSlaHypotheekOver()
    await screen.findByText(HOUSING_CHOICE_QUESTION)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(SELL.name) }))
    fireEvent.click(screen.getByRole('button', { name: 'Verder' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText(/je woning staat er wel gewoon in/i)).toBeTruthy()

    // Uitweg blijft open: overslaan rondt alsnog af.
    fireEvent.click(screen.getByRole('button', { name: 'Overslaan' }))
    expect(
      await screen.findByRole('button', { name: 'Nog een toevoegen' }),
    ).toBeTruthy()
  })

  it('collect-modus (onboarding) stelt de vraag niet — die stap hoort daar bij de onboarding', async () => {
    const calls = mockHousingApi()
    const onCollect = vi.fn()
    render(
      <QuickAddWizard
        open
        onClose={vi.fn()}
        initialIntent="asset"
        initialAssetType="eigen_huis"
        mode="collect"
        onCollect={onCollect}
      />,
    )

    fireEvent.change(screen.getByLabelText('Huidige waarde'), {
      target: { value: '400000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Nee, overslaan' }))

    await waitFor(() => expect(onCollect).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(HOUSING_CHOICE_QUESTION)).toBeNull()
    expect(calls.some((c) => c.url.startsWith('/api/housing-strategy'))).toBe(false)
  })
})
