'use client'

import { useState, useEffect } from 'react'
import { Calculator, ChevronDown, ChevronUp, Clock, Info, Building2, AlertTriangle } from 'lucide-react'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { BOX2_TOOLTIPS, type Box2Result } from '@/lib/box2-data'
import { usePerspective } from '@/components/app/perspective-provider'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import { Kicker } from '@/components/editorial'
import { Box2GecombineerdeDruk } from '@/components/overview/belasting/box2-gecombineerde-druk'
import { Box2DividendSimulator } from '@/components/overview/belasting/box2-dividend-simulator'
import { Box2Leengrens } from '@/components/overview/belasting/box2-leengrens'

const PLAYFAIR = 'var(--font-display, var(--font-playfair, Georgia, serif))'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'
/** Box 2-accent (violet) — alléén ter onderscheiding van de drie boxen. */
const BOX2_ACCENT = 'var(--color-violet-600, #7c3aed)'

/**
 * Box2Detail — compacte Box 2-sectie (aanmerkelijk belang / DGA) op de
 * Box 2-subpagina /overzicht/belasting/box2. Wordt door de pagina alléén
 * gerenderd wanneer er daadwerkelijk aanmerkelijk belang is (server-side
 * bepaald). Box 2 is per-persoon: in de partner-view tonen we het Box 2-
 * resultaat van de partner, anders het eigen resultaat.
 *
 * Databron blijft het bestaande /api/household/box2-endpoint (per-persoon AB/
 * DGA, pure engine lib/box2-data.ts — geen logica-duplicatie). We herhalen de
 * fetch op een in-sessie perspectief-wissel en selecteren de juiste persoon.
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

/**
 * Selecteer het Box 2-resultaat voor het gevraagde perspectief.
 * - personal/household → eigen resultaat (single: personal; household: eigen entry).
 * - partner            → het Box 2-resultaat van de partner.
 */
