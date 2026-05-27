'use client'

import { useState, useEffect } from 'react'
import { Calculator, ChevronDown, ChevronUp, Clock, Info, Layers, Users } from 'lucide-react'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { BOX3_TOOLTIPS, type Box3Result } from '@/lib/box3-data'
import { GlossaryTerm } from '@/components/editorial/glossary-term'

/**
 * Box3Detail — compacte, inklapbare Box 3-berekening op /overzicht/belasting.
 *
 * Vervangt het volledige (1393-regel) BelastingPage-embed door alleen het
 * Box 3-rekenwerk: een samenvatting (belasting + vrijheidsdagen) plus een
 * uitklapbaar "Berekeningsstappen"-blok. De zware rekenlogica blijft de
 * pure `lib/box3-data.ts`-engine, geserveerd via /api/household/box3 — geen
 * duplicatie.
 *
 * Subtiel: standaard ingeklapt. Box 2 / partner-optimalisatie /
 * asset-classificatie volgen in een latere "diepe belasting"-iteratie.
 */

interface PartnerEntry {
  isCurrentUser: boolean
  result: Box3Result
}

interface OptimalAllocation {
  totalTax: number
  savingsVsEqual: number
}

interface Box3ApiResponse {
  /** Aanwezig in single-modus. */
  personal?: Box3Result
  /** Household-modus: geen `personal`, wel partners + combined. */
  hasHousehold?: boolean
  partners?: PartnerEntry[]
  combined?: Box3Result
  optimalAllocation?: OptimalAllocation
  dailyExpenses?: number
}

/** Kies het privé-resultaat in beide modi: single → personal; household
 *  → de partner-entry van de huidige gebruiker. */
function selectPersonal(data: Box3ApiResponse): Box3Result | null {
  return (
    data.personal ??
    data.partners?.find((p) => p.isCurrentUser)?.result ??
    null
  )
}

function formatPct(value: number): string {
  return (value * 100).toFixed(2) + '%'
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

function CalcRow({
  label,
  value,
  pct,
  bold,
  muted,
  negative,
  highlight,
  tooltip,
  fc,
}: {
  label: string
  value?: number
  pct?: number
  bold?: boolean
  muted?: boolean
  negative?: boolean
  highlight?: boolean
  tooltip?: string
  fc: (v: number) => string
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 ${highlight ? 'rounded-lg bg-violet-50 px-2 py-1.5 -mx-2' : ''}`}
    >
      <span
        className={`text-xs ${muted ? 'text-[var(--ink-3)]' : 'text-[var(--ink-2)]'} ${bold ? 'font-semibold' : ''}`}
      >
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </span>
      {(value != null || pct != null) && (
        <span
          className={`text-xs tabular-nums font-mono ${bold ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}
        >
          {negative && value != null && value !== 0 ? '−' : ''}
          {pct != null ? formatPct(pct) : value != null ? fc(Math.abs(value)) : ''}
        </span>
      )}
    </div>
  )
}

