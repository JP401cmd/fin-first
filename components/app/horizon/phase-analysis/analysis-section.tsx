'use client'

import { useState, memo, type ReactNode } from 'react'
import { ChevronRight, ChevronDown, type LucideIcon } from 'lucide-react'
import { AskWillButton } from './ask-will-button'

// ── Types ────────────────────────────────────────────────────────────────────

interface AnalysisSectionProps {
  title: string
  icon?: LucideIcon
  /** Start open? Default false */
  defaultOpen?: boolean
  /** Show loading skeleton instead of children */
  loading?: boolean
  /** Context string sent to Will when "Vraag Will" is clicked */
  willContext?: string
  children: ReactNode
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function AnalysisSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-3 w-3/4 rounded bg-[var(--subtle)]" />
      <div className="h-24 w-full rounded bg-[var(--subtle)]" />
      <div className="h-3 w-1/2 rounded bg-[var(--subtle)]" />
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Collapsible wrapper for each analysis block inside phase modals.
 * Follows the existing dashed-border collapsible pattern from phase-modal-opbouw,
 * upgraded with a solid border, icon support, and an optional "Vraag Will" CTA.
 */
export const AnalysisSection = memo(function AnalysisSection({
  title,
  icon,
  defaultOpen = false,
  loading = false,
  willContext,
  children,
}: AnalysisSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  // Render the icon via a local variable so JSX can use it as a component
  const Icon = icon

  return (
    <div className="mt-4 rounded-[var(--r)] border border-[var(--border-ed)]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex min-h-[44px] w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[var(--subtle)]/40"
        aria-expanded={open}
      >
        {Icon && <Icon className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />}
        <span className="flex-1 text-[13px] font-semibold text-[var(--ink)]">
          {title}
        </span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-[var(--ink-3)] transition-transform duration-150" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-3)] transition-transform duration-150" />
        )}
      </button>

      {open && (
        <div className="border-t border-[var(--border-ed)] px-3 pb-4 pt-3">
          {loading ? <AnalysisSkeleton /> : children}

          {/* "Vraag Will" CTA — only when context is provided and not loading */}
          {willContext && !loading && (
            <div className="mt-3 flex justify-end">
              <AskWillButton context={willContext} />
            </div>
          )}
        </div>
      )}
    </div>
  )
})
