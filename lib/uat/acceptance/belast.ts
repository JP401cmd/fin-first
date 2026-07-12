/**
 * Acceptatiecriteria — domein Belasting (WF-BELAST-01..19, 21 /
 * UAT-BELAST-01..19, 21).
 *
 * Bron: `lib/uat/catalog.ts` (bron-van-waarheid voor WELKE scenario's bestaan)
 * + de Box 1/2/3-rekenmotoren. Cijfers zijn ONAFHANKELIJK narekend uit
 * `lib/test-personas.ts` — nooit overgenomen uit wat de app toont (zie
 * `belast.engine.test.ts` voor de daadwerkelijke toets tegen de échte
 * rekenfuncties: `computeBox1Tax`/`grossFromNet` (box1-tax.ts),
 * `calculateBox2`/`VPB_PARAMS` (box2-data.ts), `calculateBox3`/
 * `calculatePartnerSplit` (box3-data.ts), `compareForfaitairVsWerkelijk`
 * (box3-tegenbewijs.ts), `computeJaarruimte` (jaarruimte.ts)).
 *
 * BEWUST WEGGELATEN (verwijsregels, bestaan NIET als los BELAST-scenario in de
 * catalogus — spiegelt WF-SCHULD-19):
 *  - WF-BELAST-20 (perspectief wisselen) → dekt UAT-NAV (perspectief-switcher).
 *  - WF-BELAST-22 (pagina-uitleg (i) + statuspunt) → dekt UAT-NAV.
 * Deze set heeft dus PRECIES 20 criteria (WF-BELAST-01..19, 21).
 *
 * JAARTAL — alle drie de box-subpagina's + de hub draaien op 2026:
 *   - box1/page.tsx: `resolveBox1GrossIncome(..., 2026)` + `computeBox1Tax(..., year:2026)`
 *   - box2/page.tsx: `<Box2Detail year={2026} />` (route default 2026)
 *   - box3/page.tsx: `const YEAR = 2026` → `loadPerspectiveBox3(..., 2026)`
 * Elke `source` vermeldt het jaar 2026.
 *
 * PERSONA-STRATEGIE:
 * - Tessa ('compleet') — DGA met eigen woning (WOZ €540.000) + gekoppelde
 *   hypotheek (€300.000 @ 3,1%), deelneming + DGA-schuld. Bron voor Box 1
 *   (eigen woning), Box 2 en jaarruimte.
 * - Willem — Box 3-vermogen (beleggingen €570k + verhuurd + auto; bank­rekeningen
 *   als cash-spaargeld); geen aanmerkelijk belang (Box 2-leegstaat, WF-BELAST-12).
 *
 * GEVONDEN DISCREPANTIES tussen de UAT-scenariotekst/-verwachting en de code
 * (inline gedocumenteerd; headline-cijfers onaangetast; zie ook het rapport):
 * - WF-BELAST-01 (hub) & 07/08/10/11 — HUB-VS-SUBPAGINA BOX 1-BRON-DIVERGENTIE
 *   (bekend/verwacht): de hub leidt bruto af via `box1JaarruimteStatus`
 *   (netMonthly×12 / (1−marg)); de Box 1-subpagina via
 *   `resolveBox1GrossIncome` → `grossFromNet(cashflow-netto)`. Dat geeft twee
 *   verschillende bruto's → een licht ander Box 1-bedrag op hub vs. subpagina.
 *   De exact-criteria toetsen de SUBPAGINA-bron (grossFromNet); de hub-druk (01)
 *   is daarom `consistency` (aggregatie-invariant), geen los cijfer.
 * - WF-BELAST-13/15 — de persona-deelneming ("Belang Volkert Compleet Holding
 *   BV") heeft GEEN `annual_dividend` in de seed (PersonaAsset kent het veld
 *   niet) → de ÉCHTE Box 2-aanslag van Tessa is €0. `/api/household/box2` zet
 *   bovendien `disposal_gain: 0` hard. We toetsen de staffel-motor daarom met
 *   een REPRESENTATIEF dividend; de €0-realiteit staat in het rapport als gap.
 * - WF-BELAST-14 — Tessa's "Rekening-courant vordering BV" heeft subtype
 *   'rekening_courant' (niet 'dga_lening'), dus de DGA-leen-query in
 *   `/api/household/box2` (`.eq('subtype','dga_lening')`) pikt 'm niet op;
 *   netto DGA = max(0, 0 − 9.000 schuld) = 0 → geen excess. We toetsen de pure
 *   `calculateBox2`-drempel/excess-logica (mirrort WF-SCHULD-20).
 * - WF-BELAST-17/box3-kaart — de box3-KAART-status volgt een heuristiek
 *   (`box3TaxStatus` op `computeBox3TaxableInput`) die van de PURE heffing kan
 *   afwijken (bekend/verwacht). Wij toetsen de pure `calculateBox3`-heffing.
 * - WF-BELAST-10 — `computeJaarruimte` rondt de gecapte ruimte naar €35.588
 *   terwijl de afgeleide `JAARRUIMTE_MAX_2026` €35.589 is (30% × 118.628 =
 *   35.588,4). Cosmetische afrondingsslip; de kaart toont €35.588.
 */

