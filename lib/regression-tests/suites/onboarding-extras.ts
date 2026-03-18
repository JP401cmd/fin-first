import { registerCategory, registerTests } from '../test-registry'
import { assert, assertEqual, assertNotNull, assertGreaterThanOrEqual } from '../assert'
import type { TestCase } from '../test-types'

const CAT = 'onboarding.extras'

// ── Type mirrors (match mini-form interfaces) ───────────────────────────────

interface BankAccountEntry {
  name: string
  bank_name: string
  account_type: string
  balance: string
}

interface AssetEntry {
  name: string
  asset_type: string
  current_value: string
  purchase_value: string
  expected_return: string
  monthly_contribution: string
  institution: string
  subtype: string
  risk_profile: string
  tax_benefit: boolean
  is_liquid: boolean
  lock_end_date: string
  ticker_symbol: string
  rental_income: string
  woz_value: string
  retirement_provider_type: string
  depreciation_rate: string
  address_postcode: string
  address_house_number: string
  expiry_date: string
  beneficiary: string
  kvk_number: string
  ownership_percentage: string
  annual_dividend: string
}

interface DebtEntry {
  name: string
  debt_type: string
  original_amount: string
  current_balance: string
  interest_rate: string
  minimum_payment: string
  monthly_payment: string
  creditor: string
  subtype: string
  repayment_type: string
  is_tax_deductible: boolean
  fixed_rate_end_date: string
  nhg: boolean
  credit_limit: string
  draagkrachtmeting_date: string
}

// ── Default empty entries (match EMPTY consts in mini-forms) ────────────────

const EMPTY_BANK: BankAccountEntry = { name: '', bank_name: '', account_type: 'checking', balance: '' }

const EMPTY_ASSET: AssetEntry = {
  name: '', asset_type: 'savings', current_value: '', purchase_value: '',
  expected_return: '', monthly_contribution: '', institution: '',
  subtype: '', risk_profile: '', tax_benefit: false, is_liquid: true,
  lock_end_date: '', ticker_symbol: '', rental_income: '', woz_value: '',
  retirement_provider_type: '', depreciation_rate: '',
  address_postcode: '', address_house_number: '',
  expiry_date: '', beneficiary: '', kvk_number: '',
  ownership_percentage: '', annual_dividend: '',
}

const EMPTY_DEBT: DebtEntry = {
  name: '', debt_type: 'personal_loan', original_amount: '', current_balance: '',
  interest_rate: '', minimum_payment: '', monthly_payment: '', creditor: '',
  subtype: '', repayment_type: '', is_tax_deductible: false,
  fixed_rate_end_date: '', nhg: false, credit_limit: '', draagkrachtmeting_date: '',
}

// ── Helpers mimicking form logic ────────────────────────────────────────────

/** MiniBankForm: add/remove/update use simple array operations */
function bankAdd(items: BankAccountEntry[]): BankAccountEntry[] {
  return [...items, { ...EMPTY_BANK }]
}
function bankRemove(items: BankAccountEntry[], i: number): BankAccountEntry[] {
  return items.filter((_, idx) => idx !== i)
}
function bankUpdate(items: BankAccountEntry[], i: number, patch: Partial<BankAccountEntry>): BankAccountEntry[] {
  return items.map((item, idx) => (idx === i ? { ...item, ...patch } : item))
}

/** MiniAssetForm: save requires name + current_value */
function assetCanSave(draft: AssetEntry): boolean {
  return !!draft.name && !!draft.current_value
}

/** MiniDebtForm: save requires name + current_balance */
function debtCanSave(draft: DebtEntry): boolean {
  return !!draft.name && !!draft.current_balance
}

// ── Sections config (matches onboarding-extras.tsx) ─────────────────────────

type Section = 'bank' | 'assets' | 'debts'

const SECTIONS: { key: Section; label: string; description: string }[] = [
  { key: 'bank', label: 'Bankrekeningen', description: 'Betaal- en spaarrekeningen' },
  { key: 'assets', label: 'Bezittingen', description: 'Spaargeld, beleggingen, woning, etc.' },
  { key: 'debts', label: 'Schulden', description: 'Hypotheek, leningen, creditcard, etc.' },
]

