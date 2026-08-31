/**
 * Component-test voor MilestoneCelebrationHost — de aanroepsite van de
 * server-gedreven mijlpalen.
 *
 * Borgt de vier eigenschappen waar de host over gaat (de viering zelf is
 * getest in `__tests__/milestone-celebration.test.tsx`):
 *  1. `milestone === null` → niets renderen, niets melden,
 *  2. elke dismiss-route (sluitknop, auto-dismiss, deel-knop) meldt precies één
 *     keer af bij `POST /api/milestones/acknowledge` met de juiste key,
 *  3. de deel-knop opent de bestaande deel-sheet,
 *  4. een mislukte acknowledge breekt de UI niet.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react'
import { MilestoneCelebrationHost } from './milestone-celebration-host'

// De echte deel-sheet trekt de canvas-renderer, ShareDialog en het
// freedom-card-ophaalpad mee; die flow heeft z'n eigen suite
// (`deel-kaart-sheet.test.tsx`). Hier telt alleen dát hij opent.
vi.mock('@/components/app/deel-kaart-sheet', () => ({
  DeelKaartSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="deel-kaart-sheet" /> : null,
}))

const fetchMock = vi.fn()

const MIJLPAAL = {
  key: 'net-worth:100000',
  titel: 'Je eerste ton staat.',
  betekenis: 'Dat is een stuk vrijheid dat niemand je meer afneemt.',
}

function ackCalls() {
  return fetchMock.mock.calls.filter((call) => call[0] === '/api/milestones/acknowledge')
}

function ackBody(index = 0): unknown {
  const init = ackCalls()[index]?.[1] as RequestInit | undefined
  return JSON.parse(String(init?.body ?? 'null'))
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true }),
  } as Response)
  vi.stubGlobal('fetch', fetchMock)
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('MilestoneCelebrationHost', () => {
  it('rendert niets en meldt niets af zonder mijlpaal', () => {
    const { container } = render(<MilestoneCelebrationHost milestone={null} />)
    expect(container.firstChild).toBeNull()
    expect(ackCalls()).toHaveLength(0)
  })

  it('rendert de mijlpaal met de deel-actie', () => {
    render(<MilestoneCelebrationHost milestone={MIJLPAAL} />)
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText(MIJLPAAL.titel)).toBeTruthy()
    expect(screen.getByText(MIJLPAAL.betekenis)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Deel dit' })).toBeTruthy()
    // Nog niet afgemeld zolang de viering staat.
    expect(ackCalls()).toHaveLength(0)
  })

  it('sluitknop: precies één POST met de juiste key', () => {
    render(<MilestoneCelebrationHost milestone={MIJLPAAL} />)

    fireEvent.click(screen.getByRole('button', { name: 'Sluiten' }))

    expect(ackCalls()).toHaveLength(1)
    expect(ackCalls()[0][1]).toMatchObject({ method: 'POST' })
    expect(ackBody()).toEqual({ key: MIJLPAAL.key })
    // De viering is weg en blijft weg — ook nadat de auto-dismiss-timer
    // alsnog zou verstrijken (geen tweede POST).
    expect(screen.queryByText(MIJLPAAL.titel)).toBeNull()
    act(() => {
      vi.advanceTimersByTime(20000)
    })
    expect(ackCalls()).toHaveLength(1)
  })

  it('auto-dismiss: precies één POST na de verlengde duur', () => {
    render(<MilestoneCelebrationHost milestone={MIJLPAAL} />)

    // Met een actie erbij loopt de auto-dismiss op 12s (+260ms fade).
    act(() => {
      vi.advanceTimersByTime(4760)
    })
    expect(ackCalls()).toHaveLength(0)

    act(() => {
      vi.advanceTimersByTime(12000 - 4760 + 260)
    })
    expect(ackCalls()).toHaveLength(1)
    expect(ackBody()).toEqual({ key: MIJLPAAL.key })
  })

  it('deel-knop: opent de deel-sheet én meldt één keer af', async () => {
    render(<MilestoneCelebrationHost milestone={MIJLPAAL} />)

    fireEvent.click(screen.getByRole('button', { name: 'Deel dit' }))

    expect(ackCalls()).toHaveLength(1)
    expect(ackBody()).toEqual({ key: MIJLPAAL.key })

    // De sheet komt via next/dynamic binnen: één microtask-flush volstaat.
    await act(async () => {})
    expect(screen.getByTestId('deel-kaart-sheet')).toBeTruthy()

    // De viering zelf is weg; de resterende timers voegen geen POST toe.
    expect(screen.queryByText(MIJLPAAL.titel)).toBeNull()
    act(() => {
      vi.advanceTimersByTime(20000)
    })
    expect(ackCalls()).toHaveLength(1)
  })

  it('een mislukte acknowledge breekt de UI niet', () => {
    fetchMock.mockRejectedValue(new Error('netwerk weg'))
    render(<MilestoneCelebrationHost milestone={MIJLPAAL} />)

    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Sluiten' }))
    }).not.toThrow()

    expect(ackCalls()).toHaveLength(1)
    expect(screen.queryByText(MIJLPAAL.titel)).toBeNull()
  })
})
