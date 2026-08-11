import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { VasteLastenInsights } from './vaste-lasten-insights'
import { buildVasteLastenInsights } from '@/lib/vaste-lasten-insights'
import { dailyExpenseRate } from '@/lib/format'
import type { VasteLastenItem, VasteLastenSummary } from '@/lib/vaste-lasten-summary'
import { CATEGORY_LABELS } from '@/lib/recurring-detection'

afterEach(cleanup)

function mkSummary(): VasteLastenSummary {
  const sub: VasteLastenItem = {
    id: 's1', name: 'Netflix', averageAmount: 16, monthlyAmount: 16, frequency: 'monthly',
    nextDate: null, confidence: 'high', isVariableAmount: false, occurrences: null,
    alreadyConfirmed: true, category: 'subscription',
    categoryLabel: CATEGORY_LABELS.subscription, categoryOverride: null,
  }
  const rent: VasteLastenItem = {
    id: 'v1', name: 'Huur', averageAmount: 900, monthlyAmount: 900, frequency: 'monthly',
    nextDate: null, confidence: 'high', isVariableAmount: false, occurrences: null,
    alreadyConfirmed: true, category: 'rent',
    categoryLabel: CATEGORY_LABELS.rent, categoryOverride: null,
  }
  return {
    subscriptions: [sub], vasteKosten: [rent],
    totalMonthlySubscriptions: 16, totalMonthlyVasteKosten: 900,
    totalMonthly: 916, count: 2,
  }
}

const insights = buildVasteLastenInsights({
  summary: mkSummary(), monthlyIncome: 4000, dailyExpenseRate: dailyExpenseRate(2500),
})

function renderInMode(mode: 'simple' | 'full') {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <HideInSimple>
        <VasteLastenInsights insights={insights} onOpzeg={() => {}} />
      </HideInSimple>
    </DisplayModeProvider>,
  )
}

describe('VasteLastenInsights — weergavemodus', () => {
  it('Volledig toont de inzicht-blokken', () => {
    renderInMode('full')
    expect(screen.getByText('Vaste-lastenquote')).toBeTruthy()
    expect(screen.getByText('In vrijheidstijd')).toBeTruthy()
    expect(screen.getByText('Samenstelling')).toBeTruthy()
    expect(screen.getByText('Wat als ik opzeg')).toBeTruthy()
  })

  it('Eenvoudig verbergt de inzicht-blokken', () => {
    renderInMode('simple')
    expect(screen.queryByText('Vaste-lastenquote')).toBeNull()
    expect(screen.queryByText('In vrijheidstijd')).toBeNull()
    expect(screen.queryByText('Samenstelling')).toBeNull()
  })
})
