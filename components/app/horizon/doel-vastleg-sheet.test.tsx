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
import type { WhatIfOverrides } from '@/components/app/horizon/whatif-sliders'

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

// Eén income-slider-event dat afwijkt van de baseline (3000 → 4000).
const incomeEvent = buildSliderEvent('income', 4000, BASELINE, 40)!

describe('buildLiveStand (persist-inclusieregels)', () => {
  it('zonder baseline: geen slider-velden, wél stopAge/stopKoppel', () => {
    const stand = buildLiveStand({
      baseline: null,
      sliderEvents: [],
      returnDeltas: {},
      stopAge: null,
      stopKoppel: false,
      lockedMarge: null,
    })
    expect(stand.sliders).toBeUndefined()
    expect(stand.stopAge).toBeNull()
    expect(stand.stopKoppel).toBe(false)
  })

  it('income-slider-afwijking landt in stand.sliders.income', () => {
    const stand = buildLiveStand({
      baseline: BASELINE,
      sliderEvents: [incomeEvent],
      returnDeltas: {},
      stopAge: null,
      stopKoppel: false,
      lockedMarge: null,
    })
    expect(stand.sliders?.income).toBe(4000)
  })

  it('rendement-delta landt in stand.returnDeltaByCategorie', () => {
    const stand = buildLiveStand({
      baseline: BASELINE,
      sliderEvents: [],
      returnDeltas: { Beleggingen: 0.02 },
      stopAge: null,
      stopKoppel: false,
      lockedMarge: null,
    })
    expect(stand.returnDeltaByCategorie).toEqual({ Beleggingen: 0.02 })
  })

  it('koppel + vastgehouden marge landt in stand.stopMarge', () => {
    const stand = buildLiveStand({
      baseline: BASELINE,
      sliderEvents: [],
      returnDeltas: {},
      stopAge: 58,
      stopKoppel: true,
      lockedMarge: 2.5,
    })
    expect(stand.stopMarge).toBe(2.5)
    expect(stand.stopAge).toBe(58)
  })
})

describe('buildScenarioPersistPayload (doel in ELKE PUT — VERPLICHT)', () => {
  const doel: ToekomstScenarioDoel = {
    gezetOp: '2026-07-11T10:00:00.000Z',
    parameters: { salaris: true },
    stand: { stopAge: null, stopKoppel: false, sliders: { income: 4000 } },
  }

  it('na een sliderbeweging bevat de payload het doel-blok én de gewijzigde slider', () => {
    // De live-stand ná de sliderbeweging.
    const stand = buildLiveStand({
      baseline: BASELINE,
      sliderEvents: [incomeEvent],
      returnDeltas: {},
      stopAge: null,
      stopKoppel: false,
      lockedMarge: null,
    })
    const payload = buildScenarioPersistPayload({ stand, showScenarioLine: true, doel })
    expect(payload.v).toBe(2)
    expect(payload.sliders?.income).toBe(4000)
    expect(payload.doel).toEqual(doel) // ← het doel overleeft de sliderbeweging
  })

  it('zonder doel géén doel-key in de payload', () => {
    const stand = buildLiveStand({
      baseline: BASELINE,
      sliderEvents: [],
      returnDeltas: {},
      stopAge: null,
      stopKoppel: false,
      lockedMarge: null,
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
      stopKoppel: false,
      lockedMarge: null,
    })
    // Live draait de income-slider → concept wijkt af.
    const gedraaid = buildLiveStand({
      baseline: BASELINE,
      sliderEvents: [incomeEvent],
      returnDeltas: {},
      stopAge: null,
      stopKoppel: false,
      lockedMarge: null,
    })
    expect(isDoelConceptGewijzigd(gedraaid, doelStand)).toBe(true)

    // Herstel: terug naar de doel-stand → geen afwijking meer.
    const hersteld = buildLiveStand({
      baseline: BASELINE,
      sliderEvents: [],
      returnDeltas: {},
      stopAge: null,
      stopKoppel: false,
      lockedMarge: null,
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
