/**
 * Acceptatiecriteria — domein Krant-product: shell en productgrens
 * (WF-KRANT-01..16 / UAT-KRANT-01..16).
 *
 * Nieuwe zone (29 sep 2026) voor Krant 2B — de productgrens — en Krant 2A
 * fase 2 — de productkeuze `PUT /api/modules` plus de waarde 'nieuws' in
 * `profiles.home_screen` (ADR 0184). Spiegelt de aanpak van `nav.ts` (de
 * andere shell-zone): waar het gedrag in een PURE beslisfunctie woont, is het
 * criterium 'exact' en rekent `krant-checks.ts` het na met de échte functie;
 * waar het pas in de gerenderde shell zichtbaar wordt, is het 'ui-only'.
 *
 * WAT EEN KRANT-ACCOUNT IS: een profiel waarvan `resolveActiveModules(profile)`
 * precies `['nieuws']` is (`isKrantAccount`/`isKrantProfile` in
 * `lib/modules/krant-grens.ts`). Die ene module is de ENE plek die voor elk
 * oppervlak beslist — layout-redirect, client-routewacht, navigatie
 * (`navSurfaceFor`), Fin-mount (`shouldMountFin`), briefingmail
 * (`receivesBriefing`) en de AI-poort (`checkTierGate`). Elk ander account
 * (`null`, alle zes modules, elke andere subset) ziet exact het gedrag van
 * vóór Krant 2B — dat is WF-KRANT-12, de regressietoets.
 *
 * AFBAKENING t.o.v. andere zones: de INHOUD van de Krant (edities, artikelen,
 * bronlink, archief) blijft WILL (WF-WILL-15..19); de volledige navigatie van
 * een Geheel-account blijft NAV; de homescherm-picker zelf blijft MIJN
 * (WF-MIJN-22); login en routebescherming in het algemeen blijven START
 * (WF-START-16). Deze zone toetst alléén wat er voor een Krant-account anders
 * is, plus het bewijs dat het voor alle anderen níét anders is.
 *
 * VOORLOPIGE BESLUITEN (bouwer, 29 sep 2026 — staan ook in de criteria):
 *  - /mijn/notificaties in plaats van het /mijn/meldingen van de kaart (die
 *    route bestaat niet);
 *  - /beheer blijft open voor een superadmin met een Krant-account;
 *  - het nav-label blijft "Krant", niet "Nieuws" (één naam per route, M14).
 *
 * GESLOTEN GAT (Krant 1C fase 2, B40): /nieuws kiest de bron nu op de server
 *  (`bepaalKrantBron`, lib/krant/tijdlijn-bron.ts). Een Krant-account krijgt
 *  nooit meer `GET /api/news` of een AI-upsell: binnen de bèta de tijdlijn
 *  zonder AI, bij een dichte vlag de neutrale `KrantWacht` (WF-KRANT-04).
 * Het tweede gat uit de bouwbrief — /mijn/account toonde de add-on-schakelaars
 * nog, een klik gaf een 403 — is in dezelfde bouwronde gesloten: account-client
 * verbergt Abonnement en AI-tegoed voor een Krant-account (WF-KRANT-10).
 *
 * KRANT 2D FASE 1 (WF-KRANT-13..16, besluit B12) — "de weg omhoog": /krant/meer
 * ligt al op de allowlist (WF-KRANT-04) maar bestond nog niet; deze vier
 * criteria dekken de nieuwe schermen/route nu ze er zijn. FASE 1 = wat je
 * ziet en de omzetting zelf; NIET IN FASE 1 (blijft open, 2C): de Geheel-
 * onboarding na de overstap (`onboarding_completed` terugzetten voor een
 * account zonder de stap 'identity'), voorvullen uit het nieuwsprofiel, en het
 * omzetten van de herkomst. Een downgrade-knop voor de lezer zelf komt er
 * bewust niet — terug naar alleen de Krant loopt uitsluitend via support
 * (WF-KRANT-15), zodat niemand zijn eigen product per ongeluk terugzet.
 *
 * Verdeling: 9 × 'exact' (pure beslisfuncties, zie krant-checks.ts),
 * 2 × 'consistency' (de AI-poort over alle AI-routes; de beheer-productkeuze
 * die dezelfde PRODUCT_PRESETS hergebruikt als WF-KRANT-11), 5 × 'ui-only'
 * (client-routewacht, Fin-loze shell, /krant/meer zelf, de kaart op
 * /mijn/account, de link i.p.v. knop voor een Geheel-account).
 */

import type { AcceptanceCriterion, AcceptanceSet } from './types'

