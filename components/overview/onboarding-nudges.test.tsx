import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OnboardingNudges } from './onboarding-nudges'

/**
 * Tests voor OnboardingNudges — sinds de R-7 refactor wordt de rendering
 * gedreven door `lib/onboarding-orchestrator`. Hier toetsen we:
 *   1. UI-aansluiting (stappen, completed-state, dismissibility)
 *   2. localStorage-persistentie van per-stap-dismissal
 *   3. Conditioneel verbergen wanneer alles afgerond is
 *
 * Pure state-machine-tests staan in `lib/onboarding-orchestrator.test.ts`.
 */

beforeEach(() => {
  window.localStorage.clear()
})

async function hydrate() {
  // useEffect-hydration uit localStorage
  await new Promise((r) => setTimeout(r, 10))
}

describe('OnboardingNudges — render', () => {
  it('rendert niets wanneer alle 3 stappen done en briefing-stap niet unlocked', async () => {
    const { container } = render(
      <OnboardingNudges hasDob hasAssets hasGoals accountAgeDays={0} />,
    )
    await hydrate()
    expect(container.querySelector('section')).toBeNull()
  })

  it('toont section wanneer 0 stappen done', async () => {
    render(
      <OnboardingNudges hasDob={false} hasAssets={false} hasGoals={false} />,
    )
    await hydrate()
    expect(screen.getByText(/0\/1 voltooid/)).toBeTruthy()
  })

  it('toont alleen unlocked stappen', async () => {
    render(
      <OnboardingNudges hasDob={false} hasAssets={false} hasGoals={false} />,
    )
    await hydrate()
    // DOB is unlocked, asset/goal locked tot DOB gezet is
    expect(screen.getByText('Geboortejaar invullen')).toBeTruthy()
    expect(screen.queryByText('Eerste rekening toevoegen')).toBeNull()
    expect(screen.queryByText('Eerste doel formuleren')).toBeNull()
  })

  it('na DOB toont eerste-rekening + voltooide DOB-stap', async () => {
    render(<OnboardingNudges hasDob hasAssets={false} hasGoals={false} />)
    await hydrate()
    // DOB als doorgestreepte completed-rij
    expect(screen.getByTestId('nudge-step-dob-done')).toBeTruthy()
    // Eerste rekening als open stap
    expect(screen.getByTestId('nudge-step-first-asset')).toBeTruthy()
  })

  it('toont briefing-stap pas na ≥ 7 dagen', async () => {
    const { rerender } = render(
      <OnboardingNudges hasDob hasAssets hasGoals accountAgeDays={3} />,
    )
    await hydrate()
    expect(screen.queryByText(/weekly briefing/i)).toBeNull()

    rerender(
      <OnboardingNudges hasDob hasAssets hasGoals accountAgeDays={7} />,
    )
    expect(screen.getByText(/weekly briefing/i)).toBeTruthy()
  })

  it('CTA-href volgt orchestrator (geen DOB-link bij hasDob=true)', async () => {
    const { container } = render(
      <OnboardingNudges hasDob hasAssets={false} hasGoals={false} />,
    )
    await hydrate()
    const links = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(links.some((h) => h === '/mijn/profiel')).toBe(false)
    expect(links.some((h) => h === '/overzicht/bezittingen')).toBe(true)
  })
})

describe('OnboardingNudges — per-stap dismiss', () => {
  it('skip-knop op een stap persisteert in localStorage', async () => {
    render(
      <OnboardingNudges hasDob={false} hasAssets={false} hasGoals={false} />,
    )
    await hydrate()
    const skipBtn = screen.getByLabelText(/Stap '.*' overslaan/i)
    fireEvent.click(skipBtn)
    // localStorage bevat nu de dismissed key
    const raw = window.localStorage.getItem('tf-onboarding-dismissed-keys')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw ?? '[]')
    expect(parsed).toContain('dob')
  })

  it('eerder gedismissed stap blijft verborgen na re-mount', async () => {
    window.localStorage.setItem(
      'tf-onboarding-dismissed-keys',
      JSON.stringify(['dob']),
    )
    render(
      <OnboardingNudges hasDob={false} hasAssets={false} hasGoals={false} />,
    )
    await hydrate()
    // DOB is gedismissed → niet meer als open stap zichtbaar
    expect(screen.queryByTestId('nudge-step-dob')).toBeNull()
  })
})
