'use client'

/**
 * Presentational bouwstenen voor de Sleepmodus: de centrale transactie-bol,
 * budget-bollen op ringslots, de zwerm vergelijkbare transacties, de twee
 * dropzones (Eigen rekening / Overslaan) en de vraagkaart na een drop.
 * Droppable-wiring (dnd-kit) zit colocated zodat de overlay compact blijft;
 * alle componenten zijn ook zonder drag bruikbaar (tap-to-assign).
 */

import { useEffect, useRef } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { ArrowLeftRight, ArrowRight, Check, CheckCircle, MoreHorizontal, Sparkles, X } from 'lucide-react'
import { BudgetIcon, getTypeColors, formatCurrencyDecimals } from '@/components/app/budget-shared'
import type { Budget } from '@/lib/budget-data'
import type { QueueTx, AssignScope } from '@/lib/sleepmodus/queue'
import type { RingSlot } from '@/lib/sleepmodus/ring'
import { shortBudgetLabel } from '@/lib/sleepmodus/short-label'

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/** Vage achtergrond-tint in de budget-type-kleur (sterker bij highlight). */
function tintFor(hex: string, strength: number): string {
  return `color-mix(in oklch, ${hex} ${strength}%, var(--paper))`
}

// ── Centrale transactie-bol ───────────────────────────────────────────────────

/**
 * Gouden munt-laag: dubbele rand (buitenrand + concentrische binnenring) plus
 * een warme metallic sheen via kern-tokens. Gebruikt als achtergrond voor zowel
 * de centrale bol als de zwerm-muntjes, zodat ze als één muntfamilie lezen.
 */
const COIN_SHEEN =
  'radial-gradient(circle at 32% 28%, ' +
  'color-mix(in oklch, var(--color-kern-200) 70%, white) 0%, ' +
  'color-mix(in oklch, var(--color-kern-200) 35%, var(--paper)) 38%, ' +
  'var(--paper) 72%, ' +
  'color-mix(in oklch, var(--color-kern-300) 30%, var(--paper)) 100%)'

