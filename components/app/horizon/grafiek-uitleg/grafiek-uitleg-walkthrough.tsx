'use client'

/**
 * grafiek-uitleg-walkthrough.tsx — "Zo werkt jouw grafiek".
 *
 * Verhalende walkthrough van 4 hoofdstukken die de ÉCHTE rekenroute van de
 * FIRE-grafiek navolgbaar maakt voor een leek, gevoed met de eigen data:
 *   1. Opbouw  2. Terugrekening  3. Snijpunt = vrijheid  4. Onttrekking
 *
 * Per hoofdstuk: leek-zin + eigen kerngetallen + een uitgelicht stukje van de
 * eigen curve (SimChart met `emphasis`), plus een concept-mini-diagram bij de
 * abstracte stappen (terugrekening, snijpunt).
 *
 * Consume, don't recompute: alle getallen via deriveChapterData (puur) en
 * lib/format.ts. Geen lokale financiële constanten.
 */

import { memo } from 'react'
import { SimChart } from '@/components/app/horizon/sim-chart'
import { UitlegChapter, type JouwGetal } from './uitleg-chapter'
import { ConceptTerugrekening } from './concept-terugrekening'
import { ConceptSnijpunt } from './concept-snijpunt'
import { deriveChapterData, leadSentenceForWithdrawal } from './chapter-data'
import {
  formatCurrency,
  formatWithFreedom,
  dailyExpenseRate,
} from '@/lib/format'
import { formatFireAge } from '@/lib/horizon-data'
import { STRATEGY_LABELS, type FireEndStrategy } from '@/lib/fire-strategy'
import type { SimResult, SimCashflow } from '@/lib/fire-simulation'

export interface GrafiekUitlegWalkthroughProps {
  simResult: SimResult
  cashflows: SimCashflow[]
  currentAge: number | null
  yearlyExpenses: number
}

/**
 * Tekstueel alternatief voor de (aria-hidden) SimChart-SVG in de walkthrough.
 * De SVG zelf is bewust `aria-hidden`, dus de wrapper draagt het a11y-label;
 * het label is emphasis-bewust, en voor `withdrawal` strategie-bewust
 * (behoud bij `perpetual`, onttrekking bij de overige strategieën).
 */
function curveSliceAriaLabel(
  emphasis: 'accumulation' | 'withdrawal' | 'fire',
  strategy: FireEndStrategy,
): string {
  switch (emphasis) {
    case 'accumulation':
      return 'Jouw vermogenslijn met de opbouwfase benadrukt.'
    case 'withdrawal':
      return strategy === 'perpetual'
        ? 'Jouw vermogenslijn met de behoudfase benadrukt.'
        : 'Jouw vermogenslijn met de onttrekkingsfase benadrukt.'
    case 'fire':
    default:
      return 'Jouw vermogenslijn met het vrijheidsmoment benadrukt.'
  }
}

/** Compacte real-curve slice met een benadrukt segment. */
function CurveSlice({
  simResult,
  cashflows,
  currentAge,
  dailyRate,
  emphasis,
}: {
  simResult: SimResult
  cashflows: SimCashflow[]
  currentAge: number
  dailyRate: number
  emphasis: 'accumulation' | 'withdrawal' | 'fire'
}) {
  return (
    <div
      role="img"
      aria-label={curveSliceAriaLabel(emphasis, simResult.strategy)}
      className="overflow-hidden rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-2"
    >
      <SimChart
        rows={simResult.rows}
        fireAge={simResult.fireAge}
        fireAgeFractional={simResult.fireAgeFractional}
        currentAge={currentAge}
        endAge={simResult.displayEndAge}
        cashflows={cashflows}
        strategy={simResult.strategy}
        targetEndPortfolio={simResult.targetEndPortfolio}
        dailyExpenseRate={dailyRate}
        forModal
        emphasis={emphasis}
      />
    </div>
  )
}

