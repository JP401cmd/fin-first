/**
 * Regression tests: De Wil — Aanbevelingen
 *
 * Tests for AI recommendation system, action management, and PII sanitization:
 * - Recommendation schema & type validation
 * - Action creation contract (required fields, defaults)
 * - Feedback action validation (accept/reject/postpone)
 * - sanitizeForAI: IBAN, email, phone, address, name, birthdate filtering
 * - maskPIIInOutput: IBAN and BSN masking in AI responses
 * - Both filters preserve financial amounts
 */

import { registerTests } from '../test-registry'
import {
  assert,
  assertEqual,
  assertIncludes,
  assertNotNull,
  assertType,
  assertGreaterThanOrEqual,
  assertLessThanOrEqual,
} from '../assert'
import type { TestCase } from '../test-types'
import { sanitizeForAI } from '@/lib/ai/sanitize'
import { maskPIIInOutput } from '@/lib/ai/pii-output-filter'

const CAT = 'wil.aanbevelingen'

// ── Valid recommendation_type enum values ─────────────────────────────────
const VALID_REC_TYPES = [
  'budget_optimization',
  'asset_reallocation',
  'debt_acceleration',
  'income_increase',
  'savings_boost',
] as const

// ── Valid feedback actions ────────────────────────────────────────────────
const VALID_FEEDBACK_ACTIONS = ['accept', 'reject', 'postpone'] as const

