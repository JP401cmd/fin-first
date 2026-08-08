import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PrivacyProvider } from '@/lib/hooks/use-privacy'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import {
  buildSpendLimitReport,
  SPEND_LIMIT_WINDOW_BY_PERIOD,
  type SpendLimitAggregateRow,
} from '@/lib/spend-limits/engine'
import type { SpendLimitConfig, SpendLimitWithReport } from '@/lib/spend-limits/types'
import { SpendLimitPerformancePane } from './spend-limit-performance-pane'

/**
 * SpendLimitPerformancePane — de STAAT VAN HET GEKOPPELDE BUDGET (AC-B1-02).
 *
 * Dit zijn drie verschillende gebeurtenissen die tot fase 5 op één hoop lagen, en
 * juist het verschil is wat de gebruiker moet horen:
 *
 *  1. budget actief          → geen melding; er is niets aan de hand;
 *  2. budget GEARCHIVEERD    → historie klopt, er komt alleen niets nieuws bij;
 *  3. budget WEG/onzichtbaar → de pot kan niets meer toerekenen.
 *
 * De verleiding is om 2 en 3 samen te vatten tot "niet meer beschikbaar". Dat zou
 * het archiveren van een budget als dataverlies laten klinken terwijl er niets
 * kwijt is — en het zou de échte kapotte toestand (3) onzichtbaar maken tussen de
 * ruis. De suite pint daarom óók dat de historie in geval 2 gewoon doorrekent.
 *
 * De invoer wordt niet met de hand verzonnen: `buildSpendLimitReport` uit de
 * motor rekent hem door, zodat de weergave tegen echte motoruitvoer staat.
 */

const NOW = new Date(2026, 7, 15) // 15 augustus 2026

function row(month: string, spend: number): SpendLimitAggregateRow {
  return { month, transactionType: 'expense', sumPositief: 0, sumNegatief: -spend, count: 2 }
}

function budgetPot(over: Partial<SpendLimitConfig>): SpendLimitWithReport {
  const config: SpendLimitConfig = {
    id: 'pot-1',
    name: 'Boodschappengrens',
    purpose: null,
    ruleType: 'budget',
    budgetId: 'b1',
    budgetName: 'Boodschappen',
    budgetArchived: false,
    includeChildBudgets: true,
    counterpartyKey: null,
    counterpartyLabel: null,
    limitAmount: 200,
    period: 'month',
    isActive: true,
    createdAt: '2025-01-01T00:00:00Z',
    ...over,
  }
  return {
    config,
    report: buildSpendLimitReport({
      rule: { ruleType: 'budget', limitAmount: config.limitAmount, period: 'month' },
      rows: [row('2026-07', 150), row('2026-06', 240)],
      now: NOW,
      windowPeriods: SPEND_LIMIT_WINDOW_BY_PERIOD.month,
    }),
    budgetSplit: [],
  }
}

function renderPane(limit: SpendLimitWithReport) {
  return render(
    <PrivacyProvider>
      <SpendLimitPerformancePane
        open
        onClose={() => {}}
        limit={limit}
        dailyExpenseRate={50}
      />
    </PrivacyProvider>,
  )
}

describe('SpendLimitPerformancePane — staat van het gekoppelde budget', () => {
  it('zwijgt zolang het budget gewoon actief is', () => {
    renderPane(budgetPot({}))

    expect(screen.queryByText(/gearchiveerd/i)).toBeNull()
    expect(screen.queryByText(/niet meer beschikbaar/i)).toBeNull()
  })

  it('meldt een GEARCHIVEERD budget als verwachting, niet als dataverlies', () => {
    renderPane(budgetPot({ budgetArchived: true }))

    const melding = screen.getByText(/gearchiveerd/i)
    expect(melding.textContent).toContain('Boodschappen')
    // Geen "kwijt"-taal: de historie klopt en dat staat er letterlijk.
    expect(melding.textContent).toMatch(/blijven kloppen/i)
    expect(screen.queryByText(/niet meer beschikbaar/i)).toBeNull()

    // En de doorgerekende historie staat er nog steeds: juli bleef binnen,
    // juni ging eroverheen — precies wat de motor over dezelfde rijen zegt.
    expect(screen.getByText(/juli 2026/i)).toBeTruthy()
  })

  // `ruleSentence` noemt een verdwenen budget óók "niet meer beschikbaar"; de
  // MELDING herken je aan haar eigen slotzin, niet aan die gedeelde woorden.
  const verdwenenMelding = () => screen.queryByText(/kunnen niet meer worden toegerekend/i)

  it('meldt een VERDWENEN budget als de kapotte toestand die het is', () => {
    renderPane(budgetPot({ budgetName: null, budgetArchived: false }))

    expect(verdwenenMelding()).not.toBeNull()
    expect(screen.queryByText(/gearchiveerd/i)).toBeNull()
  })

  it('laat "verdwenen" winnen van "gearchiveerd" — anders zegt gearchiveerd niets meer', () => {
    renderPane(budgetPot({ budgetName: null, budgetArchived: true }))

    expect(verdwenenMelding()).not.toBeNull()
    expect(screen.queryByText(/gearchiveerd/i)).toBeNull()
  })

  it('zegt niets over budgetten bij een tegenpartij-pot', () => {
    renderPane(
      budgetPot({
        ruleType: 'counterparty',
        budgetId: null,
        budgetName: null,
        budgetArchived: false,
        counterpartyKey: 'SHELL',
        counterpartyLabel: 'Shell',
      }),
    )

    expect(screen.queryByText(/kunnen niet meer worden toegerekend/i)).toBeNull()
    expect(screen.queryByText(/gearchiveerd/i)).toBeNull()
    expect(screen.getByText(/Uitgaven bij Shell/i)).toBeTruthy()
  })
})

