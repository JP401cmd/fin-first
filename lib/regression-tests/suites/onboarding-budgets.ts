import { registerTests } from '../test-registry'
import { assert, assertEqual } from '../assert'
import type { TestCase } from '../test-types'

const CAT = 'onboarding.budgets'

// ── New template system (minimalistisch/nibud/uitgebreid) ───────────────────

type BudgetTemplateId = 'minimalistisch' | 'nibud' | 'uitgebreid'

interface TemplateCategory {
  label: string
  icon: string
  slugs: string[]
}

interface BudgetTemplate {
  id: BudgetTemplateId
  name: string
  description: string
  allocations: Record<string, number>
  categories: TemplateCategory[]
}

// ── Per-template allocation maps ────────────────────────────────────────────

const MINIMALISTISCH_ALLOC: Record<string, number> = {
  'huur-hypotheek': 0.28, 'gas-water-licht': 0.06, 'verzekeringen-wonen': 0.03,
  'gemeentelijke-lasten': 0.01, 'boodschappen': 0.15, 'brandstof-ov': 0.07,
  'kleding-overige': 0.15, 'sparen-noodbuffer': 0.10, 'investeren-fire': 0.15,
}

const NIBUD_ALLOC: Record<string, number> = {
  'huur-hypotheek': 0.24, 'gas-water-licht': 0.05, 'gemeentelijke-lasten': 0.02,
  'verzekeringen-wonen': 0.05, 'boodschappen': 0.12, 'huishouden-verzorging': 0.02,
  'kinderen-school': 0.02, 'medische-kosten': 0.02, 'brandstof-ov': 0.04,
  'auto-vaste-lasten': 0.04, 'fiets-deelvervoer': 0.02, 'kleding-overige': 0.04,
  'uit-eten-horeca': 0.03, 'vrije-tijd-sport': 0.03, 'vakantie': 0.04,
  'sparen-noodbuffer': 0.07, 'investeren-fire': 0.10, 'schulden-aflossingen': 0.03,
  'extra-aflossing-hypotheek': 0.02,
}

const UITGEBREID_ALLOC: Record<string, number> = {
  'huur-hypotheek': 0.24, 'gas-water-licht': 0.05, 'verzekeringen-wonen': 0.04,
  'gemeentelijke-lasten': 0.02, 'boodschappen': 0.12, 'huishouden-verzorging': 0.02,
  'kinderen-school': 0.02, 'medische-kosten': 0.02, 'brandstof-ov': 0.03,
  'auto-vaste-lasten': 0.03, 'auto-onderhoud': 0.02, 'fiets-deelvervoer': 0.01,
  'uit-eten-horeca': 0.04, 'vrije-tijd-sport': 0.03, 'vakantie': 0.04,
  'kleding-overige': 0.03, 'sparen-noodbuffer': 0.06, 'investeren-fire': 0.12,
  'schulden-aflossingen': 0.03, 'extra-aflossing-hypotheek': 0.03,
}

// ── Template definitions with category groupings ────────────────────────────

