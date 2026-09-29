import type { DagMarkering } from '@/lib/beheer/dashboard/ingrepen'
import { dagLabel } from '@/lib/beheer/dashboard/tijd'
import { mooieMax } from '@/components/app/beheer/gebruik/opmaak'
import { ARCERING_STIJL, Td, Th } from '@/components/app/beheer/gebruik/grafieken'
import { NEUTRALE_REEKS } from '@/components/app/beheer/gebruik/palet'
import { DagReeksVeld, type VeldKolom, type VeldReferentie } from './dag-reeks-veld'
import { MarkeringTeken } from './markering-teken'
import { getal } from './opmaak'

/**
 * Kolommen per dag, met markeringen voor ingrepen.
 *
 * Twee lagen. Dit bestand is de serverkant: het rekent de schaal uit, maakt elke
 * waarde op en levert de assen, de legenda en de tabelweergave. Het veld zelf
 * (`dag-reeks-veld.tsx`) draait in de browser en doet alleen het aanwijzen: het
 * krijgt kant-en-klare tekst en rekent niets uit.
 *
 * Opgebouwd uit HTML-blokken en niet uit één meeschalende SVG: de grafiek is op
 * een telefoon 300 pixels breed en op een breed scherm ruim 1000. Een SVG die
 * meeschaalt, maakt markeringen en lijnen dan drie keer zo groot of zo klein;
 * hier houden ze op elke breedte dezelfde maat.
 *
 * Vier dingen die hier structureel geborgd zijn:
 *  - een niet-gemeten dag (`waarde: null`) wordt NOOIT als 0 getekend, maar als
 *    gearceerd vlak over de volle hoogte;
 *  - de dag van vandaag loopt nog en krijgt een open kolom met een onderbroken
 *    rand in plaats van een gevulde;
 *  - een ingreep is een markering BOVEN de kolom, geen kleur van de kolom: de
 *    grafiek toont dat twee dingen samenvallen, niet dat het één het ander
 *    veroorzaakt;
 *  - elke dag is aan te wijzen en elke grafiek heeft een tabelweergave.
 */

export interface ReeksPunt {
  dag: string
  /** `null` = niet gemeten. */
  waarde: number | null
  /** De dag loopt nog. */
  lopend?: boolean
  /** Extra regel in de uitlezing en de tabel, bv. "812 metingen". */
  toelichting?: string
}

export interface Referentielijn {
  waarde: number
  label: string
  /** Streepvorm, zodat twee grenzen ook zonder kleur uit elkaar te houden zijn. */
  streep: 'lang' | 'kort'
}

const STREEP_KLASSE: Record<Referentielijn['streep'], string> = {
  lang: 'border-dashed',
  kort: 'border-dotted',
}

/** Vanaf hoeveel releases op één dag de uitlezing ze telt in plaats van opsomt. */
const RELEASES_BIJ_NAAM = 2

/**
 * De ingrepen van een dag in woorden. `kort` is voor de uitlezing onder de
 * grafiek: die heeft één of twee regels, en zes versienummers op een rij
 * drukken de waarde van de dag uit beeld. De tabelweergave noemt ze allemaal.
 */
function markeringTekst(m: DagMarkering, kort = false): string {
  const delen =
    kort && m.releases.length > RELEASES_BIJ_NAAM ? [`${m.releases.length} releases`] : [...m.releases]
  if (m.beheeracties > 0) {
    delen.push(`${m.beheeracties} ${m.beheeracties === 1 ? 'beheeractie' : 'beheeracties'}`)
  }
  return delen.join(', ')
}

/**
 * De tabel onder een grafiek. Eigen uitklap en niet die van /beheer/gebruik:
 * deze is ook op een telefoon 44 pixels hoog.
 */
function TabelUitklap({ children }: { children: React.ReactNode }) {
  return (
    <details className="group mt-1">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] lg:min-h-9">
        Toon als tabel
      </summary>
      <div className="mt-1 overflow-x-auto">{children}</div>
    </details>
  )
}

