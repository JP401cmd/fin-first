import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { HouseholdBudgetModelSection } from './household-budget-model-section'

const realFetch = global.fetch

afterEach(() => {
  global.fetch = realFetch
  vi.restoreAllMocks()
})

describe('HouseholdBudgetModelSection', () => {
  it('rendert niets zonder huishouden', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          budgetModel: 'separate',
          hasHousehold: false,
          partnerName: null,
          pendingProposal: null,
          candidates: null,
          partnerPrivacyBlocksMerge: false,
        }),
    }) as unknown as typeof fetch

    const { container } = render(<HouseholdBudgetModelSection />)
    await waitFor(() =>
      expect(container.querySelector('[data-testid="household-budget-model-section"]')).toBeNull(),
    )
  })

  it('toont de voorstel-knop bij gescheiden budgetten met huishouden', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          budgetModel: 'separate',
          hasHousehold: true,
          partnerName: 'Sam',
          pendingProposal: null,
          candidates: [],
          partnerPrivacyBlocksMerge: false,
        }),
    }) as unknown as typeof fetch

    const { findByText } = render(<HouseholdBudgetModelSection />)
    await findByText('Stel huishoudbudget voor')
  })
})
