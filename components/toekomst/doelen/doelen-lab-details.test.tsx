/**
 * DoelenLabDetails — onder het lab in katern Doelen (ADR 0179 fase 4): de schaal-legenda,
 * de marktaannames (ingeklapt, alleen Volledig, spec §4.7) en de indicatieregel, één keer.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'

const h = vi.hoisted(() => ({ solo: true }))

vi.mock('@/components/app/horizon/whatif-market-assumptions', () => ({
  WhatIfMarketAssumptions: () => <div data-testid="marktaannames" />,
}))
vi.mock('@/components/toekomst/state/toekomst-state-provider', () => ({
  useToekomstPerspectiefContext: () => ({ verkenSectieZichtbaar: h.solo }),
  useToekomstScenarioContext: () => ({
    whatIfBaseline: {},
    categorieReturnGroups: [{ categorie: 'Beleggingen' }],
    scenarioReturnDeltas: {},
    setScenarioReturnDeltas: vi.fn(),
  }),
  useToekomstSimContext: () => ({ simResult: { fireAge: 55 } }),
}))

import { DoelenLabDetails } from './doelen-lab-details'

afterEach(() => {
  cleanup()
  h.solo = true
})

function renderIn(mode: 'full' | 'simple') {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <DoelenLabDetails />
    </DisplayModeProvider>,
  )
}

describe('DoelenLabDetails', () => {
  it('Volledig: schaal-legenda, ingeklapte marktaannames en de indicatieregel', () => {
    renderIn('full')
    expect(screen.getByTestId('lab-schaal-legenda')).toBeTruthy()
    expect(screen.getByTestId('lab-indicatie')).toBeTruthy()
    expect(screen.queryByTestId('marktaannames')).toBeNull()
    const knop = screen.getByRole('button', { name: /Rendement per categorie/ })
    expect(knop.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(knop)
    expect(screen.getByTestId('marktaannames')).toBeTruthy()
  })

  it('Eenvoudig: geen marktaannames, wel legenda en indicatieregel', () => {
    renderIn('simple')
    expect(screen.queryByRole('button', { name: /Rendement per categorie/ })).toBeNull()
    expect(screen.getByTestId('lab-schaal-legenda')).toBeTruthy()
    expect(screen.getByTestId('lab-indicatie')).toBeTruthy()
  })

  it('niet solo (partner- of huishoudperspectief): niets, net als het lab', () => {
    h.solo = false
    const { container } = renderIn('full')
    expect(container.textContent).toBe('')
  })
})
