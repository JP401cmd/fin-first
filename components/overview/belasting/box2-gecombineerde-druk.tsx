import { Kicker, ScenarioCallout, FiguresStrip } from '@/components/editorial'
import { BOX2_PARAMS, VPB_PARAMS } from '@/lib/box2-data'
import { BOX1_PARAMS } from '@/lib/box1-tax'
import { GepaardeStaven } from './gepaarde-staven'

/**
 * Box2GecombineerdeDruk — educatieve tabel + staaf-vergelijking van de échte
 * belastingdruk op winst die via dividend naar privé stroomt.
 *
 * Winst in een BV wordt eerst belast met vennootschapsbelasting (Vpb), en het
 * restant wordt bij uitkering nóg eens belast in Box 2. De gecombineerde druk
 * is dus géén optelsom van de twee tarieven, maar:
 *
 *   combined = Vpb + (1 − Vpb) × Box2
 *
 * (eerst de Vpb eraf, daarna Box 2 over wat overblijft). Dit vergelijken we met
 * loon dat rechtstreeks in Box 1 valt (toptarief 49,5%).
 *
 * Bewust grotendeels statisch/educatief: de tarieven zijn wettelijk vast en
 * jaaronafhankelijk genoeg voor een richtinggevend beeld. Presentationeel —
 * geen data-fetching, geen hooks → kan in een server-context renderen, maar
 * wordt hier binnen de client-Box2Detail-kaart gemount.
 *
 * Filosofie: dit toont hoeveel "opgeslagen tijd" er per uitgekeerde euro winst
 * werkelijk wegvloeit voordat het privé besteedbaar is — een indicatie, geen
 * fiscaal advies.
 */

// Tarieven uit de canonieke jaartabellen (2026) — géén lokale duplicaten.
// VPB_PARAMS/BOX2_PARAMS uit lib/box2-data.ts, Box 1-toptarief uit lib/box1-tax.ts.
const VPB_LAAG = VPB_PARAMS['2026'].tariefLaag // 19% tot €200.000 winst
const VPB_HOOG = VPB_PARAMS['2026'].tariefHoog // 25,8% daarboven
const BOX2_LAAG = BOX2_PARAMS['2026'].tariefLaag // 24,5%
const BOX2_HOOG = BOX2_PARAMS['2026'].tariefHoog // 31%
// Hoogste (open) Box 1-schijf = referentie voor loon-vergelijking (49,5%).
const BOX1_TOP = BOX1_PARAMS['2026'].schijven[BOX1_PARAMS['2026'].schijven.length - 1].tarief

/** Gecombineerde druk: eerst Vpb, dan Box 2 over het restant. */
function combined(vpb: number, box2: number): number {
  return vpb + (1 - vpb) * box2
}

function pct(value: number): string {
  return (value * 100).toLocaleString('nl-NL', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }) + '%'
}

interface Scenario {
  label: string
  vpb: number
  box2: number
}

const SCENARIOS: Scenario[] = [
  { label: 'Vpb laag (19%) + Box 2 laag (24,5%)', vpb: VPB_LAAG, box2: BOX2_LAAG },
  { label: 'Vpb laag (19%) + Box 2 hoog (31%)', vpb: VPB_LAAG, box2: BOX2_HOOG },
  { label: 'Vpb hoog (25,8%) + Box 2 laag (24,5%)', vpb: VPB_HOOG, box2: BOX2_LAAG },
  { label: 'Vpb hoog (25,8%) + Box 2 hoog (31%)', vpb: VPB_HOOG, box2: BOX2_HOOG },
]

// Box 2-balk volgt de actieve module-kleur (violet op de Box 2-pagina).
const BOX2_COLOR = 'var(--module-active-600)'
// Box 1-vergelijkingsbaseline: neutraal ink — géén amber op de Box 2-pagina.
const BOX1_COLOR = 'var(--ink-3)'

