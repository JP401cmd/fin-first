import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readSourceLF } from '@/lib/test-utils/read-source'
import { PERSONAS, type PersonaData, type PersonaKey } from '@/lib/test-personas'
import { EMPTY_REALIZED_WINDOW, type BudgetRealizedWindow } from '@/lib/budget-realized'
import { AOW_RIJEN, NU } from './editie.fixture'
import { maakNepClient } from './nep-client.fixture'
import {
  ASSET_AFLEIDING_KOLOMMEN,
  PROFIEL_AFLEIDING_KOLOMMEN,
  afleidNieuwsprofiel,
  bandVoor,
  laadAfleidingBronnen,
  leidProfielAf,
  rentevastBand,
  rijNaarProfiel,
  zelfWaarde,
  type AfleidingBronnen,
  type AssetRij,
  type DebtRij,
  type NieuwsprofielRij,
  type ProfielRij,
} from './profiel-afleiding'
import { INKOMEN_BANDEN, SPAARGELD_BANDEN, BELEGGINGEN_BANDEN, LEEG_PROFIEL } from './profiel'

// Het transactie-inkomen komt uit het maandaggregaat (RPC) — hier gemockt; de
// som zelf is bewezen in lib/budget-realized.test.ts. `transactionAnnualIncome`
// blijft de echte.
const venster = vi.hoisted(() => ({ waarde: null as BudgetRealizedWindow | null }))
vi.mock('@/lib/budget-realized', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/budget-realized')>()
  return { ...orig, fetchRealizedBudgetAmounts: vi.fn(async () => venster.waarde ?? orig.EMPTY_REALIZED_WINDOW) }
})

const CTX = { now: NU, aowRows: AOW_RIJEN }
const UID = 'user-eigen'
const PARTNER = 'user-partner'

// ── Persona → bronrijen (dezelfde vorm als de tabellen) ─────────────────────

function bronnenUit(persona: PersonaData, over: { kinderen: number; inkomen: number; incomeSource?: string }): AfleidingBronnen {
  const profiel: ProfielRij = {
    id: UID,
    date_of_birth: persona.profile.date_of_birth,
    household_type: persona.profile.household_type,
    number_of_children: over.kinderen,
    income_source: over.incomeSource ?? 'auto',
    net_monthly_income: persona.profile.net_monthly_income ?? null,
  }
  // De seed maakt van elke bankrekening een cash-bezitting (buildSeedCashAssetRow)
  // en koppelt de rekening eraan — losse rekeningen zijn er bij een persona niet.
  const cash: AssetRij[] = persona.bank_accounts.map((b, i) => ({
    id: `cash-${i}`,
    asset_type: 'cash',
    subtype: b.account_type === 'savings' ? 'savings_account' : 'checking_account',
    current_value: b.balance,
    box3_vrijgesteld: null,
    box3_vrijstelling_reden: null,
  }))
  const assets: AssetRij[] = persona.assets.map((a, i) => ({
    id: `a-${i}`,
    asset_type: a.asset_type,
    subtype: a.subtype ?? null,
    current_value: a.current_value,
    box3_vrijgesteld: null,
    box3_vrijstelling_reden: null,
  }))
  const debts: DebtRij[] = persona.debts.map((d, i) => ({
    id: `d-${i}`,
    debt_type: d.debt_type,
    current_balance: d.current_balance,
    fixed_rate_end_date: d.fixed_rate_end_date ?? null,
  }))
  return { profiel, assets: [...cash, ...assets], debts, inkomenTransacties: over.inkomen, losseRekeningen: 0, heeftLosseRekeningen: false, bestaand: null }
}

const LEEG_BRONNEN: AfleidingBronnen = {
  profiel: { id: UID, date_of_birth: '1990-01-01', household_type: 'solo', number_of_children: 0, income_source: 'auto', net_monthly_income: null },
  assets: [],
  debts: [],
  inkomenTransacties: 0,
  losseRekeningen: 0,
  heeftLosseRekeningen: false,
  bestaand: null,
}

