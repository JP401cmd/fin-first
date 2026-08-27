import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, fireEvent, screen } from '@testing-library/react'
import type { DebtQuickInput } from '@/lib/quick-add/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
vi.mock('@/components/app/quick-add-wizard/quick-add-wizard', () => ({
  QuickAddWizard: ({ open, onCollect, onClose, initialDebtType }: any) =>
    open ? (
      <>
        <button
          type="button"
          data-testid="wizard-collect"
          data-debt-type={initialDebtType}
          onClick={() =>
            onCollect({
              kind: 'debt',
              debt: { debt_type: initialDebtType, name: `Test ${initialDebtType}`, current_balance: 5000 },
            })
          }
        >
          collect
        </button>
        <button type="button" data-testid="wizard-close" onClick={onClose}>
          sluit
        </button>
      </>
    ) : null,
}))

import { OnboardingSchulden } from './onboarding-schulden'

afterEach(() => vi.clearAllMocks())

// OnboardingShell rendert de footer dubbel (desktop + mobiele sticky bar).
const footerButton = (name: string | RegExp) =>
  screen.getAllByRole('button', { name })[0]
const footerText = (text: string | RegExp) => screen.getAllByText(text)[0]
const hasYesNo = () => screen.queryAllByRole('button', { name: 'Nee' }).length > 0

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

const linkedDebt = (
  debt_type: DebtQuickInput['debt_type'],
  name: string,
  balance = 10_000,
): DebtQuickInput => ({
  debt_type,
  name,
  current_balance: balance,
  linked_asset_id: null,
  linked_client_ref: `ref-${debt_type}`,
})

/** Klikt "Nee" tot het aanvinkraster verschijnt en geeft de gelezen koppen terug. */
function walkAllNo(container: HTMLElement): string[] {
  const headings: string[] = []
  for (let i = 0; i < 20; i++) {
    const heading = container.querySelector('h1')?.textContent?.trim() ?? ''
    headings.push(heading)
    if (!hasYesNo()) break
    fireEvent.click(footerButton('Nee'))
  }
  return headings
}

// ── Schermtelling (H13) ────────────────────────────────────────────────

