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
 * abstracte stappen (terugrekening, snijpunt) en — wanneer de rijkere
 * grootboek-rijen (`unifiedRows`) beschikbaar zijn — extra detail per blok.
 *
 * Consume, don't recompute: alle getallen via deriveChapterData (puur) en
 * lib/format.ts. Geen lokale financiële constanten.
 */

import { memo, type ReactNode } from 'react'
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
import { ASSET_TYPE_LABELS, type AssetType } from '@/lib/asset-data'
import { STRATEGY_LABELS, type FireEndStrategy } from '@/lib/fire-strategy'
import { guardFireTarget, HORIZON_MISSENDE_GEGEVENS_LABEL } from '@/lib/horizon/outcome-guard'
import type { SimResult, SimCashflow } from '@/lib/fire-simulation'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'

export interface GrafiekUitlegWalkthroughProps {
  simResult: SimResult
  cashflows: SimCashflow[]
  currentAge: number | null
  yearlyExpenses: number
  /** Optioneel: rijkere grootboek-rijen voor extra detail (graceful degradation). */
  unifiedRows?: UnifiedProjectionRow[]
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

/** NL-label voor een vermogenstype/pot-key; valt terug op de ruwe key. */
function assetTypeLabel(key: string): string {
  return ASSET_TYPE_LABELS[key as AssetType] ?? key
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

/**
 * Compacte vrijheidstijd-noot onder een bedrag (consume-only via lib/format.ts).
 * `null` bij niet-zinvolle bedragen (≤ €100) zodat de aanroeper de regel weglaat.
 */
function freedomNote(amount: number, dailyRate: number, suffix = ''): string | null {
  if (!(amount > 100) || dailyRate <= 0) return null
  return (
    formatWithFreedom(amount, dailyRate, {
      includeCurrency: false,
      format: 'short',
    }) +
    ' vrijheid' +
    suffix
  )
}

/** Eén regel "label — bedrag (+ vrijheidstijd)" in de detail-blokjes. */
function DetailRow({
  label,
  amount,
  dailyRate,
  sign,
  accent,
  freedomSuffix = '',
}: {
  label: string
  amount: number
  dailyRate: number
  sign?: '+' | '−'
  accent?: 'horizon' | 'kern'
  freedomSuffix?: string
}) {
  const note = freedomNote(amount, dailyRate, freedomSuffix)
  const amountColor =
    accent === 'horizon'
      ? 'text-horizon-700'
      : accent === 'kern'
        ? 'text-kern-700'
        : 'text-[var(--ink)]'
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="font-sans text-[12px] leading-snug text-[var(--ink-2)]">{label}</span>
      <span className="shrink-0 text-right">
        <span className={`block font-mono text-[13px] font-semibold tabular-nums ${amountColor}`}>
          {sign ?? ''}
          {formatCurrency(amount)}
        </span>
        {note && (
          <span className="block font-sans text-[11px] leading-tight text-horizon-700">{note}</span>
        )}
      </span>
    </div>
  )
}

/** Kop boven een detail-blokje (zelfde editorial-stijl als "JOUW GETALLEN"). */
function DetailHeading({ children }: { children: ReactNode }) {
  return <h4 className="label-editorial mb-1 text-[var(--ink-4)]">{children}</h4>
}

export const GrafiekUitlegWalkthrough = memo(function GrafiekUitlegWalkthrough({
  simResult,
  cashflows,
  currentAge,
  yearlyExpenses,
  unifiedRows,
}: GrafiekUitlegWalkthroughProps) {
  const data = deriveChapterData(simResult, cashflows, unifiedRows)
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
      sub: freedomNote(data.opbouw.yearlyInleg, dailyRate, '/jaar') ?? undefined,
    },
    {
      // #7: expliciet "gemiddelde groei" — start-gebaseerde inleg (×12, als de
      // Kassabon) en de gemiddelde groei hebben een andere basis; het label
      // voorkomt dat het als dezelfde basis als de inleg gelezen wordt.
      label: 'Gemiddelde groei per jaar',
      value: formatCurrency(Math.round(data.opbouw.averageGrowth)),
      sub: freedomNote(data.opbouw.averageGrowth, dailyRate, '/jaar') ?? undefined,
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
      : 'Je vermogen groeit elk jaar: wat je zelf inlegt, plus het rendement op wat er al staat, min belasting. Hoe langer dat doorloopt, hoe sterker het zichzelf voedt.'

  const hasAccumulation = data.opbouw.opbouwjaren > 0
  // Compounding-split alleen bij echte opbouw (anders "€0 ingelegd"-onzin).
  const showCompoundingSplit =
    hasAccumulation &&
    data.opbouw.cumulativeContributions > 0 &&
    data.opbouw.cumulativeGrowth > 0
  const topAssetGrowth = hasAccumulation
    ? (data.opbouw.assetTypeGrowth ?? []).filter(g => g.growth > 100).slice(0, 3)
    : []
  const showDebtPaid =
    hasAccumulation &&
    data.opbouw.debtPrincipalPaidDuringAccumulation != null &&
    data.opbouw.debtPrincipalPaidDuringAccumulation > 0

  // ── Hoofdstuk 2 — Terugrekening ───────────────────────────────────────────
  // M6-vangrail: een niet-positief "benodigd vermogen", of een bedrag dat uit de
  // eind-horizon-terugval komt, is geen benodigd vermogen — dan de gedeelde
  // gegevensmelding i.p.v. een bedrag. ÉÉN guard-uitkomst voor zowel het
  // figures-getal als het concept-diagram eronder, en met exact dezelfde invoer
  // als de KPI-tegel op /toekomst en de sim-widget (anders spreekt dezelfde
  // pagina zichzelf tegen).
  const terugGuard = guardFireTarget(data.terugrekening.requiredFirePortfolio, {
    isEndOfHorizonFallback: data.terugrekening.requiredFireIsEndOfHorizonFallback,
  })
  const terugFigures: JouwGetal[] = [
    terugGuard.ok
      ? {
          label: 'Benodigd vermogen',
          value: formatCurrency(data.terugrekening.requiredFirePortfolio),
          sub: freedomNote(data.terugrekening.requiredFirePortfolio, dailyRate) ?? undefined,
        }
      : {
          label: 'Benodigd vermogen',
          value: HORIZON_MISSENDE_GEGEVENS_LABEL,
          sub: undefined,
        },
    ...(data.terugrekening.incomeFloorMonthly != null
      ? [
          {
            label: 'AOW + pensioen later',
            value: `${formatCurrency(data.terugrekening.incomeFloorMonthly)}/mnd`,
            sub: freedomNote(data.terugrekening.incomeFloorMonthly, dailyRate, '/mnd') ?? undefined,
          } satisfies JouwGetal,
        ]
      : []),
  ]
  // Inflatie-noot: alleen tonen als de factor merkbaar boven 1 ligt.
  const inflationFactor = data.terugrekening.inflationFactorAtFire
  const showInflationNote = inflationFactor != null && inflationFactor > 1.01
  const inflationPct = showInflationNote
    ? Math.round((inflationFactor! - 1) * 100)
    : 0

  // ── Hoofdstuk 3 — Snijpunt ────────────────────────────────────────────────
  const snijpuntFigures: JouwGetal[] = data.snijpunt.reachable
    ? [
        {
          // ADR 0129 — onder een vast anker is dit punt het gekozen STOPMOMENT, geen
          // vrijheidsleeftijd (`fireAge` ís het anker).
          label: data.snijpunt.ankerVast ? 'Stopmoment' : 'Vrijheidsleeftijd',
          value:
            data.snijpunt.fireAgeFractional !== null
              ? data.snijpunt.fireAgeFractional.toFixed(1)
              : '—',
          sub:
            data.snijpunt.fireAgeFractional !== null
              ? data.snijpunt.yearsFromNow != null && data.snijpunt.yearsFromNow > 0
                ? `${formatFireAge(data.snijpunt.fireAgeFractional)} · over ${data.snijpunt.yearsFromNow} jaar`
                : formatFireAge(data.snijpunt.fireAgeFractional)
              : undefined,
        },
        {
          label: 'Vermogen op dat moment',
          value: formatCurrency(data.snijpunt.firePortfolioAtFire),
          sub: freedomNote(data.snijpunt.firePortfolioAtFire, dailyRate) ?? undefined,
        },
        // ADR 0129 (bevinding 6): onder ÉLK vast anker (aow/now/age) is het stopmoment
        // exogeen, dus "uitgaven ÷ vermogen op dat moment" is geen opnamerate maar een
        // artefact — die rij alleen onder `solved`. Sleutel: het anker, niet de label.
        ...(!data.snijpunt.ankerVast
          ? [
              {
                label: 'Opnamepercentage',
                value: `${(data.snijpunt.implicitWithdrawalRate * 100).toFixed(2)}%`,
                sub: 'laag genoeg om niet op te maken',
              } satisfies JouwGetal,
            ]
          : []),
      ]
    : []

  // ── Hoofdstuk 4 — Onttrekking ─────────────────────────────────────────────
  const isPerpetual = data.onttrekking.strategy === 'perpetual'
  const isDeplete = data.onttrekking.strategy === 'deplete'

  const onttrekkingFigures: JouwGetal[] = [
    {
      label: 'Strategie',
      value: STRATEGY_LABELS[data.onttrekking.strategy].name,
    },
    {
      label: isPerpetual ? 'Behoudjaren' : 'Onttrekkingsjaren',
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
            sub: freedomNote(data.onttrekking.targetEndPortfolio, dailyRate) ?? undefined,
          } satisfies JouwGetal,
        ]
      : []),
  ]

