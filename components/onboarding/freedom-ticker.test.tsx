import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { computeFreedomTicker, freedomTickerBasis, ONBOARDING_HOUSING_MODE } from '@/lib/freedom-ticker'
import { computeOnboardingCompleteness } from '@/lib/onboarding-completeness'
import {
  HOUSING_CHOICE_BASIS_SENTENCE,
  HOUSING_CHOICE_FALLBACK,
} from '@/lib/housing-choice'
import { OnboardingFreedomTickerProvider } from './freedom-ticker'
import { OnboardingShell } from './onboarding-shell'
import { OnboardingKlaar } from './onboarding-klaar'

/**
 * Weergave-assertie voor de meelopende vrijheidstijd-teller (bevinding H12).
 *
 * De unit-test in `lib/freedom-ticker.test.ts` pint de BEREKENING. Deze test
 * pint de WEERGAVE tegen exact diezelfde canonieke uitvoer: wat er op het
 * scherm staat is letterlijk `computeFreedomTicker(...).label`, voor dezelfde
 * persona-invoer. Zo valt een verkeerd doorgegeven veld of een stale mapping
 * om — een test die alleen "er staat een getal" controleert, zou dat niet zien.
 */
const PERSONA = {
  monthlyIncome: 3000,
  monthlyExpenses: 2100,
  assets: [
    { value: 2500, isHome: false },
    { value: 18000, isHome: false },
    { value: 12000, isHome: false },
    { value: 400000, isHome: true },
  ],
  debts: 9000,
  basis: freedomTickerBasis(ONBOARDING_HOUSING_MODE),
}

const CANONIEK = computeFreedomTicker(PERSONA)

function Shell({ label }: { label: string | null }) {
  return (
    <OnboardingFreedomTickerProvider label={label}>
      <OnboardingShell
        kicker="Bezit"
        title="Test"
        deck="Test-deck."
        factsPanel={<div />}
        footer={<button type="button">Verder</button>}
        currentStep={3}
        totalSteps={8}
      >
        <div />
      </OnboardingShell>
    </OnboardingFreedomTickerProvider>
  )
}

describe('meelopende teller in de onboarding-kop', () => {
  it('toont exact de canonieke tellerwaarde', () => {
    expect(CANONIEK).not.toBeNull()
    render(<Shell label={CANONIEK!.label} />)
    expect(screen.getByText('Al vrijgekocht')).toBeTruthy()
    // Geen los "er staat een getal": de gerenderde string IS de engine-uitvoer.
    expect(screen.getByText(CANONIEK!.label)).toBeTruthy()
    expect(CANONIEK!.label).toBe('1j 3m')
  })

  it('rendert niets zolang er geen eerlijke waarde is', () => {
    render(<Shell label={null} />)
    expect(screen.queryByText('Al vrijgekocht')).toBeNull()
  })
})

describe('eindscherm — zelfde getal, met grondslag-label', () => {
  const klaarProps = {
    netMonthlyIncome: 3000,
    netWorth: 2500 + 18000 + 12000 + 400000 - 9000,
    completeness: computeOnboardingCompleteness({
      fullName: 'Jan de Vries',
      dateOfBirth: '1985-04-12',
      netMonthlyIncome: 3000,
      monthlyExpenses: 2100,
      assetCount: 4,
      debtCount: 1,
      pensioenResultaat: null,
      spaardoel: null,
      eindstrategieBeantwoord: true,
    }),
    assets: [],
    debts: [],
    onAddMore: vi.fn(),
    onFinish: vi.fn(),
    onBack: vi.fn(),
  }

  it('toont dezelfde vrijheidstijd als de kop, plus waarom hij afwijkt van het vermogen', () => {
    render(
      <OnboardingKlaar {...klaarProps} freedomLabel={CANONIEK!.label} />,
    )
    expect(screen.getAllByText(new RegExp(`Al vrijgekocht`))[0]).toBeTruthy()
    // De grondslag-zin volgt sinds ADR 0133 de woning-keuze. Zonder keuze
    // (geen woning, of de vraag niet gesteld) geldt de terugval — dezelfde
    // lezing als vóór ADR 0133: de woning telt pas mee bij verkoop.
    expect(
      screen.getAllByText(HOUSING_CHOICE_BASIS_SENTENCE[HOUSING_CHOICE_FALLBACK])[0],
    ).toBeTruthy()
  })

  it('laat de grondslag-zin de woning-keuze volgen (ADR 0133)', () => {
    const { rerender } = render(
      <OnboardingKlaar {...klaarProps} freedomLabel={CANONIEK!.label} housingChoice="sell" />,
    )
    expect(screen.getAllByText(HOUSING_CHOICE_BASIS_SENTENCE.sell)[0]).toBeTruthy()
    expect(screen.queryByText(HOUSING_CHOICE_BASIS_SENTENCE.exclude)).toBeNull()

    rerender(
      <OnboardingKlaar {...klaarProps} freedomLabel={CANONIEK!.label} housingChoice="exclude" />,
    )
    expect(screen.getAllByText(HOUSING_CHOICE_BASIS_SENTENCE.exclude)[0]).toBeTruthy()
    expect(screen.queryByText(HOUSING_CHOICE_BASIS_SENTENCE.sell)).toBeNull()
  })

  it('valt zonder teller terug op de kwalitatieve zin', () => {
    render(
      <OnboardingKlaar {...klaarProps} freedomLabel={null} />,
    )
    expect(screen.getAllByText(/Je eerste vrijheid staat op de teller/)[0]).toBeTruthy()
  })
})
