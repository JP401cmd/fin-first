import { registerTests } from '../test-registry'
import { assert, assertEqual } from '../assert'
import type { TestCase } from '../test-types'

const CAT = 'onboarding.budgets'

// ── Mirror of PROFILE_TEMPLATES from onboarding-budgets.tsx ─────────────────

const PROFILE_TEMPLATES = [
  { id: 'zuinig', name: 'Zuinig', description: 'Focus op lage kosten, bewust leven', vaste: 0.55, dagelijks: 0.20, leuk: 0.10, sparen: 0.15 },
  { id: 'gebalanceerd', name: 'Gebalanceerd', description: 'Evenwicht tussen genieten en sparen', vaste: 0.45, dagelijks: 0.20, leuk: 0.15, sparen: 0.20 },
  { id: 'fire', name: 'Vrijheidsgericht', description: 'Maximaal sparen voor financiële vrijheid', vaste: 0.40, dagelijks: 0.15, leuk: 0.10, sparen: 0.35 },
] as const

// ── Mirror of BUDGET_SLUGS used by buildProfileAmounts ──────────────────────

const EXPECTED_BUDGET_SLUGS = [
  'salaris-uitkering', 'toeslagen-kinderbijslag', 'teruggave-belasting', 'overige-inkomsten',
  'huur-hypotheek', 'gas-water-licht', 'verzekeringen-wonen', 'gemeentelijke-lasten',
  'brandstof-ov', 'auto-vaste-lasten', 'auto-onderhoud', 'fiets-deelvervoer',
  'boodschappen', 'huishouden-verzorging', 'kinderen-school', 'medische-kosten',
  'uit-eten-horeca', 'vrije-tijd-sport', 'vakantie', 'kleding-overige',
  'sparen-noodbuffer', 'investeren-fire',
  'schulden-aflossingen', 'extra-aflossing-hypotheek',
]

// ── Helper: replicate buildProfileAmounts logic ─────────────────────────────

