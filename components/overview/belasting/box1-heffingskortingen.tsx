import { formatCurrency } from '@/lib/format'
import { BOX1_TOOLTIPS, type Box1Result } from '@/lib/box1-tax'
import { Kicker } from '@/components/editorial'

/**
 * Box1Heffingskortingen — toont de drie heffingskortingen die je Box 1-druk
 * verlagen, met een korte uitleg dat ze afbouwen bij hoger inkomen.
 *
 * Filosofie: heffingskortingen zijn "vrijheid die de overheid teruggeeft" —
 * ze verlagen direct wat je afdraagt. Maar ze bouwen af: hoe meer je verdient,
 * hoe minder je terugkrijgt (dat voedt ook de marginale-druk-curve).
 *
 * Vormgeving: editorial — papier + ink-hiërarchie, scherpe hoeken, mono
 * bedragen, Playfair totaal-regel. Server-compatible (geen hooks). De
 * uitleg-teksten komen uit BOX1_TOOLTIPS (één bron van waarheid in
 * lib/box1-tax.ts). De box-accentkleur komt uit de route-layout via
 * `var(--module-active-*)`.
 */

interface KortingRij {
  label: string
  bedrag: number
  uitleg: string
  /** Of deze korting alleen geldt onder voorwaarde (bv. IACK: kind < 12). */
  conditioneel?: boolean
}

export function Box1Heffingskortingen({ result }: { result: Box1Result }) {
  const rijen: KortingRij[] = [
    {
      label: 'Algemene heffingskorting',
      bedrag: result.algemeneHeffingskorting,
      uitleg: BOX1_TOOLTIPS.algemeneHeffingskorting,
    },
    {
      label: 'Arbeidskorting',
      bedrag: result.arbeidskorting,
      uitleg: BOX1_TOOLTIPS.arbeidskorting,
    },
    {
      label: 'Combinatiekorting (IACK)',
      bedrag: result.iack,
      uitleg: BOX1_TOOLTIPS.iack,
      conditioneel: true,
    },
  ]

  // Som van de toegepaste kortingen (geclamped op heffing in de motor).
  const totaal = result.totaleHeffingskortingen

  return (
    <div className="bg-[var(--paper)] border border-[var(--border-ed)] p-5 sm:p-6">
      <Kicker>Heffingskortingen</Kicker>
      <p
        className="mt-2 mb-5 text-sm italic text-[var(--ink-2)] leading-snug max-w-[52ch]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        Kortingen die direct van je belasting af gaan. Let op: ze{' '}
        <span className="font-semibold not-italic text-[var(--ink)]">bouwen af</span> bij een
        hoger inkomen — daarom stijgt je marginale druk in de afbouw-zones.
      </p>

      <div className="flex flex-col divide-y divide-[var(--border-ed)]">
        {rijen.map((rij, i) => (
          <div key={i} className="flex flex-col gap-1 py-3 first:pt-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-medium text-[var(--ink)]">
                {rij.label}
                {rij.conditioneel && rij.bedrag === 0 && (
                  <span className="ml-1.5 text-[10px] uppercase tracking-[0.08em] font-mono text-[var(--ink-4)]">
                    n.v.t.
                  </span>
                )}
              </span>
              <span
                className="font-mono text-sm font-semibold tabular-nums shrink-0"
                style={{ color: rij.bedrag > 0 ? 'var(--module-active-700)' : 'var(--ink-4)' }}
              >
                {rij.bedrag > 0 ? '−' : ''}
                {formatCurrency(rij.bedrag)}
              </span>
            </div>
            <p className="text-[11px] text-[var(--ink-3)] leading-snug max-w-[48ch]">
              {rij.uitleg}
            </p>
          </div>
        ))}

        {/* Totaal-rij — Playfair eindbedrag boven solid rule. */}
        <div className="flex items-baseline justify-between gap-3 border-t-2 border-t-[var(--ink)] pt-3 mt-1">
          <span className="text-[11px] uppercase tracking-[0.1em] font-mono font-semibold text-[var(--ink)]">
            Totaal toegepast
          </span>
          <span
            className="text-[20px] font-black tabular-nums tracking-[-0.01em] text-[var(--ink)]"
            style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
          >
            −{formatCurrency(totaal)}
          </span>
        </div>
      </div>

      <p
        className="mt-3 text-[12px] italic text-[var(--ink-3)] leading-snug"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        Indicatie, geen advies — afbouw-knikpunten {result.year} zijn benaderingen.
      </p>
    </div>
  )
}
