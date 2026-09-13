import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AowNoticeProvider, AowNoticeDot, useAowNotice } from './aow-notice-provider'

/**
 * TPR-04 — gedragstests op het minimaliseren van de "AOW ontbreekt"-melding op
 * /toekomst (spiegel van deficit-notice-provider.test.tsx, zonder escalatie-as):
 *  A. melding en statuspunt delen één toestand;
 *  B. minimaliseren schrijft vlag 1 naar het BESTAANDE pref-pad onder
 *     `/toekomst/aow-ontbreekt`; heropenen schrijft null;
 *  C. een server-geseede vlag start geminimaliseerd (geen flits);
 *  D. zonder provider: uitgeklapt, geen knop;
 *  E. mislukte PUT rolt terug.
 */

function Melding({ present }: { present: boolean }) {
  const { display, canMinimize, minimize } = useAowNotice(present)
  return (
    <div>
      <span data-testid="display">{display}</span>
      <span data-testid="can-minimize">{String(canMinimize)}</span>
      {display === 'expanded' && <p>Geen AOW op je tijdas</p>}
      {canMinimize && (
        <button type="button" onClick={minimize}>
          Minimaliseren
        </button>
      )}
    </div>
  )
}

function setup(present: boolean, initialMinimizedFlag: number | null = null) {
  return render(
    <AowNoticeProvider initialMinimizedFlag={initialMinimizedFlag}>
      <AowNoticeDot />
      <Melding present={present} />
    </AowNoticeProvider>,
  )
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AowNoticeProvider — uitgeklapt ↔ geminimaliseerd', () => {
  it('toont de melding uitgeklapt en géén punt zolang er niet geminimaliseerd is', () => {
    setup(true)
    expect(screen.getByTestId('display').textContent).toBe('expanded')
    expect(screen.getByText('Geen AOW op je tijdas')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /toon de melding/i })).toBeNull()
  })

  it('vervangt na "Minimaliseren" de melding door het statuspunt, en heropent bij klik', async () => {
    setup(true)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Minimaliseren' }))
    })
    expect(screen.getByTestId('display').textContent).toBe('minimized')
    const punt = screen.getByRole('button', { name: /toon de melding over je AOW/i })
    expect(punt.getAttribute('aria-label')).toBe('Aandacht — toon de melding over je AOW')
    expect(punt.className).toContain('h-7 w-7')
    await act(async () => {
      fireEvent.click(punt)
    })
    expect(screen.getByTestId('display').textContent).toBe('expanded')
  })

  it("geeft 'none' en géén punt zonder notice", () => {
    setup(false)
    expect(screen.getByTestId('display').textContent).toBe('none')
    expect(screen.queryByRole('button', { name: /toon de melding/i })).toBeNull()
  })
})

describe('AowNoticeProvider — server-side onthouden', () => {
  it('schrijft vlag 1 naar het bestaande pref-pad onder de AOW-sleutel; heropenen wist (null)', async () => {
    setup(true)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Minimaliseren' }))
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/overzicht/page-status')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ route: '/toekomst/aow-ontbreekt', level: 1 })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /toon de melding/i }))
    })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ route: '/toekomst/aow-ontbreekt', level: null })
  })

  it('start meteen geminimaliseerd bij een server-geseede vlag (geen flits, geen fetch)', () => {
    setup(true, 1)
    expect(screen.getByTestId('display').textContent).toBe('minimized')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('gebruikt geen localStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    setup(true)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Minimaliseren' }))
    })
    expect(setItem).not.toHaveBeenCalled()
  })

  it('rolt terug wanneer de PUT faalt', async () => {
    fetchMock.mockResolvedValue({ ok: false })
    setup(true)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Minimaliseren' }))
    })
    expect(screen.getByTestId('display').textContent).toBe('expanded')
  })
})

describe('useAowNotice — zonder provider', () => {
  it('houdt de melding uitgeklapt en biedt geen minimaliseer-knop aan', () => {
    render(<Melding present={true} />)
    expect(screen.getByTestId('display').textContent).toBe('expanded')
    expect(screen.getByTestId('can-minimize').textContent).toBe('false')
  })
})
