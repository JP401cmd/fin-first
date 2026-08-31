'use client'

import { useState } from 'react'
import { Clock, Scale } from 'lucide-react'
import { GepaardeStaven } from './gepaarde-staven'
import { Box3SectionHeader } from './box3-section-header'
import { AandachtspuntActieButton } from './aandachtspunt-actie-button'
import { ScenarioCallout } from '@/components/editorial'
import { GlossaryTerm } from '@/components/editorial/glossary-term'
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

// Bereik van de rendement-schuif. Als benoemde constanten omdat de beginstand
// erop gesnapt en erin geklemd moet worden — geen losse getallen in de JSX.
const SLIDER_MIN = -5
const SLIDER_MAX = 12
const SLIDER_STEP = 0.5

function formatPct1(value: number): string {
  return value.toFixed(1).replace('.', ',') + '%'
}

/** Bereikgrens onder de schuif: heel getal, typografisch minteken (−, geen -). */
function formatPctBound(value: number): string {
  return `${value}%`.replace('-', '−')
}

/**
 * Beginstand van de schuif = het omslagpunt van DEZE portefeuille (M24).
 *
 * De oude beginwaarde was een harde `2` — een magic number dat nergens uit de
 * app kwam. Omdat het omslagpunt per spaar/beleg-mix ergens anders ligt, gaf
 * diezelfde 2,0% op de ene portefeuille "bespaart €X" en op de andere "levert
 * niets op". We consumeren nu `omslagRendementPct` uit de canonieke engine
 * (nooit de formule hier herhalen); die waarde hangt níét af van het ingevoerde
 * rendement, dus we mogen 'm met een willekeurig pct uitlezen.
 *
 * Naar BOVEN gesnapt op de sliderstap, en dus op/boven het omslagpunt: zo zet
 * de standaardstand nooit ongevraagd een besparings-CTA met €-bedrag klaar op
 * een aanname die de gebruiker niet zelf koos. Schuiven naar links laat direct
 * zien wat tegenbewijs wél oplevert.
 */
function initialRendementPct(result: Box3Result): number {
  const { omslagRendementPct } = compareForfaitairVsWerkelijk({
    box3Result: result,
    werkelijkRendementPct: 0,
  })
  const gesnapt = Math.ceil(omslagRendementPct / SLIDER_STEP) * SLIDER_STEP
  return Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, gesnapt))
}

export function Box3TegenbewijsCard({
  result,
  rateFootnote = null,
  embedded = false,
}: {
  result: Box3Result
  /**
   * Grondslag-voetnoot bij het vrijheidsdagen-getal ("Tegen je dagtarief van
   * €X per dag — …"), al samengesteld door de ouder via
   * `formatFreedomRateFootnote` (M22). Wordt DOORGEGEVEN en niet hier berekend:
   * `Box3Result` draagt wel `dailyExpenses` maar géén `dailyExpensesSource`,
   * dus de kaart kan niet weten of het dagtarief uit transacties of uit een
   * profielschatting komt — die zou ze dus moeten gokken. De ouder heeft de
   * bron wél en levert daarmee dezelfde string als de rest van het katern.
   * `null` = geen eerlijke dagbasis of gemaskeerd → geen voetnoot.
   */
  rateFootnote?: string | null
  /**
   * `true` = de kaart wordt in een omhulsel gerenderd dat de kop al draagt
   * (`DepthSection` in Eenvoudig, UR2-16d). Dan vervallen de eigen katern-rand,
   * -padding en `Box3SectionHeader`; anders zou de gebruiker twee koppen en een
   * dubbele rand zien. Standaard `false` = de bestaande, ongewijzigde
   * katern-vorm voor de volledige weergave.
   */
  embedded?: boolean
}) {
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)
  const [rendementPct, setRendementPct] = useState(() => initialRendementPct(result))

  const cmp = compareForfaitairVsWerkelijk({
    box3Result: result,
    werkelijkRendementPct: rendementPct,
  })

  const werkelijkIsGunstig = cmp.gunstigste === 'werkelijk' && cmp.besparing > 0
  const freedom = calculateFreedomTime(cmp.besparing, result.dailyExpenses)

  return (
    <div className={embedded ? '' : 'border-t border-[var(--ink)] px-4 py-5 sm:px-7'}>
      {!embedded && (
        <Box3SectionHeader num="3.2">
          <span className="inline-flex items-center gap-1.5">
            <Scale className="h-3.5 w-3.5" style={{ color: ACCENT_700 }} aria-hidden="true" />
            Tegenbewijs-simulator
          </span>
        </Box3SectionHeader>
      )}
      <p
        className="mb-4 text-sm italic leading-snug text-[var(--ink-2)]"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        {/* S17: wettelijke term blijft staan, mét uitleg ter plekke. Bewust
            beschrijvend geformuleerd ("dan mag je … en wordt er geheven"), niet
            in de gebiedende wijs — een opdracht om een fiscale regeling in te
            roepen is advies, geen inzicht (Wft-grens). */}
        Was je werkelijke rendement lager dan het forfait? Dan mag je{' '}
        <GlossaryTerm term="tegenbewijs">tegenbewijs</GlossaryTerm> leveren en
        wordt er over het werkelijke rendement geheven. De schuif start op
        jouw omslagpunt — schuif om je eigen rendement te kiezen.
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
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={SLIDER_STEP}
          value={rendementPct}
          onChange={(e) => setRendementPct(Number(e.target.value))}
          className="w-full accent-[var(--module-active-500)]"
          aria-valuetext={`${formatPct1(rendementPct)} werkelijk rendement`}
        />
        <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-[var(--ink-4)]">
          <span>{formatPctBound(SLIDER_MIN)}</span>
          <span>{formatPctBound(SLIDER_MAX)}</span>
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

      {/* Verdict — uniform ScenarioCallout (linker module-border) i.p.v. vol kader.
          Beide takken openen met het gekozen percentage (M24): het oordeel is
          altijd het oordeel BIJ een rendement, nooit een losse conclusie. */}
      <ScenarioCallout className="mt-4">
        {werkelijkIsGunstig ? (
          <p
            data-testid="tegenbewijs-verdict"
            className="text-base italic leading-snug text-[var(--ink)]"
            style={{ fontFamily: SOURCE_SERIF }}
          >
            Bij een rendement van <span className="not-italic font-mono tabular-nums font-semibold">
              {formatPct1(rendementPct)}
            </span>{' '}
            is je werkelijke rendement lager dan het forfait — tegenbewijs bespaart{' '}
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
            data-testid="tegenbewijs-verdict"
            className="text-base italic leading-snug text-[var(--ink-2)]"
            style={{ fontFamily: SOURCE_SERIF }}
          >
            Bij een rendement van <span className="not-italic font-mono tabular-nums font-semibold text-[var(--ink)]">
              {formatPct1(rendementPct)}
            </span>{' '}
            is de <span className="not-italic font-semibold text-[var(--ink)]">forfaitaire</span>{' '}
            heffing gunstiger — tegenbewijs levert niets op.
          </p>
        )}
        {/* Grondslag bij het vrijheidsdagen-getal — zelfde regel als 1.1 en 3.5
            (M22). Alleen tonen wanneer er hierboven daadwerkelijk een tijdregel
            staat; anders voetnoot je iets dat er niet is. */}
        {werkelijkIsGunstig && !masked && cmp.freedomDays >= 0.5 && rateFootnote && (
          <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-[var(--ink-3)]">
            {rateFootnote}
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
