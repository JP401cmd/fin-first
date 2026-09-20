import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LabSlider, labSegmenten } from './lab-slider'
import type { HefboomBereik, HefboomGrenzen } from '@/lib/horizon/lab-grenzen-types'

/**
 * LabSlider — de knop met de driekleurige schaal (ADR 0170). De grenzen komen berekend binnen
 * (`computeLabGrenzen`); deze test bewaakt dat het component ze correct naar posities en
 * woorden omzet, en dat het NIETS zelf verzint wanneer een grens ontbreekt.
 */

const BEREIK: HefboomBereik = { min: 0, max: 100, stap: 10 }

function renderKnop(over: Partial<React.ComponentProps<typeof LabSlider>> = {}) {
  const props: React.ComponentProps<typeof LabSlider> = {
    id: 'verdienen',
    label: 'Meer verdienen',
    value: 50,
    baseValue: 0,
    bereik: BEREIK,
    richting: 'stijgend',
    grenzen: { gedekt: 40, ruim: 70, heel: null },
    formatValue: (v) => `+€ ${v}`,
    formatGrens: (v) => `+€ ${v}`,
    onChange: vi.fn(),
    ...over,
  }
  return { ...render(<LabSlider {...props} />), props }
}

describe('labSegmenten — de drie breedtes op de as', () => {
  it('stijgend: rood tot gedekt, oranje tot ruim, groen daarna', () => {
    expect(labSegmenten({ gedekt: 40, ruim: 70, heel: null }, BEREIK, 'stijgend')).toEqual([
      { zone: 'rood', breedte: 40 },
      { zone: 'oranje', breedte: 30 },
      { zone: 'groen', breedte: 30 },
    ])
  })

  it('dalend spiegelt: groen links, rood rechts', () => {
    expect(labSegmenten({ gedekt: 60, ruim: 30, heel: null }, BEREIK, 'dalend')).toEqual([
      { zone: 'groen', breedte: 30 },
      { zone: 'oranje', breedte: 30 },
      { zone: 'rood', breedte: 40 },
    ])
  })

  it('zonder ruim-grens loopt oranje door tot het einde (geen groen verzinnen)', () => {
    expect(labSegmenten({ gedekt: 40, ruim: null, heel: null }, BEREIK, 'stijgend')).toEqual([
      { zone: 'rood', breedte: 40 },
      { zone: 'oranje', breedte: 60 },
      { zone: 'groen', breedte: 0 },
    ])
  })

  it('een grens buiten het bereik klemt (0 of 100) i.p.v. de as te vervormen', () => {
    expect(labSegmenten({ gedekt: 250, ruim: 300, heel: null }, BEREIK, 'stijgend')).toEqual([
      { zone: 'rood', breedte: 100 },
      { zone: 'oranje', breedte: 0 },
      { zone: 'groen', breedte: 0 },
    ])
  })

  it('`heel` zonder grens: één vlak in de bijbehorende kleur', () => {
    expect(labSegmenten({ gedekt: null, ruim: null, heel: 'gedekt' }, BEREIK, 'stijgend')).toEqual([
      { zone: 'groen', breedte: 100 },
    ])
    expect(labSegmenten({ gedekt: null, ruim: null, heel: 'ongedekt' }, BEREIK, 'stijgend')).toEqual([
      { zone: 'rood', breedte: 100 },
    ])
  })

  it('geen grenzen en geen `heel` → null (grijze as, geen kleur verzinnen)', () => {
    expect(labSegmenten(null, BEREIK, 'stijgend')).toBeNull()
    expect(labSegmenten({ gedekt: null, ruim: null, heel: null }, BEREIK, 'stijgend')).toBeNull()
  })
})

