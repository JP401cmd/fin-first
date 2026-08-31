import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, fireEvent, screen } from '@testing-library/react'
import type { AssetQuickInput, DebtQuickInput } from '@/lib/quick-add/types'
import { formatCurrency } from '@/lib/format'

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
    expect(container.textContent).toContain('Heb je een spaargeldrekening?')
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
    expect(container.textContent).toContain('Heb je een spaargeldrekening?')
  })

  // Regressie L1: de meelopende teller in het FEITEN-paneel bouwde het
  // wérkwoord "bezitten" ("2 bezitten") en bij één post het kale "1 bezit".
  it('het FEITEN-paneel telt in "bezitting"/"bezittingen"', () => {
    const { container } = render(<Host />)
    fireEvent.click(footerButton('Ja'))
    fireEvent.click(screen.getByTestId('wizard-collect'))
    expect(container.textContent).toContain('1 bezitting')

    // Tweede post via de "nog een?"-lus → meervoud.
    fireEvent.click(footerButton('Ja'))
    fireEvent.click(screen.getByTestId('wizard-collect'))
    expect(container.textContent).toContain('2 bezittingen')
    expect(container.textContent).not.toContain('2 bezitten')
  })

  // Regressie L2: de "nog een?"-vraag telt één post en moet dus enkelvoud
  // gebruiken. `ASSET_QUICK_ADD_LABELS.investment` is bewust meervoud
  // ('Beleggingen') — zonder onboarding-override werd dat "Nog een beleggingen?".
  it('de "nog een?"-vraag staat in het enkelvoud bij beleggingen', () => {
    const { container } = render(<Host />)
    fireEvent.click(footerButton('Nee')) // betaalrekening
    fireEvent.click(footerButton('Nee')) // spaargeld
    fireEvent.click(footerButton('Nee')) // eigen huis
    expect(container.textContent).toContain('Heb je beleggingen?')
    fireEvent.click(footerButton('Ja'))
    fireEvent.click(screen.getByTestId('wizard-collect'))
    expect(container.textContent).toContain('Nog een belegging?')
    expect(container.textContent).not.toContain('Nog een beleggingen?')
  })
})

// ── Afsluitend overzicht (review-fase) ─────────────────────────────────

