import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { MEET_STATUS_META, type MeetStatus } from '@/lib/beheer/dashboard/status'
import { verschilTekst } from './opmaak'
import { StatusTeken } from './status-teken'

/**
 * Een kerncijfer met zijn context: de periode waarover het gaat, de definitie,
 * de vergelijking met de periode ervoor en het verloop. Een los getal zonder
 * die context staat hier niet.
 */

export interface Vergelijking {
  /** `huidig − vorig`; `null` = niet te vergelijken. */
  verschil: number | null
  /** Waarmee vergeleken is, bv. "15–21 sep: 240". */
  met: string
  /** Waarom er geen vergelijking is; alleen bij `verschil: null`. */
  reden?: string
  /**
   * Is een stijging gunstig? `null` = geen oordeel (meer AI-aanroepen is niet
   * beter of slechter); dan blijft de tekst neutraal van kleur.
   */
  stijgingGunstig: boolean | null
}

function VergelijkingRegel({ v }: { v: Vergelijking }) {
  if (v.verschil === null) {
    return (
      <p className="text-xs text-[var(--ink-3)]">
        <span className="italic">Geen vergelijking: </span>
        {v.reden ?? 'de vorige periode is niet volledig gemeten.'}
      </p>
    )
  }
  const Icoon = v.verschil > 0 ? TrendingUp : v.verschil < 0 ? TrendingDown : Minus
  const gunstig = v.stijgingGunstig === null || v.verschil === 0 ? null : v.verschil > 0 === v.stijgingGunstig
  const kleur = gunstig === null ? 'text-[var(--ink-2)]' : gunstig ? 'text-positive' : 'text-negative'
  const richting = v.verschil > 0 ? 'meer' : v.verschil < 0 ? 'minder' : 'gelijk'
  return (
    <p className="text-xs text-[var(--ink-3)]">
      <span className={`inline-flex items-center gap-1 font-mono font-medium tabular-nums ${kleur}`}>
        <Icoon aria-hidden className="h-3.5 w-3.5" />
        {verschilTekst(v.verschil)}
        <span className="sr-only"> ({richting})</span>
      </span>{' '}
      ten opzichte van {v.met}
    </p>
  )
}

export function Kerncijfer({
  label,
  waarde,
  waardeToelichting,
  periode,
  definitie,
  vergelijking,
  grafiek,
  href,
  linkLabel,
  zonderMeting,
  testId,
}: {
  label: string
  /** Het getal, al opgemaakt; `null` als er geen meting is. */
  waarde: string | null
  /** Korte duiding direct onder het getal, bv. "p75, 812 metingen". */
  waardeToelichting?: string
  /** De periode waarover het getal gaat, bv. "22–28 sep". */
  periode: string
  definitie: string
  vergelijking?: Vergelijking
  grafiek?: ReactNode
  href: string
  linkLabel: string
  /** Waarom er geen getal is; bepaalt het statusteken in plaats van een getal. */
  zonderMeting?: { status: Exclude<MeetStatus, 'gezond' | 'afwijkend'>; uitleg: string }
  testId: string
}) {
  return (
    <article
      className="flex flex-col border border-[var(--border-ed)] bg-[var(--paper)] p-4"
      data-testid={testId}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-meta)]">{label}</h4>
        <span className="whitespace-nowrap font-mono text-[10px] tabular-nums text-[var(--ink-meta)]">{periode}</span>
      </div>

      {zonderMeting || waarde === null ? (
        <div className="mt-2">
          <StatusTeken status={zonderMeting?.status ?? 'geen-gegevens'} />
          <p className="mt-2 text-xs leading-relaxed text-[var(--ink-3)]">
            {zonderMeting?.uitleg ?? MEET_STATUS_META['geen-gegevens'].betekenis}
          </p>
        </div>
      ) : (
        <>
          <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">{waarde}</p>
          {waardeToelichting && <p className="text-xs text-[var(--ink-3)]">{waardeToelichting}</p>}
          {vergelijking && (
            <div className="mt-1.5">
              <VergelijkingRegel v={vergelijking} />
            </div>
          )}
        </>
      )}

      {grafiek && <div className="mt-3">{grafiek}</div>}

      <p className="mt-3 text-xs leading-relaxed text-[var(--ink-3)]">{definitie}</p>

      <Link
        href={href}
        className="mt-auto inline-flex min-h-11 items-center gap-1 pt-1 text-sm text-[var(--ink-2)] underline decoration-[var(--border-md)] underline-offset-2 hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        {linkLabel}
        <ArrowRight aria-hidden className="h-3.5 w-3.5" />
      </Link>
    </article>
  )
}
