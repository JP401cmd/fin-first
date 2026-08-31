/**
 * Unit tests voor de pure draft-builders in `lib/quick-add/build-drafts.ts`.
 *
 * Valideert per asset/debt-type dat `field3` correct wordt geïnterpreteerd
 * en dat alle smart defaults (expected_return, repayment_type, end_date,
 * is_tax_deductible, include_aflossing_in_savings, …) conform de spec in
 * `docs/ok-we-gaan-een-precious-naur.md` worden gezet.
 */

import { describe, it, expect } from 'vitest'
import { buildAssetDraft, buildDebtDraft } from '../build-drafts'
import { TYPICAL_RETURNS } from '@/lib/asset-data'

// `today` als yyyy-mm-dd — draft-builders gebruiken deze als purchase_date
// en start_date. We leiden hem af via dezelfde expression voor deterministic
// end_date-checks zonder stubben van Date.
function todayIso(): string {
  return new Date().toISOString().split('T')[0]
}

function addYearsIso(startIso: string, years: number): string {
  const d = new Date(startIso)
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().split('T')[0]
}

// Spiegelt `addMonthsIso` uit lib/debt-term-basis.ts. Bewust lokaal herhaald
// (net als addYearsIso hierboven) zodat de assertion het aantal maanden
// vastlegt en niet de datumrekenkunde van de implementatie napraat.
function addMonthsIso(startIso: string, months: number): string {
  const d = new Date(startIso)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

describe('buildAssetDraft', () => {
  it('savings: zet bank in institution en gebruikt TYPICAL_RETURNS.savings', () => {
    const draft = buildAssetDraft({
      asset_type: 'savings',
      name: 'Spaarrekening ING',
      current_value: 10000,
      field3: 'ING',
    })
    expect(draft.institution).toBe('ING')
    expect(draft.expected_return).toBe(TYPICAL_RETURNS.savings)
    expect(draft.monthly_contribution).toBe(0)
  })

  it('savings: heeft de gedeelde defaults (is_active, ownership, net_worth_pct)', () => {
    const draft = buildAssetDraft({
      asset_type: 'savings',
      name: 'Spaar',
      current_value: 5000,
      field3: 'Rabo',
    })
    expect(draft.is_active).toBe(true)
    expect(draft.ownership).toBe('personal')
    expect(draft.net_worth_inclusion_pct).toBe(100)
  })

  it('savings: expliciete rente (expected_return) overschrijft de default, bank blijft in institution', () => {
    const draft = buildAssetDraft({
      asset_type: 'savings',
      name: 'Spaarrekening bunq',
      current_value: 12000,
      field3: 'bunq',
      expected_return: 3.6,
    })
    expect(draft.institution).toBe('bunq')
    expect(draft.expected_return).toBe(3.6)
  })

  it('savings: expected_return=0 en negatieve rente worden geaccepteerd (geen terugval op default)', () => {
    const zero = buildAssetDraft({
      asset_type: 'savings',
      name: 'Spaar 0%',
      current_value: 8000,
      field3: 'ING',
      expected_return: 0,
    })
    expect(zero.expected_return).toBe(0)

    const negative = buildAssetDraft({
      asset_type: 'savings',
      name: 'Groot deposito',
      current_value: 250000,
      field3: 'ABN',
      expected_return: -0.5,
    })
    expect(negative.expected_return).toBe(-0.5)
  })

  it('savings: zonder expected_return valt terug op TYPICAL_RETURNS.savings', () => {
    const draft = buildAssetDraft({
      asset_type: 'savings',
      name: 'Spaar zonder rente',
      current_value: 5000,
      field3: 'Rabo',
      expected_return: null,
    })
    expect(draft.expected_return).toBe(TYPICAL_RETURNS.savings)
  })

  it('eigen_huis: parst field3 als WOZ-waarde (currency)', () => {
    const draft = buildAssetDraft({
      asset_type: 'eigen_huis',
      name: 'Koopwoning',
      current_value: 500000,
      field3: '450000',
    })
    expect(draft.woz_value).toBe(450000)
  })

  it('investment: parst field3 als maandelijkse inleg (currency)', () => {
    const draft = buildAssetDraft({
      asset_type: 'investment',
      name: 'ETF portefeuille',
      current_value: 25000,
      field3: 250,
    })
    expect(draft.monthly_contribution).toBe(250)
  })

  it('vehicle: gebruikt field3 als aankoopprijs en zet depreciation_rate=15', () => {
    const draft = buildAssetDraft({
      asset_type: 'vehicle',
      name: 'Tesla Model 3',
      current_value: 35000,
      field3: 50000,
    })
    expect(draft.purchase_value).toBe(50000)
    expect(draft.depreciation_rate).toBe(15)
  })

  it('vordering: parst field3 als rente (%) en overschrijft expected_return', () => {
    const draft = buildAssetDraft({
      asset_type: 'vordering',
      name: 'Lening aan Jan',
      current_value: 20000,
      field3: 4.5,
    })
    expect(draft.expected_return).toBe(4.5)
  })

  it('crypto zonder field3 gebruikt TYPICAL_RETURNS.crypto en monthly_contribution=0', () => {
    const draft = buildAssetDraft({
      asset_type: 'crypto',
      name: 'Bitcoin wallet',
      current_value: 15000,
    })
    expect(draft.expected_return).toBe(TYPICAL_RETURNS.crypto)
    expect(draft.monthly_contribution).toBe(0)
  })
})

describe('buildDebtDraft', () => {
  it('mortgage: default 30j annuiteit, tax-deductible, include_aflossing_in_savings=true', () => {
    const today = todayIso()
    const draft = buildDebtDraft({
      debt_type: 'mortgage',
      name: 'Hypotheek',
      current_balance: 300000,
      field3: 3.5,
    })
    expect(draft.repayment_type).toBe('annuiteit')
    expect(draft.is_tax_deductible).toBe(true)
    expect(draft.include_aflossing_in_savings).toBe(true)
    expect(draft.end_date).toBe(addYearsIso(today, 30))
  })

  it('student_loan: repayment_type lineair en is_tax_deductible=false', () => {
    const draft = buildDebtDraft({
      debt_type: 'student_loan',
      name: 'DUO',
      current_balance: 15000,
    })
    expect(draft.repayment_type).toBe('lineair')
    expect(draft.is_tax_deductible).toBe(false)
  })

  it('credit_card: aflossingsvrij, geen einddatum, rente overgenomen uit field3', () => {
    const draft = buildDebtDraft({
      debt_type: 'credit_card',
      name: 'Visa',
      current_balance: 2000,
      field3: 14,
    })
    expect(draft.repayment_type).toBe('aflossingsvrij')
    expect(draft.end_date).toBeNull()
    expect(draft.interest_rate).toBe(14)
  })

  it('personal_loan zonder rente: interest_rate = 0', () => {
    const draft = buildDebtDraft({
      debt_type: 'personal_loan',
      name: 'PL',
      current_balance: 5000,
    })
    expect(draft.interest_rate).toBe(0)
  })

  it('dga_schuld zonder rente: default 2.5 (conform defaultInterestRate)', () => {
    const draft = buildDebtDraft({
      debt_type: 'dga_schuld',
      name: 'Rekening-courant',
      current_balance: 10000,
    })
    expect(draft.interest_rate).toBe(2.5)
  })

  it('linked_asset_id wordt doorgegeven wanneer aangeleverd', () => {
    const draft = buildDebtDraft({
      debt_type: 'mortgage',
      name: 'Gekoppelde hypotheek',
      current_balance: 400000,
      field3: 3.5,
      linked_asset_id: '00000000-0000-0000-0000-000000000001',
    })
    expect(draft.linked_asset_id).toBe('00000000-0000-0000-0000-000000000001')
  })

  it('mortgage: expliciete repayment_type wint van de default + stuurt is_tax_deductible aan', () => {
    // Aflossingsvrije hypotheek is niet aftrekbaar (box 1) — de user-keuze
    // moet de annuiteit/aftrekbaar-default omkeren.
    const draft = buildDebtDraft({
      debt_type: 'mortgage',
      name: 'Aflossingsvrije hypotheek',
      current_balance: 250000,
      field3: 3.0,
      repayment_type: 'aflossingsvrij',
    })
    expect(draft.repayment_type).toBe('aflossingsvrij')
    expect(draft.is_tax_deductible).toBe(false)
  })

  it('mortgage: lineair + ingangsdatum in het verleden → start_date/end_date volgen de invoer', () => {
    const draft = buildDebtDraft({
      debt_type: 'mortgage',
      name: 'Lopende hypotheek',
      current_balance: 300000,
      field3: 3.5,
      repayment_type: 'lineair',
      start_date: '2020-06-01',
    })
    expect(draft.repayment_type).toBe('lineair')
    expect(draft.is_tax_deductible).toBe(true)
    expect(draft.start_date).toBe('2020-06-01')
    // end_date = start_date + 30 jaar (looptijd mortgage), niet vandaag + 30.
    expect(draft.end_date).toBe(addYearsIso('2020-06-01', 30))
  })

  it('mortgage: ongeldige/ontbrekende start_date valt veilig terug op vandaag', () => {
    const today = todayIso()
    const invalid = buildDebtDraft({
      debt_type: 'mortgage',
      name: 'Hyp',
      current_balance: 300000,
      field3: 3.5,
      start_date: '2026-02-31', // bestaat niet
    })
    expect(invalid.start_date).toBe(today)
    expect(invalid.end_date).toBe(addYearsIso(today, 30))

    const omitted = buildDebtDraft({
      debt_type: 'mortgage',
      name: 'Hyp2',
      current_balance: 300000,
      field3: 3.5,
    })
    expect(omitted.start_date).toBe(today)
  })

  // ── Expliciete resterende looptijd (term_years) ──────────────────────

  it('mortgage: expliciete term_years zet end_date op vandaag + looptijd en stuurt het maandbedrag aan', () => {
    const today = todayIso()
    const base = {
      debt_type: 'mortgage',
      name: 'Lopende hypotheek',
      current_balance: 300000,
      field3: 3.5,
      repayment_type: 'annuiteit',
      start_date: '2019-05-01',
    } as const

    const assumed = buildDebtDraft(base)
    // Regressie-vastlegging van de stille aanname: zonder invoer blijft
    // end_date = ingangsdatum + 30 jaar (DEFAULT_TERM_YEARS_PER_TYPE).
    expect(assumed.end_date).toBe(addYearsIso('2019-05-01', 30))

    const explicit = buildDebtDraft({ ...base, term_years: 23 })
    // Resterend ⇒ geankerd op vandaag, niet op de ingangsdatum.
    expect(explicit.end_date).toBe(addYearsIso(today, 23))
    expect(explicit.start_date).toBe('2019-05-01')
    // Dezelfde termijn voedt de maandlast-schatting: 23 jaar aflossen over
    // het resterende saldo is duurder per maand dan 30 jaar.
    expect(explicit.monthly_payment).toBeGreaterThan(assumed.monthly_payment)
    expect(explicit.minimum_payment).toBe(explicit.monthly_payment)
  })

  it('mortgage: term_years buiten bereik of niet-numeriek valt terug op de type-default', () => {
    const base = {
      debt_type: 'mortgage',
      name: 'Hyp',
      current_balance: 300000,
      field3: 3.5,
      start_date: '2019-05-01',
    } as const
    const fallback = addYearsIso('2019-05-01', 30)

    expect(buildDebtDraft({ ...base, term_years: 0 }).end_date).toBe(fallback)
    expect(buildDebtDraft({ ...base, term_years: 99 }).end_date).toBe(fallback)
    expect(buildDebtDraft({ ...base, term_years: null }).end_date).toBe(fallback)
    expect(buildDebtDraft({ ...base, term_years: Number.NaN }).end_date).toBe(fallback)
    // Halve jaren worden naar hele jaren afgerond (addYearsIso rekent in
    // hele jaren — een fractie zou een ongeldige datum opleveren).
    expect(buildDebtDraft({ ...base, term_years: 22.6 }).end_date).toBe(
      addYearsIso(todayIso(), 23),
    )
  })

  it('mortgage: een expliciete monthly_payment wint nog steeds van term_years', () => {
    const draft = buildDebtDraft({
      debt_type: 'mortgage',
      name: 'Hyp',
      current_balance: 300000,
      field3: 3.5,
      term_years: 23,
      monthly_payment: 1390,
    })
    expect(draft.monthly_payment).toBe(1390)
    expect(draft.end_date).toBe(addYearsIso(todayIso(), 23))
  })

  it('gekoppelde hypotheek: debt_type=mortgage + fiscale/aflossing-vlaggen + linked_asset_id samen', () => {
    // Borgt de FIRE-correctheid: alleen met debt_type='mortgage' ÉN
    // linked_asset_id filtert filterAssetsForFire huis + hypotheek samen weg.
    const draft = buildDebtDraft({
      debt_type: 'mortgage',
      name: 'Hypotheek — Woning',
      current_balance: 320000,
      field3: 3.2,
      linked_asset_id: '00000000-0000-0000-0000-0000000000aa',
    })
    expect(draft.debt_type).toBe('mortgage')
    expect(draft.linked_asset_id).toBe('00000000-0000-0000-0000-0000000000aa')
    expect(draft.is_tax_deductible).toBe(true)
    expect(draft.include_aflossing_in_savings).toBe(true)
    expect(draft.interest_rate).toBe(3.2)
  })

  // ── Expliciete aflossing per maand (monthly_payment) ─────────────────

  it('car_loan: expliciete monthly_payment wint van de berekende default', () => {
    const draft = buildDebtDraft({
      debt_type: 'car_loan',
      name: 'Autolening',
      current_balance: 28700,
      field3: 6.5,
      monthly_payment: 450,
    })
    expect(draft.monthly_payment).toBe(450)
    expect(draft.minimum_payment).toBe(450)
    expect(draft.interest_rate).toBe(6.5)
    // De einddatum volgt uit saldo + maandbedrag + rente, niet uit de stille
    // 5-jaar-typedefault: €28.700 tegen 6,5% lost bij €450 per maand in 79
    // maanden af (annuïteit). De gebruiker krijgt voor dit type geen
    // looptijdveld te zien, dus de default zou hier een verzonnen getal zijn.
    expect(draft.end_date).toBe(addMonthsIso(todayIso(), 79))
  })

  it('leidt de einddatum af uit het maandbedrag i.p.v. de type-default (bug H2)', () => {
    // €320 bij €80 per maand is in 4 maanden weg; de personal_loan-default
    // van 5 jaar maakte hier "60 mnd resterend" van.
    const draft = buildDebtDraft({
      debt_type: 'personal_loan',
      name: 'Kleine lening',
      current_balance: 320,
      field3: 0,
      monthly_payment: 80,
    })
    expect(draft.monthly_payment).toBe(80)
    expect(draft.end_date).toBe(addMonthsIso(todayIso(), 4))
    expect(draft.end_date).not.toBe(addYearsIso(todayIso(), 5))
  })

  it('volgt het lineaire pad voor een lineair afgelost type', () => {
    // familielening = lineair: aflossing = maandbedrag − rente over het saldo.
    // €20.000 bij 0% en €250 per maand ⇒ 80 maanden (default was 10 jaar).
    const draft = buildDebtDraft({
      debt_type: 'familielening',
      name: 'Lening ouders',
      current_balance: 20000,
      field3: 0,
      monthly_payment: 250,
    })
    expect(draft.repayment_type).toBe('lineair')
    expect(draft.end_date).toBe(addMonthsIso(todayIso(), 80))
  })

  it('laat de einddatum leeg als het maandbedrag de rente niet dekt', () => {
    // €10.000 tegen 12% kost €100 rente per maand; met €50 lost de schuld
    // nooit af. Geen einddatum is dan eerlijker dan een afgeronde aanname —
    // alle consumers guarden al op een ontbrekende end_date.
    const draft = buildDebtDraft({
      debt_type: 'personal_loan',
      name: 'Dure lening',
      current_balance: 10000,
      field3: 12,
      monthly_payment: 50,
    })
    expect(draft.monthly_payment).toBe(50)
    expect(draft.end_date).toBeNull()
  })

  it('een expliciete looptijd wint van de afleiding uit het maandbedrag', () => {
    // Beide ingevuld ⇒ de looptijd is het directe antwoord van de gebruiker.
    const draft = buildDebtDraft({
      debt_type: 'personal_loan',
      name: 'Lening',
      current_balance: 320,
      field3: 0,
      monthly_payment: 80,
      term_years: 3,
    })
    expect(draft.end_date).toBe(addYearsIso(todayIso(), 3))
  })

  it('car_loan: zonder monthly_payment blijft de berekende default staan (regressie)', () => {
    const withField = buildDebtDraft({
      debt_type: 'car_loan',
      name: 'Autolening',
      current_balance: 28700,
      field3: 6.5,
    })
    const withNull = buildDebtDraft({
      debt_type: 'car_loan',
      name: 'Autolening',
      current_balance: 28700,
      field3: 6.5,
      monthly_payment: null,
    })
    // null = niet ingevuld → identiek aan weglaten (annuïteit over 5 jaar).
    expect(withNull.monthly_payment).toBe(withField.monthly_payment)
    expect(withField.monthly_payment).toBeGreaterThan(0)
  })

  it('monthly_payment=0 is een expliciete keuze (geen terugval op de default)', () => {
    // Bv. een familielening die tijdelijk niet wordt afgelost.
    const draft = buildDebtDraft({
      debt_type: 'familielening',
      name: 'Lening ouders',
      current_balance: 20000,
      monthly_payment: 0,
    })
    expect(draft.monthly_payment).toBe(0)
    expect(draft.minimum_payment).toBe(0)
  })

  it('payment_plan: field3 (maandbedrag) blijft werken; expliciete monthly_payment wint zelfs daar', () => {
    const viaField3 = buildDebtDraft({
      debt_type: 'payment_plan',
      name: 'Regeling',
      current_balance: 2400,
      field3: 100,
    })
    expect(viaField3.monthly_payment).toBe(100)

    const viaBoth = buildDebtDraft({
      debt_type: 'payment_plan',
      name: 'Regeling',
      current_balance: 2400,
      field3: 100,
      monthly_payment: 125,
    })
    expect(viaBoth.monthly_payment).toBe(125)
  })
})
