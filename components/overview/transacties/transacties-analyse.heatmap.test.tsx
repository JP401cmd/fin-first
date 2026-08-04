/**
 * Bedrading van de heatmap-bron in TransactiesAnalyse.
 *
 * `lib/household/heatmap-window-derivation.test.ts` bewijst dat afleiden en een
 * eigen fetch identiek bucketen. Deze suite bewijst het andere half: dat de
 * component die afleiding ook echt gebruikt — dus dat er één download overblijft
 * wanneer het periode-venster de heatmap omvat, en twee wanneer het dat niet
 * doet. Zonder deze test zou de eerste groen blijven terwijl de component nog
 * vrolijk twee keer downloadt.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import {
  resolveHeatmapWindow,
  resolveFetchWindow,
  resolvePeriodWindow,
} from '@/lib/transaction-insights'
import { TransactiesAnalyse } from './transacties-analyse'

// Peildatum: 15 juni 2026. Heatmap-venster = 2025-06-01 t/m 2026-05-31.
const NOW = new Date(2026, 5, 15)
const HEATMAP = resolveHeatmapWindow(NOW)

const { loadPerspectiveTransactions, searchParams } = vi.hoisted(() => ({
  loadPerspectiveTransactions: vi.fn(),
  searchParams: { value: new URLSearchParams() },
}))

// ── Module-mocks ─────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => searchParams.value,
  usePathname: () => '/overzicht/cashflow/transacties',
}))

vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => ({ perspective: 'personal' as const }),
}))

// Chainable stub die elke tabel-query als lege set afhandelt; de transacties
// lopen niet hierlangs maar via de (gemockte) perspectief-loader.
vi.mock('@/lib/supabase/client', () => {
  const builder: Record<string, unknown> = {}
  // `or` staat er sinds de rekening-lijst óók de archief-rekening ophaalt
  // (`is_active.eq.true,is_archive_bucket.eq.true`). Ontbreekt een methode in
  // deze lijst, dan geeft de keten `undefined` terug en faalt de hele
  // laadronde stil — de component rendert dan nooit, en de test faalt op een
  // ontbrekend element in plaats van op de echte oorzaak.
  for (const method of ['select', 'order', 'eq', 'or', 'gte', 'lte', 'limit', 'range', 'in']) {
    builder[method] = () => builder
  }
  builder.single = () => Promise.resolve({ data: null, error: null })
  builder.then = (resolve: (v: { data: unknown[]; error: null }) => void) =>
    resolve({ data: [], error: null })
  return { createClient: () => ({ from: () => builder }) }
})

vi.mock('@/lib/own-accounts-ibans', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/own-accounts-ibans')>()),
  fetchOwnAccountIbans: () => Promise.resolve({ accounts: [], unreadable: 0 }),
}))

// Alleen `loadPerspectiveTransactions` wordt vervangen: `windowPerspectiveItems`
// is juist de functie waarvan we het gebruik willen aantonen, dus die blijft echt.
vi.mock('@/lib/household/perspective-loader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/household/perspective-loader')>()),
  loadPerspectiveTransactions,
}))

// Heatmap-stub: publiceert welke transactie-ID's hij binnenkreeg, zodat we de
// bron kunnen aflezen zonder op de rendering van het rooster te leunen.
vi.mock('./uitgaven-heatmap', () => ({
  UitgavenHeatmap: ({ transactions }: { transactions: Array<{ id: string }> }) => (
    <div data-testid="heatmap-ids">{transactions.map((t) => t.id).join(',')}</div>
  ),
}))

// ── Fixture ──────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

function row(id: string, date: string): Row {
  return {
    id,
    date,
    amount: -25,
    ownership: 'personal',
    user_id: 'u1',
    _provenance: 'eigen',
    _myShareFraction: 1,
  }
}

/** Twee rijen binnen het heatmap-venster, twee er net buiten. */
const ROWS: Row[] = [
  row('voor', '2025-05-20'),
  row('rand-start', HEATMAP.start),
  row('rand-eind', HEATMAP.end),
  row('na', '2026-06-10'),
]

/** Rij die ALLEEN uit een eigen heatmap-fetch kan komen. */
const OWN_FETCH_ROW = row('eigen-fetch', '2026-01-15')

function isHeatmapWindow(opts?: { since?: string; until?: string }) {
  return opts?.since === HEATMAP.start && opts?.until === HEATMAP.end
}

function renderPagina() {
  return render(
    <DisplayModeProvider initialMode="full">
      <TransactiesAnalyse />
    </DisplayModeProvider>,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  searchParams.value = new URLSearchParams()
  loadPerspectiveTransactions.mockReset()
  loadPerspectiveTransactions.mockImplementation(
    (_client: unknown, _perspective: unknown, opts?: { since?: string; until?: string }) =>
      Promise.resolve({
        perspective: 'personal',
        context: {},
        transactions: isHeatmapWindow(opts) ? [OWN_FETCH_ROW] : ROWS,
        partnerMonthlyIncome: null,
      }),
  )
})

