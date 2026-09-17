import type { ReactNode } from 'react'
import { celTekst, type Cel } from '@/lib/beheer/gebruik-analyse/onderdrukking'
import { arceringLegenda, celUitleg, gebruikersTekst, weekKort, weekLabel } from './opmaak'

/**
 * Handgetekende grafiek-bouwstenen voor /beheer/gebruik — geen
 * grafiekbibliotheek, geen client-JS. Server-component-vriendelijk (geen hooks).
 *
 * Harde regels die hier structureel geborgd zijn:
 *  - een `klein`/`verborgen` cel wordt NOOIT als 0 of als balk getekend, maar als
 *    gearceerd vlak met de celtekst in de tooltip en de tabel;
 *  - één y-as per grafiek; een gedeelde schaal geeft de aanroeper expliciet mee;
 *  - tekst altijd in inkt-tokens, de reekskleur alleen op de markering;
 *  - elke grafiek heeft een tooltip (`<title>`) én een tabelweergave.
 */

/** CSS-arcering voor onderdrukte vlakken (HTML-balken en matrixcellen). */
export const ARCERING_STIJL = {
  backgroundImage: 'repeating-linear-gradient(135deg, var(--border-md) 0 1px, transparent 1px 5px)',
} as const

/** Een cel als tekst; onderdrukte cellen cursief met uitleg in de tooltip. */
export function CelWaarde({ cel, className = '' }: { cel: Cel; className?: string }) {
  const uitleg = celUitleg(cel)
  if (!uitleg) {
    return <span className={`font-mono tabular-nums ${className}`}>{celTekst(cel)}</span>
  }
  return (
    <span className={`font-mono italic tabular-nums text-[var(--ink-3)] ${className}`} title={uitleg}>
      {celTekst(cel)}
    </span>
  )
}

/** Tabelweergave achter een disclosure — elke grafiek heeft er één. */
export function TabelWeergave({ label = 'Toon als tabel', children }: { label?: string; children: ReactNode }) {
  return (
    <details className="group mt-3">
      <summary className="inline-flex min-h-[36px] cursor-pointer items-center font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]">
        {label}
      </summary>
      <div className="mt-2 overflow-x-auto">{children}</div>
    </details>
  )
}

export function Th({ children, rechts = false }: { children: ReactNode; rechts?: boolean }) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-meta)] ${
        rechts ? 'pl-4 text-right' : 'pr-4 text-left'
      }`}
    >
      {children}
    </th>
  )
}

export function Td({ children, rechts = false }: { children: ReactNode; rechts?: boolean }) {
  return (
    <td
      className={`py-1.5 align-top ${rechts ? 'pl-4 text-right font-mono text-xs tabular-nums text-[var(--ink-2)]' : 'pr-4 text-[var(--ink-2)]'}`}
    >
      {children}
    </td>
  )
}

export interface WeekPunt {
  week: string
  cel: Cel
}

const VIEW_W = 260

/**
 * Kolommen per week, één reeks. `schaalMax` is de bovenkant van de y-as — geef
 * bij small multiples dezelfde waarde aan elk paneel (gedeelde schaal).
 */
export function WeekKolommen({
  punten,
  schaalMax,
  kleur,
  idBasis,
  omschrijving,
  hoogte = 90,
  eenheid = 'gebruikers',
}: {
  punten: WeekPunt[]
  schaalMax: number
  kleur: string
  /** Stabiele, unieke basis voor het patroon-id (bv. `stroom-vermogen`). */
  idBasis: string
  /** Toegankelijke omschrijving van de grafiek (aria-label). */
  omschrijving: string
  hoogte?: number
  eenheid?: string
}) {
  const n = punten.length
  if (n === 0) {
    return <p className="py-4 text-sm italic text-[var(--ink-3)]">Nog geen weken in deze band.</p>
  }
  const stap = VIEW_W / n
  const gat = Math.min(2, stap * 0.25)
  const breedte = Math.max(stap - gat, 0.5)
  const patroonId = `arcering-${idBasis.replace(/[^a-z0-9-]/gi, '')}`
  const max = schaalMax > 0 ? schaalMax : 1
  const heeftOnderdrukt = punten.some((p) => p.cel.soort !== 'waarde')

  return (
    <figure className="m-0">
      <div className="flex items-stretch gap-2">
        <div
          aria-hidden
          className="flex w-7 shrink-0 flex-col justify-between text-right font-mono text-[10px] tabular-nums text-[var(--ink-meta)]"
        >
          <span>{schaalMax.toLocaleString('nl-NL')}</span>
          <span>0</span>
        </div>
        <svg
          viewBox={`0 0 ${VIEW_W} ${hoogte}`}
          className="block h-auto w-full min-w-0"
          role="img"
          aria-label={omschrijving}
          data-testid={`weekkolommen-${idBasis}`}
        >
          <defs>
            <pattern id={patroonId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="5" height="5" fill="var(--paper)" />
              <line x1="0" y1="0" x2="0" y2="5" stroke="var(--border-md)" strokeWidth="1.2" />
            </pattern>
          </defs>
          {/* Recessieve rasterlijnen: boven, midden, basislijn */}
          <line x1="0" x2={VIEW_W} y1="0.5" y2="0.5" stroke="var(--border-ed)" strokeWidth="1" />
          <line x1="0" x2={VIEW_W} y1={hoogte / 2} y2={hoogte / 2} stroke="var(--border-ed)" strokeWidth="1" strokeDasharray="2 3" />
          {punten.map((p, i) => {
            const x = i * stap + gat / 2
            const tip =
              p.cel.soort === 'waarde'
                ? `${weekLabel(p.week)}: ${p.cel.n.toLocaleString('nl-NL')} ${eenheid}`
                : `${weekLabel(p.week)}: ${celTekst(p.cel)} (${celUitleg(p.cel)})`
            let markering: ReactNode = null
            if (p.cel.soort === 'waarde') {
              if (p.cel.n > 0) {
                const h = Math.max((Math.min(p.cel.n, max) / max) * hoogte, 1)
                markering = <rect x={x} y={hoogte - h} width={breedte} height={h} fill={kleur} data-soort="waarde" />
              }
            } else {
              // Onderdrukt: gearceerd vlak over de volle hoogte — geen hoogte die een waarde suggereert.
              markering = (
                <rect
                  x={x}
                  y={0}
                  width={breedte}
                  height={hoogte}
                  fill={`url(#${patroonId})`}
                  data-soort={p.cel.soort}
                />
              )
            }
            return (
              <g key={p.week}>
                {markering}
                {/* Trefvlak groter dan de markering, draagt de tooltip */}
                <rect x={i * stap} y={0} width={stap} height={hoogte} fill="transparent">
                  <title>{tip}</title>
                </rect>
              </g>
            )
          })}
          <line x1="0" x2={VIEW_W} y1={hoogte - 0.5} y2={hoogte - 0.5} stroke="var(--border-md)" strokeWidth="1" />
        </svg>
      </div>
      <figcaption className="ml-9 mt-1 flex justify-between gap-2 font-mono text-[10px] tabular-nums text-[var(--ink-meta)]">
        <span>{weekKort(punten[0].week)}</span>
        {heeftOnderdrukt && <span className="italic">{arceringLegenda()}</span>}
        <span>{weekKort(punten[n - 1].week)}</span>
      </figcaption>
    </figure>
  )
}

