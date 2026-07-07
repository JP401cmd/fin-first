// ── Berekeningen op de brongegevens (gecureerd) ──────────────────────────────
// De rekenmotoren die ruwe DB-gegevens omzetten naar de afgeleide cijfers die de
// gebruiker ziet (spaarquote, netto vermogen, belastingdruk, FIRE-datum). De
// betekenis hiervan is niet betrouwbaar te scannen, dus dit is een gecureerde
// catalogus. Houd 'm bij wanneer je een rekenmotor toevoegt, wijzigt of een
// constante/aanname verandert.
//
// `elementIds` koppelt elke berekening aan elementen op de ArchiMate-plaat;
// `validateCalculations` dwingt af dat die verwijzingen blijven kloppen.

import type { ArchimateModel } from './archimate-model'

export type CalcDomain = 'Cashflow' | 'Vermogen' | 'Belasting' | 'Toekomst (FIRE)'

export interface CalcConstant {
  label: string
  value: string
}

export interface Calculation {
  id: string
  title: string
  domain: CalcDomain
  summary: string
  /** Brongegevens (tabellen/velden of upstream-uitkomsten) */
  inputs: string[]
  /** Wat eruit komt */
  outputs: string[]
  /** Kernformule, beknopt */
  formula?: string
  /** Bestanden met de implementatie */
  files: string[]
  /** Belangrijkste functies */
  functions: string[]
  /** Vaste aannames/constanten */
  constants?: CalcConstant[]
  /** Gekoppelde plaat-elementen */
  elementIds: string[]
  note?: string
}

export const CALC_DOMAINS: CalcDomain[] = ['Cashflow', 'Vermogen', 'Belasting', 'Toekomst (FIRE)']

