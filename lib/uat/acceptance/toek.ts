/**
 * Acceptatiecriteria — domein Toekomst (WF-TOEK-01..26,28,29,30,32,33,34 /
 * UAT-TOEK-01..26,28,29,30,32,33,34). WF-TOEK-27 (uitgave-na-pensioen) en
 * WF-TOEK-31 (tijdas in huishoud-/partnerperspectief) zijn bewust GEEN eigen
 * criterium: ze zijn in de catalogus verwijsregels naar UAT-REKEN-23/24 resp.
 * UAT-NAV-19 en horen daar getoetst te worden (spiegelt lib/uat/catalog.ts).
 *
 * WF-TOEK-36/37 (woonstrategie-grondslag van de primaire vermogenslijn) zijn
 * NIEUW t.o.v. het UAT-plan — toegevoegd bij ADR 0114 (29-08-2026, "De primaire
 * lijn van de Toekomst-grafiek wisselt van grondslag per woonstrategie"): 36
 * toetst de grondslag-KEUZE exact (twee pure productiefuncties: de grafiek-
 * grondslag naast de balk-grondslag), 37 toetst de doorwerking op het scherm
 * (stip/band/drempels/pill/kassabon/tooltip) als consistentie-eis. Beide
 * spiegelen géén document-workflow.
 *
 * WF-TOEK-33/34 (euro-weergave, wave 2/3) zijn NIEUW t.o.v. het UAT-plan —
 * toegevoegd voor de wave-2/3-euro-weergave-uitrol (Notion-kaart
 * 39cf9e8d-568a-80fb-8a99-e090c080b964, brok H): 33 toetst de deflatie-math
 * (exact, pure `lib/euro-display.ts`-functies), 34 toetst de ADR-0091-
 * maskeringslaag op de grafiek (ui-only, geen cijfer). Beide spiegelen géén
 * document-workflow.
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
 * doel-ETA-annuïteitsformule, doel-voortgang (computeGoalProgress), het
 * meervoudig koppelen (computeLinkedCurrentValue, WF-TOEK-39) en de
 * richting-bewuste behaald-/auto-afsluit-toets (isGoalReached/
 * isMachineTrackedGoal/selectReachedAutoGoals, WF-TOEK-40, ADR 0125). Alleen die
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
    when: 'De gebruiker opent /toekomst, leest de figures-strip (Vrijheidsleeftijd/Doelbedrag/Opnamerate/Na pensioen), de duidingsregel direct onder de strip en de voetnoot onder de grafiek.',
    then: 'De voetnoot toont letterlijk "Vermogen opeten · Weergave t/m leeftijd 94 (eindleeftijd 95) · …". Strategienaam = STRATEGY_LABELS.deplete.name; eindleeftijd = fire_end_age (95, deplete → directe weergaveregel, géén solver-uitkomst); weergave-tot = 95−1 = 94. De pensioen-variant (persona Marijke) toont STRATEGY_LABELS.pensioen.name ("Pensioenleeftijd") en cap 100 → weergave t/m 99. DUIDINGSREGEL (S15, 28-08-2026): tussen de strip en de voortgangsbalk staat één zin die het kerngetal vertaalt — "Dit betekent: werken wordt voor jou een keuze rond je Ne." (pensioenmodus: "…je pensioen valt rond je Ne."; huishoud-/partnerweergave: "…voor <naam> … rond het Ne jaar."). Hij staat in BEIDE weergavemodi, en het jaartal N is per constructie hetzelfde als het kopgetal van de Vrijheidsleeftijd-KPI (gedeelde afronding heroFireAgeYear). Is er geen leeftijd (niet haalbaar / geen geboortedatum) dan staat er "Werken wordt steeds meer een keuze naarmate je vrijheid opbouwt."; zolang de kernel rekent of bij een gegevensmelding (M6) staat er niets. EXACT-provable deel: de strategie-labels + de eindleeftijd-echo + de −1-weergaveregel + de zin-vorm (lib/horizon/vrijheidsleeftijd-zin.ts). De vrijheidsleeftijd/het doelbedrag ZELF komen uit de kernel → toetsvorm oracle (/beheer/horizon-kernel).',
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
    then: 'De jaarlijkse pensioenuitgave = €3.000 × 12 = €36.000 (exacte persona-echo) en het rendementpercentage (6%) zijn in alle drie de bonnen én in de KPI "Na pensioen" identiek — één bron (resolveFireParams/simResult), geen losse herberekening per bon. EXACT-provable deel: €36.000 en 6% als persona-echo. De totalen (vrijheidsleeftijd/doelbedrag) zelf = toetsvorm oracle; de "identiek op elke bon"-eis = toetsvorm consistentie. Regressie (bug2, niet-custom_amount-methodes): `/api/uitgaven-na-pensioen/context` extrapoleert inkomen en pensioenuitgave sinds deze release via de gedeelde `deriveRetirementExpenseBasis` (all-time vroegste-inkomstendatum als deler-anker, identiek aan de SSR-loader) — voorheen gebruikte de route-lokale som een eigen 12-maands-venster + `net_monthly_income×12`-fallback, wat bij income-based methodes een afwijkend jaarbedrag t.o.v. de KPI kon geven. Willem (custom_amount) zelf raakt dit pad niet: die methode negeert `extrapolatedIncome` volledig. Regressie 2 (29-08-2026, methode current_income): de route geeft sinds die fix óók `effectiveAnnualIncome` (gekozen inkomensgrondslag, ADR 0103, via `resolveAmountWithBasis` + de canonieke `BUDGET_BASIS_COLUMNS`) door aan `deriveRetirementExpenseBasis` — voorheen toonde de sheet de rauwe transactie-extrapolatie (waargenomen: €82.907) terwijl de KPI de handmatige grondslag (€60.000) volgde. Bewaakt door app/api/uitgaven-na-pensioen/context/route.test.ts.',
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
    titel: 'Eerste gebruik: Tips-modus',
    kriticiteit: 'OVERIG',
    persona: 'willem',
    given: 'Persona Willem, verse laad (tips nog niet uitgezet).',
    when: 'De gebruiker opent /toekomst voor het eerst, doorloopt de Tips-ballonnen en sluit de tips via het kruisje, Escape of de Tips-toggle.',
    then: 'Er verschijnt GEEN welkomstkaart meer op /toekomst — die is per ADR 0130 vervangen door de rondleiding op /overzicht. De tips-ballonnen staan bij een eerste bezoek WEL default aan: de tips-overlay verschijnt over de vervaagde grafiek. Sluiten sluit DIRECT — geen tussenmodal — en wordt onthouden: na wegnavigeren en terugkomen blijven de tips uit (M38). Er volgt alleen een niet-blokkerende toast "Tips verborgen" met de actie "Niet meer melden" (zet die toast cross-device uit; raakt de tips-zichtbaarheid niet). Sluiten navigeert NIET automatisch naar /overzicht. Pure interactie/weergave.',
    assertion: {
      kind: 'ui-only',
    },
  },
  {
    workflow: 'WF-TOEK-08',
    scenarioId: 'UAT-TOEK-08',
    titel: "Rendement-scenario's en de marktcheck over de grafiek leggen",
    kriticiteit: 'BELANGRIJK',
    persona: 'willem',
    given: 'Persona Willem geladen (basisrendement 6%).',
    when: 'De gebruiker klikt "Scenario\'s" (±2pp → 4%/8%-lijnen) en "Marktcheck" (p25–p75-band + mediaan + de RENDEMENT-MARGE). De pil heette tot 2026-08-08 "Monte Carlo" en toonde een FIRE-kans uit een losstaande motor; daarna kort een "Plan houdt stand"-percentage. Sinds 2026-08-09 staat er een marge: hoeveel het rendement per jaar mag tegenvallen voordat het plan omvalt, getoetst op de GEKOZEN stopleeftijd (of, zonder keuze, op de AOW-leeftijd — de copy noemt dat anker expliciet). Het percentage is verdwenen omdat het op de gesolvede FIRE-leeftijd werd geëvalueerd en daardoor structureel ~51% was, ongeacht het plan.',
    then: 'De optimistische lijn (8%) toont op elk toekomstig jaar een gelijk-of-hoger vermogen dan de basislijn (6%); de pessimistische (4%) gelijk-of-lager. Richtingstoets, geen exact cijfer. De marktcheck-band toont p25–p75 (niet p10–p90) en de marge beweegt zichtbaar mee met de stop-slider: later stoppen = meer speling. Pil, legenda, explainer en aria-label zeggen alle vier hetzelfde (één copy-bron). SINDS ADR 0117 (29-08-2026, allocatie snede 1) loopt de verstoring achter de band/marge niet meer als één uniforme schuif over alle investeringspotten, maar PER POT geschaald met een markt-risicofactor (laag/obligaties ≈0,3×, middel/gespreid 1×, hoog/individuele aandelen-crypto ≈1,4×) — een premieregeling-pensioenpot beweegt daardoor voor het eerst mee. De richting van deze toets verandert daar niet door (hij toetst de I-grondslag-scenariolijnen), maar de breedte van de band/marge kan bij een gemengde portefeuille smaller of breder uitvallen dan vóór ADR 0117.',
    assertion: {
      kind: 'direction',
      source: 'richtingstoets: 8%-lijn ≥ 6%-basislijn ≥ 4%-lijn per jaar (kernel-scenariolijnen). Marge: lib/horizon-kernel/rendement-marge.ts#computeRendementMarge — monotoon in de stopleeftijd en in de uitgaven, gepind in lib/horizon-kernel/marktcheck.test.ts + rendement-marge.test.ts. Per-pot risicofactor: lib/horizon-kernel/wrappers/risico.ts#potRisicoFactor (ADR 0117) — geraakt WF-TOEK-08/WF-REKEN-18/WF-REKEN-13/14 gelijkelijk, geen apart engine-check hier (geen exact-criterium).',
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
    then: 'Een hogere spaarquote maakt de vrijheidsleeftijd-KPI gelijk-of-lager, nooit hoger (directe herberekening, geen opslaan-knop). Terug naar baseline ruimt het tijdelijke slider-scenario-event op (clearScenarioEvents) en herstelt de exacte baseline-lijn. Richtingstoets; sliders zijn bewust niet-persistent. Regressie (bug1): de baseline-inkomen/uitgaven-resolutie in horizon-client.tsx gebruikt sinds deze release `resolveEffectiveIncomeExpenses` (lib/effective-financials.ts) i.p.v. een eigen inline fallback — een expliciete handmatige bron (`income_source`/`expenses_source` === "manual") wint nu altijd van een mogelijk-onvolledige lopende-maand-transactiesom, identiek aan de SSR-loader. DOEL-LIJN TOT DE GEKOZEN STOPLEEFTIJD (ADR 0085): schuift de gebruiker op de Vrijheidsas de stopleeftijd (bv. naar 63) terwijl de spaarquote-slider ook gedraaid staat, dan loopt de gestippelde "Jouw doel"-lijn door tot een stip op de gekozen stopleeftijd (opbouw t/m stop, onttrekking daarna) i.p.v. te stoppen op de gesolvede FIRE-leeftijd; de legenda krijgt het suffix "(stop 63)". Verschuift de gebruiker ALLEEN de stopleeftijd (sliders op basis, geen ander wat-als), dan verschijnt de stippellijn alsnog — label "Jouw stopkeuze" i.p.v. "Jouw doel", zonder het delta-label op de pill. Ligt de gekozen stopleeftijd binnen 0,5 jaar van de verwachte FIRE-leeftijd, dan blijft de stippellijn weg (zou de hoofdlijn vrijwel overlappen). Richtingstoets/UI-consistentie: het stip-eindpunt van de stippellijn valt samen met de gekozen stopleeftijd op de Vrijheidsas, niet met de eerder getoonde gesolvede FIRE-leeftijd.',
    assertion: {
      kind: 'direction',
      source: 'richtingstoets: hogere spaarquote-slider → vrijheidsleeftijd gelijk-of-lager (kernel-herberekening); doel-lijn-stip == gekozen stopleeftijd (lib/horizon/doel-lijn-bron.ts#selectDoelLijnBron), niet de gesolvede FIRE-leeftijd.',
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
    then: 'Het toevoegen van €2.200/mnd extra pensioeninkomen vanaf leeftijd 62 kan de vrijheidsleeftijd alleen gelijk houden of vervroegen, nooit vertragen (richtingstoets). De jaarruimte-indicatie valt terug op estimateFactorAFromSalary (Factor A niet ingevuld). SINDS ADR 0115 (29-08-2026) is het import-pad GESPLITST: de datadownload van mijnpensioenoverzicht.nl (XML óf JSON, "Specificatie-xml-json-download-v1.2") wordt volledig CLIENT-SIDE en DETERMINISTISCH gelezen — géén AI, géén serverroundtrip, het bestand verlaat het toestel niet (`lib/pension/mijnpensioen-xml.ts#parseMijnpensioenXml` zet de XML-boom om naar exact dezelfde structuur die `JSON.parse()` van de JSON-export oplevert, waarna beide dezelfde mapper/dedup/write-keten volgen — pariteit vergrendeld in mijnpensioen-xml.test.ts). Alleen de LEGACY PDF-route blijft AI-afhankelijk (server-side extractie); bevestig daar het accepteer-pad, niet de parse-kwaliteit. Een XML- en een JSON-export van dezelfde pot deduppen op de genormaliseerde fondsnaam tot één rij (update, geen dubbele pot).',
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
    when: 'De gebruiker kiest preset "Noodfonds €5.000" (type Sparen, geen datum) en daarna een variant met streefdatum over 24 maanden; apart (d) kiest hij de preset "Schuldenvrij".',
    then: 'Zonder datum: "Bij €100/maand haal je dit doel in ~4 jaar" — n = ln(1+(5.000×r)/100)/ln(1+r) met r=0,015/12 → n≈48,5 mnd → round(4,04)=4 jaar. Met streefdatum (24 mnd): PMT = 5.000×(0,015/12)/((1+0,015/12)^24−1) ≈ €205,35/maand. DISCREPANTIE (uat2-toek.md 22b): het document noemt €205,36; de precieze annuïteitsformule geeft €205,35 (1-cent afrondingsslip in het document; de UI toont Math.round → €205). De doel-ETA-annuïteitsformule staat LOS van de kernel → exact narekenbaar. (d) SINDS DE ENUM-OPRUIMING (1 sep 2026, ADR 0125): de snelle-toevoegen-sheet praat uitsluitend in canonieke `GoalType`s (savings/net_worth/debt_payoff) i.p.v. een eigen `savings/wealth/debt`-enum die op de doelkaart stil terugviel naar "geen meta, geen eenheid, geen richting" (het doel kwam als `goal_type: \'wealth\'` in de database terecht — geen bug in deze release, wel de reden dat de enums nu identiek zijn). De preset "Schuldenvrij" schakelt daarom NIET meer door naar een leeg doel zonder schuld: hij opent direct "Geavanceerd" (GoalForm) met `debt_payoff` voorgeselecteerd, want een afbouwdoel heeft een gekoppelde schuld nodig om iets te betekenen (koppelen kan alleen daar — zie WF-TOEK-39).',
    assertion: {
      kind: 'exact',
      expected: 'etaJaren=4; maandinlegMetDatum=205.35',
      source: 'annuïteitsformule monthlyContributionForTarget / no-date-solve (components/future/doel-toevoegen-sheet.tsx, RETURN_BY_TYPE.savings=0.015). LIMITATIE: die functie is component-privé/niet-exporteerbaar; de check spiegelt exact dezelfde pure formule (bewijst de math, niet de component-wiring). De preset→doeltype-vertaling (d) is UI-routing (component-wiring), niet in dit exact-cijfer meegenomen.',
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
    then: 'De voortgangsbalk springt naar 60% (computeGoalProgress: round(3.000/5.000×100)=60) en de bijdrage-monitor toont "+€3.000 · +60 pp" (t.o.v. de vorige waarde €0). Doel behalen (€5.000) markeert het doel als voltooid MÉT `completed_at` (de datum blijft staan bij een re-save en wordt gewist bij heropenen — kaart #19), toont de krant-viering die eindigt met een doelsuggestie plus de knop "Kies je volgende doel" (opent de toevoegen-sheet; post-goal-dip-brug, plan-voorstel 3b), en verplaatst het doel uit de actieve lijst naar het ingeklapte "Bereikt"-archief onderaan met de behaald-datum (3a); het verschijnt daarna nergens meer als "vraagt aandacht" (off-track-lijst filtert op `is_completed`). Exacte voortgang via de échte functie computeGoalProgress.',
    assertion: {
      kind: 'exact',
      expected: 'pctBij3000=60; pctBij0=0; deltaPp=60',
      source: 'computeGoalProgress (lib/goal-data.ts) op een savings-goal target €5.000, current €3.000 resp. €0.',
    },
  },
  {
    workflow: 'WF-TOEK-24',
    scenarioId: 'UAT-TOEK-24',
    titel: 'Voorkeuren: het plan (stopmoment × wat er overblijft) of de onttrekkingsstrategie wijzigen',
    kriticiteit: 'KERN',
    persona: 'marijke',
    given: 'Persona Marijke geladen (guardrails: floor 0,80 / ceiling 1,20 / cut_step 0,10; profielrij nog in de OUDE vorm: fire_end_strategy "pensioen" + fire_legacy_amount €200.000, geen fire_end_age → 90).',
    when: 'De gebruiker opent in Voorkeuren regel 1 — het plan (`EindstrategieBody` → `StopPlanVragen`) — en leest de twee vragen; opent "Onttrekkingsstrategie" en controleert de Guardrails-waarden; bij Willem kiest hij onder vraag 2 de tegel "Een bedrag voor later of voor anderen" en vult €300.000 in.',
    then: '(a) PLAN-ECHO (ADR 0129; kopij eigenaar-besluit 5 sep 2026 uit lib/horizon/plan-draft.ts — dezelfde strings als de onboarding-stap "Jouw plan" (WF-START-28), de strategie-modal op /toekomst en de module-activatie-modal). Vraag 1 "Wanneer wil je stoppen met werken?" toont vier kaarten: "Zo vroeg als het kan" · "Op mijn AOW-leeftijd" (ondertitel aangevuld met "Jouw AOW-leeftijd: N." uit de gebruikerstabel, nooit een vaste 67) · "Op een leeftijd die ik kies" (+ veld Stopleeftijd, halve jaren 18–100) · "Nu" (alleen hier, niet in de onboarding). Vraag 2 "Tot welke leeftijd moet je geld reiken, en wat moet er dan nog over zijn?" in VASTE VOLGORDE: éérst het veld "Tot welke leeftijd moet je geld reiken?" (50–120) met een bijschrift per eind-vorm (`endAgeHint`), dán de kop "Wat moet er dan nog over zijn?" met "Niets, het mag op zijn" · "Een bedrag voor later of voor anderen" · "Mijn vermogen mag niet slinken", en pas daarna het veld "Bedrag dat over moet blijven (€)" — uitsluitend onder legacy. De oude labels ("Vermogen opeten" / "Nalatenschap" / "Eeuwigdurend" / "Pensioenleeftijd" / "Nu stoppen") en de oude vraagkop ("Wat moet er aan het eind gelden?") staan hier niet meer; STRATEGY_LABELS blijft alléén de korte vakterm voor grafiek-voetnoot en rapport (WF-TOEK-01). Marijkes legacy-rij leest via parseFirePlan → planDraftFromPlan als anker AOW ("Op mijn AOW-leeftijd" actief) × eind-vorm deplete ("Niets, het mag op zijn" actief), eindleeftijd 90 zichtbaar, en het bedragveld VERBORGEN — de €200.000 uit de rij is dus niet meer zichtbaar en gaat bij een save als fire_legacy_amount=null mee (planDraftToFireSettingsBody, route-contract R3: altijd het volledige plan). Onder "Mijn vermogen mag niet slinken" verdwijnt het eindleeftijd-veld en staat "Dan rekent de app zonder eindleeftijd: je leeft van wat je vermogen oplevert."; onder anker AOW blokkeert een eindleeftijd ≤ AOW-leeftijd het opslaan met "Je plan moet voorbij je AOW-leeftijd (N) reiken." — alleen hier, de route kent de AOW niet. (b) ONTTREKKINGSSTRATEGIE: EXACT vier profielen Vast / Afnemend / Oplopend / Guardrails (NIET "VPW"/"Bucket" — per migratie 20260703115225 geschrapt); vloer 80% / plafond 120% / cut-stap 10% = guardrail_floor/ceiling/cut_step × 100, exacte invoer-echo. (c) Willem deplete→legacy €300.000: de impactgrafiek is richting/oracle. DISCREPANTIE/onbevestigd (24c): de Afnemend/Oplopend-impactgrafiek toont mogelijk nog het vlakke profiel — documenteren als bekende beperking.',
    assertion: {
      kind: 'exact',
      expected: 'floorPct=80; ceilingPct=120; cutStepPct=10; anker=aow; ankerLabel=Op mijn AOW-leeftijd; eindVorm=deplete; eindVormLabel=Niets, het mag op zijn; eindleeftijd=90; eindleeftijdVeld=zichtbaar; bedragVeld=verborgen; rijNalatenschap=200000; putNalatenschap=null',
      source: 'PERSONAS.marijke.profile.guardrail_floor/ceiling/cut_step (×100) + lib/fire-strategy.ts#parseFirePlan → lib/horizon/plan-draft.ts#planDraftFromPlan + planDraftToFireSettingsBody + endFormShowsEndAge (kopij STOP_ANCHOR_OPTIONS/END_FORM_OPTIONS) op PERSONAS.marijke.profile — zie toek-checks.ts',
    },
  },
  {
    workflow: 'WF-TOEK-25',
    scenarioId: 'UAT-TOEK-25',
    titel: 'Voorkeuren: pot-regels instellen (volgorde, toename, afname)',
    kriticiteit: 'KERN',
    persona: 'willem',
    given: 'Persona Willem geladen.',
    when: 'De gebruiker opent "Onttrekkingsvolgorde" (in Eenvoudig eerst de disclosure "Pot-regels" openklappen — S7), wijzigt de volgorde en bekijkt de illustratieve pot-flow.',
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
    when: 'De gebruiker wijzigt inflatie naar 2,5% en bruto rendement naar 6,5% (in Eenvoudig eerst de disclosure "Markt-aannames" openklappen — S7).',
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
    when: 'De gebruiker opent diverse deeplinks/legacy-routes (/toekomst?tab=…&strategie=…, /toekomst/strategie, /horizon/strategie, /horizon/uitgaven-na-pensioen, /toekomst/uitgaven-na-pensioen, /horizon, /horizon/whatif, …).',
    then: 'De redirects/param-mappings landen op de juiste subroute met de juiste modal/editor open; onbekende tab-waarden worden genegeerd (gewone landing). DISCREPANTIE/bevinding (uat2-toek.md 30b): /toekomst?strategie=open vervangt de adresbalk naar /horizon (searchParams-effect doet altijd router.replace(\'/horizon\'), horizon-client.tsx ~r494) — verrassend maar volgens code bedoeld, geen crash (het is een dubbele hop: /horizon redirect vervolgens weer terug naar /toekomst). SINDS 11 AUG 2026 (React #310-opruiming, tweede lichting) zijn /horizon/strategie, /horizon/uitgaven-na-pensioen en /toekomst/uitgaven-na-pensioen zelf GEEN React-pagina\'s meer maar pure next.config.ts-redirects (zie WF-NAV-16) naar resp. /toekomst?strategie=open en /toekomst?uitgaven=open — die landen dus op precies dezelfde twee query-param-routes als hierboven, alleen bereikt via een oudere URL. /toekomst/strategie is EVENMIN meer een pagina: die redirect naar /toekomst/gebeurtenissen?strategie=aow|pensioen|huis (via `?focus=`, default `aow`) — een ANDERE bestemming dan `/toekomst?strategie=open` (dat opent de strategie-modal op de tijdas zelf; de gebeurtenissen-tab-deeplink opent een levensstrategie-kaart). Pure navigatie/routing.',
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
  {
    workflow: 'WF-TOEK-33',
    scenarioId: 'UAT-TOEK-33',
    titel: "/toekomst in huidige euro's: grafiek, hero-cijfers, fasetabel — exact één keer gedeeld",
    kriticiteit: 'KERN',
    persona: 'willem',
    given: 'Kernelrijen met een oplopende `inflationFactor` per leeftijd (jaar 0 = 1.0, wave 1/ADR 0032) — synthetisch, hand-narekenbaar met machten van 2 om drijvendekomma-afrondingsruis in de assertie te vermijden: leeftijd 50→factor 1, 51→2, 52→4 (endPortfolio resp. €100.000/€200.000/€400.000).',
    when: 'De gebruiker zet de euro-weergave-toggle op "Huidige euro\'s"; `horizon-client.tsx` deflateert de chart-rijen/hero-cijfers via `deflateRowsByAge`/`deflate` op de kernelfactor van de bijbehorende leeftijd (render-grens, D3).',
    then: 'In `\'nominal\'` levert `deflateRowsByAge` exact dezelfde array-referentie terug (geen re-render-cascade, AC-A1). In `\'real\'` deelt elk bedrag door de factor van zíjn eigen leeftijd — bij deze synthetische reeks (die zo is opgezet dat euro-inflatie en portefeuillegroei elkaar exact opheffen) blijft het reële bedrag op elke leeftijd €100.000: `deflate(400000, factorAtAge(rows,52), \'real\')` geeft hetzelfde getal als `deflateRowsByAge` op leeftijd 52. Dit is de kern-eis van D3/NFR-X2: precies één deling op het pad van kernelrij naar scherm, nergens een tweede.',
    assertion: {
      kind: 'exact',
      expected: 'nominalSameRef=true; real50=100000; real51=100000; real52=100000; singleDeflate=100000',
      source: 'lib/euro-display.ts#deflate + factorAtAge + deflateRowsByAge (échte productiefuncties, synthetische kernelrijen — geen mirror)',
    },
  },
  {
    workflow: 'WF-TOEK-34',
    scenarioId: 'UAT-TOEK-34',
    titel: 'Bedragmaskering op de vrijheidsgrafiek (geometrie blijft, bedragen weg)',
    kriticiteit: 'BELANGRIJK',
    persona: 'willem',
    given: 'Privacy-maskering aan (`useMaskedAmounts`, ADR 0091) op de /toekomst-grafiek, ongeacht euro-weergave.',
    when: 'De gebruiker zet "Bedragen verbergen" aan terwijl de grafiek open staat, met of zonder de euro-weergave-toggle op "Huidige euro\'s".',
    then: 'Gridlijnen, nullijn, de positie van elke doellijn, de vermogenslijn, de Monte-Carlo-band, de FIRE-stip en de crosshair-lijn/-stip blijven ONVERANDERD (laag 1, geometrie). Elk euro-bedrag — in zichtbare `<text>` én in `title`/`aria-label` — wordt vervangen door de gemaskeerde placeholder; een los `+`/`−`-teken vóór een gemaskeerd bedrag verdwijnt (richting blijft via kleur/icoon/groepskop). Maskering en euro-weergave zijn onafhankelijke assen (NFR-X4): masked+real tegelijk faalt niet stil naar één van beide. Pure UI-/privacy-laag, geen cijfermatige uitkomst om na te rekenen.',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/horizon/sim-chart.tsx + chart-static-layers.tsx (ADR 0091-maskeringslaag; euro-weergave via lib/euro-display.ts — géén cijfer hier, zie UAT-TOEK-33 voor de deflatie-math)',
    },
  },
  {
    workflow: 'WF-TOEK-35',
    scenarioId: 'UAT-TOEK-35',
    titel: 'Doelenpagina: pace-toets ("op koers") en het vrijheidsgetal-doel dat live meesynct (bevindingen M31/M32/C10, dekt /toekomst/doelen)',
    kriticiteit: 'KERN',
    persona: 'willem',
    given:
      '/toekomst/doelen (eigen subroute, 26-08-2026 uit de tijdas-tab getrokken — zelfde `DoelenView`/`computeGoalProgress`, geen nieuw rekenpad). VOORHEEN mat het "op koers"-oordeel een lineaire TIJD-FRACTIE sinds `created_at` waarin `target_value` niet voorkwam: een doel zwaarder maken kon de status ongewijzigd laten, en een zojuist aangemaakt doel op €0 stond per constructie meteen op "achter". Sinds de fix is het oordeel een PACE-TOETS: benodigde inleg/maand tot de streefdatum (`requiredMonthly = (target−current)/maandenTeGaan`, GOAL_PACE_DAYS_PER_MONTH=365,25/12) tegen de feitelijke inleg/maand sinds `created_at` (10%-marge, GOAL_PACE_TOLERANCE), met een vloer van GOAL_PACE_MIN_MEASURE_MONTHS=1 maand zodat een minuten-oude bijdrage geen tempo van duizenden euro\'s per maand suggereert. Sinds bevinding UR2-17 (eigenaarsbesluit 2 sep 2026) slaat een LIVE-GETRACKT STAND-doel met streefdatum (vrijheidsgetal, of `metadata.sync === \'auto\'`) de pace-toets zelf over (`paceSkipped: true`): daar is `current_value` een canonieke stand (heel het netto vermogen, de huidige spaarquote) en geen sinds-aanmaak opgebouwde inleg, dus "current / maanden" zou altijd boven elk vereist maandbedrag uitkomen — "OP KOERS" bij €0 inleg, ongeacht hoe oud het doel is.',
    when:
      'De gebruiker leest twee doelen met dezelfde looptijd en dezelfde inleg maar een ander doelbedrag (toont dat `target_value` nu meetelt); een doel dat binnen GOAL_PACE_GRACE_DAYS=14 dagen na aanmaak nog op €0 staat (toont de "Net begonnen"-genadeperiode i.p.v. een vals alarm); een live-getrackt stand-doel met streefdatum; en — als het vrijheidsgetal-standaarddoel bestaat en `vrijheidsgetalLive` waar is — de kaart die "Volgt automatisch je vrijheidsgetal" toont.',
    then:
      '(a) Bij identieke `created_at`/`target_date` en identieke inleg maakt een hoger `target_value` het oordeel `onTrack: false` waar het lagere doel `true` blijft — de kern van M32, vergrendeld in lib/goal-data.test.ts ("target_value beïnvloedt de uitkomst bij IDENTIEKE created_at/target_date"). (b) Een doel `current_value: 0` binnen de genadeperiode krijgt `measured: false` (kaart toont "Net begonnen", neutrale kleur, GEEN stoplichtoordeel) terwijl `requiredMonthly` al wél bekend is; ná de genadeperiode ZONDER inleg wordt uitblijven een signaal (`measured: true; onTrack: false`) — vergrendeld in hetzelfde bestand ("genadeperiode voor een vers doel (M31)"). (c) Op de kaart verschijnt bij een EUR-doel onder de 100% het bedrag "€X per maand nodig" (`requiredMonthly`, alleen bij `unit === \'EUR\'` — een spaarquote-doel toont geen "tempo van een tempo"). (d) Het vrijheidsgetal-standaarddoel (`isVrijheidsgetalGoal`) toont bij `vrijheidsgetalLive` de regel "Volgt automatisch je vrijheidsgetal" i.p.v. een handmatig bij te werken cijfer — de kaart negeert dan bewust een eigen `current_value`-invoer ten faveure van de canonieke FIRE-eta (`etaOverride` via `lib/goals/vrijheidsgetal-goal.ts`); met `homeExcluded === true`/`false` staat er bovendien de kwalificatie "— zonder je huis" resp. "— met je huis" achter de regel (zelfde grondslag-taal als de /toekomst-KPI, UR2-17), onbekend (`null`) toont geen kwalificatie. (e) Een live-getrackt stand-doel met `paceSkipped: true` toont GEEN stoplichtoordeel: de kaart leest dat rechtstreeks van de motor (niet zelf afgeleid uit het doeltype) en toont de neutrale, kleurloze duiding "Loopt mee" — nooit "Op koers" — terwijl `requiredMonthly` (indien van toepassing) wél gewoon zichtbaar blijft als eerlijk cijfer.',
    assertion: {
      kind: 'consistency',
      source:
        'lib/goal-data.ts#computeGoalProgress — de pace-toets (a/b) is volledig `exact` vergrendeld in lib/goal-data.test.ts (niet hier herhaald: `computeGoalProgress` heeft geen injecteerbare klok, dus een UAT-cijfer op basis van relatieve dagen zou ofwel de testklok namaken ofwel drijven met de daadwerkelijke kalenderdatum — de vitest-suite is al de canonieke, deterministische toets). `paceSkipped` (e) wordt gezet door `isLiveTrackedStandGoal` in dezelfde functie en gelezen in components/future/doelen-view.tsx (regel "Loopt mee", `progress.paceSkipped` vóór `progress.onTrack`). (c) components/future/doelen-view.tsx#ManualGoalCard (requiredMonthly-regel, EUR-only gate). (d) components/future/doelen-view.tsx#isVrijheidsgetalGoal + live-prop vanuit app/(app)/toekomst/doelen/page.tsx#vrijheidsgetalLive (FinPageData, lib/goals/vrijheidsgetal-goal.ts) + `homeExcluded`-kwalificatie in hetzelfde kaartcomponent.',
    },
  },
  {
    workflow: 'WF-TOEK-36',
    scenarioId: 'UAT-TOEK-36',
    titel: 'Woonstrategie bepaalt de grondslag van de primaire vermogenslijn (ADR 0114 D1)',
    kriticiteit: 'KERN',
    persona: 'willem',
    given:
      'Persona Willem geladen (eigen woning "Woning Wassenaar", €650.000). De woonstrategie is instelbaar op /toekomst → Huis-strategie (zie WF-TOEK-21): Meerekenen (`include_full`), Uitsluiten (`exclude_from_fire`), Verkopen (`downsize`) of Opeethypotheek (`reverse_mortgage`). Vóór ADR 0114 (29-08-2026) stond de primaire, massieve, fasegekleurde lijn in ALLE VIER de modi op het totale netto vermogen (Prognose!I), terwijl de voortgangsbalk en het vrijheids-% eronder bij Uitsluiten al sinds ADR 0034 op het besteedbare vermogen (Prognose!J, zonder woning) stonden — twee grootheden op één scherm.',
    when:
      'De gebruiker wisselt de huis-strategie en leest telkens de vermogensgrafiek in "Pad"-modus samen met de voortgangsbalk + het vrijheids-% direct eronder.',
    then:
      'Bij UITSLUITEN mét eigen woning draagt de hoofdlijn de grondslag van de balk eronder: het besteedbare vermogen ZONDER je huis (Prognose!J). De totaallijn (mét huis) is daar de dunne gestippelde TWEEDE lijn. Bij VERKOPEN, OPEETHYPOTHEEK en MEEREKENEN blijft de hoofdlijn het TOTALE netto vermogen (Prognose!I) — ongewijzigd gedrag; de tweede lijn is daar juist de besteedbare lijn (en bij Meerekenen bestaat ze niet, want J ≡ I exact). Zonder eigen woning valt er niets te splitsen en blijft het bij één totaallijn, óók onder Uitsluiten. De EXACT-provable kern is de GRONDSLAG-CONSISTENTIE, want die is het punt van dit besluit: `primaryChartBasis` (grafiek) en `selectFreedomProgressBasis` (balk + %) worden door HETZELFDE predikaat gestuurd (`isHomeExcludedFromFire` ∧ `hasEigenHuis`), zodat de lijn "liquid" is precies dán wanneer de balk op de J-noemer staat — in geen enkele modus kan de één wisselen zonder de ander. D6: zodra een VREEMDE of GEFORCEERDE hoofdlijn actief is (partner-, huishoud- of AOW-stop-pad) valt de grafiek terug op `\'total\'`, ongeacht de woonstrategie — die runs leveren geen J-reeks (`effectiveChartPrimaryBasis` in horizon-client.tsx); dat deel is UI-gating, geen pure functie. De lijn-, band- en drempel-doorwerking op het scherm staat in WF-TOEK-37.',
    assertion: {
      kind: 'exact',
      expected:
        'include_full: lijn=total balk=I; exclude_from_fire: lijn=liquid balk=J; downsize: lijn=total balk=I; reverse_mortgage: lijn=total balk=I; zonderWoning/exclude_from_fire: lijn=total balk=I; gelijkeGrondslag=true',
      source:
        'lib/horizon/liquid-wealth-line.ts#primaryChartBasis (grafiek, ADR 0114 D1) naast lib/core-metrics.ts#selectFreedomProgressBasis + lib/housing-strategy.ts#isHomeExcludedFromFire (voortgangsbalk/vrijheids-%, ADR 0034) — beide échte productiefuncties, op de vier `HousingStrategyMode`-waarden met en zonder eigen woning.',
    },
  },
  {
    workflow: 'WF-TOEK-37',
    scenarioId: 'UAT-TOEK-37',
    titel: 'Alles wat met de primaire lijn meebeweegt draagt dezelfde grondslag (stip, band, drempels, pill, bon)',
    kriticiteit: 'KERN',
    persona: 'willem',
    given:
      'Persona Willem geladen, huis-strategie op "Uitsluiten" (`exclude_from_fire`) — de enige modus waarin de primaire lijn op Prognose!J staat (zie WF-TOEK-36).',
    when:
      'De gebruiker leest de grafiek in "Pad"-modus, zet de Marktcheck aan, beweegt de crosshair over een projectiejaar, opent de jaar-kassabon en schakelt de pill naast de Doel-pill.',
    then:
      'GRONDSLAG-CONSISTENTIE op het scherm: de getekende lijn, de FIRE-drempellijn waar hij naartoe loopt, de Monte-Carlo-band eromheen en het vrijheids-% eronder dragen alle vier dezelfde grootheid (D1/D7). Concreet: (a) de FIRE-stip LANDT op de FIRE-doellijn i.p.v. de volle overwaarde erboven — op de FIRE-maand geldt J == `requiredFirePortfolio` (ADR 0034-endpoint-invariant, vergrendeld in lib/horizon-kernel/fire-basis-invariant.test.ts) en de stip interpoleert nu over de J-punten; (b) de marktcheck-band komt uit de J-variant `bandLiquide` — een I-band om een J-lijn wordt NIET getekend (D7: liever geen band dan een gemengde); (c) elke FIRE-drempel wordt alleen getoond zolang de lijn met háár grondslag op het scherm staat; ook fase-splits, AOW-stip en gebeurtenis-markers verhuizen mee naar de J-lijn (D2). (d) De PILL naast de Doel-pill schakelt altijd de TWEEDE lijn en benoemt die: "Met je huis" bij Uitsluiten, "Zonder je huis" bij Verkopen/Opeethypotheek; bij Meerekenen bestaat hij niet. Hij staat in ÁLLE strategieën standaard UIT (D5) en bewaart zijn stand onder een eigen voorkeur-sleutel, zodat een oude "besteedbaar-lijn uit"-keuze niet stil de totaallijn uitzet. (e) De jaar-kassabon blijft BEWUST de volledige jaarbalans op de I-grondslag (D3: een bon is een balans, geen lens — het huis staat erop omdat je het bezit) met bij Uitsluiten één neutrale "waarvan besteedbaar"-regel op twee plekken: onder het hoofdcijfer én onder "Eind netto". Die regel doet NIET mee in de waterval en de bon blijft sluiten op `row.netWorth`. (f) De crosshair-tooltip zet "Zonder je huis" als primair bedrag met "Met je huis" gedimd eronder; de zes drijvers/drukkers blijven staan onder de grondslagkop "Wat er dit jaar gebeurde (mét je huis)" (D4 — `SimRow.growth` bevat daar de woningwaardestijging; gelabeld verschil, geen fout). Toetsvorm consistentie: alle cijfers zijn kernel-uitkomsten (oracle via /beheer/horizon-kernel); wat hier getoetst wordt is dat ze op één grootheid staan.',
    assertion: {
      kind: 'consistency',
      source:
        'consistentie-eis: lijn ∧ FIRE-drempel ∧ band ∧ vrijheids-% dragen dezelfde grootheid. Bron van de keuze: lib/horizon/liquid-wealth-line.ts#primaryChartBasis → `SimChartGeometryInput.primaryBasis` (lib/horizon/sim-chart-geometry.ts, default \'total\') → components/app/horizon/horizon-client.tsx#effectiveChartPrimaryBasis (D6-terugval bij partner-/huishoud-/AOW-stop-lijn) + bandLiquide; pill/tooltip in components/app/horizon/sim-chart.tsx; "waarvan besteedbaar"-regel in components/app/horizon/horizon-year-details-sheet.tsx (consume-only `row.nettoLiquide`, geen parallelle som). FIRE-stip-op-drempel = ADR 0034-invariant, vergrendeld in lib/horizon-kernel/fire-basis-invariant.test.ts.',
    },
  },
  {
    workflow: 'WF-TOEK-38',
    scenarioId: 'UAT-TOEK-38',
    titel: 'Risico-levensgebeurtenissen: werkloosheid en overlijden partner (jaargelaagde WW/Anw-parameters, na-FIRE-gedrag)',
    kriticiteit: 'KERN',
    persona: 'willem',
    given:
      'Twee risico-events uit de catalogus, 2026-jaarlaag (SOCIALE_ZEKERHEID_PARAMS[2026]): "Werkloosheid" (bruto maandsalaris €4.000, netto €3.000, WW-duur 12 mnd, verwachte zoektijd 18 mnd → totale duur = max(12,18) = 18 mnd) en "Overlijden partner" (netto partnerinkomen €2.500, Anw "met kinderen", geen eigen anwBedrag ingevuld, maandlasten huishouden €3.000, kostendaling 30%). VOORHEEN (vóór ADR/kaart 3, 29-08-2026) stonden de WW-/Anw-bedragen tweemaal hardgecodeerd in horizon-client.tsx — één keer in de rekenregel (kaal 70% WW, geen 75%-trap) en één keer in de tooltip-preview (mét de trap) — met de bedragen bovendien twee indexatierondes verouderd (max dagloon €274 = 1-1-2024-niveau).',
    when:
      'De gebruiker vult de velden in en leest de kasstroom-impact; als randgeval zet hij het Anw-bedrag expliciet op €0 en plaatst hij het werkloosheid-event op/ná de geprojecteerde vrijheidsleeftijd.',
    then:
      'WW-uitkering: dagloon = min(4.000×12/261, maxDagloon(2026)=€309,91) = €183,9080…/dag (ongeklemd, want < maxDagloon); maand-1e-periode (75%, 2 mnd) = round(183,908×21,75×0,75) = €3.000; maand-daarna (70%) = round(183,908×21,75×0,70) = €2.800; totaal over de 12-mnd WW-duur = 2×3.000+10×2.800 = €34.000; gemiddeld over het gekozen 18-mnd-venster (maanden 13-18 tellen als €0, want `overDuurMaanden`=totale duur ≠ WW-duur) = round(34.000/18) = €1.889/mnd; inkomensgat = max(0, 3.000−1.889) = €1.111/mnd; totaal inkomensverlies = round(1.111×18) = €19.998. Overlijden partner: Anw bruto (geen override) = anwNabestaandenBruto(2026) = €1.676,53; Anw netto (benadering 75%) = round(1.676,53×0,75) = €1.257; kostendaling = round(3.000×0,30) = €900; netto maandimpact = −2.500+0+1.257+900 = −€343/mnd (tekort, want geen nabestaandenpensioen ingevuld). EXPLICIETE-0-REGEL: zet de gebruiker het Anw-bedrag zelf op 0 (bv. bij "Beperkt recht"), dan blijft dat 0 — géén stille terugval naar de default-€1.676,53 (`num()`-helper: `??`-semantiek, nooit `||`). NA-FIRE-WAARSCHUWING (D3): een werkloosheid-event op of ná de vrijheidsleeftijd toont de tekst "Je vrijheidsleeftijd ligt op … jaar. Vanaf dat moment is er geen salaris meer dat kan wegvallen…" (advies, geen blokkade); overlijden-partner toont die waarschuwing NOOIT, want dat verlies loopt permanent door na FIRE.',
    assertion: {
      kind: 'exact',
      expected:
        'wwMaand1=3000; wwMaandDaarna=2800; wwTotaalOverWwDuur=34000; wwGemiddeldPerMaand=1889; inkomensgat=1111; totaalVerlies=19998; anwBruto=1676.53; anwNetto=1257; kostendaling=900; overlijdenNettoImpact=-343; anwExpliciete0Blijft0=true; wwWaarschuwingBijFire=aanwezig; overlijdenWaarschuwing=nooit',
      source:
        'lib/horizon/risico-event-regels.ts#berekenWerkloosheidImpact/berekenOverlijdenPartnerImpact/werkloosheidNaFireWaarschuwing/RISICO_EVENT_NA_FIRE (échte productiefuncties) op lib/sociale-zekerheid.ts#SOCIALE_ZEKERHEID_PARAMS[2026] — zie toek-checks.ts',
    },
  },
  {
    workflow: 'WF-TOEK-39',
    scenarioId: 'UAT-TOEK-39',
    titel: 'Doel koppelen aan meerdere bezittingen én schulden tegelijk (netto-voortgang, migratie 20260901140000)',
    kriticiteit: 'KERN',
    persona: 'willem',
    given:
      'Een geld-doel (savings/net_worth/invested_assets/debt_payoff/custom — de types met `allowsMixedLinks: true`) in GoalForm, sectie "Koppelen (optioneel)" (twee aanvinkbare groepen: Bezittingen/Schulden, tabel `goal_links`, vervangt de twee wederzijds-exclusieve dropdowns van vóór 1 sep 2026). Doelbedrag €20.000. Drie scenario\'s: (a) alleen bezittingen aangevinkt (€8.000 + €5.000), (b) alleen schulden aangevinkt (restsaldo €12.000 — afbouwdoel), (c) gemengd: dezelfde twee bezittingen ÉN een schuld van €3.000.',
    when: 'De gebruiker vinkt de koppelingen aan; het formulier toont de live "huidige waarde" (read-only zodra ≥1 koppeling actief is) en de server slaat ze op via `PATCH/POST /api/goals` (`links`-diff, `goal_links`).',
    then:
      '(a) Alleen bezittingen: huidige waarde = Σ waarden = 8.000+5.000 = €13.000 — identiek aan het legacy asset-pad. (b) Alleen schulden: huidige waarde = max(0, doel − Σ saldi) = max(0, 20.000−12.000) = €8.000 — de voortgang is het AFGELOSTE bedrag, niet het restsaldo (identiek aan het legacy debt-pad). (c) GEMENGD (nieuw): huidige waarde = Σ bezittingen − Σ schulden = 13.000−3.000 = €10.000, NIET geklemd op 0 — bij een schuld die groter is dan de bezittingen mag de uitkomst negatief zijn (een eerlijk beeld, geen stille clamp naar €0). Dezelfde formule voedt zowel de FORMULIER-PREFILL (bij het aanvinken) als de RUNTIME-sync op elke pageload (`autolinkGoalCurrentValues`/`syncActiveGoalValues`) — één rekenweg, geen tweede die kan wegdrijven. Alleen-schulden op een AFBOUWDOEL zonder het type-`allowsMixedLinks` (bv. een doel dat geen geld-type is) toont geen koppel-sectie (`showLinkSection` = false).',
    assertion: {
      kind: 'exact',
      expected: 'alleenBezittingen=13000; alleenSchulden=8000; gemengd=10000',
      source: 'lib/goal-current-value.ts#computeLinkedCurrentValue (échte productiefunctie — dezelfde aanroep als components/app/goal-form.tsx voor de prefill en lib/goal-current-value.ts#autolinkGoalCurrentValues voor de runtime-sync).',
    },
  },
  {
    workflow: 'WF-TOEK-40',
    scenarioId: 'UAT-TOEK-40',
    titel: 'Doel op een kengetal zetten: live meesyncen, richting-bewust afsluiten en éénmalig vieren (doelbasis, ADR 0125)',
    kriticiteit: 'KERN',
    persona: 'willem',
    given:
      'Bij een NIEUW doel de vraag "Waar meet je dit doel aan af?": `manual` (zelf bijhouden, default) of één van de acht `metricBasis`-types (spaarquote, netto vermogen, vrijheidsleeftijd, passief inkomen, noodfonds in maanden, eindsaldo, schuldenvrij-datum, belastingdruk) — bij die keuze schrijft `POST /api/goals` `metadata.sync = \'auto\'` (server-bepaald; nooit door de client). Drie omlaag-doelen (`direction: \'down\'`) zijn hierin het scherpst: `fire_age` (huidige vrijheidsleeftijd 46 tegen doelwaarde 55 — eerder is beter), `tax_burden` (huidige belastingdruk 35% tegen doelwaarde 30% — lager is beter) en `debt_free_date`.',
    when:
      'De canonieke motor (horizon-kernel resp. `buildTaxOverview`) levert een nieuwe stand; de gebruiker bezoekt /overzicht (server-reconciliatie) en daarna /toekomst/doelen.',
    then:
      '(a) RICHTING-BEWUST BEHAALD (kern van ADR 0125): een kale `current >= target` zou bij `fire_age` 46 tegen doel 55 NOOIT "behaald" opleveren (46>=55 is onwaar, terwijl het doel ruim gehaald is) en bij `tax_burden` 35% tegen doel 30% juist METEEN "behaald" opleveren (35>=30 is waar, terwijl het doel mislukt is) — twee tegengestelde fouten tegelijk. `isGoalReached` corrigeert dit met de type-richting: bij `direction: \'down\'` geldt bereikt ⇔ current <= target. (b) ALLEEN MACHINE-BIJGEHOUDEN DOELEN SLUITEN ZICHZELF: `isMachineTrackedGoal` (auto-sync óf ≥1 koppeling óf de legacy asset/debt-kolommen) bepaalt of de server mag afsluiten; een lab-parameterdoel (`metadata.bron===\'parameter\'`) en een handmatig doel vallen er expliciet buiten — die sluit de gebruiker nog altijd zelf af in de bewerk-sheet. (c) Bij een bereikt machine-doel markeert `reconcileAutoCompletedGoals` het bij het EERSTVOLGENDE /overzicht-bezoek als `is_completed` met `completed_at` (één UPDATE, race-veilig via `.eq(\'is_completed\', false)` — een parallelle render wint hoogstens één keer), en de doelenpagina biedt het daarna tot 14 dagen (`AUTO_COMPLETED_NOTICE_WINDOW_DAYS`) als ongeziene viering aan (once-guard per doel-id, net als de handmatige viering uit WF-TOEK-23) voordat het naar het Bereikt-archief verhuist. (d) CHECK-IN SLAAT HET OVER: `isLiveGoal` (koppeling, auto-sync of legacy-koppeling) laat de maandelijkse check-in-stap dit doel met rust — er wordt niet om een handmatige update gevraagd voor een cijfer dat de app zelf al bijhoudt. Voortgang/pace-toets zelf blijven ongewijzigd bij WF-TOEK-35.',
    assertion: {
      kind: 'exact',
      expected:
        'fireAgeReached_46_v_55=true; taxBurdenReached_35_v_30=false; fireAgeKaleVergelijkingZou=false; taxBurdenKaleVergelijkingZou=true; autoSyncMachineTracked=true; parameterGoalMachineTracked=false; manualGoalMachineTracked=false; reachedAutoGoalSelected=true',
      source:
        'lib/goal-data.ts#isGoalReached (richting-bewuste toets) + lib/goals/auto-complete.ts#isMachineTrackedGoal/selectReachedAutoGoals (échte productiefuncties, geen kernel-run nodig — pure selectie op een reeds-gesynchroniseerde doel-rij). Viering-venster = AUTO_COMPLETED_NOTICE_WINDOW_DAYS (lib/goals/auto-complete.ts). Check-in-skip = app/(app)/core/checkin/page.tsx#isLiveGoal (spiegelt bewust lokaal, zelfde drie bronnen).',
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
  28, 29, 30, 32, 33, 34, 35, 36, 37, 38, 39, 40,
]
