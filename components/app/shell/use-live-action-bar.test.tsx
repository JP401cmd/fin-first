import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { useState } from 'react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/toekomst/doelen',
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}))

import { NavStackProvider } from './nav-stack-provider'
import { MobileBottomBar } from './mobile-bottom-bar'
import { useLiveActionBar, type LiveActionBarConfig } from './use-live-action-bar'

function Registreerder({ config }: { config: LiveActionBarConfig | null }) {
  useLiveActionBar(config)
  return null
}

function Host({ start }: { start: LiveActionBarConfig | null }) {
  const [config, setConfig] = useState<LiveActionBarConfig | null>(start)
  const [gemount, setGemount] = useState(true)
  return (
    <NavStackProvider>
      {gemount && <Registreerder config={config} />}
      <MobileBottomBar config={{ kind: 'tabs' }} />
      <button onClick={() => setConfig(null)}>wis</button>
      <button onClick={() => setGemount(false)}>unmount</button>
    </NavStackProvider>
  )
}

afterEach(cleanup)

describe('useLiveActionBar', () => {
  it('registreert primair en secundair in de shell-bar', () => {
    const vastleggen = vi.fn()
    render(
      <Host
        start={{ primary: { label: 'Doel vastleggen', onClick: vastleggen }, secondary: { label: 'Terug naar basis', onClick: vi.fn() } }}
      />,
    )
    expect(screen.getByTestId('shell-action-bar')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Doel vastleggen' }))
    expect(vastleggen).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Terug naar basis' })).toBeTruthy()
  })

  it('disabled → knop zonder handler (disabled gerenderd)', () => {
    render(<Host start={{ primary: { label: 'Doel bijwerken', onClick: vi.fn(), disabled: true } }} />)
    expect((screen.getByRole('button', { name: 'Doel bijwerken' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('null wist de bar', () => {
    render(<Host start={{ primary: { label: 'Doel vastleggen', onClick: vi.fn() } }} />)
    fireEvent.click(screen.getByText('wis'))
    expect(screen.queryByTestId('shell-action-bar')).toBeNull()
  })

  it('zonder extra: geen extra rij (andere gebruikers van de bar veranderen niet)', () => {
    render(<Host start={{ primary: { label: 'Doel vastleggen', onClick: vi.fn() } }} />)
    expect(screen.queryByTestId('shell-action-bar-extra')).toBeNull()
  })

  it('extra: een tekstrij boven de knoppen, met knop en link', () => {
    const stop = vi.fn()
    render(
      <Host
        start={{
          primary: { label: 'Doel bijwerken', onClick: vi.fn() },
          secondary: { label: 'Herstel mijn doel', onClick: vi.fn() },
          extra: [
            { label: 'Maak 60 jaar mijn stopmoment', onClick: stop },
            { label: 'Je plan-keuzes →', href: '/toekomst/instellingen' },
          ],
        }}
      />,
    )
    const rij = screen.getByTestId('shell-action-bar-extra')
    expect(rij.getAttribute('role')).toBe('group')
    // De rij staat vóór de knoppen, binnen dezelfde bar.
    const bar = screen.getByTestId('shell-action-bar')
    expect(bar.firstElementChild).toBe(rij)
    fireEvent.click(screen.getByRole('button', { name: 'Maak 60 jaar mijn stopmoment' }))
    expect(stop).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: 'Je plan-keuzes →' }).getAttribute('href')).toBe('/toekomst/instellingen')
    // Raakgebied minstens 44px (min-h-11).
    expect(screen.getByRole('button', { name: 'Maak 60 jaar mijn stopmoment' }).className).toContain('min-h-11')
  })

  it('extra: disabled → knop zonder handler', () => {
    render(
      <Host
        start={{
          primary: { label: 'Doel bijwerken', onClick: vi.fn() },
          extra: [{ label: 'Loslaten', onClick: vi.fn(), disabled: true }],
        }}
      />,
    )
    expect((screen.getByRole('button', { name: 'Loslaten' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('extra: een verse handler bij dezelfde vorm wordt gebruikt zonder herregistratie', () => {
    const eerste = vi.fn()
    const tweede = vi.fn()
    function Wissel() {
      const [h, setH] = useState(() => eerste)
      return (
        <NavStackProvider>
          <Registreerder config={{ primary: { label: 'P', onClick: vi.fn() }, extra: [{ label: 'Extra', onClick: h }] }} />
          <MobileBottomBar config={{ kind: 'tabs' }} />
          <button onClick={() => setH(() => tweede)}>wissel</button>
        </NavStackProvider>
      )
    }
    render(<Wissel />)
    fireEvent.click(screen.getByText('wissel'))
    fireEvent.click(screen.getByRole('button', { name: 'Extra' }))
    expect(eerste).not.toHaveBeenCalled()
    expect(tweede).toHaveBeenCalledTimes(1)
  })

  it('extra: een wijziging in label of disabled herregistreert', () => {
    function Wissel() {
      const [bezig, setBezig] = useState(false)
      return (
        <NavStackProvider>
          <Registreerder
            config={{
              primary: { label: 'P', onClick: vi.fn() },
              extra: [{ label: bezig ? 'Opslaan…' : 'Maak 60 jaar mijn stopmoment', onClick: vi.fn(), disabled: bezig }],
            }}
          />
          <MobileBottomBar config={{ kind: 'tabs' }} />
          <button onClick={() => setBezig(true)}>bezig</button>
        </NavStackProvider>
      )
    }
    render(<Wissel />)
    fireEvent.click(screen.getByText('bezig'))
    expect((screen.getByRole('button', { name: 'Opslaan…' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('unmount wist de bar', () => {
    render(<Host start={{ primary: { label: 'Doel vastleggen', onClick: vi.fn() } }} />)
    fireEvent.click(screen.getByText('unmount'))
    expect(screen.queryByTestId('shell-action-bar')).toBeNull()
  })
})