export const CALCULATIONS: Calculation[] = [
  // ── Cashflow ──
  {
    id: 'spaarquote',
    title: 'Spaarquote',
    domain: 'Cashflow',
    summary: 'Welk deel van het inkomen overblijft. De bron van de FIRE-prognose: sparen = spaarquote × inkomen.',
    inputs: ['transactions (inkomen, uitgaven)', 'budgets'],
    outputs: ['spaarquote %', 'sparen €/maand', 'sparen €/jaar'],
    formula: 'spaarquote = (inkomen − uitgaven) / inkomen',
    files: ['lib/savings-source.ts', 'lib/month-range.ts'],
    functions: ['resolveSavingsSource', 'savingsRateFromAggregates', 'computeDebtAflossingMonthly', 'localMonthStartMonthsAgo'],
    elementIds: ['as-budget', 'fn-budgetteren'],
    note: 'Aflossing wordt niet dubbel geteld; spaarquote × inkomen voedt de unified projection. De 6m-spaarquote (savingsRate6m) is single-sourced via savingsRateFromAggregates + computeDebtAflossingMonthly — dashboard-, horizon- en core-loaders rekenen via deze helpers, geen inline-kopieën. Het 6-maands-venster is een ECHT 6-kalendermaands-venster INCLUSIEF de huidige maand: de ondergrens komt uit de gedeelde helper localMonthStartMonthsAgo(now, 5) (5 maanden terug = 6 maand-slots, gelijk aan de kassabon slice(-6)). Het oude inline getMonth()-6-patroon telde 7 maanden mee — een off-by-one die de kassabon liet afwijken van de getoonde spaarquote, nu gelijkgetrokken met de horizon-loader (die al -5 gebruikte).',
  },
  {
    id: 'cashflow-forecast',
    title: 'Cashflow-prognose',
    domain: 'Cashflow',
    summary: 'Verwachte maandelijkse in- en uitstroom op basis van vaste lasten en budgetten.',
    inputs: ['recurring_transactions', 'budgets', 'transactions (lopende maand)'],
    outputs: ['maandprognose', 'verwacht saldo-einde maand'],
    files: ['lib/cashflow-forecast-math.ts'],
    functions: ['buildCashflowCards'],
    elementIds: ['as-budget'],
    note: 'Server-safe (geen Supabase-calls); maandgrenzen via lib/month-range.ts.',
  },
  {
    id: 'leverage-status',
    title: 'Hefboom-status',
    domain: 'Cashflow',
    summary: 'De vier hefbomen (cashflow, vermogen, schulden, belasting) + Box 1/3 vertaald naar één status-semantiek, gedeeld door de sidebar-dots, de kaarten én de status-duiding-banner.',
    inputs: ['spaarquote (3m)', 'netto vermogen', 'schulden', 'box 3-druk', 'effectief maandinkomen + marginaal tarief (Box 1)'],
    outputs: ['status per hefboom (groen/aandacht/…)', 'Box 1/3-status', 'status-duiding per /overzicht-route'],
    files: ['lib/leverage-status.ts', 'lib/lever-scores-loader.ts', 'lib/page-status/resolve.ts', 'app/api/overzicht/page-status/route.ts'],
    functions: ['computeLeverScores', 'loadLeverScores', 'box1JaarruimteStatus', 'box3TaxStatus', 'resolvePageStatusMap'],
    elementIds: ['as-budget', 'as-vermogen'],
    note: 'Canonieke statusbron — niet hand-rollen, anders ontstaat label-drift. loadLeverScores (cache()-wrapped) is de ÉNE assemblage van lever-scores + Box 1/3-status, gedeeld door de globale shell-sidebar (app/(app)/layout.tsx) én de status-duiding-banner (via GET /api/overzicht/page-status) → sidebar-dot en banner kunnen per definitie niet divergeren. Dat endpoint is route-scoped/lazy: het laadt alleen de databron die de gevraagde route nodig heeft (hefbomen, cashflow-kaarten óf box2-gate), zodat niet-cashflow-routes de zware dashboard-loader niet aanraken. page-status/resolve mapt status (consume-only, families optioneel) op gecureerde copy; LeverStatus(green/amber/red/neutral)→LeverageStatus(good/warn/bad/neutral). Geen herberekening, geen nieuwe drempels.',
  },

  // ── Vermogen ──
  {
    id: 'netto-vermogen',
    title: 'Netto vermogen (gewogen)',
    domain: 'Vermogen',
    summary: 'Bezittingen minus schulden, gewogen per inclusie-percentage. Wordt ook getoond als “jaren vrijheid”. Dezelfde weging loopt door de vermogensverdeling per type, de liquide pot en de runway.',
    inputs: ['assets (current_value, purchase_value, net_worth_inclusion_pct, asset_type)', 'debts (current_balance, net_worth_inclusion_pct)', 'niet-gekoppelde bankrekeningen (legacy)', 'maanduitgaven'],
    outputs: ['netto vermogen €', 'jaren/maanden vrijheid', 'vermogensverdeling per type (gewogen)', 'liquide pot € & runway (maanden gedekt)', 'netWorthExclHome € (afgeleid — foundation voor de nog te bouwen /overzicht-dubbelweergave, nog niet geconsumeerd)', 'showDualHousingBasis (gating: eigen woning én strategie ≠ include_full)'],
    formula: 'Σ(asset × incl%) − Σ(debt × incl%); breakdown per type: Σ(asset × incl%) per asset_type (som == headline); liquide pot = Σ(savings/checking/cash × incl%) + niet-gekoppelde cash; runway = liquide pot / maanduitgaven',
    files: ['lib/dashboard-data-loader.ts', 'lib/horizon-data-loader.ts', 'lib/housing-strategy.ts', 'lib/dashboard-wealth-weighting.ts', 'lib/feature-phases.ts', 'lib/format.ts', 'app/api/snapshots/snapshot-math.ts'],
    functions: ['computeAssetsByType', 'computeLiquidPot', 'monthsCoveredFrom', 'computeSovereigntyLevel', 'calculateFreedomTime', 'formatFreedomTimeString', 'dailyExpenseRate', 'computeSnapshotNetWorth', 'homeEquity', 'netWorthExcludingHome', 'shouldShowDualHousingBasis'],
    elementIds: ['as-vermogen', 'fn-vermogensregistratie'],
    note: 'Cash-only fallback wanneer vermogensregistratie uit staat. `net_worth_inclusion_pct` is een HARD gegeven dat het volledige bedrag vervangt in ALLE afgeleide cijfers (gedeelde helper lib/dashboard-wealth-weighting.ts) — geldt sinds kaart "Dashboard telt gedeeld bezit overal even zwaar" óók voor: (1) vermogensverdeling per type (computeAssetsByType weegt value ÉN purchaseValue, zodat som(assetsByType) == headline netto vermogen; expectedReturn = weightedReturn/value blijft een correcte ratio doordat de factor in teller én noemer wegvalt); (2) de liquide pot (computeLiquidPot: alleen savings/checking/cash + niet-gekoppelde cash, elk inclusion-gewogen). Runway/buffer (top-level monthsCovered, emergencyFund én de Jouw-Pad-buffer/noodfonds-tiers via computeSovereigntyLevel) rekent op die LIQUIDE pot, niet op het totale netto vermogen — een huis is geen opeetbare buffer (CLAUDE.md: nettoVermogen ≠ liquide vermogen). Het teken van netWorth blijft bepalend voor de herstel-niveaus (negatief vermogen → recovery); computeSovereigntyLevel krijgt de liquide pot als aparte `runwayNetWorth`-parameter (fallback = netWorth voor callers zonder liquide pot, o.a. de snapshot-routes). Dagtarief voor €→tijd is single-sourced: dailyExpenseRate (lib/format.ts) = maanduitgaven×12/365 — vervangt de verspreide /30-conversie (= 360-dagenjaar, ~1,4% drift). Het opgeslagen snapshot-net_worth (alle drie de snapshot-routes) deelt dezelfde gewogen formule via snapshot-math.ts (freedom_percentage daar bewust op vol-vermogen-grondslag — ADR 0009-uitzondering). Dubbele grondslag incl./excl. eigen woning (2026-07-06, FOUNDATION-naad): netWorthExclHome (= netto vermogen − overwaarde, overwaarde = eigenHuisValue − mortgageBalance, ZUIVER — óók bij reverse_mortgage, géén leenruimte-variant) + de gating showDualHousingBasis (hasEigenHuis ∧ mode ≠ include_full) worden in BEIDE bundels (dashboard + horizon) gezet via één home in lib/housing-strategy.ts (homeEquity / netWorthExcludingHome / shouldShowDualHousingBasis) — geen inline huis-som in de loaders. netWorthExclHome is een DERDE, APARTE grootheid: NIET het volledige netto vermogen en NIET de FIRE-pot (fireEligibleNetWorth / getFireEligibleNetWorth) — nooit op dezelfde as mengen. De horizon-bundle-variant van netWorthExclHome + showDualHousingBasis worden sinds 2026-07-06 LIVE geconsumeerd op /overzicht (overzicht-hero → mini-networth-chart als SubtotalLine + hefbomen-nav, en core/debts/page) — één FIRE-doellijn op de netto-vermogen-as, netWorthExclHome enkel als tekst-subtotaal, nooit als tweede grafieklijn/as. De gespiegelde DashboardData-varianten (dashboard-bundle netWorthExclHome + simRequiredNetWorth) blijven vooralsnog PURE FOUNDATION: ze staan in de bundel maar worden nog door geen enkele UI geconsumeerd — behandel díe niet als live output totdat de dashboard-dubbelweergave gebouwd is. De FIRE-DOEL-tegenhanger (incl. woning = requiredFireNetWorth = Prognose!I@FIRE, wél al geconsumeerd op /toekomst) staat in calc "FIRE — horizon-kernel (Excel-oracle, maandbasis)".',
  },
  {
    id: 'gezondheidsscore',
    title: 'Financiële gezondheidsscore (4-pijler)',
    domain: 'Vermogen',
    summary: 'Eén gewogen rapportcijfer (0–100) over vier gedragspijlers — Rondkomen, Buffer, Schuld en Vrijheid — met 7 actieve indicatoren: spaarquote, budgetdiscipline, noodfonds, schuldenlast (DSTI), schuldratio, FIRE-voortgang en vermogensconcentratie.',
    inputs: ['spaarquote (6m)', 'netto maandinkomen', 'budgetten', 'noodfonds-maanden', 'schuld-maandlasten (Σ monthly_payment)', 'assets + schulden', 'FIRE-voortgang (freedomPct)', 'grootste asset-type-aandeel (excl. eigen woning)'],
    outputs: ['gezondheidsgetal 0–100', 'label (Uitstekend…Kritiek)', 'score per indicator + pillarGroup + verbetertip'],
    formula: 'Σ(indicatorscore × herverdeeld gewicht) over de actieve indicatoren; basisgewichten som 0.95 → geschaald naar 1.0 over de actieve set (no-data = inactief, gewicht herverdeeld). Alle 7 inactief → total 0.',
    files: ['lib/financial-health.ts', 'lib/health-score-input.ts', 'lib/household-type.ts'],
    functions: ['computeHealthScoreFromInputs', 'computeHealthScoreWithTrend', 'buildHealthScoreInput', 'scoreDSTI', 'scoreAssetConcentration', 'computeLargestAssetTypeShare', 'hasPartner'],
    constants: [
      { label: 'Basisgewichten Rondkomen (35%)', value: 'spaarquote 0.20 · budgetdiscipline 0.10' },
      { label: 'Basisgewichten Buffer (20%)', value: 'noodfonds 0.20' },
      { label: 'Basisgewichten Schuld (20%)', value: 'DSTI 0.12 · schuldratio 0.08' },
      { label: 'Basisgewichten Vrijheid (25%)', value: 'FIRE-voortgang 0.18 · vermogensconcentratie 0.07' },
      { label: 'DSTI-knikpunten', value: '≤20%→100 · 36%→70 · 43%→40 · ≥60%→0' },
      { label: 'Concentratie-knikpunten', value: '≤40%→100 · 70%→40 · ≥90%→0; inactief als grootste type < €10.000' },
    ],
    elementIds: ['as-budget', 'as-vermogen', 'as-belasting', 'as-planning'],
    note: 'v2 (ADR 0010): geherstructureerd naar vier gedragspijlers; belasting-optimalisatie en diversificatie vervallen uit de score (belasting wordt een educatief "kans"-inzicht buiten de score, geen advies). Eén canonieke berekening blijft (ADR 0008): het "huidige" getal wordt overal live berekend via het gedeelde input-pad (buildHealthScoreInput), gebruikt door loader, client-recompute, de dashboard-bundel (computeHealthScoreWithTrend, met snapshot-trend) én de drie snapshot-routes. No-data-indicatoren zijn inactief en hun gewicht wordt herverdeeld (geen 50/70-dummies meer). net_worth_snapshots.resilience_score is uitsluitend historie (score_version markeert v1 vs v2) — geen tweede waarheid voor het huidige getal. Het fiscaal-partner-signaal voor het Box 3-heffingsvrij vermogen (114k vs 57k) komt nu via de canonieke hasPartner-helper (lib/household-type.ts); vóór de fix vergeleek deze plek household_type met de verouderde woordenschat samenwonend/getrouwd → altijd alleenstaand-vrijstelling, ook voor partners.',
  },
  {
    id: 'allocatie-herbalancering',
    title: 'Allocatie & herbalancering',
    domain: 'Vermogen',
    summary: 'Verdeling over assetklassen en het verschil met de doelallocatie.',
    inputs: ['holdings', 'crypto_holdings', 'target_allocations', 'holding_prices'],
    outputs: ['huidige allocatie %', 'afwijking t.o.v. doel', 'herbalanceer-orders'],
    files: ['lib/portfolio-allocation.ts', 'lib/rebalancing.ts'],
    functions: ['computePortfolioAllocation'],
    elementIds: ['as-vermogen', 'fn-aandelenregistratie'],
  },
  {
    id: 'holdings-positie-aggregatie',
    title: 'Positie-opbrengst uit transactiehistorie',
    domain: 'Vermogen',
    summary:
      'Leidt per belegging de huidige positie (aantal, gemiddelde kostprijs) en de opbrengst (gerealiseerd + ongerealiseerd = totaal) af uit de transactiehistorie via average-cost. Enige bron voor "winst/verlies per holding".',
    inputs: [
      'investment_transactions (buy/sell/dividend, units, price_per_unit, total_amount, date)',
      'investment_holdings.current_price (waardering resterende positie)',
    ],
    outputs: [
      'netUnits + avgCost',
      'realizedPnL (incl. dividend, − kosten)',
      'unrealizedPnL',
      'totalPnL',
      'totalPnLPct',
      'isClosed (gesloten positie)',
    ],
    files: [
      'lib/holdings-aggregation.ts',
      'lib/holdings-pnl-enrichment.ts',
      'lib/holdings-data-loader.ts',
      'app/api/holdings/route.ts',
      'app/(app)/core/assets/investment/[holdingId]/page.tsx',
    ],
    functions: [
      'computePositionFromTransactions',
      'valuePosition',
      'loadHoldingsPnL',
      'attachPnLToHoldings',
    ],
    constants: [
      { label: 'Methode', value: 'gewogen gemiddelde kostprijs (average-cost)' },
      { label: 'EPSILON gesloten-detectie', value: '1e-9 stuks' },
      {
        label: 'Pence-normalisatie (LSE/GBp)',
        value:
          'Yahoo "GBp"/"GBX" (pence-notatie) → GBP: current_price ÷100 bij de bron in lib/price-feed.ts (fetchPriceData), zodat de waardering hele valuta-eenheden gebruikt — geen 100× overwaardering van Londen-genoteerde aandelen',
      },
    ],
    elementIds: ['as-vermogen', 'fn-aandelenregistratie'],
    note: 'Single source of truth: de transacties bepalen het bezit, niet andersom. computePositionFromTransactions + valuePosition (lib/holdings-aggregation.ts) is de ENIGE opbrengst-som; elke consument importeert ze (consume, don\'t recompute). De holdings-detailpagina (full-page + pane) gebruikt ze al per holding; de holdings-LIJST verrijkt sinds jun 2026 elke rij ermee via lib/holdings-pnl-enrichment.ts (loadHoldingsPnL = ÉÉN batch-query op investment_transactions.holding_id, geen N+1; attachPnLToHoldings hangt pnl_*-velden op de rij). Beide lijst-consumenten — de server-loader loadHoldingsData én GET /api/holdings — draaien dezelfde helper zodat initial-render en client-hydratie identieke getallen tonen. Nodig voor sorteren-op-opbrengst en het tonen van de gerealiseerde winst op gesloten posities (pnl_total === realizedPnL bij netUnits 0). investment_transactions heeft geen fees-kolom; de engine behandelt afwezige fees als 0.',
  },

  // ── Belasting ──
  {
    id: 'box1',
    title: 'Box 1 — inkomen & jaarruimte',
    domain: 'Belasting',
    summary: 'Belasting in box 1 (schijven) en de fiscale jaarruimte voor pensioenopbouw.',
    inputs: ['inkomen', 'factor A (pensioenaangroei UPO) — profiles.pension_factor_a', 'AOW-status'],
    outputs: ['box 1-druk', 'jaarruimte €'],
    files: ['lib/box1-tax.ts', 'lib/jaarruimte.ts'],
    functions: ['computeBox1Tax', 'computeJaarruimte', 'resolvePensionFactorA', 'estimateFactorAFromSalary'],
    constants: [
      { label: 'Schijfgrenzen/tarieven', value: 'in box1-tax.ts (jaargebonden)' },
      { label: 'Jaarruimte-opbouwpercentage', value: '30% (WTP, per 2023)' },
      { label: 'Factor A-imputatie', value: '× 6,27' },
      { label: 'Factor A-bron (persistent)', value: 'profiles.pension_factor_a · pension_factor_a_source' },
      { label: 'AOW-franchise', value: '€18.475 (2025) · €19.172 (2026)' },
      { label: 'Max premie-inkomen', value: '€137.800 (2024–2026)' },
      { label: 'Max jaarruimte (afgeleid)', value: '€35.798 (2025) · €35.589 (2026)' },
    ],
    elementIds: ['as-belasting'],
    note: 'Jaarruimte = 30% × premiegrondslag − 6,27 × factor A (art. 3.127 Wet IB 2001, stelsel sinds Wet toekomst pensioenen). Correctie ADR 0023: het opbouwpercentage was foutief op 13,3% gezet (en als "factor A" benoemd) — WTP verhóógde dit per 2023 van ~13,3% naar 30%. Factor A (de jaarlijkse pensioenaangroei in € uit het UPO) wordt apart × 6,27 afgetrokken; geen werkgeverspensioen → factor A = 0. Factor A wordt sinds juni 2026 als ÉÉN bron persistent opgeslagen in profiles.pension_factor_a (+ pension_factor_a_source) en door alle consumenten gelezen via de canonieke resolver resolvePensionFactorA (clamp ≥ 0, NaN-guard, NULL≠0: leeg = "niet ingevuld" → factor A 0, een expliciete 0 is wél bekend). De resolver schat NIET automatisch uit salaris — dat is een expliciete gebruikersactie met _source=estimated. NB: profiles.pension_factor_a is de EIGEN factor A van de ingelogde gebruiker; de partner-jaarruimtekaart blijft bewust op 0 (privacy). Premiegrondslag = max(0, inkomen − franchise) afgetopt op (€137.800 − franchise) via een grondslag-cap, waardoor de jaargebonden max-jaarruimte een afgeleide verificatie is i.p.v. een losse magic number. estimateFactorAFromSalary geeft een indicatie van factor A uit het salaris (opbouw% × pensioengrondslag, default 1,875% middelloon-maximum).',
  },
  {
    id: 'box3-forfaitair',
    title: 'Box 3 — forfaitair',
    domain: 'Belasting',
    summary: 'De wettelijke forfaitaire vermogensrendementsheffing over spaargeld en beleggingen.',
    inputs: ['box 3-bezittingen', 'box 3-schulden', 'heffingvrij vermogen'],
    outputs: ['forfaitair rendement', 'box 3-heffing €'],
    files: ['lib/box3-data.ts', 'lib/constants.ts', 'lib/horizon-data.ts', 'lib/box3-taxable-input.ts', 'lib/household-type.ts'],
    functions: ['BOX3_PARAMS', 'CURRENT_TAX_YEAR', 'NL_FICTIEF_BELEGGINGEN', 'BOX3_TARIEF', 'calculateBox3', 'box3TaxStatus', 'hasPartner'],
    constants: [
      { label: 'Heffingvrij vermogen (alleenstaand)', value: '€59.357 (2026)' },
      { label: 'Heffingvrij vermogen (fiscaal partner)', value: '€118.714 (2026, verdubbeld)' },
      { label: 'Forfait beleggen / sparen (2026)', value: '6,00% / 1,28% — uit BOX3_PARAMS[jaar]' },
      { label: 'Tarief', value: '36% — jaartabel BOX3_PARAMS[jaar] in box3-data.ts' },
    ],
    elementIds: ['as-belasting'],
    note: 'Alle Box 3-getallen komen uit ÉÉN jaargelaagde bron: BOX3_PARAMS[jaar] in lib/box3-data.ts (correct 2025+2026), met CURRENT_TAX_YEAR als het lopende jaar. De NL-FIRE-afgeleiden (NL_FICTIEF_BELEGGINGEN → BOX3_DRAG/NL_SWR/NL_MULTIPLIER in lib/constants.ts) en het drempel-signaal (BOX3_VRIJSTELLING_SINGLE) worden hier één-op-één uit afgeleid i.p.v. los hardcoded — dat hief de drift op waarbij het FIRE-forfait nog 5,88% (2025) rekende terwijl de tabel al 6,00% (2026) is (FIRE-doelen ~+1,5%, lagere SWR). Het fiscaal-partner-signaal dat het heffingvrij vermogen verdubbelt komt uit één canonieke helper: hasPartner(household_type) in lib/household-type.ts. Vóór die fix vergeleken de afnemers household_type met de verouderde woordenschat samenwonend/getrouwd — die de canonieke waarden (solo/samen/gezin) nooit aannemen → hasPartner stond per ongeluk altijd op false. NB: dit is NIET het AOW-leefsituatie-enum (alleenstaand/samenwonend) dat de AOW-uitkeringshoogte bepaalt — dat is een aparte as.',
  },
  {
    id: 'box3-tegenbewijs',
    title: 'Box 3 — tegenbewijs (werkelijk rendement)',
    domain: 'Belasting',
    summary: 'De tegenbewijsregeling: werkelijk behaald rendement i.p.v. het forfait, wanneer dat gunstiger is.',
    inputs: ['werkelijk rendement', 'box 3-vermogen'],
    outputs: ['heffing bij werkelijk rendement', 'voordeel t.o.v. forfait'],
    files: ['lib/box3-tegenbewijs.ts'],
    functions: ['computeBox3Tegenbewijs'],
    elementIds: ['as-belasting'],
  },
  {
    id: 'tax-overview',
    title: 'Belastingoverzicht (totaaldruk)',
    domain: 'Belasting',
    summary: 'Samenvattende belastingdruk over box 1/2/3 plus aandachtspunten op de fiscale kalender.',
    inputs: ['box 1', 'box 2', 'box 3'],
    outputs: ['totale belastingdruk', 'aandachtspunten'],
    files: ['lib/tax-overview.ts', 'lib/tax-calendar.ts'],
    functions: ['buildTaxOverview'],
    constants: [{ label: 'Box 2-tarief', value: '31% boven €68.843 (gecorrigeerd)' }],
    elementIds: ['as-belasting'],
  },
  {
    id: 'schenk-erfbelasting',
    title: 'Schenk- & erfbelasting',
    domain: 'Belasting',
    summary: 'Schenk- en erfbelasting per ontvanger: jaarlijkse vrijstelling, eenmalig verhoogde schenkvrijstelling en het tweeschijventarief per tariefgroep — de basis voor de schenkings- en erfenisplanning in Horizon.',
    inputs: ['geschonken/geërfd bedrag', 'relatie tot schenker/erflater', 'belastingjaar'],
    outputs: ['vrijstelling', 'belastbaar bedrag', 'schenk-/erfbelasting €', 'netto ontvangen'],
    formula: 'belasting = min(belastbaar, grens) × laag + max(0, belastbaar − grens) × hoog; belastbaar = max(0, bedrag − vrijstelling)',
    files: ['lib/horizon-data.ts', 'lib/phase-analysis.ts', 'lib/calculator/prefab-definitions.ts'],
    functions: ['berekenSchenkbelasting', 'berekenErfbelasting', 'resolveSchenkErfParams', 'analyzeSchenkingPlan', 'formatErfenisTipTekst'],
    constants: [
      { label: 'Schenkvrijstelling kind (2026)', value: '€6.908' },
      { label: 'Schenkvrijstelling kleinkind/overig (2026)', value: '€2.769' },
      { label: 'Eenmalig verhoogd kind 18-40 (2026)', value: '€33.129' },
      { label: 'Erfvrijstelling partner (2026)', value: '€828.035' },
      { label: 'Erfvrijstelling kind/kleinkind (2026)', value: '€26.230' },
      { label: 'Schijfgrens schijf 1→2 (2026)', value: '€158.669' },
      { label: 'Tarieven (jaaronafhankelijk)', value: 'kind 10/20% · kleinkind 18/36% · overig 30/40%' },
    ],
    elementIds: ['as-belasting'],
    note: 'Jaargelaagd in SCHENK_ERF_PARAMS (2024/2025/2026) analoog aan BOX3_PARAMS; berekenSchenkbelasting/berekenErfbelasting lezen via resolveSchenkErfParams(jaar) (default = lopend jaar, met fallback naar het dichtstbijzijnde bekende jaar ≤ gevraagd — 2027 blijft dus op 2026-niveau tot een 2027-laag wordt toegevoegd). Alleen vrijstellingen, de eenmalig verhoogde schenkvrijstelling en de schijfgrens zijn jaargebonden; de schijfpercentages (10/20 · 18/36 · 30/40) zijn wettelijk jaaronafhankelijk en staan één keer als SCHENK_TARIEVEN_RATES/ERF_TARIEVEN_RATES. Eén bron over alle oppervlakken: phase-analysis (NL_SCHENKING_VRIJSTELLING), de calculator-prefab (schenkenVsErven-defaults) én de erfenis-prefab tip/opties worden uit SCHENK_ERF_PARAMS afgeleid (generatorfuncties formatErfenisTipTekst/-Opties/-Tip) i.p.v. losse literals. Dit hief de drift op waarbij de constanten "2026" claimden maar 2024/2025-cijfers bevatten en één modal 2024- én 2025-vrijstellingen naast elkaar toonde (heffing werd ~1,5-2,2% overschat).',
  },

  // ── Toekomst (FIRE) ──
  {
    id: 'fire-params',
    title: 'FIRE-parameters resolver',
    domain: 'Toekomst (FIRE)',
    summary: 'Lost de rendements- en inflatie-aannames op uit het profiel; levert de effectieve veilige onttrekkingsvoet.',
    inputs: ['profiles (expected_return, inflation_rate)'],
    outputs: ['grossReturn', 'inflationRate', 'effectiveSwr'],
    files: ['lib/fire-params.ts'],
    functions: ['resolveFireParams', 'computeEffectiveSwr'],
    constants: [{ label: 'NL_SWR', value: '≈2,84% (2026: DEFAULT_RETURN − BOX3_DRAG − inflatie; Box 3-gecorrigeerd — niet de klassieke 4%)' }],
    elementIds: ['as-planning'],
    note: 'De SWR-formule heeft één home: computeEffectiveSwr (lib/fire-params.ts). Components/widgets dupliceren de formule niet en hardcoden geen 0.04.',
  },
  {
    id: 'unified-projection',
    title: 'Gedeelde projectie-helpers (consumer-typecontract, geen eigen motor)',
    domain: 'Toekomst (FIRE)',
    summary: 'Gedeelde types en helperfuncties voor vermogensprojectie. De v1-FIRE-engines (runUnifiedProjection, runSimulation) zijn fysiek verwijderd (C5-c, ADR 0016); sinds FASE 6 stap 5A (commit 95bafeb53) is óók de v2-grootboek-engine (lib/horizon-engine/) fysiek verwijderd. lib/unified-projection.ts bevat nu uitsluitend het CONSUMER-CONTRACT (UnifiedProjectionInput/Row/Result) dat de horizon-kernel invult — geen engine-logica meer. lib/fire-simulation.ts blijft de SimCashflow-expansie (life-events → kasstromen) die de kernel-adapter als invoer leest.',
    inputs: ['netto vermogen', 'sparen (spaarquote × inkomen)', 'life_events', 'FIRE-parameters'],
    outputs: ['UnifiedProjectionInput/Row/Result — het typecontract dat elke grafiek-/tabel-consument leest'],
    formula: '— (geen berekening; zuiver typecontract. Rekenlogica staat in lib/horizon-kernel/, zie calc "FIRE — horizon-kernel (Excel-oracle, maandbasis)")',
    files: ['lib/unified-projection.ts', 'lib/fire-simulation.ts', 'lib/household-type.ts'],
    functions: ['lifeEventsToCashflows', 'unifiedRowsToStackedRows', 'toSimResult', 'hasPartner'],
    elementIds: ['as-planning', 'fn-toekomstplannen'],
    note: 'ADR 0032 (default-flip 2026-07-03, fysieke v2-verwijdering 2026-07-03/95bafeb53): lib/horizon-kernel/bridge.ts#kernelToUnifiedResult is nu de ENIGE plek die dit contract invult — het vervangt de verwijderde v2-adapter (lib/horizon-engine/adapter.ts#ledgerToUnifiedResult) 1:1 qua vorm, zodat alle bestaande grafiek-/tabel-/freedomPct-consumenten ongewijzigd blijven werken. Gedeelde types/helpers blijven: UnifiedProjectionInput/Row/Result, AssetLiquidation, SimResult/Row/Cashflow, lifeEventsToCashflows, unifiedRowsToStackedRows, toSimResult, unifiedToBucketResult. Zie calc "FIRE — horizon-kernel (Excel-oracle, maandbasis)" voor de actuele engine.',
  },
  {
    id: 'horizon-kernel',
    title: 'FIRE — horizon-kernel (Excel-oracle, maandbasis)',
    domain: 'Toekomst (FIRE)',
    summary:
      'De ENIGE FIRE-rekenmotor sinds FASE 6 stap 5A (commit 95bafeb53, default-flip 2026-07-03). Pure-TypeScript port van de eigenaar-geverifieerde Excel-oracle "Core calc v5.xlsm" (ADR 0032): rekent op MAANDBASIS (index 0..1199, tot leeftijd 100), NOMINAAL (niet reëel — dit keert de modelkeuze van het verwijderde v2-grootboek om), met een structurele één-maand-lag (belasting/capaciteit/rendement op saldi van m−1, bewust — geen bug), Box 3 via de cashflow (forfaitair én werkelijk), een capaciteit-waterval met prioriteit-gewichten (½^(prio−1)) + reserve + tekort-lening, en een maand-bisectie-solver met expliciete statussen (reached_now/reached_at/unreachable_within_horizon/pension_shortfall). Parity tegen het Excel is de poortwachter: elke wijziging vereist een groene cel-voor-cel-vergelijking (tolerantie ≤ €0,01) tegen 19 fixtures uit het .xlsm.',
    inputs: ['assets/potten (per rol: cash/beleggingen/eigen huis/hypotheek/pensioen)', 'FIRE-parameters (rendement, inflatie)', 'life_events → domein-expanders (AOW, Pensioen, Huis, Werk) als kasstromen/events', 'eindstrategie + onttrekkingsprofiel (Vast/Afnemend/Oplopend/Guardrails)'],
    outputs: ['KernelProjection (maandtabellen A–PT: Bel/CF/Ont/Af/Toename-afname/Verdeling/Bez/S/Prognose/ES/Auto-gebeurtenissen/Geb/PT/Werk-strategie)', 'SolveFireResult (fireAge fractioneel + status + €/mnd-hint)', 'UnifiedProjectionResult/SimResult (via de bridge — het bestaande consumer-contract; additief uitgebreid met requiredFireNetWorth = Prognose!I@FIRE, het FIRE-doel INCL. eigen woning — spiegelt requiredFirePortfolio = Prognose!J@FIRE, liquide/excl. woning)'],
    formula:
      'Per maand (nominaal, één-maand-lag op saldi van m−1): rendement/pot → Box 3-drag via cashflow → schuldschema (incl. woningblok AY:BE: verkoop-/opeethypotheek-mechaniek) → kasstromen uit de domein-expanders → capaciteit-waterval (prioriteit-gewichten ½^(prio−1) + reserve, tekort → tekort-lening) → onttrekking volgens het profiel. TEKORT-LENING: gevoed uit onbenut afname+onttrekking (BV+EO), groeit met rente P!B25/12, afgelost met S!AC. S!AC = de surplus-tak MIN(Toename-aflos-budget, saldo(m−1)+rente) PLUS — op het app-pad (F6-bugfix, gap V19/ADR 0033, KernelInput.tekortAflossingUitLiquide=true) — een maandelijkse tekort-aflos-stap die het pre-existente tekort alsnog aflost uit de RESTERENDE liquide bezit-capaciteit (categoriesaldo m−1 − afname − onttrekking, onttrekking-waterval-volgorde); Σruw=0-neutraal (bezit −X, tekort −X), geen dubbele rente-boeking. Parity-/fixture-pad zet de vlag NIET → Excel v5-oracle byte-identiek (lening compoundt). FIRE = maand-bisectie (BepaalFIRE-port): pensioen-eindstrategie kortsluit op de AOW-/pensioenleeftijd (geen bisectie); anders zoekt de bisectie de kleinste maand waar het statusblok (B35 eindleeftijd → B36 doelbedrag → B37 modelwaarde (Prognose!I netto-vermogen bij legacy-nalatenschap, Prognose!J netto-liquide anders) → B38 gap = B37−B36) niet-negatief is.',
    files: ['lib/horizon-kernel/engine.ts', 'lib/horizon-kernel/solver.ts', 'lib/horizon-kernel/gap.ts', 'lib/horizon-kernel/bridge.ts', 'lib/horizon-kernel/run-unified.ts', 'lib/horizon-kernel/adapter/index.ts', 'lib/horizon-kernel/tables/*.ts', 'lib/horizon-kernel/wrappers/band.ts', 'lib/horizon-kernel/wrappers/mc.ts', 'lib/horizon-kernel/wrappers/hist.ts'],
    functions: ['runKernelProjection', 'solveFire', 'computeGap', 'computeDoelblok', 'prognoseJ', 'kernelToUnifiedResult', 'buildKernelSlotMeta', 'runKernelUnified', 'buildKernelInputFromApp', 'buildKernelInputFromAppWithNotices'],
    constants: [
      { label: 'Maandhorizon', value: '1200 maanden (index 0..1199) — tot leeftijd 100, exact zoals het Excel-oracle' },
      { label: 'Onttrekkingsprofielen', value: 'Vast/Afnemend/Oplopend/Guardrails — vervangen de v2-strategieën vpw/bucket (ADR 0032 pt. 7; bestaande vpw/bucket-profielen migreren naar Vast)' },
      { label: 'Solver-statussen', value: "reached_now / reached_at / unreachable_within_horizon / pension_shortfall — letterlijke port van het Excel-statusblok B93-B100" },
      { label: 'Parity-tolerantie', value: '≤ €0,01 per cel, cel-voor-cel tegen 19 fixtures uit Core calc v5.xlsm (SHA256 3E905809B5CC…A80D)' },
      { label: 'Tekort-aflossing uit liquide (F6, transitioneel)', value: 'KernelInput.tekortAflossingUitLiquide — app-pad AAN (adapter), parity-/fixture-pad UIT (byte-identiek Excel v5); gap V19 / ADR 0033' },
    ],
    elementIds: ['as-planning', 'fn-toekomstplannen'],
    note: 'Architectuur + oracle-documentatie: lib/horizon-kernel/README.md (module­kaart + parity-stand), docs/horizon-oracle/* (Excel-structuur/rekenflow/named-ranges), plan + gap-besluitenregister docs/horizon-excel-oracle-plan.md. ADR 0032 (aanvaard, default-flip 2026-07-03) is het besluit-anker; ADR 0013 + 0016 zijn VERVANGEN door 0032 (de v2-grootboek-engine die ze beschreven is fysiek verwijderd); ADR 0014/0015/0027/0028/0030/0031 (v2-specifieke besluiten) hebben een addendum gekregen dat aangeeft welk deel de kernel overneemt/erft en welk deel vervalt — zie die ADR-bestanden zelf. Domein-expanders vóór de kern (ADR 0032 pt. 5): de kern kent GEEN domeinbegrippen (geen "AOW"/"downsize"/"werk") — de vier levensstrategieën (AOW, Pensioen, Huis, Werk) en de event-catalogus worden in de adapter (lib/horizon-kernel/adapter/) naar kern-parameters vertaald; zo bouwt tables/werk-strategie.ts zelf de salarisladder-delta (Excel-kolommen K/L/P/Q/R/S) uit de ruwe werk-metadata-parameters die de adapter doorgeeft — de OUDE app-cashflow-expansie werkMetadataToCashflows (lib/werk-strategie.ts) wordt hier NIET meer gebruikt (zou dubbel rekenen); dat bestand blijft wel bestaan voor SimCashflow-previews elders. Woningblok (Bez!AY:BE): alle vier housing-strategieën (Meerekenen/Uitsluiten/Verkopen/Opeethypotheek) zijn kernel-NATIVE in tables/bez.ts — het huis blijft een pot in het grootboek en wordt AS NIET-LIQUIDE behandeld TOTDAT de daadwerkelijke verkoopmaand (AY 0→1) valt (bij "Verkopen": vaste leeftijd óf "wanneer nodig" = liquide vermogen onder de behoefte-buffer); dat is een principiële vereenvoudiging t.o.v. het verwijderde v2-model, dat de downsize-woning al vóór de verkoop als FIRE-eligible "spendable" telde (ADR 0028) — zie de ADR 0028-addendum voor de precieze grondslag-vergelijking. Consumer-contract ongewijzigd: lib/horizon-kernel/bridge.ts#kernelToUnifiedResult zet de kernel-uitvoer (maandbasis, nominaal) om naar exact hetzelfde UnifiedProjectionResult-contract dat de verwijderde v2-adapter leverde (per jaar-blok k = maanden [12k..12k+11]; inflationFactor blijft meegedragen zodat het bestaande reëel-weergave-contract in de UI intact blijft), zodat grafiek/tabellen/freedomPct-consumenten ongewijzigd blijven. runKernelUnified (lib/horizon-kernel/run-unified.ts) is de canonieke "één-run"-helper die alle kernel-consumenten (convergentie-, what-if- en huishouden-router) delen: buildKernelInputFromAppWithNotices → solveFire → buildKernelSlotMeta → kernelToUnifiedResult — één plek zodat de vier oppervlakken byte-identiek dezelfde kern-invoer bouwen (geen drift). Bekende, met opzet gereproduceerde Excel-eigenaardigheid (parity, geen bug): het statusblok B93 geeft bij een doelbedrag van €0 (legacy-nalatenschap €0, of deplete zonder expliciet doel) altijd reached_now terug zodra Prognose!J(0) ≥ 0 — de kern reproduceert dit Excel-gedrag bewust (docs/horizon-excel-oracle-plan.md §V12); een eventuele UI-afwijking daarvan is een apart, nog niet genomen gap-besluit. Parity-stand (lib/horizon-kernel/README.md): alle 19 fixtures, ≈10,59 mln teacher-forced cellen + de integrale engine + solver + band + MC 0 mismatches; nog slapend in alle fixtures (geïmplementeerd conform bron, nooit geraakt): scenarioshift-kern P!B43≠0 buiten de band-wrapper, Bez!BB-aflossingscomponent, en Hist (backtest blijft app-zijdig — gap-besluit V11). F6-bugfix (gap V19 / ADR 0033, 2026-07-04): de tekort-lening werd door het Excel v5-oracle nooit afgelost in de onttrekkingsfase (S!AC alleen uit de maandsurplus-tak = 0) → een verkoop-transitie-lag-piek (eigenaar: €6.758 op leeftijd 75) compoundde 17 jaar met 5% rente terwijl er liquide vermogen náást stond. De kernel lost dit voortaan (app-pad) maandelijks af uit de resterende liquide bezit-capaciteit; schakelbaar via tekortAflossingUitLiquide (parity-pad UIT → 735 fixtures byte-groen). TRANSITIONEEL tot Excel v6 + fixture-herextractie; vangnet lib/horizon-kernel/tekort-aflossing-liquide.test.ts, concern horizon-kernel-bekende-afwijkingen punt 4. Performance (2026-07-04, byte-identiek — géén gedrags-/getal-wijziging, oracle 735 fixtures byte-groen): de maandloop is ~43% sneller gemaakt door zuivere allocatie-hoisting — de input-constante Verdeling-gewichten/reserve-maskers worden één keer per input berekend (computeVerdelingWeights, doorgegeven via optioneel VerdelingDep.weights met compute-if-absent fallback voor de parity-test), het vroege woningblok draait via de lichte computeBezWoning i.p.v. de volle computeBez, de per-maand tussen-arrays/CategorieBedrag-objecten hergebruiken toegewijde scratch-buffers (catMap/schuldCatTotalsPerTs vullen een out-buffer), en de bisectie-interne solver-probes slaan de weggegooide Ont-post-recompute over (engine-optie skipOntPostRecompute, default OFF) + gebruiken computeGap i.p.v. het volle computeStatusBlok. Geen float-herordening; alle stappen bit-identiek by construction. Dubbele grondslag incl./excl. eigen woning (2026-07-06, FOUNDATION-naad — PUUR DOORGELEID, geen rekenwijziging, oracle byte-groen): de bridge leidt naast requiredFirePortfolio (= Prognose!J@FIRE, LIQUIDE/excl. woning) nu óók requiredFireNetWorth (= Prognose!I@FIRE, TOTAAL netto vermogen INCL. woning) door in UnifiedProjectionResult/SimResult — via toSimResult beschikbaar voor de UI (horizon: use-horizon-fire-sim; dashboard: gespiegeld als DashboardData.simRequiredNetWorth náást simRequiredPortfolio). Additief/optioneel veld (stub-/preview-resultaten mogen het weglaten); identiteit I = J + (niet-liquide bezit − niet-liquide schuld) ⇒ requiredFireNetWorth ≥ requiredFirePortfolio bij overwaarde ≥ 0. De HUIDIGE-vermogen-tegenhanger (netWorthExclHome = netWorth − overwaarde, ZUIVER ook bij reverse_mortgage) + de gating showDualHousingBasis staan in de bundel — zie calc "Netto vermogen (gewogen)".',
  },
  {
    id: 'vrijheidsvoortgang',
    title: 'Vrijheidsvoortgang (incl./excl. eigen woning)',
    domain: 'Toekomst (FIRE)',
    summary: 'Hoe ver je bent richting volledige vrijheid (0–100%). Standaard op de INCL.-woning grondslag (volledig netto vermogen ÷ FIRE-doel incl. woning); alleen wanneer de woning van FIRE is uitgesloten (exclude_from_fire) op de EXCL. (liquide) grondslag.',
    inputs: [
      'grondslag-keuze: isHomeExcludedFromFire(config) ∧ hasEigenHuis → EXCL., anders INCL.',
      'INCL.-teller: volledig netto vermogen incl. eigen woning + niet-liquide assets (netWorth)',
      'INCL.-noemer: FIRE-doel incl. woning = requiredFireNetWorth (Prognose!I@FIRE); scalar-fallback via inclHomeTargetFromScalar',
      'EXCL.-teller: FIRE-eligible netto vermogen (huis gefilterd via housing-strategie)',
      'EXCL.-noemer: benodigde portefeuille = requiredFirePortfolio (Prognose!J@FIRE) / strategie-bewust fireTarget',
    ],
    outputs: ['vrijheidsvoortgang % (0–100)'],
    formula: 'basis = homeExcludedFromFire ? {teller: fireEligibleNetWorth, noemer: requiredFirePortfolio} : {teller: netWorth, noemer: requiredFireNetWorth}; pct = min(100, max(0, teller / noemer × 100)); 100% ⇔ FIRE-doel bereikt (op de FIRE-maand geldt netWorth == requiredFireNetWorth én liquide == requiredFirePortfolio, dus beide grondslagen raken 100% op hetzelfde moment)',
    files: ['lib/core-metrics.ts', 'lib/housing-strategy.ts', 'lib/dashboard-data-loader.ts', 'lib/horizon-data-loader.ts', 'lib/core-data-loader.ts', 'lib/ai/context/shared-context.ts', 'app/api/share/freedom-card/route.ts', 'app/api/report/route.ts', 'components/app/horizon/horizon-client.tsx'],
    functions: ['computeFreedomProgressWithBasis', 'selectFreedomProgressBasis', 'inclHomeTargetFromScalar', 'computeFreedomProgress', 'isHomeExcludedFromFire', 'getFireEligibleNetWorth'],
    elementIds: ['as-planning', 'fn-toekomstplannen', 'as-vermogen'],
    note: 'GRONDSLAG-HERZIENING (2026-07-07, ADR 0034 — supersedeert ADR 0009 op dit punt, ADR 0009 status vervangen): de vrijheidsvoortgang staat nu STANDAARD op de INCL.-woning grondslag. Beslissing van de eigenaar: zolang de eigen woning uiteindelijk wordt ingezet om de doelen te halen (include_full / downsize / opeethypotheek), telt ze mee in teller (volledig netto vermogen) én noemer (requiredFireNetWorth = Prognose!I@FIRE). Alléén wanneer de woning EXPLICIET is uitgesloten van FIRE (housing-strategie exclude_from_fire mét eigen woning) valt de grondslag terug op EXCL. (liquide) — teller = fireEligibleNetWorth, noemer = requiredFirePortfolio (Prognose!J@FIRE) — precies het pre-2026-07-gedrag (ADR 0009 origineel). De grondslag-keuze leeft op één plek: `computeFreedomProgressWithBasis`/`selectFreedomProgressBasis` (core-metrics) + het predikaat `isHomeExcludedFromFire` (housing-strategy). Waar de unified projection draait (dashboard-data-loader, /toekomst-client) is de INCL.-noemer de kernel-`requiredFireNetWorth`; waar alleen een scalar fireTarget bekend is (horizon/core-loader, AI shared-context, freedom-card, report, what-if-recompute) levert `inclHomeTargetFromScalar` de INCL.-noemer = excl.-doel + (netWorth − fireEligibleNetWorth), zodat 100% op HETZELFDE punt valt als op de excl.-grondslag. Alle ~8 display-consumers routeren hierlangs; de balk-label op /toekomst toont nu het incl.-woning doel (fireTargetInclHome) i.p.v. het liquide doel. GEVOLG voor het gezondheidsgetal: de fire-pijler erft freedomPct, dus de live health-score valt voor huiseigenaren nu HOGER uit dan onder ADR 0009 (die de score juist verlaagde omdat "een huis waarin je woont geen vrijheid vrijspeelt") — dat is de bewuste keerzijde van deze herziening. GEVOLG voor de "nog X jaar"-aftelling / FIRE-leeftijd (ADR 0034 addendum 2026-07-07): die staat AL op DEZELFDE grondslag als freedomPct — GEEN kernel-wijziging nodig. De solver zoekt de FIRE-maand op Prognose!J (= I − niet-liquide netto); onder Meerekenen (include_full, app-default) is de woning NIET niet-liquide → J == I → requiredFirePortfolio == requiredFireNetWorth, dus de aftelling meet HETZELFDE incl.-woning doel. Alléén bij exclude_from_fire valt de woning uit Prognose!J → aftelling liquide, spiegel van freedomPct dat daar óók op EXCL. terugvalt. Op de FIRE-maand geldt I == requiredFireNetWorth én J == requiredFirePortfolio → 100% freedomPct en aftelling-0 vallen op EXACT dezelfde maand (élke housing-strategie). Vergrendeld door lib/horizon-kernel/fire-basis-invariant.test.ts. reverse_mortgage: de EXCL.-tak (indien ooit gekozen) blijft de leen-ruimte-grondslag (ADR 0029, reverseMortgageBorrowable als ENE home); onder INCL. telt de volle overwaarde mee. Snapshot-historie (app/api/snapshots) en de household-engine houden bewust hun eigen per-rij/per-huishouden definitie. De check-funnel (lib/check/build-report.ts, ADR 0025 HOUSE_FIRE_WEIGHT=0.5) is een aparte public-intake-grondslag, bewust NIET geraakt.',
  },
  {
    id: 'sim-netto-vermogen-projectie',
    title: 'Geprojecteerd netto vermogen (incl. niet-liquide)',
    domain: 'Toekomst (FIRE)',
    summary:
      'Per-jaar geprojecteerd VOLLEDIG netto vermogen = FIRE-portefeuille (endPortfolio) + meegroeiende niet-liquide assets (eigen huis) die uit de FIRE-pot zijn gefilterd. Voedt de /overzicht-vermogensgrafiek zodat de projectielijn continu doorloopt vanuit het Vandaag-punt (volledig vermogen incl. huis) i.p.v. te dippen naar de FIRE-portefeuille zónder huis. FIRE-grootheden (requiredFirePortfolio, fireAge, freedomPct) blijven onveranderd op de liquide grondslag.',
    inputs: [
      'simRows (endPortfolio = LedgerRow nettoVermogen, nominaal, uit de kernel-bridge)',
      'currentNetWorth (volledig netto vermogen vandaag, incl. huis)',
      'housing-strategie (mode) + houseInLedger-vlag',
      'eigen-huis-assets + gekoppelde hypotheken',
    ],
    outputs: ['simNetWorthRows: { age, netWorth }[] (geprojecteerd volledig netto vermogen per jaar)'],
    formula:
      'per jaar: netWorth = endPortfolio + houseEquity(age) + reconcileOffset; houseEquity = max(0, projectEigenHuisValuesAt.currentValue − projectMortgageStateAt.balance), ALLEEN wanneer housingFilters (exclude_from_fire) ÉN NIET houseInLedger; 0 zodra houseInLedger true is (élke housing-modus onder de horizon-kernel: het huis zit al in endPortfolio, ADR 0015/0032) of bij include_full/reverse_mortgage; reconcileOffset = currentNetWorth − (endPortfolio[0] + houseEquity[0]) veranker jaar 0 op de Vandaag-grondslag',
    files: [
      'lib/horizon/networth-rows.ts',
      'lib/dashboard-data-loader.ts',
      'lib/housing-strategy.ts',
      'components/overview/mini-networth-chart.tsx',
    ],
    functions: ['buildSimNetWorthRows', 'projectEigenHuisValuesAt', 'projectMortgageStateAt', 'shouldFilterEigenHuisForFire', 'deriveHousingContext'],
    elementIds: ['as-planning', 'as-vermogen', 'fn-toekomstplannen'],
    note: 'Verhuisd uit lib/horizon-engine/networth-projection.ts bij de v2-verwijdering (FASE 6 stap 5A, commit 95bafeb53) naar lib/horizon/networth-rows.ts — de v1/v2-downsize-begrippen (verkoop_eigen_woning-event, spendable/saleManaged) zijn gestript, de houseInLedger-semantiek blijft. Geen tweede engine-run en geen tweede WOZ/groeiformule: de FIRE-pot komt 1:1 uit endPortfolio (de horizon-kernel via de bridge), de huiswaarde-groei uit de canonieke projectEigenHuisValuesAt (per-asset expected_return, nominaal — consistent met de nominale endPortfolio uit de kernel) en de hypotheek-afbouw uit projectMortgageStateAt. Géén dubbeltelling: houseInLedger (kernel-tak, geldt voor ÉLKE housing-modus sinds ADR 0032 — de kernel houdt het huis voor alle vier de modi in het grootboek tot de daadwerkelijke verkoop-/opeetmaand) → simNetWorthRows ≡ endPortfolio, tel niets bij; include_full/reverse_mortgage → idem; exclude_from_fire (zonder houseInLedger, legacy-pad) → endPortfolio + meegroeiende overwaarde. Continuïteit (SSoT): de reconcile-offset verankert jaar 0 op currentNetWorth (zelfde grondslag als het Vandaag-punt + historie), wat óók de include_full-knik dicht. De chart her-verankert defensief nog eens op de getoonde currentNetWorth-prop (huishoud-/partnerperspectief). De marker-hoogte op /overzicht = geprojecteerd netto vermogen op de vrijheidsleeftijd; simRequiredPortfolio (liquide vrijheidsdoel) wordt APART als label getoond, niet als hoogte op de netto-vermogen-as.',
  },
  {
    id: 'fire-range-scenarios',
    title: 'FIRE-range & scenario’s',
    domain: 'Toekomst (FIRE)',
    summary: 'Bandbreedte rond de FIRE-datum bij verschillende rendementsaannames (optimistisch/pessimistisch).',
    inputs: ['netto vermogen', 'sparen', 'rendements-offsets'],
    outputs: ['FIRE-range (jaren)', 'scenario-paden'],
    files: ['lib/horizon-data.ts'],
    functions: ['computeFireRange'],
    elementIds: ['as-planning'],
  },
  {
    id: 'backtest',
    title: 'Backtesting (historische paden)',
    domain: 'Toekomst (FIRE)',
    summary: 'Toetst het plan tegen historische marktreeksen en geeft een slaagkans.',
    inputs: ['vermogenspad', 'historische rendementen'],
    outputs: ['slaagkans %', 'named paths (best/mediaan/worst)'],
    files: ['lib/horizon-data.ts'],
    functions: ['runBacktest', 'ageAtDate'],
    elementIds: ['as-planning', 'fn-toekomstplannen'],
  },
  {
    id: 'kosten-koper',
    title: 'Kosten koper (life-event “Huis kopen”)',
    domain: 'Toekomst (FIRE)',
    summary:
      'Berekent de eenmalige kosten koper bij het life-event “Huis kopen” (hoofdverblijf): overdrachtsbelasting (met startersvrijstelling), notaris, taxatie, bankgarantie en NHG-borgtochtprovisie. Het totaal stroomt als eenmalige uitgave in de FIRE-projectie (life_events → SimCashflow → horizon-kernel) — verkeerde grenzen = verkeerd bedrag. Enige bron van waarheid; voorheen 4× gedupliceerd in horizon-client.tsx met verouderde 2024-grenzen.',
    inputs: ['aankoopprijs', 'starter (metadata.eersteWoning)', 'NHG (metadata.nhg)'],
    outputs: ['overdracht', 'notaris', 'taxatie', 'bankgarantie', 'nhgKosten', 'totaal (kosten koper €)'],
    formula:
      'overdracht = (starter ∧ prijs ≤ €555.000) ? 0 : round(prijs × 2%); nhgKosten = (NHG ∧ prijs ≤ €470.000) ? round(prijs × 0,4%) : 0; totaal = overdracht + €1.200 (notaris) + €500 (taxatie) + round(prijs × 0,1%) (bankgarantie) + nhgKosten',
    files: ['lib/kosten-koper.ts', 'lib/constants.ts', 'components/app/horizon/horizon-client.tsx'],
    functions: ['computeKostenKoper'],
    constants: [
      { label: 'OVB_TARIEF_EIGEN_WONING', value: '2% overdrachtsbelasting eigen woning (hoofdverblijf, niet-starter). Bron: Belastingdienst, 2026' },
      { label: 'STARTERSVRIJSTELLING_MAX', value: '€555.000 — startersvrijstelling-grens (was €510.000). Bron: Belastingdienst, 2026' },
      { label: 'NHG_KOSTENGRENS', value: '€470.000 — NHG-kostengrens (was €435.000). Bron: nhg.nl, 2026' },
      { label: 'NHG_BORGTOCHTPROVISIE_PCT', value: '0,4% borgtochtprovisie (was 0,6%). Bron: nhg.nl, 2026' },
    ],
    elementIds: ['as-planning', 'as-belasting', 'fn-toekomstplannen'],
    note: 'Fiscale grenzen zijn jaargebonden — alle constanten staan in lib/constants.ts met bron + jaartal (jaarlijks verifiëren). De vier UI-call-sites (amount-berekening in de metadata-handler, twee auto-recalculate-handlers en de kosten-koper-breakdown-weergave) consumeren computeKostenKoper i.p.v. de som lokaal te herhalen (consume, don’t recompute). Een tweede woning/beleggingspand (holiday_home_purchase) valt hier NIET onder — 8% OVB (2026), geen startersvrijstelling, en het bedrag is daar handmatig.',
  },
  {
    id: 'retirement-expenses',
    title: 'Uitgaven na pensioen',
    domain: 'Toekomst (FIRE)',
    summary: 'De verwachte jaarlijkse uitgaven na FIRE — de basis voor het benodigde vermogen.',
    inputs: ['budgets', 'gekozen methode (NIBUD / huidige uitgaven / handmatig)'],
    outputs: ['jaarlijkse pensioenuitgave', 'benodigd vermogen (× 1/SWR)'],
    files: ['lib/budget-utils.ts'],
    functions: ['computeRetirementExpenses'],
    elementIds: ['as-planning'],
  },
  {
    id: 'pensioen-projectie',
    title: 'Pensioen-projectie (verwacht jaarbedrag per leeftijd)',
    domain: 'Toekomst (FIRE)',
    summary:
      'Zet de pensioenpotten (life_events met event_type=pension) om naar een rij-per-leeftijd projectie van het verwachte JAARBEDRAG: bruto nominaal (vlak, = TeBereiken van mijnpensioenoverzicht.nl), bruto bij volledige indexatie (illustratieve bovengrens) en netto na Box 1-belasting. Pure rekenfunctie (geen IO). Voedt de pensioen-projectiegrafiek in de pensioen-strategie-editor.',
    inputs: [
      'life_events (event_type=pension; monthly_income_change, target_age, duration_months)',
      'huidige leeftijd (uit dateOfBirth via ageAtDate)',
      'inflationRate (resolveFireParams)',
      'Box 1-belastingjaar',
    ],
    outputs: [
      'PensionProjectionRow[] per leeftijd',
      'brutoNominaal (vlak, TeBereiken)',
      'brutoGeindexeerd (bij volledige indexatie)',
      'nettoGeindexeerd (na Box 1)',
    ],
    formula:
      'per leeftijd: brutoNominaal = Σ actieve potten × 12; brutoGeindexeerd = brutoNominaal × (1+inflatie)^(leeftijd−nu); nettoGeindexeerd = brutoGeindexeerd − computeBox1Tax(…, aow:true)',
    files: ['lib/pension/pension-projection.ts', 'components/future/strategie/pensioen-projectie-chart.tsx'],
    functions: ['buildPensionProjection', 'potYearlyAtAge', 'computeBox1Tax'],
    constants: [
      { label: 'duration_months = 0', value: 'levenslang (geen einddatum)' },
      { label: 'Belastingtarief', value: 'AOW-gerechtigd (pensioen loopt vanaf de pensioendatum)' },
    ],
    elementIds: ['as-planning', 'as-belasting', 'fn-toekomstplannen'],
    note: 'Consume, don\'t recompute: inflatie komt van de aanroeper (resolveFireParams), belasting via computeBox1Tax (geen eigen tarieven). De geïndexeerde lijn is een ILLUSTRATIEVE bovengrens (bedrag bij volledige indexatie aan de inflatie), ongeacht of een pot daadwerkelijk geïndexeerd is — het VERSCHIL met de vlakke nominale lijn toont het koopkrachtverlies bij een niet-meegroeiend pensioen (dus NIET een reëel-naar-vandaag deflatie). Bewuste simplificaties: Box 1-bracket-creep niet gemodelleerd; AOW niet als lijn (aparte as); eerder stoppen met werken niet verwerkt (potten gaan uit van doorwerken tot de pensioendatum — als rode melding in de grafiek getoond).',
  },
  {
    id: 'benchmark-referentie-peer',
    title: 'Gemodelleerde referentie-peer (benchmark)',
    domain: 'Vermogen',
    summary:
      'Modelleer een "typische peer" voor de benchmarkrapportage op /rapportages/benchmark: bouw uit cohort-mediane CBS/Nibud/DNB-invoer (vermogen, inkomen, spaarquote, leeftijd × huishoudtype) een synthetische HealthScoreInput en FinancialInput aan en draai die door dezelfde canonieke rekenmotoren als de gebruiker. Geeft referentie-gezondheidsscore en referentie-vrijheidsleeftijd — bewust gemarkeerd als \'modelled\' (niet een gemeten gemiddelde). Eigen-gebruikerscijfers worden nooit herberekend: de rapportage consumeert de DashboardData-bundel.',
    inputs: [
      'CBS-mediaan/gemiddeld netto vermogen per leeftijdsband (Materiële welvaart 2024); huishoudtype-verdeling via gemodelleerde, CBS-gegronde factor',
      'CBS gestandaardiseerd gemiddeld besteedbaar inkomen per leeftijdsband (tabel 2.4.1); ruw huishoudinkomen via CBS-equivalentiefactoren',
      'indicatieve spaarquote (Nibud, leeftijdsband)',
      'midAge (midden van de cohort-leeftijdsband)',
      'huishoudtype (via getNibudHouseholdType)',
    ],
    outputs: [
      'referentie-gezondheidsscore (0–100)',
      'referentie-vrijheidsleeftijd (fractioneel, of null)',
      'referentie-vrijheids-% (consistente grondslag)',
      'wereld-vermogenspercentiel (UBS Global Wealth Report)',
      'wereld-inkomenspercentiel (World Inequality Database)',
    ],
    formula:
      'cohort-medianen → synthetische FinancialInput + HealthScoreInput → computeFireProjection (default rendement/SWR/inflatie) + computeHealthScoreFromInputs → ReferencePeerResult; budgetdiscipline- en concentratie-pijler inactief voor de peer (geen budgetdata); noodfonds aanname = 3 maanden.',
    files: [
      'lib/benchmark/reference-peer.ts',
      'lib/benchmark/build-benchmark.ts',
      'lib/benchmark/nl-reference.ts',
      'lib/benchmark/global-reference.ts',
      'lib/benchmark/cohort.ts',
      'lib/benchmark-report-data.ts',
      'app/api/report/benchmark/route.ts',
    ],
    functions: [
      'computeReferencePeer',
      'buildBenchmarkReport',
      'getCohortReference',
      'deriveCohort',
      'wealthTopPercent',
      'incomeTopPercent',
    ],
    constants: [
      { label: 'Peer noodfonds aanname', value: '3 maanden (PEER_EMERGENCY_FUND_MONTHS; transparant, indicatief)' },
      { label: 'Equivalentiefactoren inkomen', value: 'CBS Budgetonderzoek 2015 (vanaf verslagjaar 2018): alleenstaand 1,00 · paar 1,40 · gezin_jong 1,75 (gemodelleerd) · gezin_tiener 1,91. HOUSEHOLD_ADJUST.*.income in nl-reference.ts.' },
      { label: 'Vermogensfactoren huishoudtype', value: 'GEMODELLEERD (geen CBS-kruistabel): alleenstaand 0,35 · paar 1,45 · gezin_jong 1,25 · gezin_tiener 1,55. Gegrond op CBS-vermogen per huishoudtype 2022 (alleenstaand €18k vs meerpersoons €218k), gematigd voor de leeftijdsband.' },
      { label: 'Bronnen NL-statistieken', value: 'CBS Vermogen 2024 (mediaan/gemiddeld per leeftijd), CBS gestandaardiseerd besteedbaar inkomen 2024 (tabel 2.4.1), indicatieve Nibud spaarquote' },
      { label: 'Bronnen wereld-statistieken', value: 'UBS Global Wealth Report + World Inequality Database (WID)' },
    ],
    elementIds: ['as-rapport', 'as-planning', 'as-vermogen'],
    note: 'Bewust geen cross-user-aggregatie (privacy): de peer is volledig synthetisch, opgebouwd uit publieke NL-statistieken. Vermogen/inkomen zijn tier:"measured" (CBS-leeftijdsbasis) maar de huishoudtype-verdeling is GERAAMD — inkomen via CBS-equivalentiefactoren (ruw = gestandaardiseerd × factor), vermogen via een gemodelleerde CBS-gegronde factor; UI-badge "Geraamde referentie (CBS-basis)". Gemodelleerde uitkomsten (gezondheidsscore, vrijheidsleeftijd) zijn tier:"modelled". Zie ADR 0018.',
  },
  {
    id: 'huis-strategie-trigger',
    title: 'Eigen-huis-strategie — verkoop-/opeethypotheek-trigger (kernel-native)',
    domain: 'Toekomst (FIRE)',
    summary:
      'Het moment waarop de woning wordt verkocht (downsize) of de opeethypotheek start. Sinds FASE 6 stap 5A (commit 95bafeb53) bepaalt de horizon-kernel dit moment ZELF, binnen dezelfde maandloop als de rest van de projectie (Bez!AY:BE-woningblok, tables/bez.ts) — er is géén aparte app-zijdige meetrun/vaste-punt-iteratie meer nodig (de vroegere runSelectedProjection-meetrun uit lib/housing-trigger.ts is vervallen; dat bestand is nu types-only). Bij "Verkopen"/"Opeethypotheek" op "wanneer nodig" (on_depletion) verkoopt/opeet de kern zodra het liquide vermogen (Prognose!J) onder de behoefte-drempel zakt; bij een vaste leeftijd triggert de kern op die leeftijd. Het event-markerpunt in de UI leest het resultaat rechtstreeks uit de kernel-bridge (kernelHousingSale), dus marker en grafiek kunnen per constructie niet uiteenlopen.',
    inputs: [
      'woning-strategie-config (mode, trigger vaste-leeftijd/wanneer-nodig, verkoopprijs%/verkoopkosten%, drempel-maanden, max-leen%/rente — via lib/horizon-kernel/adapter/params.ts#buildWoning)',
      'de volledige kernel-maandloop (Bez!AY:BE leest S-saldi, huiswaarde, Prognose!J van dezelfde maand)',
    ],
    outputs: [
      'kernelHousingSale (leeftijd + maand van de eerste verkoopopbrengst > 0 — Bez!AZ)',
      'AY-verkoopvlag (monotoon; guardt de huiswaarde + BA/BB-vertakking na verkoop)',
      'AZ verkoopopbrengst, BA huur/mnd na verkoop, BB vervallen hypotheeklast (bevroren op verkoopmaand-rente)',
    ],
    formula:
      "AY(m) = 1 zodra AY(m−1)=1, óf (bij 'Verkopen') leeftijd ≥ verkoopleeftijd, óf (bij 'wanneer nodig') Prognose!J(m−1) onder de behoefte-drempel (drempelMaandenUitgave × maanduitgave, geïndexeerd) zakt. Verkoopmaand (AY 0→1): AZ = J(m−1)·verkoopprijs%·(1−verkoopkosten%) − S!D(m−1) (hypotheeksaldo). Géén trigger binnen de horizon ⇒ het huis blijft t/m maand 1199 in het grootboek en groeit door (geen 'no_sale'-uitzonderingspad meer nodig — de maandloop dekt de volle horizon per constructie).",
    files: ['lib/horizon-kernel/tables/bez.ts', 'lib/horizon-kernel/adapter/params.ts', 'lib/horizon-kernel/bridge.ts', 'lib/housing-strategy.ts', 'lib/housing-trigger.ts'],
    functions: ['buildWoning', 'kernelToUnifiedResult (kernelHousingSale)', 'parseHousingStrategy', 'getFireEligibleNetWorth'],
    elementIds: ['as-planning', 'fn-toekomstplannen', 'as-vermogen'],
    note: 'Principieel verschil met de verwijderde v2-engine: de kernel behandelt het huis bij ELKE housing-modus als niet-liquide TOTDAT de daadwerkelijke verkoop-/opeetmaand valt (geen vaste-punt-iteratie, geen "spendable vóór verkoop"-begrip zoals v2 had voor downsize, ADR 0028). Dat is eenvoudiger maar wél STRIKTER dan v2: de FIRE-eligibility voor "Verkopen" komt pas ná de verkoop, niet al tijdens de opbouw. lib/housing-trigger.ts blijft als types-only module bestaan (HousingTriggerSimBasis/SimulatedDepletionResult) voor de preview-/UI-serialisatie; de simulatie-machinerie erin is vervallen. Zie de ADR 0028-addendum voor de precieze vergelijking met het verwijderde v2-gedrag.',
  },
  {
    id: 'werk-strategie',
    title: 'Werk-strategie — loopbaan/inkomenslijn naar FIRE',
    domain: 'Toekomst (FIRE)',
    summary:
      'Vertaalt een loopbaan-/inkomensambitie (reële salarisgroei, plafond, deeltijd-stappen, salarissprongen) naar een inkomens-DELTA t.o.v. het basisinkomen dat de FIRE-engine al via de spaarquote (annualSavings) meeneemt. Sinds FASE 6 stap 5A bouwt de horizon-kernel de salarisladder ZELF, native, in een eigen Excel-tab-port (tables/werk-strategie.ts — nieuw in Excel v5); de app-cashflow-expansie werkMetadataToCashflows (lib/werk-strategie.ts) blijft bestaan voor previews elders maar voedt de HOOFDprojectie niet meer (dat zou dubbel rekenen — expliciet vermeden in de adapter).',
    inputs: [
      'life_events (event_type=werk, metadata: WerkMetadata — huidigNettoMaand, reeleGroeiPct, plafondNettoMaand, groeiTotLeeftijd, faseStappen, sprongen)',
      'huidige leeftijd (target_age van de werk-rij, afgeleid uit geboortedatum)',
      'netto maandinkomen (basisinkomen = huidigNettoMaand; bron: spaarquote-grondslag)',
      'FIRE-gate leeftijd (kernel-tak: de solver-gebonden FIRE-leeftijd, teacher-forced in parity)',
    ],
    outputs: [
      'kernel-tak: Werk-strategie-tabel kolom S (FIRE-gegate nominale delta/mnd) → voedt CF!D',
      'preview-tak (elders, niet de hoofdprojectie): SimCashflow[] reële inkomens-delta\'s (indexed:true, onlyWhileWorking:true)',
    ],
    formula:
      "kernel (tables/werk-strategie.ts, Excel-kolommen K/L/P/Q/R/S): L(leeftijd) = MIN(plafond, (L(leeftijd−1)+sprong@leeftijd)·(1+reëleGroei)) — reële salarisladder per hele leeftijd; P = ladder-lookup(INT(leeftijd)) × deeltijdfactor; Q = P−basis (reëel), R = Q·(1+inflatie)^(m/12) (nominaal); S = IF(leeftijd < FIRE-leeftijd, R, 0) — het lek-invariant (géén salaris de onttrekkingsfase in). FIRE-gate resolved naar maand-precisie (FIRE-maand = ROUND((FIRE-leeftijd−startLeeftijd)·12)) i.p.v. een strikte fractionele-leeftijd-vergelijking, om afrondingsdrift op de grensmaand te vermijden. Preview-tak (lib/werk-strategie.ts, niet de hoofdprojectie): salaryAt(age) = base × Π(1+groei, tot plafond) + Σ(sprongen ≤ age) × deeltijdFactor(age); delta = salaryAt(sampleAge) − huidigNettoMaand; cashflow = delta × 12.",
    files: ['lib/horizon-kernel/tables/werk-strategie.ts', 'lib/horizon-kernel/adapter/events.ts', 'lib/werk-strategie.ts', 'lib/fire-simulation.ts'],
    functions: ['werkStrategieDelta (kernel-tabel)', 'buildWerkStrategie (adapter)', 'werkMetadataToCashflows (preview-tak)', 'salaryAt (preview-tak)', 'lifeEventsToCashflows'],
    constants: [
      { label: 'GROWTH_STEP_YEARS', value: '5 — samplecadans (jaren) voor de gladde groeicurve tussen structurele grenzen (preview-tak)' },
      { label: 'WERK_HORIZON_CAP', value: '71 — leeftijd waarboven de kernel-ladder terugvalt op het basisinkomen (empirisch: leeftijd 72 → P = B1)' },
    ],
    elementIds: ['as-planning', 'fn-toekomstplannen'],
    note: 'Geen dubbeltelling basisinkomen: de kern telt annualSavings (spaarquote × basisinkomen) altijd mee; de werk-strategie-tabel draagt uitsluitend de delta daarboven, FIRE-gegate op kolom S. De adapter (buildWerkStrategie in lib/horizon-kernel/adapter/events.ts) hergebruikt de app-VELD-interpretatie van werk-metadata (eenheden/velden: reeleGroeiPct/plafondNettoMaand 1:1, sprongen atAge→bijLeeftijd afgerond op hele leeftijd, deeltijd pct 0-100→fractie) maar NIET de app-cashflow-expansie werkMetadataToCashflows — die zou de salarisladder dubbel berekenen. Meerdere werk-events → de kernel gebruikt (net als Excel) er precies één; extra events geven een info-notice. Parity: kolommen N-S, 136.800 cellen, ~5·10⁻⁷ € max-afwijking over alle 19 fixtures (lib/horizon-kernel/README.md).',
  },
  {
    id: 'vrijheidscheck-rapport',
    title: 'Vrijheidscheck — rapport-aggregatie (consument, geen eigen motor)',
    domain: 'Toekomst (FIRE)',
    summary:
      'GEEN nieuwe rekenmotor (ADR 0022): een pure server-side AGGREGATIE-/mapperlaag van de publieke Vrijheidscheck-funnel (/check) die een genormaliseerde intake (wizard-output) omzet naar het volledige rapport-DTO (CheckReportData = report_snapshot). Herberekent NIETS zelf — consumeert uitsluitend de bestaande canonieke engines (zelfde grondslag als de ingelogde app; horizon v2 byte-identiek) en mapt hun output naar de rapport-secties (foto van nu, gezondheidsgetal, de kruising, twee toekomsten, gevoeligheid, onttrekkingsstrategieën, levenspad, Wills zetten). Bouwt synthetische Asset[]/Debt[] uit de intake-velden zodat de engines ongewijzigd draaien. Staat in deze catalogus omdat het een nieuw afgeleide-getallen-OPPERVLAK (het rapport) documenteert, niet een nieuwe formule.',
    inputs: [
      'CheckIntake (wizard): geboortedatum, huishouden, netto maandinkomen, uitgaven-categorieën, noodfonds, bezittingen (incl. optioneel per-asset expectedReturnPct), schulden, pensioen (incl. optioneel retirementMonthlyExpenses + pension.expectedReturnPct), levensgebeurtenissen (lifeEvents[]), doel',
      'afgeleide engine-inputs: FIRE-parameters, FIRE-eligible vermogen, spaarquote, AOW-maandbedrag, cohort-referentie',
      'news_articles (via service-role-read; dezelfde bron als /api/news) → nieuwssectie gebakken in op submit-moment',
    ],
    outputs: [
      'CheckReportData (DTO): masthead, lifeGrid, snapshot (incl. freedomBaseEur = het €-vrijheidsvermogen waaróp de vrijheidstijd rust), dualBars, monthBalance, health (volledige actieve v2-pijlerset, mirror /overzicht), benchmark, kruising, twoFutures, fireCards, sensitivity[4 her-runs, FRACTIONELE fireAge], withdrawalStrategies[3], lifePath, will.moves, houseInclusion (50%-disclosure of null), nieuws (krant-sectie), cta, disclaimers',
      'levenslange ±2%-scenariobanden (rendement-onzekerheid): afgeleid uit het basis-grootboek (cashflow-rebase), GEEN her-run per scenario',
    ],
    formula:
      'intake → synthetische Asset[]/Debt[] (groei-types erven per-asset expectedReturnPct indien opgegeven, anders grossReturn; cash/savings/eigen woning 0) + bij eigen woning ÉÉN synthetisch verzilverbare-overwaarde-bezit (50% × netto overwaarde, asset_type investment, expected_return = TYPICAL_RETURNS.eigen_huis) in de FIRE-pot → engines: runKernelUnified (horizon-kernel via de synthetische scalar-pot; levert fireAge + fireAgeFractional, decumulatie, UnifiedProjectionResult) + computeFireProjection (snapshot-FIRE) + computeFreedomProgress (vrijheids-%) + buildHealthScoreInput→computeHealthScoreFromInputs (gezondheidsgetal — de VOLLEDIGE actieve v2-pijlerset wordt doorgemapt, mirror /overzicht; budget_discipline inactief zonder budgetten, géén grijze placeholder) + resolveSavingsSource (spaarquote, handmatig pad) + computeEmergencyFundMonths (buffer) + getCohortReference+computeReferencePeer (benchmark) + calculateFreedomTime/dailyExpenseRate (€→tijd). FIRE-eligible/vrijheidsvermogen = netWorth − (1−HOUSE_FIRE_WEIGHT)×overwaarde (50% huis meegerekend); snapshot.freedomBaseEur draagt dit €-bedrag (de vrijheidstijd rust hierop, niet op netWorth). Post-pensioen-uitgaven: intake.pension.retirementMonthlyExpenses × 12 als jaarlaast (delta t.o.v. basisuitgaven) — ook de pensioengat-Will-zet rekent op deze post-pensioen-maandlast, niet op de huidige. Gevoeligheid = 4 engine-her-runs (spaarquote +4pp / rendement +1pp / uitgaven +€200 / +€20k lump) vergeleken op de FRACTIONELE fireAge (fireAgeFractional, sub-jaars; basis = eigen ledger-run zonder overrides) zodat sub-jaars-verschuivingen in maanden renderen; strategieën = 3 her-runs (SWR static / VPW / Guyton-Klinger). Eindleeftijd = vaste 90. Scenariobanden ±2%: cf[t] afgeleid uit basis-grootboek, herbelegde op r_base ±2% (GEEN her-run per scenario, vloer SCENARIO_RETURN_FLOOR).',
    files: ['lib/check/build-report.ts', 'lib/check/types.ts', 'lib/check/report-news.ts'],
    functions: ['buildReport', 'runKernelUnified', 'computeFireProjection', 'computeFreedomProgress', 'buildHealthScoreInput', 'resolveSavingsSource', 'computeEmergencyFundMonths', 'getCohortReference', 'computeReferencePeer', 'getFireEligibleNetWorth', 'calculateFreedomTime', 'dailyExpenseRate', 'buildCheckReportNews', 'lifeEventsToCashflows'],
    constants: [
      { label: 'REPORT_END_AGE', value: '90 — vaste rapport-eindleeftijd (= DEFAULT_FIRE_STRATEGY.endAge); geen aparte aanname' },
      { label: 'HOUSE_FIRE_WEIGHT', value: '0,5 — de eigen woning telt voor 50% van haar NETTO overwaarde mee voor vrijheid (de helft die je realistisch kunt verzilveren/verkleinen). RAPPORT-conventie, geen app-brede housing-mode. fireEligibleNetWorth = netWorth − (1−0,5)×overwaarde; de meegerekende 50% wordt als één synthetisch groei-bezit (asset_type investment, expected_return = TYPICAL_RETURNS.eigen_huis) aan de engine-pot toegevoegd zodat het op woning-rendement meegroeit. De échte woning + gekoppelde hypotheek blijven uit de engine-pot (woonkost in budget, geen hypotheek-dubbeltel). Volledige huiswaarde blijft zichtbaar in snapshot/dual-bars/levenspad. Disclosure via houseInclusion-DTO.' },
      { label: 'TYPICAL_RETURNS.eigen_huis', value: '3,5% (PERCENT) — canonieke woning-appreciatie (lib/asset-data.ts); het synthetische verzilverbare-overwaarde-bezit groeit hierop, NIET op het beleggingsrendement.' },
      { label: 'Per-asset rendement', value: 'groei-types (investment/retirement/real_estate/crypto/deelneming/vordering/levensverzekering) gebruiken per-asset expectedReturnPct als opgegeven in de intake; anders het profiel-grossReturn. cash/savings/eigen woning groeien niet op rendement.' },
      { label: 'SCENARIO_RETURN_FLOOR', value: 'minimumrendement voor de ±2%-scenariobanden (voorkomt negatieve-rendement-artefacten bij lage grossReturn)' },
    ],
    elementIds: ['as-vrijheidscheck', 'as-planning', 'fn-toekomstplannen', 'as-rapport', 'as-vermogen'],
    note: 'Consume, don\'t recompute: build-report.ts is een pure MAPPER zonder eigen formules of Supabase — JSON-serialiseerbaar (report_snapshot in lead_intakes). Jaar-1-passief-inkomen leidt de motor af uit de engine-identiteit in de onttrekkingsfase (withdrawal = aowEnPensioen − cashflowNetto van de eerste niet-werk-rij; LedgerRow draagt geen los withdrawal-veld). Levenspad = NETTO vermogen incl. huis: de engine-pot heeft de échte woning gefilterd, dus de meegroeiende overwaarde wordt per jaar bijgeteld via de canonieke projectEigenHuisValuesAt + projectMortgageStateAt (spiegelt calc sim-netto-vermogen-projectie; geen eigen WOZ/groeiformule). Grondslag-discipline (CLAUDE.md): de snapshot-VRIJHEIDSTIJD (netWorthFreedom) rekent op het FIRE-eligible/vrijheidsvermogen (= netWorth − (1−HOUSE_FIRE_WEIGHT)×overwaarde, dus 50% huis meegerekend; bedrag op snapshot.freedomBaseEur) — identiek aan lifeGrid.alreadyFundedYears + twoFutures.stopToday — terwijl het getoonde €-saldo (snapshot.netWorth) het volledige netto vermogen incl. de VOLLE huiswaarde blijft. Zo blaast het huis de vrijheid niet onrealistisch op (slechts de verzilverbare helft telt), maar telt het ook niet onterecht voor 0% mee. De dual-bar van het huis toont de volle netto huiswaarde met label "X mnd · telt voor 50% mee"; countsForFire blijft false op dat bucket zodat de cash-drag-Will-zet (bars.filter(b=>b.countsForFire)) de volle huiswaarde niet als FIRE-cash telt (de 50% zit al als synthetisch bezit in de engine-pot). Tekort-guard (gedeelde buildNetWorthFreedom-helper): een NEGATIEF (of nul) FIRE-eligible vermogen — huis-rijk / liquide-schuld-zwaar profiel — koopt (nog) géén vrijheid; omdat calculateFreedomTime op de ABSOLUTE waarde rekent, dwingt de helper dan een tekort-uitkomst af (duur 0, isDeficit=true, label "nog geen vrijheid") op snapshot.netWorthFreedom én twoFutures.stopToday/stopTodayLabel én fireCards.stop_today, zodat die drie "stop vandaag"-oppervlakken niet uiteenlopen. Levenslange ±2%-scenariobanden = een rendement-ONZEKERHEIDSBAND met een GEFIXT plan: GEEN her-run van de engine per scenario (dat gaf elk scenario een eigen FIRE-leeftijd + eigen onttrekking → omslag op AOW i.p.v. de basis-FIRE-leeftijd + convergentie). I.p.v. dat leiden we de jaarlijkse netto-kasstroom (inleg/−onttrekking) uit het BASIS-grootboek af (cf[t] = base.nettoVermogen[t] − base[t−1]·(1+r_base)) en herbeleggen die op het reële rendement ±2% (nominale schaal, vloer SCENARIO_RETURN_FLOOR); huis-overwaarde identiek over scenario\'s. Band hugt de basislijn op t=0, opbouw-waaier wijdt uit en blijft uitwaaieren in de afbouw (geen omkering/convergentie). Zero-portfolio-guard: het grootboek kan een trivial-late fireAge ≈ eindleeftijd melden bij een lege belegbare pot (meetsStrategyTarget toetst alleen ≤ endAge−2, dus de laatste kandidaat "slaagt" zonder vroeg venster) — build-report behandelt een FIRE met €0 liquide vermogen op het snijpunt als onhaalbaar en valt terug op computeFireProjection. Benchmark gebruikt DEZELFDE bron als de in-app benchmarkrapportage (getCohortReference + computeReferencePeer) zodat score/buffer-referentie niet driften; badge "Geraamd (CBS-basis)" (ADR 0018). will.intro blijft leeg (AI-framing W6); will.moves zijn deterministisch uit de metrics. VPW draait alleen met deplete (engine-guard). Geverifieerd met lib/check/__tests__/build-report.test.ts (realistische "Sanne"-intake + randgevallen: nul/negatief inkomen, deficit, geen schulden, alleen-huis, oneindige vrijheid, lege optionele velden, onbekende type-strings).',
  },
]

