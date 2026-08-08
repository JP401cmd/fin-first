/**
 * SpendLimitsSection — de INTEGRATIE op de transactiepagina.
 *
 * De sectie zelf rekent niets uit; wat hier bewaakt wordt is precies dat wat
 * mis kan gaan zodra losse brokken aan elkaar geknoopt worden:
 *
 *  1. de weergavenaam is REACTIEF (AC-B5-01) — een aliaswissel op /mijn/uiterlijk
 *     moet dit oppervlak direct flippen, zonder herlaad. Een `SPEND_LIMIT_COPY`-
 *     constante zou blijven staan en pas na een refresh meebewegen, en dat is
 *     precies het soort stille drift dat je niet ziet in een screenshot;
 *  2. de DEEPLINK opent de juiste pot (AC-B1-09), zwijgt bij een onbekend id
 *     (AC-B1-10) en ruimt zijn parameters op bij sluiten (AC-B1-11);
 *  3. de PERIODEKIEZER verandert de grens-eenheid én de reeks-context, en een
 *     wissel bij het bewerken waarschuwt daarvoor (AC-B4-09);
 *  4. de MATCH-PREVIEW debounced (AC-B3-06), toont "te kort" expliciet
 *     (AC-B3-03) en meldt overlap als observatie ZONDER bedrag (AC-B3-02).
 *
 * De pot-data komt niet met de hand verzonnen uit een fixture-object maar uit
 * `buildSpendLimitReport` — dezelfde motor die de loader gebruikt. Zo pint deze
 * suite de gerénderde waarden tegen echte motoruitvoer in plaats van tegen een
 * tweede, handgeschreven waarheid.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent, within } from '@testing-library/react'
import { PrivacyProvider } from '@/lib/hooks/use-privacy'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import {
  SpendLimitAliasProvider,
  useSpendLimitAlias,
} from '@/lib/hooks/use-spend-limit-alias'
import {
  buildSpendLimitReport,
  SPEND_LIMIT_WINDOW_BY_PERIOD,
  type SpendLimitAggregateRow,
} from '@/lib/spend-limits/engine'
import type { SpendLimitConfig, SpendLimitsSectionData, SpendLimitWithReport } from '@/lib/spend-limits/types'
import { SpendLimitsSection } from './spend-limits-section'

// ── Router-/URL-mock ────────────────────────────────────────────────────────

const routerReplace = vi.fn()
const routerRefresh = vi.fn()
let currentSearch = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, refresh: routerRefresh, push: vi.fn() }),
  useSearchParams: () => currentSearch,
  usePathname: () => '/overzicht/cashflow/transacties',
}))

// ── Fixtures uit de echte motor ─────────────────────────────────────────────

const NOW = new Date(2026, 7, 15) // 15 augustus 2026

function row(month: string, spend: number): SpendLimitAggregateRow {
  return { month, transactionType: 'expense', sumPositief: 0, sumNegatief: -spend, count: 2 }
}

function pot(over: Partial<SpendLimitConfig> = {}): SpendLimitWithReport {
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
      rule: { ruleType: config.ruleType, limitAmount: config.limitAmount, period: config.period },
      rows: [row('2026-07', 150), row('2026-06', 240), row('2026-05', 120)],
      now: NOW,
      windowPeriods: SPEND_LIMIT_WINDOW_BY_PERIOD[config.period],
    }),
    budgetSplit: [],
  }
}

function sectionData(over: Partial<SpendLimitsSectionData> = {}): SpendLimitsSectionData {
  return {
    limits: [pot()],
    budgetOptions: [
      { id: 'b1', name: 'Boodschappen', hasChildren: true, parentId: null },
      { id: 'b2', name: 'Supermarkt', hasChildren: false, parentId: 'b1' },
    ],
    dailyExpenseRate: 50,
    aggregateTruncationSuspected: false,
    ...over,
  }
}

/** Knop die de alias omzet zoals /mijn/uiterlijk dat doet — via dezelfde hook. */
function AliasSwitcher() {
  const { setAlias } = useSpendLimitAlias()
  return (
    <button type="button" onClick={() => setAlias('schaamtepot')}>
      wissel-alias
    </button>
  )
}

