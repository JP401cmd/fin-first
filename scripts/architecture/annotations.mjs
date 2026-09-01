/**
 * Curatie-laag voor de TriFinity-architectuurplaat.
 * ----------------------------------------------------------------------------
 * Dit bestand bevat het ARCHITECTUURVERHAAL dat NIET dagelijks verandert:
 * de drie generieke mechanismen, laagbeschrijvingen, moduletoelichting en
 * ontwerpprincipes. De feiten (routes, API's, tabellen, componenten, welke
 * buildXContext-functies bestaan, ...) worden automatisch uit de code gelezen
 * door generate.mjs — die hoef je hier dus NIET te onderhouden.
 *
 * Onderhoud: pas hier alleen tekst aan. Voeg een nieuw mechanisme/principe toe
 * door een regel aan de array toe te voegen. Niets breekt als een veld ontbreekt.
 */

export const annotations = {
  philosophy: 'Geld is opgeslagen tijd — elke euro vertegenwoordigt een stukje levenstijd.',
  tagline: 'Eén samenhangende filosofie over elk scherm, geen "financiële data + losse AI-coaching".',

  // Inleiding boven het paneel met de drie generieke mechanismen.
  mechanismsIntro:
    'Drie generieke mechanismen dragen de hele app. Een nieuw domein sluit aan zonder nieuwe ' +
    'infrastructuur — je voegt alleen een regel toe aan een bestaand patroon.',

  // De drie product-/kleurmodules (kern/wil/horizon). Stuurt de kleurcodering
  // van schermen in de frontend-laag.
  modules: {
    kern: {
      label: 'De Kern',
      color: '#b45309', // amber
      tagline: 'Financiële basis — bezittingen, budgetten, schulden, cash.',
      routePrefixes: ['core'],
    },
    wil: {
      label: 'De Wil',
      color: '#0f766e', // teal
      tagline: 'Acties & impact — overzicht, aanbevelingen, doelen, patronen.',
      routePrefixes: ['overzicht'],
    },
    horizon: {
      label: 'De Horizon',
      color: '#7c3aed', // purple
      tagline: 'Toekomst — FIRE, scenario’s, simulaties, tijdas.',
      routePrefixes: ['horizon', 'toekomst'],
    },
  },

  // Korte beschrijving per architectuurlaag (getoond als ondertitel).
  layers: {
    frontend:
      'Next.js 16 App Router (React 19, Tailwind v4). Schermen per module, een gedeelde shell ' +
      'met providers, en een grote bibliotheek herbruikbare componenten.',
    api:
      'Next.js route handlers — REST per domein. Geen aparte backend; Supabase wordt server-side ' +
      'aangeroepen met RLS.',
    domain:
      'De domein- en AI-logica. Hier wonen de drie generieke mechanismen, de functionele modules ' +
      '(door de gebruiker activeerbaar) en de soevereiniteitsniveaus als motivatie- en voortgangsmodel.',
    data:
      'Supabase (PostgreSQL 17) met Row Level Security, realtime en RPC-functies. Schema beheerd ' +
      'via migraties.',
    integrations:
      'Externe diensten die de app inkoppelt: AI-providers, bank-import, betalingen en observability.',
  },

  // De drie generieke mechanismen. De FEITEN (welke buildXContext, welke
  // kaarten, welke coach-lagen) worden automatisch ingevuld door generate.mjs.
  mechanisms: [
    {
      id: 'context-builder',
      title: 'Context-builder',
      file: 'lib/ai/context/builder.ts',
      summary:
        'Compositioneel: buildContext() doet Promise.all([...buildXContext(supabase)]). ' +
        'Een nieuw domein sluit aan door simpelweg een buildXContext toe te voegen — ' +
        'buildTaxContext volgt exact dat patroon.',
      extend:
        'Schrijf buildJouwContext(supabase): Promise<string>, importeer het en zet het in de ' +
        'Promise.all-array. De builder formatteert en plakt de sectie automatisch aan.',
    },
    {
      id: 'coach-tips',
      title: 'Coach-tips-catalogus',
      file: 'lib/coach-suggestions.ts',
      summary:
        'App-breed (cashflow, schulden, toekomst gebruiken het al). Een nieuw onderdeel voegt ' +
        'gewoon regels toe en is meteen admin-beheerbaar via /beheer/coach.',
      extend:
        'Voeg een regel toe aan de juiste prioriteitslaag (deferred / data_gap / path / default). ' +
        'De predicaten blijven in code; tekst, CTA en aan/uit zijn override-baar in app_settings.',
    },
    {
      id: 'briefing-engine',
      title: 'Briefing-engine + redactie',
      file: 'lib/briefing/engine.ts',
      summary:
        'Deterministische generatoren zetten de financiële cijfers om in wekelijkse briefjes; ' +
        'Fin redigeert alleen de teksten (lib/briefing/redactie.ts, nummer-guard — ADR 0007).',
      extend:
        'Voeg een generator toe in buildFinanceEntries (drempel + test) en een rank in ' +
        'briefingRank; de redactie en de directives pakken het nieuwe briefje automatisch mee.',
    },
  ],

  // Ontwerpprincipes (filosofie-consistentie) — getoond als afsluitende lijst.
  principles: [
    'Elke EUR boven €100 toont ook zijn vrijheidstijd-equivalent.',
    'Time-/vrijheidsframing boven generieke financiële termen.',
    'Eén filosofie over alle schermen, niet "data + AI-coaching" ernaast.',
    'Zichtbaarheid via module-activatie; soevereiniteitsniveaus (Recovery → Mastery) motiveren — geen gating.',
    'Nieuwe domeinen pluggen in bestaande patronen — geen nieuwe infrastructuur.',
  ],

  // Integraties die NIET als directe npm-dependency zichtbaar zijn maar wel
  // bestaan (afgeleid uit API-routes/env). generate.mjs detecteert deze ook
  // automatisch uit .env*-bestanden; hier kun je ze handmatig borgen/aanvullen.
  extraIntegrations: [
    { name: 'TrueLayer (bank-connect / PSD2)', category: 'Banking' },
    { name: 'Polar (betalingen)', category: 'Payments' },
    { name: 'Crypto-exchanges (Bitvavo / Coinbase / Kraken)', category: 'Crypto' },
    { name: 'Aandelen-brokers (Trading 212)', category: 'Brokerage' },
  ],

  // Groepering van tabellen per domein (keyword-match op tabelnaam). Tabellen
  // die nergens matchen belanden in "Overig" — voeg ze hier toe wanneer dat
  // gebeurt. Match is op exacte naam óf als de naam een trefwoord bevat.
  tableDomains: {
    'Kern / financieel': ['profiles', 'assets', 'debts', 'transactions', 'recurring_transactions', 'bank_accounts', 'budgets'],
    'Beleggingen': ['holdings', 'investment_holdings', 'crypto_holdings', 'holding_transactions', 'holding_prices', 'investment_holding_prices', 'crypto_holding_prices', 'holding_alerts', 'target_allocations', 'crypto_transactions'],
    'Snapshots & historie': ['net_worth_snapshots', 'balance_snapshots', 'valuations'],
    'Externe koppelingen': ['external_connections', 'exchange_connections', 'broker_connections', 'wallet_addresses'],
    'Huishouden': ['households', 'household_members', 'household_invitations'],
    // 'goal' (enkelvoud) dekt ook `goal_links` en `goal_contributions`; op
    // 'goals' matchten die niet en belandden ze in "Overig".
    'Toekomst & doelen': ['goal', 'goals', 'life_events', 'aow_leeftijd', 'retirement'],
    'AI & calculators': ['ai_calculator_usage', 'custom_calculators', 'calculator_likes', 'calculator_reports', 'calculators'],
    'Nieuws & briefing': ['news_articles', 'news', 'briefing_history', 'briefing'],
    'Vragenlijsten': ['questionnaires', 'questionnaire_questions', 'questionnaire_sessions', 'questionnaire_responses', 'questionnaire'],
    'Engagement & features': ['user_feature_visits', 'next_step_completions', 'user_badges', 'user_streaks', 'app_settings'],
  },

  // Leesbare labels voor de API-domeinen (eerste pad-segment na /api).
  apiDomainLabels: {
    ai: 'AI & Coach',
    admin: 'Beheer',
    auth: 'Authenticatie',
    household: 'Huishouden',
    holdings: 'Beleggingen',
    crypto: 'Crypto',
    'crypto-holdings': 'Crypto',
    integrations: 'Externe koppelingen',
    'bank-connect': 'Bank-connect',
    budgets: 'Budgetten',
    debts: 'Schulden',
    assets: 'Bezittingen',
    snapshots: 'Snapshots',
    report: 'Rapportages',
    goals: 'Doelen',
    scenarios: 'Scenario’s',
    questionnaires: 'Vragenlijsten',
    calculators: 'Calculators',
    onboarding: 'Onboarding',
  },
}

export default annotations
