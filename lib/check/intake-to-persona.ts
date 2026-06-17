/**
 * Converteert een `CheckIntake` (output van de Vrijheidscheck-wizard) naar
 * het generieke `PersonaData`-formaat dat `seedPersonaData` verwacht.
 *
 * Dit is een PURE functie — geen side-effects, geen DB-calls. De aanroeper is
 * verantwoordelijk voor het doorgeven van het resultaat aan `seedPersonaData`.
 *
 * Beperkingen (PersonaData-mismatch):
 * - `income_source` en `expenses_source` (='manual') zijn DB-kolommen op
 *   `profiles` die NIET in `PersonaProfile` zijn gemodelleerd. `seedPersonaData`
 *   schrijft ze dus niet. De aanroeper dient na de seed een extra profile-update
 *   te doen: `{ income_source: 'manual', expenses_source: 'manual' }`.
 *   Ter herinnering worden de intenties als hints in `feature_preferences` meegestuurd.
 * - `estimated_yearly_income` bestaat eveneens niet in `PersonaProfile`.
 *   Ook dit veld gaat als hint mee in `feature_preferences`.
 * - Rijke PersonaAsset-velden (purchase_value, purchase_date, expected_return,
 *   monthly_contribution, institution) worden ingevuld met neutrale defaults
 *   omdat de intake die informatie niet bevat.
 * - `PersonaDebt.original_amount` en `start_date` worden op current_balance
 *   resp. vandaag gezet (intake heeft geen historische context).
 */

import { ALL_MODULES } from '@/lib/module-registry'
import type { PersonaData, PersonaProfile, PersonaAsset, PersonaDebt, PersonaGoal } from '@/lib/test-personas'
import type { CheckIntake, HouseholdComposition } from '@/lib/check/types'

// ── Hulpfuncties ─────────────────────────────────────────────────────────────

