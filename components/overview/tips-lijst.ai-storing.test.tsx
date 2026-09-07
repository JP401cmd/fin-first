import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TipsLijst } from './tips-lijst'
import type { ExecutionModeState } from '@/lib/ai/local/use-execution-mode'

/**
 * UR3-17 #18 — de tips-pagina stond leeg terwijl de zijbalk en de briefing
 * ernaar verwezen. De oorzaak was een AI-storing (het tegoed was op), maar de
 * pagina zei daar geen woord over: hij toonde "Geen tips op dit moment" plus een
 * uitnodigende knop naar een gesprek met Fin dat op dat moment niet gevoerd kón
 * worden.
 *
 * Deze suite grendelt de terugkoppeling: bij een geblokkeerde AI zegt de lege
 * lijst wát er aan de hand is en biedt hij geen doodlopende knop.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/components/app/chat/chat-provider', () => ({
  useChatContextOptional: () => ({ openWithMessage: vi.fn() }),
}))
vi.mock('./lokale-tips-generator', () => ({
  LokaleTipsGenerator: () => <div data-testid="lokale-tips-generator" />,
}))

const mockMode = vi.fn<() => ExecutionModeState>()
vi.mock('@/lib/ai/local/use-execution-mode', () => ({
  useExecutionMode: () => mockMode(),
}))

function modeState(over: Partial<ExecutionModeState> = {}): ExecutionModeState {
  return {
    status: 'cloud',
    message: null,
    intended: 'cloud',
    canUseCloud: true,
    canUseLocal: false,
    refresh: vi.fn(),
    ...over,
  }
}

const BLOKKADE = 'AI staat uit in je instellingen, dus er wordt niets gegenereerd.'

beforeEach(() => {
  mockMode.mockReset()
})

describe('TipsLijst — lege lijst door een AI-storing', () => {
  it('zegt wát er aan de hand is in plaats van "geen tips"', () => {
    mockMode.mockReturnValue(
      modeState({ status: 'blocked', message: BLOKKADE, canUseCloud: false, reason: 'ai_uit' }),
    )
    render(<TipsLijst recommendations={[]} />)

    expect(screen.getByText('Er kunnen nu geen tips gemaakt worden')).toBeTruthy()
    expect(screen.getByText(BLOKKADE)).toBeTruthy()
    expect(screen.queryByText('Geen tips op dit moment')).toBeNull()
  })

  it('biedt geen knop naar een gesprek dat niet gevoerd kan worden', () => {
    mockMode.mockReturnValue(
      modeState({ status: 'blocked', message: BLOKKADE, canUseCloud: false }),
    )
    render(<TipsLijst recommendations={[]} />)

    expect(screen.queryByText('Vraag Fin om tips')).toBeNull()
    // Wél een uitweg: de plek waar de blokkade op te heffen is.
    expect(screen.getByRole('link', { name: /Privacy/ }).getAttribute('href')).toBe(
      '/mijn/privacy',
    )
  })

  it('toont de blokkade-melding maar één keer (niet óók via de lokale generator)', () => {
    mockMode.mockReturnValue(
      modeState({ status: 'blocked', message: BLOKKADE, canUseCloud: false }),
    )
    render(<TipsLijst recommendations={[]} />)
    expect(screen.queryByTestId('lokale-tips-generator')).toBeNull()
  })

  it('valt terug op een eigen zin wanneer de hook geen reden meegeeft', () => {
    mockMode.mockReturnValue(modeState({ status: 'blocked', message: null, canUseCloud: false }))
    render(<TipsLijst recommendations={[]} />)
    expect(screen.getByText(/Fin kan op dit moment geen tips maken/)).toBeTruthy()
  })

  it('AI in orde → de gewone lege staat blijft ongewijzigd', () => {
    mockMode.mockReturnValue(modeState({ status: 'cloud' }))
    render(<TipsLijst recommendations={[]} />)

    expect(screen.getByText('Geen tips op dit moment')).toBeTruthy()
    expect(screen.getByText('Vraag Fin om tips')).toBeTruthy()
    expect(screen.queryByText('Er kunnen nu geen tips gemaakt worden')).toBeNull()
    expect(screen.getByTestId('lokale-tips-generator')).toBeTruthy()
  })

  it("'resolving' is geen storing — dan nog niets beweren", () => {
    mockMode.mockReturnValue(
      modeState({ status: 'resolving', intended: null, canUseCloud: false }),
    )
    render(<TipsLijst recommendations={[]} />)
    expect(screen.queryByText('Er kunnen nu geen tips gemaakt worden')).toBeNull()
  })
})
