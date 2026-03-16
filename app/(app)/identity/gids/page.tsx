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
                Je bankrekeningen zijn het fundament. Elke euro die binnenkomt of vertrekt vertelt een verhaal over waar je tijd naartoe gaat.
                <br /><br />
                Voeg je <strong>betaal-, spaar-, gezamenlijke, bedrijfs- of overige rekeningen</strong> toe en houd je saldo actueel. Koppel je bank via <strong>TrueLayer</strong> voor automatische synchronisatie (max 10× per dag), of importeer transacties handmatig via de <strong>4-staps import-wizard</strong>: bestand selecteren (MT940, CSV of OFX), rekening kiezen, transacties reviewen en importeren. CSV-presets voor <strong>ING, Rabobank, ABN AMRO en PayPal</strong> worden automatisch herkend.
                <br /><br />
                Zodra je transacties binnenkomen, worden ze automatisch gecategoriseerd via drie methoden: (1) <strong>eerdere correcties</strong> (hoogste prioriteit), (2) <strong>keyword-herkenning</strong> (47 regels voor salaris, boodschappen, energie, etc.) en (3) <strong>AI-categorisatie</strong> voor onbekende transacties. Elke handmatige correctie wordt opgeslagen als regel en automatisch toegepast bij toekomstige imports — zo wordt het systeem steeds slimmer.
                <br /><br />
                <strong>Duplicaatdetectie</strong> via SHA-256 hash voorkomt dubbele boekingen. <strong>Eigen overboekingen</strong> tussen je rekeningen worden automatisch herkend en gekoppeld, zodat ze niet dubbel tellen in je budget. Het resultaat: een compleet, opgeschoond kasoverzicht als basis voor al je budgetten en vrijheidsberekeningen.
              </>
            }
            howTo={{
              steps: [
                "Rekening toevoegen: Ga naar De Kern → Cash → Nieuwe rekening. Kies het type (betaal, spaar, gezamenlijk, bedrijf of overig), voer IBAN en startsaldo in",
                "Transacties importeren: Ga naar Cash → Importeren. Sleep je bankbestand (MT940, CSV of OFX) in het uploadveld — de app herkent automatisch het formaat en je bank (ING, Rabobank, ABN AMRO, PayPal)",
                "Controleer de transacties in de review-stap, pas categorieën aan waar nodig, en importeer",
                "Bankconnectie: Koppel je bank via De Kern → Cash → Verbinden. Je wordt doorgestuurd naar je bank voor toestemming, daarna synchroniseren transacties automatisch",
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
                Registreer bezittingen over <strong>11 types</strong>: cash, spaarrekening, belegging (ETF/indexfonds/aandelen/obligaties), pensioen (uitkerings-/premieregeling/lijfrente), vastgoed, crypto, voertuig, fysiek bezit, deelneming, levensverzekering en vordering. Elk type heeft eigen velden, waarderingslogica en fiscale classificatie.
                <br /><br />
                Binnen beleggingen kun je <strong>individuele holdings</strong> toevoegen met naam, ticker of ISIN, aantal stuks en aankoopprijs. Registreer <strong>koop-, verkoop- en dividendtransacties</strong> voor nauwkeurig rendement per positie. Importeer je posities in bulk via <strong>broker-import</strong>: upload een CSV van <strong>DEGIRO, Saxo Bank of ING Beleggen</strong> — de app herkent je broker automatisch aan de kolomkoppen en importeert posities en transacties.
                <br /><br />
                Twee views geven je overzicht: het <strong>Vermogen-overzicht</strong> toont al je bezittingen per type, terwijl het <strong>Holdings-overzicht</strong> je totale beleggingsportfolio toont met allocatie-donut, rendement en dividendhistorie. Update waardes handmatig of via de <strong>maandelijkse check-in</strong> — elke waardering wordt opgeslagen als snapshot voor historisch verloop. Markeer een holding als <strong>favoriet</strong> en volg hem als widget op je dashboard.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Kern → Vermogen → Nieuw. Kies het type (belegging, vastgoed, crypto, etc.), geef een naam en huidige waarde op. Stel het risicoprofiel in (laag/middel/hoog).",
                "Bij beleggingen: voeg individuele holdings toe met naam, ticker/ISIN, aantal stuks en aankoopprijs. Registreer koop-, verkoop- en dividendtransacties voor nauwkeurig rendement.",
                "Of importeer in bulk: ga naar Vermogen → Holdings → Importeren. Upload je CSV-export van DEGIRO, Saxo Bank of ING Beleggen — de app herkent je broker automatisch.",
                "Het Vermogen-overzicht toont al je bezittingen per type. Het Holdings-overzicht toont je totale beleggingsportfolio met allocatie (donut), rendement en dividendhistorie.",
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
                Beheer <strong>11 schuldtypes</strong>: hypotheek, studieschuld, persoonlijke lening, creditcard, doorlopend krediet, zakelijke lening, familielening, belastingschuld, private lease, telefoonabonnement en overig. Elk type heeft eigen renteberekening, looptijd en fiscale behandeling. <strong>NHG-hypotheken</strong> en <strong>belastingaftrek</strong> worden automatisch meegenomen in je nettolastenberekening.
                {' '}
                Vergelijk twee <strong>aflossingsstrategieën</strong>: sneeuwbal (kleinste schuld eerst, motiverend) versus lawine (hoogste rente eerst, goedkoopst). Simuleer het effect van <strong>extra aflossingen</strong> en zie direct hoeveel sneller je schuldenvrij bent — uitgedrukt in teruggewonnen vrijheidstijd. Elke afgeloste schuld verhoogt je <strong>netto vermogen</strong> en verschuift je <strong>FIRE-datum</strong> naar voren: minder vaste lasten betekent een lagere jaarlijkse uitgavendrempel en dus eerder financiële vrijheid. Bij een huishouden verdeelt TriFinity schulden automatisch over <strong>partners</strong> op basis van de eigendomsverhouding.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Kern → Schulden en voeg je schulden toe (hypotheek, studielening, etc.)",
                "Vul rente, looptijd en maandlast in — NHG en belastingaftrek worden automatisch berekend",
                "Vergelijk sneeuwbal vs. lawine in het strategiescherm om de optimale aflosvolgorde te vinden",
                "Simuleer extra aflossingen en zie hoeveel vrijheidstijd je terugwint",
                "Bekijk het effect op je netto vermogen en FIRE-datum — minder schuld = lagere uitgaven = eerder vrij",
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
                Je nettovermogen is je totale financiële positie in één getal:{" "}
                <strong>bezittingen minus schulden</strong>. Het is het fundament van je financiële
                vrijheid — elke euro netto vermogen staat voor opgeslagen levenstijd. TriFinity
                maakt automatisch snapshots van je vermogensontwikkeling, zodat je over maanden en
                jaren kunt terugkijken hoe je groeit. Per snapshot zie je niet alleen het bedrag,
                maar ook je vrijheidspercentage, spaarquote, veerkrachtscore en geschatte
                FIRE-leeftijd.
                <br />
                <br />
                De <strong>vermogensgrafiek</strong> toont je historisch verloop met maandelijkse
                datapunten — zo zie je seizoenspatronen, dips en groeiversnellingen in één
                oogopslag. De <strong>samenstelling</strong> laat zien hoe je vermogen is opgebouwd:
                cash (betaal- en spaarrekeningen) + beleggingen + vastgoed + pensioen − schulden =
                nettovermogen. Zo ontdek je of je vermogen goed gespreid is of te afhankelijk van
                één pijler.
                <br />
                <br />
                Bij elke nieuwe piek detecteert TriFinity automatisch een{" "}
                <strong>mijlpaal</strong> — een nieuw vermogensrecord. Deze mijlpalen verschijnen
                in je tijdlijn en meldingen, zodat je ziet wanneer je een nieuw hoogterecord
                bereikt en hoe lang het duurde om daar te komen.
              </>
            }
            howTo={{
              steps: [
                "Je nettovermogen wordt automatisch berekend zodra je bezittingen en schulden hebt toegevoegd",
                "Bij elke herwaardering maakt TriFinity een balanssnapshot — je ziet het bedrag, de samenstelling en je vrijheidstijd",
                "Bekijk de vermogensgrafiek op De Kern voor je historisch verloop met maandelijkse snapshots",
                "Analyseer de samenstelling: hoeveel zit in cash, beleggingen, vastgoed en pensioen versus schulden",
                "Vergelijk periodes om trends te ontdekken — mijlpalen markeren automatisch nieuwe vermogensrecords",
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
                Een budget is geen beperking — het is een spiegel. Je ziet waar je tijd naartoe gaat, zodat je bewust kunt kiezen waar je vrijheid groeit.
                <br /><br />
                TriFinity verdeelt je uitgaven over <strong>6 hoofdcategorieën en 24 subcategorieën</strong> met vijf budgettypes (inkomsten, uitgaven, sparen, schulden, verborgen). Per categorie kies je een <strong>doeltype</strong>: vast bedrag, percentage van inkomen of flexibel — zo past je plan bij jouw situatie. Elke categorie markeer je als <strong>essentieel of niet-essentieel</strong>, wat rechtstreeks je FIRE-berekening bepaalt.
                <br /><br />
                Drie weergaven geven inzicht: <strong>boomstructuur</strong> met voortgangsbalken, <strong>donutgrafiek</strong> voor verdeling, en <strong>sparklines</strong> voor 6-maanden trends. De <strong>maand-op-maand vergelijking</strong> toont hoe je bestedingspatroon verschuift. Tik op een categorie voor het <strong>kassabon</strong>-detail met elke transactie en zie je maandrapport in gewonnen of verloren <strong>vrijheidsdagen</strong>.
                <br /><br />
                Favoriete budgetten pin je als <strong>widget op je dashboard</strong> in 4 formaten (mini, quarter, half, full) zodat je ze altijd in beeld hebt. Budgetteren is volledig optioneel — vul alleen je geschatte maanduitgaven in en TriFinity doet de rest.
              </>
            }
            howTo={{
              steps: [
                "Budgetplan opzetten: Ga naar De Kern → Budgetten → Nieuw budget. Kies een categorie (boodschappen, wonen, vervoer, etc.), stel een maandlimiet in en koppel het aan je transacties",
                "Doeltypes kiezen: vast bedrag per maand (bijv. €400), percentage van inkomen (bijv. 30%) of flexibel zonder limiet — zo past je plan bij jouw situatie",
                "Parent-budgetten groeperen subcategorieën: bijv. 'Wonen' bevat huur + energie + water. Zo houd je overzicht zonder detail te verliezen",
                "Markeer elke categorie als essentieel of niet-essentieel — dit beïnvloedt je FIRE-berekening direct",
                "Na transactie-import worden uitgaven automatisch gekoppeld via AI-categorisatie en frequentie-matching",
                "Analyse: tik op een bedrag om de kassabon te openen — een gedetailleerde breakdown van alle transacties binnen dat budget. Vergelijk maand-op-maand met trendgrafieken",
                "Bekijk je voortgang in boom-, donut- of sparkline-weergave en vergelijk maanden onderling om patronen te ontdekken",
                "Favorieten: markeer een budget als favoriet (♥) en het verschijnt automatisch als widget op De Wil-pagina in 4 formaten (mini, quarter, half, full)",
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
                Weet wat je betaalt en hoe je optimaliseert. TriFinity berekent automatisch
                je <strong>Box 3</strong> vermogensrendementsheffing op basis van het{" "}
                <strong>fictief rendement</strong> per vermogenstype: spaargeld wordt belast
                tegen een lager forfait (~1,03%), beleggingen tegen een hoger forfait (~6,04%)
                en overige bezittingen (vastgoed, crypto) tegen het beleggingsforfait. Schulden
                boven de drempel verlagen je grondslag.
                <br />
                <br />
                Je hebt recht op een <strong>heffingsvrij vermogen</strong> van ~€57.000 per
                persoon (peiljaar 2025). Met een fiscaal partner verdubbelt dit naar ~€114.000.
                Pas als je netto vermogen daarboven uitkomt, betaal je 36% belasting over het
                fictieve rendement. De <strong>partneroptimalisatie</strong> berekent automatisch
                de fiscaal voordeligste verdeling van jullie gezamenlijke grondslag — dat kan
                honderden euro&apos;s per jaar schelen.
                <br />
                <br />
                Vergelijk <strong>twee belastingjaren</strong> naast elkaar om tariefwijzigingen
                te zien en gebruik het <strong>scenariomodel</strong> om te simuleren wat er
                verandert als je vermogen groeit of verschuift tussen sparen en beleggen. Voor
                DGA&apos;s berekent TriFinity ook <strong>Box 2</strong>: aanmerkelijk belang,
                dividenduitkeringen en de wet excessief lenen bij een eigen BV.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Kern → Belasting — je Box 3 wordt automatisch berekend op basis van je geregistreerde bezittingen en schulden",
                "Controleer de classificatie: spaargeld (laag forfait), beleggingen (hoog forfait) en vrijgestelde bezittingen worden automatisch ingedeeld",
                "Bekijk je heffingsvrij vermogen — €57.000 per persoon, €114.000 met fiscaal partner — en hoeveel je daarboven betaalt",
                "Wissel tussen belastingjaren (2025/2026) om het verschil in forfaittarieven en vrijstellingen te vergelijken",
                "Activeer \"Partner\" om de optimale verdeling van de grondslag te berekenen — verschuif spaargeld naar de partner met lagere grondslag",
                "Open het scenariomodel om te simuleren wat er verandert bij meer spaargeld, meer beleggingen of hogere schulden",
              ],
              tip: "Verschuif vermogen van beleggingen naar spaargeld (of andersom) in het scenariomodel om te zien welk forfait je het minste kost. Elke €10.000 verschuiving kan tientallen euro's per jaar schelen.",
            }}
          />

          <GuideTopicCard
            icon={RefreshCw}
            title="Check-in"
            color="var(--color-kern-400)"
            description={
              <>
                Maandelijks 10 minuten voor financiële rust. De check-in is jouw
                vaste moment om stil te staan bij je geld — niet om te stressen,
                maar om <strong>grip te houden</strong>. Een 7-stappen wizard
                begeleidt je: terugblik op vorige maand (vermogenswijziging,
                inkomsten, uitgaven, gewonnen vrijheidsdagen), bezittingen
                bijwerken, schulden bijwerken, doelen checken, budgetten
                evalueren, vooruitblik op komende maand, en een moment voor
                reflectie met vrije notities.
                {' '}
                Will bereidt <strong>gespreksstarters</strong> voor op basis van
                je recente financiële veranderingen — ideaal als startpunt voor
                reflectie of een gesprek met je partner. Je kunt eerdere
                check-ins terugbladeren om je <strong>groei over maanden</strong>{' '}
                te zien. Het resultaat: altijd actuele data voor betere
                projecties, eerder herkennen van patronen, en het vertrouwen dat
                je financiën kloppen.
              </>
            }
            howTo={{
              steps: [
                'Ga naar De Kern → Check-in (of volg de herinnering in je meldingen)',
                'Stap 1: Bekijk de terugblik — vergelijk vorige maand met nu (vermogen, inkomsten, uitgaven, vrijheidsdagen)',
                'Stap 2-3: Werk bezittingen en schulden bij — zo blijft je nettovermogen actueel',
                'Stap 4-5: Check je doelen en evalueer je budgetten — liggen ze op koers?',
                'Stap 6: Bekijk de vooruitblik met komende rekeningen en levensgebeurtenissen',
                'Stap 7: Schrijf een korte reflectie — wat ging goed, wat kan beter?',
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
                De Kern groeit mee met jouw behoeften. We werken aan nieuwe
                mogelijkheden om je financiële fundament nog sterker te maken —
                denk aan <strong>automatische banksynchronisatie</strong> zodat je
                saldi en transacties vanzelf binnenkomen, slimmere herkenning van{' '}
                <strong>terugkerende transacties</strong> die automatisch
                gekoppeld worden aan de juiste budgetten, en uitgebreidere{' '}
                <strong>rapportages</strong> waarmee je dieper in je patronen
                kunt duiken. Houd de gids in de gaten — nieuwe features
                verschijnen hier zodra ze klaar zijn.
              </>
            }
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
            icon={Sparkles}
            title="Voorstellen"
            color="var(--color-wil-400)"
            description={
              <>
                Voorstellen zijn concrete acties die je vrijheidstijd vergroten.
                Will analyseert je <strong>uitgavenpatronen</strong>,{" "}
                <strong>doelen</strong> en financi\u00eble situatie en genereert
                persoonlijke aanbevelingen in vijf categorie\u00ebn: bespaartips,
                schuld-optimalisatie, beleggingskansen, inkomensmogelijkheden en
                gedragsaanpassingen. Elke aanbeveling toont de geschatte impact
                in <strong>vrijheidsdagen per jaar</strong> en laat zien{" "}
                <strong>hoeveel maanden eerder vrij</strong> je wordt als je het
                voorstel uitvoert \u2014 zo weet je precies wat het je oplevert.
                {" "}
                Voorstellen komen binnen als inzichten die je kunt{" "}
                <strong>accepteren</strong> (wordt direct een actie op je
                kanban-bord), <strong>uitstellen</strong> (bewaar voor later) of{" "}
                <strong>afwijzen</strong>. De prioriteitsscore bepaalt welke
                bovenaan staan: voorstellen met de hoogste vrijheidstijd-impact
                verschijnen eerst. Naarmate je meer gegevens toevoegt, worden de
                aanbevelingen specifieker en waardevoller.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Wil \u2014 je voorstellen staan in de kolom \u201cInzicht\u201d",
                "Tik op \u201c+ Analyseren\u201d om Will nieuwe aanbevelingen te laten genereren op basis van je uitgavenpatronen en doelen",
                "Bekijk per voorstel de vrijheidsdagen-impact en hoeveel maanden eerder vrij je wordt",
                "Kies: accepteren (wordt actie op je kanban-bord), uitstellen (komt later terug) of afwijzen (verdwijnt)",
              ],
              tip: "Accepteer eerst de voorstellen met de hoogste vrijheidsdagen-impact \u2014 die leveren het snelst resultaat op.",
            }}
          />

          <GuideTopicCard
            icon={Zap}
            title="Acties"
            color="var(--color-wil-400)"
            description={
              <>
                Van inzicht naar actie \u2014 het actiebord is waar je voorstellen
                omzet in concrete stappen. Je persoonlijke kanban-bord heeft drie
                kolommen: <strong>open</strong> (te doen),{" "}
                <strong>uitgesteld</strong> (bewaard voor later) en{" "}
                <strong>voltooid</strong> (afgerond). Sleep acties tussen kolommen
                met <strong>drag &amp; drop</strong> om je voortgang bij te houden.
                Acties komen binnen via geaccepteerde voorstellen of je maakt ze
                zelf handmatig aan. Elke actie heeft een vrijheidsdagen-impact,
                een bron (Will, check-in of handmatig) en optioneel een deadline.
                {" "}
                Het afronden van acties is waar de magie zit: elke voltooide actie
                levert <strong>vrijheidsdagen</strong> op die meetellen in je
                totaal. Je ziet je gewonnen dagen oplopen en je FIRE-datum
                verschuiven. Het is gamification met echte impact \u2014 niet voor
                punten, maar voor je toekomst.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Wil \u2014 je acties staan in de middelste kolom \u201cActie\u201d",
                "Maak een nieuwe actie aan met \u201c+ Nieuwe actie\u201d of accepteer een voorstel \u2014 beide verschijnen in de kolom \u201cOpen\u201d",
                "Sleep acties tussen kolommen: van open naar uitgesteld, of direct naar voltooid",
                "Tik op een actie voor details, vrijheidsdagen-impact en instructies",
                "Markeer een actie als voltooid wanneer je hem hebt uitgevoerd \u2014 je gewonnen vrijheidsdagen tellen mee",
              ],
              tip: "Plan elke week \u00e9\u00e9n actie in. Consistent kleine stappen > af en toe een sprint.",
            }}
          />

          <GuideTopicCard
            icon={Target}
            title="Doelen"
            color="var(--color-wil-400)"
            description={
              <>
                Stel concrete financi\u00eble doelen met een doelbedrag en
                einddatum. TriFinity kent <strong>10 doeltypes</strong>: spaardoel,
                schuldaflossing, nettovermogen, vrijheidsdagen, spaarquote, belegd
                vermogen, passief inkomen, noodfonds, salaris en vrij. Koppel een
                doel aan een bezitting of schuld en de voortgang wordt automatisch
                bijgehouden.
                {" "}
                Per doel zie je hoeveel je al hebt bereikt, of je{" "}
                <strong>op schema</strong> ligt, en wat de verwachte einddatum is
                bij het huidige tempo. Doelen zijn persoonlijk of gedeeld met je
                huishouden \u2014 zo werken jullie samen aan een gezamenlijke
                toekomst.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Wil \u2192 Resultaat kolom en tik op \u201c+ Nieuw doel\u201d",
                "Kies het doeltype (spaardoel, schuldaflossing, nettovermogen, etc.)",
                "Vul het doelbedrag en de gewenste einddatum in",
                "Koppel optioneel aan een bezitting (bijv. je spaarrekening) of schuld (bijv. je studielening) voor automatische voortgang",
                "Bekijk je voortgang op het doelen-dashboard \u2014 de on-track indicator toont of je op schema ligt",
              ],
              tip: "E\u00e9n helder doel werkt beter dan vijf vage. Begin met je noodfonds of je grootste schuld.",
            }}
          />

          <GuideTopicCard
            icon={RefreshCw}
            title="Abonnementen"
            color="var(--color-wil-400)"
            description={
              <>
                TriFinity scant automatisch 12 maanden transactiegeschiedenis op
                terugkerende patronen. Abonnementen, lidmaatschappen en vaste
                lasten worden gedetecteerd met een{" "}
                <strong>betrouwbaarheidsniveau</strong> (hoog, middel, laag) en
                frequentie (wekelijks, maandelijks, per kwartaal, jaarlijks). Je
                ziet het totale maandbedrag aan abonnementen en hoeveel{" "}
                <strong>vrijheidsdagen</strong> die je per jaar kosten.
                {" "}
                Het <strong>opzegadvies</strong> toont welke abonnementen je het
                minst gebruikt of de slechtste prijs-kwaliteitverhouding hebben.
                Soms is het schrappen van twee vergeten abonnementen genoeg om een
                halve vrijheidsdag per maand te winnen.
              </>
            }
            howTo={{
              steps: [
                "Importeer minimaal 3 maanden transacties \u2014 hoe meer, hoe beter de detectie",
                "Ga naar De Wil \u2014 je abonnementen staan onderaan de pagina",
                "Bekijk de gedetecteerde abonnementen met frequentie en maandbedrag",
                "Tik op een abonnement voor de opzegflow met details en vrijheidsdagen-impact",
              ],
              tip: "Check je abonnementen elk kwartaal. Vergeten streamingdiensten en ongebruikte sportschoolpassen zijn de meest voorkomende tijdlekken.",
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
                soevereiniteitsniveau stijgt.
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
                Elke dag een persoonlijke financi&euml;le update &mdash; dat is
                je briefing. Schakel je dashboard over naar{" "}
                <strong>DAIshboard-modus</strong> en Will componeert een
                AI-samengestelde briefing op basis van je actuele data. De
                briefing bevat tot <strong>23 verschillende kaarttypes</strong>:
                metrics, sparklines, mijlpalen, budgetbalken, inzichten,
                checklists, vergelijkingen en doelvoortgang. De inhoud past zich
                aan: &apos;s ochtends focus op de dag, aan het einde van de
                maand op je maandresultaat.
                {" "}
                Will analyseert je transacties, vermogensmutaties,
                budgetvoortgang en FIRE-prognose en selecteert de meest
                relevante inzichten. De briefing wordt{" "}
                <strong>progressief geladen</strong> &mdash; kaarten verschijnen
                zodra ze klaar zijn. Na 24 uur verschijnt een stale-banner zodat
                je weet dat de data niet meer actueel is. Ververs handmatig
                wanneer je wilt.
              </>
            }
            howTo={{
              steps: [
                "Op je dashboard: wissel naar DAIshboard-modus via de toggle bovenaan",
                "De briefing genereert automatisch \u2014 kaarten verschijnen progressief zodra ze klaar zijn",
                "Scroll door je persoonlijke briefing en tik op kaarten voor meer detail",
                "Ververs de briefing handmatig wanneer je nieuwe data hebt toegevoegd",
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
                De Wil groeit mee met jou. Dit zijn features die we aan het
                bouwen zijn:
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
        >
          <GuideTopicCard
            icon={Compass}
            title="FIRE-projectie"
            color="var(--color-horizon-400)"
            description={
              <>
                De FIRE-berekening beantwoordt de belangrijkste vraag:{" "}
                <strong>wanneer ben je financieel vrij?</strong> TriFinity toont
                je netto vermogensgrafiek over 30+ jaar met drie scenario&apos;s
                \u2014 pessimistisch, verwacht en optimistisch \u2014 op basis
                van je huidige vermogen, spaarquote, verwacht rendement en
                uitgavenpatroon. Je ziet je verwachte FIRE-leeftijd, de countdown
                in jaren/maanden/dagen, en het volledige vermogenspad tot aan je
                financi\u00eble vrijheid.
                {" "}
                De kern van de berekening is de{" "}
                <strong>Safe Withdrawal Rate (SWR)</strong>: je jaarlijkse
                uitgaven gedeeld door de SWR bepaalt hoeveel vermogen je nodig
                hebt. Stel je eigen <strong>verwacht rendement</strong> en{" "}
                <strong>inflatiepercentage</strong> in via Instellingen \u2014
                deze parameters bepalen direct je projectie. Kies je
                FIRE-eindstrategie: <strong>perpetueel</strong> (eeuwig leven van
                je vermogen), <strong>legacy</strong> (nalaten aan erfgenamen) of{" "}
                <strong>deplete</strong> (alles opmaken voor een bepaalde
                leeftijd). Box 3 belasting wordt automatisch meegerekend in de
                simulatie.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Horizon \u2014 je FIRE-prognose wordt automatisch berekend zodra je vermogen en uitgaven hebt ingevuld",
                "Lees de vermogensgrafiek: de x-as toont je leeftijd, de y-as je vermogen. De drie lijnen zijn pessimistisch, verwacht en optimistisch",
                "Vergelijk de scenario\u2019s: elk heeft een eigen FIRE-leeftijd en vermogenspad \u2014 zo zie je de bandbreedte van je toekomst",
                "Pas je verwacht rendement, inflatie en SWR aan via Identiteit \u2192 Instellingen \u2192 FIRE Instellingen",
                "Kies je eindstrategie: perpetueel, legacy of deplete \u2014 elk verandert je benodigd vermogen",
                "Bekijk de countdown: hoeveel jaar, maanden en dagen tot je FIRE-datum",
              ],
              tip: "Je FIRE-leeftijd is geen lot \u2014 het is een kompas. Elke verhoging van je spaarquote met 1% verschuift de datum.",
            }}
          />

          <GuideTopicCard
            icon={Sparkles}
            title="Levensgebeurtenissen"
            color="var(--color-horizon-400)"
            description={
              <>
                Het leven verloopt niet in een rechte lijn \u2014 en je
                financi\u00ebn ook niet. Voeg toekomstige gebeurtenissen toe die je
                financi\u00eble pad be\u00efnvloeden: een{" "}
                <strong>kind</strong> krijgen (hogere maandlasten), een{" "}
                <strong>huis</strong> kopen (grote aankoop + hypotheek),{" "}
                <strong>pensioen</strong> ontvangen (extra inkomen na AOW-leeftijd),
                trouwen, studie betalen, eerder stoppen met werken, een wereldreis
                maken of een erfenis ontvangen. TriFinity heeft een catalogus van{" "}
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
              tip: "Voeg ook positieve events toe \u2014 een salarisverhoging, een erfenis of een zijproject. Het gaat niet alleen om kosten.",
            }}
          />

          <GuideTopicCard
            icon={LineChart}
            title="Monte Carlo & backtesting"
            color="var(--color-horizon-400)"
            description={
              <>
                E\u00e9n prognose is een gok \u2014 duizend prognoses zijn een
                strategie. De <strong>Monte Carlo simulatie</strong> draait 1.000
                willekeurige marktscenario&apos;s en toont hoe robuust je plan is.
                Je ziet de <strong>slaagkans</strong> (in hoeveel scenario&apos;s
                haal je FIRE), de <strong>bandbreedtes</strong> van mogelijke
                FIRE-leeftijden (p10, p25, p50, p75, p90) en het vermogenspad per
                percentiel \u2014 van het slechtste tot het beste geval.
                {" "}
                De <strong>backtesting</strong> voegt historische realiteit toe: hoe
                zou je plan het hebben gedaan tijdens de dotcom-crash, de
                financi\u00eble crisis van 2008 of de COVID-dip? Je ziet hoe
                betrouwbaar je plan is op basis van \u00e9chte historische data.
                De backtestscore geeft je een concreet getal: het percentage
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
            description={
              <>
                Je hebt FIRE bereikt \u2014 en dan? Je onttrekkingsstrategie
                bepaalt{" "}
                <strong>hoe je je vermogen veilig opneemt</strong> zodat je nooit
                zonder zit. TriFinity ondersteunt drie eindstrategie\u00ebn:{" "}
                <strong>Perpetueel</strong> \u2014 je vermogen blijft eeuwig
                intact en je leeft van het rendement. Ideaal als je wilt nalaten
                of oneindig financieel vrij wilt zijn.{" "}
                <strong>Legacy</strong> \u2014 je onttrekt z\u00f3 dat er een
                vooraf bepaald bedrag overblijft voor erfgenamen, terwijl je
                tussentijds maximaal van je vermogen geniet.{" "}
                <strong>Deplete</strong> \u2014 je maakt alles op voor een
                gekozen eindleeftijd. Maximale besteding, niets over.
                {" "}
                Het <strong>veilige onttrekkingspercentage (SWR)</strong> bepaalt
                hoeveel je jaarlijks kunt opnemen. In de Nederlandse context
                hanteert TriFinity standaard het NL SWR van ~3,5%, lager dan de
                Amerikaanse 4%-regel, omdat Box 3 belasting je effectief
                rendement verlaagt. Je SWR wordt automatisch berekend op basis
                van je gekozen eindstrategie, verwacht rendement en inflatie.
                {" "}
                <strong>Box 3 impact:</strong> Nederland belast fictief rendement
                op vermogen boven de vrijstelling (\u20ac57.000 p.p.). Bij
                onttrekking daalt je vermogen, waardoor je Box 3 heffing elk jaar
                lager wordt \u2014 een natuurlijk belastingvoordeel. TriFinity
                rekent dit mee in de simulatie: je ziet het netto-effect na
                belasting, niet alleen het bruto rendement.
              </>
            }
            howTo={{
              steps: [
                "Ga naar Identiteit \u2192 Instellingen \u2192 FIRE Instellingen en kies je eindstrategie: perpetueel, legacy of deplete",
                "Stel je verwacht rendement en inflatiepercentage in \u2014 deze bepalen je SWR en benodigd FIRE-vermogen",
                "Ga naar De Horizon \u2014 je onttrekkingsstrategie wordt direct verwerkt in de FIRE-projectie en Monte Carlo simulatie",
                "Vergelijk de drie strategie\u00ebn: perpetueel vereist het meeste vermogen, deplete het minste \u2014 maar geeft geen buffer",
                "Bekijk het Box 3 effect: je ziet hoeveel belasting je betaalt bij onttrekking en hoe die daalt naarmate je vermogen afneemt",
                "Bekijk het effect op je netto onttrekking na belasting \u2014 dat is wat je echt maandelijks te besteden hebt",
              ],
              tip: "Begin met perpetueel als veilige basis. Als je FIRE-datum te ver weg lijkt, experimenteer met deplete \u2014 je ziet direct hoeveel jaar eerder je vrij bent. Legacy is de gulden middenweg als je ook aan erfgenamen denkt.",
            }}
          />
        </ReisStapSection>

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
                <strong>Experimenteer met je toekomst.</strong> Wat als je 20% meer
                zou verdienen? Wat als je over 3 jaar parttime gaat werken? Wat als
                je emigreert naar Portugal? De <strong>What-If builder</strong> laat
                je alternatieve toekomsten verkennen via vijf schuifbalken:{" "}
                <strong>inkomen</strong>, werkdagen, spaarquote,{" "}
                <strong>rendement</strong> en <strong>uitgaven</strong>. Kies een
                snelpreset (optimistisch, verwacht, pessimistisch) of stel elk
                parameter handmatig in.
                {" "}
                Je ziet direct het effect op je <strong>FIRE-datum</strong>,
                vermogenspad en slaagkans. Voeg levensgebeurtenissen toe aan je
                scenario en vergelijk het naast je huidige baseline in een{" "}
                <strong>split-view</strong>. De SimChart toont beide paden met
                percentiellijnen, zodat je niet alleen het verwachte maar ook het
                beste en slechtste geval ziet \u2014 inclusief partnerperspectief
                bij een huishouden.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Horizon \u2192 What-If om een nieuw scenario te openen",
                "Pas parameters aan: versleep de schuifbalken voor inkomen, uitgaven, rendement, werkdagen en spaarquote",
                "Of kies een snelpreset (optimist, koershouder, zuinig) als startpunt en verfijn van daaruit",
                "Voeg levensgebeurtenissen toe aan je scenario om hun impact op je FIRE-datum te zien",
                "Open de vergelijkingsmodal om je scenario naast je huidige situatie te leggen",
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
                De Horizon wordt steeds slimmer. Dit zijn features die we aan het
                bouwen zijn:
                <ul className="mt-2 list-disc pl-4 space-y-1">
                  <li>
                    <strong>Glijpad-visualisatie</strong> &mdash; een interactieve
                    grafiek die je vermogensafbouw na FIRE toont per
                    onttrekkingsstrategie, inclusief belastingeffect en
                    inflatiecorrectie over de jaren.
                  </li>
                  <li>
                    <strong>Pensioen-integratie</strong> &mdash; koppel je AOW en
                    aanvullend pensioen aan je FIRE-berekening. Zie wanneer welk
                    inkomen ingaat en hoeveel eigen vermogen je tot die tijd nodig
                    hebt.
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
              TriFinity is gebouwd rond \u00e9\u00e9n kernidee:{" "}
              <strong>geld is opgeslagen tijd</strong>. Elke euro die je
              verdient, spaart of investeert vertegenwoordigt een stukje
              levenstijd \u2014 tijd die je later kunt besteden aan wat \u00e9cht
              belangrijk voor je is. Daarom rekent TriFinity alles om naar{" "}
              <strong>vrijheidstijd</strong>: dagen, maanden en jaren van
              financi\u00eble onafhankelijkheid.
              {" "}
              De app is opgebouwd uit drie modules die samen je volledige
              financi\u00eble reis dekken. <strong>De Kern</strong> (weten) geeft
              je helder inzicht in wat je hebt, uitgeeft en verschuldigd bent.{" "}
              <strong>De Wil</strong> (willen) vertaalt dat inzicht naar concrete
              acties, aanbevelingen en doelen. <strong>De Horizon</strong>{" "}
              (dromen) projecteert je toekomst: wanneer ben je financieel vrij,
              en welke scenario&apos;s zijn er?
              {" "}
              Anders dan traditionele budgetapps stuurt TriFinity niet op
              schuldgevoel of restrictie. Geen rode waarschuwingen als je
              &quot;te veel&quot; uitgeeft \u2014 wel perspectief. Elke
              financi\u00eble keuze wordt vertaald in vrijheidstijd, zodat je
              zelf kunt beslissen wat die tijd je waard is.
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
          description={
            <>
              <strong>TriFinity Post</strong> is je persoonlijke financi\u00eble
              nieuwsfeed \u2014 actueel nieuws en artikelen die relevant zijn
              voor jouw situatie. De AI analyseert financieel nieuws en schrijft
              samenvattingen die rekening houden met je portfolio, vermogen en
              doelen. Zo lees je niet zomaar nieuws, maar nieuws dat er voor jou
              toe doet.
              {" "}
              Artikelen worden <strong>dagelijks automatisch gegenereerd</strong>{" "}
              en verschijnen als kaarten die je kunt openen en lezen. De inhoud
              is altijd gepersonaliseerd: als rentestanden veranderen en jij een
              hypotheek hebt, legt de AI uit wat dat voor jou betekent. Als
              markten bewegen en jij belegt, krijg je context bij de cijfers.
            </>
          }
          howTo={{
            steps: [
              "Open TriFinity Post via het nieuwsicoon in de navigatie of het dashboard",
              "Scroll door de artikelkaarten \u2014 elk artikel is een korte, leesbare samenvatting",
              "Tik op een artikel om het volledige stuk te lezen met persoonlijke context",
              "Nieuwe artikelen verschijnen dagelijks automatisch op basis van actueel nieuws",
            ],
            tip: "Lees elke ochtend 2-3 artikelen bij je koffie. Het kost 5 minuten en houdt je financieel scherp \u2014 zonder zelf nieuwssites af te struinen.",
          }}
        />

        <GuideTopicCard
          icon={Sparkles}
          title="Will — je AI-assistent"
          color="var(--ink-2)"
          description={
            <>
              Will is je eigen financiële adviseur die jouw situatie kent. Hij
              heeft drie persoonlijkheden:{" "}
              <strong>FHIN</strong> (De Kern) beantwoordt vragen over je
              vermogen, uitgaven en transacties.{" "}
              <strong>FINN</strong> (De Wil) geeft concrete aanbevelingen en
              actieplannen.{" "}
              <strong>FFIN</strong> (De Horizon) helpt je dromen vertalen naar
              financiële plannen en scenario&apos;s.
              {" "}
              Will gebruikt uitsluitend jouw data binnen TriFinity: transacties,
              budgetten, vermogen, doelen, levensgebeurtenissen en
              FIRE-parameters. <strong>Niets wordt extern gedeeld</strong> —
              alle communicatie blijft binnen je account en gevoelige gegevens
              worden automatisch gemaskeerd. Will is{" "}
              <strong>context-aware</strong>: op elke pagina weet hij welke data
              relevant is en past hij zijn antwoorden aan op wat je aan het doen
              bent.
            </>
          }
          howTo={{
            steps: [
              "Tik op het chat-icoon rechtsonder op elke pagina om Will te openen",
              "Stel een vraag in je eigen woorden \u2014 Will begrijpt natuurlijke taal en past zich aan op de context",
              "Vraag over je budget: \u201cHoeveel geef ik uit aan boodschappen?\u201d \u2014 Will analyseert je transacties",
              "Vraag over je vermogen: \u201cHoe staat mijn netto vermogen ervoor?\u201d \u2014 Will toont trends en mijlpalen",
              "Vraag over FIRE: \u201cWanneer ben ik financieel vrij?\u201d \u2014 Will berekent scenario\u2019s met jouw parameters",
              "Beschrijf een droom: \u201cIk wil over 5 jaar een huis kopen\u201d \u2014 Will vertaalt het naar een concreet plan",
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
              <strong>Weet wat belangrijk is zonder constant te checken.</strong>{" "}
              TriFinity houdt je financiën in de gaten en stuurt alleen een
              melding als er iets is dat je aandacht verdient. Zo hoef je niet
              dagelijks alles zelf te controleren — de app doet het voor je.
              {" "}
              Er zijn zeven soorten meldingen.{" "}
              <strong>Budget alerts</strong> waarschuwen als je een budgetgrens
              nadert of overschrijdt.{" "}
              <strong>Synchronisatie</strong> laat je weten wanneer je
              bankconnectie is bijgewerkt of aandacht nodig heeft.{" "}
              <strong>Aanbevelingen</strong> geven financiële tips en suggesties
              op basis van je data.{" "}
              <strong>Inzichten</strong> signaleren patronen in je uitgaven die
              je misschien over het hoofd ziet — denk aan ongebruikelijke
              transacties of afwijkende maanden.{" "}
              <strong>Level-ups</strong> melden wanneer je soevereiniteitsniveau
              stijgt en nieuwe widgets ontgrendelt.{" "}
              <strong>Horizon-alerts</strong> gaan over je FIRE-prognose:
              aandachtspunten en vrijheidswaarschuwingen.{" "}
              <strong>Prijs-alerts</strong> triggeren bij koersbewegingen of
              allocatiedrift in je holdings.
              {" "}
              Urgente meldingen verschijnen bovenaan, dagelijkse daaronder, en
              eerdere meldingen kun je per dag terugbladeren. In{" "}
              <strong>Instellingen → Notificaties</strong> schakel je per type
              meldingen aan of uit — zo ontvang je alleen wat voor jou relevant
              is.
            </>
          }
          howTo={{
            steps: [
              "Meldingen verschijnen via het bel-icoon in de navigatiebalk — een badge toont het aantal ongelezen",
              "Tik op een melding om direct naar het relevante onderdeel te navigeren (budget, holding, vermogen)",
              "Ga naar Identiteit → Instellingen → Notificaties om per type te kiezen welke meldingen je wilt ontvangen",
              "Schakel budget alerts en level-ups in om gemotiveerd te blijven zonder overweldigd te raken",
              "Stel prijs-alerts in op je holdings-pagina voor koerswaarschuwingen en allocatiedrift",
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
              <strong>Diepere analyse wanneer je dat wilt.</strong> Rapporten
              vertalen je financiële data naar leesbare overzichten die je kunt
              bewaren, terugbladeren en vergelijken over periodes.
              {" "}
              Het <strong>perioderapport</strong> vat je inkomsten, uitgaven en
              vermogensverandering samen over een maand, kwartaal of jaar. Je
              ziet precies waar je geld naartoe ging en hoe je vermogen zich
              ontwikkelde — ideaal als maandelijkse terugblik.
              {" "}
              Het <strong>balansrapport</strong> toont al je bezittingen en
              schulden op één peildatum: cash, beleggingen, vastgoed en pensioen
              aan de ene kant, hypotheek en overige schulden aan de andere. Je
              netto vermogen wordt uitgedrukt in vrijheidstijd, zodat je direct
              ziet hoeveel jaren onafhankelijkheid je hebt opgebouwd.
              {" "}
              Het <strong>budgetrapport</strong> laat zien hoe je werkelijke
              uitgaven zich verhouden tot je budgetgrenzen per categorie. Trends
              over meerdere maanden maken zichtbaar waar je structureel boven of
              onder budget zit.
              {" "}
              Een <strong>jaaroverzicht</strong> combineert al deze perspectieven
              in één samenvattend rapport: totale inkomsten en uitgaven,
              vermogensgroei, top-budgetcategorieën en mijlpalen die je dat jaar
              bereikte.
              {" "}
              Elk rapport begint met een <strong>AI-inleiding</strong>: Will
              schrijft een korte, persoonlijke samenvatting van de belangrijkste
              bevindingen. Eenmaal gegenereerd kun je rapporten opslaan en later
              terugvinden op je rapportages-overzichtspagina.
            </>
          }
          howTo={{
            steps: [
              "Ga naar Rapportages via het profielmenu (tussen Identiteit en Uitloggen) of via de navigatie",
              "Kies je rapporttype: perioderapport, balansrapport, budgetrapport of jaaroverzicht",
              "Selecteer de gewenste periode — een maand, kwartaal of volledig jaar",
              "Genereer het rapport — Will schrijft automatisch een persoonlijke AI-inleiding met de belangrijkste inzichten",
              "Bewaar het rapport om het later terug te lezen of te vergelijken met eerdere periodes",
            ],
            tip: "Genereer na elke maandelijkse check-in een perioderapport. Zo bouw je een financieel archief op dat je groei over maanden en jaren zichtbaar maakt.",
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
              Widgets vari\u00ebren in grootte (mini tot volledig) en ontgrendelen
              progressief naarmate je soevereiniteitsniveau stijgt. Sleep ze in de
              volgorde die voor jou werkt, schakel uit wat je niet nodig hebt, en
              ontdek nieuwe widgets zodra je een niveau stijgt.
            </>
          }
          howTo={{
            steps: [
              "Je dashboard is je startpagina na inloggen",
              "Ga naar Identiteit \u2192 Instellingen \u2192 Widgets om widgets aan/uit te zetten en de volgorde aan te passen",
              "Nieuwe widgets ontgrendelen automatisch bij een hoger soevereiniteitsniveau",
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
          icon={Settings}
          title="Profiel & Instellingen"
          color="var(--ink-2)"
          description={
            <>
              <strong>Jouw data, jouw controle.</strong> Je profiel bevat de
              persoonlijke gegevens die de basis vormen voor alle berekeningen in
              TriFinity: <strong>naam</strong>, <strong>geboortedatum</strong>,{" "}
              <strong>pensioenleeftijd</strong>, <strong>inkomen</strong> en
              huishoudsamenstelling. Deze gegevens bepalen je
              vrijheidstijdberekeningen, FIRE-prognoses en soevereiniteitsniveau.
              {" "}
              Je{" "}
              <strong>soevereiniteitsniveau</strong> (van Herstel tot Meesterschap)
              wordt automatisch berekend op basis van je financi\u00eble positie en
              ontgrendelt progressief nieuwe functies en widgets.
              In <strong>Instellingen</strong> beheer je alles vanuit \u00e9\u00e9n
              hub: notificatievoorkeuren, widget-selectie, FIRE-parameters (verwacht
              rendement, inflatie, eindstrategie), weergaveopties (typografie,
              modulekleuren) en gegevensbeheer.
              {" "}
              TriFinity respecteert je <strong>data-eigenaarschap</strong>{" "}
              volledig. Je kunt op elk moment al je gegevens exporteren als
              JSON-bestand \u2014 transacties, budgetten, vermogen, doelen, alles. En
              als je wilt stoppen, kun je je account volledig verwijderen via
              Instellingen \u2192 Gegevens. Je data is van jou, altijd.
            </>
          }
          howTo={{
            steps: [
              "Ga naar Identiteit \u2192 Profiel om je persoonlijke gegevens te bekijken en bewerken",
              "Pas je naam, geboortedatum, pensioenleeftijd en inkomen aan \u2014 deze sturen al je berekeningen",
              "Ga naar Identiteit \u2192 Instellingen voor alle app-instellingen op \u00e9\u00e9n plek",
              "Sectie C (FIRE) is het belangrijkst: stel hier je verwacht rendement, inflatie en eindstrategie in",
              "Sectie D (Weergave) laat je de app personaliseren met eigen modulekleuren",
              "Sectie E (Gegevens) biedt data-export en account-verwijdering \u2014 jouw data, jouw keuze",
            ],
            tip: "Controleer je profielgegevens en FIRE-parameters minstens jaarlijks. Je geboortedatum en pensioenleeftijd bepalen je hele FIRE-tijdlijn, en je verwacht rendement kan veranderen met je beleggingsstrategie.",
          }}
        />

        <GuideTopicCard
          icon={SlidersHorizontal}
          title="App instellingen"
          color="var(--ink-2)"
          description={
            <>
              <strong>Maak de app helemaal van jou.</strong> In Instellingen pas
              je TriFinity aan op jouw wensen en situatie. Alles is gebundeld in
              vijf secties op \u00e9\u00e9n overzichtelijke pagina.
              {" "}
              <strong>Widgets</strong>: kies welke widgets op je dashboard
              verschijnen. Schakel ze aan of uit, en ontdek nieuwe widgets
              naarmate je soevereiniteitsniveau stijgt. Elk widget-formaat (mini,
              quarter, half, full) past zich automatisch aan je scherm aan.
              {" "}
              <strong>FIRE-parameters</strong>: stel je verwacht bruto rendement
              en inflatie in. Deze twee getallen sturen al je
              FIRE-berekeningen, projecties en scenario&apos;s. Kies ook je
              eindstrategie: eeuwig kapitaal behouden (perpetual), nalatenschap
              achterlaten (legacy) of vermogen opgebruiken (deplete).
              {" "}
              <strong>Weergave</strong>: personaliseer je modulekleuren voor De
              Kern, De Wil en De Horizon. Kies uit vooraf samengestelde paletten
              of stel je eigen kleuren in.
              {" "}
              <strong>Notificaties</strong>: bepaal welke meldingen je wilt
              ontvangen \u2014 budgetgrenzen, vermogensmijlpalen, level-ups en
              aanbevelingen. Per type aan of uitzetten.
            </>
          }
          howTo={{
            steps: [
              "Ga naar Identiteit \u2192 Instellingen om alle opties op \u00e9\u00e9n plek te zien",
              "Sectie A (Notificaties): kies per type welke meldingen je wilt ontvangen",
              "Sectie B (Widgets): schakel widgets aan/uit en ontdek nieuwe opties per niveau",
              "Sectie C (FIRE): stel verwacht rendement, inflatie en eindstrategie in \u2014 dit stuurt al je prognoses",
              "Sectie D (Weergave): pas modulekleuren aan met voorgedefinieerde of eigen kleuren",
              "Sectie E (Gegevens): exporteer al je data of verwijder je account",
            ],
            tip: "Begin met de FIRE-parameters \u2014 die hebben de grootste impact op al je berekeningen. Een verschil van 1% rendement kan je FIRE-datum jaren verschuiven.",
          }}
        />

        <GuideTopicCard
          icon={Users}
          title="Huishouden & Partner"
          color="var(--ink-2)"
          description={
            <>
              Samen financiële vrijheid bereiken — dat is de kern van het
              huishoudperspectief. Nodig je partner uit en beheer jullie
              financiën samen, met respect voor individuele privacy. Per
              bezitting, rekening of schuld kies je het{" "}
              <strong>eigenaarschap</strong>: persoonlijk (alleen voor jou
              zichtbaar), gedeeld (zichtbaar voor jullie beiden) of verborgen.
              Per categorie (vermogen, schulden, inkomsten) stel je het{" "}
              <strong>zichtbaarheidsniveau</strong> in: volledig, alleen totalen
              of volledig verborgen.
              {" "}
              <strong>Gedeeld vermogen</strong> combineert jullie gezamenlijke
              rekeningen, beleggingen en vastgoed tot één huishoud-netto-vermogen
              — uitgedrukt in gezamenlijke vrijheidstijd. De kostenverdeling is
              configureerbaar: gelijk of naar rato van inkomen, met een primaire
              betaler voor gezamenlijke lasten. <strong>Gedeelde doelen</strong>{" "}
              laten jullie samen sparen naar een gemeenschappelijk doel.
              {" "}
              De <strong>gezamenlijke FIRE-projectie</strong> berekent jullie pad
              naar financiële vrijheid met twee inkomens, gedeelde uitgaven en
              gecombineerd vermogen. Op elke pagina wissel je via een toggle
              tussen je persoonlijke en huishoudperspectief.
            </>
          }
          howTo={{
            steps: [
              "Ga naar Identiteit \u2192 Delen en nodig je partner uit via e-mailadres",
              "Je partner ontvangt een uitnodigingslink en maakt een eigen account aan",
              "Stel het huishouden in: kies een huishoudnaam en configureer de kostenverdeling (50/50 of aangepast percentage)",
              "Markeer rekeningen en bezittingen als persoonlijk of gedeeld \u2014 dit bepaalt wat je partner kan zien",
              "Configureer per categorie het privacyniveau: volledig, totalen of verborgen",
              "Bekijk de gezamenlijke FIRE-projectie op De Horizon \u2014 twee inkomens, gedeelde uitgaven, \u00e9\u00e9n vrijheidsdatum",
              "Wissel op elke pagina tussen persoonlijk en huishoudperspectief via de toggle",
            ],
            tip: "Bespreek samen welk privacyniveau jullie prettig vinden voordat je het instelt. Begin met totalen delen en breid uit als het vertrouwen groeit.",
          }}
        />

        <GuideTopicCard
          icon={Smartphone}
          title="Mobiel"
          color="var(--ink-2)"
          description={
            <>
              Je financiën altijd bij de hand — TriFinity is volledig{" "}
              <strong>bottom navigation</strong> geeft je met \u00e9\u00e9n tik
              toegang tot De Kern, De Wil en De Horizon \u2014 kleurgecodeerd per
              module. Alle touch targets zijn minimaal 44px, modals schuiven als{" "}
              <strong>BottomSheets</strong> van onderen omhoog en kunnen worden
              weggeveegd. Widgets passen zich automatisch aan het kleinere scherm
              aan en tab-gebaseerde layouts houden de navigatie overzichtelijk.
            </>
          }
          howTo={{
            steps: [
              "Open TriFinity in je mobiele browser \u2014 de app past zich automatisch aan",
              "Gebruik de bottom navigation onderaan om tussen modules te wisselen",
              "Veeg BottomSheets naar beneden om ze te sluiten",
            ],
            tip: "Voeg TriFinity toe aan je startscherm voor een app-achtige ervaring zonder download.",
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
