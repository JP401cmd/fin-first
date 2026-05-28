import Link from 'next/link'
import {
  User,
  Users,
  Shield,
  Link2,
  Palette,
  Bell,
  Settings2,
  Share2,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PAGE_INFO } from '@/lib/page-info-content'

/**
 * MijnOverview — kaart-grid op /mijn root die de 8 sub-routes
 * overzichtelijk toont. Plan §6.4: "Mijn vervangt het 2459-regel
 * instellingenscherm. Geen accordions, één pagina per onderwerp."
 *
 * MVP-versie: 8 cards in een 2-koloms grid op desktop, single-col op
 * mobile. Per card icoon-badge + label + 1-zin uitleg + chevron-link.
 * Visuele consistentie met BezittingenOverzichtStrip /
 * SchuldenOverzichtStrip / BelastingOverzichtStrip patroon.
 */

type SubRoute = {
  href: string
  label: string
  description: string
  Icon: LucideIcon
  bg: string
  text: string
}

const ROUTES: SubRoute[] = [
  {
    href: '/mijn/profiel',
    label: 'Profiel',
    description: 'Naam, geboortejaar, inkomen, huishoudtype.',
    Icon: User,
    bg: 'bg-stone-100',
    text: 'text-stone-700',
  },
  {
    href: '/mijn/delen',
    label: 'Partner & delen',
    description: 'Read-only toegang voor partner of adviseur.',
    Icon: Users,
    bg: 'bg-violet-50',
    text: 'text-violet-700',
  },
  {
    href: '/mijn/privacy',
    label: 'Privacy',
    description: 'Welke data slaan we op en wie kan het zien?',
    Icon: Shield,
    bg: 'bg-sky-50',
    text: 'text-sky-700',
  },
  {
    href: '/mijn/koppelingen',
    label: 'Koppelingen',
    description: 'PSD2-banken, UPO, brokerage-sync.',
    Icon: Link2,
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
  },
  {
    href: '/mijn/uiterlijk',
    label: 'Uiterlijk',
    description: 'Kleurpalet, typografie, module-accentkleuren.',
    Icon: Palette,
    bg: 'bg-amber-50',
    text: 'text-amber-700',
  },
  {
    href: '/mijn/notificaties',
    label: 'Notificaties',
    description: 'E-mail, push en in-app meldingen.',
    Icon: Bell,
    bg: 'bg-rose-50',
    text: 'text-rose-700',
  },
  {
    href: '/rapportages',
    label: 'Rapportages',
    description: 'Balans, vermogen, budget, persoonlijk plan.',
    Icon: Share2,
    bg: 'bg-teal-50',
    text: 'text-teal-700',
  },
  {
    href: '/mijn/geavanceerd',
    label: 'Geavanceerd',
    description: 'Exports, debug, ontwikkelaars-opties.',
    Icon: Settings2,
    bg: 'bg-zinc-100',
    text: 'text-zinc-700',
  },
]

export function MijnOverview() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-6 pb-2 md:pt-8 md:pb-4">
      <PageInfoButton
        description={PAGE_INFO['/mijn'] ?? ''}
        className="absolute right-4 top-6 sm:right-6 sm:top-8"
      />
      <header className="mb-6 pr-12 sm:pr-16">
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          Mijn TriFinity
        </div>
        <h1 className="mt-1 font-serif text-2xl md:text-3xl font-semibold text-[var(--ink)] leading-tight">
          Profiel & instellingen
        </h1>
        <p className="mt-2 text-sm sm:text-base text-[var(--ink-2)]">
          Acht onderwerpen — elk een eigen rustige pagina i.p.v. één
          accordion-monster.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {ROUTES.map(({ href, label, description, Icon, bg, text }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5 hover:border-[var(--ink-3)] hover:shadow-sm transition-all flex items-start gap-3"
          >
            <span
              className={`inline-flex items-center justify-center w-10 h-10 rounded-xl shrink-0 ${bg} ${text}`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-[var(--ink)]">
                  {label}
                </h2>
                <ArrowRight
                  className="w-4 h-4 text-[var(--ink-4)] group-hover:text-[var(--ink-2)] shrink-0 transition-colors"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-0.5 text-[11px] text-[var(--ink-3)] leading-snug">
                {description}
              </p>
            </div>
          </Link>
        ))}
      </div>

      <p className="mt-6 text-[11px] italic text-[var(--ink-3)] text-center">
        Ieder onderwerp een eigen pagina — geen monolith meer.
      </p>
    </section>
  )
}
