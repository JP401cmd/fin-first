import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { VasteLastenClient } from './vaste-lasten-client'
import { buildVasteLastenInsights } from '@/lib/vaste-lasten-insights'
import { vasteLastenCardStatus } from '@/lib/cashflow-cards'
import { LEVERAGE_STATUS_LABEL } from '@/lib/leverage-status'
import { dailyExpenseRate } from '@/lib/format'
import { CATEGORY_LABELS, type RecurringCategory } from '@/lib/recurring-detection'
import type { VasteLastenItem, VasteLastenSummary } from '@/lib/vaste-lasten-summary'

/**
 * W-017 (19-09-2026) — "Vaste lasten: de lijst bovenaan, óók in Eenvoudig".
 * Herziet S2/VL-1 (oordeel boven lijst, lijst achter DepthSection, top-5).
 *
 * Drie dingen liggen hier hard vast:
 *  1. EENVOUDIG: één oordeelregel, dan de volle lijst DIRECT (geen
 *     DepthSection), dan quote-meter + sluipverbruik. Geen top-5 meer.
 *  2. VOLLEDIG: compacte meter, lijst, quote-meter + sluipverbruik, samenstelling.
 *  3. "In vrijheidstijd", "Wat als ik opzeg" en "Grootste posten" bestaan in
 *     GEEN van beide modi meer.
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

// Zes abonnementen + twee vaste kosten = 8 posten; 'Krant' (zesde grootste)
// zou onder het oude top-5-regime NIET in de eerste aanblik staan — nu wel.
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

const VERWIJDERDE_BLOKKEN = ['In vrijheidstijd', 'Wat als ik opzeg', 'Grootste posten']

describe('VasteLastenClient — Eenvoudig (W-017, herziet S2)', () => {
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

  it('zet de volle lijst DIRECT onder het oordeel — geen DepthSection, alle posten zichtbaar', () => {
    renderInMode('simple')
    expect(screen.queryByTestId('depth-section')).toBeNull()
    // De zesde grootste post (onder het oude top-5-regime onzichtbaar in de
    // eerste aanblik) staat gewoon in de lijst.
    expect(screen.getByText('Krant')).toBeTruthy()
  })

  it('zet de duiding (quote-meter + sluipverbruik) NÁ de lijst, niet ervoor', () => {
    renderInMode('simple')
    const lijstRij = screen.getByText('Krant')
    const quote = screen.getByText('Vaste-lastenquote')
    const sluip = screen.getByText('Abonnementen-sluipverbruik')
    // DOCUMENT_POSITION_FOLLOWING (4): het argument staat ná het subject.
    expect(lijstRij.compareDocumentPosition(quote) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(lijstRij.compareDocumentPosition(sluip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('laat de samenstelling (Volledig-verdieping) en de verwijderde blokken weg', () => {
    renderInMode('simple')
    expect(screen.queryByText('Samenstelling')).toBeNull()
    for (const kicker of VERWIJDERDE_BLOKKEN) {
      expect(screen.queryByText(kicker)).toBeNull()
    }
  })
})

describe('VasteLastenClient — Volledig (W-017)', () => {
  it('toont de drie overgebleven inzicht-blokken en geen van de verwijderde', () => {
    renderInMode('full')
    for (const kicker of ['Vaste-lastenquote', 'Abonnementen-sluipverbruik', 'Samenstelling']) {
      expect(screen.getByText(kicker)).toBeTruthy()
    }
    for (const kicker of VERWIJDERDE_BLOKKEN) {
      expect(screen.queryByText(kicker)).toBeNull()
    }
  })

  it('zet de lijst NIET achter een DepthSection en houdt de compacte meter in de kop', () => {
    renderInMode('full')
    expect(screen.queryByTestId('depth-section')).toBeNull()
    expect(screen.getByText('Aandeel van je inkomen')).toBeTruthy()
  })
})

/**
 * GRONDSLAG-REGEL (V-001) — "Gebaseerd op N rekeningen · M maanden transacties".
 *
 * De melding erachter was niet "dit getal klopt niet" maar "ik verwacht er
 * méér". Dat is alleen te beoordelen als het scherm zegt waar het naar kéék:
 * een ontbrekend abonnement kan een niet-gekoppelde rekening zijn óf een post
 * buiten het analysevenster. De regel hoort daarom in BEIDE weergavemodi te
 * staan — juist wie weinig ziet staan heeft hem nodig.
 */
function renderMetGrondslag(
  mode: 'simple' | 'full',
  detectionBasis?: { accountCount: number; months: number },
) {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <VasteLastenClient
        insights={insights}
        subscriptions={subscriptions}
        vasteKosten={vasteKosten}
        terugkerendVariabel={[]}
        fullName="Test Gebruiker"
        detectionBasis={detectionBasis}
      />
    </DisplayModeProvider>,
  )
}

describe('VasteLastenClient — grondslag-regel (V-001)', () => {
  it.each(['simple', 'full'] as const)('staat er in de %s-modus', (mode) => {
    renderMetGrondslag(mode, { accountCount: 3, months: 24 })
    expect(screen.getByText(/Gebaseerd op 3 rekeningen · 24 maanden transacties/)).toBeTruthy()
  })

  it('gebruikt enkelvoud bij één rekening', () => {
    renderMetGrondslag('full', { accountCount: 1, months: 24 })
    expect(screen.getByText(/Gebaseerd op 1 rekening · 24 maanden transacties/)).toBeTruthy()
  })

  it('blijft weg zonder grondslag — liever niets dan een verzonnen getal', () => {
    renderMetGrondslag('full')
    expect(screen.queryByText(/Gebaseerd op/)).toBeNull()
  })

  it('blijft weg bij nul rekeningen: dat is de boodschap van de lege staat, niet van deze regel', () => {
    renderMetGrondslag('full', { accountCount: 0, months: 24 })
    expect(screen.queryByText(/Gebaseerd op/)).toBeNull()
  })
})
