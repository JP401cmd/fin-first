# Delta-spec: Gezondheidsscore v2 — vier gedragspijlers (Fase 1)

> Werkdocument voor de bouw (extend-feature-pijplijn, jun 2026). Voorstel en
> onderbouwing: `docs/gezondheidsscore-herontwerp.md`. Besluit: ADR 0010.
> Eén afwijking t.o.v. de oorspronkelijke requirement-output: de
> overzichtskaart (`health-score-card.tsx`) toont de 4 pijler-subscores WÉL
> (expliciete gebruikerswens), samengestelde score blijft meest prominent.

## FR-1. Pillarstructuur

7 actieve indicatoren in 4 pijlergroepen (basisgewichten, som 0.95 →
herverdeeld naar 1.0 via `getRedistributedWeightForSet`):

| id | pillarGroup | basisgewicht |
|---|---|---|
| `savings_rate` | `rondkomen` | 0.20 |
| `budget_discipline` | `rondkomen` | 0.10 |
| `emergency_fund` | `buffer` | 0.20 |
| `debt_service_ratio` | `schuld` | 0.12 |
| `debt_ratio` | `schuld` | 0.08 |
| `fire_progress` | `vrijheid` | 0.18 |
| `asset_concentration` | `vrijheid` | 0.07 |

- `HealthPillar` krijgt optioneel `pillarGroup?: 'rondkomen' | 'buffer' | 'schuld' | 'vrijheid'` + `groupLabel?: string`. **Flat array blijft — geen nesting** (architectuurbesluit, briefing-engine consumeert via literal-ID-switch).
- `tax_optimization` en `diversification` vervallen uit `BASE_WEIGHTS`, `PILLAR_MODULE_REQUIREMENTS` en `PILLAR_ACTION`.
- Nieuw in `PILLAR_MODULE_REQUIREMENTS`: `debt_service_ratio` → `'vermogensregistratie'`, `asset_concentration` → `'vermogensregistratie'`.
- Nieuw in `PILLAR_ACTION`: `debt_service_ratio` → `{ href: '/overzicht/schulden', label: 'Verlaag je maandlasten' }`; `asset_concentration` → `{ href: '/overzicht/bezittingen', label: 'Spreid je vermogen' }`.

## FR-2. DSTI (`debt_service_ratio`) — nieuw

- DSTI% = Σ `monthly_payment` (actieve schulden) ÷ netto maandinkomen × 100.
- Curve (`scoreDSTI`, puur): ≤20% → 100; 20–36% lineair 100→70; 36–43% lineair 70→40; 43–60% lineair 40→0; ≥60% → 0.
- Geen schulden (Σ = 0) → **actief, score 100**. Schulden > 0 én inkomen = 0 → **inactief** (gewicht herverdeeld).
- `HealthScoreInput` + `HealthScoreScalars` krijgen `netMonthlyIncome: number`; `HealthScoreRows` krijgt `debtMonthlyPayments: number` (vooraf gesommeerd in loader/route).
- **Inkomensbron**: dezelfde canonieke inkomensbron die `savingsRate6m` voedt (income6m/6 resp. effectiveMonthlyIncome) — op alle 4 call-sites identiek; GEEN nieuwe/afwijkende bron introduceren.

## FR-3. Vermogensconcentratie (`asset_concentration`) — nieuw

- Grootste `asset_type` als % van totaal vermogen **excl. `asset_type === 'eigen_huis'`** (`'real_estate'` = beleggingsvastgoed, telt WEL mee). Unlinked cash telt mee als 'cash'.
- Curve (`scoreAssetConcentration`, puur): ≤40% → 100; 40–70% lineair 100→40; 70–90% lineair 40→0; ≥90% → 0.
- **Inactief** wanneer grootste type < €10.000 (starter) of totaal excl. eigen_huis ≤ 0 → `largestAssetTypeShare = null`.
- Nieuwe pure helper `computeLargestAssetTypeShare(assets, unlinkedCash): number | null` in `health-score-input.ts`. `HealthScoreInput`/`HealthScoreRows` krijgen `largestAssetTypeShare: number | null`.

## FR-4. Vervallen pijlers

