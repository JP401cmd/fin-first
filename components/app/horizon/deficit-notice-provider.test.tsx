import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  DeficitNoticeProvider,
  DeficitNoticeDot,
  useDeficitNotice,
} from './deficit-notice-provider'

/**
 * Gedrags-tests op het minimaliseren van de tekort-lening-melding op /toekomst.
 *
 * Wat hier bewezen moet worden (en wat een pure unit-test op
 * `resolveDeficitNoticeDisplay` NIET dekt):
 *  A. de melding en het statuspunt delen ÉÉN toestand — het punt verschijnt pas
 *     als de melding verdwijnt, en omgekeerd;
 *  B. minimaliseren schrijft de PIEK naar het BESTAANDE pref-schrijfpad
 *     (`PUT /api/overzicht/page-status`) onder de sleutel `/toekomst/tekort-lening` —
 *     geen nieuwe route, geen localStorage;
 *  C. een server-geseede piek maakt de melding meteen geminimaliseerd (geen flits);
 *  D. escalatie (>10% hogere piek) heropent de melding, óók met een opgeslagen pref;
 *  E. zónder provider blijft de melding uitgeklapt en is minimaliseren niet
 *     aangeboden (geen knop die niets onthoudt);
 *  F. een mislukte PUT rolt de optimistische toestand terug.
 */

/** Testconsument die de melding nabootst: registreert een piek, toont de toestand. */
function Melding({ peak }: { peak: number | null }) {
  const { display, canMinimize, minimize } = useDeficitNotice(peak)
  return (
    <div>
      <span data-testid="display">{display}</span>
      <span data-testid="can-minimize">{String(canMinimize)}</span>
      {display === 'expanded' && <p>Tekort-lening aangesproken</p>}
      {canMinimize && (
        <button type="button" onClick={minimize}>
          Minimaliseren
        </button>
      )}
    </div>
  )
}

function setup(peak: number | null, initialMinimizedPeak: number | null = null) {
  return render(
    <DeficitNoticeProvider initialMinimizedPeak={initialMinimizedPeak}>
      <DeficitNoticeDot />
      <Melding peak={peak} />
    </DeficitNoticeProvider>,
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

describe('DeficitNoticeProvider — uitgeklapt ↔ geminimaliseerd', () => {
  it('toont de melding uitgeklapt en géén statuspunt zolang er niet geminimaliseerd is', () => {
    setup(42000)
    expect(screen.getByTestId('display').textContent).toBe('expanded')
    expect(screen.getByText('Tekort-lening aangesproken')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /toon de melding/i })).toBeNull()
  })

  it('vervangt na "Minimaliseren" de melding door het statuspunt', async () => {
    setup(42000)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Minimaliseren' }))
    })
    expect(screen.getByTestId('display').textContent).toBe('minimized')
    expect(screen.queryByText('Tekort-lening aangesproken')).toBeNull()
    expect(screen.getByRole('button', { name: /toon de melding/i })).toBeTruthy()
  })

  it('heropent de melding na een klik op het statuspunt', async () => {
    setup(42000)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Minimaliseren' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /toon de melding/i }))
    })
    expect(screen.getByTestId('display').textContent).toBe('expanded')
    expect(screen.getByText('Tekort-lening aangesproken')).toBeTruthy()
  })

  it("geeft 'none' en géén punt zonder tekort-lening", () => {
    setup(null)
    expect(screen.getByTestId('display').textContent).toBe('none')
    expect(screen.queryByRole('button', { name: /toon de melding/i })).toBeNull()
  })
})

describe('DeficitNoticeProvider — statuspunt (a11y + kleur)', () => {
  it('is een echte button met een beschrijvend aria-label en een stoplicht-punt', async () => {
    const { container } = setup(42000)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Minimaliseren' }))
    })
    const knop = screen.getByRole('button', { name: /toon de melding/i })
    expect(knop.tagName).toBe('BUTTON')
    expect(knop.getAttribute('aria-label')).toBe(
      'Aandacht — toon de melding over je tekort-lening',
    )
    // Zelfde h-7 w-7-familie als de pagina-'i' en de PageStatusDot.
    expect(knop.className).toContain('h-7 w-7')
    // Stoplichtkleur (amber), géén module-accent-token.
    const punt = container.querySelector('span[aria-hidden="true"]')
    expect(punt?.className).toContain('bg-amber-500')
  })
})

describe('DeficitNoticeProvider — server-side onthouden', () => {
  it('schrijft de piek naar het bestaande pref-schrijfpad onder de tekort-lening-sleutel', async () => {
    setup(42000)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Minimaliseren' }))
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/overzicht/page-status')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({
      route: '/toekomst/tekort-lening',
      level: 42000,
    })
  })

  it('wist de voorkeur (level null) bij heropenen', async () => {
    setup(42000, 42000)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /toon de melding/i }))
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      route: '/toekomst/tekort-lening',
      level: null,
    })
  })

  it('gebruikt geen localStorage voor de voorkeur', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    setup(42000)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Minimaliseren' }))
    })
    expect(setItem).not.toHaveBeenCalled()
  })

  it('start meteen geminimaliseerd bij een server-geseede piek (geen flits)', () => {
    setup(42000, 42000)
    expect(screen.getByTestId('display').textContent).toBe('minimized')
    expect(screen.getByRole('button', { name: /toon de melding/i })).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rolt de toestand terug wanneer de PUT faalt', async () => {
    fetchMock.mockResolvedValue({ ok: false })
    setup(42000)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Minimaliseren' }))
    })
    expect(screen.getByTestId('display').textContent).toBe('expanded')
  })
})

describe('DeficitNoticeProvider — escalatie heropent', () => {
  it('blijft ingeklapt bij een ongewijzigde of licht gegroeide piek', () => {
    setup(43000, 42000) // +2,4% → onder de 10%-drempel
    expect(screen.getByTestId('display').textContent).toBe('minimized')
  })

  it('klapt weer uit zodra de piek meer dan 10% groeit', () => {
    setup(60000, 42000)
    expect(screen.getByTestId('display').textContent).toBe('expanded')
    expect(screen.getByText('Tekort-lening aangesproken')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /toon de melding/i })).toBeNull()
  })
})

describe('useDeficitNotice — zonder provider', () => {
  it('houdt de melding uitgeklapt en biedt geen minimaliseer-knop aan', () => {
    render(<Melding peak={42000} />)
    expect(screen.getByTestId('display').textContent).toBe('expanded')
    expect(screen.getByTestId('can-minimize').textContent).toBe('false')
    expect(screen.queryByRole('button', { name: 'Minimaliseren' })).toBeNull()
  })

  it("geeft 'none' zonder tekort-lening", () => {
    render(<Melding peak={null} />)
    expect(screen.getByTestId('display').textContent).toBe('none')
  })
})
