'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { getal } from './opmaak'

/**
 * De foutsoorten van de gekozen periode, te sorteren en te filteren.
 *
 * Drie vragen, drie volgordes:
 *  - wat komt het vaakst voor (voorvallen);
 *  - wat raakt de meeste gebruikers (een fout die honderd keer bij één gebruiker
 *    optreedt, staat dan lager dan een fout die tien gebruikers elk één keer
 *    raakte);
 *  - wat is het laatst gezien.
 *
 * Het aantal gebruikers is een ondergrens zodra er voorvallen zonder gebruiker
 * zijn of het leesvenster de periode niet dekt; de regel zegt dat dan ("min.").
 *
 * De rijen komen geteld van de server; hier wordt alleen geordend.
 */

export interface VeroorzakerRij {
  signature: string
  /** Nieuwste voorval, ingekort. */
  voorbeeld: string
  context: string | null
  stand: 'teruggekomen' | 'open' | 'afgehandeld'
  voorvallen: number
  /** Verschillende gebruikers (ondergrens). */
  gebruikers: number
  zonderGebruiker: number
  /** ISO-tijdstempel, om op te sorteren. */
  laatstGezien: string
  /** Hetzelfde moment, opgemaakt in Nederlandse tijd. */
  laatstGezienTekst: string
  href: string
}

type Volgorde = 'voorvallen' | 'gebruikers' | 'recent'

const VOLGORDE_LABEL: Record<Volgorde, string> = {
  voorvallen: 'Meeste voorvallen',
  gebruikers: 'Meeste gebruikers',
  recent: 'Laatst gezien',
}

const STAND_LABEL: Record<VeroorzakerRij['stand'], string> = {
  teruggekomen: 'teruggekomen',
  open: 'open',
  afgehandeld: 'afgehandeld',
}

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]'

function vergelijk(volgorde: Volgorde) {
  return (a: VeroorzakerRij, b: VeroorzakerRij): number => {
    const opVoorvallen = b.voorvallen - a.voorvallen
    switch (volgorde) {
      case 'gebruikers':
        return b.gebruikers - a.gebruikers || opVoorvallen || a.signature.localeCompare(b.signature)
      case 'recent':
        return Date.parse(b.laatstGezien) - Date.parse(a.laatstGezien) || opVoorvallen
      case 'voorvallen':
      default:
        return opVoorvallen || b.gebruikers - a.gebruikers || a.signature.localeCompare(b.signature)
    }
  }
}

