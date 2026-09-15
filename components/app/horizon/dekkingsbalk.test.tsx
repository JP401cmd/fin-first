import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Dekkingsbalk, dekkingsbalkPosities, type DekkingsasData } from './dekkingsbalk'

const basis: DekkingsasData = {
  stopAge: 60,
  eindAge: 90,
  basisReach: { kind: 'reikt-tot', age: 75, endAge: 90 },
  basisPct: 50,
  scenarioReach: null,
  scenarioPct: null,
  verkendReach: null,
  verkendStopAge: null,
  basisEindvermogen: 120_000,
  scenarioEindvermogen: null,
}

describe('dekkingsbalkPosities — één schaal van stop tot eind', () => {
  it('reikt-tot 75 op een as 60→90 staat op 50%', () => {
    expect(dekkingsbalkPosities(basis)).toEqual({ basisPct: 50, scenarioPct: null, verkendPct: null })
  })
  it('gedekt = 100%, nu-op = 0%, klemt buiten de as', () => {
    expect(dekkingsbalkPosities({ ...basis, basisReach: { kind: 'gedekt', endAge: 90 } })?.basisPct).toBe(100)
    expect(dekkingsbalkPosities({ ...basis, basisReach: { kind: 'nu-op' } })?.basisPct).toBe(0)
    expect(dekkingsbalkPosities({ ...basis, basisReach: { kind: 'reikt-tot', age: 95, endAge: 90 } })?.basisPct).toBe(100)
  })
  it('de wat-als-run zet een tweede markering', () => {
    expect(dekkingsbalkPosities({ ...basis, scenarioReach: { kind: 'reikt-tot', age: 84, endAge: 90 }, scenarioPct: 80 })?.scenarioPct).toBe(80)
  })
  it('zonder stop of eind, of met eind ≤ stop, is er geen as', () => {
    expect(dekkingsbalkPosities({ ...basis, stopAge: null })).toBeNull()
    expect(dekkingsbalkPosities({ ...basis, eindAge: 60 })).toBeNull()
  })
})

describe('Dekkingsbalk — rendering', () => {
  it('toont de drie tegels Reikt tot · Eindvermogen · Gedekt met basis → wat-als (ADR 0145 D12)', () => {
    render(
      <Dekkingsbalk
        data={{
          ...basis,
          scenarioReach: { kind: 'reikt-tot', age: 84, endAge: 90 },
          scenarioPct: 80,
          scenarioEindvermogen: 210_000,
        }}
      />,
    )
    expect(screen.getByText('Reikt tot')).toBeInTheDocument()
    expect(screen.getByText('Eindvermogen')).toBeInTheDocument()
    expect(screen.getByText('Gedekt')).toBeInTheDocument()
    expect(screen.getByTestId('dekkingsbalk-reikt')).toHaveTextContent('75 → 84')
    expect(screen.getByTestId('dekkingsbalk-gedekt')).toHaveTextContent('50% → 80%')
    // Bedragen komen AL GEDEFLATEERD binnen; de tegel formatteert alleen.
    expect(screen.getByTestId('dekkingsbalk-eindvermogen').textContent?.replace(/ /g, ' ')).toBe(
      '€ 120.000 → € 210.000',
    )
    // "Plan tot" is vervallen: de eindleeftijd staat al als as-label onder de balk.
    expect(screen.queryByTestId('dekkingsbalk-plan')).toBeNull()
    expect(screen.getByText('plan tot 90')).toBeInTheDocument()
    expect(screen.getByText("op je 90e, in euro's van nu")).toBeInTheDocument()
  })

  it('toont drie puntjes wanneer het eindvermogen ontbreekt (geen run) of gemaskeerd is', () => {
    render(<Dekkingsbalk data={{ ...basis, basisEindvermogen: null, scenarioEindvermogen: null }} />)
    expect(screen.getByTestId('dekkingsbalk-eindvermogen')).toHaveTextContent('···')
  })
  it('kleurt de vulling met het stoplicht: tekort = warning, gedekt = positive — nooit een module-accent', () => {
    const { container, rerender } = render(<Dekkingsbalk data={basis} />)
    expect(container.querySelector('[data-testid="dekkingsbalk-vulling"]')?.className).toContain('bg-warning')
    rerender(<Dekkingsbalk data={{ ...basis, basisReach: { kind: 'gedekt', endAge: 90 }, basisPct: 100 }} />)
    expect(container.querySelector('[data-testid="dekkingsbalk-vulling"]')?.className).toContain('bg-positive')
    expect(container.innerHTML).not.toMatch(/bg-horizon-/)
  })
  it('heeft een toegankelijke meter (role=meter, aria-valuenow = basis-dekking)', () => {
    render(<Dekkingsbalk data={basis} />)
    expect(screen.getByRole('meter', { name: /dekking/i })).toHaveAttribute('aria-valuenow', '50')
  })
})
