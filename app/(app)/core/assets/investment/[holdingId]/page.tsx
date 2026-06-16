import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/format'
import { HoldingSourceBadge, type HoldingSourceForBadge } from '@/components/holdings/holding-source-badge'
import { computePositionFromTransactions, valuePosition } from '@/lib/holdings-aggregation'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function formatUnitsLong(units: number): string {
  if (!isFinite(units)) return '0'
  const decimals = Math.abs(units) >= 1 ? 4 : 6
  return units.toFixed(decimals).replace(/\.?0+$/, '')
}

function formatNewspaperDate(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) {
    return new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' }).format(date)
  }
  const sameYear = date.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date)
}

function formatCurrencyOf(value: number, currency: string): string {
  const safe = Number.isFinite(value) ? value : 0
  try {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe)
  } catch {
    return `${safe.toFixed(2)} ${currency}`
  }
}

export default async function InvestmentHoldingDetailPage({
  params,
}: {
  params: Promise<{ holdingId: string }>
}) {
  const { holdingId } = await params
  if (!UUID_REGEX.test(holdingId)) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: holding, error } = await supabase
    .from('investment_holdings')
    .select(
      `
      id,
      asset_id,
      ticker,
      name,
      isin,
      exchange,
      currency,
      units,
      avg_purchase_price,
      current_price,
      last_price_update,
      previous_close,
      daily_change_percent,
      asset_class,
      sector,
      ter,
      ter_source,
      is_favorite,
      external_source,
      notes,
      asset:assets!asset_id(id, name, asset_type)
      `,
    )
    .eq('id', holdingId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !holding) notFound()

  const { data: txData } = await supabase
    .from('investment_transactions')
    .select('id, type, units, price_per_unit, total_amount, currency, date, notes, external_source')
    .eq('holding_id', holdingId)
    .order('date', { ascending: false })
    .limit(1000)

  const txs = (txData ?? []) as Array<{
    id: string
    type: string
    units: number | string
    price_per_unit: number | string
    total_amount: number | string
    currency: string
    date: string
    notes: string | null
    external_source: string | null
  }>

  type AssetRef = { id: string; name: string; asset_type: string }
  function pickOne<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null
    return Array.isArray(value) ? (value[0] ?? null) : value
  }
  const asset = pickOne(holding.asset as AssetRef | AssetRef[] | null)

  const currency = ((holding.currency as string | null) ?? 'EUR').toUpperCase()
  const currentPrice = holding.current_price != null ? Number(holding.current_price) : null
  const dayChange = holding.daily_change_percent != null ? Number(holding.daily_change_percent) : null
  const ter = holding.ter != null ? Number(holding.ter) : null

  // ── Positie afgeleid uit de transactiehistorie (single source of truth) ──
  // Heeft de holding transacties, dan zijn eenheden, kostprijs en winst/verlies
  // het netto resultaat van koop/verkoop (consume, don't recompute via
  // lib/holdings-aggregation). Een handmatige holding zonder transacties valt
  // terug op de opgeslagen velden.
  const hasTx = txs.length > 0
  const agg = computePositionFromTransactions(
    txs.map((t) => ({
      type: t.type,
      units: t.units,
      price_per_unit: t.price_per_unit,
      total_amount: t.total_amount,
      date: t.date,
    })),
  )
  const valued = valuePosition(agg, currentPrice)

  const storedUnits = Number(holding.units) || 0
  const storedAvg = holding.avg_purchase_price != null ? Number(holding.avg_purchase_price) : null
  const fallbackCost = storedAvg != null ? storedUnits * storedAvg : null

  const units = hasTx ? agg.netUnits : storedUnits
  const value = hasTx ? valued.currentValue : currentPrice != null ? storedUnits * currentPrice : 0
  const isClosed = hasTx && agg.isClosed

  // Totale winst/verlies = gerealiseerd + ongerealiseerd. Zonder transacties:
  // simpele markt − kostbasis op de opgeslagen velden.
  const realizedPnL = hasTx ? agg.realizedPnL : null
  const unrealizedPnL = hasTx ? valued.unrealizedPnL : null
  const totalPnL = hasTx
    ? valued.totalPnL
    : currentPrice != null && fallbackCost != null
      ? storedUnits * currentPrice - fallbackCost
      : null
  // % t.o.v. de inleg (Σ aankopen) — werkt ook voor een gesloten positie.
  const pnlBase = hasTx ? agg.totalInvested : fallbackCost
  const totalPnLPct =
    totalPnL != null && pnlBase != null && pnlBase > 0 ? (totalPnL / pnlBase) * 100 : null

  const externalSource = holding.external_source as string | null
  const source: HoldingSourceForBadge = externalSource
    ? { kind: 'csv', broker: externalSource }
    : { kind: 'manual' }

  const ticker = holding.ticker as string
  const displayName = (holding.name as string | null)?.trim() || ticker
  const isin = holding.isin as string | null
  const lastPriceFormatted = formatNewspaperDate(holding.last_price_update as string | null)

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
      <NavStackMeta title={displayName} />

      <header className="mt-4 border-b border-[var(--border-ed)] pb-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-mono text-3xl font-bold tabular-nums tracking-tight text-[var(--ink)] sm:text-4xl">
            {ticker}
          </h1>
          <p className="font-serif text-lg italic text-[var(--ink-2)]">{displayName}</p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {isin && (
            <span className="font-mono text-[11px] tabular-nums text-[var(--ink-3)]">{isin}</span>
          )}
          {currency !== 'EUR' && (
            <span className="inline-flex h-6 items-center border border-[var(--border-ed)] bg-[var(--paper)] px-2 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
              {currency}
            </span>
          )}
          <HoldingSourceBadge source={source} />
          {asset && (
            <Link
              href={`/core/assets/${asset.asset_type}`}
              className="inline-flex h-6 items-center gap-1 border border-[var(--border-ed)] bg-[var(--paper)] px-2 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
            >
              <span className="truncate">{asset.name}</span>
              <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      </header>

      {/* ── KPI strip ───────────────────────────────────────────── */}
      <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiBlock
          label="Huidige waarde"
          value={currency === 'EUR' ? formatCurrency(value) : formatCurrencyOf(value, currency)}
        />
        <KpiBlock label="Eenheden" value={formatUnitsLong(units)} />
        <KpiBlock
          label="Huidige prijs"
          value={
            currentPrice != null
              ? currency === 'EUR'
                ? formatCurrency(currentPrice)
                : formatCurrencyOf(currentPrice, currency)
              : '—'
          }
          sub={dayChange != null ? `${dayChange >= 0 ? '+' : ''}${dayChange.toFixed(2)}% vandaag` : undefined}
          tone={dayChange != null ? (dayChange >= 0 ? 'positive' : 'negative') : undefined}
        />
        {totalPnL != null ? (
          <KpiBlock
            label={isClosed ? 'Resultaat (gerealiseerd)' : 'Resultaat'}
            value={`${totalPnL >= 0 ? '+' : ''}${currency === 'EUR' ? formatCurrency(totalPnL) : formatCurrencyOf(totalPnL, currency)}`}
            sub={totalPnLPct != null ? `${totalPnLPct >= 0 ? '+' : ''}${totalPnLPct.toFixed(1)}% op inleg` : undefined}
            tone={totalPnL >= 0 ? 'positive' : 'negative'}
          />
        ) : (
          <KpiBlock label="Resultaat" value="—" sub="geen transacties" />
        )}
      </section>

      {hasTx && realizedPnL != null && (
        <p className="mt-4 text-[11px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
          <span>
            Gerealiseerd {realizedPnL >= 0 ? '+' : ''}
            {currency === 'EUR' ? formatCurrency(realizedPnL) : formatCurrencyOf(realizedPnL, currency)}
          </span>
          {!isClosed && unrealizedPnL != null && (
            <>
              {' · '}
              <span>
                Ongerealiseerd {unrealizedPnL >= 0 ? '+' : ''}
                {currency === 'EUR'
                  ? formatCurrency(unrealizedPnL)
                  : formatCurrencyOf(unrealizedPnL, currency)}
              </span>
            </>
          )}
          {isClosed && (
            <>
              {' · '}
              <span>Positie gesloten</span>
            </>
          )}
        </p>
      )}

      {(lastPriceFormatted || ter != null) && (
        <p className="mt-4 text-[11px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
          {lastPriceFormatted && <span>Prijs bijgewerkt {lastPriceFormatted}</span>}
          {lastPriceFormatted && ter != null && <span> · </span>}
          {ter != null && (
            <span>
              TER {(ter * 100).toFixed(2).replace(/\.?0+$/, '')}%
            </span>
          )}
        </p>
      )}

      {/* ── Transactiegeschiedenis ──────────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Transactiegeschiedenis
        </h2>
        {txs.length === 0 ? (
          <div className="mt-3 border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-8 text-center">
            <p className="font-serif italic text-base leading-relaxed text-[var(--ink-2)]">
              Nog geen transacties geregistreerd voor deze positie.
            </p>
            <p className="mt-2 text-[11px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
              Importeer trades via de CSV-pagina of voeg later handmatig toe.
            </p>
          </div>
        ) : (
          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border-ed)]">
                <th className="py-2 text-left text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
                  Datum
                </th>
                <th className="py-2 text-left text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
                  Type
                </th>
                <th className="py-2 text-right text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
                  Eenheden
                </th>
                <th className="py-2 text-right text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
                  Prijs
                </th>
                <th className="py-2 text-right text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
                  Totaal
                </th>
              </tr>
            </thead>
            <tbody>
              {txs.map((tx) => {
                const txUnits = Number(tx.units) || 0
                const px = Number(tx.price_per_unit) || 0
                const total = Number(tx.total_amount) || 0
                const cur = (tx.currency ?? 'EUR').toUpperCase()
                return (
                  <tr key={tx.id} className="border-b border-[var(--border-ed)] hover:bg-[var(--subtle)]">
                    <td className="py-2 font-mono text-[12px] tabular-nums text-[var(--ink-2)]">
                      {formatNewspaperDate(tx.date) ?? tx.date}
                    </td>
                    <td className="py-2 text-[12px] uppercase tracking-[0.06em] text-[var(--ink-2)]">
                      {tx.type}
                    </td>
                    <td className="py-2 text-right font-mono text-[12px] tabular-nums text-[var(--ink)]">
                      {formatUnitsLong(txUnits)}
                    </td>
                    <td className="py-2 text-right font-mono text-[12px] tabular-nums text-[var(--ink-2)]">
                      {cur === 'EUR' ? formatCurrency(px) : formatCurrencyOf(px, cur)}
                    </td>
                    <td className="py-2 text-right font-mono text-[12px] tabular-nums text-[var(--ink)]">
                      {cur === 'EUR' ? formatCurrency(total) : formatCurrencyOf(total, cur)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

interface KpiBlockProps {
  label: string
  value: string
  sub?: string
  tone?: 'positive' | 'negative'
}

function KpiBlock({ label, value, sub, tone }: KpiBlockProps) {
  const toneClass =
    tone === 'positive'
      ? 'text-positive'
      : tone === 'negative'
        ? 'text-negative'
        : 'text-[var(--ink)]'
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">{label}</p>
      <p className={`mt-1 font-mono text-lg font-bold tabular-nums ${toneClass}`}>{value}</p>
      {sub && <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[var(--ink-4)]">{sub}</p>}
    </div>
  )
}
