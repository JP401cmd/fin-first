/**
 * Debt types, default seed data, and financial calculations
 * (amortization, snowball, avalanche, projections).
 */

import { roundCents } from '@/lib/format'

// ── Types ────────────────────────────────────────────────────

export type DebtType =
  | 'mortgage'
  | 'personal_loan'
  | 'student_loan'
  | 'car_loan'
  | 'credit_card'
  | 'revolving_credit'
  | 'payment_plan'
  | 'belastingschuld'
  | 'familielening'
  | 'dga_schuld'
  | 'other'

export type RepaymentType = 'aflossingsvrij' | 'annuiteit' | 'lineair'

export type MortgageSubtype = 'annuiteit' | 'lineair' | 'aflossingsvrij' | 'spaarhypotheek' | 'beleggingshypotheek'
export type StudentLoanSubtype = 'oud_stelsel' | 'nieuw_stelsel' | 'sf35'
export type PersonalLoanSubtype = 'aflopend' | 'doorlopend'
export type CreditCardSubtype = 'regulier' | 'charge_card'
export type RevolvingCreditSubtype = 'doorlopend_krediet' | 'roodstand'

export type BelastingschuldSubtype = 'inkomstenbelasting' | 'voorlopige_aanslag' | 'box3_nabetaling' | 'btw' | 'overig_belasting'
export type FamilieleningSubtype = 'ouders' | 'familie' | 'vrienden' | 'overig_onderhand'

export type DebtSubtype =
  | MortgageSubtype
  | StudentLoanSubtype
  | PersonalLoanSubtype
  | CreditCardSubtype
  | RevolvingCreditSubtype
  | BelastingschuldSubtype
  | FamilieleningSubtype

export interface Debt {
  id: string
  user_id: string
  name: string
  debt_type: DebtType
  original_amount: number
  current_balance: number
  interest_rate: number // annual %
  minimum_payment: number
  monthly_payment: number
  start_date: string
  end_date: string | null
  creditor: string | null
  notes: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
  // Type-specific fields
  subtype: string | null
  is_tax_deductible: boolean | null
  fixed_rate_end_date: string | null
  nhg: boolean | null
  linked_asset_id: string | null
  credit_limit: number | null
  repayment_type: RepaymentType | null
  draagkrachtmeting_date: string | null
  // ── Leningdelen (W-005 / ADR 0140) ──────────────────────────────────
  // Groepeert leningdelen onder één hypotheek: verwijst naar de hoofdrij van
  // dezelfde hypotheek en dezelfde eigenaar (samengestelde FK
  // `(parent_debt_id, user_id)`). NULL = zelfstandige schuld of hoofdrij.
  // De hoofdrij is ZELF een leningdeel en draagt nooit het groepstotaal — elke
  // rekenmotor telt alle mortgage-rijen op. Optioneel in TS omdat de kolom
  // nullable is en geen enkel schrijfpad hem vandaag zet; groeperen gebeurt
  // puur voor de weergave via `lib/debt-leningdelen.ts`.
  parent_debt_id?: string | null
  // Belastingschuld fields
  tax_year: number | null
  has_payment_plan: boolean
  // Familielening fields
  has_written_agreement: boolean
  // Household fields
  ownership: 'personal' | 'shared'
  household_id: string | null
  partner_split_pct: number | null // 0–100, per-debt split override (null = use household default)
  // Net worth inclusion
  net_worth_inclusion_pct: number // 0–100, default 100
  // Aflossing in spaarquote
  include_aflossing_in_savings: boolean
  custom_aflossing_amount: number | null // null = berekend, getal = eigen bedrag p/m
  // ── App-koppeling (zie components/core/category-deepening-registry.ts) ──
  // Hypotheekplanner-app tracked een mortgage op basis van deze boolean
  // (alleen relevant voor `debt_type === 'mortgage'`). Aflosstrategie is
  // sinds de v2-refactor een globale kaart op /core/debts en gebruikt geen
  // per-debt opt-in meer. Default false zodat bestaande gebruikers geen
  // app-tracking krijgen zonder dat ze die hebben geactiveerd.
  has_hypotheekplanner_tracking: boolean
  // ── Provenance (zie supabase/migrations/<...>_add_aangifte_source.sql) ──
  // Herkomst van deze rij. Optioneel in TS — DB heeft NOT NULL DEFAULT
  // 'manual'. Zelfde semantiek als `Asset.source`. 'aangifte_import' wordt
  // gezet door de Belastingdienst-flow, 'broker_csv' / 'bank_psd2' door
  // andere import-paden.
  source?: DebtSource
  // Peildatum van de bron (bv. 1 januari van het belastingjaar). NULL voor
  // manueel ingevoerde schulden.
  imported_peildatum?: string | null
}

/**
 * Provenance tag voor een debt-rij. Spiegelbeeld van `AssetSource`; beide
 * worden gevalideerd door dezelfde CHECK-constraint set in de migratie
 * `<...>_add_aangifte_source.sql`.
 */
export type DebtSource = 'manual' | 'aangifte_import' | 'broker_csv' | 'bank_psd2'

export const DEBT_TYPE_LABELS: Record<DebtType, string> = {
  mortgage: 'Hypotheek',
  personal_loan: 'Persoonlijke lening',
  student_loan: 'Studielening',
  car_loan: 'Autolening',
  credit_card: 'Creditcard',
  revolving_credit: 'Doorlopend krediet',
  payment_plan: 'Afbetalingsregeling',
  belastingschuld: 'Belastingschuld',
  familielening: 'Familielening',
  dga_schuld: 'DGA-schuld aan eigen BV',
  other: 'Overig',
}

// ── Debt Groups ──────────────────────────────────────────────
//
// Schulden groeperen langs de looptijd/aard-as, parallel aan de asset-groepen
// (`ASSET_GROUP_FOR_TYPE` in lib/asset-data.ts):
// - 'wonen'       = hypotheek (gekoppeld aan de eigen woning)
// - 'consumptief' = kortlopend / persoonlijk krediet (lening, studie, auto,
//                   creditcard, doorlopend krediet, afbetalingsregeling)
// - 'overig'      = formeel/onderhands (fiscaal, DGA, familie, restcategorie)
//
// Hergebruikt door de netto-vermogen-verloop-grafiek (groepsbanden onder de
// nullijn) via lib/load-category-history.ts. `DEBT_TYPE_COLORS` blijft de bron
// voor de per-type tint; dit is puur de groep-indeling.

export type DebtGroup = 'wonen' | 'consumptief' | 'overig'

