/**
 * Regressietest — bewerken van een schuld mag opgeslagen waarden niet stil
 * overschrijven met afgeleide waarden.
 *
 * Repro (live gereproduceerd op jochen@test.trifinity.nl, 6-9-2026): open een
 * bestaande schuld met een einddatum, wijzig alléén de rente (of niets), klik
 * Opslaan. Het formulier schrijft dan een BEREKEND saldo en maandbedrag naar de
 * database in plaats van de opgeslagen waarden — een schuld van € 9.000 met
 * € 125 p/m werd zonder waarschuwing € 10.950,92 met € 137,65 p/m.
 *
 * Oorzaak: de twee "Berekend / Eigen invoer"-schakelaars initialiseerden
 * hardcoded op `true`, terwijl elk ánder veld uit `debt?.…` initialiseert.
 * Zodra een einddatum een berekening mogelijk maakt, verdween de opgeslagen
 * waarde uit beeld én uit de opslag. Voor de gebruiker las dat als "mijn
 * aanpassing van rente/aflossing wordt niet opgeslagen".
 *
 * Given een bestaande schuld met een einddatum en opgeslagen saldo/maandbedrag
 * When het bewerk-formulier opent en er wordt opgeslagen zonder die velden aan
 *      te raken
 * Then blijven saldo en maandbedrag exact de opgeslagen waarden.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DebtForm } from './debt-form'
import type { Debt } from '@/lib/debt-data'

const insert = vi.fn(async () => ({ error: null }))
/** Laatste schakel van de update-keten: `.select('id').maybeSingle()`. */
let updateResult: { data: { id: string } | null; error: unknown } = { data: { id: 'debt-1' }, error: null }
const maybeSingle = vi.fn(async () => updateResult)
const select = vi.fn(() => ({ maybeSingle }))
const eqUser = vi.fn(() => ({ select }))
const eq = vi.fn(() => ({ eq: eqUser }))
let lastRow: Record<string, unknown> = {}
const update = vi.fn((row: Record<string, unknown>) => { lastRow = row; return { eq } })
/**
 * Per tabel apart, zodat een test kan zien of de historie-tabellen zijn
 * aangeraakt. Eén gedeelde mock voor élke tabel absorbeert de `valuations`-
 * upsert onzichtbaar, en dan kan de suite per constructie niet merken dat een
 * saldowijziging zonder historie-rij wordt weggeschreven.
 */
const upsertByTable: Record<string, ReturnType<typeof vi.fn>> = {}
const upsertFor = (table: string) => {
  upsertByTable[table] ??= vi.fn(async () => ({ error: null }))
  return upsertByTable[table]
}
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn((table: string) => ({ insert, update, upsert: upsertFor(table) })),
  }),
}))

/** Schuld met einddatum → de "Berekend"-schakelaars zijn zichtbaar. */
const debt: Debt = {
  id: 'debt-1',
  user_id: 'user-1',
  name: 'Rekening-courant schuld BV',
  debt_type: 'personal_loan',
  original_amount: 15000,
  current_balance: 9000,
  interest_rate: 5,
  minimum_payment: 125,
  monthly_payment: 125,
  start_date: '2023-01-01',
  end_date: '2036-08-12',
  creditor: null,
  notes: null,
  is_active: true,
  sort_order: 0,
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
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
  eq.mockClear()
  updateResult = { data: { id: 'debt-1' }, error: null }
  for (const fn of Object.values(upsertByTable)) fn.mockClear()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
})

