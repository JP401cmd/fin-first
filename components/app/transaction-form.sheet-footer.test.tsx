/**
 * UR3-17 #20 — de knoppen van de transactie-sheet stonden onderaan de
 * SCROLL-content. Op een viewport van 844 px landden Annuleren en Opslaan
 * daardoor op 849-886 px: buiten beeld, en niet bereikbaar zonder de sheet
 * eerst helemaal door te scrollen.
 *
 * B-022 (sep 2026) heeft die footer daarna herschikt: verwijderen verhuisde
 * naar de titelbalk en onderin bleef ÉÉN knop over — "Terug" zolang er niets
 * gewijzigd is, "Opslaan" zodra dat wel zo is.
 *
 * De modal-conventie (CLAUDE.md) zegt: primaire acties in de sticky footer,
 * óók op klein scherm. Deze test bewaakt de plek en die driewegregel — niet
 * het uiterlijk:
 *  1. de afsluitknop zit IN de niet-scrollende footer van de sheet;
 *  2. hij zit NIET binnen het `<form>` (dat is de scroll-content);
 *  3. een ongewijzigd formulier toont "Terug", een gewijzigd "Opslaan";
 *  4. die Opslaan blijft een `type="submit"` die via het `form`-attribuut aan
 *     het formulier hangt — anders valt de native required-validatie op
 *     datum/bedrag/omschrijving stil, wat je pas merkt als er lege rijen
 *     wegschrijven.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TransactionForm } from './transaction-form'
import type { Budget } from '@/lib/budget-data'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ then: (r: (v: unknown) => void) => r({ data: [], error: null }) }) }),
    }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }) },
  }),
}))

function budget(partial: Partial<Budget> & { id: string; name: string }): Budget {
  return {
    slug: null,
    icon: 'Circle',
    description: null,
    default_limit: 100,
    budget_type: 'expense',
    parent_id: null,
    ...partial,
  } as Budget
}

const BUDGET_GROUPS = [
  { parent: budget({ id: 'b-parent', name: 'Vaste lasten' }), children: [budget({ id: 'b-food', name: 'Boodschappen' })] },
]

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ has_household: false }) })),
  )
})

function renderForm() {
  render(
    <TransactionForm
      accountId="acc-1"
      budgetGroups={BUDGET_GROUPS}
      onClose={() => {}}
      onSaved={() => {}}
    />,
  )
  return {
    footer: screen.getByTestId('bottom-sheet-footer'),
    terug: screen.getByRole('button', { name: 'Terug' }),
  }
}

/** Maakt het formulier "vuil" zodat de afsluitknop naar Opslaan omslaat. */
function typeDescription() {
  fireEvent.change(screen.getByLabelText(/Beschrijving/i), { target: { value: 'Boodschappen' } })
}

describe('TransactionForm — acties in de sticky sheet-footer (UR3-17 #20, B-022)', () => {
  it('zet de afsluitknop in de niet-scrollende footer', () => {
    const { footer, terug } = renderForm()
    expect(footer.contains(terug)).toBe(true)
  })

  it('houdt die knop buiten de scrollende formulier-content', () => {
    const { terug } = renderForm()
    expect(terug.closest('form')).toBeNull()
  })

  it('toont "Terug" zolang er niets gewijzigd is en "Opslaan" zodra dat wel zo is', () => {
    renderForm()
    expect(screen.getByRole('button', { name: 'Terug' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Opslaan/ })).toBeNull()

    typeDescription()

    expect(screen.queryByRole('button', { name: 'Terug' })).toBeNull()
    const opslaan = screen.getByRole('button', { name: /Opslaan/ })
    expect(screen.getByTestId('bottom-sheet-footer').contains(opslaan)).toBe(true)
  })

  it('koppelt Opslaan via het form-attribuut aan het formulier, zodat de required-validatie blijft werken', () => {
    renderForm()
    typeDescription()
    const opslaan = screen.getByRole('button', { name: /Opslaan/ }) as HTMLButtonElement
    expect(opslaan.type).toBe('submit')
    const formId = opslaan.getAttribute('form')
    expect(formId).toBeTruthy()
    const form = document.getElementById(formId!)
    expect(form?.tagName).toBe('FORM')
    // De verplichte velden staan in dát formulier — anders koppelt de knop
    // aan een leeg element en valideert er niets.
    expect(form!.querySelectorAll('[required]').length).toBeGreaterThan(0)
  })
})
