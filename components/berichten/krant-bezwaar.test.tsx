import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

/**
 * Het bezwaar tegen de Krant op de achtergrond, onder beide Kranten
 * (security-run R1 🟡-2: /privacy 2.4 belooft het "onderaan je Krant").
 * De uitleg volgt het echte gevolg: tijdlijn = niet meer automatisch
 * bijwerken; Krant met AI = proefedities en nieuwsprofiel weg.
 */

const refreshSpy = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshSpy }) }))

import { KrantBezwaar } from './krant-bezwaar'

const fetchMock = vi.fn()
beforeEach(() => {
  refreshSpy.mockReset()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
})

describe('KrantBezwaar', () => {
  it('tijdlijn: uitleg over automatisch bijwerken; bezwaar maken = PUT true + refresh', async () => {
    render(<KrantBezwaar bezwaar={false} context="tijdlijn" />)
    expect(screen.getByText(/houden we je nieuwsprofiel bij om de Krant te verbeteren/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Bezwaar maken' }))
    const dialoog = screen.getByRole('dialog')
    expect(within(dialoog).getByText(/niet meer automatisch bij/)).toBeTruthy()
    fireEvent.click(within(dialoog).getByRole('button', { name: 'Bezwaar maken' }))
    await waitFor(() => expect(refreshSpy).toHaveBeenCalledTimes(1))
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/krant/bezwaar')!
    expect(call[1]).toMatchObject({ method: 'PUT' })
    expect(JSON.parse(call[1].body as string)).toEqual({ bezwaar: true })
  })

  it('Krant met AI: uitleg over proefedities; het gevolg noemt het wissen van proefedities en nieuwsprofiel', () => {
    render(<KrantBezwaar bezwaar={false} context="ai" />)
    expect(screen.getByText(/Voor proefedities van de Krant/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Bezwaar maken' }))
    expect(within(screen.getByRole('dialog')).getByText(/wissen je proefedities en je nieuwsprofiel/)).toBeTruthy()
  })

  it('bestaand bezwaar: intrekken = PUT false; een fout blijft in de dialoog staan', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Even niet.' }), { status: 500, headers: { 'Content-Type': 'application/json' } }))
    render(<KrantBezwaar bezwaar context="ai" />)
    expect(screen.getByText(/Je hebt bezwaar gemaakt/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Bezwaar intrekken' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Bezwaar intrekken' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Even niet.'))
    expect(refreshSpy).not.toHaveBeenCalled()
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/krant/bezwaar')!
    expect(JSON.parse(call[1].body as string)).toEqual({ bezwaar: false })
  })
})
