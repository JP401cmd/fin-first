'use client'

import { useState } from 'react'
import { Check, Lock, Sparkles, Link2, X, Clock } from 'lucide-react'
import {
  ADDON_PLANS,
  featuresForTier,
  isAddonActive,
  formatPlanPrice,
  type AddonPlan,
} from '@/lib/subscription-catalog'

/**
 * AbonnementSection — toont de twee verkoopbare add-ons (AI + Connected) als
 * losse kaarten met hun huidige status (Actief / Upgraden). Bron: de
 * abonnementscatalogus, die op zijn beurt de feature-registry spiegelt.
 *
 * UI-first: zolang een add-on `available: false` is, opent "Upgraden" een
 * eerlijke "Binnenkort"-sheet i.p.v. een (nep-)checkout. De Polar-checkout
 * plugt hier later in — zie de POLAR-markering in `openUpgrade`.
 */

const TIER_ICON: Record<AddonPlan['tier'], typeof Sparkles> = {
  ai: Sparkles,
  connected: Link2,
}

const TIER_TINT: Record<AddonPlan['tier'], string> = {
  ai: 'text-violet-700 bg-violet-50',
  connected: 'text-emerald-700 bg-emerald-50',
}

export function AbonnementSection({
  activeSubscriptions,
}: {
  activeSubscriptions: string[]
}) {
  const [upgradePlan, setUpgradePlan] = useState<AddonPlan | null>(null)

  function openUpgrade(plan: AddonPlan) {
    // POLAR: zodra betaling live is en plan.available === true, vervang deze
    // sheet door een checkout-redirect, bv. router.push(`/api/polar/checkout?slug=${plan.polarSlug}`).
    setUpgradePlan(plan)
  }

  return (
    <section aria-labelledby="abonnement-heading" className="space-y-4">
      <header>
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          Abonnement
        </div>
        <h2
          id="abonnement-heading"
          className="font-serif text-xl sm:text-2xl text-[var(--ink)] mt-1"
        >
          Jouw abonnementen
        </h2>
        <p className="mt-2 text-sm text-[var(--ink-2)] leading-relaxed">
          De basis is gratis, voor altijd. Breid uit met losse add-ons — neem
          alleen af wat je nodig hebt.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:gap-4">
        {ADDON_PLANS.map((plan) => {
          const active = isAddonActive(activeSubscriptions, plan)
          const Icon = TIER_ICON[plan.tier]
          const features = featuresForTier(plan.tier)
          return (
            <article
              key={plan.tier}
              className={`rounded-2xl border bg-[var(--paper)] p-4 sm:p-5 ${
                active ? 'border-[var(--ink)]' : 'border-[var(--border-ed)]'
              }`}
            >
              <header className="flex items-start gap-3">
                <span
                  className={`inline-flex w-9 h-9 rounded-lg items-center justify-center shrink-0 ${TIER_TINT[plan.tier]}`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-serif text-base font-semibold text-[var(--ink)]">
                      {plan.name}
                    </h3>
                    {active && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ink)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--paper)]">
                        <Check className="w-3 h-3" aria-hidden="true" />
                        Actief
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--ink-2)] leading-snug mt-0.5">
                    {plan.tagline}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono tabular-nums text-lg font-bold text-[var(--ink)] leading-none">
                    {formatPlanPrice(plan.priceEur)}
                  </div>
                  <div className="text-[10px] text-[var(--ink-3)] mt-1">per maand</div>
                </div>
              </header>

              <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                {features.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-start gap-2 text-xs text-[var(--ink-2)] leading-snug"
                  >
                    <Check
                      className={`mt-0.5 w-3.5 h-3.5 shrink-0 ${active ? 'text-emerald-600' : 'text-[var(--ink-3)]'}`}
                      aria-hidden="true"
                    />
                    <span>{f.label}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-4">
                {active ? (
                  <p className="text-[11px] italic text-[var(--ink-3)]">
                    Actief — beheer of opzeggen kan binnenkort hier.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => openUpgrade(plan)}
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--ink)] px-4 py-2.5 text-sm font-semibold text-[var(--paper)] hover:bg-[var(--ink-2)] transition-colors"
                  >
                    <Lock className="w-4 h-4" aria-hidden="true" />
                    Upgraden naar {plan.name}
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {upgradePlan && (
        <UpgradeSheet plan={upgradePlan} onClose={() => setUpgradePlan(null)} />
      )}
    </section>
  )
}

/**
 * UpgradeSheet — eerlijke "Binnenkort"-toelichting. Geen nep-checkout: de
 * échte afreken-flow (Polar) volgt in een latere iteratie. Tot die tijd legt
 * deze sheet uit wat de add-on biedt en dat afnemen bijna kan.
 */
function UpgradeSheet({ plan, onClose }: { plan: AddonPlan; onClose: () => void }) {
  const features = featuresForTier(plan.tier)
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-heading"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-[var(--paper)] p-6 pb-[calc(1.5rem+var(--safe-area-bottom,0px))] sm:pb-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--subtle)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              <Clock className="w-3 h-3" aria-hidden="true" />
              Binnenkort
            </div>
            <h3
              id="upgrade-heading"
              className="mt-2 font-serif text-xl text-[var(--ink)]"
            >
              {plan.name} — {formatPlanPrice(plan.priceEur)}
              <span className="text-sm font-normal text-[var(--ink-3)]"> /maand</span>
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className="rounded-lg p-1.5 text-[var(--ink-3)] hover:bg-[var(--subtle)] transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-3 text-sm text-[var(--ink-2)] leading-relaxed">
          {plan.tagline} Het afrekenen zetten we als laatste stap aan — de
          functionaliteit en je toegang staan al klaar.
        </p>

        <ul className="mt-4 space-y-1.5">
          {features.map((f) => (
            <li
              key={f.id}
              className="flex items-start gap-2 text-xs text-[var(--ink-2)] leading-snug"
            >
              <Check className="mt-0.5 w-3.5 h-3.5 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
              <span>
                <span className="font-semibold text-[var(--ink)]">{f.label}</span>
                {' — '}
                {f.description}
              </span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-xl border border-[var(--border-md)] px-4 py-2.5 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
        >
          Sluiten
        </button>
      </div>
    </div>
  )
}
