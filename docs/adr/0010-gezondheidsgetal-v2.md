---
id: 0010-gezondheidsgetal-v2
title: Gezondheidsgetal v2 — vier gedragspijlers
status: aanvaard
date: 2026-06-12
elements: [as-budget, as-vermogen, as-planning, as-belasting]
---

Het gezondheidsgetal (0–100) wordt geherstructureerd van 7 vlakke pijlers met handmatige gewichten naar **vier gedragspijlers** (Rondkomen 35% · Buffer 20% · Schuld 20% · Vrijheid 25%) met 7 actieve indicatoren, in lijn met de internationale frameworks (FHN FinHealth Score, CFPB, Deloitte/Nibud). Belasting-optimalisatie verdwijnt uit de score en wordt een "kans"-inzicht. De berekening blijft één canonieke bron (ADR 0008): alleen `lib/financial-health.ts` + `lib/health-score-input.ts` veranderen, loader en alle drie snapshot-routes erven mee. De pijler-API blijft een platte `HealthPillar[]` met een additief `pillarGroup`-veld (geen nesting). `net_worth_snapshots` krijgt een append-only `score_version`-kolom; bestaande historie blijft v1, nieuwe writes zijn v2. Dit ADR vult ADR 0008 aan (één bron blijft gelden) en bouwt op de FIRE-eligible grondslag van ADR 0009.

## Context
De v1-score (`computeHealthScoreFromInputs`) weegt 7 vlakke pijlers met a-priori-gewichten (eff. 23/18/14/18/9/9/9). Marktonderzoek (juni 2026, zie `docs/gezondheidsscore-herontwerp.md`) legt vier structurele zwaktes bloot:

1. **Geen toonaangevend framework gebruikt vaste handmatige gewichten.** FHN middelt 8 indicatoren gelijk; CFPB noemt a-priori-gewichten psychometrisch zwak.
2. **Diversificatie en belasting-optimalisatie zijn in géén framework een component** (samen 18% van de v1-score), en draaien bovendien vaak op een neutrale dummy (tax = 50 zonder Box 3-data; diversificatie = puur het áántal asset-typen).
3. **Vermogens-stock telt dubbel** (schuldratio, FIRE-voortgang én diversificatie zijn alle drie vermogensmetrics, samen 45%), terwijl de standaarden het zwaartepunt op stuurbaar gedrag en buffers leggen.
4. **Neutrale-score-lekkage**: tax zonder data = 50 en geen budgetten = 70 trekken actief aan de totaalscore.

De methode is bewust **niet als geheel empirisch gevalideerd** — dat geldt voor géén enkele objectieve composietscore in de markt. Onderbouwd zijn de indicator-keuze en de drempels (DTI 36/43%, 6-maands-buffer, Nibud-spaarnorm); niet onderbouwd zijn de pijlergewichten (35/20/20/25) — een beredeneerde designkeuze.

## Besluit
1. **Vier pijlergroepen / 7 actieve indicatoren (fase 1):**
   - **Rondkomen (35%)** — Spaarquote 20% · Budgetdiscipline 10% · (fase 2: Vaste lasten op tijd 5%).
   - **Buffer (20%)** — Noodfonds 20%.
   - **Schuld (20%)** — Schuldenlast t.o.v. inkomen (DSTI) 12% · Schuldratio (debt/assets) 8%.
   - **Vrijheid (25%)** — FIRE-voortgang 18% · Vermogensconcentratie 7%.

   Gewichten zijn een beredeneerde designkeuze, geen gevalideerde weging; de pijler-subscores worden in de UI prominenter getoond dan het totaal.

2. **Belasting uit de score.** De `tax_optimization`-pijler vervalt als gezondheidsmetric (het is een efficiëntie-metric) en verhuist naar een "kans"-inzicht / aandachtspunt. `buildTaxData` blijft bestaan, maar voedt niet langer een score-pijler.

3. **Twee nieuwe indicatoren, één vervangen.** DSTI (Σ `monthly_payment` ÷ netto maandinkomen, FHN-drempels) en Vermogensconcentratie (grootste asset-type als % van totaal vermogen excl. eigen woning) komen erbij; de diversificatie-count vervalt. Dit breidt `HealthScoreInput` additief uit (`debtMonthlyPayments`, `netMonthlyIncome`, `largestAssetTypeShare`).

