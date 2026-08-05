'use client'

/**
 * LevensinkomenStrook — dekkingsgraad% per leeftijd. Elke knoop is een bol die
 * laat zien WAAR de dekking vandaan komt: vaste inkomsten, veilig opneembaar
 * rendement, en het restant dat uit het vermogen moet komen (interen). De bollen
 * bewegen mee met de levenslijn (de dichtstbijzijnde knoop licht op bij de
 * actieve hover/playback-leeftijd). Puur presentational; data komt uit
 * `buildCoverageStrip` (lib/horizon/coverage-strip.ts).
 *
 * Twee kleursystemen, bewust gescheiden:
 *  - het PERCENTAGE draagt de stoplicht-status (emerald/amber/red — semantisch,
 *    niet het module-accent, consistent met lib/leverage-status.ts);
 *  - de BOL draagt de herkomst in de `--coverage-*`-tokens (app/globals.css):
 *    eigen inkomen → veilig rendement → interen. Dat is een kwaliteitsvolgorde,
 *    geen statusschaal, dus bewust andere tinten dan de stoplicht-hexen — anders
 *    zou dezelfde amber twee dingen betekenen binnen één widget.
 *
 * Wat er aan toegankelijkheid getoetst is: de drie tokens zijn gemeten op
 * onderlinge scheidbaarheid (ΔE ≥ 9 op élk paar onder deutan/protan/tritan,
 * alle drie ≥ 3:1 contrast op --paper). Kleur is daarmee bruikbaar, maar draagt
 * de identiteit niet alléén: de segmentvolgorde ligt vast (met de klok mee vanaf
 * 12 uur, ongeacht grootte), de papier-gaps scheiden de vlakken, en elke knoop
 * heeft een voorleesbaar label plus een kassabon met dezelfde cijfers in tekst.
 */

import { useId, useMemo, useState } from 'react'
import { InlineInfoDisclosure } from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { CoverageSamenstelling } from '@/lib/horizon/coverage-strip'

export interface CoverageNodeView {
  age: number
  coveragePct: number
  status: 'green' | 'amber' | 'red'
  /** Uitsplitsing van de dekking; ontbreekt bij rijen zonder bestedingsbehoefte. */
  samenstelling?: CoverageSamenstelling
}

export interface LevensinkomenStrookProps {
  nodes: CoverageNodeView[]
  /** Actieve leeftijd (hover/playback); highlight de dichtstbijzijnde knoop. Null = geen. */
  activeAge: number | null
  /** Legendabalk: opbouw / brug / onttrekking (kleur = CSS-kleurwaarde, width in %). */
  segments?: { label: string; color: string; widthPct: number }[]
}

const PCT_TEXT: Record<CoverageNodeView['status'], string> = {
  green: 'text-emerald-700',
  amber: 'text-amber-700',
  red: 'text-red-700',
}
/** Effen bol voor knopen zonder uitsplitsing (geen bestedingsbehoefte om te verdelen). */
const DOT_BG: Record<CoverageNodeView['status'], string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
}

// ── Herkomst-tokens (zie app/globals.css: --coverage-*) ─────────────────────
const SEGMENT_INKOMEN = 'var(--coverage-inkomen)'
const SEGMENT_RENDEMENT = 'var(--coverage-rendement)'
const SEGMENT_INTEREN = 'var(--coverage-interen)'
/** Boog voor het deel bóven de 100%: dezelfde groenfamilie, een stap donkerder. */
const RING_OVERSCHOT = 'var(--coverage-overschot)'
const RING_TRACK = 'var(--border-ed)'
/**
 * Papier-gap tussen twee segmenten, in graden. Klein gehouden: bij drie segmenten
 * gaat 3 × 5° = 4,2% van de cirkel op aan scheiding, wat de verhoudingen nog
 * afleesbaar laat. Groter oogt strakker maar liegt over de aandelen.
 */
const SEGMENT_GAP_DEG = 5

const SEGMENT_LEGEND = [
  { color: SEGMENT_INKOMEN, label: 'Inkomen' },
  { color: SEGMENT_RENDEMENT, label: 'Rendement' },
  { color: SEGMENT_INTEREN, label: 'Interen' },
] as const

