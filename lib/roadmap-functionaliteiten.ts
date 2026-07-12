// Feature-roadmap voor TriFinity. Basis: het marktonderzoek van juni 2026;
// ververst in juli 2026 (deep-research: 103 agents, 21 bronnen, 25 claims
// adversarieel geverifieerd — 20 bevestigd, 5 weerlegd) en deze keer óók mét
// codebase-verificatie van de TriFinity-kant. Volledige bron:
// docs/marktonderzoek-functionaliteiten-jul2026.md. Single source of truth voor
// de beheerpagina /beheer/roadmap. Read-only naslag; geen runtime-effecten elders.
//
// De belofte van TriFinity — "Vrijheid door met inzicht en grip keuzes te maken
// voor nu en de toekomst" — valt uiteen in vier toetsstenen (PromisePillar).
// Elke roadmap-kandidaat is gekoppeld aan de pijler(s) waaraan hij bijdraagt.

export type PromisePillar = 'inzicht' | 'grip' | 'keuzes' | 'toekomst'

export type RoadmapEffort = 'activeren' | 'klein' | 'middel' | 'groot' | 'gerealiseerd'

export interface RoadmapItem {
  /** Lettermerk uit het onderzoeksrapport (A–I). */
  mark: string
  title: string
  /** Pijler(s) van de belofte waaraan dit bijdraagt. */
  pillars: PromisePillar[]
  effort: RoadmapEffort
  /** Wat het is, in één zin. */
  summary: string
  /** Marktbasis: de geverifieerde bevinding die het gat aantoont. */
  market: string
  /** Bouwbenadering — waar het in de codebase op voortbouwt. */
  build: string
}

export interface RoadmapTier {
  id: string
  /** Korte rangaanduiding, bv. "Tier 1". */
  rank: string
  label: string
  blurb: string
  items: RoadmapItem[]
}

export interface PromisePillarMeta {
  label: string
  hint: string
  /** Badge-styling (border + bg + tekst), conform release-notes-conventie. */
  badge: string
  dot: string
}

