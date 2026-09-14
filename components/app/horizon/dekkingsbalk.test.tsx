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
  it('toont de drie tegels Reikt tot · Plan tot · Gedekt met basis → wat-als', () => {
    render(<Dekkingsbalk data={{ ...basis, scenarioReach: { kind: 'reikt-tot', age: 84, endAge: 90 }, scenarioPct: 80 }} />)
    expect(screen.getByText('Reikt tot')).toBeInTheDocument()
    expect(screen.getByText('Plan tot')).toBeInTheDocument()
    expect(screen.getByText('Gedekt')).toBeInTheDocument()
    expect(screen.getByTestId('dekkingsbalk-reikt')).toHaveTextContent('75 → 84')
    expect(screen.getByTestId('dekkingsbalk-gedekt')).toHaveTextContent('50% → 80%')
    expect(screen.getByTestId('dekkingsbalk-plan')).toHaveTextContent('90')
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
