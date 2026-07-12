/**
 * Quick-add wizard — pure draft builders.
 *
 * Transformeert de minimale wizard-input (3 velden) naar een volledige
 * Asset- of Debt-row zonder persist-metadata (`id`, `user_id`, `sort_order`,
 * `created_at`, `updated_at`). De Server Action in
 * `app/actions/quick-add.ts` vult deze laatste velden vóór de Supabase
 * insert. Alle defaults komen uit `TYPICAL_RETURNS`, `ASSET_SUBTYPE_DEFAULTS`
 * (niet direct hier — subtype wordt bewust leeg gelaten voor de full form)
 * en de per-type tabellen in `lib/debt-data.ts`.
 *
 * Alle helpers zijn puur → client- en server-side importeerbaar.
 */

import {
  type Asset,
  TYPICAL_RETURNS,
} from '@/lib/asset-data'
import {
  type Debt,
  type DebtType,
  type RepaymentType,
  DEBT_DEFAULT_REPAYMENT_TYPE,
  DEFAULT_TERM_YEARS_PER_TYPE,
  computeDefaultMonthlyPayment,
} from '@/lib/debt-data'
import type { AssetQuickInput, DebtQuickInput } from './types'

/** Velden die door de DB / Server Action worden gevuld en dus niet in de draft zitten. */
type DraftOmitKeys = 'id' | 'user_id' | 'sort_order' | 'created_at' | 'updated_at'

/**
 * Kolommen die wel op het `Asset` TS-interface staan maar NIET in de
 * `public.assets` DB-tabel. Meesturen van deze velden triggert een
 * "Could not find column X in the schema cache"-fout van PostgREST.
 * Wordt strict bijgehouden zodat `buildAssetDraft` faalt in TypeScript
 * als iemand één van deze fields per ongeluk herintroduceert.
 */
type AssetDbMissingKeys =
  | 'expiry_date'
  | 'beneficiary'
  | 'kvk_number'
  | 'ownership_percentage'
  | 'annual_dividend'
  | 'linked_asset_id'

export type AssetDraft = Omit<Asset, DraftOmitKeys | AssetDbMissingKeys>
export type DebtDraft = Omit<Debt, DraftOmitKeys>

/** Vandaag in `yyyy-mm-dd` — gebruikt voor `purchase_date` / `start_date`. */
function todayIso(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * Type-guard voor een geldige `yyyy-mm-dd`-datum. Weert lege strings, foute
 * formaten en niet-bestaande kalenderdata (bv. `2026-02-31`) zodat een
 * ongeldige user-invoer nooit als `start_date` de DB in gaat.
 */
function isValidDateIso(v: string | null | undefined): v is string {
  if (typeof v !== 'string') return false
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (!m) return false
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  // UTC-constructie + component-vergelijking: timezone-veilig (geen
  // toISOString/local-shift) en vangt niet-bestaande data zoals 2026-02-31,
  // die JS anders stil naar de volgende maand zou rollen.
  const d = new Date(Date.UTC(year, month - 1, day))
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  )
}

/** `end_date` als ISO-datum op basis van `start_date` + looptijd in jaren. */
function addYearsIso(startIso: string, years: number): string {
  const d = new Date(startIso)
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().split('T')[0]
}

/**
 * Type-smallen helpers: het `field3`-veld is polymorf (`string | number | null | undefined`)
 * en wordt per type anders geïnterpreteerd. Deze helpers geven een gedefinieerde waarde
 * terug of `null` zodat de DB-typing klopt.
 */
function asString(v: AssetQuickInput['field3']): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

