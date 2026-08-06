'use client'

import { TrendingUp } from 'lucide-react'
import HoldingsPage from '@/components/core/holdings-client'
import type { HoldingsPageData } from '@/lib/holdings-data-loader'
import type { Asset } from '@/lib/asset-data'
import type { DeepeningTabProps } from '../category-deepening-registry'
import { ModuleTipStrip } from '../module-tip-strip'
import { AppSetupGate } from '@/components/app/app-setup/app-setup-gate'
import { AppLinkGate } from '@/components/app/app-setup/app-link-gate'
import { useIsAppSetupCompleted } from '@/components/app/app-setup/use-is-setup-completed'

// ── Component ────────────────────────────────────────────────

/**
 * Verdiepingstab "Holdings" voor de investment-categorie.
 *
 * Bewuste keuze: in plaats van een eigen tabel-implementatie te bouwen
 * embedden we hier de volledige `<HoldingsPage />` — dezelfde component die
 * `/core/assets/holdings` rendert. De gebruiker krijgt zo binnen de
 * investment-tab dezelfde rijke ervaring (allocation chart, benchmark,
 * dividend tracker, heatmap, full CRUD) zonder dat we logica dupliceren.
 *
 * Module-uit pad:
 * - Wanneer Aandelenregistratie uit staat tonen we een teaser + tip-strip
 *   met deeplink naar Instellingen. De `<HoldingsPage />` wordt dan nooit
 *   gemount.
 *
 * Layout: `<HoldingsPage />` is embeddable — host (de category-page tab-container)
 * levert horizontale padding via `asset-category-page.tsx` regel 494.
 * Geen breakout meer nodig.
 */
export function InvestmentHoldingsTab({ moduleActive, initialData, assets, currentUserId }: DeepeningTabProps) {
  // Splits op de outer-prop: bij module-uit zien we de actieve tak nooit.
  if (!moduleActive) {
    return <InvestmentHoldingsTeaser />
  }
  // Cast op het eindpunt: registry-laag is generiek (`unknown`), hier
  // weten we welke shape we verwachten van de server-loader.
  return (
    <InvestmentHoldingsActive
      initialData={initialData as HoldingsPageData | undefined}
      assets={assets}
      currentUserId={currentUserId}
    />
  )
}

// ── Teaser-tak (module uit) ──────────────────────────────────

function InvestmentHoldingsTeaser() {
  return (
    <div className="space-y-6">
      <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-8">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Module uit
        </p>
        <h3 className="mt-2 font-serif text-xl font-semibold text-[var(--ink)]">
          Aandelenregistratie is niet ingeschakeld
        </h3>
        <p className="mt-2 font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
          Met Aandelenregistratie zie je per holding de huidige waarde,
          kostenbasis en je dagrendement. Schakel het in via Instellingen om hier inzicht te krijgen.
        </p>
      </div>
      <ModuleTipStrip
        copy="Activeer Aandelenregistratie om individuele holdings, koersen en dagrendement bij te houden."
        className="border-t-0"
      />
    </div>
  )
}

// ── Actieve tak (module aan) ─────────────────────────────────

interface InvestmentHoldingsActiveProps {
  initialData?: HoldingsPageData
  assets?: Asset[]
  currentUserId?: string
}

/**
 * Embed de volledige `<HoldingsPage />` in de tab. Sinds de wrapper-refactor
 * (mei 2026) levert `HoldingsPage` zelf geen outer `mx-auto max-w-*` of
 * `px-*` meer — host-padding van de category-tab-container voldoet. Wanneer
 * `initialData` ontbreekt valt HoldingsPage terug op zijn eigen client-side
 * fetch — geen losse skeleton hier nodig.
 */
function InvestmentHoldingsActive({ initialData, assets, currentUserId }: InvestmentHoldingsActiveProps) {
  const setupCompleted = useIsAppSetupCompleted('aandelen_holdings')
  if (setupCompleted === null) return <AppSetupSkeleton />
  if (setupCompleted === false) return <AppSetupGate appKey="aandelen_holdings" />

  // Setup voltooid maar geen enkele belegging (meer) gekoppeld aan de app
  // (`has_holdings_tracking`) → koppelscherm. Kandidaten komen uit de
  // server-bundel van de host; opslaan schrijft dezelfde vlag als de
  // instelling op de bezitting zelf (/api/assets/toggle-holdings).
  // Alleen éígen beleggingen als kandidaat: lezen is huishoud-verbreed, maar
  // de toggle-write is strikt eigen-rij — een partner-rij zou altijd falen.
  const investmentAssets = assets ?? []
  const linkableAssets = currentUserId
    ? investmentAssets.filter((a) => a.user_id === currentUserId)
    : investmentAssets
  if (!investmentAssets.some((a) => a.has_holdings_tracking)) {
    return (
      <AppLinkGate
        kicker="Bezittingen koppelen"
        title="Koppel je beleggingen"
        intro="De Holdings-app volgt alleen de beleggingen die je koppelt. Kies hieronder welke beleggingen je in deze app wilt bijhouden."
        itemNoun="belegging"
        icon={TrendingUp}
        candidates={linkableAssets.map((a) => ({
          id: a.id,
          name: a.name,
          value: Number(a.current_value),
        }))}
        endpoint="/api/assets/toggle-holdings"
        emptyCopy="Je hebt nog geen belegging geregistreerd. Voeg er eerst één toe op de Posities-tab — daarna kun je 'm hier aan de app koppelen."
        emptyCtaLabel="Voeg belegging toe"
      />
    )
  }

  return <HoldingsPage initialData={initialData} />
}

// ── Skeleton tijdens setup-check ─────────────────────────────

function AppSetupSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <div className="h-[120px] animate-pulse border-t border-b border-[var(--ink)] bg-[var(--paper)]" />
      <div className="h-[180px] animate-pulse border border-[var(--border-ed)] bg-[var(--subtle)]/40" />
      <span className="sr-only">Setup-status wordt gecheckt…</span>
    </div>
  )
}
