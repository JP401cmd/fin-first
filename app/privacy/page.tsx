import type { Metadata } from 'next'
import {
  MarketingPageShell,
  MarketingSection,
  MarketingDisclaimer,
} from '@/components/landing/marketing-page-shell'

export const metadata: Metadata = {
  title: 'Privacy — TriFinity',
  description:
    'Hoe TriFinity met jouw financiële gegevens omgaat: EU-hosting, geen verkoop of advertenties, de volledige lijst van sub-verwerkers, concrete bewaartermijnen en je AVG-rechten.',
}

/**
 * Privacyverklaring — definitieve conceptversie op basis van de feitelijke
 * verwerkingen in de codebase (inventaris 4 juli 2026). De concept-banner
 * blijft staan tot de externe juridische toetsing is afgerond; daarna is
 * het verwijderen van de banner de laatste stap vóór lancering.
 *
 * Conventie: elke nieuwe externe provider/koppeling MOET aan de
 * sub-verwerkerslijst hieronder worden toegevoegd in dezelfde PR.
 */

const SUBVERWERKERS: {
  naam: string
  rol: string
  locatie: string
  wanneer: string
}[] = [
  {
    naam: 'Supabase',
    rol: 'Database, authenticatie en opslag van al je account- en financiële gegevens',
    locatie: 'EU (Ierland)',
    wanneer: 'Altijd — dit is waar je data leeft.',
  },
  {
    naam: 'Vercel',
    rol: 'Hosting en uitvoering van de app, geplande achtergrondtaken, geanonimiseerde performance-metingen (Speed Insights) en bestandsopslag',
    locatie: 'VS-bedrijf; onze app draait in de EU (Dublin)',
    wanneer: 'Altijd — elke pagina die je opvraagt loopt via Vercel.',
  },
  {
    naam: 'Anthropic (Claude)',
    rol: 'Primaire AI-aanbieder voor Fin, de briefing, categorisering en rekenhulpen',
    locatie: 'VS',
    wanneer: 'Alleen als je AI-functies gebruikt (uitschakelbaar).',
  },
  {
    naam: 'OpenAI',
    rol: 'Secundaire AI-aanbieder (configureerbaar alternatief voor Anthropic)',
    locatie: 'VS',
    wanneer: 'Alleen als deze aanbieder actief is én je AI-functies gebruikt.',
  },
  {
    naam: 'Mistral',
    rol: 'Alternatieve AI-aanbieder (configureerbaar)',
    locatie: 'EU (Frankrijk)',
    wanneer: 'Alleen als deze aanbieder actief is én je AI-functies gebruikt.',
  },
  {
    naam: 'Ollama (self-hosted)',
    rol: 'Optionele AI-variant die op eigen servers draait — er gaat dan geen data naar een externe AI-aanbieder',
    locatie: 'Eigen infrastructuur (EU)',
    wanneer: 'Alleen als deze variant actief is.',
  },
  {
    naam: 'TrueLayer',
    rol: 'Open Banking (PSD2): het ophalen van rekeninginformatie en transacties bij je bank',
    locatie: 'EU/VK, gereguleerde betaaldienstverlener',
    wanneer: 'Alleen als jij zelf een bankkoppeling maakt (opt-in).',
  },
  {
    naam: 'Trading 212',
    rol: 'Broker-koppeling: het ophalen van je beleggingsposities',
    locatie: 'EU/VK',
    wanneer: 'Alleen als jij zelf deze koppeling maakt (opt-in).',
  },
  {
    naam: 'Financial Modeling Prep',
    rol: 'Het opzoeken van koersinformatie bij ISIN- of ticker-codes van beleggingen',
    locatie: 'VS',
    wanneer: 'Alleen bij het verrijken van beleggingsgegevens; er gaan geen persoonsgegevens mee, alleen de effect-code.',
  },
  {
    naam: 'Resend',
    rol: 'Verzending van transactionele e-mail (zoals uitnodigingen voor een huishouden)',
    locatie: 'VS',
    wanneer: 'Alleen wanneer de app je een e-mail stuurt.',
  },
  {
    naam: 'Polar',
    rol: 'Betalingen en abonnementsbeheer',
    locatie: 'EU-gericht platform',
    wanneer: 'Alleen bij een betaald abonnement (nog niet actief; wordt vermeld vóór activering).',
  },
  {
    naam: 'Cloudflare (Turnstile)',
    rol: 'Bot-bescherming (CAPTCHA) op de publieke Vrijheidscheck',
    locatie: 'VS-bedrijf met EU-datacenters',
    wanneer: 'Alleen op de publieke check-pagina; verwerkt je IP-adres en een verificatie-token.',
  },
]

