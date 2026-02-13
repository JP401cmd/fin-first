'use client'

import { Info, PiggyBank, TrendingUp, Ban } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { AssetClassification, DebtClassification } from '@/lib/box3-data'
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS } from '@/lib/asset-data'
import { DEBT_TYPE_LABELS } from '@/lib/debt-data'

function Tooltip({ text }: { text: string }) {
  return (
    <div className="group relative inline-block">
      <Info className="h-3.5 w-3.5 cursor-help text-zinc-300 transition-colors group-hover:text-amber-500" />
      <div className="pointer-events-none absolute right-0 z-10 mt-1 w-52 rounded-lg border border-zinc-200 bg-white p-2.5 text-xs leading-relaxed text-zinc-600 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        {text}
      </div>
    </div>
  )
}

const CATEGORY_CONFIG = {
  spaargeld: {
    label: 'Spaargeld',
    icon: PiggyBank,
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-700',
  },
  beleggingen: {
    label: 'Beleggingen',
    icon: TrendingUp,
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  uitgesloten: {
    label: 'Niet in Box 3',
    icon: Ban,
    bg: 'bg-zinc-50',
    text: 'text-zinc-500',
    border: 'border-zinc-200',
    badge: 'bg-zinc-100 text-zinc-600',
  },
} as const

export function Box3Classification({
  assetClassifications,
  debtClassifications,
}: {
  assetClassifications: AssetClassification[]
  debtClassifications: DebtClassification[]
}) {
  const spaargeld = assetClassifications.filter(ac => ac.category === 'spaargeld')
  const beleggingen = assetClassifications.filter(ac => ac.category === 'beleggingen')
  const uitgesloten = assetClassifications.filter(ac => ac.category === null)

  const box3Schulden = debtClassifications.filter(dc => dc.inBox3)
  const uitgeslSchulden = debtClassifications.filter(dc => !dc.inBox3)

  const groups = [
    { key: 'spaargeld' as const, items: spaargeld, total: spaargeld.reduce((s, ac) => s + Number(ac.asset.current_value), 0) },
    { key: 'beleggingen' as const, items: beleggingen, total: beleggingen.reduce((s, ac) => s + Number(ac.asset.current_value), 0) },
    { key: 'uitgesloten' as const, items: uitgesloten, total: uitgesloten.reduce((s, ac) => s + Number(ac.asset.current_value), 0) },
  ]

  return (
    <div className="space-y-4">
      {/* Asset groups */}
      {groups.map(group => {
        const config = CATEGORY_CONFIG[group.key]
        const Icon = config.icon
        return (
          <div key={group.key} className={`rounded-xl border ${config.border} ${config.bg} p-4`}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${config.text}`} />
                <span className={`text-sm font-semibold ${config.text}`}>{config.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${config.badge}`}>
                  {group.items.length} assets
                </span>
              </div>
              <span className="text-sm font-bold text-zinc-900">{formatCurrency(group.total)}</span>
            </div>
            {group.items.length === 0 ? (
              <p className="text-xs text-zinc-400">Geen assets in deze categorie</p>
            ) : (
              <div className="space-y-1.5">
                {group.items.map(ac => (
                  <div key={ac.asset.id} className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: ASSET_TYPE_COLORS[ac.asset.asset_type] }}
                      />
                      <span className="text-sm text-zinc-700">{ac.asset.name}</span>
                      <span className="text-[10px] text-zinc-400">
                        {ASSET_TYPE_LABELS[ac.asset.asset_type]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-900">
                        {formatCurrency(Number(ac.asset.current_value))}
                      </span>
                      {ac.exclusionReason && (
                        <Tooltip text={ac.exclusionReason} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Debts */}
      {(box3Schulden.length > 0 || uitgeslSchulden.length > 0) && (
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Schulden
          </h4>
          <div className="space-y-3">
            {box3Schulden.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-red-700">In Box 3</span>
                  <span className="text-sm font-bold text-zinc-900">
                    {formatCurrency(box3Schulden.reduce((s, dc) => s + Number(dc.debt.current_balance), 0))}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {box3Schulden.map(dc => (
                    <div key={dc.debt.id} className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-zinc-700">{dc.debt.name}</span>
                        <span className="text-[10px] text-zinc-400">
                          {DEBT_TYPE_LABELS[dc.debt.debt_type]}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-red-600">
                        {formatCurrency(Number(dc.debt.current_balance))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {uitgeslSchulden.length > 0 && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-500">Niet in Box 3</span>
                  <span className="text-sm font-bold text-zinc-900">
                    {formatCurrency(uitgeslSchulden.reduce((s, dc) => s + Number(dc.debt.current_balance), 0))}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {uitgeslSchulden.map(dc => (
                    <div key={dc.debt.id} className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-zinc-700">{dc.debt.name}</span>
                        <span className="text-[10px] text-zinc-400">
                          {DEBT_TYPE_LABELS[dc.debt.debt_type]}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-600">
                          {formatCurrency(Number(dc.debt.current_balance))}
                        </span>
                        {dc.exclusionReason && (
                          <Tooltip text={dc.exclusionReason} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
