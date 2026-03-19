import { registerTests } from '../test-registry'
import {
  assertEqual, assert,
} from '../assert'
import type { TestCase } from '../test-types'
import {
  computeFreedomPercentage, computeFireTarget,
} from '@/lib/core-metrics'
import { unauthenticatedFetch } from '../server-runner'

const CAT = 'kern.hero-fire-progress'

/**
 * Helper: fetch source verification checks from the API endpoint.
 * Returns a record of check_name → boolean.
 */
async function fetchSourceChecks(): Promise<Record<string, boolean>> {
  const res = await unauthenticatedFetch('/api/verify-kern-hero-fire-progress')
  const json = await res.json()
  if (!json.ok) throw new Error(`Source verification API failed: ${json.error}`)
  return json.checks as Record<string, boolean>
}

// ── FIRE progress bar width calculation ──────────────────────────────────────
// The progress bar width in core-client.tsx uses:
//   Math.min(100, Math.max(0, (effectiveNetWorth / fireTarget) * 100))
// which is equivalent to computeFreedomPercentage from core-metrics.

const tests: TestCase[] = [
  // ── Test 1: FIRE progress bar renders with correct width percentage ──────
  {
    id: 'kern-hero-fp-width-50pct',
    name: 'FIRE progress bar: 50% breedte bij half vermogen',
    category: CAT,
    description: 'Progress bar breedte = netWorth/fireTarget*100, capped 0-100',
    priority: 'critical',
    estimatedDurationMs: 5,
    fn() {
      // 500K net worth, 1M target → 50%
      const pct = computeFreedomPercentage(500_000, 1_000_000)
      assertEqual(pct, 50, '50% breedte')
    },
  },
  {
    id: 'kern-hero-fp-width-100pct',
    name: 'FIRE progress bar: capped op 100% bij overshoot',
    category: CAT,
    description: 'Breedte nooit boven 100%, ook als vermogen > target',
    priority: 'critical',
    estimatedDurationMs: 5,
    fn() {
      const pct = computeFreedomPercentage(2_000_000, 1_000_000)
      assertEqual(pct, 100, 'capped op 100%')
    },
  },
  {
    id: 'kern-hero-fp-width-0pct',
    name: 'FIRE progress bar: 0% bij nul vermogen',
    category: CAT,
    description: 'Breedte = 0% als netWorth = 0',
    priority: 'critical',
    estimatedDurationMs: 5,
    fn() {
      const pct = computeFreedomPercentage(0, 1_000_000)
      assertEqual(pct, 0, '0% breedte')
    },
  },
  {
    id: 'kern-hero-fp-width-negative',
    name: 'FIRE progress bar: 0% bij negatief vermogen',
    category: CAT,
    description: 'Negatief vermogen → clamped op 0% (niet negatieve breedte)',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      const pct = computeFreedomPercentage(-100_000, 1_000_000)
      assertEqual(pct, 0, 'negatief → 0%')
    },
  },
  {
    id: 'kern-hero-fp-width-partial',
    name: 'FIRE progress bar: correcte tussenwaarden',
    category: CAT,
    description: 'Diverse percentages berekend op basis van netWorth/target',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      assertEqual(computeFreedomPercentage(250_000, 1_000_000), 25, '25%')
      assertEqual(computeFreedomPercentage(750_000, 1_000_000), 75, '75%')
      assertEqual(computeFreedomPercentage(100_000, 1_000_000), 10, '10%')
    },
  },
  {
    id: 'kern-hero-fp-width-testid',
    name: 'FIRE progress bar: data-testid aanwezig in bron',
    category: CAT,
    description: 'core-client.tsx bevat data-testid="fire-progress-bar" element',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const checks = await fetchSourceChecks()
      assert(checks.fire_progress_bar_testid, 'data-testid="fire-progress-bar" niet gevonden in core-client.tsx')
    },
  },
  {
    id: 'kern-hero-fp-width-style',
    name: 'FIRE progress bar: breedte via inline style',
    category: CAT,
    description: 'Progress bar inner div gebruikt width style met percentage berekening',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      const checks = await fetchSourceChecks()
      assert(checks.width_calculation, 'Progress bar breedte berekening niet gevonden (Math.min/max + effectiveNetWorth/fireTarget)')
    },
  },

  // ── Test 2: FIRE progress bar verborgen als fireTarget = 0 ───────────────
  {
    id: 'kern-hero-fp-hidden-zero-target',
    name: 'FIRE progress bar: verborgen bij fireTarget = 0',
    category: CAT,
    description: 'computeFreedomPercentage retourneert 0 bij target=0 (guard)',
    priority: 'critical',
    estimatedDurationMs: 5,
    fn() {
      assertEqual(computeFreedomPercentage(500_000, 0), 0, 'target=0 → 0%')
      assertEqual(computeFreedomPercentage(0, 0), 0, 'beide=0 → 0%')
    },
  },
  {
    id: 'kern-hero-fp-hidden-conditional',
    name: 'FIRE progress bar: conditional rendering op fireTarget > 0',
    category: CAT,
    description: 'Broncode toont progress bar alleen als (coreSimTarget ?? data.fireTarget) > 0',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const checks = await fetchSourceChecks()
      assert(checks.conditional_fire_target, 'Conditional rendering op fireTarget > 0 niet gevonden')
    },
  },
  {
    id: 'kern-hero-fp-fire-target-zero',
    name: 'FIRE progress bar: computeFireTarget retourneert 0 bij nul uitgaven',
    category: CAT,
    description: 'Als uitgaven 0 zijn, is fireTarget 0, dus bar verborgen',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      assertEqual(computeFireTarget(0, 0.04), 0, 'nul uitgaven → target 0')
      assertEqual(computeFireTarget(0, 0.0288), 0, 'nul uitgaven NL SWR → target 0')
    },
  },

  // ── Test 3: Desktop kolom 1 toont percentage i.p.v. bedrag ───────────────
  {
    id: 'kern-hero-fp-desktop-pct',
    name: 'Desktop kolom 1: toont FIRE percentage',
    category: CAT,
    description: 'Desktop grid kolom 1 toont "Voortgang FIRE" met percentage tekst',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const checks = await fetchSourceChecks()
      assert(checks.fire_progress_pct_testid, 'data-testid="fire-progress-pct" niet gevonden (desktop percentage)')
      assert(checks.voortgang_fire_label, '"Voortgang FIRE" label niet gevonden in hero section')
    },
  },
  {
    id: 'kern-hero-fp-desktop-pct-format',
    name: 'Desktop kolom 1: percentage als X.X% formaat',
    category: CAT,
    description: 'Desktop FIRE percentage toont .toFixed(1) formaat',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      const checks = await fetchSourceChecks()
      assert(checks.percentage_format, '.toFixed(1) formaat voor percentage niet gevonden')
    },
  },
  {
    id: 'kern-hero-fp-desktop-subtitle',
    name: 'Desktop kolom 1: subtitle toont bedrag van target',
    category: CAT,
    description: 'Desktop FIRE voortgang toont "X van Y" subtitle met formatCurrency',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      const checks = await fetchSourceChecks()
      assert(checks.fire_progress_subtitle_testid, 'data-testid="fire-progress-subtitle" niet gevonden')
      assert(checks.subtitle_van_format, 'Subtitle formaat "X van Y" niet gevonden')
    },
  },

  // ── Test 4: Mobiel expanded toont percentage i.p.v. bedrag ───────────────
  {
    id: 'kern-hero-fp-mobile-pct',
    name: 'Mobiel expanded: toont FIRE percentage',
    category: CAT,
    description: 'Mobiele expandable sectie toont FIRE percentage met eigen data-testid',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const checks = await fetchSourceChecks()
      assert(checks.fire_progress_pct_mobile_testid, 'data-testid="fire-progress-pct-mobile" niet gevonden')
    },
  },
  {
    id: 'kern-hero-fp-mobile-subtitle',
    name: 'Mobiel expanded: subtitle toont bedrag van target',
    category: CAT,
    description: 'Mobiele sectie toont "X van Y" subtitle',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      const checks = await fetchSourceChecks()
      assert(checks.fire_progress_subtitle_mobile_testid, 'data-testid="fire-progress-subtitle-mobile" niet gevonden')
    },
  },
  {
    id: 'kern-hero-fp-mobile-fallback',
    name: 'Mobiel expanded: fallback tekst bij geen FIRE-doel',
    category: CAT,
    description: 'Als fireTarget = 0, toont "Stel je FIRE-doel in" i.p.v. percentage',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      const checks = await fetchSourceChecks()
      assert(checks.fallback_text, 'Fallback tekst "Stel je FIRE-doel in" niet gevonden')
    },
  },

  // ── Test 5: Bestaande hero assertions niet gebroken ──────────────────────
  {
    id: 'kern-hero-fp-no-duplicate-networth',
    name: 'Hero: geen dubbel netto vermogen bedrag in kolom 1',
    category: CAT,
    description: 'Desktop kolom 1 toont percentage, niet een tweede netto vermogen bedrag',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const checks = await fetchSourceChecks()
      assert(checks.voortgang_in_grid, 'Desktop grid kolom 1 moet "Voortgang FIRE" bevatten')
    },
  },
  {
    id: 'kern-hero-fp-hero-section-testid',
    name: 'Hero section: data-testid="kern-hero" aanwezig',
    category: CAT,
    description: 'De hero section heeft het correcte data-testid attribuut',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const checks = await fetchSourceChecks()
      assert(checks.kern_hero_testid, 'data-testid="kern-hero" niet gevonden')
    },
  },
  {
    id: 'kern-hero-fp-three-col-grid',
    name: 'Hero: desktop 3-kolom grid intact',
    category: CAT,
    description: 'Desktop layout gebruikt nog steeds sm:grid-cols-3',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      const checks = await fetchSourceChecks()
      assert(checks.three_col_grid, 'sm:grid-cols-3 layout niet meer aanwezig in hero')
    },
  },
  {
    id: 'kern-hero-fp-progress-gradient',
    name: 'FIRE progress bar: kern kleur gradient',
    category: CAT,
    description: 'Progress bar inner div gebruikt kern module kleuren gradient',
    priority: 'medium',
    estimatedDurationMs: 500,
    async fn() {
      const checks = await fetchSourceChecks()
      assert(checks.progress_gradient, 'Progress bar gradient (from-kern-400 to-kern-600) niet gevonden')
    },
  },
]

export function register(): void {
  registerTests(tests)
}
