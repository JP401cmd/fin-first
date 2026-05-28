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
    'Vier hefbomen (bezittingen, schulden, cashflow, belasting), je financiële gezondheidsscore, voortgang op je doelen en de wekelijkse briefing van Will. ' +
    'Klik op een hefboom voor verdieping.',

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

  '/overzicht/belasting':
    'Belasting over je inkomen (Box 1), aandeelhouderschap (Box 2) en vermogen (Box 3). ' +
    'Slim verdelen over fiscale bakjes scheelt geld per jaar. ' +
    'Bekijk je heffingen en gebruik je jaarruimte.',

  '/overzicht/acties':
    'Je open acties plus doelen die aandacht vragen. ' +
    'Nieuwe acties komen via twee kanalen: Will-chat (voorstellen accepteren) of de "Nieuwe actie"-knop. ' +
    'Sleep tussen lanes om uit te stellen, af te ronden of te wijzigen.',

  '/toekomst':
    'Waar ga je heen. ' +
    'Tijdas met opbouw (groen) en afbouw (oranje) tot je gekozen eindleeftijd, plus doelen, levensgebeurtenissen en voorkeuren die je projectie sturen. ' +
    'Sleep events om te zien hoe ze je vrijheidsmoment verschuiven.',

  '/toekomst/whatif':
    'Wat-als-keuzes spelen met je projectie. ' +
    'Verander je sparen, rendement of pensioenleeftijd en zie direct hoeveel jaar of maanden vrijheid je dat oplevert. ' +
    'Geen toezegging — alleen verkennen.',

  '/toekomst/strategie':
    'Drie levensstrategieën die je vrijheidsmoment het sterkst sturen: ' +
    'AOW (wanneer en hoeveel), pensioen (opbouw en uitkering) en huis (kopen, behouden, afbetalen). ' +
    'Klein draaien aan deze knoppen verschuift jaren.',

  '/toekomst/uitgaven-na-pensioen':
    'Wat ga je werkelijk uitgeven als je niet meer hoeft te werken. ' +
    'Eenzelfde uitgavenpatroon of bewust minder — dit getal bepaalt de hoogte van je vrijheidsdoel. ' +
    'Geen aanname; je eigen keuze.',

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

  '/mijn/delen':
    'Deel mijlpalen, jaaroverzicht of een vrijheidskaart met je partner of vrienden. ' +
    'Pure delen — niemand ziet je rekening-saldo of transacties zonder dat jij actief deelt. ' +
    'Privacy-eerst, altijd.',

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

  '/will':
    'Je dagelijkse cockpit: hier zie je je briefing, aanbevelingen en acties. ' +
    'Widgets tonen actuele inzichten over je financiën. ' +
    'Sleep widgets om je dashboard te personaliseren.',

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

  '/horizon/strategie':
    'Je onttrekkingsstrategie na financiële vrijheid. ' +
    'Kies hoe je vermogen opneemt (vast percentage, variabel, of bucket-strategie) en zie de impact op levensduur. ' +
    'Pas parameters aan voor jouw situatie.',

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
    'Je dagelijkse briefing van Will, plus notificaties en gefilterd financieel nieuws. ' +
    'Eén pagina waar alle voor jou relevante updates samenkomen — wat speelt vandaag, wat heb je gemist. ' +
    'Sla berichten op of markeer ze als gelezen.',

  '/rapportages':
    'Overzicht van je financiële rapportages: balans, budget-analyse en vermogensverloop. ' +
    'Genereer rapporten voor een specifieke periode of bekijk trends over tijd. ' +
    'Exporteer als PDF voor je administratie.',
}
