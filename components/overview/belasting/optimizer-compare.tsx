'use client'

import { useCallback, useRef, useState } from 'react'
import { SectionLabel, TogglePill, HighlightMark } from '@/components/editorial'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import {
  SORT_MODES,
  NEGATIVE_HATCH_CSS,
  shortCaveat,
  type Opportunity,
  type SortMode,
  type Dots,
} from './optimizer-model'
import type { OptimizerStrategy, TaxTrajectory } from '@/lib/tax-optimizer/types'
import type { TaxYear } from '@/lib/box3-data'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

/** Ondertekend bedrag: het teken staat los vóór het (mogelijk gemaskeerde) bedrag. */
function signed(value: number, fc: (v: number) => string): string {
  if (value === 0) return fc(0)
  return `${value > 0 ? '+ ' : '− '}${fc(Math.abs(value))}`
}

function dotsLabel(dots: Dots): string {
  return ['●', '●', '●'].map((d, i) => (i < dots ? d : '○')).join(' ')
}

/** Kwalitatieve driepunts-score: visueel als dots, voor schermlezers "n van 3". */
function DotsScore({ dots }: { dots: Dots }) {
  return (
    <>
      <span aria-hidden className="tracking-[2px] text-[var(--ink-2)]">
        {dotsLabel(dots)}
      </span>
      <span className="sr-only">{dots} van 3</span>
    </>
  )
}

/**
 * Katern II — "De vergelijking". Alle doorgerekende kansen op één as: eerst als
 * netto-effect-balken rond een nul-as, daarna als vergelijkingstabel met de
 * kansen als kolommen en "Niets doen" als eerste kolom.
 *
 * Puur presentatie: sorteren en filteren gebeurt op de GELEVERDE velden
 * (netEffect / savings / hasReturnCost) — er wordt hier niets herberekend.
 */
export function OptimizerCompare({
  baseline,
  opportunities,
  winner,
  sortMode,
  onSortModeChange,
  onOpenDetail,
  fc,
  year,
}: {
  baseline: OptimizerStrategy | null
  /** Al gesorteerd/gefilterd volgens `sortMode`. */
  opportunities: Opportunity[]
  winner: Opportunity | null
  sortMode: SortMode
  onSortModeChange: (mode: SortMode) => void
  onOpenDetail: (id: string) => void
  fc: (v: number) => string
  /** Actief belastingjaar — voedt o.a. de partnerverdeling-verloopnotitie. */
  year: TaxYear
}) {
  return (
    <section id="optimizer-vergelijking" className="scroll-mt-24">
      <SectionLabel num="II">De vergelijking</SectionLabel>
      <div className="-mt-3 mb-4">
        <h2
          className="text-[22px] sm:text-[26px] font-black leading-tight tracking-[-0.02em] text-[var(--ink)]"
          style={{ fontFamily: PLAYFAIR }}
        >
          Elke keuze op{' '}
          <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
            één
          </em>{' '}
          as
        </h2>
        <p
          className="mt-1.5 max-w-[64ch] text-sm italic leading-snug text-[var(--ink-2)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          Alle doorgerekende keuzes naast elkaar — wat ze per saldo opleveren, in euro’s én in
          vrijheidsdagen. De grootste kans staat ín de vergelijking, niet erboven.
        </p>
      </div>

      {/* Sorteerstanden — min-h-[44px]-wrapper voor een volwaardig touch-target. */}
      <div className="mb-5 flex min-h-[44px] flex-wrap items-center gap-2">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          Sorteer op
        </span>
        {SORT_MODES.map((m) => (
          <TogglePill
            key={m.id}
            on={sortMode === m.id}
            label={m.label}
            onClick={() => onSortModeChange(m.id)}
          />
        ))}
      </div>

      {opportunities.length === 0 ? (
        <p
          className="max-w-[62ch] text-sm italic leading-snug text-[var(--ink-2)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          In deze stand blijft er geen kans over. Er is nu geen keuze die je heffing verlaagt
          zónder verwacht rendement in te leveren.
        </p>
      ) : (
        <>
          <NetEffectBars
            opportunities={opportunities}
            winner={winner}
            fc={fc}
          />
          <CompareTable
            baseline={baseline}
            opportunities={opportunities}
            winner={winner}
            onOpenDetail={onOpenDetail}
            fc={fc}
            year={year}
          />
        </>
      )}
    </section>
  )
}

