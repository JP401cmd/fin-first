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
    files: ['lib/savings-source.ts'],
    functions: ['resolveSavingsSource', 'savingsRateFromAggregates', 'computeDebtAflossingMonthly'],
    elementIds: ['as-budget', 'fn-budgetteren'],
    note: 'Aflossing wordt niet dubbel geteld; spaarquote × inkomen voedt de unified projection. De 6m-spaarquote (savingsRate6m) is single-sourced via savingsRateFromAggregates + computeDebtAflossingMonthly — dashboard-, horizon- en core-loaders rekenen via deze helpers, geen inline-kopieën.',
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
    summary: 'De vier hefbomen (cashflow, vermogen, schulden, belasting) vertaald naar een status-semantiek voor de kaarten.',
    inputs: ['spaarquote', 'netto vermogen', 'schulden', 'box 3-druk'],
    outputs: ['status per hefboom (groen/aandacht/…)'],
    files: ['lib/leverage-status.ts'],
    functions: ['computeLeverScores'],
    elementIds: ['as-budget', 'as-vermogen'],
    note: 'Canonieke statusbron — niet hand-rollen, anders ontstaat label-drift.',
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

  // ── Belasting ──
  {
    id: 'box1',
    title: 'Box 1 — inkomen & jaarruimte',
    domain: 'Belasting',
    summary: 'Belasting in box 1 (schijven) en de fiscale jaarruimte voor pensioenopbouw.',
    inputs: ['inkomen', 'pensioenaangroei', 'AOW-status'],
    outputs: ['box 1-druk', 'jaarruimte €'],
    files: ['lib/box1-tax.ts'],
    functions: ['computeBox1Tax', 'computeJaarruimte'],
    constants: [{ label: 'Schijfgrenzen/tarieven', value: 'in box1-tax.ts (jaargebonden)' }],
    elementIds: ['as-belasting'],
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
    formula: 'forward: vermogen × (1+reëel rendement) + sparen − Box 3 − onttrekking; backward: V_nodig[i] = (V_nodig[i+1] + nettoBehoefte) / (1 + reële onttrekkingsvoet)',
    files: ['lib/horizon-engine/engine.ts', 'lib/horizon-engine/strategies.ts', 'lib/horizon-engine/adapter.ts', 'lib/horizon-engine/build-input.ts', 'lib/horizon-engine/scalar-bridge.ts', 'lib/withdrawal-strategy.ts'],
    functions: ['runHorizonLedger', 'ledgerToUnifiedResult', 'runSelectedProjection', 'runScalarProjectionV2', 'applyWithdrawalStrategy', 'buildHorizonInput'],
    elementIds: ['as-planning', 'fn-toekomstplannen'],
    note: 'Architectuur (invarianten + uitbreidingsregels): docs/architecture/horizon-engine-v2.md. Plan: docs/horizon-tabel-rekenmotor-plan.md. ADR 0013 + 0014 + 0015 + 0017. Beheer-inspectie (v2-only): /beheer/horizon-tabellen-mij (echte-gebruiker-tabellen A–G) en /beheer/grafiek-werking (functionele referentie); de oude v1↔v2-vergelijk-inspector /beheer/horizon-tabellen is verwijderd (geen v1 meer om tegen te vergelijken). Single source of truth = LedgerRow[] (per asset/schuld); intern reëel, de adapter is het ENIGE reëel→nominaal-punt; FIRE = forward doel-zoektocht (geen crossing); strategieën zijn pure plug-ins. Eindstrategie-onttrekking: deplete = spend-down-annuïteit (→ ~€0); legacy = need-only (residu groeit naar de nalatenschap, via ctx.legacyPreserveOnly in withdrawal-strategy.ts — anders verdampt het surplus in het grootboek; ADR 0014); perpetual/pensioen = need-only. FIRE-selectie (meetsStrategyTarget): legacy is doel-zoekend (ADR 0017) — de vroegste leeftijd waarvan de afbouw-lijn ≥ legacyAmount eindigt (GEEN −2%-tolerantie meer, dus nooit ónder het doel) terwijl het liquide brug-pad richting €0 mag dippen maar nóóit negatief wordt (de buffer zit al in het ingevoerde nalatenschapsbedrag). Omdat het eindvermogen monotoon stijgt in de FIRE-leeftijd levert de vroegste passerende leeftijd automatisch het dichtst-bij-doel-resultaat; geen tweede zoekfase. Resultaatveld legacyTargetUnavoidablyExceeded (alleen legacy) markeert dat zelfs stoppen-nu al ≥ doel eindigt ("je kunt nu al stoppen"). perpetual/deplete-selectie ongewijzigd (minMid>1 + eindvermogen ≥ start×0.99 resp. niet vroegtijdig leeg). De backward V_nodig-referentielijn gebruikte al endVal = legacyAmount, dus de forward-selectie is nu consistent met de referentielijn (geen tolerantie-slack meer). Eigen-huis-downsize (v2): huis blijft niet-liquide asset in het grootboek, verkoop = asset-liquidatie op de trigger (UnifiedProjectionInput.assetLiquidations) i.p.v. filteren + inkomen — netto vermogen continu (alleen −verkoopkosten), liquiditeit verspringt; trigger op v2-liquide via buildHorizonInput (ADR 0015). C5-c voltooid via Optie B (ADR 0016): runUnifiedProjection en runSimulation zijn FYSIEK VERWIJDERD — v2 is de enige FIRE-engine. isHorizonV2Enabled retourneert altijd true; runSelectedProjection is v2-only en negeert de useV2-vlag — er is GEEN v1-arm meer in de selector. Scalar-bridge: runScalarProjectionV2 (lib/horizon-engine/scalar-bridge.ts) biedt een drop-in voor de oude scalar-portfolio-signatuur en routeert die callers (strategie-modal.tsx, de twee hypotheek-vs-beleggen-callers, de event-panes en de horizon-client scenario-overlays) naar v2. Optie B overruled de eerdere parity-behoud-beslissing (D3): de parity-/compare-tooling is VERWIJDERD — compareEngines, de ledger-API (/api/horizon-engine/ledger) en de v1↔v2-vergelijk-inspector /beheer/horizon-tabellen + de parity-tests zijn weg. (Behouden in die dir, niet-parity: ledger-views.tsx + persona.ts, gebruikt door /beheer/horizon-tabellen-mij + /beheer/grafiek-werking.) strategie-modal.tsx is NIET meer uitgesteld; het draait op v2 via de scalar-bridge. B2-parity (13 jun, na de fixes legacy-need-only/recurring-×12/housing-liquidatie): v2 ligt voor spend-down-strategieën later (persona deplete +7 jr, legacy +6 jr) door reëel-vs-nominaal, en gelijk voor behoud (perpetual +1, pensioen 0); eindnetto verschilt navenant. Owner legacy €200k: v1 onbereikbaar, v2 ~74 (haalbaar, eindigt ≥ doel).',
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