export const DEBT_GROUP_LABELS: Record<DebtGroup, string> = {
  wonen: 'Wonen',
  consumptief: 'Consumptief',
  overig: 'Overig',
}

export const DEBT_GROUP_FOR_TYPE: Record<DebtType, DebtGroup> = {
  mortgage: 'wonen',
  personal_loan: 'consumptief',
  student_loan: 'consumptief',
  car_loan: 'consumptief',
  credit_card: 'consumptief',
  revolving_credit: 'consumptief',
  payment_plan: 'consumptief',
  belastingschuld: 'overig',
  dga_schuld: 'overig',
  familielening: 'overig',
  other: 'overig',
}

export function getDebtGroup(t: DebtType): DebtGroup {
  return DEBT_GROUP_FOR_TYPE[t] ?? 'overig'
}

export const DEBT_TYPE_ICONS: Record<DebtType, string> = {
  mortgage: 'Building',
  personal_loan: 'Banknote',
  student_loan: 'GraduationCap',
  car_loan: 'Car',
  credit_card: 'CreditCard',
  revolving_credit: 'Repeat',
  payment_plan: 'Clock',
  belastingschuld: 'Receipt',
  familielening: 'Users',
  dga_schuld: 'Briefcase',
  other: 'MoreHorizontal',
}

/**
 * Kleur-palet voor schuld-typen — monochroom semantisch rood (`--negative`)
 * met intensiteit-laddertje. Differentiatie loopt langs de **looptijd /
 * formaliteit-as**: lange-termijn formele schulden (hypotheek, fiscaal,
 * DGA) staan in de diepste tint, korte-termijn persoonlijk krediet
 * (lening, creditcard) in de medium-tint, en onderhands/overig in de
 * zachtste tint.
 *
 * Eén tegenpool-tint t.o.v. de Kern-bruin asset-laddertje houdt de Kern-
 * pagina visueel rustig en consistent. De kleur volgt het bestaande
 * `--negative` token (oklch 0.50 0.09 25); we variëren alleen de lightness.
 *
 * Wordt hergebruikt in `wealth-composition-chart.tsx` voor de negatieve
 * gestapelde bars onder de nullijn.
 */
export const DEBT_TYPE_COLORS: Record<DebtType, string> = {
  // Klasse I — lange termijn / formeel
  mortgage: 'oklch(0.50 0.09 25)',
  dga_schuld: 'oklch(0.50 0.09 25)',
  belastingschuld: 'oklch(0.50 0.09 25)',
  // Klasse II — korte termijn / consumptief krediet
  personal_loan: 'oklch(0.58 0.09 25)',
  student_loan: 'oklch(0.58 0.09 25)',
  car_loan: 'oklch(0.58 0.09 25)',
  credit_card: 'oklch(0.58 0.09 25)',
  revolving_credit: 'oklch(0.58 0.09 25)',
  // Klasse III — onderhands / overig
  payment_plan: 'oklch(0.66 0.07 25)',
  familielening: 'oklch(0.66 0.07 25)',
  other: 'oklch(0.71 0.05 25)',
}

// ── Subtypes ─────────────────────────────────────────────────

export const DEBT_SUBTYPE_LABELS: Partial<Record<DebtType, Record<string, string>>> = {
  mortgage: {
    annuiteit: 'Annuiteit',
    lineair: 'Lineair',
    aflossingsvrij: 'Aflossingsvrij',
    spaarhypotheek: 'Spaarhypotheek',
    beleggingshypotheek: 'Beleggingshypotheek',
  },
  student_loan: {
    oud_stelsel: 'Oud stelsel (voor 2018)',
    nieuw_stelsel: 'Nieuw stelsel (na 2018)',
    sf35: 'SF35 (voor 2012)',
  },
  personal_loan: {
    aflopend: 'Aflopend',
    doorlopend: 'Doorlopend',
  },
  credit_card: {
    regulier: 'Regulier',
    charge_card: 'Charge card',
  },
  revolving_credit: {
    doorlopend_krediet: 'Doorlopend krediet',
    roodstand: 'Roodstand',
  },
  belastingschuld: {
    inkomstenbelasting: 'Inkomstenbelasting aanslag',
    voorlopige_aanslag: 'Voorlopige aanslag',
    box3_nabetaling: 'Box 3 nabetaling',
    btw: 'BTW-schuld',
    overig_belasting: 'Overige belastingschuld',
  },
  familielening: {
    ouders: 'Lening van ouders',
    familie: 'Lening van overige familie',
    vrienden: 'Lening van vrienden',
    overig_onderhand: 'Overige onderhandse lening',
  },
}

export const REPAYMENT_TYPE_LABELS: Record<RepaymentType, string> = {
  aflossingsvrij: 'Aflossingsvrij',
  annuiteit: 'Annuïteit',
  lineair: 'Lineair',
}

// Eén zin per aflossingsvorm, in gewone taal (UR3-12) — gebruikt door de
// keuzetegels in MortgageExtraFields (onboarding én de in-app quick-add-
// wizard delen dit component). Zelfde strekking als annuiteit.explanation
// in lib/glossary-data.ts.
export const REPAYMENT_TYPE_EXPLANATIONS: Record<RepaymentType, string> = {
  annuiteit:
    'Elke maand hetzelfde bedrag. Eerst betaal je vooral rente, later vooral aflossing.',
  lineair:
    'Elke maand hetzelfde stuk aflossing; je maandbedrag begint hoger en wordt daarna elke maand iets lager.',
  aflossingsvrij:
    'Je betaalt alleen rente. De schuld zelf blijft staan tot het einde van de looptijd.',
}

export const DEBT_SUBTYPE_DEFAULTS: Record<string, Partial<{
  repayment_type: RepaymentType
  is_tax_deductible: boolean
}>> = {
  // Mortgage subtypes
  annuiteit: { repayment_type: 'annuiteit', is_tax_deductible: true },
  lineair: { repayment_type: 'lineair', is_tax_deductible: true },
  aflossingsvrij: { repayment_type: 'aflossingsvrij', is_tax_deductible: false },
  spaarhypotheek: { repayment_type: 'aflossingsvrij', is_tax_deductible: true },
  beleggingshypotheek: { repayment_type: 'aflossingsvrij', is_tax_deductible: true },
  // Familielening subtypes
  ouders: { repayment_type: 'lineair' },
  familie: { repayment_type: 'lineair' },
  vrienden: { repayment_type: 'lineair' },
  overig_onderhand: { repayment_type: 'lineair' },
}

