import { NextResponse } from 'next/server'
import { computeFreedomMilestones } from '@/lib/freedom-milestones'

/**
 * Verification endpoint for freedom milestone projections.
 * Tests various financial scenarios to ensure milestone calculations are correct.
 */
export async function GET() {
  const results: { test: string; pass: boolean; detail: string }[] = []

  // Test 1: Basic milestone calculation with positive savings
  {
    const r = computeFreedomMilestones(50000, 2500, 1500)
    const allFour = r.milestones.length === 4
    const correctPercents = r.milestones.map(m => m.percent).join(',') === '25,50,75,100'
    results.push({
      test: '1. Four milestones (25%, 50%, 75%, 100%) returned',
      pass: allFour && correctPercents,
      detail: `milestones: ${r.milestones.length}, percents: ${r.milestones.map(m => m.percent).join(',')}`,
    })
  }

  // Test 2: Already reached milestones are marked
  {
    // Net worth = 200k, monthly expenses = 2500 → fire target = 750k
    // 200k / 750k = 26.7% → 25% milestone should be reached
    const r = computeFreedomMilestones(200000, 2500, 1500)
    const m25 = r.milestones.find(m => m.percent === 25)
    results.push({
      test: '2. Past milestones marked as reached (25% with 26.7% freedom)',
      pass: m25?.reached === true && m25?.icon === 'check',
      detail: `25% reached: ${m25?.reached}, icon: ${m25?.icon}, currentPct: ${r.currentFreedomPct.toFixed(1)}`,
    })
  }

  // Test 3: Future milestones have projected dates
  {
    const r = computeFreedomMilestones(50000, 2500, 1500)
    const m50 = r.milestones.find(m => m.percent === 50)
    results.push({
      test: '3. Future milestones have projected dates',
      pass: m50?.reached === false && m50?.projectedDate !== null && m50?.monthsAway !== null && m50.monthsAway > 0,
      detail: `50% reached: ${m50?.reached}, date: ${m50?.projectedDate}, months: ${m50?.monthsAway}`,
    })
  }

  // Test 4: Contextual messages in Dutch
  {
    const r = computeFreedomMilestones(50000, 2500, 1500)
    const m50 = r.milestones.find(m => m.percent === 50)
    const hasMessage = m50?.message?.includes('Je bereikt 50% vrijheid rond') ?? false
    results.push({
      test: '4. Contextual milestone message in Dutch (Je bereikt X% vrijheid rond...)',
      pass: hasMessage,
      detail: `message: "${m50?.message}"`,
    })
  }

  // Test 5: Unreachable milestones when no savings
  {
    const r = computeFreedomMilestones(50000, 2500, 0) // zero savings
    const unreachable = r.milestones.filter(m => !m.reached && m.monthsAway === null)
    results.push({
      test: '5. Unreachable milestones when savings = 0',
      pass: unreachable.length > 0 && unreachable[0]?.icon === 'unreachable',
      detail: `unreachable count: ${unreachable.length}, icon: ${unreachable[0]?.icon}`,
    })
  }

  // Test 6: Negative savings = all future milestones unreachable
  {
    const r = computeFreedomMilestones(50000, 2500, -500) // negative savings
    const futureUnreachable = r.milestones.filter(m => !m.reached && m.monthsAway === null)
    results.push({
      test: '6. Negative savings: future milestones unreachable',
      pass: futureUnreachable.length > 0,
      detail: `unreachable: ${futureUnreachable.length}, messages: ${futureUnreachable.map(m => m.message).join('; ')}`,
    })
  }

  // Test 7: All milestones reached (100% freedom)
  {
    // Net worth = 1M, expenses = 2500/mo → fire target = 750k → 133% freedom → all reached
    const r = computeFreedomMilestones(1000000, 2500, 1500)
    results.push({
      test: '7. All milestones reached when freedom > 100%',
      pass: r.allReached === true && r.milestones.every(m => m.reached),
      detail: `allReached: ${r.allReached}, freedomPct: ${r.currentFreedomPct.toFixed(1)}%`,
    })
  }

  // Test 8: Next milestone correctly identified
  {
    // ~6.7% freedom → next milestone = 25%
    const r = computeFreedomMilestones(50000, 2500, 1500)
    results.push({
      test: '8. Next milestone correctly identified',
      pass: r.nextMilestone?.percent === 25,
      detail: `nextMilestone: ${r.nextMilestone?.percent}%, message: "${r.nextMilestone?.message}"`,
    })
  }

  // Test 9: Edge case: zero expenses (no FIRE target)
  {
    const r = computeFreedomMilestones(50000, 0, 1500)
    const allUnreachable = r.milestones.every(m => m.icon === 'unreachable')
    results.push({
      test: '9. Edge case: zero expenses → all milestones show guidance message',
      pass: allUnreachable && r.currentFreedomPct === 0,
      detail: `allUnreachable: ${allUnreachable}, freedomPct: ${r.currentFreedomPct}`,
    })
  }

  // Test 10: Milestone ordering is correct (25 < 50 < 75 < 100)
  {
    const r = computeFreedomMilestones(100000, 2500, 2000)
    const ordered = r.milestones.every((m, i) => i === 0 || m.percent > r.milestones[i - 1].percent)
    // Also check that reached milestones come before unreached
    let reachedThenUnreached = true
    let seenUnreached = false
    for (const m of r.milestones) {
      if (!m.reached) seenUnreached = true
      if (m.reached && seenUnreached) { reachedThenUnreached = false; break }
    }
    results.push({
      test: '10. Milestones ordered correctly and reached before unreached',
      pass: ordered && reachedThenUnreached,
      detail: `ordered: ${ordered}, reachedBeforeUnreached: ${reachedThenUnreached}, milestones: ${r.milestones.map(m => `${m.percent}%:${m.reached?'✓':'○'}`).join(', ')}`,
    })
  }

  // Test 11: Milestone target amounts are mathematically correct
  {
    const r = computeFreedomMilestones(50000, 2500, 1500)
    const fireTarget = (2500 * 12) / 0.04 // 750,000
    const m25target = r.milestones.find(m => m.percent === 25)?.targetNetWorth ?? 0
    const m50target = r.milestones.find(m => m.percent === 50)?.targetNetWorth ?? 0
    const m100target = r.milestones.find(m => m.percent === 100)?.targetNetWorth ?? 0
    results.push({
      test: '11. Milestone target amounts mathematically correct',
      pass: Math.abs(m25target - fireTarget * 0.25) < 1 && Math.abs(m50target - fireTarget * 0.5) < 1 && Math.abs(m100target - fireTarget) < 1,
      detail: `FIRE target: ${fireTarget}, 25%: ${m25target}, 50%: ${m50target}, 100%: ${m100target}`,
    })
  }

  // Test 12: Projections update when financial data changes (different inputs produce different dates)
  {
    const r1 = computeFreedomMilestones(50000, 2500, 1500) // lower savings
    const r2 = computeFreedomMilestones(50000, 2500, 3000) // higher savings
    const m50_1 = r1.milestones.find(m => m.percent === 50)?.monthsAway ?? Infinity
    const m50_2 = r2.milestones.find(m => m.percent === 50)?.monthsAway ?? Infinity
    results.push({
      test: '12. Higher savings → earlier milestone dates',
      pass: m50_2 < m50_1,
      detail: `50% with €1500 savings: ${m50_1} months, with €3000 savings: ${m50_2} months`,
    })
  }

  const passing = results.filter(r => r.pass).length

  return NextResponse.json({
    feature: '#225 - Freedom percentage milestone forecast',
    total: results.length,
    passing,
    failing: results.length - passing,
    allPass: passing === results.length,
    results,
  })
}
