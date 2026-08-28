import { TrendingUp, TrendingDown } from 'lucide-react'
import {
  sindsVorigBezoekZin,
  type SindsVorigBezoekView,
} from '@/lib/overview/sinds-vorig-bezoek'

/**
 * SindsVorigBezoek — één kalme regel direct onder de begroeting op /overzicht:
 * wat er in jouw vrijheidstijd veranderde sinds je vorige bezoekdag (H11).
 *
 * WAAROM HIER: de briefing eronder bevriest per ISO-week, dus wie dagelijks
 * langskomt zag tot nu toe alleen een nieuwe datum. Deze regel is het enige
 * oppervlak op bezoekcadans — en staat daarom bij de begroeting (het enige
 * andere blok dat per dag verandert), niet bij de briefing-stempel. Dat is
 * bewust: de briefing draagt zijn eigen versheidshint ("je cijfers zijn
 * sindsdien veranderd"), en dezelfde boodschap twee keer op één scherm is
 * precies de tegenspraak die H11 aankaart.
 *
 * ZICHTBAAR IN BEIDE WEERGAVEN. Anders dan de vrijheidsdelta-hero (die in
 * Eenvoudig wegvalt) rendert deze regel óók in Eenvoudig: de gebruiker die het
 * meest baat heeft bij "wat is er veranderd" is precies degene die de rijke
 * hero niet ziet. Server component — geen client-JS, geen weergavemodus-hook.
 *
 * Rendert `null` zodra er niets te melden valt; zie `buildSindsVorigBezoek` voor
 * de zwijgregels (geen basis, zelfde dag, 0 dagen, implausibele sprong).
 */
export function SindsVorigBezoek({ view }: { view: SindsVorigBezoekView | null }) {
  if (!view) return null

  const positief = view.deltaDays > 0
  const Icon = positief ? TrendingUp : TrendingDown

  return (
    <p className="mt-2 flex items-center gap-2 font-serif text-[13px] italic leading-snug text-[var(--ink-2)] sm:text-sm">
      {/* Richting-icoon in het module-accent van de route (kern op /overzicht) —
          nooit een semantische groen/rood: minder vrijheidstijd is een feit,
          geen alarm. */}
      <Icon
        className="h-3.5 w-3.5 shrink-0 text-[var(--module-active-500)]"
        aria-hidden="true"
      />
      {sindsVorigBezoekZin(view)}
    </p>
  )
}
