import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScenarioBibliotheek, _SCENARIO_TEMPLATES } from './scenario-bibliotheek'

/**
 * Tests voor ScenarioBibliotheek — plan F-3 vooraf gemodelleerde events.
 * Validatie van templates-defaults + UI-flow (dialog open/close + error
 * bij ontbrekende currentAge). Supabase + router worden gemockt zodat
 * inserts puur in-memory zijn.
 */

const mockInsert = vi.fn()
const mockRefresh = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ insert: mockInsert }),
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

beforeEach(() => {
  mockInsert.mockReset()
  mockInsert.mockResolvedValue({ error: null })
  mockRefresh.mockReset()
})

describe('ScenarioBibliotheek — template-catalogus', () => {
  it('bevat 8 templates met realistische defaults', () => {
    expect(_SCENARIO_TEMPLATES.length).toBe(8)
  })

  it('elke template heeft een unieke key + label', () => {
    const keys = _SCENARIO_TEMPLATES.map((t) => t.key)
    expect(new Set(keys).size).toBe(keys.length)
    _SCENARIO_TEMPLATES.forEach((t) => {
      expect(t.label.length).toBeGreaterThan(0)
    })
  })

  it('"tweede-kind" heeft realistische NL-defaults', () => {
    const kind = _SCENARIO_TEMPLATES.find((t) => t.key === 'tweede-kind')
    expect(kind).toBeDefined()
    // €5k startkosten + €350/mnd over 18 jaar
    expect(kind?.defaults.one_time_cost).toBe(5000)
    expect(kind?.defaults.monthly_cost_change).toBe(350)
    expect(kind?.defaults.duration_months).toBe(216)
  })

  it('"erfenis" geeft eenmalige opbrengst (negatieve one_time_cost)', () => {
    const erfenis = _SCENARIO_TEMPLATES.find((t) => t.key === 'erfenis')
    expect(erfenis?.defaults.one_time_cost).toBeLessThan(0)
  })

  it('"sabbatical" is 12 maanden zonder inkomen', () => {
    const sab = _SCENARIO_TEMPLATES.find((t) => t.key === 'sabbatical')
    expect(sab?.defaults.duration_months).toBe(12)
    expect(sab?.defaults.monthly_income_change).toBeLessThan(0)
  })

  it('"deeltijd-4d" is permanent (duration_months = 0)', () => {
    const dt = _SCENARIO_TEMPLATES.find((t) => t.key === 'deeltijd-4d')
    expect(dt?.defaults.duration_months).toBe(0)
    // 20% van ~€3500 ≈ €700
    expect(dt?.defaults.monthly_income_change).toBe(-700)
  })
})

describe('ScenarioBibliotheek — UI-flow', () => {
  it('opent dialog bij klik op "Snel toevoegen"', () => {
    render(<ScenarioBibliotheek currentAge={35} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByText('Snel toevoegen'))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('rendert alle 8 template-namen in dialog', () => {
    render(<ScenarioBibliotheek currentAge={35} />)
    fireEvent.click(screen.getByText('Snel toevoegen'))
    _SCENARIO_TEMPLATES.forEach((t) => {
      expect(screen.getByText(t.label)).toBeTruthy()
    })
  })

  it('sluit dialog bij klik op X', () => {
    render(<ScenarioBibliotheek currentAge={35} />)
    fireEvent.click(screen.getByText('Snel toevoegen'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Sluiten'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('ScenarioBibliotheek — insert-flow', () => {
  it('roept supabase.insert met juiste payload + target_age', async () => {
    render(<ScenarioBibliotheek currentAge={35} />)
    fireEvent.click(screen.getByText('Snel toevoegen'))
    // Klik op "Tweede kind" — default_years = 2
    fireEvent.click(screen.getByText('Tweede kind'))
    // Async insert
    await new Promise((r) => setTimeout(r, 10))
    expect(mockInsert).toHaveBeenCalledTimes(1)
    const payload = mockInsert.mock.calls[0]?.[0]
    expect(payload.name).toBe('Tweede kind')
    expect(payload.target_age).toBe(37) // 35 + 2
    expect(payload.one_time_cost).toBe(5000)
    expect(payload.monthly_cost_change).toBe(350)
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('toont fout-melding wanneer currentAge null is', () => {
    render(<ScenarioBibliotheek currentAge={null} />)
    fireEvent.click(screen.getByText('Snel toevoegen'))
    fireEvent.click(screen.getByText('Tweede kind'))
    expect(screen.getByText(/Geboortejaar ontbreekt/i)).toBeTruthy()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('toont fout-melding bij Supabase-fout', async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: 'RLS denied' } })
    render(<ScenarioBibliotheek currentAge={35} />)
    fireEvent.click(screen.getByText('Snel toevoegen'))
    fireEvent.click(screen.getByText('Erfenis'))
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.getByText(/RLS denied/)).toBeTruthy()
  })
})