/**
 * Netto-effect-balken rond een nul-as: positief naar rechts (`--positive`),
 * negatief naar links in een gearceerd `--negative`-patroon. De schaal is de
 * grootste absolute netto-uitkomst — geen eigen normalisatie van bedragen.
 */
function NetEffectBars({
  opportunities,
  winner,
  fc,
}: {
  opportunities: Opportunity[]
  winner: Opportunity | null
  fc: (v: number) => string
}) {
  const maxAbs = Math.max(...opportunities.map((o) => Math.abs(o.netEffect)), 1)
  // Canonieke grafiek-animatie: balken groeien vanaf de nul-as bij intrede,
  // 700ms met 60ms stagger per rij; vóór intrede geen transition (geen flash).
  const { ref, hasEntered } = useInViewAnimation({ duration: 700 })

  return (
    <div ref={ref}>
      {opportunities.map((o, i) => {
        const isWinner = winner?.id === o.id
        const widthPct = (Math.abs(o.netEffect) / maxAbs) * 50
        const barTransition = hasEntered
          ? `width 700ms cubic-bezier(.22,1,.36,1) ${i * 60}ms`
          : 'none'
        const width = hasEntered ? `${widthPct}%` : '0%'
        const positive = o.netEffect > 0
        const amountColor = positive
          ? 'var(--positive)'
          : o.netEffect < 0
            ? 'var(--negative)'
            : 'var(--ink-2)'

        return (
          <div
            key={o.id}
            className="grid grid-cols-1 items-center gap-2 border-b border-dotted border-[var(--rule-soft)] py-3 sm:grid-cols-[minmax(150px,220px)_1fr_auto] sm:gap-4"
          >
            <div className="min-w-0">
              <span className="text-[13.5px] font-semibold leading-snug text-[var(--ink)]">
                {o.title}
              </span>
              {isWinner && (
                <span
                  className="ml-2 inline-block whitespace-nowrap border px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.12em]"
                  style={{
                    color: 'var(--positive)',
                    borderColor: 'var(--positive)',
                    background: 'color-mix(in srgb, var(--positive) 9%, transparent)',
                  }}
                >
                  grootste kans
                </span>
              )}
              {isWinner && (
                <span
                  className="mt-0.5 block text-[11.5px] italic leading-snug text-[var(--ink-3)]"
                  style={{ fontFamily: SOURCE_SERIF }}
                >
                  hoogste netto voordeel
                  {o.caveat ? ` — let op: ${shortCaveat(o.caveat)}` : ''}
                </span>
              )}
            </div>

            <div className="relative h-3 bg-[var(--subtle)]">
              <span
                aria-hidden
                className="absolute left-1/2 -top-1 -bottom-1 w-px bg-[var(--ink)]"
              />
              <span
                aria-hidden
                className="absolute top-0 bottom-0"
                style={
                  positive
                    ? {
                        left: '50%',
                        width,
                        transition: barTransition,
                        backgroundColor: 'var(--positive)',
                      }
                    : {
                        right: '50%',
                        width,
                        transition: barTransition,
                        backgroundImage: NEGATIVE_HATCH_CSS,
                      }
                }
              />
            </div>

            <div className="text-left sm:min-w-[120px] sm:text-right">
              <div
                className="font-mono text-[13px] tabular-nums"
                style={{ color: amountColor }}
              >
                {isWinner ? (
                  <HighlightMark>{signed(o.netEffect, fc)}/jr</HighlightMark>
                ) : (
                  `${signed(o.netEffect, fc)}/jr`
                )}
              </div>
              <div className="font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
                {o.netFreedomDays > 0 ? `≈ ${o.netFreedomDays} vrijheidsdagen` : 'per saldo'}
              </div>
            </div>
          </div>
        )
      })}

      <div className="mt-2 flex justify-between font-mono text-[9.5px] uppercase tracking-[0.1em] text-[var(--ink-4)]">
        <span>← kost je per saldo geld</span>
        <span>levert per saldo op →</span>
      </div>
    </div>
  )
}

