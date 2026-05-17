'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { FreedomCardGenerator } from '@/components/app/freedom-card'
import { ChevronRight, Share2 } from 'lucide-react'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { WidgetEmpty } from '@/components/widgets/widget-empty'

export default function DelenPage() {
  const generatorRef = useRef<HTMLDivElement>(null)

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
      <NavStackMeta title="Delen" bottomBar={{ kind: 'tabs' }} />
      {/* Editorial header — blueprint Type 8 (Settings) */}
      <header className="mb-5 sm:mb-8 space-y-2">
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
          Identiteit · delen
        </div>
        <h1
          className="font-bold text-3xl tracking-[-0.02em]"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          Deel je{' '}
          <em
            className="font-normal italic"
            style={{ color: 'var(--module-active-700)' }}
          >
            voortgang
          </em>
        </h1>
        <p
          className="italic text-[14px] leading-snug text-[var(--ink-2)] pl-4 mt-2"
          style={{
            fontFamily: 'var(--font-source-serif, Georgia, serif)',
            borderLeft: '2px solid var(--module-active-500)',
          }}
        >
          Deel je voortgang en bekijk je jaaroverzicht.
        </p>
      </header>

      {/* ── First-use empty state ──────────────────────────────── */}
      <section className="mb-5 sm:mb-8 rounded-2xl border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]">
        <WidgetEmpty
          variant="first-use"
          icon={Share2}
          title="Nog geen content gedeeld"
          description="Maak een vrijheidskaart aan om je financiële voortgang te delen met vrienden en familie."
          action={{
            label: 'Maak je vrijheidskaart',
            onClick: () => {
              generatorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            },
          }}
        />
      </section>

      {/* ── Vrijheidskaart ──────────────────────────────────────── */}
      <section
        ref={generatorRef}
        className="mb-5 sm:mb-8 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-8 scroll-mt-24"
      >
        <h2 className="label-editorial text-[var(--ink-2)]">
          Vrijheidskaart Delen
        </h2>
        <p className="mt-1 mb-3 sm:mb-6 text-sm text-[var(--ink-3)]">
          Genereer een deelbare kaart met je vrijheidsvoortgang. Kies je privacyniveau
          om te bepalen welke informatie zichtbaar is.
        </p>

        <FreedomCardGenerator />
      </section>

      {/* ── Jaaroverzicht link ──────────────────────────────────── */}
      <Link
        href="/identity/jaaroverzicht"
        className="group mb-5 sm:mb-8 flex items-center justify-between rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 transition-all hover:border-wil-300 hover:shadow-sm sm:p-8"
      >
        <div>
          <h2 className="label-editorial text-[var(--ink-2)]">
            Jaaroverzicht
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Bekijk je volledige financiele jaaroverzicht met statistieken en hoogtepunten.
          </p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-[var(--ink-4)] transition-colors group-hover:text-wil-500" />
      </Link>
    </div>
  )
}
