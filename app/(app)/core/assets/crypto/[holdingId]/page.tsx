import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/format'
import { HoldingSourceBadge } from '@/components/holdings/holding-source-badge'
import { HoldingFavoriteButton } from '@/components/holdings/holding-favorite-button'
import {
  loadCryptoHoldingPriceHistory,
  type CryptoHoldingSource,
} from '@/lib/crypto-holdings-data'
import { CryptoHoldingPriceChart } from '@/components/core/deepenings/crypto-holdings/crypto-holding-price-chart'
import type { ExchangeId, WalletChain } from '@/lib/connections-data'

// UUID v4 regex — malformed URL-segments krijgen direct 404 i.p.v. een
// volledige Supabase-roundtrip die tóch op `notFound` zou eindigen.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const EXCHANGE_DISPLAY: Record<ExchangeId, string> = {
  bitvavo: 'Bitvavo',
  kraken: 'Kraken',
  coinbase: 'Coinbase',
}

function maskAddress(address: string): string {
  if (address.length <= 10) return address
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}

function formatUnitsLong(units: number): string {
  if (!isFinite(units)) return '0'
  const decimals = Math.abs(units) >= 1 ? 6 : 8
  return units.toFixed(decimals).replace(/\.?0+$/, '')
}

// Krant-stijl korte datum: HH:mm vandaag, "d MMM" dit jaar, anders "d MMM yyyy".
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

