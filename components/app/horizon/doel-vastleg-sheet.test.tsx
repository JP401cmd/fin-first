import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import {
  DoelVastlegSheet,
  buildLiveStand,
  buildScenarioPersistPayload,
  type DoelParameterPreview,
} from './doel-vastleg-sheet'
import { buildSliderEvent } from '@/lib/scenario-events'
import { isDoelConceptGewijzigd, type ToekomstScenarioDoel } from '@/lib/horizon/toekomst-scenario'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'

/**
 * Unit-tests voor de doel-vastleg-laag (ronde 4 stap 5):
 *   A. buildLiveStand — één stand-vorm met de persist-inclusieregels.
 *   B. buildScenarioPersistPayload — het doel-blok gaat in ELKE PUT mee (VERPLICHT).
 *   C. conceptGewijzigd-flow — sliderbeweging → gewijzigd; herstel → weer gelijk.
 *   D. DoelVastlegSheet — rendert alleen afwijkende parameters + checkbox-/submit-gedrag.
 */

const BASELINE: WhatIfOverrides = {
  monthlyIncome: 3000,
  workDaysPerWeek: 5,
  savingsRate: 20,
  expectedReturn: 6,
  extraContribution: 0,
}

// Eén income-slider-event: bestaat nog op event-niveau (de sliderknop leeft voort, Task 2),
// maar telt sinds 15 sep 2026 niet meer mee in de doel-laag (buildLiveStand/
// isDoelConceptGewijzigd, spec lab-haalbaarheid §2) — gebruikt hieronder om dat te bewijzen.
const incomeEvent = buildSliderEvent('income', 4000, BASELINE, 40)!
// Eén savings-slider-event dat wél afwijkt van de baseline (20% → 30%) — de vervanger voor
// de income-events in de "iets is gewijzigd"-demonstraties hieronder.
const savingsEvent = buildSliderEvent('savings', 30, BASELINE, 40)!

describe('buildLiveStand (persist-inclusieregels)', () => {
  it('zonder baseline: geen slider-velden, wél stopAge', () => {
    const stand = buildLiveStand({
      baseline: null,
      sliderEvents: [],
      returnDeltas: {},
      stopAge: null,
      uitgaveNaPensioen: null,
      nalatenschap: null,
    })
    expect(stand.sliders).toBeUndefined()
    expect(stand.stopAge).toBeNull()
    expect(stand.uitgaveNaPensioen).toBeUndefined()
    expect(stand.nalatenschap).toBeUndefined()
  })

  it('income-slider-afwijking landt niet meer in de stand (knop vervallen, spec §2)', () => {
    const stand = buildLiveStand({
      baseline: BASELINE,
      sliderEvents: [incomeEvent],
      returnDeltas: {},
      stopAge: null,
      uitgaveNaPensioen: null,
      nalatenschap: null,
    })
    expect(stand.sliders).toBeUndefined()
  })

  it('savings-slider-afwijking landt wél in stand.sliders.savings', () => {
    const stand = buildLiveStand({
      baseline: BASELINE,
      sliderEvents: [savingsEvent],
      returnDeltas: {},
      stopAge: null,
      uitgaveNaPensioen: null,
      nalatenschap: null,
    })
    expect(stand.sliders?.savings).toBe(30)
  })

  it('rendement-delta landt in stand.returnDeltaByCategorie', () => {
    const stand = buildLiveStand({
      baseline: BASELINE,
      sliderEvents: [],
      returnDeltas: { Beleggingen: 0.02 },
      stopAge: null,
      uitgaveNaPensioen: null,
      nalatenschap: null,
    })
    expect(stand.returnDeltaByCategorie).toEqual({ Beleggingen: 0.02 })
  })

  // ADR 0170 — de twee profielparameter-knoppen. `null` = "wat het plan rekent", en dat moet
  // als AFWEZIG veld landen: anders leest een stand met `uitgaveNaPensioen: null` straks als een
  // bewuste keuze en meldt de opslaan-balk eeuwig "gewijzigd".
  it('uitgave na pensioen en nalatenschap landen alleen wanneer ze gezet zijn', () => {
    const basis = buildLiveStand({
      baseline: BASELINE,
      sliderEvents: [],
      returnDeltas: {},
      stopAge: 58,
      uitgaveNaPensioen: null,
      nalatenschap: null,
    })
    expect('uitgaveNaPensioen' in basis).toBe(false)
    expect('nalatenschap' in basis).toBe(false)
    expect(basis.stopAge).toBe(58)

    const gezet = buildLiveStand({
      baseline: BASELINE,
      sliderEvents: [],
      returnDeltas: {},
      stopAge: 58,
      uitgaveNaPensioen: 31_200,
      nalatenschap: 75_000,
    })
    expect(gezet.uitgaveNaPensioen).toBe(31_200)
    expect(gezet.nalatenschap).toBe(75_000)
    // … en die twee velden maken het concept gewijzigd t.o.v. de basis-stand.
    expect(isDoelConceptGewijzigd(gezet, basis)).toBe(true)
  })
})

