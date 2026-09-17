'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import { FinDots } from '@/components/app/fin-dots'
import { ADDON_PLANS, formatPlanPrice } from '@/lib/subscription-catalog'

/**
 * AiSubscriptionUpsell — één gedeelde upsell voor élke AI-ingang die op een
 * non-abonnee stuit (V-002): "dit kan in de app met een AI-abonnement" + de
 * keuze om dat abonnement te bekijken. Nooit verbergen, nooit een rauwe
 * serverfout of "er ging iets mis".
 *
 * Feature-neutraal: `feature` noemt wat de gebruiker hier probeerde te doen
 * (bv. "Je pensioenoverzicht (PDF) uitlezen"); zonder `feature` is de kop
 * "Dit kan met een AI-abonnement". `note` is een optionele extra regel, bv. een
 * alternatief dat zonder AI wél werkt.
 *
 * Bewust géén eigen gating-logica: de aanroeper bepaalt of getoond wordt
 * (op basis van `hasSubscription(subscriptions, 'ai')`, gespiegeld met de
 * server-check `checkTierGate` op `profiles.active_subscriptions`). Propositie +
 * prijs komen uit de abonnementscatalogus (single source of truth).
 *
 * Caveat: zolang Polar niet live is (`available: false`) leidt de CTA naar
 * /mijn/account?addon=ai, waar het AI-sheet met de "Binnenkort"-toelichting
 * opent — nog geen echte afrekenflow. Vandaar "Bekijk AI-abonnement" i.p.v.
 * "Reken nu af".
 */

const AI_PLAN = ADDON_PLANS.find((p) => p.tier === 'ai')

export const AI_UPSELL_HREF = '/mijn/account?addon=ai'

export function AiSubscriptionUpsell({
  onNavigate,
  variant = 'panel',
  feature,
  note,
}: {
  /** Aangeroepen vlak vóór navigatie (bv. de chat sluiten). */
  onNavigate?: () => void
  /** 'panel' = volledig scherm (chat-body); 'inline' = compacte kaart. */
  variant?: 'panel' | 'inline'
  /** Wat deze functie doet, bv. "Je pensioenoverzicht (PDF) uitlezen". */
  feature?: string
  /** Optionele extra regel, bv. een alternatief zonder AI. */
  note?: ReactNode
}) {
  const price = formatPlanPrice(AI_PLAN?.priceEur ?? 9)
  const tagline =
    AI_PLAN?.tagline ??
    'Fin als persoonlijke financiële coach — analyse, aanbevelingen, briefing en nieuws op maat.'
  const headline = feature
    ? `${feature} kan met een AI-abonnement`
    : 'Dit kan met een AI-abonnement'

  if (variant === 'inline') {
    return (
      <div
        className="rounded-[var(--r-lg)] border border-wil-200 bg-wil-50/70 px-3 py-3"
        data-testid="ai-upsell-inline"
      >
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-wil-500" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-wil-800" data-testid="ai-upsell-headline">
              {headline}
            </p>
            <p className="mt-0.5 text-xs leading-snug text-[var(--ink-3)]">
              Dit kan in de app met het AI-abonnement ({price}/mnd). Je kiest zelf of je het neemt.
            </p>
            {note && (
              <p className="mt-1 text-xs leading-snug text-[var(--ink-3)]">{note}</p>
            )}
            <Link
              href={AI_UPSELL_HREF}
              onClick={onNavigate}
              className="mt-2 inline-flex items-center gap-1 rounded-[var(--r-lg)] bg-wil-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-wil-700"
              data-testid="ai-upsell-cta"
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
          <FinDots size={40} />
        </div>

        <h2 className="text-base font-semibold text-[var(--ink)]" data-testid="ai-upsell-headline">
          {headline}
        </h2>

        <p className="mt-2 text-sm leading-relaxed text-[var(--ink-3)]">
          {tagline}
        </p>

        <div className="mt-4 rounded-[var(--r-lg)] border border-wil-200 bg-wil-50/60 px-4 py-3 text-sm text-[var(--ink-2)]">
          Met het <span className="font-semibold text-wil-700">AI-abonnement</span>{' '}
          ({price}/mnd) wordt Fin je persoonlijke coach — met chat, analyse,
          aanbevelingen, briefing en nieuws op maat.
        </div>

        {note && (
          <p className="mt-3 text-sm leading-relaxed text-[var(--ink-3)]">{note}</p>
        )}

        <Link
          href={AI_UPSELL_HREF}
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