function nearestAge(nodes: CoverageNodeView[], age: number): number | null {
  if (!nodes.length) return null
  let best = nodes[0].age
  let bestDiff = Math.abs(nodes[0].age - age)
  for (const n of nodes) {
    const d = Math.abs(n.age - age)
    if (d < bestDiff) {
      bestDiff = d
      best = n.age
    }
  }
  return best
}

/** Taartverdeling van de bol: inkomen → rendement → interen, met de klok mee vanaf 12 uur. */
function pieBackground(s: CoverageSamenstelling): string {
  const segs: [string, number][] = [
    [SEGMENT_INKOMEN, s.inkomenPct],
    [SEGMENT_RENDEMENT, s.rendementPct],
    [SEGMENT_INTEREN, s.interenPct],
  ]
  const zichtbaar = segs.filter(([, pct]) => pct > 0)
  if (zichtbaar.length === 0) return SEGMENT_INKOMEN
  if (zichtbaar.length === 1) return zichtbaar[0][0]

  const bruikbaar = 360 - SEGMENT_GAP_DEG * zichtbaar.length
  const stops: string[] = []
  let hoek = 0
  for (const [color, pct] of zichtbaar) {
    const sweep = (pct / 100) * bruikbaar
    stops.push(`${color} ${hoek}deg ${hoek + sweep}deg`)
    hoek += sweep
    stops.push(`var(--paper) ${hoek}deg ${hoek + SEGMENT_GAP_DEG}deg`)
    hoek += SEGMENT_GAP_DEG
  }
  return `conic-gradient(${stops.join(', ')})`
}

/** Buitenboog voor het deel bóven de 100% — het inkomen dat je niet opmaakt. */
function ringBackground(overschotPct: number): string {
  const sweep = (Math.min(overschotPct, 100) / 100) * 360
  return `conic-gradient(${RING_OVERSCHOT} 0deg ${sweep}deg, ${RING_TRACK} ${sweep}deg 360deg)`
}

/**
 * Percentage-label. Een aandeel dat op 0 afrondt terwijl er wél een bedrag staat
 * toont `<1%` in plaats van `0%` — anders leest de kassabon als "Interen €100 — 0%".
 */
function pctLabel(pct: number, bedrag: number): string {
  return pct === 0 && bedrag >= 1 ? '<1%' : `${pct}%`
}

/** Voorleesbare samenvatting, zodat de samenstelling nooit alléén in kleur zit. */
function nodeLabel(n: CoverageNodeView): string {
  const kop = `${n.age} jaar, dekking ${n.coveragePct} procent`
  if (!n.samenstelling) return kop
  const s = n.samenstelling
  const delen = `inkomen ${s.inkomenPct}%, rendement ${s.rendementPct}%, interen ${s.interenPct}%`
  return s.overschotPct > 0 ? `${kop}: ${delen}, overschot ${s.overschotPct}%` : `${kop}: ${delen}`
}