describe('buildScenarioPersistPayload (doel in ELKE PUT — VERPLICHT)', () => {
  const doel: ToekomstScenarioDoel = {
    gezetOp: '2026-07-11T10:00:00.000Z',
    parameters: { spaarquote: true },
    // Legacy-vastgelegde stand met sliders.income: de parser leest dat veld tolerant
    // (spec §2), en het doel-blok mag zo'n oude stand gewoon dragen.
    stand: { stopAge: null, sliders: { income: 4000 } },
  }

  it('na een sliderbeweging bevat de payload het doel-blok én de gewijzigde slider', () => {
    // De live-stand ná de sliderbeweging.
    const stand = buildLiveStand({
      baseline: BASELINE,
      sliderEvents: [savingsEvent],
      returnDeltas: {},
      stopAge: null,
      uitgaveNaPensioen: null,
      nalatenschap: null,
    })
    const payload = buildScenarioPersistPayload({ stand, showScenarioLine: true, doel })
    expect(payload.v).toBe(2)
    expect(payload.sliders?.savings).toBe(30)
    expect(payload.doel).toEqual(doel) // ← het doel overleeft de sliderbeweging

    // De twee profielparameter-knoppen reizen mee wanneer ze gezet zijn, en blijven weg
    // wanneer ze op de plan-waarde staan (zie buildLiveStand).
    const metKnoppen = buildScenarioPersistPayload({
      stand: { ...stand, uitgaveNaPensioen: 31_200, nalatenschap: 75_000 },
      showScenarioLine: true,
      doel,
    })
    expect(metKnoppen.uitgaveNaPensioen).toBe(31_200)
    expect(metKnoppen.nalatenschap).toBe(75_000)
    expect('uitgaveNaPensioen' in payload).toBe(false)
    expect('nalatenschap' in payload).toBe(false)
  })

  it('zonder doel géén doel-key in de payload', () => {
    const stand = buildLiveStand({
      baseline: BASELINE,
      sliderEvents: [],
      returnDeltas: {},
      stopAge: null,
      uitgaveNaPensioen: null,
      nalatenschap: null,
    })
    const payload = buildScenarioPersistPayload({ stand, showScenarioLine: true, doel: null })
    expect(payload.doel).toBeUndefined()
    expect('doel' in payload).toBe(false)
  })
})

