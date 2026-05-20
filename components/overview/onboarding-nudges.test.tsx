import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OnboardingNudges } from './onboarding-nudges'

beforeEach(() => {
  window.localStorage.clear()
})

describe('OnboardingNudges — render', () => {
  it('rendert niets wanneer alle 3 stappen done', async () => {
    const { container } = render(
      <OnboardingNudges hasDob hasAssets hasGoals />,
    )
    // Wacht op useEffect hydration
    await new Promise((r) => setTimeout(r, 10))
    expect(container.querySelector('section')).toBeNull()
  })

  it('toont section wanneer 0/3 done', async () => {
    render(
      <OnboardingNudges hasDob={false} hasAssets={false} hasGoals={false} />,
    )
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.getByText(/0\/3 voltooid/)).toBeTruthy()
  })

  it('toont 3 stappen-rijen', async () => {
    render(
      <OnboardingNudges hasDob={false} hasAssets={false} hasGoals={false} />,
    )
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.getByText('Geboortejaar invullen')).toBeTruthy()
    expect(screen.getByText('Eerste rekening toevoegen')).toBeTruthy()
    expect(screen.getByText('Eerste doel formuleren')).toBeTruthy()
  })

  it('voltooide stap toont check-icon en line-through', async () => {
    const { container } = render(
      <OnboardingNudges hasDob hasAssets={false} hasGoals={false} />,
    )
    await new Promise((r) => setTimeout(r, 10))
    // bg-emerald-500 op de voltooide stap-bolletje
    expect(container.querySelector('.bg-emerald-500')).toBeTruthy()
    // line-through op de voltooide label
    expect(container.querySelector('.line-through')).toBeTruthy()
  })

  it('toont "1/3 voltooid" bij één done', async () => {
    render(
      <OnboardingNudges hasDob hasAssets={false} hasGoals={false} />,
    )
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.getByText(/1\/3 voltooid/)).toBeTruthy()
  })

  it('CTA-link verschijnt alleen op onvoltooide stappen', async () => {
    const { container } = render(
      <OnboardingNudges hasDob hasAssets={false} hasGoals={false} />,
    )
    await new Promise((r) => setTimeout(r, 10))
    const links = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    // hasDob=true → /mijn/profiel link NIET aanwezig
    expect(links.some((h) => h === '/mijn/profiel')).toBe(false)
    // hasAssets=false → /overzicht/bezittingen wel
    expect(links.some((h) => h === '/overzicht/bezittingen')).toBe(true)
    // hasGoals=false → /toekomst?tab=doelen wel
    expect(links.some((h) => h?.includes('tab=doelen'))).toBe(true)
  })
})

describe('OnboardingNudges — dismiss', () => {
  it('verbergt zichzelf na X-klik en persisteert in localStorage', async () => {
    const { container } = render(
      <OnboardingNudges hasDob={false} hasAssets={false} hasGoals={false} />,
    )
    await new Promise((r) => setTimeout(r, 10))
    expect(container.querySelector('section')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Onboarding-nudges verbergen'))
    expect(container.querySelector('section')).toBeNull()
    expect(window.localStorage.getItem('tf-onboarding-dismissed')).toBe('1')
  })

  it('rendert niets bij localStorage="1" (eerder dismissed)', async () => {
    window.localStorage.setItem('tf-onboarding-dismissed', '1')
    const { container } = render(
      <OnboardingNudges hasDob={false} hasAssets={false} hasGoals={false} />,
    )
    await new Promise((r) => setTimeout(r, 10))
    expect(container.querySelector('section')).toBeNull()
  })
})