export function VeroorzakersLijst({
  rijen,
  dagen,
  standaardAantal,
  vensterOnvolledig,
}: {
  rijen: readonly VeroorzakerRij[]
  dagen: number
  /** Hoeveel rijen er staan voordat je "toon alle" kiest. */
  standaardAantal: number
  /** Het leesvenster dekt de periode niet: elk aantal is een ondergrens. */
  vensterOnvolledig: boolean
}) {
  const [volgorde, setVolgorde] = useState<Volgorde>('voorvallen')
  const [alleenOpen, setAlleenOpen] = useState(false)
  const [alles, setAlles] = useState(false)

  const aantalOpen = rijen.filter((r) => r.stand !== 'afgehandeld').length
  const geordend = useMemo(
    () => rijen.filter((r) => !alleenOpen || r.stand !== 'afgehandeld').sort(vergelijk(volgorde)),
    [rijen, alleenOpen, volgorde],
  )
  const getoond = alles ? geordend : geordend.slice(0, standaardAantal)
  // De balk volgt de maat waarop gesorteerd is; bij "laatst gezien" de voorvallen.
  const maat = (r: VeroorzakerRij) => (volgorde === 'gebruikers' ? r.gebruikers : r.voorvallen)
  const hoogste = Math.max(1, ...geordend.map(maat))

  return (
    <div data-testid="veroorzakers-blok">
      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Sorteer en filter de foutsoorten">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-meta)]">Sorteer op</span>
        {(Object.keys(VOLGORDE_LABEL) as Volgorde[]).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={volgorde === v}
            onClick={() => setVolgorde(v)}
            data-testid={`sorteer-${v}`}
            className={`inline-flex min-h-11 items-center whitespace-nowrap border px-3 py-1.5 text-sm transition-colors ${FOCUS} ${
              volgorde === v
                ? 'border-[var(--ink)] font-medium text-[var(--ink)]'
                : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)]'
            }`}
          >
            {VOLGORDE_LABEL[v]}
          </button>
        ))}
        <span aria-hidden className="mx-1 hidden h-6 w-px bg-[var(--border-ed)] sm:block" />
        <button
          type="button"
          aria-pressed={alleenOpen}
          onClick={() => setAlleenOpen((v) => !v)}
          data-testid="alleen-open"
          className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap border px-3 py-1.5 text-sm transition-colors ${FOCUS} ${
            alleenOpen
              ? 'border-[var(--ink)] bg-[var(--ink)] font-medium text-[var(--paper)]'
              : 'border-[var(--border-ed)] text-[var(--ink-2)] hover:border-[var(--border-md)] hover:text-[var(--ink)]'
          }`}
        >
          Alleen open <span className="font-mono text-xs tabular-nums opacity-80">{aantalOpen}</span>
        </button>
      </div>

      <p aria-live="polite" className="sr-only">
        {geordend.length} {geordend.length === 1 ? 'foutsoort' : 'foutsoorten'}, gesorteerd op{' '}
        {VOLGORDE_LABEL[volgorde].toLowerCase()}
        {alleenOpen ? ', alleen open' : ''}.
      </p>

      {geordend.length === 0 ? (
        <p className="border border-dashed border-[var(--border-ed)] bg-[var(--paper)] px-4 py-6 text-sm text-[var(--ink-2)]">
          Geen open foutsoorten met voorvallen in de laatste {dagen} dagen.
        </p>
      ) : (
        <ol className="space-y-2" data-testid="veroorzakers">
          {getoond.map((r) => {
            const ondergrens = vensterOnvolledig || r.zonderGebruiker > 0
            return (
              <li
                key={r.signature}
                data-soort={r.signature}
                className="grid gap-x-6 gap-y-1 border-b border-dotted border-[var(--border-ed)] pb-2 sm:grid-cols-2 sm:items-center"
              >
                <div className="min-w-0">
                  <Link
                    href={r.href}
                    className={`flex min-h-11 items-center text-sm text-[var(--ink)] underline decoration-[var(--border-md)] underline-offset-2 hover:decoration-[var(--ink-3)] lg:min-h-9 ${FOCUS}`}
                  >
                    <span className="truncate">{r.voorbeeld}</span>
                  </Link>
                  <p className="font-mono text-[11px] text-[var(--ink-3)]">
                    {r.context ?? 'zonder context'} · {STAND_LABEL[r.stand]} · laatst {r.laatstGezienTekst}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* De balk krijgt wat er naast het getal over is; het getal krimpt niet. */}
                  <span className="flex min-w-0 flex-1">
                    <span
                      aria-hidden
                      className="block h-3 bg-[var(--ink-3)]"
                      style={{ width: `${Math.max((maat(r) / hoogste) * 100, 1)}%` }}
                    />
                  </span>
                  <span className="w-[10.5rem] shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-[var(--ink-2)]">
                    {vensterOnvolledig ? 'min. ' : ''}
                    {getal(r.voorvallen)}×
                    <span className="ml-1.5 text-[var(--ink-3)]">
                      {r.gebruikers > 0
                        ? `${ondergrens ? 'min. ' : ''}${getal(r.gebruikers)} gebr.`
                        : 'gebr. onbekend'}
                    </span>
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {geordend.length > standaardAantal && (
        <button
          type="button"
          onClick={() => setAlles((v) => !v)}
          aria-expanded={alles}
          data-testid="veroorzakers-alles"
          className={`mt-1 inline-flex min-h-11 items-center text-sm text-[var(--ink-2)] underline decoration-[var(--border-md)] underline-offset-2 hover:text-[var(--ink)] ${FOCUS}`}
        >
          {alles
            ? `Toon de eerste ${standaardAantal}`
            : `Toon alle ${geordend.length} foutsoorten met voorvallen in deze periode`}
        </button>
      )}
    </div>
  )
}
