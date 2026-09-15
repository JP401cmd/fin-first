/**
 * Beheer van gebruikersgroepen (ADR 0147 fase 3). Vastgelegd is het contract
 * met de routes: POST/PUT van de groep in de vorm van `GroepInvoerSchema`, bij
 * een statische groep daarna de volledige ledenlijst als `user_ids`, een
 * vergrendelde soort bij bewerken en verwijderen alleen via een bevestiging.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { GebruikersgroepenBeheer } from './gebruikersgroepen-beheer'

const GID = '33333333-3333-4333-8333-333333333333'
const NIEUW_ID = '44444444-4444-4444-8444-444444444444'
const TESS = { id: '55555555-5555-4555-8555-555555555555', email: 'tess@voorbeeld.nl', name: 'Tess' }

const STATISCH = {
  id: GID,
  naam: 'Beta-cohort',
  omschrijving: 'Eerste twintig testers',
  soort: 'statisch',
  regels: null,
  leden: 2,
  created_at: '2026-09-15T10:00:00Z',
  updated_at: '2026-09-15T10:00:00Z',
}

interface Aanroep {
  url: string
  method: string
  body: Record<string, unknown> | null
}
let aanroepen: Aanroep[]

function json(data: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

function stubFetch({ groepen = [STATISCH] as unknown[] } = {}) {
  aanroepen = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const u = String(url)
      const method = init?.method ?? 'GET'
      const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null
      aanroepen.push({ url: u, method, body })

      if (u === '/api/admin/user-groups' && method === 'GET') return json({ groepen })
      if (u === '/api/admin/user-groups' && method === 'POST') {
        return json({ groep: { ...body, id: NIEUW_ID, leden: 0 } }, 201)
      }
      if (u === `/api/admin/user-groups/${GID}` && method === 'GET') {
        return json({
          groep: STATISCH,
          leden: [{ user_id: 'u-1', email: 'an@voorbeeld.nl', added_at: '2026-09-15T10:00:00Z' }],
        })
      }
      if (u.startsWith('/api/admin/user-groups/') && u.endsWith('/leden') && method === 'PUT') {
        return json({ leden: [] })
      }
      if (u.startsWith('/api/admin/user-groups/') && method === 'PUT') return json({ groep: body })
      if (u.startsWith('/api/admin/user-groups/') && method === 'DELETE') return json({ success: true })
      if (u === '/api/admin/waardestromen') {
        return json({ waardestromen: { stromen: [{ id: 'toekomst', naam: 'Toekomst', modules: ['toekomst'] }] }, gebruik: null })
      }
      if (u.startsWith('/api/admin/tier-assign')) return json({ user: TESS })
      return json({ error: 'onverwacht' }, 500)
    }),
  )
}

beforeEach(() => stubFetch())
afterEach(() => vi.unstubAllGlobals())

const van = (method: string, pad: string | RegExp) =>
  aanroepen.filter((a) => a.method === method && (typeof pad === 'string' ? a.url === pad : pad.test(a.url)))

describe('GebruikersgroepenBeheer', () => {
  it('toont de lijst met soort en omvang', async () => {
    render(<GebruikersgroepenBeheer />)
    expect(await screen.findByText('Beta-cohort')).toBeInTheDocument()
    expect(screen.getByText('Statisch')).toBeInTheDocument()
    expect(screen.getByText('2 leden')).toBeInTheDocument()
    expect(screen.getByText('Eerste twintig testers')).toBeInTheDocument()
  })

  it('lege stand', async () => {
    stubFetch({ groepen: [] })
    render(<GebruikersgroepenBeheer />)
    expect(await screen.findByText('Nog geen gebruikersgroepen.')).toBeInTheDocument()
  })

  it('statisch aanmaken: POST van de groep, daarna PUT van de leden', async () => {
    render(<GebruikersgroepenBeheer />)
    await screen.findByText('Beta-cohort')
    fireEvent.click(screen.getByRole('button', { name: 'Nieuwe groep' }))

    fireEvent.change(await screen.findByLabelText('Naam van de groep'), { target: { value: 'Interviews sep' } })
    expect(screen.getByRole('radio', { name: /Statisch/ })).toBeChecked()

    fireEvent.change(screen.getByLabelText('E-mailadres van de gebruiker'), {
      target: { value: 'tess@voorbeeld.nl' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Zoeken' }))
    await screen.findByText('tess@voorbeeld.nl')

    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    await waitFor(() => expect(van('PUT', `/api/admin/user-groups/${NIEUW_ID}/leden`)).toHaveLength(1))
    expect(van('POST', '/api/admin/user-groups')[0].body).toEqual({
      naam: 'Interviews sep',
      omschrijving: null,
      soort: 'statisch',
      regels: [],
    })
    expect(van('PUT', `/api/admin/user-groups/${NIEUW_ID}/leden`)[0].body).toEqual({ user_ids: [TESS.id] })
  })

  it('dynamisch aanmaken: POST met regels, geen ledenlijst', async () => {
    render(<GebruikersgroepenBeheer />)
    await screen.findByText('Beta-cohort')
    fireEvent.click(screen.getByRole('button', { name: 'Nieuwe groep' }))

    fireEvent.change(await screen.findByLabelText('Naam van de groep'), { target: { value: 'Trouwe gebruikers' } })
    fireEvent.click(screen.getByRole('radio', { name: /Dynamisch/ }))
    fireEvent.click(screen.getByRole('button', { name: '+ Regel' }))
    fireEvent.change(screen.getByLabelText('Regel 1 — soort'), { target: { value: 'actieve_dagen_30' } })
    fireEvent.change(screen.getByLabelText('Regel 1 — waarde'), { target: { value: '12' } })

    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    await waitFor(() => expect(van('POST', '/api/admin/user-groups')).toHaveLength(1))
    expect(van('POST', '/api/admin/user-groups')[0].body).toMatchObject({
      soort: 'dynamisch',
      regels: [{ soort: 'actieve_dagen_30', min: 12 }],
    })
    // Lijst wordt herladen na opslaan, en er gaat geen ledenlijst mee.
    await waitFor(() => expect(van('GET', '/api/admin/user-groups').length).toBeGreaterThanOrEqual(2))
    expect(van('PUT', /\/leden$/)).toHaveLength(0)
  })

  it('dynamisch zonder regel: melding, geen POST', async () => {
    render(<GebruikersgroepenBeheer />)
    await screen.findByText('Beta-cohort')
    fireEvent.click(screen.getByRole('button', { name: 'Nieuwe groep' }))
    fireEvent.change(await screen.findByLabelText('Naam van de groep'), { target: { value: 'Leeg' } })
    fireEvent.click(screen.getByRole('radio', { name: /Dynamisch/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('minstens één regel')
    expect(van('POST', '/api/admin/user-groups')).toHaveLength(0)
  })

  it('bewerken: laadt de groep, vergrendelt de soort en stuurt PUT', async () => {
    render(<GebruikersgroepenBeheer />)
    await screen.findByText('Beta-cohort')
    fireEvent.click(screen.getByRole('button', { name: 'Beta-cohort bewerken' }))

    const naam = await screen.findByDisplayValue('Beta-cohort')
    expect(screen.getByText('an@voorbeeld.nl')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Statisch/ })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /Dynamisch/ })).toBeDisabled()
    expect(screen.getByText(/De soort ligt vast na het aanmaken/)).toBeInTheDocument()

    fireEvent.change(naam, { target: { value: 'Beta-cohort 1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    await waitFor(() => expect(van('PUT', `/api/admin/user-groups/${GID}/leden`)).toHaveLength(1))
    expect(van('PUT', `/api/admin/user-groups/${GID}`)[0].body).toMatchObject({
      naam: 'Beta-cohort 1',
      soort: 'statisch',
    })
    expect(van('PUT', `/api/admin/user-groups/${GID}/leden`)[0].body).toEqual({ user_ids: ['u-1'] })
  })

  it('verwijderen gaat via een bevestiging', async () => {
    render(<GebruikersgroepenBeheer />)
    await screen.findByText('Beta-cohort')
    fireEvent.click(screen.getByRole('button', { name: 'Beta-cohort verwijderen' }))

    const tekst = await screen.findByText(/bereiken deze mensen daarna niet meer/)
    expect(van('DELETE', `/api/admin/user-groups/${GID}`)).toHaveLength(0)

    const dialoog = tekst.closest('[role="dialog"]') as HTMLElement
    fireEvent.click(within(dialoog).getByRole('button', { name: 'Verwijderen' }))

    await waitFor(() => expect(van('DELETE', `/api/admin/user-groups/${GID}`)).toHaveLength(1))
  })
})
