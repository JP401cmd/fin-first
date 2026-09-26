import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { FinancialInput } from '@/lib/horizon-data'
import type { FireParams } from '@/lib/fire-params'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'

/**
 * EventPane — de ←-knop "Terug" in de pane-kop (C3 punt 8).
 *
 * `SlideInPane` wijst "Terug" naar `onClose` tenzij de pane een `onBack` meegeeft.
 * EventPane gaf die nooit mee, dus in het formulier van een NIEUW event dat uit de
 * catalogus kwam (bv. Werkloosheid) sloot "Terug" de hele pane, terwijl de gebruiker
 * terug wilde naar de keuze. Geen regressie van de voorstel-commits (38704f576 raakte
 * alleen `handleSelectType`); het gedrag bestond al sinds de ←-knop altijd zichtbaar is.
 *
 * ShellOverlay is gestubd tot die ene knop (onBack ?? onClose), de modi tot een marker.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/components/app/shell/shell-overlay', () => ({
  ShellOverlay: ({ open, onClose, onBack, children }: { open: boolean; onClose: () => void; onBack?: () => void; children: ReactNode }) =>
    open ? (
      <div>
        <button type="button" onClick={onBack ?? onClose}>
          Terug
        </button>
        {children}
      </div>
    ) : null,
}))
vi.mock('./event-pane-catalog', () => ({
  EventPaneCatalog: ({ onSelect, onOpenChat }: { onSelect: (t: string) => void; onOpenChat: () => void }) => (
    <div data-testid="catalogus">
      <button type="button" onClick={() => onSelect('werkloosheid')}>
        Werkloosheid
      </button>
      <button type="button" onClick={onOpenChat}>
        Vraag Fin
      </button>
    </div>
  ),
}))
vi.mock('./event-chat-pane', () => ({ EventChatPane: () => <div data-testid="chat" /> }))
vi.mock('./event-pane-view', () => ({ EventPaneView: () => <div data-testid="view" /> }))
vi.mock('./event-pane-edit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./event-pane-edit')>()),
  EventPaneEdit: () => <div data-testid="formulier" />,
}))

import { EventPane } from './event-pane'

afterEach(cleanup)

function renderPane(over: { initialMode?: 'catalog' | 'view' | 'edit'; editingId?: string | null; onClose?: () => void } = {}) {
  const onClose = over.onClose ?? vi.fn()
  render(
    <EventPane
      open
      onClose={onClose}
      editingId={over.editingId ?? null}
      initialMode={over.initialMode ?? 'catalog'}
      events={over.editingId ? ([{ id: over.editingId, event_type: 'werkloosheid', name: 'WW' }] as never) : []}
      baselineInput={{ dateOfBirth: null } as unknown as FinancialInput}
      baselineFire={null}
      fireParams={{} as FireParams}
      fireStrategy={{} as FireStrategyConfig}
      withdrawalStrategy={{} as WithdrawalStrategyConfig}
      endAge={90}
      householdMode={false}
      previewBaseline={null}
      onChanged={vi.fn()}
    />,
  )
  return { onClose }
}

describe('EventPane — Terug', () => {
  it('nieuw event uit de catalogus: Terug gaat terug naar de catalogus, sluit de pane niet', () => {
    const { onClose } = renderPane()
    fireEvent.click(screen.getByRole('button', { name: 'Werkloosheid' }))
    expect(screen.getByTestId('formulier')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Terug' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId('catalogus')).toBeTruthy()
  })

  it('vanuit Fin (chat) terug naar de catalogus', () => {
    const { onClose } = renderPane()
    fireEvent.click(screen.getByRole('button', { name: 'Vraag Fin' }))
    expect(screen.getByTestId('chat')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Terug' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId('catalogus')).toBeTruthy()
  })

  it('in de catalogus zelf sluit Terug de pane', () => {
    const { onClose } = renderPane()
    fireEvent.click(screen.getByRole('button', { name: 'Terug' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('een bestaand event (view) heeft geen catalogus om naar terug te gaan: Terug sluit', () => {
    const { onClose } = renderPane({ initialMode: 'view', editingId: 'e1' })
    expect(screen.getByTestId('view')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Terug' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
