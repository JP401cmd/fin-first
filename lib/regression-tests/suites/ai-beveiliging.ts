import { registerTests } from '../test-registry'
import { assertEqual, assert } from '../assert'
import type { TestCase } from '../test-types'
import { sanitizeForAI } from '@/lib/ai/sanitize'
import { maskPIIInOutput } from '@/lib/ai/pii-output-filter'

const CAT = 'ai-beveiliging'

const tests: TestCase[] = [
  {
    id: 'ai-iban-filter', name: 'IBAN filtering', category: CAT,
    description: 'sanitizeForAI filtert Nederlandse IBANs',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      assertEqual(
        sanitizeForAI('Rekening NL99 RABO 0123 4567 89 ontvangen'),
        'Rekening [IBAN] ontvangen',
        'IBAN met spaties',
      )
      assertEqual(
        sanitizeForAI('Rekening NL99RABO0123456789 ontvangen'),
        'Rekening [IBAN] ontvangen',
        'IBAN zonder spaties',
      )
    },
  },
  {
    id: 'ai-multi-iban', name: 'Meerdere IBANs', category: CAT,
    description: 'Filtert meerdere IBANs in één string',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const r = sanitizeForAI('Van NL99RABO0123456789 naar NL12INGB9876543210')
      assertEqual(r, 'Van [IBAN] naar [IBAN]', 'meerdere IBANs')
      assert(!r.includes('NL99'), 'geen IBAN resten')
    },
  },
  {
    id: 'ai-pii-output-iban', name: 'PII output masking IBAN', category: CAT,
    description: 'maskPIIInOutput maskt IBANs met ****',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      const r = maskPIIInOutput('Je rekening NL91ABNA0417164300 is actief.')
      assertEqual(r, 'Je rekening **** is actief.', 'IBAN masked')
    },
  },
  {
    id: 'ai-pii-multi-iban', name: 'PII meerdere IBANs', category: CAT,
    description: 'Maskt meerdere IBANs in output',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const r = maskPIIInOutput('Van NL91ABNA0417164300 naar NL20INGB0001234567.')
      assert(!r.includes('NL91'), 'eerste IBAN gemaskeerd')
      assert(!r.includes('NL20'), 'tweede IBAN gemaskeerd')
    },
  },
  {
    id: 'ai-safe-text', name: 'Veilige tekst ongewijzigd', category: CAT,
    description: 'Tekst zonder PII blijft ongewijzigd',
    priority: 'medium', estimatedDurationMs: 5,
    fn() {
      const text = 'Gewone tekst zonder gevoelige data'
      assertEqual(sanitizeForAI(text), text, 'ongewijzigd')
      assertEqual(maskPIIInOutput(text), text, 'output ongewijzigd')
    },
  },
]

export function register(): void {
  registerTests(tests)
}
