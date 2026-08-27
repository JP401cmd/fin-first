/**
 * Regressietest voor bevinding M12 — "twee tot drie stappentellers tegelijk".
 *
 * In de onboarding draait de QuickAddWizard in collect-modus binnen een flow
 * die zélf al een voortgangsbalk voert (`OnboardingProgressBar`, "3/8"). Die
 * balk blijft door de half-transparante BottomSheet-backdrop heen zichtbaar,
 * terwijl de modal een eigen telling op een andere schaal voerde ("Stap 1 van
 * 2") — en bij het hypotheek-ja-pad hetzelfde nummer 2/2 hergebruikte voor twee
 * inhoudelijk verschillende schermen.
 *
 * Deze test borgt: collect-modus telt niet mee (alleen kicker/titel blijven),
 * commit-modus (standalone, zonder buitenbalk) houdt zijn telling ongewijzigd.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StepHeader } from '../step-header'
import { QuickAddWizard } from '../quick-add-wizard'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

beforeEach(() => vi.clearAllMocks())

describe('StepHeader — showStepCount', () => {
  it('toont "Stap N van M" standaard, mét kicker', () => {
    render(<StepHeader step={1} total={2} title="Eigen woning" kicker="Gegevens" />)

    expect(screen.getByText(/Stap 1 van 2/)).toBeTruthy()
    expect(screen.getByText(/Gegevens/)).toBeTruthy()
  })

  it('onderdrukt de telling bij showStepCount={false}, maar houdt de kicker', () => {
    render(
      <StepHeader
        step={1}
        total={2}
        title="Eigen woning"
        kicker="Gegevens"
        showStepCount={false}
      />,
    )

    expect(screen.queryByText(/Stap 1 van 2/)).toBeNull()
    expect(screen.getByText('Gegevens')).toBeTruthy()
    expect(screen.getByText('Eigen woning')).toBeTruthy()
  })

  it('laat de meta-regel helemaal weg zonder telling én zonder kicker', () => {
    const { container } = render(
      <StepHeader step={1} total={2} title="Eigen woning" showStepCount={false} />,
    )

    expect(container.querySelector('p')).toBeNull()
    expect(screen.getByText('Eigen woning')).toBeTruthy()
  })
})

describe('QuickAddWizard — modal-telling per modus', () => {
  it('collect-modus (onboarding): geen "Stap X van Y" op het hele eigen-huis-pad', async () => {
    render(
      <QuickAddWizard
        open
        onClose={vi.fn()}
        initialIntent="asset"
        initialAssetType="eigen_huis"
        mode="collect"
        onCollect={vi.fn()}
      />,
    )

    // Scherm 1 — huisgegevens.
    expect(screen.queryByText(/Stap \d+ van \d+/)).toBeNull()

    fireEvent.change(screen.getByLabelText('Huidige waarde'), {
      target: { value: '500000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))

    // Scherm 2 — de gekoppelde-schuld-prompt (hergebruikte 2/2 in de oude situatie).
    const jaKnop = await screen.findByRole('button', { name: 'Ja, hypotheek toevoegen' })
    expect(screen.queryByText(/Stap \d+ van \d+/)).toBeNull()

    // Scherm 3 — het hypotheek-formulier onder hetzelfde oude stapnummer.
    fireEvent.click(jaKnop)
    await screen.findByLabelText('Huidig saldo')
    expect(screen.queryByText(/Stap \d+ van \d+/)).toBeNull()
  })

  it('commit-modus (standalone): behoudt zijn eigen telling', () => {
    render(
      <QuickAddWizard
        open
        onClose={vi.fn()}
        initialIntent="asset"
        initialAssetType="eigen_huis"
        mode="commit"
      />,
    )

    expect(screen.getByText(/Stap 1 van 2/)).toBeTruthy()
  })
})
