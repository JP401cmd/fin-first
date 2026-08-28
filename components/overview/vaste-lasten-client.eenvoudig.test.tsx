import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { VasteLastenClient } from './vaste-lasten-client'
import { buildVasteLastenInsights } from '@/lib/vaste-lasten-insights'
import { vasteLastenCardStatus } from '@/lib/cashflow-cards'
import { LEVERAGE_STATUS_LABEL } from '@/lib/leverage-status'
import { dailyExpenseRate } from '@/lib/format'
import { CATEGORY_LABELS, type RecurringCategory } from '@/lib/recurring-detection'
import type { VasteLastenItem, VasteLastenSummary } from '@/lib/vaste-lasten-summary'

/**
 * S2 — "Vaste lasten in Eenvoudig: oordeel boven lijst".
 *
 * Twee dingen liggen hier hard vast:
 *  1. EENVOUDIG toont dúiding vóór de lijst (oordeelregel + quote-meter +
 *     sluipverbruik + top-5) en zet de volle lijst achter "Alle {n} posten".
 *  2. VOLLEDIG verandert NIET — dat was het acceptatiecriterium dat de
 *     eenvoudige-weergave-audit door al zijn fasen heen aanhield.
 *
 * Het oordeelswoord wordt bewust tegen de CANONIEKE motor gepind
 * (`vasteLastenCardStatus` → `LEVERAGE_STATUS_LABEL`), niet tegen een letterlijke
 * string: zo vangt de test ook weergave-drift (verkeerd veld, verkeerde
 * grondslag) en niet alleen "er staat een woord".
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ data: [], error: null }) }) }),
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}))

afterEach(cleanup)

function mkItem(
  id: string,
  name: string,
  monthlyAmount: number,
  category: RecurringCategory,
): VasteLastenItem {
  return {
    id,
    name,
    averageAmount: monthlyAmount,
    monthlyAmount,
    frequency: 'monthly',
    nextDate: null,
    confidence: 'high',
    isVariableAmount: false,
    occurrences: null,
    alreadyConfirmed: true,
    category,
    categoryLabel: CATEGORY_LABELS[category],
    categoryOverride: null,
  }
}

// Zes abonnementen + één huur = 7 posten, zodat de top-5-cap echt bijt.
const subscriptions = [
  mkItem('s1', 'Netflix', 16, 'subscription'),
  mkItem('s2', 'Spotify', 12, 'subscription'),
  mkItem('s3', 'Sportschool', 35, 'subscription'),
  mkItem('s4', 'Krant', 9, 'subscription'),
  mkItem('s5', 'Cloudopslag', 4, 'subscription'),
  mkItem('s6', 'Streaming extra', 8, 'subscription'),
]
const vasteKosten = [
  mkItem('v1', 'Huur', 900, 'rent'),
  mkItem('v2', 'Zorgverzekering', 140, 'insurance'),
]

const MONTHLY_INCOME = 4000

function mkSummary(): VasteLastenSummary {
  const totalSubs = subscriptions.reduce((s, i) => s + i.monthlyAmount, 0)
  const totalVast = vasteKosten.reduce((s, i) => s + i.monthlyAmount, 0)
  return {
    subscriptions,
    vasteKosten,
    terugkerendVariabel: [],
    totalMonthlySubscriptions: totalSubs,
    totalMonthlyVasteKosten: totalVast,
    totalMonthlyVariabel: 0,
    totalMonthly: totalSubs + totalVast,
    count: subscriptions.length + vasteKosten.length,
  }
}

const summary = mkSummary()
const insights = buildVasteLastenInsights({
  summary,
  monthlyIncome: MONTHLY_INCOME,
  dailyExpenseRate: dailyExpenseRate(2500),
})

function renderInMode(mode: 'simple' | 'full') {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <VasteLastenClient
        insights={insights}
        subscriptions={subscriptions}
        vasteKosten={vasteKosten}
        terugkerendVariabel={[]}
        fullName="Test Gebruiker"
      />
    </DisplayModeProvider>,
  )
}

describe('VasteLastenClient — Eenvoudig (S2)', () => {
  it('toont het oordeel dat de canonieke statusmotor voor deze cijfers geeft', () => {
    renderInMode('simple')
    // Verwachting uit de MOTOR, niet uit een hardgecodeerde string.
    const verwachteStatus = vasteLastenCardStatus({
      totalMonthly: summary.totalMonthly,
      count: summary.count,
      monthlyIncome: MONTHLY_INCOME,
    })
    const verwachtWoord = LEVERAGE_STATUS_LABEL[verwachteStatus]
    expect(screen.getAllByText(verwachtWoord).length).toBeGreaterThan(0)
    // Het aandeel dat de deck noemt is exact `insights.ratioPct`.
    expect(insights.ratioPct).not.toBeNull()
    expect(screen.getAllByText(`${insights.ratioPct}%`).length).toBeGreaterThan(0)
  })

  it('zet de duidingsblokken vóór de lijst en de volle lijst achter "Alle {n} posten"', () => {
    renderInMode('simple')
    expect(screen.getByText('Vaste-lastenquote')).toBeTruthy()
    expect(screen.getByText('Abonnementen-sluipverbruik')).toBeTruthy()
    expect(screen.getByText('Grootste posten')).toBeTruthy()

    const depth = screen.getByTestId('depth-section')
    expect(depth.getAttribute('data-collapsed')).toBe('true')
    expect(
      within(depth).getByTestId('depth-section-title').textContent,
    ).toBe(`Alle ${summary.count} posten`)
  })

  it('capt de grootste posten op vijf en sorteert aflopend', () => {
    expect(insights.topItems).toHaveLength(5)
    expect(insights.topItems.map((i) => i.name)).toEqual([
      'Huur',
      'Zorgverzekering',
      'Sportschool',
      'Netflix',
      'Spotify',
    ])
    renderInMode('simple')
    const blok = screen.getByText('Grootste posten').closest('section')
    expect(blok).not.toBeNull()
    // De zesde grootste post staat NIET in het top-5-blok.
    expect(within(blok as HTMLElement).queryByText('Krant')).toBeNull()
  })

  it('laat de uitgebreide Volledig-blokken weg', () => {
    renderInMode('simple')
    expect(screen.queryByText('In vrijheidstijd')).toBeNull()
    expect(screen.queryByText('Samenstelling')).toBeNull()
    expect(screen.queryByText('Wat als ik opzeg')).toBeNull()
  })
})

describe('VasteLastenClient — Volledig blijft ongewijzigd (S2)', () => {
  it('toont alle vijf inzicht-blokken', () => {
    renderInMode('full')
    for (const kicker of [
      'Vaste-lastenquote',
      'In vrijheidstijd',
      'Abonnementen-sluipverbruik',
      'Samenstelling',
      'Wat als ik opzeg',
    ]) {
      expect(screen.getByText(kicker)).toBeTruthy()
    }
  })

  it('zet de lijst NIET achter een DepthSection en toont geen oordeelregel of top-5', () => {
    renderInMode('full')
    expect(screen.queryByTestId('depth-section')).toBeNull()
    expect(screen.queryByText('Grootste posten')).toBeNull()
    // De compacte aandeel-meter uit de kop blijft in Volledig staan.
    expect(screen.getByText('Aandeel van je inkomen')).toBeTruthy()
  })
})
