/**
 * Gedeelde engine-checks voor de UAT-Schuld-acceptatiecriteria (`schuld.ts`).
 *
 * PURE module — geen vitest/DOM-afhankelijkheden — zodat dezelfde lijst
 * checks kan draaien onder:
 *  1. `schuld.engine.test.ts` (vitest/CI): `expect(actual).toBe(expected)` per check.
 *  2. de in-app regressietest-pagina (`lib/regression-tests/suites/uat-schuld.ts`):
 *     `assertEqual(actual, expected, label)` per check.
 *
 * Elke `run()` roept UITSLUITEND de échte rekenfunctie(s)/constante(n) aan op de
 * échte persona-brondata (`lib/test-personas.ts`) — geen herimplementatie van
 * bedrijfslogica, met één bewuste uitzondering: de figures-strip-totalen
 * (Σsaldo, Σmaandlast, gewogen rente, distinct debt_type) worden inline gesommeerd
 * zoals `app/(app)/core/debts/page.tsx` (r362-392) dat doet — in het
 * solo-perspectief van een persona zonder huishouden reduceert `shareOf(d, x)`
 * triviaal tot `x`, dus er is geen weeglogica te herimplementeren (spiegelt de
 * `totaleWaarde`-helper in `bezit-checks.ts`).
 *
 * Alle gebruikte engine-functies zijn client-veilig (geen `server-only` /
 * `@/lib/supabase/server` / `next/headers` in hun import-graaf); `lib/debt-data.ts`,
 * `lib/debt-kpi.ts`, `lib/box1-tax.ts`, `lib/box2-data.ts`, `lib/aandachtspunten.ts`
 * en `lib/household-data.ts` zijn pure reken-/constanten-modules.
 *
 * Meerdere samenhangende cijfers worden samengevoegd tot één `key=waarde; …`
 * string met VASTE precisie per veld, zodat de strikte `!==`-vergelijking stabiel
 * is ondanks floating-point-ruis.
 */

import { PERSONAS, type PersonaDebt } from '@/lib/test-personas'
import {
  computeRenteAflossingsSplit,
  computeDefaultMonthlyPayment,
  amortizationSchedule,
  DEFAULT_TERM_YEARS_PER_TYPE,
  DEBT_DEFAULT_REPAYMENT_TYPE,
  type Debt,
  type DebtType,
  type RepaymentType,
} from '@/lib/debt-data'
import { computeDebtKpi } from '@/lib/debt-kpi'
import { computeBox1Tax } from '@/lib/box1-tax'
import { calculateBox2 } from '@/lib/box2-data'
import { debtsToAandachtspunten } from '@/lib/aandachtspunten'
import { computeSharePct } from '@/lib/household-data'
import { SCHULD_ACCEPTANCE } from './schuld'
import type { AcceptanceCriterion } from './types'
import { roundCents } from '@/lib/format'

const lisa = PERSONAS.lisa
const compleet = PERSONAS.compleet
const willem = PERSONAS.willem
const daan = PERSONAS.daan

