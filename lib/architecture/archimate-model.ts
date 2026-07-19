// ── ArchiMate-model van TriFinity ────────────────────────────────────────────
// Het gecureerde deel van de architectuurplaat op /beheer/architectuur.
//
// Werkverdeling (zelfde filosofie als scripts/architecture/annotations.mjs):
//   - De TOPOLOGIE (lagen, elementen, relaties, toelichting) onderhoud je hier
//     met de hand. Bij een nieuw domein, een nieuwe service of integratie hoort
//     een aanpassing in dit bestand.
//   - De FEITEN (tellingen, versie, datum) komen uit docs/architecture/
//     architecture.json en worden via `buildArchimateModel(facts)` ingevuld —
//     die hoef je dus nooit handmatig bij te werken.
//
// De zes functionele modules worden rechtstreeks uit MODULE_CATALOG gegenereerd;
// FUNCTION_SERVICE_MAP is een Record<ModuleId, ...> zodat een nieuwe module een
// compile-fout geeft tot de plaat is bijgewerkt.

import { MODULE_CATALOG, type ModuleId } from '@/lib/module-registry'

// ── Types ────────────────────────────────────────────────────────────────────

export type ArchiKind =
  | 'motiv'
  | 'bizactor'
  | 'bizproc'
  | 'appsvc'
  | 'appcomp'
  | 'appfunc'
  | 'tech'
  | 'data'
  | 'ext'
  | 'group'

export type ArchiRelType = 'assignment' | 'composition' | 'aggregation' | 'serving' | 'realization' | 'access'

export type ArchiSide = 'L' | 'R' | 'T' | 'B'

/** Hoe informatie wordt uitgewisseld over een relatie */
export type ArchiMechanism = 'rest' | 'rpc' | 'realtime' | 'import' | 'compute' | 'process' | 'build'

/** Hoe vaak / wanneer de uitwisseling plaatsvindt */
export type ArchiCadence = 'realtime' | 'on-demand' | 'daily' | 'weekly' | 'build'

export interface ArchiNode {
  id: string
  x: number
  y: number
  w: number
  h: number
  kind: ArchiKind
  title: string
  /** Toelichting in de detail-kaart */
  lead: string
  /** Tags: routes, API's, tabellen, libs */
  items: string[]
  /** Klein label linksboven in de node (bv. "in ontwikkeling") */
  badge?: string
  /** Regel onderin een container-node (tellingen) */
  note?: string
}

export interface ArchiEdge {
  id: string
  from: string
  to: string
  type: ArchiRelType
  label?: string
  fromSide: ArchiSide
  toSide: ArchiSide
  /** Override van het anker op de from/to-zijde (y bij L/R, x bij T/B) */
  fromOffset?: number
  toOffset?: number
  /** Vaste x voor het verticale middensegment (alleen L/R-routes) */
  midX?: number
  /** Expliciete tussenpunten — wint van automatische routering */
  via?: Array<[number, number]>
  /** Access-relatie in beide richtingen (lezen én schrijven) */
  readWrite?: boolean
  // ── Informatie-uitwisseling (gecureerd, getoond in de relatie-kaart) ──
  /** Wat er over de relatie stroomt, bv. "transacties + saldi" */
  payload?: string
  /** Hoe het wordt uitgewisseld */
  mechanism?: ArchiMechanism
  /** Hoe vaak / wanneer */
  cadence?: ArchiCadence
  /** API-domeinen (eerste /api-segment) die het contract vormen — de plaat
   *  toont daar live de echte routes uit architecture.json bij. */
  contractDomains?: string[]
  /** Extra toelichting op de relatie */
  note?: string
}

export interface ArchimateModel {
  width: number
  height: number
  nodes: ArchiNode[]
  edges: ArchiEdge[]
}

/** De feiten-subset uit docs/architecture/architecture.json */
export interface ArchFacts {
  version: string
  generatedDate: string
  stats: {
    api: number
    components: number
    providers: number
    tables: number
    migrations: number
  }
}

// ── Presentatie-metadata per soort ───────────────────────────────────────────
// Kleuren volgen de ArchiMate-conventie (geel=business, cyaan=applicatie,
// groen=technologie, paars=motivatie), warm afgestemd op het papier-palet.
// Vorm-notatie: services zijn afgerond (ArchiMate-betekenis), de rest scherp.

export const ARCHI_KIND_META: Record<
  ArchiKind,
  { fill: string; stroke: string; label: string; glyph: string; rounded?: boolean }
> = {
  motiv: { fill: '#e7e1f6', stroke: '#a99fe0', label: 'Motivatie', glyph: 'req' },
  bizactor: { fill: '#fcf6cf', stroke: '#cdbd6e', label: 'Business · actor', glyph: 'role' },
  bizproc: { fill: '#fcf6cf', stroke: '#cdbd6e', label: 'Business · proces', glyph: 'proc' },
  appsvc: { fill: '#c8ecd4', stroke: '#5fb487', label: 'Applicatie · service', glyph: 'svc', rounded: true },
  appcomp: { fill: '#b6eff0', stroke: '#3fb8bb', label: 'Applicatie · component', glyph: 'comp' },
  appfunc: { fill: '#dbf6f6', stroke: '#6fcccd', label: 'Applicatie · functie (module)', glyph: 'func' },
  tech: { fill: '#d2efe9', stroke: '#5cab9d', label: 'Technologie · service', glyph: 'tech', rounded: true },
  data: { fill: '#d7e9fb', stroke: '#86b1e6', label: 'Data · object', glyph: 'data' },
  ext: { fill: '#e7e9ee', stroke: '#9aa3b2', label: 'Externe partij', glyph: 'node' },
  group: { fill: '#f1f0ec', stroke: '#bdbab2', label: 'Groep', glyph: 'none' },
}

export const ARCHI_REL_NL: Record<ArchiRelType, string> = {
  assignment: 'Voert uit',
  composition: 'Bevat',
  aggregation: 'Bestaat uit',
  serving: 'Bedient',
  realization: 'Realiseert',
  access: 'Leest / schrijft',
}

