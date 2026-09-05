/**
 * UR3-17 #20 — de knoppen van de transactie-sheet stonden onderaan de
 * SCROLL-content. Op een viewport van 844 px landden Annuleren en Opslaan
 * daardoor op 849-886 px: buiten beeld, en niet bereikbaar zonder de sheet
 * eerst helemaal door te scrollen.
 *
 * De modal-conventie (CLAUDE.md) zegt: primaire acties in de sticky footer,
 * óók op klein scherm. Deze test bewaakt de plek — niet het uiterlijk:
 *  1. Annuleren en Opslaan zitten IN de niet-scrollende footer van de sheet.
 *  2. Ze zitten NIET binnen het `<form>` (dat is de scroll-content).
 *  3. Opslaan blijft een `type="submit"` die via het `form`-attribuut aan dat
 *     formulier hangt — anders valt de native required-validatie op
 *     datum/bedrag/omschrijving stil, wat je pas merkt als er lege rijen
 *     wegschrijven.
 *
 * Bijt-proef bij het schrijven: met de knoppen terug in de scroll-content
 * faalden 1 en 2; met `type="button"` i.p.v. het form-attribuut faalde 3.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
    opslaan: screen.getByRole('button', { name: /Opslaan/ }) as HTMLButtonElement,
    annuleren: screen.getByRole('button', { name: 'Annuleren' }),
  }
}

describe('TransactionForm — acties in de sticky sheet-footer (UR3-17 #20)', () => {
  it('zet Annuleren en Opslaan in de niet-scrollende footer', () => {
    const { footer, opslaan, annuleren } = renderForm()
    expect(footer.contains(opslaan)).toBe(true)
    expect(footer.contains(annuleren)).toBe(true)
  })

  it('houdt die knoppen buiten de scrollende formulier-content', () => {
    const { opslaan, annuleren } = renderForm()
    expect(opslaan.closest('form')).toBeNull()
    expect(annuleren.closest('form')).toBeNull()
  })

  it('koppelt Opslaan via het form-attribuut aan het formulier, zodat de required-validatie blijft werken', () => {
    const { opslaan } = renderForm()
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
