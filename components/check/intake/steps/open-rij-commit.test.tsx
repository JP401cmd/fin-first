/**
 * Regressietests bij bevinding C4 — "Prominente knop vernietigt invoer".
 *
 * De Vrijheidscheck bewaarde een getypt bedrag alleen in de lokale state van de
 * geopende preset-rij; de brede knop onderaan navigeerde onvoorwaardelijk door en
 * gooide die invoer stilzwijgend weg. Deze suite pint het herstelde gedrag vast:
 *  • "Verder" is altijd de primaire actie en commit elke openstaande, geldige rij;
 *  • "Overslaan" is secundair en verschijnt alleen als er echt niets in te vullen valt;
 *  • ook "Terug" verliest de invoer niet meer;
 *  • stap ⑨ (Doel) is bewust buiten scope — de controletest bewijst waarom.
 *
 * De harnas-componenten spiegelen `patchIntake` uit `useCheckDraft`: onChange
 * merget de patch in de intake, precies zoals de wizard dat doet.
 */
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import type { CheckDraft } from '@/lib/check/use-check-draft'
import type { CheckIntakeAsset, CheckIntakeDebt, CheckIntakeLifeEvent } from '@/lib/check/types'
import { StepBezittingen } from './step-bezittingen'
import { StepSchulden } from './step-schulden'
import { StepGebeurtenissen } from './step-gebeurtenissen'
import { StepDoel } from './step-doel'

type Intake = CheckDraft['intake']

function baseIntake(): Intake {
  return {
    dateOfBirth: '1990-01-01',
    assets: [],
    debts: [],
    lifeEvents: [],
    expenses: { wonen: 1000, vasteLasten: 500, vrijBesteedbaar: 500, totaalMaand: 2000 },
    pension: {},
  }
}

/** Leest de gespiegelde intake-state uit de harnas terug. */
function readState<T>(testId: string): T {
  return JSON.parse(screen.getByTestId(testId).textContent || 'null') as T
}

function Harness({
  step,
  onNext = () => {},
  onBack = () => {},
}: {
  step: 'bezittingen' | 'schulden' | 'gebeurtenissen' | 'doel'
  onNext?: () => void
  onBack?: () => void
}) {
  const [intake, setIntake] = useState<Intake>(baseIntake)
  const onChange = (patch: Partial<Intake>) => setIntake((prev) => ({ ...prev, ...patch }))
  const props = { intake, onChange, onNext, onBack }
  return (
    <>
      {step === 'bezittingen' && <StepBezittingen {...props} />}
      {step === 'schulden' && <StepSchulden {...props} />}
      {step === 'gebeurtenissen' && <StepGebeurtenissen {...props} />}
      {step === 'doel' && <StepDoel {...props} />}
      <output data-testid="assets">{JSON.stringify(intake.assets)}</output>
      <output data-testid="debts">{JSON.stringify(intake.debts)}</output>
      <output data-testid="events">{JSON.stringify(intake.lifeEvents)}</output>
      <output data-testid="goal">{JSON.stringify(intake.goal ?? null)}</output>
    </>
  )
}

