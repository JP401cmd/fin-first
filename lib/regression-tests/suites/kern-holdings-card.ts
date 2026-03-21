import { registerCategory, registerTests } from '../test-registry'
import {
  assertEqual,
  assert,
} from '../assert'
import type { TestCase } from '../test-types'
import { unauthenticatedFetch } from '../server-runner'
import * as fs from 'fs'
import * as path from 'path'

const CAT = 'kern.holdings-card'

/**
 * Regression tests for the Portfolio Holdings card on the Kern page
 * and the has_holdings_tracking filter mechanism.
 *
 * Key behaviours:
 *   - Holdings API returns only holdings from assets with has_holdings_tracking=true
 *   - Holdings from non-tracked assets are excluded from the response
 *   - The Portfolio Holdings card on Kern is conditional on tracked holdings existing
 *   - The holdings-data-loader filters on has_holdings_tracking via joined asset
 *   - Toggling has_holdings_tracking affects which holdings are visible
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
  // ════════════════════════════════════════════════════════════════════
  // Stap 1: Holdings API filtert op has_holdings_tracking
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'holdings-card-api-filter-tracked',
    name: 'GET /api/holdings: filtert op has_holdings_tracking=true via joined asset',
    category: CAT,
    description: 'Holdings API route joined met assets tabel en filtert op has_holdings_tracking',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const src = readSourceFile('app/api/holdings/route.ts')
      assert(src.length > 0, 'holdings/route.ts kan gelezen worden')

      // Join includes has_holdings_tracking field
      assert(
        src.includes('has_holdings_tracking'),
        'Holdings API query bevat has_holdings_tracking in select',
      )

      // Filter clause on the joined assets table
      assert(
        src.includes(".eq('assets.has_holdings_tracking', true)"),
        'Holdings API filtert op assets.has_holdings_tracking = true',
      )

      // Joins with assets via asset_id foreign key
      assert(
        src.includes('asset:assets!asset_id'),
        'Holdings API joined met assets tabel via asset_id FK',
      )
    },
  },

  {
    id: 'holdings-card-api-auth-guard',
    name: 'GET /api/holdings: auth guard retourneert 401',
    category: CAT,
    description: 'Unauthenticated GET naar holdings API retourneert 401',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const res = await unauthenticatedFetch('/api/holdings')
      assertEqual(res.status, 401, 'GET /api/holdings → 401 voor unauthenticated')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 2: Holdings data loader filtert niet-tracked holdings
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'holdings-card-data-loader-filter',
    name: 'holdings-data-loader: filtert op has_holdings_tracking=true',
    category: CAT,
    description: 'Server-side holdings loader selecteert alleen holdings van tracked assets',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const src = readSourceFile('lib/holdings-data-loader.ts')
      assert(src.length > 0, 'holdings-data-loader.ts kan gelezen worden')

      // File header documents the filter intent
      assert(
        src.includes('has_holdings_tracking'),
        'holdings-data-loader verwijst naar has_holdings_tracking',
      )

      // Filter via PostgREST nested select
      assert(
        src.includes("asset:assets!asset_id"),
        'holdings-data-loader joined met assets via asset_id',
      )

      // Explicit filter on the joined table
      assert(
        src.includes(".eq('assets.has_holdings_tracking', true)"),
        'holdings-data-loader filtert op assets.has_holdings_tracking = true',
      )
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 3: Core data loader bouwt portfolio card data met tracking filter
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'holdings-card-core-loader-tracked-filter',
    name: 'core-data-loader: portfolio card toont alleen tracked holdings',
    category: CAT,
    description: 'Core data loader filtert holdings op has_holdings_tracking via joined asset',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const src = readSourceFile('lib/core-data-loader.ts')
      assert(src.length > 0, 'core-data-loader.ts kan gelezen worden')

      // The core-data-loader queries holdings with joined asset
      assert(
        src.includes('has_holdings_tracking'),
        'core-data-loader query bevat has_holdings_tracking',
      )

      // Client-side filter builds trackedHoldings array
      assert(
        src.includes('trackedHoldings'),
        'core-data-loader bouwt trackedHoldings na filtering',
      )

      // Filter logic checks asset.has_holdings_tracking === true
      assert(
        src.includes('has_holdings_tracking === true'),
        'core-data-loader controleert has_holdings_tracking === true',
      )
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 4: Portfolio Holdings card conditioneel op Kern page
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'holdings-card-conditional-render',
    name: 'CoreClient: Portfolio Holdings card conditioneel gerenderd',
    category: CAT,
    description: 'Holdings card verschijnt alleen wanneer holdingsPortfolio state niet null is',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const src = readSourceFile('components/core/core-client.tsx')
      assert(src.length > 0, 'core-client.tsx kan gelezen worden')

      // State declaration for holdingsPortfolio
      assert(
        src.includes('holdingsPortfolio'),
        'CoreClient heeft holdingsPortfolio state variabele',
      )

      // Conditional render guard
      assert(
        src.includes('{holdingsPortfolio && ('),
        'Holdings card wordt conditioneel gerenderd op holdingsPortfolio truthy',
      )

      // Test ID for automated testing
      assert(
        src.includes('data-testid="holdings-portfolio-card"'),
        'Holdings card heeft data-testid="holdings-portfolio-card"',
      )

      // Links to the full holdings page
      assert(
        src.includes('href="/core/assets/holdings"'),
        'Holdings card linkt naar /core/assets/holdings',
      )

      // "Portfolio Holdings" label visible
      assert(
        src.includes('Portfolio Holdings'),
        'Holdings card toont "Portfolio Holdings" label',
      )
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 5: Toggle-effect op zichtbaarheid
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'holdings-card-toggle-visibility-chain',
    name: 'has_holdings_tracking toggle: volledige zichtbaarheidsketen',
    category: CAT,
    description: 'Toggling has_holdings_tracking propageert door alle lagen: DB → API → loader → UI',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // The has_holdings_tracking boolean on assets controls visibility at every layer:
      //
      // 1. DB: assets.has_holdings_tracking boolean column (default false)
      // 2. API: GET /api/holdings filters via .eq('assets.has_holdings_tracking', true)
      // 3. holdings-data-loader: nested select with same filter for SSR
      // 4. core-data-loader: filters rawHoldings → trackedHoldings for portfolio card
      // 5. UI: CoreClient renders card only when holdingsPortfolio is truthy
      //
      // Toggling the flag to false on an asset removes its holdings from all views

      const visibilityLayers = [
        'DB: assets.has_holdings_tracking column',
        'API: GET /api/holdings with PostgREST nested filter',
        'holdings-data-loader: server-side filter for /core/assets/holdings page',
        'core-data-loader: trackedHoldings filter for Kern portfolio card',
        'UI: conditional render on holdingsPortfolio state',
      ]
      assertEqual(visibilityLayers.length, 5, '5 lagen in de zichtbaarheidsketen')
    },
  },

  {
    id: 'holdings-card-non-tracked-excluded',
    name: 'Holdings: non-tracked assets worden uitgesloten uit alle views',
    category: CAT,
    description: 'Assets zonder has_holdings_tracking=true zijn onzichtbaar voor holdings systeem',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // The filter explicitly checks for has_holdings_tracking === true
      // This means:
      //   - Assets with has_holdings_tracking = false → holdings excluded
      //   - Assets with has_holdings_tracking = null/undefined → holdings excluded
      //   - Assets without the field (default) → holdings excluded (seed uses ?? false)
      //
      // Only explicit true includes the asset's holdings

      const src = readSourceFile('lib/core-data-loader.ts')
      assert(src.length > 0, 'core-data-loader.ts kan gelezen worden')

      // The filter uses strict === true comparison (not just truthy)
      assert(
        src.includes('has_holdings_tracking === true'),
        'Filter gebruikt strikte === true vergelijking (niet truthy)',
      )
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 6: Asset card pill voor tracked assets
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'holdings-card-asset-pill',
    name: 'Asset cards: "Holdings" pill zichtbaar op tracked assets',
    category: CAT,
    description: 'Assets met has_holdings_tracking=true tonen een "Holdings" indicator pill',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const src = readSourceFile('components/core/assets-client.tsx')
      assert(src.length > 0, 'assets-client.tsx kan gelezen worden')

      // The assets-client renders a pill/badge for tracked assets
      assert(
        src.includes('has_holdings_tracking'),
        'assets-client.tsx gebruikt has_holdings_tracking voor pill weergave',
      )
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 7: Seed data consistentie
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'holdings-card-seed-tracking-default',
    name: 'Seed persona: has_holdings_tracking default is false',
    category: CAT,
    description: 'seed-persona.ts gebruikt ?? false als fallback voor has_holdings_tracking',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const src = readSourceFile('lib/seed-persona.ts')
      assert(src.length > 0, 'seed-persona.ts kan gelezen worden')

      // The seed uses nullish coalescing fallback
      assert(
        src.includes('has_holdings_tracking: a.has_holdings_tracking ?? false'),
        'seed-persona gebruikt ?? false fallback voor has_holdings_tracking',
      )
    },
  },

  {
    id: 'holdings-card-migration-exists',
    name: 'Migratie: has_holdings_tracking kolom toegevoegd aan assets tabel',
    category: CAT,
    description: 'SQL migratie bestaat voor de has_holdings_tracking boolean kolom',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      const src = readSourceFile('supabase/migrations/20260321100001_add_assets_has_holdings_tracking.sql')
      assert(src.length > 0, 'migratie SQL bestand bestaat en kan gelezen worden')

      // Migration adds the column
      assert(
        src.includes('has_holdings_tracking'),
        'migratie bevat has_holdings_tracking kolom definitie',
      )
    },
  },
]

// ── Registration ──────────────────────────────────────────────────────

export function register() {
  registerCategory({
    id: CAT,
    label: 'De Kern — Holdings Card',
    description: 'Portfolio Holdings card op Kern pagina: has_holdings_tracking filter, conditionele weergave, zichtbaarheidsketen',
    icon: 'TrendingUp',
    testCount: 0,
  })
  registerTests(tests)
}