export default function PrivacyPage() {
  return (
    <MarketingPageShell kicker="Privacyverklaring" title="Jouw cijfers, jouw bezit">
      <MarketingDisclaimer>
        Concepttekst — nog niet juridisch gevalideerd.
      </MarketingDisclaimer>

      <MarketingSection>
        <p>
          TriFinity gaat over je geld, en dus over gevoelige informatie. Deze
          verklaring legt in nuchtere taal uit wie er verantwoordelijk is,
          welke gegevens we verwerken, waar ze leven, met wie ze gedeeld
          worden, hoe lang we ze bewaren en welke rechten je hebt. We houden
          het bewust eerlijk: ook over de dingen die je liever niet hoort.
        </p>
      </MarketingSection>

      <MarketingSection heading="1. Wie is verantwoordelijk">
        <p>
          De verwerkingsverantwoordelijke voor je persoonsgegevens is{' '}
          <strong className="font-semibold text-[var(--ink)]">
            JPS Holding
          </strong>
          , [rechtsvorm], gevestigd te [vestigingsadres], ingeschreven bij de
          Kamer van Koophandel onder nummer [KvK-nummer]. Voor alle vragen en
          verzoeken over je gegevens is er één kanaal:{' '}
          <a
            href="mailto:privacy@trifinity.nl"
            className="font-semibold text-kern-700 underline hover:text-kern-800"
          >
            privacy@trifinity.nl
          </a>
          .
        </p>
        <p>
          Ben je het niet eens met hoe we met je gegevens omgaan, dan heb je
          altijd het recht een klacht in te dienen bij de Autoriteit
          Persoonsgegevens (autoriteitpersoonsgegevens.nl).
        </p>
      </MarketingSection>

      <MarketingSection heading="2. Welke gegevens we verwerken">
        <p>We verwerken alleen wat nodig is om de app te laten werken:</p>
        <ul className="ml-1 list-none space-y-2">
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Accountgegevens</strong>{' '}
            — je e-mailadres en een versleuteld wachtwoord, beheerd door
            Supabase Auth.
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Profielgegevens</strong>{' '}
            — naam, geboortejaar of -datum, eventuele partner, huishoudtype,
            kinderleeftijden en de vrije tekst die je zelf als financiële
            toelichting invult.
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Financiële gegevens</strong>{' '}
            — bezittingen, schulden, transacties (bij import of bankkoppeling
            inclusief tegenpartij-naam en -IBAN), budgetten, doelen,
            vermogens-snapshots en de parameters van je vrijheidsprognose.
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Bankgegevens (opt-in)</strong>{' '}
            — koppel je een bank via TrueLayer, dan verwerken we
            PSD2-toegangstokens en IBAN&apos;s. Deze velden slaan we extra
            versleuteld op (AES-256-GCM veldversleuteling), bovenop de
            versleuteling van de database zelf.
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Fiscale gegevens en documenten</strong>{' '}
            — box 1/box 3-gegevens die je invult, en documenten die je zelf
            uploadt (zoals een aangifte, pensioenoverzicht of bankafschrift).
            Bij AI-import gaat de volledige tekst van zo&apos;n document naar
            de AI-aanbieder om de cijfers eruit te halen — dat is de functie.
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Vrijheidscheck (zonder account)</strong>{' '}
            — doe je de publieke Vrijheidscheck, dan bewaren we je ingevulde
            intake (versleuteld), je e-mailadres en voornaam, en een gehashte
            afgeleide van je IP-adres tegen misbruik.
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Technische en beveiligingsgegevens</strong>{' '}
            — geanonimiseerde performance-signalen (Vercel Speed Insights),
            een log van verzonden e-mails, een audit-log van
            beheerdershandelingen en geaggregeerde AI-gebruiksstatistieken
            (tokens, geen inhoud).
          </li>
        </ul>
      </MarketingSection>

      <MarketingSection heading="3. Waarvoor en op welke grondslag">
        <ul className="ml-1 list-none space-y-2">
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Uitvoering van de overeenkomst</strong>{' '}
            (AVG art. 6 lid 1 sub b) — het leveren van de app zelf: je
            overzicht, budgetten, prognoses en synchronisatie tussen
            apparaten.
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Toestemming</strong>{' '}
            (AVG art. 6 lid 1 sub a) — de AI-functies en de bank- en
            broker-koppelingen. Beide zijn opt-in en op elk moment uit te
            schakelen of te ontkoppelen.
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Gerechtvaardigd belang</strong>{' '}
            (AVG art. 6 lid 1 sub f) — beveiliging en misbruikpreventie: het
            e-mail-log, het audit-log van beheerdershandelingen en de
            bot-bescherming op publieke pagina&apos;s.
          </li>
        </ul>
        <p>
          We gebruiken je gegevens nooit voor advertenties, profilering voor
          marketingdoeleinden of verkoop aan derden.
        </p>
      </MarketingSection>

      <MarketingSection heading="4. Sub-verwerkers — de volledige lijst">
        <p>
          Dit zijn álle externe partijen die (mogelijk) gegevens voor ons
          verwerken, met hun rol en wanneer ze aan bod komen. Voor partijen in
          de Verenigde Staten geldt: doorgifte vindt plaats op basis van de
          EU-standaardcontractbepalingen (SCC&apos;s) en/of het EU-VS Data
          Privacy Framework, vastgelegd in een verwerkersovereenkomst.
        </p>
        <ul className="ml-1 list-none space-y-3">
          {SUBVERWERKERS.map((s) => (
            <li key={s.naam} className="border-l-2 border-[var(--border-md)] pl-4">
              <strong className="font-semibold text-[var(--ink)]">{s.naam}</strong>{' '}
              — {s.rol}.{' '}
              <span className="text-[var(--ink-2)]">
                Locatie: {s.locatie}. {s.wanneer}
              </span>
            </li>
          ))}
        </ul>
        <p>
          Komt er een nieuwe koppeling of aanbieder bij, dan werken we deze
          lijst bij vóórdat die actief wordt.
        </p>
      </MarketingSection>

      <MarketingSection heading="5. Wat er naar AI gaat — eerlijk verhaal">
        <p>
          De AI-functies (Fin — je coach, de briefing, categorisering van
          transacties, de rekenhulp-bouwer en document-import) sturen de
          context die voor die taak nodig is naar de actieve AI-aanbieder.
          Daarbij geldt:
        </p>
        <ul className="ml-1 list-none space-y-2">
          <li className="border-l-2 border-wil-300 pl-4">
            <strong className="font-semibold text-[var(--ink)]">Geen training</strong>{' '}
            — we gebruiken de AI-aanbieders via hun zakelijke API; je gegevens
            worden door hen niet gebruikt om modellen te trainen.
          </li>
          <li className="border-l-2 border-wil-300 pl-4">
            <strong className="font-semibold text-[var(--ink)]">Korte provider-retentie</strong>{' '}
            — AI-aanbieders bewaren verzoeken kortdurend volgens hun eigen
            voorwaarden (onder meer voor misbruikdetectie). We claimen dus
            níet dat er niets wordt bewaard.
          </li>
          <li className="border-l-2 border-wil-300 pl-4">
            <strong className="font-semibold text-[var(--ink)]">Data-minimalisatie, waar het kan</strong>{' '}
            — op de chat-, categoriserings- en nieuwsroutes worden
            persoonsgegevens automatisch gemaskeerd (namen, IBAN, BSN,
            e-mail, telefoon, adres; geboortedatum wordt leeftijd). Bedragen,
            saldi en percentages gaan bewust wél mee — daar gaat de vraag
            over.
          </li>
          <li className="border-l-2 border-wil-300 pl-4">
            <strong className="font-semibold text-[var(--ink)]">Niet alles wordt gemaskeerd</strong>{' '}
            — bij document-import gaat de volledige documenttekst mee, bij
            abonnement-herkenning de omschrijvingen van je transacties, en de
            vraag die je zelf aan Fin typt gaat mee zoals jij hem typt.
            Zonder die inhoud kan de functie zijn werk niet doen.
          </li>
          <li className="border-l-2 border-wil-300 pl-4">
            <strong className="font-semibold text-[var(--ink)]">Uitschakelbaar</strong>{' '}
            — zet je de AI-functies uit, dan gaat er niets naar een
            AI-aanbieder en werkt de app als puur financieel dashboard.
          </li>
        </ul>
        <p>
          Anthropic en OpenAI zijn gevestigd in de VS; gebruik je de
          AI-functies, dan verlaat deze context de EU (zie sectie 4 voor de
          grondslag). Met Mistral (EU) of een self-hosted model blijft de
          verwerking binnen de EU respectievelijk in eigen beheer.
        </p>
      </MarketingSection>

      <MarketingSection heading="6. Hoe lang we bewaren">
        <ul className="ml-1 list-none space-y-2">
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Account- en financiële gegevens</strong>{' '}
            — zolang je account bestaat.
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Na accountverwijdering</strong>{' '}
            — je persoonlijke en financiële gegevens worden direct en
            definitief verwijderd uit de actieve database (hard delete, geen
            wachttijd). Reguliere back-ups vervallen daarna volgens hun
            automatische rotatie (circa zeven dagen).
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Wat kort achterblijft</strong>{' '}
            — het log van verzonden e-mails (maximaal 12 maanden) en het
            audit-log van beheerdershandelingen en AI-gebruiksstatistieken
            (12–24 maanden), op grond van ons gerechtvaardigd belang bij
            beveiliging en bewijsvoering. Deze logs bevatten geen financiële
            inhoud.
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Vrijheidscheck-gegevens</strong>{' '}
            — niet-geconverteerde intakes worden automatisch opgeschoond;
            maak je een account, dan volgen ze de levensduur van je account.
            Wil je ze eerder kwijt, mail{' '}
            <a
              href="mailto:privacy@trifinity.nl"
              className="font-semibold text-kern-700 underline hover:text-kern-800"
            >
              privacy@trifinity.nl
            </a>
            .
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">AI-aanbieders</strong>{' '}
            — hanteren hun eigen korte bewaartermijnen voor verwerkte
            verzoeken volgens hun voorwaarden (zie sectie 5).
          </li>
        </ul>
      </MarketingSection>

      <MarketingSection heading="7. Hoe we beveiligen">
        <p>
          Je gegevens staan op Supabase, met de database gehost in Ierland
          (EU). Data is versleuteld in rust en in transport (TLS). De
          gevoeligste velden — banktokens en IBAN&apos;s — zijn daarbovenop
          veld-versleuteld met AES-256-GCM. Toegang tot je rijen in de
          database is afgeschermd met row-level security: alleen jouw account
          (en, als je dat expliciet instelt, je partner binnen een
          huishouden) kan jouw gegevens lezen.
        </p>
      </MarketingSection>

      <MarketingSection heading="8. Jouw rechten (AVG)">
        <p>
          Onder de Algemene Verordening Gegevensbescherming heb je recht op
          inzage, correctie, verwijdering, beperking, bezwaar en
          dataportabiliteit. Zo oefen je ze uit:
        </p>
        <ul className="ml-1 list-none space-y-2">
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Inzage en correctie</strong>{' '}
            — al je gegevens zijn zichtbaar en aanpasbaar in de app zelf.
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Export (dataportabiliteit)</strong>{' '}
            — download je kern-financiële gegevens (transacties, budgetten,
            vermogensverloop, bezittingen, schulden en doelen) als CSV,
            rechtstreeks vanuit de app. Wil je een volledige kopie van ál je
            gegevens, mail{' '}
            <a
              href="mailto:privacy@trifinity.nl"
              className="font-semibold text-kern-700 underline hover:text-kern-800"
            >
              privacy@trifinity.nl
            </a>
            .
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Verwijdering</strong>{' '}
            — verwijder je account in de app (met getypte bevestiging); je
            gegevens worden direct gewist zoals beschreven in sectie 6.
          </li>
          <li className="border-l-2 border-[var(--border-md)] pl-4">
            <strong className="font-semibold text-[var(--ink)]">Bezwaar tegen AI-verwerking</strong>{' '}
            — schakel de AI-functies uit in de app; de overige functies
            blijven werken.
          </li>
        </ul>
        <p>
          Voor elk ander verzoek: mail{' '}
          <a
            href="mailto:privacy@trifinity.nl"
            className="font-semibold text-kern-700 underline hover:text-kern-800"
          >
            privacy@trifinity.nl
          </a>
          . We reageren binnen één maand. En nogmaals: een klacht kan altijd
          bij de Autoriteit Persoonsgegevens.
        </p>
      </MarketingSection>

      <MarketingSection heading="9. Cookies en lokale opslag">
        <p>
          We plaatsen geen marketing-cookies, geen advertentie-pixels en geen
          cross-site-trackers. De app gebruikt functionele cookies voor je
          inlogsessie en lokale browseropslag (localStorage) voor
          apparaat-voorkeuren zoals weergave-instellingen. De enige
          meet-component is Vercel Speed Insights, dat geanonimiseerde
          performance-statistieken verzamelt en geen profiel van je opbouwt.
        </p>
      </MarketingSection>

      <MarketingSection heading="10. Wijzigingen en versie">
        <p>
          Wijzigt deze verklaring inhoudelijk, dan melden we dat in de app en
          werken we de versie hieronder bij. Ons businessmodel is en blijft je
          abonnement — niet je data.
        </p>
        <p className="font-serif text-sm italic text-[var(--ink-3)]">
          Versie 2.0 — concept, 4 juli 2026. Vragen? Mail{' '}
          <a
            href="mailto:privacy@trifinity.nl"
            className="font-semibold not-italic text-kern-700 underline hover:text-kern-800"
          >
            privacy@trifinity.nl
          </a>{' '}
          of gebruik de{' '}
          <a
            href="/contact"
            className="font-semibold not-italic text-kern-700 underline hover:text-kern-800"
          >
            contactpagina
          </a>
          .
        </p>
      </MarketingSection>
    </MarketingPageShell>
  )
}
