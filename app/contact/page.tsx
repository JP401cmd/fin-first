import type { Metadata } from 'next'
import { Mail } from 'lucide-react'
import {
  MarketingPageShell,
  MarketingSection,
} from '@/components/landing/marketing-page-shell'

export const metadata: Metadata = {
  title: 'Contact — TriFinity',
  description:
    'Neem contact op met TriFinity. E-mail is het snelste kanaal voor vragen over je privé-account, je gegevens of de app.',
}

export default function ContactPage() {
  return (
    <MarketingPageShell kicker="Neem contact op" title="We horen graag van je">
      <MarketingSection>
        <p>
          Vragen, feedback of een verzoek over je gegevens? E-mail is ons
          primaire en snelste kanaal. Laat weten waar je tegenaan loopt, dan
          helpen we je verder.
        </p>
      </MarketingSection>

      <MarketingSection heading="E-mail">
        <a
          href="mailto:support@trifinity.nl"
          className="inline-flex items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-md)] bg-[var(--paper)] px-5 py-4 transition-all hover:border-[var(--ink-3)] hover:shadow-[var(--s0)]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)]">
            <Mail className="h-4 w-4 text-[var(--ink-2)]" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
              Stuur een bericht
            </span>
            <span className="block font-mono text-base text-[var(--ink)]">
              support@trifinity.nl
            </span>
          </span>
        </a>
      </MarketingSection>

      <MarketingSection heading="Waarvoor je terecht kunt">
        <ul className="ml-1 list-none space-y-2">
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            Vragen over je account of een functie in de app.
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            AVG-verzoeken: inzage, correctie, export of verwijdering van je
            gegevens — mail hiervoor{' '}
            <a
              href="mailto:privacy@trifinity.nl"
              className="font-semibold text-kern-700 underline hover:text-kern-800"
            >
              privacy@trifinity.nl
            </a>{' '}
            (zie ook onze{' '}
            <a
              href="/privacy"
              className="font-semibold text-kern-700 underline hover:text-kern-800"
            >
              privacyverklaring
            </a>
            ).
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            Feedback, ideeën of een gevonden onnauwkeurigheid in een berekening.
          </li>
        </ul>
        <p className="font-serif text-sm italic text-[var(--ink-3)]">
          Let op: dit is support voor de privé-app TriFinity. We bieden geen
          persoonlijk financieel of fiscaal advies — daarvoor verwijzen we naar
          een erkend adviseur (zie de{' '}
          <a
            href="/wft"
            className="font-semibold not-italic text-kern-700 underline hover:text-kern-800"
          >
            Wft-disclaimer
          </a>
          ).
        </p>
      </MarketingSection>
    </MarketingPageShell>
  )
}
