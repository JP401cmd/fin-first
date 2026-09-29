/**
 * Indeling van het bewerkformulier voor schulden, per schuldtype.
 *
 * `DEBT_TYPE_FIELDS` (lib/debt-data.ts) zegt welke kolommen bij een type
 * HOREN en dus bewaard blijven bij het opslaan. Dit bestand zegt waar het
 * formulier ze TOONT:
 *
 *  - `kern`  direct zichtbaar: velden die een berekening voeden en die je
 *            geregeld bijwerkt, of een koppeling die je moet kunnen zien.
 *  - `meer`  in het ingeklapte blok "Meer instellingen": zelden gewijzigd.
 *            Daar staan ook velden die wél meerekenen maar die je één keer
 *            instelt, zoals de hypotheekrenteaftrek.
 *
 * Een veld dat bij het type hoort maar in geen van beide staat, toont het
 * formulier niet. De opgeslagen waarde blijft dan ongewijzigd staan: verbergen
 * is geen wissen.
 *
 * Server-safe en puur: geen 'use client', geen DOM, geen hooks.
 */
import { DEBT_TYPE_FIELDS, type DebtType } from './debt-data'

export type DebtFormFieldPlacement = { kern: readonly string[]; meer: readonly string[] }

export const DEBT_FORM_LAYOUT: Record<DebtType, DebtFormFieldPlacement> = {
  // Subtype valt samen met de aflosvorm; NHG rekent nergens in mee.
  mortgage: {
    kern: ['repayment_type', 'fixed_rate_end_date', 'linked_asset_id'],
    meer: ['is_tax_deductible'],
  },
  // Het stelsel en de draagkrachtmeting gaan geen berekening in.
  student_loan: { kern: [], meer: ['subtype'] },
  personal_loan: { kern: [], meer: ['subtype'] },
  credit_card: { kern: ['credit_limit'], meer: ['subtype'] },
  revolving_credit: { kern: ['credit_limit'], meer: ['subtype'] },
  car_loan: { kern: ['linked_asset_id'], meer: [] },
  payment_plan: { kern: [], meer: [] },
  // Een maandbedrag boven nul ís de betalingsregeling; zie `hasPaymentPlanFor`.
  belastingschuld: { kern: ['tax_year'], meer: ['subtype'] },
  familielening: { kern: ['repayment_type'], meer: ['subtype'] },
  dga_schuld: { kern: ['linked_asset_id', 'repayment_type'], meer: [] },
  other: { kern: [], meer: [] },
}

/** Types waar het contractuele minimum lager ligt dan wat je werkelijk betaalt. */
const MINIMUM_PAYMENT_TYPES: readonly DebtType[] = ['credit_card', 'revolving_credit']

/**
 * Toont het formulier "Min. betaling"?
 *
 * Bij een creditcard of doorlopend krediet altijd. Bij elk ander type alleen als
 * er al een minimum is opgeslagen dat afwijkt van het maandbedrag: dat is een
 * bewuste keuze van de gebruiker, en die mag niet onzichtbaar blijven meerekenen.
 */
export function showsMinimumPayment(
  debtType: DebtType,
  storedMinimum: number | null | undefined,
  storedMonthly: number | null | undefined,
): boolean {
  if (MINIMUM_PAYMENT_TYPES.includes(debtType)) return true
  const minimum = Number(storedMinimum)
  if (!Number.isFinite(minimum) || minimum <= 0) return false
  return minimum !== Number(storedMonthly)
}

/** Hypotheek-subtypes die hetzelfde zeggen als de aflosvorm. */
const MORTGAGE_SUBTYPES_GELIJK_AAN_AFLOSVORM: readonly string[] = ['annuiteit', 'lineair', 'aflossingsvrij']

/**
 * Het subtype dat bij het opslaan wordt weggeschreven.
 *
 * Bij een hypotheek toont het formulier alleen de aflosvorm. Een subtype dat
 * dezelfde drie waarden draagt volgt die keuze, zodat de twee elkaar niet
 * tegenspreken. Een spaar- of beleggingshypotheek zegt iets anders dan de
 * aflosvorm en blijft staan.
 */