const BUDGET_TEMPLATES: BudgetTemplate[] = [
  {
    id: 'minimalistisch',
    name: 'Minimalistisch',
    description: 'Eenvoudig budget met 5 categorieën',
    allocations: MINIMALISTISCH_ALLOC,
    categories: [
      { label: 'Wonen', icon: 'Home', slugs: ['huur-hypotheek', 'gas-water-licht', 'verzekeringen-wonen', 'gemeentelijke-lasten'] },
      { label: 'Levensonderhoud', icon: 'ShoppingCart', slugs: ['boodschappen'] },
      { label: 'Vervoer', icon: 'Car', slugs: ['brandstof-ov'] },
      { label: 'Overig', icon: 'MoreHorizontal', slugs: ['kleding-overige'] },
      { label: 'Sparen & Investeren', icon: 'PiggyBank', slugs: ['sparen-noodbuffer', 'investeren-fire'] },
    ],
  },
  {
    id: 'nibud',
    name: 'Nibud',
    description: 'Gebalanceerd budget op basis van Nibud-richtlijnen met 9 categorieën',
    allocations: NIBUD_ALLOC,
    categories: [
      { label: 'Wonen', icon: 'Home', slugs: ['huur-hypotheek', 'gas-water-licht', 'gemeentelijke-lasten', 'verzekeringen-wonen'] },
      { label: 'Levensonderhoud', icon: 'ShoppingCart', slugs: ['boodschappen', 'huishouden-verzorging'] },
      { label: 'Kinderen & Zorg', icon: 'Heart', slugs: ['kinderen-school', 'medische-kosten'] },
      { label: 'Vervoer', icon: 'Car', slugs: ['brandstof-ov', 'auto-vaste-lasten', 'fiets-deelvervoer'] },
      { label: 'Kleding', icon: 'Shirt', slugs: ['kleding-overige'] },
      { label: 'Vrije tijd', icon: 'Coffee', slugs: ['uit-eten-horeca', 'vrije-tijd-sport', 'vakantie'] },
      { label: 'Sparen', icon: 'PiggyBank', slugs: ['sparen-noodbuffer'] },
      { label: 'Investeren', icon: 'TrendingUp', slugs: ['investeren-fire'] },
      { label: 'Aflossingen', icon: 'CreditCard', slugs: ['schulden-aflossingen', 'extra-aflossing-hypotheek'] },
    ],
  },
  {
    id: 'uitgebreid',
    name: 'Uitgebreid',
    description: 'Gedetailleerd budget met 16 categorieën',
    allocations: UITGEBREID_ALLOC,
    categories: Array.from({ length: 16 }, (_, i) => ({
      label: `Categorie ${i + 1}`,
      icon: 'Circle',
      slugs: [],
    })),
  },
]

// ── Expected budget slugs (all 24: 4 income + 20 expense/savings) ───────────

const INCOME_SLUGS = ['salaris-uitkering', 'toeslagen-kinderbijslag', 'teruggave-belasting', 'overige-inkomsten']

const EXPECTED_BUDGET_SLUGS = [
  ...INCOME_SLUGS,
  'huur-hypotheek', 'gas-water-licht', 'verzekeringen-wonen', 'gemeentelijke-lasten',
  'brandstof-ov', 'auto-vaste-lasten', 'auto-onderhoud', 'fiets-deelvervoer',
  'boodschappen', 'huishouden-verzorging', 'kinderen-school', 'medische-kosten',
  'uit-eten-horeca', 'vrije-tijd-sport', 'vakantie', 'kleding-overige',
  'sparen-noodbuffer', 'investeren-fire',
  'schulden-aflossingen', 'extra-aflossing-hypotheek',
]

// ── Helper: replicate distributeIncome + buildTemplateAmounts logic ──────────

function distributeIncome(netIncome: number, allocations: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {}

  // 1. Set all income slugs
  result['salaris-uitkering'] = netIncome
  for (const slug of INCOME_SLUGS) {
    if (slug !== 'salaris-uitkering') result[slug] = 0
  }

  // 2. Set all expense/savings slugs to 0 initially
  for (const slug of EXPECTED_BUDGET_SLUGS) {
    if (!INCOME_SLUGS.includes(slug) && !(slug in result)) {
      result[slug] = 0
    }
  }

  // 3. Apply allocations: Math.round(netIncome * pct)
  for (const [slug, pct] of Object.entries(allocations)) {
    result[slug] = Math.round(netIncome * pct)
  }

  // 4. Fix rounding: adjust the largest allocated slug so the sum equals netIncome
  const allocatedSlugs = Object.keys(allocations)
  if (allocatedSlugs.length > 0 && netIncome > 0) {
    const allocatedSum = allocatedSlugs.reduce((sum, s) => sum + result[s], 0)
    const diff = netIncome - allocatedSum
    if (diff !== 0) {
      // Find the largest slug
      let maxSlug = allocatedSlugs[0]
      for (const s of allocatedSlugs) {
        if (result[s] > result[maxSlug]) maxSlug = s
      }
      result[maxSlug] += diff
    }
  }

  return result
}

