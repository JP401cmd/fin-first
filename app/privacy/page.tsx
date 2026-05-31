import type { Metadata } from 'next'
import {
  MarketingPageShell,
  MarketingSection,
  MarketingDisclaimer,
} from '@/components/landing/marketing-page-shell'

export const metadata: Metadata = {
  title: 'Privacy — TriFinity',
  description:
    'Hoe TriFinity met jouw financiële gegevens omgaat: EU-hosting, geen verkoop of advertenties, en wat er wél naar AI-subprocessors gaat. Plus je AVG-rechten en data-export.',
}

export default function PrivacyPage() {
  return (
    <MarketingPageShell kicker="Privacybeleid" title="Jouw cijfers, jouw bezit">
      <MarketingDisclaimer>
        Concepttekst — nog niet juridisch gevalideerd.
      </MarketingDisclaimer>

      <MarketingSection>
        <p>
          TriFinity gaat over je geld, en dus over gevoelige informatie. Dit
          beleid legt in nuchtere taal uit welke gegevens we verwerken, waar ze
          leven, met wie ze gedeeld worden, en welke rechten je hebt. We houden
          het bewust eerlijk: ook over de dingen die je liever niet hoort.
        </p>
      </MarketingSection>

      <MarketingSection heading="Welke gegevens we verwerken">
        <p>We verwerken alleen wat nodig is om de app te laten werken:</p>
        <ul className="ml-1 list-none space-y-2">
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Accountgegevens</strong>{' '}
            — je e-mailadres en een versleuteld wachtwoord, beheerd door Supabase
            Auth.
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Financiële gegevens</strong>{' '}
            — bezittingen, schulden, transacties, budgetten, doelen en de
            parameters die jij invoert voor je vrijheidsprognose.
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Voorkeuren</strong>{' '}
            — instellingen zoals weergave, notificaties en widget-indeling.
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Technische gegevens</strong>{' '}
            — beperkte, geanonimiseerde performance-signalen (zie hieronder).
          </li>
        </ul>
      </MarketingSection>

      <MarketingSection heading="Waar je data leeft">
        <p>
          Je gegevens staan op Supabase, met de database gehost in Frankfurt
          (EU). Data is versleuteld in rust en versleuteld in transport (TLS).
          We dragen je financiële gegevens niet over naar servers buiten de EU
          — met de nadrukkelijke uitzondering die we hieronder bij
          AI-subprocessors beschrijven.
        </p>
      </MarketingSection>

      <MarketingSection heading="Geen verkoop, geen advertenties, geen trackers">
        <p>
          Ons businessmodel is je abonnement, niet je data. We verkopen je
          gegevens niet, we tonen geen advertenties, en we plaatsen geen
          marketing-pixels of cross-site-trackers.
        </p>
        <p>
          De enige meet-component is Vercel Speed Insights, dat geanonimiseerde
          performance-statistieken verzamelt (zoals laadtijden) om de app snel
          te houden. Het bouwt geen profiel van je op en wordt niet voor
          marketing gebruikt.
        </p>
      </MarketingSection>

      <MarketingSection heading="AI-subprocessor — wat er wél naar buiten gaat">
        <p>
          Dit is het belangrijkste deel, en we zijn er eerlijk over. De
          AI-functies (Will — je coach, de rekenhulp-bouwer, de dagelijkse
          briefing) sturen{' '}
          <strong className="font-semibold text-[var(--ink)]">
            strikt de context die nodig is voor jouw vraag
          </strong>{' '}
          naar een AI-subprocessor:
        </p>
        <ul className="ml-1 list-none space-y-2">
          <li className="border-l-2 border-wil-300 pl-4">
            <strong className="font-semibold text-[var(--ink)]">Anthropic (Claude)</strong>{' '}
            — onze primaire AI-aanbieder, gevestigd in de Verenigde Staten.
          </li>
          <li className="border-l-2 border-wil-300 pl-4">
            <strong className="font-semibold text-[var(--ink)]">OpenAI (optioneel)</strong>{' '}
            — als secundaire aanbieder configureerbaar, eveneens gevestigd in de
            Verenigde Staten.
          </li>
        </ul>
        <p>
          Concreet: voor een rekenhulp of een vraag aan Will gaan de relevante
          cijfers en je vraag mee — niet je volledige dataset. We sturen{' '}
          <strong className="font-semibold text-[var(--ink)]">nooit</strong> je
          complete financiële geschiedenis, en deze verwerking gebeurt{' '}
          <strong className="font-semibold text-[var(--ink)]">nooit</strong> voor
          advertenties of profilering. Omdat deze aanbieders in de VS gevestigd
          zijn, verlaat deze beperkte context bij gebruik van de AI-functies de
          EU. Gebruik je de AI-functies niet, dan vindt deze overdracht niet
          plaats.
        </p>
      </MarketingSection>

      <MarketingSection heading="Bewaartermijn en verwijderen">
        <p>
          We bewaren je gegevens zolang je account bestaat. Verwijder je je
          account, dan verwijderen we je persoonlijke en financiële gegevens uit
          de actieve database. Reguliere back-ups vervallen volgens hun normale
          roulatie. AI-aanbieders hanteren hun eigen bewaartermijnen voor
          verwerkte verzoeken volgens hun voorwaarden.
        </p>
      </MarketingSection>

      <MarketingSection heading="Jouw rechten (AVG)">
        <p>
          Onder de Algemene Verordening Gegevensbescherming (AVG) heb je recht
          op:
        </p>
        <ul className="ml-1 list-none space-y-2">
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Inzage</strong> —
            weten welke gegevens we van je hebben.
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Correctie</strong>{' '}
            — onjuiste gegevens laten aanpassen.
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Export</strong> —
            je gegevens meenemen in een leesbaar formaat (dataportabiliteit).
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Verwijdering</strong>{' '}
            — vergeten worden.
          </li>
        </ul>
      </MarketingSection>

      <MarketingSection heading="Data-export">
        <p>
          Je kunt op elk moment al je gegevens downloaden als JSON of CSV,
          rechtstreeks vanuit de app. Geen vendor-lock-in: ook als je opzegt,
          neem je je cijfers mee.
        </p>
      </MarketingSection>

      <MarketingSection heading="Contact en gegevensbescherming">
        <p>
          Vragen over privacy of een verzoek over je gegevens? Mail ons via de{' '}
          <a
            href="/contact"
            className="font-semibold text-kern-700 underline hover:text-kern-800"
          >
            contactpagina
          </a>
          . We reageren binnen een redelijke termijn.
        </p>
      </MarketingSection>
    </MarketingPageShell>
  )
}
