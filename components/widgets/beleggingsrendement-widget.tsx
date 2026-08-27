import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { MaskedAmount } from '@/components/app/masked-amount'
import { calculateFreedomTime, formatFreedomTimeString, dailyExpenseRate } from '@/lib/format'
import { DEFAULT_RETURN } from '@/lib/constants'
import { weightedExpectedReturn, INVESTMENT_ASSET_TYPES } from '@/lib/dashboard-wealth-weighting'
import { RETURN_BASIS_LABELS, formatGainPct } from '@/lib/asset-return'
import { TrendingUp } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

/** Dutch labels for investment asset types */
const ASSET_LABELS: Record<string, string> = {
  investment: 'Beleggingen',
  retirement: 'Pensioen',
  crypto: 'Crypto',
}

export const BeleggingsrendementWidget = memo(function BeleggingsrendementWidget({ size, data, href }: Props) {
  const investmentAssets = data.assetsByType.filter(a => (INVESTMENT_ASSET_TYPES as readonly string[]).includes(a.type))
  const totalInvestmentValue = investmentAssets.reduce((s, a) => s + a.value, 0)

  // GEREALISEERD RENDEMENT — uit de canonieke motor via de bundel (kaart H7).
  // Hiervóór rekende deze widget zijn eigen `Σ value − Σ purchaseValue` over
  // investment + retirement + crypto. Twee dingen gingen daar mis: (1) een
  // PENSIOENPOT heeft geen kostprijsbegrip — wat er staat is gestort, niet
  // gekocht — dus met `purchase_value = 0` telde de hele pot als winst
  // (gemeten op een productierij: +100,9% i.p.v. +36,1%); (2) de kostprijs kwam
  // uit het met de hand ingetypte `purchase_value` in plaats van uit de
  // transactie-onderbouwde holdings. `lib/asset-return.ts` lost beide op en is
  // dezelfde motor als de kop-KPI op /overzicht/bezittingen — één getal, één
  // grondslag, twee schermen.
  const portfolio = data.assetReturn

  // Zonder kostprijs is "0%" misleidend — dan tonen we "onbekend" i.p.v. een
  // schijnrendement.
  const hasCostBasis = portfolio.cost > 0
  const sinceInceptionReturn = portfolio.pct ?? 0
  const sinceInceptionAbsolute = portfolio.gain

  // Verwacht rendement: asset-gewogen uit de canonieke bundel (assetsByType[].expectedReturn)
  // via de gedeelde helper — profiel-breed grossReturn alleen als fallback. Zelfde
  // grondslag als fire-prognose-widget.tsx, dus geen drift tussen de widgets.
  const portfolioReturn = weightedExpectedReturn(data.assetsByType, INVESTMENT_ASSET_TYPES)
  // Fallback via de canonieke constante (lib/constants.ts) — geen magic number;
  // data.grossReturn komt normaliter per gebruiker uit resolveFireParams.
  const expectedReturnPct = (portfolioReturn > 0 ? portfolioReturn : (data.grossReturn || DEFAULT_RETURN)) * 100

  // Vrijheidstijd-framing van de absolute winst/verlies ("Geld is opgeslagen tijd").
  const dailyExp = data.dailyExpenseRate ?? dailyExpenseRate(data.monthlyExpenses)
  const gainFt = hasCostBasis && dailyExp > 0 && sinceInceptionAbsolute !== 0
    ? calculateFreedomTime(sinceInceptionAbsolute, dailyExp)
    : null
  const gainFtStr = gainFt ? formatFreedomTimeString(gainFt, 'short') : null
  const gainFtVerb = sinceInceptionAbsolute >= 0 ? 'gewonnen' : 'verloren'

  // Color based on positive/negative return (semantiek blijft semantisch)
  const returnColor = !hasCostBasis
    ? 'text-[var(--ink-3)]'
    : sinceInceptionReturn >= 0
      ? 'text-positive'
      : 'text-negative'
  // Eén formatter voor élk rendementspercentage (lib/asset-return.ts): zelfde
  // afronding en nl-NL-komma als de KPI en de rekenmodal.
  const returnLabel = hasCostBasis ? (formatGainPct(portfolio.pct) ?? 'onbekend') : 'onbekend'
  // Grondslag in het label — gedeelde bron, geen eigen tekst per oppervlak.
  const basisLabel = RETURN_BASIS_LABELS.portfolioSincePurchase
  const expectedLabel = RETURN_BASIS_LABELS.expectedAnnual

  // Empty state: no investment assets at all
  if (investmentAssets.length === 0) {
    return (
      <WidgetShell module="kern" size={size} kicker="Rendement" href={href}>
        <WidgetEmpty icon={TrendingUp} message="Voeg beleggingen toe om je rendement te volgen." />
      </WidgetShell>
    )
  }

  // ── Mini: since-inception return % ────────────────────────────
  // Kicker draagt de grondslag: op mini past geen sublabel, en een kaal
  // "Rendement" is precies de dubbelzinnigheid die kaart H7 wegneemt.
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker={basisLabel.compact} href={href}>
        <p className={`font-mono ${hasCostBasis ? 'text-[15px]' : 'text-[11px]'} font-semibold tabular-nums leading-none truncate ${returnColor}`}>
          {returnLabel}
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter: return % + absolute gain/loss ────────────────────
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Beleggingsrendement" href={href}>
        <p className={`font-mono text-lg font-semibold tabular-nums ${returnColor}`}>
          {returnLabel}
        </p>
        <p className="mt-0.5 text-xs text-[var(--ink-3)]">
          {hasCostBasis ? basisLabel.label : 'aankoopwaarde onbekend'}
        </p>
        {hasCostBasis && (
          <p className={`mt-1 ${returnColor}`}>
            <MaskedAmount value={sinceInceptionAbsolute} tone="kern" className="text-xs" />
          </p>
        )}
        {gainFtStr && (
          <p className="mt-0.5 font-serif italic text-[11px] text-[var(--ink-3)]">
            ≈ {gainFtStr} vrijheid {gainFtVerb}
          </p>
        )}
      </WidgetShell>
    )
  }

  // Per-type uitsplitsing — de rollup uit de MOTOR (summarizePortfolioReturn),
  // niet opnieuw uit `assetsByType.purchaseValue` gerekend. Gevolg: een
  // pensioenpot komt hier per definitie niet meer voor (dat type draagt geen
  // kostprijsbegrip), en een rij die op de holdings-kostprijs rust telt met die
  // kostprijs mee in plaats van met het handmatig ingevulde bedrag.
  const typeRows = portfolio.byType

  // Per-type breakdown row renderer (shared by half/full)
  const renderTypeRow = (row: (typeof typeRows)[number]) => {
    const rowHasCost = row.cost > 0
    const pct = row.pct
    const rowColor = !rowHasCost
      ? 'text-[var(--ink-4)]'
      : row.gain >= 0
        ? 'text-positive'
        : 'text-negative'
    const label = ASSET_LABELS[row.type] || row.type
    return (
      <div key={row.type} className="flex items-center justify-between text-xs">
        <span className="text-[var(--ink-3)] w-24 truncate">{label}</span>
        <span className="text-[var(--ink)]">
          <MaskedAmount value={row.value} tone="kern" />
        </span>
        {rowHasCost ? (
          <>
            <span className={rowColor}>
              <MaskedAmount value={row.gain} tone="kern" />
            </span>
            <span className={`font-mono tabular-nums w-16 shrink-0 text-right ${rowColor}`}>
              {formatGainPct(pct)}
            </span>
          </>
        ) : (
          <span className={`font-mono tabular-nums w-16 shrink-0 text-right ${rowColor}`}>onbekend</span>
        )}
      </div>
    )
  }

  // ── Full: extended overview with per-asset-type breakdown ─────
  if (size === 'full') {
    const shown = typeRows.slice(0, 3)
    const extra = typeRows.length - shown.length

    return (
      <WidgetShell module="kern" size={size} kicker="Beleggingsrendement" href={href}>
        {/* Header: return % + absolute gain */}
        <p className={`font-mono text-2xl font-semibold tabular-nums ${returnColor}`}>
          {returnLabel}
        </p>
        <p className="mt-0.5 text-xs text-[var(--ink-3)]">
          {hasCostBasis ? (
            <>{basisLabel.label} &middot; <MaskedAmount value={sinceInceptionAbsolute} tone="kern" /></>
          ) : (
            'aankoopwaarde onbekend'
          )}
        </p>
        {gainFtStr && (
          <p className="mt-0.5 font-serif italic text-[11px] text-[var(--ink-3)]">
            ≈ {gainFtStr} vrijheid {gainFtVerb}
          </p>
        )}

        {/* Per-asset-type breakdown table */}
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide text-[var(--ink-4)] mb-1.5">
            {basisLabel.label} &middot; per type
          </p>
          <div className="space-y-1">
            {shown.map(renderTypeRow)}
            {extra > 0 && (
              <p className="text-[11px] text-[var(--ink-4)] pt-0.5">+{extra} meer</p>
            )}
          </div>
        </div>

        {/* Footer: expected return comparison */}
        <p className="mt-3 pt-2 border-t border-[var(--border-ed)] font-serif italic text-[11px] text-[var(--ink-3)]">
          {expectedLabel.label}: {expectedReturnPct.toFixed(1)}%
        </p>
      </WidgetShell>
    )
  }

  // ── Half: left metric + freedom, right per-type breakdown ─────
  const top2 = [...investmentAssets].sort((a, b) => b.value - a.value).slice(0, 2)

  return (
    <WidgetShell module="kern" size={size} kicker="Beleggingsrendement" href={href}>
      <div className="flex gap-3 h-full">
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <p className={`font-mono text-xl font-semibold tabular-nums ${returnColor}`}>
            {returnLabel}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
            {hasCostBasis ? basisLabel.label : 'aankoopwaarde onbekend'}
          </p>
          {hasCostBasis && (
            <p className={`mt-0.5 ${returnColor}`}>
              <MaskedAmount value={sinceInceptionAbsolute} tone="kern" className="text-[11px]" />
            </p>
          )}
          {gainFtStr && (
            <p className="mt-1 font-serif italic text-[11px] text-[var(--ink-3)]">
              ≈ {gainFtStr} vrijheid {gainFtVerb}
            </p>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
          {top2.map(asset => {
            const share = totalInvestmentValue > 0 ? (asset.value / totalInvestmentValue) * 100 : 0
            const label = ASSET_LABELS[asset.type] || asset.type
            return (
              <div key={asset.type} className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--ink-2)] truncate min-w-0">{label}</span>
                <span className="font-mono tabular-nums text-[var(--ink-3)] shrink-0 ml-1">{Math.round(share)}%</span>
              </div>
            )
          })}
          <p className="font-serif italic text-[11px] text-[var(--ink-3)]">
            {expectedLabel.label}: {expectedReturnPct.toFixed(1)}%
          </p>
        </div>
      </div>
    </WidgetShell>
  )
})