export const GrafiekUitlegWalkthrough = memo(function GrafiekUitlegWalkthrough({
  simResult,
  cashflows,
  currentAge,
  yearlyExpenses,
}: GrafiekUitlegWalkthroughProps) {
  const data = deriveChapterData(simResult, cashflows)
  const resolvedCurrentAge = currentAge ?? 30
  // Canonieke €→tijd-dagbasis (×12/365) uit lib/format.ts — geen eigen som.
  const dailyRate = dailyExpenseRate(yearlyExpenses / 12)

  // ── Hoofdstuk 1 — Opbouw ──────────────────────────────────────────────────
  const opbouwFigures: JouwGetal[] = [
    {
      label: 'Vermogen nu',
      value: formatCurrency(data.opbouw.startPortfolio),
    },
    {
      label: 'Inleg per jaar',
      value: formatCurrency(data.opbouw.yearlyInleg),
      sub:
        data.opbouw.yearlyInleg > 100
          ? formatWithFreedom(data.opbouw.yearlyInleg, dailyRate, {
              includeCurrency: false,
              format: 'short',
            }) + ' vrijheid/jaar'
          : undefined,
    },
    {
      // #7: expliciet "gemiddelde groei" — start-gebaseerde inleg (×12, als de
      // Kassabon) en de gemiddelde groei hebben een andere basis; het label
      // voorkomt dat het als dezelfde basis als de inleg gelezen wordt.
      label: 'Gemiddelde groei per jaar',
      value: formatCurrency(Math.round(data.opbouw.averageGrowth)),
      sub:
        data.opbouw.averageGrowth > 100
          ? formatWithFreedom(data.opbouw.averageGrowth, dailyRate, {
              includeCurrency: false,
              format: 'short',
            }) + ' vrijheid/jaar'
          : undefined,
    },
    {
      label: 'Opbouwjaren',
      value:
        data.opbouw.opbouwjaren === 0
          ? 'al vrij'
          : `${data.opbouw.opbouwjaren} jaar`,
    },
  ]
  const opbouwLead =
    data.opbouw.opbouwjaren === 0
      ? 'Je hebt al genoeg vermogen — de opbouwfase is voorbij. Je vermogen werkt nu voor jou via rendement.'
      : 'Je vermogen groeit elk jaar: wat je zelf inlegt, plus het rendement op wat er al staat, min belasting.'

  // ── Hoofdstuk 2 — Terugrekening ───────────────────────────────────────────
  const terugFigures: JouwGetal[] = [
    {
      label: 'Benodigd vermogen',
      value: formatCurrency(data.terugrekening.requiredFirePortfolio),
      sub:
        data.terugrekening.requiredFirePortfolio > 100
          ? formatWithFreedom(data.terugrekening.requiredFirePortfolio, dailyRate, {
              includeCurrency: false,
              format: 'short',
            }) + ' vrijheid'
          : undefined,
    },
    {
      // #6: "25×" is jargon voor een leek — uitgeschreven als vuistregel,
      // met de bekende 4%-regel als toelichting.
      label: 'Vuistregel: 25× je uitgaven',
      value: formatCurrency(data.terugrekening.classic25xTarget),
      sub: '(de bekende 4%-regel)',
    },
  ]

  // ── Hoofdstuk 3 — Snijpunt ────────────────────────────────────────────────
  const snijpuntFigures: JouwGetal[] = data.snijpunt.reachable
    ? [
        {
          label: 'Vrijheidsleeftijd',
          value:
            data.snijpunt.fireAgeFractional !== null
              ? data.snijpunt.fireAgeFractional.toFixed(1)
              : '—',
          sub:
            data.snijpunt.fireAgeFractional !== null
              ? formatFireAge(data.snijpunt.fireAgeFractional)
              : undefined,
        },
        {
          label: 'Vermogen op dat moment',
          value: formatCurrency(data.snijpunt.firePortfolioAtFire),
        },
        // #5: bij pensioen is FIRE exogeen (= AOW), dus de impliciete opnamerate
        // is daar niet betekenisvol — die rij alleen voor de overige strategieën.
        ...(simResult.strategy !== 'pensioen'
          ? [
              {
                label: 'Opnamepercentage',
                value: `${(data.snijpunt.implicitWithdrawalRate * 100).toFixed(2)}%`,
              } satisfies JouwGetal,
            ]
          : []),
      ]
    : []

  // ── Hoofdstuk 4 — Onttrekking ─────────────────────────────────────────────
  const onttrekkingFigures: JouwGetal[] = [
    {
      label: 'Strategie',
      value: STRATEGY_LABELS[data.onttrekking.strategy].name,
    },
    {
      label:
        data.onttrekking.strategy === 'perpetual' ? 'Behoudjaren' : 'Onttrekkingsjaren',
      value: `${data.onttrekking.withdrawalYears} jaar`,
    },
    {
      label: 'Loopt tot leeftijd',
      value: `${data.onttrekking.displayEndAge}`,
    },
    ...(data.onttrekking.targetEndPortfolio > 0
      ? [
          {
            label: 'Eindvermogen (doel)',
            value: formatCurrency(data.onttrekking.targetEndPortfolio),
          } satisfies JouwGetal,
        ]
      : []),
  ]

  return (
    <div className="space-y-4">
      {/* Sectie-kop */}
      <div className="border-b border-dashed border-[var(--border-ed)] pb-3">
        {/* #10: <h2> zodat de koppen-hiërarchie (modal-titel → h2 → hoofdstuk-h3's)
            klopt; label-editorial houdt het visueel identiek. */}
        <h2 className="label-editorial text-horizon-600">ZO WERKT JOUW GRAFIEK</h2>
        <p className="mt-1 text-sm leading-relaxed text-[var(--ink-3)]">
          In vier stappen zie je hoe jouw grafiek tot stand komt — met je eigen cijfers.
        </p>
      </div>

      {/* 1. Opbouw */}
      <UitlegChapter number={1} title="Opbouw" lead={opbouwLead} figures={opbouwFigures}>
        <CurveSlice
          simResult={simResult}
          cashflows={cashflows}
          currentAge={resolvedCurrentAge}
          dailyRate={dailyRate}
          emphasis="accumulation"
        />
      </UitlegChapter>

      {/* 2. Terugrekening */}
      <UitlegChapter
        number={2}
        title="Terugrekening"
        lead="De app rekent áchteruit: hoeveel vermogen heb je nodig om de rest van je leven van te leven? Dat bedrag daalt naarmate je later stopt."
        figures={terugFigures}
      >
        <ConceptTerugrekening
          fireAgeFractional={data.snijpunt.fireAgeFractional}
          requiredFirePortfolio={data.terugrekening.requiredFirePortfolio}
          hasIncomeFloor={data.terugrekening.hasIncomeFloor}
        />
      </UitlegChapter>

      {/* 3. Snijpunt = vrijheid */}
      <UitlegChapter
        number={3}
        title="Snijpunt = vrijheid"
        lead="Vrijheid is het moment waarop je opbouw de terugrekening inhaalt: je hebt dan precies genoeg."
        figures={snijpuntFigures}
      >
        {data.snijpunt.reachable ? (
          // #1: alleen het concept-diagram — de abstracte kruising is hier het
          // didactische punt. De echte curve staat al in h1, h4 en de hoofdgrafiek;
          // twee bijna-identieke grafieken met tegengestelde dimming verwart.
          <ConceptSnijpunt
            fireAgeFractional={data.snijpunt.fireAgeFractional}
            firePortfolioAtFire={data.snijpunt.firePortfolioAtFire}
          />
        ) : (
          <div className="flex items-start gap-2.5 rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/60 px-3 py-3">
            <p className="font-sans text-[13px] leading-relaxed text-[var(--ink-2)]">
              {data.snijpunt.unreachableMessage}
            </p>
          </div>
        )}
      </UitlegChapter>

      {/* 4. Onttrekking */}
      <UitlegChapter
        number={4}
        title="Onttrekking"
        lead={leadSentenceForWithdrawal(data.onttrekking.strategy)}
        figures={onttrekkingFigures}
      >
        <CurveSlice
          simResult={simResult}
          cashflows={cashflows}
          currentAge={resolvedCurrentAge}
          dailyRate={dailyRate}
          emphasis="withdrawal"
        />

        {/* Impact-markers (AOW/pensioen + levensgebeurtenissen) */}
        {data.onttrekking.impacts.length > 0 && (
          <div className="mt-3">
            <p className="label-editorial mb-2 text-[var(--ink-4)]">WAT JE OPNAME BEÏNVLOEDT</p>
            <ul className="space-y-1">
              {data.onttrekking.impacts.map(impact => (
                <li
                  key={impact.id}
                  className="flex items-center justify-between gap-2 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)]/40 px-2.5 py-1.5"
                >
                  <span className="font-sans text-[12px] text-[var(--ink-2)]">
                    {impact.label}{' '}
                    <span className="text-[10px] text-[var(--ink-4)]">
                      (
                      {impact.type === 'one_time'
                        ? `eenmalig, leeftijd ${impact.fromAge}`
                        : `leeftijd ${impact.fromAge}${impact.toAge ? `–${impact.toAge}` : '+'}`}
                      )
                    </span>
                  </span>
                  <span
                    className={`font-mono text-[12px] font-medium tabular-nums ${
                      impact.direction === 'income' ? 'text-horizon-700' : 'text-kern-700'
                    }`}
                  >
                    {impact.direction === 'income' ? '+' : '−'}
                    {formatCurrency(impact.amount)}
                    {impact.type === 'recurring' ? '/mnd' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Afsluitende strategie-zin */}
        <p className="mt-3 rounded-[var(--r-sm)] border-l-[3px] border-l-horizon-500 bg-horizon-50/40 px-3 py-2 text-[13px] leading-relaxed text-[var(--ink-2)]">
          {data.onttrekking.closingSentence}
        </p>
      </UitlegChapter>
    </div>
  )
})
