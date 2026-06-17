/**
 * /check — publieke Vrijheidscheck-funnel.
 *
 * Server component-wrapper die de MarketingWideShell laadt en de wizard-sectie
 * rendert. De wizard zelf is client-only (`'use client'` in check-wizard.tsx)
 * omdat hij localStorage, useState en router.push gebruikt.
 *
 * Deze route valt BUITEN de (app)-groep en is dus publiek bereikbaar zonder login.
 * Layout: MarketingWideShell (landing Header + Footer) — zelfde als /functies, /prijzen.
 */

import type { Metadata } from 'next'
import { MarketingWideShell } from '@/components/landing/marketing-page-shell'
import { CheckWizardSection } from '@/components/check/intake/check-wizard-section'

export const metadata: Metadata = {
  title: 'Vrijheidscheck — TriFinity',
  description:
    'In ±5 minuten weet je hoeveel vrijheid je al hebt opgeslagen — en welke stappen je het snelst verder brengen. Ontvang je persoonlijke Vrijheidsrapport.',
  openGraph: {
    title: 'Vrijheidscheck — TriFinity',
    description:
      'In ±5 minuten weet je hoeveel vrijheid je al hebt opgeslagen — en welke stappen je het snelst verder brengen.',
    type: 'website',
    locale: 'nl_NL',
  },
}

export default function CheckPage() {
  return (
    <MarketingWideShell>
      {/* Boven de wizard: editorial kop — zelfde stijl als /functies hero */}
      <section className="border-b border-[var(--border-ed)] px-6 pt-32 pb-12 md:px-12 md:pt-40">
        <div className="mx-auto max-w-xl">
          <p className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink-3)]">
            Vrijheidscheck · Gratis · ±5 minuten
          </p>
          <h1 className="font-display text-[2.2rem] font-bold leading-[1.06] tracking-[-0.025em] text-[var(--ink)] md:text-[3rem]">
            Hoeveel vrijheid heb jij{' '}
            <em className="italic font-medium text-kern-600">al</em> opgeslagen?
          </h1>
          <p className="mt-5 font-serif text-lg leading-relaxed text-[var(--ink-2)]">
            Beantwoord acht vragen. Ontvang je persoonlijk Vrijheidsrapport — met je
            vrijheidstijd, gezondheidsgetal en de drie stappen die het meest opleveren.
          </p>
          <p className="mt-3 font-mono text-xs text-[var(--ink-4)]">
            Geen registratie nodig · Gegevens verlaten je browser pas bij verzending ·{' '}
            <span className="text-kern-600">AVG-conform</span>
          </p>
        </div>
      </section>

      {/* De wizard — client component */}
      <CheckWizardSection />
    </MarketingWideShell>
  )
}
