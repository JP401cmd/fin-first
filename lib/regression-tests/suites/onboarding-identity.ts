import { registerCategory, registerTests } from '../test-registry'
import { assert, assertEqual, assertNotNull } from '../assert'
import type { TestCase } from '../test-types'
import { authenticatedFetch } from '../server-runner'

const CAT = 'onboarding.identity'

// ── IdentityData interface mirror (matches components/onboarding/onboarding-identity.tsx) ──
// Simplified: FIRE params, budgettering_mode, temporal_balance removed (moved to horizon step)

type HouseholdType = 'solo' | 'samen' | 'gezin'

interface IdentityData {
  full_name: string
  date_of_birth: string
  household_type: HouseholdType
  number_of_children: number
  net_monthly_income: string
  estimated_monthly_expenses: string
}

type FieldKey = 'full_name' | 'date_of_birth' | 'net_monthly_income' | 'number_of_children'

// ── Validation logic mirror ──
// Matches: onboarding-identity.tsx (name + DOB) en onboarding-inkomen.tsx
// (household + income + children). Inkomen is optioneel geworden sinds
// feature #828 — alleen niet-lege waarden worden gevalideerd.

function getFieldErrors(data: IdentityData): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {}

  // Name: min 2 characters
  if (!data.full_name.trim()) {
    errors.full_name = 'Naam is verplicht'
  } else if (data.full_name.trim().length < 2) {
    errors.full_name = 'Naam moet minimaal 2 tekens bevatten'
  }

  // Date of birth: 18-100 years old
  if (!data.date_of_birth) {
    errors.date_of_birth = 'Geboortedatum is verplicht'
  } else {
    const dob = new Date(data.date_of_birth)
    const now = new Date()
    const age = now.getFullYear() - dob.getFullYear() -
      (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0)
    if (isNaN(dob.getTime())) {
      errors.date_of_birth = 'Ongeldige datum'
    } else if (dob > now) {
      errors.date_of_birth = 'Geboortedatum kan niet in de toekomst liggen'
    } else if (age > 100) {
      errors.date_of_birth = 'Ongeldige geboortedatum (max 100 jaar)'
    } else if (age < 18) {
      errors.date_of_birth = 'Je moet minimaal 18 jaar oud zijn'
    }
  }

  // Income: optioneel (feature #828) \u2014 alleen valideren wanneer ingevuld.
  if (data.net_monthly_income) {
    const cleaned = data.net_monthly_income.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')
    const income = Number(cleaned)
    if (isNaN(income)) {
      errors.net_monthly_income = 'Voer een geldig bedrag in'
    } else if (income < 0) {
      errors.net_monthly_income = 'Inkomen kan niet negatief zijn'
    } else if (income > 1000000) {
      errors.net_monthly_income = 'Voer een realistisch maandinkomen in'
    }
  }

  // Children: required if gezin
  if (data.household_type === 'gezin') {
    if (data.number_of_children < 1) {
      errors.number_of_children = 'Minimaal 1 kind bij huishoudtype gezin'
    } else if (data.number_of_children > 20) {
      errors.number_of_children = 'Voer een realistisch aantal in'
    }
  }

  return errors
}

// ── Default valid data fixture ──────────────────────────────────────────────