- `tax_optimization` en `diversification` worden niet meer berekend/geretourneerd. Helpers (`scoreTaxOptimization`, `buildTaxData`, `computeAssetTypeCount`) mogen blijven bestaan; `HealthScoreInput.taxData`/`assetTypeCount` blijven als optionele velden (backward compat) maar voeden geen pijler.
- Belasting wordt educatief "kans"-inzicht in de kassabon-receipt, buiten de score. **Wft-eis: richtingaanwijzer/educatie, géén handelings- of fiscaal advies** (geen "stort €X", geen besparing in euro's beloven; "Verken je Box 3-positie" mag).

## FR-5/6. No-data-beleid

- Budgetdiscipline zonder budgetten (geen categorieën met limit > 0) → **inactief** (de 70-dummy vervalt).
- Algemeen: indicator zonder betekenisvolle data → inactief + herverdelen via `getRedistributedWeightForSet`. Alle 7 inactief → total 0, activePillarCount 0, label 'Kritiek', geen divide-by-zero.
- Trend/`previousMonth` draait op DEZELFDE actieve set (hardcoded `tax_optimization: 50`-proxy verwijderen) — geen schijn-trend.

## FR-7. score_version

- Migratie: `ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS score_version SMALLINT NOT NULL DEFAULT 1`. Geen RLS-wijziging. Eerst remote-kolommen verifiëren (migration-drift-concern), toepassen via apply_migration.
- Alle snapshot-routes (POST/auto/cron) schrijven `score_version: 2`.
- Trendlijn (`horizon-trend-grid.tsx`/helpers): eerste v2-punt visueel markeren "methode aangepast" (alleen zichtbaar bij mix v1+v2).

## FR-8. Raakvlakken (verplicht mee)

1. `components/overview/overzicht-hero/hefbomen-nav.tsx`: `pillarKey 'diversification'` → `'asset_concentration'`; `'tax_optimization'` → `null` (status-proxy = `health.total`); tooltips bijwerken.
2. `lib/briefing/engine.ts` `pillarToHefboom`: `diversification`/`tax_optimization`-cases weg; `asset_concentration` → 'bezittingen'; `debt_service_ratio` → 'schulden'.
3. `components/widgets/gezondheids-score-widget.tsx`: positionele `shortLabels`-array → id-based map over de 7 nieuwe IDs.
4. `components/app/horizon/health-score-receipt.tsx`: groepeer indicatoren onder 4 pijler-subscores (subtotaal per groep = gewogen gemiddelde van actieve indicatoren in de groep ÷ som herverdeelde groep-gewichten — presentatie-berekening, geen engine-veld); totaalscore prominent bovenaan; belasting-"kans" sectie; semantische secties (a11y); radar n≥3-gedrag ongewijzigd.
5. `components/overview/overzicht-hero/health-score-card.tsx`: 4 pijler-subscores visueel aantrekkelijk; samengestelde score meest prominent; `getTimeAnchor` (fire_progress/emergency_fund-IDs blijven bestaan → werkt door).
6. Loaders: `dashboard-data-loader.ts` + `horizon-data-loader.ts` + 3 snapshot-routes geven `debtMonthlyPayments`/`netMonthlyIncome`/`largestAssetTypeShare` door. **Let op horizon-loader**: debts-query op ~regel 242 mist `monthly_payment` (gebruik `fullDebtsResult`); lokale `buildTaxData`-duplicaat (~180-196) vervangen door canonieke import.
7. `components/core/core-landing.tsx`: eigen tweede berekenpad naar het canonieke pad trekken (gebruikt nu pre-ADR-0009 `netWorth/fireTarget`-formule en geen taxData). Harde grens: /core-score = /overzicht-score binnen afronding.
8. `lib/architecture/calculations.ts` entry `gezondheidsscore`: titel 7→4-pijler, summary/inputs/outputs/formula/constants bijwerken; elementIds ongewijzigd.
9. ADR 0010 bestaat al: `docs/adr/0010-gezondheidsgetal-v2.md`.

## NFR's (kern)

- Eén bron (ADR 0008-invariant): alle 4 paden via `buildHealthScoreInput` → identieke score bij gelijke data.
- Nieuwe scorefuncties puur en deterministisch.
- Publieke signatures backward-compatible; `computeHealthScore(DashboardData)`-overload zet nieuwe indicatoren op inactief (heeft de inputs niet).
- Huishoudperspectief: nieuwe inputs via dezelfde perspective-bron als totalAssets/totalDebts.
- A11y: receipt-groepen semantisch (`<section aria-label>`); `role="meter"` blijft.

## Acceptatiecriteria (selectie — volledige set bij tester)

- DSTI: 20%→100, 36%→70, 43%→40, ≥60%→0; geen schulden→100 actief; schulden+geen inkomen→inactief.
- Concentratie: ≤40→100, 50%→~80, ≥90→0; alles-in-eigen-huis→inactief(null); grootste<€10k→null; real_estate telt mee.
- Gewichten: som actieve weights = 1.0±0.001 in alle constellaties; activeModules=[] → alleen `emergency_fund` (weight 1.0).
- `pillars` bevat nooit `tax_optimization`/`diversification`; wel `debt_service_ratio`+`asset_concentration` bij volle data; elke pillar heeft correcte `pillarGroup`.
- Snapshots schrijven `score_version=2`; trendlijn markeert methodewissel bij mix v1/v2.
- Receipt: 4 groepen zichtbaar, totaal prominent; hefbomen-nav vindt `asset_concentration`, belasting-tegel op total-proxy.

## Scope UIT (fase 2 / nooit)

Vaste-lasten-indicator, persoonlijke Nibud-bufferdrempel, subjectieve
well-being, empirische gewichtskalibratie, box3-berekening zelf, retroactieve
herberekening v1-snapshots.

## Definition of Done

tsc 0 errors; vitest groen (financial-health.test.ts herschreven, wil-gezondheid-suite herschreven, health-score-receipt.test.tsx, briefing/engine.test.ts, health-score-card.test.tsx); migratie aangemaakt én toegepast; alle FR-8-raakvlakken aantoonbaar bijgewerkt; Wft-review op belasting-tip-tekst.
