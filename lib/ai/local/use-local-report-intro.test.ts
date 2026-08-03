import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useLocalReportIntro } from './use-local-report-intro'
import type { ReportIntroFigures } from './local-report-prompt'
import { useExecutionMode, type ExecutionModeState } from './use-execution-mode'
import { loadModelSession } from './litert-runtime'

vi.mock('./use-execution-mode', () => ({ useExecutionMode: vi.fn() }))
vi.mock('./litert-runtime', () => ({ loadModelSession: vi.fn() }))

const mockedMode = vi.mocked(useExecutionMode)
const mockedLoad = vi.mocked(loadModelSession)

const figures: ReportIntroFigures = {
  periodeNaam: 'Maart 2026',
  nettoVermogen: 85000,
  groeiPct: 3.4,
  totaalInkomen: 4200,
  totaalUitgaven: 2900,
  totaalGespaard: 1300,
  spaarquotePct: 31,
  firePct: 12.5,
  actiesVoltooid: 2,
  vrijheidsdagenGewonnen: 14.5,
}

function mode(status: ExecutionModeState['status']): ExecutionModeState {
  return {
    status,
    message: status === 'blocked' ? 'Dit toestel kan het lokale model niet draaien.' : null,
    intended: status === 'cloud' ? 'cloud' : 'lokaal',
    canUseCloud: status === 'cloud',
    canUseLocal: status === 'lokaal',
    refresh: vi.fn(),
  }
}

/** Eén generate-aanroep die `text` teruggeeft. */
function stubSession(text: string) {
  const generate = vi.fn().mockResolvedValue(text)
  mockedLoad.mockResolvedValue({ generate })
  return generate
}

describe('useLocalReportIntro — fail-closed', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    mockedLoad.mockReset()
  })

  it("'resolving': er vertrekt niets — geen model, geen netwerk", async () => {
    mockedMode.mockReturnValue(mode('resolving'))
    const generate = stubSession('x')
    const { result } = renderHook(() => useLocalReportIntro(figures))

    await waitFor(() => expect(result.current.status).toBe('wachten'))
    expect(generate).not.toHaveBeenCalled()
    expect(mockedLoad).not.toHaveBeenCalled()
    expect(globalThis.fetch).not.toHaveBeenCalled()
    // Print moet wachten zolang onbekend is of er nog een inleiding komt.
    expect(result.current.pending).toBe(true)
  })

  it("'blocked': geen generatie en zeker geen cloud-uitwijk", async () => {
    mockedMode.mockReturnValue(mode('blocked'))
    stubSession('x')
    const { result } = renderHook(() => useLocalReportIntro(figures))

    expect(result.current.status).toBe('uit')
    expect(result.current.blockedMessage).toContain('lokale model')
    expect(mockedLoad).not.toHaveBeenCalled()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("'cloud': deze hook doet niets (de server schreef de inleiding al)", async () => {
    mockedMode.mockReturnValue(mode('cloud'))
    stubSession('x')
    const { result } = renderHook(() => useLocalReportIntro(figures))

    expect(result.current.status).toBe('uit')
    expect(mockedLoad).not.toHaveBeenCalled()
  })

  it('zonder cijfers gebeurt er niets', () => {
    mockedMode.mockReturnValue(mode('lokaal'))
    stubSession('x')
    const { result } = renderHook(() => useLocalReportIntro(null))

    expect(result.current.status).toBe('uit')
    expect(mockedLoad).not.toHaveBeenCalled()
  })
})

describe('useLocalReportIntro — lokale generatie', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn())
    mockedMode.mockReturnValue(mode('lokaal'))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    mockedLoad.mockReset()
  })

  it('toont een geverifieerde inleiding en raakt het netwerk niet', async () => {
    const generate = stubSession('Je vermogen staat op €85.000, een plus van 3,4%. Mooi werk.')
    const { result } = renderHook(() => useLocalReportIntro(figures))

    await waitFor(() => expect(result.current.status).toBe('klaar'))
    expect(result.current.intro).toContain('€85.000')
    expect(result.current.pending).toBe(false)
    expect(generate).toHaveBeenCalledTimes(1)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('VERWERPT een inleiding met een verzonnen bedrag (cijfer-guardrail)', async () => {
    stubSession('Je vermogen groeide naar €120.000 deze maand.')
    const { result } = renderHook(() => useLocalReportIntro(figures))

    await waitFor(() => expect(result.current.status).toBe('mislukt'))
    expect(result.current.intro).toBeNull()
    expect(result.current.pending).toBe(false)
  })

  it('een inferentiefout laat het rapport staan zonder inleiding', async () => {
    mockedLoad.mockRejectedValue(new Error('WebGPU device lost'))
    const { result } = renderHook(() => useLocalReportIntro(figures))

    await waitFor(() => expect(result.current.status).toBe('mislukt'))
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('genereert één keer per rapport, ook bij re-renders', async () => {
    const generate = stubSession('Een rustige maand richting vrijheid.')
    const { result, rerender } = renderHook(() => useLocalReportIntro(figures))

    await waitFor(() => expect(result.current.status).toBe('klaar'))
    rerender()
    rerender()
    expect(generate).toHaveBeenCalledTimes(1)
  })
})
