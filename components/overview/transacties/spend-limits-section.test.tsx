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
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'
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
import {
  counterpartyMatchesKey,
  spendLimitCounterpartyKey,
} from '@/lib/spend-limits/counterparty-key'
import type {
  SpendLimitConfig,
  SpendLimitCounterpartyOption,
  SpendLimitsSectionData,
  SpendLimitWithReport,
} from '@/lib/spend-limits/types'
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
  // Bucketdatum, niet maandsleutel — een maand-bucket is de eerste van de maand.
  return {
    bucketStart: `${month}-01`,
    transactionType: 'expense',
    sumPositief: 0,
    sumNegatief: -spend,
    count: 2,
  }
}

function pot(over: Partial<SpendLimitConfig> = {}): SpendLimitWithReport {
  const config: SpendLimitConfig = {
    id: 'pot-1',
    name: 'Boodschappengrens',
    purpose: null,
    ruleType: 'budget',
    rules: [
      {
        id: 'r-1',
        budgets: [{ id: 'b1', name: 'Boodschappen', archived: false }],
        includeChildBudgets: true,
        counterparties: [],
      },
    ],
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
    ruleSplit: [],
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

/**
 * Standaard in VOLLEDIG. De periodekiezer is sinds TXN-3 modus-afhankelijk, en
 * `useDisplayMode()` valt zonder provider terug op 'simple' — dan zouden deze
 * suites stilzwijgend de gereduceerde variant meten in plaats van het volledige
 * gedrag dat ze beschrijven.
 */
function renderSection(
  props: Partial<React.ComponentProps<typeof SpendLimitsSection>> = {},
  alias: 'grenzenpot' | 'schaamtepot' = 'grenzenpot',
  mode: DisplayMode = 'full',
  data: SpendLimitsSectionData = sectionData(),
) {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <SpendLimitAliasProvider initialAlias={alias}>
        <PrivacyProvider>
          <AliasSwitcher />
          <SpendLimitsSection data={data} {...props} />
        </PrivacyProvider>
      </SpendLimitAliasProvider>
    </DisplayModeProvider>,
  )
}

// ── fetch-stub ──────────────────────────────────────────────────────────────

type FetchCall = { url: string; body: unknown }
let fetchCalls: FetchCall[] = []
let previewResponse: unknown = {
  status: 'ok',
  ruleType: 'budget',
  keys: [],
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

/** Wat /api/spend-limits/counterparties teruggeeft; per test in te stellen. */
let counterpartyOptions: SpendLimitCounterpartyOption[] = []

beforeEach(() => {
  routerReplace.mockClear()
  routerRefresh.mockClear()
  currentSearch = new URLSearchParams()
  fetchCalls = []
  counterpartyOptions = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
      if (String(url).includes('/api/spend-limits/preview')) {
        return { ok: true, json: async () => previewResponse } as unknown as Response
      }
      return { ok: true, json: async () => ({ options: counterpartyOptions }) } as unknown as Response
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

  // ── TXN-3: de keuze krimpt in Eenvoudig, de gegevens niet ────────────────
  it('laat in Eenvoudig alleen "Per maand" over (TXN-3)', () => {
    renderSection({}, 'grenzenpot', 'simple')
    fireEvent.click(screen.getByRole('button', { name: /nieuwe grenzenpot/i }))

    expect(screen.getByRole('button', { name: 'Per maand' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Per kwartaal' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Per jaar' })).toBeNull()
    // De eenheid van het grensbedrag blijft die van de gekozen periode.
    expect(screen.getByText(/Grensbedrag per maand/i)).toBeTruthy()
  })

  it('houdt in Eenvoudig de eigen periodesoort van een bestaande pot zichtbaar', () => {
    // Een pot die in Volledig op kwartaal staat, mag in Eenvoudig niet
    // stilzwijgend naar maand kantelen — dat zou bij de eerste keer opslaan de
    // grens-eenheid én de reeks-context van de gebruiker veranderen. De tab
    // blijft dus staan, náást maand; een rij zonder actieve tab kan zo niet
    // ontstaan.
    renderSection({}, 'grenzenpot', 'simple', sectionData({ limits: [pot({ period: 'quarter' })] }))
    fireEvent.click(screen.getByRole('button', { name: 'Bewerken' }))

    const kwartaal = screen.getByRole('button', { name: 'Per kwartaal' })
    expect(kwartaal.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Per maand' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Per jaar' })).toBeNull()
    expect(screen.getByText(/Grensbedrag per kwartaal/i)).toBeTruthy()
  })
})

