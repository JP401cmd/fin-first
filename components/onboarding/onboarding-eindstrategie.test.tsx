import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, fireEvent, screen } from '@testing-library/react'
import {
  OnboardingEindstrategie,
  planDraftFromOnboarding,
  type OnboardingPlanValue,
} from './onboarding-eindstrategie'
import { INITIAL_HORIZON_DATA } from './onboarding-horizon'
import { END_AGE_MIN, END_AGE_MAX } from '@/lib/fire-strategy'

/**
 * Stap vii "Jouw plan" (ADR 0129, eigenaar-besluit 5 sep 2026): twee vragen,
 * drie ankers (zonder `now`) × drie eind-vormen. Deze suite pint de dispatch,
 * de veldzichtbaarheid (ook de kruiscombinaties), de validatie vóór "Verder"
 * en de a11y-koppelingen.
 */

function Harness({
  initial = INITIAL_HORIZON_DATA,
  onNext = () => {},
  currentAge = 40,
}: {
  initial?: OnboardingPlanValue
  onNext?: () => void
  currentAge?: number | null
}) {
  const [value, setValue] = useState<OnboardingPlanValue>(initial)
  return (
    <>
      <OnboardingEindstrategie
        value={value}
        onChange={(patch) => setValue((v) => ({ ...v, ...patch }))}
        currentAge={currentAge}
        onNext={onNext}
        onBack={() => {}}
      />
      <output data-testid="state">{JSON.stringify(value)}</output>
    </>
  )
}

const stateNow = () =>
  JSON.parse(screen.getByTestId('state').textContent ?? '{}') as OnboardingPlanValue
const tile = (name: RegExp) => screen.getByRole('button', { name })
// OnboardingShell rendert de footer dubbel (desktop + mobiele sticky bar).
const verder = () => screen.getAllByRole('button', { name: 'Verder' })[0]
const stopVeld = () => screen.getByLabelText(/Stopleeftijd/)
const eindVeld = () => screen.getByLabelText('Tot welke leeftijd moet je geld reiken?')
const bedragVeld = () => screen.getByLabelText(/Bedrag dat over moet blijven/)

