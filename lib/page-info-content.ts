/**
 * Page-info content — beschrijvingen voor de "Wat zie ik hier?" info-knop.
 *
 * Elke hoofdpagina heeft 2-3 zinnen die uitleggen wat je op die pagina ziet
 * en wat je er kunt doen. Wordt getoond in de PageInfoButton popover.
 */

export const PAGE_INFO: Record<string, string> = {
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
    'De Wil is je dagelijkse cockpit: hier zie je je briefing, aanbevelingen en acties. ' +
    'Widgets tonen actuele inzichten over je financiën. ' +
    'Sleep widgets om je dashboard te personaliseren.',

  '/horizon':
    'De Horizon projecteert je financiële toekomst. ' +
    'Je ziet wanneer je financieel vrij bent, hoe scenario\'s je pad beïnvloeden, en wat levensgebeurtenissen kosten. ' +
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

  '/rapportages':
    'Overzicht van je financiële rapportages: balans, budget-analyse en vermogensverloop. ' +
    'Genereer rapporten voor een specifieke periode of bekijk trends over tijd. ' +
    'Exporteer als PDF voor je administratie.',
}