export const ARCHI_MECHANISM_NL: Record<ArchiMechanism, string> = {
  rest: 'REST-route',
  rpc: 'Postgres RPC',
  realtime: 'Realtime-subscriptie',
  import: 'Bestand-import',
  compute: 'In-proces berekening',
  process: 'Bedrijfsproces',
  build: 'Build-time',
}

export const ARCHI_CADENCE_NL: Record<ArchiCadence, string> = {
  realtime: 'Realtime',
  'on-demand': 'Op verzoek',
  daily: 'Dagelijks',
  weekly: 'Wekelijks',
  build: 'Build-time',
}

// ── Module → service-koppeling ───────────────────────────────────────────────
// Record over ModuleId: een nieuwe module in MODULE_CATALOG compileert pas
// als hier (en dus op de plaat) een koppeling bestaat.

const FUNCTION_SERVICE_MAP: Record<ModuleId, string[]> = {
  budgetteren: ['as-budget'],
  vermogensregistratie: ['as-vermogen', 'as-belasting'],
  aandelenregistratie: ['as-vermogen'],
  inzicht_acties: ['as-coach'],
  toekomstplannen: ['as-planning'],
  nieuws: ['as-nieuws'],
}

// ── Geometrie-constanten ─────────────────────────────────────────────────────

const ROW0 = 250 // eerste proces/service/tech-rij
const ROW_STEP = 92
const row = (i: number) => ROW0 + i * ROW_STEP

const FN_X = 830
const FN_W = 370
const FN_H = 60
const fnRow = (i: number) => 316 + i * 72

// ── Model-opbouw ─────────────────────────────────────────────────────────────

