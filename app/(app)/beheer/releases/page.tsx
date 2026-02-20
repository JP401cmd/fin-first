'use client'

import { useState } from 'react'
import { RELEASE_NOTES, type ReleaseNote, type ReleaseSection } from '@/lib/release-notes'
import { ChevronDown, ChevronUp, Tag } from 'lucide-react'

const MODULE_COLORS: Record<string, { badge: string; dot: string }> = {
  amber: { badge: 'bg-kern-50 text-kern-700 border-kern-200', dot: 'bg-kern-500' },
  teal: { badge: 'bg-wil-50 text-wil-700 border-wil-200', dot: 'bg-wil-500' },
  purple: { badge: 'bg-horizon-50 text-horizon-700 border-horizon-200', dot: 'bg-horizon-500' },
  blue: { badge: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  zinc: { badge: 'bg-zinc-100 text-[var(--ink-2)] border-[var(--border-ed)]', dot: 'bg-[var(--subtle)]0' },
  rose: { badge: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
}

export default function BeheerReleasesPage() {
  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5 text-[var(--ink-3)]" />
          <h2 className="text-xl font-bold text-[var(--ink)]">Release Notes</h2>
        </div>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Versiegeschiedenis en wijzigingen per release
        </p>
      </div>

      <div className="space-y-4">
        {RELEASE_NOTES.map((release, i) => (
          <ReleaseCard key={release.version} release={release} defaultOpen={i === 0} />
        ))}
      </div>
    </div>
  )
}

function ReleaseCard({ release, defaultOpen }: { release: ReleaseNote; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const totalItems = release.sections.reduce((sum, s) => sum + s.items.length, 0)

  return (
    <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-[var(--subtle)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-md border border-[var(--border-md)] bg-[var(--subtle)] px-2.5 py-1 text-xs font-bold font-mono text-[var(--ink-2)]">
            {release.version}
          </span>
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">{release.title}</p>
            <p className="text-xs text-[var(--ink-3)]">
              {new Date(release.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
              {' '}&middot;{' '}
              {totalItems} wijziging{totalItems !== 1 ? 'en' : ''}
              {' '}&middot;{' '}
              {release.sections.length} module{release.sections.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" /> : <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" />}
      </button>

      {open && (
        <div className="border-t border-[var(--border-ed)] px-6 py-5 space-y-5">
          {release.sections.map((section) => (
            <ReleaseSectionBlock key={section.module} section={section} />
          ))}
        </div>
      )}
    </div>
  )
}

function ReleaseSectionBlock({ section }: { section: ReleaseSection }) {
  const colors = MODULE_COLORS[section.color] ?? MODULE_COLORS.zinc

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
        <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${colors.badge}`}>
          {section.module}
        </span>
        <span className="text-xs text-[var(--ink-3)]">{section.items.length} item{section.items.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="ml-4 space-y-2">
        {section.items.map((item) => (
          <div key={item.title} className="rounded-lg bg-[var(--subtle)] px-4 py-3">
            <p className="text-sm font-medium text-zinc-800">{item.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-3)]">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
