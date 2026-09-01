import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { GoalForm } from './goal-form'
import { computeLinkedCurrentValue } from '@/lib/goal-current-value'
import type { Goal, GoalType } from '@/lib/goal-data'

/**
 * Tests voor GoalForm.
 *
 * Ronde 4 §G: viaLab-doelen (verwacht rendement, vrijheidsleeftijd) worden via
 * het /toekomst-lab beheerd en zijn NIET vrij aanmaakbaar.
 *
 * 1 sep 2026: koppelen is meervoudig (checkbox-groepen "Bezittingen"/"Schulden"),
 * er is een doelbasis-keuze, en schrijven gaat via `/api/goals` i.p.v. een
 * directe supabase-insert/update.
 */

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  }),
}))

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    user_id: 'u1',
    name: 'Vrijheidsleeftijd',
    description: null,
    goal_type: 'fire_age' as GoalType,
    target_value: 52,
    current_value: 54,
    target_date: null,
    linked_asset_id: null,
    linked_debt_id: null,
    icon: 'Hourglass',
    color: 'teal',
    is_completed: false,
    completed_at: null,
    sort_order: 0,
    ownership: 'personal',
    household_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

const ASSETS = [
  { id: 'a1', name: 'Spaarrekening', current_value: 10000 },
  { id: 'a2', name: 'Beleggingsrekening', current_value: 25000 },
]
const DEBTS = [{ id: 'd1', name: 'Studieschuld', current_balance: 15000 }]

