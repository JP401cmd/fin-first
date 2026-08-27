import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'
import type { TaxOpportunity } from '@/lib/tax-optimizer'

/**
 * PRIVACY-REGRESSIE (ADR 0091 laag 4) op de M22-voetnoot.
 *
 * De voetnoot "Tegen je dagtarief van EUR X per dag" zet de WISSELKOERS op het
 * scherm waarmee elke vrijheidsdagen-regel terug te rekenen is naar euro's:
 * bedrag = dagen x tarief. Naast een gemaskeerd bedrag maakt dat de maskering
 * inverteerbaar in plaats van hem te ondersteunen.
 *
 * Deze suite bewaakt beide kanten: zichtbaar zonder maskering, weg met.
 */

const { maskedRef } = vi.hoisted(() => ({ maskedRef: { current: false } }))

vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => ({
    masked: maskedRef.current,
    setMasked: () => {},
    toggle: () => {},
  }),
}))

const { HubKansen } = await import('./hub-kansen')

const OPPS: TaxOpportunity[] = [
  {
    id: 'jaarruimte',
    title: 'Benut je jaarruimte (lijfrente)',
    box: 1,
    savings: 2400,
    netEffect: 2400,
    netFreedomDays: 24,
    href: '/overzicht/belasting/box1',
  },
]

const DAILY = 100

describe('HubKansen — dagtarief-voetnoot en maskering', () => {
  it('toont bedrag, vrijheidsdagen en het dagtarief wanneer niet gemaskeerd', () => {
    maskedRef.current = false
    render(<HubKansen opportunities={OPPS} dailyExpenses={DAILY} />)

    expect(screen.getByText(/24 vrijheidsdagen/)).toBeTruthy()
    expect(screen.getByText(/Tegen je dagtarief van/)).toBeTruthy()
  })

  it('verbergt het dagtarief EN de eruit afgeleide vrijheidsdagen bij maskering', () => {
    maskedRef.current = true
    render(<HubKansen opportunities={OPPS} dailyExpenses={DAILY} />)

    // De voetnoot met de wisselkoers is weg...
    expect(screen.queryByText(/Tegen je dagtarief van/)).toBeNull()
    expect(screen.queryByText(/100/)).toBeNull()
    // ...en de vrijheidsdagen ook, want die zijn lineair in het bedrag.
    expect(screen.queryByText(/24 vrijheidsdagen/)).toBeNull()
    // Het bedrag zelf staat als bullets op het scherm.
    expect(screen.getAllByText(MASKED_AMOUNT_PLACEHOLDER).length).toBeGreaterThan(0)
  })
})