4. **No-data-herverdeling overal.** Een indicator zonder betekenisvolle data is **inactief**: het gewicht wordt proportioneel herverdeeld binnen de pijler (en bij een lege pijler over de overige pijlers), via het bestaande `getRedistributedWeightForSet`-mechanisme. Geen neutrale dummies (50/70) meer — ook de `budgetTotal === 0 → 70`-tak in `computeHealthScoreFromInputs` vervalt.

5. **Platte API + `pillarGroup` (additief).** De pijler-API blijft `HealthPillar[]`; er komt één optioneel veld `pillarGroup: 'rondkomen' | 'buffer' | 'schuld' | 'vrijheid'` bij. **Geen geneste pijler-tree.** Reden: de briefing-engine, de kassabon-receipt, `wil-gezondheid` en de Berekeningen-view consumeren `pillars` nu als platte lijst (deels via literal-ID-map); nesting zou alle consumenten breken. De groepering is een presentatie-concern (de receipt groepeert op `pillarGroup`).

6. **`score_version` in `net_worth_snapshots`.** Append-only kolom `score_version SMALLINT DEFAULT 1`. Bestaande historie blijft daarmee impliciet v1; nieuwe snapshot-writes (alle drie routes) zetten `score_version = 2`. De methodewissel geeft een niveausprong in de trendlijn; de UI markeert die ("methode aangepast").

## Gevolgen
- **Eén bron blijft (ADR 0008).** De wijziging raakt uitsluitend `financial-health.ts` + `health-score-input.ts`; de loader (`horizon-data-loader.ts`), de dashboard-bundel (`computeHealthScoreWithTrend`) en de drie snapshot-routes erven automatisch. Er ontstaat géén tweede berekenpad.
- **Duplicaat-paden worden in deze fase opgeruimd (bindend).** De lokale `buildTaxData`-duplicaat in `horizon-data-loader.ts` (regels ~180-196) wordt verwijderd ten gunste van de canonieke variant in `health-score-input.ts` — die tax-input verandert toch (DSTI/concentratie vervangen de tax-/diversificatie-rol). De client-recompute in `core-landing.tsx` (eigen `freedomPct = netWorth / fireTarget`, géén taxData, eigen noodfonds/diversificatie/budget) wordt naar het canonieke pad getrokken zodat de /core-hero-score niet zichtbaar van /overzicht afwijkt. Volledige unificatie van de /core-recompute mag een vervolgticket zijn als ze te groot blijkt, **mits** de getoonde /core-score na de wissel binnen afronding gelijk is aan /overzicht.
- **FIRE-pijler erft de FIRE-eligible grondslag (ADR 0009).** De `/core`-recompute draait nu nog op de oude vol-vermogen-formule; na de wissel naar het canonieke pad erft /core de strategie-bewuste `computeFreedomProgress`-grondslag, identiek aan dashboard en /toekomst.
- **Snapshot-historie blijft v1, intern consistent.** `DEFAULT 1` dekt bestaande rijen; geen backfill, geen RLS-wijziging (bestaande tabel, bestaande own-row policy). De live v2-score kan afwijken van oude v1-snapshots — gedocumenteerde historie, geen drift (consistent met ADR 0008/0009).
- **Platen:** de Berekeningen-view (`lib/architecture/calculations.ts`, entry `gezondheidsscore`) wordt bijgewerkt (titel 7→4-pijler, inputs/outputs/formula/note). ArchiMate-topologie en HLD veranderen niet — er verschijnt geen nieuw domein, bedrijfsproces, applicatieservice of externe integratie; het blijft dezelfde capability op dezelfde services (`as-budget`, `as-vermogen`, `as-planning`).
- **Tests:** `financial-health.test.ts` herschreven op de 4-pijler-structuur; nieuwe unit-tests voor DSTI- en concentratie-curves; regressiesuite `wil-gezondheid` + `health-score-receipt.test.tsx` bijgewerkt.
- **Fase 2 (buiten dit besluit):** vaste-lasten-betaalgedrag-indicator (transactie-detectie) en persoonlijke Nibud-bufferdrempel.