export function LevensinkomenStrook({ nodes, activeAge, segments }: LevensinkomenStrookProps) {
  // Twee aparte bronnen: `hoverAge` is transiënt (muis/toetsenbordfocus, valt terug
  // op null bij verlaten), `klikAge` blijft staan. Zonder die splitsing zou één
  // muisbeweging over de strook de kassabon permanent loskoppelen van de levenslijn.
  const [klikAge, setKlikAge] = useState<number | null>(null)
  const [hoverAge, setHoverAge] = useState<number | null>(null)
  const bonId = useId()
  const activeNode = activeAge == null ? null : nearestAge(nodes, activeAge)

  // Volgorde: waar je nú op staat → wat je aanklikte → de levenslijn → en als de
  // gebruiker nog niets aanwees het eerste jaar waarin er ingeteerd wordt. Dat
  // laatste zet het blok meteen op het jaar waar het verhaal zit, i.p.v. op een
  // opbouwjaar waar er niets te verdelen valt.
  const bonNode = useMemo(() => {
    const metBon = nodes.filter(n => n.samenstelling)
    if (metBon.length === 0) return null
    for (const kandidaat of [hoverAge, klikAge, activeNode]) {
      const treffer = kandidaat == null ? undefined : metBon.find(n => n.age === kandidaat)
      if (treffer) return treffer
    }
    return metBon.find(n => (n.samenstelling?.interenPct ?? 0) > 0) ?? metBon[0]
  }, [nodes, hoverAge, klikAge, activeNode])

  return (
    <div>
      <InlineInfoDisclosure label="Uitleg dekkingsgraad">
        <div className="mb-1.5 font-semibold text-[var(--ink)]" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>
          Zo werkt de dekkingsgraad
        </div>
        <p className="m-0">
          dekkingsgraad = (vaste inkomsten + veilige onttrekking) ÷ gewenste besteding × 100%. 100% = volledig gedekt
          zonder extra in te teren. In je <b className="text-[var(--ink)]">opbouwjaren</b> ligt de dekking bóven 100%:
          je spaart, dus je inkomen dekt je besteding én de inleg — dat overschot is de buitenste boog om de bol.{' '}
          <b className="text-[var(--ink)]">Groen ≥ 100%</b> — inkomen + veilige onttrekking dekken je besteding.{' '}
          <b className="text-[var(--ink)]">Amber 90–99%</b> — klein tekort, je teert licht in.{' '}
          <b className="text-[var(--ink)]">Rood &lt; 90%</b> — vaste inkomsten + veilige onttrekking dekken je
          besteding dat jaar niet. Waarom het dipt: in de brugjaren (tussen FIRE en AOW) is er nog geen AOW/pensioen,
          dus alles komt uit vermogen → onder 100%. Vanaf AOW tillen AOW + pensioen je er weer boven.
        </p>
        <p className="mt-2 mb-0">
          <b className="text-[var(--ink)]">Wat de bol laat zien.</b> Dezelfde som, uitgesplitst naar herkomst:{' '}
          <b className="text-[var(--ink)]">inkomen</b> (salaris, AOW, pensioen),{' '}
          <b className="text-[var(--ink)]">rendement</b> — de opbrengst die je veilig kunt opnemen zonder je pot te
          verkleinen — en <b className="text-[var(--ink)]">interen</b>: het restant, dat je uit het vermogen zelf
          haalt. Het rode deel is per definitie precies wat er aan 100% ontbreekt, dus bol en percentage vertellen
          altijd hetzelfde verhaal. Let op de semantiek: dit is het interen dat je plan dat jaar vráágt, niet de
          onttrekking die de simulatie feitelijk boekt (die kan hoger liggen doordat er bezit wordt verzilverd).{' '}
          <b className="text-[var(--ink)]">Belangrijk:</b> rood betekent niet dat je plan onhaalbaar is — interen kan
          een bewuste keuze zijn. Of het bínnen je doel past, lees je in de dekkingsradar of de scenariokaarten.
        </p>
      </InlineInfoDisclosure>

      <div className="flex gap-1" role="group" aria-label="Dekking per leeftijd">
        {nodes.map(n => {
          const active = n.age === activeNode
          const toontBon = bonNode?.age === n.age
          const s = n.samenstelling
          return (
            <button
              key={n.age}
              type="button"
              // Zonder uitsplitsing valt er niets te tonen — dan is de knoop ook
              // geen knop: niet focusbaar, geen klik die nergens toe leidt.
              disabled={!s}
              onClick={() => setKlikAge(n.age)}
              onMouseEnter={() => setHoverAge(n.age)}
              onMouseLeave={() => setHoverAge(null)}
              onFocus={() => setHoverAge(n.age)}
              onBlur={() => setHoverAge(null)}
              aria-label={nodeLabel(n)}
              // Keuze-uit-een-reeks, geen aan/uit-schakelaar → aria-current, niet aria-pressed.
              aria-current={toontBon ? 'true' : undefined}
              aria-controls={bonId}
              className={`flex-1 cursor-pointer px-1 py-1.5 text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] disabled:cursor-default ${
                active ? 'bg-[var(--subtle)] -translate-y-0.5 shadow-sm' : ''
              } ${toontBon && !active ? 'bg-[var(--subtle)]' : ''}`}
            >
              <div className="text-[11px] font-semibold text-[var(--ink-3)]">{n.age}</div>
              {/* Vaste bol-maat, óók zonder uitsplitsing: anders verspringt de
                  percentage-regel tussen knopen met en zonder samenstelling. De
                  papier-ring tussen boog en taart is er altijd, zodat de bol niet
                  van maat verandert zodra er een overschot-boog bijkomt — en zodat
                  een groene boog niet visueel samensmelt met een groene taart. */}
              <div className="relative mx-auto my-1 h-6 w-6 sm:h-[34px] sm:w-[34px]">
                {s && s.overschotPct > 0 && (
                  <div className="absolute inset-0 rounded-full" style={{ background: ringBackground(s.overschotPct) }} />
                )}
                <div className="absolute inset-[3px] rounded-full bg-[var(--paper)] sm:inset-[4px]" />
                {s ? (
                  <div className="absolute inset-[4px] rounded-full sm:inset-[5.5px]" style={{ background: pieBackground(s) }} />
                ) : (
                  <div className={`absolute inset-[4px] rounded-full sm:inset-[5.5px] ${DOT_BG[n.status]}`} />
                )}
              </div>
              <div className={`text-[12px] font-semibold tabular-nums ${PCT_TEXT[n.status]}`}>{n.coveragePct}%</div>
            </button>
          )
        })}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[var(--ink-3)]">
        {SEGMENT_LEGEND.map(l => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full border-[2.5px]"
            style={{ borderColor: RING_OVERSCHOT }}
          />
          Overschot (sparen)
        </span>
      </div>

      {/* Geen aria-live: het label van de knoop draagt dezelfde uitsplitsing al,
          dus voorlezen bij elke focuswissel zou het verhaal dubbel vertellen. */}
      <div id={bonId}>
        {bonNode?.samenstelling && (
          <div className="mt-3 border-t border-[var(--border-ed)] pt-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                {bonNode.age} jaar
              </span>
              <span className="text-[11.5px] text-[var(--ink-2)]">
                besteding{' '}
                <MaskedAmount value={bonNode.samenstelling.brutoNeed} tone="inherit" className="text-[11.5px]" />
                {' '}per jaar
              </span>
            </div>
            <dl className="m-0 space-y-1">
              {(
                [
                  ['Inkomen', SEGMENT_INKOMEN, bonNode.samenstelling.inkomen, bonNode.samenstelling.inkomenPct],
                  ['Rendement', SEGMENT_RENDEMENT, bonNode.samenstelling.rendement, bonNode.samenstelling.rendementPct],
                  ['Interen', SEGMENT_INTEREN, bonNode.samenstelling.interen, bonNode.samenstelling.interenPct],
                ] as const
              ).map(([label, color, bedrag, pct]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 text-[12px]">
                  <dt className="flex items-center gap-1.5 text-[var(--ink-2)]">
                    <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                    {label}
                  </dt>
                  <dd className="m-0 flex items-baseline gap-2 text-[var(--ink)]">
                    <MaskedAmount value={bedrag} tone="inherit" className="text-[12px]" />
                    <span className="w-9 shrink-0 text-right tabular-nums text-[var(--ink-3)]">
                      {pctLabel(pct, bedrag)}
                    </span>
                  </dd>
                </div>
              ))}
              {(bonNode.samenstelling.overschotPct > 0 || bonNode.samenstelling.overschot >= 1) && (
                <div className="flex items-baseline justify-between gap-3 border-t border-[var(--border-ed)] pt-1 text-[12px]">
                  <dt className="flex items-center gap-1.5 text-[var(--ink-2)]">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full border-2"
                      style={{ borderColor: RING_OVERSCHOT }}
                    />
                    Overschot — sparen
                  </dt>
                  <dd className="m-0 flex items-baseline gap-2 text-[var(--ink)]">
                    <MaskedAmount
                      value={bonNode.samenstelling.overschot}
                      tone="inherit"
                      signPrefix="+"
                      className="text-[12px]"
                    />
                    <span className="w-9 shrink-0 text-right tabular-nums text-[var(--ink-3)]">
                      {pctLabel(bonNode.samenstelling.overschotPct, bonNode.samenstelling.overschot)}
                    </span>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </div>

      {segments && segments.length > 0 && (
        <>
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full">
            {segments.map(s => (
              <div key={s.label} style={{ width: `${s.widthPct}%`, background: s.color }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[var(--ink-3)]">
            {segments.map(s => (
              <span key={s.label} className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
