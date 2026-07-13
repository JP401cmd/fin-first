/**
 * Acceptatiecriteria — domein Rapportages (WF-RAPP-01..13 / UAT-RAPP-01..13).
 *
 * Spiegelt exact de aanpak van `budget.ts`/`start.ts`/`will.ts`/`cash.ts`/`ovz.ts`/`nav.ts`.
 * Bron: `docs/uat/uat-plan.md` Deel 1 (workflow-definities WF-RAPP-01..13) +
 * Deel 2 §2.8 (UAT-RAPP-01..13). RAPP is aaneengesloten 01..13 (13 catalogus-
 * scenario's, geen verwijsregel-gaten) — WF-RAPP-07 en WF-RAPP-13 dragen een
 * annotatie in hun `wf`-veld ("...LEIDEND voor BUDGET" / "...; app-brede
 * maskinggedrag zelf = UAT-NAV-11"), genormaliseerd naar het kale WF-nummer
 * in de coverage-test (spiegelt WILL-13/OVZ-12/19/20/21).
 *
 * AL-GEDOCUMENTEERDE BUGS (staan al gelogd in Notion, GEEN nieuwe bijvangst-
 * kaarten van deze sessie — expliciet vermeld in de betreffende criteria):
 *  - Verhuurrendement 12× te laag op het Vermogensoverzicht: `rental_income`
 *    is een MAANDbedrag maar wordt direct als JAARhuur gebruikt (WF-RAPP-08).
 *  - Essentials-filter op het Persoonlijk plan telt Inkomen- en Sparen-
 *    categorieën ten onrechte mee als "essentiële uitgave" (ontbrekende
 *    `budget_type === 'expense'`-filter, WF-RAPP-09) → "Uitgaven nu" toont
 *    €127.140 i.p.v. de correcte €13.140.
 *  - `HOUSEHOLD_TYPE_LABELS`-mismatch: kent alleen single/partner/family/
 *    single_parent, terwijl `profiles.household_type` overal elders
 *    solo/samen/gezin gebruikt → toont de ruwe waarde "samen" (WF-RAPP-09).
 *
 * KERN-BEVINDING (bepaalt exact/consistency/ui-only): balans-/budget-/
 * vermogen-/persoonlijk-plan-cijfers zijn op de vaste (niet-gejitterde)
 * bezittingen/schulden/budget-limieten van Lisa/Willem/Tessa volledig
 * hand-narekenbaar — 6 'exact' criteria. Grondslag-regel (CLAUDE.md): deze
 * rapporten tonen het VOLLE netto vermogen (incl. niet-liquide activa als
 * woning/voertuig) — dat is een andere grootheid dan de FIRE-eligible
 * grondslag in het periodieke rapport (WF-RAPP-02) en de spiegel (WF-RAPP-10);
 * nooit met elkaar verwarren.
 */

import type { AcceptanceCriterion, AcceptanceSet } from './types'