// ── 4. Match-preview ────────────────────────────────────────────────────────

describe('SpendLimitsSection — match-preview', () => {
  it('stuurt bij doortypen één request na de debounce (AC-B3-06)', () => {
    vi.useFakeTimers()
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: /nieuwe grenzenpot/i }))

    // Een nieuwe pot start met het eerste budget voorgeselecteerd, dus er vertrekt
    // meteen één preview. Die laten we uitlopen zodat de telling hieronder alleen
    // over het TYPEN gaat.
    act(() => {
      vi.advanceTimersByTime(500)
    })
    const naOpenen = previewCalls().length
    expect(naOpenen).toBe(1)

    const veld = screen.getByPlaceholderText('Shell')
    for (const waarde of ['S', 'SH', 'SHE', 'SHEL', 'SHELL']) {
      fireEvent.change(veld, { target: { value: waarde } })
      act(() => {
        vi.advanceTimersByTime(120)
      })
    }

    // TYPEN alleen verandert de regel niet meer: het veld is invoer, de regel
    // draagt een LIJST. Er vertrekt dus geen enkele extra vlucht — ook niet na de
    // debounce.
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(previewCalls()).toHaveLength(naOpenen)

    // Pas bij bevestigen verhuist de zoekterm naar de regel, en dán telt hij mee.
    fireEvent.keyDown(veld, { key: 'Enter' })
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(previewCalls()).toHaveLength(naOpenen + 1)
    expect(previewCalls()[naOpenen].body).toMatchObject({
      budgetIds: ['b1'],
      counterpartyLabels: ['SHELL'],
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
      budgetIds: ['b1'],
      counterpartyLabels: [],
      includeChildBudgets: true,
      excludeLimitId: 'pot-1',
    })
  })

  it('toont "te kort om te matchen" expliciet i.p.v. een misleidend 0 (AC-B3-03)', async () => {
    previewResponse = {
      status: 'too_short',
      ruleType: 'counterparty',
      keys: [],
      period: 'month',
      matchedNames: [],
      matchedTransactionCount: 0,
      matchedAmountByPeriod: [],
      overlappingLimits: [],
      aggregateTruncationSuspected: false,
    }
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: /nieuwe grenzenpot/i }))
    fireEvent.change(screen.getByPlaceholderText('Shell'), { target: { value: 'sh' } })
    fireEvent.keyDown(screen.getByPlaceholderText('Shell'), { key: 'Enter' })

    expect(await screen.findByText(/te kort om op te matchen/i)).toBeTruthy()
    expect(screen.queryByText(/raakt deze regel nog niets/i)).toBeNull()
  })

  it('meldt overlap als OBSERVATIE, zonder een tweede bedrag (AC-B3-02/D38)', async () => {
    previewResponse = {
      status: 'ok',
      ruleType: 'budget',
      keys: [],
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

// ── 4b. Tegenpartij-suggesties ──────────────────────────────────────────────

/**
 * De suggestielijst is een OVERLAY, en overlays horen binnen het eigen
 * z-index-systeem te leven (ADR 0039). Een native <datalist> tekent de browser
 * zelf: op Android Chrome viel die lijst over het periode-blok van deze sheet
 * heen (testmelding 8a28dc). Deze suite pint dat er (a) geen datalist meer is,
 * (b) er een echte listbox in de DOM staat, en (c) dat gefilterd wordt met
 * exact dezelfde genormaliseerde match als de motor — niet met een tweede,
 * ruwere tekstvergelijking van de browser.
 */
describe('SpendLimitsSection — tegenpartij-suggesties', () => {
  const OPTIES: SpendLimitCounterpartyOption[] = [
    { key: 'SHELLEXPRESS1032', label: 'Shell Express 1032', totalSpentInWindow: 240, transactionCount: 6 },
    { key: 'SHELL', label: 'S.H.E.L.L. tankstation', totalSpentInWindow: 80, transactionCount: 2 },
    { key: 'JPSHODLHOLDINGBV', label: 'JPS hodl Holding B.V.', totalSpentInWindow: 500, transactionCount: 3 },
    {
      key: 'DEISOLATIESHOPBV',
      label: 'De Isolatieshop B.V. via Stichting Mollie Payments',
      totalSpentInWindow: 1200,
      transactionCount: 1,
    },
  ]

  async function openTegenpartijVeld() {
    counterpartyOptions = OPTIES
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: /nieuwe grenzenpot/i }))
    const veld = screen.getByPlaceholderText('Shell')
    fireEvent.focus(veld)
    return { veld, lijst: await screen.findByRole('listbox', { name: 'Tegenpartij-suggesties' }) }
  }

  it('rendert een eigen listbox in plaats van een native datalist', async () => {
    const { veld, lijst } = await openTegenpartijVeld()

    // De native dropdown is weg — die viel buiten het ShellOverlay-z-index-systeem.
    expect(document.querySelector('datalist')).toBeNull()
    expect(veld.getAttribute('list')).toBeNull()
    expect(veld.getAttribute('role')).toBe('combobox')
    expect(veld.getAttribute('aria-expanded')).toBe('true')

    // Leeg veld = de volledige lijst, precies het geval uit de melding.
    expect(within(lijst).getAllByRole('option').map((o) => o.textContent)).toEqual(
      OPTIES.map((o) => o.label),
    )
  })

  it('filtert met dezelfde genormaliseerde match als de motor', async () => {
    const { veld } = await openTegenpartijVeld()

    fireEvent.change(veld, { target: { value: 'shell' } })

    // Verwachting uit de canonieke helper, niet uit een handgeschreven lijstje:
    // wat de motor straks meetelt, is wat de suggestielijst nu toont.
    const key = spendLimitCounterpartyKey('shell')
    const verwacht = OPTIES.filter((o) => counterpartyMatchesKey(o.label, key)).map((o) => o.label)
    expect(verwacht).toEqual(['Shell Express 1032', 'S.H.E.L.L. tankstation'])

    const lijst = await screen.findByRole('listbox', { name: 'Tegenpartij-suggesties' })
    expect(within(lijst).getAllByRole('option').map((o) => o.textContent)).toEqual(verwacht)
  })

  it('voegt een keuze TOE aan de regel, maakt het veld leeg en sluit de lijst', async () => {
    const { veld } = await openTegenpartijVeld()

    fireEvent.click(screen.getByRole('option', { name: 'JPS hodl Holding B.V.' }))

    // Het veld is invoer, geen waarde: de keuze verhuist naar de regel en het
    // veld staat klaar voor de volgende tegenpartij.
    expect((veld as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('button', { name: 'JPS hodl Holding B.V. verwijderen' })).toBeTruthy()
    expect(screen.queryByRole('listbox', { name: 'Tegenpartij-suggesties' })).toBeNull()
    expect(veld.getAttribute('aria-expanded')).toBe('false')
  })

  it('ontdubbelt op de genormaliseerde sleutel, niet op de letterlijke tekst', async () => {
    const { veld } = await openTegenpartijVeld()

    fireEvent.change(veld, { target: { value: 'Shell' } })
    fireEvent.keyDown(veld, { key: 'Enter' })
    fireEvent.change(veld, { target: { value: 's.h.e.l.l.' } })
    fireEvent.keyDown(veld, { key: 'Enter' })

    // Beide teksten normaliseren naar SHELL en matchen dus exact dezelfde
    // transacties; twee chips zouden suggereren dat er iets extra's meetelt.
    expect(screen.getAllByRole('button', { name: /verwijderen$/ })).toHaveLength(1)
  })

  it('sluit met Escape zonder de sheet te sluiten', async () => {
    const { veld } = await openTegenpartijVeld()

    fireEvent.keyDown(veld, { key: 'Escape' })

    expect(screen.queryByRole('listbox', { name: 'Tegenpartij-suggesties' })).toBeNull()
    // De sheet zelf staat nog open: het formulier is er nog.
    expect(screen.getByText(/Over welke periode telt de grens\?/i)).toBeTruthy()
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
