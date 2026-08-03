import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { LokaleTipsGenerator } from './lokale-tips-generator'
import type { ExecutionModeState } from '@/lib/ai/local/use-execution-mode'
import type { LocalTipCandidate } from '@/lib/ai/local/local-tips-context'
import type { ResolvedLocalTip } from '@/lib/ai/local/parse-tip'

/**
 * Tests voor de naad van het lokale tips-pad.
 *
 * De belangrijkste eigenschap die hier bewaakt wordt: bij 'lokaal' vertrekt er
 * GEEN enkele cloud-AI-aanroep, en bij 'resolving'/'blocked' vertrekt er
 * helemaal niets. Dat is een privacybelofte, geen detail.
 */

const modeState = { current: null as ExecutionModeState | null }
vi.mock('@/lib/ai/local/use-execution-mode', () => ({
  useExecutionMode: () => modeState.current,
}))

// De resolver zelf laadt de WASM-runtime; hier vervangen door een stub die
// deterministisch één tip oplevert.
const generateMock = vi.fn()
vi.mock('@/lib/ai/local/local-tips-resolver', () => ({
  generateLocalTips: (...args: unknown[]) => generateMock(...args),
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const mode = (overrides: Partial<ExecutionModeState>): ExecutionModeState => ({
  status: 'lokaal',
  message: null,
  intended: 'lokaal',
  canUseCloud: false,
  canUseLocal: true,
  refresh: vi.fn(),
  ...overrides,
})

const kandidaat: LocalTipCandidate = {
  id: 'budget:boodschappen',
  bron: 'budget',
  titel: 'Bespaar op Boodschappen',
  toelichting: null,
  besparingPerJaar: 1080,
  euroImpactMonthly: 90,
  vrijheidsdagen: 11,
  vrijheidsdagenToegestaan: true,
  budgetSlug: 'boodschappen',
  type: 'budget_optimization',
  priority: 5,
}

const tip: ResolvedLocalTip = {
  candidateId: 'budget:boodschappen',
  title: 'Slimmer boodschappen doen',
  description: 'Je bespaart €90 per maand.',
  actions: ['Vergelijk je supermarkt'],
  recommendationType: 'budget_optimization',
  euroImpactMonthly: 90,
  euroImpactYearly: 1080,
  freedomDaysPerYear: 11,
  relatedBudgetSlug: 'boodschappen',
  priorityScore: 5,
}

beforeEach(() => {
  fetchMock.mockReset()
  generateMock.mockReset()
  modeState.current = mode({})
})

/** Standaard-antwoorden: kandidaten-hydratie + opslag. */
function stubHappyPath() {
  fetchMock.mockImplementation((url: string) => {
    if (String(url).startsWith('/api/local-tips-candidates')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ candidates: [kandidaat], hasCandidates: true }),
      })
    }
    if (String(url).startsWith('/api/local-tips')) {
      // Een niet-lege `recommendations` = de server heeft de tip écht opgeslagen.
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ recommendations: [{ id: 'r1' }], overgeslagen: 0 }),
      })
    }
    throw new Error(`onverwachte fetch: ${url}`)
  })
  generateMock.mockImplementation(
    async (_c: LocalTipCandidate[], opts: { onTip?: (t: ResolvedLocalTip) => Promise<void> }) => {
      await opts.onTip?.(tip)
      return [tip]
    },
  )
}

