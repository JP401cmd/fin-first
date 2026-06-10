// Feature-roadmap voor TriFinity, afgeleid uit het marktonderzoek van juni 2026
// (deep-research: 103 agenten, 21 bronnen, 25 claims adversarieel geverifieerd —
// 20 bevestigd, 5 weerlegd). Single source of truth voor de beheerpagina
// /beheer/roadmap. Read-only naslag; geen runtime-effecten elders.
//
// De belofte van TriFinity — "Vrijheid door met inzicht en grip keuzes te maken
// voor nu en de toekomst" — valt uiteen in vier toetsstenen (PromisePillar).
// Elke roadmap-kandidaat is gekoppeld aan de pijler(s) waaraan hij bijdraagt.

export type PromisePillar = 'inzicht' | 'grip' | 'keuzes' | 'toekomst'

export type RoadmapEffort = 'activeren' | 'klein' | 'middel' | 'groot'

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
}

export const ROADMAP_PROMISE =
  'Vrijheid door met inzicht en grip keuzes te maken voor nu en de toekomst.'

export const ROADMAP_RESEARCH_META = {
  period: 'Juni 2026',
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
      'Vier kandidaten die direct op de vrijheidsbelofte scoren en op bestaand fundament voortbouwen.',
    items: [
      {
        mark: 'A',
        title: 'PSD2-bankkoppeling live brengen',
        pillars: ['inzicht'],
        effort: 'activeren',
        summary:
          'Automatische multibank-koppeling — transacties stromen vanzelf binnen, geen handmatige import meer.',
        market:
          'Dé NL-baseline: Dyme (500k+, DNB-licentie) koppelt alle grote banken; MijnGeldzaken categoriseert ~90% automatisch. Het vertrek van Grip (dec 2022) liet een gat. Zonder moeiteloze data-instroom kost "inzicht" handwerk — daarop wint MijnGeldzaken nu van ons.',
        build:
          'De GoCardless-flow bestaat al (components/app/bank-connect/, app/api/bank-connect/). Blokkade: de Connected-tier staat op available:false met prijs-TODO (lib/subscription-catalog.ts). Eerst een productbeslissing: prijs, bankdekking en licentiemodel — daarna activeren, niet bouwen.',
      },
      {
        mark: 'B',
        title: 'Vaste-lasten-actielaag: "vrijheid terugkopen"',
        pillars: ['grip', 'keuzes'],
        effort: 'middel',
        summary:
          'Niet alleen vaste lasten detecteren (doen we al) maar erop handelen: opzeggen, onderhandelen, besparing → vrijheidsdagen.',
        market:
          'Dyme bewijst dat de waarde in de áctie zit: opzeg- en onderhandelservice (€8,99/mnd + 30% succes-fee). Onze detectie bestaat al — het onvervulde deel is de actie. "Dit abonnement opzeggen = X vrijheidsdagen per jaar terug" past exact in de filosofie.',
        build:
          'Opzeg-acties per vaste last via de aandachtspunten-bus (lib/aandachtspunten.ts) + acties-API (/api/ai/actions): opzeglink/sjabloon, status volgen, gerealiseerde besparing omrekenen naar vrijheidstijd. Een eigen opzeg-/onderhandelservice vergt juridische check; verwijzing/checklist kan direct.',
      },
      {
        mark: 'C',
        title: 'Partner-samenwerkingslaag (Monarch-pariteit)',
        pillars: ['keuzes', 'grip'],
        effort: 'groot',
        summary:
          'Samen geldkeuzes maken — de interactieve laag bovenop het huishouden-fundament.',
        market:
          'Monarch is dé partner-benchmark met drie functies die wij missen: (1) transactie-review-tagging tussen partners, (2) een maandelijkse geld-check-in voor twee met samenvattend rapport, (3) gedeelde doelen waaraan beide partners vanaf gescheiden rekeningen bijdragen. Huishoudfinanciën zijn een gevestigde categorie (Spendee, Buddy 2,5M+).',
        build:
          'Bouwt op het huishouden-fundament (partner-koppeling, 3 perspectieven), de check-in + gespreksstarters-engine (huishouden-voice), goals en de perspectief-loaders.',
      },
      {
        mark: 'D',
        title: 'Plan-brede slagingskans',
        pillars: ['toekomst', 'grip'],
        effort: 'middel',
        summary:
          'Eén getal: hoe groot is de kans dat je hele plan slaagt? Beweegt mee met elk what-if.',
        market:
          'ProjectionLab-standaard. Onze Monte Carlo is nu fase-gebonden (lib/phase-monte-carlo.ts) i.p.v. één overkoepelende kans op het hele plan.',
        build:
          'Koppelen aan runUnifiedProjection zodat elk what-if en life-event de slagingskans direct beweegt.',
      },
    ],
  },
  {
    id: 'tier-2',
    rank: 'Tier 2',
    label: 'Verdieping van de toekomst-belofte',
    blurb:
      'Vijf uitbreidingen die de toekomst- en samenwerkingslaag dieper maken; minder urgent, sterke NL-kans.',
    items: [
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
        mark: 'F',
        title: 'Pensioenaggregatie 2e pijler',
        pillars: ['toekomst', 'inzicht'],
        effort: 'groot',
        summary:
          'mijnpensioenoverzicht.nl-data importeren — dé NL-FIRE-pijn wegnemen.',
        market:
          'Tweede-pijler-pensioen is de kernpijn van elke FIRE-berekening. FIDA maakt gereguleerde toegang ~2029-30 mogelijk; een importpad levert nu al waarde.',
        build:
          'De rekenbasis bestaat (annuitizePension, pension-tak in lifeEventsToCashflows). Gap = data-instroom: XML/PDF-import naast de bestaande UPO-AI-parsing.',
      },
      {
        mark: 'G',
        title: 'Sankey-cashflowdiagram',
        pillars: ['inzicht'],
        effort: 'middel',
        summary:
          '"Waar stroomt je tijd heen": inkomen → potten → vaste lasten / sparen / vrijheid.',
        market: 'ProjectionLab-restgap; visueel sterk middel voor cashflow-inzicht.',
        build: 'Bouwt op lib/cashflow-forecast-math.ts + transaction-insights.',
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
        market: 'ProjectionLab-restgap.',
        build: 'Bouwt op de bestaande holdings.',
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
    title: 'AI-moat: diepte, geen breedte',
    body:
      'OpenAI acqui-hirede Hiro (apr 2026) en Roi (okt 2025) — generieke AI-geldcoaching commoditiseert naar platformniveau. Onze verdedigbare positie is NL-datadiepte (Box 1/2/3, pensioen, huishouden) plus de vrijheidsfilosofie als consistent productprincipe, niet de chat zelf.',
  },
  {
    title: 'PSD3/FIDA-radar',
    body:
      'PSD3/PSR (~2028) maakt bankkoppelingen betrouwbaarder en goedkoper; FIDA (~2029-30) opent gereguleerde toegang tot beleggings-, pensioen- en verzekeringsdata. Investeren in bankconnectiviteit rendeert richting 2028; pensioen-/verzekeringsaggregatie wordt op termijn dé unieke kans (2e pijler = lidstaat-opt-in).',
  },
  {
    title: 'Vervolgonderzoek',
    body:
      'Grootste blinde vlek: directe r/DutchFIRE-wensen (geen forum-evidence overleefde verificatie). Ook open: Flow’s regelgebaseerde automatisering ("zodra salaris binnen: X% naar sparen") — wij kunnen geen geld verplaatsen, maar dit kan als advies-regel via acties.',
  },
]

