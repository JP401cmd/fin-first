'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import type { HelpEntry, HelpScreenshot } from '@/lib/briefing/guide-help'

interface StepHelpSheetProps {
  open: boolean
  onClose: () => void
  helpKey: string
  stepLabel: string
  /**
   * Optioneel — als de gebruiker super-admin is, tonen we een
   * "Bewerk in beheer →"-link in de empty-state. Default false.
   */
  isAdmin?: boolean
}

/**
 * User-facing sheet die de uitleg + how-to + screenshots toont voor één
 * post-onboarding stap. Wordt geopend vanuit de Info-knop in StepList.
 *
 * Driewegregel: `kind="sheet"` — single-information context, gebruiker
 * keert na lezen terug naar dezelfde card op /will.
 */
export function StepHelpSheet({
  open,
  onClose,
  helpKey,
  stepLabel,
  isAdmin = false,
}: StepHelpSheetProps) {
  const [entry, setEntry] = useState<HelpEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const res = await fetch('/api/guide-help')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = (await res.json()) as Record<string, HelpEntry>
        if (cancelled) return
        setEntry(blob[helpKey] ?? null)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Kon uitleg niet laden')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, helpKey])

  return (
    <ShellOverlay open={open} onClose={onClose} kind="sheet" size="lg" title={stepLabel}>
      <div className="space-y-5 px-1 pb-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
          <span
            aria-hidden
            className="inline-block w-7 h-px bg-[var(--module-active-500)] mr-2.5 align-middle"
          />
          Uitleg
        </p>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-[var(--ink-3)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uitleg laden…
          </div>
        ) : error ? (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : !entry || (!entry.explanation && !entry.howTo && entry.screenshots.length === 0) ? (
          <EmptyState helpKey={helpKey} isAdmin={isAdmin} />
        ) : (
          <div className="space-y-6">
            {entry.explanation && (
              <Section title="Wat is dit?">
                <p className="text-base leading-relaxed text-[var(--ink-2)]">
                  {entry.explanation}
                </p>
              </Section>
            )}

            {entry.howTo && (
              <Section title="Hoe doe je dit?">
                <p className="whitespace-pre-line text-base leading-relaxed text-[var(--ink-2)]">
                  {entry.howTo}
                </p>
              </Section>
            )}

            {entry.screenshots.length > 0 && (
              <Section title="Screenshots">
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {entry.screenshots.map((s) => (
                    <ScreenshotItem key={s.filename} screenshot={s} />
                  ))}
                </ul>
              </Section>
            )}
          </div>
        )}
      </div>
    </ShellOverlay>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
        {title}
      </h3>
      {children}
    </section>
  )
}

function EmptyState({ helpKey, isAdmin }: { helpKey: string; isAdmin: boolean }) {
  return (
    <div className="rounded border border-dashed border-[var(--border-md)] px-4 py-8 text-center">
      <p className="font-serif italic text-sm text-[var(--ink-3)]">
        Nog geen uitleg beschreven voor deze stap.
      </p>
      {isAdmin && (
        <Link
          href={`/beheer/module-guide?helpKey=${encodeURIComponent(helpKey)}`}
          className="mt-3 inline-block text-xs underline-offset-4 text-[var(--module-active-700)] hover:underline"
        >
          Voeg uitleg toe in beheer →
        </Link>
      )}
    </div>
  )
}

function ScreenshotItem({ screenshot }: { screenshot: HelpScreenshot }) {
  return (
    <li>
      <a
        href={screenshot.url}
        target="_blank"
        rel="noreferrer"
        className="block group"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={screenshot.url}
          alt={screenshot.caption ?? ''}
          className="w-full border border-[var(--border-ed)] transition-opacity group-hover:opacity-90"
        />
        {screenshot.caption && (
          <p className="mt-1.5 font-serif italic text-xs text-[var(--ink-3)]">
            {screenshot.caption}
          </p>
        )}
      </a>
    </li>
  )
}
