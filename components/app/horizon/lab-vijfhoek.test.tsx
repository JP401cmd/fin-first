import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { LabVijfhoek, fractieOpSpaak, hoekVanIndex, SPAAK_R, type LabVijfhoekItem } from './lab-vijfhoek'
import { HEFBOOM_KEYS, HEFBOOM_RICHTING } from '@/lib/horizon/lab-grenzen-types'

/**
 * LabVijfhoek — de laptop-vorm van het doelscenario (ADR 0170 B12).
 *
 * Getoetst: de projectie op een spaak (de grove bediening rust erop), de vijf invoervelden die
 * de toegankelijkheid dragen, de twee figuren (plan + gedekt, waarvan de laatste breekt op een
 * spaak zonder merk) en de twee schrijfpaden — slepen aan een hoekpunt en het native range-pad.
 *
 * In jsdom heeft de SVG geen afmetingen; `getBoundingClientRect` wordt daarom gestubd op het
 * venster van de viewBox (-80 -20 520 400 → middelpunt op client (260, 200), schaal 1) — op de
 * viewBox zelf (360×360 op (0,0)), zodat schermcoördinaten 1-op-1 op de viewBox vallen. Het
 * middelpunt ligt dan op (180,180) en de eerste spaak staat recht omhoog.
 */

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

afterEach(() => cleanup())

const BEREIK = { min: 0, max: 100, stap: 1 }

type Overrides = Partial<Record<(typeof HEFBOOM_KEYS)[number], Partial<LabVijfhoekItem>>>

/** Vijf knoppen met een eigen spy per knop, zodat een test kan zien wélke spaak schreef. */
function maakItems(overrides: Overrides = {}) {
  const spies = HEFBOOM_KEYS.map(() => vi.fn<(v: number) => void>())
  const items: LabVijfhoekItem[] = HEFBOOM_KEYS.map((key, i) => ({
    key,
    label: key,
    value: 50,
    baseValue: 40,
    bereik: BEREIK,
    richting: HEFBOOM_RICHTING[key],
    grenzen: { gedekt: 60, ruim: 70, heel: null },
    formatValue: (v: number) => `${v} eenheden`,
    formatGrens: (v: number) => String(v),
    onChange: spies[i],
    ...(overrides[key] ?? {}),
  }))
  return { items, spies }
}

function zetFiguur(gemaakt = maakItems(), pending = false) {
  const ui = render(<LabVijfhoek items={gemaakt.items} pending={pending} />)
  const figuur = ui.getByTestId('lab-vijfhoek-figuur')
  figuur.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 520, height: 400, right: 520, bottom: 400, x: 0, y: 0 }) as DOMRect
  return { ...ui, ...gemaakt, figuur }
}

describe('fractieOpSpaak', () => {
  it('langs de spaak is de fractie de afstand gedeeld door de straal', () => {
    expect(fractieOpSpaak(0, SPAAK_R / 2, 90)).toBeCloseTo(0.5, 6)
    expect(fractieOpSpaak(0, SPAAK_R, 90)).toBeCloseTo(1, 6)
    // Tweede spaak van vijf: 18° boven de horizon, met de klok mee vanaf rechtop.
    const hoek = hoekVanIndex(1, 5)
    const a = (hoek * Math.PI) / 180
    expect(fractieOpSpaak(Math.cos(a) * SPAAK_R * 0.5, Math.sin(a) * SPAAK_R * 0.5, hoek)).toBeCloseTo(0.5, 6)
  })

  it('loodrecht op de spaak beweegt de stand niet', () => {
    // Je sleept langs een as, niet over het vlak: alleen de component lángs de spaak telt.
    // `toBeCloseTo`: de cosinus van 90° is in floating point 6e-17, niet 0 — dat is ruis onder
    // een pixel, geen beweging.
    expect(fractieOpSpaak(SPAAK_R, 0, 90)).toBeCloseTo(0, 12)
    expect(fractieOpSpaak(-SPAAK_R, 0, 90)).toBeCloseTo(0, 12)
  })

  it('klemt achter het middelpunt op 0 en voorbij de rand op 1', () => {
    expect(fractieOpSpaak(0, -SPAAK_R, 90)).toBe(0)
    expect(fractieOpSpaak(0, SPAAK_R * 3, 90)).toBe(1)
  })
})

describe('hoekVanIndex', () => {
  it('zet de eerste spaak rechtop en verdeelt de rest gelijk, met de klok mee', () => {
    expect(hoekVanIndex(0, 5)).toBe(90)
    expect(hoekVanIndex(1, 5)).toBe(18)
    // Vier items → vierhoek: de hoeken verdelen zich over het aantal, niet over vijf.
    expect(hoekVanIndex(1, 4)).toBe(0)
    expect(hoekVanIndex(2, 4)).toBe(-90)
  })
})

