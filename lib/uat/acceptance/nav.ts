/**
 * Acceptatiecriteria — domein Navigatie & shell (WF-NAV-01..27 / UAT-NAV-01..12,14..27).
 *
 * Spiegelt exact de aanpak van `budget.ts`/`start.ts`/`will.ts`/`cash.ts`/`ovz.ts`.
 * Bron: `docs/uat/uat-plan.md` Deel 1 (workflow-definities WF-NAV-01..26) +
 * Deel 2 §2.8 (UAT-NAV-01..12,14..26). WF-NAV-27 (euro-weergave-toggle) is
 * NIEUW t.o.v. het UAT-plan — toegevoegd voor de wave-2/3-euro-weergave-uitrol
 * (Notion-kaart 39cf9e8d-568a-80fb-8a99-e090c080b964, brok H), spiegelt géén
 * document-workflow.
 *
 * WF-NAV-13 (uitloggen) heeft BEWUST GEEN eigen criterium hier — het UAT-plan
 * wijst door naar UAT-START-15 ("géén eigen scenario"); de catalogus bevat dan
 * ook geen UAT-NAV-13. NAV is dus, net als SCHULD/TOEK/WILL/OVZ, NIET
 * aaneengesloten op WF-nummer, maar WEL 1-op-1 met de 26 catalogus-scenario's
 * (01..12, 14..27).
 *
 * KERN-BEVINDING (bepaalt exact/consistency/ui-only): NAV is cross-cutting
 * app-brede bediening zonder eigen pagina's — het meeste is UI/interactie
 * zonder berekening ("Rekenend: nee" staat letterlijk bij 16 van de 25
 * plan-workflows). Tien criteria zijn wél 'exact' op échte, client-veilige
 * routing-/config-functies (`deriveTabFromPath`, `resolveRouteTitle`,
 * `next.config.ts#redirects`, `SIMPLE_HIDDEN_NAV_HREFS`, `buildActionItems`,
 * `STACK_DEPTH_LIMIT`, `euroViewLabel`) — allemaal de daadwerkelijke
 * productiefuncties, op één na: `resolveTabRedirect` leeft in een Server
 * Component met server-only imports en wordt daarom gemirrord (zie
 * nav-checks.ts). Één criterium (status-dots) is 'consistency' (A=B tussen
 * dot en landingskaart, geen eigen formule).
 *
 * WF-NAV-27 (euro-weergave-toggle, wave 2/3): het label-flip-gedrag en
 * `euroViewLabel` zijn 'exact' na te rekenen; de cross-device-persistentie
 * zelf (server-side `profiles.euro_view`, `PUT /api/euro-view`) is een
 * LIVE-vereiste en staat daarom als toelichting in `then`, niet in de
 * geautomatiseerde assertie.
 *
 * AL-GEDOCUMENTEERDE BEVINDINGEN (uit het UAT-plan zelf, GEEN nieuwe bugs van
 * deze sessie — expliciet vermeld in de betreffende criteria hieronder):
 *  - UAT-NAV-06/c: OPGELOST — de mobiele kompas-deeplinks wijzen nu naar de
 *    canonieke /overzicht/*-routes (was: /core/assets, /core/debts,
 *    /will#cashflow met ankerverlies); regressie geborgd in
 *    components/app/shell/lever-compass.deeplinks.test.tsx.
 *  - UAT-NAV-06/d: OPGELOST — het uitgeklapte kompas-paneel hing rechts
 *    uitgelijnd (`right-0`) terwijl de trigger niet aan de rechterrand van de
 *    TopBar staat, waardoor het paneel op smalle mobiele schermen links
 *    voorbij de viewport-rand afsneed; nu gecentreerd onder de trigger met een
 *    viewport-clamp. Regressie: lever-compass.simple-view.test.tsx.
 *  - UAT-NAV-24: `MobileBottomBar`/`MobileAppStrip` zijn dode code (renderen
 *    altijd niets), ondanks dat pagina's er nog naar verwijzen.
 *  - UAT-NAV-26: de ingelogde 404-pagina toont twee IDENTIEKE knoppen "Naar
 *    Overzicht" i.p.v. een tweede knop naar de publieke startpagina.
 */

import type { AcceptanceCriterion, AcceptanceSet } from './types'

