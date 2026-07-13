'use client'

/**
 * Vermogensoverzicht (Kern-rapport) — client page.
 *
 * Editorial-rapport-laagje rond `GET /api/report/vermogen`. Patroon spiegelt
 * `app/(app)/rapportages/balans/page.tsx`: client-component met `useFc()`,
 * dubbele-lijn masthead, `FiguresStrip` mini-hero, sectie-blokken per
 * categorie, app-deepening blokken, vrijheidstijd-finale, `OrnamentColophon`.
 *
 * Geen eigen back-knop: shell levert deze (Fase 3 nav-redesign). Print-knop
 * is een page-eigen content-actie en blijft hier.
 *
 * Spec: docs/superpowers/specs/2026-05-11-kern-rapport-en-instellingen-rapport-design.md
 */

import { useEffect, useState, useCallback, Fragment } from 'react'
import { useSearchParams } from 'next/navigation'
import { Printer } from 'lucide-react'
import { formatMaskedCurrency, formatTimestamp } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { eurToFreedomTime } from '@/components/app/freedom-time-label'
import {
  FiguresStrip,
  ScenarioCallout,
  SectionLabel,
  OrnamentColophon,
  PageInfoButton,
} from '@/components/editorial'
import { PAGE_INFO } from '@/lib/page-info-content'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import type {
  VermogenReportData,
  VermogenAssetCategory,
  VermogenAssetItem,
  VermogenDebtCategory,
  VermogenDebtItem,
  VermogenHoldingsSection,
  VermogenBudgetterenSection,
  VermogenWoonbalansSection,
  VermogenVerhuurSection,
  VermogenHypotheekSection,
} from '@/lib/vermogen-report-data'

/**
 * Masked-aware currency formatter hook. Pattern identical to balans/budget
 * pages — gives every sub-component access to the global privacy toggle.
 */
function useFc() {
  const { masked } = useMaskedAmounts()
  return useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
}

// ── Format helpers ──────────────────────────────────────────────────

/**
 * Render een resterende looptijd in jaar+maand-paartje. Returnt "—" voor
 * `null` (revolving credit zonder einddatum) en "afgelost" voor 0 maanden.
 */
function formatRemainingMonths(months: number | null): string {
  if (months == null) return '—'
  if (months === 0) return 'afgelost'
  if (months < 12) return `${months} mnd`
  const years = Math.floor(months / 12)
  const remMonths = months % 12
  return remMonths === 0 ? `${years} jr` : `${years} jr ${remMonths} mnd`
}

function formatPct(value: number | null, fractionDigits = 1): string {
  if (value == null) return '—'
  return `${value.toFixed(fractionDigits)}%`
}

function formatDateNL(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('nl-NL', { year: 'numeric', month: 'long', day: 'numeric' })
}

// ── Asset detail-regels ────────────────────────────────────────────

/**
 * Bouw een korte detail-regel met de type-specifieke kenmerken van een
 * asset. Spec sectie 2.2 iv: type-specifieke regels in `text-[11px]
 * text-[var(--ink-3)]`.
 *
 * Returnt een array van losse details zodat de UI ze met `·` kan
 * scheiden — overslaan van lege velden is dan ook makkelijk.
 */
/**
 * Gebruikelijk-loon-minimum 2025 voor DGA's met een AB-belang in een
 * holding-BV (Wet IB 1964 art. 12a). Wordt in spec §7 open vraag 2 als
 * "ruling-loon-schatting" gevraagd op deelneming-items met
 * `subtype === 'holding_bv'`. Geen profile-veld nodig — minimum-vuistregel.
 */
const GEBRUIKELIJK_LOON_MIN_2025 = 56_000

