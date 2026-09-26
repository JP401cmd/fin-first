import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

/**
 * De pill wijkt voor een live action-bar (ADR 0179 D7: de opslaan-balk van het
 * doelscenario-lab is op mobiel de action-bar van de shell) en komt terug zodra die bar
 * weg is — in rust staat er niets op te slaan, dan hoort de navigatie er gewoon te staan.
 */

let liveConfig: unknown = null

vi.mock('next/navigation', () => ({
  usePathname: () => '/toekomst/doelen',
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/components/command-palette/command-palette-provider', () => ({
  useCommandPalette: () => ({ open: vi.fn() }),
}))
vi.mock('@/lib/overlay-signal', () => ({ useOverlayOpen: () => false }))
vi.mock('@/lib/shell/fin-slot', () => ({ useFinSlot: () => ({ registerSlot: vi.fn() }) }))
vi.mock('./nav-menu-sheet', () => ({ NavMenuSheet: () => null }))
vi.mock('./nav-stack-provider', () => ({
  useLiveBottomBar: () => ({ config: liveConfig, setConfig: vi.fn() }),
}))

import { FloatingNavButton } from './floating-nav-button'
import { HomeScreenProvider } from '@/lib/hooks/use-home-screen'

function pill() {
  return document.querySelector('[data-mobile-floating-nav="true"]') as HTMLElement
}

function renderPill() {
  return render(
    <HomeScreenProvider initialHomeScreen="budget">
      <FloatingNavButton />
    </HomeScreenProvider>,
  )
}

afterEach(() => {
  cleanup()
  liveConfig = null
})

describe('FloatingNavButton — live action-bar', () => {
  it('verborgen zolang er een action-bar in de shell staat', () => {
    liveConfig = { kind: 'action-bar', primary: { label: 'Doel vastleggen', onClick: () => {} } }
    renderPill()
    expect(pill().style.visibility).toBe('hidden')
    expect(pill().getAttribute('aria-hidden')).toBe('true')
  })

  it('in rust (geen action-bar) is de pill er weer', () => {
    liveConfig = null
    renderPill()
    expect(pill().style.visibility).toBe('')
    expect(pill().getAttribute('aria-hidden')).toBeNull()
    expect(screen.getByRole('button', { name: /Menu openen/ })).toBeTruthy()
  })

  it('een andere live-config (app-tabs) verbergt de pill niet', () => {
    liveConfig = { kind: 'hidden' }
    renderPill()
    expect(pill().style.visibility).toBe('')
  })

  it('komt terug zodra de bar verdwijnt (rerender)', () => {
    liveConfig = { kind: 'action-bar', primary: { label: 'Doel bijwerken', onClick: () => {} } }
    const { rerender } = renderPill()
    expect(pill().style.visibility).toBe('hidden')
    liveConfig = null
    rerender(
      <HomeScreenProvider initialHomeScreen="budget">
        <FloatingNavButton />
      </HomeScreenProvider>,
    )
    expect(pill().style.visibility).toBe('')
  })
})