export interface BalkRij {
  sleutel: string
  label: ReactNode
  cel: Cel
  kleur: string
  /** Extra tekst achter de waarde, bv. "42% van 118". */
  toelichting?: string
}

/** Horizontale balken met directe labels (waarde in inkt, markering in kleur). */
export function HorizontaleBalken({
  rijen,
  schaalMax,
  testId,
}: {
  rijen: BalkRij[]
  schaalMax: number
  testId?: string
}) {
  const max = schaalMax > 0 ? schaalMax : 1
  return (
    <ul className="space-y-2" data-testid={testId}>
      {rijen.map((r) => {
        const uitleg = celUitleg(r.cel)
        const tip =
          r.cel.soort === 'waarde'
            ? `${gebruikersTekst(r.cel.n)}${r.toelichting ? ` — ${r.toelichting}` : ''}`
            : `${celTekst(r.cel)} (${uitleg})`
        return (
          <li key={r.sleutel} className="grid grid-cols-[minmax(7rem,11rem)_1fr] items-center gap-3 text-sm" title={tip}>
            <span className="truncate text-[var(--ink-2)]">{r.label}</span>
            <span className="flex min-w-0 items-center gap-2">
              {r.cel.soort === 'waarde' ? (
                r.cel.n > 0 ? (
                  <span
                    aria-hidden
                    data-soort="waarde"
                    className="block h-3 shrink-0"
                    style={{ width: `${Math.max((Math.min(r.cel.n, max) / max) * 70, 0.5)}%`, background: r.kleur }}
                  />
                ) : null
              ) : (
                <span
                  aria-hidden
                  data-soort={r.cel.soort}
                  className="block h-3 w-8 shrink-0 border border-dashed border-[var(--border-md)]"
                  style={ARCERING_STIJL}
                />
              )}
              <span className="whitespace-nowrap text-xs text-[var(--ink-2)]">
                <CelWaarde cel={r.cel} />
                {r.toelichting && <span className="ml-1.5 text-[var(--ink-3)]">{r.toelichting}</span>}
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Kleurstaaltje naast een reeksnaam (identiteit nooit alleen via kleur: de naam staat ernaast). */
export function Staaltje({ kleur }: { kleur: string }) {
  return <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0" style={{ background: kleur }} />
}