describe('profiel-afleiding — B8 op de vijf persona\'s', () => {
  const gevallen: Record<PersonaKey, { kinderen: number; inkomen: number }> = {
    daan: { kinderen: 0, inkomen: 3400 },
    lisa: { kinderen: 2, inkomen: 5100 },
    willem: { kinderen: 2, inkomen: 2900 },
    marijke: { kinderen: 2, inkomen: 0 }, // geen transacties: profielschatting (net_monthly_income 3400) wint
    compleet: { kinderen: 2, inkomen: 0 }, // Tessa: net_monthly_income 7600
  }

  it('Daan (solo, huurder, starter): alleen wat de data draagt, de rest onbekend', () => {
    const { profiel, herkomst } = leidProfielAf(bronnenUit(PERSONAS.daan, gevallen.daan), CTX)
    expect(profiel.geboortejaar).toBe(2000)
    expect(profiel.huishouden).toBe('alleen')
    expect(profiel.kinderen).toBe('geen') // solo met 0: geloofwaardig
    expect(profiel.werk).toBeNull() // geen kolom; niet met AOW
    expect(profiel.inkomen).toBe('3250-4250')
    expect(profiel.wonen).toBeNull() // geen eigen_huis → huursoort niet af te leiden
    expect(profiel.hypotheek).toEqual({ restschuld: null, rentevast: null })
    expect(profiel.woonplan).toBeNull() // zelf (B8)
    expect(profiel.spaargeld).toBe('tot-5k') // 850 + 2.000 op de bankrekeningen
    expect(profiel.beleggingen).toEqual({ band: 'tot-25k', vorm: ['fondsen'] })
    expect(profiel.schulden).toEqual(['studieschuld-tot-15k'])
    expect(profiel.pensioenopbouw).toEqual({ werkgever: 'ja', lijfrente: null }) // 'nee' is geen feit
    expect(profiel.rubrieken).toBeNull()
    expect(herkomst.geboortejaar).toBe('afgeleid')
    expect(herkomst.woonplan).toBeUndefined()
    expect(herkomst.rubrieken).toBeUndefined()
  })

  it('Lisa (gezin, koop met hypotheek): partner ja maar fiscaal partnerschap ONBEKEND (keuze 10), kindleeftijd onbekend', () => {
    const { profiel } = leidProfielAf(bronnenUit(PERSONAS.lisa, gevallen.lisa), CTX)
    expect(profiel.geboortejaar).toBe(1981)
    expect(profiel.huishouden).toBeNull()
    expect(profiel.kinderen).toBeNull()
    expect(profiel.inkomen).toBe('4250-5500')
    expect(profiel.wonen).toBe('koop-met-hypotheek')
    expect(profiel.hypotheek.restschuld).toBe('300k-450k')
    expect(profiel.beleggingen.band).toBe('25k-100k')
    expect(profiel.beleggingen.vorm).toEqual(['crypto', 'fondsen', 'tweede-woning'])
    expect(profiel.schulden).toEqual(['studieschuld-tot-15k', 'consumptief-krediet'])
    expect(profiel.pensioenopbouw).toEqual({ werkgever: 'ja', lijfrente: null })
  })

  it('Willem (samen, afbetaald huis, geen schulden): "geen" schulden is een feit omdat er bezittingen zijn vastgelegd', () => {
    const { profiel } = leidProfielAf(bronnenUit(PERSONAS.willem, gevallen.willem), CTX)
    expect(profiel.huishouden).toBeNull()
    expect(profiel.wonen).toBe('koop-zonder-hypotheek')
    expect(profiel.hypotheek).toEqual({ restschuld: null, rentevast: null })
    expect(profiel.beleggingen.band).toBe('boven-250k')
    expect(profiel.beleggingen.vorm).toEqual(['fondsen', 'tweede-woning']) // een ETF is een fonds
    expect(profiel.schulden).toEqual(['geen'])
    expect(profiel.werk).toBeNull() // 57: nog niet met AOW
  })

  it('Marijke (1957, samen): met AOW → werk = pensioen; inkomen uit de profielschatting als er geen transacties zijn', () => {
    const { profiel } = leidProfielAf(bronnenUit(PERSONAS.marijke, gevallen.marijke), CTX)
    expect(profiel.werk).toEqual(['pensioen'])
    expect(profiel.inkomen).toBe('3250-4250')
    expect(profiel.wonen).toBe('koop-zonder-hypotheek')
    expect(profiel.beleggingen).toEqual({ band: 'boven-250k', vorm: ['fondsen'] })
    expect(profiel.spaargeld).not.toBeNull()
  })

  it('Tessa (gezin, dga, twee hypotheken): restschuld = som van beide hypotheken; spaargeld = cash + deposito + bankrekeningen', () => {
    const { profiel } = leidProfielAf(bronnenUit(PERSONAS.compleet, gevallen.compleet), CTX)
    expect(profiel.inkomen).toBe('boven-5500')
    expect(profiel.spaargeld).toBe('100k-250k') // 30.000 cash + 45.000 deposito + 34.000 op drie bankrekeningen
    expect(profiel.beleggingen.band).toBe('boven-250k')
    expect(profiel.beleggingen.vorm).toEqual(['crypto', 'fondsen', 'tweede-woning'])
    expect(profiel.hypotheek.restschuld).toBe('300k-450k') // 300.000 + 110.000
    expect(profiel.schulden).toEqual(['studieschuld-tot-15k', 'consumptief-krediet'])
    expect(profiel.werk).toBeNull() // dga is niet af te leiden
  })

  it('de afleiding gokt nooit: fiscaal-partner, huursoort, "variabel", lijfrente-nee en kindleeftijd komen alleen uit een zelf-ingevuld veld', () => {
    for (const key of Object.keys(gevallen) as PersonaKey[]) {
      const { profiel } = leidProfielAf(bronnenUit(PERSONAS[key], gevallen[key]), CTX)
      expect(profiel.huishouden === 'fiscaal-partner' || profiel.huishouden === 'samenwonend-zonder-fiscaal-partner').toBe(false)
      expect(profiel.wonen?.startsWith('huur') ?? false).toBe(false)
      expect(profiel.hypotheek.rentevast).not.toBe('variabel')
      expect(profiel.pensioenopbouw.lijfrente).not.toBe('nee')
      expect(profiel.pensioenopbouw.werkgever).not.toBe('weet-niet')
      expect(profiel.kinderen == null || profiel.kinderen === 'geen').toBe(true)
    }
  })
})

