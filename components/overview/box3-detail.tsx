'use client'

import { useState, useEffect, useCallback } from 'react'
import { Calculator, ChevronDown, ChevronUp, Clock, Info, Layers, Users, EyeOff } from 'lucide-react'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { BOX3_TOOLTIPS, type Box3Result, type TaxYear } from '@/lib/box3-data'
import { GlossaryTerm } from '@/components/editorial/glossary-term'
import { usePerspective } from '@/components/app/perspective-provider'
import { createClient } from '@/lib/supabase/client'
import { loadPerspectiveBox3, type PerspectiveBox3Data } from '@/lib/household-tax'

/**
 * Box3Detail — compacte, inklapbare Box 3-berekening op de Box 3-subpagina
 * /overzicht/belasting/box3.
 *
 * Databron = het huishoud-fundament (`loadPerspectiveBox3` → `loadPerspectiveData`
 * → ONGEWIJZIGDE `calculateBox3`/`optimizePartnerAllocation`). Geen bespoke
 * ownership-filtering of handmatige privacy-fetch meer — dat doet de loader.
 *
 * Eerste paint komt server-side via `initialData`. Bij een in-sessie
 * perspectief-wissel herlaadt deze component via de BROWSER-client. Wordt
 * `initialData` weggelaten (legacy/tests), dan valt het terug op de oude
 * /api/household/box3-fetch zodat bestaande callers blijven werken.
 *
 * Toont, naast de eigen Box 3-belasting: berekeningsstappen, vermogens-
 * classificatie, partner-optimalisatie ("optimale verdeling spaart €X t.o.v.
 * ieder apart") en — bij een partner die niets deelt — een privacy-melding.
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

/** Genormaliseerde view-shape — gevoed door fundament óf legacy-API. */
interface Box3View {
  result: Box3Result | null
  hasHousehold: boolean
  optimalAllocation?: { totalTax: number; savingsVsEqual: number }
  dailyExpenses: number
  partnerDataHidden: boolean
  partnerName: string | null
}

/** Map de fundament-data naar de view-shape. */
function fromPerspectiveData(d: PerspectiveBox3Data): Box3View {
  return {
    result: d.personal,
    hasHousehold: d.hasHousehold,
    optimalAllocation: d.optimalAllocation,
    dailyExpenses: d.dailyExpenses,
    partnerDataHidden: d.partnerDataHidden,
    partnerName: d.partnerName,
  }
}

/** Map de legacy /api/household/box3-respons naar de view-shape. */
function fromLegacyApi(data: Box3ApiResponse): Box3View {
  return {
    result:
      data.personal ??
      data.partners?.find((p) => p.isCurrentUser)?.result ??
      null,
    hasHousehold: !!data.hasHousehold,
    optimalAllocation: data.optimalAllocation,
    dailyExpenses: data.dailyExpenses ?? 0,
    partnerDataHidden: false,
    partnerName: null,
  }
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

export function Box3Detail({
  year = 2026,
  initialData,
}: {
  year?: number
  /** Server-berekende Box 3-data (eerste paint). Weggelaten → legacy-fetch. */
  initialData?: PerspectiveBox3Data
}) {
  const { perspective, perspectiveVersion } = usePerspective()
  const [view, setView] = useState<Box3View | null>(
    initialData ? fromPerspectiveData(initialData) : null,
  )
  const [loading, setLoading] = useState(!initialData)
  const [showDetails, setShowDetails] = useState(false)
  const [showClassificatie, setShowClassificatie] = useState(false)
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)

  // Herlaad bij een in-sessie perspectief-wissel via het fundament (browser-
  // client). Slaat de eerste render over wanneer `initialData` al server-side
  // het juiste perspectief leverde.
  const reloadFromFoundation = useCallback(async () => {
    try {
      const supabase = createClient()
      const data = await loadPerspectiveBox3(supabase, perspective, year as TaxYear)
      setView(fromPerspectiveData(data))
    } catch {
      /* stil falen — behoud vorige view */
    } finally {
      setLoading(false)
    }
  }, [perspective, year])

  useEffect(() => {
    let cancelled = false

    // Pad A — prop-gevoed (fundament). Eerste render gebruikt initialData;
    // daarna herladen we alleen op een perspectief-wissel.
    if (initialData) {
      if (perspectiveVersion === 0) {
        setView(fromPerspectiveData(initialData))
        setLoading(false)
        return
      }
      reloadFromFoundation()
      return () => {
        cancelled = true
      }
    }

    // Pad B — legacy-fetch (geen initialData; bv. oude callers/tests).
    setLoading(true)
    fetch(`/api/household/box3?year=${year}`)
      .then((r) => r.json())
      .then((data: Box3ApiResponse) => {
        if (cancelled) return
        setView(fromLegacyApi(data))
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, perspectiveVersion])

  const result = view?.result ?? null

  // Partner-optimalisatie: alleen household + daadwerkelijke besparing.
  const optimal = view?.optimalAllocation
  const dailyExpenses = view?.dailyExpenses ?? 0
  const showPartnerOptim =
    !!view?.hasHousehold && !!optimal && optimal.savingsVsEqual > 0
  const partnerDataHidden = !!view?.partnerDataHidden

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

          {/* Privacy: partner deelt geen vermogen → graceful degradation. We
              tonen het eigen resultaat (single-person) + deze melding i.p.v.
              stilzwijgend een onjuist gecombineerd bedrag. */}
          {partnerDataHidden && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 text-xs text-[var(--ink-2)]">
              <EyeOff className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[var(--ink-3)]" aria-hidden="true" />
              <span>
                {view?.partnerName ?? 'Je partner'} deelt geen vermogen, dus dit
                is alleen jouw Box 3. Vraag je partner om minimaal{' '}
                <strong>totalen</strong> te delen voor een gezamenlijke
                berekening en de optimale verdeling.
              </span>
            </div>
          )}
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

        {/* Partner-optimalisatie (alleen household + besparing > 0) */}
        {showPartnerOptim && optimal && (
          <div className="border-t border-emerald-200 bg-emerald-50/50 px-4 py-4 sm:px-5">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-emerald-700" aria-hidden="true" />
              <span className="text-sm font-semibold text-emerald-800">
                Partner-optimalisatie
              </span>
            </div>
            <p className="text-sm text-[var(--ink)] leading-snug">
              Optimale verdeling spaart{' '}
              <strong className="text-emerald-700 tabular-nums">{fc(optimal.savingsVsEqual)}</strong>{' '}
              t.o.v. ieder apart
              {dailyExpenses > 0 && (
                <> — zo&apos;n {Math.round(optimal.savingsVsEqual / dailyExpenses)} vrijheidsdagen</>
              )}
              .
            </p>
            <p className="mt-1 text-xs text-[var(--ink-2)] leading-snug">
              Als fiscaal partners mag je het Box 3-vermogen onderling verdelen;
              door het slim te verdelen benut je beide heffingsvrije vermogens
              optimaal.
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