export function CentraleBolVisual({ tx, siblingCount, dimmed }: {
  tx: QueueTx
  siblingCount: number
  dimmed?: boolean
}) {
  return (
    <div
      className={[
        'relative flex flex-col items-center justify-center rounded-full text-center select-none',
        'border-2 border-kern-600 shadow-[0_6px_18px_rgba(60,40,20,0.20)]',
        dimmed ? 'opacity-40' : '',
      ].join(' ')}
      style={{
        width: 'clamp(104px, 30vw, 128px)',
        height: 'clamp(104px, 30vw, 128px)',
        background: COIN_SHEEN,
      }}
    >
      {/* Concentrische binnenring — de tweede rand van een munt. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[6px] rounded-full border border-kern-400/70"
      />
      <p className="relative px-3 font-[var(--font-playfair)] text-[13px] font-semibold leading-tight text-[var(--ink)] line-clamp-2">
        {tx.counterparty_name || tx.description}
      </p>
      <p className={`relative mt-1 font-[var(--font-dm-mono)] text-[15px] font-medium tabular-nums ${tx.amount > 0 ? 'text-positive' : 'text-[var(--ink)]'}`}>
        {tx.amount > 0 ? '+' : ''}{formatCurrencyDecimals(tx.amount)}
      </p>
      <p
        className="relative mt-0.5 font-serif text-[9px] italic text-[var(--ink-3)]"
        style={{ textShadow: '0 0 2px var(--paper), 0 0 3px var(--paper)' }}
      >
        {formatDate(tx.date)}
      </p>
      {siblingCount > 0 && (
        <p
          className="relative mt-0.5 font-serif text-[9px] italic text-kern-700"
          style={{ textShadow: '0 0 2px var(--paper), 0 0 3px var(--paper)' }}
        >
          + {siblingCount} vergelijkbaar
        </p>
      )}
    </div>
  )
}

// ── Budget-bol op een ringslot ────────────────────────────────────────────────

export type BolState = 'normal' | 'hot' | 'dim' | 'armed'

/**
 * Spaarvarken-silhouet: gevuld met de budget-type-tint, omlijnd in de
 * budget-type-kleur (spiegelt de oude rand+tint van de ronde bol). Body, oor,
 * snuit, pootjes en een muntgleuf bovenop — clean/editorial, leesbaar op ~70px.
 * Schaalt mee met de container (width/height 100%).
 */
function PiggySilhouette({ fill, stroke, strokeWidth = 2 }: { fill: string; stroke: string; strokeWidth?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 84"
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Oor */}
      <path
        d="M66 20 q9 -11 16 -7 q3 8 -5 16 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* Body */}
      <path
        d="M50 16
           C26 16 10 30 10 47
           C10 56 15 63 22 67
           L22 75 a4 4 0 0 0 8 0 L30 70
           a55 55 0 0 0 30 0 L60 75 a4 4 0 0 0 8 0 L68 66
           C81 61 90 52 90 42
           C90 27 75 16 50 16 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* Snuit */}
      <ellipse cx="86" cy="44" rx="9" ry="8" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <circle cx="83.5" cy="44" r="1.6" fill={stroke} />
      <circle cx="88.5" cy="44" r="1.6" fill={stroke} />
      {/* Oog */}
      <circle cx="68" cy="38" r="2" fill={stroke} />
      {/* Muntgleuf bovenop — dikker als het de actieve doelvariant is. */}
      <line
        x1="42"
        y1="20"
        x2="58"
        y2="20"
        stroke={stroke}
        strokeWidth={strokeWidth + 0.5}
        strokeLinecap="round"
      />
    </svg>
  )
}

export function BudgetBol({ droppableId, budget, pos, state, isChild, pulse, stagger, onTap, label }: {
  droppableId: string
  budget: Pick<Budget, 'id' | 'name' | 'icon' | 'budget_type'>
  /** Positie als percentage van het speelveld. */
  pos: RingSlot
  state: BolState
  /** Deelbudget in expanded state — iets kleiner, boven de gedimde ring. */
  isChild?: boolean
  /** ✓-puls na een geslaagde landing. */
  pulse?: boolean
  /** Enter-stagger in ms (expanded state). */
  stagger?: number
  onTap?: () => void
  /** Toegankelijk label, bv. "Wijs toe aan Boodschappen". */
  label: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId })
  const colors = getTypeColors(budget.budget_type)
  const size = isChild ? 'clamp(56px, 16vw, 64px)' : 'clamp(68px, 19vw, 78px)'
  const highlighted = isOver || state === 'armed'
  // 'hot' = het door regels/historie voorgestelde (deel)budget. Dat lichten we
  // nadrukkelijk uit zodat het opvalt — óók als het een subbudget is. Het
  // "ademt" (pulse) alleen wanneer het niet tegelijk het actieve doel is; dan
  // neemt de sterkere highlighted-staat het visueel over.
  const suggested = state === 'hot'
  const pulsing = suggested && !highlighted

  return (
    <div
      ref={setNodeRef}
      data-slot-target={droppableId}
      className={isChild ? 'animate-sleep-ring-fade absolute' : 'absolute'}
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        transform: 'translate(-50%, -50%)',
        ['--stagger' as string]: `${stagger ?? 0}ms`,
        transition: 'opacity 200ms ease-out',
        opacity: state === 'dim' ? 0.25 : 1,
        // Voorstel tilt bóven de buren (z 2), het actieve doel daar weer bovenop (z 3).
        zIndex: highlighted ? 3 : isChild || suggested ? 2 : 1,
      }}
    >
      {/* De droppable hit-area is ruimer dan de zichtbare bol ("naderen"). */}
      <div className="absolute -inset-3" aria-hidden="true" />
      <button
        type="button"
        onClick={onTap}
        disabled={state === 'dim' || !onTap}
        aria-label={label}
        className={[
          'relative flex flex-col items-center justify-center gap-0.5 text-center',
          'transition-[filter,transform] duration-200 ease-out',
          pulse ? 'animate-sleep-check-pulse' : '',
          pulsing ? 'animate-sleep-suggest' : '',
        ].join(' ')}
        style={{
          width: size,
          height: size,
          // Twéé signalen voor het actieve doel, niet alleen kleur (a11y):
          // (1) een merkbare schaalsprong die de bol vóór de buren tilt en
          // (2) een dikkere, vollere omlijning (hieronder in PiggySilhouette).
          // Bij het voorstel sturen transform + filter via de pulse-keyframe —
          // daarom hier NIET inline zetten (anders overrulet de inline-stijl 'm).
          transform: highlighted ? 'scale(1.08)' : pulsing ? undefined : 'scale(1)',
          // Een box-shadow-ring sluit niet aan op een niet-rond silhouet;
          // de gloed komt daarom van een gekleurde drop-shadow ACHTER de vorm.
          filter: highlighted
            ? `drop-shadow(0 0 7px color-mix(in oklch, ${colors.hex} 60%, transparent)) drop-shadow(0 3px 6px color-mix(in oklch, ${colors.hex} 30%, transparent))`
            : pulsing
              ? undefined
              : 'drop-shadow(0 2px 4px rgba(60,40,20,0.16))',
          ['--sleep-pulse-color' as string]: colors.hex,
          ['--sleep-suggest-color' as string]: colors.hex,
        }}
      >
        {/* "Voorstel"-badge: maakt het gesuggereerde (deel)budget onmiskenbaar,
            ook in een drukke ring. Donkere ink-pill voor maximaal contrast. */}
        {suggested && (
          <span className="pointer-events-none absolute -top-2 left-1/2 z-[4] flex -translate-x-1/2 items-center gap-0.5 whitespace-nowrap rounded-full bg-[var(--ink)] px-1.5 py-px font-[var(--font-dm-mono)] text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--paper)] shadow-[0_1px_3px_rgba(26,25,22,0.3)]">
            <Sparkles className="h-2 w-2" aria-hidden="true" />
            voorstel
          </span>
        )}
        {/* Het spaarvarken-silhouet — fill = tint, stroke = type-kleur. Tint
            sterker bij hover/voorstel; bij het actieve doel een duidelijk
            dikkere omlijning in de vólle type-kleur, mirroring de oude rand. */}
        <PiggySilhouette
          fill={tintFor(colors.hex, highlighted ? 26 : suggested ? 22 : 11)}
          stroke={colors.hex}
          strokeWidth={highlighted ? 3.25 : suggested ? 2.75 : 2}
        />
        {/* Het icoon woont gecentreerd ín het varken; de naam staat eronder als
            los naamplaatje (zie hieronder), zodat tekst en buik elkaar niet meer
            overlappen. */}
        <span className="relative inline-flex h-[18px] w-[18px] items-center justify-center">
          <BudgetIcon name={budget.icon} className="h-[18px] w-[18px]" />
        </span>
        {/* Naamplaatje los ónder het varken: recht (niet cursief), Inter, op een
            paper-plaatje zodat het zowel van de cream-field als van de gekleurde
            type-tint loskomt. pointer-events-none zodat het plaatje — dat in een
            krappe cluster een buur-varken kan naderen — nooit diens tik onderschept;
            het varken zelf (≥56px) blijft het ruime tik-doel. Verkort label houdt
            'm op 1–2 regels; de volledige naam zit in title + aria-label. */}
        <span
          title={budget.name}
          className="pointer-events-none absolute left-1/2 top-full z-[3] mt-0.5 -translate-x-1/2 max-w-[88px] whitespace-normal border border-[var(--border-ed)]/60 bg-[var(--paper)]/90 px-1 py-px text-center font-sans text-[10.5px] font-medium not-italic leading-[1.15] text-[var(--ink-2)] line-clamp-2"
        >
          {shortBudgetLabel(budget.name)}
        </span>
      </button>
    </div>
  )
}

