import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { ViewModeProvider, ViewModeToggle, useViewMode } from './view-mode-provider'

/**
 * Tests voor ViewModeContext (plan A-5 / Tier-2 #13). Validatie van
 * default-state, localStorage-persistence en toggle-rendering.
 */

beforeEach(() => {
  window.localStorage.clear()
})

describe('ViewModeProvider — default & persistence', () => {
  it('default mode is "kijken"', () => {
    const { result } = renderHook(() => useViewMode(), {
      wrapper: ({ children }) => <ViewModeProvider>{children}</ViewModeProvider>,
    })
    expect(result.current.mode).toBe('kijken')
    expect(result.current.isPlannen).toBe(false)
  })

  it('isPlannen=true wanneer mode "plannen"', () => {
    const { result } = renderHook(() => useViewMode(), {
      wrapper: ({ children }) => <ViewModeProvider>{children}</ViewModeProvider>,
    })
    act(() => result.current.setMode('plannen'))
    expect(result.current.isPlannen).toBe(true)
  })

  it('persisteert via localStorage onder trifinity:view-mode', () => {
    const { result } = renderHook(() => useViewMode(), {
      wrapper: ({ children }) => <ViewModeProvider>{children}</ViewModeProvider>,
    })
    act(() => result.current.setMode('plannen'))
    expect(window.localStorage.getItem('trifinity:view-mode')).toBe('plannen')
  })

  it('laadt opgeslagen mode na re-mount', () => {
    window.localStorage.setItem('trifinity:view-mode', 'plannen')
    const { result } = renderHook(() => useViewMode(), {
      wrapper: ({ children }) => <ViewModeProvider>{children}</ViewModeProvider>,
    })
    // useEffect-hydration is async; wacht een micro-tick
    expect(result.current.mode).toBe('plannen')
  })

  it('negeert ongeldige localStorage-waarde', () => {
    window.localStorage.setItem('trifinity:view-mode', 'gibberish')
    const { result } = renderHook(() => useViewMode(), {
      wrapper: ({ children }) => <ViewModeProvider>{children}</ViewModeProvider>,
    })
    expect(result.current.mode).toBe('kijken')
  })
})

describe('ViewModeToggle — render', () => {
  it('rendert twee modus-knoppen', () => {
    render(
      <ViewModeProvider>
        <ViewModeToggle />
      </ViewModeProvider>,
    )
    expect(screen.getByText('Kijken')).toBeTruthy()
    expect(screen.getByText('Plannen')).toBeTruthy()
  })

  it('Kijken-knop heeft aria-pressed=true bij default', () => {
    render(
      <ViewModeProvider>
        <ViewModeToggle />
      </ViewModeProvider>,
    )
    expect(screen.getByText('Kijken').closest('button')?.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Plannen').closest('button')?.getAttribute('aria-pressed')).toBe('false')
  })

  it('klikt naar Plannen-modus en persisteert', () => {
    render(
      <ViewModeProvider>
        <ViewModeToggle />
      </ViewModeProvider>,
    )
    fireEvent.click(screen.getByText('Plannen'))
    expect(screen.getByText('Plannen').closest('button')?.getAttribute('aria-pressed')).toBe('true')
    expect(window.localStorage.getItem('trifinity:view-mode')).toBe('plannen')
  })

  it('rendert capsule-style container met role="group"', () => {
    const { container } = render(
      <ViewModeProvider>
        <ViewModeToggle />
      </ViewModeProvider>,
    )
    const group = container.querySelector('[role="group"]')
    expect(group?.getAttribute('aria-label')).toBe('Weergave-modus')
  })
})