export const PROMISE_PILLARS: Record<PromisePillar, PromisePillarMeta> = {
  inzicht: {
    label: 'Inzicht',
    hint: 'Zie wat er is',
    badge: 'bg-kern-50 text-kern-700 border-kern-200',
    dot: 'bg-kern-500',
  },
  grip: {
    label: 'Grip',
    hint: 'Kunnen sturen',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  keuzes: {
    label: 'Keuzes',
    hint: 'Handelingsopties',
    badge: 'bg-wil-50 text-wil-700 border-wil-200',
    dot: 'bg-wil-500',
  },
  toekomst: {
    label: 'Toekomst',
    hint: 'Nu én later',
    badge: 'bg-horizon-50 text-horizon-700 border-horizon-200',
    dot: 'bg-horizon-500',
  },
}

export const ROADMAP_EFFORT_LABEL: Record<RoadmapEffort, string> = {
  activeren: 'Activeren',
  klein: 'Klein',
  middel: 'Middel',
  groot: 'Groot',
  gerealiseerd: 'Gerealiseerd',
}

export const ROADMAP_PROMISE =
  'Vrijheid door met inzicht en grip keuzes te maken voor nu en de toekomst.'

export const ROADMAP_RESEARCH_META = {
  period: 'Juli 2026 (refresh van juni 2026)',
  agents: 103,
  sources: 21,
  claimsVerified: 25,
  claimsConfirmed: 20,
  claimsRefuted: 5,
}

export const ROADMAP_TIERS: RoadmapTier[] = [
  {
    id: 'tier-1',
    rank: 'Tier 1',
    label: 'Nu — grootste bijdrage aan de belofte',
    blurb:
      'Vier kandidaten die direct op de vrijheidsbelofte scoren en op bestaand fundament voortbouwen — waarvan één nieuw uit het juli-onderzoek.',
    items: [
      {
        mark: 'A',
        title: 'PSD2-bankkoppeling live brengen',
        pillars: ['inzicht'],
        effort: 'activeren',
        summary:
          'Automatische multibank-koppeling — transacties stromen vanzelf binnen, geen handmatige import meer.',
        market:
          'Adoptie-referentie in NL: Dyme is sep 2025 overgenomen door insurtech RISK (niet gestopt) en telt 600.000 ooit-gekoppelde bankrekeningen en 150.000 maandelijks actieven. Moeiteloze data-instroom is de baseline; zonder automatische koppeling kost "inzicht" handwerk.',
        build:
          'Het is een TrueLayer-flow (components/app/bank-connect/, app/api/bank-connect/) — de eerdere GoCardless-aanduiding was drift. De live-defecten zijn 10 juli 2026 gefixt; de resterende blokkade is een productbeslissing, geen bouwwerk: prijs, bankdekking en licentiemodel. De Connected-tier staat daarom nog op available:false (lib/subscription-catalog.ts) — eerst beslissen, dan activeren.',
      },
      {
        mark: 'J',
        title: 'NL fiscale-strategie-optimizer',
        pillars: ['keuzes', 'toekomst'],
        effort: 'groot',
        summary:
          'Van belasting berekenen naar belasting optimaliseren: doelgericht Box 3-peildatum, jaarruimte-benutting, fiscale partnerverdeling en onttrekkingsvolgorde doorrekenen, uitgedrukt in vrijheidsdagen.',
        market:
          'ProjectionLab v4.6.0 (apr 2026) shipte een tax-strategy-engine: kies een doel → de simulatie optimaliseert Roth-conversies en withdrawal-volgorde, met Optimize (beam search) en een Compare-heatmap van strategieën. Boldin heeft dezelfde diepte via de Roth Conversion Explorer. De NL-invulling ligt open.',
        build:
          'Alle motoren bestaan al (lib/box1-tax.ts, lib/box3-data.ts, jaarruimte incl. factor A, horizon-kernel) — het gat is de optimalisatielaag erbovenop; koppelt aan F.',
      },
      {
        mark: 'C',
        title: 'Partner-samenwerkingslaag (Monarch-pariteit)',
        pillars: ['keuzes', 'grip'],
        effort: 'groot',
        summary:
          'Samen geldkeuzes maken — de interactieve laag bovenop het huishouden-fundament.',
        market:
          'Monarch shipte Shared Views (okt 2025): yours/mine/ours-labels op transactieniveau plus regel-automatisering van die labels. Ons 3-perspectievenmodel en transactie-ownership bestaan al; de resterende gap is smal: regel-automatisering van eigenaarschap, transactie-review-tagging tussen partners en de gezamenlijke maand-check-in met rapport.',
        build:
          'Bouwt op het huishouden-fundament (partner-koppeling, 3 perspectieven), de check-in + gespreksstarters-engine (huishouden-voice), goals en de perspectief-loaders.',
      },
      {
        mark: 'F',
        title: 'Pensioenaggregatie 2e pijler',
        pillars: ['toekomst', 'inzicht'],
        effort: 'groot',
        summary:
          'mijnpensioenoverzicht.nl-data importeren — dé NL-FIRE-pijn wegnemen.',
        market:
          'Tweede-pijler-pensioen is de kernpijn van elke FIRE-berekening. Boldin bewijst dat pensioen-stacking en fiscale optimalisatie één samenhangende laag vormen (dec 2025–feb 2026 doorontwikkeld); samen met J vormt dit de NL-kans. FIDA maakt gereguleerde toegang ~2029-30 mogelijk; een importpad levert nu al waarde.',
        build:
          'De rekenbasis bestaat (annuitizePension, pension-tak in lifeEventsToCashflows). Gap = data-instroom: XML/PDF-import naast de bestaande UPO-AI-parsing.',
      },
    ],
  },
  {
    id: 'tier-2',
    rank: 'Tier 2',
    label: 'Verdieping van de toekomst-belofte',
    blurb:
      'Zes uitbreidingen die de toekomst- en samenwerkingslaag dieper maken; minder urgent, sterke NL-kans.',
    items: [
      {
        mark: 'K',
        title: 'Plan-als-document',
        pillars: ['inzicht', 'toekomst'],
        effort: 'middel',
        summary:
          'Eén deelbaar/printbaar totaalplan — aannames, projectie, slagingskans en inzichten als één document, voor je partner of een adviseur.',
        market:
          'Boldin lanceerde 6 juli 2026 "View Full Plan": één document-stijl weergave van het volledige plan, met kerncijfers, grafieken en inzichten verweven.',
        build:
          'Ons persoonlijk-plan-rapport (lib/persoonlijk-plan-data.ts, /rapportages/persoonlijk-plan) dekt bewust alleen de input-zijde; uitbreiden met kernel-projectie + slagingskans + inzichten.',
      },
      {
        mark: 'L',
        title: 'Briefing-e-mail-loop',
        pillars: ['grip'],
        effort: 'klein',
        summary:
          'De wekelijkse briefing ook per e-mail, met een brug terug de app in ("bespreek met Will").',
        market:
          'Monarchs Weekly Recap (dec 2025) sluit de loop dashboard → e-mail → AI-vervolgvraag; dé retentie-mechaniek.',
        build:
          'De briefing-snapshot bestaat (lib/briefing/**); e-mail wordt nu alleen voor huishouduitnodigingen gebruikt (lib/email.ts) — kanaal toevoegen + notificatie-voorkeur.',
      },
      {
        mark: 'M',
        title: 'Flex-spending-gedragsregels',
        pillars: ['grip', 'toekomst'],
        effort: 'klein',
        summary:
          'Regels die de must/nice-splitsing koppelen aan portefeuilleprestatie in de projectie ("markt −X% → discretionair −Y%").',
        market:
          'ProjectionLab Flex Spending (okt 2025): essential/discretionary-splitsing plus gedragsregels die bestedingen dynamisch aanpassen op portefeuilleprestatie.',
        build:
          'Bouwstenen liggen klaar — must/nice bestaat op budgetten (budget_type), Guyton-Klinger-guardrails in lib/withdrawal-strategy.ts; alleen de koppeling ontbreekt.',
      },
      {
        mark: 'E',
        title: 'Risico-APK ("financiële APK")',
        pillars: ['toekomst', 'grip'],
        effort: 'middel',
        summary:
          'Wat als — overlijden partner, arbeidsongeschiktheid, werkloosheid, langdurige zorg. Vrijheidsimpact in beeld.',
        market:
          'MijnGeldzaken heeft de "financiële APK"; ProjectionLabs zorglaag is US-centrisch — NL-terrein ligt open.',
        build:
          'Adapter op de aandachtspunten-bus + what-if/life-events. Sterk gekoppeld aan huishouden (partner-overlijden = vrijheidsimpact).',
      },
      {
        mark: 'H',
        title: 'Per-rekening zichtbaarheid in huishouden',
        pillars: ['keuzes'],
        effort: 'klein',
        summary:
          'Honeydue-model — per rekening kiezen wat je partner ziet (alles / alleen saldo / niets).',
        market:
          'Dekt het privacy-spectrum tussen Monarchs volledige transparantie en gescheiden financiën. Honeydue zelf is maintenance-mode — design-referentie.',
        build: 'Verfijning op de bestaande 3 perspectieven (eigen / huishouden / partner).',
      },
      {
        mark: 'I',
        title: 'Portefeuille-allocatiemodellering',
        pillars: ['toekomst'],
        effort: 'middel',
        summary: 'Asset-mix en account-types meenemen in de projecties.',
        market:
          'ProjectionLab-restgap, deels gerealiseerd: rendement per categorie zit sinds juli 2026 in het wat-als-lab.',
        build:
          'Rendement per categorie bestaat al (lib/horizon/toekomst-scenario.ts); de rest is asset-mix en account-types structureel in de projecties, bovenop de bestaande holdings.',
      },
    ],
  },
  {
    id: 'gerealiseerd',
    rank: 'Gerealiseerd',
    label: 'Gebouwd sinds het juni-onderzoek',
    blurb:
      'Drie gap-items uit het juni-onderzoek zijn inmiddels gebouwd en code-geverifieerd (juli 2026).',
    items: [
      {
        mark: 'B',
        title: 'Vaste-lasten-actielaag: "vrijheid terugkopen"',
        pillars: ['grip', 'keuzes'],
        effort: 'gerealiseerd',
        summary:
          'Vaste lasten detecteren én erop handelen: opzeggen via een opzeg-actie in de actielijst, met de besparing als vrijheidsdagen — gebouwd.',
        market:
          'Boldin/Rocket-Money-achtige actielaag. Het eerder aangehaalde Dyme-€40M-cijfer is in het juli-onderzoek weerlegd (1-2) en vervalt als onderbouwing.',
        build:
          'OpzegModal (components/app/opzeg-modal.tsx) + opzeg-acties via de actielijst (lib/cancellation-types.ts).',
      },
      {
        mark: 'D',
        title: 'Plan-brede slagingskans',
        pillars: ['toekomst', 'grip'],
        effort: 'gerealiseerd',
        summary:
          'Eén getal: de kans dat je hele plan slaagt, meebewegend met elk what-if — gebouwd.',
        market: 'ProjectionLab-standaard.',
        build:
          'Kernel-Monte-Carlo met successProbability over het hele plan (lib/horizon-kernel/wrappers/mc.ts), geconsumeerd in horizon/whatif-UI en geregistreerd in lib/architecture/calculations.ts.',
      },
      {
        mark: 'G',
        title: 'Sankey-cashflowdiagram',
        pillars: ['inzicht'],
        effort: 'gerealiseerd',
        summary:
          '"Waar stroomt je tijd heen": inkomen → potten → vaste lasten / sparen / vrijheid — gebouwd.',
        market: 'Boldin shipte 23 feb 2026 dezelfde standaard.',
        build:
          'Drie oppervlakken — horizon-jaardetail (components/app/horizon/horizon-cashflow-sankey.tsx), budget (budget-sankey.tsx), rekening (cash-account-view.tsx).',
      },
    ],
  },
]

export interface RoadmapStrategicNote {
  title: string
  body: string
}

export const ROADMAP_STRATEGIC_NOTES: RoadmapStrategicNote[] = [
  {
    title: 'ProjectionLab-NL-radar',
    body:
      'ProjectionLab modelleert sinds v4.4.0 (okt 2025) Nederlandse Box 3 met forfaitaire rendementen, gratis, met een eigen /netherlands-landingspagina — nog zónder jaarruimte, tegenbewijs of Box 1-diepte. Onze fiscale voorsprong staat, maar is niet langer onbetreden terrein; monitoren op uitbreiding, want dat zou onze kern-differentiator raken.',
  },
  {
    title: 'Planning als betaalmuur',
    body:
      'Monarch Plus ($199/jr, apr 2026) bewijst betalingsbereidheid voor scenario- en pensioenplanning; onze planning-diepte (wat-als-lab, Monte Carlo, backtesting) is nu gratis, terwijl de add-ons (AI €9 / Connected €4) juist níet onze sterkste laag monetariseren. Heroverweeg de tier-indeling vóór de Polar-lancering.',
  },
  {
    title: 'AI-moat: diepte, geen breedte',
    body:
      'OpenAI acqui-hirede Hiro (apr 2026) en Roi (okt 2025) — generieke AI-geldcoaching commoditiseert naar platformniveau. Onze verdedigbare positie is NL-datadiepte (Box 1/2/3, pensioen, huishouden) plus de vrijheidsfilosofie als consistent productprincipe, niet de chat zelf. Origin lanceerde sep 2025 AI-advies via een echte SEC-geregistreerde RIA — gereguleerd advies is een ander vak; onze Wft-grens blijft de juiste keuze.',
  },
  {
    title: 'PSD3/FIDA-radar',
    body:
      'PSD3/PSR (~2028) maakt bankkoppelingen betrouwbaarder en goedkoper; FIDA (~2029-30) opent gereguleerde toegang tot beleggings-, pensioen- en verzekeringsdata. Investeren in bankconnectiviteit rendeert richting 2028; pensioen-/verzekeringsaggregatie wordt op termijn dé unieke kans (2e pijler = lidstaat-opt-in).',
  },
  {
    title: 'Community-onderzoek (12 jul uitgevoerd)',
    body:
      'De r/DutchFIRE-blinde-vlek is 12 juli gedicht via direct bronnenonderzoek (browser-route; websearch bereikt Reddit niet). Uitkomst: spreadsheets domineren, de Geldnerd-calculator is vier jaar onbeheerd (migratie-kans), en vier community-gaps zijn gedocumenteerd maar bewust nog niet op de backlog: DEGIRO-import, per-jaar-overrides in de projectie, partner-overlijden-scenario (item E) en de Box 3-stelseltransitie 2026→2028. Zie §3 spoor 4 in docs/marktonderzoek-functionaliteiten-jul2026.md. Te monitoren NL-concurrent: Early Retirement Calc (heeft het werkelijk-rendement-stelsel al).',
  },
]

// Markt-geverifieerde sterktes: niet opnieuw bouwen. Twee "TriFinity mist
// abonnementdetectie"-claims werden in verificatie weerlegd (0-3). In juli 2026
// zijn deze sterktes óók tegen de codebase geverifieerd: VPW is bij migratie
// 20260703115225 bewust in `static` samengevoegd, en ratcheting ontbreekt als
// benoemde onttrekkingsoptie — bewust geen prioriteit.
export const ROADMAP_VALIDATED_STRENGTHS: string[] = [
  'Abonnement- & vaste-lastendetectie',
  'Handmatige invoer + eigen categorieën',
  'Scenario-diepte (≥ MijnGeldzaken)',
  'Monte Carlo & backtesting',
  'NL-belastingdiepte (uniek sterk)',
  'Maandelijkse check-ins',
  'Huishouden-fundament',
  'Box 3-tegenbewijs',
  'Onttrekkingsstrategieën ín de engine (Guyton-Klinger guardrails)',
  'Guardrail-kompas (≙ Boldins Spending Guardrails Insight)',
]

export interface RoadmapSource {
  label: string
  url: string
}

export const ROADMAP_SOURCES: RoadmapSource[] = [
  { label: 'ProjectionLab review (FIRE-planner-standaard)', url: 'https://marriagekidsandmoney.com/projectionlab-review/' },
  { label: 'ProjectionLab changelog (Box 3-modellering + NL-landing)', url: 'https://projectionlab.com/changelog' },
  { label: 'ProjectionLab v4.6.0 — fiscale-strategie-optimizer', url: 'https://projectionlab.com/blog/whats-new-v460' },
  { label: 'ProjectionLab flex-spending (gedragsregels)', url: 'https://projectionlab.com/help/flex-spending' },
  { label: 'Boldin release notes (Sankey, guardrails, View Full Plan)', url: 'https://www.boldin.com/retirement/release-notes/' },
  { label: 'Monarch — voor stellen (partner-features)', url: 'https://www.monarch.com/for-couples' },
  { label: 'Monarch — wat is nieuw (Forecasting, premium)', url: 'https://www.monarch.com/whats-new' },
  { label: 'Monarch Shared Views (eigenaarschap + regels)', url: 'https://www.monarch.com/blog/shared-views' },
  { label: 'Monarch Winter Release (AI Assistant + Weekly Recap)', url: 'https://www.monarch.com/blog/winter-release' },
  { label: 'OpenAI neemt Hiro over (AI-coaching-trend)', url: 'https://www.americanbanker.com/news/openai-acquires-personal-finance-startup-hiro' },
  { label: 'Honeydue review (per-rekening privacy)', url: 'https://www.nerdwallet.com/finance/learn/honeydue-app-review' },
  { label: 'PSD3/PSR & FIDA-trends (EY)', url: 'https://www.ey.com/en_gl/insights/financial-services/emeia/how-psd3-and-psr-will-shape-trends-in-eu-financial-services' },
  { label: 'Emerce — Dyme overgenomen door RISK', url: 'https://www.emerce.nl/nieuws/dyme-verkocht-insurtech-risk-miljoenendeal' },
  { label: 'SeniorWeb — voorspelde uitgaven in bank-apps', url: 'https://www.seniorweb.nl/artikel/voorspelde-uitgaven-in-bank-apps' },
]
