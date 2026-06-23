/**
 * Tests voor CashflowLandingCards — de chevron-uitklap moet in de
 * weergavemodus **Eenvoudig** verdwijnen (drill-down is detail, niet kern),
 * en in **Volledig** aanwezig blijven.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { CashflowLandingCards } from './cashflow-landing-cards'
import type { CashflowCard } from '@/lib/cashflow-cards'

// Optimistische PUT bij modus geen echte netwerk-call.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const CARDS: CashflowCard[] = [
  {
    key: 'budget',
    label: 'Budget',
    href: '/overzicht/cashflow/budget',
    tooltip: 'Plan en volg je maandbudgetten.',
    kpi: '€ 1.000/mnd',
    status: 'good',
    subText: 'Onder budget',
    detail: { label: 'Budgetdekking', value: '80%', tip: 'Je zit op koers.', actionLabel: 'Bekijk budget' },
  },
]

describe('CashflowLandingCards', () => {
  it('toont de chevron-uitklap in modus full', () => {
    render(
      <DisplayModeProvider initialMode="full">
        <CashflowLandingCards cards={CARDS} />
      </DisplayModeProvider>,
    )
    expect(screen.queryByRole('button', { name: /Toon detail Budget/i })).toBeTruthy()
  })

  it('verbergt de chevron-uitklap in modus simple', () => {
    render(
      <DisplayModeProvider initialMode="simple">
        <CashflowLandingCards cards={CARDS} />
      </DisplayModeProvider>,
    )
    expect(screen.queryByRole('button', { name: /Toon detail Budget/i })).toBeNull()
  })
})
