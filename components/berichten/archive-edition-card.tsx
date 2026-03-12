import { CategoryBadge, CATEGORY_CONFIG } from './news-components'

interface EditionSummary {
  id: string
  edition_nr: number
  jaargang: number
  article_count: number
  hero_headline: string
  created_at: string
}

interface ArchiveEditionCardProps {
  edition: EditionSummary
  onClick: (editionNr: number) => void
}

export function ArchiveEditionCard({ edition, onClick }: ArchiveEditionCardProps) {
  const date = new Date(edition.created_at).toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <button
      type="button"
      onClick={() => onClick(edition.edition_nr)}
      className="flex w-full flex-col items-start gap-2 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 text-left shadow-[var(--s0)] transition-all hover:shadow-[var(--s1)] active:scale-[0.99]"
    >
      <div className="flex w-full items-center justify-between">
        <span className="font-inter text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
          Editie {edition.edition_nr}
        </span>
        <span className="rounded-full bg-[var(--subtle)] px-2 py-0.5 font-inter text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--ink-4)]">
          Jaargang {edition.jaargang}
        </span>
      </div>

      <p className="font-source-serif text-[12px] italic capitalize text-[var(--ink-3)]">
        {date}
      </p>

      <h3 className="font-source-serif text-base font-semibold leading-snug text-[var(--ink)]">
        {edition.hero_headline}
      </h3>

      <p className="font-inter text-[11px] text-[var(--ink-4)]">
        {edition.article_count} {edition.article_count === 1 ? 'artikel' : 'artikelen'}
      </p>
    </button>
  )
}

export type { EditionSummary }
