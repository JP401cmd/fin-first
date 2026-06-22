import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import type { AssetQuickInput, DebtQuickInput } from '@/lib/quick-add/types'

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

// ── Gekoppeld huis ↔ hypotheek (onboarding-paar) ─────────────────────────

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
const STUDIESCHULD: DebtQuickInput = {
  debt_type: 'student_loan',
  name: 'DUO',
  current_balance: 15_000,
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
  it('toont de gekoppelde hypotheek gegroepeerd (met "gekoppeld") en NIET in een aparte schulden-sectie', () => {
    const { container } = renderWith([HOUSE], [LINKED_MORTGAGE])
    const text = container.textContent ?? ''
    expect(text).toContain('Mijn woning')
    expect(text).toContain('Hypotheek — Mijn woning')
    // Sub-rij draagt de "gekoppeld"-affordance.
    expect(text).toContain('gekoppeld')
    // De hypotheek staat gegroepeerd onder het huis — niet dubbel in een aparte
    // schulden-lijst. (De "Schulden"-regel in het facts-paneel is het cumulatief
    // totaal, geen tweede rij.)
    const occurrences = text.split('Hypotheek — Mijn woning').length - 1
    expect(occurrences).toBe(1)
  })

  it('"Nee" → alleen het huis, geen hypotheek-rij', () => {
    const houseOnly: AssetQuickInput = { asset_type: 'eigen_huis', name: 'Los huis', current_value: 400_000 }
    const { container } = renderWith([houseOnly], [])
    const text = container.textContent ?? ''
    expect(text).toContain('Los huis')
    expect(text).not.toContain('gekoppeld')
  })

  it('losse schuld verschijnt wél in de schulden-sectie, gekoppelde niet', () => {
    const { container } = renderWith([HOUSE], [LINKED_MORTGAGE, STUDIESCHULD])
    const text = container.textContent ?? ''
    expect(text).toContain('Schulden')
    expect(text).toContain('DUO')
    // De hypotheek staat onder het huis (gekoppeld), niet dubbel.
    expect(text).toContain('gekoppeld')
  })

  it('huis verwijderen ontkoppelt de hypotheek (blijft als losse schuld), huis verdwijnt', () => {
    const onAssetsChange = vi.fn()
    const onDebtsChange = vi.fn()
    const { getByLabelText } = renderWith([HOUSE], [LINKED_MORTGAGE], { onAssetsChange, onDebtsChange })

    fireEvent.click(getByLabelText('Verwijder Mijn woning'))

    // Huis verdwijnt uit de assets.
    expect(onAssetsChange).toHaveBeenCalledWith([])
    // Hypotheek behouden maar ontkoppeld (linked_client_ref → null).
    expect(onDebtsChange).toHaveBeenCalledWith([
      { ...LINKED_MORTGAGE, linked_client_ref: null },
    ])
  })

  it('rendert een eigen verwijder-knop voor de gekoppelde hypotheek', () => {
    const onDebtsChange = vi.fn()
    const { getByLabelText } = renderWith([HOUSE], [LINKED_MORTGAGE], { onDebtsChange })
    fireEvent.click(getByLabelText('Verwijder Hypotheek — Mijn woning'))
    // Alleen de hypotheek (index 0) wordt verwijderd; het huis blijft.
    expect(onDebtsChange).toHaveBeenCalledWith([])
  })
})
