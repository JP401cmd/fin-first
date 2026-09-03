/**
 * Regressietest voor UAT-bug WF-SCHULD-06-bug2 (live-run 2-9-2026).
 *
 * Repro: open het bewerk-formulier van een schuld, typ `-1` in "Rente (% per
 * jaar)" en kijk naar de Opslaan-knop. Vóór de fix bleef die knop ingeschakeld
 * (`disabled` hing alleen af van saving/naam/saldo) en zag de gebruiker de fout
 * pas ná een klik — de negatief-checks zaten uitsluitend ín `handleSave`.
 * Ná de fix blokkeert de knop proactief en staat de foutmelding er meteen,
 * net als in de QuickAdd-wizard (`step-details.tsx`: currentErrors → canSubmit).
 *
 * Dekt beide CTA-paden: de standalone-knop in dit formulier én `canSave` dat
 * via `onActionsChange` naar de pane-footer gaat (debt-pane.tsx).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DebtForm, findNegativeDebtValueError, type DebtEditActionsState } from './debt-form'
import type { Debt } from '@/lib/debt-data'

// De form-component importeert de supabase-browserclient op module-niveau; die
// wordt pas bij een daadwerkelijke save aangeroepen. Voor deze knop-/state-
// asserties mocken we 'm weg zodat er geen echte client geïnitialiseerd wordt.
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
  name: 'Betalingsregeling zonnepanelen',
  debt_type: 'personal_loan',
  original_amount: 6000,
  current_balance: 4200,
  interest_rate: 3.5,
  minimum_payment: 0,
  monthly_payment: 0,
  start_date: '2025-01-01',
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
  repayment_type: null,
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
  // useHouseholdStatus doet een fetch naar /api/household/status.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
})

describe('findNegativeDebtValueError', () => {
  const leeg = {
    currentBalance: '',
    originalAmount: '',
    interestRate: '',
    minimumPayment: '',
    monthlyPayment: '',
  }

  it('accepteert lege en positieve waarden', () => {
    expect(findNegativeDebtValueError(leeg)).toBeNull()
    expect(findNegativeDebtValueError({ ...leeg, currentBalance: '4200', interestRate: '0' })).toBeNull()
  })

  it('wijst elke negatieve waarde af met een veldspecifieke melding', () => {
    expect(findNegativeDebtValueError({ ...leeg, currentBalance: '-1' })).toMatch(/Huidig saldo/)
    expect(findNegativeDebtValueError({ ...leeg, originalAmount: '-1' })).toMatch(/Oorspronkelijk bedrag/)
    expect(findNegativeDebtValueError({ ...leeg, interestRate: '-1' })).toMatch(/Rentepercentage/)
    expect(findNegativeDebtValueError({ ...leeg, minimumPayment: '-1' })).toMatch(/Minimale betaling/)
    expect(findNegativeDebtValueError({ ...leeg, monthlyPayment: '-1' })).toMatch(/Werkelijke betaling/)
  })
})

describe('DebtForm — negatieve invoer blokkeert de CTA proactief', () => {
  it('zet de Opslaan-knop op disabled én toont de fout zodra rente negatief is', () => {
    render(<DebtForm debt={debt} userAssets={[]} onClose={() => {}} onSaved={() => {}} />)

    const opslaan = screen.getByTestId('debt-save')
    expect(opslaan).toBeEnabled()
    expect(screen.queryByTestId('debt-validation-error')).toBeNull()

    fireEvent.change(screen.getByTestId('debt-interest-rate'), { target: { value: '-1' } })

    // Kern van de repro: de knop blokkeert vóór de klik, niet erna.
    expect(opslaan).toBeDisabled()
    expect(screen.getByTestId('debt-validation-error')).toHaveTextContent(/Rentepercentage mag niet negatief zijn/)

    // Herstel: terug naar een geldige waarde deblokkeert weer.
    fireEvent.change(screen.getByTestId('debt-interest-rate'), { target: { value: '3.5' } })
    expect(opslaan).toBeEnabled()
    expect(screen.queryByTestId('debt-validation-error')).toBeNull()
  })

  it('blokkeert ook op een negatief huidig saldo', () => {
    render(<DebtForm debt={debt} userAssets={[]} onClose={() => {}} onSaved={() => {}} />)

    fireEvent.change(screen.getByTestId('debt-current-balance'), { target: { value: '-500' } })

    expect(screen.getByTestId('debt-save')).toBeDisabled()
    expect(screen.getByTestId('debt-validation-error')).toHaveTextContent(/Huidig saldo mag niet negatief zijn/)
  })

  it('publiceert canSave=false naar de pane-footer (embedded-mode)', () => {
    const states: DebtEditActionsState[] = []
    render(
      <DebtForm
        debt={debt}
        userAssets={[]}
        onClose={() => {}}
        onSaved={() => {}}
        embedded
        onActionsChange={(s) => { states.push(s) }}
      />,
    )

    expect(states.at(-1)?.canSave).toBe(true)

    fireEvent.change(screen.getByTestId('debt-interest-rate'), { target: { value: '-1' } })

    expect(states.at(-1)?.canSave).toBe(false)
  })

  it('schrijft niets weg als de save-handler tóch wordt aangeroepen', () => {
    const states: DebtEditActionsState[] = []
    render(
      <DebtForm
        debt={debt}
        userAssets={[]}
        onClose={() => {}}
        onSaved={() => {}}
        embedded
        onActionsChange={(s) => { states.push(s) }}
      />,
    )

    fireEvent.change(screen.getByTestId('debt-interest-rate'), { target: { value: '-1' } })
    states.at(-1)?.save()

    expect(update).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })
})
