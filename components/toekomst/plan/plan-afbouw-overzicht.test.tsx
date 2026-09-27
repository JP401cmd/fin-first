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
  bron: {} as Record<string, unknown>,
}))
vi.mock('@/components/toekomst/state/toekomst-state-provider', () => ({
  useToekomstSimContext: () => ctx.sim,
  useToekomstEuroContext: () => ctx.euro,
  useToekomstBron: () => ctx.bron,
}))

import { PlanAfbouwOverzicht, afbouwInvoer, afbouwVrijheidsdagen } from './plan-afbouw-overzicht'
import { vrijheidTekst } from '@/components/toekomst/meldingen/meldingen-bron'

const RIJEN = [
  { age: 50, endPortfolio: 400_000 },
  { age: 52, endPortfolio: 610_000 },
  { age: 70, endPortfolio: 350_000 },
  { age: 90, endPortfolio: 12_000 },
]

/**
 * De nominale kernelrijen van dezelfde run: `netWorth` (I, incl. woning) spiegelt
 * `endPortfolio`, `nettoLiquide` (J) is het deel zonder woning.
 */
const KERNELRIJEN = [
  { age: 50, inflationFactor: 1, netWorth: 400_000, nettoLiquide: 300_000 },
  { age: 52, inflationFactor: 1.0404, netWorth: 610_000, nettoLiquide: 520_000 },
  { age: 70, inflationFactor: 1.5, netWorth: 350_000, nettoLiquide: 300_000 },
  { age: 90, inflationFactor: 2.2, netWorth: 12_000, nettoLiquide: 11_000 },
]

beforeEach(() => {
  ctx.sim = {
    simResult: { fireAgeFractional: 52.3, vastStopLeeftijd: null },
    fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    displayUnifiedRows: KERNELRIJEN,
    canonicalDailyRate: 100,
  }
  ctx.euro = { viewDisplaySimRows: RIJEN }
  ctx.bron = { initialData: { dailyExpenseRateDetail: { source: 'transactions' } } }
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

describe('afbouwVrijheidsdagen — het liquide deel, één keer door de kernelfactor', () => {
  const basis = { rows: KERNELRIJEN, fireAge: 52, endAge: 90, canonicalDailyRate: 100 }

  it('rekent op nettoLiquide (J), niet op het netto vermogen incl. woning (I)', () => {
    // 520.000 / 1,0404 / 100 = 4.998 dagen; op I zou het 610.000 / 1,0404 / 100 = 5.863 zijn.
    // Eind: 11.000 / 2,2 / 100 = 50 dagen.
    expect(afbouwVrijheidsdagen({ ...basis, source: 'transactions' })).toEqual({ start: 4_998, eind: 50 })
  })

  it('zonder geloofwaardige dagbasis geen regel, ook geen nul (ADR 0131)', () => {
    expect(afbouwVrijheidsdagen({ ...basis, source: 'none' })).toEqual({ start: null, eind: null })
    expect(afbouwVrijheidsdagen({ ...basis, canonicalDailyRate: 0, source: 'transactions' })).toEqual({ start: null, eind: null })
  })

  it('geen rij op die leeftijd of geen liquide vermogen: geen regel', () => {
    expect(afbouwVrijheidsdagen({ ...basis, fireAge: 60, source: 'transactions' }).start).toBeNull()
    const zonderLiquide = KERNELRIJEN.map((r) => (r.age === 90 ? { ...r, nettoLiquide: 0 } : r))
    expect(afbouwVrijheidsdagen({ ...basis, rows: zonderLiquide, source: 'transactions' }).eind).toBeNull()
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

  it('toont de vrijheidstijd van het liquide deel onder begin- en eindstand', () => {
    render(
      <DisplayModeProvider initialMode="full">
        <PlanAfbouwOverzicht />
      </DisplayModeProvider>,
    )
    const kaart = screen.getByTestId('plan-afbouw-overzicht')
    expect(kaart.textContent).toContain(`${vrijheidTekst(4_998, false)} vrijheid in het liquide deel`)
    expect(kaart.textContent).toContain(`${vrijheidTekst(50, false)} vrijheid in het liquide deel`)
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
    // Vrijheidstijd via de canonieke helper op de J-grondslag, nooit een eigen deling.
    expect(code).toContain('freedomDaysAtAge(')
    expect(code).toContain('nominalAmount: rij.nettoLiquide')
    expect(code).not.toContain('formatWithFreedom')
    expect(code).not.toContain('netWorth')
  })
})
