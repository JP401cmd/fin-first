/**
 * Regressie voor kaart "Privacy-modus dekt álle bedragen" — cluster A9.
 *
 * De opzeg-actie toont het maandbedrag van het abonnement. Dat bedrag zat
 * vroeger gebakken in `action.description` (platte tekst, dus onmaskeerbaar);
 * het staat nu in `metadata.monthly_amount` en wordt hier live gerenderd.
 * Deze suite dwingt af dat die live render de privacy-toggle respecteert.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ActionCard } from './action-card'
import {
  PRIVACY_MASKED_STORAGE_KEY,
  PrivacyProvider,
} from '@/lib/hooks/use-privacy'
import { MASKED_AMOUNT_PLACEHOLDER, formatCurrency } from '@/lib/format'
import type { Action } from '@/lib/recommendation-data'

const MONTHLY = 12.99

const cancellationAction: Action = {
  id: 'a1',
  user_id: 'u1',
  recommendation_id: null,
  source: 'manual',
  title: 'Afronden van opzeggen Netflix abonnement',
  description: 'Opzegbrief klaargezet voor Netflix. Open deze actie om de opzegging af te ronden.',
  freedom_days_impact: 0,
  euro_impact_monthly: MONTHLY,
  status: 'open',
  scheduled_week: null,
  due_date: null,
  postpone_weeks: null,
  postponed_until: null,
  rejection_reason: null,
  sort_order: 0,
  priority_score: 3,
  completed_at: null,
  status_changed_at: null,
  created_at: '2026-08-07T00:00:00.000Z',
  updated_at: '2026-08-07T00:00:00.000Z',
  metadata: {
    type: 'subscription_cancellation',
    subscription_name: 'Netflix',
    monthly_amount: MONTHLY,
    user_name: 'Jan',
    user_address: 'Straat 1',
    user_postcode: '1234 AB',
    user_city: 'Utrecht',
  },
  assigned_to: null,
  assigned_by: null,
}

function renderCard(opts?: { masked?: boolean }) {
  if (opts?.masked) {
    window.localStorage.setItem(PRIVACY_MASKED_STORAGE_KEY, 'true')
  }
  return render(
    <PrivacyProvider>
      <ActionCard
        action={cancellationAction}
        onStatusChange={vi.fn()}
        onCancellationOpen={vi.fn()}
      />
    </PrivacyProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('<ActionCard> — opzeg-actie (A9)', () => {
  // textContent-vergelijking i.p.v. getByText: de nl-NL currency-string bevat
  // een non-breaking space die de text-matcher van Testing Library normaliseert,
  // waardoor een letterlijke match op formatCurrency() zou missen.
  it('toont het maandbedrag uit de metadata wanneer maskering uit staat', () => {
    const { container } = renderCard()
    expect(container.textContent).toContain(formatCurrency(MONTHLY))
    expect(container.textContent).not.toContain(MASKED_AMOUNT_PLACEHOLDER)
  })

  it('vervangt het maandbedrag door bullets wanneer maskering aan staat', () => {
    const { container } = renderCard({ masked: true })
    expect(container.textContent).toContain(MASKED_AMOUNT_PLACEHOLDER)
    expect(container.textContent).not.toContain(formatCurrency(MONTHLY))
    expect(container.textContent).not.toContain('€')
  })

  it('houdt de omschrijving vrij van bedragen, zodat er niets te lekken valt', () => {
    expect(cancellationAction.description).not.toContain('€')
  })
})
