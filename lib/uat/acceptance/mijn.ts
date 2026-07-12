/**
 * Acceptatiecriteria — domein Mijn: profiel, huishouden, account & voorkeuren
 * (WF-MIJN-01..09, 11..16, 18..22, 24..29 / UAT-MIJN-01..09, 11..16, 18..22, 24..29).
 *
 * Spiegelt exact de aanpak van `start.ts`/`nav.ts`/`schuld.ts`. Bron:
 * `docs/uat/uat-plan.md` Deel 1 (WF-MIJN-01..29) + Deel 2 §"UAT-scenario's — Mijn".
 *
 * DRIE VERWIJSREGELS — bewust GEEN eigen criterium hier (het UAT-plan §11574
 * wijst ze door naar een NAV-scenario, en `lib/uat/catalog.ts` bevat dan ook
 * géén UAT-MIJN-10/17/23):
 *  - WF-MIJN-10 (perspectief wisselen)   → UAT-NAV-19 (leidend).
 *  - WF-MIJN-17 (bedragen maskeren)      → UAT-NAV-11 (leidend).
 *  - WF-MIJN-23 (weergavemodus Eenv./Vol.) → UAT-NAV-10 (leidend).
 * MIJN is dus, net als SCHULD/NAV/TOEK, NIET aaneengesloten op WF-nummer maar
 * WEL 1-op-1 met de 26 catalogus-scenario's.
 *
 * KERN-BEVINDING (bepaalt exact/consistency/ui-only): MIJN is een
 * UI/interactie-zware instellingen- en huishoudzone. De overgrote meerderheid
 * is pure interactie/persistentie zonder eigen berekening ('ui-only'):
 * profiel bewerken, huishouden opbouwen/verlaten, privacy-toggles, account,
 * koppelingen, notificaties, uiterlijk, check-ins, feedback, export/reset.
 *
 * DRIE criteria zijn wél 'exact' herleidbaar op échte, client-veilige
 * rekenfuncties/constanten (persona 'compleet' = Tessa, jaar 2026):
 *  - WF-MIJN-03: het netto maandinkomen dat hier wordt vastgelegd is dezelfde
 *    bron die de canonieke jaarruimte (pensioen-aftrekruimte Box 1) voedt —
 *    `computeJaarruimte` + `resolvePensionFactorA` bewijzen de doorwerking
 *    (SSoT + NULL≠0-semantiek van factor A).
 *  - WF-MIJN-08: de gedeelde-budget-split van het huishouden via de canonieke
 *    `computeSharePct` (LIVE-BLOCKED — vereist een écht tweede account; de
 *    engine-check bewijst alleen de reken-split, spiegelt WF-SCHULD-18).
 *  - WF-MIJN-11: de add-on-prijzen (AI €9 / Connected €4) uit de canonieke
 *    commerciële catalogus `ADDON_PLANS` — dezelfde bron als /mijn/account en de
 *    marketing-"Pro €9" (spiegelt WF-START-04).
 *
 * ÉÉN criterium is 'consistency' (A=B, geen los na te rekenen cijfer):
 *  - WF-MIJN-09: het in de review-tekst genoemde aantal samen te voegen
 *    categorieën moet exact gelijk zijn aan `merge_mapping.length` (= het aantal
 *    keuzeparen uit het voorstel, WF-MIJN-08). Geen los-exporteerbare pure
 *    functie (server-endpoint) + LIVE-afhankelijk → consistency, geen engine-check.
 *
 * De net-worth-inclusie-slider (net_worth_inclusion_pct) heeft bewust GEEN eigen
 * MIJN-scenario: die instelling leeft per bezitting/schuld en wordt exact
 * getoetst in WF-SCHULD-17 / het BEZIT-domein, niet op /mijn.
 *
 * HUISHOUD-SCENARIO'S (WF-MIJN-04/05/06/07/08/09/29) zijn in de LIVE-run
 * BLOCKED: ze vereisen een écht tweede account (partner) + geaccepteerd
 * huishouden (twee testaccounts via /beheer/testdata). De persona-seed zet alle
 * items op ownership 'personal', dus de gedeelde/partner-paden verschijnen pas
 * na een echt huishoudlid. De engine-check (WF-MIJN-08) draait wél — puur
 * in-memory op de reken-split, geen DB-seed nodig.
 */