  // Restvermogen-framing: strategie-bewust, alleen bij FIRE-bereikbaar (anders niet zinvol).
  const showRestvermogen =
    data.snijpunt.reachable && !isPerpetual && !isDeplete && data.onttrekking.endPortfolio > 100
  const restvermogenLabel = 'Wat je nalaat (restvermogen)'
  const showFirstWithdrawal =
    data.snijpunt.reachable &&
    data.onttrekking.firstYearWithdrawal != null &&
    data.onttrekking.firstYearWithdrawal > 100
  const withdrawalOrderLabels =
    data.snijpunt.reachable && data.onttrekking.withdrawalOrder
      ? data.onttrekking.withdrawalOrder.map(assetTypeLabel)
      : []
  const showWithdrawalOrder = withdrawalOrderLabels.length >= 2
  const showBox3 =
    data.onttrekking.totalBox3 != null && data.onttrekking.totalBox3 > 100

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

        {/* Compounding: zelf ingelegd vs. rente-op-rente */}
        {showCompoundingSplit && (
          <div className="mt-4 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)]/40 p-3">
            <DetailHeading>WAT JE VERMOGEN OPBOUWT</DetailHeading>
            <DetailRow
              label="Dit leg je zelf in"
              amount={data.opbouw.cumulativeContributions}
              dailyRate={dailyRate}
              accent="horizon"
            />
            <DetailRow
              label="Dit verdient je vermogen voor je (rente-op-rente)"
              amount={data.opbouw.cumulativeGrowth}
              dailyRate={dailyRate}
              accent="horizon"
            />
            <p className="mt-2 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              Het rendement levert zélf weer rendement op — daardoor groeit je vermogen
              versneld. Eerder beginnen telt dubbel: die eerste euro&apos;s groeien het langst.
            </p>
          </div>
        )}

