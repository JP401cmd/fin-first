'use client'

/**
 * Aflosstrategie-tab — host voor `<DebtPayoffStrategy>`.
 *
 * Verschijnt op `/core/debts/<type>` voor zes debt-types (personal_loan,
 * student_loan, car_loan, credit_card, revolving_credit, mortgage). De tab
 * laadt zelf alle actieve schulden waar `has_strategy_tracking === true` —
 * niet alleen schulden van het huidige type, want de aflossings-engine werkt
 * over de complete portefeuille (snowball/avalanche heeft pas zin als alle
 * getrackte schulden meedoen).
 *
 * Waarom client-side load i.p.v. server-prop:
 * Symmetrisch met hoe `cash-budgetteren-tab.tsx` zijn full-feature client
 * embedt — de host-pagina (`debt-category-page.tsx`) levert geen schulden-
 * lijst boven deze categorie heen, en het zou de server-loader oprekken om
 * dat alleen voor één tab te doen. Een client-fetch op tab-mount is
 * acceptabel: de query is licht (`select('*').eq('is_active', true)
 * .eq('has_strategy_tracking', true)`) en de tab is per definitie achter een
 * extra klik, dus geen invloed op page-load Web Vitals.
 *
 * Module-uit pad:
 * Wanneer `moduleActive === false` rendert de tab direct de teaser-tak
 * zonder Supabase-call. Pattern is identiek aan `cash-budgetteren-tab.tsx`.
 */

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Debt } from '@/lib/debt-data'
import type { DeepeningTabProps } from '../category-deepening-registry'
import { ModuleTipStrip } from '../module-tip-strip'
import { DebtPayoffStrategy } from './debt-payoff-strategy'

// ── Component ────────────────────────────────────────────────

/**
 * Top-level entry. Splitst op `moduleActive` zodat de actieve tak (incl.
 * Supabase-fetch) nooit mount wanneer de module uit staat. Voorkomt
 * onnodige RPC's en houdt de teaser puur presentatie.
 */
export function AflosstrategieTab({ moduleActive }: DeepeningTabProps) {
  if (!moduleActive) {
    return <AflosstrategieTeaser />
  }
  return <AflosstrategieActive />
}

// ── Teaser-tak (module uit) ──────────────────────────────────

function AflosstrategieTeaser() {
  return (
    <div className="space-y-6">
      <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-8">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Module uit
        </p>
        <h3 className="mt-2 font-serif text-xl font-semibold text-[var(--ink)]">
          Toekomstplannen is niet ingeschakeld
        </h3>
        <p className="mt-2 font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
          Met Toekomstplannen zie je je optimale aflossingsroute over al je
          schulden, met scenario&apos;s voor extra aflossen. Schakel het in
          via Instellingen om hier inzicht te krijgen.
        </p>
      </div>
      <ModuleTipStrip
        copy="Activeer Toekomstplannen om je optimale aflossingsroute over al je schulden te zien."
        className="border-t-0"
      />
    </div>
  )
}

// ── Actieve tak (module aan) ─────────────────────────────────

/**
 * Laadt alle getrackte schulden en delegeert naar `<DebtPayoffStrategy>`.
 *
 * State:
 *  - `debts: null` → loading (skeleton)
 *  - `debts: []`   → geen getrackte schulden (empty state binnen
 *    `<DebtPayoffStrategy>` — daar is de copy + tone al gedefinieerd)
 *  - `debts: [...]` → engine actief
 *  - `error: string` → fetch faalde, retry-knop
 *
 * `aborted`-flag voorkomt setState op een unmounted component bij snel
 * weg-/teruggetabbed worden.
 */