// ── De uitsplitsing: fetch-moment en de grondslag van de vrijheidstijd ───────

const DAILY_RATE = 50

/** Een tegenpartij-pot; alleen díe soort heeft een on-demand uitsplitsing. */
function counterpartyPot(): SpendLimitWithReport {
  const config: SpendLimitConfig = {
    id: 'pot-1',
    name: 'Tankgrens',
    purpose: null,
    ruleType: 'counterparty',
    budgetId: null,
    budgetName: null,
    budgetArchived: false,
    includeChildBudgets: false,
    counterpartyKey: 'SHELL',
    counterpartyLabel: 'Shell',
    limitAmount: 200,
    period: 'month',
    isActive: true,
    createdAt: '2025-01-01T00:00:00Z',
  }
  return {
    config,
    report: buildSpendLimitReport({
      rule: { ruleType: 'counterparty', limitAmount: config.limitAmount, period: 'month' },
      rows: [row('2026-07', 150), row('2026-06', 240)],
      now: NOW,
      windowPeriods: SPEND_LIMIT_WINDOW_BY_PERIOD.month,
    }),
    budgetSplit: [],
  }
}

/** Het canonieke periodebedrag van juli, rechtstreeks uit de motor. */
function juli(limit: SpendLimitWithReport) {
  const outcome = limit.report.closedPeriods.find((o) => o.periodKey === '2026-07')
  if (!outcome) throw new Error('juli 2026 hoort in het venster te zitten')
  return outcome
}

/** De trefvlakken (grafiek + rooster) dragen dezelfde aria-labels; pak de eerste. */
function selectJuli() {
  fireEvent.click(screen.getAllByRole('button', { name: /juli 2026/i })[0])
}

let fetchMock: ReturnType<typeof vi.fn>
let breakdownBody: unknown

describe('SpendLimitPerformancePane — uitsplitsing per naam', () => {
  beforeEach(() => {
    breakdownBody = {
      periodKey: '2026-07',
      label: 'juli 2026',
      names: [{ name: 'SHELL 1234', matchedAmount: 200, count: 3 }],
      // De route klemt een negatief verschil op 0 (refund-only schrijfwijze buiten
      // de top-50): de namen tellen hier hóger op dan het canonieke periodebedrag.
      restMatchedAmount: 0,
      restCount: 0,
    }
    fetchMock = vi.fn(
      async () => ({ ok: true, json: async () => breakdownBody }) as unknown as Response,
    )
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('haalt de uitsplitsing UITSLUITEND op bij een periodeselectie (AC-B1-12)', async () => {
    renderPane(counterpartyPot())

    // Het standaardbeeld komt volledig uit de prop-bundel: nul extra fetches.
    expect(fetchMock).not.toHaveBeenCalled()
    expect(
      screen.getByText(/Kies een periode in de grafiek of het rooster/i),
    ).toBeTruthy()

    selectJuli()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      '/api/spend-limits/pot-1/breakdown?periode=2026-07',
    )

    // En na het antwoord blijft het bij die ene vlucht — géén her-fetch per render.
    expect(await screen.findByText('SHELL 1234')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('drukt de vrijheidstijd uit in het CANONIEKE periodebedrag, niet in de som van de regels', async () => {
    const limit = counterpartyPot()
    const canoniek = juli(limit).periodMatchedAmount

    renderPane(limit)
    selectJuli()
    await screen.findByText('SHELL 1234')

    // De motor zegt 150; de geklemde uitsplitsing telt op tot 200. Dat verschil is
    // precies het geval waarin een eigen optelling de gebruiker te véél
    // vrijheidstijd zou voorspiegelen.
    expect(canoniek).toBe(150)
    const namenSom =
      (breakdownBody as { names: { matchedAmount: number }[]; restMatchedAmount: number }).names.reduce(
        (s, n) => s + n.matchedAmount,
        0,
      ) + (breakdownBody as { restMatchedAmount: number }).restMatchedAmount
    expect(namenSom).toBeGreaterThan(canoniek)

    const verwacht = formatFreedomTimeString(calculateFreedomTime(canoniek, DAILY_RATE), 'long')
    const fout = formatFreedomTimeString(calculateFreedomTime(namenSom, DAILY_RATE), 'long')
    expect(verwacht).not.toBe(fout)

    expect(screen.getByText(`Samen is dat ≈ ${verwacht} vrijheid`)).toBeTruthy()
    expect(screen.queryByText(`Samen is dat ≈ ${fout} vrijheid`)).toBeNull()
  })
})
