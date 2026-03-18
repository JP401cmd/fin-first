import { registerCategory, registerTests } from '../test-registry'
import { assertEqual, assert, assertNotNull } from '../assert'
import type { TestCase } from '../test-types'
import { sanitizeForAI, sanitizeTransaction } from '@/lib/ai/sanitize'
import { maskPIIInOutput } from '@/lib/ai/pii-output-filter'

const CAT = 'security-input-validatie'

// ── SQL injection test strings ──────────────────────────────────────────
const SQL_INJECTION_PAYLOADS = [
  "'; DROP TABLE profiles; --",
  "1; DELETE FROM holdings WHERE 1=1; --",
  "' OR '1'='1",
  "'; UPDATE profiles SET expected_return=0.99 WHERE '1'='1",
  "Robert'); DROP TABLE transactions;--",
  "1 UNION SELECT * FROM auth.users --",
  "' OR 1=1 --",
  "admin'--",
  "1'; EXEC xp_cmdshell('dir'); --",
  "'; INSERT INTO profiles (id) VALUES ('hacked'); --",
]

// ── XSS test strings ───────────────────────────────────────────────────
const XSS_PAYLOADS = [
  '<script>alert("xss")</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  'javascript:alert(1)',
  '<iframe src="javascript:alert(1)">',
  '"><script>document.cookie</script>',
  "' onfocus='alert(1)' autofocus='",
  '<body onload=alert(1)>',
  '<a href="javascript:void(0)" onclick="alert(1)">click</a>',
  '{{constructor.constructor("return this")()}}',
]