export function buildArchimateModel(facts: ArchFacts): ArchimateModel {
  const { stats } = facts

  const nodes: ArchiNode[] = [
    // ── Motivatie ──
    {
      id: 'm-filo', x: 560, y: 36, w: 300, h: 58, kind: 'motiv',
      title: 'Geld is opgeslagen tijd',
      lead: 'De kerndriver van TriFinity. Elke euro boven €100 wordt ook getoond als vrijheidstijd — dagen, maanden, jaren financiële onafhankelijkheid.',
      items: ['Driver / principe', '€ → vrijheidstijd', 'time-framing'],
    },
    {
      id: 'm-principes', x: 880, y: 36, w: 200, h: 58, kind: 'motiv',
      title: 'Ontwerpprincipes',
      lead: 'Vijf principes die elke laag sturen: vrijheidstijd-equivalent, time-framing boven financiële termen, één filosofie over alle schermen, zichtbaarheid via module-activatie, en domeinen die in bestaande patronen pluggen.',
      items: ['5 principes', 'filosofie-consistentie'],
    },
    {
      id: 'm-soeverein', x: 1100, y: 36, w: 240, h: 58, kind: 'motiv',
      title: 'Soevereiniteitsmodel',
      lead: 'Vier fasen Recovery → Stability → Momentum → Mastery (niveau −2 t/m 6) als motivatie- en voortgangsmodel. Bepaalt géén feature-gating meer: welke functionaliteit zichtbaar is kiest de gebruiker zelf via module-activatie — het niveau motiveert en duidt voortgang.',
      items: ['Recovery', 'Stability', 'Momentum', 'Mastery', 'motivatie, geen gating'],
    },

    // ── Business ──
    {
      id: 'b-actor', x: 40, y: 140, w: 215, h: 60, kind: 'bizactor',
      title: 'Gebruiker — regisseur van eigen vrijheid',
      lead: 'De gebruiker bestuurt het proces. De app vertaalt diens financiële situatie naar vrijheidstijd en volgende stappen.',
      items: ['business actor', 'kiest eigen modules'],
    },
    {
      id: 'b-partner', x: 275, y: 140, w: 215, h: 60, kind: 'bizactor',
      title: 'Partner — gedeeld huishouden',
      lead: 'Optionele tweede actor. Na een huishouden-koppeling kijken beide partners via drie perspectieven (eigen / huishouden / partner) naar dezelfde financiën, afgeschermd met RLS.',
      items: ['huishouden-koppeling', 'perspectieven: eigen · huishouden · partner'],
    },
    {
      id: 'b-bezoeker', x: 510, y: 110, w: 200, h: 56, kind: 'bizactor',
      title: 'Bezoeker — nog geen account',
      lead: 'Anonieme bezoeker die de publieke Vrijheidscheck doet vóór er een account bestaat. Bestaat (nog) niet in auth.users; converteert via een token naar een echte gebruiker en wordt daarmee de regisseur-actor.',
      items: ['business actor', 'publiek (pre-account)', '/check'],
    },
    {
      id: 'b-main', x: 40, y: ROW0, w: 250, h: 710, kind: 'bizproc',
      title: 'Persoonlijke financiën regisseren',
      lead: 'Het overkoepelende bedrijfsproces richting volledige vrijheid. Bestaat uit acht deelprocessen die elk door een applicatieservice worden bediend.',
      items: ['composiet proces', '8 deelprocessen'],
    },
    {
      id: 'sp-registreren', x: 320, y: row(0), w: 210, h: 66, kind: 'bizproc',
      title: 'Registreren & importeren',
      lead: 'Inkomsten, uitgaven, bezittingen en beleggingen vastleggen — handmatig, via bank-import (MT940/CSV/OFX) of via bank-connect.',
      items: ['/overzicht/cashflow/transacties', 'bank-import', 'onboarding-extractie'],
    },
    {
      id: 'sp-budget', x: 320, y: row(1), w: 210, h: 66, kind: 'bizproc',
      title: 'Budgetteren',
      lead: "Budgetten opstellen en bewaken; uitgaven getoond als 'dagen deze maand'. Spaarquote en vaste lasten als hefbomen.",
      items: ['/overzicht/cashflow', '/overzicht/cashflow/budget'],
    },
    {
      id: 'sp-vermogen', x: 320, y: row(2), w: 210, h: 66, kind: 'bizproc',
      title: 'Vermogen & schulden beheren',
      lead: "Bezittingen, beleggingen en schulden beheren, waarderen en herbalanceren. Nettovermogen als 'jaren vrijheid'; schulden als vrijheid die je terugkoopt.",
      items: ['/overzicht/bezittingen', '/overzicht/schulden'],
    },
    {
      id: 'sp-belasting', x: 320, y: row(3), w: 210, h: 66, kind: 'bizproc',
      title: 'Belasting beheersen',
      lead: 'Box 1, 2 en 3 doorgronden: druk, jaarruimte, tegenbewijsregeling en aandachtspunten op de fiscale kalender.',
      items: ['/overzicht/belasting', 'box 1 · 2 · 3', 'jaarruimte', 'tegenbewijs'],
    },
    {
      id: 'sp-plannen', x: 320, y: row(4), w: 210, h: 66, kind: 'bizproc',
      title: 'Plannen & simuleren (FIRE)',
      lead: 'FIRE-doel bepalen, scenario’s en what-if doorrekenen, levensgebeurtenissen en opnamestrategie op de tijdas.',
      items: ['/toekomst', 'doelen · gebeurtenissen · voorkeuren · rekenhulp'],
    },
    {
      id: 'sp-inzicht', x: 320, y: row(5), w: 210, h: 66, kind: 'bizproc',
      title: 'Inzicht & acties',
      lead: "Aanbevelingen, volgende stappen, check-ins en aandachtspunten — de motor achter 'wat nu te doen', met Will als coach.",
      items: ['/overzicht', 'check-ins', 'aandachtspunten', 'Vraag Will'],
    },
    {
      id: 'sp-nieuws', x: 320, y: row(6), w: 210, h: 66, kind: 'bizproc',
      title: 'Geïnformeerd blijven',
      lead: 'Gepersonaliseerd financieel nieuws, de wekelijkse briefing en het berichtencentrum.',
      items: ['/nieuws', '/berichten', 'briefing op /overzicht'],
    },
    {
      id: 'sp-delen', x: 320, y: row(7), w: 210, h: 66, kind: 'bizproc',
      title: 'Delen & rapporteren',
      lead: 'Rapporten en snapshots, de deelbare freedom-card en het uitnodigen van een partner in het huishouden.',
      items: ['/rapportages', 'freedom-card', 'huishouden-uitnodiging'],
    },
    {
      id: 'sp-vrijheidscheck', x: 722, y: 110, w: 200, h: 56, kind: 'bizproc',
      title: 'Vrijheidscheck doen',
      lead: 'Publiek instroomproces (geen functionele module): een bezoeker doet anoniem een korte intake, krijgt server-berekend een Vrijheidsrapport en converteert daarna naar een account. Dit is de voordeur naar het hoofdproces, niet zelf een deel ervan.',
      items: ['/check', 'anonieme intake', 'rapport', 'conversie naar account'],
    },

    // ── Applicatieservices ──
    {
      id: 'as-import', x: 560, y: row(0), w: 220, h: 66, kind: 'appsvc',
      title: 'Import- & koppeldienst',
      lead: 'Import en synchronisatie van transacties, saldi en holdings uit banken, exchanges en bestanden. Fundament-dienst, module-onafhankelijk. Categorisatie kan optioneel lokaal (desktop, WebGPU) i.p.v. via de cloud-AI-gateway lopen — review-UI-only, fail-closed zonder cloud-fallback (ADR 0043).',
      items: ['/api/bank-connect', '/api/import', '/api/recurring', 'lib/parsers'],
    },
    {
      id: 'as-budget', x: 560, y: row(1), w: 220, h: 66, kind: 'appsvc',
      title: 'Budgetteringsdienst',
      lead: 'Budgetten, varianties, trends en dagelijks uitgaventempo.',
      items: ['/api/budgets', '/api/budget-trends', '/api/budget-variance'],
    },
    {
      id: 'as-vermogen', x: 560, y: row(2), w: 220, h: 66, kind: 'appsvc',
      title: 'Vermogens- & beleggingsdienst',
      lead: 'Bezittingen, schulden, holdings, dividenden, koersen en herbalancering.',
      items: ['/api/assets', '/api/debts', '/api/holdings', '/api/crypto', '/api/prices'],
    },
    {
      id: 'as-belasting', x: 560, y: row(3), w: 220, h: 66, kind: 'appsvc',
      title: 'Belastinginzichtendienst',
      lead: 'Rekenmotoren en inzichten voor box 1/2/3, jaarruimte, tegenbewijsregeling en de fiscale kalender.',
      items: ['/api/belasting/*', 'lib/box1-tax', 'lib/box3-tegenbewijs', 'lib/tax-overview'],
    },
    {
      id: 'as-planning', x: 560, y: row(4), w: 220, h: 66, kind: 'appsvc',
      title: 'Planningsdienst (FIRE)',
      lead: 'FIRE-doelrekening, unified projection, scenario’s, what-if en opnamestrategie.',
      items: ['/api/fire-settings', '/api/scenarios', '/api/whatif', 'lib/fire-simulation'],
    },
    {
      id: 'as-coach', x: 560, y: row(5), w: 220, h: 66, kind: 'appsvc',
      title: 'Inzicht- & coachingsdienst',
      lead: 'Will (AI-coach), aanbevelingen, volgende stappen, aandachtspunten-bus en de briefing-kaarten.',
      items: ['/api/ai/*', '/api/briefing', '/api/next-steps', 'lib/coach-suggestions'],
    },
    {
      id: 'as-nieuws', x: 560, y: row(6), w: 220, h: 66, kind: 'appsvc',
      title: 'Nieuws- & berichtendienst',
      lead: 'Gepersonaliseerde nieuwsfeed en het meldingen-/berichtencentrum met voorkeuren.',
      items: ['/api/news', '/api/notifications'],
    },
    {
      id: 'as-rapport', x: 560, y: row(7), w: 220, h: 66, kind: 'appsvc',
      title: 'Rapportage- & deeldienst',
      lead: 'Balans-, budget-, vermogens- en planrapporten, snapshots, export en de deelbare freedom-card. Fundament-dienst.',
      items: ['/api/report/*', '/api/snapshots', '/api/export', '/api/share'],
    },
    {
      id: 'as-huishouden', x: 560, y: row(8), w: 220, h: 66, kind: 'appsvc',
      title: 'Huishouden- & perspectiefdienst',
      lead: 'Partner-koppeling en de drie kijk-perspectieven (eigen / huishouden / partner). Dwarsdoorsnijdend: bezittingen, schulden, cashflow, belasting en FIRE lezen erdoorheen via RLS-veilige RPC’s.',
      items: ['/api/household/*', 'perspectief-loaders', 'RLS + RPC'],
    },
    {
      id: 'as-vrijheidscheck', x: 934, y: 110, w: 215, h: 56, kind: 'appsvc',
      title: 'Vrijheidscheck-dienst',
      lead: 'Bedient de publieke Vrijheidscheck-funnel: anonieme intake (incl. levensgebeurtenissen, per-asset rendement en pensioen-uitgaven) valide + versleuteld wegschrijven, het Vrijheidsrapport server-side bouwen (consumeert de bestaande rekenmotoren + nieuws-artikelen van dezelfde bron als /api/news; herberekent niets) en de conversie naar een echt account. Fundament-dienst, géén functionele module — het is een instroomproces, geen gebruiker-activeerbare capability.',
      items: ['/api/check/submit', '/api/check/activate', 'lib/check/build-report', 'lib/check/intake-to-persona', 'lib/check/report-news', 'news_articles (read, service-role)'],
    },

    // ── Applicatiecomponent + functies (modules) ──
    {
      id: 'app-comp', x: 810, y: ROW0, w: 410, h: 526, kind: 'appcomp',
      title: 'TriFinity-applicatie',
      lead: 'Eén Next.js 16 / React 19-applicatie (geen aparte backend): route handlers voor de API, een gedeelde shell met providers en een PWA-laag via Serwist. AI provider-agnostisch via de Vercel AI SDK. De zes functionele modules zijn door de gebruiker activeerbaar.',
      items: ['Next.js 16', 'React 19', 'Tailwind v4', 'Vercel AI SDK', 'Serwist PWA'],
      note: `${stats.api} API-routes · ${stats.components} componenten · ${stats.providers} providers`,
    },
    ...MODULE_CATALOG.map((m, i): ArchiNode => ({
      id: `fn-${m.id}`,
      x: FN_X, y: fnRow(i), w: FN_W, h: FN_H,
      kind: 'appfunc',
      title: m.label,
      lead: `${m.description}. ${m.standalone ? 'Zelfstandig activeerbaar.' : 'Vereist een andere module.'}`,
      items: [`module: ${m.id}`, ...(m.requires.length ? [`vereist: ${m.requires.join(', ')}`] : []), ...(m.requiresOneOf?.length ? [`vereist één van: ${m.requiresOneOf.join(' · ')}`] : [])],
      badge: m.inDevelopment ? 'in ontwikkeling' : undefined,
    })),

    // ── Technologie ──
    {
      id: 't-supabase', x: 1250, y: row(0), w: 185, h: 66, kind: 'tech',
      title: 'Supabase — DB/Auth/Realtime',
      lead: `PostgreSQL 17 met Row Level Security (${stats.tables} tabellen, ${stats.migrations} migraties), Supabase Auth (JWT) en Realtime-subscriptions.`,
      items: ['PostgreSQL 17', 'RLS', 'Auth (JWT)', 'Realtime'],
    },
    {
      id: 't-aigateway', x: 1250, y: row(1), w: 185, h: 66, kind: 'tech',
      title: 'AI-gateway (Vercel AI SDK)',
      lead: 'Provider-agnostische AI-laag; model omschakelbaar tussen Anthropic, OpenAI en Mistral via beheer. Optioneel pad naast — niet vervangen door — de lokale AI-runtime (t-lokale-ai): bij privacy_mode=true blokkeert een server-side 403 op /api/ai/categorize vóór modelaanroep (ADR 0043).',
      items: ['streaming + tools', 'Zod tool-schemas', 'PII-filter'],
    },
    {
      id: 't-bankconnect', x: 1250, y: row(2), w: 185, h: 66, kind: 'tech',
      title: 'Bank-connect (TrueLayer)',
      lead: 'Open banking via TrueLayer (PSD2): autorisatie, saldi en periodieke synchronisatie.',
      items: ['lib/truelayer', 'auth-link', 'sync'],
    },
    {
      id: 't-bankimport', x: 1250, y: row(3), w: 185, h: 66, kind: 'tech',
      title: 'Bank-import (MT940/CSV/OFX)',
      lead: 'Bestandsparsers met coherente duplicaatdetectie (import_hash + bank_seq) en automatische categorisatie.',
      items: ['mt940js', 'lib/parsers/*', 'pdf.js'],
    },
    {
      id: 't-marktdata', x: 1250, y: row(4), w: 185, h: 66, kind: 'tech',
      title: 'Marktdata & koppel-adapters',
      lead: 'Koersen en fundamentals (CoinGecko, FMP), exchange-/wallet-synchronisatie (Bitvavo, Coinbase, Kraken, Blockchair) en broker-synchronisatie (Trading 212).',
      items: ['exchange-adapter', 'broker-adapter', 'coingecko-client', 'fmp-client', 'wallet-sync'],
    },
    {
      id: 't-platform', x: 1250, y: row(5), w: 185, h: 66, kind: 'tech',
      title: 'Platform (Vercel + PWA)',
      lead: 'Hosting en Speed Insights op Vercel; offline-laag via Serwist service worker.',
      items: ['Vercel', 'Serwist PWA', 'Speed Insights'],
    },
    {
      id: 't-lokale-ai', x: 1250, y: row(6), w: 185, h: 66, kind: 'tech',
      title: 'Lokale AI-runtime — in-browser, WebGPU',
      lead: 'LiteRT-LM (@litert-lm/core, Early Preview) + Gemma 4 E2B web-bundel, volledig on-device: categorisatie-voorstellen verlaten het toestel niet. Sinds 19 jul 2026 runtime-swap vanaf Transformers.js/ONNX (L1-meting: betrouwbaarder + sneller op dezelfde iGPU-realiteit) — desktop-only, assistief (review-UI-only, geen automatische toepassing) blijft ongewijzigd. Dezelfde runtime bedient sinds C1b ook een experimentele lokale Will-chat (/mijn/lokale-chat): vragen over eigen cijfers, antwoord blijft on-device. Bewust géén externe-partij-relatie, in tegenstelling tot ext-claude → t-aigateway. Dat ontbreken ís de privacygarantie (ADR 0043).',
      items: ['LiteRT-LM (@litert-lm/core 0.14.0)', 'Gemma 4 E2B web-bundel', 'WebGPU', 'privacy_mode'],
    },

    // ── Data ──
    {
      id: 'data-cont', x: 700, y: 1064, w: 600, h: 280, kind: 'group',
      title: 'TriFinity-gegevens (informatieobjecten)',
      lead: 'De data-objecten waarmee de applicatie werkt — beheerd in Supabase Postgres met Row Level Security.',
      items: [],
      note: `${stats.tables} tabellen · ${stats.migrations} migraties · RLS`,
    },
    {
      id: 'do-transactie', x: 716, y: 1120, w: 138, h: 56, kind: 'data',
      title: 'Transactie',
      lead: 'Inkomsten/uitgaven, terugkerende lasten en bankrekeningen.',
      items: ['transactions', 'recurring_transactions', 'bank_accounts'],
    },
    {
      id: 'do-bezitting', x: 862, y: 1120, w: 138, h: 56, kind: 'data',
      title: 'Bezitting & schuld',
      lead: 'Bezittingen, schulden en waarderingen.',
      items: ['assets', 'debts', 'valuations'],
    },
    {
      id: 'do-holding', x: 1008, y: 1120, w: 138, h: 56, kind: 'data',
      title: 'Holding',
      lead: 'Aandelen-, fonds- en cryptoposities met koersen.',
      items: ['holdings', 'crypto_holdings', 'holding_prices'],
    },
    {
      id: 'do-budget', x: 1154, y: 1120, w: 138, h: 56, kind: 'data',
      title: 'Budget',
      lead: 'Budgetten en categorieën.',
      items: ['budgets'],
    },
    {
      id: 'do-doel', x: 789, y: 1186, w: 138, h: 56, kind: 'data',
      title: 'Doel & gebeurtenis',
      lead: 'Doelen, levensgebeurtenissen en FIRE-parameters.',
      items: ['goals', 'life_events'],
    },
    {
      id: 'do-huishouden', x: 935, y: 1186, w: 138, h: 56, kind: 'data',
      title: 'Huishouden',
      lead: 'Huishoudens, leden, uitnodigingen en budgetmodel-voorstellen (wederzijdse instemming).',
      items: ['households', 'household_members', 'household_invitations', 'household_budget_model_proposals'],
    },
    {
      id: 'do-meta', x: 1081, y: 1186, w: 138, h: 56, kind: 'data',
      title: 'Profiel & snapshots',
      lead: 'Profielen, vermogens-snapshots (dag-cadans) en de tijdstempel-vermogenshistorie per sync.',
      items: ['profiles', 'net_worth_snapshots', 'net_worth_history', 'app_settings'],
    },
    {
      id: 'do-lead', x: 716, y: 1252, w: 180, h: 56, kind: 'data',
      title: 'Lead-intake',
      lead: 'Anonieme pre-account Vrijheidscheck-intake (versleuteld) plus het server-berekende rapport-snapshot en de IP-rate-limit-tellers. Uitsluitend service-role-bereikbaar: RLS aan, géén policies (ADR 0022).',
      items: ['lead_intakes', 'intake_rate_limit'],
    },
    {
      id: 'do-contract-events', x: 904, y: 1252, w: 180, h: 56, kind: 'data',
      title: 'Contract-events',
      lead: 'Operator-telemetrie voor contractdrift van externe koppelingen en bestandsimports. Bevat uitsluitend structurele metadata (kolom-/header-namen + fingerprint-hash) — nooit financiële waarden. Superadmin-only SELECT; INSERT via RPC `increment_contract_event` (service-role, anti-spam dedup op `(kind, surface, fingerprint)`). Zichtbaar op /beheer/integraties — tab "Contracten" (ADR 0024).',
      items: ['contract_events'],
    },

    // ── Externe partijen ──
    {
      id: 'ext-group', x: 1449, y: 216, w: 192, h: 576, kind: 'group',
      title: 'Externe partijen',
      lead: 'Off-platform diensten die TriFinity inkoppelt via de technologielaag.',
      items: [],
    },
    {
      id: 'ext-supabase', x: 1465, y: 255, w: 160, h: 56, kind: 'ext',
      title: 'Supabase Cloud',
      lead: 'Beheerde Postgres, Auth en Realtime als dienst.',
      items: ['supabase.com'],
    },
    {
      id: 'ext-claude', x: 1465, y: 347, w: 160, h: 56, kind: 'ext',
      title: 'Anthropic Claude',
      lead: 'Primaire AI-provider (+ OpenAI en Mistral als alternatief, omschakelbaar in beheer).',
      items: ['@ai-sdk/anthropic', '@ai-sdk/openai', '@ai-sdk/mistral'],
    },
    {
      id: 'ext-truelayer', x: 1465, y: 439, w: 160, h: 56, kind: 'ext',
      title: 'TrueLayer (PSD2)',
      lead: 'Open-banking-aggregator voor bankrekeningen en saldi.',
      items: ['TrueLayer API'],
    },
    {
      id: 'ext-exchanges', x: 1465, y: 527, w: 160, h: 56, kind: 'ext',
      title: 'Crypto-exchanges',
      lead: 'Bitvavo, Coinbase, Kraken en on-chain via Blockchair.',
      items: ['Bitvavo', 'Coinbase', 'Kraken', 'Blockchair'],
    },
    {
      id: 'ext-brokers', x: 1465, y: 591, w: 160, h: 56, kind: 'ext',
      title: 'Aandelen-brokers',
      lead: 'Trading 212 (read-only API) en CSV-portefeuille-import voor effecten.',
      items: ['Trading 212', 'CSV-snapshot'],
    },
    {
      id: 'ext-marktdata', x: 1465, y: 655, w: 160, h: 56, kind: 'ext',
      title: 'CoinGecko / FMP',
      lead: 'Koersen en fundamentals voor crypto en effecten.',
      items: ['CoinGecko', 'FMP'],
    },
    {
      id: 'ext-vercel', x: 1465, y: 715, w: 160, h: 56, kind: 'ext',
      title: 'Vercel-platform',
      lead: 'Hosting, edge en observability.',
      items: ['Vercel'],
    },
  ]

  // ── Informatie-uitwisseling per relatie (gecureerd) ──
  // Sleutel = "from->to". Wordt automatisch op de edge geplakt in addEdge,
  // zodat de imperatieve lussen hieronder schoon blijven.
  type Enrichment = Pick<ArchiEdge, 'payload' | 'mechanism' | 'cadence' | 'contractDomains' | 'note'>
  const ENRICH: Record<string, Enrichment> = {
    // Technologie → applicatie
    't-supabase->app-comp': { payload: 'Rijen (RLS-gefilterd), auth-sessie en realtime-events', mechanism: 'realtime', cadence: 'realtime', note: 'Server-side aangeroepen met de service-client; RLS dwingt eigenaarschap af.' },
    't-aigateway->app-comp': { payload: 'Streaming-completions en tool-calls van Will', mechanism: 'compute', cadence: 'on-demand', contractDomains: ['ai', 'briefing'] },
    't-bankconnect->app-comp': { payload: 'Geautoriseerde saldi en transacties (PSD2)', mechanism: 'rest', cadence: 'daily', contractDomains: ['bank-connect'] },
    't-bankimport->app-comp': { payload: 'Geparste MT940/CSV/OFX-boekingen met dedup-hash', mechanism: 'import', cadence: 'on-demand' },
    't-marktdata->app-comp': { payload: 'Koersen, fundamentals en wallet-/exchange-saldi', mechanism: 'rest', cadence: 'daily', contractDomains: ['integrations', 'prices'] },
    't-platform->app-comp': { payload: 'Hosting, edge-rendering en offline service-worker-cache', mechanism: 'build', cadence: 'build' },
    't-lokale-ai->app-comp': { payload: 'Lokale categorisatie-voorstellen én chat-antwoorden die het toestel niet verlaten', mechanism: 'compute', cadence: 'on-demand' },
    // Applicatieservice → bedrijfsproces
    'as-import->sp-registreren': { payload: 'Transacties, saldi en terugkerende lasten', mechanism: 'rest', cadence: 'on-demand', contractDomains: ['bank-connect', 'recurring', 'detect-recurring', 'own-accounts'] },
    'as-budget->sp-budget': { payload: 'Budgetten, varianties, trends en dagtempo', mechanism: 'rest', cadence: 'on-demand', contractDomains: ['budgets', 'budget-trends', 'budget-variance', 'daily-expense-rate', 'cashflow-forecast'] },
    'as-vermogen->sp-vermogen': { payload: 'Bezittingen, schulden, posities en koersen', mechanism: 'rest', cadence: 'on-demand', contractDomains: ['assets', 'debts', 'holdings', 'crypto', 'prices', 'rebalancing', 'valuations'] },
    'as-belasting->sp-belasting': { payload: 'Box 1/2/3-druk, jaarruimte en tegenbewijs', mechanism: 'compute', cadence: 'on-demand', contractDomains: ['belasting'], note: 'Voornamelijk pure rekenmotoren in lib/; één API-route exposeert box1-inkomen.' },
    'as-planning->sp-plannen': { payload: 'FIRE-projecties, scenario’s en opnamestrategie', mechanism: 'compute', cadence: 'on-demand', contractDomains: ['scenarios', 'whatif', 'fire-settings', 'withdrawal-strategy', 'pot-rules', 'toekomst-doel'] },
    'as-coach->sp-inzicht': { payload: 'Aanbevelingen, volgende stappen en aandachtspunten', mechanism: 'rest', cadence: 'on-demand', contractDomains: ['ai', 'next-steps', 'briefing', 'perspective'] },
    'as-nieuws->sp-nieuws': { payload: 'Nieuwsfeed en meldingen', mechanism: 'rest', cadence: 'daily', contractDomains: ['news', 'notifications'] },
    'as-rapport->sp-delen': { payload: 'Rapporten, snapshots, export en freedom-card', mechanism: 'rest', cadence: 'on-demand', contractDomains: ['report', 'snapshots', 'export', 'share'] },
    'as-huishouden->sp-delen': { payload: 'Partner-koppeling en perspectief-context', mechanism: 'rpc', cadence: 'on-demand', contractDomains: ['household', 'perspective'], note: 'Leest cross-user via RLS-veilige RPC’s; nooit directe tabel-selects over de huishoudgrens.' },
    'as-vrijheidscheck->sp-vrijheidscheck': { payload: 'Anonieme intake (incl. levensgebeurtenissen, per-asset rendement, pensioen-uitgaven), vrijheidsrapport (incl. krant-nieuws) en conversie-token', mechanism: 'rest', cadence: 'on-demand', contractDomains: ['check'], note: 'Publiek service-role-schrijfpad (fail-closed: zod + payload-grens + IP-rate-limit + Turnstile). Het rapport consumeert de bestaande rekenmotoren en nieuwsartikelen (news_articles via service-role-read, dezelfde bron als /api/news) — geen herberekening (ADR 0022).' },
    // Externe partij → technologie
    'ext-supabase->t-supabase': { payload: 'Beheerde Postgres, Auth en Realtime', mechanism: 'realtime', cadence: 'realtime' },
    'ext-claude->t-aigateway': { payload: 'LLM-completions (primaire provider)', mechanism: 'compute', cadence: 'on-demand' },
    'ext-truelayer->t-bankconnect': { payload: 'PSD2-bankdata: rekeningen en saldi', mechanism: 'rest', cadence: 'daily' },
    'ext-exchanges->t-marktdata': { payload: 'Crypto-saldi en on-chain transacties', mechanism: 'rest', cadence: 'daily', contractDomains: ['integrations'] },
    'ext-brokers->t-marktdata': { payload: 'Aandelenposities en saldi (Trading 212 read-only of CSV-snapshot per investment-asset)', mechanism: 'rest', cadence: 'daily', contractDomains: ['integrations'] },
    'ext-marktdata->t-marktdata': { payload: 'Koersen en fundamentals', mechanism: 'rest', cadence: 'daily' },
    'ext-vercel->t-platform': { payload: 'Hosting, edge en observability', mechanism: 'build', cadence: 'build' },
    // Contractbewaking: import- en vermogens-/integratiedienst schrijven drift-events
    'as-import->do-contract-events': { payload: 'Formaat-drift-events (header-namen + fingerprint-hash) bij CSV/MT940/OFX/JSON-uploads met afwijkend formaat', mechanism: 'rpc', cadence: 'on-demand', note: 'Via RPC increment_contract_event (service-role, SECURITY DEFINER). Nooit transactiewaarden — alleen structurele metadata. Fout-stil (try/catch) zodat een drift-log de upload niet breekt (ADR 0024).' },
    'as-vermogen->do-contract-events': { payload: 'API-response-drift-events (zod-canary: veldnamen bij schema-schending) van exchange-/broker-/marktdata-clients', mechanism: 'rpc', cadence: 'daily', note: 'Zod safeParse na res.json(); bij falen recordContractEvent met issues-paden; dan permissieve cast zodat sync doorgaat. Prioriteit: Bitvavo > Trading 212 > TrueLayer (ADR 0024).' },
    // Applicatie ↔ data
    'app-comp->data-cont': { payload: 'Alle informatieobjecten — lezen en schrijven', mechanism: 'rpc', cadence: 'realtime', note: 'Elke query loopt server-side met Row Level Security op auth.uid().' },
    // Actor → proces
    'b-actor->b-main': { payload: 'Stuurt het proces, kiest modules', mechanism: 'process', cadence: 'on-demand' },
    'b-partner->b-main': { payload: 'Deelt financiën via huishouden-koppeling', mechanism: 'process', cadence: 'on-demand' },
  }

  // ── Edges ──
  const edges: ArchiEdge[] = []
  const addEdge = (e: Omit<ArchiEdge, 'id'>) => {
    const base = `e-${e.from}--${e.to}`
    let id = base
    let n = 2
    while (edges.some((x) => x.id === id)) id = `${base}-${n++}`
    edges.push({ ...ENRICH[`${e.from}->${e.to}`], ...e, id })
  }

  // Actoren voeren het hoofdproces uit
  addEdge({ from: 'b-actor', to: 'b-main', type: 'assignment', label: 'Voert uit', fromSide: 'B', toSide: 'T', fromOffset: 147, toOffset: 147 })
  addEdge({ from: 'b-partner', to: 'b-main', type: 'assignment', fromSide: 'B', toSide: 'T', fromOffset: 382, toOffset: 260 })

  // Bezoeker doet de publieke Vrijheidscheck (instroomproces vóór account)
  addEdge({ from: 'b-bezoeker', to: 'sp-vrijheidscheck', type: 'assignment', fromSide: 'R', toSide: 'L' })

  // Hoofdproces bestaat uit deelprocessen. Aggregatie (holle ruit) i.p.v.
  // compositie: de deelprocessen zijn zelfstandig genoeg om los te bestaan —
  // ArchiMate-zuiverder dan de sterke "deelt-levenscyclus"-compositie.
  const processes = ['sp-registreren', 'sp-budget', 'sp-vermogen', 'sp-belasting', 'sp-plannen', 'sp-inzicht', 'sp-nieuws', 'sp-delen']
  for (const sp of processes) {
    const n = nodes.find((x) => x.id === sp)!
    addEdge({ from: 'b-main', to: sp, type: 'aggregation', fromSide: 'R', toSide: 'L', fromOffset: n.y + n.h / 2 })
  }

  // Applicatieservices bedienen deelprocessen
  const servicePairs: Array<[string, string]> = [
    ['as-import', 'sp-registreren'],
    ['as-budget', 'sp-budget'],
    ['as-vermogen', 'sp-vermogen'],
    ['as-belasting', 'sp-belasting'],
    ['as-planning', 'sp-plannen'],
    ['as-coach', 'sp-inzicht'],
    ['as-nieuws', 'sp-nieuws'],
    ['as-rapport', 'sp-delen'],
  ]
  servicePairs.forEach(([s, p], i) => {
    addEdge({ from: s, to: p, type: 'serving', fromSide: 'L', toSide: 'R', label: i === 0 ? 'Bedient' : undefined })
  })
  // Huishouden-dienst bedient het deelproces 'Delen & rapporteren' (en dwarsdoorsnijdend de rest)
  addEdge({ from: 'as-huishouden', to: 'sp-delen', type: 'serving', fromSide: 'L', toSide: 'R', midX: 545 })

  // Vrijheidscheck-dienst bedient het publieke instroomproces
  addEdge({ from: 'as-vrijheidscheck', to: 'sp-vrijheidscheck', type: 'serving', fromSide: 'L', toSide: 'R', label: 'Bedient' })

  // Module-functies realiseren hun services (gegenereerd uit MODULE_CATALOG)
  MODULE_CATALOG.forEach((m, i) => {
    FUNCTION_SERVICE_MAP[m.id].forEach((svc, j) => {
      addEdge({
        from: `fn-${m.id}`, to: svc, type: 'realization',
        fromSide: 'L', toSide: 'R', midX: 788 + ((i * 2 + j) * 4) % 36,
        label: i === 0 && j === 0 ? 'Realiseert' : undefined,
      })
    })
  })

  // De applicatie realiseert de fundament-diensten (module-onafhankelijk)
  addEdge({ from: 'app-comp', to: 'as-import', type: 'realization', fromSide: 'L', toSide: 'R', fromOffset: row(0) + 33 })
  addEdge({ from: 'app-comp', to: 'as-rapport', type: 'realization', fromSide: 'B', toSide: 'R', fromOffset: 850, via: [[850, row(7) + 33]] })
  addEdge({ from: 'app-comp', to: 'as-huishouden', type: 'realization', fromSide: 'B', toSide: 'R', fromOffset: 880, via: [[880, row(8) + 33]] })
  addEdge({ from: 'app-comp', to: 'as-vrijheidscheck', type: 'realization', fromSide: 'T', toSide: 'B', fromOffset: 1041, toOffset: 107 })

  // De applicatie voldoet aan de motivatie
  addEdge({ from: 'app-comp', to: 'm-filo', type: 'realization', fromSide: 'T', toSide: 'B', fromOffset: 900, toOffset: 710, label: 'Voldoet aan' })
  addEdge({ from: 'app-comp', to: 'm-principes', type: 'realization', fromSide: 'T', toSide: 'B', fromOffset: 1000, toOffset: 980 })
  addEdge({ from: 'app-comp', to: 'm-soeverein', type: 'realization', fromSide: 'T', toSide: 'B', fromOffset: 1100, toOffset: 1220 })

  // Technologie bedient de applicatie
  const techs = ['t-supabase', 't-aigateway', 't-bankconnect', 't-bankimport', 't-marktdata', 't-platform', 't-lokale-ai']
  techs.forEach((t, i) => {
    const n = nodes.find((x) => x.id === t)!
    addEdge({ from: t, to: 'app-comp', type: 'serving', fromSide: 'L', toSide: 'R', toOffset: n.y + n.h / 2, label: i === 0 ? 'Bedient' : undefined })
  })

  // Externe partijen bedienen de technologielaag — per paar, niet als groep
  const extPairs: Array<[string, string, number?]> = [
    ['ext-supabase', 't-supabase'],
    ['ext-claude', 't-aigateway'],
    ['ext-truelayer', 't-bankconnect'],
    ['ext-exchanges', 't-marktdata', 1452],
    ['ext-brokers', 't-marktdata', 1448],
    ['ext-marktdata', 't-marktdata', 1456],
    ['ext-vercel', 't-platform'],
  ]
  extPairs.forEach(([ext, tech, midX]) => {
    addEdge({ from: ext, to: tech, type: 'serving', fromSide: 'L', toSide: 'R', midX })
  })

  // De applicatie leest en schrijft de gegevens
  addEdge({ from: 'app-comp', to: 'data-cont', type: 'access', fromSide: 'B', toSide: 'T', fromOffset: 1140, toOffset: 1140, label: 'Leest en schrijft', readWrite: true })

  // De Vrijheidscheck-dienst leest en schrijft het lead-intake-object (service-role)
  addEdge({ from: 'as-vrijheidscheck', to: 'do-lead', type: 'access', fromSide: 'B', toSide: 'L', readWrite: true, via: [[806, 1280]] })

  // Contractbewaking: import-dienst schrijft formaat-drift; vermogens-dienst schrijft API-response-drift
  addEdge({ from: 'as-import', to: 'do-contract-events', type: 'access', fromSide: 'B', toSide: 'T', via: [[670, 1252]] })
  addEdge({ from: 'as-vermogen', to: 'do-contract-events', type: 'access', fromSide: 'B', toSide: 'T', via: [[670, 1252]] })

  return { width: 1660, height: 1370, nodes, edges }
}

