/**
 * Smoke test voor ConfirmDestructive.
 *
 * Dekt de kern-veiligheidsbeloften van het component:
 *  1. De destructieve knop is disabled totdat de ingetypte tekst exact klopt.
 *  2. Typfouten / gedeeltelijke matches houden de knop disabled
 *     (case-sensitive — een van de hoekstenen van het type-to-confirm patroon).
 *  3. Annuleren roept onClose aan, niet onConfirm.
 *  4. Bij exacte match: confirm klikt → onConfirm wordt aangeroepen.
 *
 * BottomSheet wordt gemockt zodat de testing-library queries niet naar
 * een portal hoeven te reiken (zelfde patroon als ai-categorize-sheet.test.tsx).
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ConfirmDestructive } from '../confirm-destructive'

// BottomSheet rendert in real life in een portal — mock hem naar een
// simpele inline wrapper zodat queries binnen dezelfde DOM-root werken.
// We respecteren de `open` prop: als gesloten rendert er niks (matcht het
// echte gedrag dat children pas verschijnen zodra `visible` true is).
vi.mock('../bottom-sheet', () => ({
  BottomSheet: ({
    open,
    children,
  }: {
    open: boolean
    onClose: () => void
    children: React.ReactNode
  }) => (open ? <div data-testid="bottom-sheet">{children}</div> : null),
}))

describe('ConfirmDestructive', () => {
  function renderModal(overrides: Partial<Parameters<typeof ConfirmDestructive>[0]> = {}) {
    const onClose = vi.fn()
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(
      <ConfirmDestructive
        open
        onClose={onClose}
        onConfirm={onConfirm}
        entityLabel="budget Boodschappen"
        confirmationText="VERWIJDER"
        {...overrides}
      />,
    )
    return { onClose, onConfirm }
  }

  it('houdt de destructieve knop disabled zolang de input niet matcht', () => {
    renderModal()
    const confirmBtn = screen.getByRole('button', { name: /Definitief verwijderen/i })
    expect(confirmBtn).toBeDisabled()

    // Gedeeltelijke match → nog steeds disabled.
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'VERWIJ' } })
    expect(confirmBtn).toBeDisabled()
  })

  it('activeert de destructieve knop bij exacte, case-sensitive match', () => {
    renderModal()
    const confirmBtn = screen.getByRole('button', { name: /Definitief verwijderen/i })
    const input = screen.getByRole('textbox')

    // Verkeerde case: blijft disabled — dit is de bewuste frictie-stap.
    fireEvent.change(input, { target: { value: 'verwijder' } })
    expect(confirmBtn).toBeDisabled()

    // Exacte match: enabled.
    fireEvent.change(input, { target: { value: 'VERWIJDER' } })
    expect(confirmBtn).toBeEnabled()
  })

  it('roept onClose aan wanneer Annuleren wordt geklikt, niet onConfirm', () => {
    const { onClose, onConfirm } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /Annuleren/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('roept onConfirm aan en sluit bij succes', async () => {
    const { onClose, onConfirm } = renderModal()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'VERWIJDER' } })
    fireEvent.click(screen.getByRole('button', { name: /Definitief verwijderen/i }))

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1)
    })
    // Modal vraagt zelf de sluiting aan na succesvolle confirm.
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })
})
