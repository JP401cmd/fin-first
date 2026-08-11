/**
 * BulkFilters — de twee bedragvelden.
 *
 * Het bedragfilter bepaalt binnen welke verzameling iemand straks een
 * onomkeerbare actie bevestigt. Twee eigenschappen zijn daarom getoetst in
 * plaats van "er staat een veld":
 *
 * 1. **Wat je typt blijft staan.** Toen het veld controlled was op het *getal*
 *    uit het criterium, herschreef elke render de invoer: "12,50" werd
 *    12 → 125 → 1250. Een bedoelde ondergrens van € 12,50 selecteerde dan
 *    alles vanaf € 1.250.
 * 2. **Eén commit per bedoeling.** Elke aanslag committen betekende vier
 *    volledige-historie-query's én vier keer een gewiste selectie (F10). Het
 *    veld debounced nu net als de zoekterm (300ms).
 *
 * Plus de kleine leugen die daaronder zat: een ondergrens van € 0 is geen
 * grens — de query slaat 'm over, dus de filtercontext mag hem niet noemen.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import type { TransactionSearchCriteria } from '@/lib/transactions/bulk-contract'
import { BulkFilters } from './bulk-filters'
import { hasAnyCriteria } from './criteria'

function renderFilters(criteria: TransactionSearchCriteria = {}) {
  const onCriteriaChange = vi.fn()
  const utils = render(
    <BulkFilters
      criteria={criteria}
      onCriteriaChange={onCriteriaChange}
      qDraft=""
      onQDraftChange={vi.fn()}
      accounts={[{ id: 'acc-1', name: 'Betaalrekening' }]}
      budgetEntries={[]}
      labels={{ accountName: () => 'Betaalrekening', budgetName: () => 'Boodschappen' }}
      total={120}
      busy={false}
    />,
  )
  return { onCriteriaChange, ...utils }
}

/** Laat de 300ms-debounce aflopen binnen een act()-venster. */
function flushDebounce() {
  act(() => {
    vi.advanceTimersByTime(350)
  })
}

describe('BulkFilters — bedragvelden', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('houdt getypte decimalen vast: "12,50" blijft "12,50" en commit 12,5', () => {
    const { onCriteriaChange } = renderFilters()
    const min = screen.getByLabelText('Bedrag vanaf') as HTMLInputElement

    // Teken voor teken — precies het patroon waarop het veld eerder omsloeg.
    for (const value of ['1', '12', '12,', '12,5', '12,50']) {
      fireEvent.change(min, { target: { value } })
    }
    expect(min.value).toBe('12,50')

    flushDebounce()
    expect(onCriteriaChange).toHaveBeenCalledTimes(1)
    expect(onCriteriaChange.mock.calls[0][0]).toMatchObject({ amountMin: 12.5 })
  })

  it('commit één keer per bedoeling, niet per aanslag', () => {
    const { onCriteriaChange } = renderFilters()
    const min = screen.getByLabelText('Bedrag vanaf')

    for (const value of ['5', '50', '500']) {
      fireEvent.change(min, { target: { value } })
    }
    // Nog binnen het debounce-venster: geen enkele query, geen selectieverlies.
    expect(onCriteriaChange).not.toHaveBeenCalled()

    flushDebounce()
    expect(onCriteriaChange).toHaveBeenCalledTimes(1)
    expect(onCriteriaChange.mock.calls[0][0]).toMatchObject({ amountMin: 500 })
  })

  it('leest "1.250" als duizendtal en "12.50" als decimaal', () => {
    const { onCriteriaChange } = renderFilters()
    fireEvent.change(screen.getByLabelText('Bedrag vanaf'), { target: { value: '1.250' } })
    flushDebounce()
    expect(onCriteriaChange.mock.calls[0][0]).toMatchObject({ amountMin: 1250 })

    onCriteriaChange.mockClear()
    fireEvent.change(screen.getByLabelText('Bedrag vanaf'), { target: { value: '12.50' } })
    flushDebounce()
    expect(onCriteriaChange.mock.calls[0][0]).toMatchObject({ amountMin: 12.5 })
  })

  it('commit beide grenzen samen — de tweede gooit de eerste niet weg', () => {
    const { onCriteriaChange } = renderFilters()
    fireEvent.change(screen.getByLabelText('Bedrag vanaf'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('tot'), { target: { value: '100' } })
    flushDebounce()

    expect(onCriteriaChange).toHaveBeenCalledTimes(1)
    expect(onCriteriaChange.mock.calls[0][0]).toMatchObject({ amountMin: 10, amountMax: 100 })
  })

  it('een ondergrens van 0 is geen filter — de query slaat hem óók over', () => {
    const { onCriteriaChange } = renderFilters()
    fireEvent.change(screen.getByLabelText('Bedrag vanaf'), { target: { value: '0' } })
    flushDebounce()

    // Geen commit: het criterium verandert niet, dus er is geen nieuwe zoekopdracht
    // en de filtercontext op de bevestiging noemt geen "Bedrag vanaf € 0".
    expect(onCriteriaChange).not.toHaveBeenCalled()
    expect(hasAnyCriteria({ amountMin: undefined })).toBe(false)
  })

  it('volgt een criterium-reset van buiten ("Alles wissen") in de invoer', () => {
    const { rerender } = renderFilters({ amountMin: 250 })
    const min = screen.getByLabelText('Bedrag vanaf') as HTMLInputElement
    expect(min.value).toBe('250')

    rerender(
      <BulkFilters
        criteria={{}}
        onCriteriaChange={vi.fn()}
        qDraft=""
        onQDraftChange={vi.fn()}
        accounts={[]}
        budgetEntries={[]}
        labels={{ accountName: () => undefined, budgetName: () => undefined }}
        total={0}
        busy={false}
      />,
    )
    expect((screen.getByLabelText('Bedrag vanaf') as HTMLInputElement).value).toBe('')
  })
})
