import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LabHarp, HARP_STROOK_PX, planPunten, gedektStukken, type LabHarpItem } from './lab-harp'

/**
 * LabHarp (ADR 0170 B12): vijf stroken, en dwars erdoorheen de plan-lijn (door de duimen) en
 * de gedekt-lijn (door de merken). De figuur is precies die twee reeksen punten; dat is wat
 * hier wordt vastgepind — plus dat de gedekt-lijn breekt waar een grens buiten bereik ligt.
 */

function item(over: Partial<LabHarpItem> & { key: LabHarpItem['key'] }): LabHarpItem {
  return {
    label: over.key,
    value: 50,
    baseValue: 0,
    bereik: { min: 0, max: 100, stap: 10 },
    richting: 'stijgend',
    grenzen: { gedekt: 40, ruim: 70, heel: null },
    formatValue: (v) => `${v}`,
    formatGrens: (v) => `${v}`,
    onChange: vi.fn(),
    ...over,
  }
}

const ITEMS: LabHarpItem[] = [
  item({ key: 'verdienen', label: 'Meer verdienen', value: 20 }),
  item({ key: 'uitgeven', label: 'Minder uitgeven', value: 60 }),
  item({ key: 'stop', label: 'Stopleeftijd', value: 90, grenzen: { gedekt: 250, ruim: 300, heel: null } }),
  item({ key: 'nalatenschap', label: 'Nalatenschap', value: 40, detail: '≈ € 3.500/mnd' }),
]

describe('planPunten / gedektStukken — de figuur', () => {
  it('de plan-lijn heeft één punt per strook, op het midden van die strook', () => {
    expect(planPunten(ITEMS)).toEqual([
      { x: 20, y: HARP_STROOK_PX * 0.5 },
      { x: 60, y: HARP_STROOK_PX * 1.5 },
      { x: 90, y: HARP_STROOK_PX * 2.5 },
      { x: 40, y: HARP_STROOK_PX * 3.5 },
    ])
  })

  it('de gedekt-lijn breekt waar een grens buiten bereik ligt', () => {
    // Strook 3 (stop) heeft gedekt=250 buiten 0–100: het stuk stopt bij strook 2, en strook 4
    // staat alleen (één punt = geen lijn).
    expect(gedektStukken(ITEMS)).toEqual([
      [
        { x: 40, y: HARP_STROOK_PX * 0.5 },
        { x: 40, y: HARP_STROOK_PX * 1.5 },
      ],
    ])
  })

  it('zonder enige grens: geen gedekt-lijn, wél een plan-lijn', () => {
    const zonder = ITEMS.map((it) => ({ ...it, grenzen: null }))
    expect(gedektStukken(zonder)).toEqual([])
    expect(planPunten(zonder)).toHaveLength(4)
  })
})

describe('LabHarp — stroken en lijnen', () => {
  it('rendert per strook een echte range-input met naam, waarde en zone', () => {
    render(<LabHarp items={ITEMS} />)
    const sliders = screen.getAllByRole('slider')
    expect(sliders.map((s) => s.id)).toEqual(['verdienen', 'uitgeven', 'stop', 'nalatenschap'])
    expect(sliders[0].getAttribute('aria-label')).toBe('Meer verdienen')
    expect(sliders[0].getAttribute('aria-valuetext')).toBe('20, reikt niet')
    expect(sliders[1].getAttribute('aria-valuetext')).toBe('60, gedekt · krappe marge')
  })

  it('tekent de plan-lijn door alle stroken en de gedekt-lijn alleen waar een merk staat', () => {
    render(<LabHarp items={ITEMS} />)
    expect(screen.getByTestId('lab-harp-plan').getAttribute('points')).toBe('20,22 60,66 90,110 40,154')
    const gedekt = screen.getAllByTestId('lab-harp-gedekt')
    expect(gedekt).toHaveLength(1)
    expect(gedekt[0].getAttribute('points')).toBe('40,22 40,66')
    expect(screen.queryByTestId('lab-knop-stop-grensmerk')).toBeNull()
    expect(screen.getByTestId('lab-knop-verdienen-grensmerk')).toBeTruthy()
  })

  it('de lijnen-laag vangt geen aanrakingen: de inputs blijven de bediening', () => {
    render(<LabHarp items={ITEMS} />)
    expect(screen.getByTestId('lab-harp-lijnen').getAttribute('class')).toContain('pointer-events-none')
  })

  it('de regel onder de figuur volgt de laatst aangeraakte strook, met detail', () => {
    render(<LabHarp items={ITEMS} />)
    expect(screen.getByTestId('lab-harp-regel').textContent).toContain('Meer verdienen')
    fireEvent.focus(screen.getByRole('slider', { name: 'Nalatenschap' }))
    const regel = screen.getByTestId('lab-harp-regel').textContent ?? ''
    expect(regel).toContain('Nalatenschap')
    expect(regel).toContain('gedekt vanaf 40')
    expect(regel).toContain('≈ € 3.500/mnd')
  })

  it('schuiven roept onChange van díe strook aan', () => {
    render(<LabHarp items={ITEMS} />)
    fireEvent.change(screen.getByRole('slider', { name: 'Minder uitgeven' }), { target: { value: '80' } })
    expect(ITEMS[1].onChange).toHaveBeenCalledWith(80)
    expect(ITEMS[0].onChange).not.toHaveBeenCalled()
  })

  it('pending dempt de figuur en zet aria-busy, de standen blijven staan', () => {
    render(<LabHarp items={ITEMS} pending />)
    expect(screen.getByTestId('lab-harp-lijnen').getAttribute('class')).toContain('opacity-45')
    expect(screen.getAllByRole('slider')[0].getAttribute('aria-busy')).toBe('true')
    expect(screen.getByTestId('lab-harp-plan')).toBeTruthy()
  })
})