/** Which type-specific fields to show per debt_type */
export const DEBT_TYPE_FIELDS: Record<DebtType, string[]> = {
  mortgage: ['subtype', 'repayment_type', 'is_tax_deductible', 'fixed_rate_end_date', 'nhg', 'linked_asset_id'],
  student_loan: ['subtype', 'draagkrachtmeting_date'],
  personal_loan: ['subtype'],
  credit_card: ['subtype', 'credit_limit'],
  revolving_credit: ['subtype', 'credit_limit'],
  car_loan: [],
  payment_plan: [],
  belastingschuld: ['subtype', 'tax_year', 'has_payment_plan'],
  familielening: ['subtype', 'repayment_type', 'has_written_agreement'],
  dga_schuld: ['linked_asset_id', 'repayment_type'],
  other: [],
}

// ── Amortization calculation ─────────────────────────────────

export interface AmortizationRow {
  month: number
  date: string
  payment: number
  principal: number
  interest: number
  balance: number
}

/**
 * Generate a full amortization schedule for a single debt.
 * Returns month-by-month breakdown until balance reaches 0 (max 600 months = 50 years).
 */
export function amortizationSchedule(
  balance: number,
  annualRate: number,
  monthlyPayment: number,
  startDate: Date = new Date(),
): AmortizationRow[] {
  if (balance <= 0 || monthlyPayment <= 0) return []

  const monthlyRate = annualRate / 100 / 12
  const rows: AmortizationRow[] = []
  let remaining = balance
  let month = 0

  while (remaining > 0.01 && month < 600) {
    month++
    const interestCharge = remaining * monthlyRate
    const payment = Math.min(monthlyPayment, remaining + interestCharge)
    const principal = payment - interestCharge
    remaining = Math.max(0, remaining - principal)

    const date = new Date(startDate)
    date.setMonth(date.getMonth() + month)

    rows.push({
      month,
      date: date.toISOString().split('T')[0],
      payment: roundCents(payment),
      principal: roundCents(principal),
      interest: roundCents(interestCharge),
      balance: roundCents(remaining),
    })
  }

  return rows
}

/**
 * Generate a linear amortization schedule.
 * Fixed monthly principal + declining interest = declining total payment.
 */
export function linearAmortization(
  balance: number,
  annualRate: number,
  termMonths: number,
  startDate: Date = new Date(),
): AmortizationRow[] {
  if (balance <= 0 || termMonths <= 0) return []

  const monthlyRate = annualRate / 100 / 12
  const fixedPrincipal = balance / termMonths
  const rows: AmortizationRow[] = []
  let remaining = balance

  for (let month = 1; month <= termMonths && remaining > 0.01; month++) {
    const interestCharge = remaining * monthlyRate
    const principal = Math.min(fixedPrincipal, remaining)
    const payment = principal + interestCharge
    remaining = Math.max(0, remaining - principal)

    const date = new Date(startDate)
    date.setMonth(date.getMonth() + month)

    rows.push({
      month,
      date: date.toISOString().split('T')[0],
      payment: roundCents(payment),
      principal: roundCents(principal),
      interest: roundCents(interestCharge),
      balance: roundCents(remaining),
    })
  }

  return rows
}

/**
 * Generate an interest-only (aflossingsvrij) schedule.
 * Only interest is paid; balance stays the same until end date.
 */
export function interestOnlySchedule(
  balance: number,
  annualRate: number,
  months: number,
  startDate: Date = new Date(),
): AmortizationRow[] {
  if (balance <= 0 || months <= 0) return []

  const monthlyRate = annualRate / 100 / 12
  const rows: AmortizationRow[] = []

  for (let month = 1; month <= months; month++) {
    const interestCharge = balance * monthlyRate

    const date = new Date(startDate)
    date.setMonth(date.getMonth() + month)

    rows.push({
      month,
      date: date.toISOString().split('T')[0],
      payment: roundCents(interestCharge),
      principal: 0,
      interest: roundCents(interestCharge),
      balance: roundCents(balance),
    })
  }

  return rows
}

// ── Verwachte restschuld ─────────────────────────────────────

export interface ExpectedBalance {
  expectedBalance: number
  monthsElapsed: number
  totalTermMonths: number
  totalInterestPaid: number
}

/**
 * Bereken de verwachte restschuld op basis van het aflossingsschema
 * vanaf de startdatum, ervan uitgaande dat alle maandbetalingen zijn gedaan
 * zonder extra aflossingen.
 * Returnt null als onvoldoende data (geen original_amount, start_date of end_date).
 */
