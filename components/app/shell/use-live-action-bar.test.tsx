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

  it('unmount wist de bar', () => {
    render(<Host start={{ primary: { label: 'Doel vastleggen', onClick: vi.fn() } }} />)
    fireEvent.click(screen.getByText('unmount'))
    expect(screen.queryByTestId('shell-action-bar')).toBeNull()
  })
})