// ── Afgeleide helpers ────────────────────────────────────────────────────────

export interface ArchiRelation {
  edge: ArchiEdge
  other: ArchiNode
  /** true = de relatie wijst weg van het geselecteerde element */
  outgoing: boolean
}

/** Alle directe relaties van een element, met de andere kant + richting. */
export function getRelationsFor(model: ArchimateModel, id: string): ArchiRelation[] {
  const byId = new Map(model.nodes.map((n) => [n.id, n]))
  const out: ArchiRelation[] = []
  for (const edge of model.edges) {
    if (edge.from === id) {
      const other = byId.get(edge.to)
      if (other) out.push({ edge, other, outgoing: true })
    } else if (edge.to === id) {
      const other = byId.get(edge.from)
      if (other) out.push({ edge, other, outgoing: false })
    }
  }
  return out
}

export interface ArchiImpact {
  /** Elementen die dit element (transitief) bedient/voedt — volg from→to */
  downstream: string[]
  /** Elementen waar dit element (transitief) van afhangt — volg to→from */
  upstream: string[]
}

/**
 * Transitieve impact via gerichte BFS over de relaties. `downstream` = "wat
 * raakt dit element verderop", `upstream` = "waar hangt dit element van af".
 * Containers (groep + applicatie) tellen niet mee als tussenstap — anders zou
 * alles via de data-groep of de applicatie met elkaar verbonden raken.
 */
export function getElementImpact(model: ArchimateModel, id: string): ArchiImpact {
  const byId = new Map(model.nodes.map((n) => [n.id, n]))
  const isHub = (nodeId: string) => {
    const k = byId.get(nodeId)?.kind
    return k === 'group' || k === 'appcomp'
  }
  const walk = (forward: boolean): string[] => {
    const seen = new Set<string>()
    const queue: string[] = [id]
    while (queue.length) {
      const cur = queue.shift()!
      for (const e of model.edges) {
        const next = forward ? (e.from === cur ? e.to : null) : e.to === cur ? e.from : null
        if (!next || next === id || seen.has(next)) continue
        seen.add(next)
        // Hubs worden opgenomen, maar de BFS loopt er niet doorheen verder.
        if (!isHub(next)) queue.push(next)
      }
    }
    return [...seen]
  }
  return { downstream: walk(true), upstream: walk(false) }
}
