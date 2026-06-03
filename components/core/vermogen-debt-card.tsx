'use client'

import { useFlashChange } from '@/lib/hooks/use-flash-change'
import { MaskedAmount } from '@/components/app/masked-amount'
import {
  type Debt,
  type DebtType,
  DEBT_TYPE_LABELS,
  REPAYMENT_TYPE_LABELS,
} from '@/lib/debt-data'
import {
  Home,
  Banknote,
  GraduationCap,
  Car,
  CreditCard,
  RefreshCw,
  CalendarCheck,
  Receipt,
  Heart,
  Building2,
  CircleDot,
  Pencil,
} from 'lucide-react'
import { CardKpiStrip } from './card-kpi-strip'
import { ConnectionIndicator } from './connection-indicator'
import { CardTintOverlay } from './card-tint-overlay'
import { VermogenCardActionButton } from './vermogen-card-action-button'
import { OwnershipBadge } from '@/components/app/ownership-toggle'
import type { KpiPair } from '@/lib/asset-kpi'
import type { AssetConnectionSummary } from '@/lib/connections-data'
import type { Perspective, Provenance } from '@/lib/household-data'

// ── Constants ───────────────────────────────────────────────

/** Fixed red accent for all debt cards */
const DEBT_ACCENT_COLOR = '#ef4444'

// ── Icon mapping ────────────────────────────────────────────

const DEBT_ICONS: Record<DebtType, React.ComponentType<{ className?: string }>> = {
  mortgage: Home,
  personal_loan: Banknote,
  student_loan: GraduationCap,
  car_loan: Car,
  credit_card: CreditCard,
  revolving_credit: RefreshCw,
  payment_plan: CalendarCheck,
  belastingschuld: Receipt,
  familielening: Heart,
  dga_schuld: Building2,
  other: CircleDot,
}

// ── Props ───────────────────────────────────────────────────

