import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PensioenStrategieEditor } from './pensioen-strategie-editor'

/**
 * Tests voor de factor-A-uitvraag in de Pensioen-strategie-editor (list-view).
 * Borgt:
 *  - directe invoer slaat op met pension_factor_a_source: 'upo'
 *  - de salaris-schatter gebruikt estimateFactorAFromSalary en slaat op met 'estimated'
 *  - leeg opslaan schrijft pension_factor_a: null, _source: null (terug naar onbekend)
 *
 * Supabase (auth.getUser + from('profiles').update().eq()) en next/navigation
 * worden gemockt volgens het bestaande sheet-testpatroon in de repo.
 */

const mockUpdate = vi.fn()
const mockEq = vi.fn()
const mockGetUser = vi.fn()
const mockRefresh = vi.fn()

// Vangt het update-payload zodat we de bron kunnen asserten.
let lastUpdatePayload: Record<string, unknown> | null = null

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: () => mockGetUser() },
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        lastUpdatePayload = payload
        mockUpdate(payload)
        return { eq: () => mockEq() }
      },
    }),
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

beforeEach(() => {
  lastUpdatePayload = null
  mockUpdate.mockReset()
  mockEq.mockReset()
  mockEq.mockResolvedValue({ error: null })
  mockGetUser.mockReset()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  mockRefresh.mockReset()
})

function renderEditor(overrides: { grossYearlyIncome?: number; pensioenFactorA?: number } = {}) {
  return render(
    <PensioenStrategieEditor
      pensionEvents={[]}
      allEvents={[]}
      baseline={null}
      dailyExpenses={50}
      aowAge={67}
      grossYearlyIncome={overrides.grossYearlyIncome ?? 45000}
      pensioenFactorA={overrides.pensioenFactorA ?? 0}
      onClose={() => {}}
    />,
  )
}

function openUitvraag() {
  fireEvent.click(screen.getByRole('button', { name: /Bereken je fiscale ruimte/i }))
}

async function flush() {
  await new Promise((r) => setTimeout(r, 10))
}

describe('Pensioen-strategie-editor — factor-A-uitvraag', () => {
  it('toont de uitvraag pas na openklikken', () => {
    renderEditor()
    expect(screen.queryByLabelText(/factor A/i)).toBeNull()
    openUitvraag()
    expect(screen.getByLabelText(/factor A/i)).toBeTruthy()
  })

  it('framet als bovengrens wanneer factor A onbekend is', () => {
    renderEditor({ pensioenFactorA: 0 })
    openUitvraag()
    expect(screen.getByText(/Bovengrens vóór aftrek werkgeverspensioen/i)).toBeTruthy()
  })

  it('handmatige invoer slaat op met pension_factor_a_source: upo', async () => {
    renderEditor({ pensioenFactorA: 0 })
    openUitvraag()
    const input = screen.getByLabelText(/factor A/i)
    fireEvent.change(input, { target: { value: '1200' } })
    fireEvent.click(screen.getByText(/Factor A opslaan/i))
    await flush()
    expect(mockUpdate).toHaveBeenCalled()
    expect(lastUpdatePayload).toEqual({
      pension_factor_a: 1200,
      pension_factor_a_source: 'upo',
    })
    expect(mockEq).toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('salaris-schatter vult factor A en slaat op met estimated', async () => {
    const { estimateFactorAFromSalary } = await import('@/lib/jaarruimte')
    const verwacht = estimateFactorAFromSalary(45000, { year: 2026 })

    renderEditor({ pensioenFactorA: 0 })
    openUitvraag()
    // Open salaris-alternatief
    fireEvent.click(screen.getByText(/Schat 'm uit je salaris/i))
    const salaris = screen.getByLabelText(/Bruto jaarsalaris/i)
    fireEvent.change(salaris, { target: { value: '45000' } })
    fireEvent.click(screen.getByText(/^Schat factor A$/i))

    // Het factor-A-veld is nu gevuld met de schatting (afgerond).
    const input = screen.getByLabelText(/factor A/i) as HTMLInputElement
    expect(input.value).toBe(String(Math.round(verwacht)))
    expect(screen.getByText(/Indicatie op basis van je salaris/i)).toBeTruthy()

    fireEvent.click(screen.getByText(/Factor A opslaan/i))
    await flush()
    expect(lastUpdatePayload).toEqual({
      pension_factor_a: Math.round(verwacht),
      pension_factor_a_source: 'estimated',
    })
  })

  it('leeg opslaan schrijft null/null (terug naar onbekend)', async () => {
    renderEditor({ pensioenFactorA: 1200 })
    openUitvraag()
    const input = screen.getByLabelText(/factor A/i)
    // Wis het voorgevulde getal.
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(screen.getByText(/Factor A opslaan/i))
    await flush()
    expect(lastUpdatePayload).toEqual({
      pension_factor_a: null,
      pension_factor_a_source: null,
    })
    expect(mockRefresh).toHaveBeenCalled()
  })
})
