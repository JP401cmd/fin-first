import Link from 'next/link'
import {
  User,
  Shield,
  Link2,
  Palette,
  Bell,
  Settings2,
  Share2,
  CalendarCheck,
  CreditCard,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import { Kicker, EditorialHeadline, EditorialDeck } from '@/components/editorial'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PAGE_INFO } from '@/lib/page-info-content'

/**
 * MijnOverview — kaart-grid op /mijn root die de 8 sub-routes
 * overzichtelijk toont. Plan §6.4: "Mijn vervangt het 2459-regel
 * instellingenscherm. Geen accordions, één pagina per onderwerp."
 *
 * Editorial Finance kaart-DNA: 3px accent-streep bovenaan (cross-module
 * → ink-tint via --module-active-fallback), icon op subtle-vlak, serif
 * kaart-titel en italic serif meta-regel. 2-koloms grid op desktop,
 * single-col op mobile.
 */

type SubRoute = {
  href: string
  label: string
  description: string
  Icon: LucideIcon
}

const ROUTES: SubRoute[] = [
  {
    href: '/mijn/profiel',
    label: 'Profiel',
    description: 'Naam, geboortejaar, inkomen, huishoudtype.',
    Icon: User,
  },
  {
    href: '/mijn/account',
    label: 'Account',
    description: 'Abonnement, e-mail, wachtwoord en account verwijderen.',
    Icon: CreditCard,
  },
  {
    href: '/mijn/privacy',
    label: 'Privacy',
    description: 'Welke data slaan we op en wie kan het zien?',
    Icon: Shield,
  },
  {
    href: '/mijn/koppelingen',
    label: 'Koppelingen',
    description: 'PSD2-banken, UPO, brokerage-sync.',
    Icon: Link2,
  },
  {
    href: '/mijn/uiterlijk',
    label: 'Uiterlijk',
    description: 'Kleurpalet, typografie, module-accentkleuren.',
    Icon: Palette,
  },
  {
    href: '/mijn/notificaties',
    label: 'Notificaties',
    description: 'E-mail, push en in-app meldingen.',
    Icon: Bell,
  },
  {
    href: '/mijn/checkins',
    label: 'Check-ins',
    description: 'Tijdlijn van al je maandelijkse geldcheck-ins.',
    Icon: CalendarCheck,
  },
  {
    href: '/rapportages',
    label: 'Rapportages',
    description: 'Balans, vermogen, budget, persoonlijk plan.',
    Icon: Share2,
  },
  {
    href: '/mijn/geavanceerd',
    label: 'Geavanceerd',
    description: 'Exports, debug, ontwikkelaars-opties.',
    Icon: Settings2,
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
        <Kicker>Mijn TriFinity</Kicker>
        <EditorialHeadline
          level="h1"
          size="sm"
          emphasis="instellingen"
          className="mt-1 text-[var(--ink)]"
        >
          Profiel & instellingen
        </EditorialHeadline>
        <EditorialDeck className="mt-2">
          Acht onderwerpen, elk op een eigen rustige pagina.
        </EditorialDeck>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {ROUTES.map(({ href, label, description, Icon }) => (
          <Link
            key={href}
            href={href}
            className="group relative border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5 hover:border-[var(--ink-3)] hover:shadow-sm transition-all flex items-start gap-3"
          >
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-[3px] bg-[var(--module-active-500)]"
            />
            <span className="inline-flex items-center justify-center w-10 h-10 shrink-0 bg-[var(--subtle)] text-[var(--ink-3)]">
              <Icon className="w-4 h-4" aria-hidden="true" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-serif text-base text-[var(--ink)]">
                  {label}
                </h2>
                <ArrowRight
                  className="w-4 h-4 text-[var(--ink-4)] group-hover:text-[var(--ink-2)] shrink-0 transition-colors"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-0.5 font-serif italic text-[11px] text-[var(--ink-3)] leading-snug">
                {description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