interface VermogenDebtCardProps {
  debt: Debt
  /**
   * KPI-paar voor de strip onder de hoofdregel. Caller berekent dit via
   * `computeDebtKpi(debt, ctx)` uit `lib/debt-kpi.ts`.
   */
  kpiPair?: KpiPair
  /**
   * Optionele actieve externe koppeling — rendert hetzelfde `Plug`-symbool
   * als op asset-kaarten zodra een hypotheek-API of bank-connector aan een
   * schuld gekoppeld kan worden. Voorlopig altijd `undefined` in productie
   * (geen actieve debt-koppelingen), maar het display-pad is in stelling.
   */
  connection?: AssetConnectionSummary
  /**
   * 6 maandwaarden voor de achtergrond-sparkline ("breuklijn") die de
   * tinted boven/onder zones scheidt. Bij `undefined` of <2 punten valt
   * de overlay terug op een rechte horizontale scheiding op het midden.
   */
  sparklineValues?: number[]
  onClick: (debtId: string) => void
  staggerIndex?: number
  /** Opent de detail-pane direct in edit-mode (URL: `?debt=<id>&edit=1`). */
  onEditClick: (debtId: string) => void
  /** Opent de detail-pane met de ValuationModal direct open (URL: `?debt=<id>&via=revalue`). */
  onRevalueClick: (debtId: string) => void
  // ── Huishouden-perspectief (optioneel; solo-gebruik blijft identiek) ──
  /** Herkomst-stempel uit de perspectief-loader → toont de OwnershipBadge. */
  provenance?: Provenance
  /** Actief perspectief — bepaalt of de "Eigen"-badge ruis is (personal). */
  perspective?: Perspective
  /** Partnernaam voor de partner-badge. */
  partnerName?: string | null
  /**
   * "Jouw aandeel: € X" / "Aandeel partner: € X"-subregel voor gedeelde
   * schulden in eigen/partner-view. `null`/leeg → niet getoond. De caller
   * berekent dit via `formatOwnershipSubline`.
   */
  ownershipSubline?: string | null
  /**
   * Privacy-aggregaatrij ("Partner schulden (totaal)"): rendert read-only —
   * geen klik-navigatie, geen actie-rij, geen KPI-strip. De `current_balance`
   * is het gesommeerde partner-totaal.
   */
  aggregated?: boolean
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Format interest rate for display: e.g. 3.8 -> "3,8%"
 * Uses Dutch locale comma separator.
 */
function formatRate(rate: number): string {
  return `${rate.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

// ── Component ───────────────────────────────────────────────

export function VermogenDebtCard({
  debt,
  kpiPair,
  connection,
  sparklineValues,
  onClick,
  staggerIndex = 0,
  onEditClick,
  onRevalueClick,
  provenance,
  perspective,
  partnerName,
  ownershipSubline,
  aggregated = false,
}: VermogenDebtCardProps) {
  const { flashClass } = useFlashChange(debt.current_balance)
  const Icon = DEBT_ICONS[debt.debt_type]

  // Build subtitle parts: repayment type + interest rate
  const subtitleParts: string[] = []
  if (debt.repayment_type) {
    subtitleParts.push(REPAYMENT_TYPE_LABELS[debt.repayment_type])
  }
  if (debt.interest_rate > 0) {
    subtitleParts.push(formatRate(debt.interest_rate))
  }
  const subtitle = subtitleParts.join(' · ') // joined with middle dot

  // ── Privacy-aggregaatkaart ───────────────────────────────────
  // Eén niet-bewerkbare "Partner schulden (totaal)"-kaart: de partner deelt
  // alleen totalen, dus geen klik-navigatie, actie-rij of KPI-strip.
  if (aggregated) {
    return (
      <div
        className="card-editorial animate-fade-up relative w-full"
        style={{ '--stagger': `${staggerIndex * 60}ms` } as React.CSSProperties}
        data-testid="debt-card-aggregated"
      >
        <div
          className="relative z-10 h-[3px] w-full"
          style={{ backgroundColor: DEBT_ACCENT_COLOR }}
        />
        <div className="relative z-10 flex w-full items-center gap-3 p-3 sm:p-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-red-100">
            <Icon className="h-4 w-4 text-red-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-[var(--ink)]">
                {debt.name}
              </p>
              <OwnershipBadge
                provenance={provenance ?? 'partner'}
                partnerName={partnerName}
                perspective={perspective}
              />
            </div>
            <p
              className="truncate text-[11px] italic text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              Alleen totaal gedeeld
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-negative">
              <MaskedAmount
                value={Math.abs(debt.current_balance)}
                signPrefix="-"
                tone="kern"
                className="text-sm font-bold"
              />
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="card-editorial animate-fade-up relative w-full"
      style={{ '--stagger': `${staggerIndex * 60}ms` } as React.CSSProperties}
    >
      <CardTintOverlay variant="debt" sparklineValues={sparklineValues} />

      {/* 3px top accent bar — always red for debts */}
      <div
        className="relative z-10 h-[3px] w-full"
        style={{ backgroundColor: DEBT_ACCENT_COLOR }}
      />

      {/* Hoofdregel — eigen <button>, opent de detail-pane in view-mode */}
      <button
        type="button"
        onClick={() => onClick(debt.id)}
        aria-label={`${debt.name} openen`}
        className="relative z-10 flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-[var(--subtle)]/30 sm:p-4"
      >
        {/* Left: icon + name + subtitle */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-red-100">
          <Icon className="h-4 w-4 text-red-600" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-[var(--ink)]">
              {debt.name}
            </p>
            {/* Herkomst-badge (gezamenlijk / partner / eigen). Null in
                personal-view voor eigen items — geen ruis. */}
            {provenance && (
              <OwnershipBadge
                provenance={provenance}
                partnerName={partnerName}
                perspective={perspective}
              />
            )}
            {connection && <ConnectionIndicator connection={connection} />}
          </div>
          {/* Sub-meta in italic Source Serif (mini-artikel-blueprint) */}
          <p
            className="truncate text-[11px] italic text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            {DEBT_TYPE_LABELS[debt.debt_type]}
            {subtitle ? ` · ${subtitle}` : ''}
          </p>
          {/* "Jouw aandeel" / "Aandeel partner" voor gedeelde schulden. */}
          {ownershipSubline && (
            <p className="truncate text-[11px] font-medium text-[var(--ink-4)]">
              {ownershipSubline}
            </p>
          )}
        </div>

        {/* Right: balance (negatief, met highlight-marker als hoofdcijfer) + monthly payment */}
        <div className="shrink-0 text-right">
          <p className={`text-negative ${flashClass}`}>
            <span
              className="inline px-1"
              style={{
                backgroundImage:
                  'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
              }}
            >
              <MaskedAmount
                value={Math.abs(debt.current_balance)}
                signPrefix="-"
                tone="kern"
                className="text-sm font-bold"
              />
            </span>
          </p>
          {debt.monthly_payment > 0 && (
            <span className="text-[var(--ink-3)]">
              <MaskedAmount value={debt.monthly_payment} tone="kern" className="text-[10px] font-medium" />
              <span className="text-[var(--ink-4)]">/mnd</span>
            </span>
          )}
        </div>
      </button>

      {/* Actie-rij — tussen hoofdregel en KPI-strip. Eigen interactieve regio
          met aparte <button>s — geen nested buttons (a11y). Geen sync-pad:
          schulden hebben in productie geen actieve API-koppelingen. */}
      <div
        role="group"
        aria-label={`Acties voor ${debt.name}`}
        className="relative z-10 flex items-center justify-end gap-2 border-t border-[var(--border-md)]/40 px-3 py-2 sm:px-4"
      >
        <VermogenCardActionButton
          icon={RefreshCw}
          label="Saldo bijwerken"
          onClick={() => onRevalueClick(debt.id)}
          ariaLabel={`Saldo van ${debt.name} bijwerken`}
        />
        <VermogenCardActionButton
          icon={Pencil}
          label="Bewerken"
          onClick={() => onEditClick(debt.id)}
          ariaLabel={`${debt.name} bewerken`}
        />
      </div>

      {kpiPair && (kpiPair.primary || kpiPair.secondary) ? (
        <div className="relative z-10">
          <CardKpiStrip pair={kpiPair} variant="item" />
        </div>
      ) : null}
    </div>
  )
}
