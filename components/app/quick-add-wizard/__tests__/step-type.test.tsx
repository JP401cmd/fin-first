/**
 * Regressietest voor de ARIA-rolstructuur van de QuickAdd-typekeuze.
 *
 * Achtergrond: de tegels droegen een expliciete `role="listitem"` op de
 * `<button>`. Dat overschrijft de impliciete "button"-rol — assistieve
 * technologie kondigde een niet-interactief lijstitem aan en
 * `getByRole('button', …)` matchte de tegels niet. De container is nu een
 * gelabelde `role="group"` met echte knoppen als kinderen.
 *
 * Deze test pint die structuur vast zodat de fix niet terugvalt.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { StepType } from '../steps/step-type'
import {
  ASSET_QUICK_ADD_LABELS,
  QUICK_ADD_ASSET_ORDER,
} from '@/lib/asset-data'
import { DEBT_QUICK_ADD_LABELS, QUICK_ADD_DEBT_ORDER } from '@/lib/debt-data'

describe('StepType — ARIA-rolstructuur van het typegrid', () => {
  it('rendert de bezittings-tegels als echte knoppen in een gelabelde groep', () => {
    render(<StepType intent="asset" onSelect={vi.fn()} />)

    const group = screen.getByRole('group', { name: 'Kies een type bezitting' })
    const buttons = within(group).getAllByRole('button')

    expect(buttons).toHaveLength(QUICK_ADD_ASSET_ORDER.length)
    for (const type of QUICK_ADD_ASSET_ORDER) {
      expect(
        within(group).getByRole('button', {
          name: ASSET_QUICK_ADD_LABELS[type],
        }),
      ).toBeTruthy()
    }
  })

  it('rendert de schuld-tegels als echte knoppen in een gelabelde groep', () => {
    render(<StepType intent="debt" onSelect={vi.fn()} />)

    const group = screen.getByRole('group', { name: 'Kies een type schuld' })
    const buttons = within(group).getAllByRole('button')

    expect(buttons).toHaveLength(QUICK_ADD_DEBT_ORDER.length)
    for (const type of QUICK_ADD_DEBT_ORDER) {
      expect(
        within(group).getByRole('button', {
          name: DEBT_QUICK_ADD_LABELS[type],
        }),
      ).toBeTruthy()
    }
  })

  it('zet geen listitem-rol op de tegels en geen list-rol op de container', () => {
    const { container } = render(<StepType intent="asset" onSelect={vi.fn()} />)

    // Geen enkele tegel mag zijn button-rol laten overschrijven.
    expect(container.querySelector('button[role]')).toBeNull()
    // Een `role="list"` zonder listitem-kinderen zou een kapotte lijst zijn.
    expect(screen.queryAllByRole('list')).toHaveLength(0)
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('selecteert het type bij een klik op de knop', () => {
    const onSelect = vi.fn()
    render(<StepType intent="asset" onSelect={onSelect} />)

    const firstType = QUICK_ADD_ASSET_ORDER[0]
    fireEvent.click(
      screen.getByRole('button', { name: ASSET_QUICK_ADD_LABELS[firstType] }),
    )

    expect(onSelect).toHaveBeenCalledWith(firstType)
  })
})