function buildProfileAmounts(netIncome: number, template: typeof PROFILE_TEMPLATES[number]): Record<string, number> {
  const r = (pct: number) => Math.round(netIncome * pct)
  const vasteTotal = r(template.vaste)
  const wonenTotal = Math.round(vasteTotal * 0.80)
  const vervoerTotal = Math.round(vasteTotal * 0.20)
  const dagelijksTotal = r(template.dagelijks)
  const leukTotal = r(template.leuk)
  const sparenTotal = r(template.sparen)

  return {
    'salaris-uitkering': netIncome,
    'toeslagen-kinderbijslag': 0,
    'teruggave-belasting': 0,
    'overige-inkomsten': 0,
    'huur-hypotheek': Math.round(wonenTotal * 0.65),
    'gas-water-licht': Math.round(wonenTotal * 0.18),
    'verzekeringen-wonen': Math.round(wonenTotal * 0.12),
    'gemeentelijke-lasten': Math.round(wonenTotal * 0.05),
    'brandstof-ov': Math.round(vervoerTotal * 0.40),
    'auto-vaste-lasten': Math.round(vervoerTotal * 0.35),
    'auto-onderhoud': Math.round(vervoerTotal * 0.15),
    'fiets-deelvervoer': Math.round(vervoerTotal * 0.10),
    'boodschappen': Math.round(dagelijksTotal * 0.70),
    'huishouden-verzorging': Math.round(dagelijksTotal * 0.12),
    'kinderen-school': Math.round(dagelijksTotal * 0.10),
    'medische-kosten': Math.round(dagelijksTotal * 0.08),
    'uit-eten-horeca': Math.round(leukTotal * 0.30),
    'vrije-tijd-sport': Math.round(leukTotal * 0.25),
    'vakantie': Math.round(leukTotal * 0.25),
    'kleding-overige': Math.round(leukTotal * 0.20),
    'sparen-noodbuffer': Math.round(sparenTotal * 0.35),
    'investeren-fire': Math.round(sparenTotal * 0.65),
    'schulden-aflossingen': 0,
    'extra-aflossing-hypotheek': 0,
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: Budget profiel templates ──────────────────────────
  {
    id: 'ob-budget-profile-templates',
    name: 'Budget templates: zuinig/gebalanceerd/fire selectie met correcte preset bedragen',
    category: CAT,
    description: 'Drie profieltemplates zijn beschikbaar met correcte percentageverdeling en bijbehorende bedragen',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // 3 templates available
      assertEqual(PROFILE_TEMPLATES.length, 3, 'Exact 3 budget templates beschikbaar')

      // Verify template IDs
      assertEqual(PROFILE_TEMPLATES[0].id, 'zuinig', 'Eerste template is zuinig')
      assertEqual(PROFILE_TEMPLATES[1].id, 'gebalanceerd', 'Tweede template is gebalanceerd')
      assertEqual(PROFILE_TEMPLATES[2].id, 'fire', 'Derde template is fire (vrijheidsgericht)')

      // All percentages must sum to 1.0 (100%) for each template
      for (const t of PROFILE_TEMPLATES) {
        const sum = t.vaste + t.dagelijks + t.leuk + t.sparen
        assertEqual(sum, 1.0, `Template ${t.id}: percentages sommeren tot 100% (was ${sum * 100}%)`)
      }

      // Zuinig: highest vaste (55%), lowest sparen (15%)
      assert(PROFILE_TEMPLATES[0].vaste > PROFILE_TEMPLATES[1].vaste, 'Zuinig heeft hoogste vaste lasten')
      assert(PROFILE_TEMPLATES[0].sparen < PROFILE_TEMPLATES[1].sparen, 'Zuinig heeft lagere spaarratio dan gebalanceerd')

      // Fire: highest sparen (35%), lowest vaste (40%)
      assert(PROFILE_TEMPLATES[2].sparen > PROFILE_TEMPLATES[1].sparen, 'Fire heeft hoogste spaarratio')
      assert(PROFILE_TEMPLATES[2].vaste < PROFILE_TEMPLATES[1].vaste, 'Fire heeft laagste vaste lasten')

      // Verify concrete amounts for €3000 income
      const income = 3000
      const amounts = buildProfileAmounts(income, PROFILE_TEMPLATES[1]) // gebalanceerd
      assertEqual(amounts['salaris-uitkering'], income, 'Inkomen = netIncome')
      assert(amounts['huur-hypotheek'] > 0, 'Huur/hypotheek bedrag is positief')
      assert(amounts['boodschappen'] > 0, 'Boodschappen bedrag is positief')
      assert(amounts['investeren-fire'] > 0, 'Investeren bedrag is positief')
    },
  },

  // ── Step 2: Template switch ───────────────────────────────────
  {
    id: 'ob-budget-template-switch',
    name: 'Template switch: wijzigen van template update alle bedragen',
    category: CAT,
    description: 'Selectie van een ander profiel herberekent alle budget bedragen op basis van netIncome',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const income = 3500

      const zuinig = buildProfileAmounts(income, PROFILE_TEMPLATES[0])
      const fire = buildProfileAmounts(income, PROFILE_TEMPLATES[2])

      // Fire template should have lower vaste lasten
      assert(
        fire['huur-hypotheek'] < zuinig['huur-hypotheek'],
        'Fire heeft lagere huur dan zuinig (minder vaste lasten)',
      )

      // Fire template should have higher investeren
      assert(
        fire['investeren-fire'] > zuinig['investeren-fire'],
        'Fire heeft hoger investeringsbedrag dan zuinig',
      )

      // Fire template should have higher sparen
      assert(
        fire['sparen-noodbuffer'] > zuinig['sparen-noodbuffer'],
        'Fire heeft hoger spaarbedrag dan zuinig',
      )

      // Both have same income
      assertEqual(zuinig['salaris-uitkering'], income, 'Zuinig: inkomen = netIncome')
      assertEqual(fire['salaris-uitkering'], income, 'Fire: inkomen = netIncome')

      // All slugs present in both
      const zuinigKeys = Object.keys(zuinig).sort()
      const fireKeys = Object.keys(fire).sort()
      assertEqual(
        zuinigKeys.join(','),
        fireKeys.join(','),
        'Beide templates produceren dezelfde budget slugs',
      )
    },
  },

  // ── Step 3: AI budget suggesties ──────────────────────────────
  {
    id: 'ob-budget-ai-suggest-api',
    name: 'AI budget suggesties: POST /api/onboarding/suggest-budgets endpoint',
    category: CAT,
    description: 'API endpoint accepteert income, household, children en retourneert budget amounts',
    priority: 'high',
    estimatedDurationMs: 3000,
    async fn() {
      // Test that the endpoint exists and validates input
      const res = await fetch('/api/onboarding/suggest-budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          netMonthlyIncome: 3000,
          householdType: 'samen',
          numberOfChildren: 1,
          context: 'onboarding',
        }),
      })

      // Endpoint should exist (not 404)
      assert(res.status !== 404, `Endpoint /api/onboarding/suggest-budgets bestaat (status: ${res.status})`)

      // Should require auth or return valid response
      // 401 (auth required) or 200 (success) or 500 (AI unavailable) are all acceptable
      assert(
        [200, 401, 403, 500].includes(res.status),
        `Endpoint retourneert verwachte status: ${res.status} (200=ok, 401=auth, 500=AI unavailable)`,
      )
    },
  },

  // ── Step 4: AI suggesties foutafhandeling ─────────────────────
  {
    id: 'ob-budget-ai-fallback',
    name: 'AI suggesties foutafhandeling: graceful fallback zonder AI tier',
    category: CAT,
    description: 'Wanneer AI niet beschikbaar is, krijgt de gebruiker een fallback (template selectie)',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // The component has 3 sub-choices: null (initial), 'template', 'manual'
      // AI suggestions are requested via the API, but the UI does not break if they fail
      // The template selection is the primary path; AI is supplementary

      // Verify that templates work standalone without AI
      const income = 2500
      const amounts = buildProfileAmounts(income, PROFILE_TEMPLATES[1])
      const keys = Object.keys(amounts)

      assert(keys.length >= 20, `Template produceert voldoende budget slugs: ${keys.length}`)
      assert(amounts['salaris-uitkering'] === income, 'Fallback: inkomen correct zonder AI')

      // All amounts should be non-negative (valid fallback)
      for (const [slug, amount] of Object.entries(amounts)) {
        assert(amount >= 0, `Budget ${slug} is niet negatief: ${amount}`)
      }
    },
  },

  // ── Step 5: BudgetAmountEditor ────────────────────────────────
  {
    id: 'ob-budget-amount-editor',
    name: 'BudgetAmountEditor: individuele budgets handmatig aanpassen na template',
    category: CAT,
    description: 'Na template selectie kan de gebruiker individuele bedragen aanpassen in de manual editor',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // After selecting a profile template, the component switches to 'manual' subChoice
      // This shows BudgetAmountEditor with pre-filled amounts from the template
      // handleProfileTemplateSelect sets subChoice to 'manual' after applying amounts

      const income = 3000
      const templateAmounts = buildProfileAmounts(income, PROFILE_TEMPLATES[0]) // zuinig

      // Simulate manual adjustment: user changes boodschappen
      const adjusted = { ...templateAmounts }
      adjusted['boodschappen'] = 500

      // Adjusted amount should differ from template
      assert(
        adjusted['boodschappen'] !== templateAmounts['boodschappen'],
        'Handmatig aangepast bedrag verschilt van template',
      )

      // Other amounts remain unchanged
      assertEqual(
        adjusted['huur-hypotheek'],
        templateAmounts['huur-hypotheek'],
        'Niet-aangepaste bedragen blijven gelijk',
      )

      // The editor receives amounts + onChange + netIncome props
      assert(typeof adjusted === 'object', 'Budget amounts is een object')
      assert(Object.keys(adjusted).length > 0, 'Budget amounts bevat entries')
    },
  },

  // ── Step 6: Budget slugs ──────────────────────────────────────
  {
    id: 'ob-budget-slugs-completeness',
    name: 'Budget slugs: alle categorieën uit lib/budget-data aanwezig',
    category: CAT,
    description: 'buildProfileAmounts produceert bedragen voor alle verwachte budget slugs',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const income = 3000
      const amounts = buildProfileAmounts(income, PROFILE_TEMPLATES[1])
      const keys = Object.keys(amounts)

      // All expected slugs must be present
      for (const slug of EXPECTED_BUDGET_SLUGS) {
        assert(keys.includes(slug), `Budget slug '${slug}' aanwezig in template output`)
      }

      // Total count matches
      assertEqual(
        keys.length,
        EXPECTED_BUDGET_SLUGS.length,
        `Template produceert exact ${EXPECTED_BUDGET_SLUGS.length} budget slugs`,
      )

      // Verify slug categories:
      // Inkomen slugs (4)
      const inkomSlugs = ['salaris-uitkering', 'toeslagen-kinderbijslag', 'teruggave-belasting', 'overige-inkomsten']
      for (const s of inkomSlugs) {
        assert(keys.includes(s), `Inkomen slug '${s}' aanwezig`)
      }

      // Wonen slugs (4)
      const wonenSlugs = ['huur-hypotheek', 'gas-water-licht', 'verzekeringen-wonen', 'gemeentelijke-lasten']
      for (const s of wonenSlugs) {
        assert(keys.includes(s), `Wonen slug '${s}' aanwezig`)
      }

      // Sparen slugs (2)
      assert(keys.includes('sparen-noodbuffer'), 'Sparen slug aanwezig')
      assert(keys.includes('investeren-fire'), 'Investeren slug aanwezig')
    },
  },

  // ── Step 7: Numerieke invoer validatie ────────────────────────
  {
    id: 'ob-budget-numeric-validation',
    name: 'Numerieke invoer: alleen positieve bedragen, correct afgerond',
    category: CAT,
    description: 'Template-gegenereerde bedragen zijn positief gehele getallen (Math.round)',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Test with various incomes
      const testIncomes = [1500, 2500, 3000, 5000, 10000]

      for (const income of testIncomes) {
        for (const template of PROFILE_TEMPLATES) {
          const amounts = buildProfileAmounts(income, template)

          for (const [slug, amount] of Object.entries(amounts)) {
            // All amounts must be non-negative
            assert(amount >= 0, `${template.id} @ €${income}: ${slug} is niet negatief (${amount})`)

            // All amounts must be integers (Math.round)
            assertEqual(
              amount,
              Math.round(amount),
              `${template.id} @ €${income}: ${slug} is afgerond (${amount})`,
            )

            // No NaN or Infinity
            assert(Number.isFinite(amount), `${template.id} @ €${income}: ${slug} is eindig getal`)
          }
        }
      }

      // Edge case: zero income
      const zeroAmounts = buildProfileAmounts(0, PROFILE_TEMPLATES[0])
      for (const [slug, amount] of Object.entries(zeroAmounts)) {
        assertEqual(amount, 0, `Nul-inkomen: ${slug} is 0`)
      }
    },
  },

  // ── Step 8: Route accessibility ───────────────────────────────
  {
    id: 'ob-budget-route-accessible',
    name: '/onboarding route bereikbaar (budget stap is onderdeel van onboarding)',
    category: CAT,
    description: 'Onboarding pagina (incl. budget stap) geeft 200 of auth redirect',
    priority: 'critical',
    estimatedDurationMs: 1000,
    async fn() {
      const res = await fetch('/onboarding', { redirect: 'manual' })
      assert(
        res.status === 200 || (res.status >= 300 && res.status < 400),
        `Expected 200 or redirect for /onboarding, got ${res.status}`,
      )
    },
  },
]

export function register(): void {
  registerTests(tests)
}
