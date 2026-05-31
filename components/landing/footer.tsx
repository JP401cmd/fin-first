import Link from 'next/link'

/**
 * Footer — drie-koloms layout met Producten / Hulp / Bedrijf.
 * Geen GitHub-link (productowner-beslissing 31 mei 2026: geen
 * open-source-positionering).
 *
 * Boven de footer staat de SlotCta-strook met de laatste mid-page
 * conversie. Beide hier samen zodat ze als één unit door page.tsx
 * geconsumeerd worden.
 */

function SlotCta() {
  return (
    <section className="border-t-2 border-[var(--ink)] bg-[var(--ink)] px-6 py-16 md:px-12 md:py-20">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-4 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--bg)]/60">
          Klaar om te beginnen?
        </p>
        <h2 className="mb-6 font-display text-[2rem] font-bold leading-tight tracking-[-0.02em] text-[var(--bg)] md:text-[2.6rem]">
          Maak van geld{' '}
          <em className="italic text-kern-300">opgeslagen tijd</em>
        </h2>
        <p className="mx-auto mb-8 max-w-xl font-serif text-base leading-relaxed text-[var(--bg)]/80">
          Probeer TriFinity gratis. Geen creditcard, geen trial die afloopt
          &mdash; alleen helderheid in je financiën, vanaf de eerste sessie.
        </p>
        <Link
          href="/signup"
          className="inline-flex items-center justify-center rounded-[var(--r)] bg-[var(--bg)] px-7 py-3.5 font-sans text-sm font-medium text-[var(--ink)] transition-all hover:bg-[var(--paper)] hover:shadow-[var(--s2)]"
        >
          Begin gratis
        </Link>
      </div>
    </section>
  )
}

const PRODUCTEN = [
  { label: 'Het Overzicht', href: '/#modules' },
  { label: 'De Toekomst', href: '/#modules' },
  { label: 'Rekenhulp-bibliotheek', href: '/toekomst/bibliotheek' },
  { label: 'Will — AI-coach', href: '/#coach' },
]

const HULP = [
  { label: 'Veelgestelde vragen', href: '/#faq' },
  { label: 'Status', href: '/status' },
  { label: 'Contact', href: '/contact' },
]

const BEDRIJF = [
  { label: 'Over TriFinity', href: '/over' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Algemene voorwaarden', href: '/voorwaarden' },
  { label: 'Wft-disclaimer', href: '/wft' },
]

function FooterColumn({
  titel,
  items,
}: {
  titel: string
  items: { label: string; href: string }[]
}) {
  return (
    <div>
      <h3 className="mb-3 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
        {titel}
      </h3>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.label}>
            <Link
              href={it.href}
              className="font-serif text-sm text-[var(--ink-3)] hover:text-[var(--ink)] hover:underline"
            >
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Footer() {
  return (
    <>
      <SlotCta />

      <footer className="border-t border-[var(--border-md)] bg-[var(--bg)] px-6 py-12 md:px-12 md:py-16">
        <div className="mx-auto max-w-6xl">
          {/* Vier kolommen: wordmark + 3 link-kolommen */}
          <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
            <div>
              {/* Wordmark */}
              <div className="mb-3 flex items-center">
                <span className="font-display text-[22px] font-bold leading-none text-[var(--ink)]">t</span>
                <span className="font-display text-[22px] font-bold leading-none text-kern-600">f.</span>
                <span className="ml-2 font-sans text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-4)]">
                  TriFinity
                </span>
              </div>
              <p className="font-serif text-sm italic leading-relaxed text-[var(--ink-3)]">
                Geld is opgeslagen tijd.
              </p>
            </div>

            <FooterColumn titel="Producten" items={PRODUCTEN} />
            <FooterColumn titel="Hulp" items={HULP} />
            <FooterColumn titel="Bedrijf" items={BEDRIJF} />
          </div>

          {/* Slot-strook */}
          <div className="mt-12 flex flex-col gap-3 border-t border-[var(--border-ed)] pt-6 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-sans text-xs text-[var(--ink-4)]">
              &copy; {new Date().getFullYear()} TriFinity &mdash; gemaakt in Nederland
            </span>
            <span className="font-sans text-[10px] uppercase tracking-[0.1em] text-[var(--ink-4)]">
              Editie 2026
            </span>
          </div>
        </div>
      </footer>
    </>
  )
}
