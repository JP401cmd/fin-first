"use client";

import { useState, useEffect } from "react";
import {
  Landmark,
  Zap,
  Compass,
  MessageSquare,
  Receipt,
  Wallet,
  CreditCard,
  PieChart,
  TrendingUp,
  BarChart3,
  LayoutDashboard,
  RefreshCw,
  Bell,
  FileText,
  Sparkles,
  Target,
  LineChart,
  ArrowDownToLine,
  Newspaper,
  Users,
  Settings,
  Smartphone,
  Rocket,
  Sun,
  Rss,
  SlidersHorizontal,
  Scale,
  Shield,
  Activity,
  Home,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import ConceptFlipCards from "@/components/app/concept-flip-cards";
import { OntdekkenSection } from "@/components/app/ontdekken-section";
import { GuideProgressBar } from "@/components/app/guide-progress-bar";
import GuideFaq from "@/components/app/guide-faq";
import GuideProTips from "@/components/app/guide-pro-tips";
import ReisStapSection from "@/components/app/reis-stap-section";
import GuideTopicCard from "@/components/app/guide-topic-card";
import GuideNaslagwerk from "@/components/app/guide-naslagwerk";
import GuideHorizonUitleg from "@/components/app/guide-horizon-uitleg";
import { SectionDivider } from "@/components/app/section-divider";

/* ── Types ─────────────────────── */

interface GuideProgress {
  counts: {
    assets: number;
    transactions: number;
    completedActions: number;
    lifeEvents: number;
    budgets: number;
    debts: number;
    pendingRecommendations: number;
    wonFreedomDays: number;
  };
  financial: {
    netWorth: number;
    dailyExpenseRate: number;
    monthlyExpenses: number;
    freedomDays: { days: number; months: number; years: number };
    fireAge: number | null;
    fireTarget: number;
    activeModules: string[];
  };
  steps: {
    hasAssets: boolean;
    hasTransactions: boolean;
    hasBudgets: boolean;
    hasCompletedActions: boolean;
    hasLifeEvents: boolean;
    hasFireData: boolean;
    hasDebts: boolean;
  };
}

/* ── Main page ─────────────────────── */

export default function GidsPage() {
  const supabase = createClient();
  const [fullName, setFullName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<GuideProgress | null>(null);

  useEffect(() => {
    async function loadData() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        if (profile?.full_name) setFullName(profile.full_name);
      }

      try {
        const res = await fetch("/api/guide-progress");
        if (res.ok) {
          const data = await res.json();
          setProgress(data);
        }
      } catch {
        // Progress data is optional
      }

      setLoading(false);
    }
    loadData();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--ink-4)] border-t-[var(--ink)]" />
      </div>
    );
  }

  const firstName = fullName ? fullName.split(" ")[0] : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* ── 1. Hero ── */}
      <section className="card-editorial overflow-hidden mb-6 sm:mb-8">
        <div className="flex h-1.5">
          <div className="flex-1 bg-kern-500" />
          <div className="flex-1 bg-wil-500" />
          <div className="flex-1 bg-horizon-500" />
        </div>
        <div className="p-4 sm:p-6">
          <h1
            className="font-display text-[24px] font-bold text-[var(--ink)] sm:text-[30px]"
            style={{ letterSpacing: "-0.02em" }}
          >
            {firstName
              ? `${firstName}, jouw reis naar vrijheid`
              : "Jouw reis naar financiële vrijheid"}
          </h1>
          <p className="mt-2 max-w-prose font-serif text-[13px] leading-relaxed text-[var(--ink-3)] italic sm:text-sm">
            &ldquo;Geld is opgeslagen tijd.&rdquo; Elke euro vertegenwoordigt een stukje levenstijd.
            TriFinity vertaalt je financiën naar vrijheidstijd — dagen, maanden en jaren dat werken
            optioneel wordt.
          </p>
        </div>
      </section>

      {/* ── 2. Voortgangsbalk ── */}
      <GuideProgressBar />

      {/* ── 3. Je reis ── */}
      <p className="label-editorial mb-3 text-[var(--ink-3)]">Je reis</p>
      <div className="mb-6 space-y-4 sm:mb-8">
        {/* ── Stap 1: Weet waar je staat ── */}
        <ReisStapSection
          id="guide-reis-1"
          step={1}
          icon={Landmark}
          title="Weet waar je staat"
          color="var(--color-kern-400)"
          subtitle={progress?.financial?.activeModules?.includes('vermogensregistratie')
            ? "Breng al je bezittingen (inclusief bankrekeningen), schulden en vermogen samen op één plek"
            : "Je totaal saldo — de som van je bankrekeningen — is je primaire financiële metric. Activeer Vermogensregistratie voor het volledige netto vermogen."}
          statusLines={
            progress
              ? progress.steps.hasAssets || progress.steps.hasDebts
                ? [
                    `Je hebt ${progress.counts.assets} bezitting${progress.counts.assets !== 1 ? "en" : ""} en ${progress.counts.debts} schuld${progress.counts.debts !== 1 ? "en" : ""} geregistreerd.`,
                    progress.financial.netWorth !== 0
                      ? `Netto vermogen: ${formatCurrency(progress.financial.netWorth)}`
                      : "",
                  ].filter(Boolean)
                : ["Je hebt nog geen vermogen ingevoerd."]
              : ["Laden..."]
          }
          valueSentence="Je ziet voor het eerst je complete financiële plaatje in vrijheidstijd."
          ctaLabel="Bekijk je vermogen"
          ctaHref="/core"
          isComplete={!!progress?.steps.hasAssets}
        >
          <GuideTopicCard
            icon={Wallet}
            title="Bankrekeningen"
            color="var(--color-kern-400)"
            description={
              <>
                Je bankrekeningen zijn het fundament. Elke euro die binnenkomt of vertrekt vertelt een verhaal over waar je tijd naartoe gaat.
                <br /><br />
                In de onboarding voeg je je bankrekeningen toe als onderdeel van je <strong>bezittingen</strong> — ze zijn geïntegreerd in het vermogensoverzicht. Voeg je <strong>betaal-, spaar-, gezamenlijke, bedrijfs- of overige rekeningen</strong> toe en houd je saldo actueel. Koppel je bank via <strong>TrueLayer</strong> voor automatische synchronisatie (max 10× per dag), of importeer transacties handmatig via de <strong>4-staps import-wizard</strong>: bestand selecteren (MT940, CSV of OFX), rekening kiezen, transacties reviewen en importeren. CSV-presets voor <strong>ING, Rabobank, ABN AMRO en PayPal</strong> worden automatisch herkend.
                <br /><br />
                Zodra je transacties binnenkomen, worden ze automatisch gecategoriseerd via drie methoden: (1) <strong>eerdere correcties</strong> (hoogste prioriteit), (2) <strong>keyword-herkenning</strong> (47 regels voor salaris, boodschappen, energie, etc.) en (3) <strong>AI-categorisatie</strong> voor onbekende transacties. Elke handmatige correctie wordt opgeslagen als regel en automatisch toegepast bij toekomstige imports — zo wordt het systeem steeds slimmer.
                <br /><br />
                <strong>Duplicaatdetectie</strong> via SHA-256 hash voorkomt dubbele boekingen. <strong>Eigen overboekingen</strong> tussen je rekeningen worden automatisch herkend en gekoppeld, zodat ze niet dubbel tellen in je budget. Het resultaat: een compleet, opgeschoond kasoverzicht als basis voor al je budgetten en vrijheidsberekeningen.
              </>
            }
            howTo={{
              steps: [
                "Rekening toevoegen: voeg bankrekeningen toe tijdens de onboarding (onder Bezittingen) of later via De Kern → Bezittingen → Nieuwe rekening. Kies het type (betaal, spaar, gezamenlijk, bedrijf of overig), voer IBAN en startsaldo in",
                "Transacties importeren: Ga naar Bezittingen → Importeren. Sleep je bankbestand (MT940, CSV of OFX) in het uploadveld — de app herkent automatisch het formaat en je bank (ING, Rabobank, ABN AMRO, PayPal)",
                "Controleer de transacties in de review-stap, pas categorieën aan waar nodig, en importeer",
                "Bankconnectie: Koppel je bank via De Kern → Bezittingen → Verbinden. Je wordt doorgestuurd naar je bank voor toestemming, daarna synchroniseren transacties automatisch",
                "Automatische categorisatie: bij import worden transacties gekoppeld aan budgetten via (1) eerdere correcties, (2) keyword-herkenning en (3) AI voor onbekende transacties",
                "Corrigeer waar nodig — elke correctie wordt automatisch een regel die bij volgende imports direct wordt toegepast",
                "Eigen overboekingen tussen je rekeningen worden automatisch herkend en gekoppeld, zodat ze niet dubbel tellen in je budget",
              ],
              tip: "Importeer minimaal 3 maanden aan transacties — dan herkent de AI je vaste patronen en wordt de categorisatie steeds nauwkeuriger.",
            }}
          />

          <GuideTopicCard
            icon={TrendingUp}
            title="Vermogensbeheer"
            color="var(--color-kern-400)"
            description={
              <>
                Al je bezittingen op één plek — van je spaarrekening tot je ETF-portfolio, van je huis tot je crypto. Samen vormen ze je <strong>opgeslagen tijd</strong>.
                <br /><br />
                In de onboarding voeg je al je bezittingen toe in één stap, inclusief je <strong>bankrekeningen</strong> — betaal-, spaar- en gezamenlijke rekeningen zijn geïntegreerd in het vermogensoverzicht. Registreer bezittingen over <strong>11 types</strong>: cash (bankrekeningen &amp; contant geld), spaarrekening, belegging (ETF/indexfonds/aandelen/obligaties), pensioen (uitkerings-/premieregeling/lijfrente), vastgoed, crypto, voertuig, fysiek bezit, deelneming, levensverzekering en vordering. Elk type heeft eigen velden, waarderingslogica en fiscale classificatie.
                <br /><br />
                Binnen beleggingen, crypto, spaargeld en pensioen kun je <strong>holdings bijhouden</strong> activeren — een toggle per bezitting die gedetailleerde positietracking inschakelt. Zodra je dat doet, verschijnt een <strong>Holdings-badge</strong> op de kaart en kun je individuele holdings toevoegen met naam, ticker of ISIN, aantal stuks en aankoopprijs. Registreer <strong>koop-, verkoop- en dividendtransacties</strong> voor nauwkeurig rendement per positie. Importeer je posities in bulk via <strong>broker-import</strong>: upload een CSV van <strong>DEGIRO, Saxo Bank of ING Beleggen</strong> — de app herkent je broker automatisch aan de kolomkoppen en importeert posities en transacties.
                <br /><br />
                Op <strong>De Kern</strong> verschijnt automatisch een <strong>Portfolio Holdings-kaart</strong> zodra je minstens één bezitting volgt — dit is je primaire toegangspunt tot het holdings-overzicht met allocatie-donut, rendement en dividendhistorie. Het <strong>Vermogen-overzicht</strong> toont al je bezittingen per type. Update waardes handmatig of via de <strong>maandelijkse check-in</strong> — elke waardering wordt opgeslagen als snapshot voor historisch verloop. Markeer een holding als <strong>favoriet</strong> en volg hem als widget op je dashboard.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Kern → Vermogen → Nieuw. Kies het type (belegging, vastgoed, crypto, etc.), geef een naam en huidige waarde op. Stel het risicoprofiel in (laag/middel/hoog).",
                "Activeer 'Holdings bijhouden' op een belegging, crypto, spaar- of pensioenrekening om gedetailleerde positietracking in te schakelen. Er verschijnt een Holdings-badge op de kaart.",
                "Voeg individuele holdings toe met naam, ticker/ISIN, aantal stuks en aankoopprijs. Registreer koop-, verkoop- en dividendtransacties voor nauwkeurig rendement.",
                "Of importeer in bulk: upload je CSV-export van DEGIRO, Saxo Bank of ING Beleggen — de app herkent je broker automatisch.",
                "Op De Kern verschijnt een Portfolio Holdings-kaart zodra je minstens één bezitting volgt. Klik door voor het volledige holdings-overzicht met allocatie (donut), rendement en dividendhistorie.",
                "Update waardes handmatig of via de maandelijkse check-in. Elke waardering wordt opgeslagen als snapshot voor historisch verloop.",
                "Markeer een holding als favoriet en volg hem als widget op je dashboard.",
              ],
              tip: "Begin met je drie grootste bezittingen — dat dekt vaak 80% van je vermogen en geeft direct een realistisch vrijheidsbeeld.",
            }}
          />

          <GuideTopicCard
            icon={CreditCard}
            title="Schuldenbeheer"
            color="var(--color-kern-400)"
            description={
              <>
                Elke schuld is negatieve vrijheidstijd. Door slim af te lossen win je
                maanden — soms jaren — <strong>terug</strong>.
                <br />
                <br />
                Beheer <strong>7 schuldtypes</strong>: hypotheek
                (annuïteit/lineair/aflossingsvrij/spaar/belegging), studieschuld (oud/nieuw
                stelsel/SF35), persoonlijke lening (aflopend/doorlopend), creditcard, doorlopend
                krediet, belastingschuld (IB/voorlopige aanslag/Box 3/BTW) en familielening. Elk
                type heeft eigen renteberekening, looptijd en fiscale behandeling.
                <br />
                <br />
                Vergelijk twee <strong>aflossingsstrategieën</strong>:{' '}
                <strong>Sneeuwbal</strong> (los eerst de kleinste schuld af voor snelle
                motivatie-wins) versus <strong>Lawine</strong> (los eerst de hoogste rente af om
                totaal de minste rente te betalen). De simulatie toont per strategie: einddatum,
                totale rente en hoeveel je bespaart. Pas variabelen aan — wat als je €100 extra
                per maand aflost? De grafiek toont het verschil in looptijd en kosten.
                <br />
                <br />
                Elke schuld beïnvloedt je <strong>netto vermogen</strong> en je{' '}
                <strong>FIRE-datum</strong>. De app berekent hoeveel vrijheidsdagen je wint door
                sneller af te lossen. Bij een partner kun je schulden verdelen: gelijk (50/50),
                naar inkomenverhouding, handmatig, of één draagt alles.
              </>
            }
            howTo={{
              steps: [
                'Ga naar De Kern → Schulden → Nieuw. Kies het type (hypotheek, studieschuld, lening, etc.), voer het openstaande bedrag, rentepercentage en maandelijkse aflossing in.',
                'Vergelijk twee aanpakken: Sneeuwbal (kleinste schuld eerst voor motivatie) vs. Lawine (hoogste rente eerst voor minste kosten). De simulatie toont per strategie: einddatum, totale rente en besparing.',
                'Simuleer extra aflossingen: wat als je €100 extra per maand aflost? De grafiek toont het verschil in looptijd en kosten.',
                'Bekijk de impact op je netto vermogen en FIRE-datum — elke afgeloste schuld verlaagt je uitgavendrempel en brengt financiële vrijheid dichterbij.',
                'Bij een huishouden: verdeel schulden over partners — gelijk (50/50), naar inkomenverhouding, handmatig, of één draagt alles.',
              ],
              tip: 'Focus op schulden met de hoogste rente boven 4% — elke euro extra aflossing levert daar het meeste vrijheidstijd op.',
            }}
          />

          <GuideTopicCard
            icon={BarChart3}
            title="Netto vermogen"
            color="var(--color-kern-400)"
            description={
              <>
                <strong>
                  Eén getal dat je hele financiële positie samenvat. Niet om te
                  oordelen, maar om richting te zien.
                </strong>
                <br /><br />
                <strong>Berekening:</strong> Netto vermogen = al je bezittingen minus al
                je schulden. Per item kun je instellen hoeveel procent meetelt
                (0–100%) — bijvoorbeeld je auto voor 50% omdat de waarde daalt, of je
                eigen woning voor 80%. Zo krijg je een realistisch beeld van je
                werkelijke financiële positie.
                <br /><br />
                <strong>Vermogensgrafiek:</strong> Op het dashboard toont de{" "}
                <em>netto_vermogen</em>-widget je vermogen als trendlijn over de
                afgelopen maanden. Tik op een punt om de samenstelling op dat moment
                te zien — zo zie je seizoenspatronen, dips en groeiversnellingen in
                één oogopslag.
                <br /><br />
                <strong>Snapshots:</strong> Elke maand bij je check-in wordt een
                snapshot opgeslagen. Zo bouw je een betrouwbare historische lijn op,
                ook als waardes tussentijds schommelen. Per snapshot zie je niet
                alleen het bedrag, maar ook je vrijheidspercentage, spaarquote en
                geschatte FIRE-leeftijd.
                <br /><br />
                <strong>Samenstelling:</strong> De breakdown toont: cash + spaar +
                beleggingen + vastgoed + crypto + overig − hypotheek − leningen −
                studieschuld = netto vermogen. Zo ontdek je of je vermogen goed
                gespreid is of te afhankelijk van één pijler.
                <br /><br />
                <strong>Mijlpalen:</strong> De app detecteert automatisch nieuwe
                records en meldt wanneer je een mijlpaal bereikt (bijv. eerste
                €10.000, €50.000, €100.000). Deze mijlpalen verschijnen in je
                tijdlijn en meldingen, zodat je ziet hoe lang het duurde om daar te
                komen. De <em>jouw_pad</em>-widget op /identity toont je vermogen op
                een temporale tijdlijn.
              </>
            }
            howTo={{
              steps: [
                "Je nettovermogen wordt automatisch berekend zodra je bezittingen en schulden hebt toegevoegd — elk item heeft een inclusiepercentage (0–100%)",
                "Bij elke check-in maakt TriFinity een balanssnapshot — je ziet het bedrag, de samenstelling en je vrijheidstijd",
                "Bekijk de netto_vermogen-widget op het dashboard voor je trendlijn over de afgelopen maanden",
                "Tik op een datapunt in de vermogensgrafiek om de samenstelling op dat moment te zien",
                "Analyseer de breakdown: cash + spaar + beleggingen + vastgoed + crypto + overig − schulden = netto vermogen",
                "Nieuwe vermogensrecords worden automatisch als mijlpaal gemarkeerd — check je tijdlijn en meldingen",
              ],
              tip: "De maandelijkse check-in is het ideale moment om je vermogen bij te werken. Stel het inclusiepercentage per bezitting in voor een realistisch beeld.",
            }}
          />
        </ReisStapSection>

        <SectionDivider variant="asterisk" className="my-6" />

        {/* ── Stap 2: Conditioneel — budgetteren vs vermogensregistratie-only ── */}
        {progress?.financial?.activeModules?.includes('budgetteren') !== false ? (
        <ReisStapSection
          id="guide-reis-2"
          step={2}
          icon={Receipt}
          title="Begrijp je patronen"
          color="var(--color-kern-400)"
          subtitle="Ontdek waar je geld naartoe gaat en hoeveel de belastingdienst meeneemt"
          statusLines={
            progress
              ? progress.steps.hasTransactions
                ? [
                    `Je hebt ${progress.counts.transactions.toLocaleString("nl-NL")} transactie${progress.counts.transactions !== 1 ? "s" : ""} ge\u00efmporteerd.`,
                  ]
                : ["Importeer je eerste transacties."]
              : ["Laden..."]
          }
          valueSentence="Ontdek waar je tijd weglekt zonder dat je het doorhebt."
          ctaLabel={progress?.steps.hasTransactions ? "Bekijk je kas" : "Importeer transacties"}
          ctaHref={progress?.steps.hasTransactions ? "/core/assets" : "/core/cash/import"}
          isComplete={!!progress?.steps.hasTransactions}
        >
          <GuideTopicCard
            icon={PieChart}
            title="Budgetteren"
            color="var(--color-kern-400)"
            description={
              <>
                Een budget is geen beperking — het is een spiegel. Je ziet waar je tijd naartoe gaat, zodat je bewust kunt kiezen waar je vrijheid groeit.
                <br /><br />
                <strong>Budgetteren is een bewuste keuze.</strong> Tijdens de onboarding kies je of je wilt budgetteren. Kies je voor &lsquo;geen budget&rsquo;, dan vul je alleen je geschatte maanduitgaven in en berekent TriFinity je FIRE-projectie op basis daarvan. Kies je wel voor budgetteren, dan selecteer je een van de <strong>drie budget-templates</strong>:
                <br /><br />
                <strong>Minimalistisch</strong> — 5 hoofdcategorieën (wonen, boodschappen, vervoer, vrije besteding, sparen). Snel overzicht, minimale administratie. Ideaal als je grip wilt zonder detail.
                <br />
                <strong>Nibud</strong> — 9 categorieën gebaseerd op de Nibud huishoudboekje-indeling. Een beproefde structuur die de meeste Nederlanders herkennen.
                <br />
                <strong>Uitgebreid</strong> — 16 gedetailleerde categorieën met subcategorieën. Maximaal inzicht in elke uitgavenpost. Voor wie precies wil weten waar elke euro naartoe gaat.
                <br /><br />
                Per categorie kies je een <strong>doeltype</strong>: vast bedrag, percentage van inkomen of flexibel — zo past je plan bij jouw situatie. Elke categorie markeer je als <strong>essentieel of niet-essentieel</strong>, wat rechtstreeks je FIRE-berekening bepaalt.
                <br /><br />
                Drie weergaven geven inzicht: <strong>boomstructuur</strong> met voortgangsbalken, <strong>donutgrafiek</strong> voor verdeling, en <strong>sparklines</strong> voor 6-maanden trends. De <strong>maand-op-maand vergelijking</strong> toont hoe je bestedingspatroon verschuift. Tik op een categorie voor het <strong>kassabon</strong>-detail met elke transactie en zie je maandrapport in gewonnen of verloren <strong>vrijheidsdagen</strong>.
                <br /><br />
                Favoriete budgetten pin je als <strong>widget op je dashboard</strong> in 4 formaten (mini, quarter, half, full) zodat je ze altijd in beeld hebt.
              </>
            }
            howTo={{
              steps: [
                "Keuze maken: tijdens de onboarding kies je of je wilt budgetteren. Je kunt dit later altijd aanpassen via De Kern → Budgetten",
                "Template kiezen: selecteer Minimalistisch (5 categorieën, snel overzicht), Nibud (9 categorieën, beproefde indeling) of Uitgebreid (16 categorieën, maximaal detail)",
                "Bedragen aanpassen: pas de voorgestelde bedragen per categorie aan op basis van je inkomen. TriFinity berekent automatisch suggesties",
                "Doeltypes kiezen: vast bedrag per maand (bijv. €400), percentage van inkomen (bijv. 30%) of flexibel zonder limiet — zo past je plan bij jouw situatie",
                "Markeer elke categorie als essentieel of niet-essentieel — dit beïnvloedt je FIRE-berekening direct",
                "Na transactie-import worden uitgaven automatisch gekoppeld via AI-categorisatie en frequentie-matching",
                "Analyse: tik op een bedrag om de kassabon te openen — een gedetailleerde breakdown van alle transacties binnen dat budget. Vergelijk maand-op-maand met trendgrafieken",
                "Bekijk je voortgang in boom-, donut- of sparkline-weergave en vergelijk maanden onderling om patronen te ontdekken",
                "Favorieten: markeer een budget als favoriet (♥) en het verschijnt automatisch als widget op De Wil-pagina in 4 formaten (mini, quarter, half, full)",
              ],
              tip: "Begin met het Minimalistisch-template als je nieuw bent. De Nibud-indeling is ideaal als je een beproefde structuur wilt. Verfijn later naar Uitgebreid als je meer detail wilt.",
            }}
          />

          <GuideTopicCard
            icon={BarChart3}
            title="Tegenpartij-analyse"
            color="var(--color-kern-400)"
            description={
              <>
                <strong>
                  Wie krijgt jouw tijd? Ontdek per tegenpartij waar je geld naartoe
                  gaat.
                </strong>
                <br />
                <br />
                Tik vanuit een transactie op <strong>Analyseer</strong> en je ziet
                direct het volledige beeld van die tegenpartij:{" "}
                <strong>totale uitgaven</strong> over de gehele periode,{" "}
                <strong>maandelijkse trend</strong> (stijgend, dalend of stabiel),{" "}
                <strong>categorieverdeling</strong> (over welke budgetten zijn de
                transacties verspreid?) en <strong>frequentie</strong> (hoe vaak
                betaal je aan deze partij?).
                <br />
                <br />
                Dit geeft antwoord op vragen als: &ldquo;Hoeveel heb ik in totaal
                uitgegeven bij Albert Heijn?&rdquo;, &ldquo;Geven we steeds meer uit
                aan Thuisbezorgd?&rdquo; of &ldquo;Hoeveel vrijheidsdagen kost mijn
                energieleverancier per jaar?&rdquo;
              </>
            }
            howTo={{
              steps: [
                "Open een transactie in je transactieoverzicht (De Kern \u2192 Bezittingen \u2192 een rekening \u2192 transactie)",
                "Tik op \u2018Analyseer tegenpartij\u2019 onderaan het transactieformulier",
                "Bekijk het totaaloverzicht: totaal uitgegeven, aantal transacties, gemiddeld bedrag",
                "Scroll door de maandelijkse trendgrafiek \u2014 stijgt, daalt of is je besteding stabiel?",
                "Tik op een maandkolom om in te zoomen \u2014 je ziet de budgetverdeling en alle transacties van die maand. Tik op een transactie om deze te bewerken",
                "Bekijk de categorieverdeling: sommige tegenpartijen vallen onder meerdere budgetten",
              ],
              tip: "Begin met je top-5 grootste tegenpartijen \u2014 zij vertegenwoordigen vaak 60% van je uitgaven. E\u00e9n bewuste aanpassing bespaart meer dan tien kleine.",
            }}
          />

          <GuideTopicCard
            icon={FileText}
            title="Belasting"
            color="var(--color-kern-400)"
            description={
              <>
                <strong>
                  Belasting is onvermijdelijk, maar slim plannen niet. Weet precies
                  wat je betaalt en waar de ruimte zit.
                </strong>
                <br /><br />
                <strong>Box 3:</strong> De Belastingdienst belast je vermogen boven het
                heffingsvrij vermogen (~€57.000 per persoon, 2026). Je betaalt belasting
                over een <strong>fictief rendement</strong> — niet over je werkelijke
                winst. De app berekent dit automatisch op basis van je ingevoerde
                vermogen.
                <br /><br />
                <strong>Fictief rendement:</strong> De Belastingdienst hanteert drie
                categorieën met verschillende percentages: spaargeld (laag fictief
                rendement, ~1,03%), beleggingen (hoger, ~6,04%) en overig (schulden
                aftrekbaar). De app splitst je vermogen automatisch over deze
                categorieën en berekent het tarief van 36%.
                <br /><br />
                <strong>Partner-optimalisatie:</strong> Bij een fiscaal partner kun je
                vermogen verdelen voor een lager totaal — het heffingsvrij vermogen
                verdubbelt naar ~€114.000. De app toont de optimale verdeling van jullie
                gezamenlijke grondslag, wat honderden euro&apos;s per jaar kan schelen.
                <br /><br />
                <strong>Box 3 drag-widget:</strong> De <em>box3_drag</em>-widget toont
                hoeveel van je vermogensgroei naar belasting gaat — uitgedrukt als
                percentage van je vermogen én als verloren vrijheidsdagen. Zo zie je
                direct de impact van belasting op je pad naar financiële vrijheid.
                <br /><br />
                <strong>Box 2:</strong> Bij deelnemingen (BV, holding) berekent de app
                Box 2 belasting op dividend en vervreemding, inclusief de
                DGA-leningdrempel (wet excessief lenen). Relevant als je eigen vermogen
                deels in een BV-structuur zit.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Kern → Belasting — je Box 3 wordt automatisch berekend op basis van je geregistreerde bezittingen en schulden",
                "Controleer de classificatie: spaargeld (laag forfait ~1,03%), beleggingen (hoog forfait ~6,04%) en schulden (aftrekbaar) worden automatisch ingedeeld",
                "Bekijk je heffingsvrij vermogen — €57.000 per persoon, €114.000 met fiscaal partner — en hoeveel je daarboven betaalt over fictief rendement",
                "Activeer partneroptimalisatie om de fiscaal voordeligste verdeling van jullie grondslag te berekenen",
                "Check de box3_drag-widget op je dashboard — deze toont je belastingdruk als percentage van je vermogen en als verloren vrijheidsdagen",
                "Bij een BV of holding: bekijk de Box 2 berekening met DGA-leningdrempel en dividendbelasting",
              ],
              tip: "Verschuif vermogen tussen sparen en beleggen in het scenariomodel om te zien welk fictief rendement je het minste kost. Elke €10.000 verschuiving kan tientallen euro's per jaar schelen.",
            }}
          />

          <GuideTopicCard
            icon={Scale}
            title="Rebalancing & Allocatie"
            color="var(--color-kern-400)"
            description={
              <>
                <strong>Rebalancing houdt je portfolio in lijn met je plan.</strong> Na verloop van tijd verschuift je allocatie doordat sommige beleggingen harder groeien dan andere. Een portfolio dat begon als 80% aandelen / 20% obligaties kan na een goed beursjaar 90/10 worden — meer risico dan je bedoeld had.
                <br /><br />
                <strong>Wat is drift?</strong> Drift is het verschil tussen je huidige allocatie en je doelallocatie, uitgedrukt in procentpunten. Als je doel 80% aandelen is en je zit op 87%, dan is je drift +7 procentpunt. Hoe groter de drift, hoe verder je portfolio afwijkt van je plan.
                <br /><br />
                <strong>Kleurcodes:</strong> TriFinity gebruikt drie kleuren om drift zichtbaar te maken:
                <br />
                🟢 <strong>Groen</strong> — in balans (drift &lt; 5pp). Geen actie nodig.
                <br />
                🟠 <strong>Oranje</strong> — let op (drift 5–10pp). Overweeg herbalancering bij je volgende check-in.
                <br />
                🔴 <strong>Rood</strong> — actie nodig (drift &gt; 10pp). Je risicoprofiel wijkt significant af.
                <br /><br />
                <strong>Waarom rebalancen?</strong> Onderzoek van Vanguard (2019) toont aan dat regelmatig herbalanceren het risico van je portfolio verlaagt zonder significant rendement op te offeren. Je verkoopt wat duur is geworden en koopt bij wat achterbleef — een gedisciplineerde &lsquo;sell high, buy low&rsquo;-strategie.
                <br /><br />
                <strong>Box 3 peildatum tip:</strong> In Nederland wordt je vermogen belast op basis van de <strong>peildatum 1 januari</strong>. Als je toch gaat herbalanceren, doe het dan vóór 1 januari. Door overwogen posities vóór de peildatum te verkopen en tijdelijk op een spaarrekening te zetten (lager fictief rendement), kun je Box 3 belasting optimaliseren. Na de peildatum koop je weer terug in je gewenste allocatie.
                <br /><br />
                <strong>Doelallocatie instellen:</strong> Stel je targets in via <strong>De Kern → Portfolio → Allocatie</strong>. Kies per assetklasse (aandelen, obligaties, vastgoed, cash, overig) welk percentage je nastreeft. De rebalancing-widget op je dashboard toont vervolgens realtime je drift en geeft concrete suggesties welke posities je moet bij- of verkopen.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Kern → Portfolio → Allocatie en stel je doelallocatie in per assetklasse (aandelen, obligaties, vastgoed, cash, overig)",
                "Bekijk de rebalancing-widget op je dashboard — deze toont je huidige drift per assetklasse met kleurcodes (groen/oranje/rood)",
                "Bij oranje of rode drift: bekijk de concrete trade-suggesties — welke posities verkopen en welke bijkopen om terug in balans te komen",
                "Plan herbalancering rond de Box 3 peildatum (1 januari) — verkoop overwogen posities vóór de peildatum voor belastingvoordeel",
                "Na herbalancering: verifieer via de widget dat alle assetklassen weer groen zijn (drift < 5 procentpunt)",
              ],
              tip: "Herbalanceer maximaal 1–2 keer per jaar, idealiter rond de Box 3 peildatum. Te vaak handelen kost transactiekosten en levert nauwelijks extra risicobeheersing op. Vanguard-onderzoek bevestigt dat jaarlijks of halfjaarlijks voldoende is.",
            }}
          />

          <GuideTopicCard
            icon={BarChart3}
            title="Beleggingskosten & TER"
            color="var(--color-kern-400)"
            description={
              <>
                <strong>Kosten zijn de stille vijand van vermogensopbouw.</strong> Elke euro die je aan fondskosten betaalt, is een euro die niet voor je werkt. En door het compound effect groeien die kosten mee — over 20, 30 of 40 jaar maakt een klein verschil in kosten een enorm verschil in eindvermogen.
                <br /><br />
                <strong>Wat is TER?</strong> De Total Expense Ratio is het jaarlijkse kostenpercentage dat een fonds in rekening brengt. Een TER van 0,22% betekent dat je per €100.000 belegd vermogen €220 per jaar aan fondskosten betaalt. Een actief beheerd fonds met 1,50% TER kost je €1.500 — bijna 7× zoveel.
                <br /><br />
                <strong>Het compound effect van kosten:</strong> Stel je hebt €100.000 en behaalt 7% bruto rendement over 20 jaar.
                <br />
                • Met <strong>0,22% TER</strong> (indexfonds): je eindvermogen is ca. <strong>€356.000</strong>
                <br />
                • Met <strong>1,50% TER</strong> (actief fonds): je eindvermogen is ca. <strong>€291.000</strong>
                <br />
                Dat verschil van 1,28% per jaar kost je <strong>~€65.000</strong> over 20 jaar. Bij een FIRE-portfolio kan dat het verschil zijn tussen 2–3 jaar eerder of later financiële vrijheid bereiken.
                <br /><br />
                <strong>TER vs tracking difference vs transactiekosten:</strong>
                <br />
                • <strong>TER</strong> — de lopende kosten van het fonds (beheer, administratie, bewaarkosten). Dit is de meest geciteerde kostenmaat.
                <br />
                • <strong>Tracking difference</strong> — het verschil tussen het fondsrendement en de index die het volgt. Kan afwijken van TER doordat fondsen inkomsten uit securities lending of belastingefficiëntie terugverdienen. Een fonds met 0,20% TER kan een tracking difference van 0,05% hebben.
                <br />
                • <strong>Transactiekosten</strong> — de aan- en verkoopkosten die je broker rekent. Deze zitten niet in de TER.
                <br /><br />
                <strong>Hoe vind je de TER van een fonds?</strong>
                <br />
                • <strong>Factsheet</strong> — elk fonds publiceert een Key Information Document (KID) met de TER
                <br />
                • <strong>Morningstar.nl</strong> — zoek je fonds op en kijk bij &lsquo;Kosten&rsquo;
                <br />
                • <strong>Fondsaanbieder</strong> — Vanguard, iShares, Northern Trust publiceren TER op hun website
                <br /><br />
                <strong>TriFinity &amp; kosten:</strong> Voer de TER per holding in via de <strong>Portfolio Holdings-kaart</strong> op De Kern (verschijnt zodra je &apos;Holdings bijhouden&apos; activeert op een bezitting). De <strong>fee analyzer-widget</strong> op je dashboard berekent vervolgens je gewogen totale kosten, de impact op je FIRE-datum en hoeveel vrijheidsdagen de kosten je over tijd kosten.
                <br /><br />
                <em>Disclaimer: TER is niet de enige kostenmaat. Tracking difference kan positief of negatief afwijken van de TER. Bekijk altijd het totaalplaatje inclusief transactiekosten van je broker.</em>
              </>
            }
            howTo={{
              steps: [
                "Open de Portfolio Holdings-kaart op De Kern en voer de TER in bij elk fonds (te vinden in het KID/factsheet of op Morningstar.nl)",
                "Bekijk de fee analyzer-widget op je dashboard — deze toont je gewogen portfoliokosten en de impact op je FIRE-datum",
                "Vergelijk fondsen: een indexfonds (TER ~0,20%) vs een actief fonds (TER ~1,50%) kan tienduizenden euro's verschil maken over 20 jaar",
                "Check ook de tracking difference naast de TER — sommige fondsen presteren beter dan hun TER suggereert door securities lending of belastingefficiëntie",
                "Minimaliseer transactiekosten door minder frequent te handelen en grotere orders te plaatsen",
              ],
              tip: "Focus op gewogen portfoliokosten, niet op individuele TER-percentages. Een fonds met 0,40% TER dat maar 5% van je portfolio uitmaakt kost je effectief maar 0,02% — terwijl je kernpositie met 0,22% TER die 80% van je portfolio uitmaakt je 0,18% kost. De fee analyzer doet deze berekening automatisch.",
            }}
          />

          <GuideTopicCard
            icon={Home}
            title="Hypotheek vs Beleggen"
            color="var(--color-kern-400)"
            description={
              <>
                <strong>Extra aflossen of beleggen? Dé financiële afweging voor huiseigenaren.</strong> Als je maandelijks geld overhoudt, kun je kiezen: extra aflossen op je hypotheek of dat geld beleggen. Beide opties bouwen vermogen op, maar op een fundamenteel andere manier — en de beste keuze hangt af van je persoonlijke situatie.
                <br /><br />
                <strong>Hypotheekrenteaftrek (HRA):</strong> In Nederland mag je de rente op je hypotheek aftrekken van je belastbaar inkomen. Hoe hoger je marginaal tarief (36,97% of 49,50%), hoe meer belastingvoordeel je krijgt. Door de HRA is je <em>effectieve</em> hypotheekrente lager dan de nominale rente. Voorbeeld: bij 4,0% rente en 49,50% marginaal tarief is je effectieve rente slechts ~2,02%.
                <br /><br />
                <strong>Box 3 effect:</strong> Beleggen in Box 3 wordt belast op basis van een fictief rendement (~6,04% voor beleggingen in 2025). Over het deel boven je heffingsvrij vermogen betaal je ~36% belasting. Dit verlaagt je netto beleggingsrendement. Extra aflossen vermindert daarentegen je schuld, wat je Box 3 grondslag kan verlagen — een dubbel voordeel.
                <br /><br />
                <strong>Breakeven rendement:</strong> Dit is het beleggingsrendement waarbij aflossen en beleggen precies gelijk uitkomen. Als je verwacht rendement boven de breakeven ligt, is beleggen voordeliger. Ligt het eronder, dan wint aflossen. De breakeven hangt af van je hypotheekrente, marginaal tarief, en Box 3 belastingdruk. TriFinity berekent dit automatisch in de vergelijkingsmodal op de schuldenpagina.
                <br /><br />
                <strong>Risicoverschil:</strong> Extra aflossen is risicovrij — je bespaart gegarandeerd rente. Beleggen biedt een <em>verwacht</em> hoger rendement, maar met onzekerheid. In slechte beursjaren kun je geld verliezen terwijl je hypotheekkosten doorlopen. Aflossen is daarom de &lsquo;zekere&rsquo; keuze, beleggen de &lsquo;rationele&rsquo; keuze bij een lange horizon.
                <br /><br />
                <strong>Bekijk de vergelijking:</strong> Ga naar <strong>De Kern → Schulden</strong> en klik op &lsquo;Aflossen vs Beleggen&rsquo; bij je hypotheek om een gepersonaliseerde berekening te zien met jouw rente, tarief en verwacht rendement.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Kern → Schulden en zoek je hypotheek in de lijst",
                "Klik op 'Aflossen vs Beleggen' om de vergelijkingsmodal te openen",
                "Bekijk het breakeven rendement — dit is het minimale beleggingsrendement waarbij beleggen voordeliger is dan aflossen",
                "Vergelijk de 10-jaars en 20-jaars scenario's — bij een langere horizon wordt beleggen statistisch voordeliger door het compound effect",
                "Controleer je marginaal belastingtarief in je profiel (Instellingen → FIRE-parameters) — dit beïnvloedt de hypotheekrenteaftrek en daarmee de breakeven",
                "Houd rekening met je risicotolerantie: aflossen is gegarandeerd, beleggen biedt een hoger verwacht maar onzeker rendement",
              ],
              tip: "De meeste financieel planners adviseren een combinatie: los extra af tot je hypotheek onder de 50% loan-to-value zit (lagere rente bij oversluiten), en beleg daarna het surplus. Zo profiteer je van beide werelden — lagere woonlasten én vermogensgroei.",
            }}
          />

          <GuideTopicCard
            icon={RefreshCw}
            title="Check-in"
            color="var(--color-kern-400)"
            description={
              <>
                Tien minuten per maand. Dat is alles wat het kost om grip te
                houden op je financiële koers. De check-in is je maandelijkse
                kompasmoment — een begeleide flow van{' '}
                <strong>7 stappen</strong> die je door alles heen leidt wat
                aandacht nodig heeft.
                <br />
                <br />
                <strong>Stap 1 — Terugblik:</strong> Zie in één oogopslag hoe
                vorige maand was. Netto vermogen, inkomen vs. uitgaven,
                spaarquote, voltooide acties, en gewonnen vrijheidsdagen — alles
                naast elkaar zodat je direct ziet waar je staat.
                <br />
                <strong>Stappen 2–5 — Bijwerken:</strong> Update je bezittingen
                (huidige waarde), schulden (openstaand saldo), doelen
                (voortgang), en budgetten (eventuele aanpassingen). Elke stap
                toont wat er veranderd is zodat je weet wat aandacht verdient.
                <br />
                <strong>Stap 6 — Vooruitblik:</strong> Je FIRE-leeftijd wordt
                herberekend met de nieuwste data. Aandachtspunten tonen waar
                actie nodig is — een budget overschreden, een doel dat
                achterloopt, een trendlijn die afvlakt.
                <br />
                <strong>Stap 7 — Reflectie:</strong> Schrijf op hoe de maand
                voelde. AI-gespreksstarterskaarten helpen je op gang — gebaseerd
                op je financiële veranderingen. Ideaal als startpunt voor een
                gesprek met je partner.
                <br />
                <br />
                Al je eerdere check-ins zijn opvraagbaar via{' '}
                <strong>Check-in → Historie</strong>. Vergelijk maanden en zie
                patronen over tijd — van spaarquote-trends tot hoe je reflecties
                evolueren.
              </>
            }
            howTo={{
              steps: [
                'Starten: Ga naar De Kern → Check-in (of volg de herinnering in je meldingen). Je doorloopt 7 stappen in een begeleide flow.',
                'Stap 1 Terugblik: Bekijk netto vermogen, inkomen, uitgaven, spaarquote, voltooide acties en gewonnen vrijheidsdagen van vorige maand.',
                'Stappen 2–5 Bijwerken: Werk bezittingen (waarde), schulden (saldo), doelen (voortgang) en budgetten (aanpassingen) bij. Elke stap toont wat veranderd is.',
                'Stap 6 Vooruitblik: Bekijk je herberekende FIRE-leeftijd en aandachtspunten waar actie nodig is (budget overschreden, doel achterloopt).',
                'Stap 7 Reflectie: Schrijf op hoe de maand voelde. AI-gespreksstarterskaarten helpen je op gang — gebaseerd op je financiële veranderingen.',
                'Historie: Blader terug door eerdere check-ins via Check-in → Historie. Vergelijk maanden en zie patronen over tijd.',
              ],
              tip: 'Plan je check-in op een vaste dag (bijv. de eerste zondag van de maand). Routine maakt het moeiteloos — en na drie maanden wil je niet meer zonder.',
            }}
          />

          <GuideTopicCard
            icon={Compass}
            title="Wat komt er nog?"
            color="var(--color-kern-400)"
            description={
              <>
                We bouwen continu aan De Kern. Dit staat op de planning:
                <br />
                <br />• <strong>Automatische banksynchronisatie</strong> — saldi
                en transacties komen vanzelf binnen, zonder handmatige import.
                <br />• <strong>Slimmere terugkerende transacties</strong> —
                automatische herkenning en koppeling aan de juiste budgetten.
                <br />• <strong>Zelflerende categorisatie</strong> — hoe meer je
                importeert, hoe slimmer de toewijzing wordt.
                <br />
                <br />
                Heb je een idee? Laat het ons weten — De Kern groeit mee met
                jouw behoeften.
              </>
            }
          />
        </ReisStapSection>
        ) : (
        <ReisStapSection
          id="guide-reis-2"
          step={2}
          icon={TrendingUp}
          title="Houd je vermogen bij"
          color="var(--color-kern-400)"
          subtitle="Werk je bezittingen en schulden regelmatig bij om je vermogensverloop te volgen"
          statusLines={
            progress
              ? (progress.counts.assets > 0 || progress.counts.debts > 0)
                ? [
                    `Je hebt ${progress.counts.assets} bezitting${progress.counts.assets !== 1 ? "en" : ""} en ${progress.counts.debts} schuld${progress.counts.debts !== 1 ? "en" : ""} geregistreerd.`,
                  ]
                : ["Registreer je eerste bezitting of schuld."]
              : ["Laden..."]
          }
          valueSentence="Regelmatige updates maken je vermogensverloop inzichtelijk."
          ctaLabel="Werk je vermogen bij"
          ctaHref="/core/assets"
          isComplete={!!progress?.steps.hasAssets}
        >
          <GuideTopicCard
            icon={TrendingUp}
            title="Vermogensupdates"
            color="var(--color-kern-400)"
            description={
              <>
                <strong>Je vermogen bijhouden is de basis.</strong> Door regelmatig de waarde van je bezittingen en het saldo van je schulden bij te werken, bouw je een tijdlijn op van je financiele voortgang.
                <br /><br />
                <strong>Maandelijkse check-in:</strong> Neem elke maand een paar minuten om je bezittingen bij te werken. Vastgoed, beleggingen en pensioen veranderen in waarde — door dit bij te houden zie je trends en kun je bijsturen.
                <br /><br />
                <strong>Net worth snapshots:</strong> Elke keer dat je je vermogen bijwerkt, maakt TriFinity een snapshot. Over tijd vormen deze snapshots een grafiek van je vermogensverloop — je ziet direct of je op koers ligt.
                <br /><br />
                <strong>Spaarquote via vermogensdelta:</strong> Zonder budgetteren berekent TriFinity je spaarquote op basis van je vermogensverandering. Hoe vaker je bijwerkt, hoe nauwkeuriger deze schatting.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Kern en bekijk je bezittingen en schulden",
                "Klik op een bezitting om de huidige waarde bij te werken",
                "Klik op een schuld om het openstaande saldo bij te werken",
                "Bekijk je vermogensverloop via het netto vermogen kassabon — tik op het bedrag in de hero",
                "Maak regelmatig snapshots via de check-in of handmatig via het vermogensverloop-overzicht",
              ],
              tip: "Plan een vast moment per maand (bijv. de eerste zondag) om je vermogen bij te werken. Consistentie geeft de beste inzichten.",
            }}
          />

          <GuideTopicCard
            icon={FileText}
            title="Belasting"
            color="var(--color-kern-400)"
            description={
              <>
                <strong>Box 3 belasting wordt automatisch berekend</strong> op basis van je geregistreerde bezittingen en schulden. Je ziet direct hoeveel je betaalt en hoeveel vrijheidsdagen dat kost.
              </>
            }
            howTo={{
              steps: [
                "Registreer je bezittingen — de app classificeert automatisch naar Box 3 categorien",
                "Bekijk je Box 3 berekening via De Kern → Belasting",
                "Check de box3_drag-widget op je dashboard voor de impact op je vrijheid",
              ],
              tip: "Houd je vermogen actueel rond de peildatum (1 januari) voor een nauwkeurige Box 3 berekening.",
            }}
          />
        </ReisStapSection>
        )}

        <SectionDivider variant="asterisk" className="my-6" />

        {/* ── Stap 3: Onderneem actie ── */}
        <ReisStapSection
          id="guide-reis-3"
          step={3}
          icon={Zap}
          title="Onderneem actie"
          color="var(--color-wil-400)"
          subtitle="Van inzicht naar actie — elke stap brengt je dichter bij financiële vrijheid"
          statusLines={
            progress
              ? progress.steps.hasCompletedActions
                ? [
                    `Je hebt ${progress.counts.wonFreedomDays} vrijheidsdag${progress.counts.wonFreedomDays !== 1 ? "en" : ""} gewonnen door ${progress.counts.completedActions} actie${progress.counts.completedActions !== 1 ? "s" : ""}.`,
                  ]
                : progress.counts.pendingRecommendations > 0
                  ? [
                      `Er staan ${progress.counts.pendingRecommendations} aanbeveling${progress.counts.pendingRecommendations !== 1 ? "en" : ""} voor je klaar.`,
                    ]
                  : [
                      "Voeg eerst je financiële gegevens toe om aanbevelingen te ontvangen.",
                    ]
              : ["Laden..."]
          }
          valueSentence="Elke afgeronde actie is een gewonnen vrijheidsdag."
          ctaLabel="Bekijk aanbevelingen"
          ctaHref="/will"
          isComplete={!!progress?.steps.hasCompletedActions}
        >
          <GuideTopicCard
            icon={Sparkles}
            title="Voorstellen"
            color="var(--color-wil-400)"
            description={
              <>
                Voorstellen zijn concrete stappen die je vrijheidstijd
                vergroten. Geen vaag advies, maar acties met een berekende
                impact: &ldquo;Dit bespaart je 3 maanden.&rdquo; Will
                analyseert je <strong>uitgavenpatronen</strong>,{" "}
                <strong>doelen</strong> en financi&euml;le situatie en genereert
                persoonlijke aanbevelingen in vijf categorie&euml;n:
                belegging-optimalisatie, schuld-aflossing, doel-activering,
                budget-setup en gezondheid-verbetering. Elk voorstel toont{" "}
                <strong>wat je kunt doen</strong>, <strong>waarom het helpt</strong>,
                en <strong>hoeveel vrijheidstijd het oplevert</strong> &mdash;
                gebaseerd op je werkelijke cijfers, niet op aannames.
                {" "}
                Voorstellen komen van de <strong>AI</strong> (automatisch), van{" "}
                <strong>Will</strong> (via chat), of je maakt ze{" "}
                <strong>zelf</strong> aan. Bij accepteren wordt het voorstel
                omgezet in een actie op je kanban-bord. Je kunt het ook
                uitstellen of afwijzen &mdash; je feedback maakt toekomstige
                voorstellen beter.
              </>
            }
            howTo={{
              steps: [
                "Analyseren \u2014 Tik op \u2018Analyseren\u2019 en Will opent een popup met voortgang terwijl je profiel wordt geanalyseerd. De voorstellen verschijnen een voor een.",
                "Beoordelen \u2014 Zodra de analyse klaar is, kun je elk voorstel direct accepteren, uitstellen of afwijzen. Je ziet precies hoeveel vrijheidstijd elk voorstel oplevert.",
                "Filteren \u2014 Open \u2018Alle voorstellen\u2019 voor een filterbaar overzicht. Bovenaan zie je de totale impact in vrijheidsdagen. Filter op status (openstaand, geaccepteerd, uitgesteld, afgewezen) of type (budget, vermogen, schuld, inkomen, sparen).",
                "Impact \u2014 De AI berekent per voorstel hoeveel maanden eerder je financieel vrij bent als je het uitvoert. Gebaseerd op je werkelijke cijfers, niet op aannames.",
                "Bronnen \u2014 Voorstellen komen van de AI (automatisch), van Will (via chat), of je maakt ze zelf aan.",
              ],
              tip: "Gebruik het filterbare overzicht om de voorstellen met de hoogste vrijheidstijd-impact te vinden \u2014 die leveren het snelst resultaat op.",
            }}
          />

          <GuideTopicCard
            icon={Zap}
            title="Acties"
            color="var(--color-wil-400)"
            description={
              <>
                <strong>
                  Inzicht zonder actie verandert niets. Het actie-overzicht is
                  waar je goede voornemens concrete stappen worden.
                </strong>
                <br />
                <br />
                <strong>Overzicht</strong> \u2014 Ga naar De Wil \u2192 Acties en
                open het filterbare actie-overzicht. Bovenaan zie je de{" "}
                <strong>totale impact in vrijheidsdagen</strong> van je selectie
                \u2014 het kerncijfer dat toont hoeveel vrijheid je acties
                vertegenwoordigen. Elke actie heeft vier mogelijke statussen:{" "}
                <strong>open</strong> (te doen),{" "}
                <strong>uitgesteld</strong> (voor later),{" "}
                <strong>afgerond</strong> (voltooid) en{" "}
                <strong>afgewezen</strong>. Per actie zie je de bron (
                <em>AI</em>, <em>handmatig</em> of <em>chat</em>) en de geschatte{" "}
                <strong>vrijheidsdagen</strong> die je wint bij voltooiing.
                <br />
                <br />
                <strong>Filteren</strong> \u2014 Gebruik de drie filters bovenaan
                het overzicht om snel te vinden wat je zoekt:{" "}
                <strong>status</strong> (open, uitgesteld, afgerond, afgewezen),{" "}
                <strong>onderwerp</strong> (budget, vermogen, schuld, inkomen,
                sparen of handmatig) en{" "}
                <strong>weekplanning</strong> (deze week, volgende week, later of
                niet gepland). De impact-samenvatting past zich aan op je selectie.
                <br />
                <br />
                <strong>Aanmaken</strong> \u2014 Maak zelf een actie aan, accepteer
                een AI-voorstel vanuit Voorstellen, of laat acties automatisch
                verschijnen uit je Will-gesprekken. Elke bron krijgt een label
                zodat je altijd weet waar een actie vandaan komt.
                <br />
                <br />
                <strong>Voltooien</strong> \u2014 Markeer een actie als voltooid en
                de gewonnen vrijheidsdagen worden opgeteld bij je maandtotaal.
                Voltooide acties verschijnen in de gefilterde lijst onder
                &ldquo;Afgerond&rdquo;. Je FIRE-datum verschuift mee met elke
                voltooide actie.
                <br />
                <br />
                <strong>Uitstellen of afwijzen</strong> \u2014 Niet nu? Stel een
                actie uit \u2014 hij blijft zichtbaar maar staat niet in de weg.
                Niet relevant? Wijs af en de actie verdwijnt uit je actieve lijst.
                Sorteer op impact, prioriteit of weekplanning om de belangrijkste
                acties bovenaan te krijgen.
              </>
            }
            howTo={{
              steps: [
                "Bekijken \u2014 Ga naar De Wil \u2192 Acties. Bovenaan zie je de totale impact in vrijheidsdagen en drie filterrijen voor status, onderwerp en weekplanning.",
                "Filteren \u2014 Selecteer een status, onderwerp of week om je lijst te verfijnen. De impact-samenvatting toont hoeveel vrijheidsdagen je selectie vertegenwoordigt.",
                "Aanmaken \u2014 Tik op \u201c+ Nieuwe actie\u201d om er zelf een aan te maken, of accepteer een AI-voorstel. Acties uit Will-gesprekken verschijnen automatisch.",
                "Voltooien \u2014 Markeer een actie als voltooid. De gewonnen vrijheidsdagen worden opgeteld bij je maandtotaal.",
                "Uitstellen \u2014 Tik op \u201cUitstellen\u201d als je een actie wilt bewaren voor later. Hij blijft zichtbaar maar staat niet in de weg.",
                "Afwijzen \u2014 Niet relevant? Wijs een actie af. Afgewezen acties verdwijnen uit je actieve lijst.",
                "Widgets \u2014 Bekijk je voortgang via de widgets: acties (overzicht), beslissingspatronen (patronen in je keuzes) en vrijheidsdagen_maand (maandtotaal gewonnen dagen).",
              ],
              tip: "Plan elke week \u00e9\u00e9n actie in via de weekplanning-filter. Consistent kleine stappen leveren meer vrijheidstijd op dan af en toe een sprint.",
            }}
          />

          <GuideTopicCard
            icon={Target}
            title="Doelen"
            color="var(--color-wil-400)"
            description={
              <>
                <strong>
                  Een doel zonder plan is een wens. Koppel je doel aan een bedrag,
                  een deadline, en een rekening \u2014 en zie je voortgang groeien.
                </strong>
                <br />
                <br />
                <strong>Doel aanmaken</strong> \u2014 Ga naar De Wil \u2192 Doelen
                \u2192 Nieuw. Kies uit <strong>8 doeltypes</strong>:{" "}
                <em>savings_goal</em> (spaardoel), <em>debt_payoff</em>{" "}
                (schuldaflossing), <em>wealth_milestone</em>{" "}
                (vermogensmijlpaal), <em>income_goal</em> (inkomensdoel),{" "}
                <em>spending_reduction</em> (uitgavenreductie),{" "}
                <em>investment_return</em> (beleggingsrendement),{" "}
                <em>net_worth_target</em> (nettovermogensdoel) en{" "}
                <em>custom</em> (vrij). Stel een doelbedrag en deadline in, en
                geef je doel optioneel een eigen kleur en icoon.
                <br />
                <br />
                <strong>Koppeling</strong> \u2014 Koppel je doel aan een
                spaarrekening, belegging of schuld. De voortgang wordt dan
                automatisch bijgewerkt op basis van het werkelijke saldo \u2014 je
                hoeft niets handmatig bij te houden.
                <br />
                <br />
                <strong>Voortgang</strong> \u2014 Een visuele progressbar toont
                hoeveel procent je hebt bereikt. De formule: (huidig bedrag
                \u2212 startbedrag) / (doelbedrag \u2212 startbedrag) \u00d7 100%.
                De verwachte einddatum wordt berekend op basis van je huidige
                tempo, zodat je ziet of je <strong>op schema</strong> ligt.
                <br />
                <br />
                <strong>Check-in</strong> \u2014 Bij je maandelijkse check-in (stap
                4) update je de voortgang van al je doelen in \u00e9\u00e9n keer.
                Zo houd je alles actueel zonder apart elke rekening te checken.
              </>
            }
            howTo={{
              steps: [
                "Aanmaken \u2014 Ga naar De Wil \u2192 Doelen \u2192 Nieuw. Kies het type (spaardoel, schuld aflossen, vermogensmijlpaal, etc.) en stel een doelbedrag en deadline in.",
                "Koppelen \u2014 Koppel je doel aan een spaarrekening of asset. De voortgang wordt automatisch bijgewerkt op basis van het werkelijke saldo.",
                "Personaliseren \u2014 Geef je doel een eigen kleur en icoon zodat je het direct herkent op je dashboard.",
                "Voortgang bekijken \u2014 De progressbar toont je percentage. De verwachte einddatum berekent of je op schema ligt bij het huidige tempo.",
                "Check-in \u2014 Bij je maandelijkse check-in (stap 4) update je alle doelen in \u00e9\u00e9n keer.",
                "Widget \u2014 Voeg de doelen-widget toe aan je dashboard om je voortgang altijd in beeld te hebben.",
              ],
              tip: "E\u00e9n helder doel werkt beter dan vijf vage. Begin met je noodfonds of je grootste schuld.",
            }}
          />

          <GuideTopicCard
            icon={RefreshCw}
            title="Vaste Kosten Analyse"
            color="var(--color-wil-400)"
            description={
              <>
                Vaste kosten zijn stille geldlekken. &euro;15 per maand klinkt
                onschuldig, maar het kost je 2 dagen vrijheid per jaar. Elke.
                Jaar. Weer.
                <br />
                <br />
                De Vaste Kosten Analyse splitst je terugkerende uitgaven in
                twee overzichtelijke kolommen:{" "}
                <strong>Abonnementen</strong> (streaming, sport, software) die
                je direct kunt opzeggen, en{" "}
                <strong>Vaste Kosten</strong> (huur, hypotheek, energie,
                verzekeringen, vervoer) die je bewust wilt volgen.
                <br />
                <br />
                TriFinity scant automatisch je transactiegeschiedenis op{" "}
                <strong>terugkerende patronen</strong>. Elke post wordt
                gedetecteerd met een frequentie (
                <strong>
                  wekelijks, maandelijks, per kwartaal, jaarlijks
                </strong>
                ) en een betrouwbaarheidsniveau (hoog, middel, laag). Je kunt
                ze ook <strong>handmatig toevoegen</strong> als de automatische
                detectie iets mist. Met de knop{" "}
                <strong>Nu scannen</strong> ververs je de analyse op elk moment.
                <br />
                <br />
                Per post zie je de <strong>maandelijkse kosten</strong> en per
                kolom een subtotaal. Abonnementen kun je direct opzeggen via
                een opzegbrief &mdash; klik op een abonnement om te starten.
                <br />
                <br />
                Gerelateerde widgets: <strong>vaste_lasten</strong>{" "}
                (maandelijks totaal) en <strong>noodfonds</strong>{" "}
                (buffer-berekening op basis van je vaste lasten).
              </>
            }
            howTo={{
              steps: [
                "Overzicht \u2014 Ga naar De Wil \u2192 scroll naar \u2018Vaste Kosten Analyse\u2019. Je ziet twee kolommen: abonnementen links, vaste kosten rechts.",
                "Detectie \u2014 De app herkent automatisch terugkerende transacties in je bankdata. Importeer minimaal 3 maanden \u2014 hoe meer, hoe beter de detectie. Druk op \u2018Nu scannen\u2019 om de analyse te verversen.",
                "Impact \u2014 Per kolom zie je het subtotaal en onderaan het grand total van al je vaste lasten per maand.",
                "Opzeggen \u2014 Klik op een abonnement om een opzegbrief te genereren. Vaste kosten zoals huur en energie zijn informatief \u2014 die volg je bewust.",
              ],
              tip: "Check je vaste kosten elk kwartaal. Vergeten streamingdiensten en ongebruikte sportschoolpassen zijn de meest voorkomende tijdlekken. \u20ac15/maand = 2 vrijheidsdagen/jaar.",
            }}
          />

          <GuideTopicCard
            icon={LayoutDashboard}
            title="Widgets overzicht"
            color="var(--color-wil-400)"
            description={
              <>
                De Wil is jouw cockpit. Kies welke informatie je ziet, in welk
                formaat, en in welke volgorde. Geen widget is verplicht &mdash;
                jij bepaalt wat belangrijk is. De app bevat{" "}
                <strong>46+ widgets</strong> verdeeld over vier modules:{" "}
                <strong>kern</strong> (nettovermogen, cashflow, budgetten),{" "}
                <strong>wil</strong> (acties, doelen, voorstellen),{" "}
                <strong>horizon</strong> (FIRE, Monte Carlo, scenario&rsquo;s) en{" "}
                <strong>cross</strong> (meldingen, pad, volgende stap). Elke
                widget heeft tot vier formaten: <strong>mini</strong>{" "}
                (1&times;1) toont &eacute;&eacute;n kerngetal,{" "}
                <strong>quarter</strong> (1&times;2) voegt een
                mini-visualisatie toe, <strong>half</strong> (2&times;2) geeft
                ruimte voor trends en vergelijkingen, en <strong>full</strong>{" "}
                (4&times;2) toont het complete plaatje met details.
                {" "}
                Markeer een budget of holding als <strong>favoriet</strong> en
                het verschijnt automatisch als widget op je dashboard.
                Unfavoriten = widget verdwijnt. Standaard staan{" "}
                <strong>7 widgets</strong> aan; geavanceerde widgets
                ontgrendelen automatisch naarmate je meer data invoert en je
                actieve modules uitbreidt.
              </>
            }
            howTo={{
              steps: [
                "Formaten \u2014 Elk widget heeft tot 4 formaten. Mini toont \u00e9\u00e9n kerngetal. Quarter voegt een mini-grafiek toe. Half geeft ruimte voor trends en vergelijkingen. Full toont het complete plaatje met details.",
                "Herschikken \u2014 Houd een widget ingedrukt en sleep het naar een nieuwe positie. De indeling wordt automatisch opgeslagen.",
                "Aan/uitzetten \u2014 Ga naar Identiteit \u2192 Instellingen \u2192 Widgets. Schakel widgets aan of uit en kies per widget het gewenste formaat.",
                "Favorieten als widget \u2014 Markeer een budget of holding als favoriet, en het verschijnt automatisch als widget op je dashboard. Unfavoriten = widget verdwijnt.",
                "Unlock \u2014 Sommige widgets worden pas beschikbaar naarmate je meer data invoert. Begin met de basis en ontgrendel geavanceerde widgets automatisch.",
              ],
              tip: "Begin met de standaard 7 widgets. Voeg pas meer toe als je weet welke inzichten je dagelijks wilt zien \u2014 minder is meer.",
            }}
          />

          <GuideTopicCard
            icon={Newspaper}
            title="Briefing (DAIshboard)"
            color="var(--color-wil-400)"
            description={
              <>
                Elke dag een persoonlijke financi&euml;le update. Geen generiek
                nieuws, maar inzichten gebaseerd op <strong>j&oacute;uw</strong>{" "}
                cijfers, <strong>j&oacute;uw</strong> doelen,{" "}
                <strong>j&oacute;uw</strong> situatie. Schakel je dashboard over
                naar <strong>DAIshboard-modus</strong> en Will componeert een
                AI-samengestelde briefing op basis van je actuele data. De
                briefing bevat inzichten over je{" "}
                <strong>budget</strong> (overschrijdingen, trends),{" "}
                <strong>vermogen</strong> (veranderingen, rendement), en{" "}
                <strong>acties</strong> (wat kun je vandaag doen).
                Context-afhankelijk: rond salarisdag andere inzichten dan eind
                van de maand. Kaarten verschijnen &eacute;&eacute;n voor
                &eacute;&eacute;n terwijl de AI je data analyseert &mdash;{" "}
                <strong>progressief geladen</strong> zodat je niet hoeft te
                wachten. Na 24 uur verschijnt een stale-banner zodat je weet dat
                de data niet meer actueel is.
              </>
            }
            howTo={{
              steps: [
                "Openen \u2014 Ga naar Berichten of tik op de briefing-kaart op De Wil. Je ziet kaarten die \u00e9\u00e9n voor \u00e9\u00e9n verschijnen terwijl de AI je data analyseert.",
                "Inhoud \u2014 De briefing bevat inzichten over je budget (overschrijdingen, trends), vermogen (veranderingen, rendement), en acties (wat kun je vandaag doen). Context-afhankelijk: rond salarisdag andere inzichten dan eind van de maand.",
                "Verversen \u2014 Tik op verversen voor een nieuwe briefing. De AI kijkt opnieuw naar je actuele data en genereert verse inzichten.",
                "Scroll door je persoonlijke briefing en tik op kaarten voor meer detail",
                "Na 24 uur verschijnt een stale-banner \u2014 ververs voor actuele inzichten",
              ],
              tip: "Check je briefing elke ochtend als financi\u00eble routine \u2014 het kost 30 seconden en houdt je scherp op je financi\u00eble voortgang.",
            }}
          />

          <GuideTopicCard
            icon={Rocket}
            title="Dit komt eraan"
            color="var(--color-wil-400)"
            description={
              <>
                De Wil groeit mee met jou. Dit staat op de planning:
                <ul className="mt-2 list-disc pl-4 space-y-1">
                  <li>
                    <strong>Uitgavenpatronen</strong> &mdash; automatische
                    detectie van trends in je bestedingen: stijgende
                    categorie&euml;n, seizoenspatronen en afwijkingen van je
                    gemiddelde, vertaald naar vrijheidsdagen-impact.
                  </li>
                  <li>
                    <strong>Financieel rapport</strong> &mdash; een maandelijks
                    overzicht van je voortgang: nettovermogen-ontwikkeling,
                    spaarquote, bereikte doelen en gewonnen vrijheidstijd
                    &mdash; exporteerbaar als PDF.
                  </li>
                  <li>
                    <strong>Huishouden-samenwerking</strong> &mdash; deel
                    doelen, budgetten en acties met je partner. Gezamenlijke
                    voortgang, gedeelde mijlpalen en samen werken aan
                    financi&euml;le vrijheid.
                  </li>
                </ul>
              </>
            }
          />
        </ReisStapSection>

        <SectionDivider variant="asterisk" className="my-6" />

        {/* ── Stap 4: Kijk vooruit ── */}
        <ReisStapSection
          id="guide-reis-4"
          step={4}
          icon={Compass}
          title="Kijk vooruit"
          color="var(--color-horizon-400)"
          subtitle="Bereken wanneer werken optioneel wordt en hoe robuust je plan is"
          statusLines={
            progress?.financial.fireAge != null
              ? [
                  `Je geschatte FIRE-leeftijd is ${progress.financial.fireAge}`,
                  `${progress.counts.lifeEvents} levensgebeurtenis${progress.counts.lifeEvents !== 1 ? "sen" : ""} toegevoegd`,
                ]
              : ["Bereken wanneer werken optioneel wordt"]
          }
          valueSentence="De Horizon laat zien wanneer je financieel vrij bent. Niet als fantasie, maar als berekening — gebaseerd op je werkelijke cijfers, je plannen, en de onzekerheden van het leven."
          ctaLabel="Bekijk je prognose"
          ctaHref="/horizon"
          isComplete={!!progress?.steps.hasFireData && !!progress?.steps.hasLifeEvents}
        >
          <GuideTopicCard
            icon={Compass}
            title="FIRE-projectie"
            color="var(--color-horizon-400)"
            description={
              <>
                De app berekent op welke leeftijd je genoeg vermogen hebt om van
                te leven zonder te werken. Gebaseerd op je{" "}
                <strong>huidige vermogen</strong>,{" "}
                <strong>spaarquote</strong>,{" "}
                <strong>verwacht rendement</strong> en{" "}
                <strong>uitgaven</strong>. TriFinity toont je netto
                vermogensgrafiek over 30+ jaar met drie scenario&apos;s \u2014
                pessimistisch, verwacht en optimistisch. Je ziet je verwachte
                FIRE-leeftijd, de countdown in jaren/maanden/dagen, en het
                volledige vermogenspad tot aan je financi\u00eble vrijheid.
                {" "}
                <strong>Scenario&apos;s:</strong> vergelijk optimistisch, verwacht
                en pessimistisch. Pas je verwacht rendement aan van{" "}
                <strong>4% tot 10%</strong> en zie hoe je FIRE-leeftijd
                verschuift. Kies je FIRE-eindstrategie:{" "}
                <strong>perpetueel</strong> (eeuwig leven van je vermogen),{" "}
                <strong>legacy</strong> (nalaten aan erfgenamen),{" "}
                <strong>deplete</strong> (alles opmaken voor een bepaalde
                leeftijd) of <strong>pensioen</strong> (opbouw tot AOW, vaste
                onttrekking, restant als nalatenschap). Box 3 belasting wordt
                automatisch meegerekend in de simulatie.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Horizon \u2014 je FIRE-prognose wordt automatisch berekend zodra je vermogen en uitgaven hebt ingevuld",
                "Lees de vermogensgrafiek: de x-as toont je leeftijd, de y-as je vermogen. De drie lijnen zijn pessimistisch, verwacht en optimistisch",
                "Vergelijk de scenario\u2019s: pas je verwacht rendement aan van 4% tot 10% en zie direct hoe je FIRE-leeftijd verschuift",
                "Pas je verwacht rendement, inflatie en SWR aan via Identiteit \u2192 Instellingen \u2192 FIRE Instellingen",
                "Kies je eindstrategie: perpetueel, legacy, deplete of pensioen \u2014 elk verandert je benodigd vermogen",
                "Bekijk de countdown: hoeveel jaar, maanden en dagen tot je FIRE-datum",
              ],
              tip: "Je FIRE-leeftijd is geen lot \u2014 het is een kompas. Elke verhoging van je spaarquote met 1% verschuift de datum.",
            }}
          />

          <GuideHorizonUitleg />

          <GuideTopicCard
            icon={BarChart3}
            title="Vermogensstromen"
            color="var(--color-horizon-400)"
            description={
              <>
                Zie per levensjaar wat je vermogen aanvult en wat het afroomt.
                De bronanalyse toont <strong>besparingen</strong>,{" "}
                <strong>rendement</strong> en levensgebeurtenissen als aanvulling
                — en <strong>Box 3 belasting</strong>, levensonderhoud en kosten
                als onttrekking. Je ziet direct in welke jaren je vermogen krimpt:
                het inzicht dat laat zien waar je plan kwetsbaar is.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Horizon en scroll naar \u2018Inkomen & Uitgaven\u2019",
                "Schakel naar \u2018Bronnen\u2019 om het gestapelde overzicht te zien",
                "Hover over een leeftijd voor de exacte breakdown per bron",
                "Let op rode zones \u2014 dit zijn periodes waarin je vermogen krimpt",
              ],
              tip: "In de opbouwfase zie je besparingen en rendement als aanvulling. Na pensionering verschuift dit: rendement en levensgebeurtenissen vullen aan, terwijl levensonderhoud en belasting onttrekken.",
            }}
          />

          <GuideTopicCard
            icon={Sparkles}
            title="Levensgebeurtenissen"
            color="var(--color-horizon-400)"
            description={
              <>
                Het leven verloopt niet in een rechte lijn \u2014 en je
                financi\u00ebn ook niet. Voeg belangrijke momenten toe die je
                financi\u00eble pad be\u00efnvloeden: een{" "}
                <strong>kind</strong> krijgen (\u20ac800/maand extra), een{" "}
                <strong>huis</strong> kopen (eenmalige kosten + hypotheek),{" "}
                <strong>pensioen</strong> (AOW-inkomen erbij),{" "}
                <strong>erfenis</strong> ontvangen,
                trouwen, studie betalen, eerder stoppen met werken of een wereldreis
                maken. Elk event verschuift je FIRE-datum \u2014 je ziet de
                impact direct. TriFinity heeft een catalogus van{" "}
                <strong>50+ voorgedefinieerde events</strong> met realistische
                cashflow-schattingen.
                {" "}
                Elke levensgebeurtenis <strong>verschuift je FIRE-datum</strong> en
                is zichtbaar als markering op je vermogensgrafiek. Je ziet het
                cumulatieve effect: als je over 3 jaar een kind krijgt en over 5
                jaar een huis koopt, wat doet dat met je projectie? Zo maak je
                bewuste keuzes over je toekomst in plaats van verrassingen.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Horizon en scroll naar levensgebeurtenissen",
                "Tik op \u201c+ Event\u201d en kies uit de catalogus of maak een eigen gebeurtenis",
                "Stel de verwachte datum en het financi\u00eble effect in (eenmalig bedrag, maandelijkse kosten of inkomsten)",
                "Bekijk direct het effect op je FIRE-datum en vermogenspad",
                "Versleep events in de tijd of schakel ze uit om scenario\u2019s te vergelijken",
              ],
              tip: "Voeg ook vrijheid-opbouwende events toe \u2014 een salarisverhoging, een erfenis of een zijproject. Het gaat niet alleen om vrijheid investeren.",
            }}
          />

          <GuideTopicCard
            icon={LineChart}
            title="Monte Carlo & backtesting"
            color="var(--color-horizon-400)"
            description={
              <>
                E\u00e9n prognose is een gok \u2014 duizend prognoses zijn een
                strategie. De <strong>Monte Carlo simulatie</strong> draait{" "}
                <strong>1.000 simulaties met willekeurige rendementen</strong>{" "}
                (goede en slechte jaren) en toont hoe robuust je plan is. Je ziet
                de <strong>slaagkans</strong> van je plan: &ldquo;In 85% van de
                gevallen red je het.&rdquo; De <strong>bandbreedtes</strong>{" "}
                tonen het best-case en worst-case scenario (p10, p25, p50, p75,
                p90) en het vermogenspad per percentiel.
                {" "}
                <strong>Backtesting:</strong> stel je was 30 jaar geleden begonnen
                met exact dit plan \u2014 zou het gewerkt hebben? Historische
                data toont hoe robuust je strategie is, door de dotcom-crash, de
                financi\u00eble crisis van 2008 en de COVID-dip heen. De
                backtestscore geeft je een concreet getal: het percentage
                historische crisisperiodes waarin je plan overeind bleef.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Horizon \u2014 de Monte Carlo simulatie draait automatisch op basis van je huidige data",
                "Bekijk de slaagkans: in hoeveel van de 1.000 simulaties bereik je FIRE?",
                "Lees de bandbreedtes: p10 (worst case) tot p90 (best case) tonen de spreiding van mogelijke uitkomsten",
                "De backtestscore toont hoe betrouwbaar je plan is: het percentage historische crises waarin het overeind bleef",
                "Pas je rendementsverwachting of spaarquote aan en zie het effect op de slaagkans direct veranderen",
              ],
              tip: "Een slaagkans boven 80% is solide. Onder 60% wil je je plan aanpassen \u2014 meer sparen, langer werken of zuiniger leven na FIRE.",
            }}
          />

          <GuideTopicCard
            icon={ArrowDownToLine}
            title="Onttrekkingsstrategie"
            color="var(--color-horizon-400)"
            valueText="FIRE bereiken is één ding. Weten hoe je je vermogen veilig opneemt is minstens zo belangrijk. Kies een strategie die past bij jouw leven."
            description={
              <>
                TriFinity ondersteunt vier eindstrategieën (FireEndStrategy):
                <br />
                <br />
                <strong>Perpetual (eeuwigdurend)</strong> — je neemt jaarlijks
                ~4% op en laat je vermogen intact. Je leeft van het rendement,
                en je kapitaal raakt nooit op. Conservatief maar veilig. Ideaal
                als je wilt dat je geld &apos;nooit&apos; opraakt of als je wilt
                nalaten aan erfgenamen.
                <br />
                <br />
                <strong>Legacy (nalaten)</strong> — je houdt een vastgesteld
                bedrag over voor je erfgenamen. De rest gebruik je voor jezelf.
                Stel in hoeveel je wilt nalaten — TriFinity berekent hoeveel je
                jaarlijks kunt opnemen zodat precies dat bedrag overblijft.
                <br />
                <br />
                <strong>Deplete (opbranden)</strong> — je bouwt je vermogen
                bewust af tot €0 op een gekozen leeftijd (bijv. 90 jaar).
                Hierdoor kun je eerder stoppen met werken of meer uitgeven.
                Maximale besteding, niets over — maar je hebt ook geen buffer
                als je langer leeft dan gepland.
                <br />
                <br />
                <strong>Pensioen</strong> — vermogensopbouw tot de
                AOW-leeftijd (67), daarna vaste onttrekking op basis van je
                ingestelde jaarlijkse budget, ge&iuml;ndexeerd voor inflatie.
                Het restant op je gekozen eindleeftijd wordt als nalatenschap
                getoond. Ideaal als je niet eerder wilt stoppen maar wel
                inzicht wilt in je vermogensverloop na pensioen.
                <br />
                <br />
                <strong>Instellen:</strong> ga naar Identiteit → Instellingen →
                FIRE Instellingen (sectie C). Kies je strategie, eindleeftijd en
                eventueel legacy-bedrag. Alle projecties — FIRE-datum,
                vermogenspad, Monte Carlo simulatie — passen zich direct aan.
                <br />
                <br />
                <em>
                  Tip: de eindstrategie bepaalt <strong>wat</strong> je doel is
                  (vermogen opbranden, nalaten of behouden). Hoe je daadwerkelijk
                  onttrekt — welke methode — stel je apart in via de
                  onttrekkingsmethoden (zie het volgende kaart).
                </em>
                <br />
                <br />
                <strong>SWR-monitor:</strong> de SWR-widget op je dashboard toont
                je huidige vs. benodigde onttrekkingspercentage, gecorrigeerd
                voor Box 3 belasting en inflatie. In Nederland is de effectieve
                SWR lager dan de Amerikaanse 4%-regel, omdat
                vermogensbelasting je effectief rendement verlaagt. TriFinity
                rekent dit mee: je ziet het netto-effect na belasting, niet
                alleen het bruto rendement.
              </>
            }
            howTo={{
              steps: [
                "Ga naar Identiteit → Instellingen → FIRE Instellingen en kies je eindstrategie: perpetueel, legacy, deplete of pensioen",
                "Stel je verwacht rendement en inflatiepercentage in — deze bepalen je SWR en benodigd FIRE-vermogen",
                "Bij Legacy: voer het gewenste nalatenschapsbedrag in. Bij Deplete: kies je eindleeftijd (bijv. 85 of 90 jaar). Bij Pensioen: kies je eindleeftijd — het restant wordt als nalatenschap berekend",
                "Ga naar De Horizon — je onttrekkingsstrategie wordt direct verwerkt in de FIRE-projectie en het vermogenspad",
                "Vergelijk de vier strategieën: perpetueel vereist het meeste vermogen, deplete het minste, pensioen toont het verloop na AOW met vaste onttrekking",
                "Bekijk de SWR-monitor widget op je dashboard — deze toont je veilige onttrekking gecorrigeerd voor Box 3 belasting en inflatie",
              ],
              tip: "Begin met perpetueel als veilige basis. Als je FIRE-datum te ver weg lijkt, experimenteer met deplete — je ziet direct hoeveel jaar eerder je vrij bent. Legacy is de gulden middenweg als je ook aan erfgenamen denkt. Pensioen is ideaal als je tot de AOW-leeftijd werkt en wilt zien wat er overblijft.",
            }}
          />

          <GuideTopicCard
            icon={Shield}
            title="Onttrekkingsmethoden"
            color="var(--color-horizon-400)"
            valueText="Je eindstrategie bepaalt het doel — je onttrekkingsmethode bepaalt hoe je elk jaar je geld opneemt. De juiste methode beschermt je tegen marktonzekerheid."
            description={
              <>
                TriFinity biedt vier onttrekkingsmethoden die je kunt combineren
                met elke eindstrategie:
                <br />
                <br />
                <strong>Vast (SWR / 4%-regel)</strong> — de klassieke methode.
                Je onttrekt een vast percentage van je startportfolio (bijv. 4%),
                jaarlijks gecorrigeerd voor inflatie. Voorspelbaar en eenvoudig,
                maar geen aanpassing bij slechte markten. Ideaal voor wie
                zekerheid en eenvoud waardeert.
                <br />
                <br />
                <strong>Guardrails (Guyton-Klinger)</strong> — dynamische
                onttrekking met een vloer en plafond. Bij goede beursjaren
                verhoog je je onttrekking, bij slechte jaren verlaag je. Biedt
                bescherming én profiteert van groei. Geschikt voor flexibele
                pensioengangers.
                <br />
                <br />
                <strong>VPW (Variable Percentage Withdrawal)</strong> — elk jaar
                bereken je een nieuw percentage op basis van je resterende
                levensverwachting en actuele portfoliowaarde. Wiskundig optimaal,
                maar je inkomen kan sterk variëren. Niet combineerbaar met de
                perpetuele eindstrategie (zie compatibiliteitsmatrix).
                <br />
                <br />
                <strong>Bucket (drie-emmer methode)</strong> — verdeel je
                vermogen in drie emmers: cash (2 jaar), obligaties (5 jaar) en
                aandelen (rest). Je leeft van de cash-emmer en vult jaarlijks
                aan vanuit de groei-emmer. Emotioneel rustgevend bij
                marktvolatiliteit.
                <br />
                <br />
                <strong>Compatibiliteit:</strong> niet elke methode werkt even
                goed bij elke eindstrategie. In de strategie-modal op De Horizon
                vind je een <strong>compatibiliteitsmatrix</strong> die per
                combinatie toont of deze goed (✅), met aandacht (⚠️) of
                onverenigbaar (❌) is. Zo kies je altijd de beste combinatie
                voor jouw situatie.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Horizon → tik op de strategie-widget of navigeer naar Onttrekkingsstrategieën",
                "Vergelijk de 4 methoden: bekijk de portefeuille-grafiek en bestedingsruimte per methode",
                "Bekijk de compatibiliteitsmatrix: welke methode past bij jouw eindstrategie?",
                "Kies je methode en tik op 'Activeer' — de simulatie past zich direct aan",
                "Pas guardrail-parameters aan via Identiteit → Instellingen → Geavanceerde instellingen",
              ],
              tip: "Start met Vast (SWR) als je eenvoud wilt. Guardrails is de populairste keuze voor flexibiliteit. VPW is wiskundig optimaal maar vereist mentale flexibiliteit. Bucket geeft rust bij marktdalingen.",
            }}
          />

          <GuideTopicCard
            icon={Activity}
            title="Financi&euml;le gezondheid score"
            color="var(--color-horizon-400)"
            valueText="E&eacute;n getal (0&ndash;100) dat je complete financi&euml;le gezondheid weergeeft. Geen vaag gevoel, maar een gewogen score op basis van 6 pilaren."
            description={
              <>
                De financi&euml;le gezondheid score vervangt de oude
                veerkracht-score en kijkt breder: niet alleen naar je buffer,
                maar naar je volledige financi&euml;le plaatje. De score wordt
                opgebouwd uit <strong>6 pilaren</strong>, elk met een eigen
                gewicht:
                <br />
                <br />
                <strong>1. Spaarquote (25%)</strong> &mdash; hoeveel procent van
                je inkomen spaar je? Gemeten over de laatste 6 maanden. Hoe
                hoger, hoe sneller je vermogen groeit.
                <br />
                <strong>2. Schuldratio (20%)</strong> &mdash; de verhouding
                tussen je schulden en je totale vermogen. Minder schuld = hoger
                score.
                <br />
                <strong>3. Noodfonds-dekking (15%)</strong> &mdash; hoeveel
                maanden kun je rondkomen van je noodfonds? 6+ maanden is
                optimaal.
                <br />
                <strong>4. FIRE-voortgang (20%)</strong> &mdash; hoever ben je
                op weg naar financi&euml;le vrijheid? Gebaseerd op je
                vrijheidspercentage.
                <br />
                <strong>5. Portefeuille-diversificatie (10%)</strong> &mdash;
                spreiding over verschillende vermogenstypes (cash, aandelen,
                vastgoed, etc.).
                <br />
                <strong>6. Budgetdiscipline (10%)</strong> &mdash; hoeveel van
                je budgetten blijven binnen de limiet? <em>Deze pilaar is
                optioneel</em>: als je geen budgetten hebt ingesteld, wordt het
                gewicht herverdeeld over de andere 5 pilaren.
                <br />
                <br />
                De score kent vijf niveaus: <strong>Uitstekend</strong> (80+),{" "}
                <strong>Sterk</strong> (60&ndash;79),{" "}
                <strong>Redelijk</strong> (40&ndash;59),{" "}
                <strong>Kwetsbaar</strong> (20&ndash;39) en{" "}
                <strong>Kritiek</strong> (0&ndash;19). Je ziet ook de{" "}
                <strong>trend</strong> ten opzichte van vorige maand, zodat je
                weet of je de goede kant opgaat.
              </>
            }
            howTo={{
              steps: [
                "Bekijk je gezondheid score op het dashboard \u2014 de widget toont je totaalscore en de trend",
                "Tik op de widget om per pilaar je score, uitleg en verbeter-tip te zien",
                "Focus op de pilaar met de laagste score \u2014 daar haal je het meeste rendement",
                "Stel budgetten in om de 6e pilaar (budgetdiscipline) te activeren \u2014 anders wordt het gewicht herverdeeld over 5 pilaren",
                "Volg je voortgang maandelijks: de trend laat zien of je financi\u00eble gezondheid verbetert",
              ],
              tip: "De score is geen doel op zich, maar een kompas. Focus niet op 100 punten, maar op de pilaar waar je het snelst kunt verbeteren.",
            }}
          />
        </ReisStapSection>

        <SectionDivider variant="asterisk" className="my-6" />

        {/* ── Stap 5: Droom en plan ── */}
        <ReisStapSection
          id="guide-reis-5"
          step={5}
          icon={MessageSquare}
          title="Droom en plan"
          color="var(--color-horizon-400)"
          subtitle="Verken alternatieve toekomsten en vertaal dromen naar concrete plannen"
          statusLines={["Probeer: \u201cIk wil over 5 jaar een huis kopen...\u201d"]}
          valueSentence="Je dromen verdienen een reality-check — en een routekaart."
          ctaLabel="Start een scenario"
          ctaHref="/horizon/whatif"
          isComplete={false}
        >
          <GuideTopicCard
            icon={MessageSquare}
            title="Droomscenario / What-If"
            color="var(--color-horizon-400)"
            description={
              <>
                Wat als je minder gaat werken? Wat als je een bonus krijgt? Wat als
                je een jaar pauze neemt?{" "}
                <strong>
                  Het droomscenario laat je experimenteren zonder risico.
                </strong>
                {" "}
                Ga naar De Horizon \u2192 Droomscenario en verschuif de sliders:{" "}
                <strong>maandelijks inkomen</strong>, werkdagen/week (0\u20135),
                spaarquote (%), verwacht rendement (%) en{" "}
                <strong>extra maandelijkse inleg</strong>. De FIRE-grafiek past
                zich direct aan.
                {" "}
                <strong>Levensgebeurtenissen:</strong> voeg events toe aan je
                scenario (sabbatical, verhuizing, kind). Per event zie je hoeveel
                maanden je FIRE-datum verschuift.
                {" "}
                Onder de projectiegrafiek zie je nu ook de vermogensstromen-grafiek: instroom vs. uitstroom van je vermogen per jaar.{" "}
                <strong>Presets:</strong> klik op een preset \u2014{" "}
                <em>sabbatical</em>, <em>bonus</em>, <em>loonsverhoging</em>,{" "}
                <em>minder werken</em> \u2014 om snel een scenario te laden.{" "}
                <strong>Vergelijken:</strong> sla scenario&apos;s op en vergelijk
                ze naast elkaar. De kassabon-vergelijking toont per regel het
                verschil met je huidige situatie: baseline vs what-if.{" "}
                <strong>Will-chat:</strong> open Will vanuit je scenario. De AI
                kent je aanpassingen en geeft gerichte suggesties: &ldquo;Als je
                die sabbatical wilt, kun je dit doen om het te
                compenseren.&rdquo;
                {" "}
                Will suggereert ook automatisch passende levensgebeurtenissen wanneer je grote wijzigingen maakt aan je scenario.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Horizon \u2192 Droomscenario om een nieuw scenario te openen",
                "Verschuif de sliders: inkomen, werkdagen, spaarquote, rendement en extra maandelijkse inleg \u2014 de FIRE-grafiek past zich direct aan",
                "Klik op een preset (sabbatical, bonus, loonsverhoging, minder werken) om snel een scenario te laden en van daaruit te verfijnen",
                "Voeg levensgebeurtenissen toe: per event zie je hoeveel maanden je FIRE-datum verschuift",
                "Sla scenario\u2019s op en vergelijk ze: de kassabon-vergelijking toont per regel het verschil met je huidige situatie",
                "Open Will vanuit je scenario \u2014 de AI kent je aanpassingen en geeft gerichte suggesties om je droom haalbaar te maken",
                "Bekijk de vermogensstromen onder de projectie \u2014 hier zie je waar je geld naartoe gaat per leeftijd",
                "Let op Will\u2019s suggesties bij grote wijzigingen \u2014 automatisch verschijnen passende events die je met een klik toevoegt",
                "Selecteer een opgeslagen scenario als overlay op de Horizon-pagina om direct visueel te vergelijken met je huidige pad",
              ],
              tip: "Probeer: \u201cWat als ik mijn spaarquote met 10% verhoog en over 5 jaar een kind krijg?\u201d \u2014 de combinatie geeft het eerlijkste beeld.",
            }}
          />

          <GuideTopicCard
            icon={MessageSquare}
            title="Will AI-chat"
            color="var(--color-horizon-400)"
            description={
              <>
                Will is je persoonlijke financi\u00eble gesprekspartner met drie
                persoonlijkheden. <strong>FHIN</strong> (De Kern) analyseert je data
                en beantwoordt vragen over je vermogen en uitgaven.{" "}
                <strong>FINN</strong> (De Wil) zet je aan tot actie met concrete
                aanbevelingen. <strong>FFIN</strong> (De Horizon) helpt je dromen
                vertalen naar financi\u00eble plannen \u2014 beschrijf je ideale
                toekomst en hij berekent wat het kost en wanneer het haalbaar is.
                {" "}
                Will is <strong>context-aware</strong>: hij weet altijd op welke
                pagina je bent en welke data relevant is. Open de chat rechtsonder
                voor hulp die past bij wat je aan het doen bent. In een What-If
                scenario kan Will je droom direct omzetten naar levensgebeurtenissen
                met FIRE-impact. Je privacy is gewaarborgd \u2014 gevoelige
                gegevens worden gemaskeerd in alle communicatie.
              </>
            }
            howTo={{
              steps: [
                "Tik op het chat-icoon rechtsonder op elke pagina",
                "Stel een vraag over je scenario \u2014 Will past zich aan op de context en geeft persoonlijk advies",
                "In een What-If: beschrijf je droom (\u201cIk wil over 5 jaar een huis kopen\u201d) en Will vertaalt het naar events",
                "Vraag om een reality-check: \u201cIs mijn plan realistisch?\u201d \u2014 Will analyseert je data en geeft eerlijk antwoord",
                "Will combineert je financi\u00eble data met je scenario om concreet advies te geven dat past bij jouw situatie",
              ],
              tip: "Will wordt slimmer naarmate je meer data hebt. Begin met een eenvoudige vraag: \u201cWat is het belangrijkste dat ik nu kan doen?\u201d",
            }}
          />

          <GuideTopicCard
            icon={Rocket}
            title="Wat komt er nog?"
            color="var(--color-horizon-400)"
            description={
              <>
                De Horizon wordt steeds scherper. Dit staat op de planning:
                <ul className="mt-2 list-disc pl-4 space-y-1">
                  <li>
                    <strong>Pensioensimulatie</strong> &mdash; koppel je AOW,
                    aanvullend pensioen en lijfrente aan je FIRE-berekening. Zie
                    wanneer welk inkomen ingaat en hoeveel eigen vermogen je tot
                    die tijd nodig hebt.
                  </li>
                  <li>
                    <strong>Internationale belastingvergelijking</strong> &mdash;
                    vergelijk je vermogensbelasting met andere landen. Wat als je
                    in Portugal, Belgi&euml; of Duitsland woont? Ontdek het
                    fiscale effect op je FIRE-datum.
                  </li>
                  <li>
                    <strong>Scenario-vergelijker</strong> &mdash; sla meerdere
                    What-If scenario's op en vergelijk ze naast elkaar in
                    \u00e9\u00e9n overzicht: FIRE-leeftijd, slaagkans en
                    vermogenspad per scenario.
                  </li>
                </ul>
              </>
            }
          />
        </ReisStapSection>
      </div>

      {/* ── Overal ── */}
      <p className="label-editorial mb-3 text-[var(--ink-3)]">Overal</p>
      <div className="mb-6 grid grid-cols-1 gap-2 sm:mb-8 lg:grid-cols-2">
        <GuideTopicCard
          icon={Sun}
          title="Vrijheidsinsteek"
          color="var(--ink-2)"
          description={
            <>
              TriFinity is geen budgetapp. Het is een vrijheidsapp. Elke euro die
              je verdient, uitgeeft of spaart wordt vertaald naar tijd \u2014 je
              meest waardevolle bezit. Het kernprincipe:{" "}
              <strong>geld is opgeslagen tijd</strong>. Daarom rekent TriFinity elk
              bedrag om naar <strong>vrijheidstijd</strong>: dagen, maanden en jaren
              van financi\u00eble onafhankelijkheid. \u20ac500 besparen betekent X
              dagen eerder vrij. Een abonnement van \u20ac30 per maand kost Y
              vrijheidsdagen per jaar. Zo worden abstracte bedragen tastbaar.
              {" "}
              De app is opgebouwd uit drie modules.{" "}
              <strong>De Kern</strong> is je financi\u00eble fundament:
              bankrekeningen, vermogen, schulden en budget \u2014 weten waar je
              staat.{" "}
              <strong>De Wil</strong> is je actiemotor: voorstellen, doelen en
              acties \u2014 onderneem wat nodig is.{" "}
              <strong>De Horizon</strong> is je toekomstvisie: FIRE-projectie,
              scenario\u2019s en simulaties \u2014 kijk vooruit naar volledige
              vrijheid.
              {" "}
              Anders dan traditionele budgetapps geeft TriFinity geen rode
              waarschuwingen of schuldgevoel. Het toont feiten en mogelijkheden.
              Jij kiest wat vrijheid voor jou betekent. Elke financi\u00eble keuze
              wordt vertaald in vrijheidstijd, zodat je zelf kunt beslissen wat die
              tijd je waard is.
              {" "}
              Naarmate je meer data invoert, ontgrendel je diepere inzichten via het{" "}
              <strong>modulepad</strong>: van budgetteren of vermogensregistratie als basis,
              uitbreidbaar met inzicht &amp; acties, toekomstplannen en nieuws.
            </>
          }
          howTo={{
            steps: [
              "Elk bedrag boven \u20ac100 toont automatisch de vrijheidstijd-equivalent",
              "Je netto vermogen wordt uitgedrukt in jaren en maanden vrijheid",
              "Budgetuitgaven tonen hoeveel vrijheidsdagen ze kosten per maand",
              "Je FIRE-doelbedrag is het moment van volledige vrijheid",
              "Schulden worden geframed als vrijheid die je terugkoopt door af te lossen",
            ],
            tip: "Denk bij elke uitgave niet in euro\u2019s, maar in vrijheidstijd. Die \u20ac50 is misschien een halve dag \u2014 is dat het waard voor jou?",
          }}
        />


        <GuideTopicCard
          icon={Rss}
          title="TriFinity Post"
          color="var(--ink-2)"
          valueText="Financieel nieuws dat er toe doet — voor jou. Geen clickbait over crypto-hypes, maar inzichten die relevant zijn voor jóuw portfolio, jóuw situatie, jóuw doelen."
          description={
            <>
              <strong>TriFinity Post</strong> is je persoonlijke financiële
              nieuwsfeed. De AI analyseert actueel financieel nieuws en schrijft
              artikelen die rekening houden met jouw portfolio, vermogen,
              budgetdata en doelen. Zo lees je geen generiek nieuws, maar
              inzichten die er voor jou toe doen.
              <br />
              <br />
              <strong>Personalisatie:</strong> de AI weet welke beleggingen je
              hebt, hoe je budget ervoor staat, en wat je doelen zijn. Een
              artikel over de AEX is relevant als je Nederlandse aandelen bezit.
              Een artikel over energieprijzen is relevant als je energiebudget
              stijgt. Een rentebesluit van de ECB krijgt context als je een
              hypotheek hebt.
              <br />
              <br />
              <strong>Progressive loading:</strong> artikelen worden gegenereerd
              terwijl je kijkt — ze verschijnen één voor één als kaarten met
              vloeiende CSS-animaties. Je hoeft niet te wachten tot alles klaar
              is: de eerste kaarten zijn er binnen seconden.
              <br />
              <br />
              <strong>Dagelijks vers:</strong> nieuwe artikelen worden elke dag
              beschikbaar. Tik op verversen voor verse content op basis van de
              nieuwste data en je meest recente financiële situatie.
            </>
          }
          howTo={{
            steps: [
              "Ga naar Berichten via de navigatie of het dashboard — de AI genereert artikelen terwijl je kijkt, ze verschijnen één voor één als kaarten",
              "Lees de artikelkaarten — elk artikel is een korte, leesbare samenvatting van financieel nieuws dat relevant is voor jouw situatie",
              "De AI personaliseert op basis van je beleggingen, budget en doelen: een artikel over de AEX verschijnt als je Nederlandse aandelen hebt, energieprijzen als je energiebudget stijgt",
              "Tik op verversen voor nieuwe artikelen — dagelijks beschikbaar, gebaseerd op de nieuwste data en je actuele financiële positie",
            ],
            tip: "Lees elke ochtend 2-3 artikelen bij je koffie. Het kost 5 minuten en houdt je financieel scherp — zonder zelf nieuwssites af te struinen.",
          }}
        />

        <GuideTopicCard
          icon={Sparkles}
          title="Will — je AI-assistent"
          color="var(--ink-2)"
          valueText="Will is je persoonlijke financiële adviseur. Hij kent je cijfers, je doelen, en je situatie — en hij is altijd beschikbaar. Stel elke vraag die je wilt."
          description={
            <>
              <strong>Will</strong> is je eigen financiële adviseur die jouw
              situatie kent. Tik op de Will-knop (rechtsonder) of ga naar Will
              in het menu — hij is beschikbaar op elke pagina en kent de context
              van waar je bent.
              <br />
              <br />
              <strong>Vragen stellen:</strong> vraag Will alles:{" "}
              &ldquo;Kan ik me een vakantie van &euro;3000 veroorloven?&rdquo;,{" "}
              &ldquo;Hoe kan ik sneller schuldenvrij worden?&rdquo;,{" "}
              &ldquo;Wat is het effect als ik &euro;200/maand meer spaar?&rdquo;.
              Will rekent het uit met je werkelijke cijfers.
              <br />
              <br />
              <strong>Acties:</strong> Will kan voorstellen doen die direct als
              actie op je bord verschijnen. Vanuit een gesprek naar een concrete
              stap.
              <br />
              <br />
              <strong>Scenario-modus:</strong> in het Droomscenario kent Will je
              aanpassingen. Hij geeft advies specifiek voor dat scenario —
              zodat je kunt verkennen wat een andere keuze betekent.
              <br />
              <br />
              <strong>Privacy:</strong> Will draait op AI-modellen. Je data
              wordt niet opgeslagen buiten je sessie. Gevoelige gegevens worden
              automatisch gemaskeerd. Je kunt Will uitschakelen via Instellingen.
            </>
          }
          howTo={{
            steps: [
              "Tik op de Will-knop rechtsonder op elke pagina, of ga naar Will in het menu — Will kent de context van waar je bent",
              "Stel elke vraag: 'Kan ik me een vakantie van €3000 veroorloven?' — Will rekent het uit met je werkelijke cijfers",
              "Will kan voorstellen doen die direct als actie op je bord verschijnen — vanuit een gesprek naar een concrete stap",
              "In het Droomscenario kent Will je aanpassingen en geeft advies specifiek voor dat scenario",
              "Je kunt Will uitschakelen via Identiteit → Instellingen — je data wordt niet opgeslagen buiten je sessie",
            ],
            tip: "Will wordt slimmer naarmate je meer data hebt. Begin met een eenvoudige vraag: \u201cWat is het belangrijkste dat ik nu kan doen?\u201d",
          }}
        />

        <GuideTopicCard
          icon={Bell}
          title="Meldingen"
          color="var(--ink-2)"
          description={
            <>
              <strong>
                Weet wat belangrijk is zonder constant te checken. Meldingen
                komen naar jou — alleen de dingen die ertoe doen.
              </strong>
              <br />
              <br />
              <strong>Soorten meldingen:</strong>{" "}
              <strong>Budgetwaarschuwing</strong> — je nadert of overschrijdt een
              limiet.{" "}
              <strong>Mijlpaal bereikt</strong> — nieuw vermogensrecord of
              nieuwe module ingeschakeld.{" "}
              <strong>AI-inzicht</strong> — Will heeft iets ontdekt in je
              patronen of uitgaven.{" "}
              <strong>Sync voltooid</strong> — bankdata is bijgewerkt of
              connectie vraagt aandacht.{" "}
              <strong>Belegging alert</strong> — significante koersbeweging of
              allocatiedrift in je holdings.
              <br />
              <br />
              <strong>Instellen:</strong> ga naar Identiteit → Instellingen
              → Notificaties. Schakel per type aan of uit. Kies of je een
              maandelijkse check-in herinnering wilt ontvangen.
              <br />
              <br />
              <strong>Partner-meldingen:</strong> stel apart in of je meldingen
              krijgt over transacties van je partner: altijd (all_shared), alleen
              boven een bedrag (threshold), per categorie (categories), of nooit
              (disabled).
              <br />
              <br />
              <strong>Widget:</strong> de meldingen-widget op De Wil toont je
              recente meldingen in een compact overzicht.
            </>
          }
          howTo={{
            steps: [
              "Meldingen verschijnen via het bel-icoon in de navigatiebalk — een badge toont het aantal ongelezen",
              "Tik op een melding om direct naar het relevante onderdeel te navigeren (budget, holding, vermogen)",
              "Ga naar Identiteit → Instellingen → Notificaties. Schakel per type aan of uit. Kies of je een maandelijkse check-in herinnering wilt",
              "Partner-meldingen: stel in of je meldingen krijgt over transacties van je partner — altijd, boven een bedrag, per categorie, of nooit",
              "Stel prijs-alerts in op je holdings-pagina voor koerswaarschuwingen en allocatiedrift",
              "De meldingen-widget op De Wil toont je recente meldingen in een compact overzicht",
            ],
            tip: "Begin met alle meldingen aan en schakel na een week uit wat je niet nodig hebt. Zo ontdek je welke alerts echt waarde toevoegen aan je financiële routine.",
          }}
        />

        <GuideTopicCard
          icon={FileText}
          title="Rapporten"
          color="var(--ink-2)"
          description={
            <>
              <strong>
                Soms wil je het grotere plaatje. Rapporten geven je een diepere
                analyse — per maand, kwartaal of jaar.
              </strong>{" "}
              Drie rapporttypen helpen je patronen en groei te begrijpen.
              {" "}
              Het <strong>balansrapport</strong> toont je vermogensopbouw over
              tijd: hoe je bezittingen en schulden zijn veranderd per maand of
              kwartaal. Cash, beleggingen, vastgoed en pensioen tegenover
              hypotheek en overige schulden — je netto vermogen uitgedrukt in
              vrijheidstijd.
              {" "}
              Het <strong>budgetrapport</strong> laat je uitgaven per categorie
              zien met maand-op-maand trends. Zie direct waar je meer of minder
              uitgeeft dan vorige periodes en waar je structureel boven of onder
              budget zit.
              {" "}
              Het <strong>jaaroverzicht</strong> is een complete samenvatting van
              je financiële jaar: totaal inkomen, uitgaven, gespaarde bedragen,
              vermogensgroei en bereikte doelen — alles in één overzicht.
              {" "}
              <strong>Periodes:</strong> kies uit maand (tot 24 maanden terug),
              kwartaal (8 kwartalen) of jaar (5 jaar). Elke sectie in een
              rapport is configureerbaar — je bepaalt zelf welke onderdelen je
              wilt zien.
              {" "}
              Optioneel voegt de <strong>AI-samenvatting</strong> een geschreven
              analyse toe: Will benoemt patronen, bijzonderheden en
              aandachtspunten. Dit is opt-in — je kiest zelf of je de
              AI-analyse wilt genereren.
              {" "}
              Elk rapport kun je <strong>downloaden als PDF</strong> voor je
              administratie of om te delen.
            </>
          }
          howTo={{
            steps: [
              "Openen — Ga naar Rapportages via het profielmenu rechtsboven (tussen Identiteit en Uitloggen)",
              "Balansrapport — Kies 'Balansrapport' en selecteer een periode om je vermogensopbouw over tijd te zien",
              "Budgetrapport — Bekijk je uitgaven per categorie met trends: waar geef je meer of minder uit dan vorige periodes?",
              "Jaaroverzicht — Genereer een complete samenvatting van je financiële jaar met totalen, groei en mijlpalen",
              "AI-samenvatting — Schakel optioneel de AI-analyse in voor een geschreven samenvatting van patronen en bijzonderheden",
              "Download — Exporteer elk rapport als PDF voor je administratie of om te delen",
            ],
            tip: "Genereer na elke maandelijkse check-in een balansrapport. Zo bouw je een financieel archief op dat je groei over maanden en jaren zichtbaar maakt.",
          }}
        />

        <GuideTopicCard
          icon={LayoutDashboard}
          title="Dashboard & Widgets"
          color="var(--ink-2)"
          description={
            <>
              Je dashboard is je persoonlijke cockpit \u2014 meer dan{" "}
              <strong>26 widgets</strong> geven je in \u00e9\u00e9n oogopslag
              inzicht in je vermogen, budget, acties, FIRE-prognose en voortgang.
              Widgets vari\u00ebren in grootte (mini tot volledig) en worden zichtbaar op basis van je actieve modules. Sleep ze in de
              volgorde die voor jou werkt, schakel uit wat je niet nodig hebt, en
              schakel een module in via Instellingen om nieuwe widgets te ontdekken.
            </>
          }
          howTo={{
            steps: [
              "Je dashboard is je startpagina na inloggen",
              "Ga naar Identiteit \u2192 Instellingen \u2192 Widgets om widgets aan/uit te zetten en de volgorde aan te passen",
              "Nieuwe widgets worden beschikbaar wanneer je extra modules inschakelt",
              "Sleep widgets naar een andere positie op het dashboard zelf",
            ],
            tip: "Begin met de standaard 7 widgets. Voeg pas meer toe als je weet welke inzichten je dagelijks wilt zien.",
          }}
        />

        <GuideTopicCard
          icon={Newspaper}
          title="DAIshboard / Briefing"
          color="var(--ink-2)"
          description={
            <>
              Schakel over naar de <strong>DAIshboard-modus</strong> en je
              dashboard transformeert in een AI-samengestelde briefing. Will
              analyseert je financi\u00eble data en componeert een persoonlijk
              overzicht met tot <strong>23 verschillende kaarttypes</strong>:
              metrics, sparklines, mijlpalen, inzichten, checklists,
              vergelijkingen, doelvoortgang, budgetbalken en meer. De briefing
              wordt progressief geladen \u2014 kaarten verschijnen zodra ze klaar
              zijn.
              {" "}
              Elke briefing is <strong>tijdsbewust</strong>: &apos;s ochtends focus
              op de dag, aan het einde van de maand op je maandresultaat. De
              briefing onthoudt wat je eerder hebt gezien en varieert de inhoud. Na
              24 uur verschijnt een stale-banner zodat je weet dat de data niet
              meer actueel is.
            </>
          }
          howTo={{
            steps: [
              "Op je dashboard: wissel naar DAIshboard-modus via de toggle bovenaan",
              "De briefing genereert automatisch \u2014 kaarten verschijnen progressief",
              "Scroll door je persoonlijke briefing en tik op kaarten voor meer detail",
            ],
            tip: "Check je briefing elke ochtend als financi\u00eble routine \u2014 het kost 30 seconden en houdt je scherp.",
          }}
        />

        <GuideTopicCard
          icon={Sparkles}
          title="Invulfase"
          color="var(--ink-2)"
          valueText="Na de onboarding helpt de invulfase je om alle belangrijke gegevens stap voor stap aan te vullen — zonder druk, op jouw tempo."
          description={
            <>
              Na het voltooien van de onboarding start de <strong>invulfase</strong>: een begeleid proces dat je helpt om je financiële profiel compleet te maken. De onboarding legt de basis (profiel, eventueel budgetten, bezittingen en schulden), maar er is vaak meer data nodig voor nauwkeurige berekeningen.
              <br /><br />
              De invulfase toont een <strong>banner</strong> bovenaan je pagina&apos;s met je volgende stap: transacties importeren, budgetten verfijnen, doelen instellen, levensgebeurtenissen toevoegen, of je check-in doen. Elke stap is een link naar het relevante onderdeel — zo weet je altijd wat je nog kunt aanvullen.
              <br /><br />
              <strong>Voortgang:</strong> de banner toont hoeveel stappen je hebt voltooid en welke nog open staan. Zodra je alle kerngegevens hebt ingevuld, kun je de invulfase afsluiten via de sluitknop op de banner. De invulfase is volledig <strong>optioneel</strong> — je kunt hem op elk moment wegklikken en later terugkomen.
            </>
          }
          howTo={{
            steps: [
              "Na de onboarding verschijnt de invulfase-banner automatisch bovenaan je pagina\u2019s",
              "Volg de aanbevolen volgende stap — elke stap linkt direct naar het juiste onderdeel (transacties importeren, budgetten, doelen, etc.)",
              "De voortgangsindicator toont hoeveel stappen je hebt voltooid",
              "Sluit de invulfase af via de \u00d7-knop als je klaar bent of later wilt verdergaan",
              "Je kunt altijd data aanvullen via de reguliere pagina\u2019s, ook na het afsluiten van de invulfase",
            ],
            tip: "Neem de tijd voor de invulfase. Elke extra datapunt maakt je berekeningen nauwkeuriger \u2014 van FIRE-projectie tot budgetinzichten. Begin met transacties importeren, dat levert de meeste inzichten op.",
          }}
        />

        <GuideTopicCard
          icon={Settings}
          title="Profiel & Instellingen"
          color="var(--ink-2)"
          valueText="Jouw data is van jou. Je bepaalt wat je invoert, wie het ziet, en wanneer je het verwijdert. Volledige controle, altijd."
          description={
            <>
              Je profiel bevat de persoonlijke gegevens die de basis vormen voor
              alle berekeningen in TriFinity: <strong>naam</strong>,{" "}
              <strong>geboortedatum</strong>,{" "}
              <strong>pensioenleeftijd</strong>, <strong>inkomen</strong> en{" "}
              <strong>huishoudtype</strong>. Deze gegevens bepalen je
              vrijheidstijdberekeningen, FIRE-prognoses (FIRE-leeftijd,
              pensioen-AOW) en FIRE-parameters.
              <br />
              <br />
              <strong>Profielgegevens</strong> \u2014 Ga naar Identiteit \u2192
              Profiel om je persoonlijke info en huishoudprofiel te beheren. Je
              geboortedatum en pensioenleeftijd zijn de benchmark waartegen je
              FIRE-projectie wordt berekend.
              <br />
              <br />
              Je{" "}
              <strong>actieve modules</strong> bepalen welke functies en widgets je ziet.
              Ga naar Instellingen om modules in of uit te schakelen. Start met
              budgetteren of vermogensregistratie als basis en breid uit wanneer je er klaar voor bent.
              <br />
              <br />
              <strong>Data-eigenaarschap</strong> \u2014 TriFinity respecteert je
              data volledig. Je kunt op elk moment al je gegevens{" "}
              <strong>exporteren</strong> als bestand \u2014 transacties, budgetten,
              vermogen, doelen, alles. Je bezit je eigen financi\u00eble
              geschiedenis.
              <br />
              <br />
              <strong>Account verwijderen</strong> \u2014 Wil je stoppen? Verwijder
              je account via Instellingen \u2192 Gegevens en al je data wordt
              permanent gewist. Geen verborgen kopie\u00ebn, geen schaduw-archieven.
              Jouw data, jouw keuze.
            </>
          }
          howTo={{
            steps: [
              "Ga naar Identiteit \u2192 Profiel om je persoonlijke gegevens te bekijken en bewerken",
              "Vul je naam, geboortedatum en geschat maandelijks inkomen in \u2014 deze sturen al je berekeningen",
              "Stel je gewenste pensioenleeftijd in \u2014 dit is de benchmark voor je FIRE-projectie",
              "Bekijk je actieve modules en schakel nieuwe modules in wanneer je daar behoefte aan hebt",
              "Exporteer al je data als bestand via Instellingen \u2192 Gegevens \u2014 je bezit je eigen geschiedenis",
              "Account verwijderen: via Instellingen \u2192 Gegevens wordt al je data permanent gewist",
            ],
            tip: "Controleer je profielgegevens en FIRE-parameters minstens jaarlijks. Je geboortedatum en pensioenleeftijd bepalen je hele FIRE-tijdlijn.",
          }}
        />

        <GuideTopicCard
          icon={SlidersHorizontal}
          title="App instellingen"
          color="var(--ink-2)"
          description={
            <>
              <strong>
                Maak TriFinity helemaal van jou. Van de kleuren tot de
                berekeningen \u2014 alles is aanpasbaar.
              </strong>{" "}
              Ga naar Identiteit \u2192 Instellingen voor zes secties met alle
              configuratiemogelijkheden op \u00e9\u00e9n pagina.
              <br />
              <br />
              <strong>A) Notificaties</strong>: kies welke meldingen je wilt
              ontvangen \u2014 budgetwaarschuwingen, mijlpalen, AI-inzichten en
              sync-updates. Per type aan of uit. Stel apart in voor
              partner-transacties en check-in reminders.
              <br />
              <br />
              <strong>B) Widgets</strong>: schakel widgets aan of uit, kies het
              formaat (mini, quarter, half of full) en bepaal de volgorde op je
              De Wil-pagina. Ontdek nieuwe widgets door extra modules in te schakelen.
              <br />
              <br />
              <strong>C) FIRE-parameters</strong>: stel je verwacht rendement in
              (standaard 7%) en inflatie (standaard 2%). Deze twee percentages
              bepalen al je FIRE-berekeningen, projecties en scenario&apos;s.
              Kies je onttrekkingsstrategie: eeuwig kapitaal behouden
              (perpetual), nalatenschap achterlaten (legacy) of vermogen
              opgebruiken (deplete). Configureer ook de Box 3-methode en
              retirement expense method.
              <br />
              <br />
              <strong>D) Weergave</strong>: kies een typografisch thema
              (Editorial, Andada of Digital). Pas de kleuren van elke module aan
              \u2014 Kern, Wil en Horizon \u2014 met voorgedefinieerde paletten of eigen
              kleuren. Stel kleuren in per budgetcategorie en per module.
              <br />
              <br />
              <strong>E) Gegevens</strong>: beheer je profiel, exporteer al je
              data als JSON of verwijder je account. Volledige controle over je
              eigen gegevens.
              <br />
              <br />
              <strong>F) Privacy &amp; AI</strong>: schakel Will en alle
              AI-features aan of uit via \u00e9\u00e9n toggle. Stel
              huishoud-privacyvoorkeuren in \u2014 bepaal wat je partner kan zien.
            </>
          }
          howTo={{
            steps: [
              "Ga naar Identiteit \u2192 Instellingen. Zes secties met alle configuratiemogelijkheden",
              "FIRE-parameters (C): stel je verwacht rendement in (standaard 7%) en inflatie (standaard 2%). Deze percentages bepalen al je FIRE-berekeningen. Kies je onttrekkingsstrategie (perpetual/legacy/deplete)",
              "Weergave (D): kies een typografisch thema (Editorial, Andada of Digital). Pas de kleuren van elke module aan (Kern, Wil, Horizon). Kies kleuren per budgetcategorie",
              "Widgets (B): schakel widgets aan of uit, kies het formaat (mini/quarter/half/full), en bepaal de volgorde op je De Wil-pagina",
              "Notificaties (A): kies welke meldingen je wilt ontvangen: budgetwaarschuwingen, mijlpalen, AI-inzichten, sync-updates. Stel apart in voor partner-transacties",
              "AI (F): schakel Will en AI-features aan of uit via \u00e9\u00e9n toggle",
              "Gegevens (E): exporteer al je data of verwijder je account",
            ],
            tip: "Begin met de FIRE-parameters \u2014 die hebben de grootste impact op al je berekeningen. Een verschil van 1% rendement kan je FIRE-datum jaren verschuiven.",
          }}
        />

        <GuideTopicCard
          icon={Users}
          title="Huishouden & Partner"
          color="var(--ink-2)"
          valueText="Financiële vrijheid bereik je samen. TriFinity ondersteunt elke verdeling — van volledig gezamenlijk tot gescheiden met gedeeld zicht."
          description={
            <>
              Nodig je partner uit via Identiteit → Profiel →
              Huishouden en beheer jullie financiën samen, met respect voor
              ieders privacy.
              <br />
              <br />
              <strong>Verdeling</strong> — Kies hoe jullie kosten
              verdelen: gelijk (50/50), naar inkomen (wie meer verdient betaalt
              meer), handmatig (zelf percentages instellen), of één
              draagt alles. De gekozen split-mode geldt voor alle gedeelde
              uitgaven en wordt automatisch doorberekend.
              <br />
              <br />
              <strong>Privacy per categorie</strong> — Per categorie
              (vermogen, schulden, budgetten, transacties, inkomen) kies je wat
              je partner ziet: alles (full), alleen totalen (totals) of niets
              (hidden). Persoonlijk blijft altijd persoonlijk.
              <br />
              <br />
              <strong>Eigenaarschap</strong> — Elke rekening, asset of
              schuld markeer je als &lsquo;persoonlijk&rsquo; of
              &lsquo;gedeeld&rsquo;. Persoonlijke items zijn alleen voor jou
              zichtbaar; gedeelde items tellen mee in het huishoudoverzicht en
              de gezamenlijke vrijheidstijd.
              <br />
              <br />
              <strong>Gezamenlijke FIRE-projectie</strong> — De Horizon
              berekent jullie gezamenlijke pad naar financiële vrijheid met
              twee inkomens, gedeelde uitgaven en gecombineerd vermogen —
              één vrijheidsdatum voor het hele huishouden.
              <br />
              <br />
              <strong>Meldingen</strong> — Stel in of je meldingen krijgt
              over je partners transacties: altijd (all_shared), boven een
              drempelbedrag (threshold), per categorie (categories), of nooit
              (disabled). Zo houd je samen overzicht zonder elkaars privacy te
              schenden.
              <br />
              <br />
              <strong>Widgets</strong> — Twee huishoud-widgets op het
              dashboard: <em>huishouden_vergelijking</em> (wie draagt wat bij) en{" "}
              <em>huishouden_activiteit</em> (recente gedeelde transacties en
              activiteit).
            </>
          }
          howTo={{
            steps: [
              "Ga naar Identiteit \u2192 Profiel \u2192 Huishouden en nodig je partner uit via e-mailadres",
              "Je partner ontvangt een uitnodigingslink en maakt een eigen account aan",
              "Kies de kostenverdeling: gelijk (50/50), naar inkomen, handmatig percentage, of \u00e9\u00e9n draagt alles",
              "Markeer rekeningen, bezittingen en schulden als persoonlijk of gedeeld \u2014 dit bepaalt wat meetelt in het huishoudoverzicht",
              "Configureer per categorie (vermogen, schulden, budgetten, transacties, inkomen) het privacyniveau: volledig, totalen of verborgen",
              "Stel partner-meldingen in: altijd, boven een drempel, per categorie, of nooit",
              "Bekijk de gezamenlijke FIRE-projectie op De Horizon \u2014 twee inkomens, gedeelde uitgaven, \u00e9\u00e9n vrijheidsdatum",
            ],
            tip: "Bespreek samen welk privacyniveau jullie prettig vinden voordat je het instelt. Begin met \u2018totalen\u2019 delen en breid uit als het vertrouwen groeit.",
          }}
        />

        <GuideTopicCard
          icon={Smartphone}
          title="Mobiel"
          color="var(--ink-2)"
          description={
            <>
              <strong>
                Je financiën altijd bij de hand. TriFinity werkt volledig op je
                telefoon — geen app store nodig, gewoon installeren vanuit je
                browser.
              </strong>{" "}
              TriFinity is een{" "}
              <strong>Progressive Web App (PWA)</strong>: installeerbaar op je
              telefoon zonder app store. Open de app in je mobiele browser, voeg
              toe aan je startscherm en je hebt een volwaardige app met
              fullscreen modus en snelle laadtijden.
              {" "}
              Het <strong>responsive design</strong> schaalt automatisch: widgets
              passen zich aan naar kleiner formaat op mobiel. Full-widgets worden
              half, quarter-widgets worden mini. Het 4-koloms grid op desktop
              wordt 1- of 2-koloms op mobiel, grafieken worden compacter en
              tabellen scrollen horizontaal.
              {" "}
              Alle interacties zijn <strong>touch-geoptimaliseerd</strong>: tik
              op bedragen voor kassabon-details via BottomSheets die van onderen
              omhoog schuiven. Veeg door grafieken. Sleep widgets naar een nieuwe
              positie via drag &amp; drop. Alle touch targets zijn minimaal 44px.
              {" "}
              <strong>Alles beschikbaar:</strong> importeren, check-in,
              Will-chat, scenario&apos;s — alles werkt op mobiel. De layout past
              zich aan, de functionaliteit niet. De bottom navigation geeft met
              één tik toegang tot De Kern, De Wil en De Horizon —
              kleurgecodeerd per module.
            </>
          }
          howTo={{
            steps: [
              "Installeren \u2014 Open TriFinity in je mobiele browser. Tik op \u2018Toevoegen aan startscherm\u2019 (iOS: deel-knop \u2192 Zet op beginscherm. Android: menu \u2192 Installeren). De app opent voortaan als volwaardige app.",
              "Widgets op mobiel \u2014 Widgets schalen automatisch naar een kleiner formaat. Je kunt de volgorde ook op mobiel aanpassen via drag & drop (lang ingedrukt houden en verslepen).",
              "Touch \u2014 Tik op bedragen voor kassabon-details (BottomSheet). Veeg door grafieken. Sleep widgets naar een nieuwe positie.",
              "Alles beschikbaar \u2014 Importeren, check-in, Will-chat, scenario\u2019s \u2014 alles werkt op mobiel. De layout past zich aan, de functionaliteit niet.",
            ],
            tip: "Installeer TriFinity als PWA op je startscherm \u2014 je krijgt dan een app-icoon, fullscreen modus en snellere laadtijden. Check elke ochtend je briefing terwijl je koffie drinkt.",
          }}
        />
      </div>

      {/* ── Naslagwerk (module-based topic index) ── */}
      <GuideNaslagwerk />

      {/* ── 4. Kernconcepten ── */}
      <ConceptFlipCards />

      {/* ── 5. Veelgestelde vragen ── */}
      <GuideFaq />

      {/* ── 6. Ontdekken sectie ── */}
      <OntdekkenSection />

      {/* ── 7. Pro tips carrousel ── */}
      <GuideProTips />
    </div>
  );
}