function renderSection(
  props: Partial<React.ComponentProps<typeof SpendLimitsSection>> = {},
  alias: 'grenzenpot' | 'schaamtepot' = 'grenzenpot',
) {
  return render(
    <SpendLimitAliasProvider initialAlias={alias}>
      <PrivacyProvider>
        <AliasSwitcher />
        <SpendLimitsSection data={sectionData()} {...props} />
      </PrivacyProvider>
    </SpendLimitAliasProvider>,
  )
}

// ── fetch-stub ──────────────────────────────────────────────────────────────

type FetchCall = { url: string; body: unknown }
let fetchCalls: FetchCall[] = []
let previewResponse: unknown = {
  status: 'ok',
  ruleType: 'budget',
  key: null,
  period: 'month',
  matchedNames: ['Boodschappen'],
  matchedTransactionCount: 6,
  matchedAmountByPeriod: [
    { periodKey: '2026-07', label: 'juli 2026', isOpen: false, matchedAmount: 150, matchedTransactionCount: 4 },
    { periodKey: '2026-08', label: 'augustus 2026', isOpen: true, matchedAmount: 40, matchedTransactionCount: 2 },
  ],
  overlappingLimits: [],
  aggregateTruncationSuspected: false,
}

beforeEach(() => {
  routerReplace.mockClear()
  routerRefresh.mockClear()
  currentSearch = new URLSearchParams()
  fetchCalls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
      if (String(url).includes('/api/spend-limits/preview')) {
        return { ok: true, json: async () => previewResponse } as unknown as Response
      }
      return { ok: true, json: async () => ({ options: [] }) } as unknown as Response
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const previewCalls = () => fetchCalls.filter((c) => c.url.includes('/preview'))

// ── 1. Alias-reactiviteit ───────────────────────────────────────────────────

describe('SpendLimitsSection — weergavenaam', () => {
  it('toont de default-naam en flipt LIVE mee met een aliaswissel (AC-B5-01)', () => {
    renderSection()

    expect(screen.getByRole('heading', { name: 'Grenzenpotten' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /nieuwe grenzenpot/i })).toBeTruthy()

    act(() => {
      screen.getByRole('button', { name: 'wissel-alias' }).click()
    })

    // Zelfde gemounte boom, andere naam — geen herlaad, geen remount.
    expect(screen.getByRole('heading', { name: 'Schaamtepotten' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /nieuwe schaamtepot/i })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Grenzenpotten' })).toBeNull()
  })

  it('seedt de sectie met de alias die de server meegaf', () => {
    renderSection({}, 'schaamtepot')
    expect(screen.getByRole('heading', { name: 'Schaamtepotten' })).toBeTruthy()
  })
})

// ── 1b. Getoonde cijfers == motoruitvoer ────────────────────────────────────

describe('SpendLimitsSection — de kaart toont wat de motor zegt', () => {
  it('pint reeks-context, richting en vrijheidstijd op de canonieke uitvoer', () => {
    const p = pot()
    const { streaks, currentPeriod, trend } = p.report

    render(
      <PrivacyProvider>
        <SpendLimitsSection data={sectionData({ limits: [p] })} />
      </PrivacyProvider>,
    )

    // Reeks-context: de teller komt per pot uit report.streaks, niet uit een
    // bundelbreed getal (dat bestaat sinds fase 5 bewust niet meer).
    const overschreden = screen.getByText(`Overschreden (van ${streaks.closedPeriodCount})`)
    expect(overschreden.nextElementSibling?.textContent).toBe(String(streaks.exceededPeriodCount))

    // Richting: rechtstreeks report.trend, geen lokaal gemiddelde.
    expect(trend.direction).not.toBe('unknown')
    expect(screen.getByText(/Je geeft (minder|meer|ongeveer evenveel)/)).toBeTruthy()

    // Vrijheidstijd: exact wat de canonieke helpers over dezelfde invoer zeggen.
    const verwacht = formatFreedomTimeString(
      calculateFreedomTime(currentPeriod.periodHeadroom, 50),
      'short',
    )
    expect(screen.getByText(`Die ruimte is ≈ ${verwacht} vrijheid`)).toBeTruthy()
  })
})

// ── 2. Deeplink ─────────────────────────────────────────────────────────────

describe('SpendLimitsSection — deeplink naar de prestatieweergave', () => {
  it('opent de pane voor de pot uit ?limit= (AC-B1-09)', () => {
    renderSection({ openLimitId: 'pot-1', openPeriodKey: '2026-07' })

    // De pane draagt de naam van de pot als titel; die staat er dus twee keer
    // (kaart + pane). Het onderscheidende bewijs is de pane-eigen kop.
    expect(screen.getByText('Verloop per periode')).toBeTruthy()
    expect(screen.getByText(/Verloop van Boodschappengrens geopend/i)).toBeTruthy()
  })

  it('blijft dicht en zwijgt bij een onbekend of gearchiveerd id (AC-B1-10)', () => {
    renderSection({ openLimitId: 'bestaat-niet' })

    expect(screen.queryByText('Verloop per periode')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('ruimt limit/periode op bij sluiten, met behoud van andere parameters (AC-B1-11)', () => {
    currentSearch = new URLSearchParams('limit=pot-1&periode=2026-07&periode_analyse=maand')
    renderSection({ openLimitId: 'pot-1', openPeriodKey: '2026-07' })

    fireEvent.click(screen.getAllByRole('button', { name: 'Sluiten' })[0])

    expect(routerReplace).toHaveBeenCalledTimes(1)
    const [url, opts] = routerReplace.mock.calls[0]
    expect(url).toBe('/overzicht/cashflow/transacties?periode_analyse=maand')
    expect(opts).toEqual({ scroll: false })
    expect(screen.queryByText('Verloop per periode')).toBeNull()
    // Een leeggemaakte live-regio kondigt niets aan; sluiten moet hoorbaar zijn.
    expect(screen.getByText('Verloop gesloten.')).toBeTruthy()
  })

  it('vervuilt de historie niet als er niets te strippen valt (kaart-ingang)', () => {
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: /Bekijk verloop van Boodschappengrens/i }))
    expect(screen.getByText('Verloop per periode')).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: 'Sluiten' })[0])
    expect(routerReplace).not.toHaveBeenCalled()
  })
})

