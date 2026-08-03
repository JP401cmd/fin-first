import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, screen } from '@testing-library/react'
import type { CashflowCardStatuses } from '@/lib/cashflow-cards'

/**
 * CashflowStatusProvider — de bron van de vier sidebar-status-dots onder
 * Cashflow.
 *
 * De winst van T2.3 zit in WIE er fetcht, dus dat is wat hier bewaakt wordt met
 * een fetch-teller (niet: "er kwam een waarde terug"):
 *
 *  1. op de HUB (/overzicht/cashflow) fetcht de provider NUL keer — die pagina
 *     berekent de kaarten server-side en seedt ze;
 *  2. de seed mag LAAT komen (gestreamd blok, mount ná de eerste paint) en
 *     landt dan alsnog, zonder dat er tussendoor een fetch is losgegaan — dat is
 *     precies de volgorde die het PageStatusSeed-patroon níét garandeert;
 *  3. op een SUB-pagina fetcht hij exact één keer per route-bezoek;
 *  4. buiten de cashflow-routes raakt hij het endpoint niet aan;
 *  5. bij een PERSPECTIEFWISSEL haalt de sub-pagina opnieuw op (die wissel doet
 *     alleen een zachte `router.refresh()`, dus zonder het perspectief in de deps
 *     zouden de dots op het vorige perspectief blijven staan) — maar zolang het
 *     perspectief nog niet OPGELOST is gaat er geen speculatief verzoek uit, en
 *     tijdens de her-fetch blijven de vorige kleuren staan i.p.v. naar grijs te
 *     vallen (beide bewuste keuzes, hier vastgepind);
 *  6. over een route-OVERGANG heen lekt er niets: de gefetchte waarden van een
 *     sub-pagina verschijnen niet op de hub, en een blijvende seed niet op een
 *     sub-pagina.
 */

const { mockUsePathname, mockUsePerspective } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
  mockUsePerspective: vi.fn(),
}))

vi.mock('next/navigation', () => ({ usePathname: mockUsePathname }))
vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: mockUsePerspective,
}))

import {
  CashflowStatusProvider,
  CashflowStatusSeed,
  useCashflowStatusContext,
} from './cashflow-status-provider'

const SEEDED: CashflowCardStatuses = {
  budget: 'good',
  transacties: 'bad',
  vasteLasten: 'warn',
  forecast: 'good',
}

const FROM_API: CashflowCardStatuses = {
  budget: 'warn',
  transacties: 'good',
  vasteLasten: 'bad',
  forecast: 'neutral',
}

/** Rendert de vier statussen als één scanbare string, bv. "good/bad/warn/good". */
function StatusProbe() {
  const s = useCashflowStatusContext()
  return (
    <span data-testid="probe">
      {[s.budget, s.transacties, s.vasteLasten, s.forecast].join('/')}
    </span>
  )
}

function probe(): string {
  return screen.getByTestId('probe').textContent ?? ''
}

