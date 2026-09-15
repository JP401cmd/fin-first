'use client'

/**
 * RegelEditor — de regelrijen van een doelgroep (ADR 0147).
 *
 * Gedeeld door de verspreiding-sheet (modus "Op regels") en de sheet voor een
 * dynamische gebruikersgroep, zodat beide exact dezelfde regels schrijven: de
 * discriminated union `Regel` uit `lib/questionnaires/verspreiding.ts`. Alle
 * regels gelden samen (én).
 *
 * De client-side grenzen spiegelen het zod-schema, zodat een invoer niet pas
 * bij opslaan afketst. `dominante_stroom` verwijst naar een stroom-ID (niet de
 * naam): hernoemen breekt geen regel, een verwijderde stroom laat een regel
 * achter die niemand meer matcht.
 */

import Link from 'next/link'
import { X } from 'lucide-react'
import { REGELS_MAX, REGEL_SOORTEN, type Regel, type RegelSoort } from '@/lib/questionnaires/verspreiding'

export interface StroomKeuze {
  id: string
  naam: string
}

const REGEL_LABEL: Record<RegelSoort, string> = {
  dagen_sinds_registratie: 'Dagen sinds registratie ≥',
  actieve_dagen_30: 'Actieve dagen in 30 dagen ≥',
  laatst_actief_binnen: 'Laatst actief binnen … dagen',
  dominante_stroom: 'Dominante waardestroom is …',
}

/** Grenzen uit het zod-schema, zodat de invoer niet pas bij opslaan afketst. */
export const REGEL_GRENS: Record<RegelSoort, { min: number; max: number }> = {
  dagen_sinds_registratie: { min: 0, max: 3650 },
  actieve_dagen_30: { min: 1, max: 30 },
  laatst_actief_binnen: { min: 1, max: 365 },
  dominante_stroom: { min: 1, max: 30 },
}

function begrens(soort: RegelSoort, waarde: number): number {
  const { min, max } = REGEL_GRENS[soort]
  return Math.min(Math.max(Math.round(Number.isFinite(waarde) ? waarde : min), min), max)
}

/** De numerieke waarde van een niet-stroomregel, ongeacht hoe het veld heet. */
function regelWaarde(regel: Regel): number {
  switch (regel.soort) {
    case 'laatst_actief_binnen':
      return regel.dagen
    case 'dominante_stroom':
      return regel.min_dagen ?? 1
    default:
      return regel.min
  }
}

/** Bouw een regel van een soort — het veld verschilt per soort. */
function maakRegel(soort: RegelSoort, waarde: number, stromen: readonly StroomKeuze[]): Regel {
  const veilig = begrens(soort, waarde)
  switch (soort) {
    case 'laatst_actief_binnen':
      return { soort, dagen: veilig }
    case 'dominante_stroom':
      return { soort, stroom: stromen[0]?.id ?? '' }
    default:
      return { soort, min: veilig }
  }
}

const VELD_CLASS =
  'w-24 border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 font-mono text-xs tabular-nums text-[var(--ink)] focus:border-[var(--border-md)] focus:outline-none'

const SELECT_CLASS =
  'border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 text-xs text-[var(--ink-2)] focus:outline-none'

export function RegelEditor({
  regels,
  onChange,
  stromen,
  legeTekst = 'Nog geen regels — zonder regel valt niemand erin.',
}: {
  regels: Regel[]
  onChange: (regels: Regel[]) => void
  /** De waardestromen uit beheer; leeg = de stroomregel is niet te kiezen. */
  stromen: readonly StroomKeuze[]
  legeTekst?: string
}) {
  const geenStromen = stromen.length === 0

  const vervang = (i: number, regel: Regel) => onChange(regels.map((r, j) => (j === i ? regel : r)))

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--ink-3)]">Alle regels moeten kloppen (én).</p>

      {regels.length === 0 && <p className="text-xs text-[var(--ink-4)]">{legeTekst}</p>}

      {regels.map((regel, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <select
            aria-label={`Regel ${i + 1} — soort`}
            value={regel.soort}
            onChange={(e) => {
              const soort = e.target.value as RegelSoort
              vervang(i, maakRegel(soort, regelWaarde(regel), stromen))
            }}
            className={SELECT_CLASS}
          >
            {REGEL_SOORTEN.map((soort) => {
              const uit = soort === 'dominante_stroom' && geenStromen && regel.soort !== soort
              return (
                <option key={soort} value={soort} disabled={uit}>
                  {REGEL_LABEL[soort]}
                  {uit ? ' (stel eerst waardestromen in)' : ''}
                </option>
              )
            })}
          </select>

          {regel.soort === 'dominante_stroom' ? (
            <>
              <select
                aria-label={`Regel ${i + 1} — stroom`}
                value={regel.stroom}
                onChange={(e) => vervang(i, { ...regel, stroom: e.target.value })}
                className={SELECT_CLASS}
              >
                {!stromen.some((s) => s.id === regel.stroom) && (
                  <option value={regel.stroom} disabled>
                    {regel.stroom ? `${regel.stroom} (bestaat niet meer)` : 'Kies een stroom'}
                  </option>
                )}
                {stromen.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.naam}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-[var(--ink-3)]">
                minstens
                <input
                  type="number"
                  aria-label={`Regel ${i + 1} — minstens dagen`}
                  value={regel.min_dagen ?? ''}
                  placeholder="—"
                  min={REGEL_GRENS.dominante_stroom.min}
                  max={REGEL_GRENS.dominante_stroom.max}
                  onChange={(e) => {
                    const ruw = e.target.value
                    const zonder = { soort: regel.soort, stroom: regel.stroom }
                    vervang(
                      i,
                      ruw === ''
                        ? zonder
                        : { ...zonder, min_dagen: begrens('dominante_stroom', Number(ruw)) },
                    )
                  }}
                  className={`${VELD_CLASS} w-16`}
                />
                dagen
              </label>
            </>
          ) : (
            <input
              type="number"
              aria-label={`Regel ${i + 1} — waarde`}
              value={regelWaarde(regel)}
              min={REGEL_GRENS[regel.soort].min}
              max={REGEL_GRENS[regel.soort].max}
              onChange={(e) => vervang(i, maakRegel(regel.soort, Number(e.target.value), stromen))}
              className={VELD_CLASS}
            />
          )}

          <button
            type="button"
            aria-label={`Regel ${i + 1} verwijderen`}
            onClick={() => onChange(regels.filter((_, j) => j !== i))}
            className="text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      {geenStromen && (
        <p className="text-[11px] text-[var(--ink-4)]">
          De regel &lsquo;dominante waardestroom&rsquo; kan pas als er waardestromen zijn —{' '}
          <Link href="/beheer/waardestromen" className="underline underline-offset-2 hover:text-[var(--ink-2)]">
            stel eerst waardestromen in
          </Link>
          .
        </p>
      )}

      {regels.length < REGELS_MAX && (
        <button
          type="button"
          onClick={() => onChange([...regels, maakRegel('dagen_sinds_registratie', 7, stromen)])}
          className="border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 text-xs text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
        >
          + Regel
        </button>
      )}
    </div>
  )
}
