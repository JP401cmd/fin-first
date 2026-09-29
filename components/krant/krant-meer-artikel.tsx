import Link from 'next/link'
import { PageOpening } from '@/components/editorial'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { getPageInfo } from '@/lib/page-info-content'
import { MeerTriFinityKnop } from './meer-trifinity-knop'

/**
 * Wat het volledige TriFinity laat zien — beschrijvend, zonder belofte, prijs
 * of adviestaal (Krant 2D fase 1). Vier onderdelen; elk zegt wát je ziet, niet
 * wat het je oplevert.
 */
export const GEHEEL_ONDERDELEN: ReadonlyArray<{ titel: string; tekst: string }> = [
  {
    titel: 'Je vermogen in één overzicht',
    tekst:
      'Wat je bezit en wat je nog aflost staan bij elkaar. Je netto vermogen zie je ook als vrijheidstijd: de tijd waarin je uitgaven ermee gedekt zijn.',
  },
  {
    titel: 'Je budget',
    tekst: 'Wat er per maand binnenkomt en uitgaat, en welk deel je opzij zet om vrijheid op te bouwen.',
  },
  {
    titel: 'Belasting en box 3',
    tekst: 'Hoe box 3 werkt en wat het forfait op je eigen cijfers betekent, uitgerekend en uitgelegd.',
  },
  {
    titel: 'Een plan in de tijd',
    tekst:
      'Hoe je vermogen zich over de jaren ontwikkelt met de aannames die je zelf instelt, en vanaf wanneer je uitgaven gedekt zijn.',
  },
]

/**
 * De inhoud van /krant/meer. Een pure weergave (geen data, geen hooks), zodat
 * de pagina zelf alleen hoeft te bepalen wie er kijkt.
 *
 * `isKrant`: alleen een Krant-account krijgt de knop. Een account dat al het
 * volledige TriFinity heeft, krijgt een rustige verwijzing naar zijn overzicht.
 */
export function KrantMeerArtikel({ isKrant }: { isKrant: boolean }) {
  return (
    <div className="relative mx-auto max-w-3xl px-4 pt-4 pb-16 sm:px-6">
      <PageInfoButton content={getPageInfo('/krant/meer')} className="absolute right-4 top-4 sm:right-6" />
      <PageOpening
        gutterClassName="pr-12 sm:pr-14"
        kicker="Krant · meer TriFinity"
        titleBefore="Naast je Krant: "
        emphasis="je eigen geld"
        titleAfter=" in beeld"
        deck="Je Krant laat zien welk nieuws jouw situatie raakt. Het volledige TriFinity zet daar je eigen cijfers naast, met elk bedrag ook als vrijheidstijd."
      />

      <section aria-labelledby="krant-meer-wat" className="mt-10">
        <h2 id="krant-meer-wat" className="font-serif text-xl text-[var(--ink)] sm:text-2xl">
          Wat je dan ziet
        </h2>
        <ol className="mt-4 border-b border-[var(--border-ed)]">
          {GEHEEL_ONDERDELEN.map((o, i) => (
            <li key={o.titel} className="grid grid-cols-[2rem_1fr] gap-x-3 border-t border-[var(--border-ed)] py-4">
              <span
                aria-hidden="true"
                className="pt-0.5 font-mono text-[11px] tabular-nums text-[var(--module-active-700)]"
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="font-serif text-base font-semibold text-[var(--ink)]">{o.titel}</h3>
                <p className="mt-1 text-sm leading-relaxed text-[var(--ink-2)]">{o.tekst}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="krant-meer-hoe" className="mt-10">
        <h2 id="krant-meer-hoe" className="font-serif text-xl text-[var(--ink)] sm:text-2xl">
          Wat er verandert
        </h2>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--ink-2)]">
          <p>
            Je vult zelf aan wat nog ontbreekt: wat je verdient, wat je uitgeeft en wat je bezit. Een bankkoppeling is
            niet nodig.
          </p>
          <p>
            Er wordt niets gewist. Je Krant, je nieuwsprofiel en je instellingen blijven staan. Terug naar alleen de
            Krant kan via{' '}
            <Link href="/contact" className="underline underline-offset-2 hover:text-[var(--ink)]">
              support
            </Link>
            ; je gegevens blijven dan ook staan.
          </p>
          <p>Losse uitbreidingen, zoals een automatische bankkoppeling, staan daar los van.</p>
        </div>

        <div className="mt-6">
          {isKrant ? (
            <MeerTriFinityKnop />
          ) : (
            <p className="text-sm text-[var(--ink-2)]">
              Je gebruikt het volledige TriFinity al.{' '}
              <Link
                href="/overzicht"
                className="font-medium text-[var(--module-active-800)] underline underline-offset-2 hover:text-[var(--module-active-900)]"
              >
                Naar je overzicht
              </Link>
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
