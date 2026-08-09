import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { DisplayModePicker } from './display-mode-picker'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'

/**
 * APP-1 (eenvoudige-weergave-audit fase 1): de weergavekeuze staat als eerste
 * blok op /mijn/uiterlijk. Deze tests borgen de twee dingen die ertoe doen:
 * de actieve stand is zichtbaar, en klikken schrijft via het BESTAANDE
 * schrijfpad (`PUT /api/display-mode`) — geen tweede fetch, geen localStorage.
 */

function renderPicker(mode: DisplayMode) {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <DisplayModePicker />
    </DisplayModeProvider>,
  )
}

describe('DisplayModePicker', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('markeert de actieve modus met aria-pressed', () => {
    vi.stubGlobal('fetch', vi.fn())
    renderPicker('simple')
    expect(
      screen.getByRole('button', { name: /Eenvoudig/ }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByRole('button', { name: /Volledig/ }).getAttribute('aria-pressed')).toBe(
      'false',
    )
  })

  it('schrijft een wissel via PUT /api/display-mode', async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve({ ok: true }),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderPicker('simple')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Volledig/ }))
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/display-mode')
    expect(init.method).toBe('PUT')
    expect(init.body).toBe(JSON.stringify({ mode: 'full' }))
    expect(screen.getByRole('button', { name: /Volledig/ }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })

  it('doet niets bij een klik op de al actieve modus', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    renderPicker('full')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Volledig/ }))
    })

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
