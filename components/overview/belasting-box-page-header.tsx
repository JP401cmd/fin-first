import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PAGE_INFO } from '@/lib/page-info-content'

/**
 * Gedeelde editorial-header voor de box-subpagina's onder
 * /overzicht/belasting. Geeft elke box-pagina dezelfde context: een
 * terug-naar-hub-link, een "Box N"-kicker (violet, de belasting-tint),
 * titel + één-zin-uitleg, en rechtsboven de PageInfoButton.
 */
export function BelastingBoxPageHeader({
  number,
  title,
  subtitle,
  infoKey,
}: {
  /** '1' | '2' | '3'. */
  number: string
  title: string
  subtitle: string
  /** Sleutel in PAGE_INFO, bv. '/overzicht/belasting/box1'. */
  infoKey: string
}) {
  return (
    <section className="relative mx-auto max-w-6xl px-4 pt-4 pb-3 sm:px-6">
      <PageInfoButton
        description={PAGE_INFO[infoKey] ?? ''}
        className="absolute right-4 top-4 sm:right-6"
      />
      <Link
        href="/overzicht/belasting"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        Belasting
      </Link>
      <div className="mt-2 text-[10px] uppercase tracking-[0.12em] font-semibold text-violet-700">
        Box {number}
      </div>
      <h1 className="font-serif text-2xl text-[var(--ink)] mt-0.5">{title}</h1>
      <p className="mt-1 text-sm text-[var(--ink-2)] max-w-2xl leading-snug">{subtitle}</p>
    </section>
  )
}