describe('profiel-afleiding — nooit uit afwezigheid', () => {
  it('zonder enige bezitting, schuld of bankrekening blijven de financiële velden onbekend', () => {
    const { profiel } = leidProfielAf(LEEG_BRONNEN, CTX)
    expect(profiel.spaargeld).toBeNull()
    expect(profiel.beleggingen).toEqual({ band: null, vorm: null })
    expect(profiel.schulden).toBeNull()
    expect(profiel.pensioenopbouw).toEqual({ werkgever: null, lijfrente: null })
    expect(profiel.inkomen).toBeNull() // grondslag 'unknown' → onbekend, geen band tot-1750
  })

  it('alleen een eigen huis vastgelegd: wonen wél, maar geen spaargeld- of beleggingenband (geen Box 3-feit)', () => {
    const huis: AssetRij = { id: 'h', asset_type: 'eigen_huis', subtype: null, current_value: 400_000, box3_vrijgesteld: null, box3_vrijstelling_reden: null }
    const { profiel } = leidProfielAf({ ...LEEG_BRONNEN, assets: [huis] }, CTX)
    expect(profiel.wonen).toBe('koop-zonder-hypotheek')
    expect(profiel.spaargeld).toBeNull()
    expect(profiel.beleggingen).toEqual({ band: null, vorm: null })
    expect(profiel.schulden).toEqual(['geen']) // er is wél iets vastgelegd
  })

  it('een losse bankrekening is een Box 3-feit: spaargeld = het saldo, beleggingen "geen"', () => {
    const { profiel } = leidProfielAf({ ...LEEG_BRONNEN, losseRekeningen: 6_000, heeftLosseRekeningen: true }, CTX)
    expect(profiel.spaargeld).toBe('5k-25k')
    expect(profiel.beleggingen).toEqual({ band: 'geen', vorm: null })
    expect(profiel.schulden).toEqual(['geen'])
  })

  it('kinderen: 0 is alleen "geen" bij solo of samen; bij gezin is 0 de DB-default van een leeg veld', () => {
    const met = (household_type: string, n: number | null) =>
      leidProfielAf({ ...LEEG_BRONNEN, profiel: { ...LEEG_BRONNEN.profiel!, household_type, number_of_children: n } }, CTX).profiel.kinderen
    expect(met('solo', 0)).toBe('geen')
    expect(met('samen', 0)).toBe('geen')
    expect(met('gezin', 0)).toBeNull()
    expect(met('solo', 1)).toBeNull()
    expect(met('solo', null)).toBeNull()
  })

  it('lijfrente is alleen "ja" (pot met subtype lijfrente); werkgever alleen "ja" (een andere pensioenpot)', () => {
    const pot = (subtype: string): AssetRij => ({ id: `p-${subtype}`, asset_type: 'retirement', subtype, current_value: 10_000, box3_vrijgesteld: null, box3_vrijstelling_reden: null })
    expect(leidProfielAf({ ...LEEG_BRONNEN, assets: [pot('lijfrente')] }, CTX).profiel.pensioenopbouw).toEqual({ werkgever: null, lijfrente: 'ja' })
    expect(leidProfielAf({ ...LEEG_BRONNEN, assets: [pot('uitkeringsregeling')] }, CTX).profiel.pensioenopbouw).toEqual({ werkgever: 'ja', lijfrente: null })
    expect(leidProfielAf({ ...LEEG_BRONNEN, assets: [pot('lijfrente'), pot('premieregeling')] }, CTX).profiel.pensioenopbouw).toEqual({ werkgever: 'ja', lijfrente: 'ja' })
  })
})