function buildAssetDetailParts(item: VermogenAssetItem): string[] {
  const parts: string[] = []
  if (item.wozValue != null && item.wozValue > 0) {
    // Formateer WOZ los want het is altijd in EUR.
    parts.push(`WOZ ${new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(item.wozValue)}`)
  }
  if (item.addressLine) parts.push(item.addressLine)
  if (item.rentalIncomeYearly != null && item.rentalIncomeYearly > 0) {
    parts.push(`Verhuur ${new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(item.rentalIncomeYearly)}/jr`)
  }
  if (item.retirementProvider) {
    const labels: Record<string, string> = {
      bedrijfspensioenfonds: 'Bedrijfspensioenfonds',
      verzekeraar: 'Verzekeraar',
      ppi: 'PPI',
    }
    parts.push(labels[item.retirementProvider] ?? item.retirementProvider)
  }
  if (item.riskProfile) {
    const riskLabels: Record<string, string> = { laag: 'Laag risico', middel: 'Middel risico', hoog: 'Hoog risico' }
    parts.push(riskLabels[item.riskProfile] ?? item.riskProfile)
  }
  if (item.tickerSymbol) parts.push(item.tickerSymbol)
  if (item.institution) parts.push(item.institution)
  if (item.kvkNumber) parts.push(`KvK ${item.kvkNumber}`)
  if (item.ownershipPercentage != null) parts.push(`Belang ${item.ownershipPercentage}%`)
  if (item.annualDividend != null && item.annualDividend > 0) {
    parts.push(`Dividend ${new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(item.annualDividend)}/jr`)
  }
  // Ruling-loon-schatting voor holding-BV's (spec §7 open vraag 2,
  // aanbeveling: doe (a) en (b). Hier (a) — feitelijke registratie op
  // deelneming-item. Minimum gebruikelijk loon 2025 = €56.000 als
  // wettelijk referentiepunt; werkelijk loon kan hoger zijn afhankelijk
  // van vergelijkbaar dienstverband.
  if (item.subtype === 'holding_bv') {
    parts.push(`Gebruikelijk loon ≥ ${new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(GEBRUIKELIJK_LOON_MIN_2025)}/jr (min. 2025)`)
  }
  if (item.depreciationRate != null && item.depreciationRate > 0) {
    parts.push(`Afschrijving ${item.depreciationRate}%/jr`)
  }
  if (item.expiryDate) parts.push(`Vervalt ${formatDateNL(item.expiryDate)}`)
  if (item.beneficiary) parts.push(`Begunstigde: ${item.beneficiary}`)
  if (item.linkedAssetName) parts.push(`Gekoppeld aan ${item.linkedAssetName}`)
  return parts
}

function buildDebtDetailParts(item: VermogenDebtItem): string[] {
  const parts: string[] = []
  if (item.subtypeLabel) parts.push(item.subtypeLabel)
  if (item.fixedRateEndDate) parts.push(`Rente-vast tot ${formatDateNL(item.fixedRateEndDate)}`)
  if (item.isTaxDeductible === true) parts.push('Renteaftrek')
  if (item.draagkrachtmetingDate) parts.push(`Draagkrachtmeting ${formatDateNL(item.draagkrachtmetingDate)}`)
  if (item.taxYear) parts.push(`Belastingjaar ${item.taxYear}`)
  if (item.hasPaymentPlan) parts.push('Betalingsregeling')
  if (item.hasWrittenAgreement) parts.push('Schriftelijke overeenkomst')
  return parts
}

// ── Sub-components ──────────────────────────────────────────────────