/**
 * Groepskop-rij binnen de vergelijkingstabel, met optionele kop-notitie.
 *
 * `GroupRow`/`CellNote`/`Th`/`Td` zijn de gedeelde tabel-primitives van de
 * optimizer-katernen: katern II (hier) én katern IV (de levenslange varianten,
 * `optimizer-levenslang.tsx`) tekenen dezelfde vergelijkingstabel. Ze worden
 * daarom geëxporteerd i.p.v. per katern gekopieerd — één recept voor dotted
 * ritme, rechts-uitgelijnde mono-cellen en de dubbele sluitstreep.
 */
export function GroupRow({ label, span, note }: { label: string; span: number; note?: string }) {
  return (
    <tr>
      <td
        colSpan={span}
        className="border-b border-[var(--rule-soft)] pt-4 pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-[var(--ink-3)]"
      >
        {label}
        {note && (
          <span
            className="ml-2 text-[10.5px] font-normal italic normal-case tracking-normal text-[var(--ink-3)]"
            style={{ fontFamily: SOURCE_SERIF }}
          >
            {note}
          </span>
        )}
      </td>
    </tr>
  )
}

/** Celnotitie in cursieve serif onder een waarde. Gedeeld met katern IV. */
export function CellNote({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="mt-0.5 block text-[10.5px] font-normal italic normal-case tracking-normal text-[var(--ink-3)]"
      style={{ fontFamily: SOURCE_SERIF }}
    >
      {children}
    </span>
  )
}

/**
 * Eén jaar-waarde uit het verloop. Het jaartal staat visueel één keer in de
 * rijkop (2025 · 2026 · ≈ 2028); voor schermlezers herhalen we het per waarde,
 * anders leest de cel als drie losse bedragen zonder context.
 */
function YearValue({
  year,
  value,
  fc,
  approx = false,
}: {
  year: string
  value: number | null
  fc: (v: number) => string
  approx?: boolean
}) {
  return (
    <span className={`whitespace-nowrap ${approx ? 'text-[var(--ink-3)]' : ''}`}>
      <span className="sr-only">{year}: </span>
      {value === null ? '—' : `${approx ? '≈ ' : ''}${fc(value)}`}
    </span>
  )
}

/**
 * Verloop-cel: 2025 · 2026 · ≈2028 uit het GELEVERDE `trajectory`. Zonder
 * trajectory een em-streepje met de reden — de kans is dan niet over de jaren
 * doorgerekend (partnerverdeling) of speelt buiten Box 3 (jaarruimte).
 */
function TrajectoryTd({
  trajectory,
  note = null,
  fc,
  style,
}: {
  trajectory: TaxTrajectory | null
  note?: string | null
  fc: (v: number) => string
  style?: React.CSSProperties
}) {
  if (!trajectory) {
    return (
      <Td muted style={style}>
        —{note && <CellNote>{note}</CellNote>}
      </Td>
    )
  }
  return (
    <Td style={style}>
      <span className="inline-flex flex-wrap items-baseline justify-end gap-x-1.5">
        <YearValue year="2025" value={trajectory.tax2025} fc={fc} />
        <Separator />
        <YearValue year="2026" value={trajectory.tax2026} fc={fc} />
        <Separator />
        <YearValue year="2028, indicatie" value={trajectory.tax2028Indicatie} fc={fc} approx />
      </span>
    </Td>
  )
}

function Separator() {
  return (
    <span aria-hidden className="text-[var(--ink-4)]">
      ·
    </span>
  )
}

/** Waaróm een keuze geen verloop heeft — kwalitatieve tekst; het jaartal volgt
 *  het actieve belastingjaar (`year`-prop), net als de aanname-chips. */
