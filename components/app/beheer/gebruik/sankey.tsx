import type { ReactNode } from 'react'
import type { GebruikSankey, SankeyOvergang } from '@/lib/beheer/gebruik-analyse/doorstroom'
import { KNOOP_GEEN, KNOOP_MEERDERE, KNOOP_STOPT } from '@/lib/beheer/gebruik-analyse/doorstroom'
import type { GebruikStroom } from '@/lib/beheer/gebruik-analyse/loader'
import { aandeel, celTekst, type Cel } from '@/lib/beheer/gebruik-analyse/onderdrukking'
import { ARCERING_STIJL, CelWaarde, HorizontaleBalken, Staaltje, TabelWeergave, Td, Th } from './grafieken'
import { aandeelTekst, arceringLegenda, celUitleg, gebruikersTekst } from './opmaak'
import { NEUTRALE_REEKS, reeksKleur } from './palet'

/**
 * Doorstroom per actieve dag als Sankey (ADR 0153, fase 1) — handgetekende SVG,
 * geen bibliotheek, geen client-JS.
 *
 * Kolommen = actieve dag 1…4 van een gebruiker in de band; knopen = de
 * waardestroom(en) van die dag. Eén schaal voor alle kolommen. Een onderdrukte
 * knoop (`klein`/`verborgen`) is een vaste, gearceerde balk — nooit geschaald,
 * nooit 0. Banden alleen voor overgangen die als geheel zichtbaar zijn; een
 * verborgen overgang is één neutrale gearceerde zone. "Stopt" is een donker
 * gearceerd stompje (inkt, geen stoplichtrood).
 */

const W = 1100
const KNOOP_B = 18
const LABEL_RUIMTE = 175
const KOP_H = 40
const PLOT_H = 300
const LABEL_H = 15
const KNOOP_GAT = 12
const ONDERDRUKT_H = 10
const STOMP_B = 14

const kolomX = (i: number) => (i * (W - KNOOP_B - LABEL_RUIMTE)) / 3

export function knoopNaam(knoop: string, meta: Map<string, GebruikStroom>): string {
  if (knoop === KNOOP_MEERDERE) return 'Meerdere stromen'
  if (knoop === KNOOP_GEEN) return 'Geen stroom'
  if (knoop === KNOOP_STOPT) return 'Stopt'
  return meta.get(knoop)?.naam ?? knoop
}

function knoopKleur(knoop: string, meta: Map<string, GebruikStroom>): string {
  if (knoop === KNOOP_MEERDERE) return NEUTRALE_REEKS
  if (knoop === KNOOP_GEEN) return 'var(--border-md)'
  return reeksKleur(meta.get(knoop)?.kleurIndex ?? -1)
}

interface KnoopLayout {
  stap: number
  knoop: string
  cel: Cel
  x: number
  labelY: number
  y: number
  h: number
  onderdrukt: boolean
}

function dagenLabel(aantal: number): string {
  if (aantal >= 5) return '5 of meer dagen'
  return aantal === 1 ? '1 dag' : `${aantal} dagen`
}