function asNumber(v: AssetQuickInput['field3'] | DebtQuickInput['field3']): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim().length > 0) {
    const parsed = Number(v)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function asDateString(v: AssetQuickInput['field3']): string | null {
  if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  return null
}

/**
 * Bouw een volledige Asset-draft uit de 3-velden-input van stap 3.
 * Smart defaults voor type-specifieke velden: het merendeel wordt op `null`
 * gezet zodat de user ze later in de volledige form kan aanvullen zonder
 * dat de wizard financieel-technische keuzes afdwingt.
 */
export function buildAssetDraft(input: AssetQuickInput): AssetDraft {
  const { asset_type, name, current_value, field3 } = input
  const today = todayIso()

  // Expliciet meegegeven jaarrendement/rente (%) wint van de type-default.
  // Nu alleen door de wizard geleverd voor savings (naast de bank in field3);
  // generiek toegepast zodat een toekomstig type dat óók een eigen rente-veld
  // krijgt hier niet opnieuw hoeft in te haken. `null`/`undefined` ⇒ default.
  const explicitReturn =
    typeof input.expected_return === 'number' && Number.isFinite(input.expected_return)
      ? input.expected_return
      : null

  // Type-specifieke velden initialiseren op null; per type hieronder selectief vullen.
  let institution: string | null = null
  let woz_value: number | null = null
  let monthly_contribution = 0
  let rental_income: number | null = null
  let expected_return = TYPICAL_RETURNS[asset_type]
  let purchase_value = current_value
  // Notes-veld voor type-specifieke info die niet in een eigen kolom past
  // (bijv. levensverzekering-einddatum, deelneming-belang%). De full form
  // kan deze later in de juiste (migratie-afhankelijke) kolom zetten.
  let notes: string | null = null

  switch (asset_type) {
    case 'cash':
    case 'savings':
    case 'retirement':
      institution = asString(field3)
      break
    // NB: savings vult daarnaast — via het aparte `expected_return`-veld
    // hieronder — de spaarrente in. field3 blijft de bank/instelling.
    case 'eigen_huis':
      woz_value = asNumber(field3)
      break
    case 'investment':
      monthly_contribution = asNumber(field3) ?? 0
      break
    case 'vehicle':
      // Voor vehicles is field3 de oorspronkelijke aankoopprijs (voor afschrijving);
      // valt terug op current_value als niet ingevuld.
      purchase_value = asNumber(field3) ?? current_value
      break
    case 'real_estate':
      rental_income = asNumber(field3)
      break
    case 'deelneming': {
      // DB heeft (nog) geen `ownership_percentage` kolom — parkeren in notes
      // zodat de user de waarde niet kwijt is bij later editen in full form.
      const pct = asNumber(field3)
      if (pct != null) notes = `Belang: ${pct}%`
      break
    }
    case 'levensverzekering': {
      // DB heeft (nog) geen `expiry_date` kolom — parkeren in notes.
      const exp = asDateString(field3)
      if (exp) notes = `Einddatum: ${exp}`
      break
    }
    case 'vordering': {
      // Bij vordering is field3 de rente (%), die overschrijft de TYPICAL_RETURNS default.
      const rente = asNumber(field3)
      if (rente != null) expected_return = rente
      break
    }
    default:
      // Overige types: physical, crypto, other — geen veld 3 gedefinieerd.
      break
  }

  // Savings (en toekomstige types met een eigen rente-veld): een expliciet
  // opgegeven rendement overschrijft de TYPICAL_RETURNS-default. Bij vordering
  // is de rente al via field3 verwerkt hierboven; die stuurt geen
  // expected_return mee, dus geen dubbele override.
  if (explicitReturn != null) expected_return = explicitReturn

  const is_liquid: boolean | null =
    asset_type === 'cash' || asset_type === 'savings' ? true : null

  const depreciation_rate: number | null = asset_type === 'vehicle' ? 15 : null

  return {
    name,
    asset_type,
    current_value,
    purchase_value,
    purchase_date: today,
    expected_return,
    monthly_contribution,
    institution,
    account_number: null,
    notes,
    is_active: true,
    // Type-specific fields: laat risico/subtype bewust leeg voor full form.
    subtype: null,
    risk_profile: null,
    tax_benefit: null,
    is_liquid,
    lock_end_date: null,
    ticker_symbol: null,
    rental_income,
    woz_value,
    retirement_provider_type: null,
    depreciation_rate,
    address_postcode: null,
    address_house_number: null,
    // Household + net worth
    ownership: 'personal',
    household_id: null,
    net_worth_inclusion_pct: 100,
    has_budget_tracking: false,
    has_holdings_tracking: false,
    // App-koppelingen — quick-add laat alle apps bewust uit. Activeren
    // gebeurt later via de detail-sheet (`/api/assets/toggle-*`) zodat de
    // gebruiker per item een expliciete keuze maakt.
    has_woonbalans_tracking: false,
    has_rental_tracking: false,
    monthly_maintenance_cost: 0,
    vva_fee: 0,
    vacancy_log: [],
  }
}

/** Default rente (%) als de user het veld leeg laat. */
function defaultInterestRate(debt_type: DebtType): number {
  if (debt_type === 'credit_card') return 14
  if (debt_type === 'dga_schuld') return 2.5
  return 0
}

/**
 * Bouw een volledige Debt-draft uit de 3-velden-input van stap 3.
 * Berekent `monthly_payment` / `end_date` via de centrale helpers in
 * `lib/debt-data.ts` zodat de full-form logica later niet verschilt.
 */
export function buildDebtDraft(input: DebtQuickInput): DebtDraft {
  const {
    debt_type,
    name,
    current_balance,
    field3,
    linked_asset_id,
    repayment_type: inputRepayment,
    start_date: inputStartDate,
  } = input

  // Startdatum: user-invoer (hypotheek) wint van "vandaag". Een ongeldige of
  // ontbrekende waarde valt veilig terug op vandaag zodat de rij nooit zonder
  // start_date de DB in gaat.
  const start_date = isValidDateIso(inputStartDate) ? inputStartDate : todayIso()

  const years = DEFAULT_TERM_YEARS_PER_TYPE[debt_type]
  // Aflossingsvorm: user-invoer (hypotheek) wint van de type-default. Andere
  // schuldtypes leveren dit nooit aan → default blijft leidend.
  const repayment: RepaymentType | null =
    inputRepayment ?? DEBT_DEFAULT_REPAYMENT_TYPE[debt_type]

  // Per type kan field3 een andere betekenis hebben dan rente.
  let interest_rate = defaultInterestRate(debt_type)
  let userProvidedMonthly: number | null = null
  let tax_year: number | null = null

  if (debt_type === 'payment_plan') {
    userProvidedMonthly = asNumber(field3)
  } else if (debt_type === 'belastingschuld') {
    tax_year = asNumber(field3)
  } else {
    // percentage-veld: rente overschrijft de default als ingevuld.
    const rente = asNumber(field3)
    if (rente != null) interest_rate = rente
  }

  // Bereken monthly_payment met type-specifieke uitzonderingen.
  let monthly_payment: number
  if (debt_type === 'payment_plan' && userProvidedMonthly != null) {
    monthly_payment = Math.round(userProvidedMonthly * 100) / 100
  } else if (debt_type === 'belastingschuld') {
    // Totaalbedrag / 12 als eenjarig aflosschema (lineair, 1 jaar).
    monthly_payment = Math.round((current_balance / 12) * 100) / 100
  } else if (debt_type === 'credit_card') {
    // Industrie-standaard: max(3% van saldo, €25) als maandbetaling.
    monthly_payment = Math.max(25, Math.round(current_balance * 0.03 * 100) / 100)
  } else {
    monthly_payment = computeDefaultMonthlyPayment(
      current_balance,
      interest_rate,
      years,
      repayment,
    )
  }

  // Einddatum leidt af uit de (echte) ingangsdatum + looptijd; voor het
  // default-pad (start_date=vandaag) is dit identiek aan het oude gedrag.
  const end_date = years != null && years > 0 ? addYearsIso(start_date, years) : null

  // Hypotheek met annuiteit/lineair = fiscaal aftrekbaar (box 1 eigen woning).
  const is_tax_deductible =
    debt_type === 'mortgage' && (repayment === 'annuiteit' || repayment === 'lineair')

  // Alleen hypotheek telt default mee in spaarquote (aflossing = gedwongen sparen).
  const include_aflossing_in_savings = debt_type === 'mortgage'

  return {
    name,
    debt_type,
    original_amount: current_balance,
    current_balance,
    interest_rate,
    minimum_payment: monthly_payment,
    monthly_payment,
    start_date,
    end_date,
    creditor: null,
    notes: null,
    is_active: true,
    // Type-specific: alles leeg laten voor full form.
    subtype: null,
    is_tax_deductible,
    fixed_rate_end_date: null,
    nhg: null,
    linked_asset_id: linked_asset_id ?? null,
    credit_limit: null,
    repayment_type: repayment,
    draagkrachtmeting_date: null,
    tax_year,
    has_payment_plan: false,
    has_written_agreement: false,
    // Household + net worth
    ownership: 'personal',
    household_id: null,
    partner_split_pct: null,
    net_worth_inclusion_pct: 100,
    include_aflossing_in_savings,
    custom_aflossing_amount: null,
    // App-koppeling — quick-add laat de Hypotheekplanner-app bewust uit (en
    // op non-mortgage rijen is de vlag sowieso `false` per DB-default).
    // Activeren gebeurt later via de mortgage-detail-sheet zodat de gebruiker
    // een expliciete keuze maakt per hypotheek.
    has_hypotheekplanner_tracking: false,
  }
}
