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
  basisEindvermogen: { kind: 'bedrag', euro: 120_000 },
  scenarioEindvermogen: null,
  euroView: 'real',
}

const tekst = (id: string) => screen.getByTestId(id).textContent?.replace(/ /g, ' ')

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
  it('toont de drie tegels Gedekt · Reikt tot · Eindvermogen met basis → wat-als (ADR 0145 D12)', () => {
    render(
      <Dekkingsbalk
        data={{
          ...basis,
          scenarioReach: { kind: 'reikt-tot', age: 84, endAge: 90 },
          scenarioPct: 80,
          scenarioEindvermogen: { kind: 'bedrag', euro: 210_000 },
        }}
      />,
    )
    // Spec antwoorden-naast-sliders §4 — de uitkomst eerst: Gedekt · Reikt tot · Eindvermogen.
    const volgorde = screen.getAllByTestId(/^dekkingsbalk-(gedekt|reikt|eindvermogen)$/).map((el) => el.getAttribute('data-testid'))
    expect(volgorde).toEqual(['dekkingsbalk-gedekt', 'dekkingsbalk-reikt', 'dekkingsbalk-eindvermogen'])
    expect(screen.getByText('Reikt tot')).toBeInTheDocument()
    expect(screen.getByText('Eindvermogen')).toBeInTheDocument()
    expect(screen.getByText('Gedekt')).toBeInTheDocument()
    expect(screen.getByTestId('dekkingsbalk-reikt')).toHaveTextContent('75 → 84')
    expect(screen.getByTestId('dekkingsbalk-gedekt')).toHaveTextContent('50% → 80%')
    // Bedragen komen AL GEDEFLATEERD binnen; de tegel formatteert alleen.
    expect(tekst('dekkingsbalk-eindvermogen')).toBe('€ 120.000 → € 210.000')
    // "Plan tot" is vervallen: de eindleeftijd staat al als as-label onder de balk.
    expect(screen.queryByTestId('dekkingsbalk-plan')).toBeNull()
    expect(screen.getByText('plan tot 90')).toBeInTheDocument()
    expect(screen.getByText("op je 90e, in huidige euro's")).toBeInTheDocument()
  })

  it("I3 · het onderschrift volgt de euro-weergave: 'nominal' → toekomstige euro's", () => {
    render(<Dekkingsbalk data={{ ...basis, euroView: 'nominal' }} />)
    expect(screen.getByText("op je 90e, in toekomstige euro's")).toBeInTheDocument()
    expect(screen.queryByText(/euro's van nu/)).toBeNull()
  })

  it('I1 · een run die opraakt toont geen bedrag maar "op vóór je 90e"; zonder bedrag geen euro-onderschrift', () => {
    render(<Dekkingsbalk data={{ ...basis, basisEindvermogen: { kind: 'op' }, scenarioEindvermogen: { kind: 'op' } }} />)
    expect(tekst('dekkingsbalk-eindvermogen')).toBe('op vóór je 90e')
    expect(screen.getByTestId('dekkingsbalk-eindvermogen').textContent).not.toMatch(/€|-/)
    expect(screen.queryByText(/in huidige euro's/)).toBeNull()
  })

  it('I1 · gemengd: "op vóór je 90e → € 50.000" en "€ 120.000 → op vóór je 90e", met onderschrift', () => {
    const { unmount } = render(
      <Dekkingsbalk data={{ ...basis, basisEindvermogen: { kind: 'op' }, scenarioEindvermogen: { kind: 'bedrag', euro: 50_000 } }} />,
    )
    expect(tekst('dekkingsbalk-eindvermogen')).toBe('op vóór je 90e → € 50.000')
    expect(screen.getByText("op je 90e, in huidige euro's")).toBeInTheDocument()
    unmount()
    render(<Dekkingsbalk data={{ ...basis, scenarioEindvermogen: { kind: 'op' } }} />)
    expect(tekst('dekkingsbalk-eindvermogen')).toBe('€ 120.000 → op vóór je 90e')
  })

  it('I1 · zonder eindleeftijd: "op vóór je eindleeftijd"', () => {
    render(<Dekkingsbalk data={{ ...basis, eindAge: null, basisEindvermogen: { kind: 'op' } }} />)
    expect(tekst('dekkingsbalk-eindvermogen')).toBe('op vóór je eindleeftijd')
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
