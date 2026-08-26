'use client'

import { useState } from 'react'
import { Clock, Scale } from 'lucide-react'
import { GepaardeStaven } from './gepaarde-staven'
import { Box3SectionHeader } from './box3-section-header'
import { AandachtspuntActieButton } from './aandachtspunt-actie-button'
import { ScenarioCallout } from '@/components/editorial'
import { formatMaskedCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { compareForfaitairVsWerkelijk } from '@/lib/box3-tegenbewijs'
import type { Box3Result } from '@/lib/box3-data'

const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

/**
 * box3-tegenbewijs-card (3.2) ★ — Tegenbewijs-simulator.
 *
 * Sinds het Kerst-arrest mag je tegenbewijs leveren: was je WERKELIJKE
 * rendement lager dan het forfaitaire, dan hef je over het werkelijke. Met de
 * slider kies je een werkelijk rendement-% (−5%…12%); de pure engine
 * (`compareForfaitairVsWerkelijk`) rekent forfaitair vs. werkelijk door en
 * kiest de gunstigste. We tonen een gepaarde-staven-vergelijking, een verdict
 * + besparing in euro en vrijheidsdagen, en het omslag-rendement.
 *
 * Werkt op het reeds perspectief-correcte `result`. Privacy-bewust via
 * formatMaskedCurrency.
 */

// Box-accent via de actieve module-context. De gunstigste/werkelijke staaf
// krijgt de vollere 600-stop, de forfaitaire de lichtere 400-stop. De
// werkelijke besparing blijft semantisch (--positive), nooit box-kleur.
const ACCENT_STRONG = 'var(--module-active-600)'
const ACCENT_SOFT = 'var(--module-active-400)'
const ACCENT_700 = 'var(--module-active-700)'

function formatPct1(value: number): string {
  return value.toFixed(1).replace('.', ',') + '%'
}

export function Box3TegenbewijsCard({ result }: { result: Box3Result }) {
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)
  const [rendementPct, setRendementPct] = useState(2)

  const cmp = compareForfaitairVsWerkelijk({
    box3Result: result,
    werkelijkRendementPct: rendementPct,
  })

  const werkelijkIsGunstig = cmp.gunstigste === 'werkelijk' && cmp.besparing > 0
  const freedom = calculateFreedomTime(cmp.besparing, result.dailyExpenses)

  return (
    <div className="border-t border-[var(--ink)] px-4 py-5 sm:px-7">
      <Box3SectionHeader num="3.2">
        <span className="inline-flex items-center gap-1.5">
          <Scale className="h-3.5 w-3.5" style={{ color: ACCENT_700 }} aria-hidden="true" />
          Tegenbewijs-simulator
        </span>
      </Box3SectionHeader>
      <p
        className="mb-4 text-sm italic leading-snug text-[var(--ink-2)]"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        Was je werkelijke rendement lager dan het forfait? Dan mag je tegenbewijs
        leveren en betaal je over het werkelijke rendement. Schuif om je rendement
        te kiezen.
      </p>

      {/* Slider */}
      <div className="mb-5">
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor="tegenbewijs-rendement" className="text-xs text-[var(--ink-2)]">
            Werkelijk rendement
          </label>
          <span className="font-mono tabular-nums text-lg font-semibold text-[var(--ink)]">
            {formatPct1(rendementPct)}
          </span>
        </div>
        <input
          id="tegenbewijs-rendement"
          type="range"
          min={-5}
          max={12}
          step={0.5}
          value={rendementPct}
          onChange={(e) => setRendementPct(Number(e.target.value))}
          className="w-full accent-[var(--module-active-500)]"
          aria-valuetext={`${formatPct1(rendementPct)} werkelijk rendement`}
        />
        <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-[var(--ink-4)]">
          <span>−5%</span>
          <span>12%</span>
        </div>
      </div>

      {/* Vergelijking */}
      <GepaardeStaven
        bars={[
          {
            label: 'Forfaitaire heffing',
            value: Math.round(cmp.forfaitaireHeffing),
            colorVar: ACCENT_SOFT,
            isWinner: !werkelijkIsGunstig,
          },
          {
            label: 'Heffing op werkelijk rendement',
            value: Math.round(cmp.werkelijkeHeffing),
            colorVar: ACCENT_STRONG,
            isWinner: werkelijkIsGunstig,
          },
        ]}
        format={fc}
      />

      {/* Verdict — uniform ScenarioCallout (linker module-border) i.p.v. vol kader */}
      <ScenarioCallout className="mt-4">
        {werkelijkIsGunstig ? (
          <p
            className="text-base italic leading-snug text-[var(--ink)]"
            style={{ fontFamily: SOURCE_SERIF }}
          >
            Werkelijk rendement is lager — tegenbewijs bespaart{' '}
            <span className="not-italic font-mono tabular-nums font-bold text-[var(--positive)]">
              {fc(Math.round(cmp.besparing))}
            </span>
            {!masked && cmp.freedomDays >= 0.5 && (
              <span className="inline-flex items-center gap-1 not-italic text-[var(--ink-3)]">
                {' '}
                <Clock className="h-3 w-3" aria-hidden="true" />
                {formatFreedomTimeString(freedom, 'short')} vrijheid
              </span>
            )}
            .
          </p>
        ) : (
          <p
            className="text-base italic leading-snug text-[var(--ink-2)]"
            style={{ fontFamily: SOURCE_SERIF }}
          >
            Bij dit rendement is de{' '}
            <span className="not-italic font-semibold text-[var(--ink)]">forfaitaire</span> heffing
            gunstiger — tegenbewijs levert niets op.
          </p>
        )}
        <p className="mt-1.5 text-xs text-[var(--ink-3)]">
          Omslagpunt: onder een rendement van{' '}
          <span className="font-mono tabular-nums">{formatPct1(cmp.omslagRendementPct)}</span>{' '}
          wordt tegenbewijs voordelig.
        </p>

        {/* "Voeg toe als actie" — alleen wanneer tegenbewijs daadwerkelijk loont. */}
        {werkelijkIsGunstig && (
          <div className="mt-3">
            <AandachtspuntActieButton
              id="tax:box3-tegenbewijs"
              domain="tax"
              title="Lever tegenbewijs voor Box 3"
              // H24: dode `description` verwijderd — nooit uitgelezen.
              savings={Math.round(cmp.besparing)}
              freedomDays={Math.round(cmp.freedomDays)}
              href="/overzicht/belasting/box3"
            />
          </div>
        )}
      </ScenarioCallout>

      <ScenarioCallout title="Indicatie, geen advies." className="mt-4 text-xs">
        Het werkelijke rendement omvat ook ongerealiseerde waardeontwikkeling;
        alleen werkelijke rente op Box 3-schulden is aftrekbaar.
      </ScenarioCallout>
    </div>
  )
}