        {/* Waar je groei vandaan komt (top-types) */}
        {topAssetGrowth.length > 0 && (
          <div className="mt-4 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)]/40 p-3">
            <DetailHeading>WAAR JE GROEI VANDAAN KOMT</DetailHeading>
            {topAssetGrowth.map(g => (
              <DetailRow
                key={g.type}
                label={assetTypeLabel(g.type)}
                amount={g.growth}
                dailyRate={dailyRate}
                sign="+"
                accent="horizon"
              />
            ))}
          </div>
        )}

        {/* Schuld = vrijheid die je terugkoopt */}
        {showDebtPaid && (
          <p className="mt-4 rounded-[var(--r-sm)] border-l-[3px] border-l-horizon-500 bg-horizon-50/40 px-3 py-2 text-[12px] leading-relaxed text-[var(--ink-2)]">
            Onderweg koop je{' '}
            <span className="font-mono font-semibold tabular-nums text-horizon-700">
              {formatCurrency(data.opbouw.debtPrincipalPaidDuringAccumulation!)}
            </span>{' '}
            vrijheid terug door schuld af te lossen
            {freedomNote(data.opbouw.debtPrincipalPaidDuringAccumulation!, dailyRate) && (
              <> — zo&apos;n {freedomNote(data.opbouw.debtPrincipalPaidDuringAccumulation!, dailyRate)}</>
            )}
            . Elke afgeloste euro is rente die je niet meer kwijt bent.
          </p>
        )}
      </UitlegChapter>

      {/* 2. Terugrekening */}
      <UitlegChapter
        number={2}
        title="Terugrekening"
        lead="De app rekent áchteruit vanaf je uitgaven: je vermogen moet zóveel opleveren dat het rendement je uitgaven draagt, zónder dat je het hoeft op te eten. Hoe later in je leven, hoe minder je nog nodig hebt — daarom daalt die benodigde lijn met je leeftijd."
        figures={terugFigures}
      >
        <ConceptTerugrekening
          fireAgeFractional={data.snijpunt.fireAgeFractional}
          // Zelfde guard-uitkomst als het figures-getal hierboven: het diagram
          // mag het ankerbedrag niet alsnog kaal benoemen (M6).
          requiredFirePortfolio={terugGuard.ok ? data.terugrekening.requiredFirePortfolio : null}
          hasIncomeFloor={data.terugrekening.hasIncomeFloor}
        />