/**
 * Miniatuur-voorproefje van een deelbudget bij een hoofdbol in ruststand —
 * op dezelfde straal als waar het deelbudget straks opent, zodat je er bij
 * het slepen direct heen kunt sturen. Puur decoratief (geen droptarget).
 */
export function MiniSatelliet({ budget, pos, dimmed }: {
  budget: Pick<Budget, 'icon' | 'budget_type'>
  pos: RingSlot
  dimmed?: boolean
}) {
  const colors = getTypeColors(budget.budget_type)
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute flex items-center justify-center rounded-full border"
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        transform: 'translate(-50%, -50%)',
        width: 18,
        height: 18,
        borderColor: colors.hex,
        backgroundColor: tintFor(colors.hex, 12),
        opacity: dimmed ? 0.2 : 0.9,
        transition: 'opacity 200ms ease-out',
        zIndex: 0,
      }}
    >
      <BudgetIcon name={budget.icon} className="h-2.5 w-2.5" />
    </div>
  )
}

/** "Meer"-bol die de overige hoofdbudgetten bundelt. */
export function MeerBol({ pos, count, expanded, onTap }: {
  pos: RingSlot
  count: number
  expanded: boolean
  onTap: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'meer' })
  return (
    <div
      ref={setNodeRef}
      className="absolute"
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)', zIndex: 1 }}
    >
      <div className="absolute -inset-3" aria-hidden="true" />
      <button
        type="button"
        onClick={onTap}
        aria-label={expanded ? 'Toon de eerste budgetten' : `Toon ${count} overige budgetten`}
        aria-expanded={expanded}
        className={[
          'relative flex flex-col items-center justify-center gap-0.5 rounded-full text-center',
          'bg-[var(--subtle)]/70 border-[1.5px] border-dashed border-[var(--border-md)]',
          'transition-[box-shadow,background-color] duration-200',
          isOver || expanded ? 'bg-[var(--subtle)] shadow-[0_0_0_6px_rgba(26,25,22,0.06)]' : '',
        ].join(' ')}
        style={{ width: 'clamp(68px, 19vw, 78px)', height: 'clamp(68px, 19vw, 78px)' }}
      >
        <MoreHorizontal className="h-4 w-4 text-[var(--ink-3)]" />
        <span className="font-[var(--font-dm-mono)] text-[10px] tabular-nums text-[var(--ink-3)]">
          {expanded ? 'terug' : `+${count}`}
        </span>
      </button>
    </div>
  )
}

