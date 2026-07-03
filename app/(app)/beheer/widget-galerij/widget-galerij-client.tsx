'use client'

import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { WidgetRenderer, type DashboardData } from '@/components/widgets/widget-renderer'
import { FeatureAccessProvider } from '@/components/app/feature-access-provider'
import type { FeatureAccessData, FeatureAccessMap } from '@/lib/compute-feature-access'
import { WIDGET_CATALOG, type WidgetModule } from '@/lib/widget-catalog'
import { ALL_MODULES } from '@/lib/module-registry'

// ── Gating-bypass ────────────────────────────────────────────────
// Een lege feature-map laat élke widget door: WidgetRenderer checkt
// `isFeatureAccessible(features, id)` en die faalt fail-open (onbekende
// feature = toegankelijk). De abonnement-laag in `isWidgetVisible` checkt
// echter de tier ONAFHANKELIJK van deze map, dus de bypass-provider hieronder
// levert álle add-ons ('connected' + 'ai') én alle modules actief.
const EMPTY_FEATURES: FeatureAccessMap = {}

// Provider-payload die alles vrijgeeft. `features: {}` → fail-open op de
// feature-laag; `subscriptions: ['connected', 'ai']` → geen enkele widget
// blijft tier-locked. De overige velden zijn motivatie-only (Jouw Pad) en
// spelen geen rol in de zichtbaarheid.
const BYPASS_ACCESS: FeatureAccessData = {
  features: EMPTY_FEATURES,
  phase: 'recovery',
  level: 0,
  tier: 'ai',
  subscriptions: ['connected', 'ai'],
  netWorth: 0,
  monthlyExpenses: 0,
  freedomPct: 0,
}

// ── Size → span + label ──────────────────────────────────────────
// Volledig over alle vijf mogelijke WidgetSize-waarden, inclusief de 'xl'
// ("Double") die in parallel werk aan het type wordt toegevoegd. Sleutels als
// `string` zodat dit compileert ongeacht of 'xl' al in het union zit; onbekende
// maten vallen terug op een 1×1-cel. De spans spiegelen de echte dashboard-grid
// (`grid-cols-2 lg:grid-cols-4`) uit components/widgets/draggable-widget-grid.
const SIZE_SPAN: Partial<Record<string, string>> = {
  mini: 'col-span-1 row-span-1',
  quarter: 'col-span-1 row-span-1',
  half: 'col-span-1 row-span-2 lg:col-span-2 lg:row-span-1',
  full: 'col-span-2 row-span-2',
  xl: 'col-span-2 lg:col-span-4 row-span-2',
}
const SIZE_LABEL: Partial<Record<string, string>> = {
  mini: 'XS',
  quarter: 'S',
  half: 'M',
  full: 'L',
  xl: 'Double',
}

// ── Module-identiteit (module-tokens, geen Tailwind-standaardkleuren) ────────
const MODULE_DOT: Record<WidgetModule, string> = {
  kern: 'bg-kern-500',
  wil: 'bg-wil-500',
  horizon: 'bg-horizon-500',
  cross: 'bg-[var(--ink-4)]',
}
const MODULE_LABEL: Record<WidgetModule, string> = {
  kern: 'Overzicht',
  wil: 'Tips & acties',
  horizon: 'Toekomst',
  cross: 'Cross-module',
}

export function WidgetGalerijClient({ data }: { data: DashboardData }) {
  const router = useRouter()

  return (
    <FeatureAccessProvider data={BYPASS_ACCESS} activeModules={[...ALL_MODULES]}>
      <div className="space-y-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-[var(--ink)]">Widget-galerij</h2>
            <p className="mt-1 text-sm text-[var(--ink-3)]">
              Alle {WIDGET_CATALOG.length} widgets uit de catalogus, in elke toegestane grootte,
              op de echte data van dit account. Gating is bewust omzeild — álle modules en
              abonnementen staan aan zodat elke widget zichtbaar is.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="flex shrink-0 items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-xs font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Opnieuw laden
          </button>
        </div>

        {/* Widget-secties */}
        <div className="space-y-8">
          {WIDGET_CATALOG.map((def) => (
            <section key={def.id} className="border-t border-[var(--border-ed)] pt-5">
              {/* Sectie-kop: naam + id + module + beschrijving */}
              <div className="mb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${MODULE_DOT[def.module]}`} />
                  <h3 className="text-sm font-semibold text-[var(--ink)]">{def.name}</h3>
                  <span className="font-mono text-[10px] text-[var(--ink-4)]">{def.id}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-4)]">
                    {MODULE_LABEL[def.module]}
                  </span>
                </div>
                <p className="mt-0.5 ml-4 text-xs text-[var(--ink-3)]">{def.description}</p>
              </div>

              {/* Elke toegestane size in de echte dashboard-grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 auto-rows-[64px] sm:auto-rows-[160px] gap-3 sm:gap-4">
                {def.sizes.map((size) => (
                  <div key={size} className={`flex min-h-0 flex-col ${SIZE_SPAN[size] ?? 'col-span-1 row-span-1'}`}>
                    <span className="mb-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
                      {SIZE_LABEL[size] ?? size} · {size}
                    </span>
                    <div className="relative min-h-0 flex-1">
                      {/* Placeholder-laag ligt eronder; een opake widget dekt 'm af.
                          Rendert de widget null (bv. geen data), dan blijft dit vak
                          zichtbaar. */}
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[var(--r-lg)] border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/40 px-2 text-center">
                        <span className="text-[10px] text-[var(--ink-4)]">Geen data voor dit account</span>
                      </div>
                      <div className="relative h-full">
                        <WidgetRenderer id={def.id} size={size} data={data} features={EMPTY_FEATURES} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </FeatureAccessProvider>
  )
}
