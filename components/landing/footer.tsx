import Link from 'next/link'
import { SlotCta } from './slot-cta'

/**
 * Footer — drie-koloms layout met Producten / Hulp / Bedrijf.
 * Geen GitHub-link (productowner-beslissing 31 mei 2026: geen
 * open-source-positionering).
 *
 * Boven de footer staat de SlotCta-strook (zie slot-cta.tsx) met de
 * laatste mid-page conversie. Doordat die hier in de Footer zit, eindigt
 * élke marketing-pagina automatisch met dezelfde CTA.
 */

const PRODUCTEN = [
  { label: 'Functies', href: '/functies' },
  { label: 'Prijzen', href: '/prijzen' },
  { label: 'Veiligheid', href: '/veiligheid' },
  { label: 'Fin — AI-coach', href: '/functies#grip' },
]

const HULP = [
  { label: 'Veelgestelde vragen', href: '/functies#faq' },
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
      <h3 className="mb-3 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
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
                <span className="ml-2 font-sans text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-meta)]">
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
            <span className="font-sans text-xs text-[var(--ink-3)]">
              &copy; {new Date().getFullYear()} TriFinity &mdash; gemaakt in Nederland
            </span>
            <span className="font-sans text-[10px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Editie 2026
            </span>
          </div>
        </div>
      </footer>
    </>
  )
}
