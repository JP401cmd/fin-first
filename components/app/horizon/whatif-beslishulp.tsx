'use client'

import { useMemo, useState } from 'react'
import { Coins, TrendingUp, Landmark, Shield, ChevronDown, ChevronUp, ArrowRight, Info } from 'lucide-react'
import {
  toSimResult,
  type UnifiedProjectionInput,
} from '@/lib/unified-projection'
import { runSelectedProjection } from '@/lib/horizon-engine/select'
import { lifeEventsToCashflows, type SimCashflow, type SimResult } from '@/lib/fire-simulation'
import { formatFireAge } from '@/lib/horizon-data'
import type { WhatIfEvent } from '@/components/app/horizon/whatif-events'
import type { Debt } from '@/lib/debt-data'
import { weightedDebtRate, aflossenFireAgeAtRate } from '@/components/app/horizon/whatif-beslishulp.model'
import { MaskedAmount } from '@/components/app/masked-amount'
import { CalculatorToLifeEventSheet } from '@/components/future/calculator-to-life-event-sheet'
import type { LifeEventImpactKind } from '@/lib/calculator/to-life-event'

/**
 * WhatIf-beslishulp — "Wat doe je met €X per maand extra?"
 *
 * Vergelijkt drie bestemmingen voor extra maandgeld en vertaalt elk naar
 * vrijheidstijd-impact (FIRE-leeftijd-delta). De winnaar (vroegst vrij) krijgt
 * de editorial highlight-marker. Elke optie kan als levensgebeurtenis op de
 * tijdas worden gezet via de bestaande CalculatorToLifeEventSheet.
 *
 * ── Modelkeuzes (motor-eerlijk) ─────────────────────────────────────────────
 * De motor (`runSelectedProjection`, flag-bewust v1/v2) routeert élke terugkerende
 * `income`-cashflow als surplus naar beleggingsbuckets op het VERWACHTE rendement;
 * er is GEEN per-cashflow rendement en GEEN versnelde schuldafbouw. Daarom:
 *
 * 1. BELEGGEN  — exact: een `extra_inleg`-event (monthly_income_change = +X),
 *    identiek aan de bestaande extra-inleg-slider. Compound op verwacht
 *    rendement via de echte motor. Geen benadering.
 *
 * 2. AFLOSSEN  — gegarandeerd, eigen tarief: aflossen levert het VASTE
 *    rentetarief van je schuld op (r_debt = saldo-gewogen), doorgaans lager
 *    dan het onzekere marktrendement. We raken de gedeelde motor niet aan
 *    (zowel v1 als v2 leveren het basispad + doel via `runSelectedProjection`);
 *    in plaats daarvan groeit een aparte "aflossen-pot" van €X/mnd op r_debt
 *    bovenop het netto-vermogenspad van het basisscenario, en bereikt FIRE
 *    zodra basispad + pot ≥ het motor-doelvermogen (`requiredFirePortfolio`).
 *    Zie `whatif-beslishulp.model.ts` (`aflossenFireAgeAtRate`). Distinct van
 *    beleggen: lager-maar-gegarandeerd → kleinere FIRE-versnelling wanneer
 *    r_debt < verwacht rendement (en groter wanneer r_debt hoger ligt).
 *
 * 3. NOODFONDS — bewust bijna-vlak: een liquide buffer op ~0% rendement koopt
 *    veiligheid, geen snelheid. De motor stuurt élke terugkerende income-
 *    cashflow naar compoundende beleggingsbuckets, dus we voeden noodfonds
 *    NIET als cashflow in de FIRE-projectie. Het geld blijft cash (~0%,
 *    reëel uitgehold door inflatie) → FIRE-delta ≈ 0. Dat is de eerlijke
 *    boodschap.
 *
 * Edge: zonder actieve schuld (geen r_debt) heeft aflossen geen betekenis →
 * de Aflossen-kaart wordt verborgen.
 */

type OptionId = 'beleggen' | 'aflossen' | 'noodfonds'

interface OptionResult {
  id: OptionId
  label: string
  /** Korte editorial omschrijving van de bestemming. */
  description: string
  icon: React.ReactNode
  /** FIRE-leeftijd MET deze optie (fractioneel), null als onbereikbaar. */
  fireAgeWith: number | null
  /** Verschil t.o.v. het huidige scenario in maanden (negatief = eerder vrij). */
  deltaMonths: number | null
  /** Of dit de winnaar is (vroegst vrij van de drie). */
  isWinner: boolean
  /** Optionele voetnoot over de modelbasis. */
  footnote?: string
}

