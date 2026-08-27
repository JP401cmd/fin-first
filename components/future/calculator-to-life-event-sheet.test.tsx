import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CalculatorToLifeEventSheet } from './calculator-to-life-event-sheet'
import { getOverlayHistoryDepth, __resetOverlayHistory } from '@/lib/overlay-history'

/**
 * Deze sheet slaat op en navigeert dan zelf naar de Gebeurtenissen-tab:
 * `onClose()` gevolgd door `router.push()`. Die route-wissel is nog onderweg
 * wanneer de effect-cleanup van de overlay loopt — zou die haar history-entry
 * dan consumeren met een `history.back()`, dan breekt de navigatie af en blijft
 * de gebruiker op de rekenhulp staan (zelfde defect als de link in de
 * NavMenuSheet, alleen zonder link om aan te herkennen: dit is een knop).
 * `noteOverlayNavigation()` meldt die sluitroute expliciet.
 */

const mockInsert = vi.fn()
const mockPush = vi.fn()
const mockRefresh = vi.fn()
const mockGetUser = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ insert: mockInsert }),
    auth: { getUser: mockGetUser },
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}))

describe('CalculatorToLifeEventSheet — sluiten door eigen navigatie', () => {
  let backSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    __resetOverlayHistory()
    window.history.replaceState(null, '')
    mockInsert.mockReset().mockResolvedValue({ error: null })
    mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockPush.mockReset()
    mockRefresh.mockReset()
    backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})
  })

  afterEach(() => {
    backSpy.mockRestore()
    __resetOverlayHistory()
  })

  it('laat de history met rust wanneer de sheet na opslaan zelf navigeert', async () => {
    const onClose = vi.fn()
    const { unmount } = render(
      <CalculatorToLifeEventSheet
        defaultName="Sabbatical"
        defaultAmount={12000}
        defaultAge={45}
        onClose={onClose}
      />,
    )
    expect(getOverlayHistoryDepth()).toBe(1)

    fireEvent.click(screen.getByText('Naar tijdas'))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/toekomst?tab=gebeurtenissen'))
    expect(onClose).toHaveBeenCalledTimes(1)

    // De ouder haalt de sheet weg zodra onClose komt; dáár hangt de cleanup aan.
    unmount()
    await waitFor(() => expect(getOverlayHistoryDepth()).toBe(0))
    expect(backSpy).not.toHaveBeenCalled()
  })
})
