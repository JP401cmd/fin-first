import { describe, it, expect } from 'vitest'
import { buildHorizonContext } from './horizon-context'

// ── De grondslag-regel van de horizon-context ────────────────────────────────
//
// De AI-context is en blijft NOMINAAL (euro-weergave besluit D14): de
// gebruikersvoorkeur `profiles.euro_view` bereikt het model nooit. Wat het model
// dan wél moet weten is (a) op welke grondslag het leest en (b) dat het niet zelf
// mag omrekenen — anders verzint het zijn eigen `(1 + i)^n` en drijft het af van
// de kernel. Die twee zitten in één vaste zin; deze suite pint hem letterlijk
// vast, want de exacte bewoording ís het besluit.

const GRONDSLAG =
  "Alle projectiebedragen staan in toekomstige euro's (nominaal). Reken zelf nooit om naar huidige euro's — gebruik alleen bedragen die hier letterlijk staan."

const ASSET = {
  name: 'Wereldindex',
  asset_type: 'investment',
  current_value: 250_000,
  expected_return: 7,
  monthly_contribution: 500,
  depreciation_rate: null,
  purchase_value: null,
  is_active: true,
}

const DEBT = {
  name: 'Hypotheek',
  debt_type: 'mortgage',
  current_balance: 200_000,
  interest_rate: 3.5,
  monthly_payment: 1_000,
  repayment_type: 'annuity',
  end_date: null,
}

/**
 * Fake supabase die exact de keten uit `buildHorizonContext` nabootst:
 * `from(tabel).select(...).eq('is_active', true).order('sort_order', …)`.
 */
function makeSupabase(assets: unknown[], debts: unknown[]) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: table === 'assets' ? assets : debts, error: null }),
        }),
      }),
    }),
  } as never
}

describe('buildHorizonContext — grondslag + omreken-verbod (euro-weergave D14)', () => {
  it('zet de vaste grondslag-zin letterlijk in de context', async () => {
    const ctx = await buildHorizonContext(makeSupabase([ASSET], [DEBT]))
    expect(ctx).toContain(GRONDSLAG)
  })

  it('zet de zin vóór het eerste bedrag, zodat het model de grondslag eerst leest', async () => {
    const ctx = await buildHorizonContext(makeSupabase([ASSET], [DEBT]))
    expect(ctx.indexOf(GRONDSLAG)).toBe(0)
    expect(ctx.indexOf(GRONDSLAG)).toBeLessThan(ctx.indexOf('€'))
  })

  it('is statisch: de zin staat er ook zonder schulden en zonder 5-jaarsprojectie', async () => {
    const ctx = await buildHorizonContext(makeSupabase([], [DEBT]))
    expect(ctx).toContain(GRONDSLAG)
    // Geen assets → geen `projectPortfolio`-blok, maar de schuldprojecties
    // (afbetaaltermijn, totale rente) zijn óók projectiebedragen.
    expect(ctx).not.toContain('5-JAAR PROJECTIE')
  })

  it('draagt de zin NIET in de lege tak — daar staat geen enkel projectiebedrag', async () => {
    const ctx = await buildHorizonContext(makeSupabase([], []))
    expect(ctx).not.toContain(GRONDSLAG)
    expect(ctx).toContain('Nog geen assets of schulden geregistreerd.')
  })

  it('voegt geen nieuwe sectie/kop toe voor de grondslag (NFR-G1, tokenkosten)', async () => {
    const ctx = await buildHorizonContext(makeSupabase([ASSET], [DEBT]))
    const headers = ctx.match(/^== .+ ==$/gm) ?? []
    expect(headers).toEqual(['== ASSETS ==', '== VERMOGENSSAMENSTELLING ==', '== SCHULDEN ==', '== 5-JAAR PROJECTIE =='])
  })

  it('houdt de 5-jaarsprojectie nominaal — geen tweede, reële variant', async () => {
    const ctx = await buildHorizonContext(makeSupabase([ASSET], []))
    expect(ctx).toContain('Totale assets over 5 jaar (projectie):')
    // Eén projectiebedrag, geen gepaarde reële waarde: `projectPortfolio` is een
    // eigen motor náást de kernel (D12) en heeft dus geen canonieke deflator.
    expect(ctx).not.toContain('in geld van vandaag')
    expect(ctx.match(/Totale assets over 5 jaar/g)).toHaveLength(1)
  })

  it('noemt de weergavevoorkeur nergens', async () => {
    const ctx = await buildHorizonContext(makeSupabase([ASSET], [DEBT]))
    expect(ctx).not.toContain('euro_view')
    expect(ctx.toLowerCase()).not.toContain('euroview')
  })
})