export function WhatIfBeslishulp({
  baseInput,
  scenarioEvents,
  currentAge,
  debts,
  useV2,
}: {
  /**
   * De what-if UnifiedProjectionInput van de pagina (incl. return-deltas).
   * Wanneer null is er onvoldoende data — de kaart rendert niet.
   */
  baseInput: UnifiedProjectionInput | null
  /** Actieve scenario-events (DB + scenario-only) — de vergelijkingsbasis. */
  scenarioEvents: WhatIfEvent[]
  /** Huidige leeftijd (target_age voor het option-event). */
  currentAge: number
  /** Actieve schulden — voor de aflossen-rente in de voetnoot. */
  debts: Debt[]
  /**
   * Draait de gebruiker de v2-grootboek-engine? (`isHorizonV2Enabled`). Bepaalt
   * via `runSelectedProjection` of de baseline- én optie-runs door v2 of v1 lopen
   * — zodat de FIRE-maand-delta's per constructie consistent zijn met de Tijdas-
   * grafiek en de what-if-baseline van de pagina (single source of truth).
   */
  useV2: boolean
}) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(200)
  // Welke optie wordt als levensgebeurtenis gemaakt (null = sheet dicht).
  const [committing, setCommitting] = useState<OptionId | null>(null)

  // ── Cashflows van het huidige scenario (de vergelijkingsbasis) ──────────
  const scenarioCashflows = useMemo<SimCashflow[]>(
    () => lifeEventsToCashflows(scenarioEvents),
    [scenarioEvents],
  )

  const debtRate = useMemo(() => weightedDebtRate(debts), [debts])
  const hasDebt = debtRate !== null

  // ── Bouw het option-event voor beleggen/aflossen (extra_inleg-model) ─────
  // Identiek aan buildSliderEvent('extra_inleg', …): een terugkerende
  // income-cashflow die als surplus in beleggingen compound.
  const buildContributionEvent = (id: OptionId, eur: number): WhatIfEvent => ({
    id: `whatif-beslishulp-${id}`,
    name: id === 'beleggen' ? 'Extra beleggen' : 'Extra aflossen',
    event_type: 'extra_inleg',
    target_age: currentAge,
    target_date: null,
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: Math.round(eur),
    duration_months: 0,
    icon: id === 'beleggen' ? 'TrendingUp' : 'Landmark',
    is_active: true,
    sort_order: 999,
    is_indexed: true,
    metadata: {},
    is_scenario_only: true,
    scenario_origin: `beslishulp:${id}`,
  })

  // ── Bereken het BASISSCENARIO (zonder optie) één keer ───────────────────
  // De volledige SimResult (rows + requiredFirePortfolio) is nodig voor zowel
  // de baseline-FIRE-leeftijd als het Aflossen-model, dat het netto-vermogens-
  // pad én het motor-doelvermogen hergebruikt.
  const baselineSim = useMemo<SimResult | null>(() => {
    if (!baseInput) return null
    return toSimResult(
      runSelectedProjection({ ...baseInput, cashflows: scenarioCashflows }, useV2),
    )
  }, [baseInput, scenarioCashflows, useV2])

  const baselineFireAge = baselineSim?.fireAgeFractional ?? null

  // ── Bereken per optie de FIRE-leeftijd MET de optie ─────────────────────
  // Beleggen/Aflossen: scenario-cashflows + de extra-contributie-cashflow.
  // Noodfonds: identiek aan baseline (geen cashflow toegevoegd) → delta ≈ 0,
  // omdat een ~0%-buffer de FIRE-datum niet vervroegt.
  const options = useMemo<OptionResult[]>(() => {
    if (!baseInput || !baselineSim || amount <= 0) return []

    const runWith = (extra: SimCashflow[]): number | null => {
      const sim = toSimResult(
        runSelectedProjection({ ...baseInput, cashflows: [...scenarioCashflows, ...extra] }, useV2),
      )
      return sim.fireAgeFractional
    }

    const deltaFrom = (withAge: number | null): number | null =>
      withAge !== null && baselineFireAge !== null
        ? Math.round((withAge - baselineFireAge) * 12)
        : null

    // 1. Beleggen — echte motor: extra_inleg compoundt op verwacht rendement.
    const beleggenCf = lifeEventsToCashflows([buildContributionEvent('beleggen', amount)])
    const beleggenAge = runWith(beleggenCf)

    // 3. Noodfonds — bewust bijna-vlak (geen FIRE-versnelling)
    const noodfondsAge = baselineFireAge

    const raw: Omit<OptionResult, 'isWinner'>[] = [
      {
        id: 'beleggen',
        label: 'Beleggen',
        description: 'Extra inleg die meegroeit op je verwachte rendement.',
        icon: <TrendingUp className="h-5 w-5" aria-hidden />,
        fireAgeWith: beleggenAge,
        deltaMonths: deltaFrom(beleggenAge),
      },
    ]

    // 2. Aflossen — alleen tonen als er schuld is om af te lossen. Compoundt op
    // het GEGARANDEERDE saldo-gewogen schuldrente-tarief (r_debt) bovenop het
    // basispad → distinct van beleggen (lager-maar-zeker wanneer r_debt onder
    // het marktrendement ligt; hoger wanneer r_debt erboven ligt).
    if (hasDebt && debtRate !== null) {
      const aflossenAge = aflossenFireAgeAtRate(baselineSim, currentAge, amount, debtRate)
      raw.push({
        id: 'aflossen',
        label: 'Aflossen',
        description: 'Schuld terugkopen — gegarandeerd rendement op je rente.',
        icon: <Landmark className="h-5 w-5" aria-hidden />,
        fireAgeWith: aflossenAge,
        deltaMonths: deltaFrom(aflossenAge),
        footnote: `Aflossen levert je gegarandeerd je schuldrente op (~${(debtRate * 100).toFixed(1)}%), niet het onzekere marktrendement. Doorgaans dus een kleinere — maar zekere — vrijheidswinst dan beleggen.`,
      })
    }

    raw.push({
      id: 'noodfonds',
      label: 'Noodfonds',
      description: 'Liquide buffer op ~0% — koopt veiligheid, geen snelheid.',
      icon: <Shield className="h-5 w-5" aria-hidden />,
      fireAgeWith: noodfondsAge,
      deltaMonths: deltaFrom(noodfondsAge),
      footnote: 'Een noodfonds blijft cash (~0% rendement, reëel uitgehold door inflatie). Het vervroegt je vrijheidsdatum niet — het beschermt die wél tegen tegenslagen.',
    })

    // Winnaar = vroegst vrij (laagste fractionele FIRE-leeftijd). Onbereikbaar
    // telt niet mee; bij gelijkspel wint de eerste (beleggen).
    let winnerId: OptionId | null = null
    let bestAge = Infinity
    for (const o of raw) {
      if (o.fireAgeWith !== null && o.fireAgeWith < bestAge - 1e-6) {
        bestAge = o.fireAgeWith
        winnerId = o.id
      }
    }

    return raw.map(o => ({ ...o, isWinner: o.id === winnerId }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseInput, baselineSim, amount, scenarioCashflows, baselineFireAge, hasDebt, debtRate, currentAge, useV2])

  if (!baseInput) return null

  // ── Impact-mapping per optie voor de levensgebeurtenis-sheet ────────────
  const commitConfig: Record<OptionId, { name: string; kind: LifeEventImpactKind }> = {
    beleggen: { name: `Extra beleggen ${formatEur(amount)}/mnd`, kind: 'monthly_income' },
    aflossen: { name: `Extra aflossen ${formatEur(amount)}/mnd`, kind: 'monthly_income' },
    noodfonds: { name: `Noodfonds opbouwen ${formatEur(amount)}/mnd`, kind: 'monthly_cost' },
  }

  return (
    <div className="card-editorial overflow-hidden">
      {/* ── Collapsible header (zelfde patroon als WhatIfSlidersCollapsible) ── */}
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ink)]"
      >
        <div className="flex items-center gap-3">
          <Coins className="h-4 w-4 text-[var(--ink-3)]" aria-hidden />
          <div>
            <p className="font-sans text-sm font-semibold text-[var(--ink)]">
              Wat doe je met extra geld?
            </p>
            <p className="mt-0.5 font-sans text-xs text-[var(--ink-3)]">
              Vergelijk beleggen, aflossen en noodfonds — in vrijheidstijd
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
        )}
      </button>

      {open && (
        <div className="border-t border-[var(--border-ed)] px-4 pb-4 pt-4 sm:px-5">
          {/* ── Bedrag-invoer ─────────────────────────────────────── */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Bedrag per maand
              </span>
              <span className="font-mono text-sm tabular-nums text-[var(--ink)]">
                <MaskedAmount value={amount} tone="horizon" />
                <span className="text-[var(--ink-4)]">/mnd</span>
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={2000}
              step={50}
              value={amount}
              onChange={e => setAmount(Number(e.target.value))}
              className="w-full accent-horizon-600"
              aria-label="Bedrag per maand extra"
            />
            <div className="flex justify-between font-sans text-[10px] text-[var(--ink-4)]">
              <span>€ 50</span>
              <span>€ 2.000</span>
            </div>
          </div>

          {/* ── Optie-kaarten naast elkaar (2 of 3, afhankelijk van schuld) ── */}
          <div
            className={`grid grid-cols-1 gap-2 ${
              options.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
            }`}
          >
            {options.map(opt => (
              <OptionCard
                key={opt.id}
                option={opt}
                onCommit={() => setCommitting(opt.id)}
              />
            ))}
          </div>

          <p className="mt-3 font-sans text-[10px] leading-snug text-[var(--ink-4)]">
            Vergeleken vanaf je huidige scenario. &quot;Kies deze&quot; zet de keuze als
            levensgebeurtenis op je tijdas, zodat de projectie er blijvend mee rekent.
          </p>
        </div>
      )}

      {/* ── Levensgebeurtenis-sheet (hergebruikt) ─────────────────── */}
      {committing && (
        <CalculatorToLifeEventSheet
          defaultName={commitConfig[committing].name}
          defaultAmount={amount}
          defaultAge={currentAge}
          defaultImpactKind={commitConfig[committing].kind}
          defaultDurationMonths={0}
          onClose={() => setCommitting(null)}
        />
      )}
    </div>
  )
}

