import type { Metadata } from 'next'
import { Mail } from 'lucide-react'
import {
  MarketingPageShell,
  MarketingSection,
} from '@/components/landing/marketing-page-shell'
import { LegalEmail } from '@/components/legal/legal-email'

export const metadata: Metadata = {
  title: 'Contact — TriFinity',
  description:
    'Contact met TriFinity. De app zit in een besloten testfase; het publieke e-mailadres volgt zodra TriFinity een eigen internetdomein heeft.',
}

export default function ContactPage() {
  return (
    <MarketingPageShell kicker="Neem contact op" title="We horen graag van je">
      <MarketingSection>
        <p>
          Vragen, feedback of een verzoek over je gegevens? TriFinity zit in een
          besloten testfase en heeft nog geen eigen internetdomein. Daarom staat
          hier nog geen e-mailadres: we noemen liever geen mailbox die vandaag
          geen post kan ontvangen. Zodra het domein er is, vind je het adres
          hier.
        </p>
      </MarketingSection>

      <MarketingSection heading="E-mail">
        <div className="inline-flex items-center gap-3 rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)] px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)]">
            <Mail className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
              Nog niet beschikbaar
            </span>
            <span className="block font-mono text-base text-[var(--ink-3)]">
              <LegalEmail kind="support" />
            </span>
          </span>
        </div>
        <p>
          Doe je mee aan de besloten testfase? Gebruik dan het kanaal waarlangs
          je je uitnodiging hebt gekregen — dat is op dit moment de snelste weg
          naar ons.
        </p>
      </MarketingSection>

      <MarketingSection heading="Waarvoor je terecht kunt">
        <ul className="ml-1 list-none space-y-2">
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            Vragen over je account of een functie in de app.
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            AVG-verzoeken: inzage, correctie, export of verwijdering van je
            gegevens — inzage, export en verwijdering doe je zelf in de app; voor
            alles daarbuiten geldt hetzelfde tijdelijke kanaal als hierboven
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
