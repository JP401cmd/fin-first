'use client'

/**
 * `RentalROICard` — kop-kaart voor één verhuurd pand. Toont objectnaam +
 * adres, een kassabon-stijl cashflow-uitsplitsing (huur, rente, onderhoud,
 * VVE), en de twee ROI-getallen (forfaitair én werkelijk Box 3) op eigen
 * geld.
 *
 * Transparantie:
 *  - Onderhoud-regel labelt expliciet of het cijfer een schatting (1%-regel)
 *    of een eigen invoer is. Bij schatting: "Schatting: 1% × marktwaarde ·
 *    pas aan in details." Bij override: "Eigen invoer."
 *  - ROI-cijfers tonen geen één-aantal — de gebruiker ziet beide methoden
 *    naast elkaar zodat de Box 3-keuze niet wordt verstopt.
 *
 * Visueel:
 *  - Krant-discipline: scherpe hoeken, geen kleuren-explosie.
 *  - Cashflow-rij is een "kassabon": label links, bedrag rechts in DM Mono
 *    met tabular-nums. Negatieve bedragen krijgen een minteken (geen rood —
 *    de kostenrij is per definitie negatief, kleur zou redundant zijn).
 *  - ROI-cijfers gebruiken `text-positive`/`text-negative` voor signalering.
 */

import { Home, MapPin } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { Asset } from '@/lib/asset-data'
import type { RentalCalculation } from './calc'

// ── Props ────────────────────────────────────────────────────

interface RentalROICardProps {
  /** Het pand zelf — voor naam, adres en eventueel notities. */
  asset: Asset
  /** Berekende cashflow + ROI. */
  calc: RentalCalculation
}

// ── Component ────────────────────────────────────────────────

export function RentalROICard({ asset, calc }: RentalROICardProps) {
  const addressLine = formatAddress(asset)

  return (
    <article className="border border-[var(--border-ed)] bg-[var(--paper)]">
      {/* ── Header: naam + adres ──────────────────────────────── */}
      <header className="flex items-start gap-3 border-b border-[var(--border-ed)] px-4 py-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center bg-kern-50 text-kern-700"
        >
          <Home className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className="font-serif text-base font-semibold leading-tight text-[var(--ink)]"
            style={{ fontFamily: 'var(--font-playfair, serif)' }}
          >
            {asset.name}
          </h3>
          {addressLine && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-[var(--ink-3)]">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {addressLine}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
            Marktwaarde
          </p>
          <p className="font-mono tabular-nums text-sm font-semibold text-[var(--ink)]">
            {formatCurrency(calc.currentValue)}
          </p>
        </div>
      </header>

      {/* ── Cashflow kassabon ────────────────────────────────── */}
      <section className="px-4 py-3">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Cashflow per maand
        </p>
        <dl className="mt-2 space-y-1.5">
          <CashflowRow
            label="Huurinkomsten"
            value={`+${formatCurrency(calc.monthlyRent)}`}
            tone="positive"
          />
          {calc.mortgageBalance > 0 && (
            <CashflowRow
              label="Hypotheekrente"
              value={`−${formatCurrency(calc.monthlyInterest)}`}
              tone="muted"
            />
          )}
          <CashflowRow
            label="Onderhoud"
            value={`−${formatCurrency(calc.monthlyMaintenance)}`}
            tone="muted"
            note={
              calc.maintenanceIsEstimate
                ? 'Schatting: 1% × marktwaarde · pas aan in details'
                : 'Eigen invoer'
            }
          />
          {calc.monthlyVva > 0 && (
            <CashflowRow
              label="VVE / verzekering"
              value={`−${formatCurrency(calc.monthlyVva)}`}
              tone="muted"
            />
          )}
          <div className="border-t border-dashed border-[var(--border-ed)] pt-2">
            <CashflowRow
              label="Netto cashflow"
              value={`${calc.monthlyNetCashflow >= 0 ? '+' : '−'}${formatCurrency(Math.abs(calc.monthlyNetCashflow))}`}
              tone={calc.monthlyNetCashflow >= 0 ? 'primary' : 'negative'}
              bold
            />
          </div>
        </dl>
      </section>

      {/* ── ROI-strip — beide methoden zichtbaar ─────────────── */}
      <footer className="grid grid-cols-3 gap-3 border-t border-[var(--border-ed)] bg-[var(--subtle)]/40 px-4 py-3 text-[11px]">
        <ROIStat
          label="Eigen geld"
          value={formatCurrency(calc.ownEquity)}
          tone="default"
        />
        <ROIStat
          label="ROI forfaitair"
          value={formatPercent(calc.roiForfaitair)}
          tone={calc.roiForfaitair >= 0 ? 'positive' : 'negative'}
        />
        <ROIStat
          label="ROI werkelijk"
          value={formatPercent(calc.roiWerkelijk)}
          tone={calc.roiWerkelijk >= 0 ? 'positive' : 'negative'}
        />
      </footer>
    </article>
  )
}

// ── Helpers ──────────────────────────────────────────────────

/** Format als ROI-percentage met 1 decimaal en + teken bij positief. */
function formatPercent(pct: number): string {
  if (!isFinite(pct)) return '—'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

/** Bouw een leesbare adres-regel uit `address_postcode` + `address_house_number`.
 *  Bewust geen `address_postcode || ''` als hele regel wanneer beide ontbreken. */
function formatAddress(asset: Asset): string | null {
  const postcode = asset.address_postcode?.trim()
  const houseNumber = asset.address_house_number?.trim()
  if (!postcode && !houseNumber) return null
  if (postcode && houseNumber) return `${postcode} ${houseNumber}`
  return postcode ?? houseNumber ?? null
}

// ── Sub-components ───────────────────────────────────────────

interface CashflowRowProps {
  label: string
  value: string
  tone: 'positive' | 'negative' | 'muted' | 'primary'
  bold?: boolean
  note?: string
}

function CashflowRow({ label, value, tone, bold = false, note }: CashflowRowProps) {
  const valueClass =
    tone === 'positive'
      ? 'text-positive'
      : tone === 'negative'
        ? 'text-negative'
        : tone === 'primary'
          ? 'text-[var(--ink)]'
          : 'text-[var(--ink-2)]'
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-[12px] text-[var(--ink-2)]">{label}</dt>
        <dd
          className={`font-mono tabular-nums text-[12px] ${valueClass} ${
            bold ? 'font-semibold' : ''
          }`}
        >
          {value}
        </dd>
      </div>
      {note && (
        <p className="mt-0.5 text-[10px] leading-snug text-[var(--ink-4)]">
          {note}
        </p>
      )}
    </div>
  )
}

interface ROIStatProps {
  label: string
  value: string
  tone: 'default' | 'positive' | 'negative'
}

function ROIStat({ label, value, tone }: ROIStatProps) {
  const valueClass =
    tone === 'positive'
      ? 'text-positive'
      : tone === 'negative'
        ? 'text-negative'
        : 'text-[var(--ink)]'
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
        {label}
      </p>
      <p className={`mt-0.5 font-mono tabular-nums text-[13px] font-semibold ${valueClass}`}>
        {value}
      </p>
    </div>
  )
}