// ── OptionCard ────────────────────────────────────────────────────────────────

function OptionCard({
  option,
  onCommit,
}: {
  option: OptionResult
  onCommit: () => void
}) {
  const { label, description, icon, fireAgeWith, deltaMonths, isWinner, footnote } = option

  // Vrijheidstijd-framing: negatieve delta = eerder vrij (positief gevoel).
  const earlier = deltaMonths !== null && deltaMonths < 0
  const flat = deltaMonths === null || Math.abs(deltaMonths) < 1
  const deltaLabel = fireAgeWith === null
    ? 'onbereikbaar'
    : flat
      ? 'vrijheidsdatum gelijk'
      : earlier
        ? `${Math.abs(deltaMonths!)} mnd eerder vrij`
        : `${deltaMonths} mnd later vrij`

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border p-3 transition-colors ${
        isWinner
          ? 'border-horizon-500 bg-horizon-50/60'
          : 'border-[var(--border-ed)] bg-[var(--paper)]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={isWinner ? 'text-horizon-600' : 'text-[var(--ink-3)]'}>
          {icon}
        </span>
        {isWinner && (
          <span className="rounded-full bg-horizon-500 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-white">
            Snelst
          </span>
        )}
      </div>

      <h4 className={`font-sans text-sm font-semibold ${isWinner ? 'text-horizon-700' : 'text-[var(--ink)]'}`}>
        {label}
      </h4>

      {/* Vrijheidsleeftijd — editorial figure, winnaar krijgt highlight-marker */}
      <div>
        <div
          className="text-[20px] font-black leading-none tracking-[-0.02em] tabular-nums"
          style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
        >
          {isWinner ? (
            <span
              className="inline px-1"
              style={{ backgroundImage: 'linear-gradient(transparent 60%, var(--module-active-200) 60%)' }}
            >
              {formatFireAge(fireAgeWith)}
            </span>
          ) : (
            formatFireAge(fireAgeWith)
          )}
        </div>
        <p
          className={`mt-1 font-mono text-[11px] tabular-nums ${
            earlier && !flat ? 'text-horizon-700' : flat ? 'text-[var(--ink-3)]' : 'text-kern-700'
          }`}
        >
          {deltaLabel}
        </p>
      </div>

      <p className="font-sans text-[11px] leading-snug text-[var(--ink-3)]">
        {description}
      </p>

      {footnote && (
        <p className="flex items-start gap-1 font-sans text-[10px] leading-snug text-[var(--ink-4)]">
          <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>{footnote}</span>
        </p>
      )}

      <button
        type="button"
        onClick={onCommit}
        className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-[var(--r)] border border-[var(--border-md)] px-2.5 py-2 font-sans text-[11px] font-semibold text-[var(--ink-2)] transition-colors hover:border-horizon-300 hover:text-horizon-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        Kies deze
        <ArrowRight className="h-3 w-3" aria-hidden />
      </button>
    </div>
  )
}

/** Lokale EUR-formattering voor de event-naam (niet gemaskeerd — interne label). */
function formatEur(v: number): string {
  return `€${Math.round(v).toLocaleString('nl-NL')}`
}
