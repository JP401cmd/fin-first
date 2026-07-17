/**
 * Acceptatiecriteria — domein Toekomst (WF-TOEK-01..26,28,29,30,32 /
 * UAT-TOEK-01..26,28,29,30,32). WF-TOEK-27 (uitgave-na-pensioen) en WF-TOEK-31
 * (tijdas in huishoud-/partnerperspectief) zijn bewust GEEN eigen criterium: ze
 * zijn in de catalogus verwijsregels naar UAT-REKEN-23/24 resp. UAT-NAV-19 en
 * horen daar getoetst te worden (spiegelt lib/uat/catalog.ts).
 *
 * KERNCONVENTIE (uat2-toek.md): de tijdas is KERNEL-ZWAAR. Vrijwel elk getal
 * (FIRE-leeftijd/-datum, benodigd vermogen, projectiepaden, SWR) komt uit de
 * horizon-kernel (lib/horizon-kernel/**, maandbasis, oracle-bewezen) en is NIET
 * met de hand na te rekenen. Die worden daarom:
 *   - 'oracle'      — verifieer het exacte cijfer via /beheer/horizon-kernel;
 *   - 'consistency' — hetzelfde getal moet op twee oppervlakken identiek zijn;
 *   - 'direction'   — alleen de richting van een wijziging is toetsbaar.
 * Slechts een KLEIN aantal is écht 'exact' (parameter-/persona-echo via een pure
 * functie of constante): AOW-bedragen (computeAowMonthly), de tekort-lening-rente
 * (EXCEL_TEKORT_LENING_RENTE), de strategie-labels + weergave-eindleeftijd-regel,
 * de jaarlijkse pensioenuitgave (custom_amount×12), guardrail-echo's, de
 * doel-ETA-annuïteitsformule en doel-voortgang (computeGoalProgress). Alleen die
 * 'exact'-criteria hebben een engine-check in toek-checks.ts (bewezen door
 * toek.engine.test.ts + de in-app suite uat-toek.ts).
 *
 * Cijfers zijn ONAFHANKELIJK narekend uit lib/test-personas.ts + de échte
 * rekenfuncties/constanten — nooit overgenomen uit wat de app toont.
 *
 * Gevonden discrepanties met uat2-toek.md staan INLINE bij het betreffende
 * criterium gedocumenteerd (zoek op "DISCREPANTIE").
 */

import type { AcceptanceCriterion, AcceptanceSet } from './types'

