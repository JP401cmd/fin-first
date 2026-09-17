// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isInstalledApp, openBankAuth } from './open-bank-auth'

/**
 * B-051: in de geïnstalleerde app landt de terugkeer van de bank-app in de
 * browser. Daarom opent de app de bank in een apart venster en wacht zelf; in de
 * gewone browser blijft de navigatie in hetzelfde tabblad.
 */

function mockDisplayMode(standalone: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({ matches: standalone && q === '(display-mode: standalone)' })),
  )
}

function mockLocation() {
  const loc = { href: 'https://app.example/core/cash/connect' }
  vi.stubGlobal('location', loc)
  return loc
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('openBankAuth', () => {
  it('in de browser: navigeert in hetzelfde tabblad, geen apart venster', () => {
    mockDisplayMode(false)
    const loc = mockLocation()
    const open = vi.spyOn(window, 'open')
    expect(openBankAuth('https://auth.truelayer.com/x', 'conn-1')).toBe('same-tab')
    expect(open).not.toHaveBeenCalled()
    expect(loc.href).toBe('https://auth.truelayer.com/x')
  })

  it('in de geïnstalleerde app: opent een apart venster en blijft op de pagina', () => {
    mockDisplayMode(true)
    const loc = mockLocation()
    const win = { opener: {} as unknown }
    vi.spyOn(window, 'open').mockReturnValue(win as Window)
    expect(openBankAuth('https://auth.truelayer.com/x', 'conn-1')).toBe('window')
    expect(loc.href).toBe('https://app.example/core/cash/connect')
    expect(win.opener).toBeNull()
  })

  it('geblokkeerd venster in de app: valt terug op navigatie in hetzelfde tabblad', () => {
    mockDisplayMode(true)
    const loc = mockLocation()
    vi.spyOn(window, 'open').mockReturnValue(null)
    expect(openBankAuth('https://auth.truelayer.com/x', 'conn-1')).toBe('same-tab')
    expect(loc.href).toBe('https://auth.truelayer.com/x')
  })

  it('zonder koppel-id in de app: oude navigatie, want er valt niets te volgen', () => {
    mockDisplayMode(true)
    const loc = mockLocation()
    const open = vi.spyOn(window, 'open')
    expect(openBankAuth('https://auth.truelayer.com/x', null)).toBe('same-tab')
    expect(open).not.toHaveBeenCalled()
    expect(loc.href).toBe('https://auth.truelayer.com/x')
  })
})

describe('isInstalledApp', () => {
  it('volgt display-mode standalone', () => {
    mockDisplayMode(true)
    expect(isInstalledApp()).toBe(true)
    mockDisplayMode(false)
    expect(isInstalledApp()).toBe(false)
  })
})
