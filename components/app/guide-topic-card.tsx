'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import GuideHowTo from '@/components/app/guide-how-to'

interface GuideTopicCardProps {
  icon: LucideIcon
  title: string
  /** Bold value-first sentence shown above the description */
  valueText?: string
  description: ReactNode
  howTo?: { steps: string[]; tip?: string }
  color: string
}

/**
 * Two-level card:
 * - Level 1: icon, title, value-first description (always visible)
 * - Level 2: collapsible "Hoe werkt het?" dropdown with GuideHowTo
 *
 * Each card has its own open/close state (no single-accordion constraint).
 */
export default function GuideTopicCard({
  icon: Icon,
  title,
  valueText,
  description,
  howTo,
  color,
}: GuideTopicCardProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="card-editorial overflow-hidden">
      {/* Level 1: icon + title + description */}
      <div className="flex items-start gap-3 p-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[var(--subtle)]"
          style={{ color }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[var(--ink)]">{title}</p>
          {valueText && (
            <p className="mt-1 text-base font-medium leading-relaxed text-[var(--ink)]">
              {valueText}
            </p>
          )}
          <div className="mt-1 text-base leading-relaxed text-[var(--ink-2)]">
            {description}
          </div>
        </div>
      </div>

      {/* Level 2: "Hoe werkt het?" collapsible (only when howTo provided) */}
      {howTo && (
        <div className="border-t border-[var(--border-ed)]">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex w-full items-center gap-2 px-3 py-2 min-h-[44px] text-left transition-colors hover:bg-[var(--subtle)]/40"
            aria-expanded={open}
          >
            <span className="text-[11px] font-semibold text-[var(--ink-3)]">
              Hoe werkt het?
            </span>
            <ChevronDown
              className={`h-3 w-3 shrink-0 text-[var(--ink-4)] transition-transform duration-200 ${
                open ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Animated dropdown content */}
          <div
            className="grid transition-[grid-template-rows] duration-200 ease-in-out"
            style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden">
              <div className="px-3 pb-3">
                <GuideHowTo steps={howTo.steps} tip={howTo.tip} color={color} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
