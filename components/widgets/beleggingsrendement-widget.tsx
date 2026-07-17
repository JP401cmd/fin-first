import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { MaskedAmount } from '@/components/app/masked-amount'
import { calculateFreedomTime, formatFreedomTimeString, dailyExpenseRate } from '@/lib/format'
import { DEFAULT_RETURN } from '@/lib/constants'
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

/** Investment-type asset categories */
const INVESTMENT_TYPES = ['investment', 'retirement', 'crypto']

export const BeleggingsrendementWidget = memo(function BeleggingsrendementWidget({ size, data, href }: Props) {
  const investmentAssets = data.assetsByType.filter(a => INVESTMENT_TYPES.includes(a.type))
  const totalInvestmentValue = investmentAssets.reduce((s, a) => s + a.value, 0)
  const totalInvestmentCost = investmentAssets.reduce((s, a) => s + a.purchaseValue, 0)

  // Cost basis (aankoopwaarde) is required to express a return. Zonder kostprijs
  // is "0%" misleidend — dan tonen we "onbekend" i.p.v. een schijnrendement.
  const hasCostBasis = totalInvestmentCost > 0

  // Since-inception return (value én purchaseValue zijn inclusion-gewogen in de bundel)
  const sinceInceptionReturn = hasCostBasis
    ? ((totalInvestmentValue - totalInvestmentCost) / totalInvestmentCost) * 100
    : 0
  const sinceInceptionAbsolute = totalInvestmentValue - totalInvestmentCost

  // Verwacht rendement: asset-gewogen uit de canonieke bundel (assetsByType[].expectedReturn),
  // profiel-breed grossReturn alleen als fallback — voorkomt drift met de holdings-widget.
  const weightedExpectedReturn = totalInvestmentValue > 0
    ? investmentAssets.reduce((s, a) => s + a.value * (a.expectedReturn ?? 0), 0) / totalInvestmentValue
    : 0
  // Fallback via de canonieke constante (lib/constants.ts) — geen magic number;
  // data.grossReturn komt normaliter per gebruiker uit resolveFireParams.
  const expectedReturnPct = (weightedExpectedReturn > 0 ? weightedExpectedReturn : (data.grossReturn || DEFAULT_RETURN)) * 100

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
  const signPrefix = sinceInceptionReturn >= 0 ? '+' : ''
  const returnLabel = hasCostBasis ? `${signPrefix}${sinceInceptionReturn.toFixed(1)}%` : 'onbekend'

  // Empty state: no investment assets at all
  if (investmentAssets.length === 0) {
    return (
      <WidgetShell module="kern" size={size} kicker="Rendement" href={href}>
        <WidgetEmpty icon={TrendingUp} message="Voeg beleggingen toe om je rendement te volgen." />
      </WidgetShell>
    )
  }

  // ── Mini: since-inception return % ────────────────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="Rendement" href={href}>
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
          {hasCostBasis ? 'totaalrendement' : 'aankoopwaarde onbekend'}
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

  // Per-type breakdown row renderer (shared by half/full)
  const renderTypeRow = (asset: (typeof investmentAssets)[number]) => {
    const rowHasCost = asset.purchaseValue > 0
    const gain = asset.value - asset.purchaseValue
    const pct = rowHasCost ? (gain / asset.purchaseValue) * 100 : 0
    const rowColor = !rowHasCost
      ? 'text-[var(--ink-4)]'
      : gain >= 0
        ? 'text-positive'
        : 'text-negative'
    const label = ASSET_LABELS[asset.type] || asset.type
    return (
      <div key={asset.type} className="flex items-center justify-between text-xs">
        <span className="text-[var(--ink-3)] w-24 truncate">{label}</span>
        <span className="text-[var(--ink)]">
          <MaskedAmount value={asset.value} tone="kern" />
        </span>
        {rowHasCost ? (
          <>
            <span className={rowColor}>
              <MaskedAmount value={gain} tone="kern" />
            </span>
            <span className={`font-mono tabular-nums w-14 text-right ${rowColor}`}>
              {gain >= 0 ? '+' : ''}{pct.toFixed(1)}%
            </span>
          </>
        ) : (
          <span className={`font-mono tabular-nums w-14 text-right ${rowColor}`}>onbekend</span>
        )}
      </div>
    )
  }

  // ── Full: extended overview with per-asset-type breakdown ─────
  if (size === 'full') {
    const shown = investmentAssets.slice(0, 3)
    const extra = investmentAssets.length - shown.length

    return (
      <WidgetShell module="kern" size={size} kicker="Beleggingsrendement" href={href}>
        {/* Header: return % + absolute gain */}
        <p className={`font-mono text-2xl font-semibold tabular-nums ${returnColor}`}>
          {returnLabel}
        </p>
        <p className="mt-0.5 text-xs text-[var(--ink-3)]">
          {hasCostBasis ? (
            <>totaalrendement &middot; <MaskedAmount value={sinceInceptionAbsolute} tone="kern" /></>
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
            Rendement per type
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
          Verwacht rendement: {expectedReturnPct.toFixed(1)}%/jaar
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
            {hasCostBasis ? 'totaalrendement' : 'aankoopwaarde onbekend'}
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
            Verwacht: {expectedReturnPct.toFixed(1)}%/jr
          </p>
        </div>
      </div>
    </WidgetShell>
  )
})
