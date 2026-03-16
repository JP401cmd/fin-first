'use client'

import { Lightbulb } from 'lucide-react'

interface GuideHowToProps {
  steps: string[]
  tip?: string
  color?: string
}

/**
 * Numbered step-by-step instructions with optional tip box.
 * Used inside GuideTopicCard as the "Hoe werkt het?" dropdown content.
 */
export default function GuideHowTo({ steps, tip, color = 'var(--ink)' }: GuideHowToProps) {
  return (
    <div className="space-y-3">
      {/* Numbered steps */}
      <div className="space-y-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <div
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
              style={{ backgroundColor: color }}
            >
              {i + 1}
            </div>
            <p className="text-[12px] leading-relaxed text-[var(--ink-2)]">{step}</p>
          </div>
        ))}
      </div>

      {/* Optional tip */}
      {tip && (
        <div className="flex items-start gap-2 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)]/40 p-2.5">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <p className="text-[11px] leading-relaxed text-[var(--ink-3)] italic">
            {tip}
          </p>
        </div>
      )}
    </div>
  )
}
