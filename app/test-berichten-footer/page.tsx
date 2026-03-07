'use client'

import Link from 'next/link'
import { Loader2 } from 'lucide-react'

function NewspaperFooter() {
  return (
    <footer className="mt-12">
      {/* Double rule — matches masthead style */}
      <div className="h-px bg-[var(--ink)]" />
      <div className="mt-[3px] h-[2px] bg-[var(--ink)]" />

      <div className="flex flex-col items-center gap-4 py-6 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
        {/* Editorial closing quote */}
        <p className="font-source-serif text-sm italic leading-relaxed text-[var(--ink-3)]">
          &ldquo;Geld is opgeslagen tijd &mdash; elke euro vertegenwoordigt een stukje levenstijd.&rdquo;
        </p>

        {/* Link to briefing */}
        <Link
          href="/daishboard"
          className="shrink-0 font-source-serif text-sm italic text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
        >
          Naar Will&apos;s Briefing &rarr;
        </Link>
      </div>
    </footer>
  )
}

function NewsSkeletonLoader() {
  return (
    <div>
      {/* Hero article skeleton */}
      <div className="mb-8">
        {/* Category tag placeholder */}
        <div className="mb-3 flex items-center gap-3">
          <div className="h-5 w-20 animate-pulse rounded-full bg-[var(--subtle)]" />
          <div className="h-3 w-24 animate-pulse rounded bg-[var(--subtle)]" />
        </div>

        {/* Large headline placeholder */}
        <div className="space-y-2">
          <div className="h-7 w-full animate-pulse rounded bg-[var(--subtle)] sm:h-9" />
          <div className="h-7 w-3/4 animate-pulse rounded bg-[var(--subtle)] sm:h-9" />
        </div>

        {/* Summary text placeholder */}
        <div className="mt-3 space-y-1.5">
          <div className="h-4 w-full animate-pulse rounded bg-[var(--subtle)]" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-[var(--subtle)]" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--subtle)]" />
        </div>

        {/* Date placeholder */}
        <div className="mt-3 h-3 w-32 animate-pulse rounded bg-[var(--subtle)]" />

        {/* Impact block placeholder */}
        <div className="mt-3 rounded-[var(--r)] border-l-3 border-[var(--subtle)] bg-[var(--subtle)]/30 px-4 py-3">
          <div className="mb-1 h-3 w-24 animate-pulse rounded bg-[var(--subtle)]" />
          <div className="h-3 w-full animate-pulse rounded bg-[var(--subtle)]" />
        </div>

        {/* Divider */}
        <div className="mt-6 h-px bg-[var(--border-ed)]" />
      </div>

      {/* Grid article skeletons (2-column on desktop) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 shadow-[var(--s0)]"
          >
            {/* Category tag placeholder */}
            <div className="mb-2.5 h-5 w-20 animate-pulse rounded-full bg-[var(--subtle)]" />

            {/* Headline placeholder */}
            <div className="space-y-1.5">
              <div className="h-5 w-full animate-pulse rounded bg-[var(--subtle)]" />
              <div className="h-5 w-2/3 animate-pulse rounded bg-[var(--subtle)]" />
            </div>

            {/* Summary placeholder */}
            <div className="mt-2 space-y-1">
              <div className="h-3 w-full animate-pulse rounded bg-[var(--subtle)]" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-[var(--subtle)]" />
            </div>

            {/* Date placeholder */}
            <div className="mt-2 h-3 w-24 animate-pulse rounded bg-[var(--subtle)]" />
          </div>
        ))}
      </div>

      {/* Loading indicator */}
      <div className="flex items-center justify-center gap-2 py-6">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--ink-3)]" />
        <p className="font-source-serif text-sm italic text-[var(--ink-3)]">
          Nieuws wordt gepersonaliseerd&hellip;
        </p>
      </div>
    </div>
  )
}

export default function TestBerichtenFooterPage() {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-6 md:px-8">
      <h1 className="font-display text-2xl font-bold text-[var(--ink)]">
        Test: Berichten Footer &amp; Skeleton
      </h1>
      <p className="mt-2 text-sm text-[var(--ink-2)]">
        This page verifies the newspaper-style footer and loading skeleton render correctly.
      </p>

      {/* Skeleton loader */}
      <h2 className="mt-8 font-display text-lg font-semibold text-[var(--ink)]">
        News Skeleton Loader
      </h2>
      <div className="mt-4">
        <NewsSkeletonLoader />
      </div>

      {/* The footer component */}
      <NewspaperFooter />
    </div>
  )
}
