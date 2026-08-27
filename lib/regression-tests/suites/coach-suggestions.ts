import { registerCategory, registerTests } from '../test-registry'
import { assert, assertEqual, assertNotNull } from '../assert'
import type { TestCase } from '../test-types'
import { authenticatedFetch } from '../server-runner'
import {
  getFirstUndismissedSuggestion,
  buildCoachCatalogForAdmin,
  parseCoachConfig,
  COACH_RULE_COUNT,
  DEFAULT_COACH_TIMING,
  DEFAULT_COACH_HEADER,
  type CoachDataGaps,
  type CoachOverrides,
} from '@/lib/coach-suggestions'

const CAT = 'coach.suggestions'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Alle data-gaten gevuld (geen gap-suggestie zou matchen). */
function fullGaps(): CoachDataGaps {
  return {
    hasBank: true,
    hasAssets: true,
    hasBudgets: true,
    hasGoals: true,
    hasDebts: true,
    hasTransactions: true,
    hasHoldings: true,
    hasHoldingsWithIsin: true,
    hasFireParams: true,
    hasLifeEvents: true,
  }
}

/** Alle data-gaten open. */
function emptyGaps(): CoachDataGaps {
  return {
    hasBank: false,
    hasAssets: false,
    hasBudgets: false,
    hasGoals: false,
    hasDebts: false,
    hasTransactions: false,
    hasHoldings: false,
    hasHoldingsWithIsin: false,
    hasFireParams: false,
    hasLifeEvents: false,
  }
}