function selectForPerspective(
  data: Box2ApiResponse,
  perspective: 'personal' | 'household' | 'partner',
): Box2Result | null {
  if (perspective === 'partner') {
    return data.partners?.find((p) => !p.isCurrentUser)?.result ?? null
  }
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
        className="ml-1 inline-flex h-4 w-4 items-center justify-center bg-[var(--subtle)] text-[var(--ink-3)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-violet-600,#7c3aed)_14%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        aria-label="Meer informatie"
      >
        <Info className="h-3 w-3" />
      </button>
      {open && (
        <span
          className="absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 border border-[var(--ink)] bg-[var(--paper)] p-3 text-xs leading-snug text-[var(--ink-2)] shadow-[0_2px_0_var(--ink)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          {text}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[var(--ink)]" />
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
  const rowInner = (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className={`text-xs text-[var(--ink-2)] ${bold ? 'font-semibold text-[var(--ink)]' : ''}`}>
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </span>
      {(value != null || pct != null) && (
        <span className={`font-mono text-xs tabular-nums ${bold ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}>
          {pct != null ? formatPct(pct) : value != null ? fc(value) : ''}
        </span>
      )}
    </div>
  )

  // Highlight-rij = eindresultaat: scherp violet-getint kader met linker-accent.
  if (highlight) {
    return (
      <div
        className="-mx-2 px-3 py-1.5"
        style={{
          background: 'color-mix(in srgb, var(--color-violet-600, #7c3aed) 8%, transparent)',
          borderLeft: '3px solid var(--color-violet-600, #7c3aed)',
        }}
      >
        {rowInner}
      </div>
    )
  }
  return rowInner
}

export function Box2Detail({ year = 2026 }: { year?: number }) {
  const { perspective, perspectiveVersion } = usePerspective()
  const [result, setResult] = useState<Box2Result | null>(null)
  const [loading, setLoading] = useState(true)
  const [showDetails, setShowDetails] = useState(false)
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)
  // Entree-reveal — ingehouden fade/translate, respecteert prefers-reduced-motion.
  const { ref: revealRef, hasEntered } = useInViewAnimation({ duration: 600 })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/household/box2?year=${year}`)
      .then((r) => r.json())
      .then((data: Box2ApiResponse) => {
        if (!cancelled) setResult(selectForPerspective(data, perspective))
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
    // Herhaal op perspectief-wissel zodat partner-view het partner-resultaat toont.
  }, [year, perspective, perspectiveVersion])

  if (loading) {
    return (
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-8">
        <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-5 animate-pulse">
          <div className="mb-3 h-3 w-40 bg-[var(--subtle)]" />
          <div className="h-9 w-36 bg-[var(--subtle)]" />
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
      <div
        ref={revealRef}
        className="overflow-hidden border border-[var(--ink)] bg-[var(--paper)] transition-all duration-700 ease-out"
        style={{
          opacity: hasEntered ? 1 : 0,
          transform: hasEntered ? 'translateY(0)' : 'translateY(12px)',
        }}
      >
        {/* Box 2-accent: 3px violet strip ter onderscheiding van de drie boxen */}
        <div aria-hidden className="h-[3px] w-full" style={{ background: BOX2_ACCENT }} />

        {/* Samenvatting — privé. Eén hero-getal (Playfair) → context → detail. */}
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Kicker>Box 2 — aanmerkelijk belang {result.year} · privé</Kicker>
            <PerspectiveContextLabel />
          </div>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              className="text-[34px] sm:text-[44px] font-black leading-none tracking-[-0.02em] tabular-nums text-[var(--ink)]"
              style={{ fontFamily: PLAYFAIR }}
            >
              {fc(result.totalTaxInclDga)}
            </span>
            <span className="text-xs font-mono uppercase tracking-[0.12em] text-[var(--ink-3)]">per jaar</span>
          </div>
          {result.freedomDays > 0 && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-3)]">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {result.freedomDays} vrijheidsdagen
            </div>
          )}
          <p
            className="mt-3 max-w-[58ch] border-l-2 pl-3.5 text-sm italic leading-snug text-[var(--ink-2)]"
            style={{ fontFamily: 'var(--font-serif, Georgia, serif)', borderColor: BOX2_ACCENT }}
          >
            Belasting in privé over dividend + vervreemdingswinst uit je
            aanmerkelijk belang (≥ 5%-deelneming).
          </p>
        </div>

        {/* DGA-waarschuwing — status amber, scherp kader */}
        {hasDga && (
          <div className="mx-5 sm:mx-6 mb-2 flex items-start gap-2 border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-snug text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Je leent meer dan{' '}
              <span className="font-mono tabular-nums font-semibold">{fc(result.dgaLeningenDrempel)}</span>{' '}
              van je BV. Over het bovenmatige deel (
              <span className="font-mono tabular-nums font-semibold">{fc(result.dgaLeningenExcess)}</span>
              ) betaal je extra Box 2-heffing:{' '}
              <span className="font-mono tabular-nums font-semibold">{fc(result.dgaExcessTax)}</span>.
            </span>
          </div>
        )}

        {/* Uitklapbare berekening — tap-target ≥44px */}
        <button
          type="button"
          onClick={() => setShowDetails((s) => !s)}
          aria-expanded={showDetails}
          className="flex min-h-[52px] w-full items-center justify-between border-t border-[var(--ink)] px-5 py-3.5 sm:px-6 transition-colors hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ink)]"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <Calculator className="h-4 w-4" style={{ color: BOX2_ACCENT }} aria-hidden="true" />
            Berekeningsstappen
          </span>
          {showDetails ? (
            <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
          )}
        </button>
        {showDetails && (
          <div className="border-t border-[var(--ink)] px-5 py-5 sm:px-6 space-y-2.5">
            <Row label="Dividend" value={result.totalDividend} tooltip={BOX2_TOOLTIPS.dividend} fc={fc} />
            <Row label="Vervreemdingswinst" value={result.totalDisposalGain} tooltip={BOX2_TOOLTIPS.vervreemdingswinst} fc={fc} />
            <Row label="Totaal Box 2-inkomen" value={result.totalIncome} bold fc={fc} />
            <div className="h-px bg-[var(--rule-soft)]" />
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
            <div className="h-px bg-[var(--rule-soft)]" />
            <Row label="Totaal Box 2 (incl. DGA)" value={result.totalTaxInclDga} bold highlight fc={fc} />
          </div>
        )}

        {/* Per-deelneming */}
        {result.perDeelneming.length > 0 && (
          <div className="border-t border-[var(--ink)] px-5 py-4 sm:px-6">
            <Kicker className="mb-3" size="small">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3 w-3" aria-hidden="true" />
                Per deelneming
              </span>
            </Kicker>
            <div className="space-y-2">
              {result.perDeelneming.map((d, i) => (
                <div key={i} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-[var(--ink-2)]">{d.name}</span>
                  <span className="shrink-0 font-mono tabular-nums text-[var(--ink-2)]">
                    {fc(d.totalIncome)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 2.4 — Excessief-lenen danger-gauge (alleen bij DGA-leningen) */}
        {result.dgaLeningenTotal > 0 && (
          <Box2Leengrens result={result} fc={fc} />
        )}

        {/* 2.2 — Dividend-schijf simulator */}
        <Box2DividendSimulator
          year={result.year}
          hasPartner={result.hasPartner}
          dailyExpenses={result.dailyExpenses}
        />

        {/* 2.1 — Gecombineerde druk Vpb + Box 2 (educatief) */}
        <Box2GecombineerdeDruk />
      </div>
    </section>
  )
}