const criteria: AcceptanceCriterion[] = [
  {
    workflow: 'WF-KRANT-01',
    scenarioId: 'UAT-KRANT-01',
    titel: 'Een Krant-account landt na het inloggen op /nieuws',
    kriticiteit: 'KERN',
    given:
      'Een Krant-account: `profiles.active_modules = [\'nieuws\']`. Zijn `home_screen` staat op \'nieuws\' (zo zet `PUT /api/modules` hem, WF-KRANT-11), maar kan door een ouder schrijfpad ook \'overzicht\' of \'budget\' zijn. Ter vergelijking een Geheel-account met home_screen \'budget\' en een account zonder moduleset (null).',
    when:
      'De gebruiker logt in, of opent ingelogd / of /dashboard (de edge-proxy vertaalt die naar het homescherm).',
    then:
      'Het Krant-account landt altijd op /nieuws — de productgrens wint van de homescherm-voorkeur (`resolveHomeHref`), dus ook met home_screen \'overzicht\' of \'budget\'. Het Geheel-account landt op /overzicht/budget en het account zonder moduleset op /overzicht, precies zoals vóór Krant 2B. `HOME_SCREEN_HREFS.nieuws` en `NEWS_ONLY_HOME_HREF` zijn dezelfde route (/nieuws). De client-side home-navigaties (TopBar-←, long-press op de waffle, `useHomeScreen().homeHref`) gaan daardoor zonder omweg via een redirect naar /nieuws.',
    assertion: {
      kind: 'exact',
      expected: 'krantHomeOverzicht=/nieuws; krantHomeBudget=/nieuws; krantHomeNieuws=/nieuws; geheelHomeBudget=/overzicht/budget; zonderModules=/overzicht',
      source: 'lib/home-screen.ts#resolveHomeHref + HOME_SCREEN_HREFS + NEWS_ONLY_HOME_HREF (aangeroepen door lib/supabase/proxy.ts) — zie krant-checks.ts',
    },
  },
  {
    workflow: 'WF-KRANT-02',
    scenarioId: 'UAT-KRANT-02',
    titel: 'Direct naar een route buiten de grens: server-redirect naar /nieuws',
    kriticiteit: 'KERN',
    given:
      'Een ingelogd Krant-account (geen superadmin). De edge-proxy zet op elk verzoek dat hij matcht de request-header `x-tf-pathname` (`PATHNAME_HEADER`) met het pad — `set`, geen `append`, dus een door de client meegestuurde waarde wordt overschreven. De server-layout leest dat pad voor de grens.',
    when:
      'De gebruiker typt of plakt de URL /overzicht, /toekomst, /mijn, /mijn/profiel, /berichten, /rapportages of /nieuwsX in de adresbalk (een harde laadbeurt), of het verzoek komt binnen zonder pad-header.',
    then:
      'Elk van die paden krijgt een server-redirect naar /nieuws (`redirect()` in app/(app)/layout.tsx), vóórdat de pagina rendert: de geweigerde pagina is ook niet even zichtbaar. /nieuwsX telt niet als /nieuws: de grens is een PREFIX-grens op een padsegment (/nieuws en /nieuws/…), nooit een woord dat er toevallig mee begint. Ontbreekt de pad-header, dan is de uitkomst fail-closed /nieuws, en er ontstaat geen lus, want het vervolgverzoek naar /nieuws draagt de header wél (lib/supabase/proxy.pathname-header.test.ts). Voor een Geheel-account draait dit blok niet eens (ook geen `headers()`-lezing).',
    assertion: {
      kind: 'exact',
      expected: 'overzicht=/nieuws; toekomst=/nieuws; mijn=/nieuws; mijnProfiel=/nieuws; berichten=/nieuws; rapportages=/nieuws; nieuwsX=/nieuws; zonderHeader=/nieuws',
      source: 'lib/modules/krant-grens.ts#krantRedirect + isRouteAllowed + isKrantRoute (aangeroepen door app/(app)/layout.tsx met het pad uit lib/supabase/proxy.ts#forwardedRequest) — zie krant-checks.ts',
    },
  },
  {
    workflow: 'WF-KRANT-03',
    scenarioId: 'UAT-KRANT-03',
    titel: 'Een in-app link buiten de grens (client-navigatie) toont de pagina niet',
    kriticiteit: 'KERN',
    given:
      'Een Krant-account op /nieuws. Een client-navigatie (een `<Link>` of `router.push`) naar een route buiten de grens, bv. een link in een artikel of een oude deeplink naar /overzicht. Next rendert de gedeelde (app)-layout bij een client-navigatie niet opnieuw (Partial Rendering), dus de server-redirect van WF-KRANT-02 vuurt hier niet.',
    when: 'De gebruiker klikt de link, en daarna op de terugknop van de browser.',
    then:
      '`KrantRouteGuard` rond de pagina-inhoud neemt dezelfde beslissing (`krantRedirect`, één functie, twee momenten): buiten de grens rendert hij níéts — de pagina verschijnt niet, ook niet even — en vervangt hij de route door /nieuws met `router.replace`. Omdat het een replace is en geen push, brengt de terugknop de gebruiker niet terug naar de geweigerde pagina. Binnen de grens, en voor elk niet-Krant-account, is de wacht een doorgeefluik dat de pagina ongewijzigd rendert.',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/shell/krant-route-guard.tsx (usePathname + useModuleAccess + krantRedirect → router.replace) + app/(app)/layout.tsx (children binnen KrantRouteGuard) — bewaakt door components/app/shell/krant-shell.test.tsx en lib/modules/krant-layout.source.test.ts; geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-KRANT-04',
    scenarioId: 'UAT-KRANT-04',
    titel: 'De routes binnen de grens laden zonder redirect en zonder lus',
    kriticiteit: 'KERN',
    given:
      'Een Krant-account. De allowlist `KRANT_ROUTES`: /nieuws, /mijn/nieuwsprofiel, /mijn/notificaties, /mijn/account en /krant/meer. VOORLOPIG BESLUIT: /mijn/notificaties staat erop in plaats van het /mijn/meldingen van de kaart — die route bestaat niet, de meldingsvoorkeuren staan op /mijn/notificaties.',
    when:
      'De gebruiker opent /nieuws, een pad eronder, /mijn/account (ook met een afsluitende slash), /mijn/notificaties en /nieuws met een querystring; daarna /mijn/nieuwsprofiel en /krant/meer.',
    then:
      'Geen van deze paden krijgt een redirect (`krantRedirect` geeft null), dus er is geen lus: de grens stuurt /nieuws nooit naar /nieuws. Query, hash en een afsluitende slash veranderen de uitkomst niet. /krant/meer (kaart 2D) laadt gewoon. /mijn/nieuwsprofiel (kaart 2C) staat al op de allowlist maar bestaat nog niet: daar hoort de gewone ingelogde 404, geen redirect (zodat die kaart niets aan de grens hoeft te veranderen). /nieuws bepaalt de bron server-side via `bepaalKrantBron` (Krant 1C fase 2, B40): een Krant-account krijgt buiten de tijdlijn-bèta het neutrale wachtscherm `KrantWacht` ("Je Krant wordt klaargezet…"), binnen de bèta de tijdlijn zonder AI — in geen van beide gevallen wordt `/api/news` aangeroepen of een AI-upsell getoond (zie WF-WILL-33).',
    assertion: {
      kind: 'exact',
      expected: 'nieuws=null; nieuwsOnder=null; mijnAccount=null; mijnAccountSlash=null; mijnNotificaties=null; nieuwsMetQuery=null; nieuwsprofiel=null; krantMeer=null',
      source: 'lib/modules/krant-grens.ts#krantRedirect + KRANT_ROUTES + isKrantRoute (normalizePath: query, hash, afsluitende slash) — zie krant-checks.ts',
    },
  },
  {
    workflow: 'WF-KRANT-05',
    scenarioId: 'UAT-KRANT-05',
    titel: 'Een superadmin met een Krant-account bereikt /beheer, een gewone gebruiker niet',
    kriticiteit: 'BELANGRIJK',
    given:
      'Twee Krant-accounts: één met `profiles.role = \'superadmin\'` (een testende beheerder) en één gewone gebruiker. VOORLOPIG BESLUIT: /beheer blijft open voor een superadmin met een Krant-account — anders sluit een testende beheerder zichzelf buiten.',
    when: 'Beide openen /beheer en /beheer/uat; de superadmin opent ook /beheerX.',
    then:
      'De superadmin bereikt /beheer en alles eronder zonder redirect (de /beheer-layout toetst de rol daarna zelf nog met `isSuperAdmin`); /beheerX is geen beheerpad en gaat ook voor hem naar /nieuws. De gewone gebruiker met een Krant-account gaat bij /beheer naar /nieuws. In ⌘K ziet de superadmin de beheerpagina\'s (`getAdminPageItems`) naast de pagina\'s binnen de grens.',
    assertion: {
      kind: 'exact',
      expected: 'superadminBeheer=null; superadminBeheerSub=null; superadminBeheerX=/nieuws; gebruikerBeheer=/nieuws',
      source: 'lib/modules/krant-grens.ts#krantRedirect + isRouteAllowed (BEHEER_PREFIX, alleen met isSuperadmin = profile.role === \'superadmin\' uit app/(app)/layout.tsx) — zie krant-checks.ts',
    },
  },
  {
    workflow: 'WF-KRANT-06',
    scenarioId: 'UAT-KRANT-06',
    titel: 'De desktop-zijbalk toont alleen Krant en Mijn',
    kriticiteit: 'BELANGRIJK',
    given:
      'Een Krant-account op desktop (≥ lg), zijbalk uitgeklapt en ingeklapt. De zijbalk leest zijn lijsten uit `useNavSurface()` → `navSurfaceFor(activeModules)`; geen oppervlak filtert zelf op modules.',
    when: 'De gebruiker bekijkt het hoofdmenu, de sectie "overige", de footer en de profiel-pill, en klapt de zijbalk in.',
    then:
      'Het hoofdmenu is leeg: geen Home, geen hefbomen (Bezittingen/Schulden/Budget), geen Toekomst. In "overige" staat alleen de Krant (met zijn eigen ongelezen-stip) — geen Tips & acties, geen Berichten, geen Rapportages. De footer toont geen "Sync nu" en geen Sync-rapport (een Krant-account heeft geen koppelingen); de Mijn-link én de profiel-pill wijzen naar /mijn/account, niet naar de /mijn-hub (die ligt buiten de grens). Ingeklapt verschijnt het hefboomkompas niet. VOORLOPIG BESLUIT: het label blijft "Krant", niet "Nieuws" — één naam per route (M14, nav-config.naamconsistentie.test.ts).',
    assertion: {
      kind: 'exact',
      expected: 'isKrant=true; hoofdmenu=0; mijnHref=/mijn/account; krant=true; tips=false; berichten=false; rapportages=false; toekomst=false; overzicht=false',
      source: 'lib/nav-config.ts#navSurfaceFor (KRANT_SURFACE: menu, mijn, isVisible) gelezen door components/app/shell/sidebar.tsx (MenuSection entries, OverigeSection isVisible op de OVERIGE_BASE-hrefs, FooterSection mijnHref/showSync, LeverCompassCollapsed alleen bij !isKrant) — zie krant-checks.ts; de rendering zelf in components/app/shell/krant-shell.test.tsx',
    },
  },
  {
    workflow: 'WF-KRANT-07',
    scenarioId: 'UAT-KRANT-07',
    titel: 'Mobiele nav-sheet, TopBar-accountmenu, /mijn-tabbalk en ⌘K volgen de grens',
    kriticiteit: 'BELANGRIJK',
    given:
      'Een Krant-account op mobiel (< lg) en op desktop. Alle vier oppervlakken lezen `navSurfaceFor` (via `useNavSurface`).',
    when:
      'De gebruiker opent de NavMenuSheet via de nav-pill, het accountmenu rechts in de TopBar, een /mijn-subpagina (de tabbalk), en ⌘K, waar hij zoekt op "overzicht", "profiel", "notificaties" en "krant".',
    then:
      'De nav-sheet toont Mijn (met alleen Account en Notificaties) en onder "Overal beschikbaar" alleen de Krant — geen "Vraag Fin", geen Tips, Berichten of Rapportages, geen hefbomen of Toekomst. Het TopBar-accountmenu: Mijn → /mijn/account, zonder Rapportages en zonder sync; het mobiele hefboomkompas ontbreekt. De /mijn-tabbalk toont alleen Account en Notificaties. ⌘K vindt alleen pagina\'s binnen de grens (plus de beheerpagina\'s voor een superadmin, WF-KRANT-05), en van de ⌘K-acties alleen wat op elke pagina zin heeft: bedragen verbergen/tonen, de weergave wisselen en uitloggen — geen euro-weergave, geen homescherm wisselen, geen "Alles synchroniseren" en geen perspectief-acties (`krantZichtbaar` in `buildActionItems`). Op /mijn/account valt het kruimelpad weg (de crumb "Mijn" → /mijn ligt buiten de grens), en in het meldingenpaneel ontbreekt "Bekijk alles" naar /berichten.',
    assertion: {
      kind: 'exact',
      expected: 'overalBeschikbaar=/nieuws; vraagFin=false; mijnOnderdelen=/mijn/account,/mijn/notificaties; mijnHub=false; paletPaginas=/mijn/account,/mijn/notificaties,/nieuws; paletActies=action:toggle-privacy,action:toggle-display-mode,action:logout',
      source: 'lib/nav-config.ts#navSurfaceFor (globalNav, mijn.children, isVisible) gelezen door components/app/shell/nav-menu-sheet.tsx + components/app/shell/top-bar.tsx + components/app/module-nav.tsx + components/app/breadcrumb.tsx + components/app/notifications/notification-panel.tsx + components/command-palette/command-palette.tsx (pagina-filter op isVisible na lib/command-palette/navigation-index.ts#filterPagesByModules) + lib/command-palette/actions.ts#buildActionItems (krantZichtbaar) — zie krant-checks.ts; de rendering in components/app/shell/krant-shell.test.tsx, components/app/krant-grens-links.test.tsx en components/command-palette/command-palette.krant.test.tsx',
    },
  },
  {
    workflow: 'WF-KRANT-08',
    scenarioId: 'UAT-KRANT-08',
    titel: 'Geen Fin en geen AI-keuze in de shell van een Krant-account',
    kriticiteit: 'KERN',
    given:
      'Een Krant-account, óók een dat eerder als Geheel-account de chat had vastgepind (localStorage `trifinity-chat-pinned`), een actieve vragenlijst had klaarstaan, of een AI-keuze nog niet had gemaakt. `shouldMountFin(activeModules)` is false (besluit B11).',
    when:
      'De gebruiker laadt /nieuws op mobiel en desktop, opent een artikel, opent het meldingenpaneel (bel) en wacht een paar seconden.',
    then:
      'Er is geen Fin-bubbel in de nav-pill en geen zwevende companion (FinHome niet gemount), geen chatpaneel (ChatPanelLazy niet gemount; een vastgepinde stand opent hem niet en reserveert geen zijbalkbreedte, omdat `isOpen = finEnabled && …`), geen `?prompt=`-deeplink, geen vragenlijst-popup (VragenlijstUitnodiging niet gemount — "Nu invullen" zou een dode knop zijn) en geen AI-keuze-interstitial. Op /nieuws staan bij een artikel geen "Bespreek met Fin" en geen "Maak actie"; "Gelezen" blijft. In het meldingenpaneel staat bij geen enkele melding of bundel "Vraag Fin". Een `BesprekMetWillButton` elders verbergt zich ook.',
    assertion: {
      kind: 'ui-only',
      source: 'lib/modules/krant-grens.ts#shouldMountFin → app/(app)/layout.tsx (finEnabled op ChatProvider, ChatPanelLazy, ChatPromptDeeplink, FinHome, VragenlijstUitnodiging, AiConsentInterstitial) + components/app/chat/chat-provider.tsx (finEnabled, isOpen) + components/berichten/news-components.tsx + components/app/notifications/notification-item.tsx + components/app/notifications/notification-bundle.tsx + components/app/chat/bespreek-met-fin-button.tsx — bewaakt door components/app/chat/fin-krant.test.tsx en lib/modules/krant-layout.source.test.ts; geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-KRANT-09',
    scenarioId: 'UAT-KRANT-09',
    titel: 'Een Krant-account krijgt geen maandagmail en geen horizon-meldingen',
    kriticiteit: 'BELANGRIJK',
    given:
      'Een Krant-account met onboarding afgerond en `weekly_briefing_email = true`, zonder geboortedatum en met een schuld in de data (restant van een eerder Geheel-leven). Ter vergelijking een Geheel-account met dezelfde gegevens.',
    when:
      'De maandag-cron `GET /api/briefing/email/cron` draait; daarna opent de gebruiker het meldingenpaneel (`GET /api/notifications`).',
    then:
      'De cron slaat het Krant-account over vóór elke lees- of schrijfstap (`receivesBriefing` false → teller `skipped_krant` +1): er gaat geen mail uit en de week-gate (`briefing_email_sent_week_<id>`) wordt niet gezet, zodat een latere overstap naar het Geheel gewoon een eerste briefing krijgt. In het meldingenpaneel ontbreken de drie horizon-meldingen (geen geboortedatum → /mijn/profiel, schulden → /overzicht/schulden, "Volledige vrijheid niet haalbaar bij huidige koers" → /toekomst) — die wijzen naar routes buiten de grens en dragen een "Vraag Fin". Op /mijn/notificaties ziet het Krant-account de schakelaars "briefing per e-mail" en Fins proactieve tips niet (in Eenvoudig én Volledig); de meldingstypen en de maandelijkse geldcheck-in blijven. Het Geheel-account krijgt de mail, ziet die meldingen en beide schakelaars zoals voorheen.',
    assertion: {
      kind: 'exact',
      expected: 'krantBriefing=false; zonderModulesBriefing=true; geheelBriefing=true; krantHorizonMeldingen=false; geheelHorizonMeldingen=true',
      source: 'lib/modules/krant-grens.ts#receivesBriefing (app/api/briefing/email/cron/route.ts, select id + active_modules, counters.skipped_krant) + isKrantProfile (app/api/notifications/route.ts, horizonAlertsApply = !isKrantProfile(profile), gemirrord) — zie krant-checks.ts; de routes zelf in app/api/briefing/email/cron/route.test.ts; de verborgen schakelaars in app/(app)/mijn/notificaties/page.tsx (useNavSurface().isKrant, ui-only)',
    },
  },
  {
    workflow: 'WF-KRANT-10',
    scenarioId: 'UAT-KRANT-10',
    titel: 'Elke AI-route en het aanzetten van een add-on weigeren een Krant-account',
    kriticiteit: 'KERN',
    given:
      'Een Krant-account — óók een dat nog \'ai\' in `active_subscriptions` heeft uit een eerder Geheel-leven. Een willekeurige AI-route (cloud of lokaal `local-*`), en `POST /api/beta/addon` (ADR 0157).',
    when:
      'De tester roept een AI-route aan (bv. GET /api/local-knowledge of de Fin-chat); roept `POST /api/beta/addon` rechtstreeks aan met `{ tier: \'ai\', active: true }` resp. `{ tier: \'ai\', active: false }`; en opent /mijn/account.',
    then:
      'Elke AI-route geeft een 403 met code `ai_subscription` (via `checkTierGate(…, \'ai\')`, `reason: \'krant\'`, tekst "De Krant werkt zonder AI. Deze functie hoort bij het volledige TriFinity.") of `ai_disabled` (de ai_enabled-poort), nooit AI-output en nooit een kale 500 — één centrale poort voor alle AI-routes, en voor een Krant-account wint die van een aanwezig abonnement. `POST /api/beta/addon` met active:true geeft 403 (`forbidden`, "Add-ons horen bij het volledige TriFinity. In de Krant zet je ze niet aan."), vóór er iets wordt geschreven; met active:false werkt het (een eerder abonnement intrekken, bij AI ook toestemming `withdrawn` vastleggen, blijft altijd mogelijk). Een leesfout op het eigen profiel is een 500, geen stille doorlaat. Op /mijn/account staan voor een Krant-account geen sectie Abonnement (de add-on-schakelaars) en geen AI-tegoed meer; inloggegevens en de danger zone blijven. Wat de Krant daar wél laat zien ("Meer TriFinity") is kaart 2C/2D. BELANGRIJK voor de tester: de 403 van de add-on-route is dus alleen nog met een rechtstreekse aanroep te raken; ziet u op /mijn/account tóch een add-on-schakelaar, dan is dat een defect.',
    assertion: {
      kind: 'consistency',
      source: 'lib/require-tier.ts#checkTierGate (select active_subscriptions + active_modules; isKrantProfile → KRANT_GEEN_AI_MESSAGE, reason krant) + lib/ai/gate-responses.ts#aiSubscriptionRequired + app/api/beta/addon/route.ts (isKrantProfile → forbidden(KRANT_GEEN_ADDON_MESSAGE) alleen bij active:true) + components/mijn/account/account-client.tsx (AbonnementSection/AiCreditsSection alleen bij !isKrant) — A=B-toets: elke AI-route in AI_ROUTE_BINDINGS (lib/ai/execution-groups.ts) weigert via dezelfde poort, bewaakt door lib/modules/krant-ai-poort.test.ts en app/api/beta/addon/route.test.ts; geen cijfer',
    },
  },
  {
    workflow: 'WF-KRANT-11',
    scenarioId: 'UAT-KRANT-11',
    titel: 'Productkeuze Krant ⇄ Geheel via PUT /api/modules, zonder iets te wissen',
    kriticiteit: 'KERN',
    given:
      'Een Geheel-account met bezittingen, budgetten en transacties. De enige UI die `PUT /api/modules` aanroept is de knop op /krant/meer (kaart 2D), en die zet alleen `product: \'geheel\'`; voor de richting naar de Krant roept de tester de route rechtstreeks aan vanuit een ingelogde sessie. Migratie 20261006120000 (CHECK op `profiles.home_screen` met \'nieuws\') moet live staan vóór de route, anders geeft de Krant-keuze een 500.',
    when:
      'De tester stuurt `{ product: \'krant\' }`, herlaadt, stuurt daarna `{ product: \'geheel\' }` en herlaadt opnieuw; daarnaast een ongeldige body (`{ product: \'budget\' }`, `{ modules: [\'nieuws\'] }`, een extra veld, kapotte JSON). Als Geheel-account opent hij de homescherm-picker op /mijn/uiterlijk en stuurt hij `PUT /api/home-screen` met `{ screen: \'nieuws\' }`.',
    then:
      '`krant` zet in één own-row update `active_modules = [\'nieuws\']` en `home_screen = \'nieuws\'` (response `{ ok: true, modules: [\'nieuws\'], homeScreen: \'nieuws\' }`); `geheel` zet alle zes modules in catalogusvolgorde en `home_screen = \'overzicht\'`. Er wordt niets gewist: alleen die twee profielkolommen veranderen, dus na de terugkeer naar Geheel staat alle data er weer zoals voorheen. Een onbekend product, een modulelijst, een extra veld of kapotte JSON geeft een 400 en schrijft niets; zonder sessie 401 "Niet ingelogd". De homescherm-picker toont nooit een kaart "Nieuws" (alleen Overzicht en Budgetteren; staat de opgeslagen waarde op \'nieuws\', dan is geen kaart ingedrukt), en `PUT /api/home-screen` weigert \'nieuws\' met een 400 — de Krant is een product, geen startscherm.',
    assertion: {
      kind: 'exact',
      expected: 'krantModules=nieuws; krantHome=nieuws; geheelModules=6; geheelHome=overzicht; krantPresetGeldig=true; geheelPresetGeldig=true; kiesbaar=overzicht,budget; opslaanbaar=overzicht,budget,nieuws; nieuwsHref=/nieuws',
      source: 'lib/modules/resolve.ts#PRODUCT_PRESETS + PRODUCTS (app/api/modules/route.ts, z.strictObject + validateModules-guard) + lib/module-registry.ts#validateModules + lib/home-screen.ts#HOME_SCREEN_PICKABLE + HOME_SCREEN_VALUES + HOME_SCREEN_HREFS (app/api/home-screen/route.ts, components/mijn/home-screen-picker.tsx) — zie krant-checks.ts; de routes zelf in app/api/modules/route.test.ts en app/api/home-screen/route.test.ts',
    },
  },
  {
    workflow: 'WF-KRANT-12',
    scenarioId: 'UAT-KRANT-12',
    titel: 'REGRESSIE: een account zonder moduleset of met alle zes ziet alles zoals vroeger',
    kriticiteit: 'KERN',
    given:
      'Drie bestaande accounts: `active_modules = null`, alle zes modules, en een subset die niet precies [\'nieuws\'] is (bv. nieuws + budgetteren). Productie op 28 sep 2026: 26 × alle zes, 3 × null, 0 × alleen nieuws.',
    when:
      'De tester loopt de oppervlakken van deze zone langs: routes buiten /nieuws, de zijbalk, de nav-sheet, het TopBar-menu, ⌘K, Fin en de chat, de maandagmail, een AI-route en `POST /api/beta/addon` met active:true.',
    then:
      'Geen enkele route krijgt een Krant-redirect; de navigatie is exact de lijst van vóór Krant 2B (dezelfde instanties `menuNav`/`globalNav`, Mijn naar /mijn, `isVisible` altijd waar, met "Vraag Fin"); Fin, de chat en de AI-keuze worden gemount zoals voorheen; de briefingmail gaat uit; de AI-poort en de add-on-route geven dezelfde uitkomst als vóór Krant 2B (met abonnement toegang, zonder abonnement de bekende upsell). Elke afwijking hier is een regressie en KERN.',
    assertion: {
      kind: 'exact',
      expected: 'zonderModulesRedirect=null; alleZesRedirect=null; subsetRedirect=null; subsetIsKrant=false; zonderModulesMenuOngewijzigd=true; alleZesGlobalNavOngewijzigd=true; alleZesMijnHref=/mijn; zonderModulesFin=true; alleZesFin=true; subsetFin=true; alleZesBriefing=true; alleZesPerspectiefActies=3; alleZesHomeschermActie=true',
      source: 'lib/modules/krant-grens.ts#krantRedirect + isKrantAccount + shouldMountFin + receivesBriefing + lib/nav-config.ts#navSurfaceFor (GEHEEL_SURFACE) + lib/modules/resolve.ts#resolveActiveModules — zie krant-checks.ts; de regressie per oppervlak in lib/nav-config.krant.test.ts, components/app/shell/krant-shell.test.tsx en lib/modules/krant-ai-poort.test.ts',
    },
  },
  {
    workflow: 'WF-KRANT-13',
    scenarioId: 'UAT-KRANT-13',
    titel: '/krant/meer: de weg omhoog, met één knop die alles zelf navigeert',
    kriticiteit: 'KERN',
    given:
      'Een Krant-account. /krant/meer staat al op de allowlist (WF-KRANT-04); dit criterium toetst de pagina nu ze bestaat. FASE 1: geen onboarding na de overstap, geen voorvullen uit het nieuwsprofiel, geen herkomst-omzetting — dat is 2C.',
    when:
      'De gebruiker opent /mijn/account, volgt de kaart "Meer TriFinity" naar /krant/meer, klikt "Meer TriFinity", ziet de bevestiging en klikt "Aanzetten". Los daarvan: hij annuleert een keer, en de route levert een keer een fout.',
    then:
      'De pagina opent met één h2-aanhef (`PageOpening`, geen h1 — ADR 0110) en precies één knop "Meer TriFinity"; die opent `<ShellOverlay kind="confirm">` met titel "Meer TriFinity aanzetten?" en schrijft nog niets. Pas "Aanzetten" roept `PUT /api/modules` aan met `{ product: \'geheel\' }`; bij een 2xx volgt een hárde navigatie (`window.location.assign`, geen `router.push`) naar /overzicht — bewust hard, want de gedeelde (app)-layout houdt de moduleset in de FeatureAccessProvider vast en een soft-push zou de KrantRouteGuard nog het oude product laten zien en meteen terugsturen naar /nieuws. Bij een fout blijft de bevestiging open met de foutmelding (`role="alert"`) en wordt niet genavigeerd; "Annuleren" sluit zonder aan te roepen. De kopij op de pagina, in de info-knop en in de bevestiging bevat geen AI-claim, prijs/eurobedrag, bespaar- of adviestaal en geen koop-metafoor (ADR 0165), en noemt expliciet "Er wordt niets gewist" en de weg terug via support.',
    assertion: {
      kind: 'ui-only',
      source: 'components/krant/krant-meer-artikel.tsx (h2/h3-structuur, GEHEEL_ONDERDELEN) + components/krant/meer-trifinity-knop.tsx (MeerTriFinityKnop, NA_OVERSTAP_HREF=/overzicht, hardeNavigatie) + app/(app)/krant/meer/page.tsx — bewaakt door components/krant/krant-meer-artikel.test.tsx en lib/modules/krant-meer.grens.test.ts; het feitelijke schrijfpad (product:\'geheel\' → PRODUCT_PRESETS.geheel) is het \'exact\'-criterium WF-KRANT-11, hier niet dubbel gerekend',
    },
  },
  {
    workflow: 'WF-KRANT-14',
    scenarioId: 'UAT-KRANT-14',
    titel: 'De kaart "Meer TriFinity" op /mijn/account: alleen voor een Krant-account',
    kriticiteit: 'BELANGRIJK',
    given:
      'Een Krant-account en, ter vergelijking, een Geheel-account, beiden op /mijn/account.',
    when:
      'De gebruiker opent /mijn/account.',
    then:
      'Het Krant-account ziet de sectie "Meer TriFinity" (kop + korte uitleg + de link "Bekijk wat het volledige TriFinity laat zien" naar /krant/meer) en géén Abonnement-/AI-tegoedsectie (WF-KRANT-10, hier nogmaals geborgd); de accountbasis (e-mail/wachtwoord) blijft zichtbaar. Het Geheel-account ziet de kaart niet, en ziet Abonnement en AI-tegoed wél. `AccountClient` beslist dit via dezelfde `useNavSurface().isKrant` als de rest van de productgrens — geen aparte lezing.',
    assertion: {
      kind: 'ui-only',
      source: 'components/mijn/account/meer-trifinity-kaart.tsx (MeerTriFinityKaart) + components/mijn/account/account-client.tsx (isKrant → MeerTriFinityKaart i.p.v. AbonnementSection/AiCreditsSection) — bewaakt door components/mijn/account/account-client.krant.test.tsx',
    },
  },
  {
    workflow: 'WF-KRANT-15',
    scenarioId: 'UAT-KRANT-15',
    titel: 'Beheer zet het product van een account om, zonder het huidige product te tonen',
    kriticiteit: 'KERN',
    given:
      'Een superadmin op /beheer/gebruikers, en ter vergelijking een gewone gebruiker die de route rechtstreeks aanroept. Er is bewust géén downgrade-knop voor de lezer zelf (B12) — terug naar alleen de Krant loopt uitsluitend hierlangs.',
    when:
      'De superadmin klikt naast een gebruikersrij "Zet op Krant" of "Zet op Geheel", ziet de bevestiging met de uitleg per keuze en bevestigt; los daarvan roept de gewone gebruiker `POST /api/admin/users/product` rechtstreeks aan.',
    then:
      'Elke keuze gaat eerst via `<ShellOverlay kind="confirm">` en schrijft pas na bevestigen; vóór het bevestigen is er geen `fetch`-aanroep, en "Annuleren" schrijft niets. Na bevestigen roept de knop `POST /api/admin/users/product` aan met `{ userId, product }`; de route (achter `isSuperAdmin`, anders 403; zonder sessie 401) leest van `profiles` alleen `id` + `full_name` (ADR 0146 — de huidige moduleset staat niet op de beheer-leeslijst, dus de knoppen tonen bewust niet wat een account nú heeft) en schrijft `active_modules`/`home_screen` uit dezelfde `PRODUCT_PRESETS` als `PUT /api/modules` (WF-KRANT-11) — geen tweede preset-definitie. Het auditlog krijgt een `user.product`-regel met alleen het doel (`to: product`), geen "van"-waarde. Er wordt niets gewist: alleen die twee profielkolommen veranderen (bewaakt door een bronscan die elke `delete`/`insert`/`upsert` in de route verbiedt). Een onbekend product of een extra veld geeft een 400 (strict body-schema); de gewone gebruiker krijgt 403 vóór er iets wordt gelezen of geschreven.',
    assertion: {
      kind: 'consistency',
      source: 'app/api/admin/users/product/route.ts (isSuperAdmin-poort, ProductBodySchema strict, PRODUCT_PRESETS-hergebruik, logAdminAction user.product, geen delete/insert/upsert) + components/app/beheer/product-keuze.tsx (ProductKeuze: bevestiging vóór fetch) + lib/beheer/geen-inhoud.test.ts (de META_KOLOMMEN-gate op profiles) — A=B-toets tegen dezelfde PRODUCT_PRESETS als WF-KRANT-11 (\'exact\'); bewaakt door components/app/beheer/product-keuze.test.tsx; de route zelf in app/api/admin/users/product/route.test.ts (401/403/400/404, beide presets, audit, geen delete/insert/upsert)',
    },
  },
  {
    workflow: 'WF-KRANT-16',
    scenarioId: 'UAT-KRANT-16',
    titel: 'Een Geheel-account op /krant/meer krijgt een link, geen knop',
    kriticiteit: 'OVERIG',
    given:
      'Een Geheel-account dat rechtstreeks naar /krant/meer navigeert (bv. via een gedeelde link) — de route ligt binnen de Krant-grens en redirect dus niet (WF-KRANT-04).',
    when:
      'Het account opent /krant/meer.',
    then:
      'De pagina toont dezelfde uitleg over wat het volledige TriFinity laat zien, maar géén knop "Meer TriFinity" (die hoort alleen bij `isKrant`): in plaats daarvan staat er "Je gebruikt het volledige TriFinity al." met een link "Naar je overzicht" naar /overzicht. Er is geen bevestigingsmodal en geen `PUT /api/modules`-aanroep mogelijk vanaf deze pagina voor dit account.',
    assertion: {
      kind: 'ui-only',
      source: 'components/krant/krant-meer-artikel.tsx#KrantMeerArtikel (isKrant ? MeerTriFinityKnop : link naar /overzicht) — bewaakt door components/krant/krant-meer-artikel.test.tsx ("een account met het volledige TriFinity krijgt geen knop")',
    },
  },
]

export const KRANT_ACCEPTANCE: AcceptanceSet = {
  zone: 'KRANT',
  criteria,
}
