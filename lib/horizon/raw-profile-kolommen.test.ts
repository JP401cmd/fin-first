/**
 * De profielrij in de pagina-lading draagt alleen de kolommen die de lezers gebruiken.
 *
 * Given `loadHorizonRaw` spreidde de VOLLEDIGE `profiles`-rij (`getOwnProfile`, select('*'))
 *       in `HorizonRawData.rawProfile`, en die rij gaat via de katern-layout als prop naar
 *       de browser (RSC-payload) en via `RegelSimSnapshot.rawContext` naar /api-antwoorden,
 * When  de loader de rij opbouwt,
 * Then  staan `role`, `weekly_briefing_email`, `onboarding_idempotency_key` (en andere
 *       niet-kernelvelden) er niet in, en staat élk veld dat de kernel-adapter en de
 *       plan-review lezen er wél in.
 */
import { describe, it, expect } from 'vitest'
import { readSourceLF } from '@/lib/test-utils/read-source'
import { RAW_PROFILE_KOLOMMEN, kiesRawProfileKolommen } from './raw-profile-kolommen'

const VOLLE_RIJ: Record<string, unknown> = {
  id: 'u1',
  role: 'superadmin',
  weekly_briefing_email: 'iemand@example.test',
  onboarding_idempotency_key: 'sleutel-123',
  full_name: 'Voor Beeld',
  financial_context: 'vrije tekst over de situatie',
  commercial_tier: 'pro',
  date_of_birth: '1985-06-15',
  net_monthly_income: 4000,
  estimated_monthly_expenses: 2500,
  income_source: 'manual',
  expenses_source: 'estimate',
  fire_no_deficit_loan: false,
  feature_preferences: null,
}

describe('kiesRawProfileKolommen', () => {
  it('laat role, weekly_briefing_email en onboarding_idempotency_key weg', () => {
    const uit = kiesRawProfileKolommen(VOLLE_RIJ)
    for (const verboden of [
      'id',
      'role',
      'weekly_briefing_email',
      'onboarding_idempotency_key',
      'full_name',
      'financial_context',
      'commercial_tier',
    ]) {
      expect(uit, verboden).not.toHaveProperty(verboden)
    }
  })

  it('neemt de kernelvelden over met hun waarde, ook een expliciete null of false', () => {
    const uit = kiesRawProfileKolommen(VOLLE_RIJ)
    expect(uit).toMatchObject({
      date_of_birth: '1985-06-15',
      net_monthly_income: 4000,
      fire_no_deficit_loan: false,
      feature_preferences: null,
      income_source: 'manual',
      expenses_source: 'estimate',
    })
  })

  it('voegt geen sleutels toe die de rij niet had (afwezig blijft afwezig)', () => {
    const uit = kiesRawProfileKolommen({ date_of_birth: '1990-01-01' })
    expect(Object.keys(uit)).toEqual(['date_of_birth'])
  })
})

/** De `<naam>.<veld>`-lezingen in een bronbestand. */
function gelezenVelden(src: string, naam: string): string[] {
  const re = new RegExp(`\\b${naam}\\??\\.([a-z][a-z0-9_]*)`, 'g')
  return [...new Set([...src.matchAll(re)].map((m) => m[1]))]
}

describe('RAW_PROFILE_KOLOMMEN dekt elke lezer', () => {
  const lijst = new Set<string>(RAW_PROFILE_KOLOMMEN)

  it('élk profielveld dat de kernel-adapter leest (buildConvergentieAdapterProfile)', () => {
    const src = readSourceLF('lib/horizon-kernel/convergentie-router.ts')
    const start = src.indexOf('export function buildConvergentieAdapterProfile(')
    const eind = src.indexOf('\n}\n', start)
    expect(start, 'buildConvergentieAdapterProfile niet gevonden').toBeGreaterThan(-1)
    const velden = gelezenVelden(src.slice(start, eind), 'p')
    expect(velden.length).toBeGreaterThan(20)
    // `yearly_essential_expenses` is geen kolom: de loader injecteert de al-berekende waarde.
    const ontbrekend = velden.filter((v) => v !== 'yearly_essential_expenses' && !lijst.has(v))
    expect(ontbrekend).toEqual([])
  })

  it('élk profielveld dat de plan-review uit de rij leest (lib/plan-review/overzicht.ts)', () => {
    const src = readSourceLF('lib/plan-review/overzicht.ts')
    const velden = gelezenVelden(src, 'profile')
    expect(velden).toEqual(expect.arrayContaining(['income_source', 'expenses_source']))
    expect(velden.filter((v) => !lijst.has(v))).toEqual([])
  })

  it('de loader bouwt rawProfile via de kolomlijst, niet door de volle rij te spreiden', () => {
    const src = readSourceLF('lib/horizon/raw-data-loader.ts')
    expect(src).toContain('kiesRawProfileKolommen(profile)')
    expect(src).not.toMatch(/\.\.\.\(profile as ConvergentieRawProfileRow\)/)
  })
})