export interface SchuldEngineCheck {
  /** 'WF-SCHULD-01' */
  workflow: string
  /** 'UAT-SCHULD-01' */
  scenarioId: string
  /** Korte, mensleesbare omschrijving van wat deze check bewijst. */
  label: string
  /** Roept de échte rekenfunctie(s) aan en levert expected + actual. */
  run: () => { expected: number | string; actual: number | string }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Vindt het criterium in schuld.ts — gooit als schuld.ts niet meer in sync is. */
function criterion(workflow: string): AcceptanceCriterion {
  const found = SCHULD_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — schuld.ts is niet in sync.`)
  if (found.assertion.kind !== 'exact') {
    throw new Error(`${workflow} is geen 'exact'-criterium meer in schuld.ts (kind=${found.assertion.kind}).`)
  }
  return found
}

function fx(n: number, decimals: number): string {
  return n.toFixed(decimals)
}

/** Volledig getypeerde Debt uit een PersonaDebt-template — vult de velden aan
 *  die de seed pas op inschrijftijd zet (id, is_active) en die de rekenfuncties
 *  lezen (repayment_type, dates). */
function toDebt(pd: PersonaDebt, id: string): Debt {
  return {
    id,
    user_id: 'test-user',
    name: pd.name,
    debt_type: pd.debt_type as DebtType,
    original_amount: pd.original_amount,
    current_balance: pd.current_balance,
    interest_rate: pd.interest_rate,
    minimum_payment: pd.minimum_payment,
    monthly_payment: pd.monthly_payment,
    start_date: pd.start_date,
    end_date: null,
    creditor: pd.creditor ?? null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    subtype: pd.subtype ?? null,
    is_tax_deductible: pd.is_tax_deductible ?? null,
    fixed_rate_end_date: pd.fixed_rate_end_date ?? null,
    nhg: pd.nhg ?? null,
    linked_asset_id: null,
    credit_limit: pd.credit_limit ?? null,
    repayment_type: (pd.repayment_type as RepaymentType | undefined) ?? null,
    draagkrachtmeting_date: pd.draagkrachtmeting_date ?? null,
    tax_year: null,
    has_payment_plan: false,
    has_written_agreement: false,
    ownership: 'personal',
    household_id: null,
    partner_split_pct: null,
    net_worth_inclusion_pct: 100,
    include_aflossing_in_savings: false,
    custom_aflossing_amount: null,
    has_hypotheekplanner_tracking: pd.has_hypotheekplanner_tracking ?? false,
  }
}

// ── Figures-strip-mirror (solo-perspectief; shareOf → identiteit) ──────────

function totalBalance(debts: readonly PersonaDebt[]): number {
  return debts.reduce((s, d) => s + Number(d.current_balance), 0)
}
function totalMonthly(debts: readonly PersonaDebt[]): number {
  return debts.reduce((s, d) => s + Number(d.monthly_payment ?? 0), 0)
}
/** Σ(rate×balance)/Σbalance — spiegelt weightedAvgInterest in page.tsx. */
function weightedRate(debts: readonly { current_balance: number; interest_rate: number }[]): number {
  const base = debts.reduce((s, d) => s + Number(d.current_balance), 0)
  if (base <= 0) return 0
  return debts.reduce((s, d) => s + Number(d.interest_rate) * Number(d.current_balance), 0) / base
}
/** Aantal distinct debt_type onder de (actieve, saldo>0) schulden. */
function categoryCount(debts: readonly PersonaDebt[]): number {
  return new Set(debts.filter((d) => Number(d.current_balance) > 0).map((d) => d.debt_type)).size
}

/** LTV-KPI via de échte computeDebtKpi (kpiMortgage). */
function ltvKpi(balance: number, linkedValue: number): { pct: string; tone: string } {
  const debt = toDebt(
    { ...(lisa.debts.find((d) => d.debt_type === 'mortgage') as PersonaDebt), current_balance: balance },
    'mortgage-id',
  )
  const kpi = computeDebtKpi(debt, { linkedAssetValueByDebtId: new Map([['mortgage-id', linkedValue]]) })
  const value = kpi.primary?.value ?? ''
  return { pct: value.replace('%', '').trim(), tone: kpi.primary?.tone ?? 'none' }
}

// ── Checks — één per 'exact'-workflow in SCHULD_ACCEPTANCE ─────────────────

export const SCHULD_ENGINE_CHECKS: SchuldEngineCheck[] = [
  {
    workflow: 'WF-SCHULD-01',
    scenarioId: 'UAT-SCHULD-01',
    label: 'Totale schuld, maandlasten, gewogen rente, categorieën, LTV (persona lisa)',
    run: () => {
      criterion('WF-SCHULD-01')
      const ltv = ltvKpi(350000, 385000)
      return {
        expected: 'totaleSchuld=368270; maandlasten=2135; gewogenRente=2.88; categorieen=11; ltvPct=91; ltvTone=neutral',
        actual: `totaleSchuld=${totalBalance(lisa.debts)}; maandlasten=${totalMonthly(lisa.debts)}; gewogenRente=${fx(weightedRate(lisa.debts), 2)}; categorieen=${categoryCount(lisa.debts)}; ltvPct=${ltv.pct}; ltvTone=${ltv.tone}`,
      }
    },
  },
  {
    workflow: 'WF-SCHULD-03',
    scenarioId: 'UAT-SCHULD-03',
    label: 'Schuld toevoegen (computeDefaultMonthlyPayment + nieuwe totalen, persona daan)',
    run: () => {
      criterion('WF-SCHULD-03')
      const term = DEFAULT_TERM_YEARS_PER_TYPE.personal_loan
      const rt = DEBT_DEFAULT_REPAYMENT_TYPE.personal_loan
      const defaultMaandbedrag = computeDefaultMonthlyPayment(5000, 7, term, rt)
      const newDebts = [
        ...daan.debts,
        { current_balance: 5000, interest_rate: 7, monthly_payment: defaultMaandbedrag, debt_type: 'personal_loan' },
      ]
      const totaleSchuld = newDebts.reduce((s, d) => s + Number(d.current_balance), 0)
      const maandlasten = newDebts.reduce((s, d) => s + Number(d.monthly_payment), 0)
      const gewogen = weightedRate(newDebts)
      const cats = new Set(newDebts.map((d) => d.debt_type)).size
      return {
        expected: 'defaultMaandbedrag=99.01; totaleSchuld=18900; maandlasten=199.01; gewogenRente=2.19; categorieen=2',
        actual: `defaultMaandbedrag=${fx(defaultMaandbedrag, 2)}; totaleSchuld=${totaleSchuld}; maandlasten=${fx(maandlasten, 2)}; gewogenRente=${fx(gewogen, 2)}; categorieen=${cats}`,
      }
    },
  },
  {
    workflow: 'WF-SCHULD-04',
    scenarioId: 'UAT-SCHULD-04',
    label: 'Lege-staat-preconditie (persona willem: 0 schulden, €0)',
    run: () => {
      criterion('WF-SCHULD-04')
      return {
        expected: 'willemDebtsCount=0; willemTotaleSchuld=0',
        actual: `willemDebtsCount=${willem.debts.length}; willemTotaleSchuld=${totalBalance(willem.debts)}`,
      }
    },
  },
  {
    workflow: 'WF-SCHULD-05',
    scenarioId: 'UAT-SCHULD-05',
    label: 'Autolening detail-split (computeRenteAflossingsSplit) + %-afgelost',
    run: () => {
      criterion('WF-SCHULD-05')
      const pd = lisa.debts.find((d) => d.name === 'Restant autolening Toyota') as PersonaDebt
      const debt = toDebt(pd, 'auto-id')
      const split = computeRenteAflossingsSplit(debt)!
      const pctAfgelost = ((pd.original_amount - pd.current_balance) / pd.original_amount) * 100
      return {
        expected: 'pctAfgelost=86.67; maandRente=7.50; aflossing=212.50; rentePct=3.41; remMonths=10',
        actual: `pctAfgelost=${fx(pctAfgelost, 2)}; maandRente=${fx(split.currentRente, 2)}; aflossing=${fx(split.currentAflossing, 2)}; rentePct=${fx(split.rentePercentage, 2)}; remMonths=${split.remainingMonths}`,
      }
    },
  },
  {
    workflow: 'WF-SCHULD-06',
    scenarioId: 'UAT-SCHULD-06',
    label: 'Hypotheekrente 2,9% → 3,5%: nieuwe gewogen rente + maandrente/aflossing-split',
    run: () => {
      criterion('WF-SCHULD-06')
      const edited = lisa.debts.map((d) =>
        d.debt_type === 'mortgage' ? { ...d, interest_rate: 3.5 } : d,
      )
      const nieuweGewogen = weightedRate(edited)
      const hypo = toDebt(
        { ...(lisa.debts.find((d) => d.debt_type === 'mortgage') as PersonaDebt), interest_rate: 3.5 },
        'hypo-id',
      )
      const split = computeRenteAflossingsSplit(hypo)!
      return {
        expected: 'nieuweGewogenRente=3.5; maandRente=1020.83; aflossing=79.17',
        actual: `nieuweGewogenRente=${fx(nieuweGewogen, 1)}; maandRente=${fx(split.currentRente, 2)}; aflossing=${fx(split.currentAflossing, 2)}`,
      }
    },
  },
  {
    workflow: 'WF-SCHULD-07',
    scenarioId: 'UAT-SCHULD-07',
    label: 'Saldo bijwerken €800 → €750 (directe optelling, maandlast ongewijzigd)',
    run: () => {
      criterion('WF-SCHULD-07')
      const totaleSchuld = totalBalance(lisa.debts) - (800 - 750)
      return {
        expected: 'totaleSchuld=368220; maandlasten=2135',
        actual: `totaleSchuld=${totaleSchuld}; maandlasten=${totalMonthly(lisa.debts)}`,
      }
    },
  },
  {
    workflow: 'WF-SCHULD-08',
    scenarioId: 'UAT-SCHULD-08',
    label: 'Creditcard volledig aflossen: totalen + categorieën na is_active=false',
    run: () => {
      criterion('WF-SCHULD-08')
      const visa = lisa.debts.find((d) => d.name === 'Visa creditcard saldo') as PersonaDebt
      const remaining = lisa.debts.filter((d) => d !== visa)
      return {
        expected: 'totaleSchuld=368020; maandlasten=2110; categorieen=10',
        actual: `totaleSchuld=${totalBalance(remaining)}; maandlasten=${totalMonthly(remaining)}; categorieen=${categoryCount(remaining)}`,
      }
    },
  },
  {
    workflow: 'WF-SCHULD-09',
    scenarioId: 'UAT-SCHULD-09',
    label: 'Verwijderen: factuur klusbedrijf (happy) + hypotheek (randgeval grootste)',
    run: () => {
      criterion('WF-SCHULD-09')
      const factuur = lisa.debts.find((d) => d.name === 'Achterstallige factuur klusbedrijf') as PersonaDebt
      const zonderFactuur = lisa.debts.filter((d) => d !== factuur)
      const happyPath = totalBalance(zonderFactuur)
      const cats = categoryCount(zonderFactuur)
      const hypotheekVerwijderd = totalBalance(lisa.debts) - 350000
      return {
        expected: 'happyPath=368070; categorieen=10; hypotheekVerwijderd=18270',
        actual: `happyPath=${happyPath}; categorieen=${cats}; hypotheekVerwijderd=${hypotheekVerwijderd}`,
      }
    },
  },
  {
    workflow: 'WF-SCHULD-11',
    scenarioId: 'UAT-SCHULD-11',
    label: 'Categoriepagina hero-totaal Hypotheek (persona compleet, 2 hypotheken)',
    run: () => {
      criterion('WF-SCHULD-11')
      const mortgages = compleet.debts.filter((d) => d.debt_type === 'mortgage')
      return { expected: 410000, actual: totalBalance(mortgages) }
    },
  },
  {
    workflow: 'WF-SCHULD-13',
    scenarioId: 'UAT-SCHULD-13',
    label: 'Hypotheekplanner: equity, equity/mnd, 10-jr waardestijging, jaar-1 amortisatie (persona compleet)',
    run: () => {
      criterion('WF-SCHULD-13')
      const marktwaarde = 560000
      const hypo = toDebt(compleet.debts.find((d) => d.name === 'Hypotheek eigen woning') as PersonaDebt, 'hypo-tessa')
      const eigenVermogen = marktwaarde - Number(hypo.current_balance)
      const split = computeRenteAflossingsSplit(hypo)!
      const waardestijging10jr = marktwaarde * Math.pow(1.025, 10)
      const sched = amortizationSchedule(300000, 3.1, 1280).slice(0, 12)
      const jaar1Rente = sched.reduce((s, r) => s + r.interest, 0)
      const jaar1Aflossing = sched.reduce((s, r) => s + r.principal, 0)
      return {
        expected: 'eigenVermogen=260000; equityPerMaand=505.00; waardestijging10jr=716847; amortJaar1Rente=9213.16; amortJaar1Aflossing=6146.84',
        actual: `eigenVermogen=${eigenVermogen}; equityPerMaand=${fx(split.currentAflossing, 2)}; waardestijging10jr=${fx(waardestijging10jr, 0)}; amortJaar1Rente=${fx(jaar1Rente, 2)}; amortJaar1Aflossing=${fx(jaar1Aflossing, 2)}`,
      }
    },
  },
  {
    workflow: 'WF-SCHULD-15',
    scenarioId: 'UAT-SCHULD-15',
    label: 'LTV via computeDebtKpi: normaal 91% (neutral) + onderwater 104% (neg)',
    run: () => {
      criterion('WF-SCHULD-15')
      const normaal = ltvKpi(350000, 385000)
      const onderwater = ltvKpi(400000, 385000)
      return {
        expected: 'ltvNormaal=91; toneNormaal=neutral; ltvOnderwater=104; toneOnderwater=neg',
        actual: `ltvNormaal=${normaal.pct}; toneNormaal=${normaal.tone}; ltvOnderwater=${onderwater.pct}; toneOnderwater=${onderwater.tone}`,
      }
    },
  },
  {
    workflow: 'WF-SCHULD-16',
    scenarioId: 'UAT-SCHULD-16',
    label: 'Aflossingsdeel in spaarquote (split) + 50%-weging',
    run: () => {
      criterion('WF-SCHULD-16')
      const hypo = toDebt(lisa.debts.find((d) => d.debt_type === 'mortgage') as PersonaDebt, 'hypo-lisa')
      const split = computeRenteAflossingsSplit(hypo)!
      const aflossingsdeel = split.currentAflossing
      const incl50 = roundCents(aflossingsdeel * 0.5)
      return {
        expected: 'aflossingsdeel=254.17; aflossingsdeel50pct=127.09',
        actual: `aflossingsdeel=${fx(aflossingsdeel, 2)}; aflossingsdeel50pct=${fx(incl50, 2)}`,
      }
    },
  },
  {
    workflow: 'WF-SCHULD-17',
    scenarioId: 'UAT-SCHULD-17',
    label: 'Netto-vermogen-inclusie 50%: effectief saldo + delta (Lening van ouders)',
    run: () => {
      criterion('WF-SCHULD-17')
      const ouders = lisa.debts.find((d) => d.name === 'Lening van ouders') as PersonaDebt
      const effectiefSaldo = (Number(ouders.current_balance) * 50) / 100
      const delta = Number(ouders.current_balance) - effectiefSaldo
      return {
        expected: 'effectiefSaldo=3000; nettoVermogenDelta=3000',
        actual: `effectiefSaldo=${effectiefSaldo}; nettoVermogenDelta=${delta}`,
      }
    },
  },
  {
    workflow: 'WF-SCHULD-18',
    scenarioId: 'UAT-SCHULD-18',
    label: 'Gedeelde schuld 60/40 (computeSharePct custom) + headline eigen-perspectief',
    run: () => {
      criterion('WF-SCHULD-18')
      const ouders = lisa.debts.find((d) => d.name === 'Lening van ouders') as PersonaDebt
      const saldo = Number(ouders.current_balance)
      const maandlast = Number(ouders.monthly_payment)
      const sharePct = computeSharePct(
        { splitMode: 'custom', customSplitPct: 60, primaryPayerId: 'user-a' },
        'user-a',
      )
      const jouwAandeel = saldo * (sharePct / 100)
      const partnerAandeel = saldo * ((100 - sharePct) / 100)
      const maandlastJij = maandlast * (sharePct / 100)
      const maandlastPartner = maandlast * ((100 - sharePct) / 100)
      const headline = totalBalance(lisa.debts) - saldo + jouwAandeel
      return {
        expected: 'sharePct=60; jouwAandeel=3600; partnerAandeel=2400; maandlastJij=60; maandlastPartner=40; headline=365870',
        actual: `sharePct=${sharePct}; jouwAandeel=${jouwAandeel}; partnerAandeel=${partnerAandeel}; maandlastJij=${maandlastJij}; maandlastPartner=${maandlastPartner}; headline=${headline}`,
      }
    },
  },
  {
    workflow: 'WF-SCHULD-20',
    scenarioId: 'UAT-SCHULD-20',
    label: 'Wet excessief lenen DGA: drempel + bovenmatig deel (calculateBox2)',
    run: () => {
      criterion('WF-SCHULD-20')
      const base = { deelnemingen: [], year: 2026 as const, hasPartner: false, dailyExpenses: 0 }
      const onder = calculateBox2({ ...base, dgaLeningenTotal: 200 })
      const boven = calculateBox2({ ...base, dgaLeningenTotal: 550000 })
      return {
        expected: 'drempel=500000; excessOnder=0; excessBoven=50000',
        actual: `drempel=${onder.dgaLeningenDrempel}; excessOnder=${onder.dgaLeningenExcess}; excessBoven=${boven.dgaLeningenExcess}`,
      }
    },
  },
  {
    workflow: 'WF-SCHULD-21',
    scenarioId: 'UAT-SCHULD-21',
    label: 'Box 1 eigenwoning: forfait, renteaftrek, saldo (+6%-randgeval + Hillen-flip bij ontkoppeld)',
    run: () => {
      criterion('WF-SCHULD-21')
      const woz = 540000
      const saldoHypotheek = 300000
      const renteA = saldoHypotheek * 0.031 // = 9300
      const rente6 = saldoHypotheek * 0.06 // = 18000
      const base = { grossYearlyIncome: 100000, year: 2026 as const, wozValue: woz }
      const a = computeBox1Tax({ ...base, hypotheekRente: renteA })
      const b = computeBox1Tax({ ...base, hypotheekRente: rente6 })
      const c = computeBox1Tax({ ...base, hypotheekRente: 0 })
      return {
        expected: 'forfait=1890; renteaftrek=9300; saldo=-7410; saldo6pct=-16110; hillenAftrekOntkoppeld=1357.02; saldoOntkoppeld=532.98',
        actual: `forfait=${Math.round(a.eigenwoningforfait)}; renteaftrek=${Math.round(a.hypotheekrenteaftrek)}; saldo=${Math.round(a.eigenwoningSaldo)}; saldo6pct=${Math.round(b.eigenwoningSaldo)}; hillenAftrekOntkoppeld=${fx(c.hillenAftrek, 2)}; saldoOntkoppeld=${fx(c.eigenwoningSaldo, 2)}`,
      }
    },
  },
  {
    workflow: 'WF-SCHULD-22',
    scenarioId: 'UAT-SCHULD-22',
    label: 'Versneld-aflossen-aandachtspunten (debtsToAandachtspunten): aantal 6 + besparingsom',
    run: () => {
      criterion('WF-SCHULD-22')
      const debts = lisa.debts.map((pd, i) => toDebt(pd, `debt-${i}`))
      const aandachtspunten = debtsToAandachtspunten(debts, 0)
      const besparingSom = aandachtspunten.reduce((s, a) => s + a.savings, 0)
      return {
        expected: 'aantalAandachtspunten=6; besparingSom=436.20',
        actual: `aantalAandachtspunten=${aandachtspunten.length}; besparingSom=${fx(besparingSom, 2)}`,
      }
    },
  },
]