describe('profiel-afleiding — randen en regels', () => {
  it('bandVoor: ondergrens hoort erbij, bovengrens niet, de bovenste band is open', () => {
    expect(bandVoor(INKOMEN_BANDEN, 0)).toBe('tot-1750')
    expect(bandVoor(INKOMEN_BANDEN, 1749.99)).toBe('tot-1750')
    expect(bandVoor(INKOMEN_BANDEN, 1750)).toBe('1750-2500')
    expect(bandVoor(INKOMEN_BANDEN, 5499.99)).toBe('4250-5500')
    expect(bandVoor(INKOMEN_BANDEN, 5500)).toBe('boven-5500')
    expect(bandVoor(INKOMEN_BANDEN, 1_000_000)).toBe('boven-5500')
    expect(bandVoor(SPAARGELD_BANDEN, 0)).toBe('tot-5k')
    // De lege band ('geen', {0,0}) slaat bandVoor over — die kiest de afleiding zelf.
    expect(bandVoor(BELEGGINGEN_BANDEN, 0)).toBe('tot-25k')
    expect(bandVoor(BELEGGINGEN_BANDEN, 25_000)).toBe('25k-100k')
  })

  it('rentevastBand: halfopen op 12 en 60 maanden; verlopen of onbekend → onbekend (nooit "variabel")', () => {
    expect(rentevastBand(null)).toBeNull()
    expect(rentevastBand(-0.1)).toBeNull()
    expect(rentevastBand(0)).toBe('tot-1-jaar')
    expect(rentevastBand(11.99)).toBe('tot-1-jaar')
    expect(rentevastBand(12)).toBe('2-5-jaar')
    expect(rentevastBand(59.99)).toBe('2-5-jaar')
    expect(rentevastBand(60)).toBe('boven-5-jaar')
    expect(rentevastBand(240)).toBe('boven-5-jaar')
  })

  it('de grootste hypotheek bepaalt de rentevastband; een verlopen einddatum geeft geen band', () => {
    const basis: AfleidingBronnen = {
      ...LEEG_BRONNEN,
      assets: [{ id: 'h', asset_type: 'eigen_huis', subtype: null, current_value: 400_000, box3_vrijgesteld: null, box3_vrijstelling_reden: null }],
    }
    const maandenNaNu = (n: number) => new Date(NU.getTime() + n * 30.4375 * 24 * 3600 * 1000).toISOString()
    const met = (...hyp: Array<[number, string | null]>) =>
      leidProfielAf({ ...basis, debts: hyp.map(([saldo, einde], i) => ({ id: `m${i}`, debt_type: 'mortgage', current_balance: saldo, fixed_rate_end_date: einde })) }, CTX).profiel.hypotheek
    expect(met([200_000, null])).toEqual({ restschuld: '150k-300k', rentevast: null })
    expect(met([200_000, maandenNaNu(-3)])).toEqual({ restschuld: '150k-300k', rentevast: null })
    expect(met([200_000, maandenNaNu(6)]).rentevast).toBe('tot-1-jaar')
    expect(met([200_000, maandenNaNu(100)]).rentevast).toBe('boven-5-jaar')
    // De grootste (300k, 100 mnd) wint van de kleinere (50k, 6 mnd); de som is 350k.
    expect(met([50_000, maandenNaNu(6)], [300_000, maandenNaNu(100)])).toEqual({ restschuld: '300k-450k', rentevast: 'boven-5-jaar' })
  })

  it('een handmatig inkomen wint altijd (income_source manual), ook boven de transacties', () => {
    const b = bronnenUit(PERSONAS.daan, { kinderen: 0, inkomen: 3400, incomeSource: 'manual' })
    b.profiel!.net_monthly_income = 1_000
    expect(leidProfielAf(b, CTX).profiel.inkomen).toBe('tot-1750')
  })

  it('AOW-gerechtigd precies op de grens: 67 jaar en 3 maanden voor cohort 1961', () => {
    const met = (dob: string) => leidProfielAf({ ...LEEG_BRONNEN, profiel: { ...LEEG_BRONNEN.profiel!, date_of_birth: dob } }, CTX).profiel.werk
    // Geboren 1961-01-01 → AOW 67j3m → 2028-04: op 21-09-2026 nog niet.
    expect(met('1961-01-01')).toBeNull()
    // Geboren 1959-06-01 → AOW 67j0m → 2026-06: wél.
    expect(met('1959-06-01')).toEqual(['pensioen'])
    // Geboren 1959-09-22 → AOW 67 op 2026-09-22, één dag ná NU: nog niet.
    expect(met('1959-09-22')).toBeNull()
  })

  it('geboortejaar: alleen YYYY-MM-DD binnen 1920–2020', () => {
    const met = (dob: string | null) => leidProfielAf({ ...LEEG_BRONNEN, profiel: { ...LEEG_BRONNEN.profiel!, date_of_birth: dob } }, CTX).profiel.geboortejaar
    expect(met('1920-01-01')).toBe(1920)
    expect(met('2020-12-31')).toBe(2020)
    expect(met('1919-12-31')).toBeNull()
    expect(met('2021-01-01')).toBeNull()
    expect(met('01-05-1990')).toBeNull()
    expect(met(null)).toBeNull()
  })

  it('\'zelf\'-velden overleven de afleiding; woonplan en rubrieken raakt de afleiding nooit', () => {
    const bestaand: NieuwsprofielRij = {
      user_id: UID,
      profiel_versie: 1,
      geboortejaar: 1999, // afgeleid → wordt overschreven door de bron (2000)
      huishouden: 'fiscaal-partner', // zelf → blijft
      kinderen: 'jongste-4-11', // zelf → blijft
      werk: ['loondienst'], // zelf → blijft
      inkomen: 'tot-1750', // afgeleid → overschreven
      wonen: null,
      hypotheek_restschuld: null,
      hypotheek_rentevast: 'variabel', // zelf (hypotheek) → blijft
      woonplan: 'kopen-binnen-2-jaar', // zelf per definitie
      spaargeld: null,
      beleggingen: null,
      beleggingen_vorm: null,
      schulden: null,
      pensioen_werkgever: null,
      pensioen_lijfrente: null,
      rubrieken: ['fiscaal'], // zelf per definitie
      herkomst: { geboortejaar: 'afgeleid', huishouden: 'zelf', kinderen: 'zelf', werk: 'zelf', inkomen: 'afgeleid', hypotheek: 'zelf', woonplan: 'zelf', rubrieken: 'zelf' },
      afgeleid_at: null,
    }
    const b = { ...bronnenUit(PERSONAS.daan, { kinderen: 0, inkomen: 3400 }), bestaand }
    const { profiel, herkomst } = leidProfielAf(b, CTX)
    expect(profiel.geboortejaar).toBe(2000)
    expect(profiel.inkomen).toBe('3250-4250')
    expect(profiel.huishouden).toBe('fiscaal-partner')
    expect(profiel.kinderen).toBe('jongste-4-11')
    expect(profiel.werk).toEqual(['loondienst'])
    expect(profiel.hypotheek).toEqual({ restschuld: null, rentevast: 'variabel' })
    expect(profiel.woonplan).toBe('kopen-binnen-2-jaar')
    expect(profiel.rubrieken).toEqual(['fiscaal'])
    expect(herkomst).toMatchObject({ huishouden: 'zelf', kinderen: 'zelf', werk: 'zelf', hypotheek: 'zelf', woonplan: 'zelf', rubrieken: 'zelf', geboortejaar: 'afgeleid', inkomen: 'afgeleid', spaargeld: 'afgeleid' })
  })

  it('één ongeldig veld in de rij sleept een geldig \'zelf\'-veld niet mee (per veld gevalideerd)', () => {
    const bestaand: NieuwsprofielRij = {
      user_id: UID, profiel_versie: 1, geboortejaar: null, huishouden: 'fiscaal-partner', kinderen: null, werk: [], // lege array: ongeldig voor het schema
      inkomen: 'onzin', wonen: null, hypotheek_restschuld: null, hypotheek_rentevast: null, woonplan: 'geen-koopplan', spaargeld: null, beleggingen: null,
      beleggingen_vorm: null, schulden: null, pensioen_werkgever: null, pensioen_lijfrente: null, rubrieken: ['x'.repeat(41)], // te lang: ongeldig
      herkomst: { huishouden: 'zelf', werk: 'zelf', woonplan: 'zelf', rubrieken: 'zelf' }, afgeleid_at: null,
    }
    expect(rijNaarProfiel(bestaand)).toEqual(LEEG_PROFIEL) // alles-of-niets, bewust alleen voor de matcher-lezing
    expect(zelfWaarde(bestaand, 'huishouden')).toBe('fiscaal-partner')
    expect(zelfWaarde(bestaand, 'werk')).toBeNull()
    expect(zelfWaarde(bestaand, 'rubrieken')).toBeNull()
    const { profiel } = leidProfielAf({ ...LEEG_BRONNEN, bestaand }, CTX)
    expect(profiel.huishouden).toBe('fiscaal-partner') // overleeft
    expect(profiel.woonplan).toBe('geen-koopplan')
    expect(profiel.werk).toBeNull() // de ongeldige waarde zelf wordt null
  })

  it('rijNaarProfiel: een geldige rij wordt het matcher-profiel, een ongeldige het lege profiel', () => {
    const rij: NieuwsprofielRij = {
      user_id: UID, profiel_versie: 1, geboortejaar: 1990, huishouden: 'alleen', kinderen: null, werk: null, inkomen: '2500-3250', wonen: null,
      hypotheek_restschuld: null, hypotheek_rentevast: null, woonplan: null, spaargeld: 'tot-5k', beleggingen: 'geen', beleggingen_vorm: null,
      schulden: ['geen'], pensioen_werkgever: 'ja', pensioen_lijfrente: 'nee', rubrieken: null, herkomst: {}, afgeleid_at: null,
    }
    expect(rijNaarProfiel(rij)).toMatchObject({ geboortejaar: 1990, inkomen: '2500-3250', beleggingen: { band: 'geen', vorm: null } })
    expect(rijNaarProfiel({ ...rij, inkomen: 'onzin' })).toEqual(LEEG_PROFIEL)
    expect(rijNaarProfiel(null)).toEqual(LEEG_PROFIEL)
  })
})