describe('C4 — stap ⑤ Bezittingen', () => {
  it('commit een openstaande, ingevulde rij wanneer je op Verder klikt', () => {
    const onNext = vi.fn()
    render(<Harness step="bezittingen" onNext={onNext} />)

    fireEvent.click(screen.getByRole('button', { name: /Spaargeld/ }))
    fireEvent.change(screen.getByLabelText('Waarde Spaargeld'), { target: { value: '25000' } })

    // De invoer is nog NIET bevestigd (geen klik op "Toevoegen").
    expect(readState<CheckIntakeAsset[]>('assets')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Verder' }))

    const assets = readState<CheckIntakeAsset[]>('assets')
    expect(assets).toHaveLength(1)
    expect(assets[0]).toMatchObject({ assetType: 'savings', name: 'Spaargeld', value: 25000 })
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('houdt de opgegeven naam en het rendement van een openstaande rij vast', () => {
    render(<Harness step="bezittingen" />)

    fireEvent.click(screen.getByRole('button', { name: /Beleggingen/ }))
    fireEvent.change(screen.getByLabelText('Naam voor Beleggingen'), {
      target: { value: 'ETF bij DEGIRO' },
    })
    fireEvent.change(screen.getByLabelText('Waarde Beleggingen'), { target: { value: '50000' } })
    fireEvent.change(
      screen.getByLabelText('Verwacht jaarrendement Beleggingen in procent (optioneel)'),
      { target: { value: '6' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Verder' }))

    expect(readState<CheckIntakeAsset[]>('assets')[0]).toMatchObject({
      name: 'ETF bij DEGIRO',
      value: 50000,
      expectedReturnPct: 6,
    })
  })

  it('neemt een tweede openstaande rij mee naast een al bevestigde bezitting', () => {
    render(<Harness step="bezittingen" />)

    // Eerste bezitting netjes bevestigen via "Toevoegen".
    fireEvent.click(screen.getByRole('button', { name: /Spaargeld/ }))
    fireEvent.change(screen.getByLabelText('Waarde Spaargeld'), { target: { value: '10000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))
    expect(readState<CheckIntakeAsset[]>('assets')).toHaveLength(1)

    // Tweede rij openen en invullen, maar NIET bevestigen.
    fireEvent.click(screen.getByRole('button', { name: /Crypto/ }))
    fireEvent.change(screen.getByLabelText('Waarde Crypto'), { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verder' }))

    const assets = readState<CheckIntakeAsset[]>('assets')
    expect(assets).toHaveLength(2)
    expect(assets.map((a) => a.value)).toEqual([10000, 5000])
  })

  it('verliest de invoer ook niet wanneer je op Terug klikt', () => {
    const onBack = vi.fn()
    render(<Harness step="bezittingen" onBack={onBack} />)

    fireEvent.click(screen.getByRole('button', { name: /Spaargeld/ }))
    fireEvent.change(screen.getByLabelText('Waarde Spaargeld'), { target: { value: '25000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Terug' }))

    expect(readState<CheckIntakeAsset[]>('assets')).toHaveLength(1)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('toont Verder altijd primair en Overslaan alleen als er niets in te vullen valt', () => {
    const onNext = vi.fn()
    render(<Harness step="bezittingen" onNext={onNext} />)

    // Lege lijst, geen open rij → beide knoppen, Verder voorop.
    expect(screen.getByRole('button', { name: 'Verder' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Overslaan (geen bezittingen)' })).toBeInTheDocument()

    // Zodra er geldige invoer openstaat, verdwijnt de overslaan-uitweg.
    fireEvent.click(screen.getByRole('button', { name: /Spaargeld/ }))
    fireEvent.change(screen.getByLabelText('Waarde Spaargeld'), { target: { value: '25000' } })
    expect(screen.queryByRole('button', { name: /Overslaan/ })).toBeNull()
    expect(screen.getByText('Je openstaande invoer nemen we mee als je verdergaat.')).toBeInTheDocument()

    // Rij annuleren → uitweg komt terug, invoer is bewust weggegooid.
    fireEvent.click(screen.getByRole('button', { name: 'Annuleren' }))
    expect(screen.getByRole('button', { name: 'Overslaan (geen bezittingen)' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Overslaan (geen bezittingen)' }))
    expect(readState<CheckIntakeAsset[]>('assets')).toHaveLength(0)
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('negeert een geopende rij zonder geldig bedrag', () => {
    render(<Harness step="bezittingen" />)

    fireEvent.click(screen.getByRole('button', { name: /Spaargeld/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Verder' }))

    expect(readState<CheckIntakeAsset[]>('assets')).toHaveLength(0)
  })
})

describe('C4 — stap ⑥ Schulden', () => {
  it('commit een openstaande, ingevulde schuld wanneer je op Verder klikt', () => {
    const onNext = vi.fn()
    render(<Harness step="schulden" onNext={onNext} />)

    fireEvent.click(screen.getByRole('button', { name: /Hypotheek/ }))
    fireEvent.change(screen.getByLabelText('Openstaand saldo'), { target: { value: '250000' } })
    fireEvent.change(screen.getByLabelText(/Rente %/), { target: { value: '3,5' } })

    expect(screen.queryByRole('button', { name: /Overslaan/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Verder' }))

    const debts = readState<CheckIntakeDebt[]>('debts')
    expect(debts).toHaveLength(1)
    expect(debts[0]).toMatchObject({
      debtType: 'mortgage',
      name: 'Hypotheek',
      balance: 250000,
      interestRatePct: 3.5,
    })
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('laat Overslaan staan zolang er geen schuld is ingevuld', () => {
    render(<Harness step="schulden" />)

    expect(screen.getByRole('button', { name: 'Verder' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Overslaan (geen schulden)' }))
    expect(readState<CheckIntakeDebt[]>('debts')).toHaveLength(0)
  })
})

describe('C4 — stap ⑧ Levensgebeurtenissen', () => {
  it('commit een openstaande gebeurtenis met het aangepaste bedrag als kost', () => {
    const onNext = vi.fn()
    render(<Harness step="gebeurtenissen" onNext={onNext} />)

    fireEvent.click(screen.getByRole('button', { name: /Huwelijk/ }))
    fireEvent.change(screen.getByLabelText('Kosten'), { target: { value: '30000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verder' }))

    const events = readState<CheckIntakeLifeEvent[]>('events')
    expect(events).toHaveLength(1)
    // 'cost' wordt negatief weggeschreven (CheckIntakeLifeEvent-contract).
    expect(events[0]).toMatchObject({ key: 'huwelijk', amount: -30000 })
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('schrijft een meevaller positief weg en verbergt Overslaan zodra een rij openstaat', () => {
    render(<Harness step="gebeurtenissen" />)

    expect(screen.getByRole('button', { name: 'Overslaan (geen gebeurtenissen)' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Erfenis/ }))
    expect(screen.queryByRole('button', { name: /Overslaan/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Verder' }))
    expect(readState<CheckIntakeLifeEvent[]>('events')[0]).toMatchObject({
      key: 'erfenis',
      amount: 50000,
    })
  })
})

describe('C4 — stap ⑨ Doel (controle: bewust buiten scope)', () => {
  it('commit het doel al bij het typen, dus Verder kan niets weggooien', () => {
    const onNext = vi.fn()
    render(<Harness step="doel" onNext={onNext} />)

    fireEvent.change(screen.getByLabelText(/Je grootste financiële doel/), {
      target: { value: 'Stoppen met werken voor mijn 55e' },
    })

    // Zonder enige knopklik staat het doel al in de intake.
    expect(readState<{ label: string } | null>('goal')).toMatchObject({
      label: 'Stoppen met werken voor mijn 55e',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Verder' }))
    expect(readState<{ label: string } | null>('goal')).toMatchObject({
      label: 'Stoppen met werken voor mijn 55e',
    })
    expect(onNext).toHaveBeenCalledTimes(1)
  })
})
