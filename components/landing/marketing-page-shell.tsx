import type { ReactNode } from 'react'
import Link from 'next/link'
import { Header } from '@/components/landing/header'
import { Footer } from '@/components/landing/footer'

/**
 * MarketingPageShell — server-component chrome voor de publieke
 * (uitgelogde) info-/juridische pagina's (/privacy, /voorwaarden, /wft,
 * /over, /contact). Hergebruikt de landing Header + Footer zodat de
 * navigatie en de slot-CTA identiek zijn aan de homepage.
 *
 * Deze pagina's zijn siblings van app/page.tsx — BUITEN de (app)-route-
 * group — en dus publiek bereikbaar zonder login.
 *
 * Lay-out: smalle leeskolom (max-w-3xl) met ruime top-padding zodat de
 * vaste Header de eerste regels niet overlapt. De optionele {kicker} +
 * {title} renderen bovenaan een redactionele kop in de "Persoonlijk
 * Financieel Dagblad"-stijl van de landing.
 */
export function MarketingPageShell({
  title,
  kicker,
  children,
}: {
  title: string
  kicker?: string
  children: ReactNode
}) {
  return (
    <div className="bg-[var(--bg)] text-[var(--ink)]">
      <Header />
      <main className="mx-auto max-w-3xl px-6 pt-32 pb-24 md:px-12 md:pt-40">
        <header className="mb-12 border-b-2 border-[var(--ink)] pb-8">
          {kicker && (
            <p className="mb-4 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
              {kicker}
            </p>
          )}
          <h1 className="font-display text-[2.2rem] font-bold leading-tight tracking-[-0.02em] text-[var(--ink)] md:text-[3rem]">
            {title}
          </h1>
        </header>

        {children}
      </main>
      <Footer />
    </div>
  )
}

/**
 * MarketingWideShell — chrome voor de brede marketing-pagina's (home,
 * /functies, /prijzen, /veiligheid): skip-link + Header + volle-breedte
 * <main id="main-content"> + Footer (incl. SlotCta). Secties bepalen
 * zelf hun max-width, net als op de oorspronkelijke landing.
 */
export function MarketingWideShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[var(--bg)] text-[var(--ink)]">
      {/* Skip-link — eerste tab-stop voor keyboard- en screen-reader-gebruikers
          (WCAG 2.1 Bypass Blocks). sr-only verbergt visueel; focus:not-sr-only
          maakt zichtbaar bij focus. Target = #main-content op <main>. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:bg-[var(--paper)] focus:px-4 focus:py-2 focus:border-2 focus:border-[var(--ink)] focus:text-sm focus:font-medium focus:text-[var(--ink)] focus:no-underline"
      >
        Naar inhoud
      </a>
      <Header />
      <main id="main-content">{children}</main>
      <Footer />
    </div>
  )
}

/**
 * MarketingPageHero — redactionele pagina-kop voor de sub-pagina's van de
 * marketing-site (/functies, /prijzen, /veiligheid). Gecentreerd, met
 * ruime top-padding zodat de vaste Header niet overlapt, en standaard de
 * primaire "Begin gratis"-conversie onder de intro.
 */
export function MarketingPageHero({
  kicker,
  title,
  italics,
  intro,
  ctaLabel = 'Begin gratis',
  ctaHref = '/signup',
  showCta = true,
}: {
  kicker: string
  title: string
  italics?: string
  intro?: string
  ctaLabel?: string
  ctaHref?: string
  /** Uit te zetten op pagina's waar de content zelf de CTA is (bv. /prijzen-tiers). */
  showCta?: boolean
}) {
  return (
    <section className="px-6 pt-32 pb-4 text-center md:px-12 md:pt-40">
      <div className="mx-auto max-w-3xl">
        <p className="mb-4 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
          {kicker}
        </p>
        <h1 className="font-display text-[2.4rem] font-bold leading-[1.08] tracking-[-0.02em] text-[var(--ink)] md:text-[3.2rem]">
          {title}
          {italics && (
            <>
              {' '}
              <em className="italic text-kern-600">{italics}</em>
            </>
          )}
        </h1>
        {intro && (
          <p className="mx-auto mt-5 max-w-2xl font-serif text-lg leading-relaxed text-[var(--ink-2)]">
            {intro}
          </p>
        )}
        {showCta && (
          <div className="mt-8 flex flex-col items-center gap-3">
            <Link
              href={ctaHref}
              className="inline-flex items-center justify-center rounded-[var(--r)] bg-[var(--ink)] px-6 py-3.5 font-sans text-sm font-medium text-[var(--bg)] transition-all hover:bg-[var(--ink-2)] hover:shadow-[var(--s1)]"
            >
              {ctaLabel}
            </Link>
            <p className="font-sans text-xs text-[var(--ink-3)]">
              Klaar in ±5 minuten · geen creditcard nodig
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * Section — redactionele sectie met optionele h2-kop. De info-pagina's
 * gebruiken deze om de prose-stijl van de marketing-secties te spiegelen
 * (font-display kop, font-serif body in var(--ink-2)).
 */
export function MarketingSection({
  heading,
  children,
}: {
  heading?: string
  children: ReactNode
}) {
  return (
    <section className="mb-12 last:mb-0">
      {heading && (
        <h2 className="mb-4 font-display text-[1.4rem] font-bold leading-tight tracking-[-0.01em] text-[var(--ink)] md:text-[1.7rem]">
          {heading}
        </h2>
      )}
      <div className="space-y-4 font-serif text-base leading-relaxed text-[var(--ink-2)]">
        {children}
      </div>
    </section>
  )
}

/**
 * MarketingDisclaimer — kleine cursieve concept-melding bovenaan de
 * juridische pagina's.
 */
export function MarketingDisclaimer({ children }: { children: ReactNode }) {
  return (
    <p className="mb-10 rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)] px-4 py-3 font-serif text-sm italic leading-relaxed text-[var(--ink-3)]">
      {children}
    </p>
  )
}