function trajectoryNote(o: Opportunity, year: TaxYear): string | null {
  if (o.trajectory) return null
  if (o.kind === 'jaarruimte') return 'n.v.t. — deze keuze zit in Box 1'
  if (o.strategy?.kind === 'partnerverdeling') return `verdeling is voor ${year} doorgerekend`
  return null
}

const WINNER_TINT = 'color-mix(in srgb, var(--positive) 6%, transparent)'

/**
 * Vergelijkingstabel: kansen als KOLOMMEN, "Niets doen" altijd eerst.
 * Attribuutrijen zijn gegroepeerd (Belasting / Rendement / Voorwaarden) met de
 * netto-effect-rij als zwaarste rij (dubbele boekhoudkundige sluitstreep).
 */
function CompareTable({
  baseline,
  opportunities,
  winner,
  onOpenDetail,
  fc,
  year,
}: {
  baseline: OptimizerStrategy | null
  opportunities: Opportunity[]
  winner: Opportunity | null
  onOpenDetail: (id: string) => void
  fc: (v: number) => string
  year: TaxYear
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const onScroll = useCallback(() => {
    const el = scrollerRef.current
    if (el) setScrolled(el.scrollLeft > 0)
  }, [])

  const cols = opportunities.length + 2
  const baseTax = baseline?.currentTax ?? 0

  const winnerCell = (o: Opportunity) =>
    winner?.id === o.id ? { background: WINNER_TINT } : undefined

  return (
    <div className="relative mt-8">
      {!scrolled && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-2 top-2 z-[2] border border-[var(--rule-soft)] bg-[var(--paper)] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.10em] text-[var(--module-active-500)] sm:hidden"
        >
          sleep →
        </span>
      )}
      <div ref={scrollerRef} onScroll={onScroll} className="overflow-x-auto border-t border-[var(--ink)]">
        <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
          <caption className="sr-only">
            Vergelijking van de doorgerekende fiscale keuzes, met “niets doen” als referentie.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="px-0 py-3 text-left">
                <span className="sr-only">Kenmerk</span>
              </th>
              <th
                scope="col"
                className="border-b border-[var(--ink)] px-3 py-3 text-right align-bottom font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--ink-3)]"
              >
                <span
                  className="mb-0.5 block text-[12.5px] font-bold normal-case tracking-normal text-[var(--ink)]"
                  style={{ fontFamily: SOURCE_SERIF }}
                >
                  Niets doen
                </span>
                referentie
              </th>
              {opportunities.map((o) => (
                <th
                  key={o.id}
                  scope="col"
                  className="border-b border-[var(--ink)] px-3 py-3 text-right align-bottom font-mono text-[10px] font-medium uppercase tracking-[0.1em]"
                  style={{
                    ...winnerCell(o),
                    color:
                      o.boxLabel === 'Box 1'
                        ? 'var(--color-box1-700)'
                        : 'var(--color-box3-700)',
                  }}
                >
                  <span
                    className="mb-0.5 block text-[12.5px] font-bold normal-case tracking-normal text-[var(--ink)]"
                    style={{ fontFamily: SOURCE_SERIF }}
                  >
                    {o.title}
                  </span>
                  {o.boxLabel}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <GroupRow label="Belasting" span={cols} />
            <tr>
              <Th>Heffing na scenario</Th>
              <Td>{fc(baseTax)}/jr</Td>
              {opportunities.map((o) => (
                <Td key={o.id} style={winnerCell(o)}>
                  {o.optimizedTax === null ? (
                    <>
                      {fc(baseTax)}/jr
                      <CellNote>− {fc(o.savings)} in Box 1</CellNote>
                    </>
                  ) : (
                    `${fc(o.optimizedTax)}/jr`
                  )}
                </Td>
              ))}
            </tr>
            <tr>
              <Th>Bruto besparing</Th>
              <Td muted>—</Td>
              {opportunities.map((o) => (
                <Td key={o.id} style={winnerCell(o)}>
                  {fc(o.savings)}/jr
                </Td>
              ))}
            </tr>

            <GroupRow label="Rendement" span={cols} />
            <tr>
              <Th>Verwacht rendementseffect</Th>
              <Td muted>—</Td>
              {opportunities.map((o) => (
                <Td
                  key={o.id}
                  style={{
                    ...winnerCell(o),
                    color: o.returnCostEur > 0 ? 'var(--negative)' : undefined,
                  }}
                >
                  {o.returnCostEur > 0 ? `− ${fc(o.returnCostEur)}/jr` : fc(0)}
                </Td>
              ))}
            </tr>

            <tr>
              <Th className="border-b-4 border-double border-[var(--ink)] font-bold text-[var(--ink)]">
                Netto effect per jaar
              </Th>
              <Td muted className="border-b-4 border-double border-[var(--ink)] font-bold">
                {fc(0)}
              </Td>
              {opportunities.map((o) => (
                <Td
                  key={o.id}
                  className="border-b-4 border-double border-[var(--ink)] font-bold"
                  style={{
                    ...winnerCell(o),
                    color:
                      o.netEffect > 0
                        ? 'var(--positive)'
                        : o.netEffect < 0
                          ? 'var(--negative)'
                          : undefined,
                  }}
                >
                  {signed(o.netEffect, fc)}
                </Td>
              ))}
            </tr>

            {/* Verloop staat ná de netto-sluitrij: die blijft daarmee de
                zwaarste rij van het geld-deel, en het meerjarig verloop leest
                als context erna — niet als onderbreking ervóór. */}
            <GroupRow label="Verloop" span={cols} note="2028 = indicatie beoogd stelsel" />
            <tr>
              <Th>
                Heffing over de jaren
                <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
                  2025 · 2026 · ≈ 2028
                </span>
              </Th>
              <TrajectoryTd trajectory={baseline?.trajectory ?? null} fc={fc} />
              {opportunities.map((o) => (
                <TrajectoryTd
                  key={o.id}
                  trajectory={o.trajectory}
                  note={trajectoryNote(o, year)}
                  fc={fc}
                  style={winnerCell(o)}
                />
              ))}
            </tr>

            <GroupRow label="Voorwaarden" span={cols} />
            <tr>
              <Th>Vermogen blijft vrij</Th>
              <Td>
                <DotsScore dots={3} />
              </Td>
              {opportunities.map((o) => (
                <Td key={o.id} style={winnerCell(o)}>
                  <DotsScore dots={o.freedomDots} />
                  {o.freedomNote && <CellNote>{o.freedomNote}</CellNote>}
                </Td>
              ))}
            </tr>
            <tr>
              <Th>Moeite</Th>
              <Td muted>—</Td>
              {opportunities.map((o) => (
                <Td key={o.id} style={winnerCell(o)}>
                  <DotsScore dots={o.effortDots} />
                  {o.effortNote && <CellNote>{o.effortNote}</CellNote>}
                </Td>
              ))}
            </tr>
            <tr>
              <Th>
                <span className="sr-only">Uitwerking</span>
              </Th>
              <Td muted>—</Td>
              {opportunities.map((o) => (
                <Td key={o.id} style={winnerCell(o)}>
                  <button
                    type="button"
                    onClick={() => onOpenDetail(o.id)}
                    className="inline-flex min-h-[44px] items-center font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)] underline underline-offset-2 transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                  >
                    Bekijk uitwerking ↓
                  </button>
                </Td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Attribuut-rijkop (links, serif). Gedeeld met katern IV. */
export function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="row"
      className={`border-b border-dotted border-[var(--rule-soft)] py-2.5 pr-3 text-left align-top text-[12.5px] font-normal text-[var(--ink-2)] ${className}`}
      style={{ fontFamily: SOURCE_SERIF }}
    >
      {children}
    </th>
  )
}

/** Waarde-cel (rechts, mono, tabular-nums). Gedeeld met katern IV. */
export function Td({
  children,
  muted = false,
  className = '',
  style,
}: {
  children: React.ReactNode
  muted?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <td
      className={`border-b border-dotted border-[var(--rule-soft)] px-3 py-2.5 text-right align-top font-mono tabular-nums ${
        muted ? 'text-[var(--ink-4)]' : 'text-[var(--ink)]'
      } ${className}`}
      style={style}
    >
      {children}
    </td>
  )
}
