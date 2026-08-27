'use client'

/**
 * VasteLastenInsights — de uitgebreide inzicht-blokken voor het
 * Vaste-lasten-scherm (/overzicht/cashflow/vaste-lasten), getoond in de
 * weergavemodus "Volledig" (de aanroeper wikkelt dit in <HideInSimple>).
 *
 * Pure presentatie: consumeert het serialiseerbare `VasteLastenInsights`-model
 * (lib/vaste-lasten-insights.ts) — herberekent zelf geen kerngetallen. Bedragen
 * lopen via <MaskedAmount> (privacy-masking). Module-chrome = kern (amber);
 * status-semantiek gebruikt de stoplichtkleuren, geen module-accent.
 */

import { useState } from 'react'
import { Gauge, Clock, CreditCard, PieChart, Scissors, Ban } from 'lucide-react'
import { MaskedAmount } from '@/components/app/masked-amount'
import { formatFreedomTimeString } from '@/lib/format'
import { formatWorkTimeString } from '@/lib/work-time'
import {
  cancelEffect,
  type VasteLastenInsights as Insights,
} from '@/lib/vaste-lasten-insights'
import { LEVERAGE_STATUS_DOT, leverageStatusTextClass } from '@/lib/leverage-status'
import {
  SUBSCRIPTION_BENCHMARK_COPY,
  VASTE_LASTEN_BENCHMARK_COPY,
} from '@/lib/vaste-lasten-benchmarks'

// Kern-ramp (amber) voor de samenstellingsbalk — module-identiteit via tokens,
// geen Tailwind-standaardkleuren. Aflopende tint per segment.
const COMPOSITION_SHADES = [800, 700, 600, 500, 400, 300, 200] as const

function SectionShell({
  icon: Icon,
  kicker,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  kicker: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 shadow-[var(--s0)] sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-kern-600" />
        <h3 className="label-editorial text-[var(--ink-2)]">{kicker}</h3>
      </div>
      {children}
    </section>
  )
}