        {/* Inkomensbodem verlaagt wat je zelf moet opbouwen */}
        {data.terugrekening.incomeFloorMonthly != null && (
          <p className="mt-3 rounded-[var(--r-sm)] border-l-[3px] border-l-horizon-500 bg-horizon-50/40 px-3 py-2 text-[12px] leading-relaxed text-[var(--ink-2)]">
            AOW en pensioen dragen later{' '}
            <span className="font-mono font-semibold tabular-nums text-horizon-700">
              {formatCurrency(data.terugrekening.incomeFloorMonthly)}/mnd
            </span>{' '}
            bij
            {freedomNote(data.terugrekening.incomeFloorMonthly, dailyRate, '/mnd') && (
              <> ({freedomNote(data.terugrekening.incomeFloorMonthly, dailyRate, '/mnd')})</>
            )}
            . Daardoor hoef je minder zelf op te bouwen.
          </p>
        )}

        {/* Reëel vs nominaal — euro's van later */}
        {showInflationNote && (
          <p className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
            Dit benodigde bedrag is uitgedrukt in euro&apos;s van het moment dat je stopt — zo&apos;n{' '}
            {inflationPct}% hoger dan vandaag door inflatie. De grafiek laat die meegroei al zien,
            zodat je koopkracht gelijk blijft.
          </p>
        )}
      </UitlegChapter>

      {/* 3. Snijpunt = vrijheid */}
      <UitlegChapter
        number={3}
        title="Snijpunt = vrijheid"
        lead="Je opgebouwde vermogen stijgt, het nog benodigde bedrag daalt met je leeftijd. Waar die twee samenkomen heb je precies genoeg — dat kruispunt is je vrijheidsmoment."
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

        {/* Wat er met je pot gebeurt — strategie-bewust detail */}
        {(showFirstWithdrawal || showRestvermogen || showWithdrawalOrder || showBox3) && (
          <div className="mt-4 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)]/40 p-3">
            <DetailHeading>WAT ER MET JE POT GEBEURT</DetailHeading>
            {showFirstWithdrawal && (
              <DetailRow
                label="In je eerste vrije jaar haal je uit je vermogen"
                amount={data.onttrekking.firstYearWithdrawal!}
                dailyRate={dailyRate}
                sign="−"
                accent="kern"
                freedomSuffix="/jaar"
              />
            )}
            {showRestvermogen && (
              <DetailRow
                label={restvermogenLabel}
                amount={data.onttrekking.endPortfolio}
                dailyRate={dailyRate}
                accent="horizon"
              />
            )}
            {showBox3 && (
              <DetailRow
                label="Vermogensbelasting (Box 3) over je hele vrije periode"
                amount={data.onttrekking.totalBox3!}
                dailyRate={dailyRate}
                sign="−"
                accent="kern"
              />
            )}
            {showWithdrawalOrder && (
              <p className="mt-2 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
                Je haalt eerst uit{' '}
                {withdrawalOrderLabels.map((label, i) => (
                  <span key={label}>
                    {i > 0 && (i === withdrawalOrderLabels.length - 1 ? ' en dan ' : ', dan ')}
                    <span className="font-medium text-[var(--ink-2)]">{label}</span>
                  </span>
                ))}
                {' '}— zo blijven je beleggingen het langst doorgroeien.
              </p>
            )}
          </div>
        )}

        {/* Impact-markers (AOW/pensioen + levensgebeurtenissen) */}
        {data.onttrekking.impacts.length > 0 && (
          <div className="mt-3">
            <h4 className="label-editorial mb-2 text-[var(--ink-4)]">WAT JE OPNAME BEÏNVLOEDT</h4>
            <ul className="space-y-1">
              {data.onttrekking.impacts.map(impact => {
                // Vrijheidstijd-noot op het maandbedrag (recurring) of eenmalig bedrag.
                const impactNote = freedomNote(
                  impact.amount,
                  dailyRate,
                  impact.type === 'recurring' ? '/mnd' : '',
                )
                return (
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
                    <span className="shrink-0 text-right">
                      <span
                        className={`block font-mono text-[12px] font-medium tabular-nums ${
                          impact.direction === 'income' ? 'text-horizon-700' : 'text-kern-700'
                        }`}
                      >
                        {impact.direction === 'income' ? '+' : '−'}
                        {formatCurrency(impact.amount)}
                        {impact.type === 'recurring' ? '/mnd' : ''}
                      </span>
                      {impactNote && (
                        <span className="block font-sans text-[10px] leading-tight text-horizon-700">
                          {impactNote}
                        </span>
                      )}
                    </span>
                  </li>
                )
              })}
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