describe('LabSlider — weergave en toegankelijkheid', () => {
  it('rendert de drie segmenten en de waarde', () => {
    renderKnop()
    expect(screen.getByTestId('lab-knop-verdienen-segment-rood')).toBeTruthy()
    expect(screen.getByTestId('lab-knop-verdienen-segment-oranje')).toBeTruthy()
    expect(screen.getByTestId('lab-knop-verdienen-segment-groen')).toBeTruthy()
    expect(screen.getByText('+€ 50')).toBeTruthy()
  })

  it('de grensregel noemt beide grenzen wanneer ze binnen het bereik liggen', () => {
    renderKnop()
    expect(screen.getByTestId('lab-knop-verdienen-grens').textContent).toBe(
      'gedekt vanaf +€ 40 · ruim vanaf +€ 70',
    )
  })

  it('samenvallende grenzen geven één regel (eind-vorm zonder eindleeftijd om op te rekken)', () => {
    renderKnop({ grenzen: { gedekt: 40, ruim: 40, heel: null } })
    expect(screen.getByTestId('lab-knop-verdienen-grens').textContent).toBe('gedekt vanaf +€ 40')
  })

  it('het merkteken staat op de berekende gedekt-grens, niet op "nu"', () => {
    renderKnop({ grenzen: { gedekt: 40, ruim: 70, heel: null }, baseValue: 0 })
    const merk = screen.getByTestId('lab-knop-verdienen-grensmerk')
    // Bereik 0–100, grens op 40 ⇒ 40% van de as. Het "nu"-streepje staat op 0%.
    expect(merk.getAttribute('style')).toContain('left: 40%')
  })

  it('het merkteken beweegt mee wanneer een andere knop de grens verschuift', () => {
    const eerst = renderKnop({ grenzen: { gedekt: 40, ruim: 70, heel: null } })
    expect(screen.getByTestId('lab-knop-verdienen-grensmerk').getAttribute('style')).toContain('left: 40%')
    eerst.unmount()
    renderKnop({ grenzen: { gedekt: 25, ruim: 55, heel: null } })
    expect(screen.getByTestId('lab-knop-verdienen-grensmerk').getAttribute('style')).toContain('left: 25%')
  })

  it('geen merkteken wanneer de grens buiten het bereik van de knop ligt', () => {
    renderKnop({ grenzen: { gedekt: 250, ruim: 300, heel: null } })
    expect(screen.queryByTestId('lab-knop-verdienen-grensmerk')).toBeNull()
  })

  it('een grens buiten het bereik wordt niet genoemd — de reden staat er in plaats van', () => {
    renderKnop({ grenzen: { gedekt: 250, ruim: 300, heel: null } })
    expect(screen.getByTestId('lab-knop-verdienen-grens').textContent).toBe(
      'de grens ligt boven het bereik van deze knop',
    )
  })

  it('`heel: gedekt` zegt dat de hele knop gedekt is', () => {
    renderKnop({ grenzen: { gedekt: null, ruim: null, heel: 'gedekt' } })
    expect(screen.getByTestId('lab-knop-verdienen-grens').textContent).toBe('over het hele bereik gedekt')
  })

  it('zonder grenzen: geen segmenten en "grens nog niet bekend"', () => {
    renderKnop({ grenzen: null })
    expect(screen.queryByTestId('lab-knop-verdienen-segment-rood')).toBeNull()
    expect(screen.getByTestId('lab-knop-verdienen-grens').textContent).toBe('grens nog niet bekend')
  })

  it('aria-valuetext draagt de waarde én het zone-woord van die stand', () => {
    renderKnop({ value: 20 })
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('+€ 20, reikt niet')
    renderKnop({ value: 80 })
    expect(screen.getAllByRole('slider')[1].getAttribute('aria-valuetext')).toBe('+€ 80, ruim gedekt')
  })

  it('pending dempt de as en zet aria-busy — de vorige grenzen blijven staan', () => {
    renderKnop({ pending: true })
    expect(screen.getByTestId('lab-knop-verdienen-as').className).toContain('opacity-45')
    expect(screen.getByRole('slider').getAttribute('aria-busy')).toBe('true')
    // ... en de grenzen zijn nog steeds zichtbaar (geen layoutsprong).
    expect(screen.getByTestId('lab-knop-verdienen-grens').textContent).toContain('gedekt vanaf')
  })

  it('de delta-badge verschijnt alleen bij een afwijking, en alleen met een delta-formatter', () => {
    renderKnop({ formatDelta: (d) => `+€ ${d}` })
    expect(screen.getByTestId('lab-knop-verdienen-delta').textContent).toBe('+€ 50')
    // Geen formatter (zoals bij Meer verdienen / Minder uitgeven, waar de WAARDE al relatief
    // is aan "nu") ⇒ geen badge die hetzelfde getal herhaalt.
    renderKnop()
    expect(screen.queryAllByTestId('lab-knop-verdienen-delta')).toHaveLength(1)
    renderKnop({ value: 0, formatDelta: (d) => `+€ ${d}` })
    expect(screen.queryAllByTestId('lab-knop-verdienen-delta')).toHaveLength(1)
  })

  it('onChange krijgt een number, niet de event-string', () => {
    const { props } = renderKnop()
    fireEvent.change(screen.getByRole('slider'), { target: { value: '70' } })
    expect(props.onChange).toHaveBeenCalledWith(70)
  })

  it('het "nu"-label valt weg als de plan-waarde tegen een rand ligt', () => {
    renderKnop({ baseValue: 0 })
    expect(screen.queryByText('nu')).toBeNull()
    renderKnop({ baseValue: 50 })
    expect(screen.getByText('nu')).toBeTruthy()
  })
})
