import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, fireEvent, screen } from '@testing-library/react'
import type { AssetQuickInput, DebtQuickInput } from '@/lib/quick-add/types'
import { initialSectionPhases, type SectionPhase } from './section-phase'

/**
 * Regressie voor de terugknop-bug (Notion "Onboarding – Terugknop springt naar
 * pagina 1 van bezittingen").
 *
 * Twee garanties:
 *   1. Bínnen een sectie loopt Terug één scherm per klik terug (i.p.v. de hele
 *      groep over te slaan); pas op de eerste vraag valt 'ie terug op de
 *      groep-brede `onBack`.
 *   2. De fase-stack wordt door de orchestrator gelift, zodat Terug uit een
 *      latere groep (Schulden) op het laatst getoonde scherm van Bezittingen
 *      landt — het review-overzicht — i.p.v. op vraag 1.
 */

// Mock de QuickAddWizard: rendert (wanneer open) één knop die exact één item via
// `onCollect` teruggeeft — asset óf debt, afhankelijk van de intent.
vi.mock('@/components/app/quick-add-wizard/quick-add-wizard', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  QuickAddWizard: ({ open, onCollect, initialIntent, initialAssetType, initialDebtType }: any) =>
    open ? (
      <button
        type="button"
        data-testid="wizard-collect"
        onClick={() =>
          initialIntent === 'debt'
            ? onCollect({
                kind: 'debt',
                debt: {
                  debt_type: initialDebtType,
                  name: `Test ${initialDebtType}`,
                  current_balance: 500,
                  linked_asset_id: null,
                  linked_client_ref: null,
                },
              })
            : onCollect({
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
import { OnboardingSchulden } from './onboarding-schulden'

afterEach(() => vi.clearAllMocks())

// OnboardingShell rendert de footer dubbel (desktop + mobiele sticky bar);
// footer-knoppen pakken we via de eerste match.
const footerButton = (name: string | RegExp) => screen.getAllByRole('button', { name })[0]
const footerText = (text: string | RegExp) => screen.getAllByText(text)[0]
const backButton = () => screen.getAllByRole('button', { name: 'Vorige stap' })[0]

// ── (1) Terug loopt één scherm per klik terug binnen de sectie ─────────────

describe('Onboarding-terugknop — binnen een sectie', () => {
  /** Host die de posten vasthoudt (zoals de orchestrator), fase uncontrolled. */
  function Host({ onBack }: { onBack: () => void }) {
    const [assets, setAssets] = useState<AssetQuickInput[]>([])
    const [debts, setDebts] = useState<DebtQuickInput[]>([])
    return (
      <OnboardingBezittingen
        quickAssets={assets}
        quickDebts={debts}
        onAssetsChange={setAssets}
        onDebtsChange={setDebts}
        onNext={vi.fn()}
        onBack={onBack}
      />
    )
  }

  it('popt één scherm per klik en roept onBack pas op de eerste vraag aan', () => {
    const onBack = vi.fn()
    const { container } = render(<Host onBack={onBack} />)

    // Q1 → Q2 → Q3 (drie schermen diep).
    fireEvent.click(footerButton('Nee')) // betaalrekening → spaargeld
    fireEvent.click(footerButton('Nee')) // spaargeld → eigen huis
    expect(container.textContent).toContain('Heb je een eigen huis?')

    // Terug = één scherm terug (naar spaargeld), NIET de groep uit.
    fireEvent.click(backButton())
    expect(container.textContent).toContain('Heb je spaargeld?')
    expect(onBack).not.toHaveBeenCalled()

    // Nog een keer terug → terug op vraag 1.
    fireEvent.click(backButton())
    expect(container.textContent).toContain('Heb je een betaalrekening?')
    expect(onBack).not.toHaveBeenCalled()

    // Op de eerste vraag valt Terug terug op de groep-brede onBack.
    fireEvent.click(backButton())
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('behoudt toegevoegde posten bij terug-navigeren binnen de sectie', () => {
    const onBack = vi.fn()
    const { container } = render(<Host onBack={onBack} />)

    // Voeg een betaalrekening toe → "nog een cash?"-fase.
    fireEvent.click(footerButton('Ja'))
    fireEvent.click(screen.getByTestId('wizard-collect'))
    expect(container.textContent).toContain('Test cash')

    // Nee → volgende vraag (spaargeld). Dan terug → "nog een cash?".
    fireEvent.click(footerButton('Nee'))
    expect(container.textContent).toContain('Heb je spaargeld?')
    fireEvent.click(backButton())
    expect(container.textContent).toContain('Nog een')

    // De eerder ingevoerde post staat er nog steeds.
    expect(container.textContent).toContain('Test cash')
    expect(onBack).not.toHaveBeenCalled()
  })
})

// ── (2) Terug uit Schulden landt op de Bezittingen-review ──────────────────

describe('Onboarding-terugknop — tussen groepen (gelifte fase-stack)', () => {
  /**
   * Mini-orchestrator die — net als de echte page.tsx — de posten én de
   * fase-stacks lift, en tussen Bezittingen/Schulden schakelt. Zo bewijzen we
   * dat de Bezittingen-fase een remount overleeft.
   */
  function MiniOrchestrator() {
    const [step, setStep] = useState<'bezittingen' | 'schulden'>('bezittingen')
    const [assets, setAssets] = useState<AssetQuickInput[]>([])
    const [debts, setDebts] = useState<DebtQuickInput[]>([])
    const [bezPhases, setBezPhases] = useState<SectionPhase[]>(() => initialSectionPhases())
    const [schPhases, setSchPhases] = useState<SectionPhase[]>(() => initialSectionPhases())

    return step === 'bezittingen' ? (
      <OnboardingBezittingen
        quickAssets={assets}
        quickDebts={debts}
        onAssetsChange={setAssets}
        onDebtsChange={setDebts}
        onNext={() => setStep('schulden')}
        onBack={vi.fn()}
        phases={bezPhases}
        onPhasesChange={setBezPhases}
      />
    ) : (
      <OnboardingSchulden
        quickDebts={debts}
        onDebtsChange={setDebts}
        onNext={vi.fn()}
        onBack={() => setStep('bezittingen')}
        phases={schPhases}
        onPhasesChange={setSchPhases}
      />
    )
  }

  it('Terug op Schulden-vraag-1 keert terug op het Bezittingen-review (niet vraag 1)', () => {
    const { container } = render(<MiniOrchestrator />)

    // Voeg een betaalrekening toe en rond de bezittingen af tot het review.
    fireEvent.click(footerButton('Ja'))
    fireEvent.click(screen.getByTestId('wizard-collect'))
    fireEvent.click(footerButton('Nee')) // cash-more → spaargeld
    fireEvent.click(footerButton('Nee')) // eigen huis
    fireEvent.click(footerButton('Nee')) // beleggingen
    fireEvent.click(footerButton('Nee')) // → andere bezittingen?
    fireEvent.click(footerButton('Nee')) // → review
    expect(container.textContent).toContain('Dit zijn je bezittingen')

    // Ga door naar Schulden (remount van de sectie-boom).
    fireEvent.click(footerButton(/Klopt het/))
    expect(container.textContent).toContain('Heb je een hypotheek?')

    // Terug op Schulden-vraag-1 → groep terug naar Bezittingen. Die remount,
    // maar de gelifte fase-stack brengt 'm terug op het review — niet op vraag 1.
    fireEvent.click(backButton())
    expect(container.textContent).toContain('Dit zijn je bezittingen')
    expect(container.textContent).not.toContain('Heb je een betaalrekening?')
    // De eerder toegevoegde post is behouden.
    expect(footerText('Test cash')).toBeTruthy()
  })
})