export function computeExpectedBalance(debt: Debt): ExpectedBalance | null {
  const original = Number(debt.original_amount)
  const rate = Number(debt.interest_rate)
  if (original <= 0 || !debt.start_date || !debt.end_date) return null

  const startDate = new Date(debt.start_date)
  const endDate = new Date(debt.end_date)
  const now = new Date()

  const totalTermMonths = Math.max(1, Math.round(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
  ))
  const monthsElapsed = Math.max(0, Math.round(
    (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
  ))

  // Niet gestart of voorbij einddatum
  if (monthsElapsed <= 0) {
    return { expectedBalance: original, monthsElapsed: 0, totalTermMonths, totalInterestPaid: 0 }
  }

  const rt = debt.repayment_type ?? 'annuiteit'

  // Aflossingsvrij: saldo blijft gelijk
  if (rt === 'aflossingsvrij') {
    const monthlyRate = rate / 100 / 12
    return {
      expectedBalance: original,
      monthsElapsed,
      totalTermMonths,
      totalInterestPaid: roundCents(original * monthlyRate * monthsElapsed),
    }
  }

  // Lineair
  if (rt === 'lineair') {
    const elapsed = Math.min(monthsElapsed, totalTermMonths)
    const schedule = linearAmortization(original, rate, totalTermMonths, startDate)
    const row = schedule[elapsed - 1]
    const totalInterest = schedule.slice(0, elapsed).reduce((s, r) => s + r.interest, 0)
    return {
      expectedBalance: row ? row.balance : 0,
      monthsElapsed: elapsed,
      totalTermMonths,
      totalInterestPaid: roundCents(totalInterest),
    }
  }

  // Annuïteit (default)
  const monthlyRate = rate / 100 / 12
  let pmt: number
  if (rate === 0) {
    pmt = original / totalTermMonths
  } else {
    const factor = Math.pow(1 + monthlyRate, totalTermMonths)
    pmt = original * (monthlyRate * factor) / (factor - 1)
  }
  const elapsed = Math.min(monthsElapsed, totalTermMonths)
  const schedule = amortizationSchedule(original, rate, pmt, startDate)
  const row = schedule[elapsed - 1]
  const totalInterest = schedule.slice(0, elapsed).reduce((s, r) => s + r.interest, 0)
  return {
    expectedBalance: row ? row.balance : 0,
    monthsElapsed: elapsed,
    totalTermMonths,
    totalInterestPaid: roundCents(totalInterest),
  }
}

// ── Resterende looptijd ──────────────────────────────────────

/**
 * Bovengrens voor een zinnige looptijd: 600 maanden (50 jaar). Gelijk aan de
 * lus-limiet in `amortizationSchedule`, zodat beide aflospaden dezelfde
 * horizon hanteren. Loopt een schuld daaroverheen, dan is de uitkomst niet
 * plausibel genoeg om als hard getal te tonen.
 */
export const MAX_TERM_MONTHS = 600

/**
 * Looptijd in maanden die volgt uit saldo, maandbedrag, rente en aflossingsvorm
 * — of `null` als er geen zinnig einde uit te rekenen is.
 *
 * Dit is de canonieke afleiding "hoe lang doet dit maandbedrag erover?". Hij
 * woonde in `lib/debt-remaining-term.ts` en is hierheen verhuisd omdat
 * `computeRenteAflossingsSplit` en `debtProjection` hem nu óók nodig hebben:
 * dat bestand importeert uit dít bestand, dus andersom importeren zou een
 * cyclus opleveren. `debt-remaining-term.ts` her-exporteert hem, zodat de
 * bestaande callers (`debtRemainingMonths`, `buildDebtDraft`) ongewijzigd
 * blijven — één functiebody, geen tweede kopie.
 *
 * Volgorde:
 * 1. Aflossingsvrij kent uit zichzelf geen einde.
 * 2. Lineair: de aflossing per maand is constant en volgt uit het maandbedrag
 *    minus de rente over het HUIDIGE saldo (het opgeslagen maandbedrag is de
 *    huidige, dus hoogste, termijn); de looptijd is saldo / die aflossing.
 * 3. Annuïteit (default): projectie via `amortizationSchedule` met het
 *    werkelijke maandbedrag.
 *
 * @param balance huidig saldo (positief bedrag)
 * @param payment maandbedrag: aflossing plus rente over het huidige saldo
 * @param annualRate rente in procenten per jaar; niet-eindig telt als 0
 * @param repaymentType aflossingsvorm; `null`/`undefined` ⇒ annuïteit
 * @param now ankerdatum voor de annuïteitsprojectie
 */
/** Klemt een looptijd op de plausibiliteitsgrens; `null` blijft `null`. */
function clampTerm(months: number | null): number | null {
  if (months == null || !Number.isFinite(months) || months <= 0) return null
  return Math.min(MAX_TERM_MONTHS, months)
}

/** Maanden van nu tot een einddatum, of `null` als die er niet (zinnig) is. */
function monthsUntil(endDate: string | null | undefined): number | null {
  if (!endDate) return null
  const months = Math.round((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.44))
  return months > 0 ? months : null
}

/**
 * Aflossing per maand bij een lineaire schuld: het maandbedrag minus de rente
 * over het HUIDIGE saldo (het opgeslagen maandbedrag is de huidige, dus
 * hoogste, termijn). `null` als de betaling de rente niet dekt — dan lost de
 * schuld nooit af.
 */
function linearPrincipalPerMonth(balance: number, payment: number, annualRate: number): number | null {
  const rate = Number.isFinite(annualRate) ? annualRate : 0
  const principal = payment - balance * (rate / 100 / 12)
  return Number.isFinite(principal) && principal > 0 ? principal : null
}

/**
 * Looptijd zónder plausibiliteitsgrens. Bestaat apart omdat "de betaling dekt
 * de rente niet" en "dit duurt langer dan 600 maanden" twee verschillende
 * dingen zijn: `deriveRemainingMonths` geeft op allebei `null`, en een caller
 * die dat als één ding leest noemt een schuld ten onrechte onbetaalbaar. Een
 * lineaire schuld van € 350.000 à 3,5% met € 1.500 p/m houdt € 479 per maand
 * over voor aflossing, maar doet er 731 maanden over — die hoort "731" te
 * krijgen, niet "de betaling dekt de rente niet".
 */
function uncappedRemainingMonths(
  balance: number,
  payment: number,
  annualRate: number,
  repaymentType: RepaymentType | null | undefined,
): number | null {
  const rate = Number.isFinite(annualRate) ? annualRate : 0
  if (!(balance > 0) || !(payment > 0)) return null
  const rt = repaymentType ?? 'annuiteit'
  if (rt === 'aflossingsvrij') return null

  if (rt === 'lineair') {
    const principal = linearPrincipalPerMonth(balance, payment, rate)
    return principal == null ? null : Math.ceil(balance / principal)
  }

  const monthlyRate = rate / 100 / 12
  // Rentevrij: geen logaritme (log(1)/log(1) = 0/0 = NaN).
  if (monthlyRate <= 0) return Math.ceil(balance / payment)
  const monthlyInterest = balance * monthlyRate
  if (payment <= monthlyInterest) return null
  return Math.ceil(Math.log(payment / (payment - monthlyInterest)) / Math.log(1 + monthlyRate))
}

export function deriveRemainingMonths(
  balance: number,
  payment: number,
  annualRate: number,
  repaymentType: RepaymentType | null | undefined,
  now: Date,
): number | null {
  // De rentekolom is als `number` getypeerd, maar een DB-rij kan in de
  // praktijk null/leeg dragen; een NaN-rente zou het hele schema NaN maken.
  const rate = Number.isFinite(annualRate) ? annualRate : 0
  if (!Number.isFinite(balance) || !Number.isFinite(payment)) return null
  if (balance <= 0 || payment <= 0) return null

  const rt = repaymentType ?? 'annuiteit'
  if (rt === 'aflossingsvrij') return null

  if (rt === 'lineair') {
    const principalPerMonth = linearPrincipalPerMonth(balance, payment, rate)
    // Dekt het maandbedrag de rente niet, dan lost de schuld nooit af.
    if (principalPerMonth == null) return null
    const months = Math.ceil(balance / principalPerMonth)
    if (months <= 0 || months > MAX_TERM_MONTHS) return null
    return months
  }

  // Annuïteit / default — projectie met het werkelijke maandbedrag.
  const sched = amortizationSchedule(balance, rate, payment, now)
  if (sched.length === 0) return null
  const last = sched[sched.length - 1]
  return last.balance <= 0.01 ? sched.length : null
}

// ── Rente / aflossing split ──────────────────────────────────

export interface RenteAflossingsSplit {
  monthlyPayment: number
  currentRente: number
  currentAflossing: number
  rentePercentage: number   // 0-100
  remainingMonths: number
}

/**
 * Bereken de maandelijkse rente/aflossing-uitsplitsing voor een schuld.
 *
 * Bron is `monthly_payment` — wat er werkelijk betaald wordt. `current_balance`
 * en `interest_rate` bepalen het rentedeel, `repayment_type` de vorm. De
 * einddatum is uitsluitend TERUGVAL, voor rijen zonder maandbedrag; hij mag het
 * ingevulde bedrag niet overrulen (zie de kop van deze functie en
 * `lib/debt-maandbedrag-bron.test.ts`). Returnt null als er te weinig is om
 * iets zinnigs te zeggen.
 */
export function computeRenteAflossingsSplit(debt: Debt): RenteAflossingsSplit | null {
  const balance = Number(debt.current_balance)
  const rate = Number(debt.interest_rate)
  const payment = Number(debt.monthly_payment)

  if (balance <= 0) return null

  const monthlyRate = rate / 100 / 12
  const currentRente = balance * monthlyRate

  // Aflossingsvrij: 100% rente, 0% aflossing — per definitie lost dit product
  // niet af. Bewust NIET meegenomen in de "maandbedrag wint"-regel hieronder:
  // wat een gebruiker bóven de rente betaalt op een aflossingsvrije rij is een
  // modelvraag (extra aflossing? premie? kosten?) die de horizon-adapter
  // vandaag conservatief op 0 zet (`potten.ts`). Die knoop hoort niet in deze
  // functie doorgehakt te worden.
  if (debt.repayment_type === 'aflossingsvrij') {
    const monthlyPayment = roundCents(currentRente)
    return {
      monthlyPayment,
      currentRente: monthlyPayment,
      currentAflossing: 0,
      rentePercentage: 100,
      remainingMonths: debt.end_date
        ? Math.max(1, Math.round((new Date(debt.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.44)))
        : 360,
    }
  }

  // ── Het opgeslagen maandbedrag is de bron ──────────────────────────────
  //
  // Betaalt de gebruiker een bedrag, dan is dát het feit: het gaat elke maand
  // van de rekening af. De einddatum is een plan, en de twee kunnen elkaar
  // tegenspreken. Deze functie herrekende het maandbedrag vroeger als PMT over
  // de einddatum zodra die gezet was, waardoor het ingevulde bedrag nooit aan
  // bod kwam — de tweede helft van bug H2 (aug 2026; de eerste helft, een
  // wizard die zelf een einddatum verzon, is toen wel gerepareerd).
  //
  // Wat dat kostte, gemeten op productie: een hypotheek van € 710k met een
  // opgeslagen termijn van € 1.742,57 werd hier als € 2.121,84 gelezen. Het
  // verschil (€ 379/mnd) liep als "aflossing" door in de spaarquote
  // (`lib/savings-source.ts`, `lib/core-data-loader.ts`) en via
  // `lib/horizon-kernel/adapter/potten.ts` in de FIRE-datum. Andersom kon ook:
  // een DUO-lening van € 136 p/m werd als € 54,41 gerekend.
  //
  // De einddatum blijft de terugval voor rijen zónder maandbedrag — beter een
  // plan dan geen getal. Vastgelegd in `debt-maandbedrag-bron.test.ts`.
  if (payment > 0) {
    // De uitsplitsing en de looptijd zijn twee losse vragen. De uitsplitsing
    // volgt altijd rechtstreeks uit het maandbedrag; alleen de looptijd kan
    // onbepaalbaar zijn. Ze aan elkaar knopen brak juist het geval waarvoor
    // deze functie het hardst nodig is: een hypotheek waarvan de termijn de
    // rente maar net dekt (€ 1.100 op € 350.000 à 3,5% → ~900 maanden) valt
    // buiten de 600-maands plausibiliteitsgrens van `deriveRemainingMonths`,
    // en zou dan géén split meer opleveren terwijl rente en aflossing prima
    // te bepalen zijn.
    const rente = roundCents(currentRente)
    const aflossing = roundCents(Math.max(0, payment - currentRente))
    return {
      monthlyPayment: roundCents(payment),
      currentRente: rente,
      currentAflossing: aflossing,
      // Geklemd op [0,100]: het detailvenster tekent de gestapelde balk als
      // `width: X%` en `width: (100 − X)%`, en een betaling die de rente niet
      // dekt gaf daar een negatieve breedte (ongeldige CSS) plus een label
      // "(111%)".
      rentePercentage: Math.min(100, Math.max(0, Math.round((currentRente / payment) * 10000) / 100)),
      // Binnen de grens: de gedeelde afleiding. Daarbuiten een best-effort
      // getal voor de weergave — deze functie mag geen `null` teruggeven waar
      // de KPI (`debtRemainingMonths`) bewust wél afhaakt.
      // Terugvalketen, in deze volgorde: (1) de gedeelde afleiding binnen de
      // plausibiliteitsgrens, (2) diezelfde afleiding ongecapt maar geklemd —
      // deze functie mag geen `null` geven waar de KPI bewust wél afhaakt,
      // (3) de einddatum wanneer de betaling de rente niet dekt en er dus
      // niets af te leiden valt. Zonder (3) kwam daar `0` uit, en `0` leest
      // als "afgelost".
      remainingMonths: deriveRemainingMonths(balance, payment, rate, debt.repayment_type, new Date())
        ?? clampTerm(uncappedRemainingMonths(balance, payment, rate, debt.repayment_type))
        ?? monthsUntil(debt.end_date)
        ?? 0,
    }
  }

  // Terugval: geen (bruikbaar) maandbedrag. Leid het af uit de einddatum.
  let remainingMonths: number | null = null
  if (debt.end_date) {
    remainingMonths = Math.max(1, Math.round(
      (new Date(debt.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.44),
    ))
  }
  if (!remainingMonths || remainingMonths <= 0) return null

  if (debt.repayment_type === 'lineair') {
    const aflossing = roundCents(balance / remainingMonths)
    const rente = roundCents(currentRente)
    const monthlyPayment = roundCents(aflossing + rente)
    return {
      monthlyPayment,
      currentRente: rente,
      currentAflossing: aflossing,
      rentePercentage: monthlyPayment > 0 ? Math.round((rente / monthlyPayment) * 10000) / 100 : 0,
      remainingMonths,
    }
  }

  // Annuïteit (default): PMT over de resterende looptijd.
  const factor = Math.pow(1 + monthlyRate, remainingMonths)
  const monthlyPayment = roundCents(
    rate > 0 ? balance * (monthlyRate * factor) / (factor - 1) : balance / remainingMonths,
  )
  const rente = roundCents(currentRente)
  return {
    monthlyPayment,
    currentRente: rente,
    currentAflossing: roundCents(Math.max(0, monthlyPayment - rente)),
    rentePercentage: monthlyPayment > 0 ? Math.round((rente / monthlyPayment) * 10000) / 100 : 0,
    remainingMonths,
  }
}

/**
 * Calculate months until payoff and total interest for a single debt.
 * Branches on repayment_type for different amortization models.
 */
export type DebtUnpayableReason =
  /** Er is (nog) geen maandbedrag ingevuld — los van de rente. */
  | 'geen-aflossing'
  /** Er wordt wél betaald, maar minder dan de maandelijkse rente. */
  | 'betaling-dekt-rente-niet'

export function debtProjection(debt: Debt): {
  monthsToPayoff: number
  totalInterest: number
  payoffDate: string
  isPayable: boolean
  /**
   * Waaróm de schuld niet aflosbaar is; alleen gezet als `isPayable` false is.
   *
   * Beide oorzaken gaven eerder dezelfde uitkomst, waarna elke consument de
   * rente-verklaring toonde — ook bij 0% rente, waar er geen rente te dekken
   * valt. Zie `debt-data.test.ts` > 'reden van onaflosbaarheid'.
   */
  unpayableReason?: DebtUnpayableReason
} {
  const balance = Number(debt.current_balance)
  const rate = Number(debt.interest_rate)
  const payment = Number(debt.monthly_payment)
  const repaymentType = debt.repayment_type

  if (balance <= 0) {
    return { monthsToPayoff: 0, totalInterest: 0, payoffDate: '', isPayable: true }
  }

  // Interest-only (aflossingsvrij): balance never decreases
  if (repaymentType === 'aflossingsvrij') {
    // Calculate end date based on debt end_date, default 360 months (30 years)
    let months = 360
    if (debt.end_date) {
      const end = new Date(debt.end_date)
      const now = new Date()
      months = Math.max(1, Math.round((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
    }
    const schedule = interestOnlySchedule(balance, rate, months)
    const totalInterest = schedule.reduce((sum, r) => sum + r.interest, 0)
    const lastRow = schedule[schedule.length - 1]
    return {
      monthsToPayoff: months,
      totalInterest: roundCents(totalInterest),
      payoffDate: lastRow?.date ?? '',
      isPayable: true,
    }
  }

  // Lineair: vaste aflossing, looptijd volgt uit het maandbedrag.
  if (repaymentType === 'lineair') {
    // Één afleiding, gedeeld met de "resterend"-KPI en de rente/aflossing-
    // split. Hier stond een eigen benadering met de HALVE rente
    // (`payment − balance × maandrente / 2`, een gemiddelde-rente-aanname),
    // terwijl `deriveRemainingMonths` de volle rente over het huidige saldo
    // aftrekt. Bij lineair ís het opgeslagen maandbedrag de huidige — dus
    // hoogste — termijn, dus de volle rente hoort eraf. Dezelfde schuld gaf
    // daardoor 85 maanden hier en 103 in de KPI. Zie
    // `debt-maandbedrag-bron.test.ts`.
    //
    // Bewust de ONGECAPTE variant: `deriveRemainingMonths` geeft óók `null`
    // boven de 600-maandsgrens, en die als "onbetaalbaar" lezen zou een schuld
    // waarvan de betaling de rente ruim dekt een rood alarm geven — en Fin een
    // aantoonbaar onjuiste uitspraak voeren.
    const termMonths = uncappedRemainingMonths(balance, payment, rate, 'lineair')
    if (termMonths == null || termMonths <= 0) {
      return {
        monthsToPayoff: Infinity, totalInterest: Infinity, payoffDate: '', isPayable: false,
        unpayableReason: payment > 0 ? 'betaling-dekt-rente-niet' : 'geen-aflossing',
      }
    }
    const schedule = linearAmortization(balance, rate, termMonths)
    const totalInterest = schedule.reduce((sum, r) => sum + r.interest, 0)
    const lastRow = schedule[schedule.length - 1]
    return {
      monthsToPayoff: schedule.length,
      totalInterest: roundCents(totalInterest),
      payoffDate: lastRow?.date ?? '',
      isPayable: true,
    }
  }

  // Default: annuity (existing logic)
  // Check if payment covers monthly interest
  const monthlyInterest = balance * (rate / 100 / 12)
  if (payment <= monthlyInterest) {
    return {
      monthsToPayoff: Infinity, totalInterest: Infinity, payoffDate: '', isPayable: false,
      unpayableReason: payment > 0 ? 'betaling-dekt-rente-niet' : 'geen-aflossing',
    }
  }

  const schedule = amortizationSchedule(balance, rate, payment)
  const totalInterest = schedule.reduce((sum, r) => sum + r.interest, 0)
  const lastRow = schedule[schedule.length - 1]

  return {
    monthsToPayoff: schedule.length,
    totalInterest: roundCents(totalInterest),
    payoffDate: lastRow?.date ?? '',
    isPayable: true,
  }
}

// ── Payoff strategies ────────────────────────────────────────

export type PayoffStrategy =
  | 'snowball'
  | 'avalanche'
  | 'highest_balance'
  | 'custom'
  | 'current'

export interface StrategyMonth {
  month: number
  date: string
  debts: {
    id: string
    name: string
    payment: number
    interest: number
    principal: number
    balance: number
  }[]
  totalPayment: number
  totalBalance: number
}

/**
 * Simulate multi-debt payoff with a given strategy and optional extra monthly payment.
 * - snowball: target smallest balance first
 * - avalanche: target highest interest rate first (saves most interest)
 * - highest_balance: target highest balance first (rip the band-aid off)
 * - custom: respect user-defined order (`debts.sort_order` ascending)
 * - current: just use each debt's own monthly_payment
 */
export function simulatePayoff(
  debts: Debt[],
  strategy: PayoffStrategy,
  extraMonthly = 0,
): StrategyMonth[] {
  // Track which debts are interest-only (aflossingsvrij) — excluded from targeting
  const interestOnlyIds = new Set(
    debts.filter((d) => d.repayment_type === 'aflossingsvrij').map((d) => d.id),
  )

  // Capture the original entry order so the `custom` strategy has a stable
  // tie-breaker when `sort_order` is missing or duplicated.
  const active = debts
    .filter((d) => Number(d.current_balance) > 0 && d.is_active)
    .map((d, originalIndex) => ({
      id: d.id,
      name: d.name,
      balance: Number(d.current_balance),
      rate: Number(d.interest_rate) / 100 / 12,
      minPayment: Number(d.minimum_payment),
      monthlyPayment: Number(d.monthly_payment),
      isInterestOnly: interestOnlyIds.has(d.id),
      sortOrder: Number.isFinite(Number(d.sort_order)) ? Number(d.sort_order) : 0,
      originalIndex,
    }))

  if (active.length === 0) return []

  const totalMinPayments = active.reduce((s, d) => s + d.minPayment, 0)
  const totalBudget = strategy === 'current'
    ? active.reduce((s, d) => s + d.monthlyPayment, 0) + extraMonthly
    : totalMinPayments + extraMonthly

  const results: StrategyMonth[] = []
  const now = new Date()
  let month = 0

  while (active.some((d) => d.balance > 0.01) && month < 600) {
    month++
    const date = new Date(now)
    date.setMonth(date.getMonth() + month)

    // Sort for targeting. Excludes interest-only debts because they have no
    // principal to amortize within the simulation horizon (rente-only blijft
    // staan, snowball/avalanche/etc. mogen ze niet als focus pakken).
    //
    // - snowball:        smallest balance first (motivatie via snelle wins)
    // - avalanche:       highest rate first (bespaart meeste rente)
    // - highest_balance: largest balance first (rip the band-aid off)
    // - custom:          user-defined order via `sort_order` ascending,
    //                    tie-breaker: oorspronkelijke binnenkomst-volgorde
    // - current:         no targeting — `monthly_payment` per debt is leidend
    const sorted = [...active.filter((d) => d.balance > 0.01 && !d.isInterestOnly)]
    if (strategy === 'snowball') {
      sorted.sort((a, b) => a.balance - b.balance)
    } else if (strategy === 'avalanche') {
      sorted.sort((a, b) => b.rate - a.rate)
    } else if (strategy === 'highest_balance') {
      sorted.sort((a, b) => b.balance - a.balance)
    } else if (strategy === 'custom') {
      sorted.sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
        return a.originalIndex - b.originalIndex
      })
    }

    // Calculate interest first
    const monthDebts: StrategyMonth['debts'] = []
    let budgetLeft = totalBudget

    for (const d of active) {
      if (d.balance <= 0.01) {
        monthDebts.push({
          id: d.id,
          name: d.name,
          payment: 0,
          interest: 0,
          principal: 0,
          balance: 0,
        })
        continue
      }

      const interest = d.balance * d.rate

      // Interest-only debts: pay only interest, no principal reduction
      if (d.isInterestOnly) {
        monthDebts.push({
          id: d.id,
          name: d.name,
          payment: interest,
          interest,
          principal: 0,
          balance: d.balance,
        })
        budgetLeft -= interest
        continue
      }

      const minPay = strategy === 'current'
        ? Math.min(d.monthlyPayment, d.balance + interest)
        : Math.min(d.minPayment, d.balance + interest)

      monthDebts.push({
        id: d.id,
        name: d.name,
        payment: minPay,
        interest,
        principal: minPay - interest,
        balance: d.balance - (minPay - interest),
      })

      budgetLeft -= minPay
    }

    // Apply extra to target debt (snowball/avalanche only)
    if (strategy !== 'current' && budgetLeft > 0) {
      for (const target of sorted) {
        const entry = monthDebts.find((m) => m.id === target.id)
        if (!entry || entry.balance <= 0.01) continue

        const extraPay = Math.min(budgetLeft, entry.balance)
        entry.payment += extraPay
        entry.principal += extraPay
        entry.balance -= extraPay
        budgetLeft -= extraPay
        if (budgetLeft <= 0.01) break
      }
    }

    // Update working balances
    for (const entry of monthDebts) {
      const d = active.find((a) => a.id === entry.id)
      if (d) d.balance = Math.max(0, entry.balance)
    }

    results.push({
      month,
      date: date.toISOString().split('T')[0],
      debts: monthDebts.map((d) => ({
        ...d,
        payment: roundCents(d.payment),
        interest: roundCents(d.interest),
        principal: roundCents(d.principal),
        balance: roundCents(d.balance),
      })),
      totalPayment: roundCents(monthDebts.reduce((s, d) => s + d.payment, 0)),
      totalBalance: roundCents(monthDebts.reduce((s, d) => s + d.balance, 0)),
    })
  }

  return results
}

/**
 * Summary stats for a payoff simulation.
 */
export function payoffSummary(months: StrategyMonth[]): {
  totalMonths: number
  totalInterest: number
  totalPaid: number
  payoffDate: string
} {
  if (months.length === 0) {
    return { totalMonths: 0, totalInterest: 0, totalPaid: 0, payoffDate: '' }
  }

  const totalInterest = months.reduce(
    (sum, m) => sum + m.debts.reduce((s, d) => s + d.interest, 0),
    0,
  )
  const totalPaid = months.reduce((sum, m) => sum + m.totalPayment, 0)

  return {
    totalMonths: months.length,
    totalInterest: roundCents(totalInterest),
    totalPaid: roundCents(totalPaid),
    payoffDate: months[months.length - 1].date,
  }
}

// ── Seed data (for initial setup) ────────────────────────────

export interface DefaultDebt {
  name: string
  debt_type: DebtType
  original_amount: number
  current_balance: number
  interest_rate: number
  minimum_payment: number
  monthly_payment: number
  start_date: string
  creditor: string
  // Type-specific fields (all optional for seed data)
  subtype?: string
  is_tax_deductible?: boolean
  fixed_rate_end_date?: string
  nhg?: boolean
  linked_asset_id?: string
  credit_limit?: number
  repayment_type?: RepaymentType
  draagkrachtmeting_date?: string
}

export function getDefaultDebts(): DefaultDebt[] {
  return [
    {
      name: 'Hypotheek',
      debt_type: 'mortgage',
      original_amount: 285000,
      current_balance: 248000,
      interest_rate: 3.8,
      minimum_payment: 750,
      monthly_payment: 750,
      start_date: '2020-06-01',
      creditor: 'ABN AMRO',
      subtype: 'annuiteit',
      repayment_type: 'annuiteit',
      is_tax_deductible: true,
      nhg: true,
      fixed_rate_end_date: '2030-06-01',
    },
    {
      name: 'Persoonlijke lening',
      debt_type: 'personal_loan',
      original_amount: 5000,
      current_balance: 2800,
      interest_rate: 6.9,
      minimum_payment: 60,
      monthly_payment: 60,
      start_date: '2023-01-15',
      creditor: 'ING',
      subtype: 'aflopend',
    },
    {
      name: 'Studielening DUO',
      debt_type: 'student_loan',
      original_amount: 18500,
      current_balance: 14200,
      interest_rate: 0.46,
      minimum_payment: 85,
      monthly_payment: 85,
      start_date: '2019-09-01',
      creditor: 'DUO',
      subtype: 'oud_stelsel',
    },
  ]
}

// ── Quick-add wizard extensions ──────────────────────────────
//
// Alles onder deze scheidingslijn wordt uitsluitend gebruikt door de
// `QuickAddWizard`. Bestaande DEBT_* constanten hierboven blijven
// ongewijzigd.

/** Kortere NL-labels voor de quick-add wizard. */
export const DEBT_QUICK_ADD_LABELS: Record<DebtType, string> = {
  mortgage: 'Hypotheek',
  personal_loan: 'Persoonlijke lening',
  student_loan: 'Studielening (DUO)',
  car_loan: 'Autolening',
  credit_card: 'Creditcard',
  revolving_credit: 'Doorlopend krediet',
  payment_plan: 'Afbetalingsregeling',
  belastingschuld: 'Belastingschuld',
  familielening: 'Familielening',
  dga_schuld: 'Lening bij eigen BV',
  other: 'Overig',
}

/** Default naam per type — prefill in stap 3. */
export const DEBT_DEFAULT_NAMES: Partial<Record<DebtType, string>> = {
  mortgage: 'Hypotheek',
  student_loan: 'Studielening DUO',
  credit_card: 'Creditcard',
  belastingschuld: 'Aanslag IB',
}

/**
 * Default looptijd (jaren) per debt-type — gebruikt in `buildDebtDraft`
 * voor `end_date` berekening en `monthly_payment` via
 * `computeDefaultMonthlyPayment`. `null` = doorlopend (geen einddatum).
 */
export const DEFAULT_TERM_YEARS_PER_TYPE: Record<DebtType, number | null> = {
  mortgage: 30,
  personal_loan: 5,
  car_loan: 5,
  student_loan: 15,
  familielening: 10,
  dga_schuld: 10,
  belastingschuld: 1,
  payment_plan: 2,
  credit_card: null,
  revolving_credit: null,
  other: null,
}

/** Default repayment-type per debt-type (laat user later aanpassen in full form). */
export const DEBT_DEFAULT_REPAYMENT_TYPE: Record<DebtType, RepaymentType | null> = {
  mortgage: 'annuiteit',
  personal_loan: 'annuiteit',
  car_loan: 'annuiteit',
  credit_card: 'aflossingsvrij',
  revolving_credit: 'aflossingsvrij',
  student_loan: 'lineair',
  familielening: 'lineair',
  dga_schuld: 'lineair',
  belastingschuld: 'lineair',
  payment_plan: 'lineair',
  other: null,
}

/** Volgorde in de quick-add type-grid — meest voorkomende schulden eerst. */
export const QUICK_ADD_DEBT_ORDER: readonly DebtType[] = [
  'mortgage',
  'personal_loan',
  'student_loan',
  'car_loan',
  'credit_card',
  'revolving_credit',
  'belastingschuld',
  'payment_plan',
  'familielening',
  'dga_schuld',
  'other',
] as const

/** Configuratie voor het (optionele) derde veld in stap 3. */
export type DebtField3Kind =
  | null
  | { kind: 'percentage'; label: string; defaultValue?: number }
  | { kind: 'currency'; label: string }
  | { kind: 'year'; label: string; defaultValue?: number }

export const DEBT_QUICK_ADD_FIELD3: Record<DebtType, DebtField3Kind> = {
  mortgage: { kind: 'percentage', label: 'Rente (%)' },
  personal_loan: { kind: 'percentage', label: 'Rente (%)' },
  student_loan: null, // DUO-rente via defaults
  car_loan: { kind: 'percentage', label: 'Rente (%)' },
  credit_card: { kind: 'percentage', label: 'Rente (%)', defaultValue: 14 },
  revolving_credit: { kind: 'percentage', label: 'Rente (%)' },
  payment_plan: { kind: 'currency', label: 'Maandbedrag' },
  belastingschuld: { kind: 'year', label: 'Jaar' },
  familielening: { kind: 'percentage', label: 'Rente (%)', defaultValue: 0 },
  dga_schuld: { kind: 'percentage', label: 'Rente (%)', defaultValue: 2.5 },
  other: { kind: 'percentage', label: 'Rente (%)' },
}

/**
 * Schuldtypes waarvoor de quick-add-wizard een optioneel "Aflossing per
 * maand"-veld toont: looptijd-leningen met een vast maandbedrag dat de
 * gebruiker doorgaans kent (uit het leningcontract of de afschrijving).
 * Bewust NIET: mortgage (eigen aflossingsvorm/ingangsdatum-velden),
 * payment_plan (field3 ís het maandbedrag), belastingschuld (vast
 * 12-maandsschema) en creditcard/doorlopend krediet (geen vaste aflossing).
 * Leeg laten ⇒ `buildDebtDraft` valt terug op `computeDefaultMonthlyPayment`.
 */
export const DEBT_MONTHLY_PAYMENT_FIELD_TYPES: readonly DebtType[] = [
  'car_loan',
  'personal_loan',
  'student_loan',
  'familielening',
  'dga_schuld',
] as const

/**
 * Bereken de default maandbedrag voor een schuld op basis van saldo,
 * rente, looptijd en aflossingstype. Gebruikt door `buildDebtDraft`,
 * maar kan later ook door `debt-form.tsx` worden hergebruikt als
 * refactor van de inline-versie (regels 99-132 aldaar).
 *
 * - `aflossingsvrij`: alleen rente per maand.
 * - `annuiteit`: klassieke PMT-formule.
 * - `lineair`: vaste aflossing + rente over huidige saldo.
 * - `null` repayment of ontbrekende looptijd bij niet-aflossingsvrij → 0.
 */
export function computeDefaultMonthlyPayment(
  balance: number,
  ratePct: number,
  years: number | null,
  repayment: RepaymentType | null,
): number {
  if (repayment === 'aflossingsvrij') {
    return roundCents(balance * (ratePct / 100) / 12)
  }
  if (years == null || years <= 0) return 0

  const months = years * 12
  if (ratePct === 0) return roundCents(balance / months)

  const monthlyRate = ratePct / 100 / 12
  if (repayment === 'lineair') {
    return roundCents(balance / months + balance * monthlyRate)
  }
  // annuiteit (default als repayment null of 'annuiteit')
  const factor = Math.pow(1 + monthlyRate, months)
  return roundCents((balance * (monthlyRate * factor)) / (factor - 1))
}
