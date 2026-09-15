/**
 * De gedeelde e-mailzoeker (ADR 0147): zoekt exact één adres via de bestaande
 * beheerroute, voegt geen dubbelen toe en meldt een onbekend adres.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GebruikerZoeker, type GekozenGebruiker } from './gebruiker-zoeker'

let gebruiker: { id: string; email: string } | null
let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  gebruiker = { id: 'u-7', email: 'tess@voorbeeld.nl' }
  fetchSpy = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ user: gebruiker }), { status: 200 })))
  vi.stubGlobal('fetch', fetchSpy)
})
afterEach(() => vi.unstubAllGlobals())

function Harnas({ begin = [] as GekozenGebruiker[], eenheid }: { begin?: GekozenGebruiker[]; eenheid?: { een: string; meer: string } }) {
  const [gekozen, setGekozen] = useState(begin)
  return <GebruikerZoeker gekozen={gekozen} onChange={setGekozen} eenheid={eenheid} />
}

function zoek(email: string) {
  fireEvent.change(screen.getByLabelText('E-mailadres van de gebruiker'), { target: { value: email } })
  fireEvent.click(screen.getByRole('button', { name: 'Zoeken' }))
}

describe('GebruikerZoeker', () => {
  it('zoekt op e-mail en voegt de gebruiker toe', async () => {
    render(<Harnas />)
    zoek('tess@voorbeeld.nl')
    expect(await screen.findByText('tess@voorbeeld.nl')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/tier-assign?email=tess%40voorbeeld.nl')
    expect(screen.getByText('1 persoon gekozen')).toBeInTheDocument()
    expect(screen.getByLabelText('E-mailadres van de gebruiker')).toHaveValue('')
  })

  it('voegt dezelfde gebruiker niet twee keer toe', async () => {
    render(<Harnas begin={[{ user_id: 'u-7', email: 'tess@voorbeeld.nl' }]} eenheid={{ een: 'lid', meer: 'leden' }} />)
    zoek('tess@voorbeeld.nl')
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByLabelText('E-mailadres van de gebruiker')).toHaveValue(''))
    expect(screen.getAllByText('tess@voorbeeld.nl')).toHaveLength(1)
    expect(screen.getByText('1 lid gekozen')).toBeInTheDocument()
  })

  it('meldt een onbekend adres', async () => {
    gebruiker = null
    render(<Harnas />)
    zoek('niemand@voorbeeld.nl')
    expect(await screen.findByRole('alert')).toHaveTextContent('Geen gebruiker gevonden met niemand@voorbeeld.nl')
  })

  it('verwijdert een gekozen gebruiker', () => {
    render(<Harnas begin={[{ user_id: 'u-1', email: 'an@voorbeeld.nl' }, { user_id: 'u-2', email: null }]} />)
    expect(screen.getByText('u-2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'an@voorbeeld.nl verwijderen' }))
    expect(screen.queryByText('an@voorbeeld.nl')).not.toBeInTheDocument()
    expect(screen.getByText('1 persoon gekozen')).toBeInTheDocument()
  })
})
