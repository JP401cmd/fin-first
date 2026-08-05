'use client'

import { useMemo, useState } from 'react'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { ScenarioCallout, OrnamentColophon } from '@/components/editorial'
import { BesprekMetWillButton } from '@/components/app/chat/bespreek-met-fin-button'
import { OPTIMIZER_DISCLAIMER, OPTIMIZER_DISCLAIMER_SHORT } from '@/lib/tax-optimizer/compliance'
import { DEFAULT_RETURN, EXPECTED_SAVINGS_RETURN } from '@/lib/constants'
import type { OptimizerCurrentStanding } from '@/lib/tax-optimizer'
import type { GoalSection, OptimizerTopChoice } from '@/lib/tax-optimizer/types'
import type { TaxYear } from '@/lib/box3-data'
import { OptimizerStanding } from './optimizer-standing'
import { OptimizerCompare } from './optimizer-compare'
import { OptimizerDetails } from './optimizer-details'
import {
  buildOpportunities,
  findWinner,
  sortOpportunities,
  type SortMode,
} from './optimizer-model'

const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

/** Percentage in NL-notatie uit een fractie (0,07 → "7,0%"). */
function fractionPct(fraction: number, digits = 1): string {
  return `${(fraction * 100).toLocaleString('nl-NL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`
}

/** In-page scroll; respecteert prefers-reduced-motion (dan instant i.p.v.
 *  smooth). No-op buiten de browser of waar scrollIntoView ontbreekt (jsdom). */
function scrollToId(id: string) {
  if (typeof document === 'undefined') return
  const el = document.getElementById(id)
  if (el && typeof el.scrollIntoView === 'function') {
    const reduceMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }
}

/**
 * Box3OptimizerClient — het oppervlak van de fiscale optimizer, in vier
 * katernen: waar je nu staat (I), de vergelijking (II), inzoomen per kans (III)
 * en de voetnoten (IV). Vergelijken komt eerst; het detail volgt op aanvraag.
 *
 * De scenario-generatie, de ranking, de netto-effect-velden en de topkans komen
 * server-side uit `lib/tax-optimizer` (die op zijn beurt de canonieke Box 3-/
 * Box 1-motoren consumeert). Deze component rendert die data puur: sorteren en
 * filteren gebeurt op geleverde velden — geen enkele herberekening.
 *
 * Wft: alles wordt geframed als doorgerekend scenario/kans, met één
 * "Indicatie, geen advies"-callout onder de vergelijking. Nooit imperatief.
 */