import type { AcceptanceCriterion, AcceptanceSet } from './types'

const criteria: AcceptanceCriterion[] = [
  {
    workflow: 'WF-BELAST-01',
    scenarioId: 'UAT-BELAST-01',
    titel: 'Totale belastingdruk raadplegen op de hub',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa Compleet geladen; /overzicht/belasting toont drie box-kaarten + de "De druk"-sectie (Box 1 + Box 3, excl. Box 2).',
    when: 'De gebruiker leest het hub-totaal (som Box 1 + Box 3) en de verdeling per box.',
    then: 'Het hub-totaal = `buildTaxOverview(box1Tax, null, box3Tax).total` = box1Tax + box3Tax (Box 2 bewust null → buiten het totaal bij aanmerkelijk belang); de verdeling telt op tot 100%; freedomDays = round(total / daguitgaven). Géén hard cijfer: box1Tax leunt op de HUB-bruto-bron (netMonthly×12/(1−marg), ander getal dan de subpagina — zie kop) en box3Tax op `healthScoreInput.taxData` (loader). Daarom een consistentie-toets op de aggregatie, niet één exact totaal.',
    assertion: {
      kind: 'consistency',
      source: 'lib/tax-overview.ts#buildTaxOverview — aggregatie-invariant total = box1+box2+box3, distribution som = 100, freedomDays = round(total/daily); de ruwe box-bedragen leunen op loader-afgeleide netMonthly (effectiveInput) + healthScoreInput.box3Tax en zijn niet puur na te rekenen (hub-vs-subpagina bron-divergentie). tax-overview.test.ts dekt de aggregator exact.',
    },
  },
  {
    workflow: 'WF-BELAST-02',
    scenarioId: 'UAT-BELAST-02',
    titel: 'Via de box-kaarten navigeren (status + KPI + drilldown)',
    kriticiteit: 'BELANGRIJK',
    persona: 'compleet',
    given: 'Persona Tessa geladen op /overzicht/belasting; drie box-kaarten met status-dot + statustekst + KPI.',
    when: 'De gebruiker klikt Box 1 → subpagina, terug, Box 3 → subpagina.',
    then: 'Elke kaart linkt naar de eigen subpagina (/overzicht/belasting/box1|2|3); de status-dot (op koers/aandacht/actie) volgt de canonieke status-helpers (box1JaarruimteStatus / hasBox2Relevance / box3TaxStatus). Pure navigatie/weergave zonder cijfermatige uitkomst.',
    assertion: {
      kind: 'ui-only',
      source: 'client-side navigatie + server-side status-dots; geen hand-narekenbaar cijfer (de status-heuristiek leunt op loader-bundeldata)',
    },
  },
  {
    workflow: 'WF-BELAST-03',
    scenarioId: 'UAT-BELAST-03',
    titel: 'Besparingskansen bekijken en doorklikken',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen; de hub-sectie "De kansen" toont `overview.opportunities` (jaarruimte / tegenbewijs / partner-allocatie / DGA-leengrens).',
    when: 'De gebruiker bekijkt de kansen-lijst en klikt een kans door naar de betreffende box.',
    then: 'De kansen zijn gesorteerd op `savings` desc; de DGA-leengrens-kans (savings 0, waarschuwing) zakt naar onderen; elke kans linkt naar de juiste box-`href`. Alleen de deterministische SORTERING/richting is toetsbaar — welke kansen verschijnen leunt op loader-signalen (jaarruimte/tegenbewijs/partner).',
    assertion: {
      kind: 'direction',
      source: 'lib/tax-overview.ts#buildTaxOverview — opportunities.sort((a,b)=>b.savings−a.savings); de aanwezigheid van elke kans hangt van loader-afgeleide signalen af → richting i.p.v. exact',
    },
  },
  {
    workflow: 'WF-BELAST-04',
    scenarioId: 'UAT-BELAST-04',
    titel: 'Een belastingkans toevoegen als actie',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen; een besparingskans (bv. "Benut je jaarruimte") is zichtbaar op de hub.',
    when: 'De gebruiker voegt de kans toe als actie (Will) en vindt \'m terug in de actielijst.',
    then: 'De kans wordt als actie weggeschreven (DB-mutatie) en verschijnt in de Will-actielijst. Pure UI-/persistentie-workflow zonder cijfermatige uitkomst uit een rekenmotor.',
    assertion: {
      kind: 'ui-only',
      source: 'actie-creatie (DB-insert) + Will-actielijst; geen persona-cijfer uit een rekenmotor te herleiden',
    },
  },
  {
    workflow: 'WF-BELAST-05',
    scenarioId: 'UAT-BELAST-05',
    titel: 'Fiscale kalender raadplegen',
    kriticiteit: 'BELANGRIJK',
    persona: 'compleet',
    given: 'Persona Tessa geladen; de hub-sectie "De kalender" toont de eerstvolgende fiscale deadlines.',
    when: 'De gebruiker leest de kalender (aangifte, voorlopige aanslag, betaaltermijnen).',
    then: 'De deadlines komen uit `getTaxDeadlines(now, 2026)` en tonen label + datum + "over N dagen". De uitkomst is RUNTIME-datum-afhankelijk (de "now"-klok) → geen vast cijfer; tax-calendar.test.ts dekt de deadline-logica.',
    assertion: {
      kind: 'ui-only',
      source: 'lib/tax-calendar.ts#getTaxDeadlines — datum-/klok-afhankelijke weergave, geen persona-cijfer; gedekt door tax-calendar.test.ts',
    },
  },
  {
    workflow: 'WF-BELAST-06',
    scenarioId: 'UAT-BELAST-06',
    titel: 'Vooruitblik stelselwijzigingen lezen',
    kriticiteit: 'OVERIG',
    persona: 'compleet',
    given: 'Persona Tessa geladen; de hub-sectie "De vooruitblik" (stelselradar) is statisch/educatief.',
    when: 'De gebruiker leest de vooruitblik op het nieuwe Box 3-stelsel (2028) en overige stelselwijzigingen.',
    then: 'Statische, educatieve content (geen data-fetch, geen berekening). Pure weergave.',
    assertion: {
      kind: 'ui-only',
      source: 'components/overview/belasting/hub-stelselradar — statische educatieve tekst, geen rekenmotor',
    },
  },
  {
    workflow: 'WF-BELAST-07',
    scenarioId: 'UAT-BELAST-07',
    titel: 'Box 1-druk inzien (hero, waterfall, heffingskortingen, marginale curve)',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen; netto €7.600/mnd (net_monthly_income) → subpagina-bruto = grossFromNet(91.200, 2026) = €160.658; eigen woning WOZ €540.000 + gekoppelde hypotheek (rente €9.300).',
    when: 'De gebruiker opent /overzicht/belasting/box1 en leest de druk-hero (Box 1-belasting, effectief/marginaal tarief, netto besteedbaar) + heffingskortingen.',
    then: 'Bij bruto €160.658 met eigen woning: belastbaar inkomen €153.248 (160.658 − 7.410 eigenwoning-saldo); Box 1-belasting €65.790; effectief tarief 41,0%; marginaal tarief 49,5%; algemene heffingskorting €0 + arbeidskorting €0 (beide volledig afgebouwd bij dit DGA-inkomen); netto besteedbaar €94.868. (Bruto is de SUBPAGINA-bron; de hub gebruikt een andere bron — zie kop.)',
    assertion: {
      kind: 'exact',
      expected: 'belastbaar=153248; tax=65790; effectief=41.0; marginaal=49.5; ahk=0; arbeidskorting=0; netto=94868',
      source: 'lib/box1-tax.ts#computeBox1Tax (year 2026, grossYearlyIncome=grossFromNet(7600×12,2026)=160658, wozValue=540000, hypotheekRente=9300); heffingskortingen volledig afgebouwd boven de afbouwgrenzen 2026',
    },
  },
  {
    workflow: 'WF-BELAST-08',
    scenarioId: 'UAT-BELAST-08',
    titel: 'Bruto-jaarinkomen voor Box 1 aanpassen',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen; de "Geschat bruto"-figuur op de Box 1-hero is aanpasbaar (Box1GrossIncomeEditor).',
    when: 'De gebruiker leest de automatische schatting en zet daarna een handmatig bruto van €120.000.',
    then: 'De automatische schatting = grossFromNet(netto €91.200, 2026) = €160.658 (netto-inversie via de Box 1-motor; round-trip: het netto besteedbaar bij €160.658 ≈ €91.200 op €1 na). Bij handmatig bruto €120.000 wordt de Box 1-belasting €48.491 (herberekend zonder eigen woning-context in de editor-preview).',
    assertion: {
      kind: 'exact',
      expected: 'estimateGross=160658; nettoRoundTrip=91200; taxBij120k=48491',
      source: 'lib/box1-tax.ts#grossFromNet(91200,2026) = 160658 (= resolveBox1GrossIncome.estimateGross voor netto €7.600×12); round-trip via computeBox1Tax(160658).nettoBesteedbaar; computeBox1Tax(120000,2026).tax = 48491',
    },
  },
  {
    workflow: 'WF-BELAST-09',
    scenarioId: 'UAT-BELAST-09',
    titel: 'Eigen woning: forfait vs hypotheekrenteaftrek bekijken',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen; "Eigen woning Amersfoort" (WOZ €540.000) met gekoppelde hypotheek "Hypotheek eigen woning" (€300.000 @ 3,1%). Alleen de aan het eigen_huis gekoppelde hypotheek telt (de aflossingsvrije beleggingshypotheek hangt aan een real_estate-asset).',
    when: 'De gebruiker bekijkt de eigen-woning-kaart; randgevallen: rente 6% en hypotheek ontkoppeld (rente 0).',
    then: 'Basis: eigenwoningforfait = 540.000×0,0035 = €1.890; renteaftrek = round(300.000×0,031) = €9.300; saldo vóór Hillen −7.410 (<0 → geen Hillen), eigenwoning-saldo −€7.410 (aftrekpost). Rente 6% → renteaftrek €18.000, saldo −€16.110. Ontkoppeld (rente 0): Hillen = 1.890×0,718 = €1.357,02, eigenwoning-saldo +€532,98 (teken FLIPT naar bijtelling).',
    assertion: {
      kind: 'exact',
      expected: 'forfait=1890; renteaftrek=9300; saldo=-7410; saldo6pct=-16110; hillenOntkoppeld=1357.02; saldoOntkoppeld=532.98',
      source: 'lib/box1-tax.ts#computeBox1Tax (year 2026, wozValue=540000, hypotheekRente=9300/18000/0) — eigenwoningforfaitRate 0,0035, hillenPct 0,718; Hillen-aftrek alleen wanneer forfait > rente (spiegelt WF-SCHULD-21 op persona compleet)',
    },
  },
  {
    workflow: 'WF-BELAST-10',
    scenarioId: 'UAT-BELAST-10',
    titel: 'Jaarruimte berekenen en lijfrente-inleg simuleren',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen; bruto €160.658 (subpagina-bron), factor A onbekend (geen pension_factor_a in het profiel → resolvePensionFactorA → 0).',
    when: 'De gebruiker leest de jaarruimte-gauge en simuleert een lijfrente-inleg tot de volledige ruimte.',
    then: 'Jaarruimte 2026 = 30% × min(160.658 − 19.172, 137.800 − 19.172) − 6,27×0 = 30% × 118.628 = €35.588 (gecapt op de grondslag-cap; JAARRUIMTE_MAX_2026 €35.589 is de afgeronde referentie). Franchise €19.172. Geschatte belastingbesparing bij volledige benutting = round(35.588 × 49,5% marginaal) = €17.616.',
    assertion: {
      kind: 'exact',
      expected: 'jaarruimte=35588; franchise=19172; max=35589; besparing=17616',
      source: 'lib/jaarruimte.ts#computeJaarruimte(160658, 0, 2026) — grondslag-cap 137.800−19.172, OPBOUW_PCT 0,3, FACTOR_A_IMPUTATIE 6,27; besparing = round(jaarruimte × marginaal_tarief 0,495)',
    },
  },
  {
    workflow: 'WF-BELAST-11',
    scenarioId: 'UAT-BELAST-11',
    titel: 'Jaarruimte per persoon in huishoudweergave',
    kriticiteit: 'BELANGRIJK',
    persona: 'compleet',
    given: 'Persona Tessa geladen (household_type gezin). ⚠ LIVE vereist een ÉCHT tweede account (partner) dat inkomen deelt — de persona-seed heeft geen huishoudlid, dus de tweede JaarruimteCard verschijnt pas na een echt gedeeld partner-inkomen. De engine-check bewijst de per-persoon-rekensom + de partner-privacy-guardrail.',
    when: 'De gebruiker bekijkt "Jaarruimte per persoon": een kaart voor zichzelf (met eigen factor A) en één voor de partner (factor A geforceerd 0).',
    then: 'Jaarruimte is PER PERSOON. De partner-kaart rekent bewust met factor A = 0 (privacy-guardrail: profiles.pension_factor_a is de EIGEN factor A en mag nooit als partner-getal dienen). Effect van factor A: elke €1 factor A verlaagt de ruimte met €6,27. Bij bruto €160.658: factor A 0 → €35.588; factor A €2.000 → €35.588 − 6,27×2.000 = €23.048 (verschil €12.540). De partner (factor A 0) houdt dus de volle €35.588.',
    assertion: {
      kind: 'exact',
      expected: 'jaarruimteZonderFactorA=35588; jaarruimteMetFactorA2000=23048; imputatieVerschil=12540',
      source: 'lib/jaarruimte.ts#computeJaarruimte(160658, 0 vs 2000, 2026) — FACTOR_A_IMPUTATIE 6,27; verschil = 6,27 × 2.000 = 12.540 (bewijst de partner-guardrail factor A=0 én de per-persoon-aftrek)',
    },
  },
  {
    workflow: 'WF-BELAST-12',
    scenarioId: 'UAT-BELAST-12',
    titel: 'Box 2 eerste gebruik: relevantie-detectie en lege staat',
    kriticiteit: 'BELANGRIJK',
    persona: 'willem',
    given: 'Persona Willem geladen — geen deelneming, geen DGA-vordering, geen DGA-schuld (assets: beleggingen/pensioen/woning; debts: []).',
    when: 'De gebruiker opent /overzicht/belasting/box2.',
    then: 'De relevantie-detectie (`hasBox2Relevance`) geeft false → de pagina toont de rustige empty-state ("Geen aanmerkelijk belang gevonden") i.p.v. een lege rekenkaart. Server-side DB-detectie zonder cijfermatige uitkomst; `calculateBox2` met lege deelnemingen zou €0 geven maar wordt hier niet getoond.',
    assertion: {
      kind: 'ui-only',
      source: 'lib/box2-relevance.ts#hasBox2Relevance (DB-query op deelneming/DGA-vordering/DGA-schuld) → false voor Willem → empty-state; geen persona-cijfer uit een rekenmotor',
    },
  },
  {
    workflow: 'WF-BELAST-13',
    scenarioId: 'UAT-BELAST-13',
    titel: 'Box 2-aanslag inzien als DGA',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen (DGA met deelneming "Belang Volkert Compleet Holding BV"). ⚠ De persona-seed zet GEEN annual_dividend → de ÉCHTE aanslag is €0 (zie kop/rapport). We toetsen de staffel-motor met een representatieve DGA-dividenduitkering van €100.000 (single, geen fiscaal partner → eerste-schijfgrens €68.843).',
    when: 'De gebruiker bekijkt de Box 2-aanslag over een uitgekeerd dividend van €100.000.',
    then: 'Staffel 2026 (single): laag tarief 24,5% tot €68.843, hoog 31% daarboven. taxLaag = 68.843×0,245 = €16.866,54; taxHoog = (100.000−68.843)×0,31 = €9.658,67; totale heffing €26.525,21; effectief tarief 26,53%.',
    assertion: {
      kind: 'exact',
      expected: 'totalIncome=100000; taxLaag=16866.54; taxHoog=9658.67; totaleHeffing=26525.21; effectief=26.53',
      source: 'lib/box2-data.ts#calculateBox2 (year 2026, hasPartner false → grens €68.843, tariefLaag 0,245 / tariefHoog 0,31) op één deelneming met annual_dividend €100.000, disposal_gain 0',
    },
  },
  {
    workflow: 'WF-BELAST-14',
    scenarioId: 'UAT-BELAST-14',
    titel: 'DGA-leengrens bewaken (Wet excessief lenen)',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen (DGA-schuld "Rekening-courant schuld BV" €9.000). ⚠ De DGA-vordering "Rekening-courant vordering BV" heeft subtype \'rekening_courant\' (niet \'dga_lening\') → valt buiten de leen-query in /api/household/box2 (zie kop). We toetsen de pure drempel/excess-logica.',
    when: 'De gebruiker verhoogt (randgeval) het DGA-leentotaal richting/over de €500.000-drempel.',
    then: 'Drempel = DGA_LENING_DREMPEL = €500.000. Bij totaal €200: bovenmatig deel €0. Bij totaal €550.000: bovenmatig deel = 550.000 − 500.000 = €50.000 (rode waarschuwing, belast als fictief regulier voordeel in Box 2).',
    assertion: {
      kind: 'exact',
      expected: 'drempel=500000; excessOnder=0; excessBoven=50000',
      source: 'lib/box2-data.ts#calculateBox2 → dgaLeningenDrempel (DGA_LENING_DREMPEL) + dgaLeningenExcess = max(0, totaal − drempel) (year 2026; mirrort WF-SCHULD-20)',
    },
  },
  {
    workflow: 'WF-BELAST-15',
    scenarioId: 'UAT-BELAST-15',
    titel: 'Dividend-schijfsimulator gebruiken',
    kriticiteit: 'BELANGRIJK',
    persona: 'compleet',
    given: 'Persona Tessa geladen (DGA); de dividend-schijfsimulator laat een dividendbedrag variëren rond de eerste-schijfgrens (single €68.843, 2026).',
    when: 'De gebruiker zet een dividend van €50.000 (onder de grens) en daarna €80.000 (boven de grens).',
    then: 'Onder de grens (€50.000): alleen laag tarief → taxHoog €0, totale heffing = 50.000×0,245 = €12.250. Boven de grens (€80.000): laag deel 68.843×0,245 = €16.866,54 + hoog deel (80.000−68.843)×0,31 = €3.458,67 → totale heffing €20.325,21. De omslag (taxHoog van 0 → positief) ligt op de grens €68.843.',
    assertion: {
      kind: 'exact',
      expected: 'onderGrensTaxHoog=0; onderGrensTotaal=12250; bovenGrensTaxLaag=16866.54; bovenGrensTaxHoog=3458.67; bovenGrensTotaal=20325.21',
      source: 'lib/box2-data.ts#calculateBox2 (year 2026, hasPartner false, grens €68.843) op dividend €50.000 (onder) resp. €80.000 (boven) — de staffel-omslag',
    },
  },
  {
    workflow: 'WF-BELAST-16',
    scenarioId: 'UAT-BELAST-16',
    titel: 'Gecombineerde druk Vpb + Box 2 lezen',
    kriticiteit: 'OVERIG',
    persona: 'compleet',
    given: 'Persona Tessa geladen (DGA); de educatieve kaart "Gecombineerde druk Vpb + Box 2" toont de band waarbinnen winst-via-dividend werkelijk belast wordt.',
    when: 'De gebruiker leest de laagste en hoogste gecombineerde druk.',
    then: 'Winst wordt eerst met Vpb belast, het restant nog eens in Box 2: gecombineerd = Vpb + (1−Vpb)×Box2. Laagste = 19% + 81%×24,5% = 38,84%; hoogste = 25,8% + 74,2%×31% = 48,80% (vergelijkbaar met loon in de hoogste Box 1-schijf, 49,5%).',
    assertion: {
      kind: 'exact',
      expected: 'minDrukPct=38.84; maxDrukPct=48.80',
      source: 'lib/box2-data.ts VPB_PARAMS[2026] (19% / 25,8%) + BOX2_PARAMS[2026] (24,5% / 31%) via gecombineerd = Vpb + (1−Vpb)×Box2 (spiegelt components/overview/belasting/box2-gecombineerde-druk.tsx; formule daar lokaal, zie verbetervoorstel)',
    },
  },
  {
    workflow: 'WF-BELAST-17',
    scenarioId: 'UAT-BELAST-17',
    titel: 'Box 3-aanslag inzien, berekeningsstappen en classificatie controleren',
    kriticiteit: 'KERN',
    persona: 'willem',
    given: 'Persona Willem geladen (single, geen fiscaal partner). Box 3-vermogen: cash-bankrekeningen €57.700 (8.500+45.000+4.200 → spaargeld), DEGIRO €570.000 + verhuurde garage €35.000 + BMW €22.000 → beleggingen €627.000; ABP-pensioen (fiscaal voordeel) + eigen woning zijn UITGESLOTEN (Box 1). Geen schulden.',
    when: 'De gebruiker opent /overzicht/belasting/box3 en controleert de berekeningsstappen + classificatie.',
    then: 'Spaargeld €57.700, beleggingen €627.000; forfaitair spaargeld 57.700×1,28% = €738,56; forfaitair beleggingen 627.000×6,00% = €37.620; rendementsgrondslag €684.700; heffingsvrij €59.357; grondslag sparen €625.343; box3-inkomen €35.033,24; Box 3-belasting €12.612 (36% × inkomen). ABP + eigen woning classificeren als "uitgesloten".',
    assertion: {
      kind: 'exact',
      expected: 'spaargeld=57700; beleggingen=627000; rendementsgrondslag=684700; grondslagSparen=625343; box3Income=35033.24; tax=12612',
      source: 'lib/box3-data.ts#calculateBox3 (year 2026, hasPartner false) op Willem: bankrekeningen als cash-assets (seed-persona zet bank_accounts → asset_type cash) + persona.assets; forfaits 2026 spaargeld 0,0128 / beleggingen 0,0600, heffingsvrij single €59.357, tarief 36%',
    },
  },
  {
    workflow: 'WF-BELAST-18',
    scenarioId: 'UAT-BELAST-18',
    titel: 'Tegenbewijs simuleren (werkelijk vs forfaitair rendement)',
    kriticiteit: 'KERN',
    persona: 'willem',
    given: 'Persona Willem geladen; het forfaitaire Box 3-resultaat (bezittingen €684.700, heffing €12.612) is de basis voor de tegenbewijs-vergelijking.',
    when: 'De gebruiker voert een werkelijk rendement van 3% in.',
    then: 'Werkelijk rendement in euro = 684.700×3% = €20.541; werkelijke heffing = 20.541×36% = €7.394,76; dat is lager dan de forfaitaire €12.612 → gunstigste = "werkelijk"; besparing = 12.611,97 − 7.394,76 = €5.217,21 (de app kiest automatisch het werkelijke rendement).',
    assertion: {
      kind: 'exact',
      expected: 'forfaitair=12612; werkelijkEur=20541.00; werkelijkeHeffing=7394.76; gunstigste=werkelijk; besparing=5217.21',
      source: 'lib/box3-tegenbewijs.ts#compareForfaitairVsWerkelijk op het forfaitaire calculateBox3-resultaat van Willem (year 2026, werkelijkRendementPct 3, geen renteschuld); besparing = forfaitair.tax − werkelijke heffing',
    },
  },
  {
    workflow: 'WF-BELAST-19',
    scenarioId: 'UAT-BELAST-19',
    titel: 'Box 3-vermogen verdelen met je fiscale partner',
    kriticiteit: 'KERN',
    persona: 'willem',
    given: 'Persona Willem geladen; Box 3-totalen spaargeld €57.700 + beleggingen €627.000 (schulden €0). ⚠ LIVE vereist een fiscaal partner in het huishouden; de engine-check bewijst de verdeel-rekensom (elke partner een eigen heffingsvrij vermogen).',
    when: 'De gebruiker verdeelt het vermogen 50/50 over zichzelf en de fiscale partner.',
    then: 'Bij een 50/50-verdeling krijgt ELKE partner het eigen heffingsvrij vermogen (single €59.357 p.p.): partner 1 €5.707 + partner 2 €5.707 = totaal €11.415 — lager dan de solo-heffing €12.612 (het dubbele heffingsvrij vermogen bespaart ~€1.197). Verder optimaliseren (optimizePartnerAllocation) kan het totaal nog iets drukken.',
    assertion: {
      kind: 'exact',
      expected: 'partner1Tax=5707; partner2Tax=5707; totaleTax=11415; soloTax=12612',
      source: 'lib/box3-data.ts#calculatePartnerSplit (year 2026) op de helft van Willems box3-totalen per partner; solo-heffing via calculateBox3 (hasPartner false)',
    },
  },
  {
    workflow: 'WF-BELAST-21',
    scenarioId: 'UAT-BELAST-21',
    titel: 'Peildatum, arbitragevenster en het nieuwe stelsel (2028) lezen',
    kriticiteit: 'OVERIG',
    persona: 'compleet',
    given: 'Persona Tessa geladen; de Box 3-subpagina + hub tonen de peildatum-uitleg (1 januari), het arbitragevenster en de vooruitblik op het stelsel-2028.',
    when: 'De gebruiker leest de peildatum-uitleg en de stelsel-vooruitblik.',
    then: 'Statische, educatieve content: de Box 3-waarde wordt gemeten op 1 januari; grote aankopen vlak vóór die datum verlagen tijdelijk het vermogen (arbitragevenster). Pure weergave, geen berekening.',
    assertion: {
      kind: 'ui-only',
      source: 'BOX3_TOOLTIPS.peildatum + hub-stelselradar — statische educatieve tekst, geen rekenmotor',
    },
  },
]

export const BELAST_ACCEPTANCE: AcceptanceSet = {
  zone: 'BELAST',
  criteria,
}
