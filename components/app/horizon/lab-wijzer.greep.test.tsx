/**
 * De greep van de Lab-meter — vastpakken, slepen, loslaten.
 *
 * Twee review-bevindingen op ADR 0170 (20 sep 2026), hier vastgelegd als gedrag:
 *
 *  1. VASTPAKKEN VERZETTE DE STAND. `onPointerDown` riep meteen `volgVinger` aan, dus de
 *     stand sprong naar de hoek onder de vinger. De greep is 44 px (a11y-norm) en de boog op
 *     een telefoon ~200 px lang, dus je pakt 'm routineus een tiende van het bereik naast het
 *     hart — en verzette daarmee een getal dat je alleen maar wilde vastpakken.
 *  2. DE SLEEP KON BLIJVEN HANGEN. Zonder `onLostPointerCapture` bleef `sleept` waar als de
 *     browser de capture introk, en een rechtsklik startte een sleep (geen `button`-toets).
 *
 * De meter heeft in jsdom geen afmetingen; `getBoundingClientRect` wordt daarom gestubd op de
 * viewBox zelf (200×128 op (0,0)), zodat schermcoördinaten 1-op-1 op de viewBox vallen. Het
 * middelpunt van de boog ligt dan op (100, 104) en de greep bij stand 50/100 op (100, 24).
 */

import { describe, expect, it, vi, beforeAll } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { LabWijzer } from './lab-wijzer'

beforeAll(() => {
  // jsdom kent geen pointer capture; de component roept 'm optioneel aan.
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

const BEREIK = { min: 0, max: 100, stap: 1 }
/** Middelpunt van de boog in schermcoördinaten, met de stub hieronder. */
const MIDDEN = { x: 100, y: 104 }
/** De greep bij stand 50: recht boven het middelpunt, op straal 80. */
const GREEP_HART = { x: 100, y: 24 }

function zetMeter(onChange = vi.fn(), value = 50) {
  const ui = render(
    <LabWijzer
      id="stop"
      label="Stoppen met werken"
      value={value}
      baseValue={value}
      bereik={BEREIK}
      richting="stijgend"
      grenzen={{ gedekt: 60, ruim: 70, heel: null }}
      formatValue={(v) => String(v)}
      formatGrens={(v) => String(v)}
      onChange={onChange}
    />,
  )
  const meter = ui.getByTestId('lab-knop-stop-meter')
  meter.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 128, right: 200, bottom: 128, x: 0, y: 0 }) as DOMRect
  return { ...ui, onChange, greep: ui.getByTestId('lab-knop-stop-greep') }
}

describe('LabWijzer — vastpakken verzet de stand niet', () => {
  it('Given de greep staat op 50, When je hem 10 px naast het hart vastpakt, Then blijft de stand 50', () => {
    const { greep, onChange } = zetMeter()
    // 10 px naar rechts van het hart is nog ruim binnen de 44 px-greep, maar ~4 punten
    // verderop de boog: precies de sprong die de bevinding beschrijft.
    fireEvent.pointerDown(greep, { pointerId: 1, button: 0, clientX: 110, clientY: 24 })
    expect(onChange, 'vastpakken is geen verzetten — de eerste aanraking mag niets wijzigen').not.toHaveBeenCalled()
  })

  it('Given je pakte hem naast het hart vast, When je de vinger verplaatst, Then beweegt de stand mee vanaf waar hij stond', () => {
    const { greep, onChange } = zetMeter()
    fireEvent.pointerDown(greep, { pointerId: 1, button: 0, clientX: 110, clientY: 24 })
    // Vinger 10 px terug naar links: de stand zakt evenveel als de vinger reisde, niet naar
    // de absolute hoek onder de vinger (dat zou 50 blijven en dus niets doen).
    fireEvent.pointerMove(greep, { pointerId: 1, clientX: MIDDEN.x, clientY: 24 })
    expect(onChange).toHaveBeenCalledWith(46)
  })

  it('Given je pakte hem naast het hart vast, When je doorsleept tot het uiteinde, Then is het maximum bereikbaar', () => {
    const { greep, onChange } = zetMeter()
    fireEvent.pointerDown(greep, { pointerId: 1, button: 0, clientX: 110, clientY: 24 })
    fireEvent.pointerMove(greep, { pointerId: 1, clientX: 190, clientY: MIDDEN.y })
    // Een VASTE pak-offset zou hier op 96 blijven steken: de vinger klemt bij fractie 1 en de
    // stand loopt er de offset achteraan. Daarom schaalt de afbeelding per helft.
    expect(onChange, 'het laatste stukje bereik mag niet onbereikbaar worden door waar je pakte').toHaveBeenCalledWith(100)
  })
})

describe('LabWijzer — de sleep eindigt ook als de browser hem afbreekt', () => {
  it('Given een rechtsklik op de greep, When je de muis beweegt, Then sleept er niets', () => {
    const { greep, onChange } = zetMeter()
    fireEvent.pointerDown(greep, { pointerId: 1, button: 2, clientX: GREEP_HART.x, clientY: GREEP_HART.y })
    fireEvent.pointerMove(greep, { pointerId: 1, clientX: 60, clientY: 60 })
    expect(onChange, 'alleen de primaire knop sleept — rechts/midden hoort het contextmenu toe').not.toHaveBeenCalled()
  })

  it('Given de browser trekt de pointer-capture in, When de vinger daarna beweegt, Then volgt de stand niet meer', () => {
    const { greep, onChange } = zetMeter()
    fireEvent.pointerDown(greep, { pointerId: 1, button: 0, clientX: GREEP_HART.x, clientY: GREEP_HART.y })
    fireEvent.lostPointerCapture(greep, { pointerId: 1, bubbles: true })
    fireEvent.pointerMove(greep, { pointerId: 1, clientX: 60, clientY: 60 })
    expect(onChange, 'zonder onLostPointerCapture bleef de sleep hangen en volgde de stand elke muisbeweging').not.toHaveBeenCalled()
  })

  it('Given je liet los, When de vinger daarna over de greep beweegt, Then volgt de stand niet meer', () => {
    const { greep, onChange } = zetMeter()
    fireEvent.pointerDown(greep, { pointerId: 1, button: 0, clientX: GREEP_HART.x, clientY: GREEP_HART.y })
    fireEvent.pointerUp(greep, { pointerId: 1 })
    fireEvent.pointerMove(greep, { pointerId: 1, clientX: 60, clientY: 60 })
    expect(onChange).not.toHaveBeenCalled()
  })
})
