import type { Metadata } from 'next'
import {
  MarketingWideShell,
  MarketingPageHero,
} from '@/components/landing/marketing-page-shell'
import { FunctiesSecties } from '@/components/landing/sections/functies'
import { FaqSection } from '@/components/landing/faq-section'
import { FAQ_FUNCTIES } from '@/components/landing/faq-data'

const description =
  'Inzicht, grip, nu en toekomst — zo lost TriFinity de belofte in: transacties en budgetten automatisch in beeld, Will als tweede paar ogen, je vermogen van vandaag en een eerlijke projectie van morgen.'

export const metadata: Metadata = {
  title: 'Functies — TriFinity',
  description,
  alternates: { canonical: '/functies' },
  openGraph: {
    title: 'Functies — TriFinity',
    description,
    url: '/functies',
  },
}

export default function FunctiesPage() {
  return (
    <MarketingWideShell>
      <MarketingPageHero
        kicker="Functies"
        title="De belofte,"
        italics="ingelost"
        intro="De vrijheid om met inzicht en grip keuzes te maken voor nu en de toekomst — hier zie je hoe TriFinity dat woord voor woord waarmaakt."
      />
      <FunctiesSecties />
      <FaqSection vragen={FAQ_FUNCTIES} />
    </MarketingWideShell>
  )
}