/** Eén regel in een asset-categorie-tabel, met inline detail-regel eronder. */
function AssetRow({ item }: { item: VermogenAssetItem }) {
  const fc = useFc()
  const details = buildAssetDetailParts(item)

  return (
    <div className="border-b border-dashed border-[var(--rule-soft)] py-2 last:border-b-0">
      {/* Hoofdregel: naam + subtype + waarde rechts */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-source-serif text-[14px] text-[var(--ink)] leading-snug">
            <span className="font-medium">{item.name}</span>
            {item.subtypeLabel && (
              <span className="ml-2 font-inter text-[11px] text-[var(--ink-3)]">
                {item.subtypeLabel}
              </span>
            )}
            {item.ownership === 'shared' && (
              <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-4)]">
                gedeeld
              </span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-dm-mono text-[14px] tabular-nums font-medium text-[var(--ink)]">
            {fc(item.currentValue)}
          </p>
          {item.inclusionPct < 100 && (
            <p className="font-inter text-[10px] text-[var(--ink-4)]">
              {item.inclusionPct}% · {fc(item.weightedValue)} netto
            </p>
          )}
        </div>
      </div>

      {/* Sub-regel: rendement % + mnd inleg */}
      {(item.expectedReturnPct != null || item.monthlyContribution > 0) && (
        <p className="mt-0.5 font-inter text-[11px] text-[var(--ink-3)]">
          {item.expectedReturnPct != null && (
            <span>Verwacht rendement {item.expectedReturnPct}%</span>
          )}
          {item.expectedReturnPct != null && item.monthlyContribution > 0 && <span> · </span>}
          {item.monthlyContribution > 0 && (
            <span>{fc(item.monthlyContribution)}/mnd inleg</span>
          )}
        </p>
      )}

      {/* Detail-regel met type-specifieke kenmerken */}
      {details.length > 0 && (
        <p
          className="mt-0.5 text-[11px] italic text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          {details.join(' · ')}
        </p>
      )}
    </div>
  )
}

function AssetCategoryBlock({ category }: { category: VermogenAssetCategory }) {
  const fc = useFc()
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between border-b border-[var(--ink)] pb-1">
        <p className="font-inter text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink)]">
          {category.label}
        </p>
        <p className="font-inter text-[10px] text-[var(--ink-3)]">
          {category.items.length} {category.items.length === 1 ? 'regel' : 'regels'}
        </p>
      </div>
      <div>
        {category.items.map((item) => (
          <AssetRow key={item.id} item={item} />
        ))}
      </div>
      <div className="mt-2 flex justify-between border-b-4 border-double border-[var(--ink)] pt-2 pb-1">
        <span className="font-inter text-[11px] font-medium text-[var(--ink-2)]">
          Subtotaal {category.label.toLowerCase()}
        </span>
        <span className="font-dm-mono text-[13px] font-bold tabular-nums text-[var(--ink)]">
          {fc(category.subtotal)}
        </span>
      </div>
    </section>
  )
}