/** Vangt elke fetch op; `/api/goals` levert een geslaagde 201 met een id. */
const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url: string) => {
    if (typeof url === 'string' && url.startsWith('/api/goals')) {
      return { ok: true, status: 201, json: async () => ({ id: 'nieuw-doel' }) }
    }
    // Household-status fetch in useEffect → geen huishouden.
    return { ok: true, json: async () => ({ has_household: false }) }
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** De body van de laatste `/api/goals`-aanroep. */
function laatsteGoalsCall(): { method: string; body: Record<string, unknown> } {
  const call = [...fetchMock.mock.calls].reverse().find((c) => String(c[0]).startsWith('/api/goals'))
  if (!call) throw new Error('geen /api/goals-aanroep gedaan')
  return { method: call[1].method as string, body: JSON.parse(call[1].body as string) }
}

describe('GoalForm — viaLab-types filteren', () => {
  it('nieuw doel: viaLab-types staan NIET in de type-dropdown', () => {
    render(
      <GoalForm assets={[]} debts={[]} onClose={() => {}} onSaved={() => {}} />,
    )
    const select = screen.getByLabelText('Type doel')
    // Normale types zijn er wel.
    expect(within(select).getByRole('option', { name: 'Spaardoel' })).toBeTruthy()
    expect(within(select).getByRole('option', { name: 'Salaris' })).toBeTruthy()
    // viaLab-types (lab-beheerd) zijn eruit gefilterd.
    expect(within(select).queryByRole('option', { name: 'Verwacht rendement' })).toBeNull()
    expect(within(select).queryByRole('option', { name: 'Vrijheidsleeftijd' })).toBeNull()
  })

  it('edit van een viaLab-doel: type-select disabled + hint', () => {
    render(
      <GoalForm
        goal={makeGoal({ goal_type: 'fire_age' as GoalType })}
        assets={[]}
        debts={[]}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    const select = screen.getByLabelText('Type doel') as HTMLSelectElement
    expect(select.disabled).toBe(true)
    // Het eigen type blijft zichtbaar in de (vaste) select.
    expect(within(select).getByRole('option', { name: 'Vrijheidsleeftijd' })).toBeTruthy()
    expect(
      screen.getByText('Wordt beheerd via je doelsituatie op de tijdas.'),
    ).toBeTruthy()
  })

  it('edit van een gewoon doel: type-select blijft bewerkbaar, geen hint', () => {
    render(
      <GoalForm
        goal={makeGoal({ goal_type: 'savings' as GoalType })}
        assets={[]}
        debts={[]}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    const select = screen.getByLabelText('Type doel') as HTMLSelectElement
    expect(select.disabled).toBe(false)
    expect(
      screen.queryByText('Wordt beheerd via je doelsituatie op de tijdas.'),
    ).toBeNull()
  })
})

// ── Koppelen: meervoudig, twee groepen ───────────────────────────────────────

describe('GoalForm — koppelen (meervoudig)', () => {
  it('toont beide groepen met Nederlandse labels; "asset" komt er niet meer in voor', () => {
    render(
      <GoalForm assets={ASSETS} debts={DEBTS} onClose={() => {}} onSaved={() => {}} />,
    )
    expect(screen.getByText('Koppelen (optioneel)')).toBeTruthy()
    expect(screen.getByText('Koppel aan bezitting(en)')).toBeTruthy()
    expect(screen.getByText('Koppel aan schuld(en) — afbouwdoel')).toBeTruthy()
    expect(screen.queryByText(/asset/i)).toBeNull()
    // Eén checkbox per bezitting/schuld — geen selects meer.
    expect(screen.getAllByRole('checkbox').length).toBe(ASSETS.length + DEBTS.length)
  })

  it('vult een bestaand doel voor uit goal.links', () => {
    render(
      <GoalForm
        goal={makeGoal({
          goal_type: 'savings' as GoalType,
          links: [
            { asset_id: 'a2', debt_id: null },
            { asset_id: null, debt_id: 'd1' },
          ],
        })}
        assets={ASSETS}
        debts={DEBTS}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    const vinkjes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    const aangevinkt = vinkjes.filter((c) => c.checked)
    expect(aangevinkt.length).toBe(2)
  })

  /**
   * RUNTIME-ASSERTIE op een getoond kerngetal: de prefill moet exact zijn wat de
   * canonieke formule van dezelfde invoer maakt. Dit is de test die de oude bug
   * ving — `handleDebtLink` zette het RUWE saldo, terwijl de loader `doel − saldo`
   * rekent.
   */
  it('prefill van de huidige waarde = computeLinkedCurrentValue (alleen schulden)', () => {
    render(
      <GoalForm
        goal={makeGoal({ goal_type: 'debt_payoff' as GoalType, target_value: 20000, current_value: 0 })}
        assets={ASSETS}
        debts={DEBTS}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: /Studieschuld/ }))
    const huidig = screen.getByLabelText(/Afgelost/) as HTMLInputElement
    expect(huidig.readOnly).toBe(true)
    expect(Number(huidig.value)).toBe(
      computeLinkedCurrentValue(20000, [], [{ current_balance: 15000 }]),
    )
    // ... en dat is nadrukkelijk NIET het ruwe saldo.
    expect(Number(huidig.value)).not.toBe(15000)
  })

  it('gemengde selectie rekent netto en legt dat uit', () => {
    render(
      <GoalForm
        goal={makeGoal({ goal_type: 'savings' as GoalType, target_value: 50000, current_value: 0 })}
        assets={ASSETS}
        debts={DEBTS}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: /Spaarrekening/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Studieschuld/ }))

    expect(screen.getByTestId('gemengde-koppeling-uitleg').textContent).toMatch(/netto/i)
    const huidig = screen.getByLabelText(/Huidige waarde/) as HTMLInputElement
    expect(Number(huidig.value)).toBe(
      computeLinkedCurrentValue(50000, [{ current_value: 10000 }], [{ current_balance: 15000 }]),
    )
  })

  it('stuurt de koppelingen als links mee naar /api/goals', async () => {
    render(
      <GoalForm assets={ASSETS} debts={DEBTS} onClose={() => {}} onSaved={() => {}} />,
    )
    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Vermogen' } })
    fireEvent.change(screen.getByLabelText(/Doelbedrag/), { target: { value: '50000' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Beleggingsrekening/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    await waitFor(() => expect(laatsteGoalsCall().method).toBe('POST'))
    const { body } = laatsteGoalsCall()
    expect(body.links).toEqual({ assetIds: ['a2'], debtIds: [] })
    expect(body.current_value).toBe(25000)
    // Legacy-kolommen en server-bepaalde velden gaan NIET mee.
    expect(body).not.toHaveProperty('linked_asset_id')
    expect(body).not.toHaveProperty('user_id')
    expect(body).not.toHaveProperty('metadata')
  })

  it('bewerken gaat via PATCH met het doel-id', async () => {
    render(
      <GoalForm
        goal={makeGoal({ goal_type: 'savings' as GoalType, target_value: 1000 })}
        assets={ASSETS}
        debts={DEBTS}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
    await waitFor(() => expect(laatsteGoalsCall().method).toBe('PATCH'))
    expect(laatsteGoalsCall().body.id).toBe('g1')
  })

  it('toont de foutstring uit de envelope', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.startsWith('/api/goals')) {
        return {
          ok: false,
          status: 403,
          json: async () => ({ error: 'Je kunt alleen je eigen bezittingen en schulden aan een doel koppelen.' }),
        }
      }
      return { ok: true, json: async () => ({ has_household: false }) }
    })
    render(
      <GoalForm
        goal={makeGoal({ goal_type: 'savings' as GoalType, target_value: 1000 })}
        assets={ASSETS}
        debts={DEBTS}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/eigen bezittingen en schulden/)
  })
})

