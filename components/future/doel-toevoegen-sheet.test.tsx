import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DoelToevoegenSheet } from './doel-toevoegen-sheet'

/**
 * Tests voor DoelToevoegenSheet — modal-flow voor nieuwe doel-insert.
 * Supabase + router worden gemockt.
 */

const mockInsert = vi.fn()
const mockRefresh = vi.fn()
const mockGetUser = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      insert: mockInsert,
      // De geavanceerde modus (GoalForm) laadt lazy assets+debts via
      // select().eq().order() — de eq() scoopt op de eigen gebruiker. Zonder die
      // schakel valt het effect om in een unhandled rejection: groene
      // assertions, exit 1, rode CI.
      select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(async () => ({ data: [] })) })) })),
    }),
    auth: { getUser: mockGetUser },
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

beforeEach(() => {
  mockInsert.mockReset()
  mockInsert.mockResolvedValue({ error: null })
  mockRefresh.mockReset()
  mockGetUser.mockReset()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('DoelToevoegenSheet — UI-flow', () => {
  it('opent sheet bij klik op "Doel toevoegen"', () => {
    render(<DoelToevoegenSheet />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByText('Doel toevoegen'))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('sluit sheet bij X-knop', async () => {
    render(<DoelToevoegenSheet />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    fireEvent.click(screen.getByLabelText('Sluiten'))
    // Sinds de migratie naar <ShellOverlay kind="sheet"> (ADR 0039) speelt de
    // gedeelde BottomSheet een exit-animatie af vóór unmount; het dialog
    // verdwijnt daardoor asynchroon (na transitionend/timeout) i.p.v. direct.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('rendert verplichte velden + type-select', () => {
    render(<DoelToevoegenSheet />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    expect(screen.getByText('Naam')).toBeTruthy()
    expect(screen.getByText('Doelbedrag (€)')).toBeTruthy()
    expect(screen.getByText(/Streefdatum/i)).toBeTruthy()
    expect(screen.getByText('Type')).toBeTruthy()
  })
})

describe('DoelToevoegenSheet — validation', () => {
  it('toont fout-melding bij lege naam', async () => {
    render(<DoelToevoegenSheet />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!)
    expect(screen.getByRole('alert').textContent).toMatch(/Naam is verplicht/i)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('toont fout-melding bij negatief doelbedrag', async () => {
    render(<DoelToevoegenSheet />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(dialog.querySelector('input[type="text"]')!, {
      target: { value: 'Test-doel' },
    })
    fireEvent.change(dialog.querySelector('input[type="number"]')!, {
      target: { value: '-100' },
    })
    fireEvent.submit(dialog.querySelector('form')!)
    expect(screen.getByRole('alert').textContent).toMatch(/positief getal/i)
    expect(mockInsert).not.toHaveBeenCalled()
  })
})

describe('DoelToevoegenSheet — insert-flow', () => {
  it('roept supabase.insert met juiste payload', async () => {
    render(<DoelToevoegenSheet />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(dialog.querySelector('input[type="text"]')!, {
      target: { value: 'Spaargeld voor woning' },
    })
    fireEvent.change(dialog.querySelector('input[type="number"]')!, {
      target: { value: '50000' },
    })
    fireEvent.change(dialog.querySelector('input[type="date"]')!, {
      target: { value: '2027-12-31' },
    })
    fireEvent.submit(dialog.querySelector('form')!)
    await new Promise((r) => setTimeout(r, 10))
    expect(mockInsert).toHaveBeenCalledTimes(1)
    const payload = mockInsert.mock.calls[0]?.[0]
    expect(payload.name).toBe('Spaargeld voor woning')
    expect(payload.target_value).toBe(50000)
    expect(payload.target_date).toBe('2027-12-31')
    expect(payload.goal_type).toBe('savings')
    expect(payload.current_value).toBe(0)
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('toont fout-melding bij Supabase-fout', async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: 'RLS denied' } })
    render(<DoelToevoegenSheet />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(dialog.querySelector('input[type="text"]')!, {
      target: { value: 'Test' },
    })
    fireEvent.change(dialog.querySelector('input[type="number"]')!, {
      target: { value: '1000' },
    })
    fireEvent.submit(dialog.querySelector('form')!)
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.getByRole('alert').textContent).toMatch(/RLS denied/)
  })
})

describe('DoelToevoegenSheet — ETA-preview', () => {
  it('toont indicatie bij alleen target-bedrag (geen datum)', () => {
    render(<DoelToevoegenSheet />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(dialog.querySelector('input[type="number"]')!, {
      target: { value: '50000' },
    })
    const preview = screen.getByTestId('eta-preview')
    expect(preview.textContent).toMatch(/Bij €100\/maand/i)
    expect(preview.textContent).toMatch(/jaar/i)
  })

  it('toont maandelijkse inleg wanneer target én datum gevuld zijn', () => {
    render(<DoelToevoegenSheet />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(dialog.querySelector('input[type="number"]')!, {
      target: { value: '60000' },
    })
    // Datum 10 jaar vooruit
    const futureDate = new Date()
    futureDate.setFullYear(futureDate.getFullYear() + 10)
    fireEvent.change(dialog.querySelector('input[type="date"]')!, {
      target: { value: futureDate.toISOString().slice(0, 10) },
    })
    const preview = screen.getByTestId('eta-preview')
    expect(preview.textContent).toMatch(/per maand inleggen/i)
    expect(preview.textContent).toMatch(/€/)
  })

  it('verbergt preview bij leeg of negatief bedrag', () => {
    render(<DoelToevoegenSheet />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    expect(screen.queryByTestId('eta-preview')).toBeNull()
  })
})

describe('DoelToevoegenSheet — standaard-doelen-kiezer', () => {
  it('toont de standaard-doelen (noodfonds / vrijheidsgetal / schuldenvrij / vakantie / auto / aanbetaling)', () => {
    render(<DoelToevoegenSheet />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    expect(screen.getByText('Noodfonds')).toBeTruthy()
    expect(screen.getByText('Vrijheidsgetal')).toBeTruthy()
    expect(screen.getByText('Schuldenvrij')).toBeTruthy()
    expect(screen.getByText('Vakantie')).toBeTruthy()
    expect(screen.getByText('Nieuwe auto')).toBeTruthy()
    expect(screen.getByText('Aanbetaling woning')).toBeTruthy()
  })

  it('personaliseert het noodfonds-bedrag = 6× maanduitgaven uit props', () => {
    render(<DoelToevoegenSheet monthlyExpenses={2000} />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    fireEvent.click(screen.getByText('Noodfonds'))
    const dialog = screen.getByRole('dialog')
    const nameInput = dialog.querySelector('input[type="text"]') as HTMLInputElement
    const targetInput = dialog.querySelector('input[type="number"]') as HTMLInputElement
    expect(nameInput.value).toBe('Noodfonds')
    expect(targetInput.value).toBe('12000')
  })

  it('laat het bedrag leeg wanneer er geen inkomen/uitgaven bekend zijn', () => {
    render(<DoelToevoegenSheet />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    fireEvent.click(screen.getByText('Noodfonds'))
    const dialog = screen.getByRole('dialog')
    const targetInput = dialog.querySelector('input[type="number"]') as HTMLInputElement
    expect(targetInput.value).toBe('')
  })

  it('personaliseert het vrijheidsgetal = 25× jaaruitgaven uit props', () => {
    render(<DoelToevoegenSheet monthlyExpenses={2000} />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    fireEvent.click(screen.getByText('Vrijheidsgetal'))
    const dialog = screen.getByRole('dialog')
    const targetInput = dialog.querySelector('input[type="number"]') as HTMLInputElement
    // 2000 × 12 × 25 = 600.000
    expect(targetInput.value).toBe('600000')
  })

  /**
   * SPEC-WIJZIGING (1 sep 2026). Deze test controleerde eerder dat de kiezer
   * `select.value === 'debt'` zette — een type dat in `GOAL_TYPE_META` niet
   * bestaat en op de doelkaart stil terugviel. De preset schakelt nu door naar
   * de geavanceerde GoalForm met `debt_payoff` voorgeselecteerd, want een
   * afbouwdoel heeft een schuld-koppeling nodig en die kan het snelle pad niet.
   */
  it('klik op Schuldenvrij schakelt door naar GoalForm met "Schuld aflossen" voorgeselecteerd', async () => {
    render(<DoelToevoegenSheet monthlyExpenses={2000} />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    fireEvent.click(screen.getByText('Schuldenvrij'))

    expect(await screen.findByText('Nieuw doel')).toBeTruthy()
    const typeSelect = screen.getByLabelText('Type doel') as HTMLSelectElement
    expect(typeSelect.value).toBe('debt_payoff')
    // De naam uit de preset gaat mee (het bedrag vult de gebruiker of de
    // koppeling). Eén venster tegelijk: de quick-add-sheet is weg.
    expect((document.getElementById('goal-name') as HTMLInputElement).value).toBe('Schuldenvrij')
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Doel toevoegen/i })).toBeNull(),
    )
  })

  it('de type-select spreekt canonieke GoalTypes (geen eigen enum meer)', () => {
    render(<DoelToevoegenSheet />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    const select = screen.getByRole('dialog').querySelector('select') as HTMLSelectElement
    const waarden = Array.from(select.options).map((o) => o.value)
    expect(waarden).toEqual(['savings', 'net_worth', 'debt_payoff'])
    // Gedeelde labels uit lib/goal-data.
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      'Spaardoel',
      'Netto vermogen',
      'Schuld aflossen',
    ])
  })

  it('een Vermogen-preset schrijft het canonieke type weg (niet "wealth")', async () => {
    render(<DoelToevoegenSheet monthlyExpenses={2000} />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    fireEvent.click(screen.getByText('Vrijheidsgetal'))
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!)
    await new Promise((r) => setTimeout(r, 10))
    expect(mockInsert.mock.calls[0]?.[0].goal_type).toBe('net_worth')
  })
})
