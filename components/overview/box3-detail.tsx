'use client'

import { useState, useEffect, useCallback } from 'react'
import { Calculator, ChevronDown, ChevronUp, Clock, Layers, Users, EyeOff } from 'lucide-react'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import {
  BOX3_TOOLTIPS,
  type Box3Result,
  type TaxYear,
  type PartnerAllocation,
} from '@/lib/box3-data'
import { GlossaryTerm } from '@/components/editorial/glossary-term'
import { Kicker, HighlightMark } from '@/components/editorial'
import { InfoTooltip } from '@/components/overview/belasting/info-tooltip'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { usePerspective } from '@/components/app/perspective-provider'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import { createClient } from '@/lib/supabase/client'
import { loadPerspectiveBox3, type PerspectiveBox3Data } from '@/lib/household-tax'
import { Box3Opbouw } from '@/components/overview/belasting/box3-opbouw'
import { Box3Heffingsvrij } from '@/components/overview/belasting/box3-heffingsvrij'
import { Box3Mix } from '@/components/overview/belasting/box3-mix'
import { Box3TegenbewijsCard } from '@/components/overview/belasting/box3-tegenbewijs-card'
import { Box3PartnerSlider } from '@/components/overview/belasting/box3-partner-slider'
import { Box3Peildatum } from '@/components/overview/belasting/box3-peildatum'
import { Box3Stelsel2028 } from '@/components/overview/belasting/box3-stelsel2028'

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

// Box 3-accent (teal) + editorial fonts — functioneel, alléén ter onderscheiding.
const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

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

/**
 * Genormaliseerde view-shape — gevoed door fundament óf legacy-API.
 *
 * We dragen nu de VOLLEDIGE `optimalAllocation` (PartnerAllocation) plus het
 * gecombineerde resultaat door, zodat de partner-verdeel-slider (3.6) live de
 * totale heffing bij een gekozen verdeling kan tonen naast de optimale.
 */
interface Box3View {
  result: Box3Result | null
  hasHousehold: boolean
  /**
   * Besparing-samenvatting voor de bestaande partner-optimalisatie-melding —
   * beide databronnen leveren dit (legacy = narrow {totalTax, savingsVsEqual}).
   */
  optimalSavings?: { totalTax: number; savingsVsEqual: number }
  /**
   * Volledige optimale verdeling — nodig voor de verdeel-slider (3.6). Alleen
   * het fundament-pad levert dit; legacy laat het weg → slider verschijnt niet.
   */
  optimalAllocation?: PartnerAllocation
  /** Gecombineerd huishoud-resultaat (bron van de gezamenlijke totalen). */
  combined?: Box3Result
  dailyExpenses: number
  partnerDataHidden: boolean
  partnerName: string | null
  currentUserName: string
  year: TaxYear
}

/** Map de fundament-data naar de view-shape. */
function fromPerspectiveData(d: PerspectiveBox3Data): Box3View {
  return {
    result: d.personal,
    hasHousehold: d.hasHousehold,
    optimalSavings: d.optimalAllocation
      ? {
          totalTax: d.optimalAllocation.totalTax,
          savingsVsEqual: d.optimalAllocation.savingsVsEqual,
        }
      : undefined,
    optimalAllocation: d.optimalAllocation,
    combined: d.combined,
    dailyExpenses: d.dailyExpenses,
    partnerDataHidden: d.partnerDataHidden,
    partnerName: d.partnerName,
    currentUserName: d.currentUserName,
    year: d.year,
  }
}

/** Map de legacy /api/household/box3-respons naar de view-shape. */
function fromLegacyApi(data: Box3ApiResponse, year: TaxYear): Box3View {
  const result =
    data.personal ??
    data.partners?.find((p) => p.isCurrentUser)?.result ??
    null
  return {
    result,
    hasHousehold: !!data.hasHousehold,
    // Legacy levert de besparing-samenvatting wél (melding blijft werken)…
    optimalSavings: data.optimalAllocation,
    // …maar niet de volledige PartnerAllocation; de slider (3.6) verschijnt dan
    // niet (zie showPartnerSlider hieronder).
    optimalAllocation: undefined,
    combined: data.combined,
    dailyExpenses: data.dailyExpenses ?? 0,
    partnerDataHidden: false,
    partnerName: null,
    currentUserName: 'Jij',
    year,
  }
}