export default async function CryptoHoldingDetailPage({
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
    .from('crypto_holdings')
    .select(
      `
      id,
      asset_id,
      symbol,
      name,
      chain,
      units,
      units_in_order,
      avg_purchase_price,
      current_price,
      last_price_update,
      is_fiat_balance,
      is_favorite,
      notes,
      source_exchange_connection_id,
      source_wallet_address_id,
      asset:assets!asset_id(id, name, asset_type),
      exchange:exchange_connections!source_exchange_connection_id(
        id, exchange, label, last_synced_at, last_sync_error
      ),
      wallet:wallet_addresses!source_wallet_address_id(
        id, chain, address, last_synced_at, last_sync_error
      )
      `,
    )
    .eq('id', holdingId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !holding) notFound()

  // Laad bijbehorende transacties + prijs-historie parallel. Beide kunnen
  // leeg zijn (nieuwe positie of nieuwe import); we vangen errors per call
  // op zodat een enkele falende load de detail-pagina niet 500't.
  const PRICE_HISTORY_DAYS = 90
  const [txDataResult, priceHistoryResult] = await Promise.allSettled([
    supabase
      .from('crypto_transactions')
      .select(
        'id, type, units, price_per_unit, total_amount, fee_native, fee_currency, date, notes, external_source',
      )
      .eq('holding_id', holdingId)
      .order('date', { ascending: false })
      .limit(200),
    loadCryptoHoldingPriceHistory(supabase, holdingId, PRICE_HISTORY_DAYS),
  ])
  const txData =
    txDataResult.status === 'fulfilled' ? txDataResult.value.data : null
  const priceHistory =
    priceHistoryResult.status === 'fulfilled' ? priceHistoryResult.value : []

  const txs = (txData ?? []) as Array<{
    id: string
    type: string
    units: number | string
    price_per_unit: number | string | null
    total_amount: number | string | null
    fee_native: number | string | null
    fee_currency: string | null
    date: string
    notes: string | null
    external_source: string | null
  }>

  // ── Derived display fields ─────────────────────────────────
  type AssetRef = { id: string; name: string; asset_type: string }
  type ExchangeRef = {
    id: string
    exchange: ExchangeId
    label: string | null
    last_synced_at: string | null
    last_sync_error: string | null
  }
  type WalletRef = {
    id: string
    chain: WalletChain
    address: string
    last_synced_at: string | null
    last_sync_error: string | null
  }

  function pickOne<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null
    return Array.isArray(value) ? (value[0] ?? null) : value
  }

  const asset = pickOne(holding.asset as AssetRef | AssetRef[] | null)
  const exchange = pickOne(
    holding.exchange as ExchangeRef | ExchangeRef[] | null,
  )
  const wallet = pickOne(holding.wallet as WalletRef | WalletRef[] | null)

  const units = Number(holding.units) || 0
  const currentPrice =
    holding.current_price != null ? Number(holding.current_price) : null
  const avgPrice =
    holding.avg_purchase_price != null
      ? Number(holding.avg_purchase_price)
      : null
  const valueEur = currentPrice != null ? units * currentPrice : 0
  const costBasis = avgPrice != null ? units * avgPrice : null
  const returnEur = costBasis != null ? valueEur - costBasis : null
  const returnPct =
    costBasis != null && costBasis !== 0
      ? ((valueEur - costBasis) / costBasis) * 100
      : null

  let source: CryptoHoldingSource
  let lastSyncedAt: string | null = null
  let lastSyncError: string | null = null
  if (exchange) {
    const labelSuffix = exchange.label ? ` · ${exchange.label}` : ''
    source = {
      kind: 'exchange',
      exchangeId: exchange.exchange,
      exchangeLabel: `${EXCHANGE_DISPLAY[exchange.exchange]}${labelSuffix}`,
      connectionId: exchange.id,
    }
    lastSyncedAt = exchange.last_synced_at
    lastSyncError = exchange.last_sync_error
  } else if (wallet) {
    source = {
      kind: 'wallet',
      walletChain: wallet.chain,
      walletAddressMask: maskAddress(wallet.address),
      walletAddressId: wallet.id,
    }
    lastSyncedAt = wallet.last_synced_at
    lastSyncError = wallet.last_sync_error
  } else {
    source = { kind: 'manual' }
  }

  const symbolDisplay = (holding.symbol as string).toUpperCase()
  const displayName = (holding.name as string | null)?.trim() || symbolDisplay
  const isFiat = holding.is_fiat_balance === true
  const lastPriceFormatted = formatNewspaperDate(holding.last_price_update as string | null)
  const lastSyncFormatted = formatNewspaperDate(lastSyncedAt)

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
      <NavStackMeta title={displayName} />

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="mt-4 border-b border-[var(--border-ed)] pb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="font-mono text-3xl font-bold tabular-nums tracking-tight text-[var(--ink)] sm:text-4xl">
                {symbolDisplay}
              </h1>
              <p className="font-serif text-lg italic text-[var(--ink-2)]">
                {isFiat ? `Cash bij ${exchange ? EXCHANGE_DISPLAY[exchange.exchange] : 'exchange'}` : displayName}
              </p>
            </div>
          </div>
          <HoldingFavoriteButton
            holdingId={holdingId}
            initialFavorite={(holding.is_favorite as boolean | null) ?? false}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <HoldingSourceBadge
            source={source}
            lastSyncedAt={lastSyncedAt}
            lastSyncError={lastSyncError}
          />
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
        <KpiBlock label="Huidige waarde" value={formatCurrency(valueEur)} />
        <KpiBlock label="Eenheden" value={formatUnitsLong(units)} mono />
        <KpiBlock
          label="Huidige prijs"
          value={currentPrice != null ? formatCurrency(currentPrice) : '—'}
        />
        {costBasis != null && returnPct != null && returnEur != null ? (
          <KpiBlock
            label="Rendement"
            value={`${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(1)}%`}
            sub={`${returnEur >= 0 ? '+' : ''}${formatCurrency(returnEur)}`}
            tone={returnPct >= 0 ? 'positive' : 'negative'}
          />
        ) : (
          <KpiBlock label="Rendement" value="—" sub="kostenbasis onbekend" />
        )}
      </section>

      {/* Meta-strip met datums in krant-stijl */}
      {(lastPriceFormatted || lastSyncFormatted) && (
        <p className="mt-4 text-[11px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
          {lastPriceFormatted && <span>Prijs bijgewerkt {lastPriceFormatted}</span>}
          {lastPriceFormatted && lastSyncFormatted && <span> · </span>}
          {lastSyncFormatted && <span>Bron-sync {lastSyncFormatted}</span>}
        </p>
      )}

      {/* ── Koers-evolutie + DCA-lijn ─────────────────────────────
          Cash-saldi (EUR/USD) hebben geen koers en dus geen chart — daar
          slaan we het hele blok over. Voor coins tonen we altijd de sectie:
          ofwel met de chart + DCA-overlay, ofwel met een placeholder als de
          prijs-historie nog niet binnen is. */}
      {!isFiat && (
        <section className="mt-10">
          <CryptoHoldingPriceChart
            points={priceHistory}
            avgPurchasePrice={avgPrice}
            symbol={symbolDisplay}
            daysBack={PRICE_HISTORY_DAYS}
          />
        </section>
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
              {source.kind === 'exchange'
                ? 'Trades-import via deze exchange volgt — zichtbaar zodra de eerste sync binnen is.'
                : 'Voeg later trades toe of importeer via een bron-koppeling.'}
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
                const px = tx.price_per_unit != null ? Number(tx.price_per_unit) : null
                const total = tx.total_amount != null ? Number(tx.total_amount) : null
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
                      {px != null ? formatCurrency(px) : '—'}
                    </td>
                    <td className="py-2 text-right font-mono text-[12px] tabular-nums text-[var(--ink)]">
                      {total != null ? formatCurrency(total) : '—'}
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

// ── KPI block (krant-stijl) ──────────────────────────────────

interface KpiBlockProps {
  label: string
  value: string
  sub?: string
  mono?: boolean
  tone?: 'positive' | 'negative'
}

function KpiBlock({ label, value, sub, mono = false, tone }: KpiBlockProps) {
  const toneClass =
    tone === 'positive'
      ? 'text-positive'
      : tone === 'negative'
        ? 'text-negative'
        : 'text-[var(--ink)]'
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">{label}</p>
      <p
        className={`mt-1 text-lg font-bold tabular-nums ${toneClass} ${mono ? 'font-mono' : 'font-mono'}`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[var(--ink-4)]">{sub}</p>}
    </div>
  )
}
