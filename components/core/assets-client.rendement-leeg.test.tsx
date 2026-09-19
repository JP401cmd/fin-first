/**
 * Een STRIKT LEEG rendementsveld onder de keuze "ik vul zelf een rendement in"
 * mag geen bewuste 0% worden (ADR 0166).
 *
 * Het bezittingenformulier had de invoerfout-tak al staan — hij sloeg alleen
 * niet aan voor het leegste geval. `parseAmountInput` werd namelijk achter een
 * falsy-guard aangeroepen:
 *
 *     const numExpectedReturn = expectedReturn ? parseAmountInput(...) : 0
 *
 * Een lege string is falsy, dus die landde op `0` — en `0` is een geldige
 * waarde binnen elke band, dus de validatie liet 'm door en de payload sloeg
 * een bewuste 0% op. Sinds migratie `20260919140000` is dat het tegendeel van
 * wat de gebruiker bedoelde: `null` betekent "geen eigen aanname, reken met
 * mijn profielrendement", `0` betekent "dit groeit niet". De zusterpagina
 * (`components/app/cash-account-view.tsx`) had dezelfde fout in een andere
 * vorm; beide formulieren horen zich identiek te gedragen.
 *
 * Hier RENDEREN we, anders dan de andere `assets-client.*`-suites die
 * bron-toetsen zijn: het gaat om gedrag in een tak van `handleSave()` die niet
 * uit de bron af te lezen is, en `AssetForm` is los exporteerbaar.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

// ── Supabase: chainbare, thenable mock. Een NIEUW bezit gaat via
//    `POST /api/assets` (de client mag niet client-direct inserten, ADR 0058),
//    dus het bewijs van "wat is er opgeslagen" zit in de fetch hieronder; deze
//    mock voedt alleen de mount-loaders. ──
function makeSupabase() {
  function builder(table: string): Record<string, unknown> {
    const target: Record<string, unknown> = {
      insert: () => builder(table),
      update: () => builder(table),
      single: () => builder(table),
      maybeSingle: () => builder(table),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: [], error: null })),
    }
    return new Proxy(target, {
      get(t, prop: string) {
        if (prop in t) return (t as Record<string, unknown>)[prop]
        return () => builder(table)
      },
    })
  }
  return {
    from: (table: string) => builder(table),
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  }
}

vi.mock('@/lib/supabase/client', () => ({ createClient: () => makeSupabase() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/core/assets',
}))

vi.mock('@/components/app/ownership-toggle', () => ({
  useHouseholdStatus: () => ({ hasHousehold: false, householdId: null }),
  OwnershipToggle: () => null,
}))

import { AssetForm } from './assets-client'

/** Alle bewaar-aanroepen op `POST /api/assets`, met hun payload. */
function assetPosts(): Array<Record<string, unknown>> {
  const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
  return mock.mock.calls
    .filter(([url, init]) => String(url) === '/api/assets' && (init as RequestInit | undefined)?.method === 'POST')
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>)
}

function setupEnv() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/assets') {
        return { ok: true, status: 200, json: async () => ({ id: 'asset-nieuw' }) } as unknown as Response
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
    }) as unknown as typeof fetch,
  )
  // jsdom kent `scrollIntoView` niet; het formulier scrollt na een invoerfout
  // naar het eerste foute veld. Zonder stub gooit die (terechte) tak.
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => {}
  }
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AssetForm — leeg rendementsveld is een invoerfout, geen stille 0% (ADR 0166)', () => {
  function rendementVeld() {
    return screen.getByLabelText(/^Rendement in procenten per jaar/)
  }

  /**
   * De overige velden dragen een los `<label>` zonder `htmlFor`, dus niet via
   * `getByLabelText` te vinden. In plaats van het formulier daarvoor te
   * verbouwen pakken we het bijschrift en daaronder de input in hetzelfde
   * blokje — dat is precies de visuele koppeling die de gebruiker ook ziet.
   */
  function veldOnder(bijschrift: string): HTMLInputElement {
    const label = screen.getAllByText(bijschrift).find((el) => el.tagName === 'LABEL')
    if (!label) throw new Error(`Geen label gevonden met tekst "${bijschrift}"`)
    const input = label.parentElement?.querySelector('input')
    if (!input) throw new Error(`Geen invoerveld onder "${bijschrift}"`)
    return input
  }

  /** Een verder geldig formulier, zodat alleen het rendementsveld kan blokkeren. */
  function vulBasis() {
    fireEvent.change(veldOnder('Naam'), { target: { value: 'Spaarpot' } })
    fireEvent.change(veldOnder('Huidige waarde'), { target: { value: '1000' } })
  }

  it('blokkeert opslaan met de bandmelding wanneer het rendementsveld leeg is onder "eigen"', async () => {
    setupEnv()
    render(
      <AssetForm
        defaultType="savings"
        linkedBankAccounts={new Map()}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )

    // Een nieuw bezit start bewust op keuze 'eigen' — het vinkje "geen eigen
    // rendement" staat uit, dus dit is precies het pad waar een leeg veld stil
    // een 0% werd.
    vulBasis()
    fireEvent.change(rendementVeld(), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))

    expect(await screen.findByText('Rendement moet tussen 0% en 15% per jaar liggen')).toBeInTheDocument()
    // En er is niets weggeschreven met een verzonnen nul.
    expect(assetPosts()).toHaveLength(0)
  })

  it('laat een BEWUSTE 0 wél door — dat is een geldige keuze, geen lege invoer', async () => {
    setupEnv()
    render(
      <AssetForm
        defaultType="savings"
        linkedBankAccounts={new Map()}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )

    vulBasis()
    fireEvent.change(rendementVeld(), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }))

    await waitFor(() => expect(assetPosts()).toHaveLength(1))
    expect(assetPosts()[0].expected_return).toBe(0)
  })
})
