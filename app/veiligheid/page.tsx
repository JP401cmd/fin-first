import type { Metadata } from 'next'
import {
  MarketingWideShell,
  MarketingPageHero,
} from '@/components/landing/marketing-page-shell'
import { VeiligheidSecties } from '@/components/landing/sections/veiligheid'
import { FaqSection } from '@/components/landing/faq-section'
import { FAQ_VEILIGHEID } from '@/components/landing/faq-data'

const DESCRIPTION =
  'Hoe TriFinity met je gegevens omgaat: EU-hosting in Frankfurt, geen dataverkoop, beperkte AI-context, open methodologie en altijd je eigen export.'

export const metadata: Metadata = {
  title: 'Veiligheid & privacy — TriFinity',
  description: DESCRIPTION,
  alternates: { canonical: '/veiligheid' },
  openGraph: {
    title: 'Veiligheid & privacy — TriFinity',
    description: DESCRIPTION,
    url: '/veiligheid',
  },
}

/**
 * /veiligheid — de "vertrouwen"-pagina van de marketing-site
 * (/ = waarom, /functies = hoe, /prijzen = wat, /veiligheid = vertrouwen).
 *
 * Geen keurmerk-behang: vertrouwen komt uit ware claims (EU-hosting,
 * versleuteling, geen dataverkoop, beperkte AI-context, open methodologie,
 * data-export) en het eerlijke Wft-kader. De afsluitende SlotCta wordt door
 * de Footer in MarketingWideShell gerenderd — hier niet zelf toevoegen.
 */
export default function VeiligheidPage() {
  return (
    <MarketingWideShell>
      <MarketingPageHero
        kicker="Veiligheid & vertrouwen"
        title="Jouw cijfers,"
        italics="jouw bezit"
        intro="Geen keurmerk-behang en geen beloftes die we niet waarmaken — wel precies hoe we met je gegevens omgaan, en wat deze app wel en niet is."
      />
      <VeiligheidSecties />
      <FaqSection vragen={FAQ_VEILIGHEID} kicker="Over data en advies" />
    </MarketingWideShell>
  )
}