const NEUTRAL = 'neutral/neutral/neutral/neutral'

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn(async () => ({ ok: true, json: async () => FROM_API }) as Response)
  global.fetch = fetchSpy as unknown as typeof fetch
  // Default: perspectief al opgelost. Tests die de mount-flip nabootsen zetten
  // `loading: true` en flippen daarna zelf.
  mockUsePerspective.mockReturnValue({ perspective: 'personal', loading: false })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CashflowStatusProvider — de hub fetcht niet', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/overzicht/cashflow')
  })

  it('doet nul fetches en toont de geseede statussen', async () => {
    render(
      <CashflowStatusProvider>
        <CashflowStatusSeed statuses={SEEDED} />
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(probe()).toBe('good/bad/warn/good')
  })

  it('blijft neutraal zonder seed, en fetcht ook dan niet', async () => {
    render(
      <CashflowStatusProvider>
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(probe()).toBe(NEUTRAL)
  })

  it('neemt een LAAT binnenkomende seed alsnog over (gestreamd blok)', async () => {
    // Eerste commit = het gestreamde blok is er nog niet (Suspense-fallback):
    // de provider heeft zijn effect al gedraaid.
    const { rerender } = render(
      <CashflowStatusProvider>
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})
    expect(probe()).toBe(NEUTRAL)
    expect(fetchSpy).not.toHaveBeenCalled()

    // Het blok arriveert en hydrateert: de seed mount ná het provider-effect.
    rerender(
      <CashflowStatusProvider>
        <CashflowStatusSeed statuses={SEEDED} />
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})

    expect(probe()).toBe('good/bad/warn/good')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('een trailing slash telt nog steeds als de hub', async () => {
    mockUsePathname.mockReturnValue('/overzicht/cashflow/')
    render(
      <CashflowStatusProvider>
        <CashflowStatusSeed statuses={SEEDED} />
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(probe()).toBe('good/bad/warn/good')
  })
})

describe('CashflowStatusProvider — sub-pagina en daarbuiten', () => {
  it.each([
    '/overzicht/cashflow/budget',
    '/overzicht/cashflow/transacties',
    '/overzicht/cashflow/vaste-lasten',
    '/overzicht/cashflow/forecast',
  ])('fetcht op %s exact één keer en toont het antwoord', async (pathname) => {
    mockUsePathname.mockReturnValue(pathname)
    render(
      <CashflowStatusProvider>
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy).toHaveBeenCalledWith('/api/overzicht/cashflow-status')
    expect(probe()).toBe('warn/good/bad/neutral')
  })

  it('raakt het endpoint niet aan buiten de cashflow-routes', async () => {
    mockUsePathname.mockReturnValue('/overzicht')
    render(
      <CashflowStatusProvider>
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(probe()).toBe(NEUTRAL)
  })

  // Begrensde routematch: een zusterroute die toevallig met de hub-prefix begint
  // is GEEN cashflow-sub-pagina en mag het endpoint dus niet raken.
  it('behandelt een zusterroute met dezelfde prefix niet als sub-pagina', async () => {
    mockUsePathname.mockReturnValue('/overzicht/cashflow-instellingen')
    render(
      <CashflowStatusProvider>
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(probe()).toBe(NEUTRAL)
  })

  it('blijft neutraal bij een niet-ok antwoord (progressive enhancement)', async () => {
    mockUsePathname.mockReturnValue('/overzicht/cashflow/budget')
    fetchSpy.mockResolvedValue({ ok: false, json: async () => ({}) } as Response)
    render(
      <CashflowStatusProvider>
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})

    expect(probe()).toBe(NEUTRAL)
  })
})

describe('CashflowStatusProvider — perspectiefwissel', () => {
  // Een wissel doet alleen `router.refresh()` (zachte refresh): clientstate
  // overleeft. Zonder het perspectief in de deps zouden de dots op een
  // sub-pagina op het vorige perspectief blijven staan.
  it('haalt op een sub-pagina opnieuw op', async () => {
    mockUsePathname.mockReturnValue('/overzicht/cashflow/budget')
    const { rerender } = render(
      <CashflowStatusProvider>
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    const HOUSEHOLD_STATUSES = {
      budget: 'bad',
      transacties: 'bad',
      vasteLasten: 'good',
      forecast: 'warn',
    }
    mockUsePerspective.mockReturnValue({ perspective: 'household', loading: false })
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => HOUSEHOLD_STATUSES,
    } as Response)
    rerender(
      <CashflowStatusProvider>
        <StatusProbe />
      </CashflowStatusProvider>,
    )

    // BEWUSTE KEUZE, hier vastgepind: tijdens de her-fetch blijven de VORIGE
    // kleuren staan i.p.v. naar neutraal te vallen. Eén begrensd verzoek lang de
    // oude kleuren is iets anders dan de bug die tot een routewissel persisteerde;
    // een grijze flits bij elke perspectiefwissel is de slechtere ruil.
    expect(probe()).toBe('warn/good/bad/neutral')

    await act(async () => {})

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(probe()).toBe('bad/bad/good/warn')
  })

  // De PerspectiveProvider begint op 'personal' en resolvet het echte perspectief
  // pas ná een roundtrip. Zonder gate zou die mount-flip bij een huishoud-
  // gebruiker een weggegooid eerste verzoek opleveren — en beide verzoeken zijn
  // cache-misses, dus twee volle loadersets voor één paginabezoek.
  it('doet geen speculatief verzoek zolang het perspectief nog niet bekend is', async () => {
    mockUsePathname.mockReturnValue('/overzicht/cashflow/budget')
    mockUsePerspective.mockReturnValue({ perspective: 'personal', loading: true })
    const { rerender } = render(
      <CashflowStatusProvider>
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(probe()).toBe(NEUTRAL)

    // De roundtrip landt: het echte perspectief is 'household'.
    mockUsePerspective.mockReturnValue({ perspective: 'household', loading: false })
    rerender(
      <CashflowStatusProvider>
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})

    // Eén verzoek voor dit paginabezoek, niet twee.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(probe()).toBe('warn/good/bad/neutral')
  })

  // De hub blijft ook ná een wissel op nul fetches: daar hertekent de zachte
  // refresh het server-blok, dat een verse seed levert.
  it('laat de hub ook dan niet fetchen — de verse seed doet het werk', async () => {
    mockUsePathname.mockReturnValue('/overzicht/cashflow')
    const { rerender } = render(
      <CashflowStatusProvider>
        <CashflowStatusSeed statuses={SEEDED} />
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})
    expect(probe()).toBe('good/bad/warn/good')

    const HOUSEHOLD_SEED: CashflowCardStatuses = {
      budget: 'bad',
      transacties: 'bad',
      vasteLasten: 'good',
      forecast: 'warn',
    }
    mockUsePerspective.mockReturnValue({ perspective: 'household', loading: false })
    rerender(
      <CashflowStatusProvider>
        <CashflowStatusSeed statuses={HOUSEHOLD_SEED} />
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(probe()).toBe('bad/bad/good/warn')
  })
})

describe('CashflowStatusProvider — route-overgangen', () => {
  it('sub → hub: geen extra fetch, en de sub-waarden lekken niet naar de hub', async () => {
    mockUsePathname.mockReturnValue('/overzicht/cashflow/budget')
    const { rerender } = render(
      <CashflowStatusProvider>
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(probe()).toBe('warn/good/bad/neutral')

    // Naar de hub: het gestreamde blok is er nog niet, dus geen seed.
    mockUsePathname.mockReturnValue('/overzicht/cashflow')
    rerender(
      <CashflowStatusProvider>
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(probe()).toBe(NEUTRAL)
  })

  it('hub → sub: de blijvende seed lekt niet in de sub-dots', async () => {
    mockUsePathname.mockReturnValue('/overzicht/cashflow')
    const { rerender } = render(
      <CashflowStatusProvider>
        <CashflowStatusSeed statuses={SEEDED} />
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})
    expect(probe()).toBe('good/bad/warn/good')

    // Naar een sub-pagina: de seed blijft in de provider staan, maar mag daar
    // niet getoond worden — ook niet in het venster vóór het antwoord.
    mockUsePathname.mockReturnValue('/overzicht/cashflow/budget')
    rerender(
      <CashflowStatusProvider>
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    expect(probe()).toBe(NEUTRAL)

    await act(async () => {})
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(probe()).toBe('warn/good/bad/neutral')
  })
})

describe('useCashflowStatusContext buiten de provider', () => {
  it('valt terug op neutrale statussen i.p.v. te crashen', async () => {
    mockUsePathname.mockReturnValue('/overzicht/cashflow')
    render(<StatusProbe />)
    await act(async () => {})

    expect(probe()).toBe(NEUTRAL)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