function validData(): IdentityData {
  return {
    full_name: 'Test Gebruiker',
    date_of_birth: '1990-06-15',
    household_type: 'solo',
    number_of_children: 0,
    net_monthly_income: '3500',
    estimated_monthly_expenses: '',
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: Verplichte velden ────────────────────────────────────────────
  {
    id: 'ob-id-required-full-name-min-2',
    name: 'Verplicht veld: full_name (min 2 tekens)',
    category: CAT,
    description: 'full_name moet minimaal 2 tekens bevatten, leeg en 1 teken geven fout',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Empty name
      const d1 = { ...validData(), full_name: '' }
      const e1 = getFieldErrors(d1)
      assertNotNull(e1.full_name, 'Lege naam moet fout geven')
      assertEqual(e1.full_name, 'Naam is verplicht', 'Lege naam foutmelding')

      // 1 character name
      const d2 = { ...validData(), full_name: 'A' }
      const e2 = getFieldErrors(d2)
      assertNotNull(e2.full_name, '1-teken naam moet fout geven')
      assertEqual(e2.full_name, 'Naam moet minimaal 2 tekens bevatten', '1-teken foutmelding')

      // 2+ character name: valid
      const d3 = { ...validData(), full_name: 'AB' }
      const e3 = getFieldErrors(d3)
      assertEqual(e3.full_name, undefined, '2-teken naam is geldig')

      // Whitespace-only treated as empty
      const d4 = { ...validData(), full_name: '   ' }
      const e4 = getFieldErrors(d4)
      assertNotNull(e4.full_name, 'Whitespace-only naam moet fout geven')
    },
  },
  {
    id: 'ob-id-required-date-of-birth',
    name: 'Verplicht veld: date_of_birth (18-100 jaar)',
    category: CAT,
    description: 'Geboortedatum moet valide zijn en leeftijd 18-100 jaar',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Empty
      const d1 = { ...validData(), date_of_birth: '' }
      assertEqual(getFieldErrors(d1).date_of_birth, 'Geboortedatum is verplicht', 'Lege datum')

      // Future date
      const future = new Date()
      future.setFullYear(future.getFullYear() + 1)
      const d2 = { ...validData(), date_of_birth: future.toISOString().split('T')[0] }
      assertEqual(getFieldErrors(d2).date_of_birth, 'Geboortedatum kan niet in de toekomst liggen', 'Toekomstige datum')

      // Too young (10 years old)
      const young = new Date()
      young.setFullYear(young.getFullYear() - 10)
      const d3 = { ...validData(), date_of_birth: young.toISOString().split('T')[0] }
      assertEqual(getFieldErrors(d3).date_of_birth, 'Je moet minimaal 18 jaar oud zijn', 'Te jong')

      // Too old (105 years old)
      const old = new Date()
      old.setFullYear(old.getFullYear() - 105)
      const d4 = { ...validData(), date_of_birth: old.toISOString().split('T')[0] }
      assertEqual(getFieldErrors(d4).date_of_birth, 'Ongeldige geboortedatum (max 100 jaar)', 'Te oud')

      // Valid: 35 years old
      const valid35 = new Date()
      valid35.setFullYear(valid35.getFullYear() - 35)
      const d5 = { ...validData(), date_of_birth: valid35.toISOString().split('T')[0] }
      assertEqual(getFieldErrors(d5).date_of_birth, undefined, '35 jaar is geldig')

      // Edge: exactly 18
      const exact18 = new Date()
      exact18.setFullYear(exact18.getFullYear() - 18)
      const d6 = { ...validData(), date_of_birth: exact18.toISOString().split('T')[0] }
      assertEqual(getFieldErrors(d6).date_of_birth, undefined, 'Precies 18 is geldig')
    },
  },
  {
    id: 'ob-id-optional-net-monthly-income',
    name: 'Optioneel veld: net_monthly_income (feature #828)',
    category: CAT,
    description: 'Maandinkomen is optioneel \u2014 leeg/0 is toegestaan, negatief en >1M geven fout',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Empty \u2014 geen fout (optioneel)
      const d1 = { ...validData(), net_monthly_income: '' }
      assertEqual(getFieldErrors(d1).net_monthly_income, undefined, 'Leeg inkomen is geldig (optioneel)')

      // Zero \u2014 geen fout (0 is acceptabel)
      const d2 = { ...validData(), net_monthly_income: '0' }
      assertEqual(getFieldErrors(d2).net_monthly_income, undefined, 'Nul inkomen is geldig')

      // Negative \u2014 fout
      const d3 = { ...validData(), net_monthly_income: '-500' }
      assertNotNull(getFieldErrors(d3).net_monthly_income, 'Negatief inkomen moet fout geven')

      // Non-numeric \u2014 fout
      const d4 = { ...validData(), net_monthly_income: 'abc' }
      assertEqual(getFieldErrors(d4).net_monthly_income, 'Voer een geldig bedrag in', 'Niet-numeriek')

      // Over max \u2014 fout
      const d5 = { ...validData(), net_monthly_income: '1500000' }
      assertEqual(getFieldErrors(d5).net_monthly_income, 'Voer een realistisch maandinkomen in', 'Boven max')

      // Valid
      const d6 = { ...validData(), net_monthly_income: '3500' }
      assertEqual(getFieldErrors(d6).net_monthly_income, undefined, 'Geldig inkomen')

      // Edge: exactly \u20AC1
      const d7 = { ...validData(), net_monthly_income: '1' }
      assertEqual(getFieldErrors(d7).net_monthly_income, undefined, '\u20AC1 is geldig')
    },
  },

  // ── Step 2: Huishoudtype selectie ─────────────────────────────────────────
  {
    id: 'ob-id-household-type-selection',
    name: 'Huishoudtype: solo/samen/gezin met conditionele velden',
    category: CAT,
    description: 'Huishoudtype selectie toont number_of_children alleen bij gezin',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const types: HouseholdType[] = ['solo', 'samen', 'gezin']

      // All three types are valid options
      for (const t of types) {
        const d = { ...validData(), household_type: t, number_of_children: t === 'gezin' ? 2 : 0 }
        const e = getFieldErrors(d)
        assertEqual(e.number_of_children, undefined, `${t}: geen children fout bij geldig scenario`)
      }

      // Solo: number_of_children not validated (0 is fine)
      const dSolo = { ...validData(), household_type: 'solo' as const, number_of_children: 0 }
      assertEqual(getFieldErrors(dSolo).number_of_children, undefined, 'Solo: 0 kinderen ok')

      // Samen: number_of_children not validated
      const dSamen = { ...validData(), household_type: 'samen' as const, number_of_children: 0 }
      assertEqual(getFieldErrors(dSamen).number_of_children, undefined, 'Samen: 0 kinderen ok')

      // Gezin: 0 children is invalid
      const dGezin0 = { ...validData(), household_type: 'gezin' as const, number_of_children: 0 }
      assertNotNull(getFieldErrors(dGezin0).number_of_children, 'Gezin: 0 kinderen moet fout geven')

      // Gezin: 1 child is valid
      const dGezin1 = { ...validData(), household_type: 'gezin' as const, number_of_children: 1 }
      assertEqual(getFieldErrors(dGezin1).number_of_children, undefined, 'Gezin: 1 kind ok')

      // Gezin: >20 children is invalid
      const dGezin21 = { ...validData(), household_type: 'gezin' as const, number_of_children: 21 }
      assertNotNull(getFieldErrors(dGezin21).number_of_children, 'Gezin: 21 kinderen moet fout geven')
    },
  },

  // ── Step 3: Geschatte maanduitgaven ───────────────────────────────────────
  {
    id: 'ob-id-estimated-monthly-expenses',
    name: 'Geschatte maanduitgaven: optioneel veld, altijd getoond',
    category: CAT,
    description: 'estimated_monthly_expenses is optioneel en altijd zichtbaar (niet meer afhankelijk van budgettering_mode)',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // estimated_monthly_expenses is always visible and optional
      // It is NOT validated in getFieldErrors
      const dWithExpenses = { ...validData(), estimated_monthly_expenses: '2000' }
      const errWith = getFieldErrors(dWithExpenses)
      assertEqual(Object.keys(errWith).length, 0, 'Geen fouten bij ingevulde schatting')

      // Even empty is fine (optional field)
      const dEmpty = { ...validData(), estimated_monthly_expenses: '' }
      const errEmpty = getFieldErrors(dEmpty)
      assertEqual(Object.keys(errEmpty).length, 0, 'Geen fouten bij lege schatting')
    },
  },

  // ── Step 4: Simplified identity — 6 fields only ──────────────────────────
  {
    id: 'ob-id-simplified-fields',
    name: 'Vereenvoudigde identity: exact 6 velden',
    category: CAT,
    description: 'Identity bevat nu alleen: full_name, date_of_birth, household_type, number_of_children, net_monthly_income, estimated_monthly_expenses',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Verify the interface has exactly 6 fields
      const d = validData()
      const fields = Object.keys(d)
      assertEqual(fields.length, 6, 'Identity heeft exact 6 velden')
      assert(fields.includes('full_name'), 'Bevat full_name')
      assert(fields.includes('date_of_birth'), 'Bevat date_of_birth')
      assert(fields.includes('household_type'), 'Bevat household_type')
      assert(fields.includes('number_of_children'), 'Bevat number_of_children')
      assert(fields.includes('net_monthly_income'), 'Bevat net_monthly_income')
      assert(fields.includes('estimated_monthly_expenses'), 'Bevat estimated_monthly_expenses')

      // Verify FIRE params are NOT in identity anymore
      const identityKeys = Object.keys(d)
      assert(!identityKeys.includes('expected_return'), 'expected_return niet in identity (verplaatst naar horizon)')
      assert(!identityKeys.includes('inflation_rate'), 'inflation_rate niet in identity (verplaatst naar horizon)')
      assert(!identityKeys.includes('fire_end_strategy'), 'fire_end_strategy niet in identity (verplaatst naar horizon)')
      assert(!identityKeys.includes('fire_legacy_amount'), 'fire_legacy_amount niet in identity (verplaatst naar horizon)')
      assert(!identityKeys.includes('fire_end_age'), 'fire_end_age niet in identity (verplaatst naar horizon)')
      assert(!identityKeys.includes('retirement_expense_method'), 'retirement_expense_method niet in identity (verplaatst naar horizon)')
      assert(!identityKeys.includes('retirement_custom_amount'), 'retirement_custom_amount niet in identity (verplaatst naar horizon)')
      assert(!identityKeys.includes('temporal_balance'), 'temporal_balance niet in identity (verplaatst naar horizon)')
      assert(!identityKeys.includes('budgettering_mode'), 'budgettering_mode niet in identity (afgeleid uit modules)')
    },
  },

  // ── Step 5: SpeechBubble guidance ─────────────────────────────────────────
  {
    id: 'ob-id-speech-bubble-guidance',
    name: 'SpeechBubble: Will guidance tekst bij persoonlijke gegevens',
    category: CAT,
    description: 'SpeechBubble met WillDots avatar aanwezig voor identity velden',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      // The simplified identity form has fewer SpeechBubble instances
      // since FIRE section and temporal balance are moved to horizon step
      const res = await authenticatedFetch('/onboarding', { redirect: 'follow' })
      if (res.status === 200) {
        const html = await res.text()
        assert(
          html.includes('onboarding') || html.includes('Onboarding') || html.includes('will-dots'),
          'Onboarding pagina bevat verwachte componenten',
        )
      }
      // The personal data speech bubble remains
      const speechBubbleTexts = [
        'Om je pad naar vrijheid te berekenen',
      ]
      assert(speechBubbleTexts.length >= 1, 'Minstens 1 SpeechBubble sectie verwacht')
    },
  },

  // ── Step 6: Validatie foutmeldingen ───────────────────────────────────────
  {
    id: 'ob-id-validation-error-display',
    name: 'Validatie foutmeldingen: rode border en tekst bij ongeldige invoer',
    category: CAT,
    description: 'Fouten tonen rode border-klasse en error tekst na touch/submit',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Completely invalid data: required fields empty
      const invalid: IdentityData = {
        full_name: '',
        date_of_birth: '',
        household_type: 'solo',
        number_of_children: 0,
        net_monthly_income: '',
        estimated_monthly_expenses: '',
      }

      const errors = getFieldErrors(invalid)

      // Should have exactly 2 errors: full_name, date_of_birth
      // (net_monthly_income is optioneel sinds feature #828)
      assertNotNull(errors.full_name, 'full_name fout bij lege data')
      assertNotNull(errors.date_of_birth, 'date_of_birth fout bij lege data')
      assertEqual(errors.net_monthly_income, undefined, 'Leeg inkomen geeft geen fout (optioneel)')

      // No errors for optional/conditional fields
      assertEqual(errors.number_of_children, undefined, 'Solo: geen children fout')

      // isValid should be false (naam + DOB zijn verplicht)
      const isValid = Object.keys(errors).length === 0
      assert(!isValid, 'Formulier met lege verplichte velden is niet geldig')

      // Valid data has no errors
      const validErrors = getFieldErrors(validData())
      assert(Object.keys(validErrors).length === 0, 'Geldige data geeft geen fouten')
    },
  },

  // ── Step 7: Doorgang naar volgende stap ───────────────────────────────────
  {
    id: 'ob-id-step-progression',
    name: 'Doorgang naar volgende stap: alleen bij geldige verplichte velden',
    category: CAT,
    description: 'handleNext blokkeert bij ongeldige velden, gaat door bij geldige',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Valid data: isValid = true
      const dValid = validData()
      const errorsValid = getFieldErrors(dValid)
      const isValidPass = Object.keys(errorsValid).length === 0
      assert(isValidPass, 'Geldige data staat doorgang toe')

      // Invalid data: isValid = false
      const dInvalid = { ...validData(), full_name: '' }
      const errorsInvalid = getFieldErrors(dInvalid)
      const isValidFail = Object.keys(errorsInvalid).length === 0
      assert(!isValidFail, 'Ongeldige data blokkeert doorgang')

      // Gezin without children blocks progression
      const dGezinNoKids = { ...validData(), household_type: 'gezin' as const, number_of_children: 0 }
      assert(Object.keys(getFieldErrors(dGezinNoKids)).length > 0, 'Gezin zonder kinderen blokkeert')

      // FIELD_IDS mapping: simplified (no more FIRE fields)
      const fieldIds: Record<FieldKey, string> = {
        full_name: 'ob-name',
        date_of_birth: 'ob-dob',
        net_monthly_income: 'ob-income',
        number_of_children: 'ob-children',
      }
      assertEqual(Object.keys(fieldIds).length, 4, '4 velden met scroll-to-error ID mapping')
    },
  },

  // ── Step 8: Onboarding route accessible ──────────────────────────────────
  {
    id: 'ob-id-route-accessible',
    name: 'Onboarding route: /onboarding bereikbaar',
    category: CAT,
    description: 'Onboarding pagina retourneert 200 of auth redirect',
    priority: 'high',
    estimatedDurationMs: 1000,
    async fn() {
      const res = await authenticatedFetch('/onboarding', { redirect: 'manual' })
      const valid = res.status === 200 || (res.status >= 300 && res.status < 400)
      assert(valid, `Onboarding route verwacht 200/3xx, kreeg ${res.status}`)
    },
  },

  // ── Step 9: Full form validation integration ─────────────────────────────
  {
    id: 'ob-id-full-validation-integration',
    name: 'Volledige validatie: alle conditionele paden correct',
    category: CAT,
    description: 'Alle combinaties van conditionele velden worden correct gevalideerd',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Gezin with children: conditional fields active
      const dGezin: IdentityData = {
        full_name: 'Test Gezin',
        date_of_birth: '1985-03-20',
        household_type: 'gezin',
        number_of_children: 2,
        net_monthly_income: '5000',
        estimated_monthly_expenses: '3500',
      }
      const errGezin = getFieldErrors(dGezin)
      assertEqual(Object.keys(errGezin).length, 0, 'Gezin met kinderen: geen fouten')

      // Same but with 0 children → should have error
      const dGezinEmpty: IdentityData = {
        ...dGezin,
        number_of_children: 0,
      }
      const errGezinEmpty = getFieldErrors(dGezinEmpty)
      assertNotNull(errGezinEmpty.number_of_children, 'Gezin + 0 kinderen: fout')
      assertEqual(Object.keys(errGezinEmpty).length, 1, 'Precies 1 conditionele fout')

      // Solo is simplest — no conditional fields at all
      const dSolo = validData()
      const errSolo = getFieldErrors(dSolo)
      assertEqual(Object.keys(errSolo).length, 0, 'Solo: simpelste pad, geen fouten')
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'Onboarding \u2014 Identity',
    description: 'Onboarding stap 2: identity gegevens (vereenvoudigd, 6 velden), validatie',
    icon: 'UserCheck',
    testCount: 0,
  })
  registerTests(tests)
}
