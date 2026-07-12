import { registerTests } from '../test-registry'
import { assertEqual, assert } from '../assert'
import type { TestCase } from '../test-types'
import { sanitizeForAI } from '@/lib/ai/sanitize'
import { maskPIIInOutput } from '@/lib/ai/pii-output-filter'
import {
  scanAiCallsites,
  importsGenerationFn,
  importsSanitizeHelper,
  AI_CALLSITE_ALLOWLIST,
  collectScannedFiles,
} from '@/lib/ai/ai-callsite-scan'
import * as fs from 'fs'
import * as path from 'path'

const CAT = 'security.ai-beveiliging'

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

  // ── Guardrail: statische sanitize-scan over alle AI-callsites (ADR 0035) ──
  {
    id: 'ai-callsite-guardrail', name: 'AI-callsites sanitizen input', category: CAT,
    description: 'Elke generatie-callsite importeert sanitizeForAI/sanitizeTransactions of staat op de gemotiveerde allowlist',
    priority: 'critical', estimatedDurationMs: 40,
    fn() {
      const violations = scanAiCallsites()
      assert(
        violations.length === 0,
        `Ongesanitizede AI-callsite(s) gevonden: ${violations.map((v) => v.file).join(', ')}. ` +
          'Voeg sanitizeForAI/sanitizeTransactions toe of motiveer in AI_CALLSITE_ALLOWLIST.',
      )
    },
  },
  {
    id: 'ai-callsite-detector', name: 'Scanner detecteert ongesanitizede callsite', category: CAT,
    description: 'importsGenerationFn/importsSanitizeHelper herkennen een dummy correct (vangnet tegen een stille scanner)',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const bad = "import { generateObject } from 'ai'\nconst x = 1"
      const good = "import { generateObject } from 'ai'\nimport { sanitizeForAI } from '@/lib/ai/sanitize'"
      assert(importsGenerationFn(bad), 'generatie-import niet herkend')
      assert(!importsSanitizeHelper(bad), 'sanitize ten onrechte herkend')
      assert(importsSanitizeHelper(good), 'sanitize-import niet herkend')
      // Een dummy zonder sanitize-import zou een violation zijn als het gescand werd.
      assert(importsGenerationFn(bad) && !importsSanitizeHelper(bad), 'dummy zou violation moeten zijn')
    },
  },
  {
    id: 'ai-callsite-allowlist-integrity', name: 'Allowlist blijft actueel', category: CAT,
    description: 'Elke allowlist-entry bestaat nog én is nog een generatie-callsite (voorkomt rot)',
    priority: 'medium', estimatedDurationMs: 20,
    fn() {
      const root = process.cwd()
      for (const entry of AI_CALLSITE_ALLOWLIST) {
        const abs = path.join(root, ...entry.file.split('/'))
        assert(fs.existsSync(abs), `Allowlist-bestand bestaat niet meer: ${entry.file}`)
        const src = fs.readFileSync(abs, 'utf-8')
        assert(
          importsGenerationFn(src),
          `Allowlist-bestand ${entry.file} is geen generatie-callsite meer — verwijder de entry.`,
        )
        assert(entry.reason.trim().length > 10, `Allowlist-entry ${entry.file} mist een motivatie.`)
      }
      // Sanity: de scan vindt daadwerkelijk bestanden (anders is de scope stuk).
      assert(collectScannedFiles(root).length > 10, 'AI-callsite-scan vond te weinig bestanden — scope kapot?')
    },
  },
]

export function register(): void {
  registerTests(tests)
}
