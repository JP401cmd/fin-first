import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'

/**
 * B-051: het wachtscherm van de geïnstalleerde app volgt één koppelpoging. Het
 * gaat zelf door bij succes, zegt het bij een mislukking en blijft niet een
 * kwartier hangen als de sessie verloopt.
 */

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

import { BankAuthWaiting } from './bank-auth-waiting'

function respond(status: number, body: unknown = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body }),
  )
}

async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  replace.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('BankAuthWaiting', () => {
  it('volgt déze poging via connection-status en gaat door bij gelukt', async () => {
    respond(200, { outcome: 'gelukt' })
    render(<BankAuthWaiting connectionId="conn-1" onCancel={() => {}} />)
    await tick()
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/bank-connect/connection-status?id=conn-1')
    expect(replace).toHaveBeenCalledWith('/core/cash/connect/success')
  })

  it('met onSuccess: roept die aan in plaats van naar de succespagina te gaan (onboarding)', async () => {
    respond(200, { outcome: 'gelukt' })
    const onSuccess = vi.fn()
    render(<BankAuthWaiting connectionId="conn-1" onCancel={() => {}} onSuccess={onSuccess} />)
    await tick()
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalled()
  })

  it('blijft wachten zolang de bank bezig is', async () => {
    respond(200, { outcome: 'wachten' })
    render(<BankAuthWaiting connectionId="conn-1" onCancel={() => {}} />)
    await tick()
    expect(replace).not.toHaveBeenCalled()
    expect(screen.getByText('Rond het koppelen af bij je bank')).toBeTruthy()
  })

  it('zegt het bij een mislukking in plaats van door te wachten', async () => {
    respond(200, { outcome: 'mislukt' })
    render(<BankAuthWaiting connectionId="conn-1" onCancel={() => {}} />)
    await tick()
    expect(screen.getByRole('alert').textContent).toContain('Het koppelen is niet gelukt')
    expect(replace).not.toHaveBeenCalled()
  })

  it('stopt bij een verlopen sessie', async () => {
    respond(401, { error: 'Niet ingelogd' })
    render(<BankAuthWaiting connectionId="conn-1" onCancel={() => {}} />)
    await tick()
    expect(screen.getByText('Je bent uitgelogd')).toBeTruthy()
  })
})
