import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MASKED_PERCENT_PLACEHOLDER } from '@/lib/format'
import type { DashboardData } from './widget-renderer'
import type { FavoriteHolding } from './widget-renderer'

/**
 * PRIVACY-REGRESSIE op WF-NAV-11 ("plus/min-tekens vóór gemaskeerde delta's
 * worden mee-verborgen — richting mag niet lekken").
 *
 * Repro (UAT-sweep 2 sep 2026): met maskering aan toonde de NETTO VERMOGEN-kaart
 * "▼ •••••• (-4.2%)" en de holdings-tegel "Rendement +32.7%". Het eurobedrag was
 * verborgen, maar de richting stond er nog drie keer naast: als percentage, als
 * ▲/▼-driehoek en als positive/negative-KLEUR.
 *
 * Deze suite bewaakt beide kanten per widget: zichtbaar zonder maskering, weg
 * met. Precedent voor de mock-vorm: hub-kansen.masking.test.tsx.
 */

const { maskedRef } = vi.hoisted(() => ({ maskedRef: { current: false } }))

vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => ({
    masked: maskedRef.current,
    setMasked: () => {},
    toggle: () => {},
  }),
}))

vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => ({ perspective: 'personal', partnerName: null }),
}))

vi.mock('@/lib/hooks/use-in-view-animation', () => ({
  useInViewAnimation: () => ({ ref: { current: null }, hasEntered: true, animationComplete: true }),
}))

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

const { NettoVermogenWidget } = await import('./netto-vermogen-widget')
const { HoldingFavWidget } = await import('./holding-fav-widget')
const { BeleggingsrendementWidget } = await import('./beleggingsrendement-widget')

beforeEach(() => {
  maskedRef.current = false
})

/** Negatieve MoM-delta: precies de "▼ … (-x%)"-situatie uit de bugmelding. */
function makeData(): DashboardData {
  return {
    netWorth: 300000,
    monthlyIncome: 5500,
    monthlyExpenses: 3600,
    dailyExpenseRate: 100,
    monthlyContributions: 1000,
    totalAssets: 320000,
    totalDebts: 20000,
    netWorthHistory: [{ value: 313000 }, { value: 300000 }],
    netWorthDelta: -13000,
    householdOverrides: null,
    partnerOverrides: null,
  } as unknown as DashboardData
}

const HOLDING = {
  id: 'h1',
  name: 'Meesman Wereldwijd Totaal',
  ticker: 'MEESMAN-WWT',
  units: 120,
  currentPrice: 145.5,
  totalValue: 17460,
  totalCost: 13160,
  returnPct: 32.7,
  dailyChangePct: -1.24,
  lastPriceUpdate: new Date().toISOString(),
} as unknown as FavoriteHolding

/** Alles wat richting verraadt, ongeacht welke widget het rendert. */
const DIRECTION_GLYPHS = ['▲', '▼', '%']

function directionClassCount(container: HTMLElement): number {
  return container.querySelectorAll('.text-positive, .text-negative').length
}

describe('NettoVermogenWidget — richting lekt niet bij maskering (WF-NAV-11)', () => {
  it.each(['quarter', 'half', 'full'] as const)('%s: zichtbaar zonder maskering', (size) => {
    const { container } = render(<NettoVermogenWidget size={size} data={makeData()} />)
    const text = container.textContent ?? ''
    // Zonder maskering hoort de richting er juist wél te staan. De quarter-tegel
    // toont alleen de driehoek + het bedrag (geen percentage), half en full
    // tonen het percentage in de Δ-rij.
    if (size === 'quarter') expect(text).toContain('▼')
    else expect(text).toContain('%')
  })

  it.each(['quarter', 'half', 'full'] as const)(
    '%s: geen percentage, geen ▲/▼ en geen richtingskleur mét maskering',
    (size) => {
      maskedRef.current = true
      const { container } = render(<NettoVermogenWidget size={size} data={makeData()} />)
      const text = container.textContent ?? ''
      for (const glyph of DIRECTION_GLYPHS) expect(text).not.toContain(glyph)
      // Quarter toont geen percentage-cel, dus daar valt niets te vervangen.
      if (size !== 'quarter') expect(text).toContain(MASKED_PERCENT_PLACEHOLDER)
      // Kleur is een even reëel lek-kanaal als het cijfer.
      expect(directionClassCount(container)).toBe(
        // De full-size legenda draagt vaste categorie-labels (Bezittingen groen /
        // Schulden rood). Die zeggen niets over de richting van ÉÉN gebruiker en
        // blijven bewust staan; de delta-rij mag geen richtingskleur meer dragen.
        size === 'full' ? 2 : 0
      )
    }
  )
})

