'use client'

/**
 * LeverageCard — gedeelde hefboom-kaart-shell. Geëxtraheerd uit HefbomenNav
 * (components/overview/overzicht-hero/hefbomen-nav.tsx) zodat de vier-hefbomen-
 * rij op /overzicht, de cashflow-landingskaarten op /overzicht/cashflow, de
 * box-kaarten op /overzicht/belasting en de nav-kaarten op /toekomst exact
 * hetzelfde uiterlijk delen en niet uit-sync raken.
 *
 * ══ De regel die deze shell afdwingt (S1 · richtingsbesluit R5) ═══════════
 *
 *   **Een status draagt altijd een woord; kleur is nooit de enige drager.**
 *
 * "Duiding boven reductie": Eenvoudig toont niet MÍNDER, het toont
 * BEGRIJPELIJKER. Een beginner leest "Hoge schuldenlast" sneller dan
 * "€ 368.270". Daarom is de kaal-gereduceerde tegel (alleen hoofdcijfer +
 * gekleurd puntje, OVZ-2 van 9 aug 2026) vervangen door de `verdict`-variant
 * hieronder. Die omkering is bewust en gedeeltelijk: de "excl. eigen woning"-
 * grondslagregel en de chevron/drill-down blijven wél weg in Eenvoudig — dat
 * is grondslag-detail respectievelijk diepte, geen oordeel.
 *
 * ══ Drie varianten (`variant`-prop) ═══════════════════════════════════════
 *
 *  · `full` (default) — Volledig. Icon-chip · label · KPI (serif, primair) ·
 *    `subAmount`-grondslagregel · oordeel-rij · chevron. ONGEWIJZIGD t.o.v.
 *    vóór S1; alle bestaande call-sites die niets meegeven landen hier.
 *
 *  · `verdict` — Eenvoudig mét duiding. Icon-chip · label · OORDEEL (primair,
 *    statuskleur) · bedrag (secundair, gedempt, met optioneel `kpiWindow`).
 *    Géén `subAmount`, géén chevron. Het aantal regels blijft gelijk aan
 *    `full`: het oordeel neemt de regel over die de KPI had, de KPI zakt naar
 *    de regel die `subAmount` had. De tegel wordt dus niet hoger.
 *
 *  · `compact` — one-liner: icon-chip + label (+ `subAmount`). Géén KPI,
 *    oordeel, status-dot of chevron. Voor navigatie-rijen waar de kaart puur
 *    een doorstap is.
 *
 * ══ Toegankelijkheid — ÉÉN drager, nooit twee ════════════════════════════
 *
 * De status-dot is ALTIJD decoratief (`aria-hidden`, `title` blijft als
 * hover-affordance op desktop). De toegankelijke naam van de status komt van
 * precies één plek:
 *
 *  - is er een ZICHTBAAR oordeel → dát is de drager (`full` met `subText`,
 *    en altijd in `verdict`);
 *  - is er géén zichtbaar oordeel → een `sr-only`-woord uit
 *    `LEVERAGE_STATUS_LABEL` springt bij.
 *
 * Nooit allebei: een screenreader hoort de status exact één keer. Dit is de
 * WCAG 2.2 §1.4.1-correctie — vóór S1 was de dot `aria-hidden` mét een
 * hover-only `title`, dus op touch én voor AT bestond de status niet.
 *
 * ══ Anatomie & interactie ════════════════════════════════════════════════
 *  - Kaart-shell met rounded-2xl, paper-bg, ink-border.
 *  - Heel-kaart `<Link>` (navigatie) + een sibling absolute chevron-`<button>`
 *    (uitklap-toggle) — siblings, niet genest, zodat chevron-klik niet
 *    navigeert.
 *  - Uitklap-paneel (`children`) verschijnt onderaan wanneer `expanded`, als
 *    sibling BUITEN de `<Link>`.
 *  - Accordeon-state (één kaart open per keer) leeft in de parent.
 *  - De ENIGE animatie is de chevron-rotatie (200ms) — conform de template,
 *    geen height/opacity-transitie op het paneel zelf.
 */