describe('OnboardingBezittingen — afsluitend overzicht', () => {
  /** Loopt de hele sectie af tot de catch-all "Heb je nog andere bezittingen?". */
  function advanceToOtherAsk(container: HTMLElement) {
    // betaalrekening → spaargeld → eigen huis → beleggingen → andere
    for (let i = 0; i < 4; i++) fireEvent.click(footerButton('Nee'))
    expect(container.textContent).toContain('Heb je nog andere bezittingen?')
  }

  it('toont na de laatste "nee" het review-scherm wanneer er bezittingen zijn', () => {
    const onNext = vi.fn()
    const { container } = render(<Host onNext={onNext} />)
    // Voeg eerst een betaalrekening toe.
    fireEvent.click(footerButton('Ja'))
    fireEvent.click(screen.getByTestId('wizard-collect'))
    // Verlaat de "nog een?"-loop en loop de resterende gerichte vragen af.
    fireEvent.click(footerButton('Nee')) // verlaat cash-more → spaargeld
    fireEvent.click(footerButton('Nee')) // eigen huis
    fireEvent.click(footerButton('Nee')) // beleggingen
    fireEvent.click(footerButton('Nee')) // → andere bezittingen?
    expect(container.textContent).toContain('Heb je nog andere bezittingen?')
    // "Nee, ik ben klaar" op de catch-all → review-scherm (nog NIET onNext).
    fireEvent.click(footerButton(/Nee, ik ben klaar/))
    expect(container.textContent).toContain('Dit zijn je bezittingen')
    expect(onNext).not.toHaveBeenCalled()
    // "Klopt het? → ga door" rondt de sectie af.
    fireEvent.click(footerButton(/Klopt het/))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('slaat het review-scherm over bij een lege lijst (direct door)', () => {
    const onNext = vi.fn()
    const { container } = render(<Host onNext={onNext} />)
    advanceToOtherAsk(container)
    // "Nee, ik ben klaar" op de catch-all met lege lijst → direct onNext, geen review.
    fireEvent.click(footerButton(/Nee, ik ben klaar/))
    expect(onNext).toHaveBeenCalledOnce()
    expect(container.textContent).not.toContain('Dit zijn je bezittingen')
  })

  it('toont in de catch-all-picker álle bezittingscategorieën, incl. de eerder gevraagde vier', () => {
    const { container } = render(<Host />)
    // Loop de vier gerichte ja/nee-vragen af met "Nee" → catch-all-vraag.
    // De volledige type-keuzelijst staat nu direct inline op "andere bezittingen?".
    advanceToOtherAsk(container)
    // Vangnet: de vier eerder gevraagde types zijn hier óók beschikbaar, zodat
    // een vergeten woning/spaar-/betaalrekening/belegging alsnog toe te voegen is.
    const text = container.textContent ?? ''
    expect(text).toContain('Eigen woning')
    expect(text).toContain('Spaargeld')
    expect(text).toContain('Betaalrekening')
    expect(text).toContain('Beleggingen')
    // En de resterende catalogus-categorieën blijven aanwezig.
    expect(text).toContain('Pensioen')
    expect(text).toContain('Vastgoed')
    expect(text).toContain('Overig')
  })

  it('een kaartje op "andere bezittingen?" opent meteen de wizard (geen ja/nee-tussenstap)', () => {
    const { container } = render(<Host />)
    advanceToOtherAsk(container)
    // Kaartje-klik opent direct de wizard — er is geen "Ja" meer voor nodig.
    fireEvent.click(footerButton('Betaalrekening'))
    fireEvent.click(screen.getByTestId('wizard-collect'))
    // Post toegevoegd én het vervolg "Nog een bezitting?" verschijnt.
    expect(container.textContent).toContain('Test cash')
    expect(container.textContent).toContain('Nog een bezitting?')
  })

  it('"Voeg nog iets toe" vanuit review keert terug naar de picker', () => {
    const { container } = render(<Host />)
    fireEvent.click(footerButton('Ja'))
    fireEvent.click(screen.getByTestId('wizard-collect'))
    fireEvent.click(footerButton('Nee')) // cash-more → spaargeld
    fireEvent.click(footerButton('Nee')) // eigen huis
    fireEvent.click(footerButton('Nee')) // beleggingen
    fireEvent.click(footerButton('Nee')) // andere bezittingen?
    fireEvent.click(footerButton(/Nee, ik ben klaar/)) // → review
    expect(container.textContent).toContain('Dit zijn je bezittingen')
    fireEvent.click(footerButton(/Voeg nog iets toe/))
    expect(container.textContent).toContain('Wat voor bezitting?')
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

  // Regressie UR2-06: het lopende totaal was de kale bezittingen-som, terwijl
  // de gekoppelde hypotheek er als eigen "−"-regel tussen stond. Het bedrag las
  // daardoor als netto vermogen (€500.000 i.p.v. €200.000).
  it('markeert het lopende totaal als bruto en sluit af met het netto-bedrag', () => {
    const { container } = renderWith([HOUSE], [LINKED_MORTGAGE])
    const text = container.textContent ?? ''
    expect(text).toContain(`Toegevoegd · ${formatCurrency(500_000)} bruto`)
    expect(text).toContain(`Netto na gekoppelde schuld · ${formatCurrency(200_000)}`)
  })

  it('toont in het FEITEN-paneel het netto-bedrag, met het bruto-bedrag in de bronregel', () => {
    const { container } = renderWith([HOUSE], [LINKED_MORTGAGE])
    const text = container.textContent ?? ''
    expect(text).toContain(`1 bezitting · ${formatCurrency(500_000)} bruto`)
    expect(text).toContain('jouw bezittingen min de gekoppelde schuld')
    // Het bruto-bedrag mag nergens meer kaal als "jouw bezittingen tot nu toe"
    // (= het kopgetal) staan.
    expect(text).not.toContain('jouw bezittingen tot nu toe')
  })

  it('laat het totaal ongemoeid zolang er geen gekoppelde schuld is', () => {
    const { container } = renderWith([HOUSE], [])
    const text = container.textContent ?? ''
    expect(text).toContain(`Toegevoegd · ${formatCurrency(500_000)}`)
    expect(text).not.toContain('bruto')
    expect(text).not.toContain('Netto na')
    expect(text).toContain('jouw bezittingen tot nu toe')
  })

  // Losse schulden komen pas in de schulden-sectie aan bod en worden hier niet
  // getoond — ze mogen het getoonde totaal dus ook niet verlagen (de som blijft
  // exact de som van de zichtbare rijen).
  it('trekt een ONgekoppelde schuld niet af van het bezit-totaal', () => {
    const losseSchuld: DebtQuickInput = {
      debt_type: 'personal_loan',
      name: 'Persoonlijke lening',
      current_balance: 10_000,
      linked_asset_id: null,
      linked_client_ref: null,
    }
    const { container } = renderWith([HOUSE], [LINKED_MORTGAGE, losseSchuld])
    const text = container.textContent ?? ''
    expect(text).toContain(`Netto na gekoppelde schuld · ${formatCurrency(200_000)}`)
    expect(text).not.toContain('Persoonlijke lening')
  })
})
