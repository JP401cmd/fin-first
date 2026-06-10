import type { Metadata } from 'next'
import { MarketingWideShell } from '@/components/landing/marketing-page-shell'
import { Hero } from '@/components/landing/hero'
import { BeloftePijlers, Filosofie, TrustStrip, PrijsTeaser } from '@/components/landing/sections/home'

export const metadata: Metadata = { alternates: { canonical: '/' } }

export default function Home() {
  return (
    <MarketingWideShell>
      <Hero />
      <BeloftePijlers />
      <Filosofie />
      <TrustStrip />
      <PrijsTeaser />
    </MarketingWideShell>
  )
}
