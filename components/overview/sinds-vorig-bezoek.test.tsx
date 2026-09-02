/**
 * H11 — runtime-assertie op het GETOONDE getal.
 *
 * De regel onder de begroeting toont een berekend kerngetal (vrijheidsdagen).
 * Weergave-drift (verkeerd veld, verkeerde grondslag, per ongeluk maand/30 in
 * plaats van jaar/365) is onzichtbaar als je alleen toetst dát er een getal
 * staat. Deze test pint de gerenderde zin daarom tegen een onafhankelijk
 * uitgerekende waarde voor concrete euro's.
 *
 * GRONDSLAG SINDS ADR 0126 PR C: MARGINAAL — Δ netto vermogen ÷ het canonieke
 * dagtarief (`DashboardData.dailyExpenseRate`, 12-mnd rolling gezuiverde
 * consumptie). Tot PR C liep dit via `computeFreedomTotal`, de platte deling die
 * PR C heeft verwijderd; de assertie is herpind op de marginale grondslag én op
 * de kopij die die grondslag benoemt, zodat deze dagen nooit als de TOTALE
 * runway op de kop van dezelfde pagina gelezen worden.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SindsVorigBezoek } from './sinds-vorig-bezoek'
import { buildSindsVorigBezoek } from '@/lib/overview/sinds-vorig-bezoek'
import { dailyExpenseRate } from '@/lib/format'

const now = new Date('2026-08-24T09:00:00Z')

describe('SindsVorigBezoek — gerenderde waarde volgt de canonieke wisselkoers', () => {
  afterEach(cleanup)

  it('vertaalt een vermogensgroei naar dagen tegen het canonieke dagtarief', () => {
    // Canonieke conversie maanduitgaven → €/dag: jaaruitgaven/365, NIET maand/30
    // (dat 360-dagenjaar is precies de drift die lib/format.ts uitsluit).
    const dailyExpense = dailyExpenseRate(2_500)
    expect(dailyExpense).toBeCloseTo(82.19, 2)

    // €10.000 extra ÷ €82,19/dag ≈ 121,7 → 122 dagen.
    const verwacht = Math.round(10_000 / dailyExpense)
    expect(verwacht).toBe(122)

    const view = buildSindsVorigBezoek(
      { netWorth: 110_000 },
      { at: '2026-08-23T09:00:00.000Z', netWorth: 100_000 },
      dailyExpense,
      now,
    )
    render(<SindsVorigBezoek view={view} />)
    expect(
      screen.getByText(
        `Tegen je huidige uitgaven kwam er sinds gisteren ${verwacht} dagen vrijheid bij.`,
      ),
    ).toBeInTheDocument()
  })

  it('rendert niets wanneer er niets te melden valt', () => {
    const { container } = render(<SindsVorigBezoek view={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
