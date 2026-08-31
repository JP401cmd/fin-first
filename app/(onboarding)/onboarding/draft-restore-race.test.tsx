/**
 * WF-START-23 — "Onboarding onderbreken en hervatten".
 *
 * Regressietest op de mount-race tussen het restore-check-effect en het
 * persisteer-effect in `page.tsx`. Het check-effect leest het concept pas ná
 * `await supabase.auth.getUser()` + de profielquery; het persisteer-effect
 * vuurt in dezelfde mount-commit. Zonder poort schreef het persisteer-effect
 * het verse, lege begin-concept (`lastStep: 'naam'`) over het bestaande concept
 * heen vóórdat de restore-poging het kon lezen — de voortgang was daarmee
 * blijvend weg en de herstel-melding verscheen nooit.
 *
 * Sinds kaart UR2-01 staat het concept server-side (`/api/onboarding/draft`)
 * en draagt het ALLE antwoorden; de race en de poort zijn ongewijzigd, alleen
 * het transport is verhuisd van localStorage naar fetch.
 *
 * De test houdt `getUser()` bewust *pending* om precies dat venster te openen.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, act } from '@testing-library/react'
import { serializeDraft, type OnboardingDraft, type DraftStateSource } from './draft-persistence'
import { DRAFT_RESTORED_NOTICE } from './draft-notice-copy'

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
      order: async () => ({ data: [], error: null }),
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

/**
 * Serverconcept in de test: één variabele die de gemockte fetch teruggeeft en
 * die de PUT bijwerkt — de rol die localStorage vóór UR2-01 speelde.
 */
let storedDraft: OnboardingDraft | null = null
/**
 * Elke PUT-payload, in volgorde. Nodig omdat `storedDraft` na een restore
 * gewoon de seed is: zónder deze lijst zou een assertie op het opgeslagen
 * concept ook slagen wanneer er nooit geschreven werd — de test zou dan groen
 * blijven terwijl het persisteer-effect stuk is.
 */
let putPayloads: OnboardingDraft[] = []

/** Concept zoals de UAT-run 'm aantrof: voorbij stap 1, met "later invullen"-keuzes. */
function seedDraft(): OnboardingDraft {
  storedDraft = serializeDraft({
    step: 'eindstrategie',
    identity: {
      full_name: 'Jan Paul',
      date_of_birth: '1986-04-05',
      household_type: 'solo',
      number_of_children: 0,
      net_monthly_income: '',
      estimated_yearly_income: '42000',
      estimated_monthly_expenses: '2200',
    },
    selectedGoals: [],
    activeModules: [],
    deferredFields: ['income', 'assets', 'spaardoel'],
    budgetAmounts: {},
    quickAssets: [{ asset_type: 'cash', name: 'Betaalrekening', current_value: 1800 }],
    quickDebts: [],
    bezittingenPhases: [{ kind: 'review' }],
    schuldenPhases: [{ kind: 'ask', qIndex: 0 }],
    spaardoel: { presetKey: null, name: '', target_value: '', target_date: '', skipped: false },
    pension: { mode: null, grossMonthly: '', startAge: '', parseResult: null },
    retirementExpense: { method: 'custom_amount', customAmount: '', skipped: false },
    horizon: {
      fire_end_strategy: 'deplete',
      fire_end_age: 90,
      fire_legacy_amount: '',
      retirement_expense_method: 'current_income',
      retirement_custom_amount: '',
      temporal_balance: 3,
      life_events: [],
    },
  } as unknown as DraftStateSource)
  return storedDraft
}

function readDraft(): OnboardingDraft | null {
  return storedDraft
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

describe('onboarding draft-restore race (WF-START-23)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    localStorage.clear()
    routerReplace.mockClear()
    storedDraft = null
    putPayloads = []
    onboardingCompleted = false
    getUserPromise = new Promise((resolve) => {
      resolveGetUser = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (typeof url === 'string' && url.startsWith('/api/onboarding/draft')) {
          const method = init?.method ?? 'GET'
          if (method === 'GET') {
            return new Response(JSON.stringify({ draft: storedDraft }), { status: 200 })
          }
          if (method === 'PUT') {
            const body = JSON.parse(String(init?.body)) as { draft: OnboardingDraft }
            putPayloads.push(body.draft)
            storedDraft = body.draft
            return new Response(JSON.stringify({ ok: true }), { status: 200 })
          }
          storedDraft = null
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        }
        return new Response('{}', { status: 200 })
      }),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('laat het bestaande concept ongemoeid zolang de restore-check nog loopt', async () => {
    seedDraft()

    // render() flusht de mount-effecten binnen act(); het check-effect blijft
    // hangen op de pending getUser(). Dit is exact het venster waarin het
    // persisteer-effect vóór de fix toesloeg. De debounce-tijd loopt hier
    // helemaal door — een schrijvende poort zou dus zichtbaar zijn.
    render(<OnboardingPage />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    // Geen enkele schrijf zolang de poort dicht staat — dát is de fix.
    expect(putPayloads).toEqual([])
    expect(readDraft()?.lastStep).toBe('eindstrategie')
    expect(readDraft()?.deferredFields).toEqual(['income', 'assets', 'spaardoel'])
  })

  it('herstelt de antwoorden en toont de herstel-melding na de check', async () => {
    seedDraft()
    render(<OnboardingPage />)

    resolveGetUser({ data: { user: { id: 'user-1' } } })

    await waitFor(() => {
      expect(screen.getByTestId('stap-eindstrategie')).toBeInTheDocument()
    })
    // Copy komt uit de gedeelde constante: de melding is al twee keer met het
    // gedrag meeverhuisd, dus asserteren we op de bron i.p.v. op een letterlijke
    // tekst die opnieuw kan gaan liegen.
    expect(screen.getByRole('status')).toHaveTextContent(DRAFT_RESTORED_NOTICE.label)

    // Het persisteer-effect mag hierna wél schrijven — maar dan met de
    // herstelde staat, niet met de lege beginstaat. Asserteren op de VERSTUURDE
    // payload, niet op het opgeslagen concept: dat laatste is nog de seed en zou
    // ook kloppen als er nooit geschreven was.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(putPayloads.length).toBeGreaterThan(0)
    const laatste = putPayloads[putPayloads.length - 1]
    expect(laatste.lastStep).toBe('eindstrategie')
    expect(laatste.deferredFields).toEqual(['income', 'assets', 'spaardoel'])
    // UR2-01: de gevoelige antwoorden overleven de round-trip nu óók.
    expect(laatste.identity.full_name).toBe('Jan Paul')
    expect(laatste.quickAssets).toHaveLength(1)
    expect(readDraft()?.identity.full_name).toBe('Jan Paul')
  })

  it('herstelt geen concept van een al voltooide onboarding en schrijft er geen terug', async () => {
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
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    // De poort blijft hier bewust dicht: zonder die keuze zou het
    // persisteer-effect het zojuist gewiste concept meteen opnieuw aanmaken.
    expect(putPayloads).toEqual([])
    expect(readDraft()).toBeNull()
  })
})