export function DagReeks({
  punten,
  markeringen = [],
  referenties = [],
  omschrijving,
  idBasis,
  waardeTekst = getal,
  eenheid,
  schaalMax,
  hoogte,
  compact = false,
  tabelKop = 'Aantal',
}: {
  punten: readonly ReeksPunt[]
  markeringen?: readonly DagMarkering[]
  /** Vaste grenzen uit de bron, als horizontale lijnen. */
  referenties?: readonly Referentielijn[]
  /** Toegankelijke omschrijving van de grafiek. */
  omschrijving: string
  /** Stabiele, unieke naam voor de grafiek (test-id). */
  idBasis: string
  waardeTekst?: (n: number) => string
  /** Eenheid achter de waarde in de uitlezing, bv. "voorvallen". */
  eenheid?: string
  /** Bovenkant van de y-as; standaard een ronde waarde boven het maximum. */
  schaalMax?: number
  /** Hoogte van het veld in pixels. */
  hoogte?: number
  /** Zonder assen, legenda en tabel: voor in een kerncijfer. */
  compact?: boolean
  tabelKop?: string
}) {
  const n = punten.length
  if (n === 0) {
    return <p className="py-4 text-sm italic text-[var(--ink-3)]">Geen dagen in deze periode.</p>
  }

  const gemeten = punten.flatMap((p) => (p.waarde === null ? [] : [p.waarde]))
  const hoogsteWaarde = Math.max(0, ...gemeten, ...referenties.map((r) => r.waarde))
  const max = schaalMax ?? mooieMax(hoogsteWaarde)
  const schaal = max > 0 ? max : 1
  const veld = hoogte ?? (compact ? 48 : 160)
  const strook = compact ? 9 : 14
  const tekenMaat = compact ? 7 : 9
  const procent = (waarde: number) => (Math.min(Math.max(waarde, 0), schaal) / schaal) * 100

  const opDag = new Map(markeringen.map((m) => [m.dag, m]))
  const getoond = punten.flatMap((p) => {
    const m = opDag.get(p.dag)
    return m ? [m] : []
  })
  const heeftNietGemeten = punten.some((p) => p.waarde === null)
  const heeftLopend = punten.some((p) => p.lopend)
  const heeftReleases = getoond.some((m) => m.releases.length > 0)
  const heeftActies = getoond.some((m) => m.beheeracties > 0 && m.releases.length === 0)

  // Alles wat het veld toont, wordt hier opgemaakt: het veld draait in de
  // browser en krijgt geen functies mee.
  const kolommen: VeldKolom[] = punten.map((p) => {
    const m = opDag.get(p.dag)
    const waarde =
      p.waarde === null
        ? 'niet gemeten'
        : `${waardeTekst(p.waarde)}${eenheid ? ` ${eenheid}` : ''}${p.lopend ? ' (vandaag, loopt nog)' : ''}`
    const markering = m
      ? {
          soort: m.releases.length > 0 ? ('release' as const) : ('beheeractie' as const),
          tekst: markeringTekst(m, true),
        }
      : null
    const label = dagLabel(p.dag)
    return {
      dag: p.dag,
      label,
      soort: p.waarde === null ? 'niet-gemeten' : p.waarde <= 0 ? 'leeg' : p.lopend ? 'lopend' : 'waarde',
      hoogte: p.waarde === null ? 0 : procent(p.waarde),
      waarde,
      toelichting: p.toelichting ?? null,
      markering,
      tip: [`${label}: ${waarde}`, p.toelichting, markering?.tekst].filter(Boolean).join(' · '),
    }
  })
  const lijnen: VeldReferentie[] = referenties.map((r) => ({
    hoogte: procent(r.waarde),
    label: r.label,
    streep: r.streep,
  }))

  const grafiek = (
    <DagReeksVeld
      kolommen={kolommen}
      referenties={lijnen}
      omschrijving={omschrijving}
      idBasis={idBasis}
      veld={veld}
      strook={strook}
      tekenMaat={tekenMaat}
      compact={compact}
      kleur={NEUTRALE_REEKS}
      arcering={ARCERING_STIJL}
    />
  )

  if (compact) return grafiek

  return (
    <figure className="m-0">
      <div className="flex items-start gap-2">
        {/* De bovenste waarde staat op de hoogte van de bovenste rasterlijn,
            onder de strook met markeringen. */}
        <div
          aria-hidden
          className="relative w-12 shrink-0 font-mono text-[10px] tabular-nums text-[var(--ink-meta)]"
          style={{ height: strook + veld }}
        >
          <span className="absolute right-0 -translate-y-1/2" style={{ top: strook }}>
            {waardeTekst(max)}
          </span>
          <span className="absolute bottom-0 right-0 translate-y-1/2">{waardeTekst(0)}</span>
        </div>
        {grafiek}
      </div>
      <figcaption className="ml-14 mt-1 space-y-1 font-mono text-[10px] text-[var(--ink-meta)]">
        <div className="flex justify-between gap-2 tabular-nums">
          <span>{dagLabel(punten[0].dag)}</span>
          <span>{dagLabel(punten[n - 1].dag)}</span>
        </div>
        {(heeftReleases || heeftActies || heeftNietGemeten || heeftLopend || referenties.length > 0) && (
          <ul className="flex flex-wrap gap-x-4 gap-y-0.5">
            {referenties.map((r) => (
              <li key={r.label} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={`inline-block w-5 border-t border-[var(--ink-2)] ${STREEP_KLASSE[r.streep]}`}
                />
                {r.label}
              </li>
            ))}
            {heeftReleases && (
              <li className="inline-flex items-center gap-1">
                <MarkeringTeken soort="release" maat={8} />
                release
              </li>
            )}
            {heeftActies && (
              <li className="inline-flex items-center gap-1">
                <MarkeringTeken soort="beheeractie" maat={8} />
                beheeractie
              </li>
            )}
            {heeftLopend && <li>open kolom = vandaag, loopt nog</li>}
            {heeftNietGemeten && <li>gearceerd = niet gemeten</li>}
          </ul>
        )}
      </figcaption>

      <TabelUitklap>
        <table className="w-full min-w-[20rem] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-ed)]">
              <Th>Dag</Th>
              <Th rechts>{tabelKop}</Th>
              <Th>Ingreep op die dag</Th>
            </tr>
          </thead>
          <tbody>
            {[...punten].reverse().map((p) => {
              const m = opDag.get(p.dag)
              return (
                <tr key={p.dag} className="border-b border-dotted border-[var(--border-ed)]">
                  <Td>
                    {dagLabel(p.dag)}
                    {p.lopend && <span className="ml-1.5 text-xs italic text-[var(--ink-3)]">loopt nog</span>}
                  </Td>
                  <Td rechts>
                    {p.waarde === null ? (
                      <span className="italic text-[var(--ink-3)]">niet gemeten</span>
                    ) : (
                      waardeTekst(p.waarde)
                    )}
                    {p.toelichting && <span className="ml-1.5 text-[var(--ink-3)]">{p.toelichting}</span>}
                  </Td>
                  <Td>{m ? <span className="text-xs">{markeringTekst(m)}</span> : null}</Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TabelUitklap>
    </figure>
  )
}
