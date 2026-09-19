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
      source: 'richtingstoets: 8%-lijn ≥ 6%-basislijn ≥ 4%-lijn per jaar (kernel-scenariolijnen). Marge: lib/horizon-kernel/rendement-marge.ts#computeRendementMarge — monotoon in de stopleeftijd en in de uitgaven, gepind in lib/horizon-kernel/marktcheck.test.ts + rendement-marge.test.ts. Per-pot risicofactor: lib/horizon-kernel/wrappers/risico.ts#potRisicoFactor (ADR 0117) — geen apart engine-check hier (geen exact-criterium). VERVALLEN (14 sep 2026, ADR 0144): WF-REKEN-18/13/14 (dezelfde risicofactor op de standalone Wat-Als-pagina) bestaan niet meer — dit is sindsdien de enige plek waar de per-pot-risicofactor nog getoetst wordt.',
    },
  },
  {
    workflow: 'WF-TOEK-10',
    scenarioId: 'UAT-TOEK-10',
    titel: 'Wat-als-sliders inline op de tijdas',
    kriticiteit: 'KERN',
    persona: 'willem',
    given: 'Persona Willem geladen (maandinkomen €6.500).',
    when: 'De gebruiker verschuift de "Spaarquote"-slider omhoog (meer besparen) en daarna terug naar baseline.',
    then: 'DRAAIKNOPPEN (eigenaarskeuze 15-09-2026, bijstelling van spec lab-haalbaarheid §2): drie knoppen in vaste volgorde, alle zichtbaar — 1 "Meer salaris" (het extra-inleg-event), 2 "Spaarquote" (hele procenten, met eronder het bedrag minder uitgeven t.o.v. nu via `spaarquoteEuroRegel`/`savingsEuroForPp`, geen regel op de basis), 3 "Minder werken" (werkdagen per week). Onder de motorkap blijft de spaarquote-knop in procentpunten schuiven (event-shape en `savings_rate`-doel ongewijzigd, `scenario_origin: \'slider:savings\'`). Een hogere stand (meer besparen) maakt de vrijheidsleeftijd-KPI gelijk-of-lager, nooit hoger (directe herberekening, geen opslaan-knop). Terug naar baseline ruimt het tijdelijke slider-scenario-event op (clearScenarioEvents) en herstelt de exacte baseline-lijn. Richtingstoets; sliders zijn bewust niet-persistent. Regressie (bug1): de baseline-inkomen/uitgaven-resolutie in horizon-client.tsx gebruikt sinds deze release `resolveEffectiveIncomeExpenses` (lib/effective-financials.ts) i.p.v. een eigen inline fallback — een expliciete handmatige bron (`income_source`/`expenses_source` === "manual") wint nu altijd van een mogelijk-onvolledige lopende-maand-transactiesom, identiek aan de SSR-loader. DOEL-LIJN TOT DE GEKOZEN STOPLEEFTIJD (ADR 0085): schuift de gebruiker op de Vrijheidsas de stopleeftijd (bv. naar 63) terwijl de "Spaarquote"-slider ook gedraaid staat, dan loopt de gestippelde "Jouw doel"-lijn door tot een stip op de gekozen stopleeftijd (opbouw t/m stop, onttrekking daarna) i.p.v. te stoppen op de gesolvede FIRE-leeftijd; de legenda krijgt het suffix "(stop 63)". Verschuift de gebruiker ALLEEN de stopleeftijd (sliders op basis, geen ander wat-als), dan verschijnt de stippellijn alsnog — label "Jouw stopkeuze" i.p.v. "Jouw doel", zonder het delta-label op de pill. Ligt de gekozen stopleeftijd binnen 0,5 jaar van de verwachte FIRE-leeftijd, dan blijft de stippellijn weg (zou de hoofdlijn vrijwel overlappen). Richtingstoets/UI-consistentie: het stip-eindpunt van de stippellijn valt samen met de gekozen stopleeftijd op de Vrijheidsas, niet met de eerder getoonde gesolvede FIRE-leeftijd.',
    assertion: {
      kind: 'direction',
      source: 'richtingstoets: hogere "Spaarquote"-stand (procenten, euro-regel via savingsEuroForPp eronder) → vrijheidsleeftijd gelijk-of-lager (kernel-herberekening); doel-lijn-stip == gekozen stopleeftijd (lib/horizon/doel-lijn-bron.ts#selectDoelLijnBron), niet de gesolvede FIRE-leeftijd.',
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
    then: 'De "Hypotheek afgelost"-mijlpaal valt op het jaar waarin de hypotheeksaldo-rij in de kernel-projectie voor het eerst €0 bereikt — vóór dat jaar staat de marker niet (richtingstoets). Clusters (bv. rond leeftijd 48-50) tonen een "+N"-marker met EventClusterSheet. Het exacte mijlpaaljaar is een kernel-uitkomst. AANGESCHERPT (17 sep 2026, `deriveDebtMilestones`): de aggregaat-mijlpaal "Schuldenvrij" verschijnt alleen wanneer ÉLKE actieve schuld een eigen aflossingsleeftijd heeft (evenveel payoff-mijlpalen als actieve schulden) ÉN de laatste projectierij geen enkel schuldsaldo meer draagt dat materieel is (`Math.abs(endBalance) < 0,5`) — ook niet op de SYNTHETISCHE kernel-sleutels `opeethypotheek`/`tekort-lening`, die geen eigen `Debt`-rij hebben en dus nooit in de payoff-telling meetellen. Een groeiende opeetschuld of een blijvende tekort-lening naast een afgeloste hypotheek onderdrukt "Schuldenvrij" dus, ook al zijn alle échte schulden afgelost.',
    assertion: {
      kind: 'direction',
      source: 'richtingstoets: mijlpaal-marker verschijnt op/na het kernel-jaar waarin hypotheeksaldo €0 bereikt, niet ervoor. "Schuldenvrij"-gate: lib/natural-milestones.ts#deriveDebtMilestones (payoffMilestones.length === activeDebts.length ∧ eindigtZonderSchuld over ALLE debtBalances-sleutels, dus ook opeethypotheek/tekort-lening) — geen los cijfer, alleen de aan/afwezigheid van de mijlpaal.',
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
    then: 'De redirects/param-mappings landen op de juiste subroute met de juiste modal/editor open; onbekende tab-waarden worden genegeerd (gewone landing). DISCREPANTIE/bevinding (uat2-toek.md 30b): /toekomst?strategie=open vervangt de adresbalk naar /horizon (searchParams-effect doet altijd router.replace(\'/horizon\'), horizon-client.tsx ~r494) — verrassend maar volgens code bedoeld, geen crash (het is een dubbele hop: /horizon redirect vervolgens weer terug naar /toekomst). SINDS 11 AUG 2026 (React #310-opruiming, tweede lichting) zijn /horizon/strategie, /horizon/uitgaven-na-pensioen en /toekomst/uitgaven-na-pensioen zelf GEEN React-pagina\'s meer maar pure next.config.ts-redirects (zie WF-NAV-16) naar resp. /toekomst?strategie=open en /toekomst?uitgaven=open — die landen dus op precies dezelfde twee query-param-routes als hierboven, alleen bereikt via een oudere URL. /toekomst/strategie is EVENMIN meer een pagina: die redirect naar /toekomst/voorkeuren?strategie=aow|pensioen|huis (via `?focus=`, default `aow`) — SINDS 17 SEP 2026 verhuisd van /toekomst/gebeurtenissen (de vier levensstrategieën wonen nu op Voorkeuren, besluit eigenaar: verhuizen, geen dubbeling) — een ANDERE bestemming dan `/toekomst?strategie=open` (dat opent de strategie-modal op de tijdas zelf; de voorkeuren-deeplink opent een levensstrategie-kaart). Pure navigatie/routing.',
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
      '(a) Bij identieke `created_at`/`target_date` en identieke inleg maakt een hoger `target_value` het oordeel `onTrack: false` waar het lagere doel `true` blijft — de kern van M32, vergrendeld in lib/goal-data.test.ts ("target_value beïnvloedt de uitkomst bij IDENTIEKE created_at/target_date"). (b) Een doel `current_value: 0` binnen de genadeperiode krijgt `measured: false` (kaart toont "Net begonnen", neutrale kleur, GEEN stoplichtoordeel) terwijl `requiredMonthly` al wél bekend is; ná de genadeperiode ZONDER inleg wordt uitblijven een signaal (`measured: true; onTrack: false`) — vergrendeld in hetzelfde bestand ("genadeperiode voor een vers doel (M31)"). (c) Op de kaart verschijnt bij een EUR-doel onder de 100% het bedrag "€X per maand nodig" (`requiredMonthly`, alleen bij `unit === \'EUR\'` — een spaarquote-doel toont geen "tempo van een tempo"). (d) Het vrijheidsgetal-standaarddoel (`isVrijheidsgetalGoal`) toont bij `vrijheidsgetalLive` de regel "Volgt automatisch je vrijheidsgetal" i.p.v. een handmatig bij te werken cijfer — de kaart negeert dan bewust een eigen `current_value`-invoer ten faveure van de canonieke FIRE-eta (`etaOverride` via `lib/goals/vrijheidsgetal-goal.ts`); met `homeExcluded === true`/`false` staat er bovendien de kwalificatie "— zonder je huis" resp. "— met je huis" achter de regel (zelfde grondslag-taal als de /toekomst-KPI, UR2-17), onbekend (`null`) toont geen kwalificatie. (e) Een live-getrackt stand-doel met `paceSkipped: true` toont GEEN stoplichtoordeel: de kaart leest dat rechtstreeks van de motor (niet zelf afgeleid uit het doeltype) en toont de neutrale, kleurloze duiding "Loopt mee" — nooit "Op koers" — terwijl `requiredMonthly` (indien van toepassing) wél gewoon zichtbaar blijft als eerlijk cijfer. (f) `paceSkipped` dekt sinds R5 DRIE gevallen, niet alleen het live-getrackte stand-doel: ook een doel ZONDER streefdatum en een doel zonder bruikbare `created_at` krijgen geen tempo-oordeel. Dat geldt voor élk oppervlak dat een OORDEEL toont, niet alleen het tekstlabel: de voortgangsbalk kleurt dan neutraal (`--ink-4`) in plaats van groen, en de /toekomst-navkaart telt een dergelijk doel niet mee in "N op koers" (bij nul beoordeelde doelen staat de kaart op neutraal met "Nog niets te meten", niet groen op "Allemaal op koers"). Filters en sorteringen op `!onTrack` blijven het doel bewust negeren: een ongemeten doel is geen probleem.',
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
  {
    workflow: 'WF-TOEK-41',
    scenarioId: 'UAT-TOEK-41',
    titel: 'Pillenrij-invariant: label en badge reizen samen, en de 640-767px-band houdt de 2×2-cijferstrip',
    kriticiteit: 'BELANGRIJK',
    persona: 'tessa',
    given:
      'De pillenrij boven de tijdas-grafiek op /toekomst (`components/app/pill-row.tsx`) meet zichzelf en schakelt bij ruimtegebrek naar `data-compact` en daarna `data-tight`. Elke pil draagt haar naam als `data-pill-label` en haar getal als `data-pill-badge`. VOORHEEN hing de uitzondering aan een `className=\'inline\'` op het label van de Marktcheck-pil; die klasse weegt (0,1,0) en verloor altijd van de compact-regel `[data-pill-row][data-compact=\'true\'] [data-pill-label]` (0,3,0). Op 696 px (Surface Duo staand) stond er dus een naamloos flesje met een los cijfer, dat naast de succeskans als kans gelezen werd (melding B-025). Op datzelfde scherm schakelde de hero-cijferstrip al vanaf `sm` (640 px) naar 4 kolommen — ~150 px per tegel voor een kicker, een icoon en een 32 px Playfair-getal.',
    when:
      'De tester versmalt /toekomst door de 640-767px-band (bv. 696 px) en verder tot de rij compact en daarna tight wordt, met de Marktcheck aan (marge zichtbaar) en een wat-als-scenario actief (delta-badge op de scenario-pil), en leest daarna de gebeurtenissen-tijdlijn met een kernel-afgeleide marker (woningverkoop).',
    then:
      'HARDE INVARIANT: er staat nooit een kaal getal zonder naam. Valt een `data-pill-label` weg, dan valt de `data-pill-badge` van diezelfde pil mee — in de compacte stand én onder `sm`, waar de pil zijn label zelf inlevert (`hidden sm:inline`). Blijft het getal staan, dan blijft de naam staan. De uitzondering draagt de PIL, niet de callsite: `data-pill-keep` op de pil-knop, en alleen zolang de badge daadwerkelijk rendert — een pil zónder getal doet gewoon mee met de compacte stand. De regel staat in `app/globals.css` met winnende specificiteit (0,4,0 resp. 0,3,0), niet als class per callsite. In de `data-tight`-stand levert óók een keep-pil álles in — label én badge, nooit één van de twee: liever een badge kwijt dan pillen voorbij de schermrand, en de betekenis blijft via `title`/`aria-label`. Concreet dragen de Marktcheck-pil (marge) en de scenario-lijn-pil (FIRE-delta) `data-pill-keep`. HERO-CIJFERSTRIP: het breekpunt tussen de 2×2-variant en de 3/4-koloms strip is `md` (768 px), niet `sm` — de band 640-767 px houdt dus 2×2, en het mobiele hoofdcijfer erboven volgt hetzelfde breekpunt (`md:hidden`). TIJDLIJN-LEEFTIJD: kernel-afgeleide events dragen een fractionele `target_age` (de kernel verkoopt een woning in een maand, niet op een verjaardag); de tijdlijn rondt die af op hele jaren, zodat er "73j" staat en niet "73.16666666666666j". Alleen die weergavelijst rondt af — `displayEvents` (EventPane, chart-markers, simulatie-invoer) houdt de exacte kernelwaarde, want daar zou afronden een rekenwaarde verschuiven.',
    assertion: {
      kind: 'ui-only',
      source:
        'components/app/pill-row.tsx (meting + `data-compact`/`data-tight`) + app/globals.css (de vier CSS-regels die label en badge koppelen, incl. de `max-width: 639.98px`-regel en de `data-pill-keep`-uitzondering) + components/app/horizon/horizon-client.tsx (`data-pill-keep` op de Marktcheck- en scenario-pil, het `md`-breekpunt van beide cijferstrips, en `eventsForTimeline` met `Math.round` op een fractionele `target_age`) — responsief weergavegedrag zonder cijfermatige uitkomst; de CSS-specificiteit zelf is niet in een pure module na te rekenen. Bewaakt in `components/app/pill-row.test.tsx`.',
    },
  },
  {
    workflow: 'WF-TOEK-42',
    scenarioId: 'UAT-TOEK-42',
    titel: 'Eenvoudige weergave verkleint de vorm, niet het aantal keuzes: vier levensstrategieën in béíde modi',
    kriticiteit: 'BELANGRIJK',
    persona: 'willem',
    given:
      'Het blok "levensstrategieën" stond tot 17 sep 2026 op /toekomst/gebeurtenissen; sinds die verhuizing (besluit eigenaar: verhuizen, geen dubbeling) staat het op /toekomst/voorkeuren, tussen "Regels op de hele tijdas" en "Algemene parameters" (`components/future/levensstrategieen-section.tsx`, gerenderd door `voorkeuren-view.tsx`). Het toont vier multi-step strategieën: AOW, pensioen, huis en werk. VOORHEEN (vóór B-024, op de oude locatie) filterde Eenvoudig drie ervan weg en liet alleen Pensioen staan — dat nam de gebruiker drie keuzes af die hij nergens anders in de app terugvindt.',
    when:
      'De gebruiker bekijkt het blok in Volledig én in Eenvoudig (weergavemodus via ⌘K of /mijn), en volgt daarna de deeplinks /toekomst/voorkeuren?strategie=aow|pensioen|huis|werk.',
    then:
      'In BÉIDE modi staan alle VIER de strategie-kaarten (icoontegels op horizon-tokens, geen losse Tailwind-hues), met dezelfde kop en dezelfde vier beschrijvingen (AOW/Pensioen/Huis/Werk). Eenvoudig reduceert alleen de VORM: een compacter raster (2 kolommen vanaf de smalste viewport, 4 op `lg`) met strakkere padding, kleiner icoon en kleinere beschrijvingstekst, zodat de vier kaarten samen ongeveer de hoogte van één Volledig-kaart innemen — bewust géén `<HideInSimple>` (twee deeplinks vanaf /overzicht/belasting/box1 wijzen hierheen met `?strategie=pensioen` en zouden anders na sluiten geen zichtbare ingang meer hebben in Eenvoudig). Volledig houdt 1 → 2 (`sm`) → 4 (`lg`) kolommen. Alle vier de deeplinks openen in beide modi hun kaart via `?strategie=`; `?strategie=pensioen` opent bovendien meteen de jaarruimte/factor-A-uitvraag (S6). De oude deeplink /toekomst/gebeurtenissen?strategie=<key> redirect server-side naar /toekomst/voorkeuren met behoud van de overige params (`lib/horizon/strategie-route.ts#resolveStrategieRedirect`); een klik op een strategie-beheerd event of een huis/pensioen-kernelmoment op Gebeurtenissen navigeert via `strategieHref(key)` naar Voorkeuren. Er is geen strategie meer die alleen in Volledig bereikbaar is. Onderliggend principe (eigenaarsbesluit B-024): Eenvoudig maakt de pagina kleiner, niet armer — keuzes verbergen leest als een halve pagina.',
    assertion: {
      kind: 'ui-only',
      source:
        'components/future/levensstrategieen-section.tsx (`LEVENSSTRATEGIEEN` wordt in beide modi volledig gerenderd; `simple`-prop stuurt alleen raster-, padding- en typografieklassen) + components/future/voorkeuren-view.tsx (`?strategie=`-deeplink, sluiten ruimt de param op, S6 auto-open jaarruimte) + lib/horizon/strategie-route.ts (`resolveStrategieRedirect`/`strategieHref`/`isStrategieKey`) — weergavemodus-gedrag zonder cijfermatige uitkomst. Bewaakt in `components/future/voorkeuren-view.test.tsx`.',
    },
  },
  {
    workflow: 'WF-TOEK-43',
    scenarioId: 'UAT-TOEK-43',
    titel: 'Doel loslaten houdt de weg terug open: de doelsectie blijft staan en "Maak dit mijn doel" keert terug (melding B-031)',
    kriticiteit: 'BELANGRIJK',
    persona: 'willem',
    given:
      'Persona Willem op /toekomst in **Eenvoudige weergave**, met een vastgelegd doel. KATERN II ("Verken je aannames" / "Jouw doelsituatie") hangt in Eenvoudig aan `doelActief`. VOORHEEN zette "Doel loslaten" onder de grafiek `doelBlok` op `null`, waarmee de héle sectie op datzelfde moment verdween — inclusief de enige knop om opnieuw een doel vast te leggen. De toast beloofde "Je verkent weer vrij" terwijl er niets meer te verkennen viel; de gebruiker kwam er binnen de sessie niet meer uit. Tweede tak: een doel dat alléén een stopkeuze was (geen sliders) — daar hing de knop aan `hasScenario`, dus die was ook ná de fix nog onherstelbaar.',
    when:
      'De gebruiker klikt "Doel loslaten" en bevestigt; hij blijft op de pagina, bekijkt de doelsectie, en legt daarna opnieuw een doel vast (a) vanuit sliders en (b) vanuit een kale stopkeuze zónder sliders.',
    then:
      'De doelsectie BLIJFT deze sessie zichtbaar na het loslaten — `doelLosgelatenDezeSessie` houdt hem open, naast de bestaande takken (Volledig altijd, of `doelActief`, of de wat-als-deeplink). De knop "Maak dit mijn doel" verschijnt óók wanneer er alleen een stopkeuze is (`hasScenario || hasStopKeuze`), niet meer uitsluitend bij sliders — de doelvastleg-sheet kent die vorm wél (de fire-preview hangt aan `stand.stopAge`/`stopKoppel`). Legt de gebruiker opnieuw vast, dan gaat de vlag uit en hangt de zichtbaarheid weer aan het doel zelf. De perspectief-gate blijft ongewijzigd: in partner-/huishoudweergave bestaat KATERN II niet. ÉÉN AFLEIDING, TWEE LEZERS: de sectie zelf en de meeklap-toets van KATERN III ("doel dicht = alles dicht") lezen nu allebei `verkenSectieZichtbaar`; dat stonden twee handgetypte kopieën, precies de constructie die uiteenloopt zodra er een tak bijkomt. Verdwijnt de sectie na loslaten alsnog, of blijft "Maak dit mijn doel" weg bij een kale stopkeuze, dan is dat een regressie.',
    assertion: {
      kind: 'ui-only',
      source:
        'components/app/horizon/horizon-client.tsx (`doelLosgelatenDezeSessie`-state, de gedeelde afleiding `verkenSectieZichtbaar`, en de `hasScenario || hasStopKeuze`-gate op "Maak dit mijn doel") — sessiegebonden zichtbaarheidsgedrag zonder cijfermatige uitkomst; bewaakt in `components/app/horizon/horizon-client.doel-loslaten-terugweg.test.ts`.',
    },
  },
  {
    workflow: 'WF-TOEK-44',
    scenarioId: 'UAT-TOEK-44',
    titel: 'Plan-review: de Voorkeuren-kaart telt je nagelopen keuzes; elke stap is inline bewerkbaar en opslaan = bevestigen (ADR 0142, TPR-15)',
    kriticiteit: 'BELANGRIJK',
    persona: 'willem',
    given:
      'Persona Willem op /toekomst met een grafiek (geboortedatum, bezittingen), een actief AOW-event en een eigen huis. Migratie 20260913160000 (`profiles.plan_review_state`) is uitgerold. Nog geen stap bevestigd. De review is optioneel: de grafiek bestaat en klopt zonder (A1). Sinds TPR-15 heeft elke stap een BESTAANDE editor-body inline (`PLAN_REVIEW_EDITORS`): "Aanpassen" navigeert niet meer weg, maar klapt diezelfde body uit als op het gewone scherm (Voorkeuren/Gebeurtenissen/Bezittingen), met hetzelfde schrijfpad.',
    when:
      '(a) Hij bekijkt de Voorkeuren-kaart en klikt erop; hij doorloopt daarna een paar stappen zonder te bewerken — bevestigt "Je plan", slaat "Leven na stoppen" over; (b) op een stap met een editor klikt hij "Aanpassen", wijzigt iets, en klikt "Opslaan en bevestigen"; hij herhaalt dit zonder wijziging en klikt "Annuleren" in een derde poging; (c) op stap "Wat er binnenkomt" (zonder eigen AOW-rij) klikt hij "Aanpassen", schakelt tussen AOW/Werk/pensioenpotten en vult het AOW-formulier in; tijdens een lopende save zijn de onderdeel-knoppen uitgeschakeld (wisselen dan is live niet uit te voeren; de guard tegen een late save is unit-getest); op stap "Je huis en ander vast bezit" (eigen huis zonder opgeslagen woonstrategie, plus een eigen niet-liquide bezitting) stelt hij eerst alleen de verkoopinstelling van de bezitting in en slaat die op zonder de woonstrategie te raken, en in een tweede poging stelt hij wél de woonstrategie in; (d) hij sluit de pane, laadt /toekomst opnieuw en opent de review via ⌘K "Je voorkeuren voor je plan instellen" en via de knop met dezelfde naam op /toekomst/voorkeuren; daarna zet hij het AOW-event uit bij Gebeurtenissen en komt terug.',
    then:
      '(a) Zolang niet alles bevestigd is heet de kaart "Je voorkeuren voor je plan instellen", KPI "N van M" (n.v.t.-stappen tellen niet mee), stoplicht aandacht (oranje), substext "X stappen nog niet bevestigd"; in Eenvoudig compact "Je voorkeuren voor je plan instellen · N/M". Een klik opent de pane (ShellOverlay pane, z-[70]) bij de EERSTE onbevestigde stap, met de tijdas op desktop zichtbaar ernaast. Zonder bewerkstand toont elke stap drie blokken: "Waar de app nu mee rekent" (opent met "De app rekent nu …", nooit een leeg veld), "Wat het doet" (vrijheidsleeftijd — of onder een vast stopmoment: tot waar het liquide vermogen reikt — plus een vergelijking uit een tweede kernel-run) en "Waarom dit ertoe doet"; de footer-knop is dan gewoon "Bevestigen" (schrijft alleen de markering, geen domeinroute) of "Overslaan" (schrijft niets). (b) "Aanpassen" klapt de bestaande editor-body van die stap uit ín de stap (`heeftEditor`/`editorSlot` in `plan-review-pane.tsx`) — geen navigatie, geen geneste overlay; de footer wordt "Opslaan en bevestigen" zodra er een wijziging is (`editorActions.changed !== false`), anders blijft "Bevestigen" staan. Opslaan schrijft EERST via de bestaande domeinroute van die editor (bv. /api/fire-settings voor "Je plan", /api/fire-settings (+ /api/retirement-aspirations bij zelf samenstellen) voor uitgaven) en zet DAN de markering (PUT /api/plan-review, `markeerEnGaDoor`); mislukt de write, dan blijft de bewerkstand open met een fout (geen markering). "Annuleren" sluit de bewerkstand zonder iets te schrijven; de stap staat er ongewijzigd bij. (c) Stap 3 (`InkomstenEditor`) toont AOW/Werk/eigen pensioenpotten (+ "Nieuwe pensioenpot") als naast elkaar staande onderdelen met dezelfde bestaande body als /toekomst/gebeurtenissen (`AowStrategieBody`/`WerkStrategieBody`/`PensioenPotBody`); alleen eigen rijen zijn zichtbaar. Zolang er geen eigen AOW-rij bestaat is het AOW-formulier vooringevuld maar leeg in de DB — pas de geslaagde `PUT /api/life-events/strategie`-save maakt de rij aan en meldt `aowGeschreven: true`, waarna de voortgang `hasAowEvent: true` gebruikt (A10) en de stap kan bevestigen. Tijdens een lopende save zijn de onderdeel-knoppen uitgeschakeld; komt een save terug NADAT de gebruiker naar een ander onderdeel wisselde, dan bevestigt de stap NIET (`actiefRef`-guard) — het concept van het nieuwe onderdeel gaat niet stil verloren. Stap 4 (`WoningEditor`) toont "Eigen woning" (bestaande `HousingStrategySection`, route `/api/housing-strategy`) en elke eigen niet-liquide bezitting (bestaande `SaleConfigFields`, route `PATCH /api/assets/[id]/sale-config`) als aparte onderdelen. Zonder opgeslagen woonstrategie telt de getoonde standaard (volledig meetellen) niet als keuze (`changed: (s.changed ?? true) || !woonstrategieIngesteld`); slaat de gebruiker ALLEEN de verkoopinstelling van de bezitting op (`woonstrategieGeschreven: false`), dan blijft de stap open met de melding "Je instelling is opgeslagen. Deze stap blijft open tot er een woonstrategie voor je huis is opgeslagen." (`OPEN_REDEN_TEKST.woning_zonder_strategie`, `blijfBijOpenStap`) — geen stille doorgang naar de volgende stap. Slaat hij daarna de woonstrategie op (`woonstrategieGeschreven: true`), dan bevestigt de stap alsnog. Zonder eigen huis en zonder eigen niet-liquide bezit toont de stap "Er is hier geen eigen woning of eigen vast bezit om in te stellen." (d) Bevestigde stappen blijven bevestigd na herladen (server-side, cross-device); ⌘K en de knop op /toekomst/voorkeuren openen de pane (de laatste bij stap 1). Zijn alle stappen bevestigd, dan is de kaart weer de gewone Voorkeuren-kaart. Zonder actief AOW-event gaat "Wat er binnenkomt" weer open (€ 0 AOW benoemd, bevestigen geblokkeerd) en krijgt de kaart weer de review-naam (A10). Nergens staat "aanbevolen" of "past bij jou" (Wft). Het afsluitscherm "Voor wie wil" (inflatie, bruto rendement, Box 3, rendement per bezitting) staat apart getoetst in WF-TOEK-48.',
    assertion: {
      kind: 'ui-only',
      source:
        'components/future/toekomst-nav-cards.tsx (`planReviewCard`, klik-onderschepping binnen `PlanReviewProvider`) + components/future/plan-review/plan-review-provider.tsx + plan-review-pane.tsx (stap-UI, bewerkstand, schrijfvolgorde `markeerEnGaDoor`/`naOpslaanInEditor`, `OPEN_REDEN_TEKST`, `blijfBijOpenStap`) + components/future/plan-review/editors.tsx (`PLAN_REVIEW_EDITORS`-register) + components/future/plan-review/inkomsten-editor.tsx (onderdeel-tabs, `actiefRef`-guard, `aowGeschreven`) + components/future/plan-review/woning-editor.tsx (`woonstrategieIngesteld`-gate, `woonstrategieGeschreven`) + app/api/plan-review/route.ts (GET per stap, PUT markering) + app/api/plan-review/editor-context/route.ts (GET editor-context) + app/api/life-events/strategie/route.ts (PUT, alleen eigen rijen) + lib/plan-review/progress.ts (afgeleide voortgang, A9/A10) + lib/plan-review/overzicht.ts (kopij en vergelijkingsruns via `runRegelProjection`). De uitkomstgetallen komen uit de kernel en worden hier niet herberekend; bewaakt in `lib/plan-review/*.test.ts`, `app/api/plan-review/route.test.ts`, `components/future/plan-review/plan-review-pane.test.tsx`, `components/future/plan-review/inkomsten-editor.test.tsx`, `components/future/plan-review/woning-editor.test.tsx` en `components/future/toekomst-nav-cards.test.tsx`.',
    },
  },
  {
    workflow: 'WF-TOEK-48',
    scenarioId: 'UAT-TOEK-48',
    titel: 'Plan-review "Voor wie wil": inflatie, bruto rendement, Box 3-methode en rendement per bezitting inline instellen, zonder markering (TPR-15)',
    kriticiteit: 'OVERIG',
    persona: 'willem',
    given:
      'Persona Willem op /toekomst, plan-review open op het afsluitscherm "Voor wie wil" (bereikbaar via de laatste, ongenummerde pill "Voor wie wil" of automatisch na de laatste stap). VOORHEEN waren dit vier losse links naar /toekomst/voorkeuren en /overzicht/bezittingen; sinds TPR-15 is elk onderdeel hier zelf in te stellen (besluit eigenaar 13 sep 2026: één waarde met live effect, geen bereik).',
    when:
      '(a) Hij bekijkt de vier rijen (Inflatie, Bruto rendement, Box 3-methode, Rendement per bezitting) met hun huidige waarde; (b) hij klikt "Aanpassen" bij Inflatie, wijzigt de waarde en klikt "Opslaan"; (c) hij doet hetzelfde bij Box 3-methode en bij Rendement per bezitting (met meerdere eigen bezittingen, waaronder één afschrijvende); (d) hij sluit het afsluitscherm zonder iets aan te passen, en heropent het na een van de wizard-stappen bevestigd te hebben.',
    then:
      '(a) Elke rij toont label, korte uitleg en de huidige waarde uit `PlanReviewLaag2Context` (`laag2Waarde()`) — inflatie/bruto rendement als percentage per jaar, Box 3 als methode (+ heffingvrij inkomen bij "werkelijk"), rendement-per-bezitting als aantal instelbare bezittingen (afschrijvend bezit telt niet mee, want dat rekent met 0). (b) "Aanpassen" klapt de bestaande body uit (`VoorkeurBewerkenBody`/`Box3MethodeBody`, dezelfde bodies en schrijfroute `PUT /api/parameters` als de Voorkeuren-kaarten); "Opslaan" is uitgeschakeld zonder wijziging (`editorActions.changed === false`) en schrijft GEEN markering (`handleLaag2Saved` zet geen stap-status) — na een geslaagde save toont het scherm "<onderdeel> is opgeslagen." en de editor-context wordt opnieuw gelezen zodat de rij de nieuwe waarde toont. (c) Rendement per bezitting toont eigen tabs per bezitting (`RendementPerBezittingEditor`); een afschrijvende bezitting toont in plaats van het invoerveld de tekst "Deze bezitting schrijft af, dus de app rekent hier niet met een rendement." en kan niet opgeslagen worden (`canSave: !bezit.afschrijvend`); de route is `PATCH /api/assets/[id]/expected-return` met dezelfde band per type als het bezittingenformulier (foutmelding bij een waarde buiten de band). Tijdens een lopende save zijn de bezitting-knoppen uitgeschakeld; de `actiefRef`-guard tegen een late save is unit-getest (live niet uit te voeren). (d) Zonder wijziging schrijft "Aanpassen" niets; het afsluitscherm heeft geen eigen bevestig-status en telt niet mee in "N van M bevestigd" — heropenen na een stap-bevestiging toont dezelfde vier rijen, ongeacht welke wizard-stappen al bevestigd zijn.',
    assertion: {
      kind: 'ui-only',
      source:
        'components/future/plan-review/laag2-editors.tsx (`PLAN_REVIEW_LAAG2_EDITORS`, `laag2Waarde`, `RendementPerBezittingEditor`) + components/future/plan-review/plan-review-pane.tsx (`VoorWieWil`, `handleLaag2Saved` — geen markering) + lib/plan-review/types.ts (`PLAN_REVIEW_LAAG2_ONDERDELEN`) + app/api/parameters/route.ts (PUT) + app/api/assets/[id]/expected-return/route.ts (PATCH, band per asset-type). Bewaakt in `components/future/plan-review/laag2-editors.test.tsx` en `components/future/plan-review/plan-review-pane.test.tsx`.',
    },
  },
  {
    workflow: 'WF-TOEK-45',
    scenarioId: 'UAT-TOEK-45',
    titel: 'Geen AOW op je tijdas: de stille €0 wordt benoemd, is te minimaliseren en komt terug via het statuspunt (TPR-04)',
    kriticiteit: 'BELANGRIJK',
    persona: 'willem',
    given:
      'Persona Willem op /toekomst in eigen perspectief. Bij Gebeurtenissen staat het AOW-event UIT (geen actieve AOW-gebeurtenis). De kern rekent dan bewust met €0 AOW (eigenaarsbesluit: geen terugval op volledige opbouw); de horizon-run draagt de adapter-notice `aow_ontbreekt`. VOORHEEN gebeurde dat stil.',
    when:
      '(a) Hij bekijkt de tijdas en de kassabon met aannames; (b) klikt "Minimaliseren" op de melding; (c) laadt de pagina opnieuw (ook op een ander apparaat); (d) klikt het oranje statuspunt naast de pagina-\'i\'; (e) volgt "Naar je AOW-gebeurtenis", zet het event aan en komt terug; (f) bekijkt /toekomst in partnerweergave met een partnerlijn.',
    then:
      '(a) Boven de grafiek staat een amberkleurige melding "Geen AOW op je tijdas" met keuze + effect ("Er staat geen actieve AOW-gebeurtenis op je tijdas, dus de projectie rekent met €0 AOW. Vanaf je AOW-leeftijd komt er in de grafiek geen AOW-inkomen bij …") en waarom ("Voor de meeste huishoudens is de AOW de grootste vaste post na het stoppen …"), plus de link "Naar je AOW-strategie" (/toekomst/voorkeuren?strategie=aow — sinds 17 sep 2026; daarvoor /toekomst/gebeurtenissen). De aannames-kassabon toont de regel "AOW-inkomen · € 0 — geen AOW-gebeurtenis" (zelfde kopij-bron). (b) De melding verdwijnt; er blijft een oranje statuspunt (stoplicht-aandacht, geen module-accent) naast de \'i\' met aria-label "… — toon de melding over je AOW"; de aria-live-regio kondigt het minimaliseren aan. (c) Geminimaliseerd blijft geminimaliseerd na herladen en cross-device (own-row pref `profiles.status_banner_minimized`, sleutel van de AOW-melding, via PUT /api/overzicht/page-status — geen localStorage), zonder flikkering (server-seed). (d) Klikken op het punt heropent de melding en wist de vlag. (e) Met een actief AOW-event is er geen melding, geen punt en geen kassabon-regel. (f) In partnerweergave met partnerlijn verschijnt de melding niet (zelfde view-gating als de tekort-melding).',
    assertion: {
      kind: 'ui-only',
      source:
        'lib/horizon-kernel/adapter/events.ts (`aow_ontbreekt`-notice) → lib/hooks/use-horizon-fire-sim.ts → components/app/horizon/horizon-client.tsx (`aowNoticeVisible`, melding + kassabon-regel) + components/app/horizon/aow-notice-provider.tsx (`AowNoticeProvider`/`AowNoticeDot`, PUT-schrijfpad) + lib/horizon/aow-notice-minimize.ts (`AOW_ONTBREEKT_COPY`, `resolveAowNoticeDisplay`, minimize-sleutel) + lib/page-status/compute.ts (sleutel toegestaan) + app/(app)/toekomst/page.tsx (server-seed) — weergave- en voorkeurgedrag zonder cijfermatige uitkomst; bewaakt in `components/app/horizon/aow-notice-provider.test.tsx` en `lib/horizon/aow-notice-minimize.test.ts`.',
    },
  },
  {
    workflow: 'WF-TOEK-46',
    scenarioId: 'UAT-TOEK-46',
    titel: 'Verkenning op de vrijheidsas tot plan maken met "Maak dit mijn plan" (TPR-09)',
    kriticiteit: 'KERN',
    persona: 'willem',
    given:
      'Persona Willem op /toekomst met een plan dat stopt op zijn AOW-leeftijd (anker `aow`, eindleeftijd 90, eind-vorm "Niets, het mag op zijn"). Op de vrijheidsas staan twee stopleeftijden: de marker die hij met de schuif verkent (scenario-voorkeur, niet het plan) en het anker in het plan (`profiles.fire_stop_anchor`/`fire_stop_age`). VOORHEEN stond er geen brug tussen die twee, en heette de marker niet wat hij is.',
    when:
      '(a) Hij schuift de stopleeftijd naar 62,5 en leest de marker en de tekst eronder; (b) klikt "Maak dit mijn plan" en leest de bevestiging; (c) bevestigt; (d) schuift daarna opnieuw en kijkt naar de knop wanneer de schuif weer op 62,5 staat; (e) herhaalt (b)-(c) terwijl de route faalt (netwerk weg).',
    then:
      '(a) De marker heet "verkenning 62,5" en eronder staat "Dit is een verkenning: de lijn verschuift alleen hier. Maak je het je plan, dan rekent de hele app met deze stopleeftijd. …" met de knoppen "Maak dit mijn plan" en "Je plan-keuzes →". Onder het nu-anker (geen schuif) ontbreken beide. (b) Een bevestiging (ShellOverlay confirm, titel "Maak dit mijn plan") noemt keuze ("Je kiest 62,5 jaar als stopleeftijd van je plan. Nu rekent je plan met stoppen op je AOW-leeftijd (…)."), effect (de hele app rekent ermee; eindleeftijd (90) en wat er over moet zijn veranderen niet) en waarom — beschrijvend, niet aansporend. (c) Het VOLLEDIGE gelezen plan gaat via PUT /api/fire-settings terug met alleen het anker op `age` en fire_stop_age=62.5 (eindleeftijd, eind-vorm en nalatenschap ongewijzigd; stopleeftijd < eindleeftijd en halve jaren vooraf getoetst, de route toetst opnieuw — WF-KRUIS-28); toast "Plan bijgewerkt — Je plan rekent nu met stoppen op 62,5."; de verkenningsmarker wordt gewist (de schuif landt op het plan-stopmoment) en de pagina ververst. (d) Staat de schuif op het plan-stopmoment, dan leest de knop "Dit is al je plan" en is hij uitgeschakeld. (e) Een mislukte lees- of schrijfactie toont de fout inline in de bevestiging ("Opslaan mislukt. Probeer het zo nog eens." of de route-fout); het plan blijft ongewijzigd.',
    assertion: {
      kind: 'ui-only',
      source:
        'components/app/horizon/vrijheidsas.tsx (marker "verkenning", `toonMaakPlan`, `planIsDezeStop`) + components/app/horizon/stop-plan-confirm.tsx (`StopPlanConfirm`, `huidigPlanZin`) + components/app/horizon/horizon-client.tsx#handleStopPlanBevestigen (GET → `planDraftFromSettings` → `validatePlanDraft` → PUT `planDraftToFireSettingsBody`) + app/api/fire-settings/route.ts (plan-contract) — interactie met een schrijfpad; de plan-regels zelf zijn exact getoetst in WF-KRUIS-28 en WF-START-28.',
    },
  },
  {
    workflow: 'WF-TOEK-47',
    scenarioId: 'UAT-TOEK-47',
    titel: 'Een blijvende gebeurtenis zegt tot wanneer hij loopt: doorlopend of tot je stopt met werken (ADR 0143)',
    kriticiteit: 'KERN',
    persona: 'willem',
    given:
      'Persona Willem op /toekomst met een berekend stopmoment vóór zijn AOW-leeftijd. VOORHEEN liep een blijvend maandbedrag uit een gebeurtenis (bv. "Extra beleggen €1.700/mnd" uit de keuzehulp "Wat doe je met extra geld?") stil door tot leeftijd 100, óók na het stopmoment, en verscheen het in Inkomen & Uitgaven onder "AOW & pensioen".',
    when:
      '(a) Hij voegt een eigen gebeurtenis toe met in "03 · Blijvend" een inkomst van €1.000 per maand en leest de keuze "Tot wanneer"; (b) kiest "Tot ik stop met werken", slaat op en opent de gebeurtenis opnieuw; (c) bekijkt de detailweergave en de tooltip van Inkomen & Uitgaven op een leeftijd ná het stopmoment; (d) zet de keuze op "Blijft doorlopen" en bekijkt dezelfde leeftijd, en opent daarna in de keuzehulp "Wat doe je met extra geld?" de optie "Zet op tijdas".',
    then:
      '(a) Onder bedrag en type staat "Tot wanneer" met "Blijft doorlopen" (standaard voor een nieuwe eigen gebeurtenis) en "Tot ik stop met werken"; de helptekst noemt per keuze wat er gebeurt en voor welk soort geld hij past. (b) De keuze staat na heropenen nog op "Tot ik stop met werken" (`life_events.metadata.tot_stopmoment = true`). (c) De Duur-figuur leest "tot stopmoment"; ná het stopmoment staat het bedrag niet meer in de tooltip. (d) Bij "Blijft doorlopen" staat het bedrag er wél, onder "Inkomsten uit gebeurtenissen" (nooit meer "AOW & pensioen" vóór de AOW-leeftijd); de sheet "Maak een levensgebeurtenis" toont "Tot wanneer" met "Tot ik stop met werken" voorgeselecteerd en de uitleg eronder. Bestaande gebeurtenissen zonder keuze rekenen ongewijzigd door.',
    assertion: {
      kind: 'ui-only',
      source:
        'components/app/horizon/event-pane-edit.tsx (`UntilToggle`) + lib/horizon/event-pane-edit-form.ts (`contUntilStop`, `buildDraftEvent`) + components/app/horizon/event-pane-view.tsx + components/future/calculator-to-life-event-sheet.tsx (`defaultUntilStop`) + lib/income-expense-breakdown.ts (`FIXED_LABELS`); het rekengedrag (afkap op fireMonth − 1, inert zonder vlag) is exact getoetst in lib/horizon-kernel/geb-eind-bij-stopmoment.test.ts.',
    },
  },
  {
    workflow: 'WF-TOEK-49',
    scenarioId: 'UAT-TOEK-49',
    titel: 'Het lab onder een vast stopmoment: dekking als uitkomst, "Plan gedekt" i.p.v. vrijheidsleeftijd, bij een gedekt plan het eindvermogen als doel, geen promotie onder "nu" (ADR 0145, D12)',
    kriticiteit: 'KERN',
    persona: 'willem',
    given:
      'Persona Willem met een AOW-anker en eindleeftijd 90 (zoals WF-TOEK-46) — hier een synthetische, hand-narekenbare AOW-TEKORT-toestand (spiegelt exact de committed fixture `AOW_TEKORT` in lib/horizon/lab-uitkomst.test.ts, i.p.v. Willems eigen ongespecificeerde dekkingscijfer): leeftijd 42, stop op 67 (maand 300), uitputting op maand 480 (leeftijd 82, vóór de eindleeftijd 90) → een tekort. Zes afgeleide toestanden op dezelfde basis: (1) `solved` met een verkend scenario (ter referentie — het bestaande gedrag), (2) AOW-tekort MÉT een verkend scenario (knop-beweging), (3) AOW-tekort ZONDER verkenning (alleen een kale stopkeuze op de slider), (4) AOW volledig GEDEKT (geen uitputting binnen de horizon) MÉT een verkend scenario dat het eindvermogen op 90 van €100.000 naar €180.000 (nominaal, netto vermogen — Prognose!I via SimRow.endPortfolio = netWorth; bij een woonstrategie anders dan meerekenen telt de eigen woning mee) brengt, (4b) dezelfde GEDEKTE basis met een verkenning die het plan KRAP maakt (bv. salaris −30 %: uitputting op 88, netto vermogen op 90 negatief door de tekort-lening), (5) het `now`-anker (óók met scenario).',
    when:
      'De uitkomst-switch `resolveLabUitkomst` wordt op de zes toestanden aangeroepen; bij toestand (2) legt de gebruiker het scenario vervolgens vast als doel via `buildParameterGoalRows` met parameter `dekking`, bij toestand (4) met parameter `eindvermogen` (doelwaarde = het nominale scenario-eindvermogen); op toestand (2) wordt `resolveLabAntwoorden` aangeroepen met de tweede run (solvedFireAge 70) en de plan-hint `planMaandHint` €500 (P!B96 van de hoofd-run — nooit de hint van een verkend stop-pad) op een basis van €4.000/mnd.',
    then:
      'Gate-tabel (E4/E5/E6/D4): (1) `solved` + verkenning → `kind:\'vrijheidsleeftijd\'`, promotie `vrijheidsleeftijd` (ongewijzigd gedrag). (2) aow/age MET tekort en een verkend scenario → `kind:\'dekking\'`, promotie `dekking` — "Maak dit mijn doel" wordt aangeboden, de sheet toont de preview-rij "Plan gedekt" i.p.v. een vrijheidsleeftijd-rij. (3) aow/age MET tekort maar ZONDER verkenning (alleen een stopkeuze) → promotie `geen/geen-verkenning` — een stopkeuze alleen is onder een vast anker geen doelstand (D4), de knop blijft verborgen. (4) een VOLLEDIG GEDEKT plan mét een verkend scenario dat gedekt blijft → promotie `eindvermogen` (ADR 0145 D12, overschrijft E5): dekking en bereik bewegen niet meer, het eindvermogen wél — de lab-uitkomst draagt basis → wat-als als bedrag (`pickEndBalanceAtEndAge`, €100.000 → €180.000) en "Maak dit mijn doel" bouwt een `end_balance`-rij "Eindvermogen op je 90e" met `target_value` = €180.000 (nominaal). (4b) De promotie volgt de SCENARIO-stand die wordt vastgelegd, niet de basis (eindreview I1): een gedekte basis met een verkenning die het plan krap maakt → promotie `dekking`, en het scenario-eindvermogen is `op` (de run haalt de eindleeftijd niet: de tegel toont "op vóór je 90e", geen bedrag en geen delta-badge) — het lab biedt dus nooit een negatief eindvermogen als doel aan. (5) het `nu`-anker → promotie `geen/nu-anker`, ongeacht verkenning (E6) — verkennen mag, er komt nooit een doel uit. Legt de gebruiker toestand (2) vast, dan bouwt `buildParameterGoalRows` voor parameter `dekking` een `plan_coverage`-rij met naam "Plan gedekt tot 90 jaar" en `target_value = 100` (de META-max — nooit een client-waarde, spiegel van "Vrij op X jaar" onder `solved`). `resolveLabAntwoorden` geeft drie antwoorden in de volgorde doorwerken · extra opzij · minder uitgeven — in de UI staat elk onder zijn eigen knop (doorwerken onder de stop-slider, meer salaris onder Meer salaris, minder uitgeven onder Spaarquote) met één sluitregel eronder; "doorwerken tot" is de opgeloste leeftijd op halve jaren (70); de acties zetten een verkenning, nooit het plan, en alleen op klik.',
    assertion: {
      kind: 'exact',
      expected:
        'solved=vrijheidsleeftijd:vrijheidsleeftijd; aowTekortMetScenario=dekking:dekking; aowTekortZonderScenario=dekking:geen/geen-verkenning; aowGedekt=dekking:eindvermogen; aowGedektEindvermogen=100000→180000; aowGedektScenarioTekort=dekking:dekking; aowGedektScenarioTekortEindvermogen=100000→op; nu=dekking:geen/nu-anker; dekkingGoalType=plan_coverage; dekkingNaam=Plan gedekt tot 90 jaar; dekkingTarget=100; eindvermogenGoalType=end_balance; eindvermogenNaam=Eindvermogen op je 90e; eindvermogenTarget=180000; antwoorden=doorwerken,extra_opzij,minder_uitgeven; doorwerkenTot=70; extraOpzijActie=slider:extra_inleg:500',
      source:
        'lib/horizon/lab-uitkomst.ts#resolveLabUitkomst (échte productiefunctie, gate-tabel) + lib/horizon/toekomst-doel.ts#buildParameterGoalRows (dekking → plan_coverage-rij) + lib/horizon/lab-antwoorden.ts#resolveLabAntwoorden op een synthetische AOW-tekort-fixture die de committed lib/horizon/lab-uitkomst.test.ts spiegelt — zie toek-checks.ts',
    },
  },
  {
    workflow: 'WF-TOEK-50',
    scenarioId: 'UAT-TOEK-50',
    titel: 'Doelen volgen het plan: één melding wanneer lab-doelen niet meer bij het plan passen; knop-doelen blijven altijd geldig (spec lab-haalbaarheid §4)',
    kriticiteit: 'KERN',
    persona: 'willem',
    given: 'Willem heeft uit het lab drie doelen: een vrijheidsleeftijd-doel (fire_age), een spaarquote-doel (savings_rate) en het vrijheidsgetal-doel (handmatig, geen lab-doel). Hij zet zijn stopmoment van "zo vroeg als het kan" naar leeftijd 62; de sync geeft het fire_age-doel en het vrijheidsgetal-doel een n.v.t.-reden.',
    when: 'De doelenpagina bepaalt met `selectLabDoelenBuitenPlan` welke LAB-doelen niet meer passen en toont de melding met de telling.',
    then: 'Precies één lab-doel telt (fire_age); het spaarquote-doel (knop-doel, nooit n.v.t.) en het vrijheidsgetal-doel (geen lab-doel) tellen niet. De melding luidt "Je plan is veranderd. 1 doel uit het lab past er niet meer bij." met de acties Bijwerken · Loslaten; niets wordt automatisch verwijderd — het plan terugdraaien brengt het doel terug.',
    assertion: {
      kind: 'exact',
      expected: 'buitenPlan=fire; melding=Je plan is veranderd. 1 doel uit het lab past er niet meer bij.',
      source: 'lib/goals/lab-doelen-buiten-plan.ts#selectLabDoelenBuitenPlan + lib/horizon/anker-copy.ts#doelenPlanGewijzigdMelding — zie toek-checks.ts',
    },
  },
  {
    workflow: 'WF-TOEK-51',
    scenarioId: 'UAT-TOEK-51',
    titel: 'Hoofdinstelling "Geen tekort-lening in mijn plan": schakelaar, wizard-vergelijking en solver-gedrag (ADR 0149)',
    kriticiteit: 'KERN',
    persona: 'willem',
    given:
      'Persona Willem op /toekomst/voorkeuren, kaart Eindstrategie (deeplink `?regel=eindstrategie`, `components/future/regels/eindstrategie-body.tsx`). Een schakelaar (role="switch") "Geen tekort-lening in mijn plan" staat naast de bestaande tekort-lening-rente (V7), met uitleg-constante `GEEN_TEKORT_LENING_UITLEG` (keuze · effect · waarom). SINDS 17 sep 2026 (bijstelling van ADR 0149, eigenaarskeuze) staat de schakelaar STANDAARD AAN: `profiles.fire_no_deficit_loan` is NULL bij een nieuw/onaangeraakt account en de UI leest `!== false` — alleen een EXPLICIET opgeslagen `false` zet hem bewust uit (`d.fire_no_deficit_loan !== false` in horizon-client.tsx, `b.profile?.fire_no_deficit_loan !== false` in plan-review/overzicht.ts, `geenTekort` idem in eindstrategie-body.tsx). De uitleg-tekst zegt daarom letterlijk "Aan (standaard): …". Dezelfde vraag staat als detailregel "Tekort-lening in je plan" in de plan-review-wizard, stap "Je plan" (WF-TOEK-44, `lib/plan-review/overzicht.ts#stapPlan`).',
    when:
      '(a) De gebruiker opent de kaart bij een onaangeraakt profiel (fire_no_deficit_loan NULL) en ziet de schakelaar al AAN staan, zet hem daarna bewust uit, leest het live-effect eronder (`runRegelProjection` met override `geenTekortLening`) en klikt "Opslaan"; (b) hij opent de plan-review-stap "Je plan" en leest de nieuwe detailregel, de effectzin en de vergelijkingsregel tegenover de andere stand; (c) los van de UI: de solver wordt met en zonder de vlag doorgerekend op een plan waarvan het gesolvede stopmoment normaliter een BLIJVENDE tekort-lening nodig heeft (niet een korte, afgeloste overbrugging).',
    then:
      '(a) Bij NULL (onaangeraakt) staat de schakelaar AAN — dat is geen losse UI-default naast een andere serverwaarde, maar dezelfde `!== false`-lezing als overal elders. Uitzetten schrijft expliciet `fire_no_deficit_loan: false` via dezelfde PUT /api/fire-settings als de andere eindstrategie-velden; een 42703 (migratie nog niet live) laat het veld uit de PUT en de echo vallen, nooit een foutieve 200-bevestiging. (b) De stap "Je plan" toont de detailregel met waarde "niet toegestaan" (AAN/NULL, standaard) of "toegestaan" (expliciet UIT) — `GEEN_TEKORT_LENING_KOPIJ`; de effectzin benoemt wat dat betekent; de vergelijkingsregel toont dezelfde uitkomstmaat (vrijheidsleeftijd of dekking, afhankelijk van het anker) voor de ANDERE stand via een tweede `runRegelProjection`-run — geen eigen som. (c) SOLVER (kernel-gedrag, richtingstoets — géén vast getal, want persona-/vermogensafhankelijk): AAN (of NULL) ⇒ de gevonden stopleeftijd is gelijk-of-hoger dan expliciet UIT, en op die leeftijd is er t/m de eindleeftijd geen blijvende tekort-lening meer nodig (een overbrugging ≤ 12 mnd die bewezen wordt afgelost telt niet mee). Onder een VAST stopanker blijft de leeftijd ongewijzigd; een blijvend tekort meldt zich daar via de bestaande anker-tekortstatus (`anchor_shortfall`/`stop_now_shortfall`), niet via een verschoven leeftijd. Is er nergens binnen de horizon (t/m 100 jaar) een stopmoment zonder blijvende tekort-lening, dan parkeert de solver op de horizon met status `unreachable_within_horizon`. Expliciet UIT ⇒ byte-identiek aan het bestaande gedrag (alleen de gap telt) — de bestaande oracle-parity-fixtures blijven ongemoeid, want het fixture-invoerpad zet de vlag nooit.',
    assertion: {
      kind: 'direction',
      source:
        'lib/horizon-kernel/solver.ts#isToereikend (het gedeelde criterium: gap ≥ 0 ∧, met de vlag, geen blijvende tekort-lening) + lib/horizon-kernel/runway.ts#heeftBlijvendeTekortLening (episode-regel, MAX_TRANSIENT_SPAN_MONTHS) + lib/horizon-kernel/adapter/index.ts (`profile.fire_no_deficit_loan === true → KernelInput.geenTekortLening`, anders `undefined`) — richtingstoets/consistentie-eis vergrendeld in lib/horizon-kernel/geen-tekort-lening.test.ts (solveFire/evaluateFireAt/band/mc/rendement-marge, allemaal via hetzelfde predicaat). UI/opslag: components/future/regels/eindstrategie-body.tsx (schakelaar, `GEEN_TEKORT_LENING_UITLEG`) + app/api/fire-settings/route.ts (`fire_no_deficit_loan`-schema + 42703-fallback) + lib/future/regel-sim.ts#RegelSimOverride.geenTekortLening (live-effect zonder opslaan) + lib/plan-review/overzicht.ts#stapPlan/GEEN_TEKORT_LENING_KOPIJ (wizard-detailregel + vergelijking) + lib/plan-review/veld-register.ts + lib/plan-review/register.ts (veld geregistreerd op EINDSTRATEGIE resp. `stopAnker`-blok).',
    },
  },
  {
    workflow: 'WF-TOEK-52',
    scenarioId: 'UAT-TOEK-52',
    titel: 'Tekort-lening-melding boven de grafiek: werkelijk aflosmoment, woonstrategie-zin en instelling-ingang (ADR 0148/0149)',
    kriticiteit: 'BELANGRIJK',
    persona: 'willem',
    given:
      'Persona Willem met een run waarin de tekort-lening-detector (`lib/horizon/deficit-loan-display.ts`) een aangesproken tekort-lening ziet. De melding-copy is een PURE functie van de run-feiten (`lib/horizon/deficit-loan-copy.ts#buildDeficitLoanCopy`) — geen eigen herberekening in het component. Twee standen van `geenTekortLeningAan` (`profiles.fire_no_deficit_loan`): UIT (default) en AAN (en toch een lening nodig, bv. onder een vast stopanker of doorwerken tot 100).',
    when:
      'De gebruiker leest de melding op /toekomst met (a) `geenTekortLeningAan: false` en (b) `geenTekortLeningAan: true`, en volgt — indien een eigen woning meespeelt — de knop "Bekijk of wijzig je woonstrategie" en altijd de knop "Bekijk of wijzig of een tekort-lening mag →" (/toekomst/voorkeuren?regel=eindstrategie).',
    then:
      '(a) UIT: `instelling` = "Je plan staat een tekort-lening nu toe. Met de instelling \\"Geen tekort-lening in mijn plan\\" rekent de app met het vroegste stopmoment waarop je zonder lening rondkomt." (b) AAN met een vast stopmoment: `instelling` = "Je hebt ingesteld dat een tekort-lening niet in je plan hoort, maar met je gekozen stopmoment is hij toch nodig."; AAN zonder vast stopmoment (plan komt binnen de horizon niet rond, of een brug in het laatste planjaar): "Je hebt ingesteld dat een tekort-lening niet in je plan hoort; deze berekening laat er toch een zien." — nooit een gekozen stopmoment claimen dat er niet is. In beide standen is `toonInstellingLink` waar (de knop staat er bij elke geconstateerde tekort-lening) en noemt `knoppen` expliciet "je instelling of een tekort-lening in je plan mag" als vierde meebewegende factor (naast woonstrategie, liquide opbouw en stopleeftijd/pensioendatum). De periode-zin noemt het WERKELIJKE moment waarop de lening afloopt of doorloopt (leeftijd uit de rijen, nooit "tot je AOW-leeftijd" aangenomen) en, mét eigen woning, benoemt de woning-zin de gekozen strategie (verkoop/opeethypotheek) en verschijnt de woonstrategie-knop (`toonWoonstrategieLink = housing != null`). Alle tekst is beschrijvend (Wft): een rekenuitkomst, geen advies.',
    assertion: {
      kind: 'exact',
      expected:
        'instellingUit=Je plan staat een tekort-lening nu toe. Met de instelling "Geen tekort-lening in mijn plan" rekent de app met het vroegste stopmoment waarop je zonder lening rondkomt.; instellingAan=Je hebt ingesteld dat een tekort-lening niet in je plan hoort, maar met je gekozen stopmoment is hij toch nodig.; instellingAanZonderVastStopmoment=Je hebt ingesteld dat een tekort-lening niet in je plan hoort; deze berekening laat er toch een zien.; toonInstellingLink=true',
      source: 'lib/horizon/deficit-loan-copy.ts#buildDeficitLoanCopy (pure functie, échte productiecode — gerenderd in components/app/horizon/horizon-client.tsx) — zie toek-checks.ts; grendel op alle plan-varianten in lib/horizon/deficit-loan-copy.test.ts.',
    },
  },
  {
    workflow: 'WF-TOEK-53',
    scenarioId: 'UAT-TOEK-53',
    titel: 'Opbouw-grafiek kleurt schulden per soort (hypotheek, overig, opeethypotheek, tekort-lening) (ADR 0148)',
    kriticiteit: 'OVERIG',
    persona: 'willem',
    given: 'Persona Willem met een hypotheek, een tekort-lening-episode in de projectie en (in het opeethypotheek-scenario) een opeethypotheek-saldo. De opbouw-weergave van de tijdas-grafiek (`components/app/horizon/wealth-composition-chart.tsx`) toont schulden als onderdeel van de gestapelde balk.',
    when: 'De gebruiker schakelt de grafiek naar "Opbouw" en leest de schuld-segmenten en hun legenda per jaar.',
    then: 'De schuld-segmenten zijn per soort gekleurd i.p.v. één ongedifferentieerd schuld-blok — hypotheek, overige schulden, opeethypotheek en tekort-lening dragen elk hun eigen, consistente kleur en naam in de legenda/tooltip. Puur weergavegedrag: de onderliggende bedragen komen ongewijzigd uit dezelfde kernel-rijen als de "Pad"-weergave.',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/horizon/wealth-composition-chart.tsx (segment-kleuren per schuldsoort, ADR 0148) — consumeert bestaande kernel-uitkomsten zonder herberekening.',
    },
  },
  {
    workflow: 'WF-TOEK-54',
    scenarioId: 'UAT-TOEK-54',
    titel: 'Opeethypotheek naar behoefte: de opname is zichtbaar als eigen post (Inkomen & Uitgaven, jaar-kassabon, opbouw-hover, tijdlijn-marker) (ADR 0150)',
    kriticiteit: 'BELANGRIJK',
    persona: 'willem',
    given:
      'Persona Willem met een opeethypotheek zónder eigen maandbedrag (`monthlyPayout: null`) — de kernel neemt dan per maand op wat het gat is, tot het leenplafond (ADR 0150). VOORHEEN was die opname nergens als eigen post zichtbaar: hij liep ongelabeld mee in "Overige cashflows" (jaar-kassabon) en in geen enkele inkomstenlaag van "Inkomen & Uitgaven"; een jaar dat volledig door de opname werd gedekt (onttrekking uit portfolio = €0) toonde zelfs helemaal geen kassabon.',
    when:
      '(a) De gebruiker opent "Inkomen & Uitgaven" op een jaar met een opname en leest de bronnenlijst/sankey; (b) hij opent de jaar-kassabon op zowel een jaar met een gedeeltelijke opname (portfolio-onttrekking > 0) als een jaar dat volledig door de opname wordt gedekt (onttrekking = 0, opname > 0); (c) hij schakelt de tijdas naar "Opbouw" en hovert een jaar met een opname, en leest de tijdlijn-marker van de eerste opname.',
    then:
      '(a) Er staat een eigen inkomstenlaag "Opname uit je huis (opeethypotheek)" met dezelfde tint als de opeethypotheek-schuldlaag in de Opbouw-grafiek (instroom en schuld zijn twee kanten van hetzelfde geld); het bedrag komt uit `UnifiedProjectionRow.opeetOpname`, niet uit een eigen som. (b) De kassabon toont bij een gedeeltelijke opname de regel "Gedekt uit je huis (opeethypotheek)" vóór de "Niet gedekt (tekort)"-regel, met `tekort = need.nietGedekt − opeetGedekt` (nooit meer het volle `nietGedekt` als tekort tonen wanneer de opname al een deel dekt); een jaar met onttrekking = 0 maar opname > 0 krijgt nu WEL een kassabon (voorheen niet: de bon verscheen alleen bij `withdrawal > 0`). Onder de behoefte-uitsplitsing staat de regel "Opname uit je huis" (sublabel "opeethypotheek, dekt wat je potten niet meer dekken") als eigen post, gesplitst uit `cashflowNet`; "Overige cashflows" (sublabel "terugkerende gebeurtenissen") toont alleen het restant (`cashflowNet − opeetOpname`). (c) De Opbouw-grafiek toont bij hover op een jaar met opname > 0 de regel "Dit jaar uit je huis opgenomen (opeethypotheek): €… — dekt het deel van je uitgaven dat je potten niet meer dekken."; de chart-marker voor de eerste opname heet "Eerste opname opeethypotheek" (niet meer "Opeethypotheek start" — bij opname-naar-behoefte is de eerste gat-maand het relevante moment, niet het triggermoment). Op /toekomst/voorkeuren/huis-strategie toont het maandbedrag-veld bij een lege waarde de placeholder "automatisch" met de hint "Leeg = automatisch: elke maand wat je tekortkomt, tot het leenplafond (N% van de overwaarde). Vul je een bedrag in, dan rekent de app met dat vaste bedrag." — geen auto-geschatte lineaire spreiding meer.',
    assertion: {
      kind: 'ui-only',
      source:
        'lib/income-expense-breakdown.ts#buildBreakdown (opeethypotheek-laag, `FIXED_LABELS.opeethypotheek`/`FIXED_COLORS.opeethypotheek` uit `lib/wealth-composition.ts#DEBT_LAYER_COLORS`) + components/app/horizon/horizon-year-details-sheet.tsx#buildWithdrawalReceiptLines (opeet-gedekt/tekort-splitsing) + components/app/horizon/wealth-composition-chart.tsx (hover-regel) + components/app/horizon/horizon-client.tsx (tijdlijn-marker "Eerste opname opeethypotheek") + components/future/strategie/housing-strategy-section.tsx (placeholder/hint) — weergavegedrag op het bestaande bridge-veld `SimRow.opeetOpname`/`UnifiedProjectionRow.opeetOpname` (ADR 0150), geen eigen herberekening. Rekengedrag (behoefte, cap, dekking) is exact getoetst in lib/horizon-kernel/opeet-naar-behoefte.test.ts; het weergave-splitspunt in `buildWithdrawalReceiptLines` is bewaakt in components/app/horizon/horizon-year-details-sheet.test.tsx.',
    },
  },
  {
    workflow: 'WF-TOEK-55',
    scenarioId: 'UAT-TOEK-55',
    titel: 'Opeethypotheek: bijgeschreven rente zichtbaar in de jaarkaart, geen maandlast-toelichting op de kassabon (ADR 0151)',
    kriticiteit: 'BELANGRIJK',
    persona: 'willem',
    given:
      'Persona Willem met een opeethypotheek-run waarin de opeetslot-schuld ooit rente bijschrijft (`SSlot.renteBijgeschreven`, kernel-veld `debtBalances[\'opeethypotheek\'].renteBijgeschreven`). VOORHEEN stond deze bijgeschreven rente nergens: de oracle-rentekolom is bewust 0 (het is geen kasstroom) en er was geen ander weergaveveld voor. De opeethypotheek heeft per ontwerp geen maandlast — de rente wordt bij de schuld opgeteld en loopt sinds deze ADR ook door zodra het saldo tegen het leenplafond aanloopt (opname stopt vanzelf; de schuld zelf wordt nooit meer stilzwijgend ingekort door een dalend plafond).',
    when:
      '(a) De gebruiker opent de jaar-detail-kassabon (WF-TOEK-05) op een jaar met een opeethypotheek en klapt de schuld-mutatieregels uit; (b) hij leest de kassabonregel "Gedekt uit je huis (opeethypotheek)" onder de behoefte-uitsplitsing.',
    then:
      '(a) De opeethypotheek-schuldregel toont naast "+ Opgenomen" (bestaand, `detail.opgenomen`) nu ook "+ Rente bijgeschreven" (`detail.renteBijgeschreven`) zodra dat bedrag > 0 is — een aparte "+"-mutatieregel, geen wijziging van de rentelaag in Inkomen & Uitgaven. Die rentelaag sluit ALLEEN de synthetische sleutel `opeethypotheek` uit (haar rente is bijgeschreven, geen kasstroom); de tekort-lening draagt haar rente wél nog in `interestPaid` en blijft dus gewoon een rentelaag — de twee synthetische schulden worden hier NIET gelijk behandeld. (b) De regel "Gedekt uit je huis (opeethypotheek)" draagt de sublabel-toelichting "geen maandlast: de rente wordt bij de schuld opgeteld" — puur verklarende tekst bij een bestaand bedrag, geen nieuw cijfer. Weergavegedrag op bestaande bridge-velden; geen eigen herberekening in het component.',
    assertion: {
      kind: 'ui-only',
      source:
        'components/app/horizon/horizon-year-details-sheet.tsx (mutatieregel "+ Rente bijgeschreven" op `detail.renteBijgeschreven`; sublabel "geen maandlast: de rente wordt bij de schuld opgeteld" op de "Gedekt uit je huis"-regel) — bewaakt in components/app/horizon/horizon-year-details-sheet.test.tsx. Rekengedrag (rente loopt door boven het plafond, saldo nooit ingekort door een dalend plafond) is exact getoetst in lib/horizon-kernel/opeet-rente-plafond.test.ts (buiten scope van deze UI-check).',
    },
  },
  {
    workflow: 'WF-TOEK-56',
    scenarioId: 'UAT-TOEK-56',
    titel: 'Melding "waarom blijft er aan het eind zoveel over?" boven de grafiek (eindsituatie-duiding, plan 17 sep 2026 onderdeel D)',
    kriticiteit: 'BELANGRIJK',
    persona: 'willem',
    given:
      'Persona Willem zonder vast stopmoment, met een run waarin het liquide vermogen (Prognose!J) op de eindleeftijd meer dan één jaar uitgaven boven het doel van de gekozen eind-vorm uitkomt ("vermogen opeten" ⇒ doel €0; "nalatenschap" ⇒ het ingestelde bedrag; "niet laten slinken" ⇒ het vermogen op het stopmoment). De detector (`lib/horizon/eindsituatie-duiding.ts#detectEindsituatie`) leest dit uit DEZELFDE kernel-rijen als de grafiek — geen eigen herberekening — en levert `null` bij een vast stopmoment of een overschot ≤ één jaar uitgaven. RIJ-CONVENTIE: een jaarrij `age` beschrijft standen aan het EIND van dat jaar, dus op leeftijd `age + 1` (zelfde conventie als `clipRowsToPlanEnd`); de leeftijd in het overschot en het dieptepunt is daarom altijd rij-leeftijd + 1, terwijl "later inkomen" de rij-leeftijd ongewijzigd toont (het moment waarop dat jaar begint te dekken). De "later inkomen"-oorzaak trekt de partnerbijdrage (`withdrawalNeed.partnerBijdrage`) van `grossIncome` af vóórdat hij tegen de behoefte toetst — die bijdrage zit al verwerkt in `totaalNeed`, dus zonder die aftrek zou ze dubbel tellen. Een dieptepunt van €0 of lager (een tekort-brug die binnen het jaar weer is afgelost) toont "daar is je liquide geld op", zónder bedrag — een negatief bedrag zou alleen verwarren.',
    when:
      'De gebruiker opent /toekomst (en, zonder de Fin-knop, hetzelfde blok in het totaalplan) zonder vast stopmoment en met het bovenstaande overschot. Hij leest de melding, minimaliseert haar naar het statuspunt naast de pagina-`i` en heropent haar; is de oorzaak niet eenduidig én heeft hij een actief AI-abonnement (`ai`) met uitvoermodus "gesprek" beschikbaar (cloud of lokaal), dan ziet hij ook de knop "Bespreek met Fin".',
    then:
      'Op een synthetische, hand-narekenbare jaarrijenset (rij-leeftijden 55/67/80/89, want rijen lopen t/m eindleeftijd−1: stop op 55, dieptepunt van het liquide vermogen op rij-leeftijd 67 — getoond op leeftijd 68, bedrag > 0 — net onder de helft van de jaaruitgaven — bindt de "geen tekort-lening"-oorzaak — en vanaf rij-leeftijd 80 dekt inkomen (zonder partnerbijdrage in de fixture) de behoefte volledig, eindrij op leeftijd 89 — getoond op eindleeftijd 90 — met een hoog restsaldo) levert `detectEindsituatie` precies de oorzaken `[\'geen-tekort-lening\', \'later-inkomen\']` in die volgorde en `eenduidig=true` (precies één BINDENDE oorzaak: alleen "geen tekort-lening", "later inkomen" is aanvullend). `buildEindsituatieCopy` zet dat om in een kopzin die "vermogen opeten" noemt, een eerste oorzaakzin die "je 68e" en "bijna op (€ 15.000)" noemt (dieptepunt > 0), een tweede die "je 80e" en het latere inkomen noemt, geen context-zin (geen niet-liquide overwaarde/opeetschuld in deze fixture) en `onduidelijk=null` (eenduidig, dus geen Fin-knop). Alle tekst is beschrijvend (Wft: rekenuitkomst, geen advies) — bewaakt in `eindsituatie-copy.test.ts`. Met een eigen woning en/of opeetschuld noemt de context-zin "de overwaarde van je huis" resp. de opeetschuld die "tegenover je huis staat en bij een verkoop met de opbrengst wordt verrekend" (niet: "afgelost uit je huis") — apart getoetst op échte kernel-runs in `eindsituatie-scenarios.test.ts` (scenario S5, opeethypotheek). De melding is minimaliseerbaar via dezelfde pref-only-sleutel-conventie als de AOW-melding (WF-TOEK-45): `resolveEindsituatieNoticeDisplay` geeft `\'none\'` zonder duiding, `\'expanded\'` zonder opgeslagen vlag en `\'minimized\'` zodra de vlag 1 staat; alleen de waarde 1 telt (`asEindsituatieMinimizedFlag`). De Fin-knop-voorwaarde (niet-eenduidig ∧ AI-abonnement ∧ gesprek-modus) is UI-consistentie, geen pure-functie-cijfer, en wordt hier alleen narratief getoetst. Opent de gebruiker die knop, dan krijgt Fin naast de vraag (`finVraag`, die nu expliciet om een uitleg PER OORZAAK vraagt en niet om een algemene rendementsuitleg) ook `finContext` mee: dezelfde oorzaken als in de melding, in de ik-vorm, met leeftijden en instellingen maar ZONDER bedragen, plus wat níet in het overschot zit (overwaarde huis / opeetschuld) en de onduidelijk-zin — Fins AI-context kent tekort-lening en opeetplafond zelf niet. Toets live: het antwoord noemt de oorzaken uit de melding, niet een generiek verhaal.',
    assertion: {
      kind: 'exact',
      expected:
        'oorzaken=geen-tekort-lening,later-inkomen; eenduidig=true; overschot=300000@90; dieptepunt=15000@68; kopBevatVermogenOpeten=true; oorzaak0BevatJe68e=true; oorzaak0BevatDieptepunt=true; oorzaak1BevatJe80e=true; onduidelijk=null; displayNone=none; displayExpanded=expanded; displayMinimized=minimized; flagOnbekendeWaarde=null; flagGeldig=1',
      source:
        'lib/horizon/eindsituatie-duiding.ts#detectEindsituatie + lib/horizon/eindsituatie-copy.ts#buildEindsituatieCopy (incl. finVraag/finContext, doorgegeven als `detail` aan BesprekMetWillButton) op een zelfstandige synthetische UnifiedProjectionRow-fixture (géén kernel-run, wél echte productiefuncties) + lib/horizon/eindsituatie-notice-minimize.ts#resolveEindsituatieNoticeDisplay/asEindsituatieMinimizedFlag — zie toek-checks.ts. Gerenderd in components/app/horizon/eindsituatie-notice.tsx (/toekomst) en components/rapportage/totaalplan-blocks.tsx (totaalplan, zonder Fin-knop); trigger-varianten (vast stopmoment, drempel, per-oorzaak, dieptepunt ≤ 0, partnerbijdrage-aftrek) vergrendeld in lib/horizon/eindsituatie-duiding.test.ts; toongrendel + context-copy in lib/horizon/eindsituatie-copy.test.ts; acht scenario\'s op ÉCHTE kernel-runs (convergentie-projectie, persona Tessa Compleet — pensioengat, instelling uit, vast stopmoment, "nu al vrij", opeethypotheek, nalatenschap, "niet laten slinken", krap plan) in lib/horizon/eindsituatie-scenarios.test.ts.',
    },
  },
  {
    workflow: 'WF-TOEK-57',
    scenarioId: 'UAT-TOEK-57',
    titel: 'Haalbare uitgave na pensioen: duidingsregel in de "Na pensioen"-tegel en de vierde draaiknop (ADR 0160)',
    kriticiteit: 'KERN',
    persona: 'willem',
    given:
      'Persona Willem met een vastgezet stopmoment (`fire_stop_anchor` op `age`/`aow`, niet `solved`) waarbij het plan niet precies tot de eindleeftijd reikt — subscenario a: een tekort (het plan raakt vóór de eindleeftijd op), subscenario b: een overschot (het plan reikt ruim voorbij de eindleeftijd). `solveHaalbareUitgave` (lib/horizon/haalbare-uitgave.ts, ADR 0160) bisecteert de uitgave na pensioen (€/jaar) tot `solveFire(...).status` geen shortfall meer is en levert `HaalbareUitgave { perJaar, eindleeftijd, huidigPerJaar, richting }`; dat resultaat landt als `ScenarioPresetBatch.haalbareUitgave`, in dezelfde worker-oversteek als de zes preset-kaarten.',
    when:
      'De gebruiker opent /toekomst en leest (1) de regel onder het bedrag in beide "Na pensioen"-KPI-tegels (desktop- en mobiele strip, `data-testid="hero-stat-retirement-expense"`) en (2) de antwoordregel onder de vierde draaiknop "Uitgave na pensioen" in de vrijheidsas (sectie 2, ná Minder werken).',
    then:
      'Beide plekken tonen HETZELFDE bedrag uit dezelfde bron — geen tweede berekening in de UI. (a) Tekort: de tegelregel luidt "haalbaar tot {eindleeftijd} bij uitgave: {bedrag}" in `text-negative` (donkerrood; `perJaar < huidigPerJaar`), en de antwoordregel onder de knop luidt "Zo\'n {hetzelfde bedrag} per jaar uitgeven hoort bij een gedekt plan." (b) Overschot: dezelfde tegelregel in `text-positive` (donkergroen; `perJaar > huidigPerJaar`) en dezelfde antwoordvorm met het hogere bedrag. Bij |perJaar − huidigPerJaar| < € 250/jaar (HAALBARE_UITGAVE_DREMPEL) verschijnt in GEEN van beide plekken een regel (`richting === \'gelijk\'`). Zet de gebruiker de vierde knop op een andere stand, dan rekent de scenario-run met die gekozen uitgave na pensioen mee (dekkingsas + wat-als-lijn bewegen), en zonder actieve overrides blijft de scenario-run byte-identiek aan de basislijn (`scenario-baseline-parity.test.ts`). Geen vast stopmoment (anker `solved`) ⇒ geen regel en geen antwoordregel; huishoud-/partnerweergave (`hasPerspectiveHero`) ⇒ de tegelregel verbergt zich, de antwoordregel onder de knop niet (bewuste asymmetrie, ADR 0160 Gevolgen — open punt voor visuele controle). Privacy-weergave: `···` op de plaats van het bedrag in beide regels, en de antwoordregel draagt dan geen knop.',
    assertion: {
      kind: 'exact',
      expected:
        'drempel=250; sliderstap=600; regelMinder=haalbaar tot 90 bij uitgave: € 31.200; klasseMinder=text-negative; regelMeer=haalbaar tot 90 bij uitgave: € 54.000; klasseMeer=text-positive; regelGelijk=null; antwoordMinder=Zo\'n € 31.200 per jaar uitgeven hoort bij een gedekt plan.; antwoordBovenBereikMinder=false',
      source:
        'lib/horizon/haalbare-uitgave.ts#HAALBARE_UITGAVE_DREMPEL (250; de bisectie-precisie € 50/jaar en de bovengrens-factor 3× zijn module-privé constanten, gepind in lib/horizon/haalbare-uitgave.test.ts) + lib/scenario-events.ts#UITGAVE_NA_PENSIOEN_STAP (600) + lib/horizon/anker-copy.ts#haalbaarBijUitgaveRegel/antwoordUitgaveNaPensioen op synthetische HaalbareUitgave-fixtures (géén kernel-run — de tekst-/kleur-/drempellaag is puur; de bisectie zelf is kernel-bewezen in lib/horizon/haalbare-uitgave.test.ts en lib/horizon/scenario-presets.haalbare-uitgave.test.ts) — zie toek-checks.ts. Kleurtokens (text-negative/text-positive) zijn de bestaande semantische tokens (CLAUDE.md kleurconventie); de bron-test op de tegels bewaakt dat er geen Tailwind-standaardkleur of losse hex in de nieuwe markup staat.',
    },
  },
]

export const TOEK_ACCEPTANCE: AcceptanceSet = {
  zone: 'TOEK',
  criteria,
}

/**
 * De TOEK-scenario-nummers die een acceptatiecriterium HOREN te hebben — de
 * catalogus dekt 01..08, 10..26, 28, 29, 30, 32..49 (27 en 31 zijn
 * verwijsregels naar REKEN/NAV en horen NIET in deze set). WF-TOEK-09
 * (opgeslagen wat-als-scenario's als spooklijn) is VERVALLEN op 14 sep 2026
 * (ADR 0144 "De Wat-Als-pagina gaat op in de tijdas") — de bewaarde
 * wat-als-scenario's en de spooklijn-overlay-picker bestaan niet meer.
 * WF-TOEK-49 (14 sep 2026, ADR 0145 "Het doelscenario volgt het anker: dekking
 * als uitkomst") is NIEUW — het eerstvolgende vrije nummer (44 is TPR-15,
 * 45-48 zijn eerder al bezet). Gebruikt door de dekkings-meta-test.
 * WF-TOEK-50 (15 sep 2026, spec lab-haalbaarheid §4) is NIEUW — de
 * doelen-melding wanneer lab-doelen niet meer bij het plan passen.
 * WF-TOEK-51 (16 sep 2026, ADR 0149 "Geen tekort-lening als planvoorwaarde")
 * is NIEUW — de hoofdinstelling zelf: schakelaar, wizard-vergelijking en het
 * gedeelde solver-criterium (`isToereikend`). WF-TOEK-52 is NIEUW — dezelfde
 * ADR raakte ook de tekort-lening-melding op de tijdas (instelling-zin +
 * ingang), samen met de eerder die dag geshipte ADR 0148-wijzigingen aan die
 * melding (werkelijk aflosmoment, woonstrategie-zin) — deze twee ADR's hadden
 * daarvoor geen eigen criterium. WF-TOEK-53 is NIEUW — ADR 0148 kleurt de
 * opbouw-grafiek per schuldsoort; ook dat stond nog niet gedekt.
 * WF-TOEK-54 (17 sep 2026, ADR 0150 "Opeethypotheek: opname naar behoefte") is
 * NIEUW — de opname zonder eigen maandbedrag draagt sindsdien een zichtbare
 * eigen post (Inkomen & Uitgaven, jaar-kassabon, opbouw-hover, tijdlijn-marker,
 * strategie-veld); dat stond nog niet gedekt.
 * WF-TOEK-55 (17 sep 2026, ADR 0151 "Opeethypotheek: rente zichtbaar en boven
 * het plafond") is NIEUW — de bijgeschreven rente krijgt een eigen "+"-regel op
 * de jaarkaart en de kassabonregel "Gedekt uit je huis" een maandlast-
 * toelichting; dat stond nog niet gedekt.
 * WF-TOEK-56 (17 sep 2026, plan lab-haalbaarheid onderdeel D "eindsituatie") is
 * NIEUW — de melding "waarom blijft er aan het eind zoveel over?" boven de
 * grafiek (en hetzelfde blok in het totaalplan) is een geheel nieuw oppervlak
 * zonder eerder criterium.
 * WF-TOEK-57 (19 sep 2026, ADR 0160 "De haalbare uitgave na pensioen") is
 * NIEUW — de duidingsregel in de "Na pensioen"-tegel en de antwoordregel onder
 * de nieuwe vierde draaiknop "Uitgave na pensioen" in de vrijheidsas; beide
 * bewezen op dezelfde bron (ScenarioPresetBatch.haalbareUitgave).
 */
export const TOEK_EXPECTED_WORKFLOW_NUMBERS: number[] = [
  ...Array.from({ length: 8 }, (_, i) => i + 1), // 1..8
  ...Array.from({ length: 17 }, (_, i) => i + 10), // 10..26
  28, 29, 30, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57,
]
