import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { HomeScreenPicker } from './home-screen-picker'
import { HomeScreenProvider } from '@/lib/hooks/use-home-screen'
import type { HomeScreen } from '@/lib/home-screen'

/**
 * De startscherm-keuze staat op /mijn/uiterlijk naast de andere profiel-brede
 * weergavekeuzes. Deze tests borgen de twee dingen die ertoe doen: de actieve
 * stand is zichtbaar, en klikken schrijft via het BESTAANDE schrijfpad
 * (`PUT /api/home-screen`) — geen tweede fetch, geen localStorage.
 * Gespiegeld op display-mode-picker.test.tsx.
 */

function renderPicker(screen_: HomeScreen) {
  return render(
    <HomeScreenProvider initialHomeScreen={screen_}>
      <HomeScreenPicker />
    </HomeScreenProvider>,
  )
}

describe('HomeScreenPicker', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('markeert het actieve startscherm met aria-pressed', () => {
    vi.stubGlobal('fetch', vi.fn())
    renderPicker('overzicht')
    expect(
      screen.getByRole('button', { name: /Overzicht/ }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      screen.getByRole('button', { name: /Budgetteren/ }).getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('schrijft een wissel via PUT /api/home-screen', async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve({ ok: true }),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderPicker('overzicht')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Budgetteren/ }))
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/home-screen')
    expect(init.method).toBe('PUT')
    expect(init.body).toBe(JSON.stringify({ screen: 'budget' }))
    expect(
      screen.getByRole('button', { name: /Budgetteren/ }).getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('doet niets bij een klik op het al actieve startscherm', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    renderPicker('budget')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Budgetteren/ }))
    })

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
