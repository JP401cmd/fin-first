import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, fireEvent, screen } from '@testing-library/react'
import type { AssetQuickInput, DebtQuickInput } from '@/lib/quick-add/types'

// Mock de QuickAddWizard: rendert (wanneer open) één knop die exact één item
// via `onCollect` teruggeeft — zo kunnen we de begeleide ja/nee-loop testen
// zonder de hele wizard-stack (BottomSheet-portal, toasts) mee te slepen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
vi.mock('@/components/app/quick-add-wizard/quick-add-wizard', () => ({
  QuickAddWizard: ({ open, onCollect, initialAssetType }: any) =>
    open ? (
      <button
        type="button"
        data-testid="wizard-collect"
        onClick={() =>
          onCollect({
            kind: 'asset',
            asset: { asset_type: initialAssetType, name: `Test ${initialAssetType}`, current_value: 1000 },
          })
        }
      >
        collect
      </button>
    ) : null,
}))

import { OnboardingBezittingen } from './onboarding-bezittingen'

afterEach(() => vi.clearAllMocks())

// OnboardingShell rendert de footer dubbel (desktop + mobiele sticky bar);
// footer-knoppen pakken we via de eerste match.
const footerButton = (name: string | RegExp) =>
  screen.getAllByRole('button', { name })[0]
const footerText = (text: string | RegExp) => screen.getAllByText(text)[0]

/** Controlled host die quickAssets/quickDebts vasthoudt (zoals de orchestrator). */
function Host({ onNext = vi.fn() }: { onNext?: () => void }) {
  const [assets, setAssets] = useState<AssetQuickInput[]>([])
  const [debts, setDebts] = useState<DebtQuickInput[]>([])
  return (
    <OnboardingBezittingen
      quickAssets={assets}
      quickDebts={debts}
      onAssetsChange={setAssets}
      onDebtsChange={setDebts}
      onNext={onNext}
      onBack={vi.fn()}
    />
  )
}

describe('OnboardingBezittingen — begeleide ja/nee-flow', () => {
  it('opent met de eerste ja/nee-vraag "Heb je een betaalrekening?"', () => {
    const { container } = render(<Host />)
    expect(container.textContent).toContain('Heb je een betaalrekening?')
  })

  it('"Sla bezittingen over" op de eerste vraag rondt de sectie af', () => {
    const onNext = vi.fn()
    render(<Host onNext={onNext} />)
    fireEvent.click(footerText('Sla bezittingen over'))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('"Nee" gaat door naar de volgende vraag (spaargeld)', () => {
    const { container } = render(<Host />)
    fireEvent.click(footerButton('Nee'))
    expect(container.textContent).toContain('Heb je spaargeld?')
  })

  it('"Ja" → wizard → collect voegt een post toe en toont de "nog een?"-loop', () => {
    const { container } = render(<Host />)
    fireEvent.click(footerButton('Ja'))
    // Wizard open → collecteer één item.
    fireEvent.click(screen.getByTestId('wizard-collect'))
    // Item verschijnt in het lopende overzicht.
    expect(container.textContent).toContain('Test cash')
    // En de "nog een?"-vervolgvraag verschijnt.
    expect(container.textContent).toContain('Nog een')
  })

  it('de "nog een?"-loop voegt meerdere posten toe tot "Nee"', () => {
    const { container } = render(<Host />)
    fireEvent.click(footerButton('Ja'))
    fireEvent.click(screen.getByTestId('wizard-collect'))
    // Tweede ronde via "Ja" in de more-fase.
    fireEvent.click(footerButton('Ja'))
    fireEvent.click(screen.getByTestId('wizard-collect'))
    const occurrences = (container.textContent ?? '').split('Test cash').length - 1
    expect(occurrences).toBe(2)
    // "Nee" verlaat de loop → volgende vraag (spaargeld).
    fireEvent.click(footerButton('Nee'))
    expect(container.textContent).toContain('Heb je spaargeld?')
  })
})

// ── Gekoppeld huis ↔ hypotheek (onboarding-paar, controlled props) ─────────

const HOUSE: AssetQuickInput = {
  asset_type: 'eigen_huis',
  name: 'Mijn woning',
  current_value: 500_000,
  client_ref: 'ref-1',
}
const LINKED_MORTGAGE: DebtQuickInput = {
  debt_type: 'mortgage',
  name: 'Hypotheek — Mijn woning',
  current_balance: 300_000,
  linked_asset_id: null,
  linked_client_ref: 'ref-1',
}

function renderWith(
  quickAssets: AssetQuickInput[],
  quickDebts: DebtQuickInput[],
  spies: Partial<{ onAssetsChange: (i: AssetQuickInput[]) => void; onDebtsChange: (i: DebtQuickInput[]) => void }> = {},
) {
  return render(
    <OnboardingBezittingen
      quickAssets={quickAssets}
      quickDebts={quickDebts}
      onAssetsChange={spies.onAssetsChange ?? vi.fn()}
      onDebtsChange={spies.onDebtsChange ?? vi.fn()}
      onNext={vi.fn()}
      onBack={vi.fn()}
    />,
  )
}

describe('OnboardingBezittingen — gekoppelde hypotheek', () => {
  it('toont de gekoppelde hypotheek gegroepeerd (met "gekoppeld")', () => {
    const { container } = renderWith([HOUSE], [LINKED_MORTGAGE])
    const text = container.textContent ?? ''
    expect(text).toContain('Mijn woning')
    expect(text).toContain('Hypotheek — Mijn woning')
    expect(text).toContain('gekoppeld')
    const occurrences = text.split('Hypotheek — Mijn woning').length - 1
    expect(occurrences).toBe(1)
  })

  it('huis verwijderen ontkoppelt de hypotheek (blijft als losse schuld), huis verdwijnt', () => {
    const onAssetsChange = vi.fn()
    const onDebtsChange = vi.fn()
    const { getByLabelText } = renderWith([HOUSE], [LINKED_MORTGAGE], { onAssetsChange, onDebtsChange })

    fireEvent.click(getByLabelText('Verwijder Mijn woning'))

    expect(onAssetsChange).toHaveBeenCalledWith([])
    expect(onDebtsChange).toHaveBeenCalledWith([
      { ...LINKED_MORTGAGE, linked_client_ref: null },
    ])
  })

  it('rendert een eigen verwijder-knop voor de gekoppelde hypotheek', () => {
    const onDebtsChange = vi.fn()
    const { getByLabelText } = renderWith([HOUSE], [LINKED_MORTGAGE], { onDebtsChange })
    fireEvent.click(getByLabelText('Verwijder Hypotheek — Mijn woning'))
    expect(onDebtsChange).toHaveBeenCalledWith([])
  })
})