const criteria: AcceptanceCriterion[] = [
  {
    workflow: 'WF-RAPP-01',
    scenarioId: 'UAT-RAPP-01',
    titel: 'Rapportage-hub openen en oriënteren',
    kriticiteit: 'BELANGRIJK',
    given: 'De hub toont zes rapportkaarten (i-vi) en de sectie "Eerder verschenen" (archief `report_configs`, max. 20 items, Romeins genummerd).',
    when: 'De gebruiker opent /rapportages.',
    then: 'Precies zes rapportkaarten zichtbaar; een leeg archief toont "Je archief is leeg." zonder foutmelding; > 20 items toont Romeinse nummering i–xx daarna gewone cijfers.',
    assertion: {
      kind: 'ui-only',
      source: 'app/(app)/rapportages/page.tsx — hub-oriëntatie, geen eigen berekening (de hub toont alleen namen/datums)',
    },
  },
  {
    workflow: 'WF-RAPP-02',
    scenarioId: 'UAT-RAPP-02',
    titel: 'Periodiek rapport genereren en lezen (maand/kwartaal/jaar)',
    kriticiteit: 'KERN',
    given: 'Persona Lisa: `net_worth_snapshots` op 1 apr 2026 (€117.280), 1 mei (€124.280), 1 jun (€127.080). Periode Q2 2026 = [2026-04-01, 2026-07-01).',
    when: 'Vermogensgroei = laatste snapshot in de periode − eerste snapshot in de periode.',
    then: 'Vermogensgroei = €127.080 − €117.280 = +€9.800; groeipercentage = 9.800/117.280×100 ≈ +8,36%. Grondslag-regel: dit is het VOLLE netto vermogen (snapshots, incl. niet-liquide) — een andere grootheid dan de FIRE-voortgang op FIRE-eligible grondslag in dezelfde strip (ADR 0009, bewust twee verschillende getallen binnen één rapport).',
    assertion: {
      kind: 'exact',
      expected: 'vermogensgroei=9800; groeiPct=8.36',
      source: 'app/api/report/route.ts r212-216 (vermogensgroei = laatste − eerste snapshot, gemirrord als directe optelsom) — zie rapp-checks.ts',
    },
  },
  {
    workflow: 'WF-RAPP-03',
    scenarioId: 'UAT-RAPP-03',
    titel: 'Periodiek rapport met AI-inleiding genereren',
    kriticiteit: 'BELANGRIJK',
    given: 'Dezelfde periode/cijfers als WF-RAPP-02, nu met de inleiding-toggle op "met ai-inleiding".',
    when: 'De gebruiker genereert het rapport met AI-inleiding.',
    then: 'Cijfers zijn byte-identiek aan WF-RAPP-02 (AI voegt alleen een redactionele callout toe); een AI-fout/timeout laat het rapport gewoon verschijnen zonder inleiding (stil geslikt, "report should never fail because of it"); AI-verbruik wordt gelogd via `recordAiUsage`.',
    assertion: {
      kind: 'ui-only',
      source: 'app/api/report/route.ts (AI-generatie, generateText via getModel) — redactionele tekst, niet deterministisch toetsbaar',
    },
  },
  {
    workflow: 'WF-RAPP-04',
    scenarioId: 'UAT-RAPP-04',
    titel: 'Opgeslagen rapport uit het archief heropenen',
    kriticiteit: 'BELANGRIJK',
    given: 'Een gegenereerd periodiek rapport (WF-RAPP-02.a) met gecachte data in `report_configs.cached_data`.',
    when: 'De gebruiker heropent het rapport uit het archief, ná wijzigingen aan de brondata.',
    then: 'De getoonde cijfers zijn byte-gelijk aan de oorspronkelijke generatie (bv. Vermogensgroei blijft +€9.800) — een A=B-consistentietoets tussen "eerste generatie" en "heropend uit cache", ongeacht latere brondata-wijzigingen.',
    assertion: {
      kind: 'consistency',
      source: 'app/api/report/route.ts r127-138/760-768 (cached_data-teruggave) — bevroren cache vs. eerste generatie, geen nieuw cijfer',
    },
  },
  {
    workflow: 'WF-RAPP-05',
    scenarioId: 'UAT-RAPP-05',
    titel: 'Rapport uit het archief verwijderen',
    kriticiteit: 'KERN',
    given: 'Minstens 2 opgeslagen rapporten in het archief.',
    when: 'De gebruiker klikt het prullenbak-icoon.',
    then: 'Het item verdwijnt onmiddellijk zonder bevestigingsdialoog (bewust, geen undo); een netwerkfout faalt stil (item kan na herladen nog bestaan); zonder AI-add-on faalt DELETE met 403 (zelfde tier-gate als GET/POST).',
    assertion: {
      kind: 'ui-only',
      source: 'app/(app)/rapportages/page.tsx#handleDelete + DELETE /api/report — workflow zonder eigen berekening',
    },
  },
  {
    workflow: 'WF-RAPP-06',
    scenarioId: 'UAT-RAPP-06',
    titel: 'Balansstaat op peildatum genereren en lezen',
    kriticiteit: 'KERN',
    given: 'Persona Lisa: totaal activa €498.550 (vaste €407.500 + vlottende €72.000 + liquide €19.050), totaal schulden €368.270 (lang €359.300 + kort €8.970). Persona Willem: activa €1.619.700, schulden €0, kort vreemd vermogen €0.',
    when: 'Eigen vermogen, solvabiliteit, schuldgraad en liquiditeit worden berekend.',
    then: 'Lisa: eigen vermogen = 498.550−368.270 = €130.280 (balans in evenwicht); solvabiliteit = 130.280/498.550×100 ≈ 26,13%; schuldgraad = 368.270/130.280 ≈ 2,83; liquiditeit = (72.000+19.050)/8.970 ≈ 10,15. Willem: eigen vermogen = €1.619.700, solvabiliteit = 100%, schuldgraad = 0; liquiditeit is NULL (kort vreemd vermogen = 0 → géén 0/∞/crash, UI toont "—").',
    assertion: {
      kind: 'exact',
      expected: 'lisaEigenVermogen=130280; lisaSolvabiliteit=26.13; lisaSchuldgraad=2.83; lisaLiquiditeit=10.15; willemSolvabiliteit=100; willemLiquiditeit=null',
      source: 'app/api/report/balans/route.ts r258-312 (balansformules, gemirrord) — zie rapp-checks.ts',
    },
  },
  {
    workflow: 'WF-RAPP-07',
    scenarioId: 'UAT-RAPP-07',
    titel: 'Budgetrapport voor een maand genereren en analyseren',
    kriticiteit: 'KERN',
    given: 'Persona Lisa, 100% deterministische `default_limit`-waarden (geen jitter): Vaste lasten €1.555, Dagelijks €925, Vervoer €265, Leuke dingen €300, Sparen €600, Schulden €50; Inkomen €5.200.',
    when: 'Begroot (totaal), Te verdelen en dekkingsgraad worden berekend.',
    then: 'Totaal Uitgaven-begroot = 1.555+925+265+300 = €3.045; Begroot (totaal, incl. sparen/schulden) = 3.045+600+50 = €3.695; Te verdelen = 5.200−3.695 = €1.505; dekkingsgraad = 3.695/5.200×100 ≈ 71,1%; Essentieel-begroot (Vaste lasten+Dagelijks+Vervoer) = €2.745, Discretionair-begroot (Leuke dingen) = €300. Besteed/Verschil zelf leunen op gejitterde transacties (kruisverwijs 1-op-1 met /overzicht/cashflow/transacties — elk verschil is een bug).',
    assertion: {
      kind: 'exact',
      expected: 'begroot=3695; teVerdelen=1505; dekkingsgraad=71.06; essentieelBegroot=2745; discretionairBegroot=300',
      source: 'app/api/report/budget/route.ts (Begroot-som, 100% deterministisch op persona-budgetlimieten, gemirrord) — zie rapp-checks.ts',
    },
  },
  {
    workflow: 'WF-RAPP-08',
    scenarioId: 'UAT-RAPP-08',
    titel: 'Vermogensoverzicht op peildatum genereren en lezen (incl. app-verdieping)',
    kriticiteit: 'KERN',
    given: 'Persona Tessa (compleet): totaal activa €1.551.000 (13 regels), totaal schulden €454.020 (12 regels). AL-GEDOCUMENTEERDE BUGS (reeds gelogd, niet opnieuw te melden): (1) verhuurrendement 12× te laag — `rental_income` (maandbedrag €950) wordt direct als jaarhuur gebruikt i.p.v. ×12; (2) dit rapport telt geen bankrekeningen mee in "Totaal activa" (structureel scope-verschil met de balans, niet dezelfde grondslag).',
    when: 'Eigen vermogen en het aantal regels worden berekend.',
    then: 'Eigen vermogen = 1.551.000 − 454.020 = €1.096.980; aantal regels = 13 (activa) + 12 (schulden) = 25. De twee bekende bugs hierboven blijven van kracht in de huidige productiecode — live te herverifiëren, niet opnieuw als bug te loggen.',
    assertion: {
      kind: 'exact',
      expected: 'eigenVermogen=1096980; aantalRegels=25',
      source: 'app/api/report/vermogen/route.ts r686-693 (eigenVermogen = Σ activa − Σ schulden, gemirrord) — zie rapp-checks.ts',
    },
  },
  {
    workflow: 'WF-RAPP-09',
    scenarioId: 'UAT-RAPP-09',
    titel: 'Persoonlijk plan genereren en aannames controleren',
    kriticiteit: 'KERN',
    given: 'Persona Willem: bruto rendement 6,00%, inflatie 2,00%, `net_monthly_income` NULL (hij gebruikt budgetten, geen profiel-inkomensveld), DOB 1968-11-30, cohort-rij [1966-10-01, 1970-06-30] → 67 jaar/6 mnd, niet definitief. Persona Marijke: `marginaal_tarief` expliciet 0,4950. AL-GEDOCUMENTEERDE BUGS (reeds gelogd): "Uitgaven nu" telt Inkomen+Sparen ten onrechte mee (€127.140 i.p.v. €13.140, ontbrekende `budget_type===\'expense\'`-filter); `HOUSEHOLD_TYPE_LABELS` mist solo/samen/gezin → toont ruwe waarde "samen".',
    when: 'AOW-leeftijd (`lookupAowAge`) en effectieve SWR + marginaal tarief (`resolveFireParams`) worden berekend.',
    then: 'Willem: AOW-leeftijd = 67 jaar/6 mnd, niet-definitief ("CBS-prognose"); effectieve SWR = 6,00−2,16−2,00 = 1,84%; marginaal tarief = 35,75% (fallback-tak, want `net_monthly_income` is NULL — sinds de tax-optimizer-refactor (lib/box1-tax.ts#deriveMarginaalTarief) jaar-afgeleid uit BOX1_PARAMS i.p.v. de vroegere 2024/2025-hardcode 36,97%; voor belastingjaar 2026 is schijf-1-tarief 35,75%). Marijke: marginaal tarief = 49,50% (expliciet ingesteld, geen fallback).',
    assertion: {
      kind: 'exact',
      expected: 'willemAowJaren=67; willemAowMaanden=6; willemAowDefinitief=false; effectieveSwr=1.84; willemMarginaalTarief=35.75; marijkeMarginaalTarief=49.5',
      source: 'lib/aow-leeftijd.ts#lookupAowAge + lib/fire-params.ts#resolveFireParams/computeEffectiveSwr — échte productiefuncties, geen mirror',
    },
  },
  {
    workflow: 'WF-RAPP-10',
    scenarioId: 'UAT-RAPP-10',
    titel: 'Benchmark-spiegel openen en jezelf vergelijken',
    kriticiteit: 'KERN',
    given: 'Persona Lisa: DOB 1981-07-08, huishoudtype "gezin" zonder kinderdata, "nu" = 5 juli 2026 (verjaardag nog niet geweest → 44 jaar). Persona Willem: DOB 1968-11-30, huishoudtype "samen", 0 kinderen → 57 jaar.',
    when: '`deriveCohort` bepaalt de leeftijdsband en het huishoudtype-label.',
    then: 'Lisa: leeftijdsband "35–45 jaar", huishoudtype "Gezin met jonge kinderen" (gezin_jong, want geen kind ≥12 bekend), `complete=true`. Willem: leeftijdsband "55–65 jaar", huishoudtype "Paar zonder thuiswonende kinderen". Consistentie-eis (niet hier hard te toetsen, wel te verifiëren): elk EUR-gerelateerd cijfer op de spiegel moet exact gelijk zijn aan wat /overzicht voor dezelfde gebruiker toont (beide consumeren `loadDashboardData`/`loadHorizonData`) — afwijking is per definitie een bevinding.',
    assertion: {
      kind: 'exact',
      expected: 'lisaAgeBand=35–45 jaar; lisaComplete=true; willemAgeBand=55–65 jaar',
      source: 'lib/benchmark/cohort.ts#deriveCohort — échte productiefunctie, geen mirror',
    },
  },
  {
    workflow: 'WF-RAPP-11',
    scenarioId: 'UAT-RAPP-11',
    titel: 'Benchmark-cijfer aanklikken voor toelichting (detail-sheet)',
    kriticiteit: 'BELANGRIJK',
    given: 'Een gegenereerd benchmark-rapport (WF-RAPP-10.a).',
    when: 'De gebruiker klikt op de gezondheidsring, een satelliet-cijfer of het grote cijfer boven een verdelingscurve.',
    then: 'Een BottomSheet opent met "Jouw waarde", een referentie-rij (label afhankelijk van metriek/tier: "Mediaan (doelgroep)" voor vermogen, "Referentie (doelgroep)" voor inkomen, "Typische peer" voor gemodelleerde metrieken), tier-uitleg en bronvermelding — pure presentatie, niets wordt herberekend.',
    assertion: {
      kind: 'ui-only',
      source: 'app/(app)/rapportages/benchmark/metric-detail-sheet.tsx — presentatielaag, geen eigen berekening',
    },
  },
  {
    workflow: 'WF-RAPP-12',
    scenarioId: 'UAT-RAPP-12',
    titel: 'Rapport afdrukken als PDF',
    kriticiteit: 'BELANGRIJK',
    given: 'Elk rapporttype heeft een "Afdrukken als PDF"-knop (window.print) — dit is de ENIGE export-/deel-mogelijkheid (geen download/e-mail/server-side PDF).',
    when: 'De gebruiker print de balans en het vermogensoverzicht.',
    then: 'De printdialoog opent zonder toolbar/knoppen (`data-print-hide`); bij vermogen/persoonlijk plan voorkomen `.report-section`-wrappers dat secties over een paginagrens breken (de andere rapporttypen missen die controle — bekend/geaccepteerd, geen nieuwe bug tenzij content onleesbaar wordt); gemaskeerde bedragen blijven gemaskeerd in de afdruk.',
    assertion: {
      kind: 'ui-only',
      source: 'app/(app)/rapportages/[id]/components/print-toolbar.tsx + report-pdf-root — window.print, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-RAPP-13',
    scenarioId: 'UAT-RAPP-13',
    titel: 'Rapporten bekijken met privacy-masking (bedragen verbergen)',
    kriticiteit: 'BELANGRIJK',
    given: 'Privacy-masking (oog-toggle) aan; vijf rapporttypen (balans/budget/vermogen/persoonlijk-plan/benchmark) gebruiken `useFc()`/`formatMaskedCurrency`.',
    when: 'De gebruiker opent elk rapporttype, incl. het periodieke rapport.',
    then: 'AL-GEDOCUMENTEERDE BEVINDING (reeds gelogd uit fase 1, hier te herverifiëren): de hero-FiguresStrip van het PERIODIEKE rapport gebruikt plain `formatCurrency` (dus NIET gemaskeerd), terwijl de subcomponenten eronder (lead-story, kolommen, maandtabel) wél masked-aware zijn — gemengd gedrag binnen één pagina. Op de vijf overige rapporttypen zijn alle EUR-bedragen consistent gemaskeerd; percentages/leeftijden/aantallen blijven altijd zichtbaar. App-brede aan/uit-gedrag van de toggle zelf → UAT-NAV-11.',
    assertion: {
      kind: 'ui-only',
      source: 'app/(app)/rapportages/[id]/page.tsx (plain formatCurrency in de hero, bekende inconsistentie) + balans/budget/vermogen/persoonlijk-plan/benchmark (useFc/formatMaskedCurrency) — geen eigen berekening hier getoetst',
    },
  },
]

export const RAPP_ACCEPTANCE: AcceptanceSet = {
  zone: 'RAPP',
  criteria,
}
