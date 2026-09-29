import { SectieKopMetId } from './overzicht'

/**
 * Wat het dashboard niet kan zien, en welke beslissing daardoor op minder
 * steunt. Bewust op het scherm zelf: een dashboard dat zijn blinde vlekken
 * verzwijgt, leest als vollediger dan het is.
 *
 * Gecureerd, geen meting. Een punt verdwijnt hier zodra de meting bestaat.
 */

interface BlindeVlek {
  titel: string
  watOntbreekt: string
  welkeBeslissing: string
}

export const BLINDE_VLEKKEN: readonly BlindeVlek[] = [
  {
    titel: 'Of een functie voor de gebruiker slaagde',
    watOntbreekt:
      'Het dashboard ziet fouten en of een taak of dienst draaide. Het ziet niet of een import werd afgerond, een bankkoppeling tot stand kwam of een briefing gelezen werd.',
    welkeBeslissing: 'Welke functie het eerst verbetering nodig heeft.',
  },
  {
    titel: 'Wie geraakt is door een fout zonder gebruiker',
    watOntbreekt:
      'Fouten vóór het inloggen en fouten op de server dragen geen gebruiker. Het aantal getroffen gebruikers is daardoor een ondergrens.',
    welkeBeslissing: 'De volgorde waarin fouten worden opgepakt.',
  },
  {
    titel: 'Het tijdstip van een release',
    watOntbreekt: 'Van een release is alleen de datum van de vrijgavenotitie bekend, niet het moment van uitrol.',
    welkeBeslissing: 'Of een release moet worden teruggedraaid op grond van wat er daarna gebeurde.',
  },
  {
    titel: 'De geschiedenis van de meeste instellingen',
    watOntbreekt:
      'Wijzigingen aan AI-model, prompts, limieten, bankkoppeling en rekenaannames laten geen spoor na in de audit-trail.',
    welkeBeslissing: 'Of zo’n wijziging het beoogde effect had.',
  },
  {
    titel: 'Normen voor foutvolume, AI-kosten en servertijd',
    watOntbreekt:
      'Er is geen doel vastgelegd voor het aantal fouten of de AI-kosten. De laadstappen van de app-schil worden wel gemeten, maar hebben geen norm; ze staan daarom niet op dit dashboard.',
    welkeBeslissing: 'Wanneer een stijging ingrijpen vraagt. Het dashboard toont het verloop, maar slaat er geen alarm op.',
  },
  {
    titel: 'Aflevering van e-mail',
    watOntbreekt: 'Bekend is of een e-mail verzonden, mislukt of overgeslagen is; niet of hij aankwam of geopend werd.',
    welkeBeslissing: 'Of de briefing per e-mail haar lezers bereikt.',
  },
  {
    titel: 'De afhandeling van meldingen',
    watOntbreekt:
      'Meldingen van gebruikers gaan naar de werkqueue buiten de app. Of ze daar open staan of zijn afgehandeld, is hier niet te zien.',
    welkeBeslissing: 'Of de werkvoorraad aan meldingen oploopt.',
  },
]

export function Verantwoording() {
  return (
    <section className="mb-12" aria-labelledby="sectie-grens" data-testid="sectie-grens">
      <SectieKopMetId id="sectie-grens" nummer="06 · Grens" titel="Wat dit dashboard niet kan zien">
        Deze vragen beantwoordt het dashboard niet. Er staat ook geen schatting: wat niet gemeten is, blijft leeg.
      </SectieKopMetId>
      <details className="group">
        <summary className="inline-flex min-h-11 cursor-pointer items-center border border-[var(--border-ed)] px-3 py-1.5 text-sm text-[var(--ink-2)] hover:border-[var(--border-md)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]">
          Toon de {BLINDE_VLEKKEN.length} ontbrekende metingen
        </summary>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {BLINDE_VLEKKEN.map((v) => (
            <li key={v.titel} className="border border-dashed border-[var(--border-ed)] bg-[var(--paper)] p-4">
              <h4 className="text-sm font-semibold text-[var(--ink)]">{v.titel}</h4>
              <p className="mt-1 text-xs leading-relaxed text-[var(--ink-3)]">{v.watOntbreekt}</p>
              <p className="mt-2 text-xs leading-relaxed text-[var(--ink-2)]">
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-meta)]">
                  Beslissing die hierop wacht
                </span>
                <span className="block">{v.welkeBeslissing}</span>
              </p>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}
