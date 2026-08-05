/**
 * WF-START-23 — "Onboarding onderbreken en hervatten".
 *
 * Regressietest op de mount-race tussen het restore-check-effect en het
 * persisteer-effect in `page.tsx`. Het check-effect leest het localStorage-
 * draft pas ná `await supabase.auth.getUser()` + de profielquery; het
 * persisteer-effect vuurt in dezelfde mount-commit. Zonder poort schreef het
 * persisteer-effect het verse, lege begin-draft (`lastStep: 'naam'`) over het
 * bestaande draft heen vóórdat de restore-poging het kon lezen — de voortgang
 * was daarmee blijvend weg en de groene herstel-melding verscheen nooit.
 *
 * De test houdt `getUser()` bewust *pending* om precies dat venster te openen.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, act } from '@testing-library/react'
import type { NonSensitiveDraft } from './draft-persistence'

const ONBOARDING_STORAGE_KEY = 'trifinity_onboarding_draft'

// ── Mocks ────────────────────────────────────────────────────
// Deferred getUser: de test bepaalt zelf wannéér de auth-call resolvet, zodat
// het race-venster (mount → eerste await) meetbaar wordt.
let resolveGetUser: (value: { data: { user: { id: string } | null } }) => void
let getUserPromise: Promise<{ data: { user: { id: string } | null } }>
let onboardingCompleted = false

// Eén stabiele client-instantie: `createClient()` wordt bij élke render
// aangeroepen en zit in de dependency-array van het check-effect. Een nieuw
// object per render zou het effect eindeloos opnieuw laten vuren.
const supabaseMock = {
  auth: {
    getUser: () => getUserPromise,
  },
  from: () => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: { onboarding_completed: onboardingCompleted } }),
      }),
    }),
  }),
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => supabaseMock,
}))

// Ook de router moet een STABIELE instantie zijn: hij zit in de dependency-
// array van het check-effect. Een vers object per render laat dat effect bij
// elke render opnieuw draaien, wat het gemeten gedrag vervuilt.
const routerReplace = vi.fn()
const routerMock = { replace: routerReplace, push: vi.fn(), refresh: vi.fn() }
vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}))

// De eindstrategie-stap is de stap waarop de UAT-run de bug reproduceerde;
// stubben houdt de render licht en de assertie op het page-gedrag gericht.
vi.mock('@/components/onboarding/onboarding-eindstrategie', () => ({
  OnboardingEindstrategie: () => <div data-testid="stap-eindstrategie" />,
}))

// eslint-disable-next-line import/first -- moet ná de vi.mock-hoisting geladen worden
import OnboardingPage from './page'

/** Draft zoals de UAT-run 'm aantrof: voorbij stap 1, met "later invullen"-keuzes. */
function seedDraft(): NonSensitiveDraft {
  const draft: NonSensitiveDraft = {
    lastStep: 'eindstrategie',
    selectedGoals: [],
    activeModules: [],
    deferredFields: ['income', 'assets', 'spaardoel'],
    spaardoel: { presetKey: null, skipped: false },
    pension: { mode: null },
    retirementExpense: { method: 'custom_amount', skipped: false },
    horizon: { fire_end_strategy: 'deplete', fire_end_age: 90, temporal_balance: 3 },
  }
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(draft))
  return draft
}

/**
 * Flush pending React-renders + effecten. Nodig omdat een `setState` in een
 * async-continuation pas ná de huidige microtask-ronde doorrendert.
 */
async function flushEffects() {
  // Een echte macrotask-tick: React plant passieve effecten via de scheduler,
  // dus een paar microtasks zijn niet genoeg om een schrijvende poort te zien.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function readDraft(): NonSensitiveDraft | null {
  const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY)
  return raw ? (JSON.parse(raw) as NonSensitiveDraft) : null
}

describe('onboarding draft-restore race (WF-START-23)', () => {
  beforeEach(() => {
    localStorage.clear()
    routerReplace.mockClear()
    onboardingCompleted = false
    getUserPromise = new Promise((resolve) => {
      resolveGetUser = resolve
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('laat het bestaande draft ongemoeid zolang de restore-check nog loopt', async () => {
    seedDraft()

    // render() flusht de mount-effecten binnen act(); het check-effect blijft
    // hangen op de pending getUser(). Dit is exact het venster waarin het
    // persiteer-effect vóór de fix toesloeg.
    render(<OnboardingPage />)

    expect(readDraft()?.lastStep).toBe('eindstrategie')
    expect(readDraft()?.deferredFields).toEqual(['income', 'assets', 'spaardoel'])
  })

  it('herstelt stap-positie en keuzes en toont de herstel-melding na de check', async () => {
    seedDraft()
    render(<OnboardingPage />)

    resolveGetUser({ data: { user: { id: 'user-1' } } })

    await waitFor(() => {
      expect(screen.getByTestId('stap-eindstrategie')).toBeInTheDocument()
    })
    expect(screen.getByRole('status')).toHaveTextContent('hersteld')

    // Het persisteer-effect mag hierna wél schrijven — maar dan met de
    // herstelde staat, niet met de lege beginstaat.
    await waitFor(() => {
      expect(readDraft()?.lastStep).toBe('eindstrategie')
    })
    expect(readDraft()?.deferredFields).toEqual(['income', 'assets', 'spaardoel'])
  })

  it('herstelt geen draft van een al voltooide onboarding en schrijft er geen terug', async () => {
    seedDraft()
    onboardingCompleted = true
    render(<OnboardingPage />)

    resolveGetUser({ data: { user: { id: 'user-1' } } })

    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith('/overzicht')
    })
    // `waitFor` keert terug zodra de redirect gebeurd is — een state-update in
    // dezelfde async-continuation is dan nog niet doorgerenderd. Expliciet
    // uitflushen, anders zou deze test een schrijvende poort missen en dus
    // niets bewaken.
    await flushEffects()

    // De poort blijft hier bewust dicht: zonder die keuze zou het
    // persisteer-effect het zojuist gewiste draft meteen opnieuw aanmaken.
    expect(readDraft()).toBeNull()
  })
})
