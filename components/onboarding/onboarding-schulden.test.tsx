import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, fireEvent, screen } from '@testing-library/react'
import type { DebtQuickInput } from '@/lib/quick-add/types'
import { QUICK_ADD_DEBT_ORDER } from '@/lib/debt-data'

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

import { OnboardingSchulden, FEATURED_DEBT_TYPES } from './onboarding-schulden'
import { healSchuldenPhases, initialSchuldenPhases, type SectionPhase } from './section-phase'

afterEach(() => vi.clearAllMocks())

// OnboardingShell rendert de footer dubbel (desktop + mobiele sticky bar).
const footerButton = (name: string | RegExp) =>
  screen.getAllByRole('button', { name })[0]
const footerText = (text: string | RegExp) => screen.getAllByText(text)[0]
const hasYesNo = () => screen.queryAllByRole('button', { name: 'Nee' }).length > 0
const RASTER_TITLE = 'Welke schulden heb je?'

function Host({
  initialDebts = [],
  initialPhases,
  onNext = vi.fn(),
}: {
  initialDebts?: DebtQuickInput[]
  /** Gelifte (controlled) fase-stack — bv. een hersteld concept van vóór raster-first. */
  initialPhases?: SectionPhase[]
  onNext?: () => void
}) {
  const [debts, setDebts] = useState<DebtQuickInput[]>(initialDebts)
  const [phases, setPhases] = useState<SectionPhase[] | undefined>(initialPhases)
  return (
    <OnboardingSchulden
      quickDebts={debts}
      onDebtsChange={setDebts}
      onNext={onNext}
      onBack={vi.fn()}
      phases={phases}
      onPhasesChange={initialPhases ? setPhases : undefined}
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

/** Vink een type aan en start de queue. */
function pickAndStart(types: string[]) {
  for (const t of types) fireEvent.click(screen.getByRole('checkbox', { name: t }))
  fireEvent.click(footerButton(/Verder met \d+ schuld/))
}

// ── Schermtelling (B-054 — raster-first, herziening van H13) ───────────

describe('OnboardingSchulden — schermtelling', () => {
  it('telt bij "geen schulden" precies 1 scherm: het aanvinkraster, zonder ja/nee-kop', () => {
    // Regressietest: H13 (26 aug) telde 5 schermen (4 ja/nee + raster), de
    // versie daarvóór 8. Sinds B-054 opent de sectie direct op het raster.
    const { container } = render(<Host />)
    expect(container.textContent).toContain(RASTER_TITLE)
    expect(hasYesNo()).toBe(false)
    expect(container.textContent).not.toContain('Heb je een hypotheek?')
  })

  it('de vier meest voorkomende soorten staan als groep "Meest voorkomend" vooraan, elk hoogstens één keer', () => {
    const { container } = render(<Host />)
    expect(container.textContent).toContain('Meest voorkomend')
    expect(container.textContent).toContain('Andere schulden')
    expect(FEATURED_DEBT_TYPES).toEqual(['mortgage', 'student_loan', 'personal_loan', 'car_loan'])
    expect(new Set(FEATURED_DEBT_TYPES).size).toBe(FEATURED_DEBT_TYPES.length)
    // Vooraan: de eerste vier checkboxes zijn de uitgelichte soorten.
    const names = screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label') ?? (c.closest('label')?.textContent ?? ''))
    expect(names[0]).toContain('Hypotheek')
    expect(names[1]).toContain('Studielening')
    expect(names[2]).toContain('Persoonlijke lening')
    expect(names[3]).toContain('Autolening')
    expect(screen.getAllByRole('checkbox')).toHaveLength(QUICK_ADD_DEBT_ORDER.length)
  })

  it('een al gekoppelde schuldsoort (hypotheek én autolening) staat uitgeschakeld in het raster mét herkomst', () => {
    // Regressietest voor het oude defect (b): alleen de hypotheek werd
    // overgeslagen. Nu: zichtbaar maar niet dubbel opvoerbaar, voor élk type
    // uit LINKED_DEBT_SUGGESTIONS.
    const { container } = render(
      <Host
        initialDebts={[
          linkedDebt('mortgage', 'Hypotheek — Mijn woning', 250_000),
          linkedDebt('car_loan', 'Autolening — Mijn auto', 8_000),
        ]}
      />,
    )
    const hypotheek = screen.getByRole('checkbox', { name: /Hypotheek/ }) as HTMLInputElement
    const auto = screen.getByRole('checkbox', { name: /Autolening/ }) as HTMLInputElement
    expect(hypotheek.disabled).toBe(true)
    expect(auto.disabled).toBe(true)
    expect(container.textContent).toContain('al opgegeven via je woning')
    expect(container.textContent).toContain('al opgegeven via je voertuig')
    // Niet-gekoppelde soorten blijven gewoon aanvinkbaar.
    expect((screen.getByRole('checkbox', { name: /Studielening/ }) as HTMLInputElement).disabled).toBe(false)
    // De gekoppelde schulden staan óók in het lopende overzicht.
    expect(container.textContent).toContain('Al opgegeven bij je bezittingen')
    expect(container.textContent).toContain('Hypotheek — Mijn woning')
  })

  it('een niet-gekoppelde autolening schakelt de autolening-tegel NIET uit (er kan een tweede zijn)', () => {
    const standalone: DebtQuickInput = {
      debt_type: 'car_loan',
      name: 'Autolening',
      current_balance: 8_000,
      linked_asset_id: null,
      linked_client_ref: null,
    }
    render(<Host initialDebts={[standalone]} />)
    expect((screen.getByRole('checkbox', { name: /Autolening/ }) as HTMLInputElement).disabled).toBe(false)
  })
})

// ── Drempelloze uitgang ────────────────────────────────────────────────

describe('OnboardingSchulden — altijd-uitgang', () => {
  it('biedt op het raster een scherpe uitgang "Ik heb geen schulden" die de sectie afsluit', () => {
    const onNext = vi.fn()
    render(<Host onNext={onNext} />)
    fireEvent.click(footerText('Ik heb geen schulden'))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('met een schuld in het overzicht heet de uitgang "Ik heb verder geen schulden"', () => {
    const onNext = vi.fn()
    render(
      <Host onNext={onNext} initialDebts={[linkedDebt('mortgage', 'Hypotheek — Mijn woning', 250_000)]} />,
    )
    fireEvent.click(footerText('Ik heb verder geen schulden'))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('een gekoppelde DGA-schuld toont de herkomst "via je BV"', () => {
    const { container } = render(
      <Host initialDebts={[linkedDebt('dga_schuld', 'RC-schuld aan BV', 40_000)]} />,
    )
    expect(container.textContent).toContain('RC-schuld aan BV')
    expect(container.textContent).toContain('via je BV')
    expect((screen.getByRole('checkbox', { name: /Lening bij eigen BV/ }) as HTMLInputElement).disabled).toBe(true)
  })
})

// ── Aanvinkraster + collect-queue ──────────────────────────────────────

describe('OnboardingSchulden — aanvinkraster + queue', () => {
  it('toont de volledige catalogus als aanvinkbare tegels', () => {
    render(<Host />)
    expect(screen.getByRole('checkbox', { name: 'Hypotheek' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Creditcard' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Belastingschuld' })).toBeInTheDocument()
  })

  it('zonder vinkjes gaat "Verder" direct door (geen review bij een lege lijst)', () => {
    const onNext = vi.fn()
    const { container } = render(<Host onNext={onNext} />)
    fireEvent.click(footerButton(/Verder — geen van deze/))
    expect(onNext).toHaveBeenCalledOnce()
    expect(container.textContent).not.toContain('Dit zijn je schulden')
  })

  it('opent de wizard per aangevinkt type in rastervolgorde, met ná elke toevoeging "Nog een …?"', () => {
    const { container } = render(<Host />)
    // In omgekeerde rastervolgorde aanvinken; de queue houdt tóch de
    // rastervolgorde aan (credit_card vóór belastingschuld).
    pickAndStart(['Belastingschuld', 'Creditcard'])

    expect(screen.getByTestId('wizard-collect')).toHaveAttribute('data-debt-type', 'credit_card')
    fireEvent.click(screen.getByTestId('wizard-collect'))
    expect(container.textContent).toContain('Nog een creditcard?')
    fireEvent.click(footerButton('Nee'))

    expect(screen.getByTestId('wizard-collect')).toHaveAttribute('data-debt-type', 'belastingschuld')
    fireEvent.click(screen.getByTestId('wizard-collect'))
    expect(container.textContent).toContain('Nog een belastingschuld?')
    fireEvent.click(footerButton('Nee'))

    // Queue leeg → review met beide schulden.
    expect(container.textContent).toContain('Dit zijn je schulden')
    expect(container.textContent).toContain('Test credit_card')
    expect(container.textContent).toContain('Test belastingschuld')
  })

  it('"Meest voorkomend" gaat in de queue vóór de andere soorten', () => {
    render(<Host />)
    pickAndStart(['Creditcard', 'Persoonlijke lening'])
    // personal_loan staat in QUICK_ADD_DEBT_ORDER ná credit_card? Nee — maar
    // in het raster staat hij bij "Meest voorkomend" en dus vooraan.
    expect(screen.getByTestId('wizard-collect')).toHaveAttribute('data-debt-type', 'personal_loan')
  })

  it('twee schulden van hetzelfde type via "Nog een …?" → beide in de lijst (de gap uit melding B-054)', () => {
    const { container } = render(<Host />)
    pickAndStart(['Persoonlijke lening'])
    fireEvent.click(screen.getByTestId('wizard-collect'))
    expect(container.textContent).toContain('Nog een persoonlijke lening?')
    fireEvent.click(footerButton('Ja'))
    // De wizard opnieuw op hetzelfde type — nooit een eigen inline formulier.
    expect(screen.getByTestId('wizard-collect')).toHaveAttribute('data-debt-type', 'personal_loan')
    fireEvent.click(screen.getByTestId('wizard-collect'))
    expect(container.textContent).toContain('Nog een persoonlijke lening?')
    fireEvent.click(footerButton('Nee'))
    expect(container.textContent).toContain('Dit zijn je schulden')
    expect(screen.getAllByText('Test personal_loan')).toHaveLength(2)
    expect(container.textContent).toContain('2 schulden')
  })

  // Regressie L2: de vervolgvraag houdt dezelfde term aan als de tegel, zonder
  // de parenthetical van 'Studielening (DUO)'.
  it('de "nog een?"-vraag zegt "studielening" zonder "(duo)"', () => {
    const { container } = render(<Host />)
    pickAndStart(['Studielening (DUO)'])
    fireEvent.click(screen.getByTestId('wizard-collect'))
    expect(container.textContent).toContain('Nog een studielening?')
    expect(container.textContent).not.toContain('(duo)')
  })

  it('het label van de primaire knop telt de aangevinkte schulden mee', () => {
    const { container } = render(<Host />)
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
    pickAndStart(['Creditcard', 'Belastingschuld'])
    fireEvent.click(screen.getByTestId('wizard-close')) // creditcard overslaan
    expect(screen.getByTestId('wizard-collect')).toHaveAttribute('data-debt-type', 'belastingschuld')
    fireEvent.click(screen.getByTestId('wizard-collect'))
    fireEvent.click(footerButton('Nee'))
    expect(container.textContent).toContain('Dit zijn je schulden')
    expect(container.textContent).not.toContain('Test credit_card')
  })

  it('alles annuleren zonder schulden houdt de gebruiker op het raster', () => {
    const onNext = vi.fn()
    const { container } = render(<Host onNext={onNext} />)
    pickAndStart(['Creditcard'])
    fireEvent.click(screen.getByTestId('wizard-close'))
    expect(container.textContent).toContain(RASTER_TITLE)
    expect(onNext).not.toHaveBeenCalled()
  })

  it('de wizard annuleren vanuit "Nog een?" laat die vraag staan (niets kwijt)', () => {
    const { container } = render(<Host />)
    pickAndStart(['Creditcard'])
    fireEvent.click(screen.getByTestId('wizard-collect'))
    fireEvent.click(footerButton('Ja'))
    fireEvent.click(screen.getByTestId('wizard-close'))
    expect(container.textContent).toContain('Nog een creditcard?')
    expect(container.textContent).toContain('Test credit_card')
  })

  it('Terug vanaf "Nog een?" landt op het raster en houdt het al toegevoegde', () => {
    const { container } = render(<Host />)
    pickAndStart(['Creditcard', 'Belastingschuld'])
    fireEvent.click(screen.getByTestId('wizard-collect'))
    expect(container.textContent).toContain('Nog een creditcard?')
    fireEvent.click(screen.getAllByRole('button', { name: /Vorige stap/ })[0])
    expect(container.textContent).toContain(RASTER_TITLE)
    expect(container.textContent).toContain('Test credit_card')
    expect(screen.queryByTestId('wizard-collect')).toBeNull()
  })
})

// ── Afsluitend overzicht (review-fase) ─────────────────────────────────

describe('OnboardingSchulden — afsluitend overzicht', () => {
  it('toont na de queue het review-scherm en sluit via "Klopt het" af', () => {
    const onNext = vi.fn()
    const { container } = render(<Host onNext={onNext} />)
    pickAndStart(['Creditcard'])
    fireEvent.click(screen.getByTestId('wizard-collect'))
    fireEvent.click(footerButton('Nee'))
    expect(container.textContent).toContain('Dit zijn je schulden')
    expect(onNext).not.toHaveBeenCalled()
    fireEvent.click(footerButton(/Klopt het/))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('"Verder — geen van deze" mét een gekoppelde schuld toont het review (er is iets te bevestigen)', () => {
    const onNext = vi.fn()
    const { container } = render(
      <Host onNext={onNext} initialDebts={[linkedDebt('mortgage', 'Hypotheek — Mijn woning', 250_000)]} />,
    )
    fireEvent.click(footerButton(/Verder — geen van deze/))
    expect(container.textContent).toContain('Dit zijn je schulden')
    expect(onNext).not.toHaveBeenCalled()
  })

  it('de drempelloze sectie-uitgang slaat het review-scherm bewust over', () => {
    const onNext = vi.fn()
    const { container } = render(<Host onNext={onNext} />)
    pickAndStart(['Creditcard'])
    fireEvent.click(screen.getByTestId('wizard-collect'))
    fireEvent.click(footerText('Ik heb verder geen schulden'))
    expect(onNext).toHaveBeenCalledOnce()
    expect(container.textContent).not.toContain('Dit zijn je schulden')
  })

  it('"Voeg nog iets toe" vanuit review opent de picker en keert erna terug', () => {
    const { container } = render(<Host />)
    pickAndStart(['Creditcard'])
    fireEvent.click(screen.getByTestId('wizard-collect'))
    fireEvent.click(footerButton('Nee')) // → review
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

// ── Concept-herstel van vóór raster-first ──────────────────────────────

describe('OnboardingSchulden — herstelde stack van vóór B-054', () => {
  it('healSchuldenPhases: ask/more → raster, dubbele rasters gevouwen, review blijft, leeg → beginstack', () => {
    expect(healSchuldenPhases([{ kind: 'ask', qIndex: 0 }])).toEqual([{ kind: 'pick-many' }])
    expect(healSchuldenPhases([{ kind: 'ask', qIndex: 2 }, { kind: 'more', qIndex: 2 }])).toEqual([
      { kind: 'pick-many' },
    ])
    expect(
      healSchuldenPhases([{ kind: 'ask', qIndex: 3 }, { kind: 'pick-many' }, { kind: 'review' }]),
    ).toEqual([{ kind: 'pick-many' }, { kind: 'review' }])
    expect(healSchuldenPhases([])).toEqual(initialSchuldenPhases())
  })

  it('een niet-geheelde stack op "ask" rendert tóch het raster (vangnet in de component)', () => {
    const { container } = render(
      <Host initialPhases={[{ kind: 'ask', qIndex: 1 }]} initialDebts={[]} />,
    )
    expect(container.textContent).toContain(RASTER_TITLE)
    expect(hasYesNo()).toBe(false)
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

  it('het aanvinkraster haalt de raakzone op elke tegel — óók de uitgeschakelde', () => {
    const { container } = render(
      <Host initialDebts={[linkedDebt('mortgage', 'Hypotheek — Mijn woning', 250_000)]} />,
    )
    assertTouchTargets(container)
  })

  it('de "nog een?"-vraag draagt overal min-h-11 — óók de drempelloze uitgang', () => {
    const { container } = render(<Host />)
    pickAndStart(['Creditcard'])
    fireEvent.click(screen.getByTestId('wizard-collect'))
    expect(container.textContent).toContain('Nog een creditcard?')
    assertTouchTargets(container)
  })

  it('het losse picker-scherm ("Wat voor schuld?") haalt de raakzone', () => {
    const { container } = render(<Host />)
    pickAndStart(['Creditcard'])
    fireEvent.click(screen.getByTestId('wizard-collect'))
    fireEvent.click(footerButton('Nee'))
    fireEvent.click(footerButton(/Voeg nog iets toe/))
    expect(container.textContent).toContain('Wat voor schuld?')
    assertTouchTargets(container)
  })
})
