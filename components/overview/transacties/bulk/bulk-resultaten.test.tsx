/**
 * BulkResultaten — de laag waar een selectie ontstaat, en dus de laag waar hij
 * over de verkeerde rijen kan gaan.
 *
 * Drie eigenschappen staan hier vast:
 *
 * 1. **Niet selecteren tijdens het laden.** Bij een filterwissel blijven de
 *    oude rijen staan terwijl de filtercontext het nieuwe criterium al toont.
 *    Vinkt iemand in dat venster aan, dan schrijft de bevestiging straks
 *    "43 transacties binnen: Bedrag vanaf € 500" over rijen die onder het
 *    vórige criterium zijn gekozen. Kop, rij én "alle N" zijn daarom disabled.
 * 2. **Eén getal per selectie.** De "alles staat geselecteerd"-banner leest
 *    dezelfde teller als de bevestiging (het bevroren manifest, ADR 0104), niet
 *    het losse zoek-totaal.
 * 3. **Geen shift zonder shift.** Een `change` zonder voorafgaande
 *    pointer-/toetsaanslag (assistieve technologie, programmatische klik) mag
 *    nooit de shift-stand van een eerdere klik hergebruiken.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { TransactionSearchRow } from '@/lib/transactions/bulk-contract'
import { BulkResultaten, type BulkResultatenProps } from './bulk-resultaten'
import { EMPTY_SELECTION, selectAllMatching } from './selection-model'

const ROWS: TransactionSearchRow[] = [
  {
    id: 'tx-1',
    date: '2026-02-14',
    description: 'Albert Heijn',
    counterparty_name: 'Albert Heijn',
    amount: -42.5,
    budget_id: null,
    account_id: 'acc-1',
    is_split: false,
    transaction_type: null,
    is_bank_linked: false,
  },
  {
    id: 'tx-2',
    date: '2026-02-15',
    description: 'Salaris',
    counterparty_name: 'Werkgever',
    amount: 2400,
    budget_id: null,
    account_id: 'acc-1',
    is_split: false,
    transaction_type: null,
    is_bank_linked: false,
  },
]

function renderResultaten(overrides: Partial<BulkResultatenProps> = {}) {
  const onToggleRow = vi.fn()
  const onTogglePage = vi.fn()
  const onSelectAllMatching = vi.fn()
  render(
    <BulkResultaten
      rows={ROWS}
      total={2}
      page={1}
      pageSize={50}
      loading={false}
      error={null}
      selection={EMPTY_SELECTION}
      selectedCount={0}
      selectionNotice={null}
      budgetName={() => undefined}
      accountName={() => 'Betaalrekening'}
      onToggleRow={onToggleRow}
      onTogglePage={onTogglePage}
      onSelectAllMatching={onSelectAllMatching}
      onClearSelection={vi.fn()}
      onPageChange={vi.fn()}
      manifestBusy={false}
      {...overrides}
    />,
  )
  return { onToggleRow, onTogglePage, onSelectAllMatching }
}

describe('BulkResultaten — selecteren kan niet tijdens het laden', () => {
  afterEach(cleanup)

  it('schakelt kop- én rijcheckboxes uit zolang een nieuwe zoekopdracht loopt', () => {
    renderResultaten({ loading: true })
    expect(screen.getByLabelText(/Selecteer de 2 transacties op deze pagina/)).toBeDisabled()
    expect(screen.getByLabelText(/Selecteer Albert Heijn/)).toBeDisabled()
  })

  it('laat ze los zodra de rijen bij het criterium horen', () => {
    renderResultaten({ loading: false })
    expect(screen.getByLabelText(/Selecteer de 2 transacties op deze pagina/)).not.toBeDisabled()
    expect(screen.getByLabelText(/Selecteer Albert Heijn/)).not.toBeDisabled()
  })

  it('schakelt ook "Selecteer alle N" uit — dat is hetzelfde venster met een oud totaal', () => {
    renderResultaten({
      loading: true,
      total: 400,
      selection: { ids: new Set(['tx-1', 'tx-2']), allMatching: false, anchorId: 'tx-2' },
      selectedCount: 2,
    })
    expect(
      screen.getByRole('button', { name: /Selecteer alle 400 gevonden transacties/ }),
    ).toBeDisabled()
  })
})

describe('BulkResultaten — één getal per selectie', () => {
  afterEach(cleanup)

  it('de "alles geselecteerd"-banner volgt de teller (manifest), niet het zoek-totaal', () => {
    // Zoekopdracht meldt inmiddels 402 treffers; het bevroren manifest telt 400.
    renderResultaten({
      total: 402,
      selection: selectAllMatching(),
      selectedCount: 400,
    })
    expect(screen.getByText(/Alle 400 gevonden transacties staan geselecteerd/)).toBeTruthy()
    expect(screen.queryByText(/Alle 402 gevonden transacties staan geselecteerd/)).toBeNull()
  })
})

describe('BulkResultaten — geen shift zonder shift', () => {
  afterEach(cleanup)

  it('hergebruikt de shift-stand van een eerdere klik niet', () => {
    const { onToggleRow } = renderResultaten()
    const eerste = screen.getByLabelText(/Selecteer Albert Heijn/)
    const tweede = screen.getByLabelText(/Selecteer Salaris/)

    fireEvent.mouseDown(eerste, { shiftKey: true })
    fireEvent.click(eerste)
    expect(onToggleRow).toHaveBeenLastCalledWith('tx-1', true)

    // Tweede rij: change zonder voorafgaand mousedown/keydown met shift.
    fireEvent.click(tweede)
    expect(onToggleRow).toHaveBeenLastCalledWith('tx-2', false)
  })
})