function DebtRow({ item }: { item: VermogenDebtItem }) {
  const fc = useFc()
  const details = buildDebtDetailParts(item)

  return (
    <div className="border-b border-dashed border-[var(--rule-soft)] py-2 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-source-serif text-[14px] text-[var(--ink)] leading-snug">
            <span className="font-medium">{item.name}</span>
            {item.creditor && (
              <span className="ml-2 font-inter text-[11px] text-[var(--ink-3)]">
                {item.creditor}
              </span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-dm-mono text-[14px] tabular-nums font-medium text-[var(--negative)]">
            {fc(item.currentBalance)}
          </p>
          <p className="font-inter text-[10px] text-[var(--ink-4)]">
            {formatPct(item.interestRatePct, 2)} rente
          </p>
        </div>
      </div>

      {/* Sub-regel: looptijd + termijn + repayment + NHG */}
      <p className="mt-0.5 font-inter text-[11px] text-[var(--ink-3)]">
        Looptijd resterend: {formatRemainingMonths(item.remainingMonths)}
        {item.monthlyPayment > 0 && <> · {fc(item.monthlyPayment)}/mnd</>}
        {item.repaymentTypeLabel && <> · {item.repaymentTypeLabel}</>}
        {item.nhg === true && <> · NHG</>}
      </p>

      {details.length > 0 && (
        <p
          className="mt-0.5 text-[11px] italic text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          {details.join(' · ')}
        </p>
      )}
    </div>
  )
}

function DebtCategoryBlock({ category }: { category: VermogenDebtCategory }) {
  const fc = useFc()
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between border-b border-[var(--ink)] pb-1">
        <p className="font-inter text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink)]">
          {category.label}
        </p>
        <p className="font-inter text-[10px] text-[var(--ink-3)]">
          {category.items.length} {category.items.length === 1 ? 'regel' : 'regels'}
        </p>
      </div>
      <div>
        {category.items.map((item) => (
          <DebtRow key={item.id} item={item} />
        ))}
      </div>
      <div className="mt-2 flex justify-between border-b-4 border-double border-[var(--ink)] pt-2 pb-1">
        <span className="font-inter text-[11px] font-medium text-[var(--ink-2)]">
          Subtotaal {category.label.toLowerCase()}
        </span>
        <span className="font-dm-mono text-[13px] font-bold tabular-nums text-[var(--negative)]">
          {fc(category.subtotal)}
        </span>
      </div>
    </section>
  )
}

// ── App-deepening blokken ───────────────────────────────────────────

function BudgetterenAppBlock({ data }: { data: VermogenBudgetterenSection }) {
  const fc = useFc()
  return (
    <div className="mb-8">
      <SectionLabel num="a.">Budgetteren — {data.monthLabel}</SectionLabel>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-3)]">Budgetcategorieën</p>
          <p className="mt-0.5 font-dm-mono text-[18px] font-bold tabular-nums text-[var(--ink)]">{data.totalCategories}</p>
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-3)]">Begroot deze mnd</p>
          <p className="mt-0.5 font-dm-mono text-[18px] font-bold tabular-nums text-[var(--ink)]">{fc(data.totalBudgetedMonthly)}</p>
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-3)]">Besteed deze mnd</p>
          <p className="mt-0.5 font-dm-mono text-[18px] font-bold tabular-nums text-[var(--ink)]">{fc(data.totalSpentThisMonth)}</p>
        </div>
      </div>

      {data.topCategories.length > 0 && (
        <div className="mt-4 border-t border-dashed border-[var(--border-ed)] pt-3">
          <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
            Top-{data.topCategories.length} uitgaven
          </p>
          {data.topCategories.map((c, idx) => (
            <div key={`${c.name}-${idx}`} className="flex items-center justify-between py-1">
              <span className="font-source-serif text-[13px] text-[var(--ink)]">
                <span className="mr-1.5">{c.icon}</span>
                {c.name}
              </span>
              <span className="font-dm-mono text-[12px] tabular-nums text-[var(--ink-2)]">
                {fc(c.spent)}
                {c.limit > 0 && (
                  <span className="ml-1 text-[10px] text-[var(--ink-4)]">/ {fc(c.limit)}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {data.savingsRateLastMonth != null && (
        <p
          className="mt-3 text-[12px] italic text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Spaarquote vorige maand: <strong className="not-italic font-semibold">{data.savingsRateLastMonth}%</strong>
        </p>
      )}
    </div>
  )
}

function HoldingsAppBlock({ data }: { data: VermogenHoldingsSection }) {
  const fc = useFc()
  // Groepeer rijen per parentAssetName voor een duidelijker overzicht.
  const grouped = new Map<string, VermogenHoldingsSection['rows']>()
  for (const row of data.rows) {
    if (!grouped.has(row.parentAssetName)) grouped.set(row.parentAssetName, [])
    grouped.get(row.parentAssetName)!.push(row)
  }

  return (
    <div className="mb-8">
      <SectionLabel num="b.">Holdings</SectionLabel>
      <p
        className="mb-3 italic text-[12px] text-[var(--ink-3)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        Marktwaarde totaal: <span className="not-italic font-semibold text-[var(--ink-2)]">{fc(data.totalMarketValue)}</span> · Kostprijs:{' '}
        <span className="not-italic font-semibold text-[var(--ink-2)]">{fc(data.totalCost)}</span>
      </p>

      {Array.from(grouped.entries()).map(([parentName, rows]) => {
        const subtotal = rows.reduce((s, r) => s + r.marketValue, 0)
        return (
          <Fragment key={parentName}>
            <p className="mt-3 mb-1 font-inter text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              {parentName}
            </p>
            <div>
              {rows.map((r, idx) => (
                <div
                  key={`${r.ticker}-${idx}`}
                  className="flex items-baseline justify-between border-b border-dashed border-[var(--rule-soft)] py-1.5 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-source-serif text-[13px] text-[var(--ink)]">
                      <span className="font-medium">{r.name}</span>
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--ink-3)]">{r.ticker}</span>
                    </p>
                    <p className="mt-0.5 font-inter text-[10px] text-[var(--ink-4)]">
                      {r.units.toLocaleString('nl-NL', { maximumFractionDigits: 6 })} stuks · gem. {fc(Math.round(r.avgPurchasePrice))} · koers {fc(Math.round(r.currentPrice))}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-dm-mono text-[13px] tabular-nums text-[var(--ink)]">{fc(r.marketValue)}</p>
                    {data.totalMarketValue > 0 && (
                      <p className="font-inter text-[10px] text-[var(--ink-4)]">
                        {((r.marketValue / data.totalMarketValue) * 100).toFixed(1)}%
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-1 flex justify-between text-[11px] text-[var(--ink-3)]">
              <span className="italic">Subtotaal {parentName}</span>
              <span className="font-dm-mono tabular-nums">{fc(subtotal)}</span>
            </p>
          </Fragment>
        )
      })}
    </div>
  )
}

function WoonbalansAppBlock({ data }: { data: VermogenWoonbalansSection }) {
  const fc = useFc()
  return (
    <div className="mb-8">
      <SectionLabel num="c.">Woonbalans</SectionLabel>
      {data.items.map((item, idx) => (
        <div
          key={`${item.assetName}-${idx}`}
          className="mb-3 border border-[var(--border-ed)] p-3 last:mb-0"
        >
          <p className="mb-2 font-inter text-[12px] font-semibold text-[var(--ink)]">{item.assetName}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-3)]">Marktwaarde</p>
              <p className="mt-0.5 font-dm-mono text-[13px] tabular-nums text-[var(--ink)]">{fc(item.marketValue)}</p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-3)]">WOZ-waarde</p>
              <p className="mt-0.5 font-dm-mono text-[13px] tabular-nums text-[var(--ink)]">
                {item.wozValue != null ? fc(item.wozValue) : <span className="text-[var(--ink-4)]">—</span>}
              </p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-3)]">Bruto overwaarde</p>
              <p className="mt-0.5 font-dm-mono text-[13px] tabular-nums text-[var(--positive)]">
                {item.brutoOverwaarde != null ? fc(item.brutoOverwaarde) : <span className="text-[var(--ink-4)]">—</span>}
              </p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-3)]">Stille reserve</p>
              <p className="mt-0.5 font-dm-mono text-[13px] tabular-nums text-[var(--ink)]">
                {item.stilleReserve != null ? fc(item.stilleReserve) : <span className="text-[var(--ink-4)]">—</span>}
              </p>
            </div>
          </div>
          {item.mortgageBalance != null && (
            <p
              className="mt-2 text-[11px] italic text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              Gekoppelde hypotheek-restschuld: <span className="not-italic font-semibold">{fc(item.mortgageBalance)}</span>
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function VerhuurAppBlock({ data }: { data: VermogenVerhuurSection }) {
  const fc = useFc()
  return (
    <div className="mb-8">
      <SectionLabel num="d.">Verhuurrendement</SectionLabel>
      {data.items.map((item, idx) => (
        <div
          key={`${item.assetName}-${idx}`}
          className="mb-3 border border-[var(--border-ed)] p-3 last:mb-0"
        >
          <p className="mb-2 font-inter text-[12px] font-semibold text-[var(--ink)]">{item.assetName}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-3)]">Bruto rendement</p>
              <p className="mt-0.5 font-dm-mono text-[13px] tabular-nums text-[var(--ink)]">{formatPct(item.brutoRendementPct)}</p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-3)]">Netto rendement</p>
              <p className="mt-0.5 font-dm-mono text-[13px] tabular-nums text-[var(--ink)]">{formatPct(item.nettoRendementPct)}</p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-3)]">Huur/jr</p>
              <p className="mt-0.5 font-dm-mono text-[13px] tabular-nums text-[var(--ink)]">{fc(item.rentalIncomeYearly)}</p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-3)]">Bezetting</p>
              <p className="mt-0.5 font-dm-mono text-[13px] tabular-nums text-[var(--ink)]">
                {item.bezettingsgraadPct != null ? `${item.bezettingsgraadPct}%` : <span className="text-[var(--ink-4)]">geen log</span>}
              </p>
            </div>
          </div>
          <p
            className="mt-2 text-[11px] italic text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            Onderhoud {item.monthlyMaintenanceCost > 0 ? `${fc(item.monthlyMaintenanceCost)}/mnd` : '1%-schatting'} · VvE {fc(item.vvaFee)}/mnd
          </p>
        </div>
      ))}
    </div>
  )
}

