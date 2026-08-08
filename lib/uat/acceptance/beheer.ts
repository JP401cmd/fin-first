/**
 * Acceptatiecriteria — domein Beheer (admin) (WF-BEHEER-01..36 / UAT-BEHEER-01..36).
 *
 * Spiegelt exact de aanpak van `start.ts`/`nav.ts`/`rapp.ts` (de UI-heavy zones).
 * Bron: `docs/uat/uat-plan.md` Deel 1 (workflow-definities WF-BEHEER-01..33) +
 * de catalogus in `lib/uat/catalog.ts` (UAT-BEHEER-01..36). BEHEER is
 * aaneengesloten 01..36 (36 catalogus-scenario's, GEEN verwijsregel-gaten) —
 * elk scenario heeft hier precies één criterium. 34 (Webprestaties) kwam
 * later bij: read-only Core Web Vitals-observability boven op de web_vitals-
 * tabel, dezelfde superadmin/service-role/consistency-vorm als 04/32. 35
 * (FIRE-marktaannames CRUD) voegde de eerste mutatie-workflow op de fiscale-
 * kerngetallen-pagina toe. 36 (Versie & git-dashboard) is het alleen-lezen
 * git-/deploy-/migratiedashboard op /beheer/versie.
 *
 * KERN-BEVINDING (bepaalt exact/consistency/oracle/ui-only): BEHEER is
 * admin-tooling achter superadmin-gating — de motoren wonen elders (Kern/
 * Toekomst/Fin) en worden in beheer alleen geconfigureerd, ingezien of
 * getest. Er is dus GEEN eigen rekenkern; "exact" wordt daarom BEWUST niet
 * geforceerd (0 exact-criteria, lege BEHEER_ENGINE_CHECKS). De verdeling:
 *
 *  - 0  'exact'       — BEHEER heeft geen eigen hand-narekenbare rekenformule.
 *  - 12 'consistency' — een getoond getal komt aantoonbaar ergens anders vandaan
 *                        (A=B): AI-credit-/token-/KPI-aggregaten = som van de
 *                        usage-/DB-rijen (03/04), supportview-diagnose = de
 *                        eigen schermen van de doelgebruiker (08), AOW-tabel =
 *                        SVB-bron/kernel-consumptie (15), fiscale kerngetallen =
 *                        de canonieke bronconstanten (16, consume-don't-recompute),
 *                        persona-seed = de dataset + schermen (20),
 *                        budget-template-kassabon = Σ template (21),
 *                        architectuur-plaat-tellingen = architecture.json (30),
 *                        integratie-tellingen = service-role COUNT op de
 *                        bron-tabellen (32), webprestaties-p75 = de web_vitals-
 *                        aggregatie-RPC's + officiële CWV-drempels (34),
 *                        FIRE-marktaannames-CRUD = de resolver + SWR-preview
 *                        (35), versie-/migratiedashboard = git-plumbing +
 *                        computeMigrationDrift() (36).
 *  - 2  'oracle'      — een zware-rekenmotor-uitkomst die NIET met de hand na te
 *                        rekenen is (de horizon-kernel). types.ts noemt precies
 *                        déze twee beheer-UI's als de oracle-UI: de
 *                        horizon-strategiematrix (26) en de horizon-kernel-
 *                        transparantie + Excel-oracle-verificatie (27).
 *  - 22 'ui-only'     — configuratie/inhoudsbeheer/naslag/moderatie zonder
 *                        cijfermatige uitkomst.
 *
 * SUPERADMIN-GATING (blanket): alle scenario's draaien als superadmin — het
 * UAT-testaccount is superadmin. De /beheer-layout weert niet-admins al
 * server-side (redirect naar /overzicht); /beheer/kpi en /beheer/ai-verbruik
 * hebben daarbovenop een eigen superadmin-check. Dit staat expliciet in het
 * `given` van WF-BEHEER-01 (het toegangscontrole-scenario) en geldt impliciet
 * voor de rest.
 *
 * META/RECURSIEF: enkele scenario's raken de UAT-/regressie-infrastructuur zelf
 * (de UAT-procesplaat, de regressietest-runner, de architectuur, testdata-
 * seeding). Die worden als ui-only/consistency behandeld — geen oneindige
 * regressie; deze uat.beheer-suite is zelf één van de suites die WF-BEHEER-25
 * kan draaien.
 */

import type { AcceptanceCriterion, AcceptanceSet } from './types'

