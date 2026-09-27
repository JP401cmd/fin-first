import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { OnboardingBudget } from './onboarding-budget'
import { BUDGET_SLUGS } from '@/lib/budget-data'
import type { BudgetPlanDiff } from '@/lib/budget-plan-diff'
import { BUDGET_TEMPLATES } from '@/lib/budget-templates/onboarding-presets'
import { buildTemplateDraft, groupForRender } from '@/lib/budget-templates/template-draft'
import { formatCurrency } from '@/lib/format'

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
  // B-063 (eigenaarsbesluit 27 sep 2026, vervangt W-012): de kop van fase 1 is
  // "Kies je budgetplan". De <em> splitst de zin over tekstnodes, dus een
  // getByText zou 'm niet vinden — de accessible name van de heading plakt ze
  // wél aan elkaar.
  it('fase 1 draagt "Kies je budgetplan" als kop en legt uit wat een budgetplan is', () => {
    renderStep()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Kies je budgetplan' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Een budgetplan verdeelt je netto-inkomen per maand over potjes/)).toBeTruthy()
  })

  it('elke tegel draagt een "Past bij jou als …"-regel', () => {
    renderStep()
    for (const tpl of BUDGET_TEMPLATES) {
      expect(screen.getByText(`Past bij jou als ${tpl.pastBij}.`)).toBeTruthy()
    }
    expect(screen.getByText('Past bij jou als je al weet welke potjes je wilt.')).toBeTruthy()
  })

  it('Nibud is voorgeselecteerd en er zijn vier startpunten', () => {
    renderStep()
    const group = screen.getByRole('group', { name: 'Kies een startpunt' })
    const tiles = within(group).getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'))
    expect(tiles).toHaveLength(4)
    expect(within(group).getByRole('button', { name: /^Nibud-standaard/ }).getAttribute('aria-pressed')).toBe('true')
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

  // B-062: een bekend inkomen wordt niet opnieuw gevraagd — alleen-lezen, één bron.
  it('met een bekend inkomen is er geen inkomensveld, wel een alleen-lezen regel met het bedrag', () => {
    renderStep(3525)
    expect(screen.queryByLabelText('Netto maandinkomen')).toBeNull()
    const line = screen.getByTestId('ob-budget-income-readonly')
    expect(line.textContent).toContain(formatCurrency(3525))
    expect(line.textContent).toMatch(/Mijn → Profiel/)
    fireEvent.click(footerButton('Verder'))
    // De Salaris-post draagt exact het netto inkomen uit de onboarding.
    expect(screen.getByDisplayValue('3525')).toBeTruthy()
  })

  it('bij een onbekend inkomen staat het veld er wél; de template rekent met het getypte bedrag', () => {
    renderStep(0)
    const input = screen.getByLabelText('Netto maandinkomen') as HTMLInputElement
    expect(input.value).toBe('')
    expect(screen.queryByTestId('ob-budget-income-readonly')).toBeNull()

    fireEvent.change(input, { target: { value: '4.000' } })
    expect(screen.getAllByText(/Ingevuld in deze stap/).length).toBeGreaterThan(0)
    fireEvent.click(footerButton('Verder'))

    // Nibud: Salaris = het volledige netto inkomen, de rest in percentages ervan.
    expect(screen.getByDisplayValue('4000')).toBeTruthy()
    expect(screen.getByTestId('nog-te-verdelen').textContent).toMatch(/0/)

    // W-013: fase 2 vertelt wáár die bedragen vandaan komen — en zegt er
    // "vaste verdeling" bij, zodat de generieke sleutel niet als maatwerk leest.
    expect(screen.getByText(/vaste verdeling van je netto-inkomen/)).toBeTruthy()
    expect(screen.getByText(/Bijstellen kan later altijd onder Overzicht → Budget/)).toBeTruthy()
  })

  // Harde eis uit de kaart: de percentages zijn de eigen sleutel van de app,
  // geen Nibud-referentiecijfers (dat is `nibud_reference_data`, een ander
  // systeem). Het deck mag daarom geen templatenaam of Nibud-verwijzing dragen.
  it('het deck van fase 2 noemt geen templatenaam en niet Nibud', () => {
    renderStep()
    fireEvent.click(footerButton('Verder'))
    const deck = screen.getByText(/Koos je een opzet, dan zijn de bedragen al ingevuld/)
    expect(deck.textContent).not.toMatch(/Nibud|Minimalistisch|Uitgebreid/)
  })

  it('"Leeg beginnen" levert alleen Eigen rekening', async () => {
    const fetchSpy = mockFetchOk()
    const { onSaved } = renderStep()
    fireEvent.click(screen.getByRole('button', { name: /Leeg beginnen/ }))
    fireEvent.click(footerButton('Verder'))

    expect(screen.getAllByDisplayValue('Eigen rekening')).toHaveLength(2)
    expect(screen.getByTestId('nog-te-verdelen').textContent).toMatch(/3\.000/)

    // W-013: één deck voor beide startpunten, dus de inkomenszin staat er ook
    // hier — maar voorwaardelijk ("Koos je een opzet, dan …"), zodat hij niet
    // belooft dat er iets is ingevuld terwijl je leeg begon.
    expect(screen.getByText(/Koos je een opzet, dan zijn de bedragen al ingevuld/)).toBeTruthy()

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

  // B-064: i-knop naast elke templatetegel met het plan en de bedragen.
  it('de i-knop opent per template een sheet met de canonieke bedragen uit buildTemplateDraft', async () => {
    renderStep(3000)
    fireEvent.click(screen.getByRole('button', { name: 'Wat zit er in Minimalistisch?' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Wat zit er in Minimalistisch?')).toBeTruthy()

    const grouped = groupForRender(buildTemplateDraft('minimalistisch', 3000))
    const expense = grouped.find((g) => g.type === 'expense')!
    expect(expense.parents.length).toBeGreaterThan(0)
    for (const parent of expense.parents) {
      const kids = expense.childrenBy[parent.id] ?? []
      const amount = kids.length > 0 ? kids.reduce((s, k) => s + (k.amount ?? 0), 0) : (parent.amount ?? parent.defaultLimit ?? 0)
      const row = within(dialog).getByText(parent.name).closest('[data-testid="template-preview-parent"]') as HTMLElement
      expect(row.textContent).toContain(formatCurrency(amount))
    }
  })

  it('"Kies dit plan" zet het startpunt zonder naar fase 2 te gaan', async () => {
    renderStep()
    fireEvent.click(screen.getByRole('button', { name: 'Wat zit er in Uitgebreid?' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Kies dit plan' }))
    const group = screen.getByRole('group', { name: 'Kies een startpunt' })
    expect(within(group).getByRole('button', { name: /^Uitgebreid/ }).getAttribute('aria-pressed')).toBe('true')
    expect(within(group).getByRole('button', { name: /^Nibud-standaard/ }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByTestId('nog-te-verdelen')).toBeNull()
  })

  it('klikken op de tegel zelf kiest het startpunt en opent geen preview', () => {
    renderStep()
    const group = screen.getByRole('group', { name: 'Kies een startpunt' })
    fireEvent.click(within(group).getByRole('button', { name: /^Minimalistisch/ }))
    expect(within(group).getByRole('button', { name: /^Minimalistisch/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('"Ander startpunt" gaat na bevestiging terug naar de keuze', async () => {
    renderStep()
    fireEvent.click(footerButton('Verder'))
    fireEvent.click(screen.getByRole('button', { name: 'Ander startpunt' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ander startpunt kiezen' }))
    expect(await screen.findByRole('group', { name: 'Kies een startpunt' })).toBeTruthy()
  })
})