export function Box3OptimizerClient({
  sections,
  topChoice = null,
  standing,
  hasPartner,
  perspectiveAware = false,
  year = 2026,
}: {
  sections: GoalSection[]
  topChoice?: OptimizerTopChoice | null
  /** De huidige situatie (buildCurrentStanding) — de referentie van katern I. */
  standing: OptimizerCurrentStanding
  hasPartner: boolean
  perspectiveAware?: boolean
  year?: TaxYear
}) {
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)

  const [sortMode, setSortMode] = useState<SortMode>('netto')
  const [openId, setOpenId] = useState<string | null>(null)

  const { baseline, opportunities } = useMemo(() => buildOpportunities(sections), [sections])
  const sorted = useMemo(
    () => sortOpportunities(opportunities, sortMode),
    [opportunities, sortMode],
  )
  const winner = useMemo(() => findWinner(sorted, topChoice), [sorted, topChoice])

  const jaarruimteSection = sections.find(
    (s): s is Extract<GoalSection, { kind: 'jaarruimte' }> => s.kind === 'jaarruimte',
  )
  const previewSection = sections.find(
    (s): s is Extract<GoalSection, { kind: 'preview' }> => s.kind === 'preview',
  )

  const openDetail = (id: string) => {
    setOpenId(id)
    scrollToId(`optimizer-detail-${id}`)
  }
  const toggleDetail = (id: string) => {
    setOpenId((current) => (current === id ? null : id))
  }

  return (
    <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6 sm:pb-20">
      {/* ── Aannames waarop de vergelijking rust (bewerkbaar volgt later) ── */}
      <div className="mb-9 flex flex-wrap gap-2">
        <AannameChip label="verwacht rendement beleggen" value={fractionPct(DEFAULT_RETURN)} />
        <AannameChip label="spaarrente-aanname" value={fractionPct(EXPECTED_SAVINGS_RETURN)} />
        <AannameChip label="belastingjaar" value={String(year)} />
      </div>

      {/* ── Katern I ────────────────────────────────────────────────── */}
      <OptimizerStanding
        standing={standing}
        year={year}
        perspectiveAware={perspectiveAware}
        fc={fc}
      />

      <hr className="my-11 border-t border-[var(--border-ed)]" />

      {/* ── Katern II ───────────────────────────────────────────────── */}
      {opportunities.length === 0 ? (
        <GeenKansen hasPartner={hasPartner} />
      ) : (
        <>
          <OptimizerCompare
            baseline={baseline}
            opportunities={sorted}
            winner={winner}
            sortMode={sortMode}
            onSortModeChange={setSortMode}
            onOpenDetail={openDetail}
            fc={fc}
            year={year}
          />
          {/* Fallback hangt aan de SERVER-waarheid (topChoice), niet aan de
              gefilterde weergave: in de stand "zonder rendementsverlies" kan de
              winnaar uit `sorted` wegvallen terwijl er wél een kans bestaat. */}
          {!topChoice && (
            <div className="mt-6 border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5">
              <p
                className="max-w-[60ch] text-sm italic leading-snug text-[var(--ink-2)]"
                style={{ fontFamily: SOURCE_SERIF }}
              >
                Er springt nu geen kans uit die per saldo vrijheid oplevert. Dat kan goed nieuws
                zijn — je zit fiscaal al gunstig. Wil je toch samen kijken waar ruimte ligt?
              </p>
              <div className="mt-4">
                <BesprekMetWillButton
                  onderwerp="Mijn fiscale situatie"
                  detail="Er is nu geen doorgerekende kans die per saldo voordeel oplevert in de optimizer."
                  vraag="Waar liggen voor mij nog fiscale kansen om vrijheid terug te kopen?"
                />
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-6">
        <ScenarioCallout title={OPTIMIZER_DISCLAIMER_SHORT}>
          {' ' + OPTIMIZER_DISCLAIMER}
        </ScenarioCallout>
      </div>

      <hr className="my-11 border-t border-[var(--border-ed)]" />

      {/* ── Katern III ──────────────────────────────────────────────── */}
      <OptimizerDetails
        opportunities={sorted}
        jaarruimteSection={jaarruimteSection}
        openId={openId}
        onToggle={toggleDetail}
        fc={fc}
        year={year}
      />

      {/* ── Katern IV: voetnoten ────────────────────────────────────── */}
      <div className="mt-14 grid grid-cols-2 gap-6 border-t-4 border-double border-[var(--ink)] pt-6 md:grid-cols-4">
        <FooterNote kicker="Aannames">
          Verwacht rendement beleggen {fractionPct(DEFAULT_RETURN)}, spaarrente-aanname{' '}
          {fractionPct(EXPECTED_SAVINGS_RETURN)}, belastingjaar {year}. De vergelijking rekent
          met deze uitgangspunten.
        </FooterNote>
        <FooterNote kicker="Methode">
          Elke heffing komt uit de canonieke Box 3-motor; de jaarruimte-besparing is
          marginaal-correct via de Box 1-motor. Geen eigen sommen op deze pagina.
        </FooterNote>
        <FooterNote kicker="Binnenkort">
          {previewSection?.previewNote ??
            'Laagste belastingdruk over je hele leven: onttrekkingsvolgordes over spaargeld, beleggingen, pensioen en lijfrente. Nog niet doorgerekend.'}
        </FooterNote>
        <FooterNote kicker="Geen advies">{OPTIMIZER_DISCLAIMER}</FooterNote>
      </div>

      <div className="mt-10">
        <OrnamentColophon text="Fiscale optimizer" module="Belasting" />
      </div>
    </section>
  )
}

/** Read-only aanname-chip. Bewerkbaar maken volgt in een volgende fase. */
function AannameChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--ink-2)]">
      {label}
      <b className="font-medium tabular-nums text-[var(--ink)]">{value}</b>
    </span>
  )
}

function FooterNote({ kicker, children }: { kicker: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.20em] text-[var(--ink-3)]">
        {kicker}
      </div>
      <p className="text-[12px] leading-relaxed text-[var(--ink-2)]">{children}</p>
    </div>
  )
}

/** Geen enkele doorgerekende kans: neutraal, zonder groene bedragen. */
function GeenKansen({ hasPartner }: { hasPartner: boolean }) {
  return (
    <section id="optimizer-vergelijking" className="scroll-mt-24">
      <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <p
          className="mx-auto max-w-[54ch] text-center text-base italic leading-snug text-[var(--ink-2)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          Op dit moment vinden we geen scenario dat je Box 3-heffing verlaagt. Dat kan goed nieuws
          zijn — je zit fiscaal al gunstig
          {hasPartner ? '' : ', of je vermogen valt (nog) onder het heffingsvrije vermogen'}.
        </p>
        <div className="mt-5 flex justify-center">
          <BesprekMetWillButton
            onderwerp="Mijn fiscale situatie"
            detail="Er is nu geen doorgerekende directe besparingskans in de optimizer."
            vraag="Waar liggen voor mij nog fiscale kansen om vrijheid terug te kopen?"
          />
        </div>
      </div>
    </section>
  )
}