import type { AcceptanceCriterion, AcceptanceSet } from './types'

const criteria: AcceptanceCriterion[] = [
  {
    workflow: 'WF-MIJN-01',
    scenarioId: 'UAT-MIJN-01',
    titel: 'Mijn-hub verkennen en naar een instellingenpagina navigeren',
    kriticiteit: 'OVERIG',
    given: 'Ingelogd, open /mijn (de instellingen-hub).',
    when: 'De gebruiker leest het kaart-grid en klikt door naar een onderwerp (profiel, account, privacy, notificaties, koppelingen, uiterlijk, geavanceerd).',
    then: 'Elke kaart landt op de juiste /mijn/*-subroute; het grid dekt de in de nav geregistreerde onderwerpen (feedback is bewust verweesd — alleen via ⌘K/URL bereikbaar).',
    assertion: {
      kind: 'ui-only',
      source: 'components/mijn/mijn-overview.tsx + lib/navigation.ts#mijnNav — navigatie zonder cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-MIJN-02',
    scenarioId: 'UAT-MIJN-02',
    titel: 'Persoonlijke gegevens bewerken en opslaan',
    kriticiteit: 'KERN',
    given: 'Ingelogd, /mijn/profiel, sectie "Persoonlijke Gegevens".',
    when: 'De gebruiker wijzigt naam, bibliotheek-weergavenaam (max 40), geboortedatum, land en huishoudtype en klikt "Opslaan" (boven- of onderknop).',
    then: 'Groene melding "Opgeslagen!" (verdwijnt na ~3s); na herladen zijn alle waarden intact (upsert op `profiles`); beide "Opslaan"-knoppen bewaren het volledige formulier (persoonlijk + huishoudprofiel) in één keer; lege bibliotheeknaam → later "Anoniem".',
    assertion: {
      kind: 'ui-only',
      source: 'app/(app)/mijn/profiel/page.tsx#saveProfile (Supabase upsert profiles), geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-MIJN-03',
    scenarioId: 'UAT-MIJN-03',
    titel: 'Huishoudprofiel (NIBUD) invullen',
    kriticiteit: 'KERN',
    persona: 'compleet',
    given: 'Persona Tessa Compleet geladen (net_monthly_income €7.600, marginaal_tarief 49,5%, geen `pension_factor_a`). Het netto maandinkomen wordt in dit scherm vastgelegd en is dezelfde bron die de canonieke jaarruimte (pensioen-aftrekruimte Box 1) voedt.',
    when: 'De gebruiker vult het huishoudprofiel (incl. netto maandinkomen) in en slaat op; de belasting-doorwerking leidt hieruit de jaarruimte 2026 af.',
    then: 'Afgeleid bruto jaarinkomen ≈ €180.594 (netto×12 / (1−marginaal), zelfde afleiding als de Belasting-pagina). Jaarruimte 2026 = €35.588 (geplafonneerd via de grondslag-cap 30% × (137.800 − 19.172), inkomen ligt boven de cap). Factor A is niet ingevuld → `resolvePensionFactorA` geeft factorA 0 met isKnown=false (NULL ≠ €0: "niet ingevuld", geen "€0 aangroei"), dus geen factor-A-aftrek.',
    assertion: {
      kind: 'exact',
      expected: 'jaarruimte2026=35588; factorA=0; factorAKnown=false',
      source: 'lib/jaarruimte.ts#box1JaarruimteStatus (bruto-afleiding uit net_monthly_income + marginaal_tarief) → computeJaarruimte(gross, factorA, 2026) + resolvePensionFactorA(PERSONAS.compleet.profile) — zie mijn-checks.ts',
    },
  },
  {
    workflow: 'WF-MIJN-04',
    scenarioId: 'UAT-MIJN-04',
    titel: 'Huishouden starten: partner uitnodigen',
    kriticiteit: 'KERN',
    given: '⚠ LIVE = BLOCKED: vereist twee échte testaccounts (uitnodiger + partner) via /beheer/testdata, beide gereset. Ingelogd als huishoud-eigenaar, /mijn/profiel, sectie "Huishouden".',
    when: 'De gebruiker vult een huishoudnaam + partner-e-mail in en verstuurt de uitnodiging (of kopieert de link zonder RESEND_API_KEY).',
    then: 'Groene melding "Uitnodiging verstuurd naar …"; de openstaande uitnodiging toont "Nog 7 dagen"; het invite-formulier verdwijnt zolang er een actieve uitnodiging staat; e-mail zonder "@" → validatiefout; "Link" kopieert een `/household-invite?token=…`-URL (buiten HTTPS: "Kopiëren niet mogelijk. Gebruik HTTPS.").',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/household-section.tsx (invite-flow) + server-mail via Resend / kopieerbare link, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-MIJN-05',
    scenarioId: 'UAT-MIJN-05',
    titel: 'Huishoudens-uitnodiging ontvangen: accepteren of weigeren',
    kriticiteit: 'KERN',
    given: '⚠ LIVE = BLOCKED: vervolg op WF-MIJN-04 (echt tweede account). Ingelogd als de uitgenodigde partner.',
    when: 'De partner opent de link (`/household-invite?token=…`) óf de kaart op /mijn/profiel en klikt Accepteren resp. Weigeren.',
    then: 'Accepteren: token verdwijnt uit de URL, melding "Je bent toegetreden tot het huishouden!", ledenlijst "Leden (2/2)". Weigeren: melding "Uitnodiging geweigerd", partner blijft zonder huishouden en de uitnodiging is niet langer "in afwachting"; link zonder token → kaal /mijn/profiel zonder fout.',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/household-section.tsx + /household-invite (token-verwerking), geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-MIJN-06',
    scenarioId: 'UAT-MIJN-06',
    titel: 'Huishouden verlaten',
    kriticiteit: 'KERN',
    given: '⚠ LIVE = BLOCKED: actief huishouden met twee échte accounts. Ingelogd als niet-eigenaar.',
    when: 'De gebruiker klikt "Huishouden verlaten", leest de bevestigings-BottomSheet en bevestigt (of annuleert).',
    then: 'Verlaten: melding "Je hebt het huishouden verlaten"; gedeelde items worden weer persoonlijk; de sectie toont weer het invite-formulier; het huishouden blijft bestaan met de eigenaar als enig lid (partner-secties verdwijnen bij beiden). Annuleren: geen wijziging.',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/household-section.tsx (leave-flow, ownership → personal), geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-MIJN-07',
    scenarioId: 'UAT-MIJN-07',
    titel: 'Privacy binnen het huishouden per categorie instellen',
    kriticiteit: 'BELANGRIJK',
    given: '⚠ LIVE = BLOCKED: actief huishouden (echt tweede account). Ingelogd, /mijn/profiel, sectie "Privacy binnen je huishouden".',
    when: 'De gebruiker zet per categorie (Vermogen/Schulden/Budgetten/Transacties/Inkomen + Toekomst) een niveau Volledig/Totalen/Verborgen en slaat op.',
    then: 'Melding "Privacy-instellingen opgeslagen!"; in partner-perspectief ziet de partner exact de ingestelde granulariteit ("Totalen" → één geaggregeerde som via `applyPrivacyFilter`, "Verborgen" → weg); budget-privacy < "Volledig" blokkeert de merge-wizard (WF-MIJN-08); zonder huishouden rendert de sectie niet.',
    assertion: {
      kind: 'ui-only',
      source: 'components/mijn/household-privacy-settings.tsx + lib/household-data.ts#normalisePrivacySettings/applyPrivacyFilter — de aggregatie is hand-narekenbaar maar de doorwerking is LIVE (partner-perspectief), geen eigen scenario-cijfer',
    },
  },
  {
    workflow: 'WF-MIJN-08',
    scenarioId: 'UAT-MIJN-08',
    titel: 'Eén gezamenlijk huishoudbudget voorstellen (merge-wizard)',
    kriticiteit: 'KERN',
    given: '⚠ LIVE = BLOCKED: vereist een écht tweede account + geaccepteerd huishouden; de persona-seed zet alle items op ownership "personal", dus de gedeelde-budget-split verschijnt pas na een echt huishoudlid. De engine-check bewijst alleen de reken-split (spiegelt WF-SCHULD-18). Verdeelmodel default "Gelijk verdelen" (50/50), gedeeld budget €600.',
    when: 'De gebruiker stelt één gezamenlijk huishoudbudget voor; het resulterende gedeelde budget wordt per partner gesplitst volgens het verdeelmodel (equal / custom / one_carries_all).',
    then: 'Equal → jouw aandeel 50% = €300; Custom 60% (jij primary payer) → 60% = €360 (partner 40% = €240); One-carries-all (jij primary) → 100% = €600 (partner €0). De canonieke kant per categoriepaar volgt bovendien de tx-count-regel (hoogste transactie-aantal, eigen kant bij gelijkspel).',
    assertion: {
      kind: 'exact',
      expected: 'equalPct=50; customPct=60; customPartnerPct=40; carriesPct=100; carriesPartnerPct=0; equalEuro=300; customEuro=360',
      source: 'lib/household-data.ts#computeSharePct ({splitMode} equal/custom/one_carries_all, primaryPayerId) toegepast op een gedeeld budget van €600 — zie mijn-checks.ts',
    },
  },
  {
    workflow: 'WF-MIJN-09',
    scenarioId: 'UAT-MIJN-09',
    titel: 'Huishoudbudget-voorstel afhandelen (reviewen, afwijzen, intrekken, terugdraaien)',
    kriticiteit: 'KERN',
    given: '⚠ LIVE = BLOCKED: vervolg op WF-MIJN-08 (echt tweede account) — een voorstel staat open bij de partner.',
    when: 'De ontvanger reviewt/accepteert/afwijst, of de indiener trekt in, of een actief huishoudbudget wordt teruggedraaid.',
    then: 'Accepteren → budgetmodel "household", link naar /core/budgets. Het in de review-tekst genoemde aantal "samen te voegen categorieën" moet EXACT gelijk zijn aan `merge_mapping.length` (= het aantal keuzeparen uit WF-MIJN-08) — een A=B-consistentietoets tussen voorstel en review. Afwijzen/intrekken → terug naar gescheiden; terugdraaien → nieuwe wacht-/review-cyclus (`target_model: "separate"`, alleen "Afwijzen", geen wizard).',
    assertion: {
      kind: 'consistency',
      source: 'components/mijn/household-budget-model-section.tsx + /api/household/budget-model — review-telling = merge_mapping.length; geen los na te rekenen cijfer, geen pure export, LIVE-afhankelijk',
    },
  },
  {
    workflow: 'WF-MIJN-11',
    scenarioId: 'UAT-MIJN-11',
    titel: 'Abonnement bekijken en upgraden ("Binnenkort")',
    kriticiteit: 'BELANGRIJK',
    given: 'Ingelogd, /mijn/account, sectie "Abonnement". De add-on-catalogus in de app is de canonieke commerciële bron (dezelfde als de marketing-prijzen).',
    when: 'De gebruiker bekijkt welke add-ons actief zijn en opent de "Binnenkort"-sheet (checkout volgt later via Polar).',
    then: 'De AI-add-on toont €9/maand en de Connected-add-on €4/maand: `ADDON_PLANS` bevat `tier "ai"` met priceEur=9 (dezelfde €9 als marketing-"Pro") en `tier "connected"` met priceEur=4.',
    assertion: {
      kind: 'exact',
      expected: 'aiPriceEur=9; connectedPriceEur=4',
      source: "lib/subscription-catalog.ts#ADDON_PLANS.find(p => p.tier === 'ai'/'connected').priceEur — canonieke catalogus, dezelfde bron als /mijn/account",
    },
  },
  {
    workflow: 'WF-MIJN-12',
    scenarioId: 'UAT-MIJN-12',
    titel: 'AI-creditsverbruik inzien',
    kriticiteit: 'BELANGRIJK',
    given: 'Ingelogd, /mijn/account, sectie "AI-credits".',
    when: 'De gebruiker bekijkt verbruik, prognose, resetdatum en de per-functie-uitsplitsing.',
    then: 'Verbruik/prognose/reset en de per-functie-verdeling worden getoond; de cijfers komen uit de token-usage-logging (feature/label), niet uit een hand-narekenbare formule op persona-brondata.',
    assertion: {
      kind: 'ui-only',
      source: 'components/mijn/account/ai-credits-section.tsx (token-usage-aggregatie) — verbruiksdata, geen deterministische persona-berekening',
    },
  },
  {
    workflow: 'WF-MIJN-13',
    scenarioId: 'UAT-MIJN-13',
    titel: 'Inloggegevens beheren: e-mail, wachtwoord, overal uitloggen',
    kriticiteit: 'BELANGRIJK',
    given: 'Ingelogd, /mijn/account, sectie "Account".',
    when: 'De gebruiker wijzigt e-mail of wachtwoord (6+ tekens) of klikt "Overal uitloggen".',
    then: 'E-mailwijziging vraagt om bevestiging via mail; wachtwoordwijziging slaagt bij een geldig nieuw wachtwoord; "Overal uitloggen" beëindigt alle sessies (global sign-out).',
    assertion: {
      kind: 'ui-only',
      source: 'components/mijn/account/account-basis-section.tsx (updateUser + signOut scope global), geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-MIJN-14',
    scenarioId: 'UAT-MIJN-14',
    titel: 'Account permanent verwijderen (getypte bevestiging)',
    kriticiteit: 'KERN',
    given: 'Ingelogd, /mijn/account, sectie "Danger zone".',
    when: 'De gebruiker typt exact het eigen e-mailadres over ter bevestiging en bevestigt de verwijdering.',
    then: 'De verwijderknop blijft disabled tot het e-mailadres exact klopt; bij bevestiging worden account én alle data onomkeerbaar gewist en volgt uitlog/redirect. Verschil met WF-MIJN-25: daar blijft het account bestaan.',
    assertion: {
      kind: 'ui-only',
      source: 'components/mijn/account/danger-zone.tsx (getypte e-mailbevestiging + admin.deleteUser-pad), geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-MIJN-15',
    scenarioId: 'UAT-MIJN-15',
    titel: 'Privacy- en transparantie-overzicht raadplegen',
    kriticiteit: 'OVERIG',
    given: 'Ingelogd, /mijn/privacy.',
    when: 'De gebruiker leest per data-categorie wat wordt opgeslagen, waar en waarom, met de AVG-acties en de privacyverklaring-link.',
    then: 'Elke categorie toont opslag/locatie/doel; de AVG-acties (export/verwijderen) linken naar de juiste plek; de privacyverklaring opent.',
    assertion: {
      kind: 'ui-only',
      source: 'components/mijn/privacy-overview.tsx — statische transparantie-content, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-MIJN-16',
    scenarioId: 'UAT-MIJN-16',
    titel: 'AI-instellingen: financiële toelichting en AI aan/uit',
    kriticiteit: 'BELANGRIJK',
    given: 'Ingelogd, /mijn/privacy (AI-privacy-sectie).',
    when: 'De gebruiker geeft de AI een persoonlijke context/toelichting mee en/of schakelt alle AI-functies uit.',
    then: 'De toelichting wordt opgeslagen en meegegeven aan de AI-context; de kill-switch schakelt alle AI-functies uit (geen AI-oproepen meer), consistent app-breed.',
    assertion: {
      kind: 'ui-only',
      source: 'components/mijn/ai-privacy-settings.tsx (AI-context-toelichting + kill-switch), geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-MIJN-18',
    scenarioId: 'UAT-MIJN-18',
    titel: 'Koppelingen inzien, verbinding testen en handmatig syncen',
    kriticiteit: 'KERN',
    given: 'Ingelogd, /mijn/koppelingen (crypto-exchanges, wallets, Trading 212).',
    when: 'De gebruiker bekijkt de status per bron, test de verbinding en start een handmatige sync per bron.',
    then: 'Per bron: statusweergave, een verbindingstest en een saldi-verversing; een gesynchroniseerde holding verschijnt in de holdings-lijst en telt identiek mee als een handmatige (waarde/eenheden gelijk op koppelingskaart en holdings-rij — doorwerking getoetst in het BEZIT-domein).',
    assertion: {
      kind: 'ui-only',
      source: 'app/(app)/mijn/koppelingen/page.tsx (broker/exchange-connections + per-bron sync) — LIVE-koppeling, geen deterministische persona-berekening',
    },
  },
  {
    workflow: 'WF-MIJN-19',
    scenarioId: 'UAT-MIJN-19',
    titel: 'Belastingaangifte importeren en een import per peildatum verwijderen',
    kriticiteit: 'KERN',
    given: 'Ingelogd; belastingaangifte-import (bezittingen/schulden in één keer vullen vanuit de IB-aangifte).',
    when: 'De gebruiker importeert een aangifte en verwijdert (randgeval) een eerdere import volledig op peildatum.',
    then: 'De import vult bezittingen/schulden in één keer; een import-verwijdering op peildatum ruimt exact die batch op (alles-of-niets per peildatum), zonder handmatig ingevoerde items te raken.',
    assertion: {
      kind: 'ui-only',
      source: 'app/api/onboarding/aangifte-extract/route.ts + import-verwijdering per peildatum, geen deterministisch scenario-cijfer',
    },
  },
  {
    workflow: 'WF-MIJN-20',
    scenarioId: 'UAT-MIJN-20',
    titel: 'Notificatievoorkeuren instellen (push-types + maandelijkse geldcheck-in)',
    kriticiteit: 'BELANGRIJK',
    given: 'Ingelogd, /mijn/notificaties.',
    when: 'De gebruiker kiest welke meldingstypes binnenkomen en zet de maandelijkse check-in-herinnering aan/uit.',
    then: 'De gekozen types en de check-in-herinnering worden bewaard; de "push-types" sturen uitsluitend in-app meldingen (geen browser-push — bevestigd geen web-push in de repo).',
    assertion: {
      kind: 'ui-only',
      source: 'app/(app)/mijn/notificaties/page.tsx (notificatie-preferences) — in-app meldingen, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-MIJN-21',
    scenarioId: 'UAT-MIJN-21',
    titel: 'Partner-transactiemeldingen configureren',
    kriticiteit: 'BELANGRIJK',
    given: 'Ingelogd (huishouden), /mijn/notificaties, sectie partner-transacties.',
    when: 'De gebruiker kiest wanneer een melding komt over partner-transacties: alles, boven een drempel, per categorie of nooit.',
    then: 'De gekozen regel wordt bewaard en bepaalt welke partner-transactiemeldingen doorkomen (doorwerking naar het berichtencentrum, complementair aan WF-WILL-13); "boven drempel" gebruikt het ingestelde bedrag als grens.',
    assertion: {
      kind: 'ui-only',
      source: 'app/(app)/mijn/notificaties/page.tsx (partner-transactieregel) — LIVE-huishouden, geen deterministisch scenario-cijfer',
    },
  },
  {
    workflow: 'WF-MIJN-22',
    scenarioId: 'UAT-MIJN-22',
    titel: 'Uiterlijk aanpassen: palet, typografie en geavanceerde kleuren',
    kriticiteit: 'BELANGRIJK',
    given: 'Ingelogd, /mijn/uiterlijk.',
    when: 'De gebruiker kiest een palet, een typografie-thema, module-accentkleuren (kern/wil/horizon), budget-tints en categoriekaart-tinten, en reset (randgeval) één accentkaart.',
    then: 'Wijzigingen zijn direct zichtbaar zonder page-reload en blijven na herladen bewaard (palet = per apparaat/localStorage; accentkleur+font = account-gebonden/DB); een accentkaart-reset zet alleen die kleur terug; geen licht/donker-toggle (de drie paletten zijn lichtgetint — bevestigd gedrag).',
    assertion: {
      kind: 'ui-only',
      source: 'components/mijn/{palette-picker,font-picker,module-accent-picker,budget-tint-picker,category-tint-picker}.tsx + PUT /api/appearance, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-MIJN-24',
    scenarioId: 'UAT-MIJN-24',
    titel: 'Data exporteren als CSV',
    kriticiteit: 'KERN',
    given: 'Ingelogd met enige data, /mijn/geavanceerd, sectie "Data export".',
    when: 'De gebruiker opent de export-dropdown (zes types: Transacties, Budgetten, Netto vermogen, Bezittingen, Schulden, Doelen) en download een type.',
    then: 'Elk type start een eigen CSV-download zonder fout; een leeg account levert een (vrijwel) leeg bestand; buiten de dropdown klikken sluit zonder download. Inhoud-consistentie (steekproef): het CSV-rijaantal komt overeen met wat het bijbehorende scherm toont voor dezelfde scope.',
    assertion: {
      kind: 'ui-only',
      source: 'components/mijn/geavanceerd-settings.tsx (CSV-export, 6 types) — LIVE-data-export, geen deterministisch scenario-cijfer',
    },
  },
  {
    workflow: 'WF-MIJN-25',
    scenarioId: 'UAT-MIJN-25',
    titel: 'Alle gegevens resetten en opnieuw beginnen',
    kriticiteit: 'KERN',
    given: 'Ingelogd met een wegwerp-testaccount, /mijn/geavanceerd, sectie "Gegevens resetten".',
    when: 'De gebruiker klikt "Alle gegevens wissen", leest de bevestigingsmodal en bevestigt (of annuleert / raakt een serverfout).',
    then: 'Bevestigen → alle financiële data gewist, redirect naar /onboarding, account blijft bruikbaar (verschil met WF-MIJN-14). Annuleren → geen wijziging; serverfout → "Reset mislukt. Probeer opnieuw." met data intact.',
    assertion: {
      kind: 'ui-only',
      source: 'components/mijn/geavanceerd-settings.tsx (reset-flow → /onboarding), geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-MIJN-26',
    scenarioId: 'UAT-MIJN-26',
    titel: 'Maandelijkse geldcheck-in doorlopen (7 stappen)',
    kriticiteit: 'KERN',
    given: 'Ingelogd met bezittingen/schulden/doelen/budgetten; start via /core/checkin (of de check-in-banner op /overzicht in de eerste week van de maand). /mijn/checkins is een letterlijke re-export van de historie-pagina.',
    when: 'De gebruiker doorloopt de 7 stappen (terugblik, herwaarderingen, doelen, budgetten, vooruitblik, reflectie) en legt een snapshot vast.',
    then: 'Alle 7 stappen doorlopen en een maand-snapshot wordt vastgelegd; bedragen respecteren de privacy-maskering (WF-MIJN-17/NAV-11); de banner-ingang op /overzicht is een steekproef (WF-OVZ-13). Dit scenario is LEIDEND voor de check-in-flow.',
    assertion: {
      kind: 'ui-only',
      source: 'app/(app)/core/checkin (7-staps check-in-flow, snapshot in profiles) — proces/persistentie, geen los na te rekenen scenario-cijfer',
    },
  },
  {
    workflow: 'WF-MIJN-27',
    scenarioId: 'UAT-MIJN-27',
    titel: 'Check-in-historie bekijken en een oude maand terugzien',
    kriticiteit: 'BELANGRIJK',
    given: 'Ingelogd met ≥1 afgeronde check-in, /mijn/checkins (identieke UI als /core/checkin/historie).',
    when: 'De gebruiker bladert door afgeronde check-ins en opent een oude maand read-only.',
    then: 'Afgeronde check-ins zijn doorbladerbaar; een oude maand toont read-only exact de destijds vastgelegde snapshot (A=B tussen historie en het oorspronkelijke moment); /mijn/checkins en /core/checkin/historie tonen identieke UI.',
    assertion: {
      kind: 'ui-only',
      source: 'app/(app)/mijn/checkins/page.tsx (re-export historie) — read-only snapshot-weergave, geen eigen berekening',
    },
  },
  {
    workflow: 'WF-MIJN-28',
    scenarioId: 'UAT-MIJN-28',
    titel: 'Feedback insturen',
    kriticiteit: 'OVERIG',
    given: 'Ingelogd, /mijn/feedback (verweesd in de nav — alleen via ⌘K/URL bereikbaar).',
    when: 'De gebruiker kiest een type (bug/idee/vraag), typt een bericht en verstuurt.',
    then: 'De feedback wordt verstuurd naar het team met een bevestiging; een leeg bericht wordt niet verstuurd.',
    assertion: {
      kind: 'ui-only',
      source: 'app/(app)/mijn/feedback/page.tsx — formulier-inzending, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-MIJN-29',
    scenarioId: 'UAT-MIJN-29',
    titel: 'Openstaande huishoud-uitnodiging intrekken',
    kriticiteit: 'KERN',
    given: '⚠ LIVE = BLOCKED: vereist een verstuurde (nog niet geaccepteerde) uitnodiging tussen twee échte accounts. Ingelogd als huishoud-eigenaar, /mijn/profiel, status "in afwachting".',
    when: 'De eigenaar trekt de openstaande uitnodiging in.',
    then: 'De uitnodiging wordt geannuleerd (verkeerde ontvanger krijgt geen toegang); de status "in afwachting" verdwijnt en het invite-formulier is weer beschikbaar om opnieuw uit te nodigen.',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/household-section.tsx (uitnodiging intrekken), geen cijfermatige uitkomst',
    },
  },
]

export const MIJN_ACCEPTANCE: AcceptanceSet = {
  zone: 'MIJN',
  criteria,
}