describe('conceptGewijzigd-flow (buildLiveStand + isDoelConceptGewijzigd)', () => {
  it('sliderbeweging → gewijzigd; herstel naar doel-stand → weer gelijk', () => {
    // Vastgelegd doel = de basis-stand (geen afwijking).
    const doelStand = buildLiveStand({
      baseline: BASELINE,
      sliderEvents: [],
      returnDeltas: {},
      stopAge: null,
      uitgaveNaPensioen: null,
      nalatenschap: null,
    })
    // Live draait de savings-slider → concept wijkt af.
    const gedraaid = buildLiveStand({
      baseline: BASELINE,
      sliderEvents: [savingsEvent],
      returnDeltas: {},
      stopAge: null,
      uitgaveNaPensioen: null,
      nalatenschap: null,
    })
    expect(isDoelConceptGewijzigd(gedraaid, doelStand)).toBe(true)

    // Herstel: terug naar de doel-stand → geen afwijking meer.
    const hersteld = buildLiveStand({
      baseline: BASELINE,
      sliderEvents: [],
      returnDeltas: {},
      stopAge: null,
      uitgaveNaPensioen: null,
      nalatenschap: null,
    })
    expect(isDoelConceptGewijzigd(hersteld, doelStand)).toBe(false)
  })
})

describe('DoelVastlegSheet (rendert alleen afwijkende parameters)', () => {
  const previews: DoelParameterPreview[] = [
    { parameter: 'spaarquote', label: 'Spaarquote', waarde: '45%' },
    { parameter: 'fire', label: 'Vrijheidsleeftijd', waarde: 'Vrij op 58,5 jr · ≥ 2,0 jr marge' },
  ]

  it('toont enkel de meegegeven (afwijkende) parameters, geen rendement', () => {
    render(<DoelVastlegSheet open onClose={vi.fn()} previews={previews} onSubmit={vi.fn()} />)
    expect(screen.getByText('Spaarquote')).toBeInTheDocument()
    expect(screen.getByText('Vrijheidsleeftijd')).toBeInTheDocument()
    expect(screen.queryByText('Verwacht rendement')).not.toBeInTheDocument()
  })

  it('legt default alle vinkjes aan en geeft die terug bij submit', () => {
    const onSubmit = vi.fn()
    render(<DoelVastlegSheet open onClose={vi.fn()} previews={previews} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Leg vast als mijn doel' }))
    expect(onSubmit).toHaveBeenCalledWith({ spaarquote: true, fire: true })
  })

  it('uitgevinkte parameter valt weg uit de submit-set', () => {
    const onSubmit = vi.fn()
    render(<DoelVastlegSheet open onClose={vi.fn()} previews={previews} onSubmit={onSubmit} />)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0]) // spaarquote uit
    fireEvent.click(screen.getByRole('button', { name: 'Leg vast als mijn doel' }))
    expect(onSubmit).toHaveBeenCalledWith({ fire: true })
  })

  it('CTA is uitgeschakeld wanneer niets is aangevinkt', () => {
    render(<DoelVastlegSheet open onClose={vi.fn()} previews={previews} onSubmit={vi.fn()} />)
    for (const cb of screen.getAllByRole('checkbox')) fireEvent.click(cb)
    expect(screen.getByRole('button', { name: 'Leg vast als mijn doel' })).toBeDisabled()
  })

  it('bijwerken-modus toont de bijwerk-titel en -CTA', () => {
    render(<DoelVastlegSheet open onClose={vi.fn()} previews={previews} bijwerken onSubmit={vi.fn()} />)
    expect(screen.getByText('Werk je doel bij')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Doel bijwerken' })).toBeInTheDocument()
  })
})

/**
 * ADR 0129 F3b (bijlage "Doelen") — onder een VAST stopmoment schrijft het lab geen
 * fire_age-doel: de vrijheidsleeftijd-preview verdwijnt uit de lijst én uit de
 * submit-set, en de reden staat als notitie in de sheet.
 */