export function Box3Detail({ year = 2026 }: { year?: number }) {
  const [result, setResult] = useState<Box3Result | null>(null)
  const [api, setApi] = useState<Box3ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [showDetails, setShowDetails] = useState(false)
  const [showClassificatie, setShowClassificatie] = useState(false)
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/household/box3?year=${year}`)
      .then((r) => r.json())
      .then((data: Box3ApiResponse) => {
        if (cancelled) return
        setApi(data)
        setResult(selectPersonal(data))
      })
      .catch(() => {
        /* stil falen — sectie blijft leeg */
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [year])

  // 3a partner-optimalisatie: alleen household + daadwerkelijke besparing.
  const optimal = api?.optimalAllocation
  const dailyExpenses = api?.dailyExpenses ?? 0
  const showPartnerOptim =
    !!api?.hasHousehold && !!optimal && optimal.savingsVsEqual > 0

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

  if (!result) return null

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-8">
      <div className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        {/* Samenvatting */}
        <div className="p-4 sm:p-5">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Box 3 — vermogensbelasting {result.year}
          </div>
          <div className="mt-1 flex items-baseline gap-2 flex-wrap">
            <span className="font-serif text-2xl font-semibold text-[var(--ink)] tabular-nums">
              {fc(result.tax)}
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
            Berekend over {fc(result.totaalSpaargeld + result.totaalBeleggingen)}{' '}
            <GlossaryTerm term="box_3">Box 3</GlossaryTerm>-vermogen met het{' '}
            <GlossaryTerm term="forfaitair_rendement">forfaitair rendement</GlossaryTerm>.
          </p>
        </div>

        {/* Uitklapbare berekeningsstappen */}
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
          <div className="border-t border-[var(--border-ed)] px-4 py-4 sm:px-5">
            <div className="space-y-3">
              <CalcRow label="Totaal spaargeld" value={result.totaalSpaargeld} fc={fc} />
              <CalcRow label="Totaal beleggingen" value={result.totaalBeleggingen} fc={fc} />
              {result.totaalUitgesloten > 0 && (
                <CalcRow label="Uitgesloten (Box 1/2)" value={result.totaalUitgesloten} muted fc={fc} />
              )}
              <div className="h-px bg-[var(--border-ed)]" />
              <CalcRow label="Box 3 schulden" value={result.totaalBox3Schulden} fc={fc} />
              <CalcRow
                label={`Schuldendrempel (${result.hasPartner ? 'partner' : 'single'})`}
                value={result.schuldendrempel}
                muted
                tooltip={BOX3_TOOLTIPS.schuldendrempel}
                fc={fc}
              />
              <CalcRow label="Aftrekbare schulden" value={result.aftrekbareSchulden} fc={fc} />
              <div className="h-px bg-[var(--border-ed)]" />
              <CalcRow
                label="Forfaitair rendement spaargeld"
                value={result.forfaitairSpaargeld}
                tooltip={BOX3_TOOLTIPS.forfaitairRendement}
                fc={fc}
              />
              <CalcRow label="Forfaitair rendement beleggingen" value={result.forfaitairBeleggingen} fc={fc} />
              <CalcRow label="Forfaitair rendement schulden" value={result.forfaitairSchulden} negative fc={fc} />
              <CalcRow label="Voordeel uit sparen en beleggen" value={result.voordeelUitSparen} bold fc={fc} />
              <div className="h-px bg-[var(--border-ed)]" />
              <CalcRow
                label="Rendementsgrondslag"
                value={result.rendementsgrondslag}
                tooltip={BOX3_TOOLTIPS.rendementsgrondslag}
                fc={fc}
              />
              <CalcRow
                label={`Heffingsvrij vermogen (${result.hasPartner ? 'partner' : 'single'})`}
                value={result.heffingsvrijVermogen}
                negative
                tooltip={BOX3_TOOLTIPS.heffingsvrijVermogen}
                fc={fc}
              />
              <CalcRow label="Grondslag sparen en beleggen" value={result.grondslagSparen} fc={fc} />
              <CalcRow label="Effectief rendement" pct={result.effectiefRendement} fc={fc} />
              <CalcRow label="Box 3 inkomen" value={result.box3Income} fc={fc} />
              <CalcRow label={`Tarief ${formatPct(result.params.tarief)}`} fc={fc} />
              <div className="h-px bg-[var(--border-ed)]" />
              <CalcRow label="Box 3 belasting" value={result.tax} bold highlight fc={fc} />
            </div>
          </div>
        )}

        {/* 3b — Hoe is je vermogen ingedeeld? (asset/schuld-classificatie) */}
        <button
          type="button"
          onClick={() => setShowClassificatie((s) => !s)}
          aria-expanded={showClassificatie}
          className="flex w-full items-center justify-between border-t border-[var(--border-ed)] p-4 sm:px-5 hover:bg-[var(--subtle)] transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <Layers className="h-4 w-4 text-violet-600" aria-hidden="true" />
            Hoe is je vermogen ingedeeld?
          </span>
          {showClassificatie ? (
            <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
          )}
        </button>
        {showClassificatie && (
          <div className="border-t border-[var(--border-ed)] px-4 py-4 sm:px-5 space-y-2">
            {result.assetClassifications.map((ac, i) => (
              <ClassRow
                key={`a-${i}`}
                name={ac.asset.name}
                amount={Number(ac.asset.current_value)}
                categoryLabel={
                  ac.category === 'spaargeld'
                    ? 'Spaargeld'
                    : ac.category === 'beleggingen'
                      ? 'Beleggingen'
                      : 'Uitgesloten (Box 1/2)'
                }
                dotClass={
                  ac.category === 'spaargeld'
                    ? 'bg-sky-500'
                    : ac.category === 'beleggingen'
                      ? 'bg-amber-500'
                      : 'bg-[var(--ink-4)]'
                }
                muted={ac.category === null}
                fc={fc}
              />
            ))}
            {result.debtClassifications.length > 0 && (
              <>
                <div className="pt-2 text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]">
                  Schulden
                </div>
                {result.debtClassifications.map((dc, i) => (
                  <ClassRow
                    key={`d-${i}`}
                    name={dc.debt.name}
                    amount={Number(dc.debt.current_balance)}
                    categoryLabel={dc.inBox3 ? 'Box 3' : 'Uitgesloten'}
                    dotClass={dc.inBox3 ? 'bg-rose-500' : 'bg-[var(--ink-4)]'}
                    muted={!dc.inBox3}
                    fc={fc}
                  />
                ))}
              </>
            )}
          </div>
        )}

        {/* 3a — Partner-optimalisatie (alleen household + besparing > 0) */}
        {showPartnerOptim && optimal && (
          <div className="border-t border-emerald-200 bg-emerald-50/50 px-4 py-4 sm:px-5">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-emerald-700" aria-hidden="true" />
              <span className="text-sm font-semibold text-emerald-800">
                Partner-optimalisatie
              </span>
            </div>
            <p className="text-xs text-[var(--ink-2)] leading-snug">
              Door je Box 3-vermogen fiscaal optimaal over jou en je partner te
              verdelen bespaar je{' '}
              <strong className="text-emerald-700">{fc(optimal.savingsVsEqual)}</strong>{' '}
              per jaar
              {dailyExpenses > 0 && (
                <> — zo&apos;n {Math.round(optimal.savingsVsEqual / dailyExpenses)} vrijheidsdagen</>
              )}
              {' '}t.o.v. een 50/50-verdeling.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

function ClassRow({
  name,
  amount,
  categoryLabel,
  dotClass,
  muted,
  fc,
}: {
  name: string
  amount: number
  categoryLabel: string
  dotClass: string
  muted?: boolean
  fc: (v: number) => string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 min-w-0">
        <span className={`h-2 w-2 rounded-full shrink-0 ${dotClass}`} aria-hidden="true" />
        <span className={`text-xs truncate ${muted ? 'text-[var(--ink-3)]' : 'text-[var(--ink-2)]'}`}>
          {name}
        </span>
      </span>
      <span className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
          {categoryLabel}
        </span>
        <span className="text-xs font-mono tabular-nums text-[var(--ink-2)]">
          {fc(amount)}
        </span>
      </span>
    </div>
  )
}