describe('profiel-afleiding — eigenaarschap (service-role: RLS scoopt niets)', () => {
  const eigenAssets = [
    { id: 'a1', user_id: UID, is_active: true, asset_type: 'savings', subtype: null, current_value: 3_000, box3_vrijgesteld: null, box3_vrijstelling_reden: null },
    { id: 'a2', user_id: UID, is_active: false, asset_type: 'savings', subtype: null, current_value: 900_000, box3_vrijgesteld: null, box3_vrijstelling_reden: null },
  ]
  // De partner deelt het huishouden: op `assets` is de SELECT-policy huishoud-
  // gedeeld, en de service-role ziet sowieso alles. Zonder eigen scope telt
  // haar spaargeld mee en springt de band van tot-5k naar boven-250k.
  const partnerAssets = [
    { id: 'p1', user_id: PARTNER, is_active: true, asset_type: 'savings', subtype: null, current_value: 400_000, box3_vrijgesteld: null, box3_vrijstelling_reden: null },
    { id: 'p2', user_id: PARTNER, is_active: true, asset_type: 'eigen_huis', subtype: null, current_value: 500_000, box3_vrijgesteld: null, box3_vrijstelling_reden: null },
  ]
  const tabellen = () => ({
    profiles: [
      { id: UID, date_of_birth: '1990-05-05', household_type: 'samen', number_of_children: 1, income_source: 'auto', net_monthly_income: 2_000, estimated_monthly_expenses: 1_500 },
      { id: PARTNER, date_of_birth: '1960-01-01', household_type: 'samen', number_of_children: 1, income_source: 'manual', net_monthly_income: 9_000 },
    ],
    assets: [...eigenAssets, ...partnerAssets],
    debts: [
      { id: 'd1', user_id: PARTNER, is_active: true, debt_type: 'mortgage', current_balance: 300_000, fixed_rate_end_date: null },
      { id: 'd2', user_id: UID, is_active: true, debt_type: 'student_loan', current_balance: 20_000, fixed_rate_end_date: null },
    ],
    bank_accounts: [
      { id: 'b1', user_id: UID, is_active: true, linked_asset_id: null, balance: 1_500, ownership: 'personal', iban_encrypted: 'x', iban_hash: 'y' },
      { id: 'b2', user_id: UID, is_active: true, linked_asset_id: 'a1', balance: 3_000, ownership: 'personal' }, // gekoppeld: zit al in a1
      { id: 'b3', user_id: PARTNER, is_active: true, linked_asset_id: null, balance: 80_000, ownership: 'shared' },
    ],
    nieuwsprofiel: [] as Record<string, unknown>[],
  })

  beforeEach(() => {
    // Transfer-gefilterd (real) ≠ alles (all): de afleiding hoort `real` te dragen.
    venster.waarde = { ...EMPTY_REALIZED_WINDOW, historyMonths: 6, windowIncome: { real: 14_400, all: 60_000 } }
  })

  it('leest alleen eigen rijen: de partnerrij, de inactieve rij en de gekoppelde rekening tellen niet mee', async () => {
    const nep = maakNepClient(tabellen())
    const bronnen = await laadAfleidingBronnen(nep.client as never, UID)
    expect(bronnen.assets.map((a) => a.id)).toEqual(['a1'])
    expect(bronnen.debts.map((d) => d.id)).toEqual(['d2'])
    expect(bronnen.profiel?.id).toBe(UID)
    expect(bronnen.losseRekeningen).toBe(1_500)
    expect(bronnen.heeftLosseRekeningen).toBe(true)
    // 14.400 over 6 historiemaanden → jaarinkomen 28.800 → 2.400 per maand (transfer-gefilterd, niet 60.000).
    expect(bronnen.inkomenTransacties).toBeCloseTo(2_400)
    const { profiel } = leidProfielAf(bronnen, CTX)
    expect(profiel.spaargeld).toBe('tot-5k') // 3.000 + 1.500
    expect(profiel.inkomen).toBe('1750-2500')
    expect(profiel.wonen).toBeNull()
    expect(profiel.schulden).toEqual(['studieschuld-15k-40k'])
  })

  it('het inkomen loopt via de canonieke historiebasis met een eigen scope (householdId null)', async () => {
    const { fetchRealizedBudgetAmounts } = await import('@/lib/budget-realized')
    const nep = maakNepClient(tabellen())
    await laadAfleidingBronnen(nep.client as never, UID)
    expect(fetchRealizedBudgetAmounts).toHaveBeenCalledWith(expect.anything(), { userId: UID, householdId: null })
    expect(nep.queriesOp('transactions').length).toBe(0) // geen eigen tel-lus over transactierijen
  })

  it('élke query draagt de eigen scope in de keten (user_id, of id op profiles)', async () => {
    const nep = maakNepClient(tabellen())
    await laadAfleidingBronnen(nep.client as never, UID)
    expect(nep.queries.map((q) => q.table).sort()).toEqual(['assets', 'bank_accounts', 'debts', 'nieuwsprofiel', 'profiles'])
    for (const q of nep.queries) {
      const sleutel = q.table === 'profiles' ? 'id' : 'user_id'
      const scope = q.stappen.find((s) => s.m === 'eq' && s.args[0] === sleutel)
      expect(scope, `${q.table} zonder .eq('${sleutel}', …)`).toBeDefined()
      expect(scope!.args[1]).toBe(UID)
    }
  })

  it('vraagt expliciete kolommen (geen select(*) op assets of bank_accounts) en leest de uitgavenschatting niet (B2)', async () => {
    const nep = maakNepClient(tabellen())
    await laadAfleidingBronnen(nep.client as never, UID)
    const assets = nep.queriesOp('assets')[0]
    expect(assets.stappen.find((s) => s.m === 'select')!.args[0]).toBe(ASSET_AFLEIDING_KOLOMMEN)
    expect(ASSET_AFLEIDING_KOLOMMEN).not.toContain('*')
    expect(ASSET_AFLEIDING_KOLOMMEN).not.toMatch(/_encrypted|_hash/)
    const rekeningen = nep.queriesOp('bank_accounts')[0]
    const kolommen = rekeningen.stappen.find((s) => s.m === 'select')!.args[0] as string
    expect(kolommen).not.toContain('*')
    expect(kolommen).not.toMatch(/_encrypted|_hash/)
    expect(PROFIEL_AFLEIDING_KOLOMMEN).not.toContain('estimated_monthly_expenses')
    expect(PROFIEL_AFLEIDING_KOLOMMEN).not.toContain('*')
  })

  it('afleidNieuwsprofiel schrijft één rij op de eigen user_id (upsert, onConflict user_id)', async () => {
    const nep = maakNepClient(tabellen())
    const uitkomst = await afleidNieuwsprofiel(nep.client as never, UID, CTX)
    expect(uitkomst.profiel.geboortejaar).toBe(1990)
    const rijen = nep.rijen('nieuwsprofiel')
    expect(rijen.length).toBe(1)
    expect(rijen[0].user_id).toBe(UID)
    expect(rijen[0].afgeleid_at).toBe(NU.toISOString())
    const upsert = nep.queriesOp('nieuwsprofiel').find((q) => q.stappen.some((s) => s.m === 'upsert'))!
    expect(upsert.stappen.find((s) => s.m === 'upsert')!.args[1]).toEqual({ onConflict: 'user_id' })
    // Herleiden, niet ophogen: een tweede run geeft dezelfde rij.
    await afleidNieuwsprofiel(nep.client as never, UID, CTX)
    expect(nep.rijen('nieuwsprofiel').length).toBe(1)
    expect(nep.rijen('nieuwsprofiel')[0].spaargeld).toBe('tot-5k')
  })

  it('een leesfout gooit (geen halve afleiding wegschrijven)', async () => {
    const nep = maakNepClient(tabellen(), { fouten: { 'assets:select': 'kapot' } })
    await expect(afleidNieuwsprofiel(nep.client as never, UID, CTX)).rejects.toThrow(/lezen mislukt/)
    expect(nep.rijen('nieuwsprofiel').length).toBe(0)
  })
})

