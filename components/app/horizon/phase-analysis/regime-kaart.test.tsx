/**
 * Tests voor RegimeKaart + sumIncomeBySource — de "regime-drieluik"-inhoud
 * (ronde-3-mockup, element ⑧) in de drie fase-analyse-modals.
 *
 * Dekt:
 * - sumIncomeBySource: exacte splitsing (salaris apart), AOW-cap, pensioen-rest
 * - sumIncomeBySource: fallback op grossIncome-heuristiek zonder exact veld
 * - het kwaliteits-verschil exact vs. oude heuristiek (salaris lekt niet meer in)
 * - RegimeKaart-rendering: labels, waarden, relatieve balklengte, voetnoot, pill
 * - gerenderde jaarinkomen-waarden gepind tegen de split-uitvoer (geen drift)
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MaskedAmount } from '@/components/app/masked-amount'
import { RegimeKaart, sumIncomeBySource } from './regime-kaart'

// Minimale rij-vorm die sumIncomeBySource nodig heeft.
function row(
  grossIncome: number,
  bySource?: { salaris: number; gebeurtenisBaten: number },
) {
  return { grossIncome, grossIncomeBySource: bySource }
}

describe('sumIncomeBySource', () => {
  it('splitst de EXACTE gebeurtenisBaten-pool en houdt salaris apart', () => {
    // AOW-cap 12.000/jr. Rij: salaris 20.000, gebeurtenisBaten 15.000.
    // → AOW = min(15.000, 12.000) = 12.000; pensioen = 3.000; salaris = 20.000.
    const res = sumIncomeBySource([row(35_000, { salaris: 20_000, gebeurtenisBaten: 15_000 })], 12_000)
    expect(res.salaris).toBe(20_000)
    expect(res.gebeurtenisBaten).toBe(15_000)
    expect(res.aow).toBe(12_000)
    expect(res.pensioen).toBe(3_000)
  })

  it('kwaliteits-fix: salaris lekt NIET meer in AOW/pensioen (exact < oude heuristiek)', () => {
    // Onttrekkingsjaar met een resterend salaris/partnerdeel: grossIncome bevat
    // salaris (5.000) + AOW/pensioen (12.000) = 17.000.
    const rows = [row(17_000, { salaris: 5_000, gebeurtenisBaten: 12_000 })]
    const exact = sumIncomeBySource(rows, 12_000)
    // Exact: AOW = min(12.000, 12.000) = 12.000; pensioen = 0; salaris = 5.000.
    expect(exact.aow).toBe(12_000)
    expect(exact.pensioen).toBe(0)
    expect(exact.salaris).toBe(5_000)

    // Oude heuristiek op grossIncome zou pensioen = max(17.000 − 12.000, 0) = 5.000
    // hebben getoond — dat salarisdeel is nu géén "vaste inkomsten" meer.
    const oudeHeuristiekPensioen = Math.max(17_000 - 12_000, 0)
    expect(oudeHeuristiekPensioen).toBe(5_000)
    expect(exact.pensioen).toBeLessThan(oudeHeuristiekPensioen)
  })

  it('valt terug op de grossIncome-heuristiek als grossIncomeBySource ontbreekt', () => {
    // Geen exact veld → oude weg: AOW = min(grossIncome, cap), pensioen = rest.
    const res = sumIncomeBySource([row(18_000, undefined)], 12_000)
    expect(res.salaris).toBe(0)
    expect(res.aow).toBe(12_000)
    expect(res.pensioen).toBe(6_000)
    expect(res.gebeurtenisBaten).toBe(18_000)
  })

  it('gap-brug: gebeurtenisBaten ~€0 → AOW en pensioen beide 0', () => {
    const res = sumIncomeBySource(
      [row(0, { salaris: 0, gebeurtenisBaten: 0 }), row(0, { salaris: 0, gebeurtenisBaten: 0 })],
      13_000,
    )
    expect(res.aow).toBe(0)
    expect(res.pensioen).toBe(0)
  })
})

describe('RegimeKaart', () => {
  it('rendert titel, kicker, rij-labels, waarden en voetnoot', () => {
    render(
      <RegimeKaart
        kicker="AFBOUW · JAARINKOMEN"
        title="Waar je jaarinkomen vandaan komt"
        rows={[
          { label: 'AOW', weight: 12_000, value: 'A', tone: 'income' },
          { label: 'Vermogen', hint: 'onttrekking', weight: 8_000, value: 'B', tone: 'wealth' },
        ]}
        footnote="Vaste inkomsten nemen de druk weg bij je vermogen."
        infoDescription="Uitleg over de kaart."
      />,
    )
    expect(screen.getByText('Waar je jaarinkomen vandaan komt')).toBeInTheDocument()
    expect(screen.getByText('AFBOUW · JAARINKOMEN')).toBeInTheDocument()
    expect(screen.getByText('AOW')).toBeInTheDocument()
    expect(screen.getByText('Vermogen')).toBeInTheDocument()
    expect(screen.getByText('onttrekking')).toBeInTheDocument()
    expect(screen.getByText('Vaste inkomsten nemen de druk weg bij je vermogen.')).toBeInTheDocument()
    // i-uitleg-knop aanwezig (PageInfoButton).
    expect(screen.getByRole('button', { name: 'Wat betekent dit?' })).toBeInTheDocument()
  })

  it('balklengte is relatief t.o.v. de zwaarste rij (max = 100%, nul = 0%)', () => {
    const { container } = render(
      <RegimeKaart
        title="T"
        rows={[
          { label: 'Vermogen', weight: 1_000, value: 'x', tone: 'wealth' },
          { label: 'AOW', weight: 500, value: 'y', tone: 'income' },
          { label: 'Pensioen', weight: 0, value: 'z', tone: 'zero' },
        ]}
        footnote="f"
        infoDescription="i"
      />,
    )
    // Alleen de fill-divs dragen een inline width.
    const fills = Array.from(container.querySelectorAll('div[style*="width"]')) as HTMLElement[]
    expect(fills).toHaveLength(3)
    expect(fills[0].style.width).toBe('100%')
    expect(fills[1].style.width).toBe('50%')
    expect(fills[2].style.width).toBe('0%')
  })

  it('toont een status-pill wanneer meegegeven', () => {
    render(
      <RegimeKaart
        title="T"
        statusPill={{ label: 'Vaste basis', tone: 'good' }}
        rows={[{ label: 'AOW', weight: 1, value: 'x', tone: 'income' }]}
        footnote="f"
        infoDescription="i"
      />,
    )
    expect(screen.getByText('Vaste basis')).toBeInTheDocument()
  })

  it('pint de gerenderde jaarinkomen-euro’s tegen de split-uitvoer (geen drift)', () => {
    // Onttrekkingsfase: 2 jaar, AOW-cap 13.000/jr. Salaris ~0.
    const rows = [
      { grossIncome: 13_000, grossIncomeBySource: { salaris: 0, gebeurtenisBaten: 13_000 } },
      { grossIncome: 13_000, grossIncomeBySource: { salaris: 0, gebeurtenisBaten: 13_000 } },
    ]
    const split = sumIncomeBySource(rows, 13_000)
    const durationYears = rows.length
    const aowPerYear = split.aow / durationYears // 13.000
    const withdrawalPerYear = 20_000 // fictieve onttrekking-aggregatie

    render(
      <RegimeKaart
        title="Waar je jaarinkomen vandaan komt"
        rows={[
          { label: 'AOW', weight: aowPerYear, value: <MaskedAmount value={Math.round(aowPerYear)} tone="horizon" />, tone: 'income' },
          { label: 'Vermogen', hint: 'onttrekking', weight: withdrawalPerYear, value: <MaskedAmount value={Math.round(withdrawalPerYear)} tone="horizon" />, tone: 'wealth' },
        ]}
        footnote="f"
        infoDescription="i"
      />,
    )
    // De gerenderde euro-waarden moeten exact de split-afgeleide waarden zijn.
    // (formatCurrency gebruikt een non-breaking space; \s in de regex matcht die.)
    expect(screen.getByText(/€\s*13\.000/)).toBeInTheDocument()
    expect(screen.getByText(/€\s*20\.000/)).toBeInTheDocument()
  })
})