// Markt-geverifieerde sterktes: niet opnieuw bouwen. Twee "TriFinity mist
// abonnementdetectie"-claims werden in verificatie weerlegd (0-3).
export const ROADMAP_VALIDATED_STRENGTHS: string[] = [
  'Abonnement- & vaste-lastendetectie',
  'Handmatige invoer + eigen categorieën',
  'Scenario-diepte (≥ MijnGeldzaken)',
  'Monte Carlo & backtesting',
  'NL-belastingdiepte (uniek sterk)',
  'Maandelijkse check-ins',
  'Huishouden-fundament',
  'Box 3-tegenbewijs',
]

export interface RoadmapSource {
  label: string
  url: string
}

export const ROADMAP_SOURCES: RoadmapSource[] = [
  { label: 'Monarch — voor stellen (partner-features)', url: 'https://www.monarch.com/for-couples' },
  { label: 'Dyme review (PSD2 + opzegservice)', url: 'https://financer.nl/persoonlijke-financien/dyme-app-review/' },
  { label: 'MijnGeldzaken — financieel plan & scenario’s', url: 'https://www.mijngeldzaken.nl/watishet/financieel-plan' },
  { label: 'ProjectionLab review (FIRE-planner-standaard)', url: 'https://marriagekidsandmoney.com/projectionlab-review/' },
  { label: 'Grip stopt — alternatieven (NL-markt)', url: 'https://www.iexgeld.nl/Artikel/760160/Grip-app-stopt-dit-zijn-de-alternatieven.aspx' },
  { label: 'PSD3/PSR & FIDA-trends (EY)', url: 'https://www.ey.com/en_gl/insights/financial-services/emeia/how-psd3-and-psr-will-shape-trends-in-eu-financial-services' },
  { label: 'OpenAI neemt Hiro over (AI-coaching-trend)', url: 'https://www.americanbanker.com/news/openai-acquires-personal-finance-startup-hiro' },
  { label: 'Honeydue review (per-rekening privacy)', url: 'https://www.nerdwallet.com/finance/learn/honeydue-app-review' },
]
