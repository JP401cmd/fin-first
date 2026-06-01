'use client'

import { useState, useEffect } from 'react'
import { Calculator, ChevronDown, ChevronUp, Clock, Info, Building2, AlertTriangle } from 'lucide-react'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { BOX2_TOOLTIPS, type Box2Result } from '@/lib/box2-data'

/**
 * Box2Detail — compacte Box 2-sectie (aanmerkelijk belang / DGA) op de
 * Box 2-subpagina /overzicht/belasting/box2. Wordt door de pagina alléén
 * gerenderd wanneer er daadwerkelijk aanmerkelijk belang is (deelneming-asset
 * aanwezig — server-side bepaald). Toont uitsluitend de **privé-impact**: het
 * personal/eigen Box 2-resultaat, nooit het gecombineerde/zakelijke.
 *
 * Hergebruikt de pure engine lib/box2-data.ts via /api/household/box2 —
 * geen logica-duplicatie. Spiegelt het patroon van box3-detail.tsx.
 */

interface PartnerEntry {
  isCurrentUser: boolean
  result: Box2Result
}

interface Box2ApiResponse {
  personal?: Box2Result
  hasHousehold?: boolean
  partners?: PartnerEntry[]
}

/** Privé-resultaat in beide modi (single: personal; household: eigen partner-entry). */
function selectPersonal(data: Box2ApiResponse): Box2Result | null {
  return (
    data.personal ??
    data.partners?.find((p) => p.isCurrentUser)?.result ??
    null
  )
}

function formatPct(value: number): string {
  return (value * 100).toFixed(1) + '%'
}

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--subtle)] text-[var(--ink-3)] hover:bg-violet-100 transition-colors"
        aria-label="Meer informatie"
      >
        <Info className="h-3 w-3" />
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-3 text-xs text-[var(--ink-2)] shadow-md">
          {text}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[var(--paper)]" />
        </span>
      )}
    </span>
  )
}

function Row({
  label,
  value,
  pct,
  bold,
  highlight,
  tooltip,
  fc,
}: {
  label: string
  value?: number
  pct?: number
  bold?: boolean
  highlight?: boolean
  tooltip?: string
  fc: (v: number) => string
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 ${highlight ? 'rounded-lg bg-violet-50 px-2 py-1.5 -mx-2' : ''}`}
    >
      <span className={`text-xs text-[var(--ink-2)] ${bold ? 'font-semibold' : ''}`}>
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </span>
      {(value != null || pct != null) && (
        <span className={`text-xs tabular-nums font-mono ${bold ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}>
          {pct != null ? formatPct(pct) : value != null ? fc(value) : ''}
        </span>
      )}
    </div>
  )
}

export function Box2Detail({ year = 2026 }: { year?: number }) {
  const [result, setResult] = useState<Box2Result | null>(null)
  const [loading, setLoading] = useState(true)
  const [showDetails, setShowDetails] = useState(false)
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/household/box2?year=${year}`)
      .then((r) => r.json())
      .then((data: Box2ApiResponse) => {
        if (!cancelled) setResult(selectPersonal(data))
      })
      .catch(() => {
        /* stil falen */
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [year])

  if (loading) {
    return (
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-8">
        <div className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-5 animate-pulse">
          <div className="h-4 w-40 bg-[var(--subtle)] rounded mb-3" />
          <div className="h-8 w-32 bg-[var(--subtle)] rounded" />
        </div>
      </section>
    )
  }

  // Render onvoorwaardelijk bij AB (de pagina gate't al op deelneming-bezit);
  // ook tonen bij €0 belasting zodat een DGA zonder dividend zijn positie ziet.
  if (!result) return null

  const hasDga = result.dgaLeningenExcess > 0

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-8">
      <div className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        {/* Samenvatting — privé */}
        <div className="p-4 sm:p-5">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Box 2 — aanmerkelijk belang {result.year} · privé
          </div>
          <div className="mt-1 flex items-baseline gap-2 flex-wrap">
            <span className="font-serif text-2xl font-semibold text-[var(--ink)] tabular-nums">
              {fc(result.totalTaxInclDga)}
            </span>
            <span className="text-xs text-[var(--ink-3)]">per jaar</span>
            {result.freedomDays > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-3)]">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {result.freedomDays} vrijheidsdagen
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-[var(--ink-2)] leading-snug">
            Belasting in privé over dividend + vervreemdingswinst uit je
            aanmerkelijk belang (≥ 5%-deelneming).
          </p>
        </div>

        {/* DGA-waarschuwing */}
        {hasDga && (
          <div className="mx-4 sm:mx-5 mb-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Je leent meer dan {fc(result.dgaLeningenDrempel)} van je BV. Over
              het bovenmatige deel ({fc(result.dgaLeningenExcess)}) betaal je
              extra Box 2-heffing: {fc(result.dgaExcessTax)}.
            </span>
          </div>
        )}

        {/* Uitklapbare berekening */}
        <button
          type="button"
          onClick={() => setShowDetails((s) => !s)}
          aria-expanded={showDetails}
          className="flex w-full items-center justify-between border-t border-[var(--border-ed)] p-4 sm:px-5 hover:bg-[var(--subtle)] transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <Calculator className="h-4 w-4 text-violet-600" aria-hidden="true" />
            Berekeningsstappen
          </span>
          {showDetails ? (
            <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
          )}
        </button>
        {showDetails && (
          <div className="border-t border-[var(--border-ed)] px-4 py-4 sm:px-5 space-y-3">
            <Row label="Dividend" value={result.totalDividend} tooltip={BOX2_TOOLTIPS.dividend} fc={fc} />
            <Row label="Vervreemdingswinst" value={result.totalDisposalGain} tooltip={BOX2_TOOLTIPS.vervreemdingswinst} fc={fc} />
            <Row label="Totaal Box 2-inkomen" value={result.totalIncome} bold fc={fc} />
            <div className="h-px bg-[var(--border-ed)]" />
            <Row
              label={`Tarief laag (${formatPct(result.params.tariefLaag)}, tot ${fc(result.hasPartner ? result.params.grensPartner : result.params.grens)})`}
              value={result.taxLow}
              tooltip={BOX2_TOOLTIPS.tariefStaffel}
              fc={fc}
            />
            <Row label={`Tarief hoog (${formatPct(result.params.tariefHoog)})`} value={result.taxHigh} fc={fc} />
            <Row label="Box 2-belasting" value={result.totalTax} fc={fc} />
            {hasDga && (
              <Row label="Extra heffing excessief lenen" value={result.dgaExcessTax} tooltip={BOX2_TOOLTIPS.wetExcessiefLenen} fc={fc} />
            )}
            <div className="h-px bg-[var(--border-ed)]" />
            <Row label="Totaal Box 2 (incl. DGA)" value={result.totalTaxInclDga} bold highlight fc={fc} />
          </div>
        )}

        {/* Per-deelneming */}
        {result.perDeelneming.length > 0 && (
          <div className="border-t border-[var(--border-ed)] px-4 py-3 sm:px-5">
            <div className="flex items-center gap-1.5 mb-2">
              <Building2 className="h-3.5 w-3.5 text-[var(--ink-3)]" aria-hidden="true" />
              <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]">
                Per deelneming
              </span>
            </div>
            <div className="space-y-1.5">
              {result.perDeelneming.map((d, i) => (
                <div key={i} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-[var(--ink-2)] truncate">{d.name}</span>
                  <span className="font-mono tabular-nums text-[var(--ink-2)] shrink-0">
                    {fc(d.totalIncome)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