afterEach(() => {
  vi.useRealTimers()
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('TransactiesAnalyse — bron van de heatmap', () => {
  it('huidige periode: één download, heatmap gesneden uit dezelfde set', async () => {
    renderPagina()
    await waitFor(() => expect(screen.getByTestId('heatmap-ids')).toBeInTheDocument())

    expect(loadPerspectiveTransactions).toHaveBeenCalledTimes(1)
    const expected = resolveFetchWindow(resolvePeriodWindow('30d', 0, NOW))
    expect(loadPerspectiveTransactions.mock.calls[0][2]).toEqual(expected)
    // Géén tweede aanroep op het heatmap-venster.
    expect(
      loadPerspectiveTransactions.mock.calls.some((c) => isHeatmapWindow(c[2])),
    ).toBe(false)

    // De heatmap kreeg exact het heatmap-venster uit de gedeelde set: de twee
    // randdagen wél, de twee buren erbuiten niet.
    expect(screen.getByTestId('heatmap-ids')).toHaveTextContent('rand-start,rand-eind')
  })

  it('terugnavigeren naar een dekkende periode toont geen afgeknotte heatmap', async () => {
    // Van april 2026 (dekt niet — het periode-einde ligt vóór het heatmap-einde)
    // naar mei 2026 (dekt exact). De dekkingsvlag klapt om zodra de gebruiker
    // klikt, maar de rijen in state zijn dan nog die van het smallere venster.
    // Wordt de heatmap uit die stále set gesneden, dan verdwijnen de recentste
    // maanden — als niveau-0-cellen, niet te onderscheiden van "niets uitgegeven".
    const DEKKEND = resolveFetchWindow(resolvePeriodWindow('month', -1, NOW))
    const VOLLEDIG = [row('rand-start', HEATMAP.start), row('midden', '2026-01-15'), row('rand-eind', HEATMAP.end)]
    // Wat het SMALLE venster oplevert: het heatmap-einde zit er niet in.
    const SMAL = [row('rand-start', HEATMAP.start), row('midden', '2026-01-15')]
    // Wat het DEKKENDE venster oplevert — inclusief een rij die er buiten valt
    // en dus weggesneden moet worden.
    const RUIM = [row('voor', '2025-05-20'), ...VOLLEDIG]

    let releaseDekkend: (() => void) | null = null
    loadPerspectiveTransactions.mockImplementation(
      (_c: unknown, _p: unknown, opts?: { since?: string; until?: string }) => {
        const res = (transactions: Row[]) => ({
          perspective: 'personal',
          context: {},
          transactions,
          partnerMonthlyIncome: null,
        })
        if (isHeatmapWindow(opts)) return Promise.resolve(res(VOLLEDIG))
        if (opts?.since === DEKKEND.since && opts?.until === DEKKEND.until) {
          // Vasthouden zodat we de tussentoestand kunnen observeren.
          return new Promise((resolve) => {
            releaseDekkend = () => resolve(res(RUIM))
          })
        }
        return Promise.resolve(res(SMAL))
      },
    )

    searchParams.value = new URLSearchParams('maand=2026-04')
    renderPagina()
    await waitFor(() =>
      expect(screen.getByTestId('heatmap-ids')).toHaveTextContent('rand-start,midden,rand-eind'),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Volgende periode' }))

    // Tussentoestand: de nieuwe, dekkende fetch is onderweg. De heatmap moet de
    // laatst bekende VOLLEDIGE set blijven tonen, niet de stále smalle set.
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTestId('heatmap-ids')).toHaveTextContent('rand-start,midden,rand-eind')

    // En na afloop komt hij uit de nieuwe set — met de buitenstaander eruit.
    await act(async () => {
      releaseDekkend?.()
      await Promise.resolve()
    })
    await waitFor(() =>
      expect(screen.getByTestId('heatmap-ids')).toHaveTextContent('rand-start,midden,rand-eind'),
    )
    expect(screen.getByTestId('heatmap-ids')).not.toHaveTextContent('voor')
  })

  it('ver terug gebladerd: eigen download, heatmap uit die eigen set', async () => {
    // ?maand=2026-03 → periode maart 2026; het periode-einde ligt vóór het
    // heatmap-einde, dus de gedeelde set dekt de heatmap niet meer.
    searchParams.value = new URLSearchParams('maand=2026-03')
    renderPagina()

    await waitFor(() => expect(loadPerspectiveTransactions).toHaveBeenCalledTimes(2))
    const vensters = loadPerspectiveTransactions.mock.calls.map((c) => c[2])
    expect(vensters).toContainEqual(resolveFetchWindow(resolvePeriodWindow('month', -3, NOW)))
    expect(vensters.some(isHeatmapWindow)).toBe(true)

    await waitFor(() =>
      expect(screen.getByTestId('heatmap-ids')).toHaveTextContent('eigen-fetch'),
    )
  })
})