export function DoorstroomSankey({
  sankey,
  stromen,
  kop,
}: {
  sankey: GebruikSankey
  stromen: GebruikStroom[]
  /** De (h4-)kop, door de sectie aangeleverd. */
  kop: ReactNode
}) {
  const meta = new Map(stromen.map((s) => [s.id, s]))
  const stappen = [...sankey.stappen].sort((a, b) => a.stap - b.stap)
  const leeg = stappen.every((s) => s.totaal.soort === 'waarde' && s.totaal.n === 0)

  // Eén schaal: de grootste som van zichtbare knopen in een kolom.
  const somMax = Math.max(
    1,
    ...stappen.map((s) => s.knopen.reduce((t, k) => t + (k.gebruikers.soort === 'waarde' ? k.gebruikers.n : 0), 0)),
  )
  const schaal = PLOT_H / somMax
  const dikte = (n: number) => Math.max(n * schaal, n > 0 ? 1 : 0)

  // Layout per kolom.
  const layout = new Map<string, KnoopLayout>()
  let hoogte = KOP_H
  stappen.forEach((s, i) => {
    let y = KOP_H
    for (const k of s.knopen) {
      const c = k.gebruikers
      if (c.soort === 'waarde' && c.n === 0) continue
      const onderdrukt = c.soort !== 'waarde'
      const h = onderdrukt ? ONDERDRUKT_H : Math.max(dikte(c.n), 2)
      layout.set(`${s.stap}|${k.knoop}`, { stap: s.stap, knoop: k.knoop, cel: c, x: kolomX(i), labelY: y + 11, y: y + LABEL_H, h, onderdrukt })
      y += LABEL_H + h + KNOOP_GAT
    }
    hoogte = Math.max(hoogte, y)
  })
  hoogte += 8

  // Banden en stompjes.
  const banden: ReactNode[] = []
  const stompjes: ReactNode[] = []
  const zones: ReactNode[] = []
  const overgangen = [...sankey.overgangen].sort((a, b) => a.vanStap - b.vanStap)

  for (const o of overgangen) {
    const vanStap = stappen.find((s) => s.stap === o.vanStap)
    const naarStap = stappen.find((s) => s.stap === o.vanStap + 1)
    if (!vanStap || !naarStap) continue
    const iVan = stappen.indexOf(vanStap)
    if (!o.zichtbaar) {
      const x0 = kolomX(iVan) + LABEL_RUIMTE
      const x1 = kolomX(iVan + 1) - 10
      const midden = KOP_H + (hoogte - KOP_H) / 2
      zones.push(
        <g key={`zone-${o.vanStap}`} data-testid={`sankey-verborgen-${o.vanStap}`}>
          <rect x={x0} y={KOP_H} width={Math.max(x1 - x0, 0)} height={hoogte - KOP_H - 8} fill="url(#sankey-arcering)" opacity={0.9}>
            <title>{`Dag ${o.vanStap} → dag ${o.vanStap + 1}: doorstroom verborgen (te weinig gebruikers)`}</title>
          </rect>
          <text x={(x0 + x1) / 2} y={midden - 10} textAnchor="middle" className="sankey-tekst" fontSize="11" fill="var(--ink-2)">
            {'doorstroom verborgen '}
          </text>
          <text x={(x0 + x1) / 2} y={midden + 5} textAnchor="middle" className="sankey-tekst" fontSize="11" fill="var(--ink-3)">
            {'(te weinig '}
          </text>
          <text x={(x0 + x1) / 2} y={midden + 19} textAnchor="middle" className="sankey-tekst" fontSize="11" fill="var(--ink-3)">
            gebruikers)
          </text>
        </g>,
      )
      continue
    }
    tekenOvergang(o, vanStap.knopen.map((k) => k.knoop), naarStap.knopen.map((k) => k.knoop))
  }

  function tekenOvergang(o: SankeyOvergang, vanVolgorde: string[], naarVolgorde: string[]) {
    const uitCursor = new Map<string, number>()
    const inCursor = new Map<string, number>()
    const cellen = o.cellen.filter((c) => c.gebruikers.soort === 'waarde' && c.gebruikers.n > 0)
    // Uitgaand per bron in doelvolgorde, "stopt" als laatste.
    const doelIndex = (naar: string) => (naar === KNOOP_STOPT ? Number.MAX_SAFE_INTEGER : naarVolgorde.indexOf(naar))
    const gesorteerd = [...cellen].sort(
      (a, b) => vanVolgorde.indexOf(a.van) - vanVolgorde.indexOf(b.van) || doelIndex(a.naar) - doelIndex(b.naar),
    )
    // Inkomend per doel in bronvolgorde.
    const inkomendVolgorde = [...cellen].sort(
      (a, b) => doelIndex(a.naar) - doelIndex(b.naar) || vanVolgorde.indexOf(a.van) - vanVolgorde.indexOf(b.van),
    )
    const inOffset = new Map<string, number>()
    for (const c of inkomendVolgorde) {
      if (c.naar === KNOOP_STOPT) continue
      const doel = layout.get(`${o.vanStap + 1}|${c.naar}`)
      if (!doel) continue
      const start = inCursor.get(c.naar) ?? doel.y
      inOffset.set(`${c.van}|${c.naar}`, start)
      inCursor.set(c.naar, start + dikte((c.gebruikers as { n: number }).n))
    }
    for (const c of gesorteerd) {
      const bron = layout.get(`${o.vanStap}|${c.van}`)
      if (!bron || bron.onderdrukt) continue
      const n = (c.gebruikers as { n: number }).n
      const d = dikte(n)
      const y0 = uitCursor.get(c.van) ?? bron.y
      uitCursor.set(c.van, y0 + d)
      const x0 = bron.x + KNOOP_B
      const tip = `${knoopNaam(c.van, meta)} → ${knoopNaam(c.naar, meta)}: ${gebruikersTekst(n)}`
      if (c.naar === KNOOP_STOPT) {
        stompjes.push(
          <rect
            key={`stopt-${o.vanStap}-${c.van}`}
            x={x0}
            y={y0}
            width={STOMP_B}
            height={d}
            fill="url(#sankey-stopt)"
            data-testid="sankey-stopt"
          >
            <title>{`${knoopNaam(c.van, meta)}, dag ${o.vanStap}: ${gebruikersTekst(n)} stopt (geen volgende actieve dag)`}</title>
          </rect>,
        )
        continue
      }
      const doel = layout.get(`${o.vanStap + 1}|${c.naar}`)
      const y1 = inOffset.get(`${c.van}|${c.naar}`)
      if (!doel || doel.onderdrukt || y1 == null) continue
      const x1 = doel.x
      const xm = (x0 + x1) / 2
      banden.push(
        <path
          key={`band-${o.vanStap}-${c.van}-${c.naar}`}
          d={`M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1} L${x1},${y1 + d} C${xm},${y1 + d} ${xm},${y0 + d} ${x0},${y0 + d} Z`}
          fill={knoopKleur(c.van, meta)}
          fillOpacity={0.28}
          data-testid="sankey-band"
        >
          <title>{tip}</title>
        </path>,
      )
    }
  }

  const stapTotaal = new Map(stappen.map((s) => [s.stap, s.totaal]))
  const dagRijen = sankey.dagenVerdeling.verdeling.map((d) => {
    const a = aandeel(d.gebruikers, sankey.dagenVerdeling.totaal)
    return {
      sleutel: String(d.aantal),
      label: dagenLabel(d.aantal),
      cel: d.gebruikers,
      kleur: NEUTRALE_REEKS,
      toelichting: a ? aandeelTekst(a) : undefined,
    }
  })
  const dagMax = dagRijen.reduce((m, r) => (r.cel.soort === 'waarde' && r.cel.n > m ? r.cel.n : m), 0)
  const legendaKnopen = [...stromen.map((s) => s.id), KNOOP_MEERDERE, KNOOP_GEEN]

  return (
    <div data-testid="sankey">
      {kop}
      {leeg ? (
        <p className="border border-dashed border-[var(--border-ed)] bg-[var(--paper)] px-4 py-6 text-center text-sm italic text-[var(--ink-3)]">
          Nog geen actieve dagen in deze band.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${W} ${hoogte}`}
              className="block h-auto w-full min-w-[900px]"
              role="img"
              aria-label="Doorstroom van actieve dag 1 tot en met 4 per waardestroom"
            >
              <defs>
                <pattern id="sankey-arcering" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill="var(--paper)" />
                  <line x1="0" y1="0" x2="0" y2="6" stroke="var(--border-md)" strokeWidth="1.2" />
                </pattern>
                <pattern id="sankey-stopt" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
                  <rect width="4" height="4" fill="var(--ink-3)" />
                  <line x1="0" y1="0" x2="0" y2="4" stroke="var(--ink)" strokeWidth="1.6" />
                </pattern>
                <style>{`.sankey-tekst{paint-order:stroke;stroke:var(--paper);stroke-width:3px;stroke-linejoin:round;font-family:inherit}`}</style>
              </defs>

              {stappen.map((s, i) => (
                <g key={`kop-${s.stap}`}>
                  <text x={kolomX(i)} y={14} fontSize="12" fontWeight="600" fill="var(--ink)">
                    {`Dag ${s.stap}`}
                  </text>
                  <text x={kolomX(i)} y={30} fontSize="11" fill="var(--ink-3)" className="font-mono">
                    {s.totaal.soort === 'waarde' ? `${celTekst(s.totaal)} gebruikers` : `totaal ${celTekst(s.totaal)}`}
                    <title>{celUitleg(s.totaal) ?? `${celTekst(s.totaal)} gebruikers met minstens ${s.stap} actieve ${s.stap === 1 ? 'dag' : 'dagen'}`}</title>
                  </text>
                </g>
              ))}

              {zones}
              {banden}
              {stompjes}

              {[...layout.values()].map((k) => {
                const naam = knoopNaam(k.knoop, meta)
                const tip = k.onderdrukt ? `${naam}: ${celTekst(k.cel)} (${celUitleg(k.cel)})` : `${naam}: ${celTekst(k.cel)} gebruikers`
                return (
                  <g key={`knoop-${k.stap}-${k.knoop}`} data-testid={`sankey-knoop-${k.stap}-${k.knoop}`}>
                    <text x={k.x} y={k.labelY} fontSize="11" fill="var(--ink-2)" className="sankey-tekst">
                      {naam} · <tspan className="font-mono" fontStyle={k.onderdrukt ? 'italic' : undefined}>{celTekst(k.cel)}</tspan>
                    </text>
                    <rect
                      x={k.x}
                      y={k.y}
                      width={KNOOP_B}
                      height={k.h}
                      fill={k.onderdrukt ? 'url(#sankey-arcering)' : knoopKleur(k.knoop, meta)}
                      stroke={k.onderdrukt ? 'var(--border-md)' : undefined}
                      strokeDasharray={k.onderdrukt ? '2 2' : undefined}
                      data-soort={k.cel.soort}
                    >
                      <title>{tip}</title>
                    </rect>
                  </g>
                )
              })}
            </svg>
          </div>

          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--ink-2)]" aria-label="Legenda">
            {legendaKnopen.map((k) => (
              <li key={k} className="inline-flex items-center gap-1.5">
                <Staaltje kleur={knoopKleur(k, meta)} />
                {knoopNaam(k, meta)}
              </li>
            ))}
            <li className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2.5 w-3.5"
                style={{ backgroundImage: 'repeating-linear-gradient(45deg, var(--ink) 0 1.5px, var(--ink-3) 1.5px 4px)' }}
              />
              Stopt (geen volgende actieve dag)
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-3.5 border border-dashed border-[var(--border-md)]" style={ARCERING_STIJL} />
              {arceringLegenda()}
            </li>
          </ul>

          <TabelWeergave>
            <div className="space-y-6">
              <table className="w-full min-w-[28rem] text-sm">
                <caption className="sr-only">Knopen per actieve dag</caption>
                <thead>
                  <tr className="border-b border-[var(--border-ed)]">
                    <Th>Knoop</Th>
                    {stappen.map((s) => (
                      <Th key={s.stap} rechts>{`Dag ${s.stap}`}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-dotted border-[var(--border-ed)]">
                    <Td>
                      <span className="font-medium text-[var(--ink)]">Totaal</span>
                    </Td>
                    {stappen.map((s) => (
                      <Td key={s.stap} rechts>
                        <CelWaarde cel={stapTotaal.get(s.stap)!} />
                      </Td>
                    ))}
                  </tr>
                  {legendaKnopen.map((k) => (
                    <tr key={k} className="border-b border-dotted border-[var(--border-ed)]">
                      <Td>{knoopNaam(k, meta)}</Td>
                      {stappen.map((s) => {
                        const cel = s.knopen.find((x) => x.knoop === k)?.gebruikers
                        return (
                          <Td key={s.stap} rechts>
                            {cel ? <CelWaarde cel={cel} /> : '—'}
                          </Td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="w-full min-w-[24rem] text-sm">
                <caption className="sr-only">Overgangen tussen actieve dagen</caption>
                <thead>
                  <tr className="border-b border-[var(--border-ed)]">
                    <Th>Overgang</Th>
                    <Th>Van</Th>
                    <Th>Naar</Th>
                    <Th rechts>Gebruikers</Th>
                  </tr>
                </thead>
                <tbody>
                  {overgangen.map((o) =>
                    o.zichtbaar ? (
                      o.cellen.map((c) => (
                        <tr key={`${o.vanStap}-${c.van}-${c.naar}`} className="border-b border-dotted border-[var(--border-ed)]">
                          <Td>{`Dag ${o.vanStap} → ${o.vanStap + 1}`}</Td>
                          <Td>{knoopNaam(c.van, meta)}</Td>
                          <Td>{knoopNaam(c.naar, meta)}</Td>
                          <Td rechts>
                            <CelWaarde cel={c.gebruikers} />
                          </Td>
                        </tr>
                      ))
                    ) : (
                      <tr key={`${o.vanStap}-verborgen`} className="border-b border-dotted border-[var(--border-ed)]">
                        <Td>{`Dag ${o.vanStap} → ${o.vanStap + 1}`}</Td>
                        <td colSpan={3} className="py-1.5 text-xs italic text-[var(--ink-3)]">
                          doorstroom verborgen (te weinig gebruikers)
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </TabelWeergave>
        </>
      )}

      <div className="mt-6">
        <p className="mb-2 text-xs font-semibold text-[var(--ink-2)]">
          Aantal actieve dagen in deze band{' '}
          <span className="font-normal text-[var(--ink-3)]">
            (totaal <CelWaarde cel={sankey.dagenVerdeling.totaal} />)
          </span>
        </p>
        <HorizontaleBalken rijen={dagRijen} schaalMax={dagMax} testId="sankey-dagen" />
      </div>
    </div>
  )
}