const criteria: AcceptanceCriterion[] = [
  {
    workflow: 'WF-BEHEER-01',
    scenarioId: 'UAT-BEHEER-01',
    titel: 'Beheeromgeving betreden en navigeren; toegangscontrole',
    kriticiteit: 'KERN',
    given:
      'Ingelogd als superadmin (het UAT-testaccount is superadmin). De /beheer-layout weert niet-admins al server-side: een gewone gebruiker die /beheer of een diepe beheer-URL (bv. /beheer/gebruikers) opent, wordt naar /overzicht gestuurd; /beheer/kpi en /beheer/ai-verbruik hebben daarbovenop een eigen superadmin-check.',
    when:
      'De beheerder opent /beheer, bekijkt de vier groepen (Technisch beheer / Functioneel beheer / Test & ontwikkeling / Ter info), klikt een tegel en keert via de kop "Beheer" terug; een niet-admin probeert /beheer/gebruikers en /beheer/kpi rechtstreeks.',
    then:
      'De hub toont vier secties met tegels (label/icoon/omschrijving) uit lib/beheer-sections.ts; elke tegel opent de juiste beheerpagina met dezelfde groepsnav; de niet-admin belandt zonder foutmelding op /overzicht.',
    assertion: {
      kind: 'ui-only',
      source:
        'app/(app)/beheer/layout.tsx (superadmin-redirect) + lib/beheer-sections.ts (BEHEER_GROUPS) — navigatie/toegangscontrole, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-BEHEER-02',
    scenarioId: 'UAT-BEHEER-02',
    titel: 'AI-provider, model en systeemprompt configureren',
    kriticiteit: 'BELANGRIJK',
    given: '/beheer/ai (AI-instellingen) en /beheer/prompts (alleen-lezen naslag van alle domein-prompts).',
    when:
      'De beheerder kiest provider (Anthropic/OpenAI/Mistral/Ollama), vult model + API-keys in (een gemaskeerde "***"-key leeg laten = ongewijzigd), bewerkt de systeemprompt-override van Fin en slaat op; opent daarna /beheer/prompts.',
    then:
      '"Instellingen opgeslagen"; een override toont de badge "Aangepast" + "Reset naar standaard"; /beheer/prompts toont alle domein-prompts alleen-lezen. De instelling stuurt direct het productie-AI-gedrag; geen eigen berekening.',
    assertion: {
      kind: 'ui-only',
      source:
        'app/(app)/beheer/ai/page.tsx + prompts/page.tsx; API /api/admin/settings, /api/admin/ai-prompt-default — configuratie-opslag, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-BEHEER-03',
    scenarioId: 'UAT-BEHEER-03',
    titel: 'AI-feature-limieten en creditbudgetten instellen',
    kriticiteit: 'BELANGRIJK',
    given:
      '/beheer/ai-features: nieuws-verversingslimiet (default 3) en maandelijkse creditbudgetten (AI-abonnement 500 / gratis 50), plus een verbruiksblok.',
    when:
      'De beheerder past limieten/budgetten aan (opslaan alleen actief bij wijziging) en bekijkt het verbruiksblok: totaal verbruikte credits, verbruik per AI-functie en top-gebruikers.',
    then:
      'De creditverbruik-aggregaten worden server-side (/api/admin/ai-features) uit de AI_FEATURES-catalogus + usage-rijen opgeteld en moeten exact optellen tot die onderliggende verbruiksrijen — een A=B-consistentietoets (leunt op live data), geen los na te rekenen constante.',
    assertion: {
      kind: 'consistency',
      source:
        'app/(app)/beheer/ai-features/page.tsx + lib/ai-credits.ts (AI_FEATURES) — verbruiksaggregaat = som van de usage-rijen, consistentietoets',
    },
  },
  {
    workflow: 'WF-BEHEER-04',
    scenarioId: 'UAT-BEHEER-04',
    titel: 'AI-tokenverbruik en platform-kerngetallen inzien',
    kriticiteit: 'OVERIG',
    given: '/beheer/ai-verbruik (periode 7/30/90 dagen) en /beheer/kpi (platform-KPI’s deze maand).',
    when:
      'De beheerder bekijkt tokenverbruik per functie/account en de KPI-kaarten (gebruikers, tier-verdeling, AI-verbruik, foutmeldingen en e-mails deze maand).',
    then:
      'De tokenaggregaten (calls/input/output, opgeteld via addTo) en de KPI-"deze maand"-tellingen moeten exact optellen tot de onderliggende usage-/DB-rijen binnen de tijdzone-veilige maandgrens (localMonthBounds) — A=B met de bron, geen hand-narekenbaar cijfer (live telemetrie).',
    assertion: {
      kind: 'consistency',
      source:
        'app/(app)/beheer/ai-verbruik/page.tsx (addTo) + kpi/page.tsx + lib/month-range.ts#localMonthBounds — aggregaat = som van de bronrijen, consistentietoets',
    },
  },
  {
    workflow: 'WF-BEHEER-05',
    scenarioId: 'UAT-BEHEER-05',
    titel: 'TrueLayer-bankkoppeling configureren en verbinding testen',
    kriticiteit: 'BELANGRIJK',
    given: '/beheer/bank-connect (TrueLayer-koppeling).',
    when:
      'De beheerder zet TrueLayer aan/uit, vult Client ID/Secret + omgeving (sandbox/live) in, slaat op en klikt de verbindingstest.',
    then:
      '"Opgeslagen"; de live test toont succes of "Verbinding mislukt" (bij ontbrekende/ongeldige credentials). De instelling bepaalt of gebruikers op /mijn/koppelingen een bank kunnen koppelen; geen eigen berekening.',
    assertion: {
      kind: 'ui-only',
      source:
        'app/(app)/beheer/bank-connect/page.tsx; API /api/admin/settings (PUT) + /api/admin/bank-connect/test-connection (POST) — configuratie + live probe, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-BEHEER-06',
    scenarioId: 'UAT-BEHEER-06',
    titel: 'Platform-status beheren: onderhoud, aankondiging, AI-kill-switch',
    kriticiteit: 'BELANGRIJK',
    given: '/beheer/platform (onderhoudsmodus, aankondiging, kill-switches).',
    when:
      'De beheerder zet onderhoudsmodus + bericht aan, plaatst een aankondiging (niveau info/warning) en toggelt de AI-kill-switch, en slaat op.',
    then:
      '"Platform-status opgeslagen"; onderhoudsscherm, aankondigingsbanner en AI-beschikbaarheid werken direct door voor alle gebruikers; kill-switch uit blokkeert alle AI-functies. Geen eigen berekening.',
    assertion: {
      kind: 'ui-only',
      source:
        'app/(app)/beheer/platform/page.tsx + lib/platform-status.ts (DEFAULT_PLATFORM_STATUS); API /api/admin/platform (PUT) — status-configuratie, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-BEHEER-07',
    scenarioId: 'UAT-BEHEER-07',
    titel: 'Gebruiker zoeken en account beheren + geblokkeerd-account-keten',
    kriticiteit: 'KERN',
    given: '/beheer/gebruikers.',
    when:
      'De beheerder zoekt op e-mail, wijzigt de rol, blokkeert/deblokkeert (browser-bevestiging) en schakelt add-on-abonnementen (AI/Connected) aan/uit; een onbekend e-mailadres geeft een "geen gebruiker gevonden"-staat.',
    then:
      'Elke wijziging is direct actief en verschijnt in "Recente toewijzingen" + de audit-trail; blokkade logt de gebruiker direct uit en houdt hem buiten; abonnement stuurt de feature-gating in de hele app. Geen eigen berekening.',
    assertion: {
      kind: 'ui-only',
      source:
        'app/(app)/beheer/gebruikers/page.tsx + lib/subscription-catalog.ts (ADDON_PLANS); API /api/admin/tier-assign, /api/admin/users/role, /api/admin/users/block — accountbeheer, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-BEHEER-08',
    scenarioId: 'UAT-BEHEER-08',
    titel: 'Supportview-diagnose bekijken en account definitief verwijderen',
    kriticiteit: 'KERN',
    given: 'Een gevonden gebruiker op /beheer/gebruikers (WF-BEHEER-07), met eigen financiële data.',
    when:
      'De beheerder opent de Supportview-diagnose en verwijdert (uiterst geval) het account nadat het e-mailadres exact is overgetypt (de verwijderknop blijft anders disabled).',
    then:
      'De diagnose (aantal bezittingen + totaalwaarde, aantal schulden + totaal, netto vermogen, rekeningsaldi, transactie-aantal/-datum) moet EXACT gelijk zijn aan wat de eigen schermen van die gebruiker tonen — een A=B-consistentietoets op dezelfde bronrijen, geen los na te rekenen cijfer; verwijdering is onomkeerbaar en wordt (net als inzage) gelogd in de audit-trail.',
    assertion: {
      kind: 'consistency',
      source:
        'app/api/admin/user-diagnose/route.ts + user-delete/route.ts — diagnose-cijfers = de eigen bezittingen/schulden/rekeningen van de doelgebruiker (A=B met diens schermen), consistentietoets',
    },
  },
  {
    workflow: 'WF-BEHEER-09',
    scenarioId: 'UAT-BEHEER-09',
    titel: 'Coach-suggestieregels, timing en kopregel van Fin bijstellen',
    kriticiteit: 'BELANGRIJK',
    given: '/beheer/coach (vier lagen: uitgesteld / data-hiaat / pad / standaard).',
    when:
      'De beheerder bewerkt bericht/CTA/link per regel, schakelt regels aan/uit, past de timing (vertraging + auto-verdwijntijd) en de kopregel aan, en slaat op (of Reset per regel).',
    then:
      'De overrides sturen direct de coach-bubbel/suggesties van Fin (FinHome); niet-numerieke timing-invoer wordt genegeerd; Reset valt terug op de standaardtekst. Geen eigen berekening.',
    assertion: {
      kind: 'ui-only',
      source:
        'app/(app)/beheer/coach/page.tsx + lib/coach-suggestions.ts (DEFAULT_COACH_TIMING/HEADER); API /api/admin/coach — regel-/timing-configuratie, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-BEHEER-10',
    scenarioId: 'UAT-BEHEER-10',
    titel: 'Welkomstgids samenstellen met live-preview',
    kriticiteit: 'BELANGRIJK',
    given: '/beheer/welkom (welkomstgids-editor met live-preview).',
    when:
      'De beheerder voegt schermen/stappen toe, herordent (pijl-omhoog/omlaag), bewerkt teksten/links/iconen (alleen ALLOWED_ICONS), toggelt verplicht/aan-uit, bekijkt de preview en slaat op (of Reset naar DEFAULT_WELCOME_GUIDE).',
    then:
      'De opgeslagen gids verschijnt zo op /overzicht voor (nieuwe) gebruikers; de preview gebruikt hetzelfde weergavecomponent als productie. Geen eigen berekening.',
    assertion: {
      kind: 'ui-only',
      source:
        'app/(app)/beheer/welkom/page.tsx + components/overview/guide-screen-view.tsx + lib/welcome-guide.ts; API /api/admin/welcome-guide — inhoudsbeheer, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-BEHEER-11',
    scenarioId: 'UAT-BEHEER-11',
    titel: 'Briefing-directieven beheren',
    kriticiteit: 'BELANGRIJK',
    given: '/beheer/briefing (temporele en functionele redactieregels).',
    when:
      'De beheerder voegt directieven toe, kiest bij temporele directieven de maanden (Jan–Dec) + prioriteit, toggelt aan/uit en slaat op; een maandgebonden directief buiten zijn maand wordt getoetst.',
    then:
      'De directieven sturen de briefing-redactie voor alle gebruikers; isDirectiveActive bepaalt de maand-activatie; alle directieven verwijderen valt terug op de defaults (getDefaultDirectives). Geen eigen berekening.',
    assertion: {
      kind: 'ui-only',
      source:
        'app/(app)/beheer/briefing/page.tsx + lib/briefing/directives.ts (isDirectiveActive/DIRECTIVE_METRICS); API /api/admin/briefing-directives — redactieregels, geen cijfermatige uitkomst',
    },
  },
  // WF-BEHEER-12 ("Doelgids-stappen per doel beheren") is VERVALLEN — 8 aug 2026.
  // De doelgids had sinds ADR 0007 nul UI-consumers; /beheer/doelen en de
  // onderliggende routes/hook zijn verwijderd. Doel-gebonden begeleiding loopt
  // via de Welkomstgids (WF-BEHEER-10 aan beheerkant, ovz.ts aan gebruikerskant).
  // Het nummer 12 blijft bewust ONGEBRUIKT: scenario-ID's zijn de sleutel van
  // opgeslagen UAT-resultaten in Supabase — hernummeren zou die historie breken.
  {
    workflow: 'WF-BEHEER-13',
    scenarioId: 'UAT-BEHEER-13',
    titel: 'Nieuwsbronnen beheren, ingest draaien en artikelen modereren',
    kriticiteit: 'BELANGRIJK',
    given: '/beheer/nieuws (web-/RSS-bronnen, ingest-status, artikelendatabase).',
    when:
      'De beheerder bewerkt bronnen (URL/label toevoegen/verwijderen), draait een ingest-ronde (POST), bekijkt de bron-gezondheid en doorzoekt/verwijdert artikelen.',
    then:
      'Bronnen opgeslagen (of Reset naar DEFAULT_WEB_SOURCES/DEFAULT_RSS_FEEDS); de ingest ververst de artikelen met zichtbaar resultaat (gecontroleerd/gevonden/geëxtraheerd/duplicaten/ingevoegd); dit bepaalt de Krant/nieuws-inhoud. Geen eigen berekening.',
    assertion: {
      kind: 'ui-only',
      source:
        'app/(app)/beheer/nieuws/page.tsx + lib/news-sources.ts; API /api/admin/news-ingest e.a. — bronbeheer/ingest/moderatie, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-BEHEER-14',
    scenarioId: 'UAT-BEHEER-14',
    titel: 'Vragenlijst opstellen, activeren en respons bekijken',
    kriticiteit: 'BELANGRIJK',
    given: '/beheer/vragenlijsten.',
    when:
      'De beheerder maakt een vragenlijst (vragen van type open/schaal/meerkeuze), zet ’m live/offline en opent de respons-sheet.',
    then:
      'Een actieve vragenlijst staat live voor gebruikers; de lijst toont per vragenlijst een Actief/Inactief-badge en rij-tellingen (vragen/invullingen/voltooid) en respons per deelnemer; lege staat = "Nog geen vragenlijsten aangemaakt". Weergave van rij-aantallen, geen eigen berekening.',
    assertion: {
      kind: 'ui-only',
      source:
        'app/(app)/beheer/vragenlijsten/page.tsx; API /api/admin/questionnaires(/[id]) — inhoudsbeheer, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-BEHEER-15',
    scenarioId: 'UAT-BEHEER-15',
    titel: 'AOW-leeftijdstabel bijhouden',
    kriticiteit: 'KERN',
    given: '/beheer/aow-leeftijd (opzoektabel AOW-leeftijd per geboortecohort, weergave via formatAowAge).',
    when:
      'De beheerder voegt cohortrijen toe / bewerkt / verwijdert (geboortedatum-grenzen, AOW-jaren/-maanden, definitief-vinkje, bron).',
    then:
      'De getoonde/geserveerde AOW-leeftijd per cohort ("67 jaar + 3 mnd") moet gelijk zijn aan de aow_leeftijden-rijen én toetsbaar tegen de officiële SVB-tabel; deze tabel voedt lookupAowAge → de horizon-kernel (AOW-instroommoment) en pensioenanalyses — een A=B-consistentietoets tussen tabel, weergave en kernel-consumptie (de lookupAowAge-functie zelf is exact gedekt in WF-RAPP-09).',
    assertion: {
      kind: 'consistency',
      source:
        'app/(app)/beheer/aow-leeftijd/page.tsx (formatAowAge) + lib/aow-leeftijd.ts#lookupAowAge; API /api/admin/aow-leeftijd — weergave/serving = tabelrijen = SVB-bron (A=B), consistentietoets',
    },
  },
  {
    workflow: 'WF-BEHEER-16',
    scenarioId: 'UAT-BEHEER-16',
    titel: 'Fiscale kerngetallen en jaar-checklist raadplegen',
    kriticiteit: 'OVERIG',
    given: '/beheer/fiscale-kerngetallen (inventaris van jaargebonden fiscale constanten; grotendeels alleen-lezen).',
    when:
      'De beheerder bekijkt per kerngetal de matrix (waarden per jaar), de bron en verificatiedatum, de jaar-checklist en de open drift-punten.',
    then:
      'De getoonde fiscale waarden worden LIVE afgelezen uit de canonieke bronconstanten (lib/box3-data.ts, box1-tax.ts, box2-data.ts, jaarruimte.ts, constants.ts) — nooit hier gedupliceerd — en moeten daarmee exact overeenkomen (consume-don’t-recompute, A=B); buildJaarChecklist() en validateFiscaleKerngetallen() bewaken de curatie. Uitzondering (FASE 2): het kerngetal "FIRE-marktaannames" is sinds deze release NIET meer een losse constante maar jaargelaagd bewerkbaar via een DB-override-laag (tabel fire_assumptions, resolver resolveFireAssumptions) — die editor is een eigen mutatie-workflow, zie WF-BEHEER-35. De overige kerngetallen op deze pagina blijven read-only.',
    assertion: {
      kind: 'consistency',
      source:
        'lib/fiscale-kerngetallen.ts (FISCALE_KERNGETALLEN leest live uit de bronmodules; buildJaarChecklist/validateFiscaleKerngetallen) + lib/box3-data.ts (CURRENT_TAX_YEAR) — weergave = canonieke constanten (A=B), consistentietoets',
    },
  },
  {
    workflow: 'WF-BEHEER-35',
    scenarioId: 'UAT-BEHEER-35',
    titel: 'FIRE-marktaannames jaarlaag toevoegen/bewerken/verwijderen',
    kriticiteit: 'BELANGRIJK',
    given: '/beheer/fiscale-kerngetallen, FireAssumptionsEditor-tegel (superadmin-gated CRUD op tabel fire_assumptions).',
    when:
      'De beheerder voegt een jaarlaag toe (of bewerkt/verwijdert er een) met rendement/inflatie/volatiliteit in procenten en optioneel een bron + "definitief"-vlag.',
    then:
      'De invoer (procenten) wordt naar decimalen omgerekend en via POST/PUT/DELETE /api/admin/fire-assumptions weggeschreven (zod-gevalideerd: rendement/inflatie −100%..100%, volatiliteit 0..200%; year = PK); de route is superadmin-gated (401 niet ingelogd, 403 geen superadmin) en schrijft via getServiceClient (RLS staat alleen SELECT toe voor authenticated). De SWR-preview in het formulier EN de tabelkolom zijn puur afgeleid via computeEffectiveSwr (rendement−Box3-drag−inflatie) en worden nooit zelf ingevoerd of opgeslagen. Na opslaan resolven de rekenmotoren (dashboard-data-loader, /toekomst, /core) de nieuwe jaarlaag via resolveFireAssumptions; ontbrekende/lege jaarlagen vallen terug op de TS-constanten in lib/constants.ts (byte-identiek gedrag met vóór deze release).',
    assertion: {
      kind: 'consistency',
      source:
        'app/api/admin/fire-assumptions/route.ts (UpsertSchema/DeleteSchema, gateSuperAdmin, getServiceClient) + app/(app)/beheer/fiscale-kerngetallen/fire-assumptions-editor.tsx (procenten↔decimalen, previewSwr=computeEffectiveSwr) + lib/fire-assumptions.ts#resolveFireAssumptions (DB-override met TS-fallback, consume-don’t-recompute op de SWR)',
    },
  },
  {
    workflow: 'WF-BEHEER-17',
    scenarioId: 'UAT-BEHEER-17',
    titel: 'Widget-presets samenstellen en ordenen',
    kriticiteit: 'BELANGRIJK',
    given: '/beheer/widget-presets (dashboard-voorinstellingen, auto-save).',
    when:
      'De beheerder bewerkt naam/omschrijving inline, sleept widgets (dnd-kit / toetsenbord), wijzigt groottes en voegt widgets toe/verwijdert (duplicaten geweigerd).',
    then:
      'Elke mutatie schrijft direct weg (geen aparte opslaan-knop); de presets sturen de dashboard-samenstelling van gebruikers die de preset kiezen; uitgeschakelde widgets blijven achteraan. Geen eigen berekening.',
    assertion: {
      kind: 'ui-only',
      source:
        'app/(app)/beheer/widget-presets/page.tsx + lib/widget-catalog.ts + lib/widget-presets.ts + app/api/widget-presets/route.ts — samenstellen/ordenen, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-BEHEER-18',
    scenarioId: 'UAT-BEHEER-18',
    titel: 'Rekenhulp-meldingen modereren',
    kriticiteit: 'BELANGRIJK',
    given: '/beheer/calculator-reports (moderatie-inbox voor publieke rekenhulpen).',
    when:
      'De beheerder markeert een melding als beoordeeld of verbergt de rekenhulp (zet ’m niet-publiek én markeert de melding beoordeeld).',
    then:
      'De melding verdwijnt uit de open lijst; "Verberg calculator" haalt de gedeelde rekenhulp direct uit de publieke bibliotheek (/toekomst/bibliotheek). Geen eigen berekening.',
    assertion: {
      kind: 'ui-only',
      source:
        'app/(app)/beheer/calculator-reports/page.tsx + report-actions.tsx (server actions op calculator_reports/custom_calculators) — moderatie, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-BEHEER-19',
    scenarioId: 'UAT-BEHEER-19',
    titel: 'Gebruikersfeedback afhandelen',
    kriticiteit: 'OVERIG',
    given: '/beheer/feedback (ingezonden feedback: bug/idee/vraag/overig).',
    when: 'De beheerder wisselt per item de status new ↔ reviewed.',
    then:
      'Items krijgen de juiste status; bron is het feedback-formulier op /mijn/feedback; een lege lijst is mogelijk. Geen eigen berekening.',
    assertion: {
      kind: 'ui-only',
      source:
        'app/(app)/beheer/feedback/page.tsx; API /api/admin/feedback (GET/PATCH) — statusbeheer, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-BEHEER-20',
    scenarioId: 'UAT-BEHEER-20',
    titel: 'Persona-testdata laden (seeden)',
    kriticiteit: 'KERN',
    given:
      '/beheer/testdata, sectie "Testdata laden" — vijf persona’s (Daan Bakker, Lisa de Groot, Willem Jansen, Marijke Vermeer, Tessa Compleet).',
    when:
      'De beheerder kiest een persona-kaart, bevestigt (dit wist en vervangt alle eigen financiële data) en bekijkt de samenvattingstabel per tabel.',
    then:
      'De samenvattings-aantallen per tabel (Profiel … Vermogenssnapshots) zijn deterministisch en moeten gelijk zijn aan de persona-dataset (lib/test-personas.ts via seedPersonaData); de karakteristieke persona-kerngetallen (bv. Willems netto vermogen €1,62M) moeten daarna 1-op-1 op de gebruikersschermen kloppen — een A=B-consistentietoets tussen dataset, seed en schermen (LEIDEND voor WF-BEHEER-26).',
    assertion: {
      kind: 'consistency',
      source:
        'app/(app)/beheer/testdata/page.tsx + lib/test-personas.ts + lib/seed-persona.ts#seedPersonaData; API /api/admin/seed — seed-aantallen = dataset, kerngetallen = schermen (A=B), consistentietoets',
    },
  },
  {
    workflow: 'WF-BEHEER-21',
    scenarioId: 'UAT-BEHEER-21',
    titel: 'Budget-template laden',
    kriticiteit: 'KERN',
    given: '/beheer/testdata, sectie "Budget templates laden" (Starter / Gezin / ZZP / Pensioen).',
    when:
      'De beheerder bekijkt de kassabon-detail en laadt een template (vervangt alle budgetten, ontkoppelt maar bewaart transacties).',
    then:
      'De kassabon-totalen (totaal inkomen / totaal uitgaven / sparen & schulden) worden opgeteld uit template.getBudgets() (lib/budget-templates) en moeten gelijk zijn aan die brondata; het aantal aangemaakte budgetten (insertedCount) volgt uit de template — een A=B-consistentietoets tegen de template-definitie, geen los na te rekenen cijfer buiten de bron.',
    assertion: {
      kind: 'consistency',
      source:
        'app/(app)/beheer/testdata/page.tsx (handleApplyTemplate) + lib/budget-templates/index.ts (BUDGET_TEMPLATES.getBudgets) — kassabon-totaal = Σ template, consistentietoets',
    },
  },
  {
    workflow: 'WF-BEHEER-22',
    scenarioId: 'UAT-BEHEER-22',
    titel: 'Onboarding-flow opnieuw doorlopen (reset eigen account)',
    kriticiteit: 'KERN',
    given: '/beheer/testdata, blok "Onboarding flow testen".',
    when: 'De beheerder klikt "Onboarding starten", bevestigt (wist alle financiële data) en wordt naar /onboarding gestuurd.',
    then:
      'Na de reset navigeert de browser naar /onboarding als nieuwe gebruiker; een mislukte reset toont "Onboarding reset mislukt." zonder navigatie. Geen eigen berekening.',
    assertion: {
      kind: 'ui-only',
      source:
        'app/(app)/beheer/testdata/page.tsx; API /api/onboarding/reset — reset + navigatie, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-BEHEER-23',
    scenarioId: 'UAT-BEHEER-23',
    titel: 'Landing-page-testgebruikers beheren',
    kriticiteit: 'KERN',
    given: '/beheer/testdata, blok "Landing page testaccounts" (vier vaste testaccounts).',
    when:
      'De beheerder maakt de testgebruikers in bulk aan, reset er één (wist data + zet onboarding terug) of zet een nieuw wachtwoord (minimaal 6 tekens).',
    then:
      'De testaccounts tonen de juiste status (Klaar voor onboarding / Onboarding afgerond / Actief); een gereset account kan de volledige flow opnieuw doorlopen; een wachtwoord < 6 tekens blokkeert opslaan. Geen eigen berekening.',
    assertion: {
      kind: 'ui-only',
      source:
        'app/(app)/beheer/testdata/page.tsx (TestUserManager); API /api/admin/test-users(/create) — accountbeheer, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-BEHEER-24',
    scenarioId: 'UAT-BEHEER-24',
    titel: 'Check-in-snapshots wissen en mobile preview gebruiken',
    kriticiteit: 'KERN',
    given: '/beheer/testdata, blokken "Check-in beheer" en "Mobile Preview".',
    when:
      'De beheerder verwijdert een check-in-maand of "Alles wissen" (onomkeerbaar) en zet de mobile-preview aan met een device-preset.',
    then:
      'Gekozen snapshots/maandmarkeringen verdwijnen (raakt /mijn/checkins van het eigen account); de mobile preview toont een telefoon-frame in het gekozen device-formaat; toggle uit herstelt de normale weergave. Geen eigen berekening.',
    assertion: {
      kind: 'ui-only',
      source:
        'app/(app)/beheer/testdata/page.tsx (CheckinManager) + components/app/beheer/mobile-preview-provider.tsx (DEVICE_PRESETS); API /api/admin/checkins — opruimen/preview, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-BEHEER-25',
    scenarioId: 'UAT-BEHEER-25',
    titel: 'Regressietest-suite draaien',
    kriticiteit: 'BELANGRIJK',
    given:
      '/beheer/regressietest (de in-app regressiesuite; draait server-side op regression-test@fintwo.nl, alleen in development).',
    when: 'De beheerder draait de hele suite / een module / een categorie en exporteert het rapport (of Reset).',
    then:
      'Een rapport met per test geslaagd/gefaald/fout/overgeslagen + samenvattingskaarten (Totaal/Geslaagd/Gefaald/Fouten/Duur); een losse categorie merge’t in het bestaande rapport; het rapport blijft in localStorage tot Reset. Pass/fail-aggregatie (meta) — de financiële toetsing zit ín de suites zelf (inclusief deze uat.beheer-suite). Geen eigen berekening op de pagina.',
    assertion: {
      kind: 'ui-only',
      source:
        'app/(app)/beheer/regressietest/page.tsx + lib/regression-tests/test-session.ts; API /api/regression/categories + /run — meta-runner (pass/fail-tellingen), geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-BEHEER-26',
    scenarioId: 'UAT-BEHEER-26',
    titel: 'Horizon-strategiematrix draaien (strategie-regressietest)',
    kriticiteit: 'BELANGRIJK',
    given:
      '/beheer/horizon-strategie: de matrix rekent alle strategie-combinaties (huisvesting × eindstrategie × onttrekking) op de vaste fixture van persona "Tessa Compleet".',
    when: 'De matrix draait (automatisch bij openen / via de run-knop) en vergelijkt per combinatie verwacht vs. werkelijk.',
    then:
      'FIRE-leeftijd (fractioneel) en doelbedrag per combinatie komen uit de horizon-kernel en worden tegen de vastgelegde goldens getoetst binnen FIRE_AGE_MARGIN_YEARS / DOELBEDRAG_REL_MARGIN — een zware-rekenmotor-uitkomst die NIET met de hand na te rekenen is; verifieerbaar via deze oracle-UI zelf (matrix groen), niet in een pure vitest.',
    assertion: {
      kind: 'oracle',
      source:
        'app/(app)/beheer/horizon-strategie/horizon-strategie-client.tsx + lib/regression-tests/horizon-strategie/matrix.ts#runHorizonStrategyMatrix (horizon-kernel) — oracle, verifieerbaar via /beheer/horizon-strategie',
    },
  },
  {
    workflow: 'WF-BEHEER-27',
    scenarioId: 'UAT-BEHEER-27',
    titel: 'Horizon-kernel transparantie doorlopen en verifiëren',
    kriticiteit: 'KERN',
    given:
      '/beheer/horizon-kernel (transparantie) op de eigen accountdata; tab "Verificatie" toetst tegen de Excel-oracle-fixtures.',
    when:
      'De beheerder doorloopt de vijf tabs (uitgangspunten → geselecteerde invoer → stappen & tabellen → technisch rapport → verificatie) en draait de verificatie.',
    then:
      'De solver-uitkomsten (FIRE-leeftijd, doelbedrag, modelwaarde op eindleeftijd, gap, netto-liquide bij FIRE, tekort-lening-piek) komen uit de horizon-kernel-solver (solveFire) en zijn NIET met de hand na te rekenen; de verificatie-tab toetst de kernel byte-/cel-exact tegen de Excel-oracle-fixtures — een oracle, verifieerbaar via deze UI ("Stappen & tabellen" / "Verificatie").',
    assertion: {
      kind: 'oracle',
      source:
        'app/(app)/beheer/horizon-kernel/horizon-kernel-client.tsx + lib/horizon-kernel/ (solveFire, bridge.ts); API /api/horizon-kernel(/verificatie) — oracle, verifieerbaar via /beheer/horizon-kernel',
    },
  },
  {
    workflow: 'WF-BEHEER-28',
    scenarioId: 'UAT-BEHEER-28',
    titel: 'AI-extractie van vrije tekst testen',
    kriticiteit: 'OVERIG',
    given: '/beheer/extractie-test (AI-extractie van vrije tekst; er wordt niets opgeslagen).',
    when: 'De beheerder typt vrije tekst (+ optionele profielcontext) en draait de extractie.',
    then:
      'Het resultaat toont bezittingen/schulden/levensgebeurtenissen + inkomens-/uitgavenschatting (ruwe JSON uitklapbaar); de AI-output is niet-deterministisch en de database blijft onaangeroerd. Geen toetsbaar cijfer.',
    assertion: {
      kind: 'ui-only',
      source:
        'app/(app)/beheer/extractie-test/page.tsx; API /api/admin/extraction-test — niet-deterministische AI-output, geen cijfermatige toets',
    },
  },
  {
    workflow: 'WF-BEHEER-29',
    scenarioId: 'UAT-BEHEER-29',
    titel: 'Widget-galerij bekijken',
    kriticiteit: 'OVERIG',
    given: '/beheer/widget-galerij (alle widgets op de eigen data, gating omzeild; click-to-load i.v.m. egress).',
    when: 'De beheerder klikt "Widgets laden en weergeven" (?load=1).',
    then:
      'De volledige DashboardData-bundel laadt en alle widgets renderen in elke toegestane grootte; zonder ?load=1 blijft de zware loader uit. Consumeert de bestaande bundel; berekent zelf niets.',
    assertion: {
      kind: 'ui-only',
      source:
        'app/(app)/beheer/widget-galerij/page.tsx + widget-galerij-client.tsx + lib/dashboard-data-loader.ts + lib/widget-catalog.ts — weergave op de bestaande bundel, geen eigen berekening',
    },
  },
  {
    workflow: 'WF-BEHEER-30',
    scenarioId: 'UAT-BEHEER-30',
    titel: 'Architectuurdocumentatie raadplegen',
    kriticiteit: 'OVERIG',
    given: '/beheer/architectuur (vier views: Praatplaat / Plaat / Database / Berekeningen; view in ?view=).',
    when: 'De beheerder wisselt van view en verkent de inhoud (lenzen, relaties, stromen, aandachtspunten, ADR’s, ERD, rekenmotoren).',
    then:
      'De feiten (tellingen, versie, diff) komen automatisch uit docs/architecture/architecture.json (npm run arch:diagram) — nooit handmatig; de plaat-tellingen moeten dus exact overeenkomen met architecture.json (A=B), de topologie is gecureerd. Een ongeldige ?view= valt terug op "plaat".',
    assertion: {
      kind: 'consistency',
      source:
        'app/(app)/beheer/architectuur/… + lib/architecture/* + docs/architecture/architecture.json — plaat-tellingen = architecture.json (A=B), consistentietoets',
    },
  },
  {
    workflow: 'WF-BEHEER-31',
    scenarioId: 'UAT-BEHEER-31',
    titel: 'Logboeken controleren: audit-trail, foutmeldingen, e-mail, achtergrondtaken',
    kriticiteit: 'OVERIG',
    given: '/beheer/audit, /beheer/errors, /beheer/email en /beheer/jobs (alleen-lezen logboeken).',
    when:
      'De beheerder doorloopt de audit-trail, de client-fouten, de e-mailpogingen en de cron-uitvoeringen; controleert of een gebruikersbeheer-actie (WF-BEHEER-07/08) in de audit-trail verschijnt.',
    then:
      'Elke log toont de juiste rijen (wie/wat/detail/wanneer, status, duur); lege logboeken zijn mogelijk; de audit-trail is de verificatiebron voor de KERN-gebruikersbeheer-flows. Alleen-lezen weergave, geen eigen berekening.',
    assertion: {
      kind: 'ui-only',
      source:
        'app/(app)/beheer/audit/page.tsx + app/(app)/beheer/errors/page.tsx + app/(app)/beheer/email/page.tsx + app/(app)/beheer/jobs/page.tsx (JOB_CATALOG, incl. cron "Meldingen → Notion-sync") — alleen-lezen logboeken, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-BEHEER-32',
    scenarioId: 'UAT-BEHEER-32',
    titel: 'Integraties: inventaris, liveness-probe en contractbewaking',
    kriticiteit: 'BELANGRIJK',
    given: '/beheer/integraties (tabs inventaris / liveness / contracten via ?view=).',
    when:
      'De beheerder bekijkt de inventaris-tellingen (totaal + met fout per exchange/broker/wallet/bank), draait een on-demand liveness-probe en bekijkt de contract-drift.',
    then:
      'De tellingen komen via service-role COUNT (head-only) rechtstreeks uit de bron-tabellen en moeten daarmee overeenkomen (A=B); een onbeschikbare service-client toont tellingen null/onbekend; probe/contracten tonen de status per dienst. Een consistentietoets op de tellingen, geen los na te rekenen cijfer.',
    assertion: {
      kind: 'consistency',
      source:
        'app/(app)/beheer/integraties/… + lib/architecture/integrations-model.ts — tellingen = service-role COUNT op de bron-tabellen (A=B), consistentietoets',
    },
  },
  {
    workflow: 'WF-BEHEER-33',
    scenarioId: 'UAT-BEHEER-33',
    titel: 'Statische naslag bekijken',
    kriticiteit: 'OVERIG',
    given:
      '/beheer/{releases, widget-audit, blueprints, grafiek-werking} (alleen-lezen naslag). Roadmap en Development zijn per besluit 02 verwijderd: de roadmap-inhoud staat in Notion, de teamopstelling op de org-site.',
    when:
      'De beheerder opent de naslagpagina’s (releases uitklappen; een blueprint-archetype → /beheer/blueprints/[type]).',
    then:
      'Elke pagina toont zijn gecureerde/gescande naslag; een onbekend blueprint-type geeft 404; de terug-link op blueprints wijst (bekend restje) naar /beheer/ai i.p.v. /beheer. Geen data gewijzigd, geen eigen berekening.',
    assertion: {
      kind: 'ui-only',
      source:
        'app/(app)/beheer/{releases,widget-audit,blueprints,grafiek-werking}/… — statische/gescande naslag, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-BEHEER-34',
    scenarioId: 'UAT-BEHEER-34',
    titel: 'Webprestaties (Core Web Vitals p75) raadplegen',
    kriticiteit: 'OVERIG',
    given:
      '/beheer/webprestaties (alleen-lezen RUM-observability). Server-component leest via de service-role drie RPC\'s (`web_vitals_p75_summary`, `web_vitals_p75_daily`, `web_vitals_p75_by_route`) op de `web_vitals`-tabel; elke RPC-fout (tabel/migratie ontbreekt nog) wordt afgevangen en gelogd i.p.v. de pagina te laten crashen. De RPC\'s dragen een `p_environment`-filter dat de pagina default op `production` zet, zodat lokale ontwikkelmetingen de productie-p75 niet vervuilen; metingen van vóór de knip-datum 2026-08-02 hebben `environment = null` en vallen daarmee buiten elke omgevingskeuze.',
    when:
      'De beheerder opent de pagina, wisselt de periode (7/28/90 dagen via ?dagen=), de omgeving (Productie/Preview/Lokaal/Alles via ?omgeving=) en de metric-selector (LCP/INP/CLS/FCP/TTFB via ?metric=); een niet-superadmin probeert dezelfde URL rechtstreeks.',
    then:
      'De niet-superadmin wordt zonder foutmelding naar /overzicht gestuurd (dezelfde layout-guard als de rest van /beheer). Bij drie RPC-fouten of nul rijen toont de pagina een rustige empty-state (onderscheiden "bron nog niet beschikbaar" vs. "nog geen metingen"), geen rauwe fout; de omgeving-switcher blijft daarbij zichtbaar zodat een lege productieselectie geen doodlopend scherm is. Met data tonen de vijf KPI-cards de p75 per metric met een stoplicht-rating die exact volgt uit `ratingForValue()` (de officiële CWV-drempels); periode/omgeving/metric-switcher filteren tijdreeks + route-ranglijst consistent, waarbij "Alles" het omgevingsfilter uitschakelt (`p_environment => null`) en óók de ongelabelde historie meetelt; de ranglijst toont alleen routes met ≥5 metingen, slechtste eerst, en toont nergens een user_id of per-gebruiker-rij — enkel het geaggregeerde p75 per route.',
    assertion: {
      kind: 'consistency',
      source:
        'app/(app)/beheer/webprestaties/page.tsx (superadmin-redirect, service-role RPC-aggregatie, empty-state) + lib/web-vitals/config.ts#ratingForValue (stoplicht-drempels) — getoonde p75/rating komt aantoonbaar uit de web_vitals-aggregatie-RPC + de officiële drempelfunctie, geen losse berekening',
    },
  },
  {
    workflow: 'WF-BEHEER-36',
    scenarioId: 'UAT-BEHEER-36',
    titel: 'Versie & git-dashboard raadplegen',
    kriticiteit: 'OVERIG',
    given:
      '/beheer/versie (alleen-lezen git-/deploy-/migratiedashboard). Client haalt de staat op bij GET /api/admin/version-status (superadmin-gated) en vergelijkt met GET {PROD_URL}/api/version voor de prod-SHA.',
    when:
      'De beheerder opent de pagina, bekijkt git-staat/werkbomen/commits, de deploy-vergelijking met prod en de Supabase-migratiestatus, en klikt Ververs; een niet-superadmin (of uitgelogde gebruiker) benadert dezelfde API rechtstreeks; de pagina draait op een host zonder git (Vercel/prod).',
    then:
      'De niet-superadmin krijgt een 403 van de API (client toont "Geen toegang (superadmin vereist)"), geen data. Zonder git-werkboom toont de pagina git.available=false met de reden, en blijven alleen de deploy-/migratiepanelen zichtbaar. De migratie-badge ("in sync" / "N nog niet toegepast" / "lineage-divergentie") volgt deterministisch uit `computeMigrationDrift(files, applied)`: alleen bestandsversies STRIKT nieuwer dan de laatst toegepaste (`pendingNewer`) escaleren naar rood, oudere niet-toegepaste bestanden (`driftOlder`) en toegepaste-zonder-bestand (`unknownApplied`) blijven neutrale, ingeklapte ruis. De kop-banner-toon (ok/warn/alert) volgt `computeGitVerdict()` op dezelfde ongecommit-/ahead-telling die het git-staat-paneel toont (A=B), en escaleert naar `alert` zodra `pendingNewer.length > 0`. De prod-SHA-vergelijking (gelijk/localhost-is-nieuwer/wijkt-af) volgt uit het lokale commit-log versus de opgehaalde prod-SHA. Alleen-lezen: geen enkele knop muteert git, database of migraties.',
    assertion: {
      kind: 'consistency',
      source:
        'app/api/admin/version-status/route.ts (superadmin-gate, git-plumbing via execFileSync, RPC applied_migration_versions) + lib/version-status/migrations.ts#computeMigrationDrift (pendingNewer/driftOlder/unknownApplied) + app/(app)/beheer/versie/versie-client.tsx#computeGitVerdict — getoonde badges/verdict volgen aantoonbaar uit de git-/migratiestaat (A=B), consistentietoets',
    },
  },
  {
    workflow: 'WF-BEHEER-37',
    scenarioId: 'UAT-BEHEER-37',
    titel: 'Kennisbank-items beheren + lokale prompt-parity-status raadplegen',
    kriticiteit: 'OVERIG',
    given:
      '/beheer/kennisbank: bovenaan een alleen-lezen "Prompt-parity"-blok (server-component, gevoed door de gegenereerde snapshot `docs/ai-parity/parity.json` — ververst via `npm run parity:scan`), daaronder de bestaande kennisbank-item-CRUD (`KennisbankClient`: toevoegen/bewerken/categoriseren/verwijderen/opslaan via PUT).',
    when:
      'De beheerder opent de pagina vóór ooit een parity-scan te hebben gedraaid, en (apart) ná een scan met een gewijzigde bron-DNA-bestand zonder herbouw van de lokale DNA; en beheert daarnaast kennisbank-items (item toevoegen, categorie wijzigen, verwijderen, opslaan).',
    then:
      'Nooit gescand (`parity.neverGenerated`): neutrale lege-staat-tekst met de `npm run parity:scan`-instructie, geen verzonnen cijfers. Wel gescand: badge "In sync" (groen, `--positive`) of "Drift" (rood, `--negative`) volgt exact `parity.inSync`; bij drift toont het blok een concrete vervolgstap (skill `lokale-prompt-parity` + `npm run parity:scan`) en per bron een stoplicht "ongewijzigd"/"gewijzigd". De tokenbalk-vulling = `round(dnaEstimatedTokens / dnaSubBudget × 100)`, gecapt op 100% (deling-door-0-guard bij `dnaSubBudget<=0`). Regressie: de bestaande kennisbank-CRUD (item toevoegen/bewerken/categoriseren/verwijderen, PUT-opslaan) werkt ongewijzigd na de server/client-pagina-split — dit is nu een read-only server-blok vóór het bestaande client-component, geen wijziging aan de CRUD zelf.',
    assertion: {
      kind: 'consistency',
      source:
        'app/(app)/beheer/kennisbank/page.tsx#PromptParityBlock (badge=parity.inSync, lege-staat=parity.neverGenerated, tokenPct-formule) + lib/ai/local/parity-facts.ts#selectParityFacts + docs/ai-parity/parity.json + app/(app)/beheer/kennisbank/kennisbank-client.tsx (item-CRUD, PUT-opslaan) — badge/tokenbalk volgen aantoonbaar uit parity.json (A=B), consistentietoets; CRUD-regressie is ui-only binnen hetzelfde criterium',
    },
  },
]

export const BEHEER_ACCEPTANCE: AcceptanceSet = {
  zone: 'BEHEER',
  criteria,
}
