import { describe, it, expect, vi } from 'vitest'
import { useEffect, useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { EventPaneEdit, initFormState, type EditFormState } from './event-pane-edit'
import { risicoEventVoorstel } from '@/lib/horizon/event-pane-voorstel'
import { computeKostenKoper } from '@/lib/kosten-koper'
import { formatCurrency } from '@/lib/format'
import { STARTERSVRIJSTELLING_MAX } from '@/lib/constants'
import type { FinancialInput } from '@/lib/horizon-data'
import type { FireParams } from '@/lib/fire-params'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'

vi.mock('./event-preview-sim', () => ({
  EMPTY_SIM_RESULT: { rows: [], fireAgeFractional: null },
  previewSimResult: () => ({ rows: [], fireAgeFractional: null }),
}))
vi.mock('./event-impact-preview', () => ({
  EventImpactPreview: () => null,
}))

const baselineInput = {
  dateOfBirth: '1986-01-01',
  monthlyIncome: 3200,
  monthlyExpenses: 2800,
} as unknown as FinancialInput

let latest: EditFormState | null = null

function Harness({ initial }: { initial: EditFormState }) {
  const [state, setState] = useState(initial)
  useEffect(() => {
    latest = state
  }, [state])
  return (
    <EventPaneEdit
      state={state}
      setState={setState}
      existingEvent={null}
      baselineEvents={[]}
      baselineInput={baselineInput}
      baselineFire={null}
      fireParams={{} as FireParams}
      fireStrategy={{} as FireStrategyConfig}
      withdrawalStrategy={{} as WithdrawalStrategyConfig}
      endAge={90}
      saving={false}
      saveError={null}
      onSave={() => {}}
      onDelete={() => {}}
    />
  )
}

function bedragVeld(index: number): HTMLInputElement {
  return screen.getAllByRole('spinbutton').filter(el => (el as HTMLInputElement).step === '500' || (el as HTMLInputElement).step === '50')[index] as HTMLInputElement
}

describe('EventPaneEdit — berekend voorstel', () => {
  it('werkloosheid: blokken tonen het voorstel, met uitleg', () => {
    const v = risicoEventVoorstel('werkloosheid', baselineInput, 40)!
    render(<Harness initial={initFormState('werkloosheid', null, 40, baselineInput)} />)
    expect(screen.getByTestId('event-voorstel-uitleg')).toBeTruthy()
    expect(screen.getByText(/Zo komt dit voorstel tot stand/)).toBeTruthy()
    // Eenmalig-veld = transitievergoeding uit de motor
    expect(Number(bedragVeld(0).value)).toBe(v.velden.oneTimeAmount)
    // Nog gelijk aan het voorstel → geen "opnieuw invullen"
    expect(screen.queryByRole('button', { name: 'Voorstel opnieuw invullen' })).toBeNull()
  })

  it('na aanpassen verschijnt "Voorstel opnieuw invullen" en zet het voorstel terug', () => {
    const v = risicoEventVoorstel('werkloosheid', baselineInput, 40)!
    render(<Harness initial={initFormState('werkloosheid', null, 40, baselineInput)} />)
    fireEvent.change(bedragVeld(0), { target: { value: '1' } })
    expect(latest?.oneTimeAmount).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Voorstel opnieuw invullen' }))
    expect(latest?.oneTimeAmount).toBe(v.velden.oneTimeAmount)
    expect(screen.queryByRole('button', { name: 'Voorstel opnieuw invullen' })).toBeNull()
  })

  it('overlijden partner: blijvend bedrag = de motor, uitleg noemt het ontbrekende nabestaandenpensioen', () => {
    const v = risicoEventVoorstel('overlijden_partner', baselineInput, 40)!
    render(<Harness initial={initFormState('overlijden_partner', null, 40, baselineInput)} />)
    expect(latest?.contAmount).toBe(v.velden.contAmount)
    expect(latest?.contDirection).toBe('expense')
    expect(screen.getByText(/nabestaandenpensioen rekenen we niet mee/i)).toBeTruthy()
  })

  it('huis kopen: story rekent kosten koper via de motor, zonder voorstel-uitleg', () => {
    render(<Harness initial={initFormState('house_purchase', null, 30)} />)
    expect(screen.queryByTestId('event-voorstel-uitleg')).toBeNull()
    const verwacht = computeKostenKoper({ aankoopprijs: 400000, isStarter: false, hasNHG: false })
    expect(latest?.oneTimeAmount).toBe(verwacht.totaal)
    // Starter aan (eerste story-toggle) → overdrachtsbelasting valt weg
    expect(screen.getByText(/Je eerste eigen woning/)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('switch', { name: 'Nee' })[0]!)
    expect(latest?.storyAnswers?.starter).toBe(true)
    expect(latest?.oneTimeAmount).toBe(
      computeKostenKoper({ aankoopprijs: 400000, isStarter: true, hasNHG: false }).totaal,
    )
    // Microcopy noemt de grens uit lib/constants (geformatteerd), geen losse literal
    expect(screen.getByText(/startersvrijstelling/).textContent).toContain(formatCurrency(STARTERSVRIJSTELLING_MAX))
  })

  it('andere types tonen geen voorstel-uitleg', () => {
    render(<Harness initial={initFormState('custom', null, 40, baselineInput)} />)
    expect(screen.queryByTestId('event-voorstel-uitleg')).toBeNull()
  })
})
