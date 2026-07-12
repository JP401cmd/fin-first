'use client'

import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import { WillDots } from '@/components/app/will-dots'
import { ADDON_PLANS, formatPlanPrice } from '@/lib/subscription-catalog'

/**
 * AiSubscriptionUpsell — één gedeelde upsell voor élke AI-ingang die op een
 * non-abonnee stuit ("dit is een betaalde functie, sluit een abonnement af").
 *
 * Bewust géén eigen gating-logica: de aanroeper bepaalt of getoond wordt
 * (op basis van `subscriptions.includes('ai')`, gespiegeld met de server).
 * De propositie + prijs komen uit de abonnementscatalogus (single source of
 * truth), zodat tekst en prijs nergens driften.
 *
 * Caveat: zolang Polar niet live is (`available: false`) leidt de CTA naar
 * /mijn/account, waar de "Binnenkort"-toelichting staat — nog geen echte
 * afrekenflow. Vandaar "Bekijk AI-abonnement" i.p.v. "Reken nu af".
 */

const AI_PLAN = ADDON_PLANS.find((p) => p.tier === 'ai')

export function AiSubscriptionUpsell({
  onNavigate,
  variant = 'panel',
}: {
  /** Aangeroepen vlak vóór navigatie (bv. de chat sluiten). */
  onNavigate?: () => void
  /** 'panel' = volledig scherm (chat-body); 'inline' = compacte kaart. */
  variant?: 'panel' | 'inline'
}) {
  const price = formatPlanPrice(AI_PLAN?.priceEur ?? 9)
  const tagline =
    AI_PLAN?.tagline ??
    'Will als persoonlijke financiële coach — analyse, aanbevelingen, briefing en nieuws op maat.'

  if (variant === 'inline') {
    return (
      <div
        className="rounded-[var(--r-lg)] border border-wil-200 bg-wil-50/70 px-3 py-3"
        data-testid="ai-upsell-inline"
      >
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-wil-500" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-wil-800">
              Will is een betaalde functie
            </p>
            <p className="mt-0.5 text-xs leading-snug text-[var(--ink-3)]">
              Met het AI-abonnement ({price}/mnd) wordt Will je persoonlijke coach.
            </p>
            <Link
              href="/mijn/account"
              onClick={onNavigate}
              className="mt-2 inline-flex items-center gap-1 rounded-[var(--r-lg)] bg-wil-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-wil-700"
            >
              Bekijk AI-abonnement
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center"
      data-testid="ai-upsell-panel"
    >
      <div className="mx-auto max-w-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-wil-50">
          <WillDots size={40} />
        </div>

        <h2 className="text-base font-semibold text-[var(--ink)]">
          Will is een betaalde functie
        </h2>

        <p className="mt-2 text-sm leading-relaxed text-[var(--ink-3)]">
          {tagline}
        </p>

        <div className="mt-4 rounded-[var(--r-lg)] border border-wil-200 bg-wil-50/60 px-4 py-3 text-sm text-[var(--ink-2)]">
          Met het <span className="font-semibold text-wil-700">AI-abonnement</span>{' '}
          ({price}/mnd) wordt Will je persoonlijke coach — met chat, analyse,
          aanbevelingen, briefing en nieuws op maat.
        </div>

        <Link
          href="/mijn/account"
          onClick={onNavigate}
          className="mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-[var(--r-lg)] bg-wil-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wil-700 active:scale-[0.98]"
          data-testid="ai-upsell-cta"
        >
          Bekijk AI-abonnement
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}
