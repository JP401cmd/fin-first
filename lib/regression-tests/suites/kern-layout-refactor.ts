import { registerTests } from '../test-registry'
import { assert, assertEqual, assertGreaterThan } from '../assert'
import type { TestCase } from '../test-types'
import { authenticatedFetch } from '../server-runner'
import * as fs from 'fs'
import * as path from 'path'

const CAT = 'kern.layout-refactor'

/**
 * Regression tests for core page layout refactoring (#403–#406):
 *
 * Key changes:
 *   - Cash merged into Assets section (no separate Cash card)
 *   - KernMissionControl has 3 tabs: Assets, Debts, Budgets (was 4)
 *   - Assets card includes "Liquide middelen" subsection for cash accounts
 *   - Budgets card has two-column split layout:
 *     Left = Inkomen/Sparen/Schulden summaries, Right = individual Uitgaven
 *   - Layout: Assets + Debts top row (2-col grid), Budgets full-width bottom
 *   - /core/cash redirects to /core/assets
 *   - Gids references updated from "Cash" to "Bezittingen"
 */

// ── Helper: read source file ────────────────────────────────────────────────

function readSourceFile(relativePath: string): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf-8')
  } catch {
    return ''
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: KernMissionControl has 3 tabs (no Cash tab) ──────────────
  {
    id: 'kern-layout-3tabs',
    name: 'KernMissionControl: 3 tabs (Assets, Schulden, Budgetten) — geen Cash tab',
    category: CAT,
    description: 'Component definieert 3 TabKey waarden, geen aparte Cash tab',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const src = readSourceFile('components/app/core/kern-mission-control.tsx')
      assert(src.length > 0, 'kern-mission-control.tsx kan gelezen worden')

      // TabKey type has exactly 3 values: budgets, assets, debts
      assert(
        src.includes("type TabKey = 'budgets' | 'assets' | 'debts'"),
        'TabKey type bevat exact 3 waarden: budgets, assets, debts',
      )

      // No 'cash' tab key
      assert(
        !src.includes("'cash' as const"),
        'Geen cash tab key aanwezig',
      )

      // Tab labels present
      assert(src.includes("label: 'Vermogen'"), 'Vermogen tab label aanwezig')
      assert(src.includes("label: 'Schulden'"), 'Schulden tab label aanwezig')
      assert(src.includes("label: 'Budg.'"), 'Budgetten tab label aanwezig')
    },
  },

  // ── Step 2: Assets card includes cash accounts ───────────────────────
  {
    id: 'kern-layout-assets-cash-merged',
    name: 'Assets card: bevat cash accounts als "Liquide middelen" subsectie',
    category: CAT,
    description: 'Cash rekeningen worden getoond als subsectie binnen de Assets card',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const src = readSourceFile('components/app/core/kern-mission-control.tsx')
      assert(src.length > 0, 'kern-mission-control.tsx kan gelezen worden')

      // Cash items merged into assets
      assert(
        src.includes('cashAccounts') && src.includes('cashItems'),
        'Component accepteert cashAccounts prop en maakt cashItems',
      )

      // Merge comment
      assert(
        src.includes('Always merge cash into assets'),
        'Comment bevestigt cash merge in assets',
      )

      // Liquide middelen subsection
      assert(
        src.includes('Liquide middelen'),
        'Assets card bevat "Liquide middelen" subsectie label',
      )

      // Beleggingen & overig subsection
      assert(
        src.includes('Beleggingen'),
        'Assets card bevat "Beleggingen & overig" subsectie label',
      )

      // allAssetItems combines both
      assert(
        src.includes('allAssetItems = [...cashItems, ...nonCashItems]'),
        'allAssetItems combineert cash en non-cash items',
      )

      // heroTotal includes both
      assert(
        src.includes('heroTotal = totalNonCashAssets + totalCash'),
        'Hero totaal is som van non-cash assets + cash',
      )
    },
  },

  // ── Step 3: Budgets card has two-column split layout ─────────────────
  {
    id: 'kern-layout-budgets-split',
    name: 'Budgets card: two-column split — links Inkomen/Sparen/Schulden, rechts Uitgaven',
    category: CAT,
    description: 'Budgetcard gebruikt flex-row layout met left column (40%) en right column (flex-1)',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const src = readSourceFile('components/app/core/kern-mission-control.tsx')
      assert(src.length > 0, 'kern-mission-control.tsx kan gelezen worden')

      // Two-column flex layout
      assert(
        src.includes('lg:flex-row'),
        'Budget card gebruikt lg:flex-row voor desktop two-column layout',
      )

      // Left column width
      assert(
        src.includes('lg:w-[40%]'),
        'Linker kolom is 40% breed op desktop',
      )

      // Left column content: non-expense type summaries
      assert(
        src.includes('nonExpenseTypeSummaries'),
        'Linker kolom toont non-expense type summaries (Inkomen/Sparen/Schulden)',
      )

      // Right column: expense segments
      assert(
        src.includes('expenseSegments'),
        'Rechter kolom toont individuele expense parent budgets',
      )

      // Right column separator
      assert(
        src.includes('lg:border-l'),
        'Rechter kolom heeft border-left scheiding op desktop',
      )

      // Uitgaven header in right column
      assert(
        src.includes("'Uitgaven'"),
        'Rechter kolom heeft "Uitgaven" header',
      )
    },
  },

  // ── Step 4: Layout grid — Assets+Debts top, Budgets bottom ───────────
  {
    id: 'kern-layout-grid-structure',
    name: 'Grid layout: Assets+Debts bovenaan (2-col), Budgets onderaan (full-width)',
    category: CAT,
    description: 'CSS grid met lg:grid-cols-2 voor top row, Budgets span 2 kolommen',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const src = readSourceFile('components/app/core/kern-mission-control.tsx')
      assert(src.length > 0, 'kern-mission-control.tsx kan gelezen worden')

      // Grid layout with 2 columns
      assert(
        src.includes('lg:grid-cols-2'),
        'Grid heeft 2 kolommen op desktop',
      )

      // Budgets spans full width (col-span-2)
      assert(
        src.includes('lg:col-span-2'),
        'Budgets card spant 2 kolommen op desktop',
      )

      // Assets card top-left with right + bottom border
      assert(
        src.includes('lg:border-r') && src.includes('lg:border-b'),
        'Assets card heeft right + bottom borders als grid separator',
      )

      // Comment confirms layout structure
      assert(
        src.includes('Assets+Debts top row, Budgets full-width bottom'),
        'Comment bevestigt layout structuur',
      )
    },
  },

  // ── Step 5: /core/cash route redirects to /core/assets ───────────────
  {
    id: 'kern-layout-cash-redirect',
    name: '/core/cash page: client-side redirect naar /core/assets',
    category: CAT,
    description: '/core/cash/page.tsx bevat router.replace("/core/assets")',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const src = readSourceFile('app/(app)/core/cash/page.tsx')
      assert(src.length > 0, 'core/cash/page.tsx kan gelezen worden')

      // Client-side redirect
      assert(
        src.includes("router.replace('/core/assets')"),
        'Cash pagina redirect naar /core/assets via router.replace',
      )

      // Page renders null (no visible content)
      assert(
        src.includes('return null'),
        'Cash pagina rendert niets (null) tijdens redirect',
      )
    },
  },

  // ── Step 6: /core/cash route is accessible (returns 200) ─────────────
  {
    id: 'kern-layout-cash-route-accessible',
    name: '/core/cash route: bereikbaar (200 of redirect)',
    category: CAT,
    description: '/core/cash geeft een valide response (redirect pagina)',
    priority: 'high',
    estimatedDurationMs: 1000,
    async fn() {
      const res = await authenticatedFetch('/core/cash', { redirect: 'manual' })
      assert(
        res.status === 200 || (res.status >= 300 && res.status < 400),
        `Expected 200 or redirect for /core/cash, got ${res.status}`,
      )
    },
  },

  // ── Step 7: Gids references updated from Cash to Bezittingen ─────────
  {
    id: 'kern-layout-gids-bezittingen',
    name: 'Gids: referenties bijgewerkt van "Cash" naar "Bezittingen"',
    category: CAT,
    description: 'Gids pagina en naslagwerk verwijzen naar Bezittingen i.p.v. Cash',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const gidsSrc = readSourceFile('app/(app)/identity/gids/page.tsx')
      assert(gidsSrc.length > 0, 'gids/page.tsx kan gelezen worden')

      // Should reference Bezittingen, not "Cash rekeningen" as primary nav
      assert(
        gidsSrc.includes('Bezittingen') || gidsSrc.includes('bezittingen'),
        'Gids pagina verwijst naar Bezittingen',
      )

      // Naslagwerk should have updated path references
      const naslagSrc = readSourceFile('components/app/guide-naslagwerk.tsx')
      if (naslagSrc.length > 0) {
        // Should not contain old "De Kern → Cash" navigation reference
        assert(
          !naslagSrc.includes('De Kern → Cash →'),
          'Naslagwerk bevat geen oude "De Kern → Cash →" navigatie',
        )
      }
    },
  },

  // ── Step 8: KernMissionControl interface — cashAccounts in props ──────
  {
    id: 'kern-layout-props-interface',
    name: 'KernMissionControlProps: cashAccounts als onderdeel van component interface',
    category: CAT,
    description: 'Component interface bevat cashAccounts, totalCash naast nonCashAssets',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const src = readSourceFile('components/app/core/kern-mission-control.tsx')
      assert(src.length > 0, 'kern-mission-control.tsx kan gelezen worden')

      // Interface includes both cash and non-cash asset props
      assert(src.includes('cashAccounts:'), 'Props bevat cashAccounts')
      assert(src.includes('totalCash:'), 'Props bevat totalCash')
      assert(src.includes('nonCashAssets:'), 'Props bevat nonCashAssets')
      assert(src.includes('totalNonCashAssets:'), 'Props bevat totalNonCashAssets')

      // onCardClick callback types
      assert(
        src.includes("'budgets' | 'assets' | 'debts'"),
        'onCardClick accepteert budgets, assets, debts (geen cash)',
      )
    },
  },

  // ── Step 9: Budgets card conditionally rendered ──────────────────────
  {
    id: 'kern-layout-budgets-conditional',
    name: 'Budgets card: conditioneel gerenderd op budgetingActive',
    category: CAT,
    description: 'Budget tab en content alleen zichtbaar wanneer budgetingActive=true',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const src = readSourceFile('components/app/core/kern-mission-control.tsx')
      assert(src.length > 0, 'kern-mission-control.tsx kan gelezen worden')

      // budgetingActive gating
      assert(
        src.includes('budgetingActive'),
        'Component gebruikt budgetingActive prop',
      )

      // Conditional tab inclusion
      assert(
        src.includes('...(budgetingActive'),
        'Budget tab wordt conditioneel toegevoegd aan tabs array',
      )
    },
  },

  // ── Step 10: Holdings portfolio card conditionally rendered on Kern page ──
  {
    id: 'kern-layout-holdings-portfolio-card',
    name: 'Kern page: Holdings portfolio card conditioneel op tracked holdings',
    category: CAT,
    description: 'CoreClient toont een Portfolio Holdings card wanneer holdingsPortfolio niet null is',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const src = readSourceFile('components/core/core-client.tsx')
      assert(src.length > 0, 'core-client.tsx kan gelezen worden')

      // Holdings portfolio state is initialized
      assert(
        src.includes("holdingsPortfolio"),
        'CoreClient heeft holdingsPortfolio state',
      )

      // Conditional rendering: card only shows when holdingsPortfolio is truthy
      assert(
        src.includes('{holdingsPortfolio && ('),
        'Holdings portfolio card wordt conditioneel gerenderd',
      )

      // data-testid for the card
      assert(
        src.includes('data-testid="holdings-portfolio-card"'),
        'Holdings portfolio card heeft data-testid',
      )

      // Card links to /core/assets/holdings
      assert(
        src.includes('href="/core/assets/holdings"'),
        'Holdings portfolio card linkt naar /core/assets/holdings',
      )

      // The card is NOT a tab — it's a separate card below the mission control
      assert(
        !src.includes("type TabKey = 'budgets' | 'assets' | 'debts' | 'holdings'"),
        'Holdings is geen tab in KernMissionControl (het is een apart card)',
      )
    },
  },

  // ── Step 11: Holdings portfolio data loaded from core-data-loader ──────
  {
    id: 'kern-layout-holdings-data-loader',
    name: 'Core data loader: holdings portfolio met has_holdings_tracking filter',
    category: CAT,
    description: 'core-data-loader.ts filtert holdings op has_holdings_tracking = true voor portfolio card',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const src = readSourceFile('lib/core-data-loader.ts')
      assert(src.length > 0, 'core-data-loader.ts kan gelezen worden')

      // Filter on has_holdings_tracking via joined asset
      assert(
        src.includes('has_holdings_tracking'),
        'core-data-loader filtert op has_holdings_tracking',
      )

      // Only tracked holdings are included in the portfolio summary
      assert(
        src.includes('trackedHoldings'),
        'core-data-loader bouwt trackedHoldings array na filtering',
      )
    },
  },

  // ── Step 12: Health score computation includes cash ──────────────────
  {
    id: 'kern-layout-health-includes-cash',
    name: 'Health score: berekening omvat cash gezondheid',
    category: CAT,
    description: 'Health score telt cash >= 0 als positieve indicator mee',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const src = readSourceFile('components/app/core/kern-mission-control.tsx')
      assert(src.length > 0, 'kern-mission-control.tsx kan gelezen worden')

      // Health score includes cash check
      assert(
        src.includes('totalCash >= 0'),
        'Health score controleert of cash niet negatief is',
      )

      // Health score includes asset growth
      assert(
        src.includes("assetGrowthDirection !== 'down'"),
        'Health score controleert asset groeirichting',
      )

      // Comment confirms assets includes cash
      assert(
        src.includes('Assets (includes cash) health'),
        'Comment bevestigt dat assets health cash omvat',
      )
    },
  },

  // ── Step 11: Validate-hrefs still includes /core/cash ────────────────
  {
    id: 'kern-layout-validate-hrefs',
    name: 'validate-hrefs: /core/cash blijft geldige route (redirect pagina)',
    category: CAT,
    description: '/core/cash staat nog in VALID_ROUTES voor briefing href validatie',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      const src = readSourceFile('lib/briefing/validate-hrefs.ts')
      assert(src.length > 0, 'validate-hrefs.ts kan gelezen worden')

      // /core/cash is still a valid route (it redirects, but the page exists)
      assert(
        src.includes("'/core/cash'"),
        '/core/cash staat nog als geldige route in VALID_ROUTES',
      )

      // Aliases still map to /core/cash
      assert(
        src.includes("'/core/transactions': '/core/cash'"),
        'Alias /core/transactions → /core/cash is intact',
      )
    },
  },

  // ── Step 12: Registratie ──────────────────────────────────────────────
  {
    id: 'kern-layout-category-registered',
    name: 'Registratie onder categorie "Kern — Layout Refactor"',
    category: CAT,
    description: 'Alle tests geregistreerd onder juiste categorie met kern-layout- prefix',
    priority: 'medium',
    estimatedDurationMs: 100,
    fn() {
      assertEqual(CAT, 'kern.layout-refactor', 'Categorie ID is kern.layout-refactor')

      const expectedPrefix = 'kern-layout-'
      tests.forEach((t) => {
        assert(t.id.startsWith(expectedPrefix), `Test ID "${t.id}" begint met "${expectedPrefix}"`)
      })

      assert(tests.length >= 12, `Minstens 12 tests, actueel: ${tests.length}`)
    },
  },
]

export function register(): void {
  registerTests(tests)
}
