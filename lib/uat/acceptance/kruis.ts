/**
 * Acceptatiecriteria — domein KRUIS (cross-module consistentie & doorwerking,
 * UAT-KRUIS-01..27). Bron: `docs/uat/uat-plan.md` Deel 1 (WF-KRUIS-01..25) + Deel 2
 * §2.8 (de uitgeschreven scenario's) + de SSoT-tabel bovenaan §2.8 die per
 * kerngetal de canonieke bron aanwijst.
 *
 * UAT-KRUIS-27 (euro-weergave, wave 2/3) is NIEUW t.o.v. het UAT-plan —
 * toegevoegd voor de euro-weergave-uitrol (Notion-kaart
 * 39cf9e8d-568a-80fb-8a99-e090c080b964, brok H): één FIRE-doelbedrag,
 * identiek gedeflateerd op TOEK/OVZ/NAV. `kind: 'consistency'` (géén
 * engine-check in kruis-checks.ts — de drie oppervlakken zelf zijn de toets,
 * niet één geïsoleerde formule).
 *
 * KERNCONVENTIE (de "consume, don't recompute"-regel uit CLAUDE.md als toets):
 * KRUIS bewijst NIET één pagina, maar de belofte dat HETZELFDE kerngetal overal
 * identiek is (delta ≈ 0) en dat een bron-mutatie OVERAL doorwerkt. Daardoor is
 * bijna elk criterium een 'consistency'- of 'direction'-toets — robuust ondanks
 * de `Math.random()`-gejitterde persona-fixtures, want een delta tussen twee
 * live-bronnen is onafhankelijk van de absolute (gejitterde) waarde.
 *
 * Slechts een kleine kern is écht 'exact' — de canonieke, PURE SSoT-functies die
 * per constructie één getal leveren dat elk oppervlak hoort te consumeren; die en
 * alleen die hebben een engine-check in `kruis-checks.ts` (bewezen door
 * `kruis.engine.test.ts` + de in-app suite `uat-kruis.ts`):
 *   - WF-KRUIS-06 spaarquote  → `savingsRateFromAggregates` (lib/savings-source.ts)
 *   - WF-KRUIS-08 vrijheids-% → `computeFreedomProgress` (lib/core-metrics.ts)
 *   - WF-KRUIS-09 grondslag   → `getFireEligibleNetWorth` (lib/housing-strategy.ts)
 *   - WF-KRUIS-14 SWR         → `computeEffectiveSwr` (lib/fire-params.ts)
 *   - WF-KRUIS-20 dagtarief   → `dailyExpenseRate`/`calculateFreedomTime` (lib/format.ts)
 * Deze checks gebruiken VASTE fixture-getallen (geen persona-seed) — juist omdat
 * de KRUIS-consistentie een algebraïsche identiteit is (delta = 0 / delta = het
 * bewuste verschil), niet een persona-cijfer.
 *
 * BEWUSTE GRONDSLAG-VERSCHILLEN (géén inconsistentie — als 'verwacht verschil'
 * getoetst, niet als bug): netto vermogen (incl. huis/niet-liquide) ≠
 * FIRE-eligible/liquide vermogen (huis via housing-strategie gefilterd; WF-KRUIS-09);
 * de wekelijks bevroren vrijheidsbriefing ≠ live cijfer (WF-KRUIS-17); Box 3 kent
 * drie bewust verschillende weergaven (WF-KRUIS-12).
 *
 * UAT-KRUIS-26 heeft in `catalog.ts` `wf: null` (een nieuw scenario dat de
 * "volledige gebruikersreis"-eis invult, spiegelt géén WF-nummer uit Deel 1);
 * het `workflow`-veld hieronder gebruikt daarvoor het synthetische 'WF-KRUIS-26'
 * zodat de dekkings-meta-test uniform op 01..26 kan draaien. UAT-KRUIS-19 (perspectief)
 * en UAT-KRUIS-25 (AI-tier-gate) vereisen live een 2e account resp. een account
 * zonder AI-add-on — de engine-laag toetst wat puur/deterministisch toetsbaar is.
 */

import type { AcceptanceCriterion, AcceptanceSet } from './types'

