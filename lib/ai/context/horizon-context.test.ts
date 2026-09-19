import { describe, it, expect } from 'vitest'
import { buildHorizonContext, RENDEMENT_GEEN_EIGEN_AANNAME } from './horizon-context'

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
 * `from(tabel).select(...).eq('user_id', …).eq('is_active', true).order('sort_order', …)`.
 */
function makeSupabase(assets: unknown[], debts: unknown[]) {
  return {
    from: (table: string) => {
      // Keten-fake: `.select().eq('user_id', ...).eq('is_active', true).order(...)`.
      // `eq` geeft zichzelf terug, zodat het aantal filters niet uitmaakt.
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: async () => ({ data: table === 'assets' ? assets : debts, error: null }),
      }
      return chain
    },
  } as never
}

describe('buildHorizonContext — grondslag + omreken-verbod (euro-weergave D14)', () => {
  it('zet de vaste grondslag-zin letterlijk in de context', async () => {
    const ctx = await buildHorizonContext(makeSupabase([ASSET], [DEBT]), 'user-1')
    expect(ctx).toContain(GRONDSLAG)
  })

  it('zet de zin vóór het eerste bedrag, zodat het model de grondslag eerst leest', async () => {
    const ctx = await buildHorizonContext(makeSupabase([ASSET], [DEBT]), 'user-1')
    expect(ctx.indexOf(GRONDSLAG)).toBe(0)
    expect(ctx.indexOf(GRONDSLAG)).toBeLessThan(ctx.indexOf('€'))
  })

  it('is statisch: de zin staat er ook zonder schulden en zonder 5-jaarsprojectie', async () => {
    const ctx = await buildHorizonContext(makeSupabase([], [DEBT]), 'user-1')
    expect(ctx).toContain(GRONDSLAG)
    // Geen assets → geen `projectPortfolio`-blok, maar de schuldprojecties
    // (afbetaaltermijn, totale rente) zijn óók projectiebedragen.
    expect(ctx).not.toContain('5-JAAR PROJECTIE')
  })

  it('draagt de zin NIET in de lege tak — daar staat geen enkel projectiebedrag', async () => {
    const ctx = await buildHorizonContext(makeSupabase([], []), 'user-1')
    expect(ctx).not.toContain(GRONDSLAG)
    expect(ctx).toContain('Nog geen assets of schulden geregistreerd.')
  })

  it('voegt geen nieuwe sectie/kop toe voor de grondslag (NFR-G1, tokenkosten)', async () => {
    const ctx = await buildHorizonContext(makeSupabase([ASSET], [DEBT]), 'user-1')
    const headers = ctx.match(/^== .+ ==$/gm) ?? []
    expect(headers).toEqual(['== ASSETS ==', '== VERMOGENSSAMENSTELLING ==', '== SCHULDEN ==', '== 5-JAAR PROJECTIE =='])
  })

  it('houdt de 5-jaarsprojectie nominaal — geen tweede, reële variant', async () => {
    const ctx = await buildHorizonContext(makeSupabase([ASSET], []), 'user-1')
    expect(ctx).toContain('Totale assets over 5 jaar (projectie):')
    // Eén projectiebedrag, geen gepaarde reële waarde: `projectPortfolio` is een
    // eigen motor náást de kernel (D12) en heeft dus geen canonieke deflator.
    expect(ctx).not.toContain('in geld van vandaag')
    expect(ctx.match(/Totale assets over 5 jaar/g)).toHaveLength(1)
  })

  it('noemt de weergavevoorkeur nergens', async () => {
    const ctx = await buildHorizonContext(makeSupabase([ASSET], [DEBT]), 'user-1')
    expect(ctx).not.toContain('euro_view')
    expect(ctx.toLowerCase()).not.toContain('euroview')
  })
})

