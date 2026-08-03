import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useWhatIfSuggestions } from './use-whatif-suggestions'
import { useExecutionMode, type ExecutionModeState } from '@/lib/ai/local/use-execution-mode'
import { loadModelSession } from '@/lib/ai/local/litert-runtime'
import type { EventPrefillContext } from '@/lib/horizon/event-prefill'
import type { FinancialInput } from '@/lib/horizon-data'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'

vi.mock('@/lib/ai/local/use-execution-mode', () => ({ useExecutionMode: vi.fn() }))
vi.mock('@/lib/ai/local/litert-runtime', () => ({ loadModelSession: vi.fn() }))

const mockedMode = vi.mocked(useExecutionMode)
const mockedLoad = vi.mocked(loadModelSession)

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

const baseline: WhatIfOverrides = {
  monthlyIncome: 4000,
  workDaysPerWeek: 5,
  savingsRate: 20,
  expectedReturn: 7,
  extraContribution: 0,
}
// Fors afwijkend scenario → isSignificantDelta is waar (cloud zou vuren).
const overrides: WhatIfOverrides = { ...baseline, monthlyIncome: 3000, workDaysPerWeek: 4 }

const prefillContext: EventPrefillContext = {
  userAowAge: { years: 67, months: 0, fractional: 67, isDefinitive: true },
  currentAge: 40,
  effectiveInput: {
    totalAssets: 100000,
    totalDebts: 0,
    monthlyIncome: 4000,
    monthlyExpenses: 3000,
    monthlyContributions: 0,
    yearlyMustExpenses: 24000,
    dateOfBirth: '1985-01-01',
  } as FinancialInput,
  isHouseholdView: false,
  effectiveNetWorth: 100000,
  debts: [],
}

function options(over: Partial<Parameters<typeof useWhatIfSuggestions>[0]> = {}) {
  return {
    overrides,
    baseline,
    fireAgeDelta: -2,
    activeEventNames: [] as string[],
    prefillContext,
    ...over,
  }
}

function stubSession(text: string) {
  const generate = vi.fn().mockResolvedValue(text)
  mockedLoad.mockResolvedValue({ generate })
  return generate
}

const VALID_OUTPUT =
  '[{"event_type":"renovation","name":"Keuken vernieuwen","explanation":"Past bij je nieuwe ritme."}]'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ suggestions: [] }) }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
  mockedLoad.mockReset()
})

describe('useWhatIfSuggestions — fail-closed', () => {
  it("'lokaal': de debounce-fetch naar /api/whatif/suggest vertrekt NOOIT", async () => {
    vi.useFakeTimers()
    mockedMode.mockReturnValue(mode('lokaal'))
    stubSession(VALID_OUTPUT)

    const { result } = renderHook(() => useWhatIfSuggestions(options()))
    await act(async () => {
      vi.advanceTimersByTime(10000)
    })

    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(result.current.mode).toBe('lokaal')
    // Geen auto-fire: on-device draait alleen op expliciet verzoek.
    expect(mockedLoad).not.toHaveBeenCalled()
    expect(result.current.canRequest).toBe(true)
  })

  it("'resolving': geen fetch, geen generatie, knop uit", async () => {
    vi.useFakeTimers()
    mockedMode.mockReturnValue(mode('resolving'))
    stubSession(VALID_OUTPUT)

    const { result } = renderHook(() => useWhatIfSuggestions(options()))
    await act(async () => {
      vi.advanceTimersByTime(10000)
    })
    act(() => result.current.request())

    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(mockedLoad).not.toHaveBeenCalled()
    expect(result.current.mode).toBe('wachten')
    expect(result.current.canRequest).toBe(false)
  })

  it("'blocked': niets vertrekt en de reden is eerlijk zichtbaar", async () => {
    vi.useFakeTimers()
    mockedMode.mockReturnValue(mode('blocked'))
    stubSession(VALID_OUTPUT)

    const { result } = renderHook(() => useWhatIfSuggestions(options()))
    await act(async () => {
      vi.advanceTimersByTime(10000)
    })
    act(() => result.current.request())

    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(mockedLoad).not.toHaveBeenCalled()
    expect(result.current.mode).toBe('onbeschikbaar')
    expect(result.current.error).toContain('lokale model')
  })

  it("'cloud': het bestaande debounce-pad blijft werken", async () => {
    vi.useFakeTimers()
    mockedMode.mockReturnValue(mode('cloud'))

    renderHook(() => useWhatIfSuggestions(options()))
    await act(async () => {
      vi.advanceTimersByTime(2500)
    })

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(vi.mocked(globalThis.fetch).mock.calls[0][0]).toBe('/api/whatif/suggest')
  })
})

describe('useWhatIfSuggestions — lokale suggesties', () => {
  beforeEach(() => mockedMode.mockReturnValue(mode('lokaal')))

  it('lost de bedragen deterministisch uit de catalogus op', async () => {
    stubSession(VALID_OUTPUT)
    const { result } = renderHook(() => useWhatIfSuggestions(options()))

    act(() => result.current.request())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.suggestions).toHaveLength(1)
    const s = result.current.suggestions[0]
    expect(s.event_type).toBe('renovation')
    expect(s.one_time_cost).toBeGreaterThan(0)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('geen catalogus-match → lege staat, NOOIT een cloud-uitwijk', async () => {
    stubSession('[{"event_type":"lottery_win","name":"Loterij","explanation":"x"}]')
    const { result } = renderHook(() => useWhatIfSuggestions(options()))

    act(() => result.current.request())
    await waitFor(() => expect(result.current.error).not.toBeNull())

    expect(result.current.suggestions).toEqual([])
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('één tegelijk: een tweede klik tijdens een lopende run doet niets', async () => {
    let resolveGenerate: ((v: string) => void) | null = null
    const generate = vi.fn().mockImplementation(
      () => new Promise<string>((res) => { resolveGenerate = res }),
    )
    mockedLoad.mockResolvedValue({ generate })

    const { result } = renderHook(() => useWhatIfSuggestions(options()))
    act(() => result.current.request())
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1))
    act(() => result.current.request())
    expect(generate).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveGenerate?.(VALID_OUTPUT)
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('een inferentiefout geeft een eerlijke melding, geen fallback', async () => {
    mockedLoad.mockRejectedValue(new Error('WebGPU device lost'))
    const { result } = renderHook(() => useWhatIfSuggestions(options()))

    act(() => result.current.request())
    await waitFor(() => expect(result.current.error).toBe('Voorstellen maken lukte niet op dit apparaat.'))
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('zonder prefill-context kan er lokaal niets opgelost worden (knop uit)', () => {
    stubSession(VALID_OUTPUT)
    const { result } = renderHook(() => useWhatIfSuggestions(options({ prefillContext: null })))

    act(() => result.current.request())
    expect(result.current.canRequest).toBe(false)
    expect(mockedLoad).not.toHaveBeenCalled()
  })
})
