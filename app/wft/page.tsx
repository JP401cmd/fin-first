import type { Metadata } from 'next'
import {
  MarketingPageShell,
  MarketingSection,
  MarketingDisclaimer,
} from '@/components/landing/marketing-page-shell'

export const metadata: Metadata = {
  title: 'Wft-disclaimer — TriFinity',
  description:
    'TriFinity is een educatief reken-instrument en geen financieel advies in de zin van de Wet op het financieel toezicht (Wft). Geen AFM-vergunning, geen koop- of verkoopaanbevelingen.',
}

export default function WftPage() {
  return (
    <MarketingPageShell
      kicker="Wettelijke kennisgeving"
      title="Geen financieel advies"
    >
      <MarketingDisclaimer>
        Concepttekst — nog niet juridisch gevalideerd.
      </MarketingDisclaimer>

      <MarketingSection>
        <p>
          TriFinity helpt je je financiën te begrijpen en je vrijheid in tijd
          uit te drukken. Het is bewust een{' '}
          <strong className="font-semibold text-[var(--ink)]">
            educatief reken-instrument
          </strong>{' '}
          — en uitdrukkelijk geen vorm van financieel advies. Deze disclaimer
          legt uit wat dat betekent.
        </p>
      </MarketingSection>

      <MarketingSection heading="Geen advies in de zin van de Wft">
        <p>
          De informatie, berekeningen, prognoses en suggesties in TriFinity
          zijn geen vergunningsplichtig financieel advies in de zin van de Wet
          op het financieel toezicht (Wft). De app beoordeelt niet of een
          product of beslissing passend is voor jouw persoonlijke situatie, en
          doet geen gepersonaliseerde aanbevelingen zoals een adviseur dat zou
          doen. Dit geldt onverkort voor alles wat Fin — de AI-coach — zegt,
          rekent of suggereert.
        </p>
      </MarketingSection>

      <MarketingSection heading="Geen vergunning, geen toezicht">
        <p>
          TriFinity beschikt niet over een vergunning van de Autoriteit
          Financiële Markten (AFM) of De Nederlandsche Bank (DNB), en staat niet
          onder hun toezicht als financiële instelling, adviseur of bemiddelaar.
          De app verleent geen beleggingsdiensten, bemiddelt niet in financiële
          producten en beheert geen vermogen.
        </p>
      </MarketingSection>

      <MarketingSection heading="Geen koop- of verkoopaanbevelingen">
        <p>
          Niets in TriFinity is een aanbeveling om een financieel product of
          beleggingsinstrument te kopen, te verkopen, aan te houden of af te
          lossen. Fin — de AI-coach — rekent en illustreert; de keuze blijft
          altijd volledig de jouwe.
        </p>
      </MarketingSection>

      <MarketingSection heading="Uitkomsten zijn aannames en illustraties">
        <p>
          Alle prognoses, FIRE-scenario&apos;s, rekenhulpen en projecties zijn
          gebaseerd op aannames die jij invoert of die als standaard zijn
          ingesteld — denk aan verwacht rendement, inflatie en
          onttrekkingspercentage. Werkelijke rendementen, belastingregels,
          inflatie en je persoonlijke omstandigheden kunnen sterk afwijken.
          Resultaten uit het verleden bieden geen garantie voor de toekomst.
          Behandel uitkomsten als illustraties van scenario&apos;s, niet als
          voorspellingen of zekerheden.
        </p>
      </MarketingSection>

      <MarketingSection heading="Raadpleeg een erkend adviseur">
        <p>
          Voor persoonlijke financiële, fiscale of juridische beslissingen
          raadpleeg je een erkend en bevoegd adviseur — bijvoorbeeld een
          financieel planner, belastingadviseur of accountant. Die kan jouw
          volledige situatie wegen op een manier die een reken-instrument niet
          kan en niet beoogt. Beslissingen die je op basis van TriFinity neemt,
          neem je op eigen verantwoordelijkheid.
        </p>
        <p className="font-serif text-sm italic text-[var(--ink-3)]">
          Versie 2.0 — concept, 4 juli 2026.
        </p>
      </MarketingSection>
    </MarketingPageShell>
  )
}
