import { Clock } from 'lucide-react'
import { TaxGauge } from './tax-gauge'
import { Box3SectionHeader } from './box3-section-header'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import type { Box3Result } from '@/lib/box3-data'

const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

/**
 * box3-heffingsvrij (3.3) — Heffingsvrij-vermogen-gauge.
 *
 * Toont hoeveel van het heffingsvrije vermogen (de onbelaste voet) je benut.
 * value = min(rendementsgrondslag, heffingsvrijVermogen) — dat deel van je
 * vermogen dat ONDER de drempel valt en dus onbelast is. max = de volledige
 * heffingsvrije voet.
 *
 * Onder de gauge: de resterende onbelaste ruimte (heffingsvrij − grondslag,
 * indien positief) én — als je de voet al volledig benut — de "kost van de
 * eerste belaste euro": het effectieve tarief × het forfait dat over de
 * eerste euro boven de voet wordt geheven, uitgedrukt in vrijheidstijd.
 *
 * Presentational: caller geeft het perspectief-correcte `result`. Box-kleur
 * via de actieve module-context (`--module-active-*`).
 *
 * WEERGAVEMODUS (BEL-9, besluit 6 sep 2026). Dit katern stond hard in
 * `HideInSimple` — waardoor de beginner de forfaitaire opbouw-staaf (3.1, het
 * rekenmodel) wél zag en dit blok (het gevólg: "elke € 1.000 extra kost je
 * ≈ € N") niet. Precies de omgekeerde volgorde van wat de modus belooft. Met
 * `sentenceOnly` levert dit component nu de Eenvoudig-variant: één zin, zonder
 * gauge en zonder buurzin, uit dezelfde JSX als de volledige weergave.
 * `box3-detail.tsx` schakelt ertussen met `SwapInSimple`.
 */

// Gauge-vulling op de 500-stop; het Clock-icoon op de donkerdere 700-stop.
const ACCENT_500 = 'var(--module-active-500)'
const ACCENT_700 = 'var(--module-active-700)'