// ── Doelbasis ────────────────────────────────────────────────────────────────

describe('GoalForm — doelbasis', () => {
  it('biedt de metric-opties alleen bij een NIEUW doel', () => {
    const { unmount } = render(
      <GoalForm assets={[]} debts={[]} onClose={() => {}} onSaved={() => {}} />,
    )
    const select = screen.getByLabelText('Waar meet je dit doel aan af?')
    expect(within(select).getByRole('option', { name: 'Netto vermogen' })).toBeTruthy()
    expect(within(select).getByRole('option', { name: 'Belastingdruk' })).toBeTruthy()
    expect(within(select).getByRole('option', { name: 'Schuldenvrij' })).toBeTruthy()
    // Een type zonder metric-bron hoort er niet in.
    expect(within(select).queryByRole('option', { name: 'Vrij doel' })).toBeNull()
    unmount()

    render(
      <GoalForm
        goal={makeGoal({ goal_type: 'savings' as GoalType })}
        assets={[]}
        debts={[]}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    expect(screen.queryByLabelText('Waar meet je dit doel aan af?')).toBeNull()
  })

  it('metric-basis: huidige waarde verdwijnt en POST krijgt sync:auto + het type', async () => {
    render(
      <GoalForm assets={ASSETS} debts={DEBTS} onClose={() => {}} onSaved={() => {}} />,
    )
    fireEvent.change(screen.getByLabelText('Waar meet je dit doel aan af?'), {
      target: { value: 'tax_burden' },
    })
    // Geen handmatig huidige-waarde-veld meer, en geen koppelingen (die zouden
    // de motor-waarde overrulen).
    expect(screen.queryByLabelText(/Huidige belastingdruk/)).toBeNull()
    expect(screen.queryByText('Koppelen (optioneel)')).toBeNull()
    // Uitleg in gewone taal over wát er gemeten wordt.
    expect(screen.getByText(/welk deel van je inkomen naar de fiscus gaat/i)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Minder belasting' } })
    fireEvent.change(screen.getByLabelText(/Doel-belastingdruk/), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    await waitFor(() => expect(laatsteGoalsCall().method).toBe('POST'))
    const { body } = laatsteGoalsCall()
    expect(body.goal_type).toBe('tax_burden')
    expect(body.sync).toBe('auto')
    expect(body).not.toHaveProperty('current_value')
  })

  it('terug naar "zelf bijhouden" herstelt het handmatige type', () => {
    render(
      <GoalForm assets={[]} debts={[]} onClose={() => {}} onSaved={() => {}} />,
    )
    fireEvent.change(screen.getByLabelText('Type doel'), { target: { value: 'freedom_days' } })
    fireEvent.change(screen.getByLabelText('Waar meet je dit doel aan af?'), {
      target: { value: 'net_worth' },
    })
    expect(screen.queryByLabelText('Type doel')).toBeNull()

    fireEvent.change(screen.getByLabelText('Waar meet je dit doel aan af?'), {
      target: { value: 'manual' },
    })
    expect((screen.getByLabelText('Type doel') as HTMLSelectElement).value).toBe('freedom_days')
  })
})