describe('LokaleTipsGenerator — fail-closed', () => {
  it("rendert niets en vuurt niets zolang de voorkeur nog laadt ('resolving')", () => {
    modeState.current = mode({
      status: 'resolving',
      intended: null,
      canUseLocal: false,
      canUseCloud: false,
    })
    const { container } = render(<LokaleTipsGenerator />)
    expect(container).toBeEmptyDOMElement()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rendert niets in cloud-modus — daar doet de bestaande CTA het werk", () => {
    modeState.current = mode({
      status: 'cloud',
      intended: 'cloud',
      canUseLocal: false,
      canUseCloud: true,
    })
    const { container } = render(<LokaleTipsGenerator />)
    expect(container).toBeEmptyDOMElement()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("toont bij 'blocked' de eerlijke reden en biedt GEEN uitwijk naar de cloud", () => {
    modeState.current = mode({
      status: 'blocked',
      message: 'Je toestel ondersteunt WebGPU niet.',
      canUseLocal: false,
      canUseCloud: false,
    })
    render(<LokaleTipsGenerator />)

    expect(screen.getByText('Je toestel ondersteunt WebGPU niet.')).toBeInTheDocument()
    // Geen enkele knop die alsnog iets zou starten.
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('LokaleTipsGenerator — lokale ronde', () => {
  it('haalt kandidaten op, genereert en slaat op ZONDER één cloud-AI-aanroep', async () => {
    stubHappyPath()
    const onGenerated = vi.fn()
    render(<LokaleTipsGenerator onGenerated={onGenerated} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /maak tips/i }))
    })
    await waitFor(() => expect(onGenerated).toHaveBeenCalled())

    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls).toContain('/api/local-tips-candidates')
    expect(urls).toContain('/api/local-tips')
    // DE KERN: geen enkele aanroep naar het cloud-AI-pad.
    expect(urls.some((u) => u.startsWith('/api/ai/'))).toBe(false)
    expect(urls.some((u) => u.includes('recommendations'))).toBe(false)
  })

  it('stuurt alleen TAAL naar de opslagroute — geen enkel bedrag in de body', async () => {
    stubHappyPath()
    render(<LokaleTipsGenerator />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /maak tips/i }))
    })
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]) === '/api/local-tips')).toBe(true),
    )

    const call = fetchMock.mock.calls.find((c) => String(c[0]) === '/api/local-tips')
    const body = JSON.parse((call?.[1] as { body: string }).body)
    expect(body.tips[0]).toEqual({
      candidateId: 'budget:boodschappen',
      title: 'Slimmer boodschappen doen',
      description: 'Je bespaart €90 per maand.',
      actions: ['Vergelijk je supermarkt'],
    })
    // Geen numerieke velden: de server leidt ze zelf af uit de canonieke kandidaat.
    expect(Object.keys(body.tips[0])).not.toContain('euroImpactMonthly')
    expect(Object.keys(body.tips[0])).not.toContain('freedomDaysPerYear')
  })

  it('toont elke afgeronde tip meteen — de gebruiker wacht niet op het geheel', async () => {
    stubHappyPath()
    render(<LokaleTipsGenerator />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /maak tips/i }))
    })
    expect(await screen.findByText('Slimmer boodschappen doen')).toBeInTheDocument()
  })

  it('meldt eerlijk wanneer er geen kansen zijn en laat het model met rust', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ candidates: [], hasCandidates: false }),
    })
    render(<LokaleTipsGenerator />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /maak tips/i }))
    })
    expect(await screen.findByText(/geen nieuwe kansen/i)).toBeInTheDocument()
    expect(generateMock).not.toHaveBeenCalled()
  })

  it('meldt GEEN succes wanneer de server de tip fail-closed heeft overgeslagen', async () => {
    // De route antwoordt 200 met een lege `recommendations` zodra de kans tussen
    // ophalen en opslaan uit de canonieke lijst verdween. Een groen vinkje zou
    // dan succes melden voor een kaart die nooit verschijnt.
    fetchMock.mockImplementation((url: string) => {
      if (String(url).startsWith('/api/local-tips-candidates')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ candidates: [kandidaat], hasCandidates: true }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ recommendations: [], overgeslagen: 1 }),
      })
    })
    generateMock.mockImplementation(
      async (_c: LocalTipCandidate[], opts: { onTip?: (t: ResolvedLocalTip) => Promise<void> }) => {
        await opts.onTip?.(tip)
        return [tip]
      },
    )
    const onGenerated = vi.fn()
    render(<LokaleTipsGenerator onGenerated={onGenerated} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /maak tips/i }))
    })

    expect(screen.queryByText('Slimmer boodschappen doen')).not.toBeInTheDocument()
    expect(onGenerated).not.toHaveBeenCalled()
    // Er wáren kansen — dus niet "geen kansen", maar een eerlijke foutregel.
    expect(screen.getByText(/geen bruikbare tip/i)).toBeInTheDocument()
  })

  it('biedt een stopknop tijdens de ronde en geen daarbuiten', async () => {
    // Een ronde duurt ~60-75 s; wegnavigeren mag niet de enige uitweg zijn.
    let losmaken: (() => void) | null = null
    stubHappyPath()
    generateMock.mockImplementation(
      () => new Promise<ResolvedLocalTip[]>((resolve) => { losmaken = () => resolve([]) }),
    )
    render(<LokaleTipsGenerator />)

    expect(screen.queryByRole('button', { name: /stoppen/i })).not.toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /maak tips/i }))
    })
    expect(screen.getByRole('button', { name: /stoppen/i })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /stoppen/i }))
      losmaken?.()
    })
    expect(screen.queryByRole('button', { name: /stoppen/i })).not.toBeInTheDocument()
  })

  it('toont een nette melding wanneer de kandidaten niet opgehaald kunnen worden', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) })
    render(<LokaleTipsGenerator />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /maak tips/i }))
    })
    expect(await screen.findByText(/niet worden opgehaald/i)).toBeInTheDocument()
    expect(generateMock).not.toHaveBeenCalled()
  })
})