describe('DebtForm — bewerken overschrijft opgeslagen waarden niet', () => {
  it('bewaart saldo en maandbedrag ongewijzigd als de gebruiker ze niet aanraakt', async () => {
    render(<DebtForm debt={debt} userAssets={[]} onClose={() => {}} onSaved={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    await waitFor(() => expect(update).toHaveBeenCalled())
    const row = lastRow
    expect(row.current_balance).toBe(9000)
    expect(row.monthly_payment).toBe(125)
  })

  it('bewaart het opgeslagen saldo ook wanneer alleen de rente wijzigt', async () => {
    render(<DebtForm debt={debt} userAssets={[]} onClose={() => {}} onSaved={() => {}} />)

    fireEvent.change(screen.getByTestId('debt-interest-rate'), { target: { value: '7.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    await waitFor(() => expect(update).toHaveBeenCalled())
    const row = lastRow
    expect(row.interest_rate).toBe(7.5)
    expect(row.current_balance).toBe(9000)
    expect(row.monthly_payment).toBe(125)
  })

  /**
   * Given de database weigert de update (RLS-mismatch, of de rij is van de
   *       partner: de SELECT-policy is huishoud-gedeeld, de UPDATE-policy niet)
   * When de gebruiker op Opslaan klikt
   * Then verschijnt een foutmelding en wordt `onSaved` NIET aangeroepen.
   *
   * Vóór de fix negeerde `handleSave` de uitkomst volledig; 0 geraakte rijen
   * geeft `error: null`, dus de pane sloot met een succesgevoel terwijl er
   * niets was opgeslagen.
   */
  it('meldt een mislukte opslag in plaats van stil te slagen', async () => {
    updateResult = { data: null, error: null }
    const onSaved = vi.fn()
    render(<DebtForm debt={debt} userAssets={[]} onClose={() => {}} onSaved={onSaved} />)

    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    expect(await screen.findByText(/Opslaan is niet gelukt/)).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
  })

  /**
   * Given de gebruiker kiest bewust "Berekend" voor het saldo
   * When er wordt opgeslagen
   * Then wordt dát saldo weggeschreven ÉN als waardering vastgelegd.
   *
   * De historie-tak vergeleek de getypte `currentBalance` met het opgeslagen
   * saldo, terwijl de rij `calculatedBalance` wegschreef. Bij "Berekend" is het
   * invoerveld niet eens gerenderd, dus die vergelijking zag nooit een
   * wijziging: het saldo van een schuld veranderde met duizenden euro's zonder
   * één rij in `valuations` of `balance_snapshots`.
   */
  it('legt een berekend saldo ook vast in de waardehistorie', async () => {
    render(<DebtForm debt={debt} userAssets={[]} onClose={() => {}} onSaved={() => {}} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Berekend' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    await waitFor(() => expect(update).toHaveBeenCalled())
    const written = lastRow.current_balance as number
    expect(written).not.toBe(9000)

    await waitFor(() => expect(upsertByTable.valuations).toHaveBeenCalled())
    expect(upsertByTable.valuations!.mock.calls[0]![0]).toMatchObject({
      entity_type: 'debt',
      entity_id: 'debt-1',
      value: written,
    })
  })
})

/**
 * Maandbedrag en einddatum kunnen elkaar tegenspreken. De rekenmotor kiest het
 * maandbedrag (zie `lib/debt-maandbedrag-bron.test.ts`), dus de einddatum valt
 * stil af — en dát moet de gebruiker horen, in plaats van dat er ongemerkt één
 * van de twee wordt genegeerd.
 */
describe('DebtForm — botsing tussen maandbedrag en einddatum', () => {
  it('waarschuwt en biedt de afgeleide einddatum aan', async () => {
    // € 9.000 lineair à 5% bij € 125 p/m ≈ 103 maanden; de einddatum zegt ~119.
    const botsend = { ...debt, repayment_type: 'lineair' } as Debt
    render(<DebtForm debt={botsend} userAssets={[]} onClose={() => {}} onSaved={() => {}} />)

    const melding = await screen.findByTestId('debt-einddatum-conflict')
    expect(melding.textContent).toMatch(/past niet bij deze einddatum/)
    expect(melding.textContent).toMatch(/We rekenen met je maandbedrag/)
  })

  it('zwijgt wanneer het maandbedrag wél bij de einddatum past', () => {
    // `personal_loan` toont geen aflossingsvorm, dus het formulier rekent
    // annuïtair: € 9.000 à 5% bij € 125 p/m is ~86 maanden. Een einddatum die
    // daar binnen de marge op zit hoort géén waarschuwing te geven.
    const over = new Date()
    over.setMonth(over.getMonth() + 86)
    const kloppend = {
      ...debt, end_date: over.toISOString().split('T')[0], monthly_payment: 125,
    } as Debt
    render(<DebtForm debt={kloppend} userAssets={[]} onClose={() => {}} onSaved={() => {}} />)

    expect(screen.queryByTestId('debt-einddatum-conflict')).toBeNull()
  })

  it('zwijgt zonder einddatum', () => {
    const zonder = { ...debt, repayment_type: 'lineair', end_date: null } as Debt
    render(<DebtForm debt={zonder} userAssets={[]} onClose={() => {}} onSaved={() => {}} />)

    expect(screen.queryByTestId('debt-einddatum-conflict')).toBeNull()
  })
})
