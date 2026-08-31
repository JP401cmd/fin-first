/**
 * DeelKaartSheet — het keuzemoment vóór het delen.
 *
 * Drie dingen mogen hier nooit stil wegvallen:
 *  1. de deel-tekst in de stand Weinig draagt uitsluitend vrijheidstijd plus de
 *     publieke check-link (geest van ADR 0067);
 *  2. de gekozen stand overleeft het venster (localStorage, gedeelde sleutel);
 *  3. de stand Veel — de enige die bedragen toont — wordt pas actief ná een
 *     expliciete bevestiging.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { PRIVACY_STORAGE_KEY, type FreedomCardData } from './freedom-card'
import { DeelKaartSheet, buildDeelTekst } from './deel-kaart-sheet'

function maakKaart(
  privacyLevel: FreedomCardData['privacyLevel'],
  overrides: Partial<FreedomCardData> = {},
): FreedomCardData {
  return {
    privacyLevel,
    freedomPercentage: 24.2,
    freedomDaysWon: 120,
    freedomDaysWonThisMonth: 5,
    fireCountdown: { years: 12, months: 3, days: 0, label: 'mrt 2038' },
    freedomTime: { years: 2, months: 9 },
    savingsRate: 31,
    generatedAt: '2026-08-31T10:00:00.000Z',
    ...(privacyLevel === 'anonymous' ? {} : { displayName: 'Jan' }),
    ...(privacyLevel === 'full' ? { netWorth: 84000, fireTarget: 620000 } : {}),
    ...overrides,
  }
}

// ── (b) Deel-tekst per stand ────────────────────────────────────────────────

describe('buildDeelTekst — stand Weinig deelt alleen vrijheidstijd', () => {
  const kaart = maakKaart('anonymous')

  it('noemt de vrijheidstijd', () => {
    expect(buildDeelTekst(kaart, 'https://app.trifinity.nl').text).toContain(
      '2 jaar en 9 maanden',
    )
  })

  it('bevat geen percentage, bedrag, vrijheidsdagen of spaarquote', () => {
    const inhoud = buildDeelTekst(kaart, 'https://app.trifinity.nl')
    const alles = `${inhoud.title} ${inhoud.text} ${inhoud.url}`
    expect(alles).not.toContain('%')
    expect(alles).not.toContain('€')
    expect(alles).not.toMatch(/spaarquote/i)
    expect(alles).not.toMatch(/vrijheidsdagen/i)
    expect(alles).not.toMatch(/FIRE/i)
  })

  it('wijst naar de publieke check, niet naar de kale origin', () => {
    expect(buildDeelTekst(kaart, 'https://app.trifinity.nl').url).toBe(
      'https://app.trifinity.nl/check',
    )
    // Ook met een trailing slash blijft de link precies één /check.
    expect(buildDeelTekst(kaart, 'https://app.trifinity.nl/').url).toBe(
      'https://app.trifinity.nl/check',
    )
  })

  it('valt zonder vrijheidstijd terug op een tekst zónder cijfers', () => {
    const leeg = maakKaart('anonymous', { freedomTime: { years: 0, months: 0 } })
    const inhoud = buildDeelTekst(leeg, 'https://app.trifinity.nl')
    expect(inhoud.text).toMatch(/geld is opgeslagen tijd/i)
    expect(inhoud.text).not.toContain('%')
    // `freedomTimeLong` is bij een vers account de truthy string '0 dagen' —
    // die mag hier nooit doorsijpelen ("Ik kocht al 0 dagen vrijheid").
    expect(inhoud.text).not.toMatch(/\d/)
  })
})

describe('buildDeelTekst — Gemiddeld/Veel houden de rijkere tekst', () => {
  it('noemt percentage en vrijheidsdagen, met dezelfde check-link', () => {
    const inhoud = buildDeelTekst(maakKaart('named'), 'https://app.trifinity.nl')
    expect(inhoud.text).toContain('24.2%')
    expect(inhoud.text).toMatch(/vrijheidsdagen/i)
    expect(inhoud.url).toBe('https://app.trifinity.nl/check')
  })
})

// ── (c) + (d) De standen-keuze in de sheet ──────────────────────────────────

describe('DeelKaartSheet — standen kiezen', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    fetchMock = vi.fn((url: string) => {
      const niveau = (new URL(String(url), 'http://localhost').searchParams.get('privacy') ??
        'anonymous') as FreedomCardData['privacyLevel']
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => maakKaart(niveau),
      })
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  async function open() {
    render(<DeelKaartSheet open onClose={vi.fn()} />)
    // Wacht tot het eerste voorbeeld geladen is; daarna is de sheet in rust.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    return screen
  }

  it('start op Weinig en haalt daarvoor de kaart op', async () => {
    await open()
    await waitFor(() =>
      expect(String(fetchMock.mock.calls[0][0])).toContain('privacy=anonymous'),
    )
    const weinig = screen.getByRole('radio', { name: /weinig/i }) as HTMLInputElement
    expect(weinig.checked).toBe(true)
  })

  it('onthoudt een gekozen stand in localStorage', async () => {
    await open()
    fireEvent.click(screen.getByRole('radio', { name: /gemiddeld/i }))

    await waitFor(() => expect(localStorage.getItem(PRIVACY_STORAGE_KEY)).toBe('named'))
    const gemiddeld = screen.getByRole('radio', { name: /gemiddeld/i }) as HTMLInputElement
    expect(gemiddeld.checked).toBe(true)
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('privacy=named'))).toBe(
        true,
      ),
    )
  })

  it('leest een eerder gekozen stand terug bij openen', async () => {
    localStorage.setItem(PRIVACY_STORAGE_KEY, 'named')
    await open()
    const gemiddeld = screen.getByRole('radio', { name: /gemiddeld/i }) as HTMLInputElement
    await waitFor(() => expect(gemiddeld.checked).toBe(true))
  })

  it('maakt Veel pas actief ná een expliciete bevestiging', async () => {
    await open()
    fireEvent.click(screen.getByRole('radio', { name: /veel/i }))

    // Bevestiging staat er; de stand is nog NIET gewisseld en er is niets
    // opgeslagen of opgehaald voor 'full'.
    expect(screen.getByText(/bedragen op je kaart\?/i)).toBeTruthy()
    expect(localStorage.getItem(PRIVACY_STORAGE_KEY)).toBeNull()
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).includes('privacy=full')),
    ).toBe(false)
    expect((screen.getByRole('radio', { name: /weinig/i }) as HTMLInputElement).checked).toBe(
      true,
    )

    fireEvent.click(screen.getByRole('button', { name: /ja, bedragen tonen/i }))

    await waitFor(() => expect(localStorage.getItem(PRIVACY_STORAGE_KEY)).toBe('full'))
    expect((screen.getByRole('radio', { name: /veel/i }) as HTMLInputElement).checked).toBe(
      true,
    )
  })

  it('annuleren laat de stand ongemoeid', async () => {
    await open()
    fireEvent.click(screen.getByRole('radio', { name: /veel/i }))
    fireEvent.click(screen.getByRole('button', { name: /annuleren/i }))

    expect(screen.queryByText(/bedragen op je kaart\?/i)).toBeNull()
    expect(localStorage.getItem(PRIVACY_STORAGE_KEY)).toBeNull()
    expect((screen.getByRole('radio', { name: /weinig/i }) as HTMLInputElement).checked).toBe(
      true,
    )
  })

  it('een onthouden Veel-stand vraagt de bevestiging opnieuw en fetcht niet vooruit', async () => {
    // "Alleen na bevestiging" geldt élke sessie: opgeslagen 'full' opent op
    // Gemiddeld mét de bevestigingsvraag, en er gaat géén full-fetch de deur
    // uit vóór de expliciete ja.
    localStorage.setItem(PRIVACY_STORAGE_KEY, 'full')
    await open()

    expect(screen.getByText(/bedragen op je kaart\?/i)).toBeTruthy()
    expect(
      (screen.getByRole('radio', { name: /gemiddeld/i }) as HTMLInputElement).checked,
    ).toBe(true)
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).includes('privacy=full')),
    ).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /ja, bedragen tonen/i }))
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((c) => String(c[0]).includes('privacy=full')),
      ).toBe(true),
    )
    expect((screen.getByRole('radio', { name: /veel/i }) as HTMLInputElement).checked).toBe(
      true,
    )
  })

  it('terugwisselen naar een gecachete stand laat Delen niet op slot staan', async () => {
    // Regressie: de wissel-terug nam de cache-tak zonder de laadvlag te
    // resetten, terwijl de afgebroken fetch van de tussenstand 'm ook niet meer
    // terugzette — Delen/Download bleven dan disabled bij een zichtbare kaart.
    // De named-fetch hangt hier bewust voor eeuwig om precies dat pad te raken.
    fetchMock.mockImplementation((url: string) => {
      const niveau = new URL(String(url), 'http://localhost').searchParams.get('privacy')
      if (niveau === 'named') return new Promise(() => {})
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => maakKaart('anonymous'),
      })
    })

    await open()
    const deelKnop = () => screen.getByRole('button', { name: 'Delen' }) as HTMLButtonElement
    await waitFor(() => expect(deelKnop().disabled).toBe(false))

    fireEvent.click(screen.getByRole('radio', { name: /gemiddeld/i }))
    await waitFor(() => expect(deelKnop().disabled).toBe(true))

    fireEvent.click(screen.getByRole('radio', { name: /weinig/i }))
    await waitFor(() => expect(deelKnop().disabled).toBe(false))
  })
})
