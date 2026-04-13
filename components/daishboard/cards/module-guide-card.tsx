'use client'

import Link from 'next/link'
import { X, Check, Circle } from 'lucide-react'
import { BriefingCard } from '../briefing-card'
import { useModuleGuideState } from '@/lib/hooks/use-module-guide-state'
import type { ModuleGuideCardSpec } from '@/lib/briefing/types'
import type { ModuleId } from '@/lib/module-registry'

// ── Module → card accent mapping ──────────────────────────────

const MODULE_ACCENT: Record<ModuleId, 'kern' | 'wil' | 'horizon' | 'cross'> = {
  budgetteren: 'kern',
  vermogensregistratie: 'kern',
  aandelenregistratie: 'kern',
  inzicht_acties: 'wil',
  toekomstplannen: 'horizon',
  nieuws: 'cross',
}

// ── Component ─────────────────────────────────────────────────

interface Props {
  spec: ModuleGuideCardSpec
}

export function ModuleGuideCard({ spec }: Props) {
  const { toggleStep, dismissCard, isStepComplete } = useModuleGuideState()
  const cardModule = MODULE_ACCENT[spec.moduleId] ?? 'cross'

  return (
    <BriefingCard module={cardModule}>
      {/* Header: title + dismiss button */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-sm font-semibold text-[var(--ink)]">{spec.title}</p>
        <button
          type="button"
          onClick={() => dismissCard(spec.moduleId)}
          className="shrink-0 p-0.5 rounded text-[var(--ink-4)] hover:text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
          aria-label="Verberg kaart"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Steps list */}
      <ul className="space-y-1.5">
        {spec.steps.map((step) => {
          const done = isStepComplete(spec.moduleId, step.key)

          const stepContent = (
            <li key={step.key} className="flex items-start gap-2 text-xs group/item">
              {/* Clickable check circle */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  toggleStep(spec.moduleId, step.key)
                }}
                className="shrink-0 mt-0.5 p-0 border-0 bg-transparent cursor-pointer"
                aria-label={done ? `Markeer "${step.label}" als niet afgerond` : `Markeer "${step.label}" als afgerond`}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-[var(--ink-4)] hover:text-emerald-400 transition-colors" />
                )}
              </button>

              {/* Step label */}
              <span
                className={
                  done
                    ? 'text-[var(--ink-4)] line-through'
                    : 'text-[var(--ink-2)] group-hover/item:text-[var(--ink)]'
                }
              >
                {step.label}
              </span>
            </li>
          )

          // Uncompleted steps with href are clickable links
          if (step.href && !done) {
            return (
              <Link
                key={step.key}
                href={step.href}
                className="block hover:bg-[var(--subtle)]/50 rounded -mx-1 px-1"
              >
                {stepContent}
              </Link>
            )
          }

          return <div key={step.key}>{stepContent}</div>
        })}
      </ul>
    </BriefingCard>
  )
}
