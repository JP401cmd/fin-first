import type { Metadata } from 'next'
import {
  MarketingPageShell,
  MarketingSection,
  MarketingDisclaimer,
} from '@/components/landing/marketing-page-shell'
import { LegalEmail } from '@/components/legal/legal-email'

export const metadata: Metadata = {
  title: 'Algemene voorwaarden — TriFinity',
  description:
    'De gebruiksvoorwaarden van TriFinity: account en toelaatbaar gebruik, het Gratis- en Pro-abonnement, facturatie en opzegging, aansprakelijkheid en toepasselijk recht.',
}

export default function VoorwaardenPage() {
  return (
    <MarketingPageShell
      kicker="Gebruiksvoorwaarden"
      title="Algemene voorwaarden"
    >
      <MarketingDisclaimer>
        Concepttekst — nog niet juridisch gevalideerd.
      </MarketingDisclaimer>

      <MarketingSection>
        <p>
          Deze voorwaarden gelden voor je gebruik van TriFinity. Door een
          account aan te maken of de app te gebruiken, ga je ermee akkoord. We
          houden het kort en begrijpelijk.
        </p>
      </MarketingSection>

      <MarketingSection heading="Wat TriFinity is">
        <p>
          TriFinity is een educatieve app voor persoonlijk financieel inzicht:
          je brengt je bezittingen, schulden, inkomsten en uitgaven in kaart en
          de app vertaalt die naar overzicht, budgetten en
          toekomstprojecties — uitgedrukt in vrijheid in tijd. De dienst wordt
          aangeboden door JPS Holding, [rechtsvorm], gevestigd te
          [vestigingsadres], KvK [KvK-nummer].
        </p>
        <p>
          Het support-adres — <LegalEmail kind="support" /> — vullen we in zodra
          TriFinity een eigen internetdomein heeft; we noemen hier bewust geen
          mailbox die vandaag geen post kan ontvangen. Tot die tijd is de app
          alleen op uitnodiging te gebruiken en loopt contact via degene die je
          die uitnodiging heeft gestuurd. Zie ook de{' '}
          <a
            href="/contact"
            className="font-semibold text-kern-700 underline hover:text-kern-800"
          >
            contactpagina
          </a>
          .
        </p>
      </MarketingSection>

      <MarketingSection heading="Account en toelaatbaar gebruik">
        <p>
          Je bent verantwoordelijk voor de juistheid van de gegevens die je
          invoert en voor het geheimhouden van je inloggegevens. TriFinity is
          bedoeld voor persoonlijk, privé financieel inzicht. Je gebruikt de app
          niet voor onrechtmatige doeleinden, niet om de dienst te
          ontwrichten, en niet om geautomatiseerd of buitensporig
          systeembronnen te belasten.
        </p>
      </MarketingSection>

      <MarketingSection heading="Abonnementen — Gratis en Pro">
        <p>TriFinity werkt met een freemium-model:</p>
        <ul className="ml-1 list-none space-y-2">
          <li className="border-l-2 border-kern-300 pl-4">
            <strong className="font-semibold text-[var(--ink)]">Gratis</strong> —
            de kern van het Overzicht en de basis-functionaliteit, zonder kosten
            en zonder aflopende proefperiode.
          </li>
          <li className="border-l-2 border-kern-300 pl-4">
            <strong className="font-semibold text-[var(--ink)]">Pro</strong> —{' '}
            <span className="font-mono tabular-nums">€9</span> per maand, voor de
            volledige Toekomst-module, de Rekenhulp-bibliotheek en de uitgebreide
            AI-functies. De actuele tarieven staan op de prijspagina; bij wijziging
            geldt het tarief zoals daar vermeld.
          </li>
        </ul>
      </MarketingSection>

      <MarketingSection heading="Facturatie en opzegging">
        <p>
          Een Pro-abonnement wordt maandelijks vooraf gefactureerd en verlengt
          telkens automatisch met een maand. Betalingen verlopen — zodra
          betaalde abonnementen actief zijn — via onze betaalpartner Polar. Je
          kunt op elk moment opzeggen; je behoudt dan toegang tot Pro tot het
          einde van de lopende, reeds betaalde periode. Daarna val je terug op
          het Gratis-niveau. We restitueren geen reeds verstreken perioden,
          tenzij dwingend recht anders bepaalt.
        </p>
      </MarketingSection>

      <MarketingSection heading="Geen financieel advies">
        <p>
          Dit kan niet duidelijk genoeg zijn:{' '}
          <strong className="font-semibold text-[var(--ink)]">
            TriFinity geeft geen financieel advies.
          </strong>{' '}
          De app is een educatief reken- en inzicht-instrument en verleent
          geen vergunningsplichtig financieel advies in de zin van de Wet op
          het financieel toezicht (Wft). TriFinity heeft geen vergunning van
          de AFM of DNB en staat niet onder hun toezicht. Berekeningen,
          prognoses en suggesties van Fin zijn illustraties op basis van
          aannames die jij invoert — geen aanbeveling om te kopen, verkopen,
          aflossen of beleggen. Voor persoonlijke beslissingen raadpleeg je
          een erkend adviseur. Zie ook onze{' '}
          <a
            href="/wft"
            className="font-semibold text-kern-700 underline hover:text-kern-800"
          >
            Wft-disclaimer
          </a>
          .
        </p>
      </MarketingSection>

      <MarketingSection heading="Aansprakelijkheid">
        <p>
          TriFinity wordt aangeboden &ldquo;zoals het is&rdquo;. We doen ons best
          voor correcte berekeningen en beschikbaarheid, maar geven geen garantie
          dat de app foutloos, ononderbroken of geschikt is voor een specifiek
          doel. Voor zover wettelijk toegestaan zijn wij niet aansprakelijk voor
          indirecte schade, gevolgschade, gemiste besparingen of verliezen die
          voortvloeien uit beslissingen die je op basis van de app neemt. Onze
          totale aansprakelijkheid blijft beperkt tot het bedrag dat je in de
          twaalf maanden vóór het schadeveroorzakende feit aan abonnementsgeld
          hebt betaald.
        </p>
      </MarketingSection>

      <MarketingSection heading="Je data bij opzegging">
        <p>
          Voordat of nadat je opzegt, kun je je kern-financiële gegevens
          (transacties, budgetten, vermogensverloop, bezittingen, schulden en
          doelen) exporteren als CSV, rechtstreeks vanuit de app. Verwijder je
          je account, dan wissen we je gegevens direct, conform ons{' '}
          <a
            href="/privacy"
            className="font-semibold text-kern-700 underline hover:text-kern-800"
          >
            privacybeleid
          </a>
          .
        </p>
      </MarketingSection>

      <MarketingSection heading="Toepasselijk recht">
        <p>
          Op deze voorwaarden is Nederlands recht van toepassing. Geschillen
          leggen we voor aan de bevoegde rechter in Nederland.
        </p>
        <p className="font-serif text-sm italic text-[var(--ink-3)]">
          Versie 2.1 — concept, 7 augustus 2026.
        </p>
      </MarketingSection>
    </MarketingPageShell>
  )
}