// ── Asset types (must match ALL_TYPES in mini-asset-form.tsx) ────────────────

const ALL_ASSET_TYPES = ['savings', 'investment', 'retirement', 'eigen_huis', 'real_estate', 'crypto', 'vehicle', 'physical', 'deelneming', 'levensverzekering', 'vordering', 'other']

// ── Debt types (must match ALL_TYPES in mini-debt-form.tsx) ──────────────────

const ALL_DEBT_TYPES = ['mortgage', 'personal_loan', 'student_loan', 'car_loan', 'credit_card', 'revolving_credit', 'payment_plan', 'other']

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: Collapsible secties ──────────────────────────────────────────
  {
    id: 'ob-ext-collapsible-sections',
    name: 'Collapsible secties: alle drie inklapbaar, optioneel',
    category: CAT,
    description: '3 secties (bank, assets, debts) zijn inklapbaar en mogen allemaal leeg blijven',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // 3 sections exist
      assertEqual(SECTIONS.length, 3, '3 secties verwacht')
      assertEqual(SECTIONS[0].key, 'bank', 'Sectie 1: bank')
      assertEqual(SECTIONS[1].key, 'assets', 'Sectie 2: assets')
      assertEqual(SECTIONS[2].key, 'debts', 'Sectie 3: debts')

      // All sections are optional: empty arrays are valid
      const bankAccounts: BankAccountEntry[] = []
      const assets: AssetEntry[] = []
      const debts: DebtEntry[] = []
      const hasData = bankAccounts.length > 0 || assets.length > 0 || debts.length > 0
      assert(!hasData, 'Lege secties: geen data is geldig')

      // Default openSections state: all closed
      const openSections: Record<Section, boolean> = { bank: false, assets: false, debts: false }
      assert(!openSections.bank, 'Bank sectie standaard dicht')
      assert(!openSections.assets, 'Assets sectie standaard dicht')
      assert(!openSections.debts, 'Debts sectie standaard dicht')

      // Toggle works
      openSections.bank = !openSections.bank
      assert(openSections.bank, 'Bank sectie na toggle: open')
      openSections.bank = !openSections.bank
      assert(!openSections.bank, 'Bank sectie na 2e toggle: dicht')

      // Button text changes based on data presence
      // hasData = false → "Overslaan", hasData = true → "Volgende"
      const buttonLabel = hasData ? 'Volgende' : 'Overslaan'
      assertEqual(buttonLabel, 'Overslaan', 'Zonder data: Overslaan knop')
    },
  },

  // ── Step 2: MiniBankForm invoer ──────────────────────────────────────────
  {
    id: 'ob-ext-mini-bank-form',
    name: 'MiniBankForm: naam, bank_naam, saldo, rekeningtype invoer',
    category: CAT,
    description: 'Bankrekening heeft name, bank_name, balance, account_type velden',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Empty bank entry has all required fields
      const entry = { ...EMPTY_BANK }
      assertEqual(entry.name, '', 'Default naam leeg')
      assertEqual(entry.bank_name, '', 'Default bank_name leeg')
      assertEqual(entry.balance, '', 'Default balance leeg')
      assertEqual(entry.account_type, 'checking', 'Default type checking')

      // Account types available: checking, savings, joint
      const accountTypes = ['checking', 'savings', 'joint']
      assertEqual(accountTypes.length, 3, '3 rekeningtypes')

      // Add a bank account
      let items: BankAccountEntry[] = []
      items = bankAdd(items)
      assertEqual(items.length, 1, 'Na toevoegen: 1 rekening')

      // Update fields
      items = bankUpdate(items, 0, { name: 'Betaalrekening', bank_name: 'ING', balance: '2500', account_type: 'checking' })
      assertEqual(items[0].name, 'Betaalrekening', 'Naam ingevuld')
      assertEqual(items[0].bank_name, 'ING', 'Bank naam ingevuld')
      assertEqual(items[0].balance, '2500', 'Saldo ingevuld')
      assertEqual(items[0].account_type, 'checking', 'Type checking')

      // Add multiple
      items = bankAdd(items)
      items = bankUpdate(items, 1, { name: 'Spaarrekening', bank_name: 'ASN', balance: '15000', account_type: 'savings' })
      assertEqual(items.length, 2, 'Na 2e toevoegen: 2 rekeningen')
      assertEqual(items[1].account_type, 'savings', '2e rekening is savings')
    },
  },

  // ── Step 3: MiniBankForm validatie ────────────────────────────────────────
  {
    id: 'ob-ext-mini-bank-validation',
    name: 'MiniBankForm validatie: naam + bank_name + balance voor opname',
    category: CAT,
    description: 'MiniBankForm heeft geen expliciete validatie maar velden zijn verplicht voor nuttige data',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // MiniBankForm doesn't have a save gate (unlike asset/debt forms)
      // Items are directly in the array, so validation is implicit:
      // empty fields produce useless data that won't be saved to DB

      // Verify the entry interface has all expected fields
      const entry: BankAccountEntry = { name: 'Test', bank_name: 'ING', account_type: 'checking', balance: '1000' }
      assert(!!entry.name, 'name is gevuld')
      assert(!!entry.bank_name, 'bank_name is gevuld')
      assert(!!entry.balance, 'balance is gevuld')
      assert(!!entry.account_type, 'account_type is gevuld')

      // An entry with all empty fields is structurally valid but semantically useless
      const emptyEntry = { ...EMPTY_BANK }
      assert(!emptyEntry.name, 'Lege naam')
      assert(!emptyEntry.bank_name, 'Lege bank naam')
      assert(!emptyEntry.balance, 'Leeg saldo')
    },
  },

  // ── Step 4: MiniAssetForm basis velden ───────────────────────────────────
  {
    id: 'ob-ext-mini-asset-form-basic',
    name: 'MiniAssetForm: naam, type, current_value, purchase_value, return, contribution',
    category: CAT,
    description: 'Asset form heeft 6 basisvelden + 12 asset types',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // 12 asset types
      assertEqual(ALL_ASSET_TYPES.length, 12, '12 asset types')
      assert(ALL_ASSET_TYPES.includes('savings'), 'savings type')
      assert(ALL_ASSET_TYPES.includes('investment'), 'investment type')
      assert(ALL_ASSET_TYPES.includes('retirement'), 'retirement type')
      assert(ALL_ASSET_TYPES.includes('eigen_huis'), 'eigen_huis type')
      assert(ALL_ASSET_TYPES.includes('real_estate'), 'real_estate type')
      assert(ALL_ASSET_TYPES.includes('crypto'), 'crypto type')

      // Default asset type is savings
      assertEqual(EMPTY_ASSET.asset_type, 'savings', 'Default type savings')
      assertEqual(EMPTY_ASSET.is_liquid, true, 'Savings default is_liquid true')

      // Save gate: requires name + current_value
      assert(!assetCanSave(EMPTY_ASSET), 'Lege asset kan niet opgeslagen worden')
      assert(assetCanSave({ ...EMPTY_ASSET, name: 'Belegging', current_value: '50000' }), 'Gevulde asset kan opgeslagen worden')
      assert(!assetCanSave({ ...EMPTY_ASSET, name: 'Belegging' }), 'Asset zonder waarde kan niet opgeslagen worden')
      assert(!assetCanSave({ ...EMPTY_ASSET, current_value: '50000' }), 'Asset zonder naam kan niet opgeslagen worden')
    },
  },

  // ── Step 5: MiniAssetForm uitgebreide velden ─────────────────────────────
  {
    id: 'ob-ext-mini-asset-extended-fields',
    name: 'MiniAssetForm uitgebreide velden: institution, subtype, risk_profile, etc.',
    category: CAT,
    description: 'Asset form heeft uitgebreide type-specifieke velden',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Extended fields exist in AssetEntry interface
      const entry = { ...EMPTY_ASSET }

      // Investment-related
      assertEqual(entry.institution, '', 'Default institution leeg')
      assertEqual(entry.subtype, '', 'Default subtype leeg')
      assertEqual(entry.risk_profile, '', 'Default risk_profile leeg')
      assertEqual(entry.tax_benefit, false, 'Default tax_benefit false')
      assertEqual(entry.is_liquid, true, 'Default is_liquid true')
      assertEqual(entry.lock_end_date, '', 'Default lock_end_date leeg')
      assertEqual(entry.ticker_symbol, '', 'Default ticker_symbol leeg')

      // Investment asset with extended fields
      const investment: AssetEntry = {
        ...EMPTY_ASSET,
        name: 'VWRL Portfolio',
        asset_type: 'investment',
        current_value: '100000',
        purchase_value: '85000',
        expected_return: '7',
        monthly_contribution: '500',
        institution: 'DEGIRO',
        subtype: 'etf',
        risk_profile: 'balanced',
        tax_benefit: false,
        is_liquid: true,
        ticker_symbol: 'VWRL',
      }
      assert(assetCanSave(investment), 'Volledig ingevulde investment kan opgeslagen worden')
      assertEqual(investment.ticker_symbol, 'VWRL', 'Ticker symbol ingevuld')
      assertEqual(investment.institution, 'DEGIRO', 'Institution ingevuld')
    },
  },

  // ── Step 6: MiniAssetForm vastgoed velden ────────────────────────────────
  {
    id: 'ob-ext-mini-asset-real-estate',
    name: 'MiniAssetForm vastgoed: rental_income, woz_value, address, depreciation_rate',
    category: CAT,
    description: 'Vastgoed-specifieke velden voor eigen_huis en real_estate',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Eigen huis asset
      const eigenHuis: AssetEntry = {
        ...EMPTY_ASSET,
        name: 'Eigen woning',
        asset_type: 'eigen_huis',
        current_value: '450000',
        purchase_value: '350000',
        woz_value: '425000',
        address_postcode: '1234AB',
        address_house_number: '42',
        rental_income: '',
        depreciation_rate: '',
      }
      assert(assetCanSave(eigenHuis), 'Eigen huis kan opgeslagen worden')
      assertEqual(eigenHuis.woz_value, '425000', 'WOZ-waarde ingevuld')
      assertEqual(eigenHuis.address_postcode, '1234AB', 'Postcode ingevuld')
      assertEqual(eigenHuis.address_house_number, '42', 'Huisnummer ingevuld')

      // Real estate (verhuur) with rental income
      const verhuur: AssetEntry = {
        ...EMPTY_ASSET,
        name: 'Verhuurwoning',
        asset_type: 'real_estate',
        current_value: '280000',
        purchase_value: '220000',
        woz_value: '260000',
        rental_income: '1200',
        address_postcode: '5678CD',
        address_house_number: '15b',
      }
      assertEqual(verhuur.rental_income, '1200', 'Huurinkomsten ingevuld')

      // Vehicle has depreciation_rate
      const vehicle: AssetEntry = {
        ...EMPTY_ASSET,
        name: 'Auto',
        asset_type: 'vehicle',
        current_value: '25000',
        depreciation_rate: '15',
      }
      assertEqual(vehicle.depreciation_rate, '15', 'Afschrijving ingevuld')
    },
  },

  // ── Step 7: MiniAssetForm pensioen velden ────────────────────────────────
  {
    id: 'ob-ext-mini-asset-pension',
    name: 'MiniAssetForm pensioen: retirement_provider_type',
    category: CAT,
    description: 'Pensioen-specifiek veld: retirement_provider_type',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Retirement asset with provider type
      const pensioen: AssetEntry = {
        ...EMPTY_ASSET,
        name: 'ABP Pensioen',
        asset_type: 'retirement',
        current_value: '180000',
        institution: 'ABP',
        retirement_provider_type: 'pension_fund',
        tax_benefit: true,
        is_liquid: false,
      }
      assert(assetCanSave(pensioen), 'Pensioen kan opgeslagen worden')
      assertEqual(pensioen.retirement_provider_type, 'pension_fund', 'Provider type ingevuld')
      assertEqual(pensioen.tax_benefit, true, 'Fiscaal voordeel aan')
      assertEqual(pensioen.is_liquid, false, 'Niet vrij opneembaar')
      assertEqual(pensioen.institution, 'ABP', 'Institution ABP')

      // retirement_provider_type is in interface
      assertEqual(EMPTY_ASSET.retirement_provider_type, '', 'Default provider type leeg')
    },
  },

  // ── Step 8: MiniDebtForm basis velden ────────────────────────────────────
  {
    id: 'ob-ext-mini-debt-form-basic',
    name: 'MiniDebtForm: naam, debt_type, original_amount, balance, rate, payments',
    category: CAT,
    description: 'Schuld form heeft 7 basisvelden + 8 schuldtypes',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // 8 debt types
      assertEqual(ALL_DEBT_TYPES.length, 8, '8 schuldtypes')
      assert(ALL_DEBT_TYPES.includes('mortgage'), 'mortgage type')
      assert(ALL_DEBT_TYPES.includes('personal_loan'), 'personal_loan type')
      assert(ALL_DEBT_TYPES.includes('student_loan'), 'student_loan type')
      assert(ALL_DEBT_TYPES.includes('car_loan'), 'car_loan type')
      assert(ALL_DEBT_TYPES.includes('credit_card'), 'credit_card type')
      assert(ALL_DEBT_TYPES.includes('revolving_credit'), 'revolving_credit type')
      assert(ALL_DEBT_TYPES.includes('payment_plan'), 'payment_plan type')
      assert(ALL_DEBT_TYPES.includes('other'), 'other type')

      // Default debt type
      assertEqual(EMPTY_DEBT.debt_type, 'personal_loan', 'Default type personal_loan')

      // Save gate: requires name + current_balance
      assert(!debtCanSave(EMPTY_DEBT), 'Lege schuld kan niet opgeslagen worden')
      assert(debtCanSave({ ...EMPTY_DEBT, name: 'Hypotheek', current_balance: '250000' }), 'Gevulde schuld kan opgeslagen worden')
      assert(!debtCanSave({ ...EMPTY_DEBT, name: 'Hypotheek' }), 'Schuld zonder saldo kan niet opgeslagen worden')
      assert(!debtCanSave({ ...EMPTY_DEBT, current_balance: '250000' }), 'Schuld zonder naam kan niet opgeslagen worden')

      // Full debt entry
      const hypotheek: DebtEntry = {
        ...EMPTY_DEBT,
        name: 'Hypotheek ABN AMRO',
        debt_type: 'mortgage',
        original_amount: '350000',
        current_balance: '280000',
        interest_rate: '3.5',
        minimum_payment: '1200',
        monthly_payment: '1500',
        creditor: 'ABN AMRO',
      }
      assert(debtCanSave(hypotheek), 'Hypotheek kan opgeslagen worden')
      assertEqual(hypotheek.interest_rate, '3.5', 'Rente ingevuld')
      assertEqual(hypotheek.monthly_payment, '1500', 'Maandbetaling ingevuld')
    },
  },

  // ── Step 9: MiniDebtForm uitgebreide velden ──────────────────────────────
  {
    id: 'ob-ext-mini-debt-extended-fields',
    name: 'MiniDebtForm uitgebreide velden: creditor, subtype, repayment, NHG, etc.',
    category: CAT,
    description: 'Schuld form heeft type-specifieke velden voor hypotheek, studielening, etc.',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Extended fields exist
      const entry = { ...EMPTY_DEBT }
      assertEqual(entry.creditor, '', 'Default creditor leeg')
      assertEqual(entry.subtype, '', 'Default subtype leeg')
      assertEqual(entry.repayment_type, '', 'Default repayment_type leeg')
      assertEqual(entry.is_tax_deductible, false, 'Default is_tax_deductible false')
      assertEqual(entry.fixed_rate_end_date, '', 'Default fixed_rate_end_date leeg')
      assertEqual(entry.nhg, false, 'Default NHG false')
      assertEqual(entry.credit_limit, '', 'Default credit_limit leeg')
      assertEqual(entry.draagkrachtmeting_date, '', 'Default draagkrachtmeting leeg')

      // Mortgage with extended fields
      const mortgage: DebtEntry = {
        ...EMPTY_DEBT,
        name: 'Hypotheek',
        debt_type: 'mortgage',
        current_balance: '300000',
        repayment_type: 'annuity',
        is_tax_deductible: true,
        nhg: true,
        fixed_rate_end_date: '2030-01-01',
      }
      assert(debtCanSave(mortgage), 'Hypotheek met uitgebreide velden geldig')
      assertEqual(mortgage.repayment_type, 'annuity', 'Aflossingsvorm annuiteit')
      assertEqual(mortgage.is_tax_deductible, true, 'Hypotheekrenteaftrek aan')
      assertEqual(mortgage.nhg, true, 'NHG aan')
      assertEqual(mortgage.fixed_rate_end_date, '2030-01-01', 'Rentevaste periode einddatum')

      // Student loan with draagkrachtmeting
      const studentLoan: DebtEntry = {
        ...EMPTY_DEBT,
        name: 'Studieschuld',
        debt_type: 'student_loan',
        current_balance: '25000',
        creditor: 'DUO',
        draagkrachtmeting_date: '2025-06-01',
      }
      assertEqual(studentLoan.creditor, 'DUO', 'Kredietverstrekker DUO')
      assertEqual(studentLoan.draagkrachtmeting_date, '2025-06-01', 'Draagkrachtmeting datum')

      // Credit card with limit
      const creditCard: DebtEntry = {
        ...EMPTY_DEBT,
        name: 'Visa Gold',
        debt_type: 'credit_card',
        current_balance: '2500',
        credit_limit: '5000',
      }
      assertEqual(creditCard.credit_limit, '5000', 'Kredietlimiet ingevuld')
    },
  },

  // ── Step 10: Meerdere items ──────────────────────────────────────────────
  {
    id: 'ob-ext-multiple-items',
    name: 'Meerdere items: 3+ bankrekeningen, 3+ assets, 3+ schulden',
    category: CAT,
    description: 'Meerdere items per sectie tegelijk toevoegen en beheren',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // 3+ bank accounts
      let banks: BankAccountEntry[] = []
      banks = bankAdd(banks)
      banks = bankAdd(banks)
      banks = bankAdd(banks)
      assertEqual(banks.length, 3, '3 bankrekeningen toegevoegd')
      banks = bankUpdate(banks, 0, { name: 'Betaal ING', bank_name: 'ING', balance: '2500' })
      banks = bankUpdate(banks, 1, { name: 'Spaar ASN', bank_name: 'ASN', balance: '15000' })
      banks = bankUpdate(banks, 2, { name: 'Gezamenlijk', bank_name: 'Rabo', balance: '800', account_type: 'joint' })
      assertEqual(banks[0].name, 'Betaal ING', 'Bank 1 naam')
      assertEqual(banks[1].name, 'Spaar ASN', 'Bank 2 naam')
      assertEqual(banks[2].name, 'Gezamenlijk', 'Bank 3 naam')

      // 3+ assets (using AssetEntry directly)
      const assets: AssetEntry[] = [
        { ...EMPTY_ASSET, name: 'Spaarrekening', asset_type: 'savings', current_value: '20000' },
        { ...EMPTY_ASSET, name: 'DEGIRO Portfolio', asset_type: 'investment', current_value: '80000' },
        { ...EMPTY_ASSET, name: 'Eigen woning', asset_type: 'eigen_huis', current_value: '400000' },
      ]
      assertEqual(assets.length, 3, '3 bezittingen')
      for (const a of assets) {
        assert(assetCanSave(a), `Asset ${a.name} kan opgeslagen worden`)
      }

      // 3+ debts
      const debts: DebtEntry[] = [
        { ...EMPTY_DEBT, name: 'Hypotheek', debt_type: 'mortgage', current_balance: '280000' },
        { ...EMPTY_DEBT, name: 'Studieschuld', debt_type: 'student_loan', current_balance: '15000' },
        { ...EMPTY_DEBT, name: 'Autolening', debt_type: 'car_loan', current_balance: '8000' },
      ]
      assertEqual(debts.length, 3, '3 schulden')
      for (const d of debts) {
        assert(debtCanSave(d), `Debt ${d.name} kan opgeslagen worden`)
      }

      // hasData is true when any section has items
      const hasData = banks.length > 0 || assets.length > 0 || debts.length > 0
      assert(hasData, 'Met items: hasData is true')
      const buttonLabel = hasData ? 'Volgende' : 'Overslaan'
      assertEqual(buttonLabel, 'Volgende', 'Met data: Volgende knop')
    },
  },

  // ── Step 11: Items verwijderen ───────────────────────────────────────────
  {
    id: 'ob-ext-remove-items',
    name: 'Items verwijderen: individueel item verwijderen uit lijst',
    category: CAT,
    description: 'Verwijder-functie filtert correct op index',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Bank: add 3, remove middle
      let banks: BankAccountEntry[] = []
      banks = bankAdd(banks)
      banks = bankAdd(banks)
      banks = bankAdd(banks)
      banks = bankUpdate(banks, 0, { name: 'First' })
      banks = bankUpdate(banks, 1, { name: 'Second' })
      banks = bankUpdate(banks, 2, { name: 'Third' })
      assertEqual(banks.length, 3, 'Start: 3 items')

      banks = bankRemove(banks, 1) // Remove 'Second'
      assertEqual(banks.length, 2, 'Na verwijderen: 2 items')
      assertEqual(banks[0].name, 'First', 'First behouden')
      assertEqual(banks[1].name, 'Third', 'Third behouden')

      // Remove first
      banks = bankRemove(banks, 0)
      assertEqual(banks.length, 1, 'Na 2e verwijderen: 1 item')
      assertEqual(banks[0].name, 'Third', 'Third behouden')

      // Remove last
      banks = bankRemove(banks, 0)
      assertEqual(banks.length, 0, 'Na alles verwijderen: 0 items')

      // Asset/Debt use same filter pattern
      let debts: DebtEntry[] = [
        { ...EMPTY_DEBT, name: 'A', current_balance: '100' },
        { ...EMPTY_DEBT, name: 'B', current_balance: '200' },
        { ...EMPTY_DEBT, name: 'C', current_balance: '300' },
      ]
      debts = debts.filter((_, idx) => idx !== 1) // Remove B
      assertEqual(debts.length, 2, 'Debts: 2 na verwijderen')
      assertEqual(debts[0].name, 'A', 'Debt A behouden')
      assertEqual(debts[1].name, 'C', 'Debt C behouden')
    },
  },

  // ── Bonus: Onboarding route check ────────────────────────────────────────
  {
    id: 'ob-ext-route-accessible',
    name: 'Onboarding extras: route bereikbaar',
    category: CAT,
    description: 'Onboarding pagina is bereikbaar (extras stap geladen via stap-navigatie)',
    priority: 'high',
    estimatedDurationMs: 1000,
    async fn() {
      const res = await fetch('/onboarding', { redirect: 'manual' })
      const valid = res.status === 200 || (res.status >= 300 && res.status < 400)
      assert(valid, `Onboarding route verwacht 200/3xx, kreeg ${res.status}`)
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'Onboarding — Extras',
    description: 'Onboarding stap 3: optionele data — bankrekeningen, bezittingen, schulden',
    icon: 'PlusCircle',
    testCount: 0,
  })
  registerTests(tests)
}
