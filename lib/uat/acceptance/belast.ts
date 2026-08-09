/**
 * Acceptatiecriteria — domein Belasting (WF-BELAST-01..19, 21, 23..24 /
 * UAT-BELAST-01..19, 21, 23..24).
 *
 * Bron: `lib/uat/catalog.ts` (bron-van-waarheid voor WELKE scenario's bestaan)
 * + de Box 1/2/3-rekenmotoren. Cijfers zijn ONAFHANKELIJK narekend uit
 * `lib/test-personas.ts` — nooit overgenomen uit wat de app toont (zie
 * `belast.engine.test.ts` voor de daadwerkelijke toets tegen de échte
 * rekenfuncties: `computeBox1Tax`/`grossFromNet` (box1-tax.ts),
 * `calculateBox2`/`VPB_PARAMS` (box2-data.ts), `calculateBox3`/
 * `calculatePartnerSplit` (box3-data.ts), `compareForfaitairVsWerkelijk`
 * (box3-tegenbewijs.ts), `computeJaarruimte` (jaarruimte.ts), en sinds de
 * herbouw van /overzicht/belasting/optimizer (Fase 1) ook `pickTopChoice`/
 * `generateBox3Strategies`/`rankStrategies`/`buildCurrentStanding`
 * (lib/tax-optimizer/*)); sinds Fase 2 plak A ook de verloop-rij
 * (`TaxTrajectory`/`buildTrajectory`) en de shift-verkenner
 * (`ShiftCurvePoint[]`/`buildShiftCurve`) uit hetzelfde bestand; sinds Fase 3
 * ook katern IV — de variantensweep (`runVariantenSweep`/`finaliseerVarianten`/
 * `bepaalDiskwalificatie`/`kiesWinnaar`, lib/tax-lifetime/varianten-sweep.ts)
 * bovenop de levenslange-belastingreeks (`computeLifetimeTax`,
 * lib/tax-lifetime/lifetime-tax.ts).
 *
 * BEWUST WEGGELATEN (verwijsregels, bestaan NIET als los BELAST-scenario in de
 * catalogus — spiegelt WF-SCHULD-19):
 *  - WF-BELAST-20 (perspectief wisselen) → dekt UAT-NAV (perspectief-switcher).
 *  - WF-BELAST-22 (pagina-uitleg (i) + statuspunt) → dekt UAT-NAV.
 * Deze set heeft dus PRECIES 23 criteria (WF-BELAST-01..19, 21, 23..25).
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
 * - WF-BELAST-14 — DGA-leentotaal (Wet excessief lenen). GEFIXT (kaart 39bf9e8d,
 *   optie B): de route bouwt `dgaLeningenTotal` nu op als som(dga_schuld) +
 *   som(dga_lening-vorderingen) via `lib/box2-dga-lening.ts` (was: vorderingen −
 *   schulden, teken omgekeerd). Tessa's "Rekening-courant vordering BV" heeft nu
 *   het geldige subtype 'dga_lening' (was seed-drift 'rekening_courant') → telt
 *   mee: totaal €35.000 vordering + €9.000 schuld = €44.000 (< €500k → excess 0).
 *   We toetsen zowel de aggregatie (`box2-dga-lening.ts`) als de drempel/excess
 *   (`calculateBox2`) — incl. de kernbug-regressie (pure dga_schuld €600k → €100k
 *   bovenmatig, vroeger foutief €0).
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
    then: 'Het hub-totaal = `buildTaxOverview(box1Tax, null, box3Tax).total` = box1Tax + box3Tax (Box 2 bewust null → buiten het totaal bij aanmerkelijk belang); de verdeling telt op tot 100%; freedomDays = round(total / daguitgaven). Box3Tax kwam voorheen uit de `healthScoreInput.taxData`-proxy (buildTaxData), die schulden — incl. de eigenwoninghypotheek — negeerde; de hub leest nu `horizonData.box3Tax` (dezelfde canonieke `calculateBox3`-uitkomst als de Box 3-subpagina, personal-perspectief) en overschrijft dat bij household/partner met de perspectief-heffing uit de gedeelde kansen-loader. Box1Tax is sinds ADR 0086 óók A=B met de subpagina: de hub leest de CANONIEKE bruto-bron (`resolveBox1GrossIncome` — schijfinversie + handmatige override) i.p.v. de sync status-heuristiek `box1JaarruimteStatus` (netMonthly×12/(1−marg)). Die heuristiek voedt nog uitsluitend de sidebar-dot; het restverschil rond de grens `jaarruimte = 0` is bewust en gedocumenteerd.',
    assertion: {
      kind: 'consistency',
      source: 'lib/tax-overview.ts#buildTaxOverview — aggregatie-invariant total = box1+box2+box3, distribution som = 100, freedomDays = round(total/daily); box1Tax = computeBox1Tax over resolveBox1GrossIncome via lib/tax-opportunities-loader.ts#loadFiscaleKansen (A=B met /overzicht/belasting/box1); box3Tax = horizonData.box3Tax resp. de perspectief-heffing uit dezelfde loader (canonieke calculateBox3, A=B met /overzicht/belasting/box3). tax-overview.test.ts dekt de aggregator exact.',
    },
  },
  {
    workflow: 'WF-BELAST-02',
    scenarioId: 'UAT-BELAST-02',
    titel: 'Via de box-kaarten navigeren (status + KPI + drilldown)',
    kriticiteit: 'BELANGRIJK',
    persona: 'compleet',
    given: 'Persona Tessa geladen op /overzicht/belasting; de box-kaarten met status-dot + statustekst + KPI. Sinds BEL-1 verschijnt de Box 2-kaart ALLEEN bij aanmerkelijk belang (`hasBox2Relevance`): zonder deelneming/DGA-positie staan er twee kaarten (Werk + woning, Sparen + beleggen) in een twee-koloms rij met kicker "De twee boxen"; mét aanmerkelijk belang drie. Dit geldt in álle weergavemodi.',
    when: 'De gebruiker klikt Box 1 → subpagina, terug, Box 3 → subpagina.',
    then: 'Elke getoonde kaart linkt naar de eigen subpagina (/overzicht/belasting/box1|2|3); de status-dot (op koers/aandacht/actie) volgt de canonieke status-helpers (box1JaarruimteStatus / hasBox2Relevance / box3TaxStatus). /overzicht/belasting/box2 blijft altijd bereikbaar via de navigatie, óók wanneer de tegel ontbreekt. Pure navigatie/weergave zonder cijfermatige uitkomst.',
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
    given: 'Persona Tessa geladen; de hub-sectie "De kansen" toont `loadFiscaleKansen(...).taxOpportunities` — dezelfde kansen als de fiscale optimizer (jaarruimte-lijfrente / samenstelling-shift / fiscale partnerverdeling), niet meer de aparte signalen-lijst van buildTaxOverview.',
    when: 'De gebruiker bekijkt de kansen-lijst en klikt een kans door (Box 1-jaarruimte → box1-uitleg, Box 3-scenario → de optimizer).',
    then: 'De kansen zijn gesorteerd op NETTO effect desc (bruto besparing als tiebreak) en de kop-euro per regel is dat netto effect; kansen met `netEffect ≤ 0` staan er NIET — een Box 3-verschuiving die meer verwacht rendement kost dan ze belasting bespaart is geen besparingskans. De "waarschuwing zonder besparing"-variant (DGA-leengrens, savings 0) bestaat daarmee niet meer. Alleen de deterministische SORTERING/toelating is toetsbaar — welke kansen verschijnen leunt op loader-afgeleide signalen.',
    assertion: {
      kind: 'direction',
      source: 'lib/tax-optimizer/opportunities.ts#toTaxOpportunities — filter(netEffect > 0) + sort((a,b)=>b.netEffect−a.netEffect || b.savings−a.savings), gedekt door lib/tax-optimizer/opportunities.test.ts; de aanwezigheid van elke kans hangt van loader-afgeleide signalen af → richting i.p.v. exact',
    },
  },
  {
    workflow: 'WF-BELAST-04',
    scenarioId: 'UAT-BELAST-04',
    titel: 'Een belastingkans toevoegen als actie',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen; een besparingskans (bv. "Benut je jaarruimte") is zichtbaar op de hub.',
    when: 'De gebruiker voegt de kans toe als actie (Fin) en vindt \'m terug in de actielijst.',
    then: 'De kans wordt als actie weggeschreven (DB-mutatie) en verschijnt in de Fin-actielijst. Pure UI-/persistentie-workflow zonder cijfermatige uitkomst uit een rekenmotor.',
    assertion: {
      kind: 'ui-only',
      source: 'actie-creatie (DB-insert) + Fin-actielijst; geen persona-cijfer uit een rekenmotor te herleiden',
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
    given: 'Persona Tessa geladen; netto €7.600/mnd (net_monthly_income) → subpagina-bruto = grossFromNet(91.200, 2026) = €160.658; eigen woning WOZ €540.000 + gekoppelde hypotheek (rente €9.300). WEERGAVEMODUS (BEL-4/APP-7): de vier onderstaande cijfers (effectief tarief, marginaal tarief, netto besteedbaar, "Geschat bruto") zijn zelf mode-onafhankelijk berekend — `computeBox1Tax` draait ongeacht modus. Wat ZICHTBAAR is op de figures-strip verschilt: in **Volledig** staan alle vier de cellen; in **Eenvoudig** kapt `FiguresStrip` af tot 2 (`simpleFigures`) — Effectief tarief + Netto besteedbaar (de vraag "wat kost het en wat houd ik over"); "Geschat bruto" (bewerkbaar, zie WF-BELAST-08) en het marginale tarief staan dan alleen in Volledig.',
    when: 'De gebruiker opent /overzicht/belasting/box1 en leest de druk-hero (Box 1-belasting, effectief/marginaal tarief, netto besteedbaar) + heffingskortingen (in Eenvoudig: alleen effectief tarief + netto besteedbaar op de strip zelf; de overige waarden gelden ongewijzigd voor de rest van de hero/waterfall).',
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
    given: 'Persona Tessa geladen; de "Geschat bruto"-figuur op de Box 1-hero is aanpasbaar (Box1GrossIncomeEditor). WEERGAVEMODUS (BEL-4): deze cel staat op index 0 van de figures-strip en zit NIET in de `simpleFigures`-selectie (Effectief tarief + Netto besteedbaar) — dus alleen in **Volledig** zichtbaar/bewerkbaar. In **Eenvoudig** is deze editor niet bereikbaar via de strip.',
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
    then: 'Jaarruimte 2026 = 30% × min(160.658 − 19.172, 137.800 − 19.172) − 6,27×0 = 30% × 118.628 = €35.588 (gecapt op de grondslag-cap; JAARRUIMTE_MAX_2026 €35.589 is de afgeronde referentie). Franchise €19.172. Geschatte belastingbesparing bij volledige benutting (marginaal-correct = computeBox1Tax(160.658).tax − computeBox1Tax(160.658 − 35.588).tax, ADR 0040/0041 — vangt schijfovergangen én heffingskorting-afbouw, i.t.t. de oude vlakke inleg × marginaal-benadering) = €18.127.',
    assertion: {
      kind: 'exact',
      expected: 'jaarruimte=35588; franchise=19172; max=35589; besparing=18127',
      source: 'lib/jaarruimte.ts#computeJaarruimte(160658, 0, 2026) — grondslag-cap 137.800−19.172, OPBOUW_PCT 0,3, FACTOR_A_IMPUTATIE 6,27; besparing = jaarruimteBesparing(160658, 35588, 2026) = marginaal-correcte som via computeBox1Tax(gross) − computeBox1Tax(gross − inleg), ADR 0041',
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
    given: 'Persona Tessa geladen: DGA-schuld "Rekening-courant schuld BV" €9.000 + DGA-vordering "Rekening-courant vordering BV" €35.000 (subtype dga_lening). Het DGA-leentotaal = som(dga_schuld) + som(dga_lening-vorderingen) (optie B, box2-dga-lening.ts); de route voedt dat aan calculateBox2.',
    when: 'De gebruiker registreert DGA-leningen richting/over de €500.000-drempel; getoetst worden de aggregatie én de drempel/excess.',
    then: 'Drempel = DGA_LENING_DREMPEL = €500.000. (a) Alleen een dga_schuld €600.000 (geen vordering) → totaal €600.000 → bovenmatig deel €100.000 (de kernbug: vroeger foutief €0 door omgekeerd teken). (b) dga_schuld €400.000 + dga_lening-vordering €200.000 → totaal €600.000 → bovenmatig deel €100.000 (som kruist de drempel). (c) Tessa: €9.000 schuld + €35.000 vordering = totaal €44.000 → bovenmatig deel €0.',
    assertion: {
      kind: 'exact',
      expected: 'drempel=500000; totaalA=600000; excessA=100000; totaalB=600000; excessB=100000; tessaTotaal=44000; tessaExcess=0',
      source: 'lib/box2-dga-lening.ts#dgaLeningTotalForUser (aggregatie: som dga_schuld + som dga_lening-vorderingen) → lib/box2-data.ts#calculateBox2 dgaLeningenExcess = max(0, totaal − DGA_LENING_DREMPEL) (year 2026; mirrort de route /api/household/box2)',
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
  {
    workflow: 'WF-BELAST-23',
    scenarioId: 'UAT-BELAST-23',
    titel: 'Fiscale optimizer: leidende kans op netto effect, vergelijking en huidige stand',
    kriticiteit: 'KERN',
    persona: 'willem',
    given:
      'Persona Willem geladen op /overzicht/belasting/optimizer (single, geen fiscaal partner → geen partnerverdeling-kans). Katern I ("Waar je nu staat") toont `standing = buildCurrentStanding(current, dailyExpenses)` op het Box 3-resultaat van Willem (spaargeld €57.700, beleggingen €627.000, heffing €12.612 — zie WF-BELAST-17). Katern II rankt de Box 3-scenario\'s + de jaarruimte-kans; katern IV toont precies één Wft-callout (`OPTIMIZER_DISCLAIMER_SHORT` = "Indicatie, geen advies.").',
    when:
      'De gebruiker leest de leidende kans bovenaan, opent de vergelijkingstabel ("Niets doen" als eerste kolom, bruto besparing / rendementseffect / netto effect als aparte rijen) en de figures-strip in katern I.',
    then:
      'Willems enige Box 3-kans (alle beleggingen naar spaargeld) heeft een NEGATIEF netto effect: de bruto belastingbesparing weegt niet op tegen het verwachte misgelopen rendement (`returnCostEur` = round(beleggingen × (DEFAULT_RETURN − EXPECTED_SAVINGS_RETURN))) — die kans wordt daarom NOOIT als leidende kans getoond (`pickTopChoice` filtert elke kandidaat met netEffect ≤ 0). Is er daarnaast een netto-positieve kans (bv. de jaarruimte-kans, die geen rendementsverlies kent), dan wint díe de leidende plek. `buildCurrentStanding` spiegelt katern I 1-op-1 op het echte `Box3Result` (tax/spaargeld/beleggingen ongewijzigd overgenomen, geen eigen som). Katern IV toont precies één disclaimer.',
    assertion: {
      kind: 'exact',
      expected:
        'shiftNetNegative=true; topKind=jaarruimte; topTitle=Benut je jaarruimte (lijfrente); standingTax=12612; standingSpaargeld=57700; standingBeleggingen=627000',
      source:
        'lib/tax-optimizer/box3-strategies.ts#generateBox3Strategies (samenstelling-shift, returnCostEur/netEffect) + rank.ts#pickTopChoice (netEffect≤0 valt af, netFreedomDays wint) + box3-strategies.ts#buildCurrentStanding, op het echte Box3Result van Willem (calculateBox3, year 2026); jaarruimte-kans representatief via computeJaarruimte/jaarruimteBesparing op het bruto-inkomen van persona compleet (zelfde representatieve-cijfer-precedent als WF-BELAST-13)',
    },
  },
  {
    workflow: 'WF-BELAST-24',
    scenarioId: 'UAT-BELAST-24',
    titel: 'Fiscale optimizer (Fase 2): verloop over de jaren en de shift-verkenner',
    kriticiteit: 'KERN',
    persona: 'willem',
    given:
      'Persona Willem geladen op /overzicht/belasting/optimizer. Katern II ("De vergelijking") toont ná de netto-sluitrij een "Verloop"-groep met per kans de heffing 2025 · 2026 · ≈2028-indicatie (`TaxTrajectory` op `OptimizerStrategy`, `buildTrajectory` in box3-strategies.ts — 2025/2026 via `calculateBox3` per jaar op dezelfde samenstelling, 2028-indicatie via `compareForfaitairVsWerkelijk` met het gewogen rendement (spaargeld×EXPECTED_SAVINGS_RETURN + beleggingen×verwacht beleggingsrendement)/bezittingen, waarbij dat beleggingsrendement de profiel-instelling van de gebruiker is (`Box3OptimizerInput.expectedReturn` ← `resolveFireParams(...).grossReturn`) met DEFAULT_RETURN als terugval). Katern III (kans-detail) toont bij de samenstelling-shift-kans de shift-verkenner: een SVG met 21 doorgerekende punten (`ShiftCurvePoint[]`, SHIFT_CURVE_STEPS=20, 5%-stappen van 0–100% van de beleggingen) en een index-based snap-slider — géén client-interpolatie.',
    when:
      'De gebruiker leest de Verloop-rij voor "Niets doen" en voor elke kans, en opent daarna de shift-verkenner in het kans-detail van de samenstelling-shift-kans.',
    then:
      'De baseline-trajectory (Willems huidige samenstelling) heeft tax2026 gelijk aan de al bekende Box3-heffing (€12.612, `buildTrajectory` hergebruikt dezelfde `calculateBox3`-uitkomst voor het actieve jaar — geen tweede som). Kansen zonder doorgerekend verloop tonen een streepje met een vaste notitie i.p.v. een verzonnen cijfer: de partnerverdeling-kans (trajectory bewust `null` — "verdeling is voor 2026 doorgerekend", een andere jaartabel/zoekruimte is niet doorgerekend) en de jaarruimte-kans (trajectory `null` — "n.v.t. — deze kans zit in Box 1", buiten Box 3). De shift-verkenner telt 21 punten; het rechter-uiterste punt (100% verschoven) is byte-identiek aan de samenstelling-shift-strategie uit katern II (zelfde tax/savings/returnCostEur/netEffect — het scenario in de kassabon en het curve-eindpunt zijn dezelfde aanroep). BELANGRIJK inhoudelijk feit: de curve is AFFIEN — de marginale besparing per verschoven euro is constant over alle 20 stappen; de heffingsvrije vrijstelling werkt als schaalfactor op grondslagSparen, niet als knik in de curve. Dit is vergrendeld in `lib/tax-optimizer/box3-optimizer.test.ts` ("de curve is affien") — een toekomstige "knik bij de vrijstelling"-verwachting is dus GEEN bug.',
    assertion: {
      kind: 'exact',
      expected:
        'curvePoints=21; endMatchesShift=true; marginalConstant=true; baselineTax2026=12612; baselineTax2026EqCurrent=true; partnerverdelingTrajectory=null; jaarruimteNote=n.v.t. — deze kans zit in Box 1',
      source:
        'lib/tax-optimizer/box3-strategies.ts#generateBox3Strategies (buildTrajectory + buildShiftCurve) + #baselineStrategy, op het echte Box3Result van Willem (calculateBox3, year 2026); trajectory=null-gevallen spiegelen components/overview/belasting/optimizer-compare.tsx#trajectoryNote; affiene curve vergrendeld in lib/tax-optimizer/box3-optimizer.test.ts',
    },
  },
  {
    workflow: 'WF-BELAST-25',
    scenarioId: 'UAT-BELAST-25',
    titel: 'Fiscale optimizer (Fase 3): drie onttrekkingsvolgordes over je hele looptijd vergeleken',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given:
      'Persona Tessa Compleet geladen op /overzicht/belasting/optimizer. Katern IV ("Wanneer je je pensioenpot aanspreekt") is ALTIJD zichtbaar maar rekent pas na een expliciete klik op "Reken de drie varianten door" (fasen uitnodiging → bezig → klaar/geen-plan/fout); vóór die klik gebeurt er geen `/api/belasting/varianten-sweep`-fetch en geen kernel-run. Na de klik draaien drie kernel-solves client-side via de kernel-worker (`runVariantenSweepAsync`, lazy geïmporteerd) op de server-geleverde snapshot.',
    when:
      'De gebruiker start de sweep en leest de vergelijkingstabel (Box 3 / Box 1 die de cashflow niet inhield / totale druk, dan onder "Wat er overblijft" het belegbaar vermogen én de resterende pensioenpot, "je bent vrij vanaf", verschil met de referentie) en de kanttekeningen eronder.',
    then:
      'De drie varianten (`huidige-volgorde` = referentie/ongewijzigde `pot_rules`, `pensioen-laatst` = prio 5 op `categorie_prios.onttrekking.Pensioen`, `pensioen-eerst` = prio 1) leveren aantoonbaar VERSCHILLENDE onttrekkings-prio-vectoren op — anders dan de vier `WITHDRAWAL_ORDER_PRESETS`, waar `liquide-eerst` en `pensioen-sparen` ná de kernel-klem (`min(i+1,4)` in `orderedGroupsToPrio`) op precies dezelfde vector samenvallen (de mapping-val die deze sweep vermijdt door de V5-categorie-overlay te gebruiken, niet de presets). Rangschikking: laagste `levenslangeTotaleDrukNominaal`, met twee vetorechten in VASTE volgorde — een uitgeputte laagste buffer (`bedrag ≤ 0,01`, `BUFFER_UITPUTTING_TOLERANTIE_EUR`) gaat vóór "FIRE later dan de referentie"; treft een variant beide, dan is het buffer-veto de getoonde reden. Een variant met `kernelFout` (alle getallen `null`) krijgt GEEN diskwalificatie-reden — dat zou een uitspraak zijn over een run die nooit heeft gedraaid — en telt niet mee in de ranking. Elke variant draagt het eindvermogen op DRIE benoemde grondslagen: `eindvermogenNettoNominaal` (incl. niet-liquide bezit), `eindvermogenBelegbaarNominaal` (dezelfde grondslag als de laagste buffer; netto altijd ≥ belegbaar) en `eindvermogenPensioenNominaal` — de resterende pensioenpot, afgeleid van de KERN-categorie \'Pensioen\' via de canonieke `ASSET_TYPE_TO_CATEGORIE`, dus `retirement` ÉN `levensverzekering`, nooit een eigen typelijst. De tabel toont er TWEE, als APARTE regels onder "Wat er overblijft": het belegbaar vermogen en de resterende pensioenpot. Die tweede regel is een harde eis en geen extraatje — `spendablePortfolio` slaat de pensioenpot per constructie over (`NON_SPENDABLE_ASSET_TYPES`), precies de pot waar deze sectie over gaat, waardoor de variant die het pensioen uitstelt zichtbaar het armst oogde terwijl ze juist het meeste overhoudt; de pot volgt de lever aantoonbaar (pensioen-laatst > huidige volgorde > pensioen-eerst). De grondslagen worden nooit opgeteld en nooit op één as gemengd (ze overlappen bovendien met de levensverzekering-pot, die vandaag óók in de belegbare grondslag zit); het netto eindvermogen incl. niet-liquide bezit blijft buiten de tabel. Juist door die overlap mag het onderschrift van de belegbare regel GEEN disjunctheid beloven ("je pensioen staat hieronder" o.i.d.): dat zou de lezer uitnodigen de twee regels op te tellen en zijn vermogen te overschatten — dezelfde leesfout als het defect dat de pensioenregel repareert, alleen omgekeerd van teken. De groepskop draagt in plaats daarvan de note "twee aparte grondslagen — niet bij elkaar optellen", en de pensioenregel meldt dat er nog Box 1 overheen komt (de pot is bruto, terwijl de Box 3-heffing op de belegbare regel al ín de kernel-cashflow zit — de twee vrijheidstijd-noten zijn dus niet onderling vergelijkbaar). Onder de tabel staan zeven kanttekeningen (was vijf vóór Fase 3); de zesde gaat over de arbeidskorting-afwijking in `computeBox1Tax` (kent de korting ook toe over pensioeninkomen, wat de heffing in het gangbare bereik onderschat — het sterkst vóór de AOW-leeftijd, precies waar "pensioen vroeg" onttrekt), de zevende benoemt de levensverzekering-overlap zodat de gebruiker de niet-optelbaarheid ook zonder broncode kan zien.',
    assertion: {
      kind: 'exact',
      expected:
        'prioReferentie=4; prioLaatst=5; prioEerst=1; variantOverlaysDiffer=true; presetsCollide=true; vetoOrder=buffer-uitgeput; kernelFoutNoDisq=true; eindvermogenCompleet=true; nettoGteBelegbaar=true; pensioenpotCompleet=true; pensioenpotVolgtLever=true; pensioenpotVolgtCategorie=true',
      source:
        'lib/tax-lifetime/varianten-sweep.ts#VARIANT_SPECS/buildVariantProfile/resolvePotRules (prio-vectoren, via lib/horizon-kernel/adapter/prio-overgang.ts#buildTsParams) + #bepaalDiskwalificatie (vetovolgorde + kernelFout-uitgang) + #runVariantenSweep (eindvermogen op alle drie de grondslagen, echte kernel-fixture persona compleet) + lib/horizon/pensioen-pot.ts#pensioenPortfolio (kern-categorie Pensioen via lib/horizon-kernel/adapter/potten.ts#ASSET_TYPE_TO_CATEGORIE); "zes kanttekeningen" en de twee regel-onderschriften zijn UI-tekst in components/overview/belasting/optimizer-levenslang.tsx en niet machine-toetsbaar vanuit deze reken-check (wél vastgepind in optimizer-levenslang.test.tsx).',
    },
  },
]

export const BELAST_ACCEPTANCE: AcceptanceSet = {
  zone: 'BELAST',
  criteria,
}
