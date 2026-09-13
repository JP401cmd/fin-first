import { describe, it, expect, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SaleConfigFields } from './sale-config-fields'
import { draftToSaleConfig, saleConfigToDraft, type SaleConfigDraft } from '@/lib/sale-config-draft'

/**
 * De verkoopinstelling-velden, gedeeld door het bezittingenformulier en stap 4 van de
 * plan-review (TPR-15). Gepind: de drie standen, de velden per stand, en dat de
 * aflos-keuze alleen verschijnt als er eigen schulden zijn.
 */

afterEach(cleanup)

let laatste: SaleConfigDraft | null = null

function Host({ start, debts = [] }: { start: unknown; debts?: { id: string; name: string }[] }) {
  const [draft, setDraft] = useState(() => saleConfigToDraft(start))
  laatste = draft
  return <SaleConfigFields draft={draft} onChange={setDraft} activeDebts={debts} />
}

describe('SaleConfigFields', () => {
  it('toont de standaardstand zonder config en de uiterlijke leeftijd', () => {
    render(<Host start={null} />)
    expect(screen.getByRole('radio', { name: 'Automatisch bij behoefte' })).toBeChecked()
    expect(screen.getByPlaceholderText('Bijv. 75')).toBeInTheDocument()
    expect(screen.queryByText('Aflossen bij verkoop')).toBeNull()
  })

  it('vast moment: kiest datum en bouwt die config', () => {
    render(<Host start={null} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Op een vast moment' }))
    fireEvent.click(screen.getByRole('button', { name: 'Op datum' }))
    fireEvent.change(document.querySelector('input[type=date]')!, { target: { value: '2041-03-01' } })
    expect(draftToSaleConfig(laatste!)).toEqual({ stand: 'vast_moment', triggerDate: '2041-03-01' })
  })

  it('niet verkopen verbergt de kosten- en aflosvelden', () => {
    render(<Host start={{ stand: 'wanneer_nodig' }} debts={[{ id: 'd1', name: 'Autolening' }]} />)
    expect(screen.getByText('Aflossen bij verkoop')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Niet verkopen' }))
    expect(screen.queryByPlaceholderText('Bijv. 6')).toBeNull()
    expect(screen.queryByText('Aflossen bij verkoop')).toBeNull()
  })

  it('aflossen: vinkt een schuld aan en uit', () => {
    render(<Host start={null} debts={[{ id: 'd1', name: 'Autolening' }]} />)
    const vak = screen.getByRole('checkbox', { name: 'Autolening' })
    fireEvent.click(vak)
    expect(laatste!.payoffDebtIds).toEqual(['d1'])
    fireEvent.click(vak)
    expect(laatste!.payoffDebtIds).toEqual([])
  })
})
