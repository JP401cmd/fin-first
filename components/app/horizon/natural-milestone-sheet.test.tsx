import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NaturalMilestoneSheet } from './natural-milestone-sheet'
import { getOverlayHistoryDepth, __resetOverlayHistory } from '@/lib/overlay-history'
import type { NaturalMilestone } from '@/lib/natural-milestones'

/**
 * De "Bekijk bron"-knop navigeert weg én sluit de sheet: `router.push()`
 * gevolgd door `onClose()`. Die route-wissel is nog onderweg wanneer de
 * effect-cleanup van de overlay loopt — zou die haar history-entry dan
 * consumeren met een `history.back()`, dan breekt de navigatie af en blijft de
 * gebruiker op de tijdas staan (zelfde defect als de link in de NavMenuSheet,
 * alleen zonder link om aan te herkennen: dit is een knop).
 * `noteOverlayNavigation()` meldt die sluitroute expliciet.
 */

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn() }),
}))

const SCHULD_MIJLPAAL: NaturalMilestone = {
  id: 'nat-debt-payoff-1',
  kind: 'debt_payoff',
  category: 'debt',
  name: 'Hypotheek afgelost',
  target_age: 58,
  target_date: '2045-03-01',
  icon: 'Home',
  sourceId: 'schuld-1',
  amount: 120_000,
}

describe('NaturalMilestoneSheet — sluiten door eigen navigatie', () => {
  let backSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    __resetOverlayHistory()
    window.history.replaceState(null, '')
    mockPush.mockReset()
    backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})
  })

  afterEach(() => {
    backSpy.mockRestore()
    __resetOverlayHistory()
  })

  it('laat de history met rust wanneer "Bekijk bron" naar de bronpagina navigeert', async () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <NaturalMilestoneSheet open milestone={SCHULD_MIJLPAAL} onClose={onClose} />,
    )
    expect(getOverlayHistoryDepth()).toBe(1)

    fireEvent.click(screen.getByText('Bekijk schuld'))
    expect(mockPush).toHaveBeenCalledWith('/core/debts')
    expect(onClose).toHaveBeenCalledTimes(1)

    // De ouder reageert op onClose en zet `open` uit; dáár hangt de cleanup aan.
    rerender(<NaturalMilestoneSheet open={false} milestone={SCHULD_MIJLPAAL} onClose={onClose} />)
    await waitFor(() => expect(getOverlayHistoryDepth()).toBe(0))
    expect(backSpy).not.toHaveBeenCalled()
  })
})
