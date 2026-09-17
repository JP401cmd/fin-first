/**
 * Elke nieuwe onboardingvraag begint bovenaan. Given een pagina die naar
 * beneden gescrold is, When de shell een andere kop krijgt (micro-vraag binnen
 * een stap) of opnieuw mount (stapwissel), Then scrollt hij naar boven — en
 * bij een render zónder kopwissel niet (melding 17-09-2026, Android).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { OnboardingShell } from './onboarding-shell'

function Shell({ title, deck = 'x' }: { title: string; deck?: string }) {
  return (
    <OnboardingShell kicker="BEZIT" title={title} deck={deck} factsPanel={null} footer={null} currentStep={3} totalSteps={9}>
      <div />
    </OnboardingShell>
  )
}

describe('OnboardingShell — scroll naar boven bij een nieuwe vraag', () => {
  let scrollTo: ReturnType<typeof vi.fn>
  beforeEach(() => {
    scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    Object.defineProperty(window, 'scrollY', { value: 600, configurable: true })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
  })

  it('scrollt bij mount, bij een kopwissel, en niet bij een gewone her-render', () => {
    const { rerender } = render(<Shell title="Heb je een betaalrekening?" />)
    expect(scrollTo).toHaveBeenCalledTimes(1)

    rerender(<Shell title="Heb je een betaalrekening?" deck="ander deck" />)
    expect(scrollTo).toHaveBeenCalledTimes(1)

    rerender(<Shell title="Heb je een spaargeldrekening?" />)
    expect(scrollTo).toHaveBeenCalledTimes(2)
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' })
  })

  it('doet niets als de pagina al bovenaan staat', () => {
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    render(<Shell title="Wat verdien je?" />)
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
