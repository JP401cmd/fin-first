import type { ReactNode } from 'react'
import Link from 'next/link'

/**
 * SlotCta — afsluitende conversie-strook boven de footer. Wordt vanuit
 * Footer gerenderd zodat élke marketing-pagina (home, /functies,
 * /prijzen, /veiligheid én de info-pagina's) met dezelfde CTA eindigt.
 * Props zijn optioneel; defaults = de oorspronkelijke landing-copy.
 */
export function SlotCta({
  kicker = 'Klaar om te beginnen?',
  titel,
  body,
  ctaLabel = 'Begin gratis',
  ctaHref = '/signup',
}: {
  kicker?: string
  titel?: ReactNode
  body?: ReactNode
  ctaLabel?: string
  ctaHref?: string
}) {
  return (
    <section className="border-t-2 border-[var(--ink)] bg-[var(--ink)] px-6 py-16 md:px-12 md:py-20">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-4 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--bg)]/60">
          {kicker}
        </p>
        <h2 className="mb-6 font-display text-[2rem] font-bold leading-tight tracking-[-0.02em] text-[var(--bg)] md:text-[2.6rem]">
          {titel ?? (
            <>
              Maak van geld{' '}
              <em className="italic text-kern-300">opgeslagen tijd</em>
            </>
          )}
        </h2>
        <p className="mx-auto mb-8 max-w-xl font-serif text-base leading-relaxed text-[var(--bg)]/80">
          {body ?? (
            <>
              Probeer TriFinity gratis. Geen creditcard, geen trial die afloopt
              &mdash; alleen helderheid in je financiën, vanaf de eerste sessie.
            </>
          )}
        </p>
        <Link
          href={ctaHref}
          className="inline-flex items-center justify-center rounded-[var(--r)] bg-[var(--bg)] px-7 py-3.5 font-sans text-sm font-medium text-[var(--ink)] transition-all hover:bg-[var(--paper)] hover:shadow-[var(--s2)]"
        >
          {ctaLabel}
        </Link>
      </div>
    </section>
  )
}