const criteria: AcceptanceCriterion[] = [
  {
    workflow: 'WF-KRUIS-01',
    scenarioId: 'UAT-KRUIS-01',
    titel: 'Netto vermogen: één getal op alle oppervlakken',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa (compleet) geladen — bezittingen + minstens één schuld, solo-perspectief.',
    when: 'De gebruiker leest het netto vermogen in de /overzicht-hero + "Vandaag"-punt, de sidebar, Σbezittingen−Σschulden op /overzicht/bezittingen resp. /overzicht/schulden, de netto-vermogen-widget en /rapportages/balans.',
    then: 'Alle oppervlakken tonen op de euro hetzelfde bedrag: netto vermogen = Σ(actieve bezittingen × net_worth_inclusion_pct) + losse banksaldi − Σ(actieve schulden × net_worth_inclusion_pct). Er is één bron (`lib/horizon-data-loader.ts`/`lib/dashboard-data-loader.ts`); balans (`app/api/report/balans/route.ts`) hanteert dezelfde inclusie-weging. Consistentie tussen weergaven van dezelfde loader-uitkomst — delta = 0.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: netto vermogen identiek op hero/sidebar/bezittingen−schulden/widget/balans; één inclusie-gewogen som (dashboard-/horizon-data-loader; balans-route deelt de weging).',
    },
  },
  {
    workflow: 'WF-KRUIS-02',
    scenarioId: 'UAT-KRUIS-02',
    titel: 'Bezit toevoegen → doorwerking over de hele keten',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen; kerngetallen vóóraf genoteerd (netto vermogen, vrijheidstijd, vrijheids-%, Box 3, FIRE-leeftijd, gezondheidsgetal).',
    when: 'De gebruiker voegt een bezitting "Spaargeld €25.000" toe.',
    then: 'Vier gerichte deltas, alle in dezelfde richting: netto vermogen +€25.000 (`horizon-data-loader`); Box 3-heffing hoger (`calculateBox3`); vrijheids-% gelijk-of-hoger (`computeFreedomProgress`); FIRE-leeftijd gelijk-of-eerder (horizon-kernel). Randgeval "Eigen woning": vermogen stijgt maar vrijheids-%/FIRE stijgen NIET één-op-één (housing-strategie, WF-KRUIS-09) en Box 3 stijgt niet (Box 1). Richtingstoets; de absolute cijfers zijn kernel/loader-uitkomsten.',
    assertion: {
      kind: 'direction',
      source: 'richtingstoets: +€25.000 bezit → netto vermogen +bedrag, Box 3 omhoog, vrijheids-% gelijk-of-hoger, FIRE gelijk-of-eerder (dezelfde bronnen als WF-KRUIS-01/08/12/13).',
    },
  },
  {
    workflow: 'WF-KRUIS-03',
    scenarioId: 'UAT-KRUIS-03',
    titel: 'Bezit herwaarderen of verwijderen → alle afgeleiden zakken mee',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen; kerngetallen genoteerd zoals in WF-KRUIS-02.',
    when: 'De gebruiker verlaagt een belegging met €10.000 (herwaardering) en verwijdert daarna een kleine bezitting.',
    then: 'Dezelfde vier deltas als WF-KRUIS-02, nu negatief: netto vermogen −€10.000, Box 3 lager, vrijheidstijd korter, FIRE gelijk-of-later; het verwijderde item verdwijnt uit álle lijsten/totalen (ook rapportages). Randgeval: netto vermogen negatief → vrijheids-% toont 0 (vastgepind in `computeFreedomProgress`), geen crash. Richtingstoets.',
    assertion: {
      kind: 'direction',
      source: 'richtingstoets: waardedaling −€10.000 → alle afgeleiden dalen; verwijderd item nergens meer; negatief vermogen → vrijheids-% 0 (computeFreedomProgress).',
    },
  },
  {
    workflow: 'WF-KRUIS-04',
    scenarioId: 'UAT-KRUIS-04',
    titel: 'Schuld toevoegen/aflossen → vermogen + DSTI + spaarquote + Box 3 + FIRE',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen; netto vermogen, gezondheidsgetal (DSTI-pijler) en spaarquote genoteerd.',
    when: 'De gebruiker voegt een persoonlijke lening toe (saldo €15.000, maandlast €400) en zet daarna "aflossing telt mee als sparen" aan.',
    then: 'Netto vermogen −€15.000; de DSTI-pijler (Σ maandlasten ÷ 6-maands inkomen) verslechtert; Box 3-grondslag daalt (schuld boven drempel); met de inclusie-vlag stijgt de spaarquote met de aflossingscomponent (`computeDebtAflossingMonthly`, alléén schulden met include_aflossing_in_savings). Bij aflossen keren de deltas om; alleen het rentedeel valt vrij in de cashflow (ADR 0020). Richtingstoets.',
    assertion: {
      kind: 'direction',
      source: 'richtingstoets: +schuld → netto vermogen −saldo, DSTI slechter, Box 3 lager; aflossing-inclusie → spaarquote hoger via computeDebtAflossingMonthly (savings-source).',
    },
  },
  {
    workflow: 'WF-KRUIS-05',
    scenarioId: 'UAT-KRUIS-05',
    titel: 'Transactie importeren → budgetrealisatie + cashflow + spaarquote',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen; spaarquote genoteerd op /overzicht en onderaan /overzicht/cashflow.',
    when: 'De gebruiker importeert een MT940/CSV/OFX met één salaris (+) en meerdere uitgaven (−) in de huidige maand en categoriseert ze.',
    then: 'De transacties verschijnen in de lijst; "besteed" per geraakt budget stijgt; maandinkomsten/-uitgaven (excl. eigen-rekening-overboekingen) kloppen; de 6-maands spaarquote is overal herrekend (`savingsRateFromAggregates`, WF-KRUIS-06). Randgeval: een eigen-rekening-overboeking mag géén kerngetal veranderen; een spaarbudget-transactie verhoogt de spaarquote i.p.v. te verlagen. Richtingstoets.',
    assertion: {
      kind: 'direction',
      source: 'richtingstoets: import van reële transacties → budget-besteed omhoog + spaarquote herrekend; transfers/spaarbudget-uitzonderingen (dashboard-data-loader isRealTx; savings-source).',
    },
  },
  {
    workflow: 'WF-KRUIS-06',
    scenarioId: 'UAT-KRUIS-06',
    titel: 'Spaarquote: één getal op alle oppervlakken',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Vaste 6-maands-aggregaten (inkomen/uitgaven/aflossing) — géén persona-seed, want de consistentie is een formule-identiteit.',
    when: 'De gebruiker leest de spaarquote in de cashflow-tegel, het cashflow-instellingenblok, de gezondheidsscore-pijler, de forecast-kaart, de spaarquote-widget en op de doelkaart "Spaarquote naar …".',
    then: 'Overal exact hetzelfde percentage: spaarquote% = (inkomen6m − uitgaven6m + aflossing6m) ÷ inkomen6m × 100 via de gedeelde `savingsRateFromAggregates`. EXACT toetsbaar: aggregaten (36.000 / 27.000 / 1.800) → (10.800 ÷ 36.000)×100 = 30,0%; inkomen ≤ 0 → 0 (guard). De loaders voegen alleen extrapolatie/spaarbudget-correctie toe rond diezelfde kernformule; sinds fase 2 zijn spaarquote/dagtarief/inkomens-extrapolatie ook correct bij >1000 transacties per venster (het stilzwijgend te-lage afkap-getal is verholpen via het maandaggregaat-pad, ADR 0050) — de kernformule en dit exacte getal blijven gelijk. SINDS ADR 0103 (11 aug 2026) bepaalt de gekozen GRONDSLAG welke aggregaten de formule voedt: staan inkomen én uitgaven op `transaction`, dan blijft het 6-maands-cijfer mét spaarbudget-/aflossingscorrectie de uitkomst; op elke andere grondslag draait dezelfde functie op de effectieve maandbedragen met aflossing 0. Alle genoemde oppervlakken lezen die ene uitkomst — het instellingenblok noemt sindsdien niet meer per definitie "berekend, laatste 6 maanden", maar de grondslag die daadwerkelijk geldt. De keuze zelf is gedekt door WF-CASH-60. SINDS 31 AUG 2026 (eigenaar-besluit "één spaarquote, app-breed") geldt dat OOK voor de drie oppervlakken die tot dan de rauwe 6-maands meting toonden: de spaarquote-widget, de forecast-kaart (label "(6m)" vervangen door de grondslag) en het spaarquote-parameterdoel (dat zijn eigen gespiegelde formule kwijt is en `loadForecastSectionData` consumeert). Toetsbaar op het scherm: op een account met grondslag ‘budget’ of ‘handmatig’ tonen instellingenblok, /overzicht-hefboomkaart, forecast-kaart, spaarquote-widget én doelkaart één en hetzelfde percentage; een als METING getoonde quote is dan nog op drie plekken zichtbaar, telkens mét venster in de tekst: de transactie-kassabon, de check-in-gespreksstarters en de geldstroom-gauge op /overzicht/transacties (die laatste is een PERIODE-quote over het gekozen venster, ADR 0020-carve-out).',
    assertion: {
      kind: 'exact',
      expected: 'spaarquote=30; nulInkomen=0',
      source: 'lib/savings-source.ts#savingsRateFromAggregates(36000, 27000, 1800) = 30; (0, …) = 0 (income>0-guard). De gedeelde 6-maands-kernformule achter elke spaarquote-weergave.',
    },
  },
  {
    workflow: 'WF-KRUIS-07',
    scenarioId: 'UAT-KRUIS-07',
    titel: 'Spaarbron-instellingen wijzigen → FIRE-prognose beweegt overal mee',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen; FIRE-leeftijd genoteerd op /toekomst en /overzicht.',
    when: 'De gebruiker bewerkt "Inkomen" naar een hogere handmatige waarde in het cashflow-instellingenblok en zet de bron daarna terug op "berekend".',
    then: 'Beide projectie-oppervlakken (tijdas + mini-projectie/countdown) gebruiken dezelfde spaarbron (`resolveSavingsSource`, prioriteit override → inkomen×spaarquote → asset-aggregaat) en verschuiven daardoor identiek: hoger inkomen → FIRE gelijk-of-eerder; terug op "berekend" → beide vallen terug op hetzelfde transactie-getal. Consistentie tussen twee oppervlakken die één spaarbron delen.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: /toekomst en /overzicht gebruiken dezelfde resolveSavingsSource-inleg (gedeeld door dashboard-/horizon-data-loader) → identieke FIRE-verschuiving.',
    },
  },
  {
    workflow: 'WF-KRUIS-08',
    scenarioId: 'UAT-KRUIS-08',
    titel: 'Vrijheidsvoortgang (%): identiek op alle oppervlakken',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Vaste teller/noemer (FIRE-eligible vermogen, benodigde portfolio) — géén persona-seed; de consistentie is de formule + de clamp.',
    when: 'De gebruiker vergelijkt het vrijheids-% in de hero, de vrijheidsvoortgang-/mijlpalen-widgets, "Jouw Pad" en de deel-kaart.',
    then: 'Overal hetzelfde percentage uit één bron: vrijheids-% = FIRE-eligible vermogen ÷ benodigde portfolio × 100, geplafonneerd op [0,100] (`computeFreedomProgress`). EXACT: 300.000/500.000 → 60; ≥ doel → 100 (cap); negatief vermogen → 0; geen doel (null) → 0. Huiseigenaar: teller = FIRE-eligible (huis gefilterd), nooit stiekem het volle vermogen (ADR 0009). Deze kapitaalratio blijft vandaag (F1, ADR 0129) de grondslag voor alle vijf `fire_end_strategy`-waarden; vanaf F3a neemt de DEKKING (`computeRunwayCoveragePct`) het over onder elk vast stopanker (`aow`/`now`/`age`) — zie register-getal 3 (canonical-registry.ts) voor de volledige clausule.',
    assertion: {
      kind: 'exact',
      expected: 'pct60=60; cap100=100; negatief=0; geenDoel=0',
      source: 'lib/core-metrics.ts#computeFreedomProgress: {300000,500000}=60; {600000,500000}=100; {-5000,500000}=0; {…,null}=0 (clamp [0,100], negatief→0).',
    },
  },
  {
    workflow: 'WF-KRUIS-09',
    scenarioId: 'UAT-KRUIS-09',
    titel: 'Grondslag-verschil: netto vermogen ≠ FIRE-eligible vermogen (verwacht verschil)',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Vaste HousingContext (eigenHuisValue €650.000, mortgageBalance €400.000 → overwaarde €250.000) op een netto vermogen van €800.000 — géén persona-seed.',
    when: 'De gebruiker vergelijkt het netto vermogen (hero/balans) met de vrijheids-teller bij housing-strategie "volledig meetellen" resp. "uitsluiten".',
    then: 'Bewust verschillende grootheden, nooit gemengd op één as: bij "volledig meetellen" is FIRE-eligible = netto vermogen (delta 0); bij "uitsluiten" is FIRE-eligible = netto vermogen − overwaarde, dus het verschil is EXACT de overwaarde (€250.000). Dit is een verwacht verschil (`getFireEligibleNetWorth`), géén inconsistentie — testers rapporteren het niet als bug.',
    assertion: {
      kind: 'exact',
      expected: 'nettoVermogen=800000; volledig=800000; deltaVolledig=0; uitsluiten=550000; deltaUitsluiten=250000; equity=250000',
      source: 'lib/housing-strategy.ts#getFireEligibleNetWorth(800000, {eigenHuisValue:650000,mortgageBalance:400000}, mode): include_full=800000 (Δ0); exclude_from_fire=550000 (Δ=overwaarde 250000).',
    },
  },
  {
    workflow: 'WF-KRUIS-10',
    scenarioId: 'UAT-KRUIS-10',
    titel: 'Housing-strategie wijzigen → vrijheid/FIRE bewegen, vermogen blijft',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa (eigen woning + hypotheek) geladen; netto vermogen, vrijheids-% en FIRE-leeftijd genoteerd op /overzicht en /toekomst.',
    when: 'De gebruiker wijzigt de woonstrategie van "volledig meetellen" naar "niet meetellen" en weer terug.',
    then: 'Het netto vermogen op /overzicht blijft EXACT gelijk (delta 0 — de woning zit onveranderd in de vermogenssom); alléén vrijheids-%, FIRE-leeftijd en mijlpaaldatums herrekenen, en die zijn op /overzicht én /toekomst identiek nieuw (gedeelde `buildHorizonInput`). Heen-en-terug is idempotent. Consistentie: één grootheid onveranderd (Δ0), de andere twee identiek bewogen.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: netto vermogen Δ0 bij strategiewissel; vrijheids-%/FIRE identiek op beide oppervlakken (lib/housing-strategy.ts + gedeelde build-input); idempotent heen-en-terug.',
    },
  },
  {
    workflow: 'WF-KRUIS-11',
    scenarioId: 'UAT-KRUIS-11',
    titel: 'Gezondheidsgetal: identiek op /overzicht en /toekomst',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen; gezondheidsscore + pijler-uitsplitsing genoteerd op /overzicht.',
    when: 'De gebruiker vergelijkt de score + uitsplitsing (spaarquote, buffer, DSTI, spreiding, vrijheidsvoortgang, budgetdiscipline) op /overzicht en /toekomst.',
    then: 'Beide pagina\'s tonen exact dezelfde totaalscore én per pijler dezelfde waarde — één server-berekening (`buildHealthScoreInput` + `computeHealthScoreFromInputs`, ADR 0008), door beide oppervlakken via dezelfde loader geconsumeerd. Een input-wijziging (bv. +€5.000 buffer) beweegt beide identiek. Consistentie tussen twee weergaven van één berekening.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: gezondheidsgetal + pijlers identiek op /overzicht en /toekomst (lib/health-score-input.ts + lib/financial-health.ts, één loader-bron).',
    },
  },
  {
    workflow: 'WF-KRUIS-12',
    scenarioId: 'UAT-KRUIS-12',
    titel: 'Box 3 over de oppervlakken: drie bewuste weergaven herkennen en toetsen',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa (> heffingsvrij vermogen) geladen; de vier Box 3-oppervlakken geopend.',
    when: 'De gebruiker vergelijkt /overzicht/belasting/box3 (volledig, jaar 2026), de hub-KPI + hero-tegel (personal: `horizonData.box3Tax`, household/partner via `loadPerspectiveBox3`, jaar 2026), de Box 3-widget (volledig, jaar 2025) en de schulden-belastingsectie (client-side, actueel jaar).',
    then: 'Elk bedrag is verklaarbaar vanuit zijn gedocumenteerde grondslag. Sinds deze release consumeert de hub-KPI dezelfde canonieke `calculateBox3`-uitkomst als de box3-subpagina (voorheen de `buildTaxData`-proxy via `healthScoreInput.taxData`, die schulden — incl. de eigenwoninghypotheek — negeerde) — die twee zijn nu A=B op jaar 2026, geen bewust verschil meer. Het overblijvende bewuste verschil is uitsluitend het jaartal: 2026 (hub/box3-subpagina) vs. 2025 (widget). Toetsbaar: op één fixture is de rendementsgrondslag identiek over de jaren (delta 0) terwijl de heffing per jaar bewust verschilt (forfait/tarief). Consistency (documented difference), diepgaand geborgd door de suite `box3-belasting`.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: hub-KPI + box3-subpagina zijn A=B op calculateBox3 (app/(app)/overzicht/belasting/page.tsx#box3Tax + loadPerspectiveBox3); widget blijft bewust op jaar 2025. Exacte heffing geborgd in de box3-belasting-suite.',
    },
  },
  {
    workflow: 'WF-KRUIS-13',
    scenarioId: 'UAT-KRUIS-13',
    titel: 'FIRE-datum/-leeftijd: /overzicht en /toekomst per constructie gelijk',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa (geboortedatum + positief vermogen) geladen.',
    when: 'De gebruiker vergelijkt de FIRE-leeftijd + het benodigde vermogen op de /toekomst-tijdas, de /overzicht-mini-grafiek en de FIRE-countdown-widget.',
    then: 'FIRE-leeftijd (fractioneel), doelbedrag en de benodigde-portfolio-marker zijn per constructie identiek — één gedeelde input-assemblage (`buildHorizonInput`) gevoed in dezelfde kernel (`convergentie-router`), door /overzicht (dashboard-data-loader) én de /toekomst-hook geconsumeerd. Zonder geboortedatum/vermogen ≤ 0 vallen beide op dezelfde scalar-projectie terug. Consistentie/oracle: de exacte leeftijd is een kernel-uitkomst, de gelijkheid is per constructie.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: FIRE-leeftijd + benodigde portfolio identiek op /overzicht en /toekomst (gedeelde buildHorizonInput → horizon-kernel; scalar-fallback óók gedeeld).',
    },
  },
  {
    workflow: 'WF-KRUIS-14',
    scenarioId: 'UAT-KRUIS-14',
    titel: 'Markt-aannames wijzigen → SWR + FIRE-doel + beide projecties',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Vaste rendement/inflatie-paren — géén persona-seed; de SWR-formule + vloer zijn de identiteit.',
    when: 'De gebruiker verlaagt het verwachte rendement en controleert de effectieve SWR (badge "Afgeleid"), het FIRE-doelbedrag en beide projectie-oppervlakken.',
    then: 'De effectieve SWR uit één bron (`computeEffectiveSwr` = rendement − Box 3-drag − inflatie, vloer 0,1%) voedt zowel de SWR-widget als het FIRE-doel (uitgaven ÷ SWR) en beide projecties — die verschuiven identiek. EXACT: (7% ; 2%) → 7% − 2,16% − 2% = 2,840% (BOX3_DRAG 0,0216); extreme combinatie (1% ; 5%) klemt op de vloer 0,100%. Consistentie geborgd via één SWR-getal; de exact-provable kern is de formule + vloer. LAAT DE GEBRUIKER HET VELD LEEG, dan komt de aanname sinds 11 aug 2026 niet meer rechtstreeks uit de TS-constante maar uit de jaargelaagde `fire_assumptions`-rij (beheer op /beheer/fiscale-kerngetallen), via `resolveFireParamsWithAssumptions`; de expliciete gebruikerskeuze wint nog steeds altijd, en de constanten blijven de terugval bij een ontbrekende jaarrij. Zet beheer een jaarlaag, dan MOETEN alle FIRE-tonende oppervlakken tegelijk meebewegen — een oppervlak dat die stap overslaat rekent stil met een andere onttrekkingsvoet.',
    assertion: {
      kind: 'exact',
      expected: 'swrDefault=0.02840; swrVloer=0.00100',
      source: 'lib/fire-params.ts#computeEffectiveSwr(0.07,0.02) = 0.02840 (BOX3_DRAG 0,0216); computeEffectiveSwr(0.01,0.05) = 0.001 (vloer max(0,001; …)).',
    },
  },
  {
    workflow: 'WF-KRUIS-15',
    scenarioId: 'UAT-KRUIS-15',
    titel: 'Levensgebeurtenis toevoegen → tijdas + /overzicht-projectie + FIRE-datum',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen; FIRE-leeftijd genoteerd op /toekomst en /overzicht.',
    when: 'De gebruiker voegt een eenmalige uitgave van €50.000 toe op leeftijd nu+5 en deactiveert die daarna.',
    then: 'De gebeurtenis verschijnt als marker op de tijdas; de FIRE-leeftijd verschuift (gelijk-of-later); de /overzicht-mini-grafiek + countdown tonen dezelfde herrekende uitkomst — de dashboard-loader voedt de kernel met dezelfde life events (`buildHorizonInput`). Deactiveren laat beide oppervlakken exact terugveren. Consistentie: één invoer, twee identiek reagerende oppervlakken.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: levensgebeurtenis werkt identiek door op /toekomst-tijdas en /overzicht-projectie (gedeelde lifeEvents in buildHorizonInput → kernel); idempotent bij deactiveren.',
    },
  },
  {
    workflow: 'WF-KRUIS-16',
    scenarioId: 'UAT-KRUIS-16',
    titel: 'Maandsnapshot & trendreeksen: historie spoort met live',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen; live netto vermogen, spaarquote en vrijheids-% genoteerd.',
    when: 'De gebruiker opent /overzicht (triggert de auto-snapshot) en vergelijkt het meest recente historiepunt met de live cijfers; voegt een bezitting toe en herlaadt.',
    then: 'Het laatste punt van de vermogens-/spaarquote-/FIRE-/gezondheidshistorie weerspiegelt de live waarden op het snapshotmoment (dezelfde formules: `snapshot-math` deelt `buildHealthScoreInput`). Meerdere page-loads → idempotente upsert (één rij per maand, geen duplicaat). Bewust verschil: de trendpijl (historie) mag binnen de maand afwijken van de live-delta. Consistentie op het snapshotmoment.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: recentste snapshotpunt == live cijfer op snapshotmoment (app/api/snapshots/auto + snapshot-math delen buildHealthScoreInput); idempotente maand-upsert.',
    },
  },
  {
    workflow: 'WF-KRUIS-17',
    scenarioId: 'UAT-KRUIS-17',
    titel: 'Vrijheids-kop is live, alleen de wekelijkse mail/versheidssignaal bevriezen (bewust verschil)',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen; de vrijheids-kop naast "De briefing" + het "Bijgewerkt …"-versheidssignaal genoteerd (nieuwe ISO-week).',
    when: 'De gebruiker voegt een bezitting van €20.000 toe en herlaadt /overzicht (geen "Ververs" nodig).',
    then: 'Sinds ADR 0126 (PR B2/C) rekent de kop-zin zelf altijd LIVE uit `computeHorizonRunway` (UR2-09 — nooit de week-snapshot) en verandert dus direct mee. Wat wél bevriest is (a) de wekelijkse briefing-e-mail, die de runway van het snapshotmoment toont, en (b) het versheidssignaal onder het "Bijgewerkt …"-stempel, dat de live runway tegen dat bevroren meetpunt afzet (`hasRunwayMoved`) met een drempel van ÉÉN HELE MAAND — de resolutie van de runway zelf, niet de oude 2-dagen-drempel van de verwijderde platte deling (`computeFreedomTotal`). Een `kind`-wissel (bv. van een uitputtingsmaand naar "reikt tot voorbij je plan") telt altijd als beweging. Dit is BEWUST gedrag, geen bug: de kop is overal live, alleen het outbound artefact (mail) en het versheidssignaal kennen een bevroren referentiepunt.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: de /overzicht-kop is altijd live (buildBriefingHeadline op computeHorizonRunway); alleen de briefing-mail en het versheidssignaal vergelijken tegen de wekelijkse snapshot (hasRunwayMoved, drempel 1 maand) — lib/briefing/overview-briefing.ts.',
    },
  },
  {
    workflow: 'WF-KRUIS-18',
    scenarioId: 'UAT-KRUIS-18',
    titel: 'Status-semantiek: sidebar-dot == hefboomkaart == statusbanner == boxkaart',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen; sidebar open (desktop), hefboomkaarten zichtbaar.',
    when: 'De gebruiker vergelijkt per domein de sidebar-dot, de hefboomkaart-dot, de status-duiding-banner en (belasting) de Box 1/2/3-kaartstatussen; wijzigt daarna een input die een status omslaat.',
    then: 'Per domein tonen alle plekken exact dezelfde stoplichtstatus uit één scoringsbron (`loadLeverScores`/`computeLeverScores`, `lib/leverage-status.ts`-semantiek). Een status-omslag beweegt overal tegelijk. Stoplichtkleuren volgen NIET het module-accent (semantiek blijft semantisch). Consistentie: categorische gelijkheid van de status over vier oppervlakken. Sinds 11 aug 2026 leest `loadLeverScores` het Box 1-inkomen op dezelfde budgetgrondslag als /overzicht/cashflow (ADR 0103) en telt hij losse rekeningen via de canonieke huishoud-gewogen optelling — zonder die twee kon de dot een andere status tonen dan de pagina eronder terwijl beide "uit één bron" heetten te komen.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: identieke stoplichtstatus per domein op sidebar/hefboomkaart/banner/boxkaart (lib/lever-scores-loader.ts + lib/leverage-status.ts, één bron).',
    },
  },
  {
    workflow: 'WF-KRUIS-19',
    scenarioId: 'UAT-KRUIS-19',
    titel: 'Perspectief-wissel (Eigen/Huishouden/Partner): kerngetallen consistent omgerekend',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Gebruiker met gekoppelde partner. ⚠ LIVE vereist een ÉCHT tweede account + geaccepteerd huishouden — de engine-laag toetst alleen de perspectief-omrekening/consistentie.',
    when: 'De gebruiker wisselt van "Eigen" naar "Huishouden" en weer terug.',
    then: 'Netto vermogen, hefboom-totalen, de cashflow-tegel (spaarquote) en Box 3 (hub + box3-pagina met partner-verdeling) tonen consistent de gecombineerde huishoud-cijfers; bewust persoonlijk blijven: de briefing-freeze en de vermogens-historie. Terug naar "Eigen" keren alle getallen byte-gelijk terug. Sinds fase 2 toont de cashflow-tegel óók in huishoud-/partnerperspectief het canonieke `savingsRate6m` (`savingsRateFromAggregates`, WF-KRUIS-06) i.p.v. een lokaal herrekende maandratio — de tegel spiegelt daarmee één spaarquote-getal over alle perspectieven (consume-don\'t-recompute-fix; tegel-totaal == tegel-status). Consistentie.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: perspectief-bewuste loaders rekenen huishoud-cijfers consistent om (lib/household-tax.ts + perspectief-loaders); cashflow-tegel-spaarquote = canoniek savingsRate6m in élk perspectief (consume-don\'t-recompute); persoonlijke onderdelen (freeze/historie) onveranderd; terug = byte-gelijk.',
    },
  },
  {
    workflow: 'WF-KRUIS-20',
    scenarioId: 'UAT-KRUIS-20',
    titel: 'Vrijheidstijd-equivalenten: één dagtarief overal',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Vaste maanduitgaven (€3.000) — géén persona-seed; het dagtarief is de identiteit.',
    when: 'De gebruiker vergelijkt de hero-vrijheidstijd, de vrijheidstijd-badges bij bedragen (Box 3-heffing "= X dagen"), de belasting-hub-omrekening en de rapport-finales.',
    then: 'Elke euro→tijd-omrekening gebruikt hetzelfde dagtarief op jaarbasis: dagtarief = jaaruitgaven ÷ 365 (`dailyExpenseRate`, NIET maand ÷ 30). EXACT: maand €3.000 → dagtarief €98,6301/dag; een bedrag gelijk aan de jaaruitgaven (€36.000) → 365 vrijheidsdagen via `calculateFreedomTime` op ditzelfde tarief (delta 0). Één dagtarief, elk oppervlak. ÉN DE BRON, niet alleen de formule (M22): dezelfde €-heffing levert op /overzicht/belasting/box3 hetzelfde aantal vrijheidsdagen als in de Box 3-widget en de optimizer-kansenlijst, want alle drie lezen het tarief uit `lib/expense-rate.ts`. Een oppervlak dat de formule een ándere teller voert (budget-LIMIETEN i.p.v. gerealiseerde uitgaven) of zelf ÷30 doet, faalt dit criterium — ook al klopt de formule.',
    assertion: {
      kind: 'exact',
      expected: 'dagtarief=98.6301; vrijheidsdagenBij36000=365; box3DagenDelta=0',
      source: 'lib/format.ts#dailyExpenseRate(3000) = 3000×12/365 = 98,6301; calculateFreedomTime(36000, dagtarief).totalDays = 365 (zelfde tarief → één dagtarief overal). BRON-ASSERTIE: één Box 3-heffing van €569 tegen het canonieke tarief geeft hetzelfde dagenaantal als tegen `PerspectiveBox3Data.dailyExpenses` — die twee zijn sinds M22 hetzelfde getal (lib/household-tax.ts consumeert getRecentDailyExpenseRate). Structureel bewaakt door scripts/check-freedom-time-basis.mjs, dat naast eigen `dailyExpenseRate()`-aanroepen nu óók een eigen maand÷30-deling flagt (de vorm waarin deze bug drie keer terugkwam).',
    },
  },
  {
    workflow: 'WF-KRUIS-21',
    scenarioId: 'UAT-KRUIS-21',
    titel: 'Deel-kaart (vrijheidskaart): cijfers sporen met de app',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen; vrijheids-%, netto vermogen en spaarquote genoteerd op /overzicht.',
    when: 'De gebruiker opent de deel-sheet en bekijkt de kaart in de stand "Veel" (na bevestiging) en daarna "Gemiddeld".',
    then: 'De kaart toont vrijheids-% (1 decimaal), gewonnen vrijheidsdagen, spaarquote en — bij "Veel" — netto vermogen/FIRE-doel; deze sporen met de app (vrijheids-% == hero via dezelfde `computeFreedomProgress` op FIRE-eligible grondslag; netto vermogen == hero; spaarquote == cashflow-tegel). Bij "Gemiddeld" verdwijnen bedragen maar blijft het percentage; "Weinig" toont uitsluitend vrijheidstijd (geen cijfertoets hier). Consistentie tussen de share-route-queryset en de app-loaders.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: deel-kaart-cijfers == app-oppervlakken (app/api/share/freedom-card deelt computeFreedomProgress + inclusie-gewogen vermogen); privacyniveau filtert alleen de weergave.',
    },
  },
  {
    workflow: 'WF-KRUIS-22',
    scenarioId: 'UAT-KRUIS-22',
    titel: 'Rapportages sluiten aan op live cijfers',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen; netto vermogen, categorie-totalen, vrijheids-% en spaarquote live genoteerd.',
    when: 'De gebruiker genereert /rapportages/balans, /rapportages/vermogen en een persoonlijk plan.',
    then: 'Balans-totaal == netto vermogen op /overzicht; het vermogensrapport telt per categorie op tot dezelfde totalen als /overzicht/bezittingen−schulden; het persoonlijk plan noemt vrijheids-% en spaarquote gelijk aan live (dezelfde `computeFreedomProgress` + `savingsRateFromAggregates` + FIRE-eligible grondslag). Peildatum-verschil bij historische periode is verwacht. Consistentie: rapporten consolideren de canonieke loaders.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: rapport-totalen == live cijfers (app/api/report + /balans delen inclusie-weging, computeFreedomProgress, savingsRateFromAggregates).',
    },
  },
  {
    workflow: 'WF-KRUIS-23',
    scenarioId: 'UAT-KRUIS-23',
    titel: 'Fin (AI) noemt dezelfde getallen als de UI',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen; spaarquote, netto vermogen en vrijheids-% genoteerd.',
    when: 'De gebruiker vraagt Fin naar spaarquote, netto vermogen en "ben ik financieel vrij?".',
    then: 'Fin noemt de canonieke 6-maands spaarquote (letterlijk, de context instrueert de AI dit NIET te herberekenen), het netto vermogen zoals op /overzicht en een vrijheidsframing consistent met vrijheids-%/FIRE-leeftijd — alles uit `lib/ai/context/shared-context.ts` dat de canonieke loaders consumeert. Huiseigenaar: de framing gebruikt de FIRE-eligible grondslag (`resolveFreedomFraming`). Consistentie: AI-context == UI-getallen.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: Fin-context-getallen == UI (lib/ai/context/shared-context.ts put uit de canonieke loaders; letterlijke spaarquote-instructie; resolveFreedomFraming op FIRE-eligible grondslag).',
    },
  },
  {
    workflow: 'WF-KRUIS-24',
    scenarioId: 'UAT-KRUIS-24',
    titel: 'Legacy backing-routes tonen dezelfde cijfers als de canonieke routes',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa geladen.',
    when: 'De gebruiker komt binnen via /dashboard, /core, /horizon en /toekomst?tab=gebeurtenissen.',
    then: '/dashboard redirect naar /overzicht; /core toont de Kern-landing met dezelfde vermogens-/spaarquote-getallen als de /overzicht-familie (`core-data-loader` deelt `computeFreedomProgress`/`buildHealthScoreInput`/`savingsRateFromAggregates`); /horizon rendert dezelfde tijdas-component/-data als /toekomst (FIRE-leeftijd identiek); ?tab=-deeplinks landen op de juiste subroute met behoud van parameters. Consistentie: legacy vs. canoniek = alléén cijfer-gelijkheid.',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: legacy backing-routes (/core, /horizon) tonen dezelfde kerngetallen als canoniek (gedeelde loader-bouwstenen); /dashboard = redirect; ?tab=-redirects behouden parameters.',
    },
  },
  {
    workflow: 'WF-KRUIS-25',
    scenarioId: 'UAT-KRUIS-25',
    titel: 'Tier-gate-ervaring zonder AI-add-on (alle AI-oppervlakken)',
    kriticiteit: 'BELANGRIJK',
    persona: 'compleet',
    given: 'Een account ZONDER AI-add-on. ⚠ LIVE vereist zo\'n account; pure interactie/weergave, geen cijfer.',
    when: 'De gebruiker opent achtereenvolgens de AI-oppervlakken: Fin-chat, /nieuws, de AI-INLEIDING bij het periodieke rapport op /rapportages, /toekomst/rekenhulp, abonnementen-detectie/-analyse, AI-categorisering en AI-aanbevelingen.',
    then: 'Elk oppervlak toont een consistente, nette blokkade ("betaalde AI-functie") met verwijzing naar /mijn/account; géén enkel oppervlak levert AI-output of een kale fout. Eén gedeelde gate (`checkTierGate` in `lib/require-tier.ts`, gebruikt door 11 API-routes) over zes modules. Tegenproef: mét add-on werkt alles. Pure gate-ervaring, geen rekenuitkomst. LET OP — /rapportages is de uitzondering die de regel scherpstelt (H28/S9): gegated is alléén de geschreven inleiding bij het periodieke rapport, niet het rapport en niet de zes andere rapportvormen (persoonlijk plan is nooit gegated geweest). Zonder add-on levert de route dus 200 + volledige cijfers zonder inleiding; de blokkade verschijnt bij de INLEIDING, en alleen wanneer de add-on ook daadwerkelijk te koop is (`ADDON_PLANS[…].available`).',
    assertion: {
      kind: 'ui-only',
      source: 'gedeelde tier-gate (lib/require-tier.ts#checkTierGate) levert op alle AI-oppervlakken dezelfde upgrade-melding; geen cijfermatige uitkomst.',
    },
  },
  {
    workflow: 'WF-KRUIS-26',
    scenarioId: 'UAT-KRUIS-26',
    titel: 'Volledige gebruikersreis: van registratie tot vrijheidsinzicht',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Nieuw scenario (catalog `wf: null`) — de end-to-end reis, deterministisch voorgerekend op persona Tessa/compleet.',
    when: 'De gebruiker doorloopt registratie/onboarding → bezittingen/schulden vastleggen → transacties/budget → toekomst/tijdas → rapportage, en leest bij elke halte de kerngetallen.',
    then: 'De reis is coherent: elk kerngetal dat op een eerdere halte verschijnt (netto vermogen, spaarquote, vrijheids-%, FIRE-leeftijd, gezondheidsgetal) blijft op elke latere halte identiek of beweegt uitsluitend door een expliciete bron-mutatie — nooit door een oppervlak-eigen herberekening. Consistentie over de hele keten (de som van WF-KRUIS-01..24 als één doorlopende reis).',
    assertion: {
      kind: 'consistency',
      source: 'consistentie-eis: end-to-end reis houdt elk kerngetal consistent over alle haltes (de gecombineerde SSoT-bronnen van WF-KRUIS-01..24); mutaties alleen via expliciete bron-acties.',
    },
  },
  {
    workflow: 'WF-KRUIS-28',
    scenarioId: 'UAT-KRUIS-28',
    titel: 'Stop-anker: tegenspraak-regel wint altijd + het plan als één atomair blok op PUT (ADR 0129 F1, contract-ronde)',
    kriticiteit: 'BELANGRIJK',
    given:
      'ADR 0129 fase F1 (gedragsbehoudend): `profiles` draagt naast de oude `fire_end_strategy`-kolom nu ook `fire_stop_anchor`/`fire_stop_age` (migratie 20260903140000 + backfill 20260903141000, beide live). Vaste rijfixtures — géén persona-seed, want dit is een parser-/route-identiteit, geen kernel-uitkomst. GEEN LIVE UI-OPPERVLAK schrijft deze kolommen nog (geen picker, geen slider) — dit criterium toetst de parser-/routelaag rechtstreeks (`parseFirePlan`, de PUT-handler van `/api/fire-settings`), niet een browserklik. Het wordt pas via de app zichtbaar/klikbaar zodra F3b de stopmoment-vraag bouwt.',
    when:
      '`parseFirePlan` leest een halverwege-gebackfillde rij (oude kolom "pensioen", nieuwe kolom nog op de default "solved"), een rij waar de oude kolom een eind-vorm draagt ("legacy") naast een reeds gezette nieuwe ankerkolom ("aow"), en een rij met een opgeslagen stopleeftijd van 58,3; de PUT-route ontvangt een deel-plan (alleen een anker), een tegenspraak (strategie "pensioen" mét expliciet anker "age"), een stopleeftijd op/voorbij de eindleeftijd, resp. een nieuwe stopleeftijd van 58,3 jaar (geen halve stap).',
    then:
      'DE TEGENSPRAAK-REGEL (D2): een legacy-anker in de OUDE kolom wint altijd — de halverwege-gebackfillde rij levert anker {kind:"aow"}, nooit "solved"; "nu-stoppen" levert {kind:"now"}. Draagt de oude kolom een eind-vorm (geen anker-waarde), dan leidt de NIEUWE ankerkolom — hier {kind:"aow"}. Zo kan geen rij, hoe hij ook ontstond, twee ankers tegelijk beweren. HET PLAN-CONTRACT OP PUT (contract-ronde 5 sep 2026, R1–R4): de vijf plan-kolommen gaan in ÉÉN UPDATE (een falende schrijfactie laat nooit een half plan achter); een deel-plan (alleen een anker, of een strategie zonder eindleeftijd) is een 400 — er worden geen defaults ("deplete"/90) meer ingevuld; een expliciet anker naast "pensioen"/"nu-stoppen" is een 400 (die labels dragen zelf al een anker); `fire_stop_age ≥ fire_end_age` is een 400 (B7), niet een stil op eind − 1/12 geklemd plan; de eind-vorm-alleen-vorm van pre-F3b-clients blijft werken en laat het anker met rust, behalve dat een legacy-label zijn eigen anker meeschrijft. DE HALVE-JAREN-RESOLUTIE (B6) — TOLERANT LEZEN, STRENG SCHRIJVEN: een opgeslagen 58,3 wordt in de PARSER naar de dichtstbijzijnde halve jaar afgerond (58,5; de DB-CHECK garandeert halve jaren, dus dit is een vangnet voor rijen die buiten de route om ontstonden) — de PUT-ROUTE wijst een nieuwe 58,3 daarentegen met 400 af, want daar is het een expliciete gebruikerskeuze die niet stil mag verschuiven. De route-invarianten zijn bewezen door de dedicated suite `app/api/fire-settings/route.stop-anker.test.ts` — niet herhaald als kruis-checks.ts-fixture (NextRequest/server-mocks zijn niet client-veilig); het engine-check hier dekt uitsluitend de pure parser-regels (`lib/fire-strategy.plan.test.ts`).',
    assertion: {
      kind: 'exact',
      expected:
        'halverwege=aow; nuStoppenLegacy=now; nieuweKolomLeidtBijEindVorm=aow; tolerantGelezen58.3=age58.5',
      source:
        'lib/fire-strategy.ts#parseFirePlan (D2 tegenspraak-regel + B6 tolerant lezen van halve jaren) — lib/fire-strategy.plan.test.ts. Route-invarianten (één atomaire plan-UPDATE; 400 bij deel-plan, tegenspraak strategie × anker, stopleeftijd ≥ eindleeftijd en niet-halve leeftijd — geen stille afronding of defaults) bewezen door app/api/fire-settings/route.stop-anker.test.ts, niet in dit engine-check (server-only).',
    },
  },
  {
    workflow: 'WF-KRUIS-27',
    scenarioId: 'UAT-KRUIS-27',
    titel: "Consistentie: hetzelfde FIRE-doel identiek gedeflateerd op /toekomst-hero, /overzicht-widget en mini-chart-label",
    kriticiteit: 'KERN',
    persona: 'willem',
    given: "Euro-weergave op 'real' (Notion-kaart 39cf9e8d-568a-80fb-8a99-e090c080b964, brok B/F/H). Eén canonieke deflator per leeftijd (`lib/euro-display.ts#buildFactorByAge`, gevoed uit dezelfde kernelrijen — géén tweede bron, D1).",
    when: 'De gebruiker leest het gedeflateerde FIRE-doelbedrag achtereenvolgens op de /toekomst-hero (brok B, `sim-chart.tsx`-props via `horizon-client.tsx`), op de /overzicht-widget (brok F, o.a. `vrijheidsvoortgang-widget.tsx`) en op het mini-chart-/palette-label-oppervlak (`lib/command-palette/actions.ts#buildActionItems`; de weergave-status zelf hangt sinds ADR 0094 in de sidebar — `EuroViewBadge` — niet meer als badge per grafiek).',
    then: 'Het getoonde bedrag is op de drie oppervlakken identiek tot op afronding — dezelfde `deflate(fireTarget, factorAtAge(unifiedRows, fireAge), \'real\')`-aanroep op dezelfde kernelrijen, nooit een tweede/eigen herberekening per widget (NFR-X1/X2). Dit is de kern-eis van AC-F4/T13: zonder deze rij kunnen drie oppervlakken elk voor zich "groen" zijn en toch onderling verschillen.',
    assertion: {
      kind: 'consistency',
      source: 'components/app/horizon/horizon-client.tsx (TOEK-hero, brok B) + components/widgets/vrijheidsvoortgang-widget.tsx (OVZ-widget, brok F) + lib/command-palette/actions.ts#buildActionItems (badge-/label-oppervlak, NAV) — alle drie consumeren lib/euro-display.ts#deflate, geen eigen berekening; kruisZones = TOEK/OVZ/NAV (catalog.ts)',
    },
  },
]

export const KRUIS_ACCEPTANCE: AcceptanceSet = {
  zone: 'KRUIS',
  criteria,
}

/**
 * De KRUIS-scenario-nummers die een acceptatiecriterium HOREN te hebben — de
 * catalogus dekt UAT-KRUIS-01..28 (25 = AI-tier-gate; 26 = nieuwe volledige
 * gebruikersreis, catalog `wf: null`, hier als synthetisch WF-KRUIS-26; 27 =
 * euro-weergave-consistentie, wave 2/3; 28 = stop-anker-tegenspraak-regel + de
 * eerlijke-409-invariant, ADR 0129 fase F1 — engine-only, nog geen live UI-pad).
 * Gebruikt door de dekkings-meta-test.
 */
export const KRUIS_EXPECTED_WORKFLOW_NUMBERS: number[] = Array.from({ length: 28 }, (_, i) => i + 1)
