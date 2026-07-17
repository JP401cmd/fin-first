import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { createElement, useEffect, useRef, type ReactNode } from 'react'
import { NetWorthHistorySheet, type HistoryPoint } from './networth-history-sheet'

/**
 * Tests voor NetWorthHistorySheet — het netto-vermogen-verloop-modal.
 *
 * Focus: de bewerk-flow (Taak B). We mocken /api/snapshots/history (GET + POST)
 * en next/navigation's useRouter, en verifiëren dat:
 *  - de server-historie bij openen wordt opgehaald en getoond
 *  - de bewerk-modus de bestaande waardes voor-invult
 *  - opslaan alleen de gewijzigde maanden POST't en daarna re-GET + refresh doet
 */

// ── next/navigation mock ───────────────────────────────────────
const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
}))

// ── EntityBackfillEditor mock (per-entiteit-editor) ─────────────
// De echte editor doet eigen fetches/flow (los gebouwd + getest). Voor de
// integratie-test volstaat een dubbel dat (a) rendert, (b) een herkenbare
// footer-node via setFooter registreert en (c) onSaved aanroept bij klik.
vi.mock('./entity-backfill-editor', () => ({
  EntityBackfillEditor: ({
    onSaved,
    setFooter,
  }: {
    onClose: () => void
    onSaved: () => void
    setFooter: (node: ReactNode | null) => void
  }) => {
    // Spiegelt de echte editor (onSavedRef): een nieuwe onSaved-identiteit ná
    // een setFooter-re-render mag de footer-registratie NIET opnieuw triggeren,
    // anders ontstaat een render-lus (setFooter → re-render → nieuwe onSaved →
    // effect → setFooter …). Registreer daarom één keer op mount met deps
    // [setFooter] en roep de laatste onSaved via een ref aan.
    const onSavedRef = useRef(onSaved)
    onSavedRef.current = onSaved
    useEffect(() => {
      setFooter(
        createElement(
          'button',
          { type: 'button', onClick: () => onSavedRef.current() },
          'MOCK_ENTITY_SAVE',
        ),
      )
      return () => setFooter(null)
    }, [setFooter])
    return createElement('div', { 'data-testid': 'mock-entity-editor' }, 'MOCK_ENTITY_EDITOR')
  },
}))

const realFetch = global.fetch

/**
 * Mock fetch dat per route reageert: GET geeft `getEntries` terug, POST vangt
 * de body op in `postedBodies` en geeft `{ ok: true }`.
 */
function setupFetch(getEntries: { month: string; netWorth: number }[]) {
  const postedBodies: unknown[] = []
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      postedBodies.push(JSON.parse(String(init.body)))
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, count: 1 }),
      })
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ entries: getEntries }),
    })
  })
  global.fetch = fetchMock as unknown as typeof fetch
  return { fetchMock, postedBodies }
}

/**
 * Mock fetch dat ZOWEL /api/snapshots/history (GET history + POST) ALS
 * /api/snapshots/group-history (GET groepen) bedient. Voor de nieuwe
 * groepen-/entiteit-/herkomst-tests die op de tweede fetch leunen.
 */
function setupFetchDual(
  historyEntries: { month: string; netWorth: number }[],
  groupResponse: unknown,
) {
  const postedBodies: unknown[] = []
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      postedBodies.push(JSON.parse(String(init.body)))
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, count: 1 }) })
    }
    if (String(url).includes('group-history')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(groupResponse) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ entries: historyEntries }) })
  })
  global.fetch = fetchMock as unknown as typeof fetch
  return { fetchMock, postedBodies }
}

const baseHistory: HistoryPoint[] = [
  { month: '2026-04', value: 90000 },
  { month: '2026-05', value: 95000 },
]

// Server-historie + as-uitgelijnde groep-historie voor de nieuwe tests.
const dualHistoryEntries = [
  { month: '2026-03', netWorth: 80000 },
  { month: '2026-04', netWorth: 85000 },
  { month: '2026-05', netWorth: 95000 },
]