describe('HoldingFavWidget — richting lekt niet bij maskering (WF-NAV-11)', () => {
  it.each(['xl', 'full', 'half', 'quarter', 'mini'] as const)(
    '%s: zichtbaar zonder maskering',
    (size) => {
      const { container } = render(<HoldingFavWidget size={size} holding={HOLDING} dailyExp={100} />)
      expect(container.textContent ?? '').toContain('%')
    }
  )

  it.each(['xl', 'full', 'half', 'quarter', 'mini'] as const)(
    '%s: geen percentage en geen richtingskleur mét maskering',
    (size) => {
      maskedRef.current = true
      const { container } = render(<HoldingFavWidget size={size} holding={HOLDING} dailyExp={100} />)
      const text = container.textContent ?? ''
      for (const glyph of DIRECTION_GLYPHS) expect(text).not.toContain(glyph)
      expect(text).toContain(MASKED_PERCENT_PLACEHOLDER)
      expect(directionClassCount(container)).toBe(0)
    }
  )

  it('de rendement-ring geeft gemaskeerd geen boog, kleur of aria-label meer prijs', () => {
    maskedRef.current = true
    const { container } = render(<HoldingFavWidget size="half" holding={HOLDING} dailyExp={100} />)
    const svg = container.querySelector('svg[role="img"]')
    expect(svg?.getAttribute('aria-label')).toBe('Rendement verborgen')
    // Geen positive/negative-stroke: de gekleurde boog verraadt winst/verlies.
    const html = svg?.outerHTML ?? ''
    expect(html).not.toContain('var(--positive)')
    expect(html).not.toContain('var(--negative)')
  })
})

/**
 * Derde vindplaats van hetzelfde patroon, gevonden met de sweep die de analyse
 * van de kaart aanraadde ("grep op momDelta / ReturnRing-achtige patronen"):
 * deze widget zet het portefeuillerendement pal boven een `MaskedAmount`.
 */
function makeRendementData(): DashboardData {
  return {
    monthlyExpenses: 3600,
    dailyExpenseRate: 100,
    grossReturn: 0.07,
    assetsByType: [
      { type: 'investment', value: 60000, expectedReturn: 0.07 },
      { type: 'crypto', value: 8000, expectedReturn: 0.12 },
    ],
    assetReturn: {
      value: 68000,
      cost: 51000,
      gain: 17000,
      pct: 33.3,
      byType: [
        { type: 'investment', value: 60000, cost: 46000, gain: 14000, pct: 30.4 },
        { type: 'crypto', value: 8000, cost: 5000, gain: 3000, pct: 60 },
      ],
    },
  } as unknown as DashboardData
}

describe('BeleggingsrendementWidget — rendement lekt niet bij maskering (WF-NAV-11)', () => {
  it.each(['mini', 'quarter', 'half', 'full'] as const)(
    '%s: rendementspercentage zichtbaar zonder maskering',
    (size) => {
      const { container } = render(<BeleggingsrendementWidget size={size} data={makeRendementData()} />)
      expect(container.textContent ?? '').toContain('33,3%')
    }
  )

  it.each(['mini', 'quarter', 'half', 'full'] as const)(
    '%s: geen rendementscijfer en geen richtingskleur mét maskering',
    (size) => {
      maskedRef.current = true
      const { container } = render(<BeleggingsrendementWidget size={size} data={makeRendementData()} />)
      const text = container.textContent ?? ''
      expect(text).not.toContain('33,3%')
      expect(text).toContain(MASKED_PERCENT_PLACEHOLDER)
      expect(directionClassCount(container)).toBe(0)
    }
  )

  it('per-type-uitsplitsing verbergt gemaskeerd ook de rij-percentages', () => {
    maskedRef.current = true
    const { container } = render(<BeleggingsrendementWidget size="full" data={makeRendementData()} />)
    const text = container.textContent ?? ''
    expect(text).not.toContain('30,4%')
    expect(text).not.toContain('60,0%')
  })

  it('het VERWACHTE rendement blijft staan — dat is een aanname, geen uitkomst', () => {
    maskedRef.current = true
    const { container } = render(<BeleggingsrendementWidget size="full" data={makeRendementData()} />)
    // Marktaanname (asset-gewogen ≈ 7,6%), niet af te leiden uit een verborgen
    // bedrag. Zou die óók verdwijnen, dan maskeerden we context i.p.v. data.
    expect(container.textContent ?? '').toMatch(/\d[.,]\d%/)
  })
})
