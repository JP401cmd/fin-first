/**
 * De productkeuze op /beheer/gebruikers (Krant 2D fase 1, B12): elke keuze
 * gaat eerst via een bevestiging, en pas daarna naar
 * POST /api/admin/users/product.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ProductKeuze } from './product-keuze'

const USER_ID = '4f1c2a7e-9b3d-4e8a-8c21-5d6f7a8b9c0d'
let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })))
  vi.stubGlobal('fetch', fetchSpy)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ProductKeuze', () => {
  it('opent een bevestiging en schrijft pas na bevestigen', async () => {
    const onStatus = vi.fn()
    render(<ProductKeuze userId={USER_ID} naam="Tess" onStatus={onStatus} />)

    fireEvent.click(screen.getByRole('button', { name: 'Zet op Krant' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Alle gegevens blijven staan')
    expect(fetchSpy).not.toHaveBeenCalled()

    fireEvent.click(screen.getAllByRole('button', { name: 'Zet op Krant' }).at(-1)!)
    await vi.waitFor(() => expect(onStatus).toHaveBeenCalledWith({ type: 'success', message: 'Tess staat nu op Krant' }))
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/admin/users/product')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ userId: USER_ID, product: 'krant' })
  })

  it('annuleren schrijft niets', () => {
    render(<ProductKeuze userId={USER_ID} naam="Tess" onStatus={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Zet op Geheel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Annuleren' }))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('meldt een fout van de route', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'Niet gevonden' }), { status: 404 })),
    )
    const onStatus = vi.fn()
    render(<ProductKeuze userId={USER_ID} naam="Tess" onStatus={onStatus} />)
    fireEvent.click(screen.getByRole('button', { name: 'Zet op Geheel' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Zet op Geheel' }).at(-1)!)
    await vi.waitFor(() => expect(onStatus).toHaveBeenCalledWith({ type: 'error', message: 'Niet gevonden' }))
  })
})
