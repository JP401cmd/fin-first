'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ChevronDown,
  LineChart,
  TrendingUp,
  Calendar,
  Landmark,
  ArrowDownToLine,
  Shield,
  Receipt,
  Settings,
  Lightbulb,
  BarChart3,
  Layers,
  Compass,
  Wallet,
} from 'lucide-react'

/* ── Section data ─────────────────────── */

interface Section {
  id: string
  number: number
  title: string
  icon: React.ElementType
  content: React.ReactNode
}

const HORIZON_COLOR = 'var(--color-horizon-400)'

function SectionBlock({
  section,
  open,
  onToggle,
}: {
  section: Section
  open: boolean
  onToggle: () => void
}) {
  const Icon = section.icon
  return (
    <div className="border-b border-[var(--border-ed)] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-3 py-3 sm:px-4 sm:py-3.5 text-left transition-colors hover:bg-[var(--subtle)]/40 min-h-[44px]"
        aria-expanded={open}
      >
        {/* Number badge */}
        <div
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
          style={{ backgroundColor: HORIZON_COLOR }}
        >
          {section.number}
        </div>
        {/* Icon */}
        <div
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[var(--subtle)]"
          style={{ color: HORIZON_COLOR }}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
        {/* Title */}
        <span className="flex-1 text-[13px] font-semibold text-[var(--ink)] leading-relaxed pt-0.5">
          {section.title}
        </span>
        {/* Chevron */}
        <ChevronDown
          className={`mt-1 h-4 w-4 shrink-0 text-[var(--ink-4)] transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Animated content */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-in-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-4 sm:px-4 sm:pb-5 pl-[60px] sm:pl-[72px]">
            <div className="text-base leading-relaxed text-[var(--ink-2)] space-y-2">
              {section.content}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Inline link helper ─────────────── */

function InLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="font-semibold underline underline-offset-2 decoration-[var(--color-horizon-400)]/40 hover:decoration-[var(--color-horizon-400)] transition-colors"
    >
      {children}
    </Link>
  )
}

/* ── Main component ─────────────────── */

export default function GuideHorizonUitleg() {
  const [openSections, setOpenSections] = useState<Set<number>>(new Set())

  const toggle = (n: number) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }

  const sections: Section[] = [
    {
      id: 'horizon-uitleg-fases',
      number: 1,
      title: 'De drie fases',
      icon: LineChart,
      content: (
        <>
          <p>
            De Horizon-grafiek toont je vermogen over de tijd in <strong>drie fases</strong>:
          </p>
          <p>
            <strong>1. Opbouwfase</strong> — van nu tot je FIRE-leeftijd. In deze periode groeit je
            vermogen door drie krachten: je maandelijkse besparingen (inkomen min uitgaven), het
            beleggingsrendement op je bestaande vermogen, en eventuele levensgebeurtenissen
            (erfenis, bonus, etc.). De lijn stijgt geleidelijk — hoe hoger je spaarquote en
            rendement, hoe steiler.
          </p>
          <p>
            <strong>2. Overgangsfase</strong> — van je FIRE-leeftijd tot je AOW-leeftijd (67). Dit
            is de periode waarin je financieel onafhankelijk bent, maar nog geen AOW ontvangt.
            Je overbrugt de <strong>gap</strong> tussen stoppen met werken en het ingaan van je
            staatspensioen. Als je FIRE-leeftijd vóór de AOW-leeftijd valt, heb je een{' '}
            <strong>positieve gap</strong>: jaren waarin je volledig op je eigen vermogen leunt.
            Valt je FIRE-leeftijd ná de AOW-leeftijd, dan is er een{' '}
            <strong>tekort</strong>: je moet langer doorwerken dan gehoopt, en de overgangsfase
            krimpt tot nul.
          </p>
          <p>
            <strong>3. Onttrekkingsfase</strong> — van je AOW-leeftijd tot je eindleeftijd. Je
            leeft van je opgebouwde vermogen aangevuld met AOW en eventueel pensioen. De
            lijn daalt omdat je elk jaar een deel opneemt voor je uitgaven. Hoe snel de lijn
            daalt hangt af van je onttrekkingsmethode en eindstrategie.
          </p>
          <p>
            Het <strong>hoogste punt</strong> van de grafiek is je FIRE-moment — het moment waarop
            je vermogen piekt voordat de onttrekkingen beginnen.
          </p>
          <p>
            Onder de grafiek vind je de <strong>fasebalk</strong> — een interactieve balk die de
            drie fases proportioneel weergeeft. Klik op een fase om de bijbehorende analyse te
            openen en de details van die periode te bekijken.
          </p>
        </>
      ),
    },
    {
      id: 'horizon-uitleg-fire-leeftijd',
      number: 2,
      title: 'FIRE-leeftijd',
      icon: TrendingUp,
      content: (
        <>
          <p>
            Je <strong>FIRE-leeftijd</strong> is het moment waarop je vermogen groot genoeg is om
            al je uitgaven te dekken tot aan je eindleeftijd — zonder dat je nog hoeft te werken.
          </p>
          <p>
            TriFinity berekent dit niet met een simpele formule of vast percentage. In plaats
            daarvan draait de app een <strong>volledige simulatie</strong> (binary search) die
            jaar-voor-jaar je vermogen berekent: besparingen erbij, rendement erbij, belasting
            eraf, levensgebeurtenissen meegenomen. De simulator zoekt het vroegste moment waarop
            je vermogen toereikend is.
          </p>
          <p>
            Je FIRE-leeftijd verschuift als je <strong>instellingen aanpast</strong>: een hoger
            verwacht rendement vervroegt je FIRE, hogere uitgaven vertragen het, en
            levensgebeurtenissen (erfenis, huis kopen) verschuiven het verder. Het is geen vast
            getal — het is een levende berekening.
          </p>
        </>
      ),
    },
    {
      id: 'horizon-uitleg-opbouw',
      number: 3,
      title: 'Opbouwfase in detail',
      icon: TrendingUp,
      content: (
        <>
          <p>
            Tijdens de opbouwfase groeit je vermogen door drie factoren:
          </p>
          <p>
            <strong>1. Jaarlijkse besparingen</strong> — het verschil tussen je netto inkomen en
            je uitgaven. Dit is geld dat je elk jaar aan je portfolio toevoegt. Hoe hoger je{' '}
            <strong>spaarquote</strong> (instelbaar in je profiel), hoe sneller het gaat.
          </p>
          <p>
            <strong>2. Rendement per beleggingstype</strong> — elk bezittingstype groeit met
            een <strong>eigen verwacht rendement</strong>. Spaargeld groeit met de spaarrente,
            beleggingen met het beursrendement, pensioen met het pensioenrendement, vastgoed
            met de verwachte waardestijging. Dit rendement stel je per bezitting in via{' '}
            <InLink href="/core/assets">De Kern → Bezittingen</InLink>. De simulatie berekent
            de groei per type apart en telt de resultaten op. Zo krijg je een realistischer
            beeld dan bij één uniform rendement.
          </p>
          <p>
            <strong>3. Levensgebeurtenissen</strong> — eenmalige of terugkerende cashflows die
            geld toevoegen of onttrekken. Een erfenis voegt vermogen toe, een huis kopen
            onttrekt het. Deze zijn zichtbaar als <strong>knikken</strong> in de grafiek.
          </p>
          <p>
            Het samenspel van deze drie factoren bepaalt hoe steil de opbouwcurve stijgt. In de
            grafiek zie je het cumulatieve effect.
          </p>
        </>
      ),
    },
    {
      id: 'horizon-uitleg-events',
      number: 4,
      title: 'Levensgebeurtenissen',
      icon: Calendar,
      content: (
        <>
          <p>
            Het leven verloopt niet in een rechte lijn — en je financiën ook niet.
            Levensgebeurtenissen zijn de momenten die je vermogenspad veranderen:
          </p>
          <p>
            <strong>Eenmalige events</strong> — een erfenis ontvangen, een huis kopen, een auto
            aanschaffen, trouwen. Deze verschijnen als een <strong>plotselinge stijging of
            daling</strong> (een knik) in de grafiek op het moment dat ze plaatsvinden.
          </p>
          <p>
            <strong>Terugkerende events</strong> — AOW-uitkering, pensioeninkomen, kinderopvang
            kosten. Deze veranderen de <strong>helling</strong> van de curve: terugkerend inkomen
            maakt de daling na FIRE minder steil, terugkerende kosten maken de opbouw trager.
          </p>
          <p>
            Levensgebeurtenissen worden meegenomen in <strong>alle drie fases</strong> — opbouw,
            overgang én onttrekking. Een AOW-uitkering die begint op 67 vermindert bijvoorbeeld je
            benodigde onttrekking uit je portfolio, waardoor je vermogen langer meegaat. Een kind
            dat op je 35e wordt geboren verhoogt je uitgaven tijdens de opbouwfase.
          </p>
          <p>
            Je beheert levensgebeurtenissen op{' '}
            <InLink href="/horizon">De Horizon</InLink> pagina. Elk event verschuift je
            FIRE-datum — je ziet de impact direct.
          </p>
        </>
      ),
    },
    {
      id: 'horizon-uitleg-pensioenuitgaven',
      number: 5,
      title: 'Benodigde uitgaven na pensionering',
      icon: Receipt,
      content: (
        <>
          <p>
            Na je FIRE-leeftijd heb je elk jaar geld nodig om van te leven. Hoeveel precies
            hangt af van de methode die je kiest:
          </p>
          <p>
            <strong>Methode 1: Essentiële budgetten</strong> — TriFinity telt je vaste
            budgetcategorieën op (huur, boodschappen, verzekeringen, etc.) en gebruikt dat als
            je jaarlijkse uitgave. Dit werkt alleen als je actief budgetteert.
          </p>
          <p>
            <strong>Methode 2: Percentage van huidig inkomen</strong> — een percentage van je
            huidige netto inkomen, bijvoorbeeld 70% of 80%. Simpel en snel als je nog niet
            budgetteert.
          </p>
          <p>
            <strong>Methode 3: Eigen bedrag</strong> — je voert zelf een bedrag in dat je
            verwacht nodig te hebben. Volledige controle.
          </p>
          <p>
            Je kiest je methode in{' '}
            <InLink href="/identity/profiel">Profiel</InLink>. Het gekozen bedrag wordt
            elk jaar <strong>verhoogd met inflatie</strong> (instelbaar via{' '}
            <InLink href="/identity/instellingen">Instellingen</InLink>) — €2.000/maand nu
            is meer dan €2.000/maand over 20 jaar.
          </p>
          <p>
            <strong>Belangrijk:</strong> terugkerend inkomen na FIRE (AOW, pensioen, huurinkomsten)
            wordt <strong>afgetrokken</strong> van je benodigde onttrekking. Als je €3.000/maand
            nodig hebt en €1.200 AOW ontvangt, hoef je maar €1.800 uit je portfolio te halen.
            Dit verlengt je vermogen aanzienlijk.
          </p>
        </>
      ),
    },
    {
      id: 'horizon-uitleg-eindstrategie',
      number: 6,
      title: 'Eindstrategie',
      icon: Landmark,
      content: (
        <>
          <p>
            Je eindstrategie bepaalt <strong>wat er overblijft</strong> aan het einde van je
            leven. Dit heeft direct invloed op je FIRE-leeftijd:
          </p>
          <p>
            <strong>1. Opteren / Deplete</strong> — je vermogen mag naar €0 dalen op je
            eindleeftijd (standaard 90 jaar). Dit geeft de <strong>vroegste FIRE-datum</strong>{' '}
            omdat je al je vermogen mag opmaken. In de grafiek daalt de curve na FIRE geleidelijk
            naar nul. Risico: als je ouder wordt dan gepland, heb je geen buffer.
          </p>
          <p>
            <strong>2. Erfenis / Legacy</strong> — je vermogen moet op je eindleeftijd minstens
            een vastgesteld bedrag bevatten (geïndexeerd met inflatie). Handig als je iets wilt
            nalaten. De FIRE-datum schuift <strong>later</strong> omdat je meer vermogen nodig
            hebt. In de grafiek daalt de curve naar het legacy-bedrag in plaats van naar nul.
          </p>
          <p>
            <strong>3. Behouden / Perpetual</strong> — je vermogen moet 100+ jaar meegaan. Je
            leeft alleen van het rendement, het kapitaal blijft intact. Dit geeft de{' '}
            <strong>laatste FIRE-datum</strong> maar ook de meeste zekerheid. In de grafiek
            blijft de curve na FIRE vrijwel vlak.
          </p>
          <p>
            <strong>4. Pensioenleeftijd</strong> — het vermogen wordt opgebouwd tot je{' '}
            <strong>AOW-leeftijd</strong>, waarna de onttrekkingsfase begint. Dit is ideaal als
            je niet voor vroeg stoppen gaat maar wel grip wilt op je financiële situatie bij
            pensionering. De grafiek splitst in twee kleuren: opbouw (goud) tot AOW en
            onttrekking (bruin) daarna.
          </p>
          <p>
            Stel je eindstrategie in via{' '}
            <InLink href="/identity/instellingen">Instellingen → FIRE Instellingen</InLink> of
            via de strategie-modal op{' '}
            <InLink href="/horizon">De Horizon</InLink>.
          </p>
        </>
      ),
    },
    {
      id: 'horizon-uitleg-onttrekking',
      number: 7,
      title: 'Opnamestrategie',
      icon: ArrowDownToLine,
      content: (
        <>
          <p>
            Je opnamestrategie bepaalt <strong>hoeveel je elk jaar opneemt</strong> uit je
            portfolio. Dit beïnvloedt de vorm van de curve na FIRE:
          </p>
          <p>
            <strong>1. Vast (SWR)</strong> — je onttrekt een vast bedrag per jaar, meegroeiend
            met inflatie. De grafiek toont een <strong>gladde, geleidelijk dalende curve</strong>.
            Voorspelbaar en eenvoudig.
          </p>
          <p>
            <strong>2. Guardrails</strong> — past de onttrekking aan op basis van
            portfolioperformance (±10% boven/onder een vloer en plafond). In de deterministische
            simulatie is het resultaat <strong>vrijwel identiek aan Vast</strong>. Het verschil
            zit in de Monte Carlo simulatie waar marktonzekerheid wordt meegenomen.
          </p>
          <p>
            <strong>3. VPW (Variable Percentage Withdrawal)</strong> — elk jaar bereken je een
            nieuw percentage op basis van resterende levensverwachting en portfoliowaarde. De
            grafiek toont een <strong>komvormige curve</strong>: vroege jaren minder, late jaren
            meer. Kan een <strong>eerdere FIRE-datum</strong> opleveren dan Vast.
          </p>
          <p>
            <strong>4. Bucket (drie-emmer methode)</strong> — verdeel je vermogen in cash (2 jaar),
            obligaties (5 jaar) en aandelen (rest). In de deterministische simulatie is het
            resultaat <strong>identiek aan Vast</strong>. Het verschil zit in risicospreiding en
            emotionele rust bij marktdalingen.
          </p>
          <p>
            Kies je opnamestrategie via de strategie-modal op{' '}
            <InLink href="/horizon">De Horizon</InLink>.
          </p>
        </>
      ),
    },
    {
      id: 'horizon-uitleg-box3',
      number: 8,
      title: 'Belasting (Box 3)',
      icon: Shield,
      content: (
        <>
          <p>
            In Nederland betaal je <strong>vermogensrendementsheffing</strong> (Box 3) over je
            vermogen. TriFinity rekent dit automatisch mee in de simulatie — per bezittingstype.
          </p>
          <p>
            <strong>Per type een ander forfaitair rendement:</strong> de overheid maakt
            onderscheid tussen spaargeld (forfaitair ca. 1,28%) en beleggingen (forfaitair ca.
            6,04%). Over dit fictieve rendement betaal je <strong>36% belasting</strong>. Het
            maakt niet uit wat je werkelijke rendement is — de belasting is altijd gebaseerd op
            het forfaitaire percentage van dat type.
          </p>
          <p>
            <strong>Heffingsvrij vermogen:</strong> je betaalt niet over alles. De eerste{' '}
            <strong>€ 57.000</strong> (of € 114.000 met fiscaal partner) is vrijgesteld. Dit{' '}
            <strong>heffingsvrij vermogen</strong> wordt proportioneel verdeeld over al je
            bezittingstypes. Heb je €50.000 spaargeld en €100.000 beleggingen? Dan wordt
            ⅓ van de vrijstelling aan spaargeld toegerekend en ⅔ aan beleggingen.
          </p>
          <p>
            In de simulatie wordt de <strong>effectieve Box 3 drag</strong> elk jaar opnieuw
            berekend per type: forfaitair rendement × tarief, verminderd met je aandeel in het
            heffingsvrij vermogen. Spaargeld heeft hierdoor een veel lagere belastingdruk dan
            beleggingen. Dit verklaart waarom de bekende{' '}
            <strong>NL_SWR van 2,88%</strong> lager is dan de Amerikaanse 4%-regel — de 2,88%
            is geen instelling maar een <strong>uitkomst</strong> van deze berekening bij
            standaardwaarden (7% bruto rendement, 2% inflatie).
          </p>
          <p>
            Je kunt je bruto rendement aanpassen via{' '}
            <InLink href="/identity/instellingen">Instellingen → FIRE Instellingen</InLink>.
            De Box 3 constanten (forfaitair rendement en tarief) zijn wettelijk vastgesteld en
            worden niet door de gebruiker aangepast.
          </p>
        </>
      ),
    },
    {
      id: 'horizon-uitleg-schulden',
      number: 9,
      title: 'Schulden in de prognose',
      icon: Wallet,
      content: (
        <>
          <p>
            Schulden zijn niet zomaar een negatief getal — ze hebben een{' '}
            <strong>eigen aflossingsschema</strong> dat de simulatie jaar voor jaar meeneemt.
            Elk type schuld wordt anders afgelost:
          </p>
          <div className="rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)]/40 p-2.5 space-y-1.5 mt-1">
            <p>
              <strong>Annuïteit</strong> — vaste maandlasten; in het begin betaal je vooral
              rente, later vooral aflossing. Het resterende saldo daalt exponentieel.
            </p>
            <p>
              <strong>Lineair</strong> — elke maand een gelijk bedrag aan aflossing plus rente
              over het restant. De maandlasten dalen geleidelijk.
            </p>
            <p>
              <strong>Aflossingsvrij</strong> — je betaalt alleen rente, het saldo blijft
              constant tot de einddatum. Handig voor sommige hypotheekvormen.
            </p>
          </div>
          <p>
            De simulatie berekent per schuld, per jaar: hoeveel rente je betaalt, hoeveel je
            aflost, en wat het resterende saldo is. Deze rentelasten worden meegenomen als{' '}
            <strong>uitgave</strong> in je jaarlijkse cashflow. Wanneer een schuld volledig is
            afgelost, valt die uitgave weg — je ziet dat terug als een{' '}
            <strong>positieve knik</strong> in de grafiek.
          </p>
          <p>
            In de <strong>Vermogensopbouw</strong>-weergave verschijnen schulden als rode
            laag onder de nullijn. Zo zie je precies wanneer welke schuld is afgelost en hoe
            dat je netto vermogen beïnvloedt.
          </p>
          <p>
            Beheer je schulden via{' '}
            <InLink href="/core/debts">De Kern → Schulden</InLink>.
          </p>
        </>
      ),
    },
    {
      id: 'horizon-uitleg-parameters',
      number: 10,
      title: 'Wat kun je aanpassen?',
      icon: Settings,
      content: (
        <>
          <p>
            Alle factoren die de Horizon-grafiek beïnvloeden kun je zelf instellen. Hier vind je
            ze:
          </p>
          <div className="rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)]/40 p-2.5 space-y-1.5 mt-1">
            <p>
              <strong>Verwacht rendement</strong> — bruto jaarlijks rendement op je
              beleggingen.
              <br />
              <span className="text-[var(--ink-3)]">
                → <InLink href="/identity/instellingen">Identiteit → Instellingen → FIRE Instellingen</InLink>
              </span>
            </p>
            <p>
              <strong>Inflatie</strong> — verwachte jaarlijkse prijsstijging.
              <br />
              <span className="text-[var(--ink-3)]">
                → <InLink href="/identity/instellingen">Identiteit → Instellingen → FIRE Instellingen</InLink>
              </span>
            </p>
            <p>
              <strong>Pensioenuitgaven methode</strong> — hoe je jaarlijkse uitgaven na FIRE
              worden bepaald (essentieel, percentage of eigen bedrag).
              <br />
              <span className="text-[var(--ink-3)]">
                → <InLink href="/identity/profiel">Identiteit → Profiel</InLink>
              </span>
            </p>
            <p>
              <strong>Eindstrategie</strong> — deplete, legacy, perpetual of pensioenleeftijd.
              <br />
              <span className="text-[var(--ink-3)]">
                → <InLink href="/identity/instellingen">Identiteit → Instellingen</InLink> of strategie-modal op{' '}
                <InLink href="/horizon">De Horizon</InLink>
              </span>
            </p>
            <p>
              <strong>Opnamestrategie</strong> — Vast, Guardrails, VPW of Bucket.
              <br />
              <span className="text-[var(--ink-3)]">
                → Strategie-modal op <InLink href="/horizon">De Horizon</InLink>
              </span>
            </p>
            <p>
              <strong>Levensgebeurtenissen</strong> — eenmalige en terugkerende events.
              <br />
              <span className="text-[var(--ink-3)]">
                → <InLink href="/horizon">De Horizon</InLink> pagina
              </span>
            </p>
          </div>
          <div className="flex items-start gap-2 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)]/40 p-2.5 mt-2">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <p className="text-sm leading-relaxed text-[var(--ink-3)] italic">
              Elke aanpassing werkt direct door in de grafiek. Experimenteer gerust — je kunt
              altijd terug naar de standaardwaarden via Instellingen.
            </p>
          </div>
        </>
      ),
    },
    {
      id: 'horizon-uitleg-inkomen-uitgaven',
      number: 11,
      title: 'Inkomen & Uitgaven weergave',
      icon: BarChart3,
      content: (
        <>
          <p>
            Onder de vermogensgrafiek vind je een inklapbare <strong>Inkomen &amp; Uitgaven</strong>{' '}
            grafiek. Klik op de toggle-balk om hem te openen. Deze grafiek toont twee lijnen — je
            bruto inkomen (paars) en je bruto uitgaven (oranje) — per levensjaar.
          </p>
          <p>
            <strong>Wat telt als inkomen?</strong> Dat hangt af van de fase:
          </p>
          <p>
            <strong>Opbouwfase</strong> — je netto jaarinkomen (salaris), positieve
            levensgebeurtenissen (erfenis, bonus, huurinkomsten) en het beleggingsrendement op je
            portfolio. Samen vormen deze drie bronnen je totale bruto inkomen.
          </p>
          <p>
            <strong>Overgangsfase</strong> — je hebt geen salaris meer, maar nog geen AOW. Inkomen
            bestaat uit beleggingsrendement op je portfolio en eventuele positieve
            levensgebeurtenissen (huurinkomsten, parttime werk).
          </p>
          <p>
            <strong>Onttrekkingsfase</strong> — inkomen bestaat uit beleggingsrendement op je
            portfolio, AOW-uitkering, eventueel pensioen en overige positieve
            levensgebeurtenissen.
          </p>
          <p>
            <strong>Wat telt als uitgaven?</strong>
          </p>
          <p>
            <strong>Opbouwfase</strong> — je jaarlijkse levenskosten plus negatieve
            levensgebeurtenissen (huis kopen, auto, bruiloft, kinderopvang).
          </p>
          <p>
            <strong>Overgangsfase</strong> — je jaarlijkse onttrekking uit je portfolio plus
            negatieve levensgebeurtenissen. Geen salaris meer, maar ook nog geen AOW — je leeft
            volledig van je vermogen.
          </p>
          <p>
            <strong>Onttrekkingsfase</strong> — je jaarlijkse onttrekking uit je portfolio plus
            negatieve levensgebeurtenissen, verminderd met AOW- en pensioeninkomsten.
          </p>
          <p>
            <strong>De gap tussen de lijnen</strong> is je netto vermogensmutatie per jaar. Waar
            inkomen boven uitgaven ligt (paars vlak) groeit je vermogen — dit zie je terug als
            stijging in de portfoliografiek erboven. Waar uitgaven boven inkomen liggen (oranje vlak)
            daalt je vermogen.
          </p>
          <p>
            <strong>Levensgebeurtenissen</strong> zijn direct zichtbaar: een erfenis verhoogt de
            inkomenlijn in dat jaar, een huis kopen verhoogt de uitgavenlijn. Terugkerende events
            (AOW, pensioen) verschuiven het niveau structureel.
          </p>
          <p>
            De grafiek deelt dezelfde <strong>leeftijdsas</strong> als de portfolio-grafiek erboven.
            Zoom en pan werken automatisch mee — als je inzoomt op de portfoliografiek, schaalt de
            inkomen/uitgaven-grafiek mee naar hetzelfde leeftijdsbereik.
          </p>
        </>
      ),
    },
    {
      id: 'horizon-uitleg-vermogensopbouw',
      number: 12,
      title: 'Vermogensopbouw weergave',
      icon: Layers,
      content: (
        <>
          <p>
            Boven de grafiek vind je een <strong>toggle</strong> met twee pill-tabs:{' '}
            <strong>Vermogenspad</strong> en <strong>Vermogensopbouw</strong>. Hiermee wissel je tussen
            twee weergaven van je vermogen over tijd.
          </p>
          <p>
            <strong>Vermogenspad</strong> (standaard) — de bekende lijngrafiek die je{' '}
            <strong>totale netto vermogen</strong> toont als één doorlopende lijn. Ideaal om je
            FIRE-traject en de drie fases (opbouw, overgang en onttrekking) te volgen.
          </p>
          <p>
            <strong>Vermogensopbouw</strong> — een gestapelde kolomgrafiek die laat zien{' '}
            <strong>waaruit</strong> je vermogen is opgebouwd. Elke kolom is verdeeld in vijf
            categorieën:
          </p>
          <div className="rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)]/40 p-2.5 space-y-1 mt-1">
            <p>
              <span className="inline-block h-2.5 w-2.5 rounded-sm mr-1.5 align-middle" style={{ backgroundColor: '#3b82f6' }} />
              <strong>Spaargeld</strong> — je spaar- en betaalrekeningen (cash, savings)
            </p>
            <p>
              <span className="inline-block h-2.5 w-2.5 rounded-sm mr-1.5 align-middle" style={{ backgroundColor: '#10b981' }} />
              <strong>Beleggingen</strong> — aandelen, obligaties, fondsen en ETF's
            </p>
            <p>
              <span className="inline-block h-2.5 w-2.5 rounded-sm mr-1.5 align-middle" style={{ backgroundColor: '#8b5cf6' }} />
              <strong>Pensioen</strong> — pensioenaanspraken en levensverzekeringen
            </p>
            <p>
              <span className="inline-block h-2.5 w-2.5 rounded-sm mr-1.5 align-middle" style={{ backgroundColor: '#f59e0b' }} />
              <strong>Vastgoed</strong> — je eigen huis en eventueel ander onroerend goed
            </p>
            <p>
              <span className="inline-block h-2.5 w-2.5 rounded-sm mr-1.5 align-middle" style={{ backgroundColor: '#71717a' }} />
              <strong>Overig</strong> — crypto, voertuigen, fysieke bezittingen, deelnemingen,
              vorderingen en overige activa
            </p>
          </div>
          <p>
            <strong>Schulden</strong> verschijnen als{' '}
            <span className="inline-block h-2.5 w-2.5 rounded-sm mr-0.5 align-middle" style={{ backgroundColor: '#ef4444' }} />{' '}
            <strong>negatieve laag</strong> onder de nullijn. Zo zie je in één oogopslag hoe je
            schulden zich verhouden tot je bezittingen en hoe beide zich ontwikkelen.
          </p>
          <p>
            <strong>Hoe wordt elke categorie geprojecteerd?</strong> Per bezitting berekent TriFinity
            het toekomstige saldo op basis van het <strong>verwachte rendement</strong> dat je per
            bezitting hebt ingesteld (in{' '}
            <InLink href="/core/assets">De Kern → Bezittingen</InLink>), plus eventuele{' '}
            <strong>maandelijkse bijdragen</strong>. Schulden worden afgelost volgens hun
            aflossingsschema (annuïteit, lineair of aflossingsvrij).
          </p>
          <p>
            <strong>Hoe evolueert de verdeling?</strong> Elke bezitting groeit met het{' '}
            <strong>individuele verwachte rendement</strong> dat je per bezitting hebt ingesteld. Spaargeld
            groeit met de spaarrente, beleggingen met het beursrendement, vastgoed met de verwachte
            waardestijging. Hierdoor verschuift de verdeling over tijd: als beleggingen sneller groeien
            dan spaargeld, wordt het beleggingsblok relatief groter. Zo zie je hoe je vermogensmix
            evolueert naarmate de tijd verstrijkt.
          </p>
          <p>
            <strong>De onttrekkingswaterval na FIRE</strong> — na je FIRE-leeftijd heb je elk jaar
            geld nodig voor levensonderhoud. TriFinity onttrekt dit in een vaste{' '}
            <strong>watervalgorde</strong>, van meest liquide naar minst liquide:
          </p>
          <div className="rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)]/40 p-2.5 space-y-1 mt-1">
            <p>
              <strong>1.</strong> <strong>Beleggingen</strong> — eerst wordt het meest liquide
              beleggingsvermogen aangesproken
            </p>
            <p>
              <strong>2.</strong> <strong>Spaargeld</strong> — als beleggingen onvoldoende zijn,
              volgt spaargeld
            </p>
            <p>
              <strong>3.</strong> <strong>Overig</strong> — crypto, voertuigen en andere activa
            </p>
            <p>
              <strong>4.</strong> <strong>Pensioen</strong> — pensioenaanspraken worden pas later
              aangesproken
            </p>
            <p>
              <strong>5.</strong> <strong>Vastgoed</strong> — als laatste wordt vastgoed aangesproken
              (illiquide)
            </p>
          </div>
          <p>
            Merk op dat pensioen en vastgoed als <strong>illiquide middelen</strong> bewust achteraan
            staan. In de praktijk verkoop je niet direct je huis om boodschappen te betalen. De
            waterval weerspiegelt dit: je liquide middelen (beleggingen, spaargeld) worden eerst
            opgemaakt. Pas als die leeg zijn, worden minder liquide bezittingen aangesproken.
          </p>
          <p>
            <strong>Totaal = Vermogenspad (single source of truth)</strong> — het totaal van alle
            groepen in de Vermogensopbouw komt <strong>altijd exact overeen</strong> met de waarde
            op de Vermogenspad-lijngrafiek. Dit is geen toeval: de Vermogensopbouw berekent eerst
            onderlinge verhoudingen en vermenigvuldigt die met het portfoliototaal uit de simulatie.
            Beide weergaven zijn dus twee kanten van dezelfde berekening.
          </p>
          <p>
            <strong>Verschil met Vermogenspad:</strong> het Vermogenspad toont het{' '}
            <strong>totaal</strong> als één lijn — handig voor het grote plaatje. De
            Vermogensopbouw toont de <strong>samenstelling</strong> — handig om te zien welke
            categorieën het zwaarst wegen en hoe de verdeling over tijd verandert.
          </p>
          <p>
            <strong>Levensgebeurtenissen</strong> beïnvloeden ook de Vermogensopbouw: een erfenis
            verschijnt als een sprong in de betreffende categorie, een huis kopen verhoogt vastgoed
            maar verlaagt spaargeld of beleggingen. Zoom en pan werken in beide weergaven op
            dezelfde manier.
          </p>
          <div className="flex items-start gap-2 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)]/40 p-2.5 mt-2">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <p className="text-sm leading-relaxed text-[var(--ink-3)] italic">
              <strong>Disclaimer:</strong> de projectie is gebaseerd op het verwachte rendement dat je per
              bezitting hebt ingesteld. Werkelijke rendementen kunnen afwijken. Gebruik de Vermogensopbouw
              als richtlijn, niet als garantie.
            </p>
          </div>
        </>
      ),
    },
    {
      id: 'horizon-uitleg-planningshorizon',
      number: 13,
      title: 'Planningshorizon: FIRE vs. Pensioen',
      icon: Compass,
      content: (
        <>
          <p>
            TriFinity biedt twee planningsmodi die bepalen <strong>wanneer je onttrekkingsfase
            begint</strong>:
          </p>
          <p>
            <strong>1. FIRE-modus (standaard)</strong> — de grafiek berekent het exacte moment
            waarop je vermogen voldoende is om je uitgaven te dekken zonder te werken. Dit kan
            op elke leeftijd zijn — van 35 tot 65. De FIRE-leeftijd wordt dynamisch berekend
            op basis van je vermogen, besparing en rendement.
          </p>
          <p>
            <strong>2. Pensioen-modus</strong> — de grafiek richt zich op vermogensopbouw tot
            je <strong>AOW-leeftijd</strong> (wettelijk bepaald, momenteel rond 67 jaar). In
            plaats van een FIRE-doelbedrag toont de grafiek hoeveel vermogen je op je
            pensioenleeftijd verwacht te hebben, en hoeveel je daaruit maandelijks kunt
            onttrekken.
          </p>
          <p>
            <strong>Wanneer kies je pensioen-modus?</strong> Als je niet streeft naar vroeg
            stoppen met werken maar wel inzicht wilt in je financiële situatie bij pensionering.
            Of als je al bijna met pensioen gaat en wilt zien of je vermogen toereikend is.
          </p>
          <p>
            <strong>Wat verandert er in de interface?</strong>
          </p>
          <div className="rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)]/40 p-2.5 space-y-1 mt-1">
            <p>
              <strong>KPI 1:</strong> Vrijheidsleeftijd → <strong>Pensioenleeftijd</strong> (je AOW-leeftijd)
            </p>
            <p>
              <strong>KPI 2:</strong> Doelbedrag → <strong>Verwacht vermogen op AOW</strong> (geprojecteerd bedrag)
            </p>
            <p>
              <strong>KPI 3:</strong> Opnamerate → <strong>Maandelijkse onttrekking</strong> (SWR × vermogen / 12)
            </p>
            <p>
              <strong>Grafiek:</strong> twee kleuren — <strong>goud</strong> (opbouw tot AOW) en{' '}
              <strong>bruin</strong> (onttrekking na AOW)
            </p>
            <p>
              <strong>Waarschuwing:</strong> &quot;FIRE niet bereikbaar&quot; wordt verborgen (AOW is altijd bereikbaar)
            </p>
          </div>
          <p>
            Wissel tussen modi via de context-hint onder de grafiek, of via{' '}
            <InLink href="/horizon?strategie=open">de strategie-instellingen</InLink>.
          </p>
          <div className="flex items-start gap-2 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)]/40 p-2.5 mt-2">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <p className="text-sm leading-relaxed text-[var(--ink-3)] italic">
              <strong>Pro tip:</strong> je kunt altijd wisselen tussen FIRE en Pensioen in de
              strategie-instellingen. Je data blijft bewaard — alleen de weergave verandert.
            </p>
          </div>
        </>
      ),
    },
  ]

  const expandAll = () => {
    setOpenSections(new Set(sections.map((s) => s.number)))
  }

  const collapseAll = () => {
    setOpenSections(new Set())
  }

  const allOpen = openSections.size === sections.length

  return (
    <div id="guide-horizon-grafiek" className="card-editorial overflow-hidden scroll-mt-24">
      {/* Header */}
      <div className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[var(--subtle)]"
            style={{ color: HORIZON_COLOR }}
          >
            <LineChart className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[var(--ink)]">
              Hoe de Horizon-grafiek werkt
            </p>
            <p className="mt-1 text-base font-medium leading-relaxed text-[var(--ink)]">
              De grafiek op De Horizon is het hart van TriFinity. Hij toont je volledige
              vermogenspad — van nu tot voorbij je pensioen. Hieronder leggen we stap voor stap
              uit wat je ziet en welke knoppen je kunt draaien.
            </p>
            <p className="mt-1.5 text-base leading-relaxed text-[var(--ink-2)]">
              Klik op een sectie om de uitleg te lezen. Geen jargon, geen formules — gewoon
              helder Nederlands.
            </p>
          </div>
        </div>

        {/* Expand/collapse all */}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={allOpen ? collapseAll : expandAll}
            className="text-[11px] font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors underline underline-offset-2"
          >
            {allOpen ? 'Alles inklappen' : 'Alles uitklappen'}
          </button>
        </div>
      </div>

      {/* Sections */}
      <div className="border-t border-[var(--border-ed)]">
        {sections.map((section) => (
          <SectionBlock
            key={section.number}
            section={section}
            open={openSections.has(section.number)}
            onToggle={() => toggle(section.number)}
          />
        ))}
      </div>
    </div>
  )
}
