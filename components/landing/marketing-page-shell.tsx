import type { ReactNode } from 'react'
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
 * Section — redactionele sectie met optionele h2-kop. De info-pagina's
 * gebruiken deze om de prose-stijl van components/landing/features.tsx te
 * spiegelen (font-display kop, font-serif body in var(--ink-2)).
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