function formatPct(value: number): string {
  return (value * 100).toFixed(2) + '%'
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
      className={`flex items-center justify-between gap-3 ${
        highlight
          ? '-mx-2 px-2 py-1.5 border-l-2 border-[var(--module-active-500)] bg-[color-mix(in_srgb,var(--module-active-500)_8%,transparent)]'
          : ''
      }`}
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
  // Entrée-reveal voor het hero-cijfer (rise-in, 250ms). Respecteert
  // prefers-reduced-motion via de hook (hasEntered = true bij reduced motion).
  const { ref: heroRef, hasEntered } = useInViewAnimation({ duration: 250 })

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
        setView(fromLegacyApi(data, year as TaxYear))
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

  // Partner-optimalisatie-melding: alleen household + daadwerkelijke besparing.
  const optimalSavings = view?.optimalSavings
  const optimal = view?.optimalAllocation
  const combined = view?.combined
  const dailyExpenses = view?.dailyExpenses ?? 0
  const showPartnerOptim =
    !!view?.hasHousehold && !!optimalSavings && optimalSavings.savingsVsEqual > 0
  const partnerDataHidden = !!view?.partnerDataHidden

  // Partner-verdeel-slider (3.6): alleen household, niet bij verborgen partner-
  // data, en alleen als we de volledige optimale verdeling + gecombineerde
  // totalen hebben (fundament-pad; legacy-API levert die niet).
  const showPartnerSlider =
    !!view?.hasHousehold &&
    !partnerDataHidden &&
    !!optimal &&
    !!combined &&
    combined.totaalSpaargeld + combined.totaalBeleggingen > 0

  if (loading) {
    return (
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-8">
        <div className="border border-[var(--ink)] bg-[var(--paper)] p-5 animate-pulse">
          <div className="h-4 w-40 bg-[var(--subtle)] mb-3" />
          <div className="h-9 w-32 bg-[var(--subtle)]" />
        </div>
      </section>
    )
  }

  if (!result) return null

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-8">
      <div className="border border-[var(--ink)] bg-[var(--paper)] overflow-hidden">
        {/* Samenvatting — editorial hero met Playfair-cijfer */}
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <Kicker>Box 3 — vermogensbelasting {result.year}</Kicker>
            <PerspectiveContextLabel />
          </div>
          <div
            ref={heroRef}
            className="mt-3 flex items-baseline gap-3 flex-wrap"
            style={{
              opacity: hasEntered ? 1 : 0,
              transform: hasEntered ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 250ms ease-out, transform 250ms cubic-bezier(.22,1,.36,1)',
            }}
          >
            <span
              className="text-[40px] sm:text-[52px] font-black leading-[0.9] tracking-[-0.02em] tabular-nums text-[var(--ink)]"
              style={{ fontFamily: PLAYFAIR }}
            >
              <HighlightMark>{fc(result.tax)}</HighlightMark>
            </span>
            <span
              className="italic text-sm text-[var(--ink-3)]"
              style={{ fontFamily: SOURCE_SERIF }}
            >
              per jaar
            </span>
            {result.freedomDays > 0 && (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {result.freedomDays} vrijheidsdagen
              </span>
            )}
          </div>
          <p
            className="mt-3 max-w-[58ch] text-sm italic leading-snug text-[var(--ink-2)]"
            style={{ fontFamily: SOURCE_SERIF }}
          >
            Berekend over {fc(result.totaalSpaargeld + result.totaalBeleggingen)}{' '}
            <GlossaryTerm term="box_3">Box 3</GlossaryTerm>-vermogen met het{' '}
            <GlossaryTerm term="forfaitair_rendement">forfaitair rendement</GlossaryTerm>.
          </p>

          {/* Privacy: partner deelt geen vermogen → graceful degradation. We
              tonen het eigen resultaat (single-person) + deze melding i.p.v.
              stilzwijgend een onjuist gecombineerd bedrag. */}
          {partnerDataHidden && (
            <div className="mt-4 flex items-start gap-2 border border-[var(--ink)] border-l-4 border-l-[var(--ink-3)] bg-[var(--subtle)] px-3 py-2.5 text-xs text-[var(--ink-2)]">
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
          className="flex w-full items-center justify-between border-t border-[var(--ink)] p-4 sm:px-7 hover:bg-[var(--subtle)] transition-colors"
        >
          <span className="flex items-center gap-2.5 text-sm font-semibold text-[var(--ink)]">
            <Calculator className="h-4 w-4 text-[var(--module-active-700)]" aria-hidden="true" />
            Berekeningsstappen
          </span>
          {showDetails ? (
            <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
          )}
        </button>

        {showDetails && (
          <div className="border-t border-[var(--ink)] px-4 py-5 sm:px-7">
            <div className="space-y-3">
              <CalcRow label="Totaal spaargeld" value={result.totaalSpaargeld} fc={fc} />
              <CalcRow label="Totaal beleggingen" value={result.totaalBeleggingen} fc={fc} />
              {result.totaalUitgesloten > 0 && (
                <CalcRow label="Uitgesloten (Box 1/2)" value={result.totaalUitgesloten} muted fc={fc} />
              )}
              <div className="h-px bg-[var(--rule-soft)]" />
              <CalcRow label="Box 3 schulden" value={result.totaalBox3Schulden} fc={fc} />
              <CalcRow
                label={`Schuldendrempel (${result.hasPartner ? 'partner' : 'single'})`}
                value={result.schuldendrempel}
                muted
                tooltip={BOX3_TOOLTIPS.schuldendrempel}
                fc={fc}
              />
              <CalcRow label="Aftrekbare schulden" value={result.aftrekbareSchulden} fc={fc} />
              <div className="h-px bg-[var(--rule-soft)]" />
              <CalcRow
                label="Forfaitair rendement spaargeld"
                value={result.forfaitairSpaargeld}
                tooltip={BOX3_TOOLTIPS.forfaitairRendement}
                fc={fc}
              />
              <CalcRow label="Forfaitair rendement beleggingen" value={result.forfaitairBeleggingen} fc={fc} />
              <CalcRow label="Forfaitair rendement schulden" value={result.forfaitairSchulden} negative fc={fc} />
              <CalcRow label="Voordeel uit sparen en beleggen" value={result.voordeelUitSparen} bold fc={fc} />
              <div className="h-px bg-[var(--rule-soft)]" />
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
              <div className="h-px bg-[var(--rule-soft)]" />
              <CalcRow label="Box 3 belasting" value={result.tax} bold highlight fc={fc} />
            </div>
          </div>
        )}

        {/* 3b — Hoe is je vermogen ingedeeld? (asset/schuld-classificatie) */}
        <button
          type="button"
          onClick={() => setShowClassificatie((s) => !s)}
          aria-expanded={showClassificatie}
          className="flex w-full items-center justify-between border-t border-[var(--ink)] p-4 sm:px-7 hover:bg-[var(--subtle)] transition-colors"
        >
          <span className="flex items-center gap-2.5 text-sm font-semibold text-[var(--ink)]">
            <Layers className="h-4 w-4 text-[var(--module-active-700)]" aria-hidden="true" />
            Hoe is je vermogen ingedeeld?
          </span>
          {showClassificatie ? (
            <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
          )}
        </button>
        {showClassificatie && (
          <div className="border-t border-[var(--ink)] px-4 py-5 sm:px-7 space-y-2">
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
                    ? 'bg-[var(--module-active-500)]'
                    : ac.category === 'beleggingen'
                      ? 'bg-[color-mix(in_srgb,var(--module-active-500)_50%,transparent)]'
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
                    dotClass={dc.inBox3 ? 'bg-[var(--negative)]' : 'bg-[var(--ink-4)]'}
                    muted={!dc.inBox3}
                    fc={fc}
                  />
                ))}
              </>
            )}
          </div>
        )}

        {/* 3.1 — Forfaitaire opbouw als gestapelde staaf */}
        <Box3Opbouw result={result} fc={fc} />

        {/* 3.3 — Heffingsvrij-vermogen-gauge */}
        <Box3Heffingsvrij result={result} fc={fc} />

        {/* 3.4 — Vermogensmix spaargeld vs. beleggingen */}
        <Box3Mix result={result} />

        {/* 3.2 ★ — Tegenbewijs-simulator (werkelijk vs. forfaitair) */}
        <Box3TegenbewijsCard result={result} />

        {/* 3.6 — Partner-verdeel-slider (alleen household, volledige data) */}
        {showPartnerSlider && optimal && combined && (
          <Box3PartnerSlider
            totaalSpaargeld={combined.totaalSpaargeld}
            totaalBeleggingen={combined.totaalBeleggingen}
            totaalBox3Schulden={combined.totaalBox3Schulden}
            optimalAllocation={optimal}
            year={view!.year}
            dailyExpenses={dailyExpenses}
            currentUserName={view?.currentUserName}
            partnerName={view?.partnerName}
          />
        )}

        {/* 3.5 — Peildatum & arbitragevenster */}
        <Box3Peildatum year={result.year} />

        {/* 3.10 — Het nieuwe stelsel (beoogd 2028) */}
        <Box3Stelsel2028 />

        {/* Partner-optimalisatie (alleen household + besparing > 0) */}
        {showPartnerOptim && optimalSavings && (
          <div
            className="border-t border-[var(--ink)] px-5 py-5 sm:px-7"
            style={{
              borderLeftWidth: '4px',
              borderLeftColor: 'var(--positive)',
              background: 'color-mix(in srgb, var(--positive) 6%, transparent)',
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-[var(--positive)]" aria-hidden="true" />
              <span
                className="text-[10px] uppercase tracking-[0.20em] font-mono font-semibold text-[var(--positive)]"
              >
                Partner-optimalisatie
              </span>
            </div>
            <p
              className="text-base italic leading-snug text-[var(--ink)]"
              style={{ fontFamily: SOURCE_SERIF }}
            >
              Optimale verdeling spaart{' '}
              <strong className="not-italic font-bold text-[var(--positive)] tabular-nums font-mono">
                {fc(optimalSavings.savingsVsEqual)}
              </strong>{' '}
              t.o.v. ieder apart
              {dailyExpenses > 0 && (
                <> — zo&apos;n {Math.round(optimalSavings.savingsVsEqual / dailyExpenses)} vrijheidsdagen</>
              )}
              .
            </p>
            <p className="mt-2 text-xs text-[var(--ink-2)] leading-snug">
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
        <span className={`h-2.5 w-2.5 shrink-0 ${dotClass}`} aria-hidden="true" />
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
