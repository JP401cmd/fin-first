/**
 * Quick-add wizard — naam-suggesties per type (autocomplete in stap 3).
 *
 * Gebruikt door het naamveld in stap 3: een kleine `<datalist>` /
 * combobox biedt 3-5 suggesties die relevant zijn voor het gekozen
 * asset- of debt-type. Vrije invoer blijft altijd mogelijk.
 *
 * Niet-gedefinieerde types krijgen geen suggesties (lege dropdown).
 */

import type { AssetType } from '@/lib/asset-data'
import type { DebtType } from '@/lib/debt-data'

export const ASSET_NAME_SUGGESTIONS: Partial<Record<AssetType, string[]>> = {
  cash: ['Betaalrekening', 'Zakelijke rekening', 'Joint account', 'Contant geld'],
  savings: ['Spaarrekening', 'Depositorekening', 'Spaarpot kinderen', 'Noodbuffer'],
  investment: ['Beleggingsrekening', 'DEGIRO', 'Meesman', 'Brand New Day'],
  retirement: ['Werkgeverspensioen', 'PPI Brand New Day', 'Lijfrente', 'ABP'],
  eigen_huis: ['Mijn woning', 'Ons huis'],
  real_estate: ['Beleggingspand', 'Vakantiehuis', 'Grond'],
  crypto: ['Crypto-portfolio', 'Bitcoin', 'Ethereum-wallet', 'Ledger'],
  vehicle: ['Auto', 'Motorfiets', 'Camper'],
  deelneming: ['Holding BV', 'Werk-BV', 'Familie-BV'],
}

export const DEBT_NAME_SUGGESTIONS: Partial<Record<DebtType, string[]>> = {
  mortgage: ['Hypotheek', 'Hypotheek ING', 'Hypotheek Rabobank', 'Hypotheek ABN'],
  personal_loan: ['Persoonlijke lening', 'Lening ABN', 'Consumptief krediet'],
  student_loan: ['Studielening DUO', 'SF35 lening'],
  car_loan: ['Autolening', 'Financial lease'],
  credit_card: ['Creditcard', 'Amex', 'Visa', 'Mastercard'],
  belastingschuld: ['Aanslag IB', 'Voorlopige aanslag', 'BTW-schuld'],
  familielening: ['Lening van ouders', 'Lening familie', 'Onderhandse lening'],
}