// ── Zwerm vergelijkbare transacties ──────────────────────────────────────────

const ZWERM_MAX = 12
/** Vaste offsets (px) t.o.v. de rechteronderkant van de centrale bol — een staart. */
const ZWERM_OFFSETS = [
  { x: 26, y: 30 }, { x: 46, y: 46 }, { x: 62, y: 64 }, { x: 74, y: 84 },
  { x: 38, y: 72 }, { x: 58, y: 96 }, { x: 80, y: 110 }, { x: 50, y: 116 },
  { x: 70, y: 134 }, { x: 88, y: 142 }, { x: 60, y: 152 }, { x: 82, y: 166 },
]

function MiniBol({ amount, size, opacity }: { amount: number; size: number; opacity?: number }) {
  return (
    <div
      className="relative flex items-center justify-center rounded-full border-[1.5px] border-kern-600 shadow-[0_2px_6px_rgba(60,40,20,0.16)]"
      style={{ width: size, height: size, opacity, background: COIN_SHEEN }}
    >
      {/* Concentrische binnenring — muntje. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[2.5px] rounded-full border border-kern-400/70"
      />
      <span className="relative font-[var(--font-dm-mono)] text-[7.5px] tabular-nums text-[var(--ink-2)]">
        {Math.abs(amount).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  )
}

/**
 * Vertraagde sleep-staart tijdens het slepen: het voorste bolletje volgt de
 * cursor met een lerp, elk volgend bolletje volgt zijn voorganger — het
 * klassieke muis-trail-effect. Posities gaan buiten React om (rAF + transform)
 * zodat er per frame niets re-rendert.
 */
export function ZwermTrail({ siblings, fieldRef, posRef }: {
  siblings: QueueTx[]
  fieldRef: React.RefObject<HTMLDivElement | null>
  /** Actuele cursorpositie in viewport-coördinaten (gevoed door de overlay). */
  posRef: React.RefObject<{ x: number; y: number } | null>
}) {
  const visible = siblings.slice(0, ZWERM_MAX)
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([])
  const points = useRef<{ x: number; y: number }[] | null>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const field = fieldRef.current
      const target = posRef.current
      if (!field || !target) return
      const rect = field.getBoundingClientRect()
      // Anker rechtsonder de cursor, nét buiten de bol-kloon.
      const head = { x: target.x - rect.left + 34, y: target.y - rect.top + 52 }
      if (!points.current) points.current = nodeRefs.current.map(() => ({ ...head }))
      let prev = head
      points.current.forEach((p, i) => {
        // Elk bolletje volgt zijn voorganger plus een klein rust-offset: tijdens
        // beweging domineert de na-ijl (muis-trail), in rust vormt de ketting een
        // diagonaal stapeltje dat zichtbaar achter de bol uitsteekt.
        const goal = i === 0 ? prev : { x: prev.x + 12, y: prev.y + 14 }
        const k = Math.max(0.12, 0.3 - i * 0.012)
        p.x += (goal.x - p.x) * k
        p.y += (goal.y - p.y) * k
        const el = nodeRefs.current[i]
        if (el) {
          el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`
          el.style.visibility = 'visible'
        }
        prev = p
      })
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // Bewust eenmalig: de wachtrij wijzigt niet tijdens een drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (visible.length === 0) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-[2]" aria-hidden="true">
      {visible.map((tx, i) => (
        <div
          key={tx.id}
          ref={(el) => { nodeRefs.current[i] = el }}
          className="absolute left-0 top-0 will-change-transform"
          // Onzichtbaar tot de eerste rAF-tick een positie heeft gezet —
          // de tick zelf zet visibility op 'visible'.
          style={{ visibility: 'hidden' }}
        >
          <MiniBol amount={tx.amount} size={Math.max(26, 38 - i * 2)} opacity={Math.max(0.35, 1 - i * 0.07)} />
        </div>
      ))}
    </div>
  )
}

/** Detailweergave van de huidige transactie — opent door op de bol te tikken. */
export function TransactieDetailsKaart({ tx, onClose }: { tx: QueueTx; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Transactiedetails"
      className="mx-auto w-full max-w-[340px] border border-[var(--ink)] bg-[var(--paper)] p-4 shadow-[0_10px_28px_rgba(26,25,22,0.18)]"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 font-[var(--font-dm-mono)] text-[9px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
          <span className="inline-block h-px w-5 bg-kern-600" aria-hidden="true" />
          Transactie
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Details sluiten"
          className="-mr-1 -mt-1 flex h-8 w-8 items-center justify-center text-[var(--ink-3)] hover:text-[var(--ink)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <h3 className="mt-1 font-[var(--font-playfair)] text-base font-extrabold leading-snug text-[var(--ink)]">
        {tx.counterparty_name || tx.description}
      </h3>
      <p className={`mt-1 font-[var(--font-dm-mono)] text-lg font-medium tabular-nums ${tx.amount > 0 ? 'text-positive' : 'text-[var(--ink)]'}`}>
        {tx.amount > 0 ? '+' : ''}{formatCurrencyDecimals(tx.amount)}
      </p>
      <dl className="mt-3 space-y-1.5 border-t border-dotted border-[var(--border-ed)] pt-3 text-[11px] leading-relaxed">
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 font-[var(--font-dm-mono)] text-[9px] uppercase tracking-[0.08em] text-[var(--ink-4)] pt-0.5">Datum</dt>
          <dd className="text-[var(--ink-2)]">
            {new Date(tx.date + 'T00:00:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 font-[var(--font-dm-mono)] text-[9px] uppercase tracking-[0.08em] text-[var(--ink-4)] pt-0.5">Omschrijving</dt>
          <dd className="text-[var(--ink-2)]">{tx.description || '—'}</dd>
        </div>
        {tx.counterparty_name && (
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 font-[var(--font-dm-mono)] text-[9px] uppercase tracking-[0.08em] text-[var(--ink-4)] pt-0.5">Tegenpartij</dt>
            <dd className="text-[var(--ink-2)]">{tx.counterparty_name}</dd>
          </div>
        )}
        {tx.counterparty_iban && (
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 font-[var(--font-dm-mono)] text-[9px] uppercase tracking-[0.08em] text-[var(--ink-4)] pt-0.5">IBAN</dt>
            <dd className="font-[var(--font-dm-mono)] text-[10px] tabular-nums text-[var(--ink-2)]">{tx.counterparty_iban}</dd>
          </div>
        )}
        {tx.reference && (
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 font-[var(--font-dm-mono)] text-[9px] uppercase tracking-[0.08em] text-[var(--ink-4)] pt-0.5">Referentie</dt>
            <dd className="font-[var(--font-dm-mono)] text-[10px] text-[var(--ink-2)]">{tx.reference}</dd>
          </div>
        )}
      </dl>
      <p className="mt-3 font-serif text-[10px] italic text-[var(--ink-4)]">
        Sleep de bol naar een budget om toe te wijzen.
      </p>
    </div>
  )
}

export function ZwermTail({ siblings, mode, flyDelta }: {
  siblings: QueueTx[]
  /** 'tail' hangt achter de bol; 'fly' vliegt richting flyDelta het doel in. */
  mode: 'tail' | 'fly'
  /** Vector (px) van zwerm-anker naar het doel — alleen relevant bij 'fly'. */
  flyDelta?: { x: number; y: number }
}) {
  const visible = siblings.slice(0, ZWERM_MAX)
  const extra = siblings.length - visible.length
  if (visible.length === 0) return null

  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2" aria-hidden="true">
      {visible.map((tx, i) => {
        const offset = ZWERM_OFFSETS[i % ZWERM_OFFSETS.length]
        const size = Math.max(26, 38 - i * 2)
        return (
          <div
            key={tx.id}
            className={mode === 'fly' ? 'animate-sleep-fly absolute' : 'absolute'}
            style={{
              left: offset.x,
              top: offset.y,
              width: size,
              height: size,
              opacity: mode === 'fly' ? 1 : Math.max(0.35, 1 - i * 0.12),
              ['--stagger' as string]: `${i * 120}ms`,
              ['--sleep-fly-x' as string]: `${(flyDelta?.x ?? 0) - offset.x}px`,
              ['--sleep-fly-y' as string]: `${(flyDelta?.y ?? 0) - offset.y}px`,
            }}
          >
            <MiniBol amount={tx.amount} size={size} />
          </div>
        )
      })}
      {extra > 0 && mode === 'tail' && (
        <span
          className="absolute font-[var(--font-dm-mono)] text-[9px] tabular-nums text-[var(--ink-4)]"
          style={{ left: ZWERM_OFFSETS[ZWERM_MAX - 1].x + 14, top: ZWERM_OFFSETS[ZWERM_MAX - 1].y + 18 }}
        >
          +{extra}
        </span>
      )}
    </div>
  )
}

// ── Dropzones onderin de duim-zone ───────────────────────────────────────────

function DropPill({ droppableId, icon, children, glow, onTap, label, dimmed }: {
  droppableId: string
  icon: React.ReactNode
  children: React.ReactNode
  glow?: boolean
  onTap?: () => void
  label: string
  dimmed?: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId })
  return (
    <div ref={setNodeRef} data-slot-target={droppableId} className="flex-1">
      <button
        type="button"
        onClick={onTap}
        disabled={!onTap}
        aria-label={label}
        className={[
          'flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-full px-3',
          'border-[1.5px] border-dashed border-[var(--border-md)] bg-[var(--subtle)]/70',
          'font-[var(--font-dm-mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--ink-2)]',
          'transition-[box-shadow,background-color,opacity] duration-200',
          isOver ? 'bg-[var(--subtle)] shadow-[0_0_0_6px_rgba(26,25,22,0.08)] border-[var(--ink-3)]' : '',
          glow && !isOver ? 'shadow-[0_0_0_5px_rgba(107,67,57,0.10)] border-kern-400' : '',
          dimmed ? 'opacity-30' : '',
        ].join(' ')}
      >
        {icon}
        {children}
      </button>
    </div>
  )
}

export function DropZones({ eigenRekeningActief, eigenGloeit, dimmed, onEigenTap, onSkipTap }: {
  eigenRekeningActief: boolean
  eigenGloeit: boolean
  dimmed: boolean
  onEigenTap?: () => void
  onSkipTap?: () => void
}) {
  return (
    <div className="flex gap-2.5 px-4">
      {eigenRekeningActief && (
        <DropPill
          droppableId="zone:eigen"
          icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
          glow={eigenGloeit}
          dimmed={dimmed}
          onTap={onEigenTap}
          label="Markeer als overboeking tussen eigen rekeningen"
        >
          Eigen rekening
        </DropPill>
      )}
      <DropPill
        droppableId="zone:skip"
        icon={<ArrowRight className="h-3.5 w-3.5" />}
        dimmed={dimmed}
        onTap={onSkipTap}
        label="Sla deze transactie over"
      >
        Overslaan
      </DropPill>
    </div>
  )
}

// ── Vraagkaart na een drop met vergelijkbare transacties ─────────────────────

export function ConfirmCard({ matchLabel, siblingCount, targetName, onScope, onCancel }: {
  matchLabel: string
  siblingCount: number
  targetName: string
  onScope: (scope: AssignScope) => void
  onCancel: () => void
}) {
  const total = siblingCount + 1
  return (
    <div
      role="dialog"
      aria-label={`Nog ${siblingCount} vergelijkbare transacties`}
      className="mx-auto w-full max-w-[320px] border border-[var(--ink)] bg-[var(--paper)] p-4 shadow-[0_10px_28px_rgba(26,25,22,0.18)]"
    >
      <h3 className="font-[var(--font-playfair)] text-base font-extrabold text-[var(--ink)]">
        Nog <span className="font-[var(--font-dm-mono)] tabular-nums">{siblingCount}</span> ×{' '}
        <em className="font-semibold italic text-kern-700">{matchLabel}</em>
      </h3>
      <p className="mb-3 mt-0.5 font-serif text-[11px] italic leading-relaxed text-[var(--ink-2)]">
        Wil je die ook naar {targetName} sturen? De bolletjes staan klaar.
      </p>
      <button
        type="button"
        onClick={() => onScope('rule')}
        className="mb-1.5 block min-h-[44px] w-full border border-[var(--ink)] bg-[var(--ink)] px-3 py-2 text-left font-serif text-[11.5px] font-semibold text-[var(--paper)]"
      >
        Alle <span className="font-[var(--font-dm-mono)] tabular-nums">{total}</span>, ook in de toekomst
        <span className="mt-0.5 block font-normal italic opacity-75 text-[9.5px]">
          maakt een regel — nieuwe {matchLabel}-transacties gaan vanzelf goed
        </span>
      </button>
      <button
        type="button"
        onClick={() => onScope('these')}
        className="mb-1.5 block min-h-[44px] w-full border border-[var(--ink)] bg-[var(--paper)] px-3 py-2 text-left font-serif text-[11.5px] font-semibold text-[var(--ink)]"
      >
        Alleen deze <span className="font-[var(--font-dm-mono)] tabular-nums">{total}</span>
        <span className="mt-0.5 block font-normal italic text-[9.5px] text-[var(--ink-3)]">
          zwerm vliegt mee, geen regel
        </span>
      </button>
      <button
        type="button"
        onClick={() => onScope('one')}
        className="mb-1.5 block min-h-[44px] w-full border border-[var(--ink)] bg-[var(--paper)] px-3 py-2 text-left font-serif text-[11.5px] font-semibold text-[var(--ink)]"
      >
        Alleen deze ene
        <span className="mt-0.5 block font-normal italic text-[9.5px] text-[var(--ink-3)]">
          de andere {siblingCount} komen straks gewoon langs
        </span>
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="mt-1 block w-full text-center font-serif text-[11px] italic text-[var(--ink-3)] underline-offset-2 hover:underline min-h-[32px]"
      >
        Toch een ander budget
      </button>
    </div>
  )
}

// ── Samenvatting wanneer de wachtrij leeg is ─────────────────────────────────

export function SamenvattingScherm({ assigned, rules, bulkUpdated, skipped, remaining = 0, onClose, closeLabel }: {
  assigned: number
  rules: number
  bulkUpdated: number
  skipped: number
  /** Aantal transacties dat nog open stond bij tussentijds stoppen. */
  remaining?: number
  onClose: () => void
  closeLabel?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-kern-100">
        <CheckCircle className="h-7 w-7 text-kern-600" />
      </div>
      <div>
        <p className="font-[var(--font-playfair)] text-lg font-bold text-[var(--ink)]">
          {remaining > 0
            ? <>Voortgang <em className="italic text-kern-700">opgeslagen</em></>
            : <>De stapel is <em className="italic text-kern-700">leeg</em></>}
        </p>
        <p className="mt-2 text-sm text-[var(--ink-2)]">
          {assigned === 0
            ? 'Niets toegewezen'
            : <>Je hebt <strong className="font-[var(--font-dm-mono)] tabular-nums">{assigned}</strong> {assigned === 1 ? 'transactie' : 'transacties'} toegewezen</>}
          {skipped > 0 && <> · {skipped} overgeslagen</>}
        </p>
        {rules > 0 && (
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            {rules} {rules === 1 ? 'regel' : 'regels'} aangemaakt
            {bulkUpdated > 0 && <> — {bulkUpdated} eerdere {bulkUpdated === 1 ? 'transactie' : 'transacties'} automatisch bijgewerkt</>}
          </p>
        )}
        {remaining > 0 && (
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            Nog <strong className="font-[var(--font-dm-mono)] tabular-nums">{remaining}</strong> {remaining === 1 ? 'transactie' : 'transacties'} niet toegewezen — die staan er de volgende keer weer.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[var(--r)] bg-kern-600 px-6 py-2 text-sm font-medium text-white hover:bg-kern-700"
      >
        <Check className="h-4 w-4" />
        {closeLabel ?? 'Terug naar budgetten'}
      </button>
    </div>
  )
}
