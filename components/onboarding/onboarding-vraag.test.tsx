import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { OnboardingVraag } from './onboarding-vraag'

// OnboardingShell rendert de footer twee keer (desktop inline + mobiele sticky
// bar), dus footer-knoppen verschijnen dubbel in jsdom. We pakken de eerste.
const footerButton = (name: string | RegExp) =>
  screen.getAllByRole('button', { name })[0]
const footerText = (text: string | RegExp) => screen.getAllByText(text)[0]

function renderVraag(props: Partial<React.ComponentProps<typeof OnboardingVraag>> = {}) {
  return render(
    <OnboardingVraag
      kicker="Schuld"
      title={<span>Heb je een hypotheek?</span>}
      deck="Een schuld is vrijheid die je terugkoopt."
      onYes={props.onYes ?? vi.fn()}
      onNo={props.onNo ?? vi.fn()}
      currentStep={4}
      totalSteps={7}
      {...props}
    />,
  )
}

describe('OnboardingVraag', () => {
  it('toont de vraag en twee gelijkwaardige knoppen', () => {
    const { container } = renderVraag()
    expect(container.textContent).toContain('Heb je een hypotheek?')
    expect(footerButton('Ja')).toBeTruthy()
    expect(footerButton('Nee')).toBeTruthy()
  })

  it('roept onYes/onNo aan bij de juiste knop', () => {
    const onYes = vi.fn()
    const onNo = vi.fn()
    renderVraag({ onYes, onNo })
    fireEvent.click(footerButton('Ja'))
    expect(onYes).toHaveBeenCalledOnce()
    fireEvent.click(footerButton('Nee'))
    expect(onNo).toHaveBeenCalledOnce()
  })

  it('rendert een drempelloze sectie-uitgang alleen wanneer meegegeven', () => {
    const onExit = vi.fn()
    const { rerender } = renderVraag()
    expect(screen.queryAllByText('Ik heb (verder) geen schulden')).toHaveLength(0)
    rerender(
      <OnboardingVraag
        kicker="Schuld"
        title={<span>Heb je een hypotheek?</span>}
        deck="x"
        onYes={vi.fn()}
        onNo={vi.fn()}
        exitLabel="Ik heb (verder) geen schulden"
        onExit={onExit}
        currentStep={4}
        totalSteps={7}
      />,
    )
    fireEvent.click(footerText('Ik heb (verder) geen schulden'))
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('respecteert custom knoplabels', () => {
    renderVraag({ yesLabel: 'Ja, nog een', noLabel: 'Nee, klaar' })
    expect(footerButton('Ja, nog een')).toBeTruthy()
    expect(footerButton('Nee, klaar')).toBeTruthy()
  })
})