const groupResponseWithData = {
  months: ['2026-03', '2026-04', '2026-05'],
  assetGroups: {
    spaargeld: [10000, 11000, 12000],
    beleggingen: [] as number[],
    pensioen: [] as number[],
    vastgoed: [] as number[],
    overig: [] as number[],
  },
  debtGroups: { wonen: [] as number[], consumptief: [] as number[], overig: [] as number[] },
  rest: [0, 0, 0],
  net: [80000, 85000, 95000],
  hasData: true,
  // Maand '2026-04' (index 1) is handmatig vastgelegd.
  provenance: { net: ['measured', 'manual', 'measured'] },
}

beforeEach(() => {
  refreshMock.mockClear()
})
afterEach(() => {
  global.fetch = realFetch
  vi.restoreAllMocks()
})

describe('NetWorthHistorySheet', () => {
  it('toont het huidige netto vermogen en de kassabon-tabel', async () => {
    setupFetch([])
    render(
      <NetWorthHistorySheet
        open
        onClose={() => {}}
        history={baseHistory}
        currentNetWorth={100000}
      />,
    )
    await waitFor(() => expect(screen.getByText('Vandaag')).toBeTruthy())
    // Hoofdbedrag €100.000 zichtbaar.
    expect(screen.getAllByText(/100\.000/).length).toBeGreaterThan(0)
  })

  it('haalt server-historie op bij openen en gebruikt die in de tabel', async () => {
    setupFetch([
      { month: '2026-03', netWorth: 80000 },
      { month: '2026-04', netWorth: 85000 },
    ])
    render(
      <NetWorthHistorySheet
        open
        onClose={() => {}}
        history={baseHistory}
        currentNetWorth={100000}
      />,
    )
    // Server-waarde €80.000 verschijnt zodra de GET klaar is (niet in de prop).
    await waitFor(() => expect(screen.getAllByText(/80\.000/).length).toBeGreaterThan(0))
  })

  it('opent de bewerk-modus voor-ingevuld met bestaande waardes', async () => {
    setupFetch([{ month: '2026-04', netWorth: 85000 }])
    render(
      <NetWorthHistorySheet
        open
        onClose={() => {}}
        history={baseHistory}
        currentNetWorth={100000}
      />,
    )
    await waitFor(() => screen.getByText('Historie bijwerken'))
    fireEvent.click(screen.getByRole('button', { name: 'Historie bijwerken' }))

    // 24 invoervelden + voor-ingevulde bestaande waarde.
    const aprInput = await screen.findByLabelText(/Netto vermogen apr 2026/i)
    expect((aprInput as HTMLInputElement).value).toBe('85000')
  })

  it('POST alleen gewijzigde maanden en doet daarna re-GET + router.refresh', async () => {
    const { fetchMock, postedBodies } = setupFetch([
      { month: '2026-04', netWorth: 85000 },
    ])
    render(
      <NetWorthHistorySheet
        open
        onClose={() => {}}
        history={baseHistory}
        currentNetWorth={100000}
      />,
    )
    await waitFor(() => screen.getByText('Historie bijwerken'))
    fireEvent.click(screen.getByRole('button', { name: 'Historie bijwerken' }))

    const aprInput = await screen.findByLabelText(/Netto vermogen apr 2026/i)
    // Wijzig apr (85000 → 88000) en vul een nieuwe maand mrt in.
    fireEvent.change(aprInput, { target: { value: '88000' } })
    const marInput = screen.getByLabelText(/Netto vermogen mrt 2026/i)
    fireEvent.change(marInput, { target: { value: '70000' } })

    const getCallsBefore = fetchMock.mock.calls.filter(
      (c) => !(c[1] as RequestInit | undefined)?.method,
    ).length

    fireEvent.click(screen.getByRole('button', { name: /Opslaan/ }))

    await waitFor(() => expect(postedBodies.length).toBe(1))

    const body = postedBodies[0] as { entries: { month: string; netWorth: number }[] }
    // Alleen de twee gewijzigde maanden, niet alle 24.
    expect(body.entries).toHaveLength(2)
    const byMonth = Object.fromEntries(body.entries.map((e) => [e.month, e.netWorth]))
    expect(byMonth['2026-04']).toBe(88000)
    expect(byMonth['2026-03']).toBe(70000)

    // Re-GET na opslaan (extra GET-call) + router.refresh.
    await waitFor(() => {
      const getCallsAfter = fetchMock.mock.calls.filter(
        (c) => !(c[1] as RequestInit | undefined)?.method,
      ).length
      expect(getCallsAfter).toBeGreaterThan(getCallsBefore)
    })
    expect(refreshMock).toHaveBeenCalled()
  })

  it('toont een nette foutmelding wanneer opslaan faalt', async () => {
    // GET ok, POST faalt met 400.
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'Ongeldige maand' }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ entries: [] }),
      })
    })
    global.fetch = fetchMock as unknown as typeof fetch

    render(
      <NetWorthHistorySheet
        open
        onClose={() => {}}
        history={baseHistory}
        currentNetWorth={100000}
      />,
    )
    await waitFor(() => screen.getByText('Historie bijwerken'))
    fireEvent.click(screen.getByRole('button', { name: 'Historie bijwerken' }))

    const marInput = await screen.findByLabelText(/Netto vermogen mrt 2026/i)
    fireEvent.change(marInput, { target: { value: '70000' } })
    fireEvent.click(screen.getByRole('button', { name: /Opslaan/ }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/Ongeldige maand/)).toBeTruthy()
    // Bewerk-modus blijft open zodat de gebruiker kan corrigeren.
    expect(screen.getByText('Historie bijwerken')).toBeTruthy()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  // ── Uitbreiding B2c + B3 ─────────────────────────────────────

  it('schakelt naar de Groepen-chart bij data en terug naar Totaal (identiek)', async () => {
    setupFetchDual(dualHistoryEntries, groupResponseWithData)
    render(
      <NetWorthHistorySheet open onClose={() => {}} history={baseHistory} currentNetWorth={100000} />,
    )
    // De totaalweergave rendert direct (niet-blokkerend t.o.v. de groep-fetch).
    await waitFor(() => expect(screen.getByText('Vandaag')).toBeTruthy())
    expect(screen.getByLabelText(/verloop over de afgelopen maanden/i)).toBeTruthy()

    // "Groepen" wordt beschikbaar zodra de group-history-fetch klaar is.
    const groepen = await screen.findByRole('radio', { name: /bezittings/i })
    await waitFor(() => expect(groepen).not.toBeDisabled())
    fireEvent.click(groepen)

    // Butterfly-grafiek (NetworthGroupsChart) verschijnt; totaallijn weg.
    expect(screen.getByLabelText(/bezittingen boven de nullijn/i)).toBeTruthy()
    expect(screen.queryByLabelText(/verloop over de afgelopen maanden/i)).toBeNull()

    // Terug naar Totaal = pixel-identiek huidig gedrag.
    fireEvent.click(screen.getByRole('radio', { name: /Totaal netto vermogen/i }))
    expect(screen.queryByLabelText(/bezittingen boven de nullijn/i)).toBeNull()
    expect(screen.getByLabelText(/verloop over de afgelopen maanden/i)).toBeTruthy()
  })

  it('houdt de Groepen-toggle disabled + uitleg bij hasData=false', async () => {
    setupFetchDual(dualHistoryEntries, { hasData: false })
    render(
      <NetWorthHistorySheet open onClose={() => {}} history={baseHistory} currentNetWorth={100000} />,
    )
    const groepen = await screen.findByRole('radio', { name: /bezittings/i })
    await waitFor(() => expect(groepen).toBeDisabled())
    expect(await screen.findByText(/Nog geen historie per bezitting of schuld/i)).toBeTruthy()
  })

  it('houdt de Groepen-toggle disabled zonder crash bij een fetch-fout', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      }
      if (String(url).includes('group-history')) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'nope' }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ entries: dualHistoryEntries }) })
    })
    global.fetch = fetchMock as unknown as typeof fetch

    render(
      <NetWorthHistorySheet open onClose={() => {}} history={baseHistory} currentNetWorth={100000} />,
    )
    await waitFor(() => expect(screen.getByText('Vandaag')).toBeTruthy())
    const groepen = screen.getByRole('radio', { name: /bezittings/i })
    await waitFor(() => expect(groepen).toBeDisabled())
    // Fout is stil — geen uitleg-tekst, geen crash (Totaal is het vangnet).
    expect(screen.queryByText(/Nog geen historie per bezitting of schuld/i)).toBeNull()
    expect(screen.getByLabelText(/verloop over de afgelopen maanden/i)).toBeTruthy()
  })

  it('toont de vrijheidstijd-delta mét dailyExpense-prop', async () => {
    setupFetch([])
    render(
      <NetWorthHistorySheet
        open
        onClose={() => {}}
        history={baseHistory}
        currentNetWorth={100000}
        dailyExpense={100}
      />,
    )
    await waitFor(() => expect(screen.getByText('Vandaag')).toBeTruthy())
    // periodDelta = 100000 − 90000 = 10.000 ⇒ 100 dagen vrijheid.
    const freedom = screen.getByTestId('freedom-delta')
    expect(freedom.textContent).toMatch(/vrijheid/i)
  })

  it('toont geen vrijheidstijd-delta zonder dailyExpense en geen NaN bij 0', async () => {
    setupFetch([])
    const { rerender } = render(
      <NetWorthHistorySheet open onClose={() => {}} history={baseHistory} currentNetWorth={100000} />,
    )
    await waitFor(() => expect(screen.getByText('Vandaag')).toBeTruthy())
    expect(screen.queryByTestId('freedom-delta')).toBeNull()
    expect(screen.queryByText(/NaN|Infinity/)).toBeNull()

    // dailyExpense = 0 ⇒ nog steeds geen regel, geen NaN.
    rerender(
      <NetWorthHistorySheet
        open
        onClose={() => {}}
        history={baseHistory}
        currentNetWorth={100000}
        dailyExpense={0}
      />,
    )
    expect(screen.queryByTestId('freedom-delta')).toBeNull()
    expect(screen.queryByText(/NaN|Infinity/)).toBeNull()
  })

  it("toont het 'handmatig'-label op de juiste maandrij o.b.v. provenance.net", async () => {
    setupFetchDual(dualHistoryEntries, groupResponseWithData)
    render(
      <NetWorthHistorySheet open onClose={() => {}} history={baseHistory} currentNetWorth={100000} />,
    )
    // Verschijnt zodra zowel de server-historie als de groep-provenance er zijn.
    await screen.findByText('handmatig')
    const labels = screen.getAllByText('handmatig')
    expect(labels).toHaveLength(1)
    // Op de apr-2026-rij (index 1 = 'manual').
    expect(labels[0].closest('li')?.textContent).toMatch(/apr 2026/)
  })

  it('opent de per-entiteit-editor, plaatst de footer en her-fetcht bij onSaved', async () => {
    const { fetchMock } = setupFetchDual(dualHistoryEntries, groupResponseWithData)
    render(
      <NetWorthHistorySheet open onClose={() => {}} history={baseHistory} currentNetWorth={100000} />,
    )
    await waitFor(() => expect(screen.getByText('Vandaag')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /Per bezitting\/schuld bijwerken/i }))
    // De (gemockte) EntityBackfillEditor is nu gemount.
    expect(screen.getByTestId('mock-entity-editor')).toBeTruthy()
    // De setFooter-node beland in de sticky sheet-footer.
    const saveBtn = await screen.findByRole('button', { name: 'MOCK_ENTITY_SAVE' })

    const getCallsBefore = fetchMock.mock.calls.filter(
      (c) => !(c[1] as RequestInit | undefined)?.method,
    ).length

    fireEvent.click(saveBtn)

    // onSaved → terug naar weergave-modus + her-fetch (beide GET's) + refresh.
    await waitFor(() => expect(screen.queryByTestId('mock-entity-editor')).toBeNull())
    expect(screen.getByRole('button', { name: 'Historie bijwerken' })).toBeTruthy()
    await waitFor(() => {
      const getCallsAfter = fetchMock.mock.calls.filter(
        (c) => !(c[1] as RequestInit | undefined)?.method,
      ).length
      expect(getCallsAfter).toBeGreaterThan(getCallsBefore)
    })
    expect(refreshMock).toHaveBeenCalled()
  })
})
