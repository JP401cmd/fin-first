import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { computeSliderUiRange, WhatIfSliders, type WhatIfOverrides } from './whatif-sliders'
import { formatCurrency } from '@/lib/format'

/**
 * Unit-tests voor `computeSliderUiRange` — het ZICHTBARE (UI-)bereik per slidertype
 * (±20% rond de basisstand; rendement apart). Puur; de validatie-clamps (`SLIDER_RANGES`)
 * blijven ongewijzigd — dit helpertje raakt ze niet. Dekt de per-type-afronding/clamps,
 * de degenerate-vangnetten en het verbreed-tot-opgeslagen-waarde-gedrag.
 */
describe('computeSliderUiRange — maandinkomen', () => {
  it('±20% afgerond op €100 (basis €7.600 → [6000, 9200])', () => {
    expect(computeSliderUiRange('income', 7600, 7600)).toEqual({ min: 6000, max: 9200 })
  })

  it('afronding min omlaag / max omhoog (basis €3.050 → [2400, 3700])', () => {
    expect(computeSliderUiRange('income', 3050, 3050)).toEqual({ min: 2400, max: 3700 })
  })

  it('basis 0 ⇒ vangnet [0, 1000]', () => {
    expect(computeSliderUiRange('income', 0, 0)).toEqual({ min: 0, max: 1000 })
  })

  it('verbreedt tot een opgeslagen waarde boven de max', () => {
    expect(computeSliderUiRange('income', 7600, 12000)).toEqual({ min: 6000, max: 12000 })
  })

  it('verbreedt tot een opgeslagen waarde onder de min', () => {
    expect(computeSliderUiRange('income', 7600, 4000)).toEqual({ min: 4000, max: 9200 })
  })
})

describe('computeSliderUiRange — werkdagen (geclampt 1–5)', () => {
  it('basis 5 ⇒ [4, 5]', () => {
    expect(computeSliderUiRange('workdays', 5, 5)).toEqual({ min: 4, max: 5 })
  })
  it('basis 3 ⇒ [2, 4]', () => {
    expect(computeSliderUiRange('workdays', 3, 3)).toEqual({ min: 2, max: 4 })
  })
  it('basis 1 ⇒ [1, 2] (floor(0,8) clamp op 1)', () => {
    expect(computeSliderUiRange('workdays', 1, 1)).toEqual({ min: 1, max: 2 })
  })
})

describe('computeSliderUiRange — spaarquote (procentpunten, geclampt 0–80)', () => {
  it('basis 50% ⇒ [40, 60]', () => {
    expect(computeSliderUiRange('savings', 50, 50)).toEqual({ min: 40, max: 60 })
  })
  it('basis < 10 degenereert niet ⇒ [0, max(10, round(base×1,2))]', () => {
    expect(computeSliderUiRange('savings', 5, 5)).toEqual({ min: 0, max: 10 })
    expect(computeSliderUiRange('savings', 0, 0)).toEqual({ min: 0, max: 10 })
  })
  it('clampt de max op 80 (basis 80 ⇒ [64, 80])', () => {
    expect(computeSliderUiRange('savings', 80, 80)).toEqual({ min: 64, max: 80 })
  })
  it('verbreedt tot een opgeslagen waarde buiten de band', () => {
    expect(computeSliderUiRange('savings', 50, 75)).toEqual({ min: 40, max: 75 })
    expect(computeSliderUiRange('savings', 50, 30)).toEqual({ min: 30, max: 60 })
  })
})

describe('computeSliderUiRange — extra inleg (20% van het basis-maandinkomen)', () => {
  it('inkomen €7.600 ⇒ [0, 1500] (20% op €50)', () => {
    expect(computeSliderUiRange('extra_inleg', 7600, 0)).toEqual({ min: 0, max: 1500 })
  })
  it('geen inkomen ⇒ vangnet [0, 500]', () => {
    expect(computeSliderUiRange('extra_inleg', 0, 0)).toEqual({ min: 0, max: 500 })
  })
  it('verbreedt tot een opgeslagen waarde boven de max', () => {
    expect(computeSliderUiRange('extra_inleg', 7600, 2000)).toEqual({ min: 0, max: 2000 })
  })
})

/**
 * D-01 (a11y) — elke range-input in een SliderRow moet een toegankelijke naam
 * (aria-label = parameter-label) én een aria-valuetext (geformatteerde waarde)
 * hebben, zodat een screenreader zowel de parameter als de leesbare waarde
 * benoemt i.p.v. de kale numerieke value. Vergelijk whatif-market-assumptions.tsx
 * dat dit al doet op de master-slider.
 */
describe('WhatIfSliders — a11y: slider heeft naam + valuetext', () => {
  const baseline: WhatIfOverrides = {
    monthlyIncome: 3000,
    workDaysPerWeek: 5,
    savingsRate: 20,
    expectedReturn: 6,
    extraContribution: 0,
  }

  function renderSliders() {
    render(
      <WhatIfSliders
        baseline={baseline}
        events={[]}
        setEvents={() => {}}
        currentAge={40}
      />,
    )
  }

  it('benoemt elke parameter-slider bij naam (getByRole slider + name)', () => {
    renderSliders()
    expect(screen.getByRole('slider', { name: 'Maandinkomen' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Werkdagen per week' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Spaarquote' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Extra inleg' })).toBeInTheDocument()
  })

  it('zet aria-valuetext op de geformatteerde waarde per slider', () => {
    renderSliders()
    expect(screen.getByRole('slider', { name: 'Maandinkomen' })).toHaveAttribute(
      'aria-valuetext',
      formatCurrency(3000),
    )
    expect(screen.getByRole('slider', { name: 'Werkdagen per week' })).toHaveAttribute(
      'aria-valuetext',
      '5 dagen',
    )
    expect(screen.getByRole('slider', { name: 'Spaarquote' })).toHaveAttribute(
      'aria-valuetext',
      '20%',
    )
    expect(screen.getByRole('slider', { name: 'Extra inleg' })).toHaveAttribute(
      'aria-valuetext',
      formatCurrency(0),
    )
  })
})