/** Vandaag als ISO-datum ('YYYY-MM-DD'). */
function today(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * Mapt de drie wizard-waarden naar de persona-/DB-enum die in `profiles.household_type`
 * en de onboarding-route verwacht wordt: 'solo' | 'samen' | 'gezin'.
 *
 * `CheckIntake.household` gebruikt 'alleen' (= alleenstaand); de bestaande codebase
 * slaat dit op als 'solo' (zie bodySchema in save-own-data/route.ts en alle persona-
 * definitie in test-personas.ts). 'samen' en 'gezin' passen zonder vertaling.
 */
function mapHouseholdType(h: HouseholdComposition): string {
  switch (h) {
    case 'alleen': return 'solo'
    case 'samen':  return 'samen'
    case 'gezin':  return 'gezin'
  }
}

/**
 * Leidt een rendement-inschatting af uit het risicoprofiel of valt terug op
 * de intake-waarde zelf (als percentage → fraction).
 *
 * De intake geeft `expectedReturnPct` als percentage (bv. 7.0 = 7 %).
 * `PersonaProfile.expected_return` verwacht een fraction (0.07).
 */
function resolveExpectedReturn(
  expectedReturnPct?: number | null,
): number | undefined {
  if (expectedReturnPct != null && expectedReturnPct > 0) {
    // Klap percentage naar fraction — guard tegen de klassieke ×100-bug
    return expectedReturnPct > 1 ? expectedReturnPct / 100 : expectedReturnPct
  }
  return undefined
}

// ── Hoofd-export ──────────────────────────────────────────────────────────────

/**
 * Zet een volledige `CheckIntake` om naar `PersonaData` voor gebruik als
 * seed-input van `seedPersonaData(supabase, userId, data, noop)`.
 *
 * De returned `PersonaData` voldoet aan het type maar bevat bewust smalle
 * `meta`-velden (geen achtergrondverhaal, generieke kleur, etc.) — de
 * Vrijheidscheck is geen volledige persoonsdefinitie.
 */
export function intakeToPersona(intake: CheckIntake): PersonaData {
  const displayName = intake.firstName?.trim() || 'Gast'
  const householdType = mapHouseholdType(intake.household)
  const expectedReturn = resolveExpectedReturn(intake.pension.expectedReturnPct)

  // ── Profiel ────────────────────────────────────────────────────────────────

  /*
   * MISMATCH: `income_source`, `expenses_source` en `estimated_yearly_income`
   * zijn niet opgenomen in `PersonaProfile`. We leggen de intentie vast in
   * `feature_preferences` als hint voor consumenten die na de seed een extra
   * profile-update willen doen. De aanroeper moet zelf uitvoeren:
   *   supabase.from('profiles').update({
   *     income_source: 'manual',
   *     expenses_source: 'manual',
   *     estimated_yearly_income: intake.yearlyIncomeGross,
   *   }).eq('id', userId)
   */
  const profile: PersonaProfile = {
    full_name: displayName,
    date_of_birth: intake.dateOfBirth,
    household_type: householdType,

    // Temporal balance: neutrale middenwaarde — intake heeft geen preference
    temporal_balance: 3,

    // Inkomen & uitgaven — ingesteld als handmatige bron (zie mismatch-noot)
    net_monthly_income: intake.monthlyIncomeNet,
    estimated_monthly_expenses: intake.expenses.totaalMaand,

    // FIRE-parameters uit het pensioen-blok van de intake
    expected_return: expectedReturn,

    // Alle modules: de seed moet niet limiteren welke modules een check-
    // gebruiker mag gebruiken als zij later inloggen.
    active_modules: ALL_MODULES,

    // Hints voor de aanroeper (zie mismatch-noot hierboven)
    feature_preferences: {
      // Geeft de aanroeper inzicht in de gewenste bron-instelling
      _intake_income_source: 'manual',
      _intake_expenses_source: 'manual',
      ...(intake.yearlyIncomeGross != null
        ? { _intake_estimated_yearly_income: intake.yearlyIncomeGross }
        : {}),
    },
  }

  // ── Bezittingen ────────────────────────────────────────────────────────────

  /*
   * `CheckIntakeAsset.extra` draagt een optionele bank/ticker-string.
   * We mappen die naar `institution` voor cash/retirement/investment, of naar
   * `ticker_symbol` als het asset_type beleggingen betreft. De intake kent
   * geen purchase_value of -datum, dus we zetten neutrale defaults.
   *
   * Noodfonds (stap ④) zit niet als CheckIntakeAsset maar als los veld
   * `emergencyFund`. We voegen het toe als 'cash'-asset zodat het zichtbaar
   * is in het overzicht en bijdraagt aan de buffer-pijler.
   *
   * eigen_huis krijgt `is_liquid: false` zodat de housing-strategy engine
   * het correct behandelt als niet-direct-FIRE-eligible asset (ADR 0015).
   */
  const assets: PersonaAsset[] = []

  // Noodfonds als cash-asset (alleen bij positief saldo)
  if (intake.emergencyFund > 0) {
    assets.push({
      name: 'Noodfonds',
      asset_type: 'cash',
      current_value: intake.emergencyFund,
      purchase_value: intake.emergencyFund,
      purchase_date: today(),
      expected_return: 0.02,       // spaargeld-rendement-aanname
      monthly_contribution: 0,
      institution: '',
      is_liquid: true,
    })
  }

  for (const a of intake.assets) {
    const isEigenHuis = a.assetType === 'eigen_huis'
    const isInvestment = a.assetType === 'investment' || a.assetType === 'crypto'

    assets.push({
      name: a.name,
      asset_type: a.assetType,
      current_value: a.value,
      purchase_value: a.value,     // historisch onbekend → huidige waarde
      purchase_date: today(),       // historisch onbekend → vandaag
      expected_return: isEigenHuis ? 0.03 : (expectedReturn ?? 0.06),
      monthly_contribution: 0,
      institution: (!isInvestment && a.extra) ? a.extra : '',
      // eigen_huis is niet liquide → housing-strategy behandelt het correct
      ...(isEigenHuis ? { is_liquid: false } : {}),
      // Ticker voor investment-assets (indien meegegeven via extra)
      ...(isInvestment && a.extra ? { ticker_symbol: a.extra } : {}),
    })
  }

  // ── Schulden ───────────────────────────────────────────────────────────────

  const debts: PersonaDebt[] = intake.debts.map((d) => ({
    name: d.name,
    debt_type: d.debtType,
    original_amount: d.balance,    // historisch onbekend → huidig saldo
    current_balance: d.balance,
    interest_rate: d.interestRatePct > 1
      ? d.interestRatePct / 100    // percentage → fraction (guard ×100-bug)
      : d.interestRatePct,
    minimum_payment: d.monthlyPayment,
    monthly_payment: d.monthlyPayment,
    start_date: today(),           // historisch onbekend → vandaag
    creditor: '',
  }))

  // ── Doelen ─────────────────────────────────────────────────────────────────

  const goals: PersonaGoal[] = intake.goal
    ? [
        {
          name: intake.goal.label,
          description: '',
          goal_type: 'savings',
          target_value: 0,         // intake bevat geen doelbedrag
          current_value: 0,
          target_date: '',
          icon: 'Target',
          color: 'teal',
          is_completed: false,
        },
      ]
    : []

  // ── Meta (minimaal) ────────────────────────────────────────────────────────

  /*
   * `PersonaMeta` is verplicht in `PersonaData` maar wordt door `seedPersonaData`
   * niet naar de database geschreven — het is puur client-side meta voor de
   * seed-UI. We vullen een minimale variant in.
   */
  const meta = {
    name: displayName,
    subtitle: 'Vrijheidscheck',
    description: 'Gegenereerd vanuit de publieke Vrijheidscheck-funnel.',
    color: 'teal',
    avatarColor: 'teal',
    netWorth:
      assets.reduce((s, a) => s + a.current_value, 0) -
      debts.reduce((s, d) => s + d.current_balance, 0),
    income: intake.monthlyIncomeNet,
    expenses: intake.expenses.totaalMaand,
    backgroundStory: '',
    challenges: [],
    currentSituation: '',
    firstGoal: intake.goal?.label ?? '',
    sovereignty: 'recovery' as const,
    modules: ALL_MODULES,
  }

  return {
    meta,
    profile,
    bank_accounts: [],
    assets,
    debts,
    budgets: [],
    transactions: [],
    goals,
    life_events: [],
    recommendations: [],
    net_worth_snapshots: [],
  }
}
