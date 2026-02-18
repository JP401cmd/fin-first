'use client'

import { JouwPadWidget } from '@/components/app/jouw-pad-widget'

export default function TestJouwPadPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-8 text-2xl font-bold text-zinc-900">Jouw Pad Widget Test</h1>

      <div className="space-y-6">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-zinc-500">Recovery Phase (Level 0)</h2>
          <JouwPadWidget level={0} phase="recovery" freedomPct={0} />
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold text-zinc-500">Stability Phase (Level 2)</h2>
          <JouwPadWidget level={2} phase="stability" freedomPct={5.2} />
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold text-zinc-500">Momentum Phase (Level 3)</h2>
          <JouwPadWidget level={3} phase="momentum" freedomPct={15.5} />
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold text-zinc-500">Mastery Phase (Level 5)</h2>
          <JouwPadWidget level={5} phase="mastery" freedomPct={82.3} />
        </div>
      </div>
    </div>
  )
}