describe('OnboardingSchulden — schermtelling', () => {
  it('telt bij "alles nee" precies 5 schermen: 4 ja/nee-vragen + het aanvinkraster', () => {
    // Regressietest voor H13: de sectie telde 8 schermen (7 ja/nee + raster).
    // Deze test is de reden dat een terugkeer naar een lange vragenlijst niet
    // ongemerkt kan gebeuren.
    const { container } = render(<Host />)
    const headings = walkAllNo(container)
    expect(headings).toEqual([
      'Heb je een hypotheek?',
      'Heb je een studielening?',
      'Heb je een persoonlijke lening?',
      'Heb je een autolening of private lease?',
      'Welke van deze heb je nog meer?',
    ])
  })

  it('elke ja/nee-vraag levert een ánder schuldtype op (geen duplicaat-vraag)', () => {
    // Regressietest voor defect (a): "doorlopend krediet" en "roodstand"
    // leverden beide `revolving_credit` op — twee vragen, één ononderscheidbare
    // uitkomst, omdat DebtQuickInput geen subtype draagt.
    const seen: string[] = []
    for (let i = 0; i < 20; i++) {
      const { unmount } = render(<Host />)
      for (let n = 0; n < i; n++) fireEvent.click(footerButton('Nee'))
      if (!hasYesNo()) {
        unmount()
        break
      }
      fireEvent.click(footerButton('Ja'))
      seen.push(screen.getByTestId('wizard-collect').getAttribute('data-debt-type') ?? '')
      unmount()
    }
    expect(seen).toEqual(['mortgage', 'student_loan', 'personal_loan', 'car_loan'])
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('slaat élke al gekoppelde schuldsoort over — hypotheek én autolening', () => {
    // Regressietest voor defect (b): alleen de hypotheek werd overgeslagen; wie
    // in stap 3 een auto mét autolening opgaf kreeg die vraag alsnog.
    const { container } = render(
      <Host
        initialDebts={[
          linkedDebt('mortgage', 'Hypotheek — Mijn woning', 250_000),
          linkedDebt('car_loan', 'Autolening — Mijn auto', 8_000),
        ]}
      />,
    )
    const headings = walkAllNo(container)
    expect(headings).toEqual([
      'Heb je een studielening?',
      'Heb je een persoonlijke lening?',
      'Welke van deze heb je nog meer?',
    ])
  })

  it('slaat de hypotheek-vraag over wanneer al een hypotheek aan het huis gekoppeld is', () => {
    const { container } = render(
      <Host initialDebts={[linkedDebt('mortgage', 'Hypotheek — Mijn woning', 250_000)]} />,
    )
    expect(container.textContent).toContain('Heb je een studielening?')
    expect(container.textContent).not.toContain('Heb je een hypotheek?')
  })

  it('een niet-gekoppelde autolening slaat de autolening-vraag NIET over', () => {
    // Alleen een koppeling aan een bezitting maakt de vraag overbodig; een los
    // toegevoegde autolening niet (dan kun je er nog een tweede hebben).
    const standalone: DebtQuickInput = {
      debt_type: 'car_loan',
      name: 'Autolening',
      current_balance: 8_000,
      linked_asset_id: null,
      linked_client_ref: null,
    }
    const { container } = render(<Host initialDebts={[standalone]} />)
    const headings = walkAllNo(container)
    expect(headings).toContain('Heb je een autolening of private lease?')
  })
})

// ── Ja/nee-kop + drempelloze uitgang ───────────────────────────────────

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
    fireEvent.click(footerButton('Nee'))
    expect(container.textContent).toContain('Heb je een studielening?')
    fireEvent.click(footerText('Ik heb (verder) geen schulden'))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('de uitgang staat óók op het aanvinkraster', () => {
    const onNext = vi.fn()
    const { container } = render(<Host onNext={onNext} />)
    walkAllNo(container)
    expect(container.textContent).toContain('Welke van deze heb je nog meer?')
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

  // Regressie L2: de vervolgvraag houdt dezelfde term aan als de eerste vraag.
  // Zonder `moreLabel`-override erft hij `DEBT_QUICK_ADD_LABELS.student_loan`
  // ('Studielening (DUO)') en lekt de parenthetical de zin in.
  it('de "nog een?"-vraag houdt de term van de eerste vraag aan (studielening)', () => {
    const { container } = render(<Host />)
    fireEvent.click(footerButton('Nee')) // hypotheek
    expect(container.textContent).toContain('Heb je een studielening?')
    fireEvent.click(footerButton('Ja'))
    fireEvent.click(screen.getByTestId('wizard-collect'))
    expect(container.textContent).toContain('Nog een studielening?')
    expect(container.textContent).not.toContain('(duo)')
  })

  it('toont een gekoppelde schuld (hypotheek via de woning) óók in deze stap', () => {
    const { container } = render(
      <Host initialDebts={[linkedDebt('mortgage', 'Hypotheek — Mijn woning', 250_000)]} />,
    )
    expect(container.textContent).toContain('Hypotheek — Mijn woning')
    expect(container.textContent).toContain('via je woning')
    expect(container.textContent).toContain('Al opgegeven bij je bezittingen')
  })

  it('een gekoppelde DGA-schuld toont de herkomst "via je BV"', () => {
    const { container } = render(
      <Host initialDebts={[linkedDebt('dga_schuld', 'RC-schuld aan BV', 40_000)]} />,
    )
    expect(container.textContent).toContain('RC-schuld aan BV')
    expect(container.textContent).toContain('via je BV')
  })
})

// ── Aanvinkraster + collect-queue ──────────────────────────────────────

describe('OnboardingSchulden — aanvinkraster (staart)', () => {
  function advanceToRaster(container: HTMLElement) {
    walkAllNo(container)
    expect(container.textContent).toContain('Welke van deze heb je nog meer?')
  }

  it('toont de volledige catalogus als aanvinkbare tegels — óók al gevraagde types', () => {
    const { container } = render(<Host />)
    advanceToRaster(container)
    expect(screen.getByRole('checkbox', { name: 'Hypotheek' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Creditcard' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Belastingschuld' })).toBeInTheDocument()
  })

  it('zonder vinkjes gaat "Verder" direct door (geen review bij een lege lijst)', () => {
    const onNext = vi.fn()
    const { container } = render(<Host onNext={onNext} />)
    advanceToRaster(container)
    fireEvent.click(footerButton(/Verder — geen van deze/))
    expect(onNext).toHaveBeenCalledOnce()
    expect(container.textContent).not.toContain('Dit zijn je schulden')
  })

  it('opent de wizard één keer per aangevinkt type, in rastervolgorde', () => {
    const { container } = render(<Host />)
    advanceToRaster(container)
    // In omgekeerde rastervolgorde aanvinken; de queue moet tóch de
    // rastervolgorde aanhouden (credit_card vóór belastingschuld).
    fireEvent.click(screen.getByRole('checkbox', { name: 'Belastingschuld' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Creditcard' }))
    fireEvent.click(footerButton(/Verder met 2 schulden/))

    expect(screen.getByTestId('wizard-collect')).toHaveAttribute('data-debt-type', 'credit_card')
    fireEvent.click(screen.getByTestId('wizard-collect'))
    expect(screen.getByTestId('wizard-collect')).toHaveAttribute('data-debt-type', 'belastingschuld')
    fireEvent.click(screen.getByTestId('wizard-collect'))

    // Queue leeg → review met beide schulden.
    expect(container.textContent).toContain('Dit zijn je schulden')
    expect(container.textContent).toContain('Test credit_card')
    expect(container.textContent).toContain('Test belastingschuld')
  })

  it('het label van de primaire knop telt de aangevinkte schulden mee', () => {
    const { container } = render(<Host />)
    advanceToRaster(container)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Creditcard' }))
    expect(container.textContent).toContain('Verder met 1 schuld')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Belastingschuld' }))
    expect(container.textContent).toContain('Verder met 2 schulden')
    // Uitvinken werkt ook.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Belastingschuld' }))
    expect(container.textContent).toContain('Verder met 1 schuld')
  })

  it('de wizard annuleren slaat dat type over en gaat door met de rest', () => {
    const { container } = render(<Host />)
    advanceToRaster(container)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Creditcard' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Belastingschuld' }))
    fireEvent.click(footerButton(/Verder met 2 schulden/))

    fireEvent.click(screen.getByTestId('wizard-close')) // creditcard overslaan
    expect(screen.getByTestId('wizard-collect')).toHaveAttribute('data-debt-type', 'belastingschuld')
    fireEvent.click(screen.getByTestId('wizard-collect'))
    expect(container.textContent).toContain('Dit zijn je schulden')
    expect(container.textContent).not.toContain('Test credit_card')
  })

  it('alles annuleren zonder schulden houdt de gebruiker op het raster', () => {
    const onNext = vi.fn()
    const { container } = render(<Host onNext={onNext} />)
    advanceToRaster(container)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Creditcard' }))
    fireEvent.click(footerButton(/Verder met 1 schuld/))
    fireEvent.click(screen.getByTestId('wizard-close'))
    expect(container.textContent).toContain('Welke van deze heb je nog meer?')
    expect(onNext).not.toHaveBeenCalled()
  })
})

// ── Afsluitend overzicht (review-fase) ─────────────────────────────────

describe('OnboardingSchulden — afsluitend overzicht', () => {
  it('toont na het raster het review-scherm wanneer er schulden zijn', () => {
    const onNext = vi.fn()
    const { container } = render(<Host onNext={onNext} />)
    fireEvent.click(footerButton('Ja'))
    fireEvent.click(screen.getByTestId('wizard-collect'))
    fireEvent.click(footerButton('Nee')) // verlaat hypotheek-more
    walkAllNo(container)
    fireEvent.click(footerButton(/Verder — geen van deze/))
    expect(container.textContent).toContain('Dit zijn je schulden')
    expect(onNext).not.toHaveBeenCalled()
    fireEvent.click(footerButton(/Klopt het/))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('de drempelloze sectie-uitgang slaat het review-scherm bewust over', () => {
    const onNext = vi.fn()
    const { container } = render(<Host onNext={onNext} />)
    fireEvent.click(footerButton('Ja'))
    fireEvent.click(screen.getByTestId('wizard-collect'))
    fireEvent.click(footerButton('Nee')) // verlaat more → volgende vraag
    fireEvent.click(footerText('Ik heb (verder) geen schulden'))
    expect(onNext).toHaveBeenCalledOnce()
    expect(container.textContent).not.toContain('Dit zijn je schulden')
  })

  it('"Voeg nog iets toe" vanuit review opent de picker en keert erna terug', () => {
    const { container } = render(<Host />)
    fireEvent.click(footerButton('Ja'))
    fireEvent.click(screen.getByTestId('wizard-collect'))
    fireEvent.click(footerButton('Nee'))
    walkAllNo(container)
    fireEvent.click(footerButton(/Verder — geen van deze/)) // → review
    expect(container.textContent).toContain('Dit zijn je schulden')
    fireEvent.click(footerButton(/Voeg nog iets toe/))
    expect(container.textContent).toContain('Wat voor schuld?')
    // Kiezen + collecten brengt je terug op het overzicht (geen extra scherm).
    fireEvent.click(screen.getByRole('button', { name: 'Belastingschuld' }))
    fireEvent.click(screen.getByTestId('wizard-collect'))
    expect(container.textContent).toContain('Dit zijn je schulden')
    expect(container.textContent).toContain('Test belastingschuld')
  })
})

// ── Raakzones (M19 / A-09) ─────────────────────────────────────────────

describe('OnboardingSchulden — raakzones ≥44px', () => {
  /** Elke interactieve control moet 44px hoog kunnen worden (min-h-11 / h-11). */
  function assertTouchTargets(container: HTMLElement) {
    const controls = Array.from(
      container.querySelectorAll<HTMLElement>('button, label'),
    ).filter((el) => el.tagName === 'BUTTON' || el.querySelector('input[type="checkbox"]'))
    expect(controls.length).toBeGreaterThan(0)
    for (const el of controls) {
      const cls = el.className
      expect(
        /(^|\s)(min-h-11|h-11|min-h-\[44px\])(\s|$)/.test(cls),
        `raakzone te klein: "${el.textContent?.trim().slice(0, 40)}" → ${cls}`,
      ).toBe(true)
    }
  }

  it('de ja/nee-vraag draagt overal min-h-11 — óók de drempelloze uitgang', () => {
    // Regressietest voor defect (c): de uitgang stond op min-h-9 (36px).
    const { container } = render(<Host />)
    assertTouchTargets(container)
  })

  it('het aanvinkraster haalt de raakzone op elke tegel', () => {
    const { container } = render(<Host />)
    walkAllNo(container)
    assertTouchTargets(container)
  })

  it('het losse picker-scherm ("Wat voor schuld?") haalt de raakzone', () => {
    const { container } = render(<Host />)
    fireEvent.click(footerButton('Ja'))
    fireEvent.click(screen.getByTestId('wizard-collect'))
    fireEvent.click(footerButton('Nee'))
    walkAllNo(container)
    fireEvent.click(footerButton(/Verder — geen van deze/))
    fireEvent.click(footerButton(/Voeg nog iets toe/))
    expect(container.textContent).toContain('Wat voor schuld?')
    assertTouchTargets(container)
  })
})