describe('OnboardingEindstrategie — de twee vragen in gewone taal', () => {
  it('biedt drie ankers (zonder "Nu") en drie eind-vormen in de woorden van het besluit', () => {
    render(<Harness />)
    expect(tile(/Zo vroeg als het kan/)).toBeInTheDocument()
    expect(tile(/Op mijn AOW-leeftijd/)).toBeInTheDocument()
    expect(tile(/Op een leeftijd die ik kies/)).toBeInTheDocument()
    // `now` blijft in Voorkeuren — een nieuwe gebruiker begint er niet mee.
    expect(screen.queryByRole('button', { name: /^Nu\b/ })).not.toBeInTheDocument()

    expect(tile(/Niets, het mag op zijn/)).toBeInTheDocument()
    expect(tile(/Een bedrag voor later of voor anderen/)).toBeInTheDocument()
    expect(tile(/Mijn vermogen mag niet slinken/)).toBeInTheDocument()

    expect(screen.getByText('Wanneer wil je stoppen met werken?')).toBeInTheDocument()
    expect(
      screen.getByText('Tot welke leeftijd moet je geld reiken, en wat moet er dan nog over zijn?'),
    ).toBeInTheDocument()
    // Geen hardcoded AOW-leeftijd op de tegel: de onboarding kent de AOW-tabel niet.
    expect(tile(/Op mijn AOW-leeftijd/).textContent).not.toMatch(/\b67\b/)
  })

  it('tegelrijen zijn groepen met een label naar hun vraagkop', () => {
    render(<Harness />)
    expect(screen.getByRole('group', { name: 'Wanneer wil je stoppen met werken?' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Wat moet er dan nog over zijn?' })).toBeInTheDocument()
  })

  it('begint op solved × deplete met eindleeftijd 90, zonder stopleeftijd- of bedragveld', () => {
    render(<Harness />)
    expect(tile(/Zo vroeg als het kan/)).toHaveAttribute('aria-pressed', 'true')
    expect(tile(/Niets, het mag op zijn/)).toHaveAttribute('aria-pressed', 'true')
    expect(eindVeld()).toHaveValue(90)
    // De <input min/max> lezen de ene grens (DB-CHECK 60..120) via plan-draft.
    expect(eindVeld()).toHaveAttribute('min', String(END_AGE_MIN))
    expect(eindVeld()).toHaveAttribute('max', String(END_AGE_MAX))
    expect(screen.queryByLabelText(/Stopleeftijd/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Bedrag dat over moet blijven/)).not.toBeInTheDocument()
  })

  it('AOW-anker: dispatch aow zonder stopleeftijd; de eind-vorm blijft deplete (nooit "pensioen")', () => {
    render(<Harness />)
    fireEvent.click(tile(/Op mijn AOW-leeftijd/))
    expect(stateNow()).toMatchObject({
      fire_stop_anchor: 'aow',
      fire_stop_age: null,
      fire_end_strategy: 'deplete',
    })
    expect(screen.queryByLabelText(/Stopleeftijd/)).not.toBeInTheDocument()
  })

  it('eigen leeftijd: veld verschijnt met standaard huidige leeftijd + 5 (halve jaren) en dispatch age', () => {
    render(<Harness currentAge={40} />)
    fireEvent.click(tile(/Op een leeftijd die ik kies/))
    expect(stateNow()).toMatchObject({ fire_stop_anchor: 'age', fire_stop_age: 45 })
    expect(stopVeld()).toHaveValue(45)

    fireEvent.change(stopVeld(), { target: { value: '58.5' } })
    expect(stateNow().fire_stop_age).toBe(58.5)

    // Terug naar "zo vroeg als het kan" wist de stopleeftijd.
    fireEvent.click(tile(/Zo vroeg als het kan/))
    expect(stateNow()).toMatchObject({ fire_stop_anchor: 'solved', fire_stop_age: null })
  })

  it('zonder geboortedatum valt de standaard-stopleeftijd op de helper terug (60)', () => {
    render(<Harness currentAge={null} />)
    fireEvent.click(tile(/Op een leeftijd die ik kies/))
    expect(stateNow().fire_stop_age).toBe(60)
  })
})

describe('OnboardingEindstrategie — kruiscombinaties anker × eind-vorm', () => {
  it('aow × legacy: geen stopleeftijd-veld, wél eindleeftijd én bedragveld', () => {
    render(<Harness />)
    fireEvent.click(tile(/Op mijn AOW-leeftijd/))
    fireEvent.click(tile(/Een bedrag voor later of voor anderen/))
    expect(stateNow()).toMatchObject({ fire_stop_anchor: 'aow', fire_stop_age: null, fire_end_strategy: 'legacy' })
    expect(screen.queryByLabelText(/Stopleeftijd/)).not.toBeInTheDocument()
    expect(eindVeld()).toBeInTheDocument()
    expect(bedragVeld()).toBeInTheDocument()
  })

  it('aow × perpetual: geen stopleeftijd-, geen eindleeftijd-, geen bedragveld; wél de uitleg', () => {
    render(<Harness />)
    fireEvent.click(tile(/Op mijn AOW-leeftijd/))
    fireEvent.click(tile(/Mijn vermogen mag niet slinken/))
    expect(stateNow()).toMatchObject({ fire_stop_anchor: 'aow', fire_end_strategy: 'perpetual' })
    expect(screen.queryByLabelText(/Stopleeftijd/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Tot welke leeftijd moet je geld reiken?')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Bedrag dat over moet blijven/)).not.toBeInTheDocument()
    expect(
      screen.getByText('Dan rekent de app zonder eindleeftijd: je leeft van wat je vermogen oplevert.'),
    ).toBeInTheDocument()
  })

  it('age × legacy: stopleeftijd-, eindleeftijd- én bedragveld; dispatch draagt alle drie assen', () => {
    render(<Harness currentAge={40} />)
    fireEvent.click(tile(/Op een leeftijd die ik kies/))
    fireEvent.click(tile(/Een bedrag voor later of voor anderen/))
    expect(stateNow()).toMatchObject({ fire_stop_anchor: 'age', fire_stop_age: 45, fire_end_strategy: 'legacy' })
    expect(stopVeld()).toBeInTheDocument()
    expect(eindVeld()).toBeInTheDocument()
    expect(bedragVeld()).toBeInTheDocument()
  })

  it('age × perpetual: stopleeftijd-veld blijft, eindleeftijd-veld verdwijnt', () => {
    render(<Harness currentAge={40} />)
    fireEvent.click(tile(/Op een leeftijd die ik kies/))
    fireEvent.click(tile(/Mijn vermogen mag niet slinken/))
    expect(stateNow()).toMatchObject({ fire_stop_anchor: 'age', fire_stop_age: 45, fire_end_strategy: 'perpetual' })
    expect(stopVeld()).toBeInTheDocument()
    expect(screen.queryByLabelText('Tot welke leeftijd moet je geld reiken?')).not.toBeInTheDocument()
  })
})

describe('OnboardingEindstrategie — validatie vóór "Verder"', () => {
  it('legacy: zonder bedrag of met 0 blokkeert Verder ("Een bedrag boven nul." — spiegel van de route-positive()); met bedrag gaat het door', () => {
    const onNext = vi.fn()
    render(<Harness onNext={onNext} />)
    fireEvent.click(tile(/Een bedrag voor later of voor anderen/))

    fireEvent.click(verder())
    expect(onNext).not.toHaveBeenCalled()
    expect(screen.getByText('Een bedrag boven nul.')).toBeInTheDocument()
    expect(bedragVeld()).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(bedragVeld(), { target: { value: '0' } })
    fireEvent.click(verder())
    expect(onNext).not.toHaveBeenCalled()

    fireEvent.change(bedragVeld(), { target: { value: '100.000' } })
    expect(stateNow().fire_legacy_amount).toBe('100.000')
    fireEvent.click(verder())
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('perpetual zonder verdere invoer gaat door', () => {
    const onNext = vi.fn()
    render(<Harness onNext={onNext} />)
    fireEvent.click(tile(/Mijn vermogen mag niet slinken/))
    fireEvent.click(verder())
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('stopleeftijd op of voorbij de eindleeftijd blokkeert Verder met een fout onder het veld', () => {
    const onNext = vi.fn()
    render(<Harness onNext={onNext} />)
    fireEvent.click(tile(/Op een leeftijd die ik kies/))
    fireEvent.change(stopVeld(), { target: { value: '95' } })
    fireEvent.click(verder())
    expect(onNext).not.toHaveBeenCalled()
    expect(screen.getByText('Je stopleeftijd moet vóór de eindleeftijd van je plan (90) liggen.')).toBeInTheDocument()
    expect(stopVeld()).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(stopVeld(), { target: { value: '60' } })
    fireEvent.click(verder())
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('leeg stopleeftijd-veld onder age → "Kies een stopleeftijd."', () => {
    const onNext = vi.fn()
    render(<Harness onNext={onNext} />)
    fireEvent.click(tile(/Op een leeftijd die ik kies/))
    fireEvent.change(stopVeld(), { target: { value: '' } })
    expect(stateNow().fire_stop_age).toBeNull()
    expect(screen.getByText('Kies een stopleeftijd.')).toBeInTheDocument()
    fireEvent.click(verder())
    expect(onNext).not.toHaveBeenCalled()
  })

  it('stopleeftijd buiten halve jaren (58,3) → "In stappen van een half jaar."', () => {
    const onNext = vi.fn()
    render(<Harness onNext={onNext} />)
    fireEvent.click(tile(/Op een leeftijd die ik kies/))
    fireEvent.change(stopVeld(), { target: { value: '58.3' } })
    expect(screen.getByText('In stappen van een half jaar.')).toBeInTheDocument()
    fireEvent.click(verder())
    expect(onNext).not.toHaveBeenCalled()
  })

  it(`eindleeftijd buiten ${END_AGE_MIN}–${END_AGE_MAX} blokkeert Verder (DB-CHECK-grens)`, () => {
    const onNext = vi.fn()
    render(<Harness onNext={onNext} />)
    fireEvent.change(eindVeld(), { target: { value: '55' } })
    fireEvent.click(verder())
    expect(onNext).not.toHaveBeenCalled()
    expect(screen.getByText(`Tussen ${END_AGE_MIN} en ${END_AGE_MAX} jaar.`)).toBeInTheDocument()
  })

  it('a11y: precies één role="alert" na een geblokkeerde Verder; fout en hint hangen via aria-describedby aan het veld', () => {
    render(<Harness />)
    fireEvent.click(tile(/Op een leeftijd die ik kies/))
    fireEvent.change(stopVeld(), { target: { value: '95' } })
    expect(screen.queryAllByRole('alert')).toHaveLength(0)
    fireEvent.click(verder())
    expect(screen.getAllByRole('alert')).toHaveLength(1)

    const described = stopVeld().getAttribute('aria-describedby') ?? ''
    expect(described).toContain('ob-plan-stop-age-error')
    expect(described).toContain('ob-plan-stop-age-hint')
    expect(document.getElementById('ob-plan-stop-age-error')?.textContent).toMatch(/vóór de eindleeftijd/)
    expect(document.getElementById('ob-plan-stop-age-hint')).toBeInTheDocument()
  })
})

describe('planDraftFromOnboarding — het concept dat validatePlanDraft toetst', () => {
  it('leest het bedrag via parseBedragInput (één bedrag-parser met page.tsx) en laat leeg als NaN', () => {
    const basis: OnboardingPlanValue = { ...INITIAL_HORIZON_DATA, fire_end_strategy: 'legacy' }
    expect(planDraftFromOnboarding({ ...basis, fire_legacy_amount: '100.000' }).legacyAmount).toBe(100000)
    expect(planDraftFromOnboarding({ ...basis, fire_legacy_amount: '2500,50' }).legacyAmount).toBe(2500.5)
    expect(Number.isNaN(planDraftFromOnboarding({ ...basis, fire_legacy_amount: '' }).legacyAmount)).toBe(true)
  })

  it('draagt anker en stopleeftijd één-op-één over', () => {
    const d = planDraftFromOnboarding({
      ...INITIAL_HORIZON_DATA,
      fire_stop_anchor: 'age',
      fire_stop_age: 58.5,
      fire_end_age: 95,
    })
    expect(d).toMatchObject({ anchor: 'age', stopAge: 58.5, endForm: 'deplete', endAge: 95 })
  })
})

describe('OnboardingEindstrategie — perpetual zet de eindleeftijd op 100 (eigenaar-besluit 5 sep 2026)', () => {
  it('kiest "Mijn vermogen mag niet slinken" → fire_end_age 100; terug naar "Niets" → standaard 90', () => {
    render(<Harness />)
    fireEvent.click(tile(/Mijn vermogen mag niet slinken/))
    expect(stateNow()).toMatchObject({ fire_end_strategy: 'perpetual', fire_end_age: 100 })
    fireEvent.click(tile(/Niets, het mag op zijn/))
    expect(stateNow()).toMatchObject({ fire_end_strategy: 'deplete', fire_end_age: 90 })
  })
  it('een stopleeftijd van 92 blokkeert onder deplete/90, maar gaat door onder perpetual (eindleeftijd 100)', () => {
    const onNext = vi.fn()
    render(<Harness onNext={onNext} />)
    fireEvent.click(tile(/Op een leeftijd die ik kies/))
    fireEvent.change(stopVeld(), { target: { value: '92' } })
    fireEvent.click(verder())
    expect(onNext).not.toHaveBeenCalled()
    fireEvent.click(tile(/Mijn vermogen mag niet slinken/))
    fireEvent.click(verder())
    expect(onNext).toHaveBeenCalledTimes(1)
  })
})
