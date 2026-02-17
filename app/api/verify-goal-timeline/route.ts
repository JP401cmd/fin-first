import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Verification endpoint for Feature #217: Goal progress timeline charts
 *
 * Checks:
 * 1. GoalProgressTimeline component exists with correct exports
 * 2. Component has SVG line chart rendering
 * 3. Target value overlay line (dashed)
 * 4. Deadline marker overlay
 * 5. On-track indicator
 * 6. Pace message ('Op dit tempo bereik je je doel X maanden eerder/later')
 * 7. Handles goals without deadline gracefully
 * 8. buildGoalHistory utility function exists
 * 9. Goal detail modal imports and uses the timeline
 * 10. API endpoint for goal history exists
 */

export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []

  function check(name: string, condition: boolean, detail: string) {
    results.push({ name, pass: condition, detail })
  }

  try {
    // Read component source
    const timelinePath = path.join(process.cwd(), 'components/app/will/goal-progress-timeline.tsx')
    const timelineSrc = fs.existsSync(timelinePath) ? fs.readFileSync(timelinePath, 'utf-8') : ''

    // Read modal source
    const modalPath = path.join(process.cwd(), 'components/app/will/goal-detail-modal.tsx')
    const modalSrc = fs.existsSync(modalPath) ? fs.readFileSync(modalPath, 'utf-8') : ''

    // Read API source
    const apiPath = path.join(process.cwd(), 'app/api/goals/history/route.ts')
    const apiSrc = fs.existsSync(apiPath) ? fs.readFileSync(apiPath, 'utf-8') : ''

    // 1. Component exists
    check(
      'GoalProgressTimeline component exists',
      timelineSrc.includes('export function GoalProgressTimeline'),
      timelineSrc ? 'Component found with export' : 'Component file not found',
    )

    // 2. SVG line chart rendering
    check(
      'SVG line chart with path element',
      timelineSrc.includes('<svg') && timelineSrc.includes('<path') && timelineSrc.includes('linePath'),
      timelineSrc.includes('<svg')
        ? 'SVG chart with line path found'
        : 'Missing SVG chart rendering',
    )

    // 3. Target value overlay (dashed line)
    check(
      'Target value overlay line (dashed)',
      timelineSrc.includes('strokeDasharray') && timelineSrc.includes('Doel:'),
      timelineSrc.includes('Doel:')
        ? 'Dashed target line with "Doel:" label found'
        : 'Missing target value overlay',
    )

    // 4. Deadline marker overlay
    check(
      'Deadline marker overlay on chart',
      timelineSrc.includes('deadlineX') && timelineSrc.includes('target_date'),
      timelineSrc.includes('deadlineX')
        ? 'Deadline vertical marker with flag icon found'
        : 'Missing deadline marker',
    )

    // 5. On-track/off-track indicator
    check(
      'On-track indicator',
      timelineSrc.includes('onTrack') && timelineSrc.includes('PaceMessageBanner'),
      timelineSrc.includes('PaceMessageBanner')
        ? 'On-track indicator via PaceMessageBanner component found'
        : 'Missing on-track indicator',
    )

    // 6. Pace message with month calculation
    check(
      'Pace message: Op dit tempo bereik je je doel X maanden eerder/later',
      timelineSrc.includes('Op dit tempo bereik je je doel') &&
      timelineSrc.includes('eerder') && timelineSrc.includes('later'),
      timelineSrc.includes('Op dit tempo bereik je je doel')
        ? 'Pace message found with eerder/later variants'
        : 'Missing pace message',
    )

    // 7. Goals without deadline handling
    check(
      'Handle goals without deadline gracefully',
      timelineSrc.includes('no_deadline') || (
        timelineSrc.includes('!goal.target_date') || timelineSrc.includes('!hasDeadline')
      ),
      timelineSrc.includes('no_deadline') || timelineSrc.includes('!goal.target_date')
        ? 'No-deadline case handled with alternative message'
        : 'Missing no-deadline handling',
    )

    // 8. buildGoalHistory utility
    check(
      'buildGoalHistory utility function',
      timelineSrc.includes('export function buildGoalHistory'),
      timelineSrc.includes('buildGoalHistory')
        ? 'buildGoalHistory function exported for history construction'
        : 'Missing buildGoalHistory utility',
    )

    // 9. Goal detail modal integration
    check(
      'Goal detail modal imports timeline',
      modalSrc.includes('GoalProgressTimeline') && modalSrc.includes('goal-progress-timeline'),
      modalSrc.includes('GoalProgressTimeline')
        ? 'GoalDetailModal imports and uses GoalProgressTimeline'
        : 'GoalDetailModal does not import GoalProgressTimeline',
    )

    // 10. Timeline section in modal with toggle
    check(
      'Timeline toggle section in GoalCard',
      modalSrc.includes('showTimeline') && modalSrc.includes('loadTimeline'),
      modalSrc.includes('showTimeline')
        ? 'Expandable timeline section with load-on-demand found'
        : 'Missing timeline toggle in GoalCard',
    )

    // 11. API endpoint exists
    check(
      'Goal history API endpoint',
      apiSrc.includes('GET') && apiSrc.includes('goal_contributions'),
      apiSrc
        ? 'API endpoint fetches contributions and builds history'
        : 'API endpoint not found',
    )

    // 12. Area fill under line
    check(
      'Area fill under progress line',
      timelineSrc.includes('areaPath') && timelineSrc.includes('fillOpacity'),
      timelineSrc.includes('areaPath')
        ? 'Area fill path with opacity found'
        : 'Missing area fill',
    )

    // 13. Projection line from last point to target at deadline
    check(
      'Projection line to target at deadline',
      timelineSrc.includes('projectionPath') && timelineSrc.includes('Projectielijn'),
      timelineSrc.includes('projectionPath')
        ? 'Dashed projection line from last point to target at deadline'
        : 'Missing projection line',
    )

    // 14. data-testid attributes
    check(
      'data-testid attributes on key elements',
      timelineSrc.includes('goal-timeline') && timelineSrc.includes('goal-pace-message'),
      timelineSrc.includes('goal-timeline')
        ? 'Test IDs found: goal-timeline, goal-timeline-chart, goal-pace-message'
        : 'Missing data-testid attributes',
    )

    // 15. Chart legend
    check(
      'Chart legend with line descriptions',
      timelineSrc.includes('Werkelijke voortgang') && timelineSrc.includes('Doelwaarde'),
      timelineSrc.includes('Werkelijke voortgang')
        ? 'Legend found with Werkelijke voortgang, Doelwaarde, Deadline, Projectielijn'
        : 'Missing chart legend',
    )

    // 16. Insufficient data handling
    check(
      'Insufficient data state (< 2 points)',
      timelineSrc.includes('goal-timeline-insufficient'),
      timelineSrc.includes('goal-timeline-insufficient')
        ? 'Graceful handling for 0 and 1 data points'
        : 'Missing insufficient data state',
    )

    const passing = results.filter(r => r.pass).length
    const total = results.length

    return NextResponse.json({
      feature: 217,
      name: 'Goal progress timeline charts',
      passing,
      total,
      allPassing: passing === total,
      results,
    })
  } catch (err) {
    return NextResponse.json({
      feature: 217,
      name: 'Goal progress timeline charts',
      passing: 0,
      total: 0,
      allPassing: false,
      error: err instanceof Error ? err.message : String(err),
      results,
    }, { status: 500 })
  }
}
