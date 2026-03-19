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
            <div className="text-[12px] leading-relaxed text-[var(--ink-2)] space-y-2">
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
      title: 'De twee fases',
      icon: LineChart,
      content: (
        <>
          <p>
            De Horizon-grafiek toont je vermogen over de tijd in <strong>twee fases</strong>:
          </p>
          <p>
            <strong>1. Opbouwfase</strong> — van nu tot je FIRE-leeftijd. In deze periode groeit je
            vermogen door drie krachten: je maandelijkse besparingen (inkomen min uitgaven), het
            beleggingsrendement op je bestaande vermogen, en eventuele levensgebeurtenissen
            (erfenis, bonus, etc.). De lijn stijgt geleidelijk — hoe hoger je spaarquote en
            rendement, hoe steiler.
          </p>
          <p>
            <strong>2. Onttrekkingsfase</strong> — van je FIRE-leeftijd tot je eindleeftijd. Je
            stopt met werken (of het wordt optioneel) en leeft van je opgebouwde vermogen. De
            lijn daalt omdat je elk jaar een deel opneemt voor je uitgaven. Hoe snel de lijn
            daalt hangt af van je onttrekkingsmethode en eindstrategie.
          </p>
          <p>
            Het <strong>hoogste punt</strong> van de grafiek is je FIRE-moment — het moment waarop
            je vermogen piekt voordat de onttrekkingen beginnen. Alles links van dat punt is
            opbouw, alles rechts is onttrekking.
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
            <strong>2. Beleggingsrendement</strong> — elk jaar groeit je bestaande vermogen met
            het verwachte rendement. Dit is instelbaar via{' '}
            <InLink href="/identity/instellingen">Instellingen → FIRE Instellingen</InLink>. Het
            standaard bruto rendement is 7%. Na aftrek van Box 3 belasting en inflatie blijft
            het netto reëel rendement over.
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
            Levensgebeurtenissen worden meegenomen in <strong>beide fases</strong> — zowel opbouw
            als onttrekking. Een AOW-uitkering die begint op 67 vermindert bijvoorbeeld je
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
            beleggingen. TriFinity rekent dit automatisch mee in de simulatie.
          </p>
          <p>
            De berekening: de overheid gaat uit van een <strong>forfaitair rendement</strong> op
            je beleggingen (momenteel ca. 6,04% voor beleggingen). Over dit fictieve rendement
            betaal je <strong>36% belasting</strong>. Het maakt niet uit wat je werkelijke
            rendement is — de belasting is altijd gebaseerd op het forfaitaire percentage.
          </p>
          <p>
            In de simulatie wordt je <strong>netto rendement</strong> berekend als: bruto
            rendement minus de forfaitaire heffing. Dit verklaart waarom de bekende{' '}
            <strong>NL_SWR van 2,88%</strong> lager is dan de Amerikaanse 4%-regel. De 2,88%
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
      id: 'horizon-uitleg-parameters',
      number: 9,
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
              <strong>Eindstrategie</strong> — deplete, legacy of perpetual.
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
            <p className="text-[11px] leading-relaxed text-[var(--ink-3)] italic">
              Elke aanpassing werkt direct door in de grafiek. Experimenteer gerust — je kunt
              altijd terug naar de standaardwaarden via Instellingen.
            </p>
          </div>
        </>
      ),
    },
    {
      id: 'horizon-uitleg-inkomen-uitgaven',
      number: 10,
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
            <strong>Onttrekkingsfase</strong> — je hebt geen salaris meer, dus inkomen bestaat uit
            beleggingsrendement op je portfolio en eventuele positieve levensgebeurtenissen (AOW,
            pensioenuitkering, huurinkomsten).
          </p>
          <p>
            <strong>Wat telt als uitgaven?</strong>
          </p>
          <p>
            <strong>Opbouwfase</strong> — je jaarlijkse levenskosten plus negatieve
            levensgebeurtenissen (huis kopen, auto, bruiloft, kinderopvang).
          </p>
          <p>
            <strong>Onttrekkingsfase</strong> — je jaarlijkse onttrekking uit je portfolio plus
            negatieve levensgebeurtenissen. De onttrekking is het bedrag dat je opneemt om je
            levenskosten te dekken.
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
            <p className="mt-1 text-[12px] font-medium leading-relaxed text-[var(--ink)]">
              De grafiek op De Horizon is het hart van TriFinity. Hij toont je volledige
              vermogenspad — van nu tot voorbij je pensioen. Hieronder leggen we stap voor stap
              uit wat je ziet en welke knoppen je kunt draaien.
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--ink-2)]">
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