const criteria: AcceptanceCriterion[] = [
  {
    workflow: 'WF-NAV-01',
    scenarioId: 'UAT-NAV-01',
    titel: 'Navigeren via de desktop-sidebar (modules, subroutes, derde niveau)',
    kriticiteit: 'BELANGRIJK',
    given: 'Paden op verschillende niveaus, inclusief legacy-routes: /overzicht/bezittingen, /core/assets, /toekomst/doelen, /mijn/profiel, /will.',
    when: '`deriveTabFromPath` bepaalt de actieve module-tab per pad.',
    then: 'Zowel /overzicht/bezittingen als het legacy-pad /core/assets resolven naar tab "kern" (startsWith-matching op oude paden); /toekomst/doelen → "horizon"; /mijn/profiel → "identity"; /will → "wil".',
    assertion: {
      kind: 'exact',
      expected: 'overzichtTab=kern; coreLegacyTab=kern; toekomstTab=horizon; mijnTab=identity; finTab=wil',
      source: 'components/app/shell/nav-stack-provider.tsx#deriveTabFromPath — échte productiefunctie, geen mirror',
    },
  },
  {
    workflow: 'WF-NAV-02',
    scenarioId: 'UAT-NAV-02',
    titel: 'Sidebar in- en uitklappen (collapsed-stand)',
    kriticiteit: 'OVERIG',
    given: 'Sidebar-collapsed-voorkeur in localStorage (`fintwo:sidebar-collapsed`).',
    when: 'De gebruiker klapt de sidebar in/uit en herlaadt.',
    then: 'De gekozen stand (64px iconen-only vs. 264px met labels) blijft bewaard na herladen, geen flits van de andere stand.',
    assertion: {
      kind: 'ui-only',
      source: 'lib/hooks/use-sidebar-collapsed.ts — localStorage-state, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-NAV-03',
    scenarioId: 'UAT-NAV-03',
    titel: 'Status-dots in de navigatie lezen (freshness + status-mirror)',
    kriticiteit: 'BELANGRIJK',
    given: 'Cashflow-kind-dots (Budget/Transacties/Vaste lasten/Forecast) en belasting-kind-dots (Box 1/2/3) in de sidebar.',
    when: 'De dot-kleur op een cashflow-/belasting-subroute wordt vergeleken met de status op de bijbehorende landingskaart.',
    then: 'De dot-kleur moet EXACT gelijk zijn aan de status van de bijbehorende cashflow-/belasting-landingskaart — een A=B-consistentietoets (gedeelde bron `buildCashflowCards`/`loadLeverScores`, geen eigen formule); drift tussen dot en kaart is een defect.',
    assertion: {
      kind: 'consistency',
      source: 'lib/cashflow-cards.ts (status-functies) + lib/leverage-status.ts, gedeeld tussen components/app/shell/sidebar.tsx en de landingskaarten — geen los na te rekenen cijfer',
    },
  },
  {
    workflow: 'WF-NAV-04',
    scenarioId: 'UAT-NAV-04',
    titel: 'Mobiel navigeren via de zwevende nav-pill + NavMenuSheet',
    kriticiteit: 'BELANGRIJK',
    given: 'Mobiel viewport (<1024px), NavMenuSheet (z-50, bewust ónder de FloatingNavButton z-[60]). Sinds deze release woont Fins idle-bubbel als DERDE segment ín dezelfde donkere capsule (raster-icoon | scheidingslijn | Fin-slot) — gedeeld via `FinSlotProvider`/`useFinSlot` (lib/shell/fin-slot.tsx): de pill rendert een leeg slot-element, `FinHome` portalt zijn bubbel erin. Boven lg valt dit terug op de losse, zwevende Fin-instantie (het slot bestaat niet meer, de pill zelf ook niet).',
    when: 'De gebruiker tikt het raster-icoon, navigeert of sluit zonder keuze; en tikt afzonderlijk het Fin-segment in de pill.',
    then: 'De pill blijft altijd zichtbaar bóven de sheet (sluit-functie); "Vraag Fin" onder "Overal beschikbaar" in de NavMenuSheet is een bevestigde no-op (het Fin-segment ín de pill is de werkende mobiele ingang). Het Fin-segment opent hetzelfde chatpaneel als de vroegere zwevende bubbel (zie WF-NAV-20) en erft de verberg-logica van de pill (overlay/immersieve route verbergt de hele capsule incl. Fin-segment); de scheidingslijn verbergt zichzelf zolang het slot leeg is (chat open).',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/shell/floating-nav-button.tsx + nav-menu-sheet.tsx + lib/shell/fin-slot.tsx + components/app/fin/fin-home.tsx (renderBubble(\'slot\')-portal) — interactie/laag-conventie, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-NAV-05',
    scenarioId: 'UAT-NAV-05',
    titel: 'Mobiele TopBar: titel en terug-gedrag',
    kriticiteit: 'BELANGRIJK',
    given: 'Pad /mijn/feedback, dat zelf géén <NavStackMeta> registreert en dus echt op de nav-config-titelkaart terugvalt; pad /mijn/checkins, dat via de re-export van de check-in-historie wél een eigen titel registreert; tab-root-paden /overzicht, /toekomst, /mijn.',
    when: '`resolveRouteTitle` en `isTabRoot` bepalen de TopBar-titel resp. of een ←-knop nodig is.',
    then: 'Fallback-titel voor /mijn/feedback = "Melden" (uit de nav-config-titelkaart). /mijn/checkins heeft daar bewust GEEN entry: de pagina zet zelf "Check-in historie" en een expliciete paginatitel wint — een fallback zou dode configuratie zijn die een titel belooft die niemand ziet. /overzicht is tab-root voor "kern" (geen ←); /toekomst en /mijn zijn eigen tab-roots maar tonen toch "Terug naar overzicht" (zie variant).',
    assertion: {
      kind: 'exact',
      expected: 'titelFeedback=Melden; titelCheckinsFallback=null; overzichtIsTabRoot=true; toekomstIsTabRootVoorHorizon=true',
      source: 'lib/nav-config.ts#resolveRouteTitle + components/app/shell/nav-stack-provider.tsx#isTabRoot — échte productiefuncties, geen mirror',
    },
  },
  {
    workflow: 'WF-NAV-06',
    scenarioId: 'UAT-NAV-06',
    titel: 'Mobiele utility-cluster: kompas, privacy, nieuws, meldingen, account',
    kriticiteit: 'BELANGRIJK',
    given: 'Mobiele TopBar-utility-cluster op een tab-root; kompas-deeplinks in `lever-compass.tsx`. Sinds fase 4 van de eenvoudige weergave hangt de TRIGGER aan de weergavemodus (NAV-6): in Volledig de vier gekleurde stippen naast elkaar, in Eenvoudig één samengevat statuspunt met de zwaarste status van de vier (rood > oranje > groen > geen data).',
    when: 'De gebruiker tikt de kompas-trigger aan en gaat door het paneel naar "Bezittingen"/"Schulden"/"Cashflow".',
    then: 'De kompas-deeplinks wijzen naar de canonieke /overzicht/*-routes: Bezittingen → /overzicht/bezittingen, Schulden → /overzicht/schulden, Cashflow → /overzicht/cashflow (geen legacy /core/* of /will#cashflow-ankerverlies meer). Het PANEEL is in beide modi identiek: alle vier de hefbomen mét naam, status en detail — de reductie zit uitsluitend in de trigger, dus er gaat geen informatie verloren. In Eenvoudig draagt het ene punt de status ook in zijn aria-label ("Kompas: aandacht — open het kompas"); "geen data" overstemt nooit een echte waarschuwing. OPGELOST (deze release): het uitgeklapte paneel hangt nu gecentreerd onder de trigger (`left-1/2 -translate-x-1/2`, met `max-w-[calc(100vw-2rem)]` als viewport-clamp) i.p.v. rechts uitgelijnd (`right-0`) — de trigger staat als tweede icoon in de TopBar-rij, niet aan de rechterrand, dus een `right-0`-geankerd 256px-paneel liep op smalle schermen (390px) voorbij de linkerrand af. Geborgd in lever-compass.deeplinks.test.tsx + lever-compass.simple-view.test.tsx.',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/shell/lever-compass.tsx (LEVERS-config + worstLeverStatus + gecentreerde paneel-positionering) — canonieke routes; regressietests lever-compass.deeplinks.test.tsx en lever-compass.simple-view.test.tsx',
    },
  },
  {
    workflow: 'WF-NAV-07',
    scenarioId: 'UAT-NAV-07',
    titel: 'Zoeken en springen met het command-palette (⌘K): pagina\'s',
    kriticiteit: 'BELANGRIJK',
    given: 'Alle app-pagina\'s (`getAllPageItems`) + beheer-pagina\'s (`getAdminPageItems`), actieve modules van een niet-superadmin gebruiker.',
    when: '`filterPagesByModules` filtert de paginalijst op actieve modules.',
    then: 'Een pagina met `requiredModule` die niet actief is, wordt uit de resultaten gefilterd; een pagina zonder `requiredModule` blijft altijd zichtbaar.',
    assertion: {
      kind: 'exact',
      expected: 'metModuleActiefZichtbaar=true; metModuleInactiefGefilterd=true; zonderModuleAltijdZichtbaar=true',
      source: 'lib/command-palette/navigation-index.ts#filterPagesByModules — échte productiefunctie, geen mirror',
    },
  },
  {
    workflow: 'WF-NAV-08',
    scenarioId: 'UAT-NAV-08',
    titel: 'Command-palette: eigen gegevens zoeken ("Mijn data")',
    kriticiteit: 'KERN',
    given: 'Server-zoekroute `/api/command-palette/search` (assets/debts/budgets/goals/life_events/holdings), debounce ~200ms, drempel 2 tekens.',
    when: 'De gebruiker typt 1 resp. 2+ tekens.',
    then: '1 teken → geen server-zoekactie; 2+ tekens → "Mijn data laden…" en daarna resultaten. Dit is een server-zoekroute (Supabase-afhankelijk), niet pure-testbaar zonder DB — procestoets.',
    assertion: {
      kind: 'ui-only',
      source: 'app/api/command-palette/search/route.ts — server-zoekroute, geen pure functie zonder Supabase',
    },
  },
  {
    workflow: 'WF-NAV-09',
    scenarioId: 'UAT-NAV-09',
    titel: 'Command-palette: acties uitvoeren',
    kriticiteit: 'BELANGRIJK',
    given: 'ActionRunContext met 3 beschikbare perspectieven (personal/household/partner), huidig perspectief "personal"; privacyMasked=false; module "vermogensregistratie" actief resp. inactief.',
    when: '`buildActionItems` bouwt de actie-lijst.',
    then: 'Perspectief-sectie bevat 3 items; het item voor "personal" heeft " · actief" in de sublabel, de andere twee niet. "Bedragen verbergen" (niet "tonen") staat in de lijst zolang privacyMasked=false. "Synchroniseer prijzen" is aanwezig met de module actief, afwezig zonder.',
    assertion: {
      kind: 'exact',
      expected: 'perspectiefItems=3; actiefLabel=Persoonlijk · actief; privacyLabel=Bedragen verbergen; syncPricesMetModule=true; syncPricesZonderModule=false',
      source: 'lib/command-palette/actions.ts#buildActionItems — échte productiefunctie, geen mirror',
    },
  },
  {
    workflow: 'WF-NAV-10',
    scenarioId: 'UAT-NAV-10',
    titel: 'Weergavemodus Eenvoudig ↔ Volledig en doorwerking op navigatie en pagina\'s',
    kriticiteit: 'BELANGRIJK',
    given: '`SIMPLE_HIDDEN_NAV_HREFS` = [\'/toekomst/rekenhulp\', \'/toekomst/whatif\']. De modus is sinds fase 1 van de eenvoudige weergave op TWEE plekken te zetten: het keuzeblok bovenaan /mijn/uiterlijk (`DisplayModePicker`, APP-1) en de ⌘K-actie "action:toggle-display-mode" — beide schrijven via hetzelfde `PUT /api/display-mode`.',
    when: 'De sidebar/nav-sheet/⌘K filteren hun menu-items op deze lijst in Eenvoudige weergave.',
    then: '/toekomst/rekenhulp en /toekomst/whatif zitten in de verberg-lijst (worden overal uit de menu-ingangen gefilterd); een niet-gelijste route (bv. /toekomst/doelen) blijft zichtbaar. Direct navigeren naar de URL blijft mogelijk (alleen de menu-ingang is gefilterd). De ⌘K-omschrijving luidt "Meer/minder detail op elke pagina" — niet meer "Diepte-secties standaard tonen of inklappen" (dat gedrag bestaat niet; APP-3). Sinds fase 4 reduceert Eenvoudig de navigatie zelf ook: de nav-sheet klapt alleen de sub-items van de ACTIEVE hoofdpagina uit (NAV-2 — de rest blijft één regel; de desktop-sidebar deed dit structureel al), en naast "Het Overzicht" in de sidebar verdwijnt de netto-vermogen-badge (NAV-5 — een cijfer zonder context dat op de pagina zelf al staat). In Volledig blijven beide ongewijzigd.',
    assertion: {
      kind: 'exact',
      expected: 'rekenhulpVerborgen=true; whatifVerborgen=true; doelenZichtbaar=true',
      source: 'lib/nav-config.ts#SIMPLE_HIDDEN_NAV_HREFS — échte productieconstante, geen mirror',
    },
  },
  {
    workflow: 'WF-NAV-11',
    scenarioId: 'UAT-NAV-11',
    titel: 'Bedragen maskeren (privacy-toggle) en doorwerking',
    kriticiteit: 'BELANGRIJK',
    given: 'localStorage-sleutel `trifinity.privacy.masked`, apparaat-lokaal (bewust geen account-instelling).',
    when: 'De gebruiker maskeert bedragen op apparaat A en opent de app op apparaat B.',
    then: 'Maskering blijft aan na herladen op hetzelfde apparaat; op een ander apparaat staat hij standaard uit (verwacht gedrag, geen defect). Plus/min-tekens vóór gemaskeerde delta\'s worden mee-verborgen.',
    assertion: {
      kind: 'ui-only',
      source: 'lib/hooks/use-privacy.tsx — apparaat-lokale localStorage-state, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-NAV-12',
    scenarioId: 'UAT-NAV-12',
    titel: 'Sessie verlopen: dialoog en inline opnieuw inloggen',
    kriticiteit: 'KERN',
    given: 'Een 401-respons op een /api-route of een echt verlopen sessie.',
    when: 'De gebruiker logt ter plekke opnieuw in via de "Sessie verlopen"-dialoog.',
    then: 'De dialoog verschijnt bovenop alles (hoogste laag, z-[200]); bewust uitloggen triggert de dialoog NIET; na succesvol herinloggen herlaadt de pagina met verse sessie op dezelfde plek.',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/session-monitor.tsx — sessie-detectie/herstel, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-NAV-14',
    scenarioId: 'UAT-NAV-14',
    titel: 'Browser-terugknop en mobiele navigatie-stack',
    kriticiteit: 'BELANGRIJK',
    given: 'Een navigatie-stack van 6 niveaus diep binnen één tab; `STACK_DEPTH_LIMIT` = 5.',
    when: 'Een 6e niveau wordt toegevoegd aan de stack.',
    then: 'De oudste stack-entry valt eraf (FIFO, `next.slice(next.length - MAX_STACK_DEPTH)`); de stack blijft op maximaal 5 entries — geen crash, geen dubbele entries.',
    assertion: {
      kind: 'exact',
      expected: 'stackDepthLimit=5; naZesdeNiveauLengte=5; oudsteVerwijderd=true',
      source: 'components/app/shell/nav-stack-provider.tsx#STACK_DEPTH_LIMIT (FIFO-trim-mirror op de geëxporteerde constante) — zie nav-checks.ts',
    },
  },
  {
    workflow: 'WF-NAV-15',
    scenarioId: 'UAT-NAV-15',
    titel: 'Oude ?tab=-deeplinks op /toekomst',
    kriticiteit: 'OVERIG',
    given: 'Query-params `{tab: "gebeurtenissen", strategie: "aow"}`, `{strategie: "open"}` (geen tab), `{tab: "onzin"}`.',
    when: '`resolveTabRedirect` bepaalt het redirect-doel.',
    then: 'Met een bekende tab: redirect naar /toekomst/gebeurtenissen?strategie=aow (overige parameters behouden). Zonder tab-param of met een onbekende tab-waarde: geen redirect (null).',
    assertion: {
      kind: 'exact',
      expected: 'metTab=/toekomst/gebeurtenissen?strategie=aow; zonderTab=null; onbekendeTab=null',
      source: 'app/(app)/toekomst/page.tsx#resolveTabRedirect (gemirrord — de server-page importeert next/navigation + @/lib/supabase/server en is dus niet client-bundelbaar; spiegelt hoe redirect-guard.test.ts diezelfde afhankelijkheden wegmockt) — zie nav-checks.ts',
    },
  },
  {
    workflow: 'WF-NAV-16',
    scenarioId: 'UAT-NAV-16',
    titel: 'Legacy-routes en redirect-net',
    kriticiteit: 'OVERIG',
    given: 'De redirect-lijst in `next.config.ts`.',
    when: '`nextConfig.redirects()` wordt aangeroepen.',
    then: '/core → /overzicht, /horizon → /toekomst, /identity → /mijn, /will → /overzicht, /core/budgets → /overzicht/cashflow, /core/cash → /overzicht/cashflow, /horizon/whatif (twee takken: met/zonder ?via=dreamgate), /toekomst/whatif zónder ?via=dreamgate → /toekomst?whatif=open (mét dreamgate valt de regel niet aan en rendert de pagina), /horizon/strategie → /toekomst?strategie=open, /horizon/uitgaven-na-pensioen en /toekomst/uitgaven-na-pensioen → /toekomst?uitgaven=open, /toekomst/strategie (twee takken: met/zonder ?focus=aow|pensioen|huis), /overzicht/acties → /overzicht/tips zitten allemaal in de lijst; een diepere legacy-subroute zonder regel (bv. /core/assets) heeft GEEN redirect-entry (blijft live backing-UI). /dashboard heeft sinds 1 sep 2026 (kiesbaar homescherm) bewust GEEN config-regel meer: de edge-middleware vertaalt hem naar het gekozen homescherm (profiles.home_screen); een statische regel zou die vertaling onbereikbaar maken.',
    assertion: {
      kind: 'exact',
      // 24 = de eerdere 25 (16 + React #310-lichtingen, zie het redirect-blok
      // in next.config.ts) MIN de /dashboard-regel (1 sep 2026, kiesbaar
      // homescherm): /dashboard wordt nu door de edge-middleware naar het
      // gekozen homescherm (profiles.home_screen) vertaald.
      expected: 'aantalRedirects=24; coreNaarOverzicht=true; dashboardGeenConfigRedirect=true; coreAssetsGeenRedirect=true',
      source: 'next.config.ts#redirects — échte productieconfiguratie, geen mirror',
    },
  },
  {
    workflow: 'WF-NAV-17',
    scenarioId: 'UAT-NAV-17',
    titel: 'Globale sync starten en het sync-rapport bekijken (nu incl. bankkoppelingen, uur-/dagrem)',
    kriticiteit: 'KERN',
    given: 'Koppelingen-lijst (exchanges/wallets/bankkoppelingen) via GlobalSyncProvider. Sinds deze release liften actieve bankkoppelingen mee op de globale knop, geremd door een client-side uur-rem per koppeling (`BANK_AUTO_SYNC_INTERVAL_MS`, met `BANK_AUTO_SYNC_HEADROOM=3` verzoeken die alleen de handmatige knop mag opmaken) bovenop de server-harde 10/dag-rem (`BANK_DAILY_REQUEST_LIMIT`, `lib/bank-connection-status.ts`).',
    when: 'De gebruiker start een sync met/zonder koppelingen, of terwijl een sync al loopt; opent het sync-rapport (account-dropdown "Sync-rapport", of een klik op de globale knop bij fouten).',
    then: 'De voortgangsteller "X/Y" telt ALLE bronnen die daadwerkelijk een verzoek doen (exchanges + wallets + bankkoppelingen die meegaan + prijzenverversing) — dit is de enige telling in de app sinds 10 aug 2026 (voorheen sprak de teller de eindmelding tegen). Een bankkoppeling die wordt overgeslagen (recent gesynchroniseerd binnen het uur, dagrem bijna op, of `link-broken`) is GEEN bron en telt niet mee, maar krijgt wél meteen een `outcome:\'skipped\'`-resultaat in `state.perConnection` met reden en (bij `recent`) het tijdstip waarop de koppeling weer vanzelf meegaat. Zonder koppelingen: alleen een prijzen-only-sync. Het sync-rapport (`SyncReportModal`) toont per bron de uitkomst — groen/rood/blauw — met bij bankrekeningen ook de dagteller "N/10 verzoeken vandaag" (`effectiveDailyRequests`) en een "Synchroniseer nu"-knop die ONGEREMD is (de uur-rem geldt alleen voor het automatische meeliften). Sync-status leeft alleen in het React-geheugen van de sessie (GlobalSyncProvider) — een herlaad reset "laatste sync" naar "Nog niet gesynchroniseerd" (verwacht gedrag, geen DB-persistentie van de rondegeschiedenis; de dagrem zelf is wel server-side persistent). Het genoemde tijdstip ("Gaat vanzelf weer mee vanaf 17:37") staat sinds 11 aug 2026 gegarandeerd in Amsterdamse wandkloktijd via `lib/tz.ts#formatAmsterdamTime` — melding en sync-rapport delen die ene notatie; met de rauwe `getHours()` renderde de server (UTC) een ander uur dan de browser, wat naast een hydration-mismatch ook een verkeerd tijdstip aan de gebruiker toonde.',
    assertion: {
      kind: 'ui-only',
      source: 'components/sync/global-sync-provider.tsx + lib/sync/global-sync.ts#planBankSyncs/buildSyncJobs + components/sync/sync-report-modal.tsx + lib/bank-connection-status.ts#BANK_DAILY_REQUEST_LIMIT/effectiveDailyRequests — sessie-lokale React-state + server-harde dagrem, geen cijfermatige uitkomst hier getoetst',
    },
  },
  {
    workflow: 'WF-NAV-18',
    scenarioId: 'UAT-NAV-18',
    titel: 'Meldingen bekijken via het bel-icoon',
    kriticiteit: 'BELANGRIJK',
    given: 'Badge-aantal 0, 5 en 12 ongelezen meldingen.',
    when: 'De bel-badge en de sidebar-teller worden weergegeven.',
    then: 'Bij 0: geen badge. Bij 5: badge toont "5". Bij 12 (>9): badge toont "9+" — identieke cap-conventie als de WILL-bel-badge.',
    assertion: {
      kind: 'exact',
      expected: 'badge0=; badge5=5; badge12=9+',
      source: 'components/app/shell/top-bar.tsx (badge-cap-formule, identiek aan de WILL-mirror in will-checks.ts#capBadge) — zie nav-checks.ts',
    },
  },
  {
    workflow: 'WF-NAV-19',
    scenarioId: 'UAT-NAV-19',
    titel: 'Perspectief wisselen (eigen / huishouden / partner)',
    kriticiteit: 'KERN',
    given: 'Een eenmalig op te bouwen testhuishouden (twee testaccounts, uitnodiging + acceptatie via /beheer/testdata) — LIVE-vereiste, niet in een pure module te reproduceren.',
    when: 'De gebruiker wisselt tussen Persoonlijk/Huishouden/Partner en herlaadt.',
    then: 'Het netto vermogen in sidebar/hero wisselt naar de gekozen grondslag en keert bij "Persoonlijk terug" exact terug naar het oorspronkelijke bedrag; de keuze overleeft een herlaad (server-cookie `tf_perspective`, ~1 jaar geldig). Solo-gebruikers zien de badge/sectie helemaal niet (self-gating). Dit scenario is LEIDEND voor MIJN/BELAST/TOEK/OVZ.',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/perspective-provider.tsx + app/(app)/layout.tsx#getServerPerspective — vereist een echt testhuishouden (2 accounts), niet pure-testbaar in vitest',
    },
  },
  {
    workflow: 'WF-NAV-20',
    scenarioId: 'UAT-NAV-20',
    titel: 'Fin-chat openen (bubbel, ?prompt=-deeplink)',
    kriticiteit: 'BELANGRIJK',
    given: 'Twee ingangen: de Fin-bubbel en een `?prompt=`-deeplink. De ⌘K-actie "Open AI-chat" is bewust verwijderd (29-08-2026, B-011-vervolg): de chat is altijd bij de hand via de nav-pill, het palet hoort géén chat-ingang te tonen.',
    when: 'De gebruiker opent de chat via elk van de twee, en zoekt in ⌘K op "chat".',
    then: 'Beide ingangen openen consistent hetzelfde chatpaneel; ⌘K biedt géén "Open AI-chat"-actie meer; een onbekende `?prompt=`-sleutel doet niets (geen crash); "Vraag Fin" in het mobiele nav-menu blijft een bevestigde no-op (zie WF-NAV-04).',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/chat/chat-prompt-deeplink.tsx + fin-home.tsx — twee ingangen naar hetzelfde paneel, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-NAV-21',
    scenarioId: 'UAT-NAV-21',
    titel: 'BottomSheet-bediening op mobiel (app-brede modal-conventie)',
    kriticiteit: 'BELANGRIJK',
    given: 'De gedeelde `BottomSheet` (z-[70] default) en de NavMenuSheet (bewuste uitzondering, `belowFloatingNav`, z-50). Het sleepgebaar zelf (velocity-drempel, 30%-drempel, rubber-band, scroll-vs-drag-beslissing) is sinds deze release geëxtraheerd naar `lib/hooks/use-swipe-to-dismiss.ts`, zodat óók het niet-gepinde ChatPanel (mobiel) hetzelfde swipe-down-gebaar deelt — géén tweede eigen implementatie. HERZIEN 26-08-2026: de hook geeft nu één samengestelde `handleSheetTouchStart` terug (was: losse `handleTouchStart`/`handleContentTouchStart`/`handleTouchMove`/`handleTouchEnd`) die zelf routeert naar greep-vs-scrollcontent; consumenten geven één `onTouchStart` op het hele paneel door i.p.v. losse handlers op greep én scrollcontainer. De backdrop-dekking komt niet langer uit een `backdropOpacity`-prop maar uit het gedeelde `--scrim`-token, zodat BottomSheet en ChatPanel niet elk hun eigen getal kunnen laten uitzakken. Puur een API-consolidatie — het waarneembare sleepgedrag verandert niet.',
    when: 'De gebruiker sleept/sluit een sheet via greep, backdrop, X of Escape; en sleept het niet-gepinde ChatPanel omlaag via de header (die als greep dient) of vanaf de top van de berichtenlijst.',
    then: 'Elke sheet (en het ChatPanel) gedraagt zich identiek qua sleepgebaar (slide-omhoog/omlaag, dezelfde velocity/percentage-drempels) — BottomSheet-varianten klappen bovendien uit naar ~92vh (`initialMobileHeight`, ChatPanel kent dit niet); alle sluiten via drie routes en dekken de nav-pill af — behalve de NavMenuSheet, die als enige de pill zichtbaar laat (bevestigd als de enige uitzondering). Het ChatPanel-gebaar is uitgeschakeld zolang de chat gepind is (desktop-zijbalk) of een melding wordt verstuurd (`meldingBezig`) — zie WF-WILL-24.',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/bottom-sheet.tsx + lib/hooks/use-swipe-to-dismiss.ts + components/app/chat/chat-panel.tsx (useSwipeToDismiss-gebruik) — gedeelde modal-conventie, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-NAV-22',
    scenarioId: 'UAT-NAV-22',
    titel: 'Toegankelijkheid: skip-link en toetsenbordbediening van de shell',
    kriticiteit: 'OVERIG',
    given: 'Skip-link "Naar hoofdinhoud" als eerste tab-stop, target `#main-content`.',
    when: 'De gebruiker navigeert met Tab/Enter/Esc door de shell.',
    then: 'Focus springt naar het content-gebied; ⌘K sluit op Esc met focus-trap intact; sidebar-knoppen tonen zichtbare focus-ringen.',
    assertion: {
      kind: 'ui-only',
      source: 'app/(app)/layout.tsx (skip-link) + components/command-palette/command-palette.tsx (focus-trap) — a11y-gedrag, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-NAV-23',
    scenarioId: 'UAT-NAV-23',
    titel: 'Platform-banner (onderhoud/aankondiging) zien en sluiten',
    kriticiteit: 'OVERIG',
    given: 'Beheerder zet onderhoud (rood, niet sluitbaar) resp. een aankondiging (sluitbaar, sessionStorage) aan.',
    when: 'De gebruiker sluit de aankondiging en herlaadt binnen dezelfde sessie.',
    then: 'De weggeklikte aankondiging blijft weg; een NIEUWE aankondiging (andere inhoud) verschijnt wél weer; bij beide actief staat onderhoud boven de aankondiging.',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/platform-banner.tsx + lib/platform-status.ts — sessionStorage-state, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-NAV-24',
    scenarioId: 'UAT-NAV-24',
    titel: 'Mobiele bottom-tabs en de apps-strip (long-press)',
    kriticiteit: 'BELANGRIJK',
    given: 'AL-GEDOCUMENTEERDE BEVINDING: `MobileBottomBar` rendert bij `kind: \'tabs\'` altijd `null` en `<MobileAppStrip/>` wordt nergens in de render-boom aangeroepen, ondanks dat pagina\'s als /toekomst dit nog aanvragen via `NavStackMeta`.',
    when: 'De gebruiker opent een tab-root en houdt de plek van de vroegere tab-balk ingedrukt.',
    then: 'Geen onderbalk met tabs verschijnt; long-press geeft geen enkele visuele reactie — navigatie verloopt uitsluitend via de zwevende pill + NavMenuSheet (WF-NAV-04). Dit scenario toetst het WERKELIJKE (afwezige) gedrag, niet de verouderde fase-1-beschrijving.',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/shell/mobile-bottom-bar.tsx (kind:"tabs" → null) — reeds bekende dode code, geen eigen berekening',
    },
  },
  {
    workflow: 'WF-NAV-25',
    scenarioId: 'UAT-NAV-25',
    titel: 'App installeren / offline-gedrag (PWA)',
    kriticiteit: 'OVERIG',
    given: 'Productie-omgeving, PWA-capabele browser, Serwist service worker (`/api/**` NetworkOnly, navigaties NetworkFirst 3s, statics CacheFirst).',
    when: 'De gebruiker installeert de app en gaat offline.',
    then: 'Eerder bezochte pagina\'s tonen na ~3s hun gecachete HTML; API-verkeer wordt NOOIT gecachet (voorkomt verouderde saldi) — een offline API-actie faalt bewust.',
    assertion: {
      kind: 'ui-only',
      source: 'app/sw.ts (Serwist-configuratie) — service-worker-gedrag, niet pure-testbaar in vitest',
    },
  },
  {
    workflow: 'WF-NAV-26',
    scenarioId: 'UAT-NAV-26',
    titel: 'Foutpagina\'s en herstel: 404 + error-boundary',
    kriticiteit: 'BELANGRIJK',
    given: 'AL-GEDOCUMENTEERDE BEVINDING: de ingelogde 404-pagina (`app/(app)/not-found.tsx`) toont momenteel twee IDENTIEKE knoppen "Naar Overzicht" i.p.v. een tweede knop naar de publieke startpagina; de publieke 404 (`app/not-found.tsx`) heeft dit wél correct (twee verschillende knoppen). De render-fout-tak is sinds 3 sep 2026 live triggerbaar via de dataloze superadmin-testtool `/beheer/testtools/force-error` — geen broncodewijziging meer nodig, wat tijdens een live-run ook niet mag.',
    when: 'De gebruiker bezoekt een onbekende URL ingelogd resp. uitgelogd, of forceert (als superadmin) een render-fout via `/beheer/testtools/force-error` → knop "Fout forceren".',
    then: 'Ingelogd: 404 met (bevestigd) twee identieke "Naar Overzicht"-knoppen. Uitgelogd: publieke 404 met "Naar startpagina" én "Naar Overzicht". Render-fout: "Er ging iets mis" + "Probeer opnieuw" + module-terugkeerlink; "Probeer opnieuw" herstelt de pagina naar haar normale staat. LET OP: de trigger vereist een superadmin-account — de test-accounts zijn dat niet, dus dit subscenario is eigenaars-/superadminwerk; een niet-superadmin krijgt op die route bewust een 404.',
    assertion: {
      kind: 'ui-only',
      source: 'app/(app)/not-found.tsx + app/not-found.tsx + app/(app)/error.tsx — reeds bekende bevinding, geen eigen berekening. De error-boundary zelf is geautomatiseerd gedekt door app/(app)/error.test.tsx (knoppen, reset(), module-terugkeer, geen digest-lek) en de trigger door app/(app)/beheer/testtools/force-error/*.test.tsx (throw tijdens render + superadmin-gate); live blijft alleen de Next-bedrading over.',
    },
  },
  {
    workflow: 'WF-NAV-27',
    scenarioId: 'UAT-NAV-27',
    titel: 'App-brede euro-weergave: palet-toggle, label-flip, cross-device persistentie',
    kriticiteit: 'BELANGRIJK',
    given: 'De ⌘K-actie "action:toggle-euro-view" (naast de weergavemodus-actie, WF-NAV-10) en `euroViewLabel` (lib/euro-display.ts, wave 1).',
    when: 'De gebruiker roept de toggle-actie aan bij `euroView=\'nominal\'` resp. `\'real\'`, en opent de app nadien op een tweede apparaat.',
    then: 'Het actie-label flipt: bij nominaal toont de palette "Toon huidige euro\'s" (icoon Wallet), bij reëel "Toon toekomstige euro\'s" (icoon CalendarClock) — nooit de huidige stand als label (dat zou een no-op suggereren). Het command-palette-label en de sidebar-status-indicator (`EuroViewBadge`, ADR 0094) gebruiken hetzelfde `euroViewLabel()` (géén los label-format). Cross-device: de keuze staat op `profiles.euro_view` (own-row, `PUT /api/euro-view`) en wordt server-side in de layout ingelezen — dat schrijf-/leespad is een LIVE-vereiste, niet in een pure module na te rekenen (server-only createClient-import), en wordt daarom als toelichting genoemd, niet in de geautomatiseerde assertie.',
    assertion: {
      kind: 'exact',
      expected: "labelNominal=Toon huidige euro's; labelReal=Toon toekomstige euro's; euroViewLabelNominal=Toekomstige euro's; euroViewLabelReal=Huidige euro's",
      source: 'lib/command-palette/actions.ts#buildActionItems + lib/euro-display.ts#euroViewLabel + app/api/euro-view/route.ts — échte productiefuncties (route alleen genoemd voor het cross-device-schrijfpad, niet geïmporteerd — server-only) — zie nav-checks.ts',
    },
  },
]

export const NAV_ACCEPTANCE: AcceptanceSet = {
  zone: 'NAV',
  criteria,
}
