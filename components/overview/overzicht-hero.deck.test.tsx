/**
 * De deck onder de begroeting op /overzicht (B-069, F4 van "Topbar &
 * oordeelzin"): één lopende zin, "Je financiële gezondheid is {band}, gezien
 * je {pijlers}.", met alleen het bandwoord in stoplichtkleur.
 *
 * Een render-test en geen bron-test, omdat de zin uit drie stukken wordt
 * samengesteld (vaste aanhef, gekleurd bandwoord, staart uit
 * `healthScoreBasisPhrase`) en pas in de DOM blijkt of spaties, komma en punt
 * goed vallen. De pijlerlogica zelf staat in
 * `lib/financial-health.hub-zin.test.ts`.
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  computeHealthScoreFromInputs,
  type HealthScore,
  type HealthScoreInput,
} from '@/lib/financial-health'
import { OverzichtHeroPrimary } from './overzicht-hero'

const input: HealthScoreInput = {
  effectiveSavingsRatePct: 20,
  totalAssets: 100_000,
  totalDebts: 20_000,
  emergencyFundMonths: 3,
  freedomPct: 25,
  currentAge: null,
  fireAgeFractional: null,
  netMonthlyIncome: 4_000,
  debtMonthlyPayments: 600,
  largestAssetTypeShare: 0.5,
  budgetCategories: [
    { limit: 1500, spent: 1400 },
    { limit: 500, spent: 450 },
  ],
}

function renderDeck(health: HealthScore | null): HTMLParagraphElement {
  const { container } = render(
    <OverzichtHeroPrimary
      userName="Jan"
      greeting="Goedemorgen"
      dateLabel="Dinsdag 22 september 2026"
      health={health}
      leverScores={null}
      heroChart={null}
      secondary={null}
    />,
  )
  // De deck is de enige <p> direct in de <header> van de hero.
  const deck = container.querySelector('header > p')
  expect(deck, 'geen deck onder de begroeting gevonden').toBeTruthy()
  return deck as HTMLParagraphElement
}

/** Tekst zoals een lezer hem ziet: witruimte samengevouwen. */
const tekst = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()

describe('/overzicht — de deck is één lopende zin (B-069)', () => {
  it('noemt de band en alle vier de pijlergroepen als alles meetelt', () => {
    const health = computeHealthScoreFromInputs(input, true)
    const deck = renderDeck(health)
    expect(tekst(deck)).toBe(
      `Je financiële gezondheid is ${health.label.toLowerCase()}, gezien je bezittingen, buffer, schulden en uitgaven.`,
    )
  })

  it('kleurt alléén het bandwoord, in de stoplichtkleur van de score', () => {
    const health: HealthScore = { ...computeHealthScoreFromInputs(input, true), total: 85, label: 'Uitstekend' }
    const deck = renderDeck(health)
    const band = deck.querySelector('span')
    expect(band?.textContent).toBe('uitstekend')
    expect(band?.className).toContain('text-emerald-700')
    // De rest van de zin staat niet in een gekleurde span.
    expect(deck.querySelectorAll('span')).toHaveLength(1)
  })

  it('noemt alleen de groepen die meetellen (hier: geen modules → alleen buffer)', () => {
    const health = computeHealthScoreFromInputs(input, true, [])
    expect(tekst(renderDeck(health))).toMatch(/, gezien je buffer\.$/)
  })

  it('eindigt na het bandwoord als er geen pijler meetelt', () => {
    const health: HealthScore = { ...computeHealthScoreFromInputs(input, true), pillars: [] }
    expect(tekst(renderDeck(health))).toBe(`Je financiële gezondheid is ${health.label.toLowerCase()}.`)
  })

  it('zonder score: de neutrale zin, zonder band of pijlers', () => {
    expect(tekst(renderDeck(null))).toBe(
      'Hoe je ervoor staat, in één blik: je vier hefbomen, je gezondheid en je plan.',
    )
  })

  it('bij onbekende grondslag (ADR 0131): ook de neutrale zin, geen oordeel', () => {
    const health = computeHealthScoreFromInputs(
      { ...input, incomeBasis: 'unknown', expensesBasis: 'unknown' },
      true,
    )
    expect(health.onbekend).toBeTruthy()
    expect(tekst(renderDeck(health))).toBe(
      'Hoe je ervoor staat, in één blik: je vier hefbomen, je gezondheid en je plan.',
    )
  })

  it('de oude weging-zin is weg en "vrijheid" of "oordeel" komt er niet in voor', () => {
    const deck = tekst(renderDeck(computeHealthScoreFromInputs(input, true)))
    expect(deck).not.toContain('De score weegt')
    expect(deck).not.toMatch(/vrijheid|oordeel/i)
  })
})
