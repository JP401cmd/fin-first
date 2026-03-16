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
                Je cashpositie is het fundament van je vermogen — het startpunt van elke berekening. Voeg je <strong>betaal- en spaarrekeningen</strong> toe en houd je saldo actueel. Koppel je bank via <strong>TrueLayer</strong> voor automatische synchronisatie, of importeer transacties handmatig via <strong>MT940, CSV of OFX</strong>. Bij het uploaden doorloop je een stap-voor-stap proces: bestand selecteren, rekening kiezen, transacties reviewen en importeren.
                {' '}
                Zodra je transacties binnenkomen, categoriseert de AI ze automatisch met een <strong>betrouwbaarheidsscore</strong>. Drie categorisatiebronnen werken samen: <strong>tegenpartijregels</strong> (IBAN en naam), <strong>frequentie-matching</strong> (patronen uit je historie) en <strong>AI-analyse</strong> voor nieuwe transacties. Elke handmatige correctie wordt opgeslagen als regel en automatisch toegepast bij toekomstige imports — zo wordt het systeem steeds slimmer. <strong>Duplicaatdetectie</strong> voorkomt dubbele boekingen en <strong>transfer matching</strong> herkent overboekingen tussen eigen rekeningen. Het resultaat: een compleet, opgeschoond kasoverzicht als basis voor al je budgetten en vrijheidsberekeningen.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Kern → Cash en voeg je betaal- en spaarrekeningen toe (betaalrekening, spaarrekening, gezamenlijk, etc.)",
                "Voer het huidige saldo in — dit is je startpunt voor vermogensberekeningen",
                "Koppel via TrueLayer voor automatisch bijwerken: kies je bank, log in, en je transacties worden gesynchroniseerd",
                "Of importeer handmatig: ga naar Cash → Import, selecteer een MT940/CSV/OFX bestand, kies de rekening, en review de transacties voor import",
                "Controleer de AI-categorisatie — de betrouwbaarheidsscore toont hoe zeker elke toewijzing is, sorteer op laagste confidence om onzekere matches te reviewen",
                "Corrigeer waar nodig — elke correctie wordt automatisch een regel die bij volgende imports direct wordt toegepast",
                "Stel tegenpartijregels in voor terugkerende betalingen (bijv. Albert Heijn → Boodschappen) op basis van naam of IBAN",
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
                Op de <strong>holdings-pagina</strong> volg je individuele posities met actuele koersen, rendement per periode en portfolio-allocatie. Importeer je posities in bulk via <strong>broker-import</strong>: upload een CSV van <strong>DEGIRO, Saxo of ING Beleggen</strong> en je holdings worden automatisch aangemaakt met de juiste koersen en aantallen. Vergelijk je rendement met een <strong>benchmark</strong> om te zien of je de markt bijhoudt. <strong>Dividendtracking</strong> toont je passief inkomen per bezitting. Voer periodiek een <strong>herwaardering</strong> uit om je vastgoed en overige bezittingen actueel te houden — je ziet direct het effect op je nettovermogen en vrijheidstijd.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Kern → Bezittingen en voeg je eerste bezitting toe (bijv. beleggingsrekening)",
                "Kies het juiste type — elk type heeft eigen velden zoals ISIN, rendement, of WOZ-waarde",
                "Voeg holdings toe aan je beleggingsrekening om individuele posities te volgen",
                "Of importeer in bulk: upload een CSV van DEGIRO, Saxo of ING Beleggen via de broker-import knop",
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
                Ontdek waar je levenstijd naartoe stroomt. TriFinity verdeelt je uitgaven over <strong>6 hoofdcategorieën en 24 subcategorieën</strong> met vijf budgettypes (inkomsten, uitgaven, sparen, schulden, verborgen). Per categorie kies je een <strong>doeltype</strong>: vast bedrag, percentage van inkomen of flexibel — zo past je plan bij jouw situatie. Elke categorie markeer je als <strong>essentieel of niet-essentieel</strong>, wat rechtstreeks je FIRE-berekening bepaalt. Drie weergaven geven inzicht: <strong>boomstructuur</strong> met voortgangsbalken, <strong>donutgrafiek</strong> voor verdeling, en <strong>sparklines</strong> voor 6-maanden trends. De <strong>maand-op-maand vergelijking</strong> toont hoe je bestedingspatroon verschuift. Tik op een categorie voor het <strong>kassabon</strong>-detail met elke transactie en zie je maandrapport in gewonnen of verloren <strong>vrijheidsdagen</strong>. Favoriete budgetten pin je als <strong>widget op je dashboard</strong> zodat je ze altijd in beeld hebt. Budgetteren is volledig optioneel — vul alleen je geschatte maanduitgaven in en TriFinity doet de rest.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Kern → Budgetten — je standaardplan staat klaar met 6 categorieën",
                "Stel per categorie een doeltype in: vast bedrag (bijv. €400/mnd), percentage van inkomen (bijv. 30%) of flexibel (geen limiet, alleen tracking)",
                "Kies het interval (maand, kwartaal, jaar) en overschotgedrag (reset, doorschuiven of beleggen)",
                "Markeer elke categorie als essentieel of niet-essentieel — dit beïnvloedt je FIRE-berekening direct",
                "Na transactie-import worden uitgaven automatisch gekoppeld via AI-categorisatie",
                "Bekijk je voortgang in boom-, donut- of sparkline-weergave en tik op een categorie voor de kassabon-details",
                "Vergelijk maanden onderling om trends te ontdekken — de maandrapportage toont verschuivingen in je bestedingspatroon",
                "Markeer een budget als favoriet (♥) om het als widget op je dashboard te pinnen",
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
            icon={Sparkles}
            title="Voorstellen"
            color="var(--color-wil-400)"
            description={
              <>
                Will analyseert je financi\u00eble situatie en genereert persoonlijke
                aanbevelingen in vijf categorie\u00ebn: bespaartips,
                schuld-optimalisatie, beleggingskansen, inkomensmogelijkheden en
                gedragsaanpassingen. Elke aanbeveling toont de geschatte impact in{" "}
                <strong>vrijheidsdagen per jaar</strong> \u2014 zo weet je precies
                wat het je oplevert.
                {" "}
                Voorstellen komen binnen als inzichten die je kunt{" "}
                <strong>accepteren</strong> (wordt een actie),{" "}
                <strong>uitstellen</strong> (bewaar voor later) of{" "}
                <strong>afwijzen</strong>. De prioriteitsscore bepaalt welke
                bovenaan staan: voorstellen met de hoogste vrijheidstijd-impact
                verschijnen eerst. Naarmate je meer gegevens toevoegt, worden de
                aanbevelingen specifieker en waardevoller.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Wil \u2014 je voorstellen staan in de kolom \u201cInzicht\u201d",
                "Tik op \u201c+ Analyseren\u201d om Will nieuwe aanbevelingen te laten genereren op basis van je huidige data",
                "Bekijk per voorstel de vrijheidsdagen-impact en de onderbouwing",
                "Kies: accepteren (wordt actie), uitstellen (komt later terug) of afwijzen (verdwijnt)",
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
                Je persoonlijke actiebord werkt als een kanban: drie kolommen \u2014{" "}
                <strong>open</strong>, <strong>uitgesteld</strong> en{" "}
                <strong>voltooid</strong>. Acties komen binnen via geaccepteerde
                voorstellen of je maakt ze zelf aan. Elke actie heeft een
                vrijheidsdagen-impact, een bron (Will, check-in of handmatig) en
                optioneel een deadline.
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
                "Tik op een actie voor details, vrijheidsdagen-impact en instructies",
                "Markeer een actie als voltooid wanneer je hem hebt uitgevoerd",
                "Maak handmatige acties aan met \u201c+ Nieuwe actie\u201d voor eigen financi\u00eble stappen",
                "Uitgestelde acties verplaats je terug naar open wanneer je eraan toe bent",
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
                <strong>wanneer dekt je vermogen je uitgaven voor altijd?</strong>{" "}
                TriFinity berekent drie scenario&apos;s \u2014 pessimistisch,
                verwacht en optimistisch \u2014 op basis van je huidige vermogen,
                spaarquote, verwacht rendement en uitgavenpatroon. Je ziet je
                verwachte FIRE-leeftijd, de countdown in jaren/maanden/dagen, en
                het vermogenspad over 30+ jaar.
                {" "}
                De berekening is volledig configureerbaar: stel je eigen verwacht
                rendement en inflatiepercentage in via{" "}
                <strong>Instellingen</strong>. Kies je FIRE-eindstrategie:{" "}
                <strong>perpetueel</strong> (eeuwig leven van je vermogen),{" "}
                <strong>legacy</strong> (nalaten aan erfgenamen) of{" "}
                <strong>deplete</strong> (alles opmaken voor een bepaalde leeftijd).
                Box 3 belasting wordt automatisch meegerekend in de simulatie.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Horizon \u2014 je FIRE-prognose wordt automatisch berekend zodra je vermogen en uitgaven hebt ingevuld",
                "Bekijk de drie scenario\u2019s (pessimistisch/verwacht/optimistisch) met elk een FIRE-leeftijd en vermogenspad",
                "Pas je verwacht rendement en inflatie aan via Identiteit \u2192 Instellingen \u2192 FIRE Instellingen",
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
                financi\u00eble pad be\u00efnvloeden: kinderen krijgen, verhuizen,
                trouwen, studie betalen, eerder stoppen met werken, een wereldreis
                maken, een erfenis ontvangen. TriFinity heeft een catalogus van{" "}
                <strong>50+ voorgedefinieerde events</strong> met realistische
                cashflow-schattingen.
                {" "}
                Elke levensgebeurtenis <strong>verschuift je FIRE-datum</strong>. Je
                ziet het cumulatieve effect: als je over 3 jaar een kind krijgt en
                over 5 jaar een huis koopt, wat doet dat met je prognose? Zo maak
                je bewuste keuzes over je toekomst in plaats van verrassingen.
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
                Je ziet het slagingspercentage (in hoeveel scenario&apos;s haal je
                FIRE), de spreiding van mogelijke FIRE-leeftijden (p10, p25, p50,
                p75, p90) en het vermogenspad per percentiel.
                {" "}
                De <strong>backtesting</strong> voegt historische realiteit toe: hoe
                zou je plan het hebben gedaan tijdens de dotcom-crash, de
                financi\u00eble crisis van 2008 of de COVID-dip? De backtestscore
                geeft je een concreet getal: het percentage historische
                crisisperiodes waarin je plan overeind bleef.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Horizon \u2014 de Monte Carlo simulatie draait automatisch op basis van je huidige data",
                "Bekijk het slagingspercentage en de spreiding van FIRE-leeftijden",
                "De backtestscore toont hoe je plan presteert onder historische crises",
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
                bepaalt hoe je je vermogen opneemt zonder dat het opraakt. TriFinity
                biedt vier methoden: de klassieke{" "}
                <strong>4%-regel</strong> (vast percentage per jaar),{" "}
                <strong>dynamische onttrekking</strong> (past mee met
                marktprestaties), de{" "}
                <strong>vloer-plafondmethode</strong> (minimum gegarandeerd, extra
                in goede jaren) en de{" "}
                <strong>bucket-strategie</strong> (drie emmers: cash voor nu,
                obligaties voor 5 jaar, aandelen voor de lange termijn).
                {" "}
                Elke strategie toont hoelang je vermogen meegaat, hoeveel
                flexibiliteit je hebt in slechte marktjaren, en wat je jaarlijkse
                inkomen wordt. Zo kies je niet op gevoel maar op basis van
                simulatie.
              </>
            }
            howTo={{
              steps: [
                "Ga naar De Horizon \u2192 Onttrekkingsstrategie",
                "Vergelijk de vier methoden naast elkaar met je eigen vermogen en uitgaven",
                "Bekijk per strategie het gesimuleerde vermogensverloop en jaarlijkse inkomen",
                "Kies de strategie die past bij je risicoprofiel \u2014 conservatief (bucket), flexibel (dynamisch) of eenvoudig (4%-regel)",
              ],
              tip: "De bucket-strategie is het meest intu\u00eftief: je hebt altijd 2\u20133 jaar cash bij de hand, ongeacht wat de markt doet.",
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
                Wat als je 20% meer zou verdienen? Wat als je over 3 jaar parttime
                gaat werken? Wat als je emigreert naar Portugal? De{" "}
                <strong>What-If builder</strong> laat je experimenteren met
                alternatieve toekomsten via vijf schuifbalken: inkomen, werkdagen,
                spaarquote, rendement en uitgaven. Kies een snelpreset
                (optimistisch, verwacht, pessimistisch) of stel alles handmatig in.
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
                "Ga naar De Horizon \u2192 What-If",
                "Versleep de schuifbalken voor inkomen, werkdagen, spaarquote, rendement en uitgaven",
                "Of kies een snelpreset (optimist, koershouder, zuinig) als startpunt",
                "Voeg levensgebeurtenissen toe aan je scenario om hun impact te zien",
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
                "Stel een vraag of beschrijf een situatie \u2014 Will past zich aan op de context van de pagina",
                "In een What-If: beschrijf je droom (\u201cIk wil over 5 jaar een huis kopen\u201d) en Will vertaalt het naar events",
                "Vraag om een reality-check: \u201cIs mijn plan realistisch?\u201d \u2014 Will analyseert je data en geeft eerlijk antwoord",
              ],
              tip: "Will wordt slimmer naarmate je meer data hebt. Begin met een eenvoudige vraag: \u201cWat is het belangrijkste dat ik nu kan doen?\u201d",
            }}
          />
        </ReisStapSection>
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
              Je profiel bevat de basis voor alle berekeningen: naam,
              geboortedatum, inkomen en huishoudsamenstelling. Je{" "}
              <strong>soevereiniteitsniveau</strong> (van Herstel tot Meesterschap)
              wordt automatisch berekend en ontgrendelt progressief nieuwe functies.
              In <strong>Instellingen</strong> beheer je alles vanuit \u00e9\u00e9n
              hub: notificatievoorkeuren, widget-selectie, FIRE-parameters (verwacht
              rendement, inflatie, eindstrategie), weergaveopties (typografie,
              modulekleuren) en gegevensbeheer (export, verwijdering).
            </>
          }
          howTo={{
            steps: [
              "Ga naar Identiteit \u2192 Profiel voor je persoonlijke gegevens en huishoudprofiel",
              "Ga naar Identiteit \u2192 Instellingen voor alle app-instellingen op \u00e9\u00e9n plek",
              "Sectie C (FIRE) is het belangrijkst: stel hier je verwacht rendement, inflatie en eindstrategie in",
              "Sectie D (Weergave) laat je de app personaliseren met eigen kleuren",
            ],
            tip: "Controleer je FIRE-parameters minstens jaarlijks \u2014 je verwacht rendement kan veranderen met je beleggingsstrategie.",
          }}
        />

        <GuideTopicCard
          icon={Users}
          title="Huishouden & Partner"
          color="var(--ink-2)"
          description={
            <>
              Nodig je partner uit voor een gedeeld huishouden en beheer samen je
              financi\u00ebn met respect voor individuele privacy. Per categorie
              (vermogen, schulden, inkomsten) kies je het{" "}
              <strong>zichtbaarheidsniveau</strong>: volledig (alles delen), totalen
              (alleen bedragen, geen details) of verborgen. De kostenverdeling is
              configureerbaar: gelijk of naar rato, met een primaire betaler voor
              gezamenlijke lasten.
              {" "}
              <strong>Gedeelde doelen</strong>, gezamenlijke FIRE-berekeningen en
              huishoudperspectief op je dashboard maken financieel samenwerken
              concreet. Wissel op elke pagina tussen je persoonlijke en
              huishoudperspectief.
            </>
          }
          howTo={{
            steps: [
              "Ga naar Identiteit \u2192 Delen en nodig je partner uit via e-mailadres",
              "Je partner ontvangt een uitnodigingslink en maakt een eigen account aan",
              "Stel de kostenverdeling in (50/50 of aangepast percentage) en kies de primaire betaler",
              "Configureer per categorie het privacyniveau: volledig, totalen of verborgen",
              "Wissel op elke pagina tussen persoonlijk en huishoudperspectief via de toggle",
            ],
            tip: "Bespreek samen welk privacyniveau jullie prettig vinden voordat je het instelt. Financieel vertrouwen groeit geleidelijk.",
          }}
        />

        <GuideTopicCard
          icon={Smartphone}
          title="Mobiel"
          color="var(--ink-2)"
          description={
            <>
              TriFinity is volledig geoptimaliseerd voor je telefoon. De{" "}
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
