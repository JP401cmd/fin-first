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
    subscriptions: [sub], vasteKosten: [rent], terugkerendVariabel: [],
    totalMonthlySubscriptions: 16, totalMonthlyVasteKosten: 900,
    totalMonthlyVariabel: 0, totalMonthly: 916, count: 2,
  }
}

const insights = buildVasteLastenInsights({
  summary: mkSummary(), monthlyIncome: 4000, dailyExpenseRate: dailyExpenseRate(2500),
})

function renderInMode(mode: 'simple' | 'full') {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <HideInSimple>
        <VasteLastenInsights insights={insights} />
      </HideInSimple>
    </DisplayModeProvider>,
  )
}

// W-017 (19-09-2026): dit component draagt alleen nog de samenstelling. De
// quote-meter en het sluipverbruik rendert de client in beide modi zelf;
// "In vrijheidstijd" en "Wat als ik opzeg" zijn verwijderd.
describe('VasteLastenInsights — weergavemodus', () => {
  it('Volledig toont de samenstelling, en niets van wat verwijderd is', () => {
    renderInMode('full')
    expect(screen.getByText('Samenstelling')).toBeTruthy()
    expect(screen.queryByText('In vrijheidstijd')).toBeNull()
    expect(screen.queryByText('Wat als ik opzeg')).toBeNull()
    // Niet dubbel: die twee blokken komen uit de client, niet van hier.
    expect(screen.queryByText('Vaste-lastenquote')).toBeNull()
    expect(screen.queryByText('Abonnementen-sluipverbruik')).toBeNull()
  })

  it('Eenvoudig verbergt de verdieping', () => {
    renderInMode('simple')
    expect(screen.queryByText('Samenstelling')).toBeNull()
  })
})
