import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Source-code verification for Feature #402:
 * Regression tests for kern hero FIRE progress bar.
 *
 * Reads core-client.tsx and verifies all expected data-testid attributes,
 * conditional rendering patterns, and UI structure for FIRE progress.
 */
export async function GET() {
  const checks: Record<string, boolean> = {}

  try {
    const src = readFileSync(
      join(process.cwd(), 'components', 'core', 'core-client.tsx'),
      'utf-8',
    )

    // data-testid attributes
    checks.fire_progress_bar_testid = src.includes('data-testid="fire-progress-bar"')
    checks.fire_progress_pct_testid = src.includes('data-testid="fire-progress-pct"')
    checks.fire_progress_pct_mobile_testid = src.includes('data-testid="fire-progress-pct-mobile"')
    checks.fire_progress_subtitle_testid = src.includes('data-testid="fire-progress-subtitle"')
    checks.fire_progress_subtitle_mobile_testid = src.includes('data-testid="fire-progress-subtitle-mobile"')
    checks.kern_hero_testid = src.includes('data-testid="kern-hero"')

    // Conditional rendering: progress bar hidden when fireTarget = 0
    checks.conditional_fire_target = src.includes('(coreSimTarget ?? data.fireTarget) > 0')

    // Width calculation pattern
    checks.width_calculation = src.includes('Math.min(100, Math.max(0,') &&
      src.includes('effectiveNetWorth / (coreSimTarget ?? data.fireTarget)')

    // Percentage format
    checks.percentage_format = src.includes('.toFixed(1)')

    // Labels
    checks.voortgang_fire_label = src.includes('Voortgang FIRE')
    checks.fallback_text = src.includes('Stel je FIRE-doel in')

    // Subtitle format "X van Y"
    checks.subtitle_van_format = src.includes(' van ') && src.includes('formatCurrency(effectiveNetWorth)')

    // Desktop grid layout
    checks.three_col_grid = src.includes('sm:grid-cols-3')

    // Desktop grid column 1 has "Voortgang FIRE"
    const desktopGrid = src.split('sm:grid-cols-3')[1] ?? ''
    checks.voortgang_in_grid = desktopGrid.includes('Voortgang FIRE')

    // Progress bar gradient
    checks.progress_gradient = src.includes('from-kern-400') && src.includes('to-kern-600')

    return NextResponse.json({ ok: true, checks })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err), checks },
      { status: 500 },
    )
  }
}
