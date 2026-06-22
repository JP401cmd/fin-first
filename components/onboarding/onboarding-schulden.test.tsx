import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, fireEvent, screen } from '@testing-library/react'
import type { DebtQuickInput } from '@/lib/quick-add/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
vi.mock('@/components/app/quick-add-wizard/quick-add-wizard', () => ({
  QuickAddWizard: ({ open, onCollect, initialDebtType }: any) =>
    open ? (
      <button
        type="button"
        data-testid="wizard-collect"
        onClick={() =>
          onCollect({
            kind: 'debt',
            debt: { debt_type: initialDebtType, name: `Test ${initialDebtType}`, current_balance: 5000 },
          })
        }
      >
        collect
      </button>
    ) : null,
}))

import { OnboardingSchulden } from './onboarding-schulden'

afterEach(() => vi.clearAllMocks())

// OnboardingShell rendert de footer dubbel (desktop + mobiele sticky bar).
const footerButton = (name: string | RegExp) =>
  screen.getAllByRole('button', { name })[0]
const footerText = (text: string | RegExp) => screen.getAllByText(text)[0]

function Host({
  initialDebts = [],
  onNext = vi.fn(),
}: {
  initialDebts?: DebtQuickInput[]
  onNext?: () => void
}) {
  const [debts, setDebts] = useState<DebtQuickInput[]>(initialDebts)
  return (
    <OnboardingSchulden
      quickDebts={debts}
      onDebtsChange={setDebts}
      onNext={onNext}
      onBack={vi.fn()}
    />
  )
}

describe('OnboardingSchulden — begeleide ja/nee met altijd-uitgang', () => {
  it('opent met de eerste schuld-vraag "Heb je een hypotheek?"', () => {
    const { container } = render(<Host />)
    expect(container.textContent).toContain('Heb je een hypotheek?')
  })

  it('biedt op elke vraag een drempelloze sectie-uitgang die de sectie afsluit', () => {
    const onNext = vi.fn()
    render(<Host onNext={onNext} />)
    fireEvent.click(footerText('Ik heb (verder) geen schulden'))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('de uitgang blijft beschikbaar op een latere vraag (en sluit de sectie)', () => {
    const onNext = vi.fn()
    const { container } = render(<Host onNext={onNext} />)
    // "Nee" → volgende vraag (studielening).
    fireEvent.click(footerButton('Nee'))
    expect(container.textContent).toContain('Heb je een studielening?')
    // Exit nog steeds aanwezig en sluit de sectie.
    fireEvent.click(footerText('Ik heb (verder) geen schulden'))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('"Ja" → wizard → collect voegt een schuld toe en toont de "nog een?"-loop', () => {
    const { container } = render(<Host />)
    fireEvent.click(footerButton('Ja'))
    fireEvent.click(screen.getByTestId('wizard-collect'))
    expect(container.textContent).toContain('Test mortgage')
    expect(container.textContent).toContain('Nog een')
  })

  it('slaat de hypotheek-vraag over wanneer al een hypotheek aan het huis gekoppeld is', () => {
    const linkedMortgage: DebtQuickInput = {
      debt_type: 'mortgage',
      name: 'Hypotheek — Mijn woning',
      current_balance: 250_000,
      linked_asset_id: null,
      linked_client_ref: 'ref-1',
    }
    const { container } = render(<Host initialDebts={[linkedMortgage]} />)
    // Eerste vraag is dan studielening, niet hypotheek.
    expect(container.textContent).toContain('Heb je een studielening?')
    expect(container.textContent).not.toContain('Heb je een hypotheek?')
  })
})