export function subtypeToWrite(
  debtType: DebtType,
  subtype: string | null | undefined,
  repaymentType: string | null | undefined,
): string | null {
  const current = subtype || null
  if (debtType !== 'mortgage') return current
  if (current != null && !MORTGAGE_SUBTYPES_GELIJK_AAN_AFLOSVORM.includes(current)) return current
  return repaymentType || current
}

/** Een belastingschuld met een maandbedrag boven nul heeft een betalingsregeling. */
export function hasPaymentPlanFor(debtType: DebtType, monthlyPayment: number): boolean {
  return debtType === 'belastingschuld' && Number.isFinite(monthlyPayment) && monthlyPayment > 0
}

/**
 * Heeft deze schuld een betalingsregeling? Eén afleiding voor elke lezer.
 *
 * De opgeslagen vlag telt (iemand kan een regeling hebben waarvan het
 * maandbedrag nog niet is ingevuld), en een maandbedrag boven nul telt óók:
 * de wizard schrijft de vlag nooit, dus alleen op de kolom lezen gaf twee
 * identieke schulden een verschillend antwoord.
 */
export function debtHasPaymentPlan(debt: {
  debt_type: DebtType
  has_payment_plan?: boolean | null
  monthly_payment?: number | string | null
}): boolean {
  if (debt.debt_type !== 'belastingschuld') return false
  return debt.has_payment_plan === true || hasPaymentPlanFor(debt.debt_type, Number(debt.monthly_payment))
}

/**
 * De vlag die het formulier wegschrijft. Het formulier toont het vinkje niet
 * meer, dus een opgeslagen `true` blijft staan: verbergen is geen wissen.
 */
export function paymentPlanToWrite(
  debtType: DebtType,
  storedFlag: boolean | null | undefined,
  monthlyPayment: number,
): boolean {
  if (debtType !== 'belastingschuld') return false
  return storedFlag === true || hasPaymentPlanFor(debtType, monthlyPayment)
}

/**
 * "telt volledig mee" of "telt voor 60% mee" — gedeeld door schulden en
 * bezittingen. Kleine letters: `samenvattingVan` kapitaliseert de regel.
 */
export function inclusieTekst(netWorthInclusionPct: number): string {
  return netWorthInclusionPct >= 100 ? 'telt volledig mee' : `telt voor ${netWorthInclusionPct}% mee`
}

/**
 * Samenvatting van het blok "Hoe telt dit mee" in het schuldformulier: alles
 * wat de cijfers van deze schuld verandert, in één regel.
 */
export function debtTeltMeeDelen(s: {
  debtType: DebtType
  netWorthInclusionPct: number
  ownership: 'personal' | 'shared'
  partnerSplitPct: number | null
  isTaxDeductible: boolean
  includeAflossingInSavings: boolean
  /**
   * Toont het formulier de spaarquote-instelling? Die verdwijnt bij een saldo
   * of betaling van nul, en de samenvatting mag niets noemen wat het open blok
   * niet laat zien.
   */
  aflossingZichtbaar: boolean
}): string[] {
  const delen = [inclusieTekst(s.netWorthInclusionPct)]
  if (s.ownership === 'shared') {
    delen.push(s.partnerSplitPct != null ? `gedeeld, jouw deel ${s.partnerSplitPct}%` : 'gedeeld')
  }
  if (DEBT_FORM_LAYOUT[s.debtType].meer.includes('is_tax_deductible')) {
    delen.push(s.isTaxDeductible ? 'met renteaftrek' : 'zonder renteaftrek')
  }
  if (s.aflossingZichtbaar && s.includeAflossingInSavings) delen.push('aflossing telt als sparen')
  return delen
}

/** Velden die bij het type horen maar die het formulier niet toont. */
export function hiddenDebtFields(debtType: DebtType): string[] {
  const { kern, meer } = DEBT_FORM_LAYOUT[debtType]
  return DEBT_TYPE_FIELDS[debtType].filter((f) => !kern.includes(f) && !meer.includes(f))
}
