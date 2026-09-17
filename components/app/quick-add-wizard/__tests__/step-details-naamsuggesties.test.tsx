/**
 * Naamsuggesties in stap 3 staan als knoppen in de sheet, niet als native
 * `<datalist>`. Given een betaalrekening, When de sheet opent, Then zijn de
 * suggesties knoppen onder het veld en is er geen `list`-attribuut — want de
 * native dropdown viel op Android Chrome over het label en het veld heen
 * (melding 17-09-2026).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { StepDetails } from '../steps/step-details'
import { ASSET_NAME_SUGGESTIONS } from '@/lib/quick-add/name-suggestions'
import type { AssetDraftState } from '../wizard-reducer'

describe('QuickAdd stap 3 — naamsuggesties', () => {
  it('toont suggesties als knoppen zonder native datalist en vult de naam bij een klik', () => {
    const onChange = vi.fn()
    const draft = { asset_type: 'cash', name: 'Betaal rabo', current_value: 0 } as unknown as AssetDraftState
    const { container } = render(
      <StepDetails intent="asset" draft={draft} onChange={onChange} onSubmit={vi.fn()} />,
    )

    expect(container.querySelector('datalist')).toBeNull()
    expect(screen.getByLabelText('Naam').getAttribute('list')).toBeNull()

    const suggesties = ASSET_NAME_SUGGESTIONS.cash ?? []
    if (suggesties.length === 0) return
    const groep = screen.getByRole('group', { name: 'Snel een naam kiezen' })
    fireEvent.click(within(groep).getByRole('button', { name: suggesties[0] }))
    expect(onChange).toHaveBeenCalledWith({ name: suggesties[0] })
  })
})