describe('DoelVastlegSheet — vast anker: geen fire_age-doel', () => {
  const previews: DoelParameterPreview[] = [
    { parameter: 'spaarquote', label: 'Spaarquote', waarde: '45%' },
    { parameter: 'fire', label: 'Vrijheidsleeftijd', waarde: 'Vrij op 58,5 jr · ≥ 2,0 jr marge' },
  ]
  const reden =
    'Je stopmoment ligt vast op 62, dus dit doel heeft geen uitkomst om naar te kijken. Wat telt, is of je plan tot je 90e reikt.'

  it('filtert de fire-preview weg en toont de notitie', () => {
    render(
      <DoelVastlegSheet open onClose={vi.fn()} previews={previews} onSubmit={vi.fn()} fireAgeNietVanToepassing={reden} />,
    )
    expect(screen.getByText('Spaarquote')).toBeInTheDocument()
    expect(screen.queryByText('Vrijheidsleeftijd')).not.toBeInTheDocument()
    expect(screen.getByTestId('doel-fire-age-nvt')).toHaveTextContent(reden)
  })

  it('fire komt ook niet in de submit-set terecht', () => {
    const onSubmit = vi.fn()
    render(
      <DoelVastlegSheet open onClose={vi.fn()} previews={previews} onSubmit={onSubmit} fireAgeNietVanToepassing={reden} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Leg vast als mijn doel' }))
    expect(onSubmit).toHaveBeenCalledWith({ spaarquote: true })
  })

  it('zonder de prop verandert er niets (solved)', () => {
    const onSubmit = vi.fn()
    render(<DoelVastlegSheet open onClose={vi.fn()} previews={previews} onSubmit={onSubmit} />)
    expect(screen.queryByTestId('doel-fire-age-nvt')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Leg vast als mijn doel' }))
    expect(onSubmit).toHaveBeenCalledWith({ spaarquote: true, fire: true })
  })
})

/**
 * ADR 0145 — de VASTE rij "Plan gedekt": het uitkomstdoel onder een vast stopmoment.
 * Geen (uitgeschakelde) checkbox, altijd in de submit-set, telt mee in het aantal.
 */
describe('DoelVastlegSheet — vaste rij (plan_coverage)', () => {
  const previews: DoelParameterPreview[] = [
    { parameter: 'spaarquote', label: 'Spaarquote', waarde: '45%' },
    { parameter: 'dekking', label: 'Plan gedekt', waarde: 'nu 78% → 92% · doel 100% tot je 90e', vast: true },
  ]
  const toelichting =
    'Je stopmoment ligt vast op 62. Het lab legt daarom geen vrijheidsleeftijd vast, maar of je plan tot je 90e reikt.'

  it('rendert de vaste rij zonder checkbox, met een schermlezertekst dat hij altijd meegaat', () => {
    render(
      <DoelVastlegSheet open onClose={vi.fn()} previews={previews} onSubmit={vi.fn()} fireAgeNietVanToepassing={toelichting} />,
    )
    const rij = screen.getByTestId('doel-preview-vast-dekking')
    expect(rij).toHaveTextContent('Plan gedekt')
    expect(rij).toHaveTextContent('altijd inbegrepen')
    expect(rij.querySelector('input')).toBeNull()
    // Alleen de gewone rij heeft een vinkje.
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    expect(screen.getByTestId('doel-fire-age-nvt')).toHaveTextContent(toelichting)
  })

  it('de vaste rij zit altijd in de submit-set, ook als de gewone rij uitgevinkt is', () => {
    const onSubmit = vi.fn()
    render(<DoelVastlegSheet open onClose={vi.fn()} previews={previews} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('checkbox'))
    const cta = screen.getByRole('button', { name: 'Leg vast als mijn doel' })
    // Telt mee: met alleen de vaste rij blijft vastleggen mogelijk en verschijnt de
    // "vink minstens één aan"-hint niet.
    expect(cta).not.toBeDisabled()
    expect(screen.queryByText(/Vink minstens één parameter aan/)).not.toBeInTheDocument()
    fireEvent.click(cta)
    expect(onSubmit).toHaveBeenCalledWith({ dekking: true })
  })

  it('met beide rijen gekozen gaan beide mee', () => {
    const onSubmit = vi.fn()
    render(<DoelVastlegSheet open onClose={vi.fn()} previews={previews} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Leg vast als mijn doel' }))
    expect(onSubmit).toHaveBeenCalledWith({ spaarquote: true, dekking: true })
  })
})