const criteria: AcceptanceCriterion[] = [
  {
    workflow: 'WF-TOEK-01',
    scenarioId: 'UAT-TOEK-01',
    titel: 'Tijdas-landing openen en FIRE-kerncijfers aflezen',
    kriticiteit: 'KERN',
    persona: 'willem',
    given: 'Persona Willem geladen (deplete-strategie, fire_end_age 95).',
    when: 'De gebruiker opent /toekomst, leest de figures-strip (Vrijheidsleeftijd/Doelbedrag/Opnamerate/Na pensioen) en de voetnoot onder de grafiek.',
    then: 'De voetnoot toont letterlijk "Vermogen opeten · Weergave t/m leeftijd 94 (eindleeftijd 95) · …". Strategienaam = STRATEGY_LABELS.deplete.name; eindleeftijd = fire_end_age (95, deplete → directe weergaveregel, géén solver-uitkomst); weergave-tot = 95−1 = 94. De pensioen-variant (persona Marijke) toont STRATEGY_LABELS.pensioen.name ("Pensioenleeftijd") en cap 100 → weergave t/m 99. EXACT-provable deel: de strategie-labels + de eindleeftijd-echo + de −1-weergaveregel. De vrijheidsleeftijd/het doelbedrag ZELF komen uit de kernel → toetsvorm oracle (/beheer/horizon-kernel).',
    assertion: {
      kind: 'exact',
      expected: 'strategieLabelDeplete=Vermogen opeten; eindleeftijd=95; weergaveTot=94; strategieLabelPensioen=Pensioenleeftijd',
      source: 'STRATEGY_LABELS + parseFireStrategy (lib/fire-strategy.ts) op PERSONAS.willem.profile; weergave-eindleeftijd = clipRowsToPlanEnd-regel (displayEndAge−1). Vrijheidsleeftijd/doelbedrag zelf = kernel/oracle.',
    },
  },
  {
    workflow: 'WF-TOEK-02',
    scenarioId: 'UAT-TOEK-02',
    titel: 'KPI-kassabon openen en de berekening controleren',
    kriticiteit: 'KERN',
    persona: 'willem',
    given: 'Persona Willem geladen (retirement_expense_method "custom_amount", €3.000/mnd; expected_return 6%).',
    when: 'De gebruiker opent de kassabonnen "Vrijheidsleeftijd", "Doelbedrag" en "Opnamerate".',
    then: 'De jaarlijkse pensioenuitgave = €3.000 × 12 = €36.000 (exacte persona-echo) en het rendementpercentage (6%) zijn in alle drie de bonnen én in de KPI "Na pensioen" identiek — één bron (resolveFireParams/simResult), geen losse herberekening per bon. EXACT-provable deel: €36.000 en 6% als persona-echo. De totalen (vrijheidsleeftijd/doelbedrag) zelf = toetsvorm oracle; de "identiek op elke bon"-eis = toetsvorm consistentie.',
    assertion: {
      kind: 'exact',
      expected: 'pensioenMaand=3000; jaaruitgaven=36000; rendementPct=6',
      source: 'PERSONAS.willem.profile.retirement_expense_custom_amount (jaarbedrag, via computeRetirementExpenses; maandweergave = /12) en .expected_return (×100). Totalen = kernel/oracle.',
    },
  },
  {
    workflow: 'WF-TOEK-03',
    scenarioId: 'UAT-TOEK-03',
    titel: 'Statusmeldingen boven de grafiek begrijpen en opvolgen',
    kriticiteit: 'KERN',
    persona: 'daan',
    given: 'Persona Daan (a: shortfall-basis), Willem (b/c) en Marijke (d) — verse laad per subscenario.',
    when: 'De gebruiker zet bij Daan "Na pensioen" op €8.000/mnd, controleert bij Willem de tekort-lening-/huis-meldingen en bij Marijke de afwezigheid van een "niet haalbaar"-melding.',
    then: 'Een pensioenuitgave ver boven de spaarcapaciteit duwt het benodigd vermogen onbereikbaar hoog → melding "FIRE niet haalbaar"; het exacte getal is niet met de hand te herleiden, alleen de richting. DISCREPANTIE/onbevestigd (uat2-toek.md): of Willems pensioengat (60→62) daadwerkelijk een tekort-lening triggert is niet geverifieerd — als de melding niet verschijnt, documenteren als bevinding, niet als fail. De tekort-lening-rente die de uitleg-sheet toont (5,0%) is een parameter-echo → apart exact getoetst onder WF-TOEK-17.',
    assertion: {
      kind: 'direction',
      source: 'richtingstoets: hogere pensioenuitgave → benodigd vermogen omhoog → haalbaarheid omlaag (kernel, geen exact cijfer).',
    },
  },
  {
    workflow: 'WF-TOEK-04',
    scenarioId: 'UAT-TOEK-04',
    titel: 'De grafiek verkennen: modus wisselen, zoomen, Inkomen & Uitgaven',
    kriticiteit: 'BELANGRIJK',
    persona: 'willem',
    given: 'Persona Willem geladen.',
    when: 'De gebruiker wisselt tussen "Pad" en "Opbouw", zoomt en opent "Inkomen & Uitgaven".',
    then: 'De som van de gestapelde reeksen in "Opbouw" op een willekeurig jaar is gelijk aan het netto-vermogenspunt op datzelfde jaar in "Pad" (dezelfde kernel-rijen via unifiedRowsToStackedRows). Consistentie tussen twee weergaves van dezelfde kernel-run, geen los te verifiëren cijfer.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: Σ stacked-reeksen(jaar) === netto-vermogenspunt(jaar) — unifiedRowsToStackedRows op één kernel-run.',
    },
  },
  {
    workflow: 'WF-TOEK-05',
    scenarioId: 'UAT-TOEK-05',
    titel: 'Jaar-detail-kassabon: één projectiejaar uitgesplitst bekijken',
    kriticiteit: 'KERN',
    persona: 'willem',
    given: 'Persona Willem geladen; grafiek in "Opbouw"-modus.',
    when: 'De gebruiker opent de jaar-detail-kassabon voor een projectiejaar en klapt de onttrekkings-uitsplitsing uit.',
    then: 'De regels binnen één jaar (Box 3, rendement, onttrekking) tellen exact op tot het getoonde jaartotaal (buildWithdrawalReceiptLines reconcilieert naar de werkelijke onttrekking) — de ene plek in de tijdas waar "gewoon optellen" het juiste toetsmiddel is. Toetsbaar als consistentie (kassabon-som = jaartotaal) op één kernel-run; het jaartotaal zelf is een kernel-cijfer. De bladeer-grens op leeftijd 94 (=displayEndAge−1) is exact — dezelfde regel als WF-TOEK-01.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: Σ kassabon-regels(jaar) === jaartotaal (buildWithdrawalReceiptLines). Jaartotaal zelf = kernel/oracle; bladeer-grens 94 = displayEndAge−1 (zie WF-TOEK-01).',
    },
  },
  {
    workflow: 'WF-TOEK-06',
    scenarioId: 'UAT-TOEK-06',
    titel: '"Details": simulatie-uitleg met "Zo werkt jouw grafiek" en jaar-op-jaar tabel',
    kriticiteit: 'BELANGRIJK',
    persona: 'willem',
    given: 'Persona Willem geladen.',
    when: 'De gebruiker opent "Details", klapt "JAAR-OP-JAAR VERLOOP" uit en bekijkt de gemarkeerde FIRE-rij.',
    then: 'De per-leeftijd-tabel (fase/beginvermogen/rendement/inleg-opname/eindvermogen) en de gemarkeerde FIRE-leeftijd zijn kernel-uitkomsten. Verifieer de exacte cijfers via /beheer/horizon-kernel ("Stappen & tabellen" draait dezelfde kernel op het eigen account); de FIRE-leeftijd moet daar identiek zijn aan de KPI "Vrijheidsleeftijd" en de FIRE-countdown op /overzicht. DISCREPANTIE/onbevestigd (uat2-toek.md 06c): de "Bruto rendement"/inflatie-tekst gebruikt mogelijk DEFAULT_RETURN/vaste "2%"-tekst i.p.v. de profielwaarden — bevestigen bij een persona met afwijkend rendement (Marijke 5%), niet als bug aannemen.',
    assertion: {
      kind: 'oracle',
      source: 'oracle: jaar-op-jaar tabel + gemarkeerde FIRE-leeftijd via /beheer/horizon-kernel; cross-check tegen KPI Vrijheidsleeftijd + FIRE-countdown /overzicht.',
    },
  },
  {
    workflow: 'WF-TOEK-07',
    scenarioId: 'UAT-TOEK-07',
    titel: 'Eerste gebruik: welkomsttekst en Tips-modus',
    kriticiteit: 'OVERIG',
    persona: 'willem',
    given: 'Persona Willem, verse laad (welkomst nog niet gezien).',
    when: 'De gebruiker opent /toekomst voor het eerst, doorloopt de welkomstkaart en de Tips-ballonnen en kiest "Niet meer weergeven".',
    then: 'Welkomstkaart toont netto vermogen + vrijheidsleeftijd consistent met de hero-KPI (geen eigen som); tips-overlay verschijnt over de vervaagde grafiek; "Niet meer weergeven" sluit permanent, ook na herlaad (server-side, cross-device). Pure interactie/weergave.',
    assertion: {
      kind: 'ui-only',
    },
  },
  {
    workflow: 'WF-TOEK-08',
    scenarioId: 'UAT-TOEK-08',
    titel: "Rendement-scenario's en Monte Carlo over de grafiek leggen",
    kriticiteit: 'BELANGRIJK',
    persona: 'willem',
    given: 'Persona Willem geladen (basisrendement 6%).',
    when: 'De gebruiker klikt "Scenario\'s" (±2pp → 4%/8%-lijnen) en "Monte Carlo" (band + mediaan + FIRE-kans).',
    then: 'De optimistische lijn (8%) toont op elk toekomstig jaar een gelijk-of-hoger vermogen dan de basislijn (6%); de pessimistische (4%) gelijk-of-lager. Richtingstoets, geen exact cijfer.',
    assertion: {
      kind: 'direction',
      source: 'richtingstoets: 8%-lijn ≥ 6%-basislijn ≥ 4%-lijn per jaar (kernel-scenariolijnen).',
    },
  },
  {
    workflow: 'WF-TOEK-09',
    scenarioId: 'UAT-TOEK-09',
    titel: 'Opgeslagen wat-als-scenario\'s als spooklijn vergelijken',
    kriticiteit: 'BELANGRIJK',
    persona: 'willem',
    given: 'Persona Willem geladen — heeft een opgeslagen wat-als-scenario "Vroeg stoppen op 50" (fireAge 50, kleurindex 1).',
    when: 'De gebruiker opent de scenario-overlay-picker en vinkt "Vroeg stoppen op 50" aan.',
    then: 'De picker toont FIRE-leeftijd 50 (= opgeslagen fireAge-veld in appSettings.whatif_scenarios, consistentie bij het tonen). De GHOST-LIJN zelf is een verse kernel-run met de scenario-parameters → de vorm ervan verifieer je via de oracle (/beheer/horizon-kernel of /toekomst/whatif). Geen persona-seed levert dit cijfer; whatif_scenarios leeft in appSettings, niet in test-personas → geen pure engine-check.',
    assertion: {
      kind: 'oracle',
      source: 'oracle: ghost-lijn = kernel-run met scenario-parameters (/beheer/horizon-kernel / /toekomst/whatif); picker-fireAge = echo van opgeslagen appSettings-veld.',
    },
  },
  {
    workflow: 'WF-TOEK-10',
    scenarioId: 'UAT-TOEK-10',
    titel: 'Wat-als-sliders inline op de tijdas',
    kriticiteit: 'KERN',
    persona: 'willem',
    given: 'Persona Willem geladen (maandinkomen €6.500).',
    when: 'De gebruiker verschuift de "Spaarquote"-slider omhoog en daarna terug naar baseline.',
    then: 'Een hogere spaarquote maakt de vrijheidsleeftijd-KPI gelijk-of-lager, nooit hoger (directe herberekening, geen opslaan-knop). Terug naar baseline ruimt het tijdelijke slider-scenario-event op (clearScenarioEvents) en herstelt de exacte baseline-lijn. Richtingstoets; sliders zijn bewust niet-persistent.',
    assertion: {
      kind: 'direction',
      source: 'richtingstoets: hogere spaarquote-slider → vrijheidsleeftijd gelijk-of-lager (kernel-herberekening).',
    },
  },
  {
    workflow: 'WF-TOEK-11',
    scenarioId: 'UAT-TOEK-11',
    titel: 'AOW-stop-simulatie: doorwerken tot AOW vergelijken',
    kriticiteit: 'BELANGRIJK',
    persona: 'daan',
    given: 'Persona Daan geladen (26 jaar, netto vermogen −€4.200, shortfall — FIRE vermoedelijk pas ná AOW-leeftijd).',
    when: 'De gebruiker klikt (mits shortfall bevestigd) "Stop op AOW" boven de grafiek.',
    then: 'Het AOW-stop-pad toont vóór AOW-leeftijd een vlakkere/stijgende lijn (geen onttrekking, "doorwerken") en begint pas ná AOW te dalen (onttrekking start). Richtingstoets. Bij persona Willem (FIRE ruim vóór AOW) verschijnen de toggles niet — voorwaardelijke UI.',
    assertion: {
      kind: 'direction',
      source: 'richtingstoets: AOW-stop-pad vlak/stijgend vóór AOW, dalend ná AOW (kernel).',
    },
  },
  {
    workflow: 'WF-TOEK-12',
    scenarioId: 'UAT-TOEK-12',
    titel: 'Fase-balk: de drie levensfasen verdiepen',
    kriticiteit: 'BELANGRIJK',
    persona: 'willem',
    given: 'Persona Willem geladen.',
    when: 'De gebruiker opent de fase-modals Opbouw/Overgang/Onttrekking.',
    then: 'Het "verwacht vermogen op FIRE-moment" in de Opbouw-modal is gelijk aan het vermogen op het FIRE-marker-punt in de hoofdgrafiek (consistentie tussen twee weergaves van dezelfde kernel-run). Bij persona Marijke (pensioen-modus) volgen de fasegrenzen de AOW-leeftijd en toont de Onttrekking-modal het nalatenschapsdoel €200.000 i.p.v. €0.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: verwacht vermogen op FIRE-moment (Opbouw-modal) === vermogen op FIRE-marker (hoofdgrafiek).',
    },
  },
  {
    workflow: 'WF-TOEK-13',
    scenarioId: 'UAT-TOEK-13',
    titel: 'Levensgebeurtenis toevoegen via de catalogus',
    kriticiteit: 'KERN',
    persona: 'willem',
    given: 'Persona Willem geladen.',
    when: 'De gebruiker voegt "Sabbatical wereldreis" toe (leeftijd 59, eenmalige kosten €15.000) en bekijkt de live FIRE-impact-preview.',
    then: 'Een eenmalige onttrekking van €15.000 kan de vrijheidsleeftijd alleen gelijk houden of naar later verschuiven, nooit naar vroeger (richtingstoets). De invoer-echo (−€15.000 in het jaar-detail van 2028) is een UI-consistentie-eis die pas na een kernel-run zichtbaar is, niet een pure engine-check.',
    assertion: {
      kind: 'direction',
      source: 'richtingstoets: eenmalige onttrekking €15.000 → vrijheidsleeftijd gelijk-of-later. Invoer-echo −€15.000 = UI-consistentie (kernel jaar-detail).',
    },
  },
  {
    workflow: 'WF-TOEK-14',
    scenarioId: 'UAT-TOEK-14',
    titel: 'Levensgebeurtenis bekijken, bewerken en verwijderen',
    kriticiteit: 'KERN',
    persona: 'willem',
    given: 'Persona Willem geladen, met het event "Sabbatical wereldreis" aanwezig.',
    when: 'De gebruiker wijzigt de eenmalige kosten naar €20.000, en klikt bij het AOW-event (strategie-beheerd) en het ABP-event (custom).',
    then: 'Na het bewerken toont het jaar-detail 2028 een regel −€20.000 (invoer-echo op de kernel-jaardetail — consistentie tussen invoer en weergave). Het AOW-event opent NIET de EventPane maar de AOW-strategie-editor (badge "Beheerd via AOW-strategie"); het ABP-custom-event opent wél de gewone EventPane en is verwijderbaar. De echo is een UI-consistentie-eis, geen pure engine-check.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: gewijzigde eenmalige kosten €20.000 === regel in kernel jaar-detail 2028; strategie-beheerd vs. custom routing.',
    },
  },
  {
    workflow: 'WF-TOEK-15',
    scenarioId: 'UAT-TOEK-15',
    titel: 'Gebeurtenis verslepen op de tijdas (drag & drop) en ongedaan maken',
    kriticiteit: 'KERN',
    persona: 'willem',
    given: 'Persona Willem geladen, met "Sabbatical wereldreis" (leeftijd 59).',
    when: 'De gebruiker sleept de marker van leeftijd 59 naar 61 en maakt ongedaan.',
    then: 'Na verslepen verdwijnt de −€15.000-regel uit jaar-detail 2028 (leeftijd 59) en verschijnt hij in jaar-detail 2030 (leeftijd 61) — invoer-echo op de nieuwe leeftijd (consistentie). Verslepen naar dezelfde afgeronde leeftijd = geen opslag/toast. De echo is een UI-consistentie-eis (kernel jaar-detail), geen pure engine-check.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: verplaatst event −€15.000 verdwijnt uit oud jaar, verschijnt in nieuw jaar (kernel jaar-detail).',
    },
  },
  {
    workflow: 'WF-TOEK-16',
    scenarioId: 'UAT-TOEK-16',
    titel: 'Markers lezen: levensgebeurtenissen, natuurlijke mijlpalen en clusters',
    kriticiteit: 'BELANGRIJK',
    persona: 'compleet',
    given: 'Persona Tessa (compleet) geladen — lopende hypotheek + portefeuille die op termijn €1M passeert.',
    when: 'De gebruiker zet "Natuurlijke mijlpalen" aan en opent een mijlpaal-marker/cluster.',
    then: 'De "Hypotheek afgelost"-mijlpaal valt op het jaar waarin de hypotheeksaldo-rij in de kernel-projectie voor het eerst €0 bereikt — vóór dat jaar staat de marker niet (richtingstoets). Clusters (bv. rond leeftijd 48-50) tonen een "+N"-marker met EventClusterSheet. Het exacte mijlpaaljaar is een kernel-uitkomst.',
    assertion: {
      kind: 'direction',
      source: 'richtingstoets: mijlpaal-marker verschijnt op/na het kernel-jaar waarin hypotheeksaldo €0 bereikt, niet ervoor.',
    },
  },
  {
    workflow: 'WF-TOEK-17',
    scenarioId: 'UAT-TOEK-17',
    titel: 'Gebeurtenissen-pagina: tijdlijn met kernel-momenten en tekort-lening-uitleg',
    kriticiteit: 'KERN',
    persona: 'willem',
    given: 'Persona Willem geladen (geen eigen deficit_loan_rate ingesteld).',
    when: 'De gebruiker opent /toekomst/gebeurtenissen en (indien aanwezig) de tekort-lening-uitleg-sheet.',
    then: 'De uitleg-sheet toont "Gehanteerde rente: 5,0%" — de default EXCEL_TEKORT_LENING_RENTE (0,05), omdat Willem geen eigen deficit_loan_rate heeft. Dit is een exacte parameter-echo. Het ontstaans-/piekjaar van het tekort zijn kernel-uitkomsten (oracle). DISCREPANTIE/onbevestigd (uat2-toek.md): of het tekort daadwerkelijk optreedt hangt van de portefeuillegrootte in het venster af — als de rij niet verschijnt, documenteren als bevinding.',
    assertion: {
      kind: 'exact',
      expected: 'tekortLeningRentePct=5.0',
      source: 'EXCEL_TEKORT_LENING_RENTE (lib/horizon-kernel/adapter/defaults.ts = 0.05) — default omdat PERSONAS.willem geen deficit_loan_rate-override heeft.',
    },
  },
  {
    workflow: 'WF-TOEK-18',
    scenarioId: 'UAT-TOEK-18',
    titel: 'AOW-strategie instellen',
    kriticiteit: 'KERN',
    persona: 'willem',
    given: 'Persona Willem geladen — AOW-event met seed-bedrag €940/mnd, leefsituatie "samenwonend", 0 jaar buiten NL.',
    when: 'De gebruiker opent de AOW-strategie-editor en wisselt leefsituatie/jaren buiten NL.',
    then: 'De editor herberekent live: samenwonend/0 jaar → €1.084 (round(NL_AOW_MONTHLY_SAMENWONEND=1.084,13)), NIET de seed-waarde €940 (live herberekening, bedoeld gedrag). Samenwonend/5 jaar buiten NL → round(1.084,13×45/50)=€976. Alleenstaand/0 → round(1.581,55)=€1.582. Exacte parameter-berekening via computeAowMonthly. De seed €940 wijkt af van de actuele constante — precies de bekende regressie-check.',
    assertion: {
      kind: 'exact',
      expected: 'samenwonend0=1084; samenwonend5=976; alleenstaand0=1582; willemSeed=940; seedWijktAf=true',
      source: 'computeAowMonthly (lib/horizon-data.ts) met NL_AOW_MONTHLY(_SAMENWONEND) uit lib/constants.ts; willemSeed = PERSONAS.willem.life_events[AOW].monthly_income_change.',
    },
  },
  {
    workflow: 'WF-TOEK-19',
    scenarioId: 'UAT-TOEK-19',
    titel: 'Pensioen-strategie: potten beheren en mijnpensioenoverzicht importeren',
    kriticiteit: 'KERN',
    persona: 'willem',
    given: 'Persona Willem geladen (geen pension-type event — ABP staat als custom-event).',
    when: 'De gebruiker voegt een pensioenpot toe (€2.200/mnd vanaf leeftijd 62, geïndexeerd) en importeert een mijnpensioenoverzicht.',
    then: 'Het toevoegen van €2.200/mnd extra pensioeninkomen vanaf leeftijd 62 kan de vrijheidsleeftijd alleen gelijk houden of vervroegen, nooit vertragen (richtingstoets). De jaarruimte-indicatie valt terug op estimateFactorAFromSalary (Factor A niet ingevuld). Het import-/parse-pad is AI-afhankelijk — bevestig het accepteer-pad, niet de parse-kwaliteit.',
    assertion: {
      kind: 'direction',
      source: 'richtingstoets: +€2.200/mnd pensioen vanaf 62 → vrijheidsleeftijd gelijk-of-vroeger (kernel).',
    },
  },
  {
    workflow: 'WF-TOEK-20',
    scenarioId: 'UAT-TOEK-20',
    titel: 'Werk-strategie: je inkomenslijn over de jaren vormgeven',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa (compleet) geladen, netto maandinkomen €7.600 als basis.',
    when: 'De gebruiker stelt reële groei 2%, plafond €9.000 en een fase-stap "minder werken vanaf 55 (−20%)" in.',
    then: 'Het toevoegen van een fase-stap "minder werken vanaf 55" kan de vrijheidsleeftijd alleen gelijk houden of vertragen t.o.v. de baseline zonder die stap (richtingstoets). De tijdlijn-kaart vat de metadata samen: "groei 2%/jr · plafond €9.000 · minder werken vanaf 55" → bij alleen groei "groei 2%/jr" → bij leeg "Inkomenslijn ingesteld" (UI-samenvattingstekst).',
    assertion: {
      kind: 'direction',
      source: 'richtingstoets: fase-stap "minder werken vanaf 55" → vrijheidsleeftijd gelijk-of-later (kernel, minder inkomen vanaf die leeftijd).',
    },
  },
  {
    workflow: 'WF-TOEK-21',
    scenarioId: 'UAT-TOEK-21',
    titel: 'Huis-strategie: hoe de eigen woning meetelt in je vrijheid',
    kriticiteit: 'KERN',
    persona: 'willem',
    given: 'Persona Willem geladen (Woning Wassenaar €650.000, default "volledig meetellen").',
    when: 'De gebruiker wisselt de huis-strategie naar "Verkopen zodra geld opraakt" resp. "Uitsluiten".',
    then: 'De KPI "Belegbaar voor pensioen" gaat OMLAAG (met ~de huiswaarde €650.000) zodra "Uitsluiten" wordt gekozen t.o.v. "volledig meetellen" — richtingstoets. Bij "Verkopen zodra geld opraakt" verschijnt alleen een virtueel verkoop-event als de trigger binnen de projectie valt (bij Willem vermoedelijk nooit, zie WF-TOEK-03c). Bij persona Daan (geen eigen woning) meldt de sectie dat er niets mee te tellen valt (geen crash).',
    assertion: {
      kind: 'direction',
      source: 'richtingstoets: "Uitsluiten" → KPI "Belegbaar voor pensioen" omlaag met ~huiswaarde €650.000.',
    },
  },
  {
    workflow: 'WF-TOEK-22',
    scenarioId: 'UAT-TOEK-22',
    titel: 'Doelen bekijken en een doel toevoegen (presets + ETA-berekening)',
    kriticiteit: 'KERN',
    persona: 'willem',
    given: 'Persona Willem geladen (heeft al 2 goals).',
    when: 'De gebruiker kiest preset "Noodfonds €5.000" (type Sparen, geen datum) en daarna een variant met streefdatum over 24 maanden.',
    then: 'Zonder datum: "Bij €100/maand haal je dit doel in ~4 jaar" — n = ln(1+(5.000×r)/100)/ln(1+r) met r=0,015/12 → n≈48,5 mnd → round(4,04)=4 jaar. Met streefdatum (24 mnd): PMT = 5.000×(0,015/12)/((1+0,015/12)^24−1) ≈ €205,35/maand. DISCREPANTIE (uat2-toek.md 22b): het document noemt €205,36; de precieze annuïteitsformule geeft €205,35 (1-cent afrondingsslip in het document; de UI toont Math.round → €205). De doel-ETA-annuïteitsformule staat LOS van de kernel → exact narekenbaar.',
    assertion: {
      kind: 'exact',
      expected: 'etaJaren=4; maandinlegMetDatum=205.35',
      source: 'annuïteitsformule monthlyContributionForTarget / no-date-solve (components/future/doel-toevoegen-sheet.tsx, RETURN_BY_TYPE.savings=0.015). LIMITATIE: die functie is component-privé/niet-exporteerbaar; de check spiegelt exact dezelfde pure formule (bewijst de math, niet de component-wiring).',
    },
  },
  {
    workflow: 'WF-TOEK-23',
    scenarioId: 'UAT-TOEK-23',
    titel: 'Doel-voortgang bijwerken, doel behalen of verwijderen',
    kriticiteit: 'KERN',
    persona: 'willem',
    given: 'Persona Willem geladen, met een "Noodfonds"-doel (€0/€5.000, type Sparen).',
    when: 'De gebruiker vult "Huidige waarde" in als €3.000.',
    then: 'De voortgangsbalk springt naar 60% (computeGoalProgress: round(3.000/5.000×100)=60) en de bijdrage-monitor toont "+€3.000 · +60 pp" (t.o.v. de vorige waarde €0). Doel behalen (€5.000) markeert het doel als voltooid. Exacte voortgang via de échte functie computeGoalProgress.',
    assertion: {
      kind: 'exact',
      expected: 'pctBij3000=60; pctBij0=0; deltaPp=60',
      source: 'computeGoalProgress (lib/goal-data.ts) op een savings-goal target €5.000, current €3.000 resp. €0.',
    },
  },
  {
    workflow: 'WF-TOEK-24',
    scenarioId: 'UAT-TOEK-24',
    titel: 'Voorkeuren: eindstrategie of onttrekkingsstrategie wijzigen',
    kriticiteit: 'KERN',
    persona: 'marijke',
    given: 'Persona Marijke geladen (guardrails: floor 0,80 / ceiling 1,20 / cut_step 0,10; eindstrategie "pensioen", nalatenschap €200.000).',
    when: 'De gebruiker opent "Onttrekkingsstrategie" en controleert de Guardrails-waarden; bij Willem wisselt hij de eindstrategie deplete→legacy (€300.000).',
    then: 'De onttrekkingsstrategie toont EXACT vier profielen: Vast / Afnemend / Oplopend / Guardrails (NIET "VPW"/"Bucket" — DISCREPANTIE t.o.v. fase-1-inventarisatie: die zijn per migratie 20260703115225 geschrapt). Bij Guardrails komen vloer 80% / plafond 120% / cut-stap 10% 1-op-1 overeen met Marijkes profielvelden (guardrail_floor/ceiling/cut_step × 100) — exacte invoer-echo. De eindstrategie-echo (pensioen, €200.000) is een parse-echo. De deplete→legacy-impactgrafiek (WF-TOEK-24b) is richting/oracle. DISCREPANTIE/onbevestigd (24c): de Afnemend/Oplopend-impactgrafiek toont mogelijk nog het vlakke profiel — documenteren als bekende beperking.',
    assertion: {
      kind: 'exact',
      expected: 'floorPct=80; ceilingPct=120; cutStepPct=10; strategie=pensioen; nalatenschap=200000',
      source: 'PERSONAS.marijke.profile.guardrail_floor/ceiling/cut_step (×100) + parseFireStrategy (lib/fire-strategy.ts) op PERSONAS.marijke.profile.',
    },
  },
  {
    workflow: 'WF-TOEK-25',
    scenarioId: 'UAT-TOEK-25',
    titel: 'Voorkeuren: pot-regels instellen (volgorde, toename, afname)',
    kriticiteit: 'KERN',
    persona: 'willem',
    given: 'Persona Willem geladen.',
    when: 'De gebruiker opent "Onttrekkingsvolgorde", wijzigt de volgorde en bekijkt de illustratieve pot-flow.',
    then: 'De som van de getoonde pot-saldi in de illustratie komt overeen met de bezittingen-optelling die elders (Overzicht/netto vermogen) al zichtbaar is — géén losse hersimulatie (bewust "illustratief"). Consistentie tussen twee weergaves van dezelfde brondata. Volgorde-tekst en toename-/afname-bestemming zijn instelbaar en persistent.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: Σ getoonde pot-saldi === bezittingen-optelling (Overzicht/netto vermogen), zelfde brondata.',
    },
  },
  {
    workflow: 'WF-TOEK-26',
    scenarioId: 'UAT-TOEK-26',
    titel: 'Markt-aannames bijwerken (inflatie en bruto rendement)',
    kriticiteit: 'KERN',
    persona: 'willem',
    given: 'Persona Willem geladen (inflatie 2%, rendement 6%).',
    when: 'De gebruiker wijzigt inflatie naar 2,5% en bruto rendement naar 6,5%.',
    then: 'De kaart "Effectief SWR" (badge "Afgeleid", niet-bewerkbaar) toont een ander percentage dan vóór de wijziging, en dat getal is identiek aan het SWR-getal in de KPI-kassabon "Opnamerate" — één bron (resolveFireParams). Consistentie tussen twee weergaves; validatie blokkeert buiten 0-15%.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: "Effectief SWR" === SWR in KPI-kassabon "Opnamerate" (resolveFireParams, één bron).',
    },
  },
  {
    workflow: 'WF-TOEK-28',
    scenarioId: 'UAT-TOEK-28',
    titel: 'Navigatiekaarten: status lezen, drilldown openen en doorklikken',
    kriticiteit: 'BELANGRIJK',
    persona: 'willem',
    given: 'Persona Willem geladen.',
    when: 'De gebruiker leest de vier navkaarten (Doelen/Gebeurtenissen/Voorkeuren/Rekenhulp), opent een drilldown-accordeon en klikt door.',
    then: 'Doelen toont een status-dot o.b.v. het slechtst presterende actieve doel; Gebeurtenissen toont "Volgende: <naam> · <jaar/leeftijd>"; Voorkeuren toont strategienaam + SWR%. Drilldown = accordeon (één tegelijk); kaart-klik navigeert naar de subroute. In "Eenvoudig"-modus is de Rekenhulp-kaart verborgen en zijn de chevrons uitgeschakeld. Pure navigatie/weergave.',
    assertion: {
      kind: 'ui-only',
    },
  },
  {
    workflow: 'WF-TOEK-29',
    scenarioId: 'UAT-TOEK-29',
    titel: 'Tijdas delen of afdrukken (PDF)',
    kriticiteit: 'OVERIG',
    persona: 'willem',
    given: 'Persona Willem geladen.',
    when: 'De gebruiker klikt "Delen / Afdrukken".',
    then: 'De OS-printdialoog opent; het afdrukvoorbeeld toont alleen de tijdas-inhoud (navigatiekaarten/header/colofon zijn print-verborgen). Niet-rekenend, pure weergave.',
    assertion: {
      kind: 'ui-only',
    },
  },
  {
    workflow: 'WF-TOEK-30',
    scenarioId: 'UAT-TOEK-30',
    titel: 'Deeplinks en legacy-routes volgen',
    kriticiteit: 'BELANGRIJK',
    persona: 'willem',
    given: 'Persona Willem geladen.',
    when: 'De gebruiker opent diverse deeplinks/legacy-routes (/toekomst?tab=…&strategie=…, /toekomst/strategie, /horizon, /horizon/whatif, …).',
    then: 'De redirects/param-mappings landen op de juiste subroute met de juiste modal/editor open; onbekende tab-waarden worden genegeerd (gewone landing). DISCREPANTIE/bevinding (uat2-toek.md 30b): /toekomst?strategie=open vervangt de adresbalk naar /horizon (searchParams-effect doet altijd router.replace(\'/horizon\'), horizon-client.tsx ~r494) — verrassend maar volgens code bedoeld, geen crash. Pure navigatie/routing.',
    assertion: {
      kind: 'ui-only',
    },
  },
  {
    workflow: 'WF-TOEK-32',
    scenarioId: 'UAT-TOEK-32',
    titel: 'Verdieping onder de grafiek: trends en geplande acties',
    kriticiteit: 'OVERIG',
    persona: 'willem',
    given: 'Persona Willem geladen.',
    when: 'De gebruiker klapt "Gezondheid" open, opent de kassabon "Financiële Gezondheid" en wijzigt de status van een geplande actie.',
    then: 'De kassabon toont de uitsplitsing van het gezondheidsgetal consume-only, uit dezelfde bron als elders in de app (consistentie, geen eigen som). Een status-wijziging op een ActionCard is direct zichtbaar en ook in De Wil (gedeeld domein). In "Eenvoudig"-modus zijn beide blokken verborgen.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: kassabon "Financiële Gezondheid" === gezondheidsgetal elders (consume-only, één bron); actiestatus gedeeld met De Wil.',
    },
  },
]

export const TOEK_ACCEPTANCE: AcceptanceSet = {
  zone: 'TOEK',
  criteria,
}

/**
 * De TOEK-scenario-nummers die een acceptatiecriterium HOREN te hebben — de
 * catalogus dekt 01..26, 28, 29, 30, 32 (27 en 31 zijn verwijsregels naar
 * REKEN/NAV en horen NIET in deze set). Gebruikt door de dekkings-meta-test.
 */
export const TOEK_EXPECTED_WORKFLOW_NUMBERS: number[] = [
  ...Array.from({ length: 26 }, (_, i) => i + 1), // 1..26
  28, 29, 30, 32,
]
