/**
 * B-032 — een begroting van NUL waar wél op geboekt is, hoort een VOLLE balk te
 * geven, niet een lege.
 *
 * Gemeld op /overzicht/budget, sectie INKOMEN. Drie soorten rijen naast elkaar
 * (namen en bedragen hieronder zijn illustratief, niet de gemelde rijen zelf):
 *   post met een gewone begroting, deels ontvangen -> balk deels gevuld (goed)
 *   post zonder begroting en zonder ontvangst      -> balk leeg (goed)
 *   post zonder begroting waarop wel ontvangen is  -> balk LEEG (de bug)
 *
 * De weergave-klemfamilie in lib/budget-spending.ts opende met
 * `if (!(limit > 0)) return 0`, dus een nul-begroting las als "er is nog niets
 * gebeurd" — het exacte tegendeel van de waarheid.
 *
 * Zusterbestand van budget-negative-spend.test.tsx: dat legt de ONDERkant van
 * dezelfde familie vast (negatieve besteding => 0%), dit de nul-limiet-tak.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BudgetTree } from './budget-tree'
import { BudgetPillTree } from './budget-pill-tree'
import { BudgetHeatmap, type HeatmapSection } from './budget-heatmap'
import { computeBarSegments, getTypeColors, anyChildOverBudget } from './budget-shared'
import type { Budget, BudgetWithChildren } from '@/lib/budget-data'

vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => ({ masked: false }),
}))

/** De gemelde rij: EUR 8.000 ontvangen op een inkomsten-budget zonder begroting. */
const SPENT = 8000
const LIMIT = 0

function makeBudget(over: Partial<Budget> & { id: string; name: string }): Budget {
  return {
    user_id: 'u1',
    parent_id: null,
    slug: null,
    icon: 'ShoppingCart',
    description: null,
    default_limit: LIMIT,
    budget_type: 'income',
    interval: 'monthly',
    rollover_type: 'reset',
    limit_type: 'soft',
    alert_threshold: 80,
    max_single_transaction_amount: 0,
    is_essential: false,
    priority_score: 0,
    is_inflation_indexed: false,
    sort_order: 0,
    is_archived: false,
    created_at: '2026-01-01',
    ...over,
  } as Budget
}

const verkoop: BudgetWithChildren = {
  ...makeBudget({ id: 'verkoop', name: 'Losse inkomsten' }),
  children: [],
} as BudgetWithChildren

/** De zusterrij die WEL correct leeg hoort te blijven: EUR 0 van EUR 0. */
const overige: BudgetWithChildren = {
  ...makeBudget({ id: 'overige', name: 'Overige inkomsten' }),
  children: [],
} as BudgetWithChildren

const groups = [verkoop, overige]
const spending = { verkoop: SPENT, overige: 0 }

/** Alle inline width-waarden in de gerenderde DOM. */
function widths(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[style*="width"]'))
    .map((el) => el.style.width)
    .filter(Boolean)
}

beforeEach(cleanup)

