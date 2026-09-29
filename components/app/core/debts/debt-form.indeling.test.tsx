/**
 * De herindeling van het schuldformulier: minder velden, zelfde data.
 *
 * Regressie-eis: een veld dat het formulier niet meer toont, houdt bij het
 * opslaan zijn opgeslagen waarde. Verbergen is geen wissen.
 *
 * Given een bestaande schuld met waarden in velden die niet meer getoond worden
 * When de gebruiker iets anders wijzigt en opslaat
 * Then staan die waarden ongewijzigd in de weggeschreven rij.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DebtForm } from './debt-form'
import type { Debt } from '@/lib/debt-data'

let lastRow: Record<string, unknown> = {}
const maybeSingle = vi.fn(async () => ({ data: { id: 'debt-1' }, error: null }))
const update = vi.fn((row: Record<string, unknown>) => {
  lastRow = row
  return { eq: () => ({ eq: () => ({ select: () => ({ maybeSingle }) }) }) }
})
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn(() => ({ update, insert: vi.fn(), upsert: vi.fn(async () => ({ error: null })) })),
  }),
}))

const base: Debt = {
  id: 'debt-1',
  user_id: 'user-1',
  name: 'Hypotheek',
  debt_type: 'mortgage',
  original_amount: 300000,
  current_balance: 250000,
  interest_rate: 3,
  minimum_payment: 1200,
  monthly_payment: 1200,
  start_date: '2020-01-01',
  end_date: null,
  creditor: 'ING',
  notes: null,
  is_active: true,
  sort_order: 0,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  subtype: null,
  is_tax_deductible: true,
  fixed_rate_end_date: '2030-01-01',
  nhg: true,
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
  include_aflossing_in_savings: true,
  custom_aflossing_amount: null,
  has_hypotheekplanner_tracking: true,
}

function renderForm(debt: Debt) {
  return render(<DebtForm debt={debt} userAssets={[]} onClose={() => {}} onSaved={() => {}} />)
}

async function saveAndGetRow(): Promise<Record<string, unknown>> {
  fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
  await waitFor(() => expect(update).toHaveBeenCalled())
  return lastRow
}

beforeEach(() => {
  lastRow = {}
  update.mockClear()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
})

describe('DebtForm — hypotheek', () => {
  it('toont geen NHG en geen los subtype meer', () => {
    renderForm(base)

    expect(screen.queryByText('NHG')).toBeNull()
    expect(screen.queryByText('Subtype')).toBeNull()
    expect(screen.getByText('Aflossingstype')).toBeTruthy()
    expect(screen.getByText('Rentevast tot')).toBeTruthy()
  })

  it('bewaart NHG, renteaftrek, rentevast en de planner-vlag bij opslaan', async () => {
    renderForm(base)
    fireEvent.change(screen.getByTestId('debt-interest-rate'), { target: { value: '3.5' } })

    const row = await saveAndGetRow()

    expect(row.interest_rate).toBe(3.5)
    expect(row.nhg).toBe(true)
    expect(row.is_tax_deductible).toBe(true)
    expect(row.fixed_rate_end_date).toBe('2030-01-01')
    expect(row.has_hypotheekplanner_tracking).toBe(true)
    expect(row.include_aflossing_in_savings).toBe(true)
    expect(row.creditor).toBe('ING')
    expect(row.original_amount).toBe(300000)
    expect(row.start_date).toBe('2020-01-01')
  })

  it('laat het subtype de aflosvorm volgen', async () => {
    renderForm({ ...base, subtype: 'annuiteit', repayment_type: 'lineair' })

    const row = await saveAndGetRow()

    expect(row.repayment_type).toBe('lineair')
    expect(row.subtype).toBe('lineair')
  })

  it('laat een spaarhypotheek staan', async () => {
    renderForm({ ...base, subtype: 'spaarhypotheek', repayment_type: 'aflossingsvrij' })

    const row = await saveAndGetRow()

    expect(row.subtype).toBe('spaarhypotheek')
  })

  it('houdt een gelijkstaand minimum in de pas met een nieuw maandbedrag, ook nu het veld verborgen is', async () => {
    renderForm(base)
    expect(screen.queryByTestId('debt-minimum-payment')).toBeNull()
    fireEvent.change(screen.getByTestId('debt-monthly-payment'), { target: { value: '1500' } })

    const row = await saveAndGetRow()

    expect(row.monthly_payment).toBe(1500)
    expect(row.minimum_payment).toBe(1500)
  })
})

describe('DebtForm — overige types', () => {
  it('studielening: bewaart de draagkrachtmeting zonder het veld te tonen', async () => {
    renderForm({
      ...base,
      debt_type: 'student_loan',
      name: 'DUO',
      repayment_type: null,
      is_tax_deductible: null,
      nhg: null,
      fixed_rate_end_date: null,
      has_hypotheekplanner_tracking: false,
      subtype: 'nieuw_stelsel',
      draagkrachtmeting_date: '2027-01-01',
    })
    expect(screen.queryByText('Draagkrachtmeting')).toBeNull()

    const row = await saveAndGetRow()

    expect(row.draagkrachtmeting_date).toBe('2027-01-01')
    expect(row.subtype).toBe('nieuw_stelsel')
  })

  it('familielening: bewaart "schriftelijke overeenkomst" zonder het vinkje te tonen', async () => {
    renderForm({
      ...base,
      debt_type: 'familielening',
      name: 'Lening ouders',
      repayment_type: 'lineair',
      is_tax_deductible: null,
      nhg: null,
      fixed_rate_end_date: null,
      has_hypotheekplanner_tracking: false,
      has_written_agreement: true,
    })
    expect(screen.queryByText('Schriftelijke overeenkomst')).toBeNull()

    const row = await saveAndGetRow()

    expect(row.has_written_agreement).toBe(true)
  })

  it('belastingschuld: toont maandbedrag en einddatum één keer en leidt de regeling af', async () => {
    renderForm({
      ...base,
      debt_type: 'belastingschuld',
      name: 'Aanslag 2024',
      repayment_type: null,
      is_tax_deductible: null,
      nhg: null,
      fixed_rate_end_date: null,
      has_hypotheekplanner_tracking: false,
      monthly_payment: 150,
      minimum_payment: 150,
      tax_year: 2024,
      has_payment_plan: false,
    })
    expect(screen.queryByText('Betalingsregeling')).toBeNull()
    expect(screen.queryByText('Einddatum regeling')).toBeNull()
    expect(screen.getAllByText('Maandbedrag')).toHaveLength(1)

    const row = await saveAndGetRow()

    expect(row.has_payment_plan).toBe(true)
    expect(row.tax_year).toBe(2024)
  })

  it('belastingschuld: een opgeslagen regeling blijft staan, ook zonder maandbedrag', async () => {
    renderForm({
      ...base,
      debt_type: 'belastingschuld',
      name: 'Aanslag 2024',
      repayment_type: null,
      is_tax_deductible: null,
      nhg: null,
      fixed_rate_end_date: null,
      has_hypotheekplanner_tracking: false,
      monthly_payment: 0,
      minimum_payment: 0,
      has_payment_plan: true,
    })

    const row = await saveAndGetRow()

    expect(row.has_payment_plan).toBe(true)
  })

  it('belastingschuld zonder regeling en zonder maandbedrag houdt de vlag uit', async () => {
    renderForm({
      ...base,
      debt_type: 'belastingschuld',
      name: 'Aanslag 2024',
      repayment_type: null,
      is_tax_deductible: null,
      nhg: null,
      fixed_rate_end_date: null,
      has_hypotheekplanner_tracking: false,
      monthly_payment: 0,
      minimum_payment: 0,
      has_payment_plan: false,
    })

    const row = await saveAndGetRow()

    expect(row.has_payment_plan).toBe(false)
  })

  it('creditcard: toont kredietlimiet en minimale betaling in de kern', () => {
    renderForm({
      ...base,
      debt_type: 'credit_card',
      name: 'Visa',
      repayment_type: null,
      is_tax_deductible: null,
      nhg: null,
      fixed_rate_end_date: null,
      has_hypotheekplanner_tracking: false,
      credit_limit: 5000,
    })

    expect(screen.getByText('Kredietlimiet')).toBeTruthy()
    expect(screen.getByTestId('debt-minimum-payment')).toBeTruthy()
  })

  it('autolening: toont de koppeling aan het voertuig', () => {
    renderForm({
      ...base,
      debt_type: 'car_loan',
      name: 'Autolening',
      repayment_type: null,
      is_tax_deductible: null,
      nhg: null,
      fixed_rate_end_date: null,
      has_hypotheekplanner_tracking: false,
    })

    expect(screen.getByText('Gekoppeld voertuig')).toBeTruthy()
    expect(screen.getByTestId('debt-linked-asset')).toBeTruthy()
  })
})

describe('DebtForm — twee ingeklapte blokken', () => {
  it('"Hoe telt dit mee" staat dicht en draagt wat de cijfers verandert', () => {
    renderForm(base)

    const telt = screen.getByTestId('debt-telt-mee') as HTMLDetailsElement
    expect(telt.open).toBe(false)
    expect(telt.textContent).toContain('Neem dit % mee')
    expect(telt.textContent).toContain('Hypotheekrenteaftrek')
    expect(telt.textContent).toContain('Aflossing meetellen in spaarquote')
    expect(telt.textContent).not.toContain('Oorspronkelijk bedrag')
  })

  it('"Meer gegevens en koppelingen" staat dicht en draagt de administratie en de apps', () => {
    renderForm(base)

    const meer = screen.getByTestId('debt-meer-instellingen') as HTMLDetailsElement
    expect(meer.open).toBe(false)
    expect(meer.textContent).toContain('Oorspronkelijk bedrag')
    expect(meer.textContent).toContain('Startdatum')
    expect(meer.textContent).toContain('Kredietverstrekker')
    expect(meer.textContent).toContain('Hypotheekplanner')
    expect(meer.textContent).toContain('Notities')
    expect(meer.textContent).not.toContain('Hypotheekrenteaftrek')
  })

  it('de samenvatting toont dicht wat de cijfers verandert', () => {
    renderForm({ ...base, net_worth_inclusion_pct: 60 })

    const samenvatting = screen.getByTestId('debt-telt-mee').querySelector('[data-samenvatting]')
    expect(samenvatting?.textContent).toBe('Telt voor 60% mee · met renteaftrek · aflossing telt als sparen')
  })

  it('de samenvatting van de gegevens noemt een aan staande app', () => {
    renderForm(base)

    const samenvatting = screen.getByTestId('debt-meer-instellingen').querySelector('[data-samenvatting]')
    expect(samenvatting?.textContent).toBe('Hypotheekplanner aan')
  })

  it('een berekend saldo noemt zijn grondslag, die in het dichte blok staat', () => {
    renderForm({ ...base, end_date: '2048-06-01' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Berekend' })[0]!)

    const grondslag = screen.getByTestId('debt-saldo-grondslag')
    expect(grondslag.textContent).toContain('Berekend uit')
    expect(grondslag.textContent).toContain('300.000')
    expect(grondslag.textContent).toContain('januari 2020')
  })

  it('bij een eigen saldo staat er geen grondslagregel', () => {
    renderForm({ ...base, end_date: '2048-06-01' })

    expect(screen.queryByTestId('debt-saldo-grondslag')).toBeNull()
  })

  it('het tweede blok heet "Meer gegevens" zonder hypotheekplanner-koppeling', () => {
    renderForm({ ...base, debt_type: 'personal_loan', has_hypotheekplanner_tracking: false })

    expect(screen.getByTestId('debt-meer-instellingen').querySelector('summary')?.textContent).not.toContain('koppelingen')
  })

  it('geen app en geen notitie: geen samenvattingsregel onder de gegevens', () => {
    renderForm({ ...base, debt_type: 'personal_loan', has_hypotheekplanner_tracking: false })

    expect(screen.getByTestId('debt-meer-instellingen').querySelector('[data-samenvatting]')).toBeNull()
  })

  it('toont Eigendom niet zonder huishouden', () => {
    renderForm(base)

    expect(screen.queryByTestId('ownership-toggle')).toBeNull()
  })

  it('toont Eigendom wel bij een schuld die al gedeeld is', () => {
    renderForm({ ...base, ownership: 'shared', household_id: 'hh-1' })

    expect(screen.getByTestId('ownership-toggle')).toBeTruthy()
  })
})
