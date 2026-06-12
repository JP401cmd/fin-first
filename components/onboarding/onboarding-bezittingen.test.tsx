import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'

// QuickAddWizard sleept de halve quick-add-stack mee (BottomSheet-portal,
// icon-map, toasts). Voor deze stap-test is alleen relevant dát hij
// aangestuurd wordt — mock 'm leeg.
vi.mock('@/components/app/quick-add-wizard/quick-add-wizard', () => ({
  QuickAddWizard: () => null,
}))

import { OnboardingBezittingen } from './onboarding-bezittingen'

afterEach(() => vi.clearAllMocks())

function renderStep() {
  return render(
    <OnboardingBezittingen
      quickAssets={[]}
      quickDebts={[]}
      onAssetsChange={vi.fn()}
      onDebtsChange={vi.fn()}
      onNext={vi.fn()}
      onBack={vi.fn()}
    />,
  )
}

describe('OnboardingBezittingen — jun 2026 herziening', () => {
  it('toont de titel "Registreer je bezittingen en schulden"', () => {
    // De headline is opgeknipt in <em>-segmenten — match op de samengevoegde
    // heading-tekst i.p.v. getByText (zie memory: emphasis breekt getByText).
    const { container } = renderStep()
    const heading = container.querySelector('h2, h1')
    expect(heading?.textContent?.replace(/\s+/g, ' ')).toContain(
      'Registreer je bezittingen en schulden',
    )
  })

  it('geeft voorbeelden van bezittingen en schulden', () => {
    const { container } = renderStep()
    const text = container.textContent ?? ''
    expect(text).toContain('spaarrekening')
    expect(text).toContain('beleggingen')
    expect(text).toContain('Hypotheek')
    expect(text).toContain('studieschuld')
  })

  it('legt een "in ontwikkeling"-overlay over bank koppelen', () => {
    const { container } = renderStep()
    const text = container.textContent ?? ''
    expect(text).toContain('In ontwikkeling')
    expect(text).toContain('Bank koppelen')
    // De overlay-wrapper blokkeert interactie met de kaart eronder.
    expect(container.querySelector('[aria-disabled="true"]')).not.toBeNull()
  })

  it('heeft geen aangifte-upload meer als toevoeg-pad', () => {
    const { container } = renderStep()
    expect(container.textContent).not.toContain('Aangifte uploaden')
  })

  it('houdt de twee handmatige toevoeg-paden', () => {
    const { container } = renderStep()
    const text = container.textContent ?? ''
    expect(text).toContain('Bezitting toevoegen')
    expect(text).toContain('Schuld toevoegen')
  })
})
