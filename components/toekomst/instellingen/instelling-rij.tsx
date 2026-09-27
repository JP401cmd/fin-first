'use client'

/**
 * InstellingRij — één regel van de checklist van je plan (katern Instellingen, R1 27 sep
 * 2026; ADR 0179 D4) en van het blok Levensstrategieën op Plan: label, de huidige waarde
 * en een ✎. De rij is één knop (raakvlak ≥ 44 px); de toegankelijke naam is
 * "label: waarde, aanpassen", zodat een schermlezer de waarde hoort. Zonder `onEdit` is
 * het een leesrij.
 *
 * Summary-list-patroon (GOV.UK check-answers, spec §3.1 regel 7): de waarde staat op de
 * rij, bewerken opent de bestaande body in een overlay.
 *
 * Layout: onder `sm` label op regel 1, waarde op regel 2 (links), ✎ rechts over beide
 * regels; vanaf `sm` een vaste labelkolom en een links uitgelijnde waardekolom, zonder
 * stippellijn. Drie toestanden zijn zichtbaar anders: ingesteld (`--ink-2`), standaard
 * (`--ink-3` + het woord "standaard") en ontbreekt (italic + "Toevoegen →" i.p.v. ✎).
 * Bedragen en percentages in mono met `tabular-nums` (bedragen via `MaskedAmount`).
 */

import { ArrowRight, Pencil } from 'lucide-react'
import type { ReactNode } from 'react'
import { MaskedAmount } from '@/components/app/masked-amount'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { vrijheidTekst } from '@/components/toekomst/meldingen/meldingen-bron'
import {
  NOG_NIET_BEVESTIGD,
  STANDAARD,
  TOEVOEGEN,
  type RijDeel,
  type RijStaat,
} from '@/lib/toekomst/instellingen-rijwaarden'

/** De kolommen van een rij — ook gebruikt door de hint eronder, zodat die uitlijnt. */
export const RIJ_GRID = 'grid grid-cols-[1fr_auto] gap-x-3 sm:grid-cols-[minmax(12rem,16rem)_1fr_auto]'
/** Smalle plek (de kolom naast de grafiek): label en waarde op één regel, ✎ rechts. */
const RIJ_GRID_COMPACT = 'grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-2'

/** Percentages ("2,0%") in een tekstdeel mono zetten; de rest blijft serif. */
function MetMonoPct({ tekst }: { tekst: string }) {
  const delen = tekst.split(/(\d+(?:,\d+)?%)/)
  if (delen.length === 1) return <>{tekst}</>
  return (
    <>
      {delen.map((d, i) =>
        i % 2 === 1 ? (
          <span key={i} className="font-mono text-[13px] tabular-nums">
            {d}
          </span>
        ) : (
          d
        ),
      )}
    </>
  )
}

export function RijWaarde({ delen }: { delen: readonly RijDeel[] }) {
  const { masked } = useMaskedAmounts()
  return (
    <>
      {delen.map((d, i) => (
        <span key={i}>
          {i > 0 && <span className="sr-only">, </span>}
          {i > 0 && <span aria-hidden="true"> · </span>}
          {typeof d === 'string' ? (
            <MetMonoPct tekst={d} />
          ) : (
            <>
              <MaskedAmount value={d.bedrag} className="text-[13px]" />
              {d.achter ? ` ${d.achter}` : ''}
              {(() => {
                const vrijheid = vrijheidTekst(d.vrijheidsdagen ?? null, masked)
                return vrijheid ? <span className="text-[var(--ink-3)]"> (≈ {vrijheid} vrijheid)</span> : null
              })()}
            </>
          )}
        </span>
      ))}
    </>
  )
}

const WAARDE_TOON: Record<RijStaat, string> = {
  ingesteld: 'text-[var(--ink-2)]',
  standaard: 'text-[var(--ink-3)]',
  ontbreekt: 'italic text-[var(--ink-3)]',
}

