import { TrendingUp, Home, Calculator, ArrowRight } from 'lucide-react'
import { Box3SectionHeader } from './box3-section-header'
import { ScenarioCallout } from '@/components/editorial'
import { BesprekMetWillButton } from '@/components/app/chat/bespreek-met-will-button'

const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

/**
 * box3-stelsel2028 (3.10) — Het nieuwe Box 3-stelsel (beoogd 2028).
 *
 * Statische uitleg-kaarten over de overstap van forfaitair rendement naar
 * werkelijk rendement:
 *   • Liquide vermogen (spaargeld, aandelen, crypto) → vermogensAANWASbelasting:
 *     jaarlijks belast over de waardeontwikkeling, óók als die nog niet is
 *     gerealiseerd (ongerealiseerde winst).
 *   • Vastgoed → vermogensWINSTbelasting: pas belast bij realisatie (verkoop).
 *   • Kosten worden aftrekbaar; één vlak tarief (± 36%).
 *
 * Status: wetsvoorstel, beoogde invoering 2028. Presentational, geen props.
 * Box-accent via de actieve module-context (`--module-active-*`).
 */

const ACCENT_700 = 'var(--module-active-700)'

function Pijler({
  icon,
  kind,
  scope,
  detail,
}: {
  icon: React.ReactNode
  kind: string
  scope: string
  detail: string
}) {
  return (
    <div className="border border-[var(--ink)] bg-[var(--paper)] p-4">
      <div className="flex items-center gap-2 text-[var(--ink)]">
        <span style={{ color: ACCENT_700 }} aria-hidden="true">
          {icon}
        </span>
        <span className="text-sm font-semibold">{scope}</span>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-2)]">
        <ArrowRight className="h-3.5 w-3.5" style={{ color: ACCENT_700 }} aria-hidden="true" />
        {kind}
      </div>
      <p
        className="mt-2 text-sm italic leading-snug text-[var(--ink-3)]"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        {detail}
      </p>
    </div>
  )
}

export function Box3Stelsel2028() {
  return (
    <div className="border-t border-[var(--ink)] px-4 py-5 sm:px-7">
      <Box3SectionHeader num="3.10">
        <span className="inline-flex flex-wrap items-center gap-2">
          Het nieuwe stelsel
          <span
            className="border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em]"
            style={{
              color: 'var(--module-active-700)',
              borderColor: 'color-mix(in srgb, var(--module-active-500) 40%, transparent)',
              backgroundColor: 'color-mix(in srgb, var(--module-active-500) 10%, transparent)',
            }}
          >
            wetsvoorstel · beoogd 2028
          </span>
        </span>
      </Box3SectionHeader>

      <p
        className="mb-4 text-sm italic leading-snug text-[var(--ink-2)]"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        Het forfait verdwijnt: Box 3 gaat heffen over het{' '}
        <span className="not-italic font-semibold text-[var(--ink)]">werkelijke rendement</span>.
        De vorm hangt af van het soort vermogen.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Pijler
          icon={<TrendingUp className="h-4 w-4" />}
          scope="Liquide vermogen"
          kind="Vermogensaanwasbelasting"
          detail="Spaargeld, aandelen en crypto worden jaarlijks belast over de waardeontwikkeling — óók over winst die je nog niet hebt verkocht (ongerealiseerd)."
        />
        <Pijler
          icon={<Home className="h-4 w-4" />}
          scope="Vastgoed"
          kind="Vermogenswinstbelasting"
          detail="Onroerend goed wordt pas belast bij realisatie: je betaalt over de winst op het moment van verkoop, niet jaarlijks."
        />
      </div>

      <div
        className="mt-4 border px-4 py-3 text-xs leading-snug text-[var(--ink-2)]"
        style={{
          borderColor: 'var(--ink)',
          borderLeftWidth: '4px',
          borderLeftColor: 'var(--module-active-500)',
          backgroundColor: 'color-mix(in srgb, var(--module-active-500) 6%, transparent)',
        }}
      >
        <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--ink)]">
          <Calculator className="h-3.5 w-3.5" style={{ color: ACCENT_700 }} aria-hidden="true" />
          Wat verandert er nog meer
        </span>
        <ul className="mt-2 ml-4 list-disc space-y-1">
          <li>Kosten worden aftrekbaar (nu niet onder het forfait).</li>
          <li>Eén vlak tarief van circa 36% over het werkelijke rendement.</li>
          <li>Verliezen kunnen (deels) verrekend worden.</li>
        </ul>
      </div>

      <div className="mt-4">
        <BesprekMetWillButton
          onderwerp="Het nieuwe Box 3-stelsel op werkelijk rendement (beoogd 2028)"
          detail="Vanaf 2028 vervangt heffing over werkelijk rendement het forfait: liquide vermogen via vermogensaanwasbelasting (ook ongerealiseerde winst), vastgoed via vermogenswinstbelasting bij verkoop; kosten worden aftrekbaar, vlak tarief ±36%."
        />
      </div>

      <ScenarioCallout title="Indicatie, geen advies." className="mt-4 text-xs">
        Het stelsel is nog een wetsvoorstel; de exacte regels en invoeringsdatum
        kunnen wijzigen.
      </ScenarioCallout>
    </div>
  )
}
