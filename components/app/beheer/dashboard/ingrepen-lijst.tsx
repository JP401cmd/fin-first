import Link from 'next/link'
import { SlidersHorizontal, Tag } from 'lucide-react'
import type { EffectMeting, Ingreep } from '@/lib/beheer/dashboard/ingrepen'
import { dagLabel, periodeLabel } from '@/lib/beheer/dashboard/tijd'
import { formatAmsterdamTime } from '@/lib/tz'
import { Td, Th } from '@/components/app/beheer/gebruik/grafieken'
import { INGREEP_RIJ_KLASSEN } from './ingrepen-klassen'
import { getal, verschilTekst } from './opmaak'

/**
 * Ingrepen als tijdlijn en als vóór/na-tabel.
 *
 * De tabel zegt wat er rond een ingreep te zien was. Zij beweert niet dat de
 * ingreep de oorzaak is: die kanttekening staat bij de tabel, en een week met
 * meer dan één ingreep wordt als zodanig gemerkt.
 */

function SoortIcoon({ soort }: { soort: Ingreep['soort'] }) {
  const Icoon = soort === 'release' ? Tag : SlidersHorizontal
  return <Icoon aria-hidden className="h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]" />
}

const SOORT_LABEL: Record<Ingreep['soort'], string> = { release: 'Release', beheeractie: 'Beheeractie' }

function wanneer(i: Ingreep): string {
  return i.moment ? `${dagLabel(i.dag)} ${formatAmsterdamTime(new Date(i.moment))}` : dagLabel(i.dag)
}

const LINK =
  'inline-flex min-h-11 items-center font-medium text-[var(--ink)] underline decoration-[var(--border-md)] underline-offset-2 hover:decoration-[var(--ink-3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] lg:min-h-9'

export function IngrepenLijst({
  ingrepen,
  leeg,
  eersteReeks = null,
}: {
  ingrepen: readonly Ingreep[]
  leeg: string
  /** Rijen voorbij dit aantal zijn "rest": een omhullend `IngrepenFilter` toont ze op verzoek. */
  eersteReeks?: number | null
}) {
  if (ingrepen.length === 0) {
    return <p className="py-3 text-sm italic text-[var(--ink-3)]">{leeg}</p>
  }
  return (
    <ol className="border-t border-[var(--border-ed)]" data-testid="ingrepen-lijst">
      {ingrepen.map((i, index) => (
        <li
          key={i.id}
          className={`flex items-center gap-3 border-b border-dotted border-[var(--border-ed)] ${INGREEP_RIJ_KLASSEN}`}
          data-soort={i.soort}
          data-rest={eersteReeks !== null && index >= eersteReeks ? 'ja' : undefined}
        >
          <span className="w-[5.5rem] shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-[var(--ink-3)]">
            {wanneer(i)}
          </span>
          <SoortIcoon soort={i.soort} />
          <span className="min-w-0 flex-1 text-sm text-[var(--ink-2)]">
            <span className="sr-only">{SOORT_LABEL[i.soort]}: </span>
            <Link href={i.href} className={LINK}>
              {i.titel}
            </Link>
            {i.toelichting && <span className="text-[var(--ink-3)]"> · {i.toelichting}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}

export interface EffectRij {
  ingreep: Ingreep
  /** Eén meting per maat, in de volgorde van `maten`. */
  metingen: EffectMeting[]
}

/** Eerst het getal, daaronder de kanttekening: zo blijft de kolom met getallen recht. */
function EffectCel({ meting }: { meting: EffectMeting }) {
  const noot = 'block font-sans text-[11px] text-[var(--ink-3)]'
  if (meting.voor.aantal === null) {
    return <span className={noot}>week ervoor niet gemeten</span>
  }
  if (meting.na.aantal === null) {
    return (
      <>
        {getal(meting.voor.aantal)} ervoor
        <span className={noot}>
          {meting.dagenNaVoorbij < meting.vensterDagen
            ? `week erna loopt nog, ${meting.dagenNaVoorbij} van ${meting.vensterDagen} dagen`
            : 'week erna niet gemeten'}
        </span>
      </>
    )
  }
  return (
    <>
      {getal(meting.voor.aantal)} → {getal(meting.na.aantal)}
      <span className={noot}>verschil {verschilTekst(meting.verschil ?? 0)}</span>
    </>
  )
}

export function EffectTabel({
  rijen,
  maten,
  eersteReeks = null,
}: {
  rijen: readonly EffectRij[]
  maten: readonly string[]
  /** Rijen voorbij dit aantal zijn "rest": een omhullend `IngrepenFilter` toont ze op verzoek. */
  eersteReeks?: number | null
}) {
  if (rijen.length === 0) {
    return <p className="py-3 text-sm italic text-[var(--ink-3)]">Geen ingrepen in deze periode.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] text-sm" data-testid="effect-tabel">
        <caption className="sr-only">
          Per ingreep de week ervoor naast de week erna. De dag van de ingreep telt bij geen van beide mee.
        </caption>
        <thead>
          <tr className="border-b border-[var(--border-ed)]">
            <Th>Ingreep</Th>
            <Th>Week ervoor · week erna</Th>
            {maten.map((m) => (
              <Th key={m} rechts>
                {m}
              </Th>
            ))}
            <Th rechts>Andere ingrepen</Th>
          </tr>
        </thead>
        <tbody>
          {rijen.map(({ ingreep, metingen }, index) => {
            const eerste = metingen[0]
            return (
              <tr
                key={ingreep.id}
                className={`border-b border-dotted border-[var(--border-ed)] hover:bg-[var(--subtle)] ${INGREEP_RIJ_KLASSEN}`}
                data-soort={ingreep.soort}
                data-rest={eersteReeks !== null && index >= eersteReeks ? 'ja' : undefined}
              >
                <Td>
                  <span className="flex items-center gap-2">
                    <SoortIcoon soort={ingreep.soort} />
                    <span>
                      <span className="sr-only">{SOORT_LABEL[ingreep.soort]}: </span>
                      <Link href={ingreep.href} className={LINK}>
                        {ingreep.titel}
                      </Link>
                      <span className="block font-mono text-xs tabular-nums text-[var(--ink-3)]">
                        {wanneer(ingreep)}
                        {ingreep.toelichting ? ` · ${ingreep.toelichting}` : ''}
                      </span>
                    </span>
                  </span>
                </Td>
                <Td>
                  <span className="whitespace-nowrap font-mono text-xs tabular-nums text-[var(--ink-3)]">
                    {periodeLabel(eerste.voor.van, eerste.voor.tot)} · {periodeLabel(eerste.na.van, eerste.na.tot)}
                  </span>
                </Td>
                {metingen.map((m, i) => (
                  <Td key={maten[i]} rechts>
                    <EffectCel meting={m} />
                  </Td>
                ))}
                <Td rechts>
                  {eerste.samenloop === 0 ? (
                    <span className="text-[var(--ink-3)]">geen</span>
                  ) : (
                    <span title="Andere ingrepen in dezelfde twee weken: het verschil is niet aan één ingreep toe te schrijven.">
                      {getal(eerste.samenloop)}
                    </span>
                  )}
                </Td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
