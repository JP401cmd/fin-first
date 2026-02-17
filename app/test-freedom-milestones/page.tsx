'use client'

import { JouwPadWidget } from '@/components/app/jouw-pad-widget'
import { computeFreedomMilestones } from '@/lib/freedom-milestones'

export default function TestFreedomMilestonesPage() {
  // Scenario 1: Early stage - no milestones reached, positive savings
  const s1 = computeFreedomMilestones(50000, 2500, 1500)

  // Scenario 2: 25% reached, progress towards 50%
  const s2 = computeFreedomMilestones(200000, 2500, 2000)

  // Scenario 3: All milestones reached (100%+ freedom)
  const s3 = computeFreedomMilestones(1000000, 2500, 1500)

  // Scenario 4: No savings - milestones unreachable
  const s4 = computeFreedomMilestones(50000, 2500, 0)

  // Scenario 5: Zero expenses
  const s5 = computeFreedomMilestones(50000, 0, 1500)

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-bold text-zinc-900">Freedom Milestone Forecast Test</h1>
      <p className="mb-8 text-sm text-zinc-500">Feature #225: Project when user will reach 25%, 50%, 75%, 100% freedom</p>

      <div className="space-y-8">
        {/* Scenario 1 */}
        <div>
          <h2 className="mb-1 text-sm font-semibold text-zinc-700">Scenario 1: Early Stage (6.7% freedom, €1500/mo savings)</h2>
          <p className="mb-2 text-xs text-zinc-400">No milestones reached yet, all projected in the future</p>
          <JouwPadWidget
            level={2}
            phase="stability"
            freedomPct={s1.currentFreedomPct}
            netWorth={50000}
            monthsCovered={20}
            milestones={s1.milestones}
            nextMilestoneMessage={s1.nextMilestone?.message ?? null}
          />
        </div>

        {/* Scenario 2 */}
        <div>
          <h2 className="mb-1 text-sm font-semibold text-zinc-700">Scenario 2: 25% Reached (26.7% freedom, €2000/mo savings)</h2>
          <p className="mb-2 text-xs text-zinc-400">First milestone reached, others projected</p>
          <JouwPadWidget
            level={3}
            phase="momentum"
            freedomPct={s2.currentFreedomPct}
            netWorth={200000}
            monthsCovered={80}
            milestones={s2.milestones}
            nextMilestoneMessage={s2.nextMilestone?.message ?? null}
          />
        </div>

        {/* Scenario 3 */}
        <div>
          <h2 className="mb-1 text-sm font-semibold text-zinc-700">Scenario 3: All Reached (100%+ freedom)</h2>
          <p className="mb-2 text-xs text-zinc-400">All milestones achieved — full financial freedom!</p>
          <JouwPadWidget
            level={6}
            phase="mastery"
            freedomPct={100}
            netWorth={1000000}
            monthsCovered={400}
            milestones={s3.milestones}
            nextMilestoneMessage={s3.nextMilestone?.message ?? null}
          />
        </div>

        {/* Scenario 4 */}
        <div>
          <h2 className="mb-1 text-sm font-semibold text-zinc-700">Scenario 4: No Savings (€0/mo savings)</h2>
          <p className="mb-2 text-xs text-zinc-400">Milestones unreachable without positive savings</p>
          <JouwPadWidget
            level={2}
            phase="stability"
            freedomPct={6.7}
            netWorth={50000}
            monthsCovered={20}
            milestones={s4.milestones}
            nextMilestoneMessage={s4.nextMilestone?.message ?? null}
          />
        </div>

        {/* Scenario 5 */}
        <div>
          <h2 className="mb-1 text-sm font-semibold text-zinc-700">Scenario 5: Zero Expenses</h2>
          <p className="mb-2 text-xs text-zinc-400">Edge case: no expenses means no FIRE target</p>
          <JouwPadWidget
            level={0}
            phase="recovery"
            freedomPct={0}
            netWorth={50000}
            monthsCovered={0}
            milestones={s5.milestones}
            nextMilestoneMessage={s5.nextMilestone?.message ?? null}
          />
        </div>
      </div>
    </div>
  )
}