function AflosstrategieActive() {
  const [debts, setDebts] = useState<Debt[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let aborted = false
    void (async () => {
      try {
        const supabase = createClient()
        const { data, error: dbError } = await supabase
          .from('debts')
          .select('*')
          .eq('is_active', true)
          .eq('has_strategy_tracking', true)
          // Avalanche-default: hoogste rente bovenaan in de tabel zonder
          // dat de gebruiker hoeft te klikken.
          .order('interest_rate', { ascending: false })
        if (aborted) return
        if (dbError) throw dbError
        setDebts((data ?? []) as Debt[])
      } catch (err) {
        if (aborted) return
        setError(err instanceof Error ? err.message : 'Onbekende fout')
      }
    })()
    return () => {
      aborted = true
    }
  }, [])

  if (error) {
    return <ErrorBox detail={error} />
  }
  if (debts === null) {
    return <SkeletonBox />
  }

  // De engine handelt zijn eigen empty-state af (zie `DebtPayoffStrategy`'s
  // `DebtPayoffEmpty`). Hier alleen doorgeven; geen extra wrapper-card —
  // de tab-container in `debt-category-page.tsx` levert al de outer space.
  return <DebtPayoffStrategy debts={debts} />
}

// ── Skeleton ─────────────────────────────────────────────────

/**
 * Skeleton volgt de visuele opbouw van `<DebtPayoffStrategy>`: kicker-strip,
 * strategie-toggle (twee blokken naast elkaar), slider, chart-block en een
 * tabel-blok. Krant-stijl: scherpe hoeken, grijze blokken op `--paper`,
 * geen `rounded-*`. Pulse via Tailwind's `animate-pulse` — respecteert
 * `prefers-reduced-motion` automatisch.
 */
function SkeletonBox() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      {/* Kicker + meta */}
      <div className="space-y-2">
        <div className="h-2.5 w-28 animate-pulse bg-[var(--subtle)]" />
        <div className="h-3 w-40 animate-pulse bg-[var(--subtle)]" />
      </div>
      {/* Strategie-toggle (twee kolommen) */}
      <div className="grid grid-cols-2 gap-px bg-[var(--border-ed)]">
        <div className="h-[68px] animate-pulse bg-[var(--paper)]" />
        <div className="h-[68px] animate-pulse bg-[var(--paper)]" />
      </div>
      {/* Slider-blok */}
      <div className="h-[110px] animate-pulse border border-[var(--border-ed)] bg-[var(--paper)]" />
      {/* Chart-blok */}
      <div className="h-[260px] animate-pulse border border-[var(--border-ed)] bg-[var(--paper)]" />
      {/* Tabel */}
      <div className="h-[180px] animate-pulse border border-[var(--border-ed)] bg-[var(--paper)]" />
      <span className="sr-only">Aflosstrategie wordt geladen…</span>
    </div>
  )
}

// ── Error box ────────────────────────────────────────────────

/**
 * Error-state met retry. Copy volgt de UX-skill (wat ging mis + hoe fix je
 * het). Geen toast — de fout zit in de tab-context, dus inline is duidelijker.
 * `role="alert"` zorgt dat screenreaders het direct oppikken.
 */
function ErrorBox({ detail }: { detail: string }) {
  return (
    <div
      role="alert"
      className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-8"
    >
      <p className="text-[10px] uppercase tracking-[0.08em] text-negative">
        Schulden niet geladen
      </p>
      <p className="mt-2 font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
        We konden de getrackte schulden niet ophalen. Probeer de pagina te
        verversen — als het probleem blijft, controleer je internetverbinding.
      </p>
      {/* Detail-string krijgt een eigen monoblok zodat een ondersteuner het
          kan herkennen, maar in een rustige meta-tint zodat het niet de
          aandacht trekt. */}
      <p className="mt-3 font-mono text-[11px] leading-snug text-[var(--ink-4)]">
        {detail}
      </p>
      <button
        type="button"
        onClick={() => {
          // Volledige reload is hier de eerlijkste retry — een soft-retry
          // zou een nieuwe useEffect-cycle vereisen via key-bumping en is
          // overkill voor een edge-case. Page-refresh herhaalt ook RLS-
          // checks, wat soms de echte oorzaak is.
          if (typeof window !== 'undefined') window.location.reload()
        }}
        className="mt-4 inline-flex h-11 items-center gap-2 border border-kern-300 bg-kern-50 px-4 text-sm font-medium text-kern-700 transition-colors hover:bg-kern-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        Opnieuw proberen
      </button>
    </div>
  )
}
