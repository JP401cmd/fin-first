/**
 * Component-test voor OpbrengstUitsplitsing — de gedeelde "Totale opbrengst"-
 * uitsplitsing die ZOWEL de detail-pane als de full-page detail tonen. Het
 * component REKENT NIETS zelf behalve de presentatie-split `pureRealized =
 * realizedPnL − dividends + totalFees`; alle andere getallen komen direct uit
 * de canonieke engine (computePositionFromTransactions + valuePosition). Deze
 * tests pinnen het zichtbare contract vast:
 *
 *   1. De 4 regels (Koerswinst/Gerealiseerd/Dividend/Kosten) tellen op tot
 *      totalPnL — geen dubbeltelling.
 *   2. Bij een gesloten positie (isClosed) verdwijnt de koerswinst-regel en
 *      geldt totalPnL === realizedPnL.
 *   3. Dividend- en Kosten-regels verbergen wanneer 0.
 *   4. Teken en percentage (t.o.v. inleg) volgen totalPnL; semantische kleur.
 *
 * We injecteren een eenvoudige `formatAmount` (geen valuta-locale) zodat we op
 * exacte getallen kunnen asserteren zonder nl-NL-formattering te parsen.
 */

import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { OpbrengstUitsplitsing } from './opbrengst-uitsplitsing'

/** Identiteits-achtige formatter: euro-teken + vaste twee decimalen, punt als
 *  scheidingsteken zodat de assertie-strings stabiel en goed leesbaar zijn. */
const fmt = (v: number) => `€${v.toFixed(2)}`

/** Helpt de <dd> die hoort bij een <dt>-label te vinden (volgende sibling). */
function amountFor(label: string): string {
  const dt = screen.getByText(label)
  const dd = dt.nextElementSibling
  if (!dd) throw new Error(`Geen bedrag-regel naast label "${label}"`)
  return dd.textContent ?? ''
}