describe('computeBarSegments — de gedeelde balkmotor bij een nul-begroting', () => {
  const colors = getTypeColors('income')

  it('gegeven limiet 0 en ontvangen 8000, wanneer de balk wordt opgebouwd, dan is zij volledig gevuld en gemarkeerd als over', () => {
    const seg = computeBarSegments(SPENT, LIMIT, 80, colors, true)
    expect(seg.isFullyOver).toBe(true)
    // normaal + waarschuwing beslaan samen de eerste 100% van de (op 105
    // geschaalde) baan, en het extensie-segment vult de rest.
    expect(seg.normalPct + seg.warnPct + seg.extensionPct).toBeCloseTo(100, 5)
    expect(seg.extensionPct).toBeGreaterThan(0)
    // Op een inkomsten-budget is "over" goed nieuws.
    expect(seg.overColor).toBe('var(--positive)')
    expect(seg.normalColor).toBe('var(--positive)')
  })

  it('gegeven limiet 0 en ontvangen 0, wanneer de balk wordt opgebouwd, dan blijft zij leeg', () => {
    const seg = computeBarSegments(0, 0, 80, colors, true)
    expect(seg.isFullyOver).toBe(false)
    expect(seg.normalPct).toBe(0)
    expect(seg.warnPct).toBe(0)
    expect(seg.extensionPct).toBe(0)
  })

  it('gegeven limiet 0, wanneer de segmenten worden geschaald, dan is geen enkele breedte negatief of oneindig', () => {
    for (const spent of [SPENT, 0, -500]) {
      const seg = computeBarSegments(spent, LIMIT, 80, colors, true)
      for (const v of [seg.normalPct, seg.warnPct, seg.extensionPct, seg.limitPosition]) {
        expect(Number.isFinite(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

describe('anyChildOverBudget — het waarschuwingsicoon op een ingeklapte parent', () => {
  const child = makeBudget({ id: 'kind', name: 'Kind', budget_type: 'expense', parent_id: 'p' })

  it('gegeven een deelbudget met begroting 0 en besteding, wanneer de parent wordt beoordeeld, dan waarschuwt hij', () => {
    expect(anyChildOverBudget([child], { kind: 8000 }, { kind: -8000 }, 'expense')).toBe(true)
  })

  it('gegeven een deelbudget met begroting 0 zonder besteding, wanneer de parent wordt beoordeeld, dan waarschuwt hij niet', () => {
    expect(anyChildOverBudget([child], { kind: 0 }, { kind: 0 }, 'expense')).toBe(false)
  })
})

describe('BudgetTree', () => {
  it('gegeven EUR 8.000 op een begroting van EUR 0, wanneer de rij rendert, dan staat er 100% en is de balk niet leeg', () => {
    const { container } = render(
      <BudgetTree groups={groups} spending={spending} budgetType="income" onNavigate={vi.fn()} />,
    )
    expect(screen.getByText('100%')).toBeTruthy()
    // De zusterrij EUR 0 / EUR 0 blijft terecht op 0%.
    expect(screen.getByText('0%')).toBeTruthy()

    const numeric = widths(container)
      .filter((w) => w.endsWith('%'))
      .map((w) => parseFloat(w))
    expect(numeric.length).toBeGreaterThan(0)
    for (const n of numeric) {
      expect(Number.isFinite(n)).toBe(true)
      expect(n).toBeGreaterThanOrEqual(0)
    }
    // Er is minstens één gevuld segment: de balk is niet meer overal 0%.
    expect(numeric.some((n) => n > 0)).toBe(true)
  })
})

describe('BudgetPillTree', () => {
  it('gegeven een begroting van EUR 0 met besteding, wanneer de pil rendert, dan is geen breedte negatief of oneindig', () => {
    const { container } = render(
      <BudgetPillTree groups={groups} spending={spending} budgetType="income" onNavigate={vi.fn()} />,
    )
    for (const w of widths(container)) {
      expect(w.startsWith('-')).toBe(false)
      expect(w).not.toContain('Infinity')
      expect(w).not.toContain('NaN')
    }
  })
})

describe('BudgetHeatmap', () => {
  const section = {
    label: 'Inkomen',
    budgetType: 'income',
    groups: [
      { id: 'verkoop', name: 'Losse inkomsten', icon: 'ShoppingCart', default_limit: LIMIT, children: [] },
      { id: 'overige', name: 'Overige inkomsten', icon: 'ShoppingCart', default_limit: LIMIT, children: [] },
    ],
  } as unknown as HeatmapSection

  it('gegeven een begroting van EUR 0 met besteding, wanneer de cel rendert, dan meldt het aria-label 100% i.p.v. 0%', () => {
    const { container } = render(
      <BudgetHeatmap sections={[section]} spending={spending} onNavigate={vi.fn()} size="full" />,
    )
    const labels = Array.from(container.querySelectorAll('[aria-label]'))
      .map((el) => el.getAttribute('aria-label') ?? '')
      .filter((l) => l.includes('Losse inkomsten'))
    expect(labels.length).toBeGreaterThan(0)
    for (const label of labels) {
      expect(label).toContain('100%')
    }

    for (const w of widths(container)) {
      expect(w.startsWith('-')).toBe(false)
      expect(w).not.toContain('Infinity')
      expect(w).not.toContain('NaN')
    }
  })
})
