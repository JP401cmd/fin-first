/**
 * Het beheerscherm voor de verspreiding (ADR 0147). Wat hier vastligt is het
 * CONTRACT met de route: wat het scherm laadt, en vooral wát het terugstuurt —
 * `handmatig` als lijst van `{ user_id, email }` en `regels` in de vorm van de
 * discriminated union uit `lib/questionnaires/verspreiding.ts`. Een verkeerde
 * veldnaam is hier onzichtbaar tot een beheerder merkt dat niemand de lijst
 * krijgt.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { STANDAARD_VERSPREIDING } from '@/lib/questionnaires/verspreiding'
import { VerspreidingSheet } from './verspreiding-sheet'

const QID = 'q-1'
const GEBRUIKER = { id: 'u-7', email: 'tess@voorbeeld.nl', name: 'Tess' }
const G1 = '11111111-1111-4111-8111-111111111111'
const G2 = '22222222-2222-4222-8222-222222222222'
const GROEPEN = [
  { id: G1, naam: 'Beta-cohort', omschrijving: null, soort: 'statisch', regels: null, leden: 12, created_at: '', updated_at: '' },
  {
    id: G2,
    naam: 'Trouwe gebruikers',
    omschrijving: null,
    soort: 'dynamisch',
    regels: [{ soort: 'actieve_dagen_30', min: 10 }],
    leden: 0,
    created_at: '',
    updated_at: '',
  },
]

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

function stubFetch({
  gebruiker = GEBRUIKER as typeof GEBRUIKER | null,
  groepen = GROEPEN as unknown[],
} = {}) {
  aanroepen = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null
      aanroepen.push({ url: String(url), method, body })

      if (String(url).includes('/verspreiding') && method === 'GET') {
        return json({
          verspreiding: structuredClone(STANDAARD_VERSPREIDING),
          handmatig: [],
          statistiek: { uitgenodigd: 4, gezien: 3, uitgesteld: 1, geweigerd: 0, gestart: 2, afgerond: 1 },
        })
      }
      if (String(url).includes('/verspreiding') && method === 'PUT') {
        return json({ success: true, verspreiding: body, handmatig: [] })
      }
      if (String(url).includes('/tier-assign')) return json({ user: gebruiker })
      if (String(url) === '/api/admin/user-groups') return json({ groepen })
      if (String(url) === '/api/admin/waardestromen') {
        return json({
          waardestromen: { stromen: [{ id: 'toekomst', naam: 'Toekomst', modules: ['toekomst'] }] },
          gebruik: null,
        })
      }
      return json({ error: 'onverwacht' }, 500)
    }),
  )
}

beforeEach(() => stubFetch())
afterEach(() => vi.unstubAllGlobals())

function toon() {
  return render(
    <VerspreidingSheet questionnaireId={QID} titel="Eerste indruk" onClose={() => {}} onSaved={() => {}} />,
  )
}

function laatstePut() {
  return aanroepen.filter((a) => a.method === 'PUT').at(-1)
}

describe('VerspreidingSheet', () => {
  it('laadt de huidige verspreiding en het bereik', async () => {
    toon()
    await waitFor(() =>
      expect(aanroepen[0]).toMatchObject({
        url: `/api/admin/questionnaires/${QID}/verspreiding`,
        method: 'GET',
      }),
    )
    expect(await screen.findByRole('region', { name: 'Bereik' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Iedereen/ })).toBeChecked()
    // De zes tellingen staan read-only op het scherm.
    expect(screen.getByText('Uitgenodigd')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('groepen: kiest groepen uit de lijst en stuurt hun ids mee', async () => {
    toon()
    fireEvent.click(await screen.findByRole('radio', { name: /Groepen/ }))

    const beta = await screen.findByRole('checkbox', { name: /Beta-cohort/ })
    expect(screen.getByText(/12 leden/)).toBeInTheDocument()
    expect(screen.getByText(/1 regel$/)).toBeInTheDocument()
    fireEvent.click(beta)

    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
    await waitFor(() => expect(laatstePut()).toBeTruthy())
    expect(laatstePut()!.body).toMatchObject({
      doelgroep: { modus: 'groepen', groep_ids: [G1] },
    })
  })

  it('groepen: zonder keuze geen PUT maar een melding', async () => {
    toon()
    fireEvent.click(await screen.findByRole('radio', { name: /Groepen/ }))
    await screen.findByRole('checkbox', { name: /Beta-cohort/ })

    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Kies minstens één groep')
    expect(laatstePut()).toBeUndefined()
  })

  it('groepen: lege stand verwijst naar het groepenbeheer', async () => {
    stubFetch({ groepen: [] })
    toon()
    fireEvent.click(await screen.findByRole('radio', { name: /Groepen/ }))
    const link = await screen.findByRole('link', { name: /Maak eerst een groep aan/ })
    expect(link).toHaveAttribute('href', '/beheer/gebruikersgroepen')
  })

  it('handmatig: zoekt een gebruiker op e-mail en stuurt hem mee bij opslaan', async () => {
    toon()
    fireEvent.click(await screen.findByRole('radio', { name: /Handmatig gekozen personen/ }))

    fireEvent.change(screen.getByLabelText('E-mailadres van de gebruiker'), {
      target: { value: 'tess@voorbeeld.nl' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Zoeken' }))

    await screen.findByText('tess@voorbeeld.nl')
    expect(
      aanroepen.some((a) => a.url.includes('/api/admin/tier-assign?email=tess%40voorbeeld.nl')),
    ).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    await waitFor(() => expect(laatstePut()).toBeTruthy())
    const put = laatstePut()!
    expect(put.body).toMatchObject({
      doelgroep: { modus: 'handmatig' },
      handmatig: [{ user_id: 'u-7', email: 'tess@voorbeeld.nl' }],
    })
  })

  it('handmatig: meldt een onbekend e-mailadres in plaats van stil te falen', async () => {
    stubFetch({ gebruiker: null })
    toon()
    fireEvent.click(await screen.findByRole('radio', { name: /Handmatig gekozen personen/ }))
    fireEvent.change(screen.getByLabelText('E-mailadres van de gebruiker'), {
      target: { value: 'niemand@voorbeeld.nl' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Zoeken' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Geen gebruiker gevonden')
  })

  it('regels: een toegevoegde regel gaat als discriminated union mee', async () => {
    toon()
    fireEvent.click(await screen.findByRole('radio', { name: /Op regels/ }))
    fireEvent.click(screen.getByRole('button', { name: '+ Regel' }))

    fireEvent.change(screen.getByLabelText('Regel 1 — soort'), {
      target: { value: 'actieve_dagen_30' },
    })
    fireEvent.change(screen.getByLabelText('Regel 1 — waarde'), { target: { value: '5' } })

    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    await waitFor(() => expect(laatstePut()).toBeTruthy())
    expect(laatstePut()!.body).toMatchObject({
      doelgroep: { modus: 'regels', regels: [{ soort: 'actieve_dagen_30', min: 5 }] },
    })
  })

  it('popup: aanzetten toont de drie instellingen en stuurt ze mee', async () => {
    toon()
    const schakelaar = await screen.findByRole('checkbox', {
      name: /Toon een popup bij eerstvolgend gebruik/,
    })
    fireEvent.click(schakelaar)

    expect(screen.getByLabelText(/Cooldown \(dagen\)/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Max\. keer uitstellen/), { target: { value: '3' } })

    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    await waitFor(() => expect(laatstePut()).toBeTruthy())
    expect(laatstePut()!.body).toMatchObject({
      popup: { aan: true, cooldown_dagen: 14, snooze_dagen: 7, max_weigeringen: 3 },
    })
  })

  it('toont een foutmelding uit de envelope', async () => {
    toon()
    await screen.findByRole('region', { name: 'Doelgroep' })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => json({ error: 'Te veel regels' }, 400)),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Te veel regels')
  })
})