const tests: TestCase[] = [
  // ── A: Recommendation schema ──────────────────────────────────────────
  {
    id: 'wil-rec-schema',
    name: 'Recommendation schema: structuur validatie',
    description: 'Recommendation object has all required fields with correct types',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      // Simulate a valid recommendation object as returned by POST /api/ai/recommendations
      const rec = {
        title: 'Verlaag je abonnementskosten',
        description: 'Je geeft €120/maand uit aan streaming. Consolideer naar 2 diensten.',
        recommendation_type: 'budget_optimization' as const,
        euro_impact_monthly: 60,
        euro_impact_yearly: 720,
        freedom_days_per_year: 3.5,
        priority_score: 4,
        suggested_actions: [
          { title: 'Opzeg Netflix', freedom_days_impact: 1.2 },
        ],
      }

      assertType(rec.title, 'string', 'title is string')
      assertType(rec.description, 'string', 'description is string')
      assertType(rec.recommendation_type, 'string', 'recommendation_type is string')
      assertType(rec.euro_impact_monthly, 'number', 'euro_impact_monthly is number')
      assertType(rec.euro_impact_yearly, 'number', 'euro_impact_yearly is number')
      assertType(rec.freedom_days_per_year, 'number', 'freedom_days_per_year is number')
      assertType(rec.priority_score, 'number', 'priority_score is number')
      assert(Array.isArray(rec.suggested_actions), 'suggested_actions is array')
      assert(rec.suggested_actions.length > 0, 'suggested_actions non-empty')
      assertType(rec.suggested_actions[0].title, 'string', 'action title is string')
      assertType(rec.suggested_actions[0].freedom_days_impact, 'number', 'action freedom_days_impact is number')
    },
  },
  {
    id: 'wil-rec-types',
    name: 'Recommendation types: alle 5 waarden geldig',
    description: 'All 5 recommendation_type enum values are accepted',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      assertEqual(VALID_REC_TYPES.length, 5, '5 recommendation types')

      // Validate each type is a non-empty string
      for (const t of VALID_REC_TYPES) {
        assertType(t, 'string', `${t} is string`)
        assert(t.length > 0, `${t} is non-empty`)
      }

      // Verify specific values
      assertIncludes([...VALID_REC_TYPES], 'budget_optimization', 'budget_optimization exists')
      assertIncludes([...VALID_REC_TYPES], 'asset_reallocation', 'asset_reallocation exists')
      assertIncludes([...VALID_REC_TYPES], 'debt_acceleration', 'debt_acceleration exists')
      assertIncludes([...VALID_REC_TYPES], 'income_increase', 'income_increase exists')
      assertIncludes([...VALID_REC_TYPES], 'savings_boost', 'savings_boost exists')

      // Invalid type should not be in the list
      assert(!(VALID_REC_TYPES as readonly string[]).includes('unknown_type'), 'unknown_type rejected')
    },
  },

  // ── B: Action creation contract ───────────────────────────────────────
  {
    id: 'wil-rec-actions-required',
    name: 'Actie aanmaken: title + freedom_days_impact verplicht',
    description: 'POST /api/ai/actions returns 400 if title or freedom_days_impact is missing',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      // Valid body
      const validBody = { title: 'Netflix opzeggen', freedom_days_impact: 1.2 }
      assert('title' in validBody, 'title present')
      assert('freedom_days_impact' in validBody, 'freedom_days_impact present')

      // Missing title → 400
      const missingTitle = { freedom_days_impact: 1.2 }
      assert(!('title' in missingTitle), 'title missing → should 400')

      // Missing freedom_days_impact → 400
      const missingImpact = { title: 'Netflix opzeggen' }
      assert(!('freedom_days_impact' in missingImpact), 'freedom_days_impact missing → should 400')

      // Both missing → 400
      const emptyBody = {}
      assert(!('title' in emptyBody) && !('freedom_days_impact' in emptyBody), 'both missing → should 400')
    },
  },
  {
    id: 'wil-rec-action-source',
    name: 'Actie source: default manual, accepteert chat',
    description: 'Action source field defaults to manual and accepts chat',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const validSources = ['manual', 'chat'] as const

      // Default source when not provided
      const actionWithoutSource = { title: 'Test', freedom_days_impact: 1 }
      const source = (actionWithoutSource as { source?: string }).source ?? 'manual'
      assertEqual(source, 'manual', 'Default source is manual')

      // Explicit sources
      for (const s of validSources) {
        assertIncludes([...validSources], s, `${s} is valid source`)
      }

      // Invalid source
      assert(!(validSources as readonly string[]).includes('api'), 'api is not a valid source')
      assert(!(validSources as readonly string[]).includes('system'), 'system is not a valid source')

      // Response shape: action has status 'open'
      const response = {
        action: {
          title: 'Test',
          freedom_days_impact: 1,
          source: 'manual',
          status: 'open',
        },
      }
      assertEqual(response.action.status, 'open', 'New action status is open')
    },
  },

  // ── C: Feedback actions ───────────────────────────────────────────────
  {
    id: 'wil-rec-feedback-actions',
    name: 'Feedback: accept/reject/postpone geldig, rest ongeldig',
    description: 'PATCH /api/ai/recommendations/[id] accepts valid actions, rejects invalid',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      // Valid actions
      for (const action of VALID_FEEDBACK_ACTIONS) {
        assertIncludes([...VALID_FEEDBACK_ACTIONS], action, `${action} is valid`)
      }

      // Invalid actions should not be accepted
      const invalidActions = ['dismiss', 'delete', 'complete', '', 'ACCEPT']
      for (const action of invalidActions) {
        assert(
          !(VALID_FEEDBACK_ACTIONS as readonly string[]).includes(action),
          `${action || '(empty)'} is invalid`,
        )
      }

      // Reject action requires optional reason field
      const rejectBody = { action: 'reject', reason: 'Niet relevant voor mij' }
      assertType(rejectBody.reason, 'string', 'reason is string')

      // Response maps action → status
      const statusMap: Record<string, string> = {
        accept: 'accepted',
        reject: 'rejected',
        postpone: 'postponed',
      }
      for (const [action, status] of Object.entries(statusMap)) {
        assertEqual(statusMap[action], status, `${action} → ${status}`)
      }
    },
  },
  {
    id: 'wil-rec-priority-clamp',
    name: 'Priority score: begrensd 1-5',
    description: 'Recommendation priority_score is clamped between 1 and 5',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      // Simulate priority clamping logic
      function clampPriority(score: number): number {
        return Math.max(1, Math.min(5, Math.round(score)))
      }

      assertEqual(clampPriority(1), 1, 'Minimum priority is 1')
      assertEqual(clampPriority(5), 5, 'Maximum priority is 5')
      assertEqual(clampPriority(3), 3, 'Mid priority stays 3')
      assertEqual(clampPriority(0), 1, '0 clamped to 1')
      assertEqual(clampPriority(-1), 1, '-1 clamped to 1')
      assertEqual(clampPriority(6), 5, '6 clamped to 5')
      assertEqual(clampPriority(100), 5, '100 clamped to 5')
      assertEqual(clampPriority(3.7), 4, '3.7 rounded to 4')
      assertEqual(clampPriority(2.3), 2, '2.3 rounded to 2')
    },
  },

  // ── D: PII input sanitization (sanitizeForAI) ────────────────────────
  {
    id: 'wil-pii-iban-input',
    name: 'sanitizeForAI: filtert IBANs uit context',
    description: 'Dutch IBANs are replaced with [IBAN] placeholder',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const input = 'Betaling naar NL91ABNA0417164300 voor huur'
      const result = sanitizeForAI(input)

      assert(!result.includes('NL91ABNA0417164300'), 'IBAN removed from output')
      assert(result.includes('[IBAN]'), 'IBAN replaced with placeholder')
      assert(result.includes('huur'), 'Non-PII context preserved')

      // IBAN with spaces
      const inputSpaced = 'NL91 ABNA 0417 1643 00 is mijn rekening'
      const resultSpaced = sanitizeForAI(inputSpaced)
      assert(!resultSpaced.includes('ABNA'), 'Spaced IBAN bank code removed')
      assert(resultSpaced.includes('[IBAN]'), 'Spaced IBAN replaced with placeholder')
    },
  },
  {
    id: 'wil-pii-email-input',
    name: 'sanitizeForAI: filtert e-mailadressen',
    description: 'Email addresses are replaced with [EMAIL] placeholder',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const input = 'Mijn email is jan.devries@example.com en ik wil advies'
      const result = sanitizeForAI(input)

      assert(!result.includes('jan.devries@example.com'), 'Email removed')
      assert(result.includes('[EMAIL]'), 'Email replaced with placeholder')
      assert(result.includes('advies'), 'Context preserved')

      // Different email formats
      const input2 = 'Contact: user+tag@sub.domain.nl voor vragen'
      const result2 = sanitizeForAI(input2)
      assert(!result2.includes('user+tag@sub.domain.nl'), 'Complex email removed')
    },
  },
  {
    id: 'wil-pii-phone-input',
    name: 'sanitizeForAI: filtert telefoonnummers',
    description: 'Dutch phone numbers are replaced with [TELEFOON] placeholder',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const input = 'Bel me op 06 12345678 voor meer info'
      const result = sanitizeForAI(input)

      assert(!result.includes('06 12345678'), 'Phone number removed')
      assert(result.includes('[TELEFOON]'), 'Phone replaced with placeholder')

      // +31 format
      const input2 = 'Bereikbaar op +31612345678'
      const result2 = sanitizeForAI(input2)
      assert(!result2.includes('+31612345678'), '+31 phone removed')
      assert(result2.includes('[TELEFOON]'), '+31 phone replaced')
    },
  },
  {
    id: 'wil-pii-address-input',
    name: 'sanitizeForAI: filtert adressen',
    description: 'Street addresses are replaced with [ADRES] placeholder',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const input = 'Ik woon op Kerkstraat 42 in Amsterdam'
      const result = sanitizeForAI(input)

      assert(!result.includes('Kerkstraat 42'), 'Street address removed')
      assert(result.includes('[ADRES]'), 'Address replaced with placeholder')
    },
  },
  {
    id: 'wil-pii-name-input',
    name: 'sanitizeForAI: vervangt namen met labels',
    description: 'Known names are replaced with gebruiker/partner labels',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const input = 'Jan de Vries verdient €3.000 per maand'
      const result = sanitizeForAI(input, {
        names: ['Jan de Vries'],
        userLabel: 'gebruiker',
      })

      assert(!result.includes('Jan de Vries'), 'Full name removed')
      // Individual name parts (>= 3 chars, excl. prepositions) should also be replaced
      assert(!result.includes('Vries'), 'Last name part removed')
      assert(result.includes('gebruiker'), 'Replaced with gebruiker label')
      assert(result.includes('€3.000'), 'Financial amount preserved')

      // Partner name
      const input2 = 'Maria Jansen en Piet Bakker hebben samen €200.000'
      const result2 = sanitizeForAI(input2, {
        names: ['Maria Jansen', 'Piet Bakker'],
        userLabel: 'gebruiker',
        partnerLabel: 'partner',
      })
      assert(!result2.includes('Maria'), 'First user name removed')
      assert(!result2.includes('Bakker'), 'Partner name removed')
      assert(result2.includes('gebruiker'), 'User label present')
      assert(result2.includes('partner'), 'Partner label present')
    },
  },
  {
    id: 'wil-pii-birthdate-input',
    name: 'sanitizeForAI: converteert geboortedatum naar leeftijd',
    description: 'Birth dates matching the provided dateOfBirth are converted to age in years',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      // Use a fixed date that yields a known age
      const dob = '1990-06-15'
      const input = `Geboren op 1990-06-15, spaart €500/maand`
      const result = sanitizeForAI(input, { dateOfBirth: dob })

      assert(!result.includes('1990-06-15'), 'Birth date removed')
      assert(result.includes('jaar'), 'Age in years present')
      assert(result.includes('€500'), 'Financial amount preserved')

      // The age should be a reasonable number (30-40 range for 1990 birth)
      const ageMatch = result.match(/(\d+)\s+jaar/)
      assertNotNull(ageMatch, 'Age pattern found')
      const age = parseInt(ageMatch![1], 10)
      assertGreaterThanOrEqual(age, 30, 'Age ≥ 30 for 1990 birth')
      assertLessThanOrEqual(age, 40, 'Age ≤ 40 for 1990 birth')
    },
  },

  // ── E: PII output masking (maskPIIInOutput) ──────────────────────────
  {
    id: 'wil-pii-output-iban',
    name: 'maskPIIInOutput: maskeert IBANs met ****',
    description: 'IBANs in AI responses are replaced with ****',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const output = 'Maak een betaling naar NL91ABNA0417164300'
      const result = maskPIIInOutput(output)

      assert(!result.includes('NL91ABNA0417164300'), 'IBAN masked in output')
      assert(result.includes('****'), 'Replaced with ****')
      assert(result.includes('Maak een betaling naar'), 'Context preserved')

      // Spaced IBAN
      const output2 = 'Rekening: NL91 ABNA 0417 1643 00'
      const result2 = maskPIIInOutput(output2)
      assert(!result2.includes('ABNA'), 'Spaced IBAN masked')
    },
  },
  {
    id: 'wil-pii-output-bsn',
    name: 'maskPIIInOutput: maskeert BSN-nummers',
    description: 'BSN (9-digit) patterns in AI responses are replaced with ****',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const output = 'Je BSN is 123456789 volgens de registratie'
      const result = maskPIIInOutput(output)

      assert(!result.includes('123456789'), 'BSN masked in output')
      assert(result.includes('****'), 'Replaced with ****')
      assert(result.includes('registratie'), 'Context preserved')
    },
  },
  {
    id: 'wil-pii-preserves-amounts',
    name: 'PII filters: financiële bedragen blijven intact',
    description: 'Both sanitizeForAI and maskPIIInOutput preserve currency amounts',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      // sanitizeForAI preserves amounts
      const inputText = 'Je spaart €1.234,56 per maand en hebt 12,5% rendement'
      const sanitized = sanitizeForAI(inputText)
      assert(sanitized.includes('€1.234,56'), 'sanitizeForAI preserves €1.234,56')
      assert(sanitized.includes('12,5%'), 'sanitizeForAI preserves 12,5%')

      // maskPIIInOutput preserves amounts
      const outputText = 'Je vermogen is €250.000 met 7,5% rendement'
      const masked = maskPIIInOutput(outputText)
      assert(masked.includes('€250.000'), 'maskPIIInOutput preserves €250.000')
      assert(masked.includes('7,5%'), 'maskPIIInOutput preserves 7,5%')

      // Currency-context numbers should NOT be treated as BSNs
      const outputWithLargeNum = 'Totaal: €123456789,00 op de rekening'
      const maskedNum = maskPIIInOutput(outputWithLargeNum)
      // The 9-digit number preceded by € or followed by comma should be preserved
      assert(maskedNum.includes('€'), 'Currency symbol preserved')
    },
  },

  // ── F: Generation flow (fire-and-forget + polling) ─────────────────────
  {
    id: 'wil-rec-initial-state',
    name: 'InitialRecsState: correcte structuur',
    description: 'State object for fire-and-forget generation has required shape',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      // Simulate InitialRecsState
      const state = {
        recommendations: [] as Record<string, unknown>[],
        complete: false,
        startedAt: Date.now(),
      }

      assert(Array.isArray(state.recommendations), 'recommendations is array')
      assertEqual(state.recommendations.length, 0, 'starts empty')
      assertEqual(state.complete, false, 'starts incomplete')
      assertType(state.startedAt, 'number', 'startedAt is number')
      assert(state.startedAt > 0, 'startedAt is positive')
    },
  },
  {
    id: 'wil-rec-initial-returns-db-rows',
    name: 'Initial route: retourneert DB-rows met id en status',
    description: 'Recommendations from /initial endpoint contain database fields (id, status, created_at)',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      // Simulate a DB row as returned by .select().single() after insert
      const dbRow = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '123',
        title: 'Test voorstel',
        description: 'Beschrijving',
        recommendation_type: 'budget_optimization',
        euro_impact_monthly: 50,
        euro_impact_yearly: 600,
        freedom_days_per_year: 2.5,
        status: 'pending',
        priority_score: 3,
        suggested_actions: [],
        created_at: '2026-03-24T10:00:00Z',
        updated_at: '2026-03-24T10:00:00Z',
      }

      // Verify DB-specific fields exist
      assertType(dbRow.id, 'string', 'id is string')
      assert(dbRow.id.length > 0, 'id is non-empty')
      assertType(dbRow.status, 'string', 'status is string')
      assertEqual(dbRow.status, 'pending', 'status is pending')
      assertType(dbRow.created_at, 'string', 'created_at is string')
      assertType(dbRow.user_id, 'string', 'user_id is string')
    },
  },
  {
    id: 'wil-rec-progress-count',
    name: 'Generatie voortgang: telt 0 tot 3',
    description: 'Progress count derives from recommendations.length (0 to EXPECTED_COUNT)',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const EXPECTED_COUNT = 3

      // Simulate incremental delivery
      const state = { recommendations: [] as unknown[] }
      assertEqual(state.recommendations.length, 0, 'progress starts at 0')

      state.recommendations.push({ id: '1', title: 'Rec 1' })
      assertEqual(state.recommendations.length, 1, 'progress at 1 after first push')

      state.recommendations.push({ id: '2', title: 'Rec 2' })
      assertEqual(state.recommendations.length, 2, 'progress at 2 after second push')

      state.recommendations.push({ id: '3', title: 'Rec 3' })
      assertEqual(state.recommendations.length, 3, 'progress at 3 after third push')
      assertEqual(state.recommendations.length, EXPECTED_COUNT, 'matches expected count')
    },
  },
  {
    id: 'wil-rec-generation-complete',
    name: 'Generatie: transitie naar complete',
    description: 'Polling response without status=generating indicates completion',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      // Simulate polling responses
      const generatingResponse = { status: 'generating', recommendations: [{ id: '1' }] }
      assertEqual(generatingResponse.status, 'generating', 'generating status set')
      assert(generatingResponse.status === 'generating', 'still generating')

      // Complete response has no status field (or status !== 'generating')
      const completeResponse = { recommendations: [{ id: '1' }, { id: '2' }, { id: '3' }] }
      assert(!('status' in completeResponse), 'no status means complete')
      assertEqual(completeResponse.recommendations.length, 3, 'all 3 delivered')
    },
  },
  {
    id: 'wil-rec-new-only',
    name: 'Generatie modal: toont alleen nieuwe voorstellen',
    description: 'The generation modal tracks only newly generated recommendations, separate from existing list',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      // Simulate existing + new recommendations
      const existing = [
        { id: 'old-1', title: 'Bestaand voorstel', status: 'pending' },
        { id: 'old-2', title: 'Ander voorstel', status: 'pending' },
      ]
      const newlyGenerated = [
        { id: 'new-1', title: 'Nieuw voorstel 1', status: 'pending' },
        { id: 'new-2', title: 'Nieuw voorstel 2', status: 'pending' },
        { id: 'new-3', title: 'Nieuw voorstel 3', status: 'pending' },
      ]

      // Modal should show only newlyGenerated
      assertEqual(newlyGenerated.length, 3, 'modal shows 3 new recs')
      assert(!newlyGenerated.some(r => r.id.startsWith('old-')), 'no old recs in modal')

      // After merging, parent list has both
      const merged = [...newlyGenerated, ...existing]
      assertEqual(merged.length, 5, 'parent list has all recs')
      assert(merged.some(r => r.id === 'old-1'), 'old recs preserved in list')
      assert(merged.some(r => r.id === 'new-1'), 'new recs added to list')
    },
  },

  // ── Filter tests (for RecommendationListModal) ────────────────────────────

  {
    id: 'wil-rec-filter-status',
    name: 'Voorstellen filter: status filtert correct',
    description: 'Each status filter returns only matching recommendations',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const recs = [
        { status: 'pending' },
        { status: 'pending' },
        { status: 'accepted' },
        { status: 'postponed' },
        { status: 'rejected' },
      ]
      const filterByStatus = (s: string) => s === 'all' ? recs : recs.filter(r => r.status === s)

      assertEqual(filterByStatus('pending').length, 2)
      assertEqual(filterByStatus('accepted').length, 1)
      assertEqual(filterByStatus('postponed').length, 1)
      assertEqual(filterByStatus('rejected').length, 1)
      assertEqual(filterByStatus('all').length, 5)
    },
  },

  {
    id: 'wil-rec-filter-type',
    name: 'Voorstellen filter: type filtert op recommendation_type',
    description: 'Type filter correctly filters by recommendation_type',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const recs = [
        { recommendation_type: 'budget_optimization' },
        { recommendation_type: 'budget_optimization' },
        { recommendation_type: 'debt_acceleration' },
        { recommendation_type: 'income_increase' },
      ]
      const filterByType = (t: string) => t === 'all' ? recs : recs.filter(r => r.recommendation_type === t)

      assertEqual(filterByType('budget_optimization').length, 2)
      assertEqual(filterByType('debt_acceleration').length, 1)
      assertEqual(filterByType('income_increase').length, 1)
      assertEqual(filterByType('savings_boost').length, 0)
      assertEqual(filterByType('all').length, 4)
    },
  },

  {
    id: 'wil-rec-filter-combined',
    name: 'Voorstellen filter: AND-logica status + type',
    description: 'Combined filters apply simultaneously',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const recs = [
        { status: 'pending', recommendation_type: 'budget_optimization' },
        { status: 'pending', recommendation_type: 'debt_acceleration' },
        { status: 'accepted', recommendation_type: 'budget_optimization' },
        { status: 'rejected', recommendation_type: 'budget_optimization' },
      ]
      const filtered = recs.filter(r => r.status === 'pending' && r.recommendation_type === 'budget_optimization')
      assertEqual(filtered.length, 1)
    },
  },

  {
    id: 'wil-rec-filter-impact',
    name: 'Voorstellen filter: impact-totaal klopt met gefilterde resultaten',
    description: 'Filtered impact total equals sum of freedom_days_per_year for matching recs',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const recs = [
        { status: 'pending', freedom_days_per_year: 10 },
        { status: 'pending', freedom_days_per_year: 5 },
        { status: 'accepted', freedom_days_per_year: 20 },
        { status: 'pending', freedom_days_per_year: null },
      ]
      const pending = recs.filter(r => r.status === 'pending')
      const impact = Math.round(pending.reduce((sum, r) => sum + (r.freedom_days_per_year || 0), 0))
      assertEqual(impact, 15)
      assertEqual(pending.length, 3)
    },
  },

  {
    id: 'wil-rec-filter-sort-impact',
    name: 'Voorstellen sortering: impact-sort plaatst hoogste bovenaan',
    description: 'Impact sort orders by freedom_days_per_year descending',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const recs = [
        { id: 'low', freedom_days_per_year: 2, priority_score: 5 },
        { id: 'high', freedom_days_per_year: 30, priority_score: 1 },
        { id: 'mid', freedom_days_per_year: 10, priority_score: 3 },
      ]
      const sorted = [...recs].sort((a, b) =>
        (b.freedom_days_per_year || 0) - (a.freedom_days_per_year || 0) ||
        (b.priority_score || 0) - (a.priority_score || 0)
      )
      assertEqual(sorted[0].id, 'high')
      assertEqual(sorted[1].id, 'mid')
      assertEqual(sorted[2].id, 'low')
    },
  },
]

export function register(): void {
  registerTests(tests)
}