export function Box2GecombineerdeDruk() {
  const min = combined(VPB_LAAG, BOX2_LAAG)
  const max = combined(VPB_HOOG, BOX2_HOOG)

  return (
    <div className="border-t border-[var(--ink)] px-5 py-5 sm:px-6">
      <Kicker className="mb-3">Gecombineerde druk Vpb + Box 2</Kicker>

      <p className="mb-4 max-w-[62ch] text-sm leading-snug text-[var(--ink-2)]">
        Winst in je BV wordt eerst belast met vennootschapsbelasting, en bij
        uitkering nóg eens in Box 2. De échte druk op winst-via-dividend ligt
        daardoor tussen{' '}
        <span className="font-mono tabular-nums font-semibold text-[var(--ink)]">{pct(min)}</span> en{' '}
        <span className="font-mono tabular-nums font-semibold text-[var(--ink)]">{pct(max)}</span>{' '}
        — vergelijkbaar met loon in de hoogste Box 1-schijf (49,5%).
      </p>

      {/* Hero-bandbreedte: Playfair-cijfers via FiguresStrip */}
      <FiguresStrip
        cols={3}
        figures={[
          { kicker: 'Laagste druk', amount: pct(min) },
          { kicker: 'Hoogste druk', amount: pct(max) },
          { kicker: 'Box 1-loon', amount: pct(BOX1_TOP) },
        ]}
      />

      {/* Formule — lichte inline-regel, geen apart kader */}
      <p className="mb-4 text-[11px] text-[var(--ink-3)]">
        Gecombineerd ={' '}
        <span className="font-mono tabular-nums text-[var(--ink-2)]">
          Vpb + (1 − Vpb) × Box 2
        </span>
      </p>

      {/* Scenario-tabel — rule-gescheiden rijen (top/bottom-rule), geen vol kader */}
      <table className="w-full border-t border-b border-[var(--ink)] text-xs">
        <thead>
          <tr className="border-b border-[var(--rule-soft)] text-left">
            <th className="px-1 py-2 text-[10px] font-mono uppercase tracking-[0.12em] font-medium text-[var(--ink-3)]">
              Scenario
            </th>
            <th className="px-1 py-2 text-right text-[10px] font-mono uppercase tracking-[0.12em] font-medium text-[var(--ink-3)]">
              Druk
            </th>
          </tr>
        </thead>
        <tbody>
          {SCENARIOS.map((s, i) => (
            <tr key={i} className="border-b border-[var(--rule-soft)]">
              <td className="px-1 py-2 text-[var(--ink-2)]">{s.label}</td>
              <td className="px-1 py-2 text-right font-mono tabular-nums font-semibold text-[var(--ink)]">
                {pct(combined(s.vpb, s.box2))}
              </td>
            </tr>
          ))}
          {/* ComparisonRow-highlight: de Box 1-referentie als geselecteerde rij
              — box-getint via de actieve module-kleur (--module-active-*). */}
          <tr
            style={{
              background: 'color-mix(in srgb, var(--module-active-500) 8%, transparent)',
            }}
          >
            <td
              className="px-2 py-2 text-[var(--ink-2)]"
              style={{ borderLeft: '3px solid var(--module-active-500)' }}
            >
              Referentie: loon in Box 1 (toptarief)
            </td>
            <td className="px-1 py-2 text-right font-mono tabular-nums font-semibold text-[var(--ink)]">
              {pct(BOX1_TOP)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Visuele bandbreedte t.o.v. Box 1 */}
      <div className="mt-4">
        <GepaardeStaven
          format={pct}
          bars={[
            {
              label: 'Box 2-route — laagste druk',
              value: min,
              colorVar: BOX2_COLOR,
              isWinner: true,
            },
            {
              label: 'Box 2-route — hoogste druk',
              value: max,
              colorVar: BOX2_COLOR,
            },
            {
              label: 'Box 1-loon (toptarief)',
              value: BOX1_TOP,
              colorVar: BOX1_COLOR,
            },
          ]}
        />
      </div>

      <ScenarioCallout className="mt-4" title="Indicatie, geen advies.">
        Op basis van de wettelijke tarieven (Vpb 19% / 25,8%, Box 2 24,5% / 31%).
        De werkelijke druk hangt af van het winstniveau en je persoonlijke
        situatie.
      </ScenarioCallout>
    </div>
  )
}
