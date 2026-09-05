import type { Metadata } from 'next'
import {
  MarketingPageShell,
  MarketingSection,
} from '@/components/landing/marketing-page-shell'

export const metadata: Metadata = {
  title: 'Over TriFinity — TriFinity',
  description:
    'Waarom TriFinity bestaat: geld is opgeslagen tijd. Een privé-app die je financiën vertaalt naar vrijheid in jaren en dagen — gemaakt in Nederland.',
}

export default function OverPage() {
  return (
    <MarketingPageShell kicker="Over ons" title="Geld is opgeslagen tijd">
      <MarketingSection>
        <p>
          Achter elk bedrag op je rekening zit iets eenvoudigs en menselijks:
          tijd. Tijd die je hebt gewerkt, tijd die je hebt gespaard, tijd die je
          straks vrij kunt besteden. TriFinity is gebouwd rond dat ene idee —{' '}
          <em className="italic text-kern-700">geld is opgeslagen tijd</em> — en
          vertaalt je financiën daarom niet alleen naar euro&apos;s, maar naar
          vrijheid in jaren, maanden en dagen.
        </p>
      </MarketingSection>

      <MarketingSection heading="Waarom de app bestaat">
        <p>
          De meeste financiële tools laten je zien hoeveel je hebt. Weinig laten
          je voelen wat dat betekent. Wij merkten dat dezelfde drie vragen elke
          maand terugkomen: kan ik dit betalen, spaar ik genoeg, en wanneer ben
          ik eigenlijk vrij? TriFinity is er om die vragen rustig te beantwoorden
          — met jóuw cijfers, in jouw tempo, zonder ruis.
        </p>
        <p>
          Geen dramatische rode pijlen, geen schuldgevoel, geen ondoorzichtige
          black box. Wel helderheid: waar je nu staat, en wat de keuzes van
          vandaag betekenen voor de vrijheid van morgen.
        </p>
      </MarketingSection>

      <MarketingSection heading="Een privé-app, geen boekhoudpakket">
        <p>
          TriFinity is bedoeld voor privé-gebruik: je persoonlijke vermogen, je
          huishouden, je weg naar financiële vrijheid. Het is uitdrukkelijk geen
          zakelijke boekhouding. Heb je een BV of onderneming, dan verschijnt die
          als een bezitting in je overzicht — niet als een grootboek dat we voor
          je bijhouden. Die scherpe afbakening houdt de app eenvoudig en eerlijk
          over wat hij wel en niet is.
        </p>
      </MarketingSection>

      <MarketingSection heading="Gemaakt in Nederland">
        <p>
          TriFinity is gemaakt in Nederland, met de Nederlandse fiscale context
          (zoals box 3, de belasting op je vermogen) als vertrekpunt. Je data
          leeft binnen de EU, en we
          verdienen aan abonnementen — niet aan jouw gegevens. Dat is geen
          marketingbelofte maar een ontwerpkeuze: de app werkt vóór jou, niet
          tegen je aandacht.
        </p>
      </MarketingSection>

      <MarketingSection>
        <p className="border-l-[3px] border-kern-400 pl-5 font-serif text-lg italic leading-relaxed text-[var(--ink-2)]">
          Uiteindelijk gaat het niet om het getal onderaan de streep, maar om de
          tijd die het je teruggeeft.
        </p>
      </MarketingSection>
    </MarketingPageShell>
  )
}
