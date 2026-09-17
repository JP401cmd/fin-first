import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { OnboardingBudget } from './onboarding-budget'
import { BUDGET_SLUGS } from '@/lib/budget-data'
import type { BudgetPlanDiff } from '@/lib/budget-plan-diff'

afterEach(() => {
  vi.restoreAllMocks()
})

// OnboardingShell rendert de footer dubbel (desktop + mobiele sticky bar).
const footerButton = (name: string | RegExp) =>
  screen.getAllByRole('button', { name })[0] as HTMLButtonElement

function renderStep(netIncome = 3000) {
  const onSaved = vi.fn()
  const onSkipped = vi.fn()
  render(<OnboardingBudget netIncome={netIncome} onSaved={onSaved} onSkipped={onSkipped} />)
  return { onSaved, onSkipped }
}

function mockFetchOk() {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ ok: true, counts: {} }), { status: 200 }),
  )
}

describe('OnboardingBudget', () => {
  it('Nibud is voorgeselecteerd en er zijn vier startpunten', () => {
    renderStep()
    const group = screen.getByRole('group', { name: 'Kies een startpunt' })
    const tiles = within(group).getAllByRole('button')
    expect(tiles).toHaveLength(4)
    expect(within(group).getByRole('button', { name: /Nibud-standaard/ }).getAttribute('aria-pressed')).toBe('true')
    expect(within(group).getByRole('button', { name: /Leeg beginnen/ }).getAttribute('aria-pressed')).toBe('false')
  })

  it('"Ik doe dit later" opent de bevestiging; "Later doen" roept onSkipped aan', async () => {
    const { onSkipped } = renderStep()
    fireEvent.click(screen.getByRole('button', { name: 'Ik doe dit later' }))
    expect(await screen.findByText(/Zonder budget ziet Fin niet waar je vrijheidsdagen naartoe gaan/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Later doen' }))
    expect(onSkipped).toHaveBeenCalledTimes(1)
  })

  it('"Toch een budget kiezen" slaat niets over', async () => {
    const { onSkipped, onSaved } = renderStep()
    fireEvent.click(screen.getByRole('button', { name: 'Ik doe dit later' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Toch een budget kiezen' }))
    expect(onSkipped).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('heeft geen overslaan-knop naast de primaire actie', () => {
    renderStep()
    expect(screen.queryByRole('button', { name: /overslaan/i })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Ik doe dit later' })).toHaveLength(1)
  })

  it('het netto inkomen staat voorgevuld en is aan te passen; de template rekent met het aangepaste bedrag', () => {
    renderStep(3000)
    const input = screen.getByLabelText('Netto maandinkomen') as HTMLInputElement
    expect(input.value).toBe('3000')

    fireEvent.change(input, { target: { value: '4.000' } })
    expect(screen.getAllByText(/Aangepast in deze stap/).length).toBeGreaterThan(0)
    fireEvent.click(footerButton('Verder'))

    // Nibud: Salaris = het volledige netto inkomen, de rest in percentages ervan.
    expect(screen.getByDisplayValue('4000')).toBeTruthy()
    expect(screen.getByTestId('nog-te-verdelen').textContent).toMatch(/0/)
  })

  it('"Leeg beginnen" levert alleen Eigen rekening', async () => {
    const fetchSpy = mockFetchOk()
    const { onSaved } = renderStep()
    fireEvent.click(screen.getByRole('button', { name: /Leeg beginnen/ }))
    fireEvent.click(footerButton('Verder'))

    expect(screen.getAllByDisplayValue('Eigen rekening')).toHaveLength(2)
    expect(screen.getByTestId('nog-te-verdelen').textContent).toMatch(/3\.000/)

    fireEvent.click(footerButton('Budget opslaan'))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    const diff = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string) as BudgetPlanDiff
    expect(diff.to_insert.map((r) => r.slug)).toEqual([BUDGET_SLUGS.EIGEN_REKENING, BUDGET_SLUGS.EIGEN_REKENING_SUB])
  })

  it('opslaan post een diff naar /api/budgets/plan inclusief Eigen rekening', async () => {
    const fetchSpy = mockFetchOk()
    const { onSaved } = renderStep()
    fireEvent.click(footerButton('Verder'))
    fireEvent.click(footerButton('Budget opslaan'))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/budgets/plan')
    expect(init!.method).toBe('POST')
    const diff = JSON.parse(init!.body as string) as BudgetPlanDiff
    const slugs = diff.to_insert.map((r) => r.slug)
    expect(slugs).toContain(BUDGET_SLUGS.EIGEN_REKENING)
    expect(slugs).toContain(BUDGET_SLUGS.EIGEN_REKENING_SUB)
    expect(slugs).toContain(BUDGET_SLUGS.BOODSCHAPPEN)
    expect(diff.to_delete).toEqual([])
  })

  it('toont de foutmelding van de route', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Budgetplan kon niet worden opgeslagen' }), { status: 400 }),
    )
    const { onSaved } = renderStep()
    fireEvent.click(footerButton('Verder'))
    fireEvent.click(footerButton('Budget opslaan'))
    expect(await screen.findByText('Budgetplan kon niet worden opgeslagen')).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('opslaan is uitgeschakeld zolang een categorie geen naam heeft', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderStep()
    fireEvent.click(footerButton('Verder'))
    expect(footerButton('Budget opslaan').disabled).toBe(false)

    const uitgaven = screen.getByRole('heading', { name: 'Uitgaven' }).closest('section') as HTMLElement
    fireEvent.click(within(uitgaven).getByRole('button', { name: /Hoofdbudget/ }))
    expect(footerButton('Budget opslaan').disabled).toBe(true)
    fireEvent.click(footerButton('Budget opslaan'))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('"Ander startpunt" gaat na bevestiging terug naar de keuze', async () => {
    renderStep()
    fireEvent.click(footerButton('Verder'))
    fireEvent.click(screen.getByRole('button', { name: 'Ander startpunt' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ander startpunt kiezen' }))
    expect(await screen.findByRole('group', { name: 'Kies een startpunt' })).toBeTruthy()
  })
})