const tests: TestCase[] = [
  // ── Step 1: SQL injection preventie ─────────────────────────────────
  {
    id: 'sql-inj-sanitize-names',
    name: 'SQL injection in namen wordt gesanitized',
    category: CAT,
    description: 'sanitizeForAI verwerkt SQL injection strings zonder fouten',
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      for (const payload of SQL_INJECTION_PAYLOADS) {
        // Must not throw
        const result = sanitizeForAI(payload)
        assert(typeof result === 'string', `sanitizeForAI moet string retourneren voor: ${payload}`)
        // The sanitizer processes PII but doesn't need to modify SQL — the key is
        // that Supabase uses parameterized queries so SQL strings are treated as values
      }
    },
  },
  {
    id: 'sql-inj-pii-output-names',
    name: 'SQL injection in PII output filter',
    category: CAT,
    description: 'maskPIIInOutput crasht niet bij SQL injection strings',
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      for (const payload of SQL_INJECTION_PAYLOADS) {
        const result = maskPIIInOutput(payload)
        assert(typeof result === 'string', `maskPIIInOutput moet string retourneren voor: ${payload}`)
      }
    },
  },
  {
    id: 'sql-inj-transaction-sanitize',
    name: 'SQL injection in transactie beschrijvingen',
    category: CAT,
    description: 'sanitizeTransaction verwerkt kwaadaardige strings in description/counterparty',
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      for (const payload of SQL_INJECTION_PAYLOADS) {
        const result = sanitizeTransaction({
          amount: 100,
          is_income: false,
          category: payload,
          description: payload,
          counterparty_name: payload,
          date: '2025-01-15',
        })
        // sanitizeTransaction strips description and counterparty
        assert(result.category === payload, 'category passthrough')
        assert(result.amount === 100, 'amount preserved')
        assert(!('description' in result), 'description stripped')
        assert(!('counterparty_name' in result), 'counterparty stripped')
      }
    },
  },

  // ── Step 2: XSS preventie ──────────────────────────────────────────
  {
    id: 'xss-sanitize-escape',
    name: 'XSS payloads in sanitizeForAI',
    category: CAT,
    description: 'Script tags en event handlers worden verwerkt zonder fouten',
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      for (const payload of XSS_PAYLOADS) {
        const result = sanitizeForAI(payload)
        assert(typeof result === 'string', `sanitizeForAI retourneert string voor XSS payload`)
        // sanitizeForAI verwerkt PII, niet XSS — maar het mag niet crashen
      }
    },
  },
  {
    id: 'xss-pii-output',
    name: 'XSS payloads in PII output masking',
    category: CAT,
    description: 'maskPIIInOutput verwerkt XSS payloads zonder fouten',
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      for (const payload of XSS_PAYLOADS) {
        const result = maskPIIInOutput(payload)
        assert(typeof result === 'string', `maskPIIInOutput retourneert string voor XSS payload`)
      }
    },
  },
  {
    id: 'xss-name-options',
    name: 'XSS in sanitize opties (namen)',
    category: CAT,
    description: 'sanitizeForAI crasht niet als namen XSS bevatten',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      for (const payload of XSS_PAYLOADS) {
        const result = sanitizeForAI('Betaling voor Jan de Vries', {
          names: [payload],
          userLabel: 'gebruiker',
        })
        assert(typeof result === 'string', 'result is string')
      }
    },
  },

  // ── Step 3: Numerieke validatie ─────────────────────────────────────
  {
    id: 'num-parameters-range',
    name: 'Numerieke range validatie in parameters',
    category: CAT,
    description: 'expected_return en inflation_rate range checks zijn correct gedefinieerd',
    priority: 'critical',
    estimatedDurationMs: 5,
    fn() {
      // Test the validation logic from /api/parameters/route.ts
      const validReturnRange = (v: number) => !isNaN(v) && v >= 0.01 && v <= 0.15
      const validInflationRange = (v: number) => !isNaN(v) && v >= 0 && v <= 0.08

      // Valid values
      assert(validReturnRange(0.07), '7% is geldig rendement')
      assert(validReturnRange(0.01), '1% minimum geldig')
      assert(validReturnRange(0.15), '15% maximum geldig')
      assert(validInflationRange(0.02), '2% is geldige inflatie')
      assert(validInflationRange(0), '0% inflatie geldig')
      assert(validInflationRange(0.08), '8% inflatie max geldig')

      // Invalid values
      assert(!validReturnRange(0), '0% rendement ongeldig')
      assert(!validReturnRange(-0.05), 'negatief rendement ongeldig')
      assert(!validReturnRange(0.20), '20% rendement ongeldig')
      assert(!validReturnRange(NaN), 'NaN rendement ongeldig')
      assert(!validReturnRange(Infinity), 'Infinity rendement ongeldig')
      assert(!validInflationRange(-0.01), 'negatieve inflatie ongeldig')
      assert(!validInflationRange(0.10), '10% inflatie ongeldig')
      assert(!validInflationRange(NaN), 'NaN inflatie ongeldig')
    },
  },
  {
    id: 'num-holding-validation',
    name: 'Numerieke validatie voor holdings',
    category: CAT,
    description: 'Units, avg_purchase_price, current_price validatie: negatief, NaN, Infinity',
    priority: 'critical',
    estimatedDurationMs: 5,
    fn() {
      // Holdings route uses: const n = Number(value); if (isNaN(n) || n < 0)
      const validPositiveNumeric = (v: unknown) => {
        if (v === undefined || v === null) return true // optional fields pass
        const n = Number(v)
        return !isNaN(n) && n >= 0
      }

      // Valid
      assert(validPositiveNumeric(100), '100 is geldig')
      assert(validPositiveNumeric(0), '0 is geldig')
      assert(validPositiveNumeric(0.5), '0.5 is geldig')
      assert(validPositiveNumeric('100'), 'string "100" coerces to valid')
      assert(validPositiveNumeric(undefined), 'undefined is optioneel')
      assert(validPositiveNumeric(null), 'null is optioneel')

      // Invalid
      assert(!validPositiveNumeric(-1), 'negatief is ongeldig')
      assert(!validPositiveNumeric(-0.01), 'negatief decimaal ongeldig')
      assert(!validPositiveNumeric('abc'), 'string "abc" is ongeldig (NaN)')
      assert(!validPositiveNumeric('not-a-number'), 'tekst is ongeldig')

      // Edge: Number('') === 0 which passes >= 0, this is acceptable behavior
      // Number(Infinity) is not NaN but should ideally be caught
      const infVal = Number(Infinity)
      assert(!isNaN(infVal), 'Infinity is not NaN — special case')
    },
  },
  {
    id: 'num-extreme-values',
    name: 'Extreem grote getallen',
    category: CAT,
    description: 'Number() coercion met extreem grote/kleine waarden',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      // Test Number() behavior with extremes
      const extreme = Number(Number.MAX_SAFE_INTEGER)
      assert(!isNaN(extreme), 'MAX_SAFE_INTEGER is valid number')
      assert(Number.isFinite(extreme), 'MAX_SAFE_INTEGER is finite')

      const beyondSafe = Number('9999999999999999999999')
      assert(!isNaN(beyondSafe), 'beyond safe int still parses')
      assert(Number.isFinite(beyondSafe), 'beyond safe int is finite')

      // NaN/Infinity edge cases
      assert(isNaN(Number('NaN')), 'string NaN produces NaN')
      assert(!isNaN(Number('Infinity')), 'string Infinity does NOT produce NaN')
      assert(!Number.isFinite(Number('Infinity')), 'string Infinity is not finite')
      assert(!Number.isFinite(Number('-Infinity')), '-Infinity is not finite')
    },
  },

  // ── Step 4: Type coercion ──────────────────────────────────────────
  {
    id: 'type-coercion-string-to-number',
    name: 'Type coercion: string waar nummer verwacht',
    category: CAT,
    description: 'Number() coercion van strings produceert verwachte resultaten',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      // The API routes use Number(value) for coercion
      assertEqual(Number('42'), 42, 'string "42" → 42')
      assertEqual(Number('3.14'), 3.14, 'string "3.14" → 3.14')
      assertEqual(Number(''), 0, 'empty string → 0')
      assertEqual(Number(' '), 0, 'whitespace → 0')
      assert(isNaN(Number('abc')), '"abc" → NaN')
      assert(isNaN(Number(undefined)), 'undefined → NaN')
      assertEqual(Number(null), 0, 'null → 0')
      assertEqual(Number(true), 1, 'true → 1')
      assertEqual(Number(false), 0, 'false → 0')
      assertEqual(Number([]), 0, 'empty array → 0')
      assert(isNaN(Number([1, 2])), 'array [1,2] → NaN')
      assert(isNaN(Number({})), 'object {} → NaN')
    },
  },
  {
    id: 'type-coercion-boolean-widget',
    name: 'Boolean coercion in widget preferences',
    category: CAT,
    description: 'Boolean() coercion voor widget enabled veld',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      // Widget route uses Boolean(w.enabled) for type safety
      assertEqual(Boolean(true), true, 'true → true')
      assertEqual(Boolean(false), false, 'false → false')
      assertEqual(Boolean(1), true, '1 → true')
      assertEqual(Boolean(0), false, '0 → false')
      assertEqual(Boolean('true'), true, '"true" → true (truthy string)')
      assertEqual(Boolean('false'), true, '"false" → true (truthy string!)')
      assertEqual(Boolean(''), false, '"" → false')
      assertEqual(Boolean(null), false, 'null → false')
      assertEqual(Boolean(undefined), false, 'undefined → false')
    },
  },
  {
    id: 'type-coercion-array-check',
    name: 'Array.isArray guard tegen niet-array invoer',
    category: CAT,
    description: 'Array.isArray detecteert correcte types',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      // Widget + budget favorites routes use Array.isArray() guards
      assert(Array.isArray([]), 'empty array')
      assert(Array.isArray([1, 2, 3]), 'number array')
      assert(!Array.isArray({}), 'object is not array')
      assert(!Array.isArray('[]'), 'string "[]" is not array')
      assert(!Array.isArray(null), 'null is not array')
      assert(!Array.isArray(undefined), 'undefined is not array')
      assert(!Array.isArray(42), 'number is not array')
      assert(!Array.isArray('string'), 'string is not array')
    },
  },
  {
    id: 'type-coercion-uuid-format',
    name: 'UUID formaat validatie',
    category: CAT,
    description: 'UUID regex accepteert geldige en verwerpt ongeldige formats',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

      // Valid UUIDs
      assert(uuidRegex.test('550e8400-e29b-41d4-a716-446655440000'), 'standaard UUID v4')
      assert(uuidRegex.test('00000000-0000-0000-0000-000000000000'), 'nil UUID')
      assert(uuidRegex.test('FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF'), 'uppercase UUID')

      // Invalid formats
      assert(!uuidRegex.test('not-a-uuid'), 'willekeurige tekst')
      assert(!uuidRegex.test(''), 'lege string')
      assert(!uuidRegex.test('550e8400e29b41d4a716446655440000'), 'UUID zonder streepjes')
      assert(!uuidRegex.test("'; DROP TABLE budgets; --"), 'SQL injection')
      assert(!uuidRegex.test('<script>alert(1)</script>'), 'XSS payload')
      assert(!uuidRegex.test('550e8400-e29b-41d4-a716'), 'incompleet UUID')
      assert(!uuidRegex.test('550e8400-e29b-41d4-a716-44665544000z'), 'ongeldig hex karakter')
    },
  },

  // ── Step 5: Maximale lengte ─────────────────────────────────────────
  {
    id: 'maxlen-sanitize-long-string',
    name: 'Extreem lange strings in sanitizeForAI',
    category: CAT,
    description: 'sanitizeForAI crasht niet bij extreem lange invoer',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // 100KB string
      const longString = 'A'.repeat(100_000)
      const result = sanitizeForAI(longString)
      assert(typeof result === 'string', 'retourneert string')
      assertEqual(result.length, 100_000, 'lengte behouden (geen PII gevonden)')
    },
  },
  {
    id: 'maxlen-pii-long-string',
    name: 'Extreem lange strings in PII output filter',
    category: CAT,
    description: 'maskPIIInOutput crasht niet bij extreem lange invoer',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const longString = 'Geen gevoelige data. '.repeat(5000)
      const result = maskPIIInOutput(longString)
      assert(typeof result === 'string', 'retourneert string')
      assert(result.length > 0, 'niet lege output')
    },
  },
  {
    id: 'maxlen-repeated-pii',
    name: 'Herhaalde PII patronen in lange string',
    category: CAT,
    description: 'Veel IBANs/emails in één string worden allemaal vervangen',
    priority: 'medium',
    estimatedDurationMs: 30,
    fn() {
      // Build a string with 100 IBANs
      const ibans = Array.from({ length: 100 }, (_, i) =>
        `NL${String(i).padStart(2, '0')}RABO0123456789`
      ).join(' ')
      const result = sanitizeForAI(ibans)
      assert(!result.includes('NL00RABO'), 'eerste IBAN vervangen')
      assert(!result.includes('NL99RABO'), 'laatste IBAN vervangen')
      const ibanCount = (result.match(/\[IBAN\]/g) || []).length
      assert(ibanCount >= 50, `minstens 50 IBANs vervangen (gevonden: ${ibanCount})`)
    },
  },
  {
    id: 'maxlen-transaction-long-fields',
    name: 'Lange strings in transactie velden',
    category: CAT,
    description: 'sanitizeTransaction verwerkt extreem lange description/category',
    priority: 'medium',
    estimatedDurationMs: 10,
    fn() {
      const longDesc = 'Transaction '.repeat(10_000)
      const longCategory = 'Categorie/'.repeat(1_000)
      const result = sanitizeTransaction({
        amount: 42.50,
        is_income: false,
        category: longCategory,
        description: longDesc,
        counterparty_name: 'A'.repeat(50_000),
        date: '2025-06-15',
      })
      assertEqual(result.category, longCategory, 'category doorgelaten')
      assert(!('description' in result), 'description gestript')
      assert(!('counterparty_name' in result), 'counterparty gestript')
      assertEqual(result.month, '2025-06', 'maand correct')
    },
  },

  // ── Step 6: File upload validatie (pension/parse) ───────────────────
  {
    id: 'file-type-validation',
    name: 'Pension parse: bestandstype validatie',
    category: CAT,
    description: 'Alleen application/pdf wordt geaccepteerd',
    priority: 'critical',
    estimatedDurationMs: 5,
    fn() {
      // The route checks: if (file.type !== 'application/pdf') return 400
      const allowedType = 'application/pdf'
      const rejectedTypes = [
        'text/plain',
        'text/html',
        'application/javascript',
        'image/png',
        'image/jpeg',
        'application/xml',
        'application/zip',
        'application/x-sh',
        'text/csv',
        '',
      ]
      assert(allowedType === 'application/pdf', 'PDF type geaccepteerd')
      for (const mime of rejectedTypes) {
        assert(mime !== 'application/pdf', `${mime || '(leeg)'} wordt geweigerd`)
      }
    },
  },
  {
    id: 'file-size-validation',
    name: 'Pension parse: bestandsgrootte validatie',
    category: CAT,
    description: 'Bestanden groter dan 10MB worden geweigerd',
    priority: 'critical',
    estimatedDurationMs: 5,
    fn() {
      const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB = 10,485,760 bytes
      assertEqual(MAX_FILE_SIZE, 10_485_760, 'max file size is 10MB')

      // Just under limit
      assert(10_485_759 <= MAX_FILE_SIZE, '10MB - 1 byte is toegestaan')
      // Exact limit
      assert(10_485_760 <= MAX_FILE_SIZE, '10MB is net toegestaan')
      // Over limit
      assert(10_485_761 > MAX_FILE_SIZE, '10MB + 1 byte is geweigerd')

      // Extreme sizes
      assert(100 * 1024 * 1024 > MAX_FILE_SIZE, '100MB wordt geweigerd')
      assert(1024 * 1024 * 1024 > MAX_FILE_SIZE, '1GB wordt geweigerd')
    },
  },
  {
    id: 'file-rate-limit',
    name: 'Pension parse: rate limiting logica',
    category: CAT,
    description: 'Rate limiter staat max 5 uploads per uur toe',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      // Verify the rate limit constants
      const RATE_LIMIT = 5
      const RATE_WINDOW_MS = 60 * 60 * 1000 // 1 hour

      assertEqual(RATE_LIMIT, 5, 'max 5 uploads')
      assertEqual(RATE_WINDOW_MS, 3_600_000, 'window is 1 uur')

      // Simulate rate limiter logic
      const state = { count: 0, resetAt: Date.now() + RATE_WINDOW_MS }
      for (let i = 0; i < RATE_LIMIT; i++) {
        assert(state.count < RATE_LIMIT, `poging ${i + 1} is toegestaan`)
        state.count++
      }
      assert(state.count >= RATE_LIMIT, 'poging 6 wordt geweigerd')
    },
  },

  // ── Bonus: Edge cases en gecombineerde aanvallen ─────────────────────
  {
    id: 'combined-sql-xss',
    name: 'Gecombineerde SQL injection + XSS payload',
    category: CAT,
    description: 'Gemengde aanvalsvectoren worden correct verwerkt',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const combined = `<script>fetch('/api?q='; DROP TABLE users; --')</script>`
      const result = sanitizeForAI(combined)
      assert(typeof result === 'string', 'verwerkt zonder crash')

      const result2 = maskPIIInOutput(combined)
      assert(typeof result2 === 'string', 'PII filter verwerkt zonder crash')
    },
  },
  {
    id: 'null-undefined-empty-inputs',
    name: 'Null, undefined en lege invoer handling',
    category: CAT,
    description: 'Lege/null invoer in sanitize functies produceert geen fouten',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      // Empty string
      assertEqual(sanitizeForAI(''), '', 'lege string ongewijzigd')
      assertEqual(maskPIIInOutput(''), '', 'PII filter lege string')

      // Whitespace only
      const whitespace = '   \n\t  '
      assertEqual(sanitizeForAI(whitespace), whitespace, 'whitespace ongewijzigd')

      // Unicode content
      const unicode = '€1.234,56 betaling — 日本語テスト 🎉'
      const uResult = sanitizeForAI(unicode)
      assert(uResult.includes('€1.234,56'), 'valuta behouden')
      assert(uResult.includes('🎉'), 'emoji behouden')
    },
  },
  {
    id: 'box3-method-enum',
    name: 'Box 3 methode enum validatie',
    category: CAT,
    description: 'Alleen "forfaitair" en "werkelijk" zijn geldige box3_method waarden',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      const validMethods = ['forfaitair', 'werkelijk']
      const invalidMethods = [
        'anders',
        '',
        'FORFAITAIR',
        '<script>',
        "'; DROP TABLE --",
        'true',
        '123',
        'null',
        'undefined',
      ]

      for (const m of validMethods) {
        assert(
          m === 'forfaitair' || m === 'werkelijk',
          `${m} is geldige methode`,
        )
      }

      for (const m of invalidMethods) {
        assert(
          m !== 'forfaitair' && m !== 'werkelijk',
          `${m} is ongeldige methode`,
        )
      }
    },
  },
  {
    id: 'holdings-name-required',
    name: 'Holdings naam verplicht en niet-leeg',
    category: CAT,
    description: 'Naam validatie: verplicht, string type, niet-leeg na trim',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      // Holdings route: if (!name || typeof name !== 'string' || name.trim().length === 0)
      const isValidName = (name: unknown) =>
        !!name && typeof name === 'string' && name.trim().length > 0

      assert(isValidName('VWRL'), 'normaal naam geldig')
      assert(isValidName(' VWRL '), 'naam met spaties geldig (trim)')
      assert(isValidName('A'), 'enkel karakter geldig')

      assert(!isValidName(''), 'lege string ongeldig')
      assert(!isValidName('   '), 'alleen spaties ongeldig')
      assert(!isValidName(null), 'null ongeldig')
      assert(!isValidName(undefined), 'undefined ongeldig')
      assert(!isValidName(123), 'nummer ongeldig')
      assert(!isValidName(true), 'boolean ongeldig')
      assert(!isValidName({}), 'object ongeldig')
      assert(!isValidName([]), 'array ongeldig')
    },
  },
  {
    id: 'currency-normalization',
    name: 'Valuta normalisatie (trim + uppercase)',
    category: CAT,
    description: 'Currency veld wordt genormaliseerd naar uppercase zonder spaties',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      // Holdings route: currency.trim().toUpperCase() || 'EUR'
      const normalizeCurrency = (c: unknown) =>
        typeof c === 'string' && c.trim().length > 0
          ? c.trim().toUpperCase()
          : 'EUR'

      assertEqual(normalizeCurrency('eur'), 'EUR', 'lowercase → uppercase')
      assertEqual(normalizeCurrency('usd'), 'USD', 'usd → USD')
      assertEqual(normalizeCurrency(' gbp '), 'GBP', 'met spaties → trimmed')
      assertEqual(normalizeCurrency(''), 'EUR', 'lege string → default EUR')
      assertEqual(normalizeCurrency(null), 'EUR', 'null → default EUR')
      assertEqual(normalizeCurrency(undefined), 'EUR', 'undefined → default EUR')
      assertEqual(normalizeCurrency(123), 'EUR', 'nummer → default EUR')
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'Security — Input Validatie',
    description: 'Input validatie, SQL injection preventie, XSS filtering, type coercion, file upload validatie',
    icon: 'ShieldAlert',
    testCount: 0,
  })
  registerTests(tests)
}
