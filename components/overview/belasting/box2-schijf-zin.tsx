import type { Box2Result } from '@/lib/box2-data'
import { Kicker } from '@/components/editorial'

/**
 * Box2SchijfZin (BEL-9) — de Eenvoudig-variant van de Box 2-schijfcellen.
 *
 * De twee tariefregels ("Tarief laag (24,5%, tot € …)" / "Tarief hoog (31,0%)")
 * staan in de uitklap "Berekeningsstappen" en die zit al in `HideInSimple`.
 * In Eenvoudig bleef daardoor alleen het hero-bedrag over, zonder één woord
 * over waaróm het dat bedrag is. Deze zin zet de staffel in gewone taal onder
 * het bedrag; de rekenstappen blijven Volledig.
 *
 * CONSUME, DON'T RECOMPUTE. Alle drie de getallen komen uit
 * `Box2Result.params` (de motor `lib/box2-data.ts`), inclusief de keuze tussen
 * `grens` en `grensPartner` via `result.hasPartner` — dezelfde bron en dezelfde
 * keuze als de rekenstap-regel. Er wordt hier niets afgeleid of gestaffeld.
 *
 * NULL-PAD (bevinding H26). Weet de app het dividend niet én komt de heffing
 * daarmee op nul uit, dan toont de kaart bewust géén bedrag maar de
 * "nog niet ingevuld"-melding met de invul-ingang. Een tariefzin eronder zou
 * daar een tweede, concurrerende boodschap zijn: `toonGeenBedrag` → geen zin.
 *
 * WFT: beschrijvend ("betaal je"), nooit imperatief — géén "keer dus dividend
 * uit tot de grens", dat is een aanbeveling over een specifieke transactie aan
 * een specifiek persoon. De "indicatie, geen advies"-voetregel van de pagina
 * blijft de voetnoot.
 */
export function Box2SchijfZin({
  result,
  toonGeenBedrag,
  fc,
}: {
  result: Box2Result
  /** true = dividend onbekend én heffing €0; de kaart toont dan geen bedrag. */
  toonGeenBedrag: boolean
  /** Currency-formatter van de kaart (respecteert de privacymodus). */
  fc: (v: number) => string
}) {
  if (toonGeenBedrag) return null

  const grens = result.hasPartner ? result.params.grensPartner : result.params.grens

  return (
    <div className="mt-4 border-t border-[var(--border-ed)] pt-3.5">
      <Kicker>Hoe het tarief loopt</Kicker>
      <p className="mt-1.5 max-w-[52ch] text-sm leading-snug text-[var(--ink)]">
        Tot <span className="font-semibold tabular-nums">{fc(grens)}</span> Box 2-inkomen per jaar
        betaal je <span className="font-semibold tabular-nums">{pct(result.params.tariefLaag)}</span>
        , over alles daarboven{' '}
        <span className="font-semibold tabular-nums">{pct(result.params.tariefHoog)}</span>.
      </p>
      {/* Wft-voetregel bij de zin zelf. De Box 2-kaart droeg als enige van de
          drie boxen géén "indicatie, geen advies"-regel; nu er in gewone taal
          een tariefuitspraak op staat, hoort hij erbij (compliance-toets
          UR3-29, 7 sep 2026). */}
      <p className="mt-1 text-[11px] leading-tight text-[var(--ink-3)]">
        {result.hasPartner
          ? 'De grens geldt samen met je fiscaal partner.'
          : 'De grens geldt per persoon, per jaar.'}{' '}
        Indicatie, geen advies — tarieven {result.year}.
      </p>
    </div>
  )
}

/** Weergave-afronding van een tarief uit `Box2Params` — geen eigen tarief. */
function pct(value: number): string {
  return (value * 100).toFixed(1).replace('.', ',') + '%'
}