// ── UR3-06 geval 5 — de schulden-totaalregel ─────────────────────────────────
//
// Op het scherm is "Maandlasten" één vooraf-opgetelde KPI. In de context stond
// alleen een lijst per schuld, dus Fin telde zelf op — en noemde EUR 2.690 waar de
// schuldenpagina EUR 2.980 toonde. De fix is de som één keer hier doen. Deze suite
// pint vast dat de totalen er zijn, kloppen, en VOOR de losse regels staan.
describe('buildHorizonContext — schulden-totaal (UR3-06 geval 5)', () => {
  const DEBT_2 = {
    name: 'Autolening',
    debt_type: 'personal_loan',
    current_balance: 12_000,
    interest_rate: 6,
    monthly_payment: 290,
    repayment_type: 'annuity',
    end_date: null,
  }

  it('telt de maandlasten en saldi op zoals de schuldenpagina dat doet', async () => {
    const ctx = await buildHorizonContext(makeSupabase([], [DEBT, DEBT_2]), 'user-1')
    // 1.000 + 290 = 1.290 per maand; 200.000 + 12.000 = 212.000 openstaand.
    expect(ctx).toContain('maandlasten €1.290/mnd')
    expect(ctx).toContain('€212.000 openstaand')
    expect(ctx).toContain('TOTAAL (2 actieve schulden)')
  })

  it('zet het totaal VOOR de per-schuld-regels', async () => {
    const ctx = await buildHorizonContext(makeSupabase([], [DEBT, DEBT_2]), 'user-1')
    expect(ctx.indexOf('TOTAAL (')).toBeLessThan(ctx.indexOf('Hypotheek ('))
    expect(ctx.indexOf('TOTAAL (')).toBeLessThan(ctx.indexOf('Autolening ('))
  })

  it('verbiedt het model expliciet om zelf op te tellen', async () => {
    const ctx = await buildHorizonContext(makeSupabase([], [DEBT]), 'user-1')
    expect(ctx).toContain('tel de regels hieronder NIET zelf op')
    expect(ctx).toContain('TOTAAL (1 actieve schuld)')
  })

  it('draagt geen totaalregel wanneer er geen schulden zijn', async () => {
    const ctx = await buildHorizonContext(makeSupabase([ASSET], []), 'user-1')
    expect(ctx).not.toContain('TOTAAL (')
  })
})

// ── ADR 0166 — `expected_return = null` is "geen eigen aanname", geen 0% ────────
//
// Een rauwe interpolatie leverde "rendement null%/jr"; het model zou dat als 0
// of als fout lezen. De context benoemt de grondslag letterlijk, en zegt bij de
// 5-jaarsprojectie eerlijk dat zulke bezittingen daar op 0% staan (deze context
// heeft het profiel niet bij de hand — zie horizon-context.ts).
describe('buildHorizonContext — geen eigen rendement (ADR 0166)', () => {
  const NULL_ASSET = { ...ASSET, name: 'Spaarpot', expected_return: null }
  const ZERO_ASSET = { ...ASSET, name: 'Betaalrekening', expected_return: 0 }

  it('null → letterlijke grondslag-tekst, nooit "null%" of "0%"', async () => {
    const ctx = await buildHorizonContext(makeSupabase([NULL_ASSET], []), 'user-1')
    expect(ctx).toContain(RENDEMENT_GEEN_EIGEN_AANNAME)
    expect(ctx).not.toContain('null%')
    expect(ctx).not.toContain('Spaarpot (Beleggingen): € 250.000 | rendement 0%')
  })

  it('een bewuste 0 blijft "rendement 0%/jr"', async () => {
    const ctx = await buildHorizonContext(makeSupabase([ZERO_ASSET], []), 'user-1')
    expect(ctx).toContain('rendement 0%/jr')
    expect(ctx).not.toContain(RENDEMENT_GEEN_EIGEN_AANNAME)
  })

  it('de 5-jaarsprojectie draagt de kanttekening alléén als een bezitting geen eigen aanname heeft', async () => {
    const met = await buildHorizonContext(makeSupabase([NULL_ASSET, ASSET], []), 'user-1')
    expect(met).toContain('zonder eigen rendementsaanname zijn in dit bedrag op 0% gerekend')
    const zonder = await buildHorizonContext(makeSupabase([ASSET], []), 'user-1')
    expect(zonder).not.toContain('op 0% gerekend')
  })
})
