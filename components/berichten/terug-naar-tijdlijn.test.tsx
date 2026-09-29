import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const refreshSpy = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshSpy, push: vi.fn(), replace: vi.fn() }),
}))

import { TerugNaarTijdlijn } from './terug-naar-tijdlijn'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  refreshSpy.mockReset()
  fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TerugNaarTijdlijn', () => {
  it('zet de variant op tijdlijn en ververst', async () => {
    render(<TerugNaarTijdlijn />)
    expect(screen.getByText(/Je leest de Krant met AI/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Naar de tijdlijn' }))
    await waitFor(() => expect(refreshSpy).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/krant/variant')
    expect(init).toMatchObject({ method: 'PUT' })
    expect(JSON.parse(init.body as string)).toEqual({ variant: 'tijdlijn' })
  })

  it('toont de fouttekst uit de envelope', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Niet ingelogd' }), { status: 401 }))
    render(<TerugNaarTijdlijn />)
    fireEvent.click(screen.getByRole('button', { name: 'Naar de tijdlijn' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Niet ingelogd'))
    expect(refreshSpy).not.toHaveBeenCalled()
  })
})
