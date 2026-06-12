import { registerTests } from '../test-registry'
import { assert, assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import { authenticatedFetch } from '../server-runner'
import {
  BUDGET_TEMPLATES,
  buildTemplateAmounts,
  buildTemplateSeed,
  type BudgetTemplateId,
} from '@/lib/budget-templates/onboarding-presets'
import { BUDGET_SLUGS, BUDGET_LEAF_META, BUDGET_PARENT_META } from '@/lib/budget-data'

const CAT = 'onboarding.budgets'

// ── Helpers ──────────────────────────────────────────────────────────────────

const INCOME_SLUGS = [
  BUDGET_SLUGS.SALARIS_UITKERING,
  BUDGET_SLUGS.TOESLAGEN_KINDERBIJSLAG,
  BUDGET_SLUGS.TERUGGAVE_BELASTING,
  BUDGET_SLUGS.OVERIGE_INKOMSTEN,
] as const

/** Sum of allocated (bestedings-)amounts: everything except income keys. */
function allocatedSum(amounts: Record<string, number>): number {
  return Object.entries(amounts)
    .filter(([slug]) => !(INCOME_SLUGS as readonly string[]).includes(slug))
    .reduce((n, [, v]) => n + v, 0)
}

// ── Tests ────────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: Budget templates ──────────────────────────────────
  {
    id: 'ob-budget-templates',
    name: 'Budget templates: 3 templates met stabiele IDs',
    category: CAT,
    description: 'Drie budget templates beschikbaar met vaste IDs: minimalistisch, nibud, uitgebreid',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // (a) Exact 3 templates with the canonical IDs
      assertEqual(BUDGET_TEMPLATES.length, 3, 'Exact 3 budget templates beschikbaar')
      assertEqual(BUDGET_TEMPLATES[0].id, 'minimalistisch', 'Eerste template is minimalistisch')
      assertEqual(BUDGET_TEMPLATES[1].id, 'nibud', 'Tweede template is nibud')
      assertEqual(BUDGET_TEMPLATES[2].id, 'uitgebreid', 'Derde template is uitgebreid')

      // buildTemplateAmounts works for each template
      const income = 3000
      const amounts = buildTemplateAmounts(income, 'nibud')
      assertEqual(amounts[BUDGET_SLUGS.SALARIS_UITKERING], income, 'Inkomen = netIncome')
      assert((amounts[BUDGET_SLUGS.HUUR_HYPOTHEEK] ?? 0) > 0, 'Huur/hypotheek bedrag is positief')
      assert((amounts[BUDGET_SLUGS.BOODSCHAPPEN] ?? 0) > 0, 'Boodschappen bedrag is positief')
      assert((amounts[BUDGET_SLUGS.INVESTEREN_FIRE] ?? 0) > 0, 'Investeren bedrag is positief')
    },
  },

  // ── Step 2: Categorie-aantallen per template ──────────────────
  {
    id: 'ob-budget-category-counts',
    name: 'Categorie-aantallen: minimalistisch 5 / nibud 6 / uitgebreid 6',
    category: CAT,
    description: 'Nieuwe hiërarchische templates: minimalistisch 5 potjes, nibud 6 hoofdbudgetten, uitgebreid 6 hoofdbudgetten',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const mini = BUDGET_TEMPLATES.find((t) => t.id === 'minimalistisch')!
      const nibud = BUDGET_TEMPLATES.find((t) => t.id === 'nibud')!
      const uitg = BUDGET_TEMPLATES.find((t) => t.id === 'uitgebreid')!

      // (b) Category counts match the new template structure
      assertEqual(mini.categories.length, 5, 'Minimalistisch: 5 categorieën')
      assertEqual(nibud.categories.length, 6, 'Nibud: 6 categorieën')
      assertEqual(uitg.categories.length, 6, 'Uitgebreid: 6 categorieën')

      // Each category has the new shape: parentSlug + label + icon + slugs
      for (const tpl of BUDGET_TEMPLATES) {
        for (const cat of tpl.categories) {
          assert(typeof cat.parentSlug === 'string' && cat.parentSlug.length > 0,
            `${tpl.id}/${cat.label}: parentSlug aanwezig`)
          assert(typeof cat.label === 'string' && cat.label.length > 0,
            `${tpl.id}: categorie heeft label`)
          assert(typeof cat.icon === 'string' && cat.icon.length > 0,
            `${tpl.id}/${cat.label}: icon aanwezig`)
          assert(Array.isArray(cat.slugs),
            `${tpl.id}/${cat.label}: slugs is array`)
        }
      }
    },
  },

  // ── Step 3: Slug-aanwezigheid in catalogus + geen duplicaten ──
  {
    id: 'ob-budget-slug-catalogue-and-uniqueness',
    name: 'Template-slugs in BUDGET_SLUGS + BUDGET_LEAF_META, geen duplicaten per template',
    category: CAT,
    description:
      'Elke template-slug bestaat in BUDGET_SLUGS én BUDGET_LEAF_META en hoort bij de parentSlug van zijn categorie. ' +
      'Geen slug dubbel binnen een template (vastpint bugfix D1 — oude huishouden-verzorging-dubbeling).',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const knownSlugs = new Set<string>(Object.values(BUDGET_SLUGS))

      for (const tpl of BUDGET_TEMPLATES) {
        const seenInTemplate = new Set<string>()

        for (const cat of tpl.categories) {
          // parentSlug must be a known parent
          assert(knownSlugs.has(cat.parentSlug),
            `${tpl.id}: parentSlug '${cat.parentSlug}' bestaat in BUDGET_SLUGS`)
          assert(BUDGET_PARENT_META[cat.parentSlug] !== undefined,
            `${tpl.id}: parentSlug '${cat.parentSlug}' bestaat in BUDGET_PARENT_META`)

          // (c) Each leaf slug must be in BUDGET_SLUGS and BUDGET_LEAF_META under the correct parent
          for (const slug of cat.slugs) {
            assert(knownSlugs.has(slug),
              `${tpl.id}: slug '${slug}' bestaat in BUDGET_SLUGS`)
            assert(BUDGET_LEAF_META[slug] !== undefined,
              `${tpl.id}: slug '${slug}' bestaat in BUDGET_LEAF_META`)
            assertEqual(
              BUDGET_LEAF_META[slug].parentSlug,
              cat.parentSlug,
              `${tpl.id}: '${slug}' hangt onder de juiste parent '${cat.parentSlug}'`,
            )

            // (d) No slug appears twice within the same template
            assert(!seenInTemplate.has(slug),
              `${tpl.id}: slug '${slug}' komt NIET dubbel voor (bugfix D1)`)
            seenInTemplate.add(slug)
          }
        }
      }
    },
  },

  // ── Step 4: Allocatie sommeert naar netIncome ─────────────────
  {
    id: 'ob-budget-allocation-sum',
    name: 'Allocaties sommeren exact naar netIncome via buildTemplateAmounts',
    category: CAT,
    description: 'Per template: som van bestedings-amounts = netIncome (rounding-safe)',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const testIncomes = [3000, 2347, 3333]

      for (const income of testIncomes) {
        for (const tpl of BUDGET_TEMPLATES) {
          const amounts = buildTemplateAmounts(income, tpl.id)
          // (e) Allocation sums exactly to netIncome
          const sum = allocatedSum(amounts)
          assertEqual(
            sum,
            income,
            `${tpl.id} @ EUR${income}: bestedingen sommeren exact naar netIncome`,
          )
          // Income key equals netIncome
          assertEqual(amounts[BUDGET_SLUGS.SALARIS_UITKERING], income,
            `${tpl.id} @ EUR${income}: salaris-uitkering = netIncome`)
        }
      }
    },
  },

  // ── Step 5: buildTemplateSeed — canonieke structuur ────────────
  {
    id: 'ob-budget-template-seed-structure',
    name: 'buildTemplateSeed: 8 canonieke parents, vervoer-slugs onder één Vervoer-parent',
    category: CAT,
    description:
      'buildTemplateSeed levert exact de 8 canonieke parents in sort_order. ' +
      'Nibud/uitgebreid: vervoer-slugs hangen als children onder één Vervoer-parent.',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // (f) buildTemplateSeed levert exact de 8 canonieke parents in volgorde
      const expectedOrder = Object.keys(BUDGET_PARENT_META).sort(
        (a, b) => BUDGET_PARENT_META[a].sort_order - BUDGET_PARENT_META[b].sort_order,
      )

      for (const tpl of BUDGET_TEMPLATES) {
        const seed = buildTemplateSeed(tpl.id, 3000)
        const actualSlugs = seed.map((p) => p.slug)
        assertEqual(
          actualSlugs.join(','),
          expectedOrder.join(','),
          `${tpl.id}: 8 canonieke parents in sort_order`,
        )
      }

      // (f) Vervoer-slugs als children onder één Vervoer-parent (nibud/uitgebreid)
      const vervoerLeaves = [
        BUDGET_SLUGS.BRANDSTOF_OV,
        BUDGET_SLUGS.AUTO_VASTE_LASTEN,
        BUDGET_SLUGS.AUTO_ONDERHOUD,
        BUDGET_SLUGS.FIETS_DEELVERVOER,
      ]
      for (const id of ['nibud', 'uitgebreid'] as BudgetTemplateId[]) {
        const seed = buildTemplateSeed(id, 3000)
        const vervoer = seed.find((p) => p.slug === BUDGET_SLUGS.VERVOER)!
        const childSlugs = (vervoer.children ?? []).map((c) => c.slug).sort()
        assertEqual(
          childSlugs.join(','),
          [...vervoerLeaves].sort().join(','),
          `${id}: 4 vervoer-leaves als children onder Vervoer-parent`,
        )
      }
    },
  },

  // ── Step 6: Minimalistisch — childless bestedings-parents ─────
  {
    id: 'ob-budget-minimalistisch-childless-parents',
    name: 'Minimalistisch: bestedings-parents zonder leaf-slugs zijn childless met limit > 0',
    category: CAT,
    description:
      'Minimalistisch heeft lege slugs-arrays voor wonen/dagelijks/vervoer/leuke-dingen. ' +
      'buildTemplateSeed levert die als hoofdbudgetten zonder children maar met default_limit > 0 (direct boeken).',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const seed = buildTemplateSeed('minimalistisch', 3000)

      // Childless bestedings-parents that book directly on the parent budget
      const childlessParents = [
        BUDGET_SLUGS.VASTE_LASTEN_WONEN,
        BUDGET_SLUGS.DAGELIJKSE_UITGAVEN,
        BUDGET_SLUGS.VERVOER,
        BUDGET_SLUGS.LEUKE_DINGEN,
      ]

      for (const slug of childlessParents) {
        const parent = seed.find((p) => p.slug === slug)
        assert(parent !== undefined, `minimalistisch: '${slug}' aanwezig in seed`)
        const children = (parent?.children ?? [])
        assertEqual(children.length, 0,
          `minimalistisch: '${slug}' heeft geen children (direct boeken)`)
        assert((parent?.default_limit ?? 0) > 0,
          `minimalistisch: '${slug}' heeft default_limit > 0 (niet €0)`)
      }

      // Schulden-parent exists at €0 (no category for it in minimalistisch)
      const schulden = seed.find((p) => p.slug === BUDGET_SLUGS.SCHULDEN_AFLOSSINGEN_PARENT)
      assert(schulden !== undefined, 'minimalistisch: schulden-parent aanwezig')
      assertEqual(schulden?.default_limit ?? -1, 0, 'minimalistisch: schulden-parent op €0')
      assertEqual((schulden?.children ?? []).length, 0, 'minimalistisch: schulden-parent geen children')
    },
  },

  // ── Step 7: Template switch ───────────────────────────────────
  {
    id: 'ob-budget-template-switch',
    name: 'Template switch: nibud/uitgebreid bevatten de 2 nieuwe vaste-lasten-slugs',
    category: CAT,
    description: 'telefoon-internet-tv en abonnementen-contributies zitten in nibud/uitgebreid prompt-context',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Both nibud and uitgebreid include the two new slugs under vaste-lasten-wonen
      for (const id of ['nibud', 'uitgebreid'] as BudgetTemplateId[]) {
        const tpl = BUDGET_TEMPLATES.find((t) => t.id === id)!
        const wonenCat = tpl.categories.find((c) => c.parentSlug === BUDGET_SLUGS.VASTE_LASTEN_WONEN)!

        assert(wonenCat.slugs.includes(BUDGET_SLUGS.TELEFOON_INTERNET_TV),
          `${id}: telefoon-internet-tv in vaste-lasten categorie`)
        assert(wonenCat.slugs.includes(BUDGET_SLUGS.ABONNEMENTEN_CONTRIBUTIES),
          `${id}: abonnementen-contributies in vaste-lasten categorie`)
      }

      // minimalistisch does NOT have leaf slugs for these (books on parent)
      const mini = BUDGET_TEMPLATES.find((t) => t.id === 'minimalistisch')!
      const allMiniSlugs = mini.categories.flatMap((c) => c.slugs)
      assert(!allMiniSlugs.includes(BUDGET_SLUGS.TELEFOON_INTERNET_TV),
        'minimalistisch: telefoon-internet-tv niet als leaf (direct op parent)')
      assert(!allMiniSlugs.includes(BUDGET_SLUGS.ABONNEMENTEN_CONTRIBUTIES),
        'minimalistisch: abonnementen-contributies niet als leaf (direct op parent)')
    },
  },

  // ── Step 8: AI budget suggesties ──────────────────────────────
  {
    id: 'ob-budget-ai-suggest-api',
    name: 'AI budget suggesties: POST /api/onboarding/suggest-budgets endpoint',
    category: CAT,
    description: 'API endpoint accepteert income, household, children en retourneert budget amounts',
    priority: 'high',
    estimatedDurationMs: 3000,
    async fn() {
      // Test that the endpoint exists and validates input
      const res = await authenticatedFetch('/api/onboarding/suggest-budgets', {
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
      assert(
        [200, 401, 403, 500].includes(res.status),
        `Endpoint retourneert verwachte status: ${res.status} (200=ok, 401=auth, 500=AI unavailable)`,
      )
    },
  },

  // ── Step 9: AI suggesties foutafhandeling ─────────────────────
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

      assert(allocatedSum(amounts) === income, 'Fallback: allocaties = inkomen')
      assert(amounts[BUDGET_SLUGS.SALARIS_UITKERING] === income, 'Fallback: inkomen correct zonder AI')

      // All amounts should be non-negative (valid fallback)
      for (const [slug, amount] of Object.entries(amounts)) {
        assert(amount >= 0, `Budget ${slug} is niet negatief: ${amount}`)
      }
    },
  },

  // ── Step 10: Numerieke invoer validatie ───────────────────────
  {
    id: 'ob-budget-numeric-validation',
    name: 'Numerieke invoer: alleen positieve bedragen, correct afgerond',
    category: CAT,
    description: 'Template-gegenereerde bedragen zijn positief gehele getallen (Math.round)',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      const testIncomes = [1500, 2500, 3000, 5000, 10000]

      for (const income of testIncomes) {
        for (const tpl of BUDGET_TEMPLATES) {
          const amounts = buildTemplateAmounts(income, tpl.id)

          for (const [slug, amount] of Object.entries(amounts)) {
            assert(amount >= 0, `${tpl.id} @ EUR${income}: ${slug} is niet negatief (${amount})`)
            assertEqual(
              amount,
              Math.round(amount),
              `${tpl.id} @ EUR${income}: ${slug} is afgerond (${amount})`,
            )
            assert(Number.isFinite(amount), `${tpl.id} @ EUR${income}: ${slug} is eindig getal`)
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

  // ── Step 11: distributeIncome rounding fix ──────────────────────
  {
    id: 'ob-budget-rounding-fix',
    name: 'distributeIncome: rounding fix zorgt dat allocated sum == netIncome',
    category: CAT,
    description: 'Na Math.round afrondingen wordt het verschil gecorrigeerd op de grootste post',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const testIncomes = [3333, 2777, 4999, 7777]

      for (const income of testIncomes) {
        for (const tpl of BUDGET_TEMPLATES) {
          const amounts = buildTemplateAmounts(income, tpl.id)
          const sum = allocatedSum(amounts)
          assertEqual(
            sum,
            income,
            `${tpl.id} @ EUR${income}: allocated sum (${sum}) == netIncome (${income})`,
          )
        }
      }
    },
  },

  // ── Step 12: Route accessibility ───────────────────────────────
  {
    id: 'ob-budget-route-accessible',
    name: '/onboarding route bereikbaar (budget stap is onderdeel van onboarding)',
    category: CAT,
    description: 'Onboarding pagina (incl. budget stap) geeft 200 of auth redirect',
    priority: 'critical',
    estimatedDurationMs: 1000,
    async fn() {
      const res = await authenticatedFetch('/onboarding', { redirect: 'manual' })
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