describe('LabVijfhoek — de legenda draagt de toegankelijkheid', () => {
  it('geeft elke knop één range-invoerveld met de eigen id, label en zone in het valuetext', () => {
    zetFiguur()
    const velden = screen.getAllByRole('slider')
    expect(velden).toHaveLength(HEFBOOM_KEYS.length)
    expect(velden.map((el) => el.id)).toEqual([...HEFBOOM_KEYS])
    const verdienen = screen.getByLabelText('verdienen')
    // Stand 50 met gedekt vanaf 60 op een stijgende knop = nog niet gedekt.
    expect(verdienen.getAttribute('aria-valuetext')).toBe('50 eenheden, reikt niet')
    expect(verdienen.getAttribute('aria-describedby')).toBe('verdienen-grens')
    expect(screen.getByTestId('lab-vijfhoek-verdienen-grens').textContent).toContain('gedekt vanaf 60')
    // De tekening zelf is puur beeld — de invoervelden zijn de enige ingang.
    expect(screen.getByTestId('lab-vijfhoek-figuur').getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByTestId('lab-vijfhoek-figuur').getAttribute('role')).toBeNull()
  })

  it('meldt een lopende herberekening op de invoervelden, maar laat ze bedienbaar', () => {
    zetFiguur(maakItems(), true)
    const verdienen = screen.getByLabelText('verdienen')
    expect(verdienen.getAttribute('aria-busy')).toBe('true')
    expect(verdienen).not.toBeDisabled()
    // Op een SVG is `className` een SVGAnimatedString; het attribuut is de leesbare vorm.
    expect(screen.getByTestId('lab-vijfhoek-figuur').getAttribute('class')).toContain('opacity-45')
  })

  it('schrijft via het native range-pad, zodat pijltoetsen werken', () => {
    const { spies } = zetFiguur()
    fireEvent.change(screen.getByLabelText('stop'), { target: { value: '51' } })
    expect(spies[4]).toHaveBeenCalledWith(51)
  })
})

describe('LabVijfhoek — de twee figuren', () => {
  it('de plan-vijfhoek heeft één punt per knop en geen vulling', () => {
    zetFiguur()
    const plan = screen.getByTestId('lab-vijfhoek-plan')
    expect(plan.getAttribute('points')?.trim().split(/\s+/)).toHaveLength(HEFBOOM_KEYS.length)
    // Geen gevuld vlak: het oppervlak van een radar hangt aan de as-volgorde, niet aan het plan.
    expect(plan.getAttribute('fill')).toBe('none')
  })

  it('de gedekt-figuur slaat een spaak zonder merk over in plaats van er een lijn naartoe te trekken', () => {
    zetFiguur()
    expect(screen.getAllByTestId('lab-vijfhoek-gedekt-segment')).toHaveLength(5)
    cleanup()
    // Grens buiten het bereik van deze knop → geen merk, dus de twee aangrenzende zijden vallen weg.
    zetFiguur(maakItems({ nalatenschap: { grenzen: { gedekt: 400, ruim: 400, heel: null } } }))
    expect(screen.queryByTestId('lab-vijfhoek-nalatenschap-grensmerk')).toBeNull()
    expect(screen.getAllByTestId('lab-vijfhoek-gedekt-segment')).toHaveLength(3)
  })

  it('kleurt elke spaak met de driekleurige schaal en zet het nu-streepje op de plan-stand', () => {
    zetFiguur()
    expect(screen.getByTestId('lab-vijfhoek-verdienen-segment-rood')).toBeTruthy()
    expect(screen.getByTestId('lab-vijfhoek-verdienen-segment-oranje')).toBeTruthy()
    expect(screen.getByTestId('lab-vijfhoek-verdienen-segment-groen')).toBeTruthy()
    expect(screen.getByTestId('lab-vijfhoek-verdienen-nu')).toBeTruthy()
  })
})

describe('LabVijfhoek — slepen aan een hoekpunt', () => {
  it('vastpakken verzet de stand niet, doorslepen wel — gesnapt en binnen het bereik', () => {
    const { spies } = zetFiguur()
    const greep = screen.getByTestId('lab-vijfhoek-verdienen-greep')
    // Het hoekpunt van de eerste (rechtopstaande) spaak bij stand 50: (180, 180 − 59).
    fireEvent.pointerDown(greep, { pointerId: 1, button: 0, clientX: 260, clientY: 200 - SPAAK_R / 2 })
    expect(spies[0], 'vastpakken is geen verzetten').not.toHaveBeenCalled()

    // Vinger naar driekwart van de spaak: 180 − 0,75 × 118.
    fireEvent.pointerMove(greep, { pointerId: 1, clientX: 260, clientY: 200 - SPAAK_R * 0.75 })
    expect(spies[0]).toHaveBeenCalledWith(75)

    // Voorbij de buitenrand klemt hij op het maximum, niet erbuiten.
    fireEvent.pointerMove(greep, { pointerId: 1, clientX: 260, clientY: -200 })
    expect(spies[0]).toHaveBeenLastCalledWith(100)
    for (const [waarde] of spies[0].mock.calls) {
      expect(waarde).toBeGreaterThanOrEqual(BEREIK.min)
      expect(waarde).toBeLessThanOrEqual(BEREIK.max)
      expect(Number.isInteger(waarde)).toBe(true)
    }
  })

  it('sleept alleen de spaak die je vastpakte, en stopt bij loslaten', () => {
    const { spies } = zetFiguur()
    const greep = screen.getByTestId('lab-vijfhoek-verdienen-greep')
    fireEvent.pointerDown(greep, { pointerId: 1, button: 0, clientX: 260, clientY: 200 - SPAAK_R / 2 })
    fireEvent.pointerMove(greep, { pointerId: 1, clientX: 260, clientY: 200 - SPAAK_R * 0.75 })
    expect(spies[1], 'de buurspaken horen niet mee te bewegen').not.toHaveBeenCalled()

    fireEvent.pointerUp(greep, { pointerId: 1 })
    spies[0].mockClear()
    fireEvent.pointerMove(greep, { pointerId: 1, clientX: 260, clientY: 120 })
    expect(spies[0]).not.toHaveBeenCalled()
  })

  it('een rechtsklik sleept niet', () => {
    const { spies } = zetFiguur()
    const greep = screen.getByTestId('lab-vijfhoek-verdienen-greep')
    fireEvent.pointerDown(greep, { pointerId: 1, button: 2, clientX: 260, clientY: 200 - SPAAK_R / 2 })
    fireEvent.pointerMove(greep, { pointerId: 1, clientX: 260, clientY: 120 })
    expect(spies[0]).not.toHaveBeenCalled()
  })
})