const NO_DISMISS = new Set<string>()

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── 1. Catalogus-structuur ─────────────────────────────────────────────
  {
    id: 'coach-catalog-structure',
    name: 'Coach-catalogus heeft de juiste structuur en omvang',
    category: CAT,
    description: 'buildCoachCatalogForAdmin retourneert COACH_RULE_COUNT rijen met geldige velden',
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const rows = buildCoachCatalogForAdmin()
      assertEqual(rows.length, COACH_RULE_COUNT, `Catalogus bevat ${COACH_RULE_COUNT} regels`)

      for (const r of rows) {
        assert(typeof r.key === 'string' && r.key.length > 0, `key non-empty: ${r.key}`)
        assert(
          ['deferred', 'data_gap', 'path', 'default'].includes(r.layer),
          `layer geldig: ${r.key}`,
        )
        assert(typeof r.condition === 'string' && r.condition.length > 0, `condition non-empty: ${r.key}`)
        assert(typeof r.message === 'string' && r.message.length > 0, `message non-empty: ${r.key}`)
        assert(typeof r.cta === 'string' && r.cta.length > 0, `cta non-empty: ${r.key}`)
        assert(typeof r.enabled === 'boolean', `enabled boolean: ${r.key}`)
        assert(typeof r.hasOverride === 'boolean', `hasOverride boolean: ${r.key}`)
        // Zonder overrides moeten waarden gelijk zijn aan de defaults
        assertEqual(r.message, r.defaultMessage, `message == default zonder override: ${r.key}`)
        assertEqual(r.enabled, true, `enabled default true: ${r.key}`)
        assertEqual(r.hasOverride, false, `hasOverride default false: ${r.key}`)
      }
    },
  },

  // ── 2. Selectie-prioriteit: deferred > data_gap ────────────────────────
  {
    id: 'coach-priority-deferred-over-gap',
    name: 'Uitgesteld veld wint van data-gap',
    category: CAT,
    description: 'Een uitgesteld veld krijgt voorrang op een data-gap suggestie',
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // Geen bank (gap_bank zou matchen) maar ook bezittingen overgeslagen
      const gaps: CoachDataGaps = { ...emptyGaps(), hasBudgets: false, hasGoals: false }
      const s = getFirstUndismissedSuggestion(gaps, '/will', NO_DISMISS, ['assets'])
      assertNotNull(s, 'Er is een suggestie')
      assertEqual(s.key, 'deferred_assets', 'deferred_assets wint van gap_bank')
    },
  },

  // ── 3. Selectie-prioriteit: data_gap > path > default ──────────────────
  {
    id: 'coach-priority-gap-path-default',
    name: 'Data-gap > pad > default in juiste volgorde',
    category: CAT,
    description: 'Selectie valt correct terug van data-gap naar pad naar default',
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // Data-gap aanwezig → gap_bank (eerste in volgorde)
      const gap = getFirstUndismissedSuggestion(emptyGaps(), '/overzicht/cashflow/budget', NO_DISMISS, [])
      assertEqual(gap?.key, 'gap_bank', 'gap_bank (eerste data-gap) wint')

      // Geen gaps → pad-suggestie. Sinds bevinding C7 bestaat er geen
      // onvoorwaardelijke `path_budgets` meer; /overzicht/cashflow valt door
      // naar de brede /overzicht-regel.
      const path = getFirstUndismissedSuggestion(fullGaps(), '/overzicht/cashflow/budget', NO_DISMISS, [])
      assertEqual(path?.key, 'path_core', 'path_core bij volledige data op /overzicht/cashflow/budget')

      // Geen gaps, onbekend pad → de GEVULDE terugval. Sinds kaart H15 is de
      // default-laag gesplitst: "Welkom." is first-use-copy en hoort niet bij
      // een account waarvan alle gaps dicht zijn.
      const def = getFirstUndismissedSuggestion(fullGaps(), '/random-pagina', NO_DISMISS, [])
      assertEqual(def?.key, 'default_gevuld', 'default_gevuld bij onbekend pad en gevuld account')
      const leegDef = getFirstUndismissedSuggestion(emptyGaps(), '/random-pagina', new Set(['gap_bank', 'gap_assets', 'gap_debts', 'gap_budgets', 'gap_transactions', 'gap_holdings', 'gap_isin', 'gap_goals', 'gap_fire_params', 'gap_life_events']), [])
      assertEqual(leegDef?.key, 'default', 'default (welkom) blijft voor een leeg account')
    },
  },

  // ── 4. Pad-specificiteit: specifiek wint van breed ─────────────────────
  {
    id: 'coach-path-specificity',
    name: 'Specifiek pad wint van breder pad',
    category: CAT,
    description: '/overzicht/schulden matcht path_debts, niet path_core',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const s = getFirstUndismissedSuggestion(fullGaps(), '/overzicht/schulden/123', NO_DISMISS, [])
      assertEqual(s?.key, 'path_debts', 'Specifieke /overzicht/schulden-regel wint van /overzicht')
      const core = getFirstUndismissedSuggestion(fullGaps(), '/overzicht/bezittingen', NO_DISMISS, [])
      assertEqual(core?.key, 'path_core', '/overzicht/bezittingen valt terug op path_core')
    },
  },

  // ── 4b. Budget-tip is voorwaardelijk (bevinding C7) ────────────────────
  {
    id: 'coach-budget-tip-conditional',
    name: 'Budget-tip vuurt alleen zonder budgetten',
    category: CAT,
    description: 'Geen "voeg je eerste budget toe" meer voor wie al budgetten heeft',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const onlyBudgetsMissing = { ...fullGaps(), hasBudgets: false }
      const missing = getFirstUndismissedSuggestion(onlyBudgetsMissing, '/overzicht/cashflow/budget', NO_DISMISS, [])
      assertEqual(missing?.key, 'gap_budgets', 'gap_budgets vuurt zonder budgetten')

      const withBudgets = getFirstUndismissedSuggestion(fullGaps(), '/overzicht/cashflow/budget', NO_DISMISS, [])
      assert(
        withBudgets?.key !== 'gap_budgets' && withBudgets?.key !== 'path_budgets',
        `geen budget-tip voor een gebruiker mét budgetten (kreeg: ${withBudgets?.key})`,
      )
    },
  },

  // ── 5. Override past tekst toe ─────────────────────────────────────────
  {
    id: 'coach-override-applies',
    name: 'Override past message en cta toe',
    category: CAT,
    description: 'Een override op gap_bank verandert de getoonde tekst',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const overrides: CoachOverrides = {
        gap_bank: { message: 'Aangepast bericht', cta: 'Aangepaste knop' },
      }
      const s = getFirstUndismissedSuggestion(emptyGaps(), '/will', NO_DISMISS, [], overrides)
      assertEqual(s?.key, 'gap_bank', 'gap_bank geselecteerd')
      assertEqual(s?.message, 'Aangepast bericht', 'message-override toegepast')
      assertEqual(s?.cta, 'Aangepaste knop', 'cta-override toegepast')

      // Ook zichtbaar in de admin-catalogus
      const rows = buildCoachCatalogForAdmin(overrides)
      const bank = rows.find((r) => r.key === 'gap_bank')
      assertNotNull(bank, 'gap_bank in admin-catalogus')
      assertEqual(bank.message, 'Aangepast bericht', 'admin-catalogus toont override')
      assertEqual(bank.hasOverride, true, 'hasOverride true na override')
    },
  },

  // ── 6. Uitgeschakelde regel wordt overgeslagen ─────────────────────────
  {
    id: 'coach-disabled-skipped',
    name: 'Uitgeschakelde regel wordt overgeslagen',
    category: CAT,
    description: 'enabled=false op gap_bank laat selectie doorvallen naar gap_assets',
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const overrides: CoachOverrides = { gap_bank: { enabled: false } }
      // Zowel bank als bezittingen ontbreken; nieuwe gaps satisfied zodat
      // gap_assets de eerstvolgende open gap blijft.
      const gaps: CoachDataGaps = { ...fullGaps(), hasBank: false, hasAssets: false }
      const s = getFirstUndismissedSuggestion(gaps, '/will', NO_DISMISS, [], overrides)
      assertEqual(s?.key, 'gap_assets', 'gap_assets wint nadat gap_bank is uitgeschakeld')
    },
  },

  // ── 7. Weggeklikte regel wordt overgeslagen ────────────────────────────
  {
    id: 'coach-dismissed-skipped',
    name: 'Weggeklikte regel wordt overgeslagen',
    category: CAT,
    description: 'Een gedismisste key valt door naar de volgende toepasselijke regel',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const gaps: CoachDataGaps = { ...fullGaps(), hasBank: false, hasAssets: false }
      const dismissed = new Set<string>(['gap_bank'])
      const s = getFirstUndismissedSuggestion(gaps, '/will', dismissed, [])
      assertEqual(s?.key, 'gap_assets', 'gap_assets wint nadat gap_bank is weggeklikt')
    },
  },

  // ── 8. Default kan uitgeschakeld worden → null ─────────────────────────
  {
    id: 'coach-all-disabled-null',
    name: 'Geen suggestie als alles wegvalt',
    category: CAT,
    description: 'Volledige data + onbekend pad + default uitgeschakeld → null',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // Beide default-varianten uit (H15: de terugval is gesplitst).
      const overrides: CoachOverrides = {
        default: { enabled: false },
        default_gevuld: { enabled: false },
      }
      const s = getFirstUndismissedSuggestion(fullGaps(), '/random', NO_DISMISS, [], overrides)
      assertEqual(s, null, 'Geen suggestie wanneer alles wegvalt')
    },
  },

  // ── 9. parseCoachConfig: defaults bij leeg/corrupt ─────────────────────
  {
    id: 'coach-parse-defaults',
    name: 'parseCoachConfig valt terug op defaults',
    category: CAT,
    description: 'Lege, null of corrupte input levert de standaard-config',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      for (const input of [null, undefined, '', 'geen-json{', '[]']) {
        const cfg = parseCoachConfig(input as string | null | undefined)
        assertEqual(cfg.timing.delayMs, DEFAULT_COACH_TIMING.delayMs, `delayMs default voor ${JSON.stringify(input)}`)
        assertEqual(
          cfg.timing.autoDismissMs,
          DEFAULT_COACH_TIMING.autoDismissMs,
          `autoDismissMs default voor ${JSON.stringify(input)}`,
        )
        assertEqual(cfg.headerLabel, DEFAULT_COACH_HEADER, `headerLabel default voor ${JSON.stringify(input)}`)
        assert(typeof cfg.rules === 'object', 'rules is een object')
      }
    },
  },

  // ── 10. parseCoachConfig: leest waarden ────────────────────────────────
  {
    id: 'coach-parse-values',
    name: 'parseCoachConfig leest opgeslagen waarden',
    category: CAT,
    description: 'Geldige JSON-config wordt correct ingelezen',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const raw = JSON.stringify({
        rules: { gap_bank: { message: 'X', enabled: false } },
        timing: { delayMs: 2000, autoDismissMs: 30000 },
        headerLabel: 'Tip van de gids',
      })
      const cfg = parseCoachConfig(raw)
      assertEqual(cfg.timing.delayMs, 2000, 'delayMs ingelezen')
      assertEqual(cfg.timing.autoDismissMs, 30000, 'autoDismissMs ingelezen')
      assertEqual(cfg.headerLabel, 'Tip van de gids', 'headerLabel ingelezen')
      assertEqual(cfg.rules.gap_bank?.enabled, false, 'rule-override ingelezen')
    },
  },

  // ── 11. Admin API GET ──────────────────────────────────────────────────
  {
    id: 'coach-admin-get',
    name: 'GET /api/admin/coach retourneert catalogus + config',
    category: CAT,
    description: 'Admin endpoint retourneert { rules, timing, headerLabel }',
    priority: 'high',
    estimatedDurationMs: 2000,
    requiredRole: 'superadmin',
    async fn() {
      const res = await authenticatedFetch('/api/admin/coach')
      assert(res.status === 200 || res.status === 403, `Verwacht 200 of 403, kreeg ${res.status}`)

      if (res.status === 200) {
        const body = await res.json()
        assert('rules' in body && Array.isArray(body.rules), 'rules is een array')
        assertEqual(body.rules.length, COACH_RULE_COUNT, `rules bevat ${COACH_RULE_COUNT} regels`)
        assert('timing' in body && typeof body.timing.delayMs === 'number', 'timing.delayMs aanwezig')
        assert(typeof body.headerLabel === 'string', 'headerLabel aanwezig')
      }
    },
  },

  // ── 12. Admin API PUT slaat op + roundtrip ─────────────────────────────
  {
    id: 'coach-admin-put-roundtrip',
    name: 'PUT /api/admin/coach slaat overrides + timing op',
    category: CAT,
    description: 'PUT met override en timing; GET bevestigt dat het is toegepast',
    priority: 'high',
    estimatedDurationMs: 3000,
    requiredRole: 'superadmin',
    async fn() {
      const putRes = await authenticatedFetch('/api/admin/coach', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rules: { gap_bank: { message: 'Test bank-bericht', enabled: false } },
          timing: { delayMs: 2500, autoDismissMs: 30000 },
          headerLabel: 'Test-coach',
        }),
      })
      assert(putRes.status === 200 || putRes.status === 403, `Verwacht 200 of 403, kreeg ${putRes.status}`)

      if (putRes.status === 200) {
        const putBody = await putRes.json()
        assertEqual(putBody.success, true, 'PUT retourneert success: true')

        const getRes = await authenticatedFetch('/api/admin/coach')
        assertEqual(getRes.status, 200, 'GET na PUT = 200')
        const getBody = await getRes.json()

        const bank = getBody.rules.find((r: { key: string }) => r.key === 'gap_bank')
        assertNotNull(bank, 'gap_bank gevonden')
        assertEqual(bank.message, 'Test bank-bericht', 'message-override toegepast')
        assertEqual(bank.enabled, false, 'enabled=false toegepast')
        assertEqual(getBody.timing.delayMs, 2500, 'delayMs opgeslagen')
        assertEqual(getBody.headerLabel, 'Test-coach', 'headerLabel opgeslagen')

        // Cleanup: terug naar defaults
        await authenticatedFetch('/api/admin/coach', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rules: {},
            timing: { delayMs: DEFAULT_COACH_TIMING.delayMs, autoDismissMs: DEFAULT_COACH_TIMING.autoDismissMs },
            headerLabel: DEFAULT_COACH_HEADER,
          }),
        })
      }
    },
  },

  // ── 13. Admin API PUT valideert ────────────────────────────────────────
  {
    id: 'coach-admin-put-validation',
    name: 'PUT /api/admin/coach valideert rules',
    category: CAT,
    description: 'PUT zonder rules retourneert 400 (of 403 zonder toegang)',
    priority: 'high',
    estimatedDurationMs: 2000,
    requiredRole: 'superadmin',
    async fn() {
      const res = await authenticatedFetch('/api/admin/coach', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timing: { delayMs: 1000 } }),
      })
      assert(res.status === 400 || res.status === 403, `Verwacht 400 of 403, kreeg ${res.status}`)
      if (res.status === 400) {
        const body = await res.json()
        assert('error' in body, 'Error-response bevat error-veld')
      }
    },
  },
]

// ── Register ────────────────────────────────────────────────────────────────

export function register() {
  registerCategory({
    id: CAT,
    label: 'Coach-meldingen',
    description:
      'CoachBubble-suggesties: catalogus, selectie-prioriteit, overrides, disable/dismiss, config-parsing en admin-API',
    testCount: 0,
  })
  registerTests(tests)
}
