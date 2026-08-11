/**
 * Page-info content — beschrijvingen voor de "Wat zie ik hier?" info-knop.
 *
 * Elke hoofdpagina heeft 2-3 zinnen die uitleggen wat je op die pagina ziet
 * en wat je er kunt doen. Wordt getoond in de PageInfoButton popover.
 */

export const PAGE_INFO: Record<string, string> = {
  // ── Nieuwe navigatie-architectuur (Overzicht / Toekomst / Mijn) ────
  '/overzicht':
    'Hoe sta je er voor in één blik. ' +
    'Vier hefbomen (bezittingen, schulden, cashflow, belasting), je financiële gezondheidsscore, voortgang op je doelen en de wekelijkse briefing van Fin. ' +
    'Klik op een hefboom voor verdieping. ' +
    // OVZ-1: de uitleg van de status-stippen staat hier éénmalig, in plaats van
    // als vaste legenda onder de hefbomen-rij.
    'Het stipje op een hefboom is een stoplicht: groen is op koers, oranje vraagt aandacht, rood vraagt actie. ' +
    // OVZ-4: de duiding die uit de grafieklegenda is gehaald.
    'De vermogensgrafiek loopt van je verleden tot je vrijheidsmoment — heb je dat al bereikt, dan loopt hij door tot je eindleeftijd. ' +
    'De band om de lijn is de bandbreedte: de marge waarbinnen je vermogen zich waarschijnlijk beweegt.',

  '/overzicht/bezittingen':
    'Wat groeit voor je: cash, beleggingen, eigen huis en pensioen. ' +
    'Per categorie zie je waarde en rendement. ' +
    'Klik op een bezitting voor detail of voeg er een toe.',

  '/overzicht/schulden':
    'Wat je terugbetaalt: hypotheek, leningen, studieschuld. ' +
    'Schuld verkort je vrijheid — aflossen verlengt hem. ' +
    'Bekijk je aflossingsplan en heroverweeg waar nodig.',

  '/overzicht/cashflow':
    'Wat er in komt en uit gaat. ' +
    'Het deel van je inkomen dat je opzij zet bepaalt hoe snel je vrijheid bereikt. ' +
    'Beheer je budgetten, vaste lasten en transacties.',

  '/overzicht/cashflow/budget':
    'Plan en volg je maandbudgetten. ' +
    'Verdeel je inkomen over categorieën en zie per categorie hoeveel ruimte je nog hebt. ' +
    'Het deel dat je opzij zet is vrijheid die je opbouwt.',

  '/overzicht/cashflow/transacties':
    'Alles wat er deze maand in komt en uit gaat. ' +
    'Filter en doorzoek je boekingen, zie je geldstroom per categorie en je spaarquote van de maand. ' +
    'Koppel een rekening om automatisch te importeren.',

  '/overzicht/cashflow/vaste-lasten':
    'Je abonnementen en terugkerende kosten op één plek — met hoeveel vrijheidstijd ze je kosten. ' +
    'In Volledig zie je je vaste-lastenquote (aandeel van je inkomen, met Nibud-duiding), ' +
    'abonnementen-sluipverbruik t.o.v. het gemiddelde, de samenstelling per categorie en wat opzeggen oplevert. ' +
    'Elke euro minder vaste last is vrijheid die je terugkoopt.',

  '/overzicht/cashflow/forecast':
    'Je spaarquote, maandelijks netto en uitgaventrend in één blik, plus een vooruitblik van 6 maanden. ' +
    'Zie hoe je saldo zich ontwikkelt op basis van je baseline en vaste lasten. ' +
    'Lineair — voor scenario-diepere projectie zie Toekomst.',

  '/overzicht/belasting':
    'Belasting over je inkomen (Box 1), aandeelhouderschap (Box 2) en vermogen (Box 3). ' +
    'Slim verdelen over fiscale bakjes scheelt geld per jaar. ' +
    'Klik een box aan voor de berekening en je besparingskansen.',

  '/overzicht/belasting/box1':
    'Box 1 belast inkomen uit werk en woning. ' +
    'TriFinity toont een orde-grootte-schatting van je Box 1-druk plus je onbenutte jaarruimte: ' +
    'de pensioen-aftrekruimte waarmee je via een lijfrente-inleg belasting kunt besparen.',

  '/overzicht/belasting/box2':
    'Box 2 belast inkomen uit aanmerkelijk belang — voor wie ≥ 5% van de aandelen in een vennootschap bezit (bijvoorbeeld een eigen BV). ' +
    'Dividend en vervreemdingswinst worden hier belast. ' +
    'Heb je een deelneming? Voeg die toe als bezitting, dan rekent TriFinity Box 2 automatisch uit.',

  '/overzicht/belasting/box3':
    'Box 3 belast je vermogen — sparen en beleggen — via een forfaitair (fictief) rendement boven je heffingsvrije vermogen. ' +
    'Vrijstelling, partner-verdeling en de mix spaargeld/beleggingen bepalen je jaarlijkse heffing.',

  '/overzicht/belasting/optimizer':
    'Al je fiscale doelen onder elkaar, doorgerekend op je eigen gegevens: Box 3-scenario’s (de mix sparen/beleggen en — met een fiscaal partner — de optimale verdeling) en je Box 1-jaarruimte. ' +
    'Je ziet de impact naast elkaar in euro’s en vrijheidsdagen. ' +
    'Een indicatie, geen advies.',

  '/overzicht/tips':
    'Toptips bovenaan, open acties eronder. ' +
    'Tips komen van Fin (chat of analyse); beslis hier per tip met Doe nu, Later of Negeren. ' +
    'Geaccepteerde tips landen automatisch op je actielijst.',

  '/toekomst':
    'Waar ga je heen. ' +
    'Tijdas met opbouw (groen) en afbouw (oranje) tot je gekozen eindleeftijd, plus doelen, levensgebeurtenissen en voorkeuren die je projectie sturen. ' +
    'Sleep events om te zien hoe ze je vrijheidsmoment verschuiven.',

  '/toekomst/whatif':
    'Wat-als-keuzes spelen met je projectie. ' +
    'Verander je sparen, rendement of pensioenleeftijd en zie direct hoeveel jaar of maanden vrijheid je dat oplevert. ' +
    'Geen toezegging — alleen verkennen.',

  // NB: /toekomst/strategie en /toekomst/uitgaven-na-pensioen hadden hier een
  // tekst, maar renderen sinds de React #310-opruiming (11 aug 2026) geen
  // pagina meer — ze redirecten op de routing-laag (next.config.ts) naar de
  // Gebeurtenissen-tab resp. de uitgaven-pane op /toekomst. De `i` van die
  // oppervlakken hoort bij hun eigen route, niet bij een dood adres.

  '/toekomst/inflatie-koopkracht':
    'Inflatie eet je vermogen op in stille jaren. ' +
    'Hier zie je hoe €100 vandaag over 10, 20, 30 jaar voelt — en wat dat met je vrijheidsdoel doet. ' +
    'Reken in koopkracht, niet in euro\'s alleen.',

  '/toekomst/samengestelde-interest':
    'Rente-op-rente is de stille kracht achter elke vrijheid. ' +
    'Speel met inleg, rendement en horizon en zie hoe een gewone euro vandaag tot tien euro over 30 jaar groeit. ' +
    'Tijd is je grootste hefboom.',

  '/mijn':
    'Profiel, partner, privacy en koppelingen. ' +
    'Plus voorkeuren (notificaties, uiterlijk, personalisatie van je Overzicht) en rapportages-export. ' +
    'Eén onderwerp per pagina — geen accordion-monster.',

  '/mijn/profiel':
    'Je persoonlijke gegevens en huishouden. ' +
    'Naam, geboortedatum, partner-status en kinderen — de basis waarop alle berekeningen rusten. ' +
    'Klein draaien hier verschuift je hele projectie.',

  '/mijn/privacy':
    'Wat we opslaan, waar en waarom — per data-categorie helder uitgelegd. ' +
    'Plus directe acties voor data-export (JSON) en account-verwijdering. ' +
    'Niet als juridische verplichting — als merkpijler.',

  '/mijn/koppelingen':
    'Automatische koppelingen voor data-invoer. ' +
    'PSD2-bank, UPO-pensioenoverzicht en crypto-brokerage — telkens een handmatige import minder. ' +
    'Koppel of ontkoppel per dienst.',

  '/mijn/account':
    'Je abonnement en account op één plek. ' +
    'Zie welke add-ons (AI, Connected) actief zijn, wijzig e-mail of wachtwoord, log overal uit. ' +
    'Of verwijder je account definitief in de danger zone.',

  // ── Dashboard ───────────────────────────────────────────────────
  '/dashboard':
    'Je persoonlijke overzichtspagina met de belangrijkste financiële inzichten. ' +
    'Widgets tonen je vrijheidstijd, vermogensgroei, budgetstatus en aanbevelingen. ' +
    'Personaliseer de indeling door widgets te verslepen of nieuwe toe te voegen.',

  // ── Module-landings ──────────────────────────────────────────────
  '/core':
    'Dit is je financieel fundament: een overzicht van al je bezittingen en schulden. ' +
    'Je ziet je netto vermogen, schuldgraad en FIRE-voortgang. ' +
    'Klik op een categorie om items toe te voegen of te beheren.',

  '/horizon':
    'Je financiële toekomst geprojecteerd. ' +
    'Zie wanneer je financieel vrij bent, hoe scenario\'s je pad beïnvloeden, en wat levensgebeurtenissen kosten. ' +
    'Voeg events toe of pas parameters aan om je plan te verkennen.',

  // ── Kern sub-paginas ─────────────────────────────────────────────
  '/core/budgets':
    'Hier beheer je je maandbudgetten per categorie. ' +
    'Je ziet hoeveel je hebt uitgegeven versus je limiet, en hoeveel vrijheidsdagen elke post kost. ' +
    'Klik op een budget om transacties en trends te bekijken.',

  '/core/cash':
    'Overzicht van je bankrekeningen en recente transacties. ' +
    'Je ziet saldi per rekening en kunt transacties importeren of categoriseren. ' +
    'Verbind een bankrekening voor automatische synchronisatie.',

  '/core/assets':
    'Al je bezittingen gegroepeerd per type: spaargeld, beleggingen, vastgoed, crypto en meer. ' +
    'Je ziet de totale waarde en verdeling. ' +
    'Voeg bezittingen toe of herwaarder bestaande items.',

  '/core/debts':
    'Overzicht van al je schulden: hypotheek, leningen en overige verplichtingen. ' +
    'Je ziet resterende schuld, maandlasten en aflossingstempo. ' +
    'Voeg schulden toe of bekijk aflosstrategieën.',

  '/core/belasting':
    'Box 3-belastingberekening op basis van je bezittingen en schulden. ' +
    'Je ziet je fiscale druk en het verschil tussen werkelijk en fictief rendement. ' +
    'De berekening volgt de actuele Belastingdienst-systematiek.',

  '/core/checkin':
    'Maandelijkse check-in: registreer je actuele vermogens- en inkomenscijfers. ' +
    'Hiermee bouw je een betrouwbare tijdlijn op van je financiële voortgang. ' +
    'Eerdere check-ins kun je terugvinden in de historie.',

  // ── Horizon sub-paginas ──────────────────────────────────────────
  '/horizon/whatif':
    'Wat-als scenario\'s: verken hoe veranderingen je vrijheidsdatum beïnvloeden. ' +
    'Verschuif sliders voor spaarquote, rendement of extra inleg en zie direct het effect. ' +
    'Vergelijk scenario\'s naast je huidige pad.',

  // ── Overige hoofdpaginas ─────────────────────────────────────────
  '/identity':
    'Je persoonlijk profiel en app-identiteit. ' +
    'Hier zie je je financiële tijdlijn, huishoudprofiel en voortgang in de app. ' +
    'Beheer je instellingen, koppelingen en weergavevoorkeuren.',

  '/nieuws':
    'Financieel nieuws gefilterd op relevantie voor jouw situatie. ' +
    'Artikelen worden gescoord op basis van je profiel en doelen. ' +
    'Sla items op of markeer ze als gelezen.',

  '/berichten':
    'Je berichtencentrum: alle meldingen die je ontvangt komen hier samen — ' +
    'budgetwaarschuwingen, partner-transacties, mijlpalen, herinneringen en nog-in-te-vullen-tips. ' +
    'Filter op ongelezen en markeer berichten als gelezen. ' +
    'Het financiële nieuws vind je in De Krant, je wekelijkse briefing op het Overzicht.',

  '/rapportages':
    'Overzicht van je financiële rapportages: balans, budget-analyse en vermogensverloop. ' +
    'Genereer rapporten voor een specifieke periode of bekijk trends over tijd. ' +
    'Exporteer als PDF voor je administratie.',

  '/rapportages/balans':
    'Je vermogensbalans op één peildatum: activa links, passiva rechts, eigen vermogen als sluitstuk. ' +
    'Plus kengetallen zoals solvabiliteit en liquiditeit, en je eigen vermogen vertaald naar vrijheidstijd. ' +
    'Druk af als PDF voor je administratie.',

  '/rapportages/vermogen':
    'Een volledige inventaris van wat je bezit en wat je schuldig bent, per categorie uitgesplitst. ' +
    'Inclusief verdieping op holdings, woonbalans, verhuur en hypotheek. ' +
    'Onderaan zie je je netto vermogen omgerekend naar vrijheidstijd.',

  '/rapportages/budget':
    'Hoe je begroting zich verhoudt tot wat je werkelijk uitgaf deze periode, per categorie. ' +
    'Zie waar je onder of over budget zit en wat dat met je spaarquote — de vrijheid die je opbouwt — doet. ' +
    'Afdrukbaar als PDF.',

  '/rapportages/benchmark':
    'Hoe jouw cijfers zich verhouden tot vergelijkbare huishoudens: spaarquote, vermogen en woonlasten. ' +
    'Een spiegel, geen oordeel — bedoeld om van te leren, niet om te scoren.',

  '/rapportages/persoonlijk-plan':
    'Je financiële plan op één plek: waar je nu staat, waar je heen wilt en de stappen ertussen. ' +
    'Een leesbaar document dat je doelen, projectie en keuzes samenvat. ' +
    'Druk het af of houd het bij de hand.',

  '/rapportages/totaalplan':
    'Je volledige plan als één deelbaar document: de aannames waarmee gerekend wordt, je vermogensprojectie naar volledige vrijheid, de slagingskans onder marktschommelingen en concrete inzichten. ' +
    'Alle cijfers komen single-source uit dezelfde rekenmotor als Toekomst en Overzicht — niets wordt hier apart berekend. ' +
    'Druk af als PDF voor je partner of adviseur.',

  '/toekomst/doelen':
    'Je financiële doelen en hun voortgang: hoeveel je al hebt, hoeveel nog te gaan en wanneer je er bent. ' +
    'Elk doel is een stuk vrijheid dat je opbouwt. ' +
    'Voeg een doel toe of stel een bestaande bij.',

  '/toekomst/gebeurtenissen':
    'De levensgebeurtenissen op je tijdas: pensioen, AOW, een huis kopen of verkopen, een erfenis. ' +
    'Elk event verschuift je vrijheidsmoment. ' +
    'Voeg er een toe of sleep \'m naar een ander jaar en zie meteen het effect.',

  '/toekomst/voorkeuren':
    'De aannames achter je projectie: verwacht rendement, inflatie, je uitgaven na pensioen en je gekozen eindleeftijd. ' +
    'Klein draaien aan deze knoppen verschuift jaren vrijheid. ' +
    'Hier stel je ze in.',

  '/toekomst/bibliotheek':
    'Je opgeslagen wat-als-scenario\'s en berekeningen op één plek. ' +
    'Open er een om verder te verkennen of vergelijk \'m met je huidige plan. ' +
    'Zo houd je grip op de keuzes die je onderzocht.',
}
