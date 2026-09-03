/**
 * Regressietests bij WF-START-06-bug1 — "Verder blokkeert niet op een absurd
 * totaalbedrag".
 *
 * Stap ③ (Uitgaven) berekende de melding "Voer een realistisch bedrag in" wél
 * bij een totaal boven de grens, maar `handleNext()` toetste alleen op `<= 0`.
 * Gevolg: de wizard liep door met €600.000/maand, wat op stap ⑦ (Pensioen) een
 * prefill van €450.000/maand opleverde (75% van het doorgelaten bedrag).
 *
 * Deze suite pint de herstelde gate vast, inclusief de exacte grenswaarde
 * (blokkeren is `>`, niet `>=`) zodat de melding en de gate niet opnieuw uit
 * elkaar kunnen lopen.
 */
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import type { CheckDraft } from '@/lib/check/use-check-draft'
import { StepUitgaven } from './step-uitgaven'

type Intake = CheckDraft['intake']

function Harness({ onNext = () => {} }: { onNext?: () => void }) {
  const [intake, setIntake] = useState<Intake>(() => ({
    dateOfBirth: '1990-01-01',
    assets: [],
    debts: [],
    lifeEvents: [],
    pension: {},
  }))
  const onChange = (patch: Partial<Intake>) => setIntake((prev) => ({ ...prev, ...patch }))
  return (
    <>
      <StepUitgaven intake={intake} onChange={onChange} onNext={onNext} onBack={() => {}} />
      <output data-testid="expenses">{JSON.stringify(intake.expenses ?? null)}</output>
    </>
  )
}

/** Vult het totaal-veld en klikt "Verder". */
function vulTotaalEnGaVerder(waarde: string) {
  fireEvent.change(screen.getByLabelText(/Totale maanduitgaven/), { target: { value: waarde } })
  fireEvent.click(screen.getByRole('button', { name: 'Verder' }))
}

describe('WF-START-06-bug1 — stap ③ Uitgaven, grens op het totaalbedrag', () => {
  it('blokkeert "Verder" bij een onrealistisch totaal en toont de melding', () => {
    const onNext = vi.fn()
    render(<Harness onNext={onNext} />)

    vulTotaalEnGaVerder('600000')

    expect(onNext).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Voer een realistisch bedrag in')
  })

  it('laat het exacte grensbedrag wél door (grens is >, niet >=)', () => {
    const onNext = vi.fn()
    render(<Harness onNext={onNext} />)

    vulTotaalEnGaVerder('500000')

    expect(onNext).toHaveBeenCalledTimes(1)
    expect(JSON.parse(screen.getByTestId('expenses').textContent || 'null')).toMatchObject({
      totaalMaand: 500000,
    })
  })

  it('blijft blokkeren op een leeg/nul totaal, met de eigen melding', () => {
    const onNext = vi.fn()
    render(<Harness onNext={onNext} />)

    fireEvent.click(screen.getByRole('button', { name: 'Verder' }))

    expect(onNext).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Vul je maandelijkse totaaluitgaven in')
  })

  it('gaat door bij een realistisch totaal', () => {
    const onNext = vi.fn()
    render(<Harness onNext={onNext} />)

    vulTotaalEnGaVerder('2600')

    expect(onNext).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('blokkeert ook wanneer de subvelden samen boven de grens uitkomen', () => {
    const onNext = vi.fn()
    render(<Harness onNext={onNext} />)

    fireEvent.change(screen.getByLabelText(/^Wonen/), { target: { value: '400000' } })
    fireEvent.change(screen.getByLabelText(/^Vaste lasten/), { target: { value: '200000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verder' }))

    expect(onNext).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Voer een realistisch bedrag in')
  })
})
