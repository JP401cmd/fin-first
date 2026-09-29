'use client'

import { useCallback, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { MarkeringTeken } from './markering-teken'

/**
 * Het veld van een grafiek per dag of per week, met de kolom die je aanwijst
 * uitgeschreven.
 *
 * WAT JE ERMEE DOET
 *  - aanwijzen (muis) of tikken (aanraakscherm): de dag, zijn waarde en de
 *    ingrepen van die dag staan onder de grafiek;
 *  - klikken of tikken zet de dag vast, zodat hij blijft staan als je verder
 *    leest; nog een keer klikken of Escape laat hem los;
 *  - pijltjestoetsen lopen per dag, Home en End springen naar de randen.
 *
 * VOOR EEN SCHERMLEZER is het veld een schuifregelaar (`role="slider"`): de
 * keuze uit een reeks, met de gekozen dag als waarde in woorden. Bij die rol
 * schakelt een schermlezer vanzelf naar de modus waarin de pijltjestoetsen de
 * grafiek bereiken, en leest hij de waarde voor bij elke toets. Aanwijzen met de
 * muis kondigt niets aan zolang de grafiek de focus niet heeft: geen stroom van
 * aankondigingen voor wie een schermlezer met een muis combineert.
 *
 * De uitlezing heeft een vaste hoogte: de pagina verspringt niet als je over de
 * grafiek beweegt. Zonder JavaScript blijft de tabelweergave onder de grafiek
 * de volledige bron.
 *
 * Alle cijfers komen opgemaakt van de server binnen; dit onderdeel rekent niets
 * uit en leest niets.
 */

export interface VeldKolom {
  dag: string
  /** `27 sep`. */
  label: string
  soort: 'waarde' | 'lopend' | 'niet-gemeten' | 'leeg'
  /** Hoogte van de kolom in procenten van het veld. */
  hoogte: number
  /** De waarde in woorden, bv. "12 voorvallen" of "niet gemeten". */
  waarde: string
  toelichting: string | null
  markering: { soort: 'release' | 'beheeractie'; tekst: string } | null
  /** De volledige regel voor deze dag, zoals de uitlezing hem toont. */
  tip: string
}

export interface VeldReferentie {
  /** Hoogte in procenten van het veld. */
  hoogte: number
  label: string
  streep: 'lang' | 'kort'
}

/** Wat één kolom is; bepaalt de woorden in de hint en in de toegankelijke naam. */
export type VeldStap = 'dag' | 'week'

const STREEP_KLASSE: Record<VeldReferentie['streep'], string> = {
  lang: 'border-dashed',
  kort: 'border-dotted',
}

export function DagReeksVeld({
  kolommen,
  referenties,
  omschrijving,
  idBasis,
  veld,
  strook,
  tekenMaat,
  compact,
  kleur,
  arcering,
  stap = 'dag',
}: {
  kolommen: readonly VeldKolom[]
  referenties: readonly VeldReferentie[]
  omschrijving: string
  idBasis: string
  /** Hoogte van het veld in pixels. */
  veld: number
  /** Hoogte van de strook met markeringen in pixels. */
  strook: number
  tekenMaat: number
  compact: boolean
  kleur: string
  arcering: CSSProperties
  stap?: VeldStap
}) {
  const [actief, setActief] = useState<number | null>(null)
  const [vast, setVast] = useState(false)

  const n = kolommen.length
  const gekozen = actief !== null && actief < n ? kolommen[actief] : null

  const wijsAan = useCallback(
    (index: number) => {
      if (!vast) setActief(index)
    },
    [vast],
  )

  const laatLos = useCallback(() => {
    if (!vast) setActief(null)
  }, [vast])

  const zetVast = useCallback(
    (index: number) => {
      if (vast && actief === index) {
        setVast(false)
        return
      }
      setActief(index)
      setVast(true)
    },
    [vast, actief],
  )

  const opToets = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (n === 0) return
      let naar: number | null = null
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
          naar = actief === null ? n - 1 : Math.max(0, actief - 1)
          break
        case 'ArrowRight':
        case 'ArrowUp':
          naar = actief === null ? 0 : Math.min(n - 1, actief + 1)
          break
        case 'Home':
          naar = 0
          break
        case 'End':
          naar = n - 1
          break
        case 'Escape':
          setActief(null)
          setVast(false)
          e.preventDefault()
          return
        default:
          return
      }
      e.preventDefault()
      // Het toetsenbord kiest, maar zet niet vast: wie daarna de muis pakt,
      // wijst gewoon weer aan. Een al vastgezette dag schuift wel mee.
      setActief(naar)
    },
    [actief, n],
  )

  return (
    <div className="min-w-0 flex-1">
      <div
        role="slider"
        aria-orientation="horizontal"
        aria-label={`${omschrijving}. Pijltjestoetsen lezen per ${stap}.`}
        aria-valuemin={1}
        aria-valuemax={Math.max(n, 1)}
        aria-valuenow={(actief ?? n - 1) + 1}
        aria-valuetext={gekozen ? `${gekozen.tip}${vast ? ', vastgezet' : ''}` : `Geen ${stap} gekozen`}
        tabIndex={0}
        onKeyDown={opToets}
        onPointerLeave={laatLos}
        className="outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        data-testid={`dagreeks-${idBasis}`}
        data-vast={vast ? 'ja' : 'nee'}
      >
        {/* Strook met markeringen, boven het veld. */}
        <div className="flex" style={{ height: strook }}>
          {kolommen.map((k) => (
            <div key={k.dag} className="flex min-w-0 flex-1 justify-center overflow-visible">
              {k.markering && (
                <span data-soort="markering" className="flex justify-center overflow-visible">
                  <MarkeringTeken soort={k.markering.soort} maat={tekenMaat} />
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="relative flex border-b border-[var(--border-md)]" style={{ height: veld }}>
          {!compact && (
            <>
              <span aria-hidden className="absolute inset-x-0 top-0 border-t border-[var(--border-ed)]" />
              <span aria-hidden className="absolute inset-x-0 top-1/2 border-t border-dashed border-[var(--border-ed)]" />
            </>
          )}

          {kolommen.map((k, index) => {
            const isActief = actief === index
            const isVast = isActief && vast
            return (
              <div
                key={k.dag}
                // Een vastgezette kolom heeft een eigen omlijning: zo is te zien
                // waarom de andere kolommen niet meer op de muis reageren.
                className={`relative h-full min-w-0 flex-1 cursor-pointer ${isActief ? 'bg-[var(--subtle)]' : ''} ${
                  isVast ? 'outline outline-1 -outline-offset-1 outline-[var(--ink)]' : ''
                }`}
                data-dag={k.dag}
                data-tip={k.tip}
                data-actief={isActief ? 'ja' : undefined}
                data-vastgezet={isVast ? 'ja' : undefined}
                onPointerEnter={(e) => {
                  // Een vinger "wijst" niet aan: bij aanraken telt alleen de tik.
                  if (e.pointerType !== 'touch') wijsAan(index)
                }}
                onClick={() => zetVast(index)}
              >
                {k.markering && (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-1/2 border-l border-dashed border-[var(--ink-2)] opacity-60"
                  />
                )}
                {k.soort === 'niet-gemeten' && (
                  <span aria-hidden data-soort="niet-gemeten" className="absolute inset-x-[12%] inset-y-0" style={arcering} />
                )}
                {k.soort === 'lopend' && (
                  <span
                    aria-hidden
                    data-soort="lopend"
                    className="absolute inset-x-[12%] bottom-0 border border-b-0 border-dashed border-[var(--ink-3)] bg-[var(--paper)]"
                    style={{ height: `${k.hoogte}%`, minHeight: 3 }}
                  />
                )}
                {k.soort === 'waarde' && (
                  <span
                    aria-hidden
                    data-soort="waarde"
                    className="absolute inset-x-[12%] bottom-0"
                    style={{ height: `${k.hoogte}%`, minHeight: 2, background: isActief ? 'var(--ink)' : kleur }}
                  />
                )}
              </div>
            )
          })}

          {/* Het label van een grens staat in de legenda, niet in het veld. */}
          {referenties.map((r) => (
            <span
              key={r.label}
              aria-hidden
              data-soort="referentie"
              data-streep={r.streep}
              className={`pointer-events-none absolute inset-x-0 border-t border-[var(--ink-2)] ${STREEP_KLASSE[r.streep]}`}
              style={{ bottom: `${r.hoogte}%` }}
            />
          ))}
        </div>
      </div>

      {/* Vaste hoogte: de pagina verspringt niet bij het aanwijzen. Drie regels
          in de compacte grafiek: een dag met toelichting én ingrepen past er dan
          in. De schermlezer leest de waarde van de schuifregelaar; deze regel
          is de zichtbare vorm daarvan. */}
      <p
        aria-hidden
        data-testid={`uitlezing-${idBasis}`}
        className={`mt-1.5 overflow-hidden font-mono text-[11px] leading-snug tabular-nums ${
          compact ? 'h-[2.9rem]' : 'min-h-[2.2rem]'
        } ${gekozen ? 'text-[var(--ink-2)]' : 'text-[var(--ink-meta)]'}`}
      >
        {gekozen ? (
          <>
            {/* "Vastgezet" staat vooraan: achteraan valt het als eerste weg. */}
            {vast && <span className="text-[var(--ink-meta)]">vastgezet · </span>}
            <span className="font-semibold text-[var(--ink)]">{gekozen.label}</span>
            {' · '}
            {gekozen.waarde}
            {gekozen.toelichting && ` · ${gekozen.toelichting}`}
            {gekozen.markering && (
              <>
                {' · '}
                <span className="inline-flex items-center gap-1 align-baseline">
                  <MarkeringTeken soort={gekozen.markering.soort} maat={7} />
                  {gekozen.markering.tekst}
                </span>
              </>
            )}
            {vast && !compact && (
              <span className="text-[var(--ink-meta)]"> · klik opnieuw of Esc om los te laten</span>
            )}
          </>
        ) : compact ? (
          `Wijs een ${stap} aan of tik erop.`
        ) : (
          `Wijs een ${stap} aan of tik erop. Klikken zet de ${stap} vast; de pijltjestoetsen lopen per ${stap}.`
        )}
      </p>
    </div>
  )
}
