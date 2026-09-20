import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { LabRad, RAD_RIJ_PX, indexVanScroll, type LabRadItem } from './lab-rad'

/**
 * LabRad — het draairad van de compacte vorm (ADR 0170 B11). Bediening is VEGEN
 * (eigenaarskeuze): een scroll-container met snap. Hier wordt de landing getoetst — welke
 * rij in het midden staat na het scrollen — plus het toetsenbord en de stoplichtpunten die
 * het B2-inzicht (alle knoppen bewegen mee) in beeld houden.
 */

const ITEMS: LabRadItem[] = [
  { key: 'verdienen', label: 'Meer verdienen', zone: 'rood' },
  { key: 'uitgeven', label: 'Minder uitgeven', zone: 'oranje' },
  { key: 'stop', label: 'Stopleeftijd', zone: 'groen' },
]

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('indexVanScroll', () => {
  it('rondt naar de dichtstbijzijnde rij en klemt op de lijst', () => {
    expect(indexVanScroll(0, 3)).toBe(0)
    expect(indexVanScroll(RAD_RIJ_PX * 1.4, 3)).toBe(1)
    expect(indexVanScroll(RAD_RIJ_PX * 1.6, 3)).toBe(2)
    expect(indexVanScroll(RAD_RIJ_PX * 9, 3)).toBe(2)
    expect(indexVanScroll(-40, 3)).toBe(0)
    expect(indexVanScroll(40, 0)).toBe(0)
  })
})

describe('LabRad — rijen en punten', () => {
  it('toont elk onderwerp met zijn stoplichtpunt, en markeert het gekozen onderwerp', () => {
    render(<LabRad items={ITEMS} actief="uitgeven" onChange={vi.fn()} />)
    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(screen.getByTestId('lab-rad-uitgeven').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('lab-rad-verdienen').getAttribute('aria-selected')).toBe('false')
    expect(screen.getByTestId('lab-rad-verdienen-punt').getAttribute('data-zone')).toBe('rood')
    expect(screen.getByTestId('lab-rad-stop-punt').getAttribute('data-zone')).toBe('groen')
    expect(screen.getByRole('listbox').getAttribute('aria-activedescendant')).toBe('lab-rad-uitgeven')
  })

  it('een onderwerp zonder oordeel krijgt een neutraal punt, geen verzonnen kleur', () => {
    render(
      <LabRad items={[{ key: 'stop', label: 'Stopleeftijd', zone: null }]} actief="stop" onChange={vi.fn()} />,
    )
    expect(screen.getByTestId('lab-rad-stop-punt').getAttribute('data-zone')).toBe('onbekend')
  })

  it('heeft géén tik-op-een-rij: de eigenaar koos voor vegen', () => {
    const onChange = vi.fn()
    render(<LabRad items={ITEMS} actief="verdienen" onChange={onChange} />)
    fireEvent.click(screen.getByTestId('lab-rad-stop'))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('LabRad — vegen en toetsenbord', () => {
  it('landt na het scrollen op de rij in het midden', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(<LabRad items={ITEMS} actief="verdienen" onChange={onChange} />)
    const rad = screen.getByRole('listbox')
    rad.scrollTop = RAD_RIJ_PX * 2
    fireEvent.scroll(rad)
    expect(onChange).not.toHaveBeenCalled() // pas na de rust, niet op elke scroll-tick
    vi.advanceTimersByTime(120)
    expect(onChange).toHaveBeenCalledWith('stop')
  })

  it('meldt niets wanneer de veeg terugkomt op het al gekozen onderwerp', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(<LabRad items={ITEMS} actief="uitgeven" onChange={onChange} />)
    const rad = screen.getByRole('listbox')
    rad.scrollTop = RAD_RIJ_PX
    fireEvent.scroll(rad)
    vi.advanceTimersByTime(120)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('pijl omlaag/omhoog kiest de buur en klemt aan de uiteinden', () => {
    const onChange = vi.fn()
    const { rerender } = render(<LabRad items={ITEMS} actief="verdienen" onChange={onChange} />)
    const rad = screen.getByRole('listbox')
    fireEvent.keyDown(rad, { key: 'ArrowUp' })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.keyDown(rad, { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith('uitgeven')
    rerender(<LabRad items={ITEMS} actief="stop" onChange={onChange} />)
    onChange.mockClear()
    fireEvent.keyDown(rad, { key: 'ArrowDown' })
    expect(onChange).not.toHaveBeenCalled()
  })
})