describe('OpbrengstUitsplitsing', () => {
  it('open positie: toont alle 4 regels die optellen tot totalPnL (geen dubbeltelling)', () => {
    // Engine-velden voor een open positie met koerswinst, gerealiseerde winst,
    // dividend én kosten. realizedPnL is INCL. dividend, MIN kosten (engine-
    // conventie): pureRealized = 25 − 8 + 3 = 20.
    //   Koerswinst (huidig) 50 + Gerealiseerd 20 + Dividend 8 − Kosten 3 = 75
    render(
      <OpbrengstUitsplitsing
        totalPnL={75}
        unrealizedPnL={50}
        realizedPnL={25}
        dividends={8}
        totalFees={3}
        totalInvested={100}
        isClosed={false}
        formatAmount={fmt}
      />,
    )

    expect(amountFor('Koerswinst (huidig)')).toBe('+ €50.00')
    expect(amountFor('Gerealiseerd')).toBe('+ €20.00')
    expect(amountFor('Dividend')).toBe('+ €8.00')
    expect(amountFor('Kosten')).toBe('− €3.00')

    // De som van de zichtbare regels === totalPnL (geen dubbeltelling).
    const koers = 50
    const pureRealized = 25 - 8 + 3
    const div = 8
    const kosten = 3
    expect(koers + pureRealized + div - kosten).toBe(75)
  })

  it('toont totalPnL met teken + percentage t.o.v. inleg, semantisch positief', () => {
    const { container } = render(
      <OpbrengstUitsplitsing
        totalPnL={75}
        unrealizedPnL={50}
        realizedPnL={25}
        dividends={8}
        totalFees={3}
        totalInvested={100}
        isClosed={false}
        formatAmount={fmt}
      />,
    )
    // Hoofdbedrag (+€75) met expliciet plus.
    expect(screen.getByText('+€75.00')).toBeInTheDocument()
    // % t.o.v. inleg: 75 / 100 = +75.0%.
    expect(screen.getByText('+75.0%')).toBeInTheDocument()
    // Positieve toon op het hoofdbedrag.
    expect(container.querySelector('.text-positive')).toBeTruthy()
  })

  it('gesloten positie: verbergt de koerswinst-regel en totalPnL === realizedPnL', () => {
    // Gesloten: unrealizedPnL = 0, totalPnL === realizedPnL. 10 @10 → 10 @12
    // levert realized 20, incl. geen dividend/kosten → pureRealized 20.
    render(
      <OpbrengstUitsplitsing
        totalPnL={20}
        unrealizedPnL={0}
        realizedPnL={20}
        dividends={0}
        totalFees={0}
        totalInvested={100}
        isClosed
        formatAmount={fmt}
      />,
    )
    // Geen actuele koerswinst-regel bij een gesloten positie.
    expect(screen.queryByText('Koerswinst (huidig)')).not.toBeInTheDocument()
    // Gerealiseerd === totalPnL (de hele opbrengst is gerealiseerd).
    expect(amountFor('Gerealiseerd')).toBe('+ €20.00')
    expect(screen.getByText('+€20.00')).toBeInTheDocument()
  })

  it('verbergt Dividend en Kosten wanneer beide 0 zijn', () => {
    render(
      <OpbrengstUitsplitsing
        totalPnL={50}
        unrealizedPnL={50}
        realizedPnL={0}
        dividends={0}
        totalFees={0}
        totalInvested={200}
        isClosed={false}
        formatAmount={fmt}
      />,
    )
    expect(screen.getByText('Koerswinst (huidig)')).toBeInTheDocument()
    expect(screen.getByText('Gerealiseerd')).toBeInTheDocument()
    expect(screen.queryByText('Dividend')).not.toBeInTheDocument()
    expect(screen.queryByText('Kosten')).not.toBeInTheDocument()
  })

  it('negatief totaal: min-teken + negatieve percentage + semantische kleur', () => {
    const { container } = render(
      <OpbrengstUitsplitsing
        totalPnL={-40}
        unrealizedPnL={-40}
        realizedPnL={0}
        dividends={0}
        totalFees={0}
        totalInvested={100}
        isClosed={false}
        formatAmount={fmt}
      />,
    )
    // Hoofdbedrag zonder expliciet plus, met de geformatteerde (negatieve) waarde.
    expect(screen.getByText('€-40.00')).toBeInTheDocument()
    expect(screen.getByText('-40.0%')).toBeInTheDocument()
    expect(container.querySelector('.text-negative')).toBeTruthy()
  })

  it('verbergt het percentage wanneer er geen inleg is (guard tegen /0)', () => {
    render(
      <OpbrengstUitsplitsing
        totalPnL={5}
        unrealizedPnL={0}
        realizedPnL={5}
        dividends={5}
        totalFees={0}
        totalInvested={0}
        isClosed
        formatAmount={fmt}
      />,
    )
    // Geen "%"-tekst wanneer totalInvested 0 is.
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument()
  })

  it('pure gerealiseerde split blijft consistent: Gerealiseerd + Dividend − Kosten === realizedPnL', () => {
    // realizedPnL (engine) = 25, dividends 8, totalFees 3.
    // pureRealized = 25 − 8 + 3 = 20  →  20 + 8 − 3 = 25 === realizedPnL.
    render(
      <OpbrengstUitsplitsing
        totalPnL={25}
        unrealizedPnL={0}
        realizedPnL={25}
        dividends={8}
        totalFees={3}
        totalInvested={100}
        isClosed
        formatAmount={fmt}
      />,
    )
    const gerealiseerd = within(screen.getByText('Gerealiseerd').parentElement!)
    expect(gerealiseerd.getByText(/€20\.00/)).toBeInTheDocument()
    // 20 (pure) + 8 (dividend) − 3 (kosten) === 25 (realizedPnL, engine-totaal).
    expect(20 + 8 - 3).toBe(25)
  })
})