function HypotheekAppBlock({ data }: { data: VermogenHypotheekSection }) {
  const fc = useFc()
  return (
    <div className="mb-8">
      <SectionLabel num="e.">Hypotheekplanner</SectionLabel>
      {data.items.map((item, idx) => (
        <div
          key={`${item.debtName}-${idx}`}
          className="mb-4 border border-[var(--border-ed)] p-3 last:mb-0"
        >
          <p className="mb-2 font-inter text-[12px] font-semibold text-[var(--ink)]">{item.debtName}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-3)]">Restschuld</p>
              <p className="mt-0.5 font-dm-mono text-[13px] tabular-nums text-[var(--ink)]">{fc(item.currentBalance)}</p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-3)]">Maandlast</p>
              <p className="mt-0.5 font-dm-mono text-[13px] tabular-nums text-[var(--ink)]">{fc(item.monthlyPayment)}</p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-3)]">Rente</p>
              <p className="mt-0.5 font-dm-mono text-[13px] tabular-nums text-[var(--ink)]">{formatPct(item.interestRatePct, 2)}</p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-3)]">Tot. rente</p>
              <p className="mt-0.5 font-dm-mono text-[13px] tabular-nums text-[var(--ink-2)]">{fc(item.totalRemainingInterest)}</p>
            </div>
          </div>
          {item.repaymentTypeLabel && (
            <p
              className="mt-1 text-[11px] italic text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              Aflossingsvorm: {item.repaymentTypeLabel} · Eindstand: <span className="not-italic font-semibold">{fc(item.endBalance)}</span>
            </p>
          )}

          {item.firstYearSchedule.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                Eerste 12 maanden aflos-schema
              </summary>
              <table className="mt-2 w-full text-[11px]">
                <thead>
                  <tr className="border-b border-[var(--border-ed)] text-[var(--ink-3)]">
                    <th className="py-1 text-left font-inter font-medium">Mnd</th>
                    <th className="py-1 text-right font-inter font-medium">Betaling</th>
                    <th className="py-1 text-right font-inter font-medium">Rente</th>
                    <th className="py-1 text-right font-inter font-medium">Aflossing</th>
                    <th className="py-1 text-right font-inter font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {item.firstYearSchedule.map((row) => (
                    <tr key={row.month} className="border-b border-dashed border-[var(--rule-soft)]">
                      <td className="py-0.5 font-inter">{row.month}</td>
                      <td className="py-0.5 text-right font-dm-mono tabular-nums">{fc(row.payment)}</td>
                      <td className="py-0.5 text-right font-dm-mono tabular-nums text-[var(--ink-3)]">{fc(row.interest)}</td>
                      <td className="py-0.5 text-right font-dm-mono tabular-nums">{fc(row.principal)}</td>
                      <td className="py-0.5 text-right font-dm-mono tabular-nums">{fc(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────────────

export default function VermogenReportPage() {
  const fc = useFc()
  const searchParams = useSearchParams()
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

  const [data, setData] = useState<VermogenReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchVermogen() {
      try {
        const res = await fetch(`/api/report/vermogen?date=${date}`)
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Vermogensoverzicht laden mislukt')
        }
        setData(await res.json())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Vermogensoverzicht laden mislukt')
      } finally {
        setLoading(false)
      }
    }
    fetchVermogen()
  }, [date])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[var(--module-active-500)] border-t-transparent" />
          <p className="font-inter text-sm text-[var(--ink-3)]">Vermogensoverzicht wordt opgesteld...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="font-playfair text-xl text-[var(--ink)]">Vermogensoverzicht niet beschikbaar</p>
          <p className="mt-2 font-inter text-sm text-[var(--ink-3)]">{error || 'Geen data gevonden'}</p>
        </div>
      </div>
    )
  }

  const displayDate = new Date(data.date).toLocaleDateString('nl-NL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const generatedDate = formatTimestamp(data.generatedAt)
  const freedom = data.dailyExpenseRate > 0 && data.eigenVermogen >= 100
    ? eurToFreedomTime(data.eigenVermogen, data.dailyExpenseRate)
    : null

  // Roman section-marker mapping voor de hoofd-secties (i. … viii.).
  // Het rapport bouwt zelf de Romeinse num op secties, conform balans-rapport.

  // Detecteer of er één app-deepening sectie actief is — anders skippen we
  // de "vi. App-deepening"-section-label volledig.
  const hasAnyApp =
    data.budgetterenSection != null ||
    data.holdingsSection != null ||
    data.woonbalansSection != null ||
    data.verhuurSection != null ||
    data.hypotheekSection != null

  return (
    <div
      className="report-pdf-root mx-auto max-w-[900px] px-4 py-6 md:px-8"
      data-report-module="kern"
    >
      <NavStackMeta title="Vermogensoverzicht" bottomBar={{ kind: 'tabs' }} />

      {/* ── Toolbar — print-knop ── */}
      <div data-print-hide className="mb-6 flex items-center justify-end gap-3">
        <PageInfoButton description={PAGE_INFO['/rapportages/vermogen'] ?? ''} />
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-4 py-2 font-inter text-sm font-medium text-[var(--ink)] shadow-[var(--s0)] transition-all hover:shadow-[var(--s1)] hover:-translate-y-px"
        >
          <Printer className="h-4 w-4" />
          Afdrukken als PDF
        </button>
      </div>

      {/* ── Masthead — dubbele-lijn header ──
         `.report-section` zorgt voor `break-inside: avoid` in print zodat
         de masthead nooit gesneden wordt over een page-break. */}
      <div
        className="report-section pb-4 mb-8"
        style={{ borderBottom: '4px double var(--ink)' }}
      >
        <div className="inline-flex items-center justify-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)] mb-1 w-full">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
          Vermogensoverzicht
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
        </div>
        <h1
          className="text-center text-3xl font-bold tracking-tight text-[var(--ink)] md:text-[42px] md:leading-[1.1]"
          style={{ fontFamily: 'var(--font-playfair, serif)', letterSpacing: '-0.03em' }}
        >
          {displayDate}
        </h1>
        <div className="mt-3 flex items-center justify-center gap-2 text-[13px] font-source-serif italic text-[var(--ink-3)]">
          {data.displayName && <span>{data.displayName}</span>}
          {data.displayName && <span>&middot;</span>}
          <span>Peildatum {new Date(data.date).toLocaleDateString('nl-NL')}</span>
        </div>
      </div>

      {/* ── Mini-hero — FiguresStrip met eigen vermogen als winner ──
         FiguresStrip rendert zijn eigen wrapper-div met `data-figures-strip`;
         de print-CSS gebruikt dat attribuut voor compactere kolommen. */}
      <FiguresStrip
        cols={4}
        figures={[
          {
            kicker: 'Totaal activa',
            amount: fc(data.totalAssets),
            sub: `${data.totalAssetCount} ${data.totalAssetCount === 1 ? 'bezitting' : 'bezittingen'}`,
            variant: 'neutral',
          },
          {
            kicker: 'Totaal passiva',
            amount: fc(data.totalDebts),
            sub: `${data.totalDebtCount} ${data.totalDebtCount === 1 ? 'schuld' : 'schulden'}`,
            variant: 'neutral',
          },
          {
            kicker: 'Eigen vermogen',
            amount: fc(data.eigenVermogen),
            sub: 'netto',
            variant: 'winner',
          },
          {
            kicker: 'Aantal regels',
            amount: String(data.totalAssetCount + data.totalDebtCount),
            sub: `${data.totalAssetCount} bezittingen · ${data.totalDebtCount} schulden`,
            variant: 'neutral',
          },
        ]}
      />

      {/* ── iii. Methodologie-callout ──
         In eigen `.report-section`-wrapper zodat print de callout niet
         doorsnijdt halverwege een page-break. */}
      <section className="report-section">
        <ScenarioCallout title="Hoe deze inventaris is opgesteld">
          Bezittingen op marktwaarde per peildatum, schulden op restschuld. Inclusie-percentages
          (bv. partner-aandeel of zakelijke pot) worden expliciet getoond als ze van 100% afwijken.
          Woz-waarde wordt los vermeld naast marktwaarde voor woningen, omdat beide cijfers van
          toepassing zijn maar verschillende doelen dienen: koopvoorwaarde versus fiscale grondslag.
        </ScenarioCallout>
      </section>

      {/* ── iv. Bezittingen — per categorie ──
         Elke categorie-tabel zit al in een `<section>` (AssetCategoryBlock).
         Hier wrappen we de section-label + finale-totaal in eigen
         `.report-section`-blokken zodat de subtotaal-regel niet alleen
         onderaan een pagina komt. */}
      {data.assets.length > 0 ? (
        <>
          <div className="report-section mb-4">
            <SectionLabel num="iv.">Bezittingen</SectionLabel>
          </div>
          {data.assets.map((cat) => (
            <div key={cat.type} className="report-section">
              <AssetCategoryBlock category={cat} />
            </div>
          ))}
          <div className="report-section mt-4 mb-8 flex justify-between border-b-4 border-double border-[var(--ink)] pt-2 pb-2">
            <span className="font-inter text-sm font-bold text-[var(--ink)]">Totaal bezittingen</span>
            <span className="font-dm-mono text-sm font-bold tabular-nums text-[var(--ink)]">
              {fc(data.totalAssets)}
            </span>
          </div>
        </>
      ) : (
        <p className="my-6 font-source-serif italic text-[14px] text-[var(--ink-3)]">
          Geen bezittingen geregistreerd op deze peildatum.
        </p>
      )}

      {/* ── v. Schulden — per categorie ── */}
      {data.debts.length > 0 ? (
        <>
          <div className="report-section mb-4">
            <SectionLabel num="v.">Schulden</SectionLabel>
          </div>
          {data.debts.map((cat) => (
            <div key={cat.type} className="report-section">
              <DebtCategoryBlock category={cat} />
            </div>
          ))}
          <div className="report-section mt-4 mb-8 flex justify-between border-b-4 border-double border-[var(--ink)] pt-2 pb-2">
            <span className="font-inter text-sm font-bold text-[var(--ink)]">Totaal schulden</span>
            <span className="font-dm-mono text-sm font-bold tabular-nums text-[var(--negative)]">
              {fc(data.totalDebts)}
            </span>
          </div>
        </>
      ) : (
        <p className="my-6 font-source-serif italic text-[14px] text-[var(--ink-3)]">
          Geen schulden geregistreerd op deze peildatum.
        </p>
      )}

      {/* ── vi. App-deepening secties (conditional) ──
         Elke app-blok in eigen `.report-section`-wrapper. */}
      {hasAnyApp && (
        <div className="report-section mb-4">
          <SectionLabel num="vi.">App-verdieping</SectionLabel>
        </div>
      )}
      {data.budgetterenSection && (
        <div className="report-section">
          <BudgetterenAppBlock data={data.budgetterenSection} />
        </div>
      )}
      {data.holdingsSection && (
        <div className="report-section">
          <HoldingsAppBlock data={data.holdingsSection} />
        </div>
      )}
      {data.woonbalansSection && (
        <div className="report-section">
          <WoonbalansAppBlock data={data.woonbalansSection} />
        </div>
      )}
      {data.verhuurSection && (
        <div className="report-section">
          <VerhuurAppBlock data={data.verhuurSection} />
        </div>
      )}
      {data.hypotheekSection && (
        <div className="report-section">
          <HypotheekAppBlock data={data.hypotheekSection} />
        </div>
      )}

      {/* ── vii. Eigen-vermogen-finale ── */}
      <section className="report-section mt-8 mb-6">
        <SectionLabel num="vii.">Eigen vermogen</SectionLabel>
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-5 shadow-[var(--s0)]">
          <p className="font-inter text-[11px] text-[var(--ink-3)]">
            Bezittingen {fc(data.totalAssets)} − schulden {fc(data.totalDebts)}
          </p>
          <p className="mt-1 flex items-baseline justify-between border-b-4 border-double border-[var(--ink)] pb-2">
            <span className="font-inter text-sm font-bold text-[var(--ink)]">Netto vermogen</span>
            <span
              className={`font-dm-mono text-lg font-bold tabular-nums ${data.eigenVermogen >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}
            >
              {fc(data.eigenVermogen)}
            </span>
          </p>

          {freedom && (
            <div className="mt-4 text-center">
              <p className="font-inter text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                Vertaald in vrijheidstijd
              </p>
              <p
                className="mt-2 font-playfair text-3xl font-bold text-[var(--module-active-700)]"
                style={{ letterSpacing: '-0.03em' }}
              >
                {freedom.formatted}
              </p>
              <p className="mt-1 font-source-serif text-[12px] italic text-[var(--ink-3)]">
                gebaseerd op uitgaven van {fc(Math.round(data.dailyExpenseRate))}/dag
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── viii. Colophon ── */}
      <section className="report-section">
        <div className="mt-10 border-t-4 border-double border-[var(--ink)]" />
        <div className="text-center pt-4">
          <p className="font-playfair text-lg font-bold text-[var(--ink)]">
            <span>t</span><span style={{ color: 'var(--module-active-700)' }}>f.</span>
          </p>
          <p className="mt-1 font-source-serif text-[13px] italic text-[var(--ink-3)]">
            &ldquo;Geld is opgeslagen tijd&rdquo;
          </p>
        </div>
        <OrnamentColophon module="Vermogensoverzicht" text={generatedDate} />
      </section>
    </div>
  )
}