import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  LEVERAGE_STATUS_DOT,
  LEVERAGE_STATUS_LABEL,
  leverageStatusTextClass,
  type LeverageStatus,
} from '@/lib/leverage-status'

/**
 * Welke behandeling de kaart krijgt. Zie het blok bovenaan dit bestand voor
 * de volledige beschrijving per variant.
 *
 * Kies `verdict` overal waar de gebruiker in de EENVOUDIGE weergave zit en de
 * kaart een status draagt. Kies `compact` alleen waar de kaart geen oordeel
 * heeft (pure doorstap-navigatie) — niet als "rustiger" alternatief voor een
 * kaart die wél iets te zeggen heeft; dat is precies de reductie waar het
 * R5-richtingsbesluit tegenin gaat.
 */
export type LeverageCardVariant = 'full' | 'verdict' | 'compact'

export function LeverageCard({
  Icon,
  tint,
  label,
  kpi,
  status,
  subText,
  subAmount,
  kpiWindow,
  href,
  tooltip,
  variant = 'full',
  showSubRow = true,
  expandable = false,
  expanded = false,
  onToggleExpand,
  dataTour,
  children,
}: {
  Icon: LucideIcon
  /** Tailwind text+bg-tint voor de icon-chip, bv. 'text-sky-700 bg-sky-50'. */
  tint: string
  label: string
  /** Hoofdcijfer (al geformatteerd). Niet getoond wanneer leeg/null. */
  kpi?: string | null
  status: LeverageStatus
  /**
   * Het OORDEEL in gewone taal — "Hoge schuldenlast", "Op koers met sparen".
   * Domeinspecifieke bronnen: `lib/hefboom-status-copy.ts` (de vier hefbomen)
   * en `lib/cashflow-cards.ts` (de cashflow-kaarten). Laat 'm nooit leeg in
   * `verdict`: de shell valt dan terug op het generieke
   * `LEVERAGE_STATUS_LABEL`, en dat is een vangnet, geen ontwerp.
   *
   * `ReactNode` zodat een oordeel in de toekomst een `<GlossaryTerm>` kan
   * dragen. **Let op de HTML-grens:** deze regel rendert BÍNNEN de kaart-
   * `<Link>`, dus alles wat hier komt moet geldig zijn in een `<a>` — een
   * `<button>` (de standaard-render van `GlossaryTerm`) is dat NIET. Een
   * modus-bewuste variant die in Eenvoudig als `<span>` rendert mag hier wel;
   * de interactieve vorm hoort in `children` (de drill-down rendert buiten de
   * Link).
   */
  subText?: React.ReactNode
  /**
   * Optionele subtiele extra regel direct onder de KPI (gedempt, `--ink-3`) —
   * de "excl. eigen woning · €X"-grondslag op de bezittingen-/schulden-
   * hefboom. Alleen `full` en `compact`; in `verdict` wordt hij bewust NIET
   * gerenderd (grondslag-detail is geen oordeel en blijft in Eenvoudig weg).
   *
   * De shell beslist verder niet over de inhoud: of een regel past hangt af
   * van wat de kaart verder toont, en dat weet alleen de call-site.
   */
  subAmount?: React.ReactNode
  /**
   * Venster-label bij het bedrag ("in augustus tot nu toe") — ALLEEN in
   * `verdict`, waar het achter het gedempte bedrag op dezelfde regel komt
   * (`€ 1.240 · in augustus tot nu toe`). Bestaat omdat het bedrag in deze
   * variant naar 11px zakt: een los tweede regeltje eronder zou zwaarder
   * wegen dan het cijfer dat het duidt.
   *
   * Draagt de KPI een venster (CF-3), geef 'm dan mee — anders is niet te zien
   * of "€ 1.240" deze maand of de laatste 30 dagen is.
   */
  kpiWindow?: React.ReactNode
  href: string
  tooltip?: string
  /** Zie `LeverageCardVariant`. Default `full` → byte-identiek aan voorheen. */
  variant?: LeverageCardVariant
  /**
   * Rendert de oordeel-rij onder de KPI. Alleen van toepassing op `full` —
   * `verdict` toont het oordeel per definitie, `compact` per definitie niet.
   *
   * Default true — óók zonder `subText`, want de lege `min-h-[16px]`-
   * placeholder houdt tegels met en zonder oordeel in dezelfde rij even hoog.
   * Zet 'm op false wanneer GEEN ENKELE tegel in de rij een oordeel toont.
   * Nooit per tegel mengen — dat is precies waar de placeholder voor bestaat.
   */
  showSubRow?: boolean
  /** Toont de chevron-toggle wanneer true. */
  expandable?: boolean
  expanded?: boolean
  onToggleExpand?: () => void
  /**
   * Waarde voor `data-tour` op de kaart-root — het TARGET-CONTRACT van de
   * rondleiding op /overzicht (ADR 0130). Bewust een attribuut en geen id: de
   * kaart komt vier keer per rij voor en leeft ook op andere pagina's, en een
   * spotlight die op een class of DOM-structuur zou mikken breekt bij de
   * eerstvolgende restyling zonder dat iets rood wordt. Ongezet → geen
   * attribuut, byte-identiek aan voorheen.
   *
   * Staat op ALLE varianten (`full`, `verdict` én `compact`): in de eenvoudige
   * weergave rendert de tegel als `verdict`, en dáár moet de rondleiding het
   * even goed kunnen vinden.
   */
  dataTour?: string
  /** Uitklap-content — alleen gerenderd wanneer `expanded`. */
  children?: React.ReactNode
}) {
  if (variant === 'compact') {
    return (
      <div
        data-tour={dataTour}
        className="group relative rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-2 sm:p-3 transition-all hover:border-[var(--ink-3)] hover:shadow-sm"
      >
        {/* Op mobiel gestapeld (icoon boven label, gecentreerd) zodat drie
            compact-kaarten naast elkaar passen zonder dat "Gebeurtenissen"
            afkapt; vanaf sm de oorspronkelijke one-liner. */}
        <Link
          href={href}
          title={tooltip}
          className="flex flex-col items-center gap-1.5 text-center sm:flex-row sm:items-center sm:gap-2.5 sm:text-left"
        >
          <div
            className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${tint}`}
          >
            <Icon className="w-4 h-4" />
          </div>
          {/* `min-w-0` op de tekstkolom houdt `truncate` werkend binnen de flex-rij. */}
          <span className="min-w-0 max-w-full sm:flex-1">
            <span className="block truncate text-xs sm:text-base font-semibold text-[var(--ink)]">
              {label}
            </span>
            {/* Zelfde typografie als de subAmount-regel in de volledige tak, zodat
                het venster-label in beide weergaven hetzelfde gewicht heeft. */}
            {subAmount ? (
              <span className="block truncate text-[11px] leading-tight text-[var(--ink-3)]">
                {subAmount}
              </span>
            ) : null}
          </span>
        </Link>
      </div>
    )
  }

  const isVerdict = variant === 'verdict'

  /**
   * Het zichtbare oordeel. In `verdict` valt de shell terug op het generieke
   * statuslabel wanneer de call-site niets meegeeft — dát is de plek waar de
   * regel "een status draagt altijd een woord" structureel wordt afgedwongen
   * i.p.v. per call-site opnieuw uitgevonden.
   */
  const shownVerdict: React.ReactNode = isVerdict
    ? (subText ?? LEVERAGE_STATUS_LABEL[status])
    : showSubRow
      ? (subText ?? null)
      : null

  /**
   * Geen zichtbaar oordeel → de status heeft nog geen tekstdrager, dus springt
   * een `sr-only`-woord bij. Is er wél een zichtbaar oordeel, dan blijft dit
   * weg: twee dragers = dubbele aankondiging.
   */
  const needsScreenReaderStatus = shownVerdict == null

  return (
    <div
      data-tour={dataTour}
      className={[
        'group relative flex flex-col rounded-2xl border bg-[var(--paper)] p-3 sm:p-4 transition-all',
        expanded
          ? 'border-[var(--ink-3)] shadow-sm row-span-2 sm:row-span-1'
          : 'border-[var(--border-ed)] hover:border-[var(--ink-3)] hover:shadow-sm',
      ].join(' ')}
    >
      <Link href={href} title={tooltip} className="flex flex-col">
        {/* Status-dot: ALTIJD decoratief. De toegankelijke naam komt van het
            zichtbare oordeel, of — als dat er niet is — van de sr-only-regel
            hieronder. `title` blijft staan als hover-affordance op desktop;
            hij bereikt AT niet en telt dus niet als drager. */}
        <span
          className={`absolute right-2.5 top-2.5 sm:right-3 sm:top-3 w-2 h-2 rounded-full ${LEVERAGE_STATUS_DOT[status]}`}
          aria-hidden="true"
          title={LEVERAGE_STATUS_LABEL[status]}
        />
        {needsScreenReaderStatus && (
          <span className="sr-only">{LEVERAGE_STATUS_LABEL[status]}</span>
        )}
        <div
          className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center ${tint}`}
        >
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <div className="mt-2 text-sm sm:text-base font-semibold text-[var(--ink)]">
          {label}
        </div>

        {isVerdict ? (
          <>
            {/* Oordeel primair — neemt de regel over die de KPI in `full` had.
                Statuskleur is semantiek (stoplicht), geen module-accent; het
                WOORD draagt de betekenis ook zonder kleur. */}
            <div
              className={`mt-0.5 text-sm sm:text-base font-medium leading-snug ${leverageStatusTextClass(status)}`}
            >
              {shownVerdict}
            </div>
            {/* Bedrag secundair — gedempt, met het venster-label op dezelfde
                regel zodat het cijfer één duidende eenheid blijft. */}
            {(kpi || kpiWindow) && (
              <div className="mt-0.5 text-[11px] leading-tight text-[var(--ink-3)] tabular-nums">
                {kpi}
                {kpi && kpiWindow ? ' · ' : null}
                {kpiWindow}
              </div>
            )}
          </>
        ) : (
          <>
            {kpi && (
              <div className="mt-0.5 text-base sm:text-lg font-serif font-semibold text-[var(--ink)] tabular-nums">
                {kpi}
              </div>
            )}
            {subAmount && (
              <div className="mt-0.5 text-[11px] leading-tight text-[var(--ink-3)] tabular-nums">
                {subAmount}
              </div>
            )}
            {/* Oordeel + chevron op één rij — chevron rechts naast het oordeel
                zodat de kaart niet hoger wordt en de primaire link (heel
                kaartje) intact blijft. */}
            {showSubRow && (
              <div className="mt-1 flex items-end justify-between gap-2 min-h-[16px]">
                {shownVerdict ? (
                  <span
                    className={`text-[11px] font-medium ${leverageStatusTextClass(status)}`}
                  >
                    {shownVerdict}
                  </span>
                ) : (
                  <span />
                )}
              </div>
            )}
          </>
        )}
      </Link>

      {/* Chevron-toggle — kleine icon-only knop in rechter-onderhoek,
          absolute-gepositioneerd binnen de kaart. Kaart-klik navigeert;
          alleen chevron-klik toggelt de drill-down hieronder. */}
      {expandable && (
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          aria-label={expanded ? `Verberg detail ${label}` : `Toon detail ${label}`}
          className="absolute right-2 bottom-2 sm:right-2.5 sm:bottom-2.5 inline-flex items-center justify-center w-6 h-6 rounded-md text-[var(--ink-3)] hover:text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      )}

      {expanded && children}
    </div>
  )
}
