import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'

/**
 * PlanAfbouwOverzicht (ADR 0179 fase 3) — de afbouwkaart rekent uit de canonieke HOOFDRUN
 * van de state-provider: `simResult` (stopmoment) + `viewDisplaySimRows` (de rijen van
 * diezelfde run, door de ene euro-grens). Geen tweede lading, geen eigen run, geen deflatie.
 */

const ctx = vi.hoisted(() => ({
  sim: {} as Record<string, unknown>,
  euro: {} as Record<string, unknown>,
}))
vi.mock('@/components/toekomst/state/toekomst-state-provider', () => ({
  useToekomstSimContext: () => ctx.sim,
  useToekomstEuroContext: () => ctx.euro,
}))

import { PlanAfbouwOverzicht, afbouwInvoer } from './plan-afbouw-overzicht'

const RIJEN = [
  { age: 50, endPortfolio: 400_000 },
  { age: 52, endPortfolio: 610_000 },
  { age: 70, endPortfolio: 350_000 },
  { age: 90, endPortfolio: 12_000 },
]

beforeEach(() => {
  ctx.sim = {
    simResult: { fireAgeFractional: 52.3, vastStopLeeftijd: null },
    fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
  }
  ctx.euro = { viewDisplaySimRows: RIJEN }
})
afterEach(cleanup)

describe('afbouwInvoer — kiest rijen uit de hoofdrun, rekent niets', () => {
  it('opgelost: vrijheidsleeftijd afgerond op de rij-leeftijd, eindleeftijd uit het plan', () => {
    expect(afbouwInvoer({ simResult: { fireAgeFractional: 52.3, vastStopLeeftijd: null }, rows: RIJEN, endAge: 90, strategy: 'deplete' })).toEqual({
      fireAge: 52,
      endAge: 90,
      fireAgeBalance: 610_000,
      endBalance: 12_000,
      strategy: 'deplete',
    })
  })

  it('vast anker: het stopmoment van de run (vastStopLeeftijd) wint', () => {
    const uit = afbouwInvoer({ simResult: { fireAgeFractional: 52.3, vastStopLeeftijd: 70 }, rows: RIJEN, endAge: 90, strategy: 'deplete' })
    expect(uit?.fireAge).toBe(70)
    expect(uit?.fireAgeBalance).toBe(350_000)
  })

  it('geen run, geen stopmoment of geen rijen: geen kaart', () => {
    expect(afbouwInvoer({ simResult: null, rows: RIJEN, endAge: 90, strategy: 'deplete' })).toBeNull()
    expect(afbouwInvoer({ simResult: { fireAgeFractional: null, vastStopLeeftijd: null }, rows: RIJEN, endAge: 90, strategy: 'deplete' })).toBeNull()
    expect(afbouwInvoer({ simResult: { fireAgeFractional: 52, vastStopLeeftijd: null }, rows: [], endAge: 90, strategy: 'deplete' })).toBeNull()
  })
})

describe('PlanAfbouwOverzicht — gepind op de provider', () => {
  it('toont de bedragen van de hoofdrun-rijen (Volledig)', () => {
    render(
      <DisplayModeProvider initialMode="full">
        <PlanAfbouwOverzicht />
      </DisplayModeProvider>,
    )
    const kaart = screen.getByTestId('plan-afbouw-overzicht')
    expect(kaart.textContent).toMatch(/610\.000/)
    expect(kaart.textContent).toMatch(/12\.000/)
    expect(kaart.textContent).toContain('Bij vrijheid · 52')
  })

  it('Eenvoudig: niet getoond (diepte, HideInSimple)', () => {
    render(
      <DisplayModeProvider initialMode="simple">
        <PlanAfbouwOverzicht />
      </DisplayModeProvider>,
    )
    expect(screen.queryByTestId('plan-afbouw-overzicht')).toBeNull()
  })

  it('bron: geen tweede lading, geen eigen run, geen eigen deflatie', () => {
    const src = readFileSync(path.join(process.cwd(), 'components/toekomst/plan/plan-afbouw-overzicht.tsx'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    for (const verboden of ['dashboard-data-loader', 'runRegelProjection', 'computeConvergentieProjection', 'deflate', 'inflationFactor', 'dashboardData']) {
      expect(code, verboden).not.toContain(verboden)
    }
    expect(code).toContain('useToekomstSimContext')
    expect(code).toContain('viewDisplaySimRows')
  })
})