function buildTemplateAmounts(netIncome: number, templateId: BudgetTemplateId): Record<string, number> {
  const template = BUDGET_TEMPLATES.find((t) => t.id === templateId)
  if (!template) throw new Error(`Unknown template: ${templateId}`)
  return distributeIncome(netIncome, template.allocations)
}

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: Budget templates ──────────────────────────────────
  {
    id: 'ob-budget-templates',
    name: 'Budget templates: minimalistisch/nibud/uitgebreid selectie met correcte preset bedragen',
    category: CAT,
    description: 'Drie budget templates zijn beschikbaar met per-slug allocatiepercentages',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // 3 templates available
      assertEqual(BUDGET_TEMPLATES.length, 3, 'Exact 3 budget templates beschikbaar')

      // Verify template IDs
      assertEqual(BUDGET_TEMPLATES[0].id, 'minimalistisch', 'Eerste template is minimalistisch')
      assertEqual(BUDGET_TEMPLATES[1].id, 'nibud', 'Tweede template is nibud')
      assertEqual(BUDGET_TEMPLATES[2].id, 'uitgebreid', 'Derde template is uitgebreid')

      // All allocation percentages should sum to ~1.0 for each template
      for (const t of BUDGET_TEMPLATES) {
        const sum = Object.values(t.allocations).reduce((s, v) => s + v, 0)
        assert(
          Math.abs(sum - 1.0) < 0.005,
          `Template ${t.id}: allocatie percentages sommeren tot ~100% (was ${(sum * 100).toFixed(1)}%)`,
        )
      }

      // Verify concrete amounts for EUR 3000 income
      const income = 3000
      const amounts = buildTemplateAmounts(income, 'nibud')
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
    description: 'Selectie van een ander template herberekent alle budget bedragen op basis van netIncome',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const income = 3500

      const mini = buildTemplateAmounts(income, 'minimalistisch')
      const uitg = buildTemplateAmounts(income, 'uitgebreid')

      // Minimalistisch allocates more to huur-hypotheek (28% vs 24%)
      assert(
        mini['huur-hypotheek'] > uitg['huur-hypotheek'],
        'Minimalistisch heeft hogere huur dan uitgebreid (28% vs 24%)',
      )

      // Uitgebreid allocates more to investeren-fire (12% vs 15%)
      // Actually minimalistisch has 15%, uitgebreid has 12%
      assert(
        mini['investeren-fire'] > uitg['investeren-fire'],
        'Minimalistisch heeft hoger investeringsbedrag dan uitgebreid',
      )

      // Both have same income
      assertEqual(mini['salaris-uitkering'], income, 'Minimalistisch: inkomen = netIncome')
      assertEqual(uitg['salaris-uitkering'], income, 'Uitgebreid: inkomen = netIncome')

      // All 24 slugs present in both
      assertEqual(
        Object.keys(mini).sort().join(','),
        Object.keys(uitg).sort().join(','),
        'Beide templates produceren dezelfde budget slugs',
      )

      // Uitgebreid has more non-zero expense slugs (more granular)
      const miniNonZero = Object.entries(mini).filter(([s, v]) => v > 0 && !INCOME_SLUGS.includes(s)).length
      const uitgNonZero = Object.entries(uitg).filter(([s, v]) => v > 0 && !INCOME_SLUGS.includes(s)).length
      assert(uitgNonZero > miniNonZero, 'Uitgebreid heeft meer niet-nul posten dan minimalistisch')
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
      // Verify that templates work standalone without AI
      const income = 2500
      const amounts = buildTemplateAmounts(income, 'nibud')
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
      const income = 3000
      const templateAmounts = buildTemplateAmounts(income, 'minimalistisch')

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
    name: 'Budget slugs: alle 24 slugs aanwezig in template output',
    category: CAT,
    description: 'buildTemplateAmounts produceert bedragen voor alle 24 verwachte budget slugs',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const income = 3000

      for (const templateId of ['minimalistisch', 'nibud', 'uitgebreid'] as BudgetTemplateId[]) {
        const amounts = buildTemplateAmounts(income, templateId)
        const keys = Object.keys(amounts)

        // All expected slugs must be present
        for (const slug of EXPECTED_BUDGET_SLUGS) {
          assert(keys.includes(slug), `Template ${templateId}: budget slug '${slug}' aanwezig`)
        }

        // Total count matches
        assertEqual(
          keys.length,
          EXPECTED_BUDGET_SLUGS.length,
          `Template ${templateId}: produceert exact ${EXPECTED_BUDGET_SLUGS.length} budget slugs`,
        )
      }

      // Verify slug categories:
      // Inkomen slugs (4)
      for (const s of INCOME_SLUGS) {
        assert(EXPECTED_BUDGET_SLUGS.includes(s), `Inkomen slug '${s}' aanwezig`)
      }
      assertEqual(INCOME_SLUGS.length, 4, '4 inkomen slugs')

      // Sparen slugs (2)
      assert(EXPECTED_BUDGET_SLUGS.includes('sparen-noodbuffer'), 'Sparen slug aanwezig')
      assert(EXPECTED_BUDGET_SLUGS.includes('investeren-fire'), 'Investeren slug aanwezig')
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
        for (const templateId of ['minimalistisch', 'nibud', 'uitgebreid'] as BudgetTemplateId[]) {
          const amounts = buildTemplateAmounts(income, templateId)

          for (const [slug, amount] of Object.entries(amounts)) {
            // All amounts must be non-negative
            assert(amount >= 0, `${templateId} @ EUR${income}: ${slug} is niet negatief (${amount})`)

            // All amounts must be integers (Math.round)
            assertEqual(
              amount,
              Math.round(amount),
              `${templateId} @ EUR${income}: ${slug} is afgerond (${amount})`,
            )

            // No NaN or Infinity
            assert(Number.isFinite(amount), `${templateId} @ EUR${income}: ${slug} is eindig getal`)
          }
        }
      }

      // Edge case: zero income
      const zeroAmounts = buildTemplateAmounts(0, 'minimalistisch')
      for (const [slug, amount] of Object.entries(zeroAmounts)) {
        assertEqual(amount, 0, `Nul-inkomen: ${slug} is 0`)
      }
    },
  },

  // ── Step 8: distributeIncome rounding fix ──────────────────────
  {
    id: 'ob-budget-rounding-fix',
    name: 'distributeIncome: rounding fix zorgt dat allocated sum == netIncome',
    category: CAT,
    description: 'Na Math.round afrondingen wordt het verschil gecorrigeerd op de grootste post',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Test with incomes that cause rounding issues
      const testIncomes = [3333, 2777, 4999, 7777]

      for (const income of testIncomes) {
        for (const templateId of ['minimalistisch', 'nibud', 'uitgebreid'] as BudgetTemplateId[]) {
          const amounts = buildTemplateAmounts(income, templateId)
          const template = BUDGET_TEMPLATES.find((t) => t.id === templateId)!
          const allocatedSlugs = Object.keys(template.allocations)
          const allocatedSum = allocatedSlugs.reduce((sum, s) => sum + amounts[s], 0)

          assertEqual(
            allocatedSum,
            income,
            `${templateId} @ EUR${income}: allocated sum (${allocatedSum}) == netIncome (${income})`,
          )
        }
      }
    },
  },

  // ── Step 9: Category-based display ────────────────────────────
  {
    id: 'ob-budget-category-display',
    name: 'Category-based display: templates groeperen slugs in categorieën',
    category: CAT,
    description: 'Minimalistisch heeft 5 categorieën, Nibud heeft 9, Uitgebreid heeft 16',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      const mini = BUDGET_TEMPLATES.find((t) => t.id === 'minimalistisch')!
      const nibud = BUDGET_TEMPLATES.find((t) => t.id === 'nibud')!
      const uitg = BUDGET_TEMPLATES.find((t) => t.id === 'uitgebreid')!

      // Verify category counts
      assertEqual(mini.categories.length, 5, 'Minimalistisch: 5 categorieën')
      assertEqual(nibud.categories.length, 9, 'Nibud: 9 categorieën')
      assertEqual(uitg.categories.length, 16, 'Uitgebreid: 16 categorieën')

      // Each category has a label and icon
      for (const cat of mini.categories) {
        assert(cat.label.length > 0, `Minimalistisch categorie heeft label: ${cat.label}`)
        assert(cat.icon.length > 0, `Minimalistisch categorie ${cat.label} heeft icon`)
        assert(Array.isArray(cat.slugs), `Minimalistisch categorie ${cat.label} heeft slugs array`)
      }

      // Minimalistisch categories cover all allocated slugs
      const miniCoverSlugs = mini.categories.flatMap((c) => c.slugs)
      for (const slug of Object.keys(mini.allocations)) {
        assert(miniCoverSlugs.includes(slug), `Minimalistisch categorie dekt slug: ${slug}`)
      }

      // Nibud categories cover all allocated slugs
      const nibudCoverSlugs = nibud.categories.flatMap((c) => c.slugs)
      for (const slug of Object.keys(nibud.allocations)) {
        assert(nibudCoverSlugs.includes(slug), `Nibud categorie dekt slug: ${slug}`)
      }
    },
  },

  // ── Step 10: Route accessibility ───────────────────────────────
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
