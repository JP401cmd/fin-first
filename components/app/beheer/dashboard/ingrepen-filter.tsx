'use client'

import { useState, type ReactNode } from 'react'

/**
 * Filter boven de ingrepen: alles, alleen releases of alleen beheeracties, en
 * voor lange lijsten "toon alle".
 *
 * De rijen zelf blijven op de server gerenderd. Dit onderdeel zet alleen twee
 * kenmerken op de omhullende laag; de rijen verbergen zichzelf daarop met CSS
 * (`data-soort` en `data-rest` op de rij). Zo blijft de tabel één tabel, met
 * één kop, en rekent de browser niets uit.
 *
 * EEN SOORTFILTER TOONT ALTIJD ALLE RIJEN VAN DIE SOORT. "De eerste reeks" is
 * geteld over alle ingrepen samen. Bleef die grens gelden onder een soortfilter,
 * dan zou "Beheeracties 19" één rij tonen: alleen de beheeracties die toevallig
 * tussen de twaalf meest recente ingrepen staan. De grens geldt daarom alleen
 * voor "Alles".
 *
 * Wat een rij daarvoor draagt, staat in `ingrepen-klassen.ts`.
 */

export type IngreepToon = 'alles' | 'release' | 'beheeractie'

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]'

const LABEL: Record<IngreepToon, string> = {
  alles: 'Alles',
  release: 'Releases',
  beheeractie: 'Beheeracties',
}

const IN_WOORDEN: Record<Exclude<IngreepToon, 'alles'>, [enkel: string, meer: string]> = {
  release: ['release', 'releases'],
  beheeractie: ['beheeractie', 'beheeracties'],
}

export function IngrepenFilter({
  releases,
  beheeracties,
  eersteReeks,
  naam,
  children,
}: {
  releases: number
  beheeracties: number
  /** Hoeveel rijen er staan voordat je "toon alle" kiest; `null` = geen grens. */
  eersteReeks: number | null
  /** Waar het filter over gaat, voor de toegankelijke naam. */
  naam: string
  children: ReactNode
}) {
  const [toon, setToon] = useState<IngreepToon>('alles')
  const [alles, setAlles] = useState(false)

  const totaal = releases + beheeracties
  const aantal: Record<IngreepToon, number> = { alles: totaal, release: releases, beheeractie: beheeracties }
  const heeftRest = eersteReeks !== null && totaal > eersteReeks
  // Beide soorten aanwezig: anders valt er niets te kiezen.
  const teKiezen = releases > 0 && beheeracties > 0
  const soortGekozen = toon !== 'alles'
  // De grens van de eerste reeks geldt alleen zonder soortfilter.
  const begrensd = heeftRest && !alles && !soortGekozen

  return (
    <div className="group/ingrepen" data-toon={toon} data-alles={begrensd ? 'nee' : 'ja'}>
      {(teKiezen || heeftRest) && (
        <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label={`Filter ${naam}`}>
          {teKiezen &&
            (Object.keys(LABEL) as IngreepToon[]).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={toon === t}
                onClick={() => setToon(t)}
                data-testid={`ingrepen-toon-${t}`}
                className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap border px-3 py-1.5 text-sm transition-colors ${FOCUS} ${
                  toon === t
                    ? 'border-[var(--ink)] bg-[var(--ink)] font-medium text-[var(--paper)]'
                    : 'border-[var(--border-ed)] text-[var(--ink-2)] hover:border-[var(--border-md)] hover:text-[var(--ink)]'
                }`}
              >
                {LABEL[t]} <span className="font-mono text-xs tabular-nums opacity-80">{aantal[t]}</span>
              </button>
            ))}
          {heeftRest && !soortGekozen && (
            <button
              type="button"
              aria-expanded={alles}
              onClick={() => setAlles((v) => !v)}
              data-testid="ingrepen-alles"
              className={`inline-flex min-h-11 items-center px-1 text-sm text-[var(--ink-2)] underline decoration-[var(--border-md)] underline-offset-2 hover:text-[var(--ink)] ${FOCUS} ${teKiezen ? 'ml-auto' : ''}`}
            >
              {alles ? `Toon de ${eersteReeks} meest recente` : `Toon alle ${totaal}`}
            </button>
          )}
        </div>
      )}
      <p aria-live="polite" className="sr-only" data-testid="ingrepen-melding">
        {toon !== 'alles'
          ? `${aantal[toon]} ${IN_WOORDEN[toon][aantal[toon] === 1 ? 0 : 1]}, allemaal in beeld`
          : begrensd
            ? `De ${eersteReeks} meest recente van ${totaal} ingrepen in beeld`
            : `Alle ${totaal} ingrepen in beeld`}
        .
      </p>
      {children}
    </div>
  )
}
