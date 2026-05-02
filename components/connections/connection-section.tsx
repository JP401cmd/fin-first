'use client'

import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'

interface ConnectionSectionProps {
  title: string
  description?: string
  addLabel?: string
  onAdd?: () => void
  children: ReactNode
}

export function ConnectionSection({
  title,
  description,
  addLabel,
  onAdd,
  children,
}: ConnectionSectionProps) {
  return (
    <section className="mb-8">
      <header className="mb-3 flex items-end justify-between gap-4 border-b border-[var(--border-ed)] pb-2">
        <div className="min-w-0">
          <h3 className="font-display text-[18px] font-semibold text-[var(--ink)]" style={{ letterSpacing: '-0.01em' }}>
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 font-serif italic text-[13px] text-[var(--ink-3)]">{description}</p>
          )}
        </div>
        {onAdd && addLabel && (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex shrink-0 items-center gap-1.5 border border-[var(--border-md)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition-all hover:-translate-y-px hover:bg-[var(--subtle)] hover:shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {addLabel}
          </button>
        )}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
