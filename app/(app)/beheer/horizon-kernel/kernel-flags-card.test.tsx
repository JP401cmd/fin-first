import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import KernelFlagsCard from './kernel-flags-card'

type Flags = { convergentie: boolean; whatif: boolean; household: boolean; scalar: boolean }

const ALL_OFF: Flags = { convergentie: false, whatif: false, household: false, scalar: false }

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('KernelFlagsCard', () => {
  it('rendert 4 toggles uit de GET-stand', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ flags: { ...ALL_OFF, whatif: true } })),
    )
    render(<KernelFlagsCard />)

    await waitFor(() => {
      expect(screen.getAllByRole('switch')).toHaveLength(4)
    })
    const switches = screen.getAllByRole('switch')
    // convergentie=off, whatif=on
    expect(switches[0]).toHaveAttribute('aria-checked', 'false')
    expect(switches[1]).toHaveAttribute('aria-checked', 'true')
  })

  it('stuurt bij klik een PUT met de juiste body en flipt aria-checked', async () => {
    const fetchMock = vi
      .fn()
      // GET
      .mockResolvedValueOnce(jsonResponse({ flags: ALL_OFF }))
      // PUT
      .mockResolvedValueOnce(jsonResponse({ flags: { ...ALL_OFF, convergentie: true } }))
    vi.stubGlobal('fetch', fetchMock)

    render(<KernelFlagsCard />)
    await waitFor(() => expect(screen.getAllByRole('switch')).toHaveLength(4))

    const first = screen.getAllByRole('switch')[0]
    expect(first).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(first)

    await waitFor(() => expect(first).toHaveAttribute('aria-checked', 'true'))

    const putCall = fetchMock.mock.calls[1]
    expect(putCall[0]).toBe('/api/horizon-kernel-flags')
    expect(putCall[1]).toMatchObject({ method: 'PUT' })
    expect(JSON.parse(putCall[1].body)).toEqual({ flag: 'convergentie', enabled: true })
  })

  it('rolt terug en toont een foutmelding als de PUT faalt', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ flags: ALL_OFF }))
      .mockResolvedValueOnce(jsonResponse({}, false, 500))
    vi.stubGlobal('fetch', fetchMock)

    render(<KernelFlagsCard />)
    await waitFor(() => expect(screen.getAllByRole('switch')).toHaveLength(4))

    const first = screen.getAllByRole('switch')[0]
    fireEvent.click(first)

    // Optimistic on, dan rollback naar off
    await waitFor(() => expect(first).toHaveAttribute('aria-checked', 'false'))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/kon de vlag niet opslaan/i)).toBeInTheDocument()
  })
})
