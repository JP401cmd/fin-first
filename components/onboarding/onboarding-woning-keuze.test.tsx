import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, fireEvent, screen } from '@testing-library/react'
import { OnboardingWoningKeuze } from './onboarding-woning-keuze'
import {
  HOUSING_CHOICE_INTRO,
  HOUSING_CHOICE_OPTIONS,
  HOUSING_CHOICE_QUESTION,
  type HousingChoice,
} from '@/lib/housing-choice'

/**
 * Stap iii-a "Telt je woning mee voor je vrijheid?" (ADR 0133). Deze suite pint
 * drie dingen die stil kapot kunnen: dat de kopij uit `lib/housing-choice.ts`
 * komt (en niet uit een tweede, hier overgetypte formulering), dat de tegels
 * hun aan/uit-staat aan hulptechnologie melden, en dat "Verder" pas kan zodra
 * er een keuze ligt — de app mag hier geen kant kiezen namens de gebruiker.
 */

// OnboardingShell rendert de footer dubbel (desktop + mobiele sticky bar).
const verder = () => screen.getAllByRole('button', { name: 'Verder' })[0]
const tegel = (choice: HousingChoice) =>
  screen.getByRole('button', {
    name: new RegExp(HOUSING_CHOICE_OPTIONS.find((o) => o.choice === choice)!.name, 'i'),
  })

function Harness({
  initial = null,
  onNext = vi.fn(),
}: {
  initial?: HousingChoice | null
  onNext?: () => void
}) {
  const [value, setValue] = useState<HousingChoice | null>(initial)
  return (
    <OnboardingWoningKeuze
      value={value}
      onChange={setValue}
      onNext={onNext}
      onBack={vi.fn()}
      kicker="Bezit"
      romanNum="iii."
      factsPanel={null}
      currentStep={3}
      totalSteps={7}
    />
  )
}

describe('OnboardingWoningKeuze — de vraag in gewone taal', () => {
  it('toont de vraag en de toelichting letterlijk uit lib/housing-choice.ts', () => {
    const { container } = render(<Harness />)
    expect(container.textContent).toContain(HOUSING_CHOICE_QUESTION)
    expect(container.textContent).toContain(HOUSING_CHOICE_INTRO)
  })

  it('biedt exact de twee keuzes, met hun uitleg', () => {
    const { container } = render(<Harness />)
    for (const opt of HOUSING_CHOICE_OPTIONS) {
      expect(tegel(opt.choice)).toBeInTheDocument()
      expect(container.textContent).toContain(opt.subtitle)
    }
    // Geen derde weg: `include_full` en `reverse_mortgage` blijven expert-modi.
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(
      HOUSING_CHOICE_OPTIONS.length,
    )
  })

  it('zet de tegels in één groep met de vraag als label', () => {
    render(<Harness />)
    expect(screen.getByRole('group', { name: HOUSING_CHOICE_QUESTION })).toBeInTheDocument()
  })
})

describe('OnboardingWoningKeuze — kiezen en doorgaan', () => {
  it('markeert de gekozen tegel als ingedrukt, en de andere niet', () => {
    render(<Harness />)
    fireEvent.click(tegel('exclude'))
    expect(tegel('exclude')).toHaveAttribute('aria-pressed', 'true')
    expect(tegel('sell')).toHaveAttribute('aria-pressed', 'false')
  })

  it('toont een eerder gemaakte keuze terug (terugkeer via Terug)', () => {
    render(<Harness initial="sell" />)
    expect(tegel('sell')).toHaveAttribute('aria-pressed', 'true')
  })

  it('laat "Verder" pas toe zodra er een keuze ligt', () => {
    const onNext = vi.fn()
    render(<Harness onNext={onNext} />)
    expect(verder()).toBeDisabled()
    fireEvent.click(verder())
    expect(onNext).not.toHaveBeenCalled()

    fireEvent.click(tegel('sell'))
    expect(verder()).toBeEnabled()
    fireEvent.click(verder())
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('een tweede tegelklik vervangt de keuze en gaat niet zelf door', () => {
    const onNext = vi.fn()
    render(<Harness onNext={onNext} />)
    fireEvent.click(tegel('sell'))
    fireEvent.click(tegel('exclude'))
    expect(tegel('exclude')).toHaveAttribute('aria-pressed', 'true')
    expect(tegel('sell')).toHaveAttribute('aria-pressed', 'false')
    expect(onNext).not.toHaveBeenCalled()
  })
})
