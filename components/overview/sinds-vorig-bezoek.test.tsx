/**
 * H11 — runtime-assertie op het GETOONDE getal.
 *
 * De regel onder de begroeting toont een berekend kerngetal (vrijheidsdagen).
 * Weergave-drift (verkeerd veld, verkeerde grondslag, per ongeluk maand/30 in
 * plaats van jaar/365) is onzichtbaar als je alleen toetst dát er een getal
 * staat. Deze test pint de gerenderde zin daarom tegen de canonieke
 * `computeFreedomTotal` — dezelfde motor die de briefing-hero en de kassabon
 * voeden — voor concrete euro's.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SindsVorigBezoek } from './sinds-vorig-bezoek'
import { buildSindsVorigBezoek } from '@/lib/overview/sinds-vorig-bezoek'
import { computeFreedomTotal } from '@/lib/briefing/overview-briefing'

const now = new Date('2026-08-24T09:00:00Z')

describe('SindsVorigBezoek — gerenderde waarde volgt de canonieke motor', () => {
  afterEach(cleanup)

  it('vertaalt een vermogensgroei naar exact de vrijheidsdagen uit computeFreedomTotal', () => {
    const monthlyExpenses = 2_500
    const gisteren = computeFreedomTotal(100_000, monthlyExpenses)
    const vandaag = computeFreedomTotal(110_000, monthlyExpenses)

    // Onafhankelijk uitgerekend op de canonieke dagbasis (jaaruitgaven/365):
    // €10.000 extra ÷ (2500×12/365) ≈ 121,7 → 122 dagen.
    const verwacht = Math.round(vandaag.totalFreedomDays - gisteren.totalFreedomDays)
    expect(verwacht).toBe(122)

    const view = buildSindsVorigBezoek(
      vandaag,
      { at: '2026-08-23T09:00:00.000Z', totalFreedomDays: gisteren.totalFreedomDays },
      now,
    )
    render(<SindsVorigBezoek view={view} />)
    expect(
      screen.getByText(`Sinds gisteren kwam er ${verwacht} dagen vrijheid bij.`),
    ).toBeInTheDocument()
  })

  it('rendert niets wanneer er niets te melden valt', () => {
    const { container } = render(<SindsVorigBezoek view={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
