/**
 * B-067 (voorstel B): "Min. betaling" schuift mee met het Maandbedrag zolang
 * de twee gelijk staan.
 *
 * Onboarding en quick-add zetten `minimum_payment` gelijk aan `monthly_payment`.
 * Wie daarna alleen het Maandbedrag aanpaste, liet het oude minimum staan; de
 * strategievergelijking op /overzicht/schulden rekende daarmee door en "bleef
 * heel snel aflossen". De motor capt dat inmiddels (`simulatePayoff`,
 * `lib/debt-maandbedrag-bron.test.ts`); dit formulier voorkomt de verouderde
 * rij zelf.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DebtForm, syncedMinimumPayment } from './debt-form'
import type { Debt } from '@/lib/debt-data'

const insert = vi.fn()
const update = vi.fn(() => ({ eq: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn(() => ({ insert, update, upsert: vi.fn() })),
  }),
}))

const debt: Debt = {
  id: 'debt-1',
  user_id: 'user-1',
  name: 'Hypotheek',
  debt_type: 'mortgage',
  original_amount: 150000,
  current_balance: 130000,
  interest_rate: 12,
  minimum_payment: 3000,
  monthly_payment: 3000,
  start_date: '2020-01-01',
  end_date: null,
  creditor: null,
  notes: null,
  is_active: true,
  sort_order: 0,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  subtype: null,
  is_tax_deductible: null,
  fixed_rate_end_date: null,
  nhg: null,
  linked_asset_id: null,
  credit_limit: null,
  repayment_type: 'annuiteit',
  draagkrachtmeting_date: null,
  tax_year: null,
  has_payment_plan: false,
  has_written_agreement: false,
  ownership: 'personal',
  household_id: null,
  partner_split_pct: null,
  net_worth_inclusion_pct: 100,
  include_aflossing_in_savings: false,
  custom_aflossing_amount: null,
  has_hypotheekplanner_tracking: false,
}

beforeEach(() => {
  insert.mockClear()
  update.mockClear()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
})

describe('syncedMinimumPayment', () => {
  it('schuift mee zolang minimum en maandbedrag gelijk staan', () => {
    expect(syncedMinimumPayment('3000', '3000', '1352')).toBe('1352')
    expect(syncedMinimumPayment('3000', '3000.0', '1352')).toBe('1352')
  })

  it('laat een bewust ander minimum staan', () => {
    expect(syncedMinimumPayment('300', '50', '400')).toBe('50')
  })

  it('laat een leeg veld leeg (= onbekend, de motor valt terug op het maandbedrag)', () => {
    expect(syncedMinimumPayment('', '', '400')).toBe('')
    expect(syncedMinimumPayment('300', '  ', '400')).toBe('  ')
  })
})

describe('DebtForm — Min. betaling volgt het Maandbedrag', () => {
  it('bewerken van het maandbedrag neemt een gelijkstaand minimum mee', () => {
    render(<DebtForm debt={debt} userAssets={[]} onClose={() => {}} onSaved={() => {}} />)

    const minimum = screen.getByTestId('debt-minimum-payment') as HTMLInputElement
    const maandbedrag = screen.getByTestId('debt-monthly-payment') as HTMLInputElement
    expect(minimum.value).toBe('3000')

    fireEvent.change(maandbedrag, { target: { value: '1352' } })
    expect(maandbedrag.value).toBe('1352')
    expect(minimum.value).toBe('1352')
  })

  it('een afwijkend minimum blijft staan bij een nieuw maandbedrag', () => {
    render(<DebtForm debt={{ ...debt, minimum_payment: 500 }} userAssets={[]} onClose={() => {}} onSaved={() => {}} />)

    fireEvent.change(screen.getByTestId('debt-monthly-payment'), { target: { value: '1352' } })
    expect((screen.getByTestId('debt-minimum-payment') as HTMLInputElement).value).toBe('500')
  })
})
