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
    summary: 'Bezittingen minus schulden, gewogen per inclusie-percentage. Wordt ook getoond als “jaren vrijheid”.',
    inputs: ['assets (current_value, net_worth_inclusion_pct)', 'debts (current_balance, net_worth_inclusion_pct)'],
    outputs: ['netto vermogen €', 'jaren/maanden vrijheid'],
    formula: 'Σ(asset × incl%) − Σ(debt × incl%)',
    files: ['lib/dashboard-data-loader.ts', 'lib/format.ts', 'app/api/snapshots/snapshot-math.ts'],
    functions: ['calculateFreedomTime', 'formatFreedomTimeString', 'dailyExpenseRate', 'computeSnapshotNetWorth'],
    elementIds: ['as-vermogen', 'fn-vermogensregistratie'],
    note: 'Cash-only fallback wanneer vermogensregistratie uit staat. Dagtarief voor €→tijd is single-sourced: dailyExpenseRate (lib/format.ts) = maanduitgaven×12/365 — vervangt de verspreide /30-conversie (= 360-dagenjaar, ~1,4% drift). Het opgeslagen snapshot-net_worth (alle drie de snapshot-routes) deelt dezelfde gewogen formule via snapshot-math.ts (freedom_percentage daar bewust op vol-vermogen-grondslag — ADR 0009-uitzondering).',
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
    files: ['lib/horizon-data.ts', 'lib/box3-data.ts', 'lib/box3-taxable-input.ts', 'lib/household-type.ts'],
    functions: ['NL_FICTIEF_BELEGGINGEN', 'BOX3_TARIEF', 'calculateBox3', 'box3TaxStatus', 'hasPartner'],
    constants: [
      { label: 'Heffingvrij vermogen (alleenstaand)', value: '€57.684 (2025)' },
      { label: 'Heffingvrij vermogen (fiscaal partner)', value: '€115.368 (2025, verdubbeld)' },
      { label: 'Tarief & forfaits', value: 'wettelijk vast in horizon-data.ts / box3-data.ts' },
    ],
    elementIds: ['as-belasting'],
    note: 'Box 3-constanten zijn bewust hardcoded (wettelijk vast). Het fiscaal-partner-signaal dat het heffingvrij vermogen verdubbelt (en de partner-schuldendrempel/groen-vrijstelling) komt uit één canonieke helper: hasPartner(household_type) in lib/household-type.ts. Vóór de fix vergeleken de afnemers (FIRE-projecties, gezondheidsscore, box3TaxStatus) household_type met de verouderde woordenschat samenwonend/getrouwd — die de canonieke waarden (solo/samen/gezin) nooit aannemen → hasPartner stond per ongeluk altijd op false en partners kregen de alleenstaande-vrijstelling. NB: dit is NIET het AOW-leefsituatie-enum (alleenstaand/samenwonend) dat de AOW-uitkeringshoogte bepaalt — dat is een aparte as.',
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
    constants: [{ label: 'NL_SWR', value: '≈2,88% (DEFAULT_RETURN − BOX3_DRAG − inflatie; Box 3-gecorrigeerd — niet de klassieke 4%)' }],
    elementIds: ['as-planning'],
    note: 'De SWR-formule heeft één home: computeEffectiveSwr (lib/fire-params.ts). Components/widgets dupliceren de formule niet en hardcoden geen 0.04.',
  },
  {
    id: 'unified-projection',
    title: 'Gedeelde projectie-helpers (niet-FIRE-rekenbibliotheek)',
    domain: 'Toekomst (FIRE)',
    summary: 'Gedeelde types en helperfuncties voor vermogensprojectie. De v1 FIRE-engines (runUnifiedProjection, runSimulation) zijn fysiek verwijderd (C5-c, ADR 0016). De bestanden lib/unified-projection.ts en lib/fire-simulation.ts bestaan nog, maar bevatten uitsluitend de gedeelde types/helpers die v2 ook importeert.',
    inputs: ['netto vermogen', 'sparen (spaarquote × inkomen)', 'life_events', 'FIRE-parameters'],
    outputs: ['gedeelde types/helpers voor de v2-engine'],
    formula: '— (engine-logica verplaatst naar lib/horizon-engine/engine.ts)',
    files: ['lib/unified-projection.ts', 'lib/fire-simulation.ts', 'lib/household-type.ts'],
    functions: ['lifeEventsToCashflows', 'unifiedRowsToStackedRows', 'toSimResult', 'hasPartner'],
    elementIds: ['as-planning', 'fn-toekomstplannen'],
    note: 'C5-c voltooid via Optie B (ADR 0016): runUnifiedProjection en runSimulation zijn NIET meer aanwezig als functies. lib/horizon-engine/ (runHorizonLedger) is de enige FIRE-engine. runSelectedProjection(input, useV2) is v2-only — het roept ALTIJD runHorizonLedger aan en negeert de useV2-vlag; er is GEEN v1-arm meer in de selector. De parity-/compare-tooling (compareEngines, /beheer/horizon-tabellen-inspector, ledger-API) is mee verwijderd — er is niets meer om tegen te vergelijken. Gedeelde types/helpers blijven: UnifiedProjectionInput/Row/Result, AssetLiquidation, SimResult/Row/Cashflow, lifeEventsToCashflows, unifiedRowsToStackedRows, toSimResult, unifiedToBucketResult. Zie calc "FIRE — grootboek-engine (v2)" voor de actuele engine.',
  },
  {
    id: 'horizon-grootboek-v2',
    title: 'FIRE — grootboek-engine (v2, tabel-georiënteerd)',
    domain: 'Toekomst (FIRE)',
    summary:
      'Alternatieve FIRE-engine: forward V_op (opgebouwd vermogen) + backward V_nodig (benodigd vermogen vanaf eindleeftijd terug — dus dalend), snijpunt = FIRE. Rekent reëel, volledig gedecomponeerd grootboek (tabellen A–G). Sluit de dode pot-regels aan (verdeling/onttrekkingsvolgorde) + Box 3-drag. FIRE = vroegste leeftijd die het einddoel van de eindstrategie haalt; voor legacy (Nalatenschap) is dat de vroegste leeftijd waarop de afbouw-lijn RÓND de nalatenschap eindigt zonder dat het liquide pad negatief wordt (doel-zoekend, need-only blijft — ADR 0014; selectie ADR 0017). Staat in productie achter een flag.',
    inputs: ['assets', 'debts', 'FIRE-parameters', 'life_events (cashflows)', 'verdeling-/onttrekkingsstrategie'],
    outputs: ['LedgerRow[] (grootboek)', 'V_nodig per jaar', 'FIRE-snijpunt', 'tabellen A–G'],
    formula: 'forward: vermogen × (1+reëel rendement) + sparen − Box 3 − onttrekking; surplus (opbouw) = annualSavings − flaggedAflossing + freedHousingCost + events; freedHousingCost = Σ lastActiveRente van afgeloste geflagde schulden (ALLÉÉN het RENTE-deel van het laatste lopende jaar valt vrij na payoff — de aflossing is dan al hersteld doordat flaggedAflossing → 0; 0 zolang ze lopen); backward: V_nodig[i] = (V_nodig[i+1] + nettoBehoefte) / (1 + reële onttrekkingsvoet)',
    files: ['lib/horizon-engine/engine.ts', 'lib/horizon-engine/strategies.ts', 'lib/horizon-engine/adapter.ts', 'lib/horizon-engine/build-input.ts', 'lib/horizon-engine/scalar-bridge.ts', 'lib/withdrawal-strategy.ts', 'lib/pot-rules.ts', 'lib/sale-config.ts', 'app/(app)/horizon/whatif/whatif-page-client.tsx'],
    functions: ['runHorizonLedger', 'ledgerToUnifiedResult', 'runSelectedProjection', 'runScalarProjectionV2', 'applyWithdrawalStrategy', 'buildHorizonInput', 'buildGenericAssetLiquidations', 'expandSingleGroupToAssetTypes', 'sellNextOnDemand', 'withdrawWithOnDemand'],
    constants: [{ label: 'SALES_COSTS_BY_TYPE', value: 'verkoopkosten per asset-type bij liquidatie — roerend (voertuig/inboedel/overig/deelneming) 2%, vastgoed 3%; per-event override via metadata.verkoopkostenPct [0,0.20] (lib/constants.ts; eigen_huis-downsize draagt zijn eigen %)' }],
    elementIds: ['as-planning', 'fn-toekomstplannen'],
    note: 'Architectuur (invarianten + uitbreidingsregels): docs/architecture/horizon-engine-v2.md. Plan: docs/horizon-tabel-rekenmotor-plan.md. ADR 0013 + 0014 + 0015 + 0017 + 0019 + 0021. Beheer-inspectie (v2-only): /beheer/horizon-tabellen-mij (echte-gebruiker-tabellen A–G) en /beheer/grafiek-werking (functionele referentie); de oude v1↔v2-vergelijk-inspector /beheer/horizon-tabellen is verwijderd (geen v1 meer om tegen te vergelijken). Single source of truth = LedgerRow[] (per asset/schuld); intern reëel, de adapter is het ENIGE reëel→nominaal-punt; FIRE-detectie per eindstrategie: perpetual/legacy = forward doel-zoektocht (V_nodig is referentielijn, niet detector); deplete/pensioen = liquide ≥ V_nodig op de FIRE-leeftijd (crossing met de referentielijn, ADR 0027) — vNodig/0,6×-disconto ongewijzigd; strategieën zijn pure plug-ins. VPW (variabel percentage) combineert ALLEEN met eindstrategie deplete ("Vermogen opeten"): runHorizonLedger retourneert vroeg een leeg/onbereikbaar resultaat (rows:[], fireReachable:false) bij vpw×legacy/perpetual/pensioen, omdat VPW de pot tegen de einddatum volledig leegtrekt (vpwRate=1.0 laatste jaar) — onverenigbaar met nalatenschap/behoud/vaste onttrekking (spiegelt de verwijderde v1-block; bewaakt door test/horizon-vpw-guard.test.ts). Woonlast-RENTE-vrijval bij payoff (opbouwfase): de spaarquote-baseline heeft de héle jaarlast (rente + aflossing) van een geflagde schuld (include_aflossing_in_savings) als uitgave verrekend en de aflossing daarna teruggeteld (annualSavings = inkomen − uitgaven + flagged_aflossing). NETTO blijft binnen annualSavings dus alleen de RENTE permanent afgetrokken; de aflossing valt weg (uitgave − terugtelling = 0). Bij payoff brengt flaggedAflossing → 0 de aflossing AL terug in het surplus — dus valt uitsluitend het RENTE-deel nog vrij, niet de volledige jaarlast. (Eerder liet de engine de volledige annualPayment vrijvallen → de aflossing werd dubbel hersteld, R te hoog. Gecorrigeerd jun 2026.) De engine onthoudt per geflagde schuld lastActiveRente = de rente (begin × rate) van haar laatste lopende jaar (zolang begin > 0) en telt Σ lastActiveRente van reeds afgeloste geflagde schulden (begin === 0 dit jaar) op als freedHousingCost. De rente is begin × rate met begin = balance AL gewogen via net_worth_inclusion_pct (buildDebts) → automatisch inclusion_pct-consistent met flaggedAflossing en de baseline. Zolang een geflagde schuld loopt is freedHousingCost 0 → byte-identiek aan de pre-feature baseline-formule (regressie). Aflossingsvrije schulden (begin daalt nooit naar 0) en niet-geflagde schulden geven geen vrijval; bij meerdere geflagde schulden valt elke onafhankelijk haar eigen rente vrij bij payoff. (test/horizon-engine.test.ts dekt de rente-vrijval-, loader-economie-pin-, looptijd-, aflossingsvrij-, niet-geflagd- en meerdere-schulden-cases.) Eindstrategie-onttrekking: deplete = spend-down-annuïteit (→ ~€0); legacy = need-only (residu groeit naar de nalatenschap, via ctx.legacyPreserveOnly in withdrawal-strategy.ts — anders verdampt het surplus in het grootboek; ADR 0014); perpetual/pensioen = need-only. FIRE-selectie (meetsStrategyTarget): legacy is doel-zoekend (ADR 0017) — de vroegste leeftijd waarvan de afbouw-lijn ≥ legacyAmount eindigt (GEEN −2%-tolerantie meer, dus nooit ónder het doel) terwijl het liquide brug-pad richting €0 mag dippen maar nóóit negatief wordt (de buffer zit al in het ingevoerde nalatenschapsbedrag). Omdat het eindvermogen monotoon stijgt in de FIRE-leeftijd levert de vroegste passerende leeftijd automatisch het dichtst-bij-doel-resultaat; geen tweede zoekfase. Resultaatveld legacyTargetUnavoidablyExceeded (alleen legacy) markeert dat zelfs stoppen-nu al ≥ doel eindigt ("je kunt nu al stoppen"). perpetual/deplete-selectie ongewijzigd (minMid>1 + eindvermogen ≥ start×0.99 resp. niet vroegtijdig leeg). De backward V_nodig-referentielijn gebruikte al endVal = legacyAmount, dus de forward-selectie is nu consistent met de referentielijn (geen tolerantie-slack meer). Asset-liquidatie (v2, GENERIEK — niet alleen het eigen huis): elk niet-liquide asset (voertuig/inboedel/overig/deelneming/vastgoed≠eigen_huis) kan binnen het grootboek verkocht worden via UnifiedProjectionInput.assetLiquidations (engine-block 6b) i.p.v. de pot te filteren + de verkoop als inkomen in te spuiten — netto vermogen continu (alleen −verkoopkosten), alléén de liquiditeit verspringt (ADR 0015). Twee bronnen voeden die ene array: (a) het eigen-huis-downsize-pad (buildV2DownsizeHousing) met zijn eigen trigger + gebruiker-instelbare verkoopkosten, en (b) generieke niet-liquide assets via buildGenericAssetLiquidations. SSoT voor of/wanneer verkopen (ADR 0021): assets.sale_config (JSONB, nullable; lib/sale-config.ts) kent drie standen — niet_verkopen (asset blijft altijd in grootboek), vast_moment (verkoop op vaste leeftijd/datum), wanneer_nodig (in-loop on-demand; engine verkoopt zodra liquide tekortschiet — AssetLiquidation.trigger=’on_demand’, via sellNextOnDemand/withdrawWithOnDemand). Default voor alle niet-liquide types (via RESOLVE-DEFAULT in lib/sale-config.ts, geen backfill): wanneer_nodig. Dat wijzigt bestaande prognoses bewust: activa verlaten het grootboek alleen via echte verkoop (mét verkoopkosten, mét schuldaflossing), niet langer “rauw” in de onttrekkingsfase. De “engine 0-diff”-regel (v1→v2-transitiediscipline) is losgelaten per ADR 0016. Verkoopvolgorde = bestaande onttrekkingsvolgorde (meest-liquide eerst, eigen_huis allerlaatst), sort_order als tie-break. life_events.linked_asset_id blijft bestaan als prijs-kalibratie-kanaal: metadata.verkoopprijs moduleert de salePricePct (geclampt [0,2]; ontbrekend → 1.0). Opbrengst = ECHTE engine-asset-waarde (real-grown, “consume don’t recompute”). Verkoopkosten via SALES_COSTS_BY_TYPE (override metadata.verkoopkostenPct). Liquide types + levensverzekering/vordering zijn bewust NIET in scope (die komen als geldstroom binnen). Geen dubbeltelling: lifeEventsToCashflows(events, skipEventIds) onderdrukt UITSLUITEND de opbrengst-portie (one_time_cost + custom metadata.cashflows) van een als liquidatie afgehandeld event; de monthly_cost_change (bv. wegvallend onderhoud) blijft een losse cashflow. Bij stand niet_verkopen wordt een gekoppeld verkoop-event (indien aanwezig) óók aan skipEventIds toegevoegd — opbrengst onderdrukt, maandelijkse gevolgen blijven. Trigger op v2-liquide via buildHorizonInput. C5-c voltooid via Optie B (ADR 0016): runUnifiedProjection en runSimulation zijn FYSIEK VERWIJDERD — v2 is de enige FIRE-engine. isHorizonV2Enabled retourneert altijd true; runSelectedProjection is v2-only en negeert de useV2-vlag — er is GEEN v1-arm meer in de selector. Scalar-bridge: runScalarProjectionV2 (lib/horizon-engine/scalar-bridge.ts) biedt een drop-in voor de oude scalar-portfolio-signatuur en routeert die callers (strategie-modal.tsx, de twee hypotheek-vs-beleggen-callers, de event-panes en de horizon-client scenario-overlays) naar v2. Optie B overruled de eerdere parity-behoud-beslissing (D3): de parity-/compare-tooling is VERWIJDERD — compareEngines, de ledger-API (/api/horizon-engine/ledger) en de v1↔v2-vergelijk-inspector /beheer/horizon-tabellen + de parity-tests zijn weg. (Behouden in die dir, niet-parity: ledger-views.tsx + persona.ts, gebruikt door /beheer/horizon-tabellen-mij + /beheer/grafiek-werking.) strategie-modal.tsx is NIET meer uitgesteld; het draait op v2 via de scalar-bridge. B2-parity (13 jun, na de fixes legacy-need-only/recurring-×12/housing-liquidatie): v2 ligt voor spend-down-strategieën later (persona deplete +7 jr, legacy +6 jr) door reëel-vs-nominaal, en gelijk voor behoud (perpetual +1, pensioen 0); eindnetto verschilt navenant. Owner legacy €200k: v1 onbereikbaar, v2 ~74 (haalbaar, eindigt ≥ doel). Review-vervolg (jun 2026, A–D): (A) Cash-voorkeur voor de opbrengst. De pot-regel "verdeling bij toename" (profiles.pot_rules.surplus_group) is TOP-LEVEL config, NIET per-event metadata — hij bepaalt zowel waar surplus als waar liquidatie-opbrengst heen gaat (engine surplusTargets, block 6b). BUG-FIX: potRulesToStrategyOptions gebruikte expandGroupsToAssetTypes([surplusGroup]), dat de volledige 10-type-lijst opleverde (de "vul overige groepen aan"-logica, juist voor een onttrekkings-VOLGORDE maar fout voor een DOEL) → surplusTargets matchten álle assets → opbrengst werd pro-rata over alle potten verdeeld i.p.v. naar de gekozen pot (cash kreeg slechts een fractie). Nu via expandSingleGroupToAssetTypes(group) = uitsluitend de asset-types in díe groep (spaargeld → [cash,savings]) → opbrengst belandt bij cash; default (beleggingen) blijft beleggingen. (B) What-if-baseline single-sourced: de what-if-pagina bouwde zijn baseline-input INLINE (zonder buildHorizonInput) → géén assetLiquidations/skipEventIds → bij een gekoppeld verkoop-event week de baseline af van de /toekomst-grafiek. Nu roept whatif-page-client een gedeelde buildInputForEvents-factory aan die per event-set buildHorizonInput aanroept (zelfde builder als /toekomst + /overzicht); baseline, scenario, pinned-overlays én per-event-impact lopen er allemaal door → baseline == hoofd-grafiek (incl. liquidatie + skipIds). pot_rules wordt nu óók in de what-if-loader gefetcht (defensief, defaults-fallback) zodat de surplus-/opbrengstbestemming gelijk is. (C/M1) De huis-downsize-trigger-meetrun (baseSimInput in build-input) krijgt nu genericLiq.liquidations mee zodat de meetrun dezelfde liquide opbrengsten ziet als de grafiek (huis-verkoop-trigger niet langer te vroeg). (D/M2) buildGenericAssetLiquidations leidt de leeftijd af uit target_date via ageAtDate wanneer target_age ontbreekt (de loaders normaliseren target_age NIET uit target_date). Bekende bredere beperking (gedocumenteerd, niet hier breed gefixt): lifeEventsToCashflows is óók target_age-only, dus de MAANDELIJKSE gevolgen van een datum-only event vervallen daar nog — de builder herstelt enkel de (eenmalige) verkoop-opbrengst. Tests: test/horizon-generic-liquidation.test.ts (A+D), test/horizon-housing-liquidation.test.ts (C), test/whatif-baseline-consistency.test.ts (B).',
  },
  {
    id: 'vrijheidsvoortgang',
    title: 'Vrijheidsvoortgang (FIRE-eligible)',
    domain: 'Toekomst (FIRE)',
    summary: 'Hoe ver je bent richting volledige vrijheid (0–100%). Zelfde grondslag als de “nog X jaar”-aftelling, zodat 100% nooit naast “nog jaren” verschijnt.',
    inputs: ['FIRE-eligible netto vermogen (huis gefilterd via housing-strategie)', 'benodigde portfolio uit unified projection (requiredFirePortfolio)'],
    outputs: ['vrijheidsvoortgang % (0–100)'],
    formula: 'min(100, max(0, FIRE-eligible vermogen / benodigde portfolio × 100)); 100% ⇔ doel bereikt',
    files: ['lib/core-metrics.ts', 'lib/dashboard-data-loader.ts', 'lib/horizon-data-loader.ts', 'lib/housing-strategy.ts'],
    functions: ['computeFreedomProgress', 'getFireEligibleNetWorth'],
    elementIds: ['as-planning', 'fn-toekomstplannen', 'as-vermogen'],
    note: 'Eén bron: FIRE-eligible vermogen ÷ benodigde portfolio uit runUnifiedProjection (fallback: strategie-bewust fireTarget op dezelfde grondslag). De fire-pijler van het gezondheidsgetal erft dit percentage via freedomPct, waardoor de live health-score voor huiseigenaren lager (correcter) uitvalt dan oude gepersisteerde snapshot-scores, die nog op het volledige vermogen rusten. Sinds 2026-06-12 delen óók het sovereignty-niveau ("Jouw Pad", dashboard-data-loader → computeSovereigntyLevel) en de widgets vrijheidsvoortgang/vrijheidsmijlpalen + de horizon-hero deze canonieke freedomPct (eigen perspectief: data.freedomPct; huishouden/partner: de override) i.p.v. een eigen som op vol vermogen. De FIRE-prognose-widget erft het ook; de snapshot-historie (app/api/snapshots) en de household-engine houden bewust een eigen, per-rij/per-huishouden consistente definitie. Zie ADR 0009.',
  },
  {
    id: 'sim-netto-vermogen-projectie',
    title: 'Geprojecteerd netto vermogen (incl. niet-liquide)',
    domain: 'Toekomst (FIRE)',
    summary:
      'Per-jaar geprojecteerd VOLLEDIG netto vermogen = FIRE-portefeuille (endPortfolio) + meegroeiende niet-liquide assets (eigen huis) die uit de FIRE-pot zijn gefilterd. Voedt de /overzicht-vermogensgrafiek zodat de projectielijn continu doorloopt vanuit het Vandaag-punt (volledig vermogen incl. huis) i.p.v. te dippen naar de FIRE-portefeuille zónder huis. FIRE-grootheden (requiredFirePortfolio, fireAge, freedomPct) blijven onveranderd op de liquide grondslag.',
    inputs: [
      'simRows (endPortfolio = LedgerRow nettoVermogen, nominaal)',
      'currentNetWorth (volledig netto vermogen vandaag, incl. huis)',
      'housing-strategie (mode) + horizonEngineV2-flag',
      'eigen-huis-assets + gekoppelde hypotheken',
      'v1-downsize verkoopleeftijd (target_age verkoop_eigen_woning-event)',
    ],
    outputs: ['simNetWorthRows: { age, netWorth }[] (geprojecteerd volledig netto vermogen per jaar)'],
    formula:
      'per jaar: netWorth = endPortfolio + houseEquity(age) + reconcileOffset; houseEquity = max(0, projectEigenHuisValuesAt.currentValue − projectMortgageStateAt.balance), ALLEEN bij exclude_from_fire/v1-downsize mét eigen huis (0 voor include_full/reverse_mortgage/v2-downsize: huis zit al in endPortfolio); bij v1-downsize 0 vanaf de verkoopleeftijd (opbrengst zit dan al in endPortfolio); reconcileOffset = currentNetWorth − (endPortfolio[0] + houseEquity[0]) veranker jaar 0 op de Vandaag-grondslag',
    files: [
      'lib/horizon-engine/networth-projection.ts',
      'lib/dashboard-data-loader.ts',
      'lib/housing-strategy.ts',
      'components/overview/mini-networth-chart.tsx',
    ],
    functions: ['buildSimNetWorthRows', 'projectEigenHuisValuesAt', 'projectMortgageStateAt', 'shouldFilterEigenHuisForFire', 'deriveHousingContext'],
    elementIds: ['as-planning', 'as-vermogen', 'fn-toekomstplannen'],
    note: 'Geen tweede engine-run en geen tweede WOZ/groeiformule: de FIRE-pot komt 1:1 uit endPortfolio (de engine), de huiswaarde-groei uit de canonieke projectEigenHuisValuesAt (per-asset expected_return, nominaal — consistent met de nominale endPortfolio) en de hypotheek-afbouw uit projectMortgageStateAt. Géén dubbeltelling per variant: include_full/reverse_mortgage/v2-downsize → simNetWorthRows ≡ endPortfolio (huis al in de pot); exclude_from_fire → endPortfolio + meegroeiende overwaarde; v1-downsize → idem maar alléén tot het verkoopjaar (ná verkoop zit de opbrengst al in endPortfolio → géén sprong op het verkoopjaar). Continuïteit (SSoT): de reconcile-offset verankert jaar 0 op currentNetWorth (zelfde grondslag als het Vandaag-punt + historie), wat óók de include_full-knik dicht. De chart her-verankert defensief nog eens op de getoonde currentNetWorth-prop (huishoud-/partnerperspectief). De marker-hoogte op /overzicht = geprojecteerd netto vermogen op de vrijheidsleeftijd; simRequiredPortfolio (liquide vrijheidsdoel) wordt APART als label getoond, niet als hoogte op de netto-vermogen-as.',
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
    title: 'Eigen-huis-strategie — "wanneer nodig"-trigger',
    domain: 'Toekomst (FIRE)',
    summary:
      'Het moment waarop de woning wordt verkocht (downsize) of de opeethypotheek start: afgeleid uit dezelfde projectie-engine als de grafiek, zodat de event-marker exact samenvalt met het punt waar het liquide vermogen in de grafiek opraakt. De meetrun draait via runSelectedProjection, dat sinds C5-c (Optie B) v2-only is — de trigger meet dus altijd op het v2-grootboek (er is geen v1 meer). Capped vaste-punt-iteratie lost de rondrekening op (het event beïnvloedt de FIRE-leeftijd en daarmee het pad vóór de trigger). De uitputtings-scan dekt de VOLLEDIGE horizon; de fallback-leeftijd is enkel het never-deplete-plafond, nooit een vroege cap. Raakt het liquide vermogen de verkoopkosten-buffer nergens binnen de horizon, dan vindt er GEEN verkoop plaats (geen event; het huis blijft in het grootboek en groeit door naar de nalatenschap).',
    inputs: [
      'volledige projectie-basis (assets/schulden, sparen, rendement, inflatie, box 3, AOW/pensioen- en overige event-cashflows)',
      'strategie-config (verkoopprijs%/verkoopkosten%, max-leen%/rente, veiligheidsmarge, fallback-leeftijd)',
    ],
    outputs: [
      'trigger-leeftijd (= eerste jaar waar liquide ≤ verkoopkosten-buffer + veiligheidsmarge)',
      'virtuele LifeEvents (verkoopopbrengst / bespaarde hypotheek / nieuwe huur / maanduitkering)',
      'uitleg-bundel (reden, liquide pad, overwaarde bij trigger)',
    ],
    formula:
      'meet(F) = runSelectedProjection(input, useV2) zonder housing-event, gepind op forcedFireAge F; D₀ = eerste kruising over de VOLLE horizon; iteratie: F ← fireAge(run mét event op Dₖ), Dₖ₊₁ = meet(F); stop bij convergentie of na 3 iteraties (min-tie-break). Drempel(age) = WOZ(age) × verkoopprijs% × verkoopkosten% + marge-jaren × uitgaven × (1+inflatie)^jaren. Géén kruising binnen de horizon ⇒ reason="no_sale": geen verkoop/event, huis blijft in de pot. De fallback-leeftijd is het never-deplete-plafond, geen cap op de scan. runSelectedProjection is v2-only (C5-c, Optie B): de useV2-parameter blijft in de signatuur staan maar wordt genegeerd — de meetrun draait altijd op het v2-grootboek.',
    files: ['lib/housing-trigger.ts', 'lib/housing-strategy.ts', 'lib/horizon-engine/select.ts'],
    functions: [
      'resolveHousingTriggerFromProjection',
      'resolveHousingEventsForSim',
      'buildHousingLifeEventsAtAge',
      'runHousingScenarioProjection',
    ],
    elementIds: ['as-planning', 'fn-toekomstplannen', 'as-vermogen'],
  },
  {
    id: 'werk-strategie',
    title: 'Werk-strategie — loopbaan/inkomenslijn naar FIRE',
    domain: 'Toekomst (FIRE)',
    summary:
      'Vertaalt een loopbaan-/inkomensambitie (reële salarisgroei, plafond, deeltijd-stappen, salarissprongen) naar reële inkomens-DELTA-kasstromen t.o.v. het basisinkomen dat de FIRE-engine al via de spaarquote (annualSavings) meeneemt. Geen dubbeltelling: alléén het netto surplus of deficit boven het huidige netto maandinkomen wordt toegevoegd. Alle delta\'s dragen `onlyWhileWorking:true` — de engine sluit ze uit zodra de werk-stopgrens (werkt=false) is bereikt; salarisgroei lekt zo nooit de onttrekkingsfase in.',
    inputs: [
      'life_events (event_type=werk, metadata: WerkMetadata — huidigNettoMaand, reeleGroeiPct, plafondNettoMaand, groeiTotLeeftijd, faseStappen, sprongen)',
      'huidige leeftijd (target_age van de werk-rij, afgeleid uit geboortedatum)',
      'netto maandinkomen (basisinkomen = huidigNettoMaand; bron: spaarquote-grondslag)',
    ],
    outputs: ['SimCashflow[] reële inkomens-delta\'s (indexed:true, onlyWhileWorking:true)'],
    formula:
      'salaryAt(age) = base × Π(1+groei, tot plafond) + Σ(sprongen ≤ age) × deeltijdFactor(age); delta = salaryAt(sampleAge) − huidigNettoMaand; cashflow = delta × 12 (jaar); aangrenzende segmenten met dezelfde delta worden samengevoegd; delta=0-segmenten weggelaten.',
    files: ['lib/werk-strategie.ts', 'lib/fire-simulation.ts'],
    functions: ['werkMetadataToCashflows', 'salaryAt', 'lifeEventsToCashflows'],
    constants: [
      { label: 'GROWTH_STEP_YEARS', value: '5 — samplecadans (jaren) voor de gladde groeicurve tussen structurele grenzen' },
      { label: 'WERK_HORIZON_CAP', value: '71 — maximale leeftijd waartoe segmenten worden gegenereerd (onlyWhileWorking kapt eerder af)' },
    ],
    elementIds: ['as-planning', 'fn-toekomstplannen'],
    note: 'Geen dubbeltelling basisinkomen: de engine telt annualSavings (spaarquote × basisinkomen) altijd mee; werk-strategie draagt uitsluitend de delta daarboven. onlyWhileWorking-gating zorgt dat salarisgroei stopt op dezelfde werk-stopgrens als het basissalaris — beide routes volgen dezelfde `werkt`-vlag in lib/horizon-engine/engine.ts.',
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
      'intake → synthetische Asset[]/Debt[] (groei-types erven per-asset expectedReturnPct indien opgegeven, anders grossReturn; cash/savings/eigen woning 0) + bij eigen woning ÉÉN synthetisch verzilverbare-overwaarde-bezit (50% × netto overwaarde, asset_type investment, expected_return = TYPICAL_RETURNS.eigen_huis) in de FIRE-pot → engines: runHorizonLedger (V_op=liquideVermogen, V_nodig, fireAge + fireAgeFractional, decumulatie; met lifeEventsToCashflows) + computeFireProjection (snapshot-FIRE) + computeFreedomProgress (vrijheids-%) + buildHealthScoreInput→computeHealthScoreFromInputs (gezondheidsgetal — de VOLLEDIGE actieve v2-pijlerset wordt doorgemapt, mirror /overzicht; budget_discipline inactief zonder budgetten, géén grijze placeholder) + resolveSavingsSource (spaarquote, handmatig pad) + computeEmergencyFundMonths (buffer) + getCohortReference+computeReferencePeer (benchmark) + calculateFreedomTime/dailyExpenseRate (€→tijd). FIRE-eligible/vrijheidsvermogen = netWorth − (1−HOUSE_FIRE_WEIGHT)×overwaarde (50% huis meegerekend); snapshot.freedomBaseEur draagt dit €-bedrag (de vrijheidstijd rust hierop, niet op netWorth). Post-pensioen-uitgaven: intake.pension.retirementMonthlyExpenses × 12 als jaarlaast (delta t.o.v. basisuitgaven) — ook de pensioengat-Will-zet rekent op deze post-pensioen-maandlast, niet op de huidige. Gevoeligheid = 4 engine-her-runs (spaarquote +4pp / rendement +1pp / uitgaven +€200 / +€20k lump) vergeleken op de FRACTIONELE fireAge (fireAgeFractional, sub-jaars; basis = eigen ledger-run zonder overrides) zodat sub-jaars-verschuivingen in maanden renderen; strategieën = 3 her-runs (SWR static / VPW / Guyton-Klinger). Eindleeftijd = vaste 90. Scenariobanden ±2%: cf[t] afgeleid uit basis-grootboek, herbelegde op r_base ±2% (GEEN her-run per scenario, vloer SCENARIO_RETURN_FLOOR).',
    files: ['lib/check/build-report.ts', 'lib/check/types.ts', 'lib/check/report-news.ts'],
    functions: ['buildReport', 'runHorizonLedger', 'computeFireProjection', 'computeFreedomProgress', 'buildHealthScoreInput', 'resolveSavingsSource', 'computeEmergencyFundMonths', 'getCohortReference', 'computeReferencePeer', 'getFireEligibleNetWorth', 'calculateFreedomTime', 'dailyExpenseRate', 'buildCheckReportNews', 'lifeEventsToCashflows'],
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