export function InstellingRij({
  label,
  waarde,
  onEdit,
  staat = 'ingesteld',
  nogNietBevestigd = false,
  hint,
  rij,
  compact = false,
}: {
  label: string
  waarde: ReactNode
  /** Zonder = leesrij. */
  onEdit?: () => void
  /** Ingesteld, standaard of ontbrekend (`rijStaat`). */
  staat?: RijStaat
  /** De wizard heeft de stap van deze rij nog niet bevestigd: stille markering. */
  nogNietBevestigd?: boolean
  /** Toelichting onder de rij, uitgelijnd met de waarde (mag een link bevatten). */
  hint?: ReactNode
  /** Rij-sleutel als test-/UAT-haak. */
  rij?: string
  /** Smalle kolom: label en waarde op één regel (de waarde kort af), ✎ rechts. */
  compact?: boolean
}) {
  const grid = compact ? RIJ_GRID_COMPACT : RIJ_GRID
  // De `sm:`-plaatsing hoort alleen bij de brede vorm.
  const breed = (cls: string) => (compact ? '' : cls)
  const plek = compact
    ? {
        label: 'col-start-1 row-start-1 font-serif text-[14px] text-[var(--ink)]',
        waarde: 'col-start-2 row-start-1 min-w-0 truncate font-serif text-[13px]',
        actie: 'col-start-3 row-start-1 self-center',
      }
    : {
        label: 'col-start-1 row-start-1 min-w-0 self-center font-serif text-[15px] text-[var(--ink)]',
        waarde: `col-start-1 row-start-2 min-w-0 font-serif text-[15px] leading-snug ${breed('sm:col-start-2 sm:row-start-1 sm:self-center')}`,
        actie: `col-start-2 row-span-2 row-start-1 self-center justify-self-end ${breed('sm:col-start-3 sm:row-span-1')}`,
      }
  const ontbreekt = staat === 'ontbreekt'
  const inhoud = (
    <>
      <span className={plek.label}>
        {label}
        <span className="sr-only">: </span>
      </span>
      <span
        className={`${plek.waarde} ${WAARDE_TOON[staat]}`}
        data-staat={staat}
      >
        {waarde}
        {staat === 'standaard' && (
          <span className="text-[13px] italic">
            <span className="sr-only">, </span>
            <span aria-hidden="true"> · </span>
            {STANDAARD}
          </span>
        )}
        {nogNietBevestigd && (
          <span className="block text-[12px] italic text-[var(--ink-3)]" data-testid="nog-niet-bevestigd">
            <span className="sr-only">, </span>
            {NOG_NIET_BEVESTIGD}
          </span>
        )}
      </span>
      <span className={plek.actie}>
        {onEdit ? (
          ontbreekt ? (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--module-active-700)]">
              <span className="sr-only">, </span>
              {TOEVOEGEN}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          ) : (
            <>
              <Pencil className="h-3.5 w-3.5 text-[var(--ink-3)] group-hover:text-[var(--module-active-700)]" aria-hidden="true" />
              <span className="sr-only">, aanpassen</span>
            </>
          )
        ) : (
          <span className="inline-block w-3.5" aria-hidden="true" />
        )}
      </span>
    </>
  )
  const cls = `${grid} ${compact ? 'min-h-[44px] py-2' : 'min-h-[48px] items-start gap-y-0.5 py-2.5'} w-full text-left`
  return (
    <div className="border-b border-[var(--border-ed)]" data-rij-wrap={rij}>
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          data-rij={rij}
          className={`group ${cls} transition-colors hover:bg-[var(--subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--module-active-500)]`}
        >
          {inhoud}
        </button>
      ) : (
        <div className={cls} data-rij={rij}>
          {inhoud}
        </div>
      )}
      {hint && (
        <div className={`${grid} pb-2.5`}>
          <div className={`col-start-1 text-[12px] leading-snug text-[var(--ink-3)] ${breed('sm:col-start-2')}`}>{hint}</div>
        </div>
      )}
    </div>
  )
}