/** Berekeningen gegroepeerd per domein, in vaste domein-volgorde. */
export function calculationsByDomain(): Array<{ domain: CalcDomain; items: Calculation[] }> {
  return CALC_DOMAINS.map((domain) => ({
    domain,
    items: CALCULATIONS.filter((c) => c.domain === domain),
  })).filter((g) => g.items.length > 0)
}

/** Berekeningen die een specifiek plaat-element raken. */
export function calculationsForElement(elementId: string): Calculation[] {
  return CALCULATIONS.filter((c) => c.elementIds.includes(elementId))
}

/** Valideert id-uniekheid en dat elke elementId in het model bestaat. */
export function validateCalculations(model: ArchimateModel): string[] {
  const ids = new Set(model.nodes.map((n) => n.id))
  const errors: string[] = []
  const seen = new Set<string>()
  for (const c of CALCULATIONS) {
    if (seen.has(c.id)) errors.push(`dubbele calc-id: ${c.id}`)
    seen.add(c.id)
    if (c.elementIds.length === 0) errors.push(`calc ${c.id} heeft geen elementen`)
    for (const e of c.elementIds) if (!ids.has(e)) errors.push(`calc ${c.id} verwijst naar onbekend element ${e}`)
    if (c.files.length === 0) errors.push(`calc ${c.id} heeft geen bronbestand`)
  }
  return errors
}
