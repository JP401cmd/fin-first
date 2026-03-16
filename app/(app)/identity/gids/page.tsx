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
    sovereigntyLevel: number;
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
          subtitle="Breng al je bezittingen, schulden en rekeningen samen op één plek"
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
            title="Cash rekeningen"
            color="var(--color-kern-400)"
            description={
              <>
                Koppel je bankrekeningen via <strong>TrueLayer</strong> voor automatische synchronisatie, of importeer transacties handmatig via <strong>MT940, CSV of OFX</strong>. Zodra je transacties binnenkomen, categoriseert de AI ze automatisch met een <strong>betrouwbaarheidsscore</strong> — zodat je ziet hoe zeker de toewijzing is.
                {' '}
                <strong>Duplicaatdetectie</strong> voorkomt dubbele boekingen bij herhaalde imports. <strong>Transfer matching</strong> herkent overboekingen tussen eigen rekeningen en filtert ze uit je uitgavenanalyse. Stel <strong>tegenpartijregels</strong> in zodat toekomstige transacties van dezelfde betaler automatisch in de juiste categorie landen. Het resultaat: een compleet, opgeschoond kasoverzicht — de basis voor al je budgetten en patronen.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Kern → Cash en voeg je betaal- en spaarrekeningen toe",
                "Koppel via TrueLayer voor automatisch bijwerken, of importeer een MT940/CSV/OFX bestand",
                "Controleer de AI-categorisatie — accepteer suggesties of wijs handmatig toe",
                "Stel tegenpartijregels in voor terugkerende betalingen (bijv. Albert Heijn → Boodschappen)",
                "Bekijk je Sankey-diagram om in één oogopslag te zien waar je vrijheidstijd naartoe stroomt",
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
                Registreer al je bezittingen over <strong>13 types</strong>: spaargeld, beleggingen, crypto, vastgoed, eigen woning, pensioenfondsen, lijfrente, levensverzekeringen, deelnemingen, vorderingen, DGA-leningen, opties en overig. Elk type heeft eigen velden, waarderingslogica en fiscale classificatie. Per bezitting zie je niet alleen de huidige waarde, maar ook hoeveel <strong>vrijheidstijd</strong> die vertegenwoordigt.
                {' '}
                Op de <strong>holdings-pagina</strong> volg je individuele posities met actuele koersen, rendement per periode en portfolio-allocatie. Vergelijk je rendement met een <strong>benchmark</strong> om te zien of je de markt bijhoudt. <strong>Dividendtracking</strong> toont je passief inkomen per bezitting. Voer periodiek een <strong>herwaardering</strong> uit om je vastgoed en overige bezittingen actueel te houden — je ziet direct het effect op je nettovermogen en vrijheidstijd.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Kern → Bezittingen en voeg je eerste bezitting toe (bijv. beleggingsrekening)",
                "Kies het juiste type — elk type heeft eigen velden zoals ISIN, rendement, of WOZ-waarde",
                "Voeg holdings toe aan je beleggingsrekening om individuele posities te volgen",
                "Vergelijk je rendement met de benchmark op de holdings-pagina",
                "Werk waarderingen periodiek bij via herwaardering — vooral voor vastgoed en overige bezittingen",
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
                Beheer <strong>11 schuldtypes</strong>: hypotheek, studieschuld, persoonlijke lening, creditcard, doorlopend krediet, zakelijke lening, familielening, belastingschuld, private lease, telefoonabonnement en overig. Elk type heeft eigen renteberekening, looptijd en fiscale behandeling. <strong>NHG-hypotheken</strong> en <strong>belastingaftrek</strong> worden automatisch meegenomen in je nettolastenberekening.
                {' '}
                Vergelijk twee <strong>aflossingsstrategieën</strong>: sneeuwbal (kleinste schuld eerst, motiverend) versus lawine (hoogste rente eerst, goedkoopst). Simuleer het effect van <strong>extra aflossingen</strong> en zie direct hoeveel sneller je schuldenvrij bent — uitgedrukt in teruggewonnen vrijheidstijd. Bij een huishouden verdeelt TriFinity schulden automatisch over <strong>partners</strong> op basis van de eigendomsverhouding.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Kern → Schulden en voeg je schulden toe (hypotheek, studielening, etc.)",
                "Vul rente, looptijd en maandlast in — NHG en belastingaftrek worden automatisch berekend",
                "Vergelijk sneeuwbal vs. lawine in het strategiescherm om de optimale aflosvolgorde te vinden",
                "Simuleer extra aflossingen en zie hoeveel vrijheidstijd je terugwint",
                "Bij een huishouden: stel de eigendomsverhouding in per schuld voor een correcte partnerverdeling",
              ],
              tip: "Focus op schulden met de hoogste rente boven 4% — elke euro extra aflossing levert daar het meeste vrijheidstijd op.",
            }}
          />

          <GuideTopicCard
            icon={BarChart3}
            title="Netto vermogen"
            color="var(--color-kern-400)"
            description={
              <>
                Je nettovermogen is je totale bezittingen minus je schulden — het fundament van je
                financiële vrijheid. TriFinity maakt automatisch snapshots van je vermogensontwikkeling,
                zodat je over maanden en jaren kunt terugkijken hoe je groeit. Per snapshot zie je niet
                alleen het bedrag, maar ook je vrijheidspercentage, spaarquote, veerkrachtscore en
                geschatte FIRE-leeftijd.
                <br />
                <br />
                De compositie-analyse laat zien hoe je vermogen is opgebouwd: hoeveel zit in spaargeld
                versus beleggingen, hoeveel in vastgoed versus pensioen. Zo ontdek je of je vermogen
                goed gespreid is of te afhankelijk van één pijler.
              </>
            }
            howTo={{
              steps: [
                "Je nettovermogen wordt automatisch berekend zodra je bezittingen en schulden hebt toegevoegd",
                "Bij elke herwaardering maakt TriFinity een balanssnapshot per bezitting en schuld",
                "Bekijk de vermogensgrafiek op De Kern voor je netto vermogen over tijd",
                "Vergelijk periodes om trends te ontdekken in je vermogensgroei",
              ],
              tip: "De maandelijkse check-in is het ideale moment om je vermogen bij te werken en je voortgang te zien.",
            }}
          />
        </ReisStapSection>

        {/* ── Stap 2: Begrijp je patronen ── */}
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
          ctaHref={progress?.steps.hasTransactions ? "/core/cash" : "/core/cash/import"}
          isComplete={!!progress?.steps.hasTransactions}
        >
          <GuideTopicCard
            icon={PieChart}
            title="Budgetteren"
            color="var(--color-kern-400)"
            description={
              <>
                Ontdek waar je levenstijd naartoe stroomt. TriFinity verdeelt je uitgaven over <strong>6 hoofdcategorieën en 24 subcategorieën</strong> met vijf budgettypes (inkomsten, uitgaven, sparen, schulden, verborgen). Elke categorie markeer je als <strong>essentieel of niet-essentieel</strong> — dat bepaalt rechtstreeks je FIRE-berekening. Drie weergaven geven inzicht: <strong>boomstructuur</strong> met voortgangsbalken, <strong>donutgrafiek</strong> voor verdeling, en <strong>sparklines</strong> voor 6-maanden trends. Tik op een categorie voor het <strong>kassabon</strong>-detail en zie je maandrapport in gewonnen of verloren <strong>vrijheidsdagen</strong>. Budgetteren is volledig optioneel — vul alleen je geschatte maanduitgaven in en TriFinity doet de rest.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Kern → Budgetten — je standaardplan staat klaar met 6 categorieën",
                "Pas limieten aan per categorie en kies interval (maand, kwartaal, jaar) en overschotgedrag (reset, doorschuiven of beleggen)",
                "Markeer elke categorie als essentieel of niet-essentieel — dit beïnvloedt je FIRE-berekening direct",
                "Na transactie-import worden uitgaven automatisch gekoppeld via AI-categorisatie",
                "Bekijk je voortgang in boom-, donut- of sparkline-weergave en tik op een categorie voor de kassabon-details",
              ],
              tip: "Begin simpel — pas alleen de limieten aan van je top-5 uitgavencategorieën. De rest verfijn je later.",
            }}
          />

          <GuideTopicCard
            icon={FileText}
            title="Belasting"
            color="var(--color-kern-400)"
            description={
              <>
                Zie in één oogopslag hoeveel vrijheidstijd de fiscus kost. TriFinity berekent automatisch je <strong>Box 3</strong> vermogensrendementsheffing met het juiste forfait per vermogenstype — <strong>spaargeld</strong> (lager forfait) versus <strong>beleggingen</strong> (hoger forfait) — en verrekent schulden boven de drempel. Heb je een partner? De <strong>partneroptimalisatie</strong> berekent de fiscaal voordeligste verdeling van jullie gezamenlijke grondslag. Vergelijk <strong>twee belastingjaren</strong> naast elkaar en gebruik het <strong>scenariomodel</strong> om te zien wat er verandert als je vermogen groeit. Voor DGA&apos;s berekent TriFinity ook <strong>Box 2</strong>: aanmerkelijk belang, dividenduitkeringen en de wet excessief lenen bij een eigen BV.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Kern → Belasting — je Box 3 wordt automatisch berekend op basis van je geregistreerde bezittingen en schulden",
                "Controleer de classificatie: spaargeld, beleggingen en vrijgestelde bezittingen worden automatisch ingedeeld",
                "Wissel tussen belastingjaren (2025/2026) om het verschil in forfaittarieven te zien",
                "Activeer \"Partner\" om de optimale verdeling van de grondslag te berekenen — dat kan honderden euro's schelen",
                "Open het scenariomodel om te simuleren wat er verandert bij meer spaargeld, meer beleggingen of hogere schulden",
              ],
              tip: "Check je belastingpagina na elke grote vermogenswijziging — een verschuiving van spaargeld naar beleggingen kan je belastingdruk flink veranderen.",
            }}
          />
        </ReisStapSection>

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
            icon={LayoutDashboard}
            title="Widgets op De Wil"
            color="var(--color-wil-400)"
            description={
              <>
                De Wil is je persoonlijke commandocentrum — geen los dashboard, maar de plek waar inzicht overgaat in actie. De bovenste helft bestaat uit meer dan <strong>26 widgets</strong>: compacte kaarten die je financiële situatie in real-time samenvatten. Van netto vermogen en vrijheidsdagen tot sparklines, budgetbalken en FIRE-prognoses. Daaronder vind je het actiecentrum: <strong>Inzicht → Actie → Resultaat</strong>.
                {' '}
                Bovenaan De Wil schakel je met de <strong>DAIshboard-toggle</strong> naar een AI-samengestelde briefing met tot 23 kaarttypes. Widgets komen in formaten van mini tot volledig en je <strong>soevereiniteitsniveau</strong> bepaalt welke beschikbaar zijn — hogere niveaus ontgrendelen geavanceerde inzichten zoals backtesting en scenarioanalyse. De volgorde pas je aan via <strong>drag-and-drop</strong> en je voorkeuren worden opgeslagen in je profiel.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Wil — je widgets staan bovenaan de pagina",
                "Wissel naar DAIshboard-modus via de toggle voor een AI-samengestelde briefing",
                "Ga naar Identiteit → Instellingen → Widgets om widgets aan/uit te zetten en de volgorde aan te passen",
                "Nieuwe widgets ontgrendelen automatisch bij een hoger soevereiniteitsniveau",
              ],
              tip: "Begin met de standaard 7 widgets. Voeg pas meer toe als je weet welke inzichten je dagelijks wilt zien.",
            }}
          />
        </ReisStapSection>

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
          valueSentence="Zie je toekomst in drie scenario's — en kies welk pad je wilt bewandelen."
          ctaLabel="Bekijk je prognose"
          ctaHref="/horizon"
          isComplete={!!progress?.steps.hasFireData && !!progress?.steps.hasLifeEvents}
        />

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
        />
      </div>

      {/* ── Overal ── */}
      <p className="label-editorial mb-3 text-[var(--ink-3)]">Overal</p>
      <div className="mb-6 grid grid-cols-1 gap-2 sm:mb-8 lg:grid-cols-2">
        <GuideTopicCard
          icon={RefreshCw}
          title="Check-in"
          color="var(--ink-2)"
          description={
            <>
              Eén keer per maand neem je 10 minuten voor je financiële gezondheid. De check-in is een 7-stappen wizard: terugblik op vorige maand (vermogenswijziging, inkomsten, uitgaven, gewonnen vrijheidsdagen), bezittingen bijwerken, schulden bijwerken, doelen checken, budgetten evalueren, vooruitblik op komende maand, en een moment voor reflectie met vrije notities.
              {' '}
              Will bereidt gespreksstarters voor op basis van je recente financiële veranderingen — ideaal als startpunt voor reflectie of een gesprek met je partner. Je kunt eerdere check-ins terugbladeren om je groei over maanden te zien.
            </>
          }
          howTo={{
            steps: [
              'Ga naar De Kern → Check-in (of volg de herinnering in je meldingen)',
              'Stap 1: Bekijk de terugblik — vergelijk vorige maand met nu',
              'Stap 2-5: Werk bezittingen, schulden, doelen en budgetten bij',
              'Stap 6: Bekijk de vooruitblik met komende rekeningen en events',
              'Stap 7: Schrijf een korte reflectie — wat ging goed, wat kan beter?',
            ],
            tip: 'Plan je check-in op een vaste dag (bijv. de eerste zondag van de maand). Routine maakt het moeiteloos.',
          }}
        />

        <GuideTopicCard
          icon={Bell}
          title="Meldingen"
          color="var(--ink-2)"
          description={
            <>
              TriFinity stuurt je meldingen wanneer het ertoe doet: budgetgrenzen die naderen, ongebruikelijke transacties, vermogensmijlpalen die je bereikt, level-ups in je soevereiniteit, en aanbevelingen die klaarstaan. Urgente alerts verschijnen bovenaan, dagelijkse meldingen daaronder, en eerdere meldingen zijn per dag terug te bladeren. Per type kun je meldingen aan of uitzetten.
            </>
          }
          howTo={{
            steps: [
              'Meldingen verschijnen via het bel-icoon in de navigatiebalk',
              'Tik op een melding om naar het relevante onderdeel te gaan',
              'Beheer je meldingsvoorkeuren via Identiteit → Instellingen → Notificaties',
            ],
            tip: 'Laat budgetalerts en mijlpalen aan staan — ze houden je gemotiveerd zonder overweldigd te raken.',
          }}
        />

        <GuideTopicCard
          icon={FileText}
          title="Rapporten"
          color="var(--ink-2)"
          description={
            <>
              Vertaal je financiële data naar leesbare rapporten die je kunt bewaren en terugbladeren. Drie rapporttypes geven je overzicht vanuit verschillende invalshoeken: een <strong>perioderapport</strong> vat je inkomsten, uitgaven en vermogensverandering samen over een maand, kwartaal of jaar. Het <strong>balansrapport</strong> toont al je bezittingen en schulden op één peildatum — je vermogen uitgedrukt in vrijheidstijd. En het <strong>budgetrapport</strong> laat zien hoe je werkelijke uitgaven zich verhouden tot je budgetgrenzen per categorie.
              {' '}
              Elk rapport begint met een AI-inleiding: Will schrijft een korte, persoonlijke samenvatting van de belangrijkste bevindingen. Eenmaal gegenereerd kun je rapporten opslaan en later terugvinden op je rapportages-overzichtspagina.
            </>
          }
          howTo={{
            steps: [
              'Ga naar Rapportages via het profielmenu of de navigatie',
              'Kies je rapporttype (periode, balans of budget) en selecteer de gewenste periode',
              'Genereer het rapport — Will schrijft automatisch een persoonlijke inleiding',
              'Bewaar het rapport om het later terug te lezen of te vergelijken met eerdere periodes',
            ],
            tip: 'Genereer na elke maandelijkse check-in een perioderapport. Zo bouw je een financieel archief op dat je groei over maanden en jaren zichtbaar maakt.',
          }}
        />
      </div>

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
