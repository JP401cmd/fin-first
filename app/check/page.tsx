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
import Script from 'next/script'
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
  // Cloudflare Turnstile-client. Alleen laden wanneer de publieke site-key is
  // gezet: zónder key blijft `window.turnstile` undefined, zodat de step-email
  // container niets rendert én de server-side dev-bypass (reason 'not-configured'
  // buiten productie) blijft werken. Mét key auto-rendert de bestaande
  // `.cf-turnstile`-container (implicit rendering) en levert
  // `window.turnstile.getResponse()` de token op.
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  return (
    <MarketingWideShell>
      {turnstileSiteKey ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
          async
          defer
        />
      ) : null}

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