// ── 1. Vaste-lastenquote-meter ────────────────────────────────
function QuoteMeter({ insights }: { insights: Insights }) {
  const { meterValue, ratioPct, status, meterGoodMax, meterWarnMax } = insights
  if (meterValue == null || ratioPct == null) {
    return (
      <p className="text-sm text-[var(--ink-3)]">
        Vul je maandinkomen in bij Cashflow-instellingen om je vaste-lastenquote te zien.
      </p>
    )
  }
  const goodPct = meterGoodMax * 100
  const warnPct = meterWarnMax * 100
  const fillPct = Math.min(100, ratioPct)
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-serif text-2xl font-semibold tabular-nums text-[var(--ink)]">
          {ratioPct}%
        </span>
        <span className={`text-xs font-medium ${leverageStatusTextClass(status)}`}>
          {status === 'good'
            ? 'Gezond'
            : status === 'warn'
              ? 'Aandacht'
              : status === 'bad'
                ? 'Risico'
                : '—'}
        </span>
      </div>
      {/* Track met zones (goed / aandacht / risico) — grenzen = statusdrempels. */}
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
        <div
          className="absolute inset-y-0 left-0 bg-emerald-500/15"
          style={{ width: `${goodPct}%` }}
        />
        <div
          className="absolute inset-y-0 bg-amber-500/15"
          style={{ left: `${goodPct}%`, width: `${warnPct - goodPct}%` }}
        />
        <div
          className="absolute inset-y-0 bg-red-500/15"
          style={{ left: `${warnPct}%`, right: 0 }}
        />
        {/* Vulling tot jouw aandeel, in de statuskleur. */}
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${LEVERAGE_STATUS_DOT[status]} opacity-80 transition-[width] duration-500`}
          style={{ width: `${fillPct}%` }}
        />
      </div>
      {/* Zone-labels op de drempels. */}
      <div className="relative mt-1 h-4 text-[10px] text-[var(--ink-4)]">
        <span className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${goodPct}%` }}>
          {goodPct.toFixed(0)}%
        </span>
        <span className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${warnPct}%` }}>
          {warnPct.toFixed(0)}%
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[var(--ink-3)]">
        {VASTE_LASTEN_BENCHMARK_COPY.nibud}
      </p>
      {/* H14 — verantwoord waaróm de quote lager is dan de som van alles wat
          terugkomt. Zonder deze regel lijkt er geld te verdwijnen. */}
      {insights.variabelCount > 0 && (
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-4)]">
          Boodschappen, tanken en winkelen tellen hier niet in mee (
          <MaskedAmount
            value={insights.variabelMonthly}
            tone="ink"
            className="text-[var(--ink-3)]"
          />
          /mnd): ze komen wel terug, maar het bedrag is jouw keuze. Je vindt ze hierboven onder
          &ldquo;Terugkerend, maar variabel&rdquo;.
        </p>
      )}
    </div>
  )
}

// ── 2. Tijd-vertaling ─────────────────────────────────────────
//
// TWEE GROOTHEDEN, ELK MET EIGEN TAAL (ADR 0105):
//  · vrijheidstijd (`freedom*`, deelt op het UITGAVEN-dagtarief) → "kost je …
//    vrijheid";
//  · werktijd (`workTimePerYear`, deelt op het BRUTO INKOMEN-dagtarief) → "je
//    werkt … van je jaar hiervoor".
// De tweede zin dróég hier werktijd-taal over een vrijheidstijd-getal ("… die je
// werkt om je vaste lasten te betalen"). Twee zulke uitgaven-aandelen zijn geen
// delen van hetzelfde werkjaar, waardoor deze pagina en /overzicht/belasting
// samen achttien maanden per jaar claimden (bevinding C5). Zonder bekend bruto
// jaarinkomen tonen we géén werktijd-claim, maar de vrijheidstijd-formulering.
function FreedomTranslation({ insights }: { insights: Insights }) {
  const { freedomDaysPerMonth, freedomPerYear, workTimePerYear } = insights
  const yearStr = formatFreedomTimeString(freedomPerYear, 'long')
  const workStr = formatWorkTimeString(workTimePerYear)
  const showWorkTime = workTimePerYear.hasBasis && workTimePerYear.monthsPerYear > 0
  return (
    <div className="space-y-1.5">
      <p className="text-sm leading-relaxed text-[var(--ink-2)]">
        Je vaste lasten staan gelijk aan{' '}
        <strong className="font-semibold text-[var(--ink)] tabular-nums">
          ± {freedomDaysPerMonth} {freedomDaysPerMonth === 1 ? 'dag' : 'dagen'} vrijheid
        </strong>{' '}
        per maand.
      </p>
      {showWorkTime ? (
        <p className="text-xs text-[var(--ink-3)]">
          Je werkt <span className="font-medium text-[var(--ink-2)]">{workStr}</span> van je jaar om
          ze te betalen
          {workTimePerYear.exceedsWorkYear ? ' — meer dan een heel werkjaar' : ''}. Elke euro minder
          is vrijheid die je terugkoopt.
        </p>
      ) : (
        <p className="text-xs text-[var(--ink-3)]">
          Over een heel jaar kost dat je{' '}
          <span className="font-medium text-[var(--ink-2)]">{yearStr}</span> vrijheid. Elke euro
          minder is vrijheid die je terugkoopt.
        </p>
      )}
    </div>
  )
}

// ── 3. Abonnementen-sluipverbruik ─────────────────────────────
function SubscriptionCreep({
  insights,
  onOpzeg,
}: {
  insights: Insights
  onOpzeg: (item: { name: string; monthlyAmount: number }) => void
}) {
  const {
    subscriptionsMonthly,
    subscriptionBenchmarkMonthly,
    subscriptionDeltaMonthly,
    aboveSubscriptionBenchmark,
    largestSubscription,
    subscriptionCount,
  } = insights
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-[var(--ink-4)]">Jouw abonnementen</p>
          <MaskedAmount
            value={subscriptionsMonthly}
            tone="kern"
            className="font-serif text-2xl font-semibold text-[var(--ink)]"
          />
          <span className="ml-1 text-xs text-[var(--ink-3)]">/mnd</span>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-[var(--ink-4)]">NL-gemiddelde</p>
          <p className="font-mono text-lg tabular-nums text-[var(--ink-3)]">
            € {subscriptionBenchmarkMonthly}
            <span className="text-xs">/mnd p.p.</span>
          </p>
        </div>
      </div>

      <p className={`text-xs font-medium ${aboveSubscriptionBenchmark ? 'text-amber-700' : 'text-emerald-700'}`}>
        {aboveSubscriptionBenchmark
          ? 'Je zit boven het gemiddelde — kijk of er posten tussen zitten die je niet meer gebruikt.'
          : `Je zit ${Math.abs(subscriptionDeltaMonthly) >= 1 ? 'onder' : 'rond'} het gemiddelde. Netjes.`}
      </p>

      <p className="text-xs leading-relaxed text-[var(--ink-3)]">
        {SUBSCRIPTION_BENCHMARK_COPY.sluipverbruik} {SUBSCRIPTION_BENCHMARK_COPY.underestimate}{' '}
        {SUBSCRIPTION_BENCHMARK_COPY.forget}
      </p>

      {largestSubscription && subscriptionCount > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[11px] text-[var(--ink-4)]">Grootste abonnement</p>
            <p className="truncate text-sm font-medium text-[var(--ink)]">
              {largestSubscription.name}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <MaskedAmount
              value={largestSubscription.monthlyAmount}
              tone="kern"
              className="text-sm text-[var(--ink)]"
            />
            <button
              type="button"
              onClick={() => onOpzeg(largestSubscription)}
              className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--negative)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              <Ban className="h-3.5 w-3.5" aria-hidden="true" />
              Opzeggen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 4. Samenstelling per categorie ────────────────────────────
function Composition({ insights }: { insights: Insights }) {
  const { composition, totalMonthly } = insights
  if (composition.length === 0 || totalMonthly <= 0) {
    return <p className="text-sm text-[var(--ink-3)]">Nog geen categorieën om te tonen.</p>
  }
  return (
    <div className="space-y-3">
      {/* Gestapelde verhoudingsbalk. */}
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
        {composition.map((row, i) => (
          <div
            key={row.category}
            style={{
              width: `${Math.max(1, row.share * 100)}%`,
              backgroundColor: `var(--color-kern-${COMPOSITION_SHADES[i % COMPOSITION_SHADES.length]})`,
            }}
            title={`${row.label} · ${Math.round(row.share * 100)}%`}
          />
        ))}
      </div>
      {/* Legenda. */}
      <ul className="space-y-1.5">
        {composition.map((row, i) => (
          <li key={row.category} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: `var(--color-kern-${COMPOSITION_SHADES[i % COMPOSITION_SHADES.length]})`,
                }}
                aria-hidden="true"
              />
              <span className="truncate text-[var(--ink-2)]">{row.label}</span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--ink-4)]">
                {Math.round(row.share * 100)}%
              </span>
            </span>
            <MaskedAmount
              value={row.monthlyAmount}
              tone="kern"
              className="shrink-0 text-sm text-[var(--ink-2)]"
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── 5. "Wat als ik opzeg" mini-effect ─────────────────────────
function WhatIfCancel({ insights }: { insights: Insights }) {
  const start = insights.largestSubscription?.monthlyAmount ?? insights.largestItem?.monthlyAmount ?? 10
  const [monthly, setMonthly] = useState<number>(Math.round(start))
  // Canoniek dagtarief uit de insights-bundel (12-mnd rolling), niet de
  // effective maanduitgaven — zelfde noemer als de vrijheidsregels erboven.
  const { yearlyEuro, freedom } = cancelEffect(monthly, insights.dailyExpenseRate)
  const freedomStr = formatFreedomTimeString(freedom, 'long')
  return (
    <div className="space-y-3">
      <label className="block text-xs text-[var(--ink-3)]" htmlFor="whatif-cancel">
        Stel dat je <span className="font-medium text-[var(--ink-2)]">€ {monthly}</span> per maand
        aan vaste lasten opzegt:
      </label>
      <input
        id="whatif-cancel"
        type="range"
        min={0}
        max={Math.max(50, Math.round(insights.totalMonthly))}
        step={1}
        value={monthly}
        onChange={(e) => setMonthly(Number(e.target.value))}
        className="w-full accent-[var(--color-kern-600)]"
      />
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-[var(--ink-4)]">Per jaar</p>
          <MaskedAmount
            value={yearlyEuro}
            tone="kern"
            className="font-serif text-lg font-semibold text-[var(--ink)]"
          />
        </div>
        <div className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-[var(--ink-4)]">Vrijheid terug</p>
          <p className="font-serif text-lg font-semibold tabular-nums text-kern-700">
            {freedom.isInfinite ? '∞' : freedomStr}
          </p>
        </div>
      </div>
    </div>
  )
}

export function VasteLastenInsights({
  insights,
  onOpzeg,
}: {
  insights: Insights
  onOpzeg: (item: { name: string; monthlyAmount: number }) => void
}) {
  if (!insights.hasData) return null
  return (
    <div className="space-y-4">
      <SectionShell icon={Gauge} kicker="Vaste-lastenquote">
        <QuoteMeter insights={insights} />
      </SectionShell>

      <SectionShell icon={Clock} kicker="In vrijheidstijd">
        <FreedomTranslation insights={insights} />
      </SectionShell>

      {insights.subscriptionCount > 0 && (
        <SectionShell icon={CreditCard} kicker="Abonnementen-sluipverbruik">
          <SubscriptionCreep insights={insights} onOpzeg={onOpzeg} />
        </SectionShell>
      )}

      <SectionShell icon={PieChart} kicker="Samenstelling">
        <Composition insights={insights} />
      </SectionShell>

      <SectionShell icon={Scissors} kicker="Wat als ik opzeg">
        <WhatIfCancel insights={insights} />
      </SectionShell>
    </div>
  )
}