describe('profiel-afleiding — bron-scan: elke tabellezing in de server-only Krant-bestanden draagt de eigen scope', () => {
  /** Platformbrede tabellen zonder gebruikersdata: de kandidaten van de editie. */
  const PLATFORMBREED = new Set(['news_articles'])
  /** Bewuste uitzonderingen, per bestand en tabel, met reden. */
  /** Een lezing loopt van `.from('tabel')` tot de volgende `.from(`, een lege regel, het einde van een array of het bestandseinde. */
  const SCAN = /\.from\('([a-z_]+)'\)([\s\S]*?)(?=\.from\(|\n\n|\]\)|$)/g
  const UITZONDERINGEN: Array<{ bestand: string; tabel: string; reden: string }> = [
    { bestand: 'editie-schrijver.ts', tabel: 'krant_editie_items', reden: 'insert(rijen): elke rij draagt user_id via itemNaarRij (editie-schrijver.test.ts)' },
    { bestand: 'editie-herberekening.ts', tabel: 'krant_editie_items', reden: 'meta-route artikel → editie (ADR 0171 contract 7): alle lezers van dit artikel, per definitie over gebruikers heen' },
    { bestand: 'editie-herberekening.ts', tabel: 'krant_edities', reden: 'idem, op editie-id; de user_id komt uit de DB-rij en scoopt de herberekening daarna' },
  ]

  for (const bestand of ['profiel-afleiding.ts', 'editie-loader.ts', 'editie-run.ts', 'editie-schrijver.ts', 'editie-herberekening.ts']) {
    it(`${bestand}: .from(<tabel>) … .eq('user_id'|'id', userId), user_id in de rij, of een uid-gebonden sleutel`, () => {
      const bron = readSourceLF(join(process.cwd(), 'lib', 'krant', bestand))
      const lezingen = [...bron.matchAll(SCAN)]
      // Elke .from( is een literal: een variabele of template ontsnapt de scan niet stil.
      expect(lezingen.length, `${bestand}: .from( zonder tabel-literal`).toBe((bron.match(/\.from\(/g) ?? []).length)
      expect(lezingen.length).toBeGreaterThan(0)
      for (const [, tabel, keten] of lezingen) {
        if (PLATFORMBREED.has(tabel)) continue
        if (UITZONDERINGEN.some((u) => u.bestand === bestand && u.tabel === tabel)) continue
        const gescoopt =
          /\.eq\('user_id',\s*userId\)/.test(keten) ||
          /user_id:\s*userId\b/.test(keten) || // een schrijfpad draagt de eigen id in de rij
          (tabel === 'profiles' && /\.eq\('id',\s*userId\)/.test(keten)) ||
          (tabel === 'app_settings' && /\.eq\('key',\s*(newsReadKey|newsCacheKey)\(userId\)\)/.test(keten))
        expect(gescoopt, `${bestand}: lezing op ${tabel} zonder eigen scope: ${keten.trim().slice(0, 120)}`).toBe(true)
      }
    })
  }

  it('sentinel: de scan bijt op een lezing zonder scope', () => {
    const bron = "const a = client.from('assets').select('id').eq('is_active', true)\n\nconst b = client.from('debts').select('id')"
    const treffers = [...bron.matchAll(SCAN)]
    expect(treffers.map((t) => t[1])).toEqual(['assets', 'debts']) // óók de laatste lezing vóór het bestandseinde
    expect(/\.eq\('user_id',\s*userId\)/.test(treffers[0][2])).toBe(false)
  })
})