export function Box3Heffingsvrij({
  result,
  fc,
  sentenceOnly = false,
}: {
  result: Box3Result
  fc: (v: number) => string
  /**
   * BEL-9 — Eenvoudig-variant: alléén de gevolg-zin, zonder gauge en zonder
   * de toelichtende buurzin. Zie de docstring hierboven; de zin zelf is
   * dezelfde JSX als in de volledige weergave (één bron, geen tweede tekst).
   */
  sentenceOnly?: boolean
}) {
  const heffingsvrij = result.heffingsvrijVermogen
  if (heffingsvrij <= 0) return null

  const benut = Math.min(Math.max(result.rendementsgrondslag, 0), heffingsvrij)
  const resterend = Math.max(0, heffingsvrij - result.rendementsgrondslag)
  const voetVolBenut = resterend <= 0

  // "Kost van de eerste belaste euro": elke euro boven de voet levert
  // effectiefRendement × tarief aan belasting op. Uitgedrukt per €1.000 zodat
  // het tastbaar is, plus de vrijheidstijd-equivalent.
  const taxPerThousandAbove = 1000 * result.effectiefRendement * result.params.tarief
  const freedomDaysPerThousand =
    result.dailyExpenses > 0 ? taxPerThousandAbove / result.dailyExpenses : 0

  // De vier tekstblokken één keer opgebouwd, zodat de Eenvoudig-zin en de
  // volledige weergave letterlijk dezelfde JSX delen — geen tweede formulering
  // die apart kan gaan drijven, en Volledig rendert byte-identiek.
  const voetBenutZin = (
    <p>
      Je benut de hele onbelaste voet van{' '}
      <span className="not-italic font-mono tabular-nums">{fc(heffingsvrij)}</span>. Alles
      daarboven is belast.
    </p>
  )
  const kostZin = (
    <>
      {/*
        De spatie ná de eerste </span> staat bewust als expliciete
        {' '}-expressie, en de zin erna past op ÉÉN bronregel. Reden:
        deze tekst draagt een HTML-entiteit (&apos;), en dan lopen de
        twee Turbopack-compilatielagen uiteen op JSX-witruimte — de
        browserlaag (SWC + babel-plugin-react-compiler, `reactCompiler:
        true`) hield de impliciete voorloopspatie, de ssr-laag (SWC
        alleen) liet 'm vallen. Dat verschil is een hydration-mismatch
        op élke Box 3-load, waarna React de hele boom client-side
        opnieuw rendert (UR2-15). Een tekstkind zonder impliciete
        rand-witruimte kan niet uiteenlopen. Bewaakt door
        box3-heffingsvrij.jsx-witruimte.test.ts.
      */}
      <p className="text-[var(--ink-3)]">
        Elke <span className="not-italic font-mono tabular-nums">{fc(1000)}</span>{' '}
        extra Box 3-vermogen kost zo&apos;n{' '}
        <span className="not-italic font-mono tabular-nums text-[var(--ink)]">
          {fc(Math.round(taxPerThousandAbove))}
        </span>{' '}
        belasting per jaar
        {freedomDaysPerThousand >= 0.5 && (
          <span className="inline-flex items-center gap-1 not-italic text-[var(--ink-3)]">
            {' '}
            <Clock className="h-3 w-3" style={{ color: ACCENT_700 }} aria-hidden="true" />
            {formatFreedomTimeString(
              calculateFreedomTime(taxPerThousandAbove, result.dailyExpenses),
              'short',
            )}
          </span>
        )}
        .
      </p>
    </>
  )
  const ruimteZin = (
    <p>
      Je hebt nog{' '}
      <span className="not-italic font-mono tabular-nums font-semibold text-[var(--ink)]">
        {fc(resterend)}
      </span>{' '}
      onbelaste ruimte tot de voet van{' '}
      <span className="not-italic font-mono tabular-nums">{fc(heffingsvrij)}</span>.
    </p>
  )
  const ruimteToelichting = (
    <p className="text-[var(--ink-3)]">
      Tot dit bedrag betaal je geen Box 3-belasting over je vermogen.
    </p>
  )

  // De ÉÉN zin die in Eenvoudig overblijft. Bij een volledig benutte voet is
  // dat de marginale kostzin ("elke € 1.000 extra kost …"); zit je nog ónder de
  // voet, dan is die claim gewoon onwaar en is de resterende onbelaste ruimte
  // het antwoord. Dezelfde `voetVolBenut`-gate als de volledige weergave — de
  // gate is hier load-bearing, niet cosmetisch.
  const eenvoudigeZin = voetVolBenut ? kostZin : ruimteZin

  const tekstClass = 'text-sm italic leading-snug text-[var(--ink-2)]'

  return (
    <div className="border-t border-[var(--ink)] px-4 py-5 sm:px-7">
      <Box3SectionHeader num="3.3">Heffingsvrij vermogen</Box3SectionHeader>

      {sentenceOnly ? (
        <div className={`max-w-[60ch] ${tekstClass}`} style={{ fontFamily: SOURCE_SERIF }}>
          {eenvoudigeZin}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-7">
          <TaxGauge
            value={benut}
            max={heffingsvrij}
            label="voet benut"
            sublabel={`${fc(benut)} / ${fc(heffingsvrij)}`}
            colorVar={ACCENT_500}
            thresholdLabel={result.hasPartner ? 'voet (partner)' : 'voet (single)'}
          />

          <div className={`min-w-0 flex-1 space-y-2 ${tekstClass}`} style={{ fontFamily: SOURCE_SERIF }}>
            {voetVolBenut ? (
              <>
                {voetBenutZin}
                {kostZin}
              </>
            ) : (
              <>
                {ruimteZin}
                {ruimteToelichting}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
