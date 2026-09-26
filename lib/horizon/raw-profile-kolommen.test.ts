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
import {
  RAW_PROFILE_FEATURE_PREFERENCES_SLEUTELS,
  RAW_PROFILE_KOLOMMEN,
  kiesRawProfileKolommen,
} from './raw-profile-kolommen'

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

/**
 * Security 🟢-1 (C3 punt 9): `feature_preferences` is een vrije JSONB-zak. Hij draagt
 * o.a. `retirement_aspirations.customDreams[].label` (vrije tekst), `wealth_widget_selection`
 * en `deferred_onboarding_fields` — niets daarvan leest een rawProfile-lezer. Alleen de
 * sub-sleutels die de kernel-keten leest mogen mee.
 */
describe('feature_preferences: alleen de gelezen sub-sleutels', () => {
  const VOLLE_PREFS = {
    fire_strategy_override: 'pensioen',
    retirement_aspirations: { customDreams: [{ label: 'Zeilboot voor Anna', amount: 20_000 }] },
    wealth_widget_selection: { assetIds: ['a1'], debtIds: [] },
    deferred_onboarding_fields: ['assets'],
  }

  it('neemt fire_strategy_override over en laat vrije tekst en andere voorkeuren weg', () => {
    const uit = kiesRawProfileKolommen({ feature_preferences: VOLLE_PREFS })
    expect(uit.feature_preferences).toEqual({ fire_strategy_override: 'pensioen' })
    expect(JSON.stringify(uit)).not.toContain('Zeilboot')
  })

  it('null blijft null, een zak zonder gelezen sleutels wordt leeg, de bron wordt niet gemuteerd', () => {
    expect(kiesRawProfileKolommen({ feature_preferences: null }).feature_preferences).toBeNull()
    expect(kiesRawProfileKolommen({ feature_preferences: { wealth_widget_selection: {} } }).feature_preferences).toEqual({})
    const bron = { feature_preferences: { ...VOLLE_PREFS } }
    kiesRawProfileKolommen(bron)
    expect(bron.feature_preferences).toEqual(VOLLE_PREFS)
  })

  it('élke sub-sleutel die een rawProfile-lezer uit feature_preferences leest, staat in de lijst', () => {
    const lijst = new Set<string>(RAW_PROFILE_FEATURE_PREFERENCES_SLEUTELS)
    // De lezers van de kernel-keten (server én client: use-horizon-fire-sim → adapter →
    // resolveFireStrategyWithOverride; lab/scenario → patchNalatenschap) plus de
    // /toekomst-state. Een lezing is `fp.<sleutel>`, `feature_preferences.<sleutel>`,
    // `feature_preferences?.<sleutel>` of `hasOwnProperty.call(fp, '<sleutel>')`.
    const bronnen = [
      'lib/fire-strategy.ts',
      'lib/horizon/kernel-profile-basis.ts',
      'lib/horizon-kernel/adapter/params.ts',
      'lib/horizon-kernel/convergentie-router.ts',
      'lib/hooks/use-horizon-fire-sim.ts',
      'lib/plan-review/overzicht.ts',
      'components/toekomst/state/use-toekomst-sim.ts',
      'components/toekomst/state/use-toekomst-scenario.ts',
      'components/toekomst/state/use-toekomst-lagen.ts',
    ]
    const gelezen = new Set<string>()
    for (const pad of bronnen) {
      const src = readSourceLF(pad)
      for (const m of src.matchAll(/\b(?:fp|feature_preferences)\??\.([a-z][a-z0-9_]*)/g)) gelezen.add(m[1])
      for (const m of src.matchAll(/hasOwnProperty\.call\((?:fp|[a-zA-Z_.]*feature_preferences), '([a-z0-9_]+)'\)/g)) gelezen.add(m[1])
    }
    expect([...gelezen]).toContain('fire_strategy_override')
    expect([...gelezen].filter((s) => !lijst.has(s))).toEqual([])
  })
})