// ── 3. Periodekiezer ────────────────────────────────────────────────────────

describe('SpendLimitsSection — periodekiezer', () => {
  it('verandert de grens-eenheid en de reeks-context (AC-B4-01/02)', () => {
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: /nieuwe grenzenpot/i }))

    expect(screen.getByText(/Grensbedrag per maand/i)).toBeTruthy()
    expect(screen.getByText(/laatste 12 afgesloten maanden/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Per kwartaal' }))

    expect(screen.getByText(/Grensbedrag per kwartaal/i)).toBeTruthy()
    expect(screen.getByText(/laatste 8 afgesloten kwartalen/i)).toBeTruthy()
  })

  it('waarschuwt bij een periodewissel op een bestaande pot (AC-B4-09)', () => {
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Bewerken' }))

    // Bewerken is altijd retroactief; dat stond er al.
    expect(screen.getByText(/geldt ook voor je afgesloten periodes/i)).toBeTruthy()
    // Zolang de periodesoort niet wijzigt, is er geen tweede zin.
    expect(screen.queryByText(/lengte van je reeks-context/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Per jaar' }))

    const extra = screen.getByText(/lengte van je reeks-context/i)
    expect(extra.textContent).toMatch(/van maand naar jaar/i)
    expect(extra.textContent).toMatch(/12 maanden naar 3 jaren/i)
  })
})

// ── 4. Match-preview ────────────────────────────────────────────────────────

describe('SpendLimitsSection — match-preview', () => {
  it('stuurt bij doortypen één request na de debounce (AC-B3-06)', () => {
    vi.useFakeTimers()
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: /nieuwe grenzenpot/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Een tegenpartij' }))

    const veld = screen.getByPlaceholderText('Shell')
    for (const waarde of ['S', 'SH', 'SHE', 'SHEL', 'SHELL']) {
      fireEvent.change(veld, { target: { value: waarde } })
      act(() => {
        vi.advanceTimersByTime(120)
      })
    }
    // Nog binnen de debounce van de laatste toetsaanslag: niets verstuurd.
    expect(previewCalls()).toHaveLength(0)

    act(() => {
      vi.advanceTimersByTime(400)
    })

    expect(previewCalls()).toHaveLength(1)
    expect(previewCalls()[0].body).toMatchObject({
      ruleType: 'counterparty',
      counterpartyLabel: 'SHELL',
      period: 'month',
      excludeLimitId: null,
    })
  })

  it('stuurt de pot die je bewerkt mee als zelf-uitsluiting', () => {
    vi.useFakeTimers()
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: 'Bewerken' }))
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(previewCalls()).toHaveLength(1)
    expect(previewCalls()[0].body).toMatchObject({
      ruleType: 'budget',
      budgetId: 'b1',
      includeChildBudgets: true,
      excludeLimitId: 'pot-1',
    })
  })

  it('toont "te kort om te matchen" expliciet i.p.v. een misleidend 0 (AC-B3-03)', async () => {
    previewResponse = {
      status: 'too_short',
      ruleType: 'counterparty',
      key: 's',
      period: 'month',
      matchedNames: [],
      matchedTransactionCount: 0,
      matchedAmountByPeriod: [],
      overlappingLimits: [],
      aggregateTruncationSuspected: false,
    }
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: /nieuwe grenzenpot/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Een tegenpartij' }))
    fireEvent.change(screen.getByPlaceholderText('Shell'), { target: { value: 's' } })

    expect(await screen.findByText(/te kort om op te matchen/i)).toBeTruthy()
    expect(screen.queryByText(/raakt deze regel nog niets/i)).toBeNull()
  })

  it('meldt overlap als OBSERVATIE, zonder een tweede bedrag (AC-B3-02/D38)', async () => {
    previewResponse = {
      status: 'ok',
      ruleType: 'budget',
      key: null,
      period: 'month',
      matchedNames: ['Boodschappen'],
      matchedTransactionCount: 6,
      matchedAmountByPeriod: [
        { periodKey: '2026-07', label: 'juli 2026', isOpen: false, matchedAmount: 150, matchedTransactionCount: 4 },
      ],
      overlappingLimits: [
        { id: 'pot-9', name: 'Supermarktgrens', ruleType: 'budget', isActive: true, reason: 'budget_descendant' },
      ],
      aggregateTruncationSuspected: false,
    }
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: 'Bewerken' }))

    // Wacht de debounce + de vlucht uit; de regio bestaat al vóór het antwoord.
    const observatie = await screen.findByText(/kunnen ook meetellen in/i)
    const blok = screen.getByRole('region', { name: 'Wat deze regel raakt' })
    expect(within(blok).getByText(/kunnen ook meetellen in/i)).toBe(observatie)
    expect(observatie.textContent).toContain('Supermarktgrens')
    expect(observatie.textContent).toContain('een subbudget hiervan')
    // Geen euro in de observatie: één waarheid per uitgave.
    expect(observatie.textContent).not.toMatch(/€/)
  })
})

// ── 5. Betrouwbaarheid ──────────────────────────────────────────────────────

describe('SpendLimitsSection — truncatie-kanarie', () => {
  it('zegt het erbij wanneer de sommen te laag kunnen zijn (AC-B1-15/AC-B4-07)', () => {
    render(
      <PrivacyProvider>
        <SpendLimitsSection data={sectionData({ aggregateTruncationSuspected: true })} />
      </PrivacyProvider>,
    )

    const melding = screen.getAllByRole('status')[0]
    expect(melding.textContent).toMatch(/kunnen te laag zijn/i)
  })

  it('zwijgt wanneer er niets is afgekapt', () => {
    render(
      <PrivacyProvider>
        <SpendLimitsSection data={sectionData()} />
      </PrivacyProvider>,
    )

    expect(screen.queryByText(/kunnen te laag zijn/i)).toBeNull()
  })
})
