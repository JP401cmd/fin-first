/**
 * Acceptatiecriteria — domein Fin (AI-coach), berichten & krant (WF-WILL-01..20 /
 * UAT-WILL-01..20).
 *
 * Spiegelt exact de aanpak van `budget.ts`/`start.ts`/`schuld.ts`/`toek.ts`. Bron:
 * `docs/uat/uat-plan.md` Deel 1 (workflow-definities WF-WILL-01..22) + Deel 2 §2.8
 * (UAT-WILL-01..20).
 *
 * WF-WILL-21 en WF-WILL-22 hebben BEWUST GEEN eigen criterium hier — het UAT-plan
 * zelf wijst ze door naar UAT-OVZ-19/20/21 ("→ gedekt door UAT-OVZ-19/20/21");
 * `lib/uat/catalog.ts` bevat dan ook geen UAT-WILL-21/22 (het volgnummer na 20
 * is UAT-WILL-23, zie hieronder) — dit domein is dus, net als SCHULD/TOEK, NIET
 * volledig aaneengesloten op WF-nummer, maar WEL 1-op-1 met de catalogus-
 * scenario's die daadwerkelijk bestaan (20 + UAT-WILL-23 t/m 31 = 29).
 *
 * UAT-WILL-27 t/m 31 (gespreksgeschiedenis voor de Fin-chat, ADR 0137 /
 * melding W-004): tot deze release leefde een gesprek alleen in browser-state
 * (`useChat`) en was het na een refresh weg. Er kwam een VIERDE paneelmodus bij
 * ("gesprekken", naast chat/melding/gids) plus twee ruggen — Supabase en
 * IndexedDB — achter één facade. Vijf criteria omdat het vijf onafhankelijk
 * falende dingen zijn: bewaren+hervatten (27), een nieuw gesprek naast het
 * oude (28), de opslagkeuze incl. de "uit"-bevestiging met twee uitgangen (29),
 * de privacyvloer die een lokaal gevoerd gesprek nooit naar de server laat gaan
 * (30) en de nieuwe lege staat met suggestievragen (31).
 *
 * WAAROM 31 EEN EIGEN CRITERIUM IS (en geen uitbreiding van WF-WILL-01): de
 * lege staat is nu een ander scherm met een eigen, DETERMINISTISCHE
 * selectiemotor (`selectSuggesties` — 105 records, datavereisten uit
 * `CoachDataGaps`, roterende seed, géén `Math.random`). WF-WILL-01 is bewust
 * 'ui-only' omdat AI-tekst niet toetsbaar is; hier valt juist wél iets exact na
 * te rekenen, en de fout die het moet vangen is er al één geweest (een
 * suggestie over "mijn volgende verdiende euro" op een account zonder
 * inkomensgegevens). Zo'n gate onder een ui-only-criterium schuiven zou hem
 * onzichtbaar maken.
 *
 * UAT-WILL-26 (Fin herinnert aan de volgende gidsstap, ADR 0130 fase 2): de
 * welkomstgids verhuisde van een banner op /overzicht naar Fin; de proactieve
 * bubbel is de tweede helft van dat besluit. Route-gebonden, max één per dag,
 * en zolang de gids loopt vervangt hij de data-gap-laag — vandaar een eigen
 * workflow naast de coach-regelselectie van WF-WILL-05.
 *
 * UAT-WILL-23 (lokaal actievoorstel toevoegen, backlog #886 C2c): het on-device
 * pad hergebruikt de bestaande `ActionSuggestionCard`/`POST /api/ai/actions` van
 * WF-WILL-03, maar het intent-parsen/-resolven zit in
 * `lib/ai/local/local-chat-transport.ts` (fail-closed bij parse-miss/geen
 * canonieke match) — vandaar een eigen workflow i.p.v. een uitbreiding van
 * WF-WILL-03.
 *
 * UAT-WILL-24 (melding maken vanuit de chat, release 8 aug 2026): nieuwe
 * meldmodus in chat-panel.tsx (megafoon-toggle) → components/app/chat/melding/**
 * → POST /api/user-reports. Bewust BUITEN alle AI-gates (werkt zonder
 * AI-abonnement); de 5/uur-rem en de best-effort Notion-push (met dagelijkse
 * retry-cron, /beheer/jobs) zijn de deterministische randvoorwaarden.
 *
 * KERN-BEVINDING (bepaalt exact vs. ui-only — zie ook de zone-specifieke notitie
 * op de Notion-kaart): dit domein combineert twee toetsbaarheidsprofielen.
 * (1) Fin-chat en de krant zijn AI-gegenereerd → NIET deterministisch toetsbaar
 * op de letterlijke tekst; deze workflows zijn 'ui-only' en toetsen in de live-run
 * het PROCES (komt er tijdig een antwoord, gaat het over de vraag, geen datalek,
 * streaming start, gesprek blijft bewaard) — nooit een hard cijfer.
 * (2) Meldingen, de coach-regelselectie, notificatievoorkeuren-filtering, de
 * briefing-weeksleutel en de krant-administratie (editienummer, jaargang,
 * ververs-limiet, archiefjaargang, "minder hierover"-drempel) zijn VOLLEDIG
 * deterministisch en dus 'exact' narekenbaar — 12 van de 20 criteria.
 *
 * TWEE ECHTE (niet-gemirrorde) PURE IMPORTS, omdat de betreffende functies al
 * client-veilig en zonder Supabase-parameter bestaan:
 *  - `lib/coach-suggestions.ts#getFirstUndismissedSuggestion` — de deterministische
 *    coach-regelselectie (WF-WILL-05) is de daadwerkelijke productiefunctie,
 *    geen mirror.
 *  - `lib/briefing/snapshot.ts#amsterdamWeekKey` — de ISO-weeksleutel-berekening
 *    (WF-WILL-14) is eveneens de daadwerkelijke productiefunctie.
 *
 * VIER MIRRORS met bronregel-verwijzing (server-only routes met een Supabase-
 * client-parameter, dus niet importeerbaar in een pure module — spiegelt de
 * spaardoel-mirror in `budget-checks.ts` en de netto-vermogen-mirror in
 * `start-checks.ts`): de postpone-termijn (chat-panel.tsx/tips-lijst.tsx,
 * beide `POSTPONE_DAYS = 14`), de
 * budgetmelding-titel/omschrijving (`app/api/notifications/route.ts#pushBudgetNotification`),
 * het krant-editienummer/jaargang + ververs-resterend (`app/api/news/route.ts`),
 * en de "minder hierover"-demotiedrempel (`app/api/news/route.ts#getDemotedCategories`).
 */

import type { AcceptanceCriterion, AcceptanceSet } from './types'

const criteria: AcceptanceCriterion[] = [
  {
    workflow: 'WF-WILL-01',
    scenarioId: 'UAT-WILL-01',
    titel: 'Vrije vraag stellen aan Fin',
    kriticiteit: 'BELANGRIJK',
    given: 'Een ingelogde gebruiker (willekeurige persona) opent een app-pagina; chat nog nooit geopend op dit apparaat.',
    when: 'De gebruiker klikt de Fin-bubbel, accepteert de Wft-disclaimer en stelt een vrije vraag.',
    then: 'Het antwoord stroomt zichtbaar binnen, gaat inhoudelijk over de gestelde vraag en bevat geen ruw datalek (bv. volledige IBAN); de Wft-voetnoot blijft permanent zichtbaar; de disclaimer verschijnt na acceptatie nooit meer op dit apparaat. AI-tekst zelf is niet deterministisch toetsbaar — alleen het PROCES en de randvoorwaarden.',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/chat/chat-panel.tsx (Wft-disclaimer, streaming, domain-useMemo) + app/api/ai/chat/route.ts — procestoets, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-WILL-02',
    scenarioId: 'UAT-WILL-02',
    titel: 'Een tip van Fin beslissen: Doe nu / Later / Negeren',
    kriticiteit: 'KERN',
    given: 'Een "Tip van Fin"-kaart in de chat; "nu" = 5 juli 2026. De drie knoppen dragen dezelfde woorden als de TipsLijst op /overzicht/tips (WF-OVZ-19).',
    when: 'De gebruiker kiest "Later".',
    then: '`postponed_until` = nu + 14 dagen = 19 juli 2026 (POSTPONE_DAYS = 14, identiek in chat-panel.tsx en tips-lijst.tsx); de tip komt pas vanaf die datum terug, als bericht "Uitgestelde tip is terug" in het berichtencentrum (WF-WILL-06). De tip-inhoud zelf ("+X dagen vrijheid/jaar") is AI-tool-output en niet hand-narekenbaar.',
    assertion: {
      kind: 'exact',
      expected: 'postponedUntil=2026-07-19',
      source: 'components/app/chat/chat-panel.tsx r592-594 (POSTPONE_DAYS=14, gemirrord) — zie will-checks.ts',
    },
  },
  {
    workflow: 'WF-WILL-03',
    scenarioId: 'UAT-WILL-03',
    titel: 'Een actievoorstel uit de chat toevoegen',
    kriticiteit: 'KERN',
    given: 'Een actiekaart (bliksem-icoon) in de chat met "+X dagen vrijheid" en "+ Toevoegen".',
    when: 'De gebruiker klikt "+ Toevoegen" (en eventueel nogmaals).',
    then: 'De kaart toont "Toegevoegd" en is daarna uitgeschakeld (geen dubbele actie bij herhaald klikken); de actie staat op /overzicht/tips. Het "+X dagen vrijheid"-cijfer is AI-tool-output (suggestAction), niet hand-narekenbaar.',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/chat/chat-panel.tsx (ActionSuggestionCard, handleAddAction, dubbelklik-guard) — procestoets, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-WILL-04',
    scenarioId: 'UAT-WILL-04',
    titel: 'De chat vastzetten als zijpaneel (desktop)',
    kriticiteit: 'OVERIG',
    given: 'Desktopbrowser, chat geopend.',
    when: 'De gebruiker klikt het punaise-icoon "Vastzetten" en navigeert/herlaadt.',
    then: 'De chat wordt een vaste kolom (420px) rechts; blijft staan bij navigatie en na herladen; "Losmaken" of sluiten-met-kruisje maakt automatisch los. Op mobiel is de knop niet aanwezig.',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/chat/chat-provider.tsx (isPinned, localStorage trifinity-chat-pinned) — layout-gedrag, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-WILL-05',
    scenarioId: 'UAT-WILL-05',
    titel: 'Een coach-melding ontvangen en opvolgen',
    kriticiteit: 'BELANGRIJK',
    given: 'Vers, leeg testaccount: alle CoachDataGaps ontbreken (hasBank/hasAssets/etc. allemaal false), geen deferred fields, pathname "/overzicht", geen regel weggeklikt. Plus een GEVULD account (alle gaps dicht) op de routes zonder pad-regel ("/mijn", "/berichten").',
    when: 'De pagina wordt geladen (eerste bezoek), na het wegklikken van de bank-regel opnieuw, en op een gevuld account buiten de pad-catalogus.',
    then: 'De regelselectie is deterministisch: bij alles ontbrekend wint eerst "gap_bank"; na wegklikken van "gap_bank" (toegevoegd aan dismissed) wint "gap_assets" — de vaste volgorde bank → assets → debts → budgets → transactions → holdings → isin → goals → fire_params → life_events wordt gerespecteerd. De getoonde BOODSCHAP zelf is statische catalogus-tekst, geen AI-output. FIRST-USE-COPY HOORT BIJ FIRST USE (kaart H15): de pad- en default-laag worden pas bereikt als élke data-gap dicht is, dus een gevuld account krijgt daar géén beginnerstaal — op "/mijn" en "/berichten" wint "default_gevuld", niet het welkomstbericht "default".',
    assertion: {
      kind: 'exact',
      expected: 'eersteRegel=gap_bank; naDismissBank=gap_assets; gevuldMijn=default_gevuld; gevuldBerichten=default_gevuld',
      source: 'lib/coach-suggestions.ts#getFirstUndismissedSuggestion (DATA_GAP_SUGGESTIONS-volgorde) — echte productiefunctie, geen mirror',
    },
  },
  {
    workflow: 'WF-WILL-06',
    scenarioId: 'UAT-WILL-06',
    titel: 'Uitgestelde tip komt terug als bericht',
    kriticiteit: 'BELANGRIJK',
    given: 'Vandaag 13-09-2026. Drie uitgestelde tips: A met termijn 12-09 (verlopen), B met termijn 14-09 (loopt nog), C met termijn 01-08 (langer dan 30 dagen geleden verlopen).',
    when: 'De gebruiker opent het berichtencentrum (/berichten) of de bel.',
    then: 'Alleen tip A staat er als bericht "Uitgestelde tip is terug" met de tip-titel; klikken leidt naar /overzicht/tips. De Fin-bubbel in de nav-pill draagt geen teller meer. Stelt de gebruiker A opnieuw uit en verloopt die termijn ook, dan komt er een nieuw bericht.',
    assertion: {
      kind: 'exact',
      expected: 'berichten=postponed_tip_A_2026-09-12; url=/overzicht/tips',
      source: 'lib/notifications/tip-terug.ts#buildTipTerugNotifications (echte import) — zie will-checks.ts',
    },
  },
  {
    workflow: 'WF-WILL-07',
    scenarioId: 'UAT-WILL-07',
    titel: '"Bespreek met Fin" vanaf een onderwerp elders in de app',
    kriticiteit: 'BELANGRIJK',
    given: 'Persona met alle in-depth apps actief; een "Bespreek met Fin"-knop bij een fase-analyse of vaste-lasten-analyse.',
    when: 'De gebruiker klikt de knop (en klikt snel nogmaals).',
    then: 'De chat opent met het kick-off-bericht (onderwerp + toelichting) al verstuurd; een tweede snelle klik verstuurt niet nogmaals hetzelfde bericht (one-shot-guard).',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/chat/bespreek-met-fin-button.tsx + openWithMessage (chat-provider.tsx) — procestoets, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-WILL-08',
    scenarioId: 'UAT-WILL-08',
    titel: 'Chat starten via een ?prompt=-deeplink',
    kriticiteit: 'OVERIG',
    given: 'Ingelogde gebruiker, chat gesloten.',
    when: 'De gebruiker opent een URL met `?prompt=analyseer-mijn-financien`, `?prompt=herbekijk-uitgesteld` of een onbekende sleutel.',
    then: 'De twee bekende sleutels openen de chat met de bijbehorende kick-off-vraag al verstuurd en schonen de URL op (geen herhaalde verzending bij herladen); een onbekende sleutel doet niets (geen fout, chat blijft dicht).',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/chat/chat-prompt-deeplink.tsx — procestoets, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-WILL-09',
    scenarioId: 'UAT-WILL-09',
    titel: 'Foutherstel in de chat',
    kriticiteit: 'BELANGRIJK',
    given: 'Het GLOBALE platform-kill-switch uit via /beheer/platform (`killSwitches.ai`, admin-breed, deterministisch forceerbaar) — te onderscheiden van de EIGEN "AI uit"-knop van de gebruiker op /mijn/privacy (`profiles.ai_enabled`), die sinds bevinding M26 chat al vóór het versturen blokkeert (zie WF-WILL-25). Breed tier-gate-effect over alle AI-oppervlakken hoort bij UAT-KRUIS-25, hier alleen het chat-oppervlak.',
    when: 'De gebruiker stelt een vraag terwijl de AI is uitgeschakeld, en klikt daarna "Opnieuw proberen" (na AI weer aan) of "Sluiten".',
    then: 'Rode foutbanner met een begrijpelijke uitleg in gebruikerstaal — géén beheerderstaal (nooit "controleer de API-sleutel"/"Admin instellingen") en géén rauwe serverfout. Bij een uitgezette kill-switch luidt de melding dat Fin voor onderhoud uit staat en verschijnt er BEWUST geen "Opnieuw proberen" (die kan niet slagen), alleen "Sluiten". Bij een tijdelijke storing/time-out verschijnt "Opnieuw proberen" wél en genereert die na herstel alsnog een antwoord. Bubbel en paneel blijven bruikbaar; "Sluiten" verwijdert de banner.',
    assertion: {
      kind: 'ui-only',
      source: 'lib/ai/error-copy.ts (code → tekst + affordance) + components/app/chat/chat-panel.tsx (describeAiThrown) + app/api/ai/chat/route.ts (AI_TIMEOUT_MS=60s; 422/401/403/429 mét stabiele code) — procestoets, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-WILL-10',
    scenarioId: 'UAT-WILL-10',
    titel: 'Meldingen checken via de bel',
    kriticiteit: 'BELANGRIJK',
    given: 'Drie budgetten naast elkaar: "Boodschappen" (limiet €380, besteed €320), "Huur" precies op de grens (limiet €1280, besteed €1280) en "Huur" nét eroverheen (limiet €1279,80, besteed €1280,40) — alle expense-type met alert_threshold 80%.',
    when: 'De gebruiker opent de bel-modal.',
    then: 'Drie drempeltakken, drie verschillende antwoorden (bevinding H16). ONDER: 84% → "Boodschappen: 84% besteed", "€320 van €380 — nog €60 over (drempel: 80%)", amber, priority 2. BEREIKT (besteed = limiet, op de cent): "Huur: limiet bereikt", "€1280 van €1280 — precies op de grens, niets meer over", amber, priority 3 — dus BUITEN de Dringend-bak (priority ≤ 2), want er is niets overschreden. OVER (besteed > limiet): "Huur: 100% — over budget", rood, priority 1; en omdat beide bedragen op hele euro\'s samenvallen toont de omschrijving centen ("€1280,40 van €1279,80 — budget overschreden") in plaats van tweemaal "€1280". Bij ≥120% wordt de titel "… — flink over budget". VIERDE TAK, BEWUST ZONDER MELDING (melding B-032, 08-09-2026): een budget met een begroting van NUL waar wél op geboekt is levert GÉÉN melding, ook niet nu de weergave-klemfamilie zo\'n budget wél als vol/overschreden toont. `shouldAlert` en de vroege `if (limit <= 0) return` in `pushBudgetNotification` blijven op "vereist een ingestelde limiet" staan — de grens is weergave ≠ melding: een balk die je opzoekt moet de waarheid tonen, maar iemand ongevraagd aanspreken op een categorie die hij nooit begroot heeft is ruis. Hetzelfde geldt voor de actiekaart die uit `budgetsOverLimit` volgt. Verschijnt hier na deze wijziging tóch een bel-melding over een niet-begrote categorie, dan is dat de regressie; de nul-limiet-weergave zelf wordt getoetst in WF-BUDGET-28.',
    assertion: {
      kind: 'exact',
      expected: 'onder: titel=Boodschappen: 84% besteed; omschrijving=€320 van €380 — nog €60 over (drempel: 80%); priority=2 || bereikt: titel=Huur: limiet bereikt; omschrijving=€1280 van €1280 — precies op de grens, niets meer over; priority=3 || over: titel=Huur: 100% — over budget; omschrijving=€1280,40 van €1279,80 — budget overschreden; priority=1',
      source: 'app/api/notifications/route.ts#pushBudgetNotification (drie drempeltakken via lib/budget-alerts.ts#budgetLimitStatus + #shouldAlert) — zie will-checks.ts',
    },
  },
  {
    workflow: 'WF-WILL-11',
    scenarioId: 'UAT-WILL-11',
    titel: 'Het berichtencentrum bekijken en opruimen (/berichten)',
    kriticiteit: 'BELANGRIJK',
    given: 'Synthetische 30-dagenlijst van 5 meldingen: 3 met read=false, 2 met read=true.',
    when: 'De gebruiker opent /berichten en leest de meta-regel "N ongelezen".',
    then: 'N = 3 (aantal items met read=false in het venster) — moet exact overeenkomen met de bel-badge (WF-WILL-10) op hetzelfde moment (dezelfde teller, A=B-eis).',
    assertion: {
      kind: 'exact',
      expected: 'ongelezenCount=3',
      source: 'app/api/notifications/route.ts (ongelezen-teller = read=false binnen het 30-dagenvenster, gemirrord) — zie will-checks.ts',
    },
  },
  {
    workflow: 'WF-WILL-12',
    scenarioId: 'UAT-WILL-12',
    titel: 'Een melding opvolgen: doorklikken of Fin vragen',
    kriticiteit: 'BELANGRIJK',
    given: 'Een ongelezen budgetmelding in de bel/berichtencentrum.',
    when: 'De gebruiker klikt op de melding zelf, of op de knop "Vraag Fin".',
    then: 'Klik op de melding: gelezen gemarkeerd + navigatie naar de bestemmings-URL (indien aanwezig). Klik "Vraag Fin": gelezen gemarkeerd, paneel sluit, chat opent met een voorgeformuleerde vraag die het percentage/bedrag noemt. Legacy-actionUrl-doelen (/core/budgets, /core/cash, /horizon) moeten per doorklik op werkend/redirect/dood gecontroleerd worden (genoteerd risico).',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/notifications/notification-item.tsx (handleClick/handleAskAI) — navigatie/chat-start, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-WILL-13',
    scenarioId: 'UAT-WILL-13',
    titel: 'Notificatievoorkeuren laten doorwerken op bel en berichtencentrum',
    kriticiteit: 'BELANGRIJK',
    given: 'Meldingen van type "briefing" en "budget"; voorkeuren `{ briefing: false }` resp. `{}` (alles aan).',
    when: 'De GET-filter past de voorkeuren toe op een melding van elk type.',
    then: 'Een melding is zichtbaar dan en slechts dan wanneer `prefs[type] !== false` — "briefing" met `false` wordt verborgen, "budget" (geen expliciete `false`) blijft zichtbaar; weer aanzetten maakt de melding (incl. oude, reeds ontvangen) weer zichtbaar zonder de 30-dagenhistorie te wissen.',
    assertion: {
      kind: 'exact',
      expected: 'briefingZichtbaar=false; budgetZichtbaar=true',
      source: 'app/api/notifications/route.ts r929/r991 (prefs[n.type] !== false, gemirrord) — zie will-checks.ts',
    },
  },
  {
    workflow: 'WF-WILL-14',
    scenarioId: 'UAT-WILL-14',
    titel: 'De wekelijkse briefing-melding ontvangen en de briefing lezen',
    kriticiteit: 'BELANGRIJK',
    given: 'Twee tijdstippen in dezelfde ISO-week (Amsterdam) en één tijdstip in de volgende week.',
    when: 'De week-key wordt voor alle drie berekend.',
    then: 'De twee tijdstippen in dezelfde week leveren dezelfde week-sleutel (dus maximaal één melding per week — herhaald pollen maakt geen tweede); het tijdstip in de volgende week levert een andere sleutel.',
    assertion: {
      kind: 'exact',
      expected: 'zelfdeWeek=true; volgendeWeekAnders=true',
      source: 'lib/briefing/snapshot.ts#amsterdamWeekKey — echte productiefunctie, geen mirror',
    },
  },
  {
    workflow: 'WF-WILL-15',
    scenarioId: 'UAT-WILL-15',
    titel: 'De persoonlijke krant openen en lezen (/nieuws)',
    kriticiteit: 'BELANGRIJK',
    given: 'Gebruiker zonder eerdere edities (hoogste bestaand edition_nr = 0/geen); huidig kalenderjaar 2026.',
    when: 'De gebruiker opent /nieuws voor het eerst.',
    then: 'Editienummer = 0 + 1 = 1; jaargang = 2026 − 2025 = 1. Colofon "N artikelen"/"M bronartikelen" zijn directe lengtes van de editie resp. het getoetste bronmateriaal (geen aparte formule). De artikeltekst zelf is AI-inhoud, niet deterministisch toetsbaar.',
    assertion: {
      kind: 'exact',
      expected: 'editionNr=1; jaargang=1',
      source: 'app/api/news/route.ts#getNextEditionNr + jaargang-formule (r136-145, r172-173, gemirrord) — zie will-checks.ts',
    },
  },
  {
    workflow: 'WF-WILL-16',
    scenarioId: 'UAT-WILL-16',
    titel: 'De krant verversen binnen de weeklimiet',
    kriticiteit: 'BELANGRIJK',
    given: 'Weeklimiet 3 (default `news_max_refreshes_per_week`); 0 edities gearchiveerd in de afgelopen 7 dagen, daarna 1, 2 en 3.',
    when: 'De gebruiker ververst achtereenvolgens.',
    then: 'Resterend na 0/1/2/3 verversingen = 3/2/1/0; bij 3 (limiet bereikt) is de knop uitgeschakeld en een vierde verzoek krijgt server-side 429 ("Je hebt het maximale aantal verversingen bereikt (3 per week)…").',
    assertion: {
      kind: 'exact',
      expected: 'resterend0=3; resterend1=2; resterend2=1; resterend3=0',
      source: 'app/api/news/route.ts#checkRefreshLimit (r245-266, gemirrord) — zie will-checks.ts',
    },
  },
  {
    workflow: 'WF-WILL-17',
    scenarioId: 'UAT-WILL-17',
    titel: 'Het krantenarchief doorbladeren',
    kriticiteit: 'OVERIG',
    given: 'Jaargang 1 (de eerste kalenderjaar-jaargang, 2026); archief bewaart maximaal 50 edities.',
    when: 'De gebruiker opent het archief en leest de jaargang-groepskop.',
    then: 'Groepskop-jaartal = 2025 + jaargang(1) = 2026 ("Jaargang 1 (2026)"); archief-artikelen tonen geen actieknoppen en geen gelezen-dimming (read-only); bij > 50 edities wordt de oudste verwijderd.',
    assertion: {
      kind: 'exact',
      expected: 'jaargangJaartal=2026; maxEdities=50',
      source: 'components/berichten/archive-section.tsx (jaargang-jaartal = 2025+jaargang) + app/api/news/route.ts#archiveCurrentEdition (max 50, gemirrord) — zie will-checks.ts',
    },
  },
  {
    workflow: 'WF-WILL-18',
    scenarioId: 'UAT-WILL-18',
    titel: 'Een nieuwsartikel met Fin bespreken',
    kriticiteit: 'BELANGRIJK',
    given: 'Een artikel op de huidige editie van /nieuws (niet het archief).',
    when: 'De gebruiker klikt "Bespreek met Fin".',
    then: 'De chat opent met een al-verstuurd bericht (kop + samenvatting + nieuws-zoeklink); het artikel wordt als gelezen gemarkeerd; op het archief (read-only) is de knop niet aanwezig.',
    assertion: {
      kind: 'ui-only',
      source: 'components/berichten/news-components.tsx (handleDiscuss) + openWithMessage — procestoets, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-WILL-19',
    scenarioId: 'UAT-WILL-19',
    titel: 'Een actie maken vanuit een nieuwsartikel',
    kriticiteit: 'KERN',
    given: 'Een artikel met impactType "direct", impactscore 4, deadline "2026-08-01".',
    when: 'De gebruiker klikt "Maak actie".',
    then: 'De aangemaakte actie krijgt `priority_score` = 4 (de impactscore), `due_date` = "2026-08-01", `freedom_days_impact` = 0 (altijd, ongeacht impactscore) — de actie toont dus expliciet "+0 dagen" op /overzicht/tips (bewust: nieuws-impact wordt niet automatisch in vrijheidsdagen vertaald). Zonder impactscore valt priority_score terug op 3.',
    assertion: {
      kind: 'exact',
      expected: 'priorityScore=4; freedomDaysImpact=0; priorityScoreFallback=3',
      source: 'components/berichten/news-components.tsx#handleCreateAction (r123-138, gemirrord) — zie will-checks.ts',
    },
  },
  {
    workflow: 'WF-WILL-20',
    scenarioId: 'UAT-WILL-20',
    titel: '"Minder hierover"-feedback op een nieuwsartikel geven',
    kriticiteit: 'BELANGRIJK',
    given: 'Feedback-rijen (verdict "less") op categorie "macro": 1 rij binnen 90 dagen, dan een 2e rij binnen 90 dagen, en apart een categorie "wonen" met 1 rij ouder dan 90 dagen.',
    when: 'De demotie-check draait over deze rijen.',
    then: '"macro" is pas gedemoveerd bij ≥2 stemmen binnen het 90-dagenvenster (na de 1e rij nog niet, na de 2e wel); "wonen" met slechts 1 rij ouder dan 90 dagen telt niet mee en is niet gedemoveerd. Drempel is niet zichtbaar als cijfer in de UI, wel deterministisch server-side.',
    assertion: {
      kind: 'exact',
      expected: 'macroNa1=false; macroNa2=true; wonenGedemoveerd=false',
      source:
        'lib/news-feedback-summary.ts#demotedCategories + #demotionWindowStartIso (ADR 0113, drempel ≥2/90 dagen — de ene canonieke implementatie die zowel app/api/news/route.ts als het beheervenster op /beheer/nieuws consumeert; direct pure import, geen mirror meer) — zie will-checks.ts',
    },
  },
  {
    workflow: 'WF-WILL-23',
    scenarioId: 'UAT-WILL-23',
    titel: 'Een lokaal (privacy-modus) actievoorstel uit de chat toevoegen',
    kriticiteit: 'BELANGRIJK',
    given:
      'Privé-modus aan (on-device Fin actief, lokale-ai-strip zichtbaar); het lokale antwoord bevat een fenced `fin-actie`-blok. NB: op moment van vastleggen emit het huidige on-device model dit blok nog niet spontaan (volgt via de skill `lokale-prompt-parity`/promptronde) — het pad zelf (transport → UI → schrijven) is al volledig gebouwd en moet bij de eerstvolgende live-run al meegenomen worden.',
    when:
      'De generatie stopt. Bij een titel die canoniek matcht in het LocalChatOverview verschijnt een `data-finActie`-part met dezelfde ActionSuggestionCard als het cloud-pad (WF-WILL-03); bij een parse-miss (geen blok) of een niet-matchende titel verschijnt géén kaart. De gebruiker klikt "+ Toevoegen" (en eventueel nogmaals).',
    then:
      'Alleen bij een canonieke match toont de kaart de titel + de CANONIEKE "+X dagen vrijheid"/euro-impact — uit LocalChatOverview resolved, NOOIT de modelcijfers zelf. Bij parse-miss of geen match verschijnt niets (fail-closed, geen foutmelding, het fence-blok is al uit de zichtbare tekst gestript). De actie wordt pas geschreven bij de klik op "+ Toevoegen" — nooit automatisch bij streaming-einde — via POST /api/ai/actions met het bron-veld op "chat" en metadata.origin op "local-chat" (own-row RLS, dezelfde route als het cloud-pad). Herhaald klikken dedupliceert op de stabiele intent-hash (`finActionIntentHash`), identiek aan de dubbelklik-guard van WF-WILL-03. Regressie: het cloud-tool-call-pad (WF-WILL-03) blijft ongewijzigd functioneel naast dit lokale pad.',
    assertion: {
      kind: 'ui-only',
      source:
        'lib/ai/local/local-chat-transport.ts (parseFinActionIntent/resolveFinActionIntent/finActionIntentHash — fail-closed bij parse-miss/geen canonieke match) + components/app/chat/chat-panel.tsx (data-finActie-rendering, handleAddAction met metadata.origin op "local-chat") + app/api/ai/actions/route.ts (metadata vrije record, het bron-veld op waarde "chat") — procestoets: de canonieke cijfers zelf zijn deterministisch resolved, maar of/wanneer het model een blok emit is niet hand-forceerbaar in UAT',
    },
  },
  {
    workflow: 'WF-WILL-24',
    scenarioId: 'UAT-WILL-24',
    titel: 'Een melding maken vanuit de chat (bug/vraag/wens)',
    kriticiteit: 'BELANGRIJK',
    given:
      'Een ingelogde gebruiker (met of zonder AI-abonnement — meldmodus staat bewust BUITEN alle AI-gates) heeft de chat open en klikt de megafoon-toggle. Op de achtergrond geldt een rem van 5 meldingen per rollend uur per gebruiker, afgedwongen in de RPC `public.reserve_user_report_slot` (advisory lock, dus race-vrij).',
    when:
      'De gebruiker kiest een type (bug/vraag/aanbeveling), vult het formulier in — bug/vraag verplicht een scherm, een aanbeveling juist NIET (en toont geen scherm-/verwachting-/toestemmingsveld) — voegt optioneel een screenshot toe (PNG/JPEG/WebP tot 4 MB) en verstuurt. GEWIJZIGD 12-09-2026 (melding W-008): de bijlage kan nu bij ÉLK van de drie types, ook bij een aanbeveling; tot die datum gaf een wens mét screenshot een 400. De drie ándere aanbeveling-beperkingen (geen scherm, geen verwachting, geen toestemmingsvraag) staan ongewijzigd — die gaan over de vorm van het bericht, niet over de bijlage. Omdat een aanbeveling geen toestemmingsblok heeft, en de zin over waar de bijlage heen gaat juist DAAR stond, draagt het afbeeldingsveld bij dit type zijn eigen korte regel ("… gaan mee naar onze werklijst"). Tijdens het versturen probeert hij te sluiten (kruisje of mobiele backdrop) of de megafoon nogmaals te klikken.',
    then:
      'Sluiten en de megafoon-toggle zijn geblokkeerd zolang de verzending loopt (`meldingBezig`) — geen halve/dubbele melding. Dit geldt sinds deze release ook voor het NIEUWE swipe-down-gebaar op mobiel (het paneel deelt `useSwipeToDismiss` met BottomSheet, zie WF-NAV-21): de hook wordt met `enabled: !isPinned && !meldingBezig` aangeroepen, dus wegslepen tijdens een lopende verzending sluit het paneel niet — consistent met de bestaande sluit-blokkade. Gepind (desktop-zijbalk) is het swipe-gebaar sowieso nooit actief. Het gesprek zelf (useChat-state) blijft intact wanneer de gebruiker terug naar chatmodus schakelt; de melding wordt pas geschreven bij "versturen", nooit tussentijds. DEZELFDE EIS GELDT SINDS ADR 0137 VOOR ALLE VIER DE PANEELMODI: `mode` is één state (`chat | melding | gids | gesprekken`) en het gesprek leeft ernaast, dus ook het openen én weer sluiten van de gesprekkenlijst (WF-WILL-27) laat de lopende `useChat`-state ongemoeid — geen herstart, geen verloren beurten, geen extra rij in een rug. Alleen "Nieuw gesprek" (WF-WILL-28) en "Hervatten" (WF-WILL-27) klappen de conversatie bewust om; elke andere modusknop is puur een venster. Regressie-indicator: schakel je melding→chat→gesprekken→chat, dan staan alle eerdere beurten er nog en begint het antwoord op de volgende vraag niet op seq 0. Bij een 6e melding binnen het lopende uur wijst de server het verzoek af (HTTP 429, Nederlandse foutmelding "al veel meldingen... probeer het over een uur"); de eerste 5 lukken. Server-side validatie (zod) geeft bij een ontbrekend scherm op bug/vraag, een te korte omschrijving (<5 tekens) of een niet-toegestaan veld bij een aanbeveling een Nederlandse foutmelding, nooit de rauwe zod-tekst. Bij succes toont de meldmodus een bevestigingsstap; de rij komt eerst in Supabase (`user_reports`) te staan en pas daarna, best-effort, als Notion-kaartje — een falende Notion-push verliest de melding dus niet en wordt de volgende dag door de cron (UAT-BEHEER-31 → `/beheer/jobs`, job "Meldingen → Notion-sync") opnieuw geprobeerd. Sinds deze release geldt op het kaartje (niet op het formulier) een inhoudsdrempel: een melding met een omschrijving onder de 10 tekens ("test", "asdf") krijgt bewust géén Notion-kaartje — de rij blijft `pending` in Supabase (niets gaat verloren) en de cron telt haar als `skipped_leeg`, niet als `failed`. Kaartjes die wél doorgaan dragen een volgnummer-prefix in de titel (`B-001`/`V-004`/`W-012` — bug/vraag/wens), afgeleid geteld uit de eerdere meldingen mét inhoud van dezelfde soort; mislukt die telling, dan gaat het kaartje zonder nummer mee.',
    assertion: {
      kind: 'ui-only',
      source:
        'components/app/chat/chat-panel.tsx (megafoon-toggle, veiligSluiten/meldingBezig-blokkade, useSwipeToDismiss({enabled: !isPinned && !meldingBezig}), de vier-modi-state `mode` waarnaast het gesprek zelfstandig leeft) + lib/hooks/use-swipe-to-dismiss.ts + components/app/chat/melding/melding-view.tsx + melding-form.tsx + melding-type-kiezer.tsx + app/api/user-reports/route.ts (ReportSchema/zod-validatie, dutchValidationMessage, RPC reserve_user_report_slot voor de 5/uur-rem, best-effort pushReportToNotion) + app/api/cron/user-reports-notion-sync/route.ts (retry-cron, telt `skipped_leeg`) + lib/user-reports/notion.ts (hasMeaningfulDescription-inhoudsdrempel, reportSequenceNumber/volgnummer-prefix) — procestoets/randvoorwaarden, geen AI-inhoud',
    },
  },
  {
    workflow: 'WF-WILL-25',
    scenarioId: 'UAT-WILL-25',
    titel: 'Chat blokkeert vóóraf (beide bestemmingen) als de gebruiker AI zelf heeft uitgezet',
    kriticiteit: 'KERN',
    given:
      'Bevinding M26 (26-08-2026). `profiles.ai_enabled` (de knop "AI uit" op /mijn/privacy — de EIGEN keuze van de gebruiker, geen abonnements- of toestelbeperking) staat uit; de AI-groep van deze gebruiker staat op `cloud` (de default voor vrijwel elk account). Dit is een ANDER mechanisme dan het globale platform-kill-switch uit WF-WILL-09 (`/beheer/platform` → `killSwitches.ai`, admin-breed) — beide kunnen onafhankelijk van elkaar aan/uit staan.',
    when:
      'De gebruiker opent de chat. VOORHEEN gaf `useExecutionMode` bij `prefs.mode === "cloud"` meteen `canUseCloud: true` terug, ongeacht `ai_enabled` — de kill-switch-check stond code-technisch ná de cloud-tak. Chat was dan volledig bruikbaar, een bericht kon verstuurd worden en de server wees het pas ná verzending af (`assertCloudAllowed` → 403 `ai_disabled`) — inclusief een echt AI-antwoord vóór de fix bestond.',
    then:
      'De kill-switch-check is gehoist vóór de cloud-tak in `useExecutionMode`: `status` wordt `blocked` met `reason: "ai_uit"` en `intended` op de bestemming die de gebruiker anders had gekregen (`prefs.mode`, hier `cloud`) — vóór het typen, niet ná het versturen. `LocalBlockedNotice` toont bij `reason === "ai_uit"` de kop "AI staat uit" (niet "Lokale chat nog niet klaar", want het gaat niet over het lokale pad) met de tekst `AI_DISABLED_MESSAGE`, die sinds deze fix BEIDE bestemmingen noemt ("niet in de cloud en niet op je eigen toestel") in plaats van alleen "ook niet op je eigen toestel". Precies dezelfde blokkade gold al vóór de fix voor een gebruiker op `mode: "lokaal"` (`intended: "lokaal"`) — dat pad regresseert niet. De server-kant (`assertCloudAllowed`) blijft de laatste linie en verandert niet; deze hoisting is de client-spiegel zodat de blokkade vóór het gesprek zichtbaar is in plaats van als foutbanner erna (dat laatste blijft WF-WILL-09, voor het GLOBALE kill-switch-pad). DEZELFDE SERVER-SPIEGEL landt tegelijk op twee andere routes die zelf geen kill-switch-check hadden (de nieuwe, generieke `assertAiEnabled(supabase, user.id)`-poort, vóór elke andere AI-gate): `app/api/briefing/refresh/route.ts` (de lokale stappen lazen alleen `isCloudAllowed`, wat bij AI-uit ook `false` gaf maar zonder de juiste reden) en `app/api/calculators/publish/route.ts` (zonder de gate adviseerde de foutmelding "zet je rapporten-groep op cloud-AI" — een uitweg die bij AI-uit niet bestaat, want die blokkeert cloud én lokaal). Beide waren gemarkeerd als "nieuw/ongedekt oppervlak" door de staleness-detector, maar zijn geen apart scenario: het is dezelfde M26-poort, drie keer toegepast.',
    assertion: {
      kind: 'ui-only',
      source:
        'lib/ai/local/use-execution-mode.ts (kill-switch-check gehoist vóór de cloud-tak, `reason: "ai_uit"`, `AI_DISABLED_MESSAGE`) + components/app/chat/chat-panel.tsx#LocalBlockedNotice (kop "AI staat uit" bij `reason === "ai_uit"`) + app/api/ai/chat/route.ts (assertCloudAllowed, server-laatste-linie, ongewijzigd) + lib/ai/privacy-gate.ts#assertAiEnabled (nieuwe, groepsloze poort) + app/api/briefing/refresh/route.ts + app/api/calculators/publish/route.ts (dezelfde poort, twee andere routes) — gedekt door lib/ai/local/use-execution-mode.test.ts + lib/ai/privacy-gate.test.ts; procestoets/randvoorwaarden, geen AI-inhoud',
    },
  },
  {
    workflow: 'WF-WILL-26',
    scenarioId: 'UAT-WILL-26',
    titel: 'Fin herinnert aan de volgende gidsstap',
    kriticiteit: 'BELANGRIJK',
    given:
      'ADR 0130 fase 2. De welkomstgids loopt nog (status "active", minstens één open stap) en woont sinds datzelfde besluit in Fin — niet meer als banner op /overzicht. De gebruiker heeft vandaag nog geen gids-bubbel gezien (`profiles.module_guide_state["coach:state"].guideLastShownAt` leeg of van gisteren). Testaccount met een open stap "Zijn al je bezittingen geregistreerd?" (bestemming /overzicht/bezittingen).',
    when:
      'De gebruiker navigeert naar /overzicht/bezittingen, daarna naar /overzicht/bezittingen/investment, daarna naar /toekomst, en opent tussendoor een sheet. Vervolgens klikt hij op de melding het kruisje (of de knop "Bekijk in de gids"), en bezoekt de pagina later op dezelfde dag nog eens.',
    then:
      'ROUTE-GEBONDEN: de bubbel verschijnt uitsluitend op /overzicht/bezittingen — de match is EXACT op pathname (query gestript), dus de subroute /overzicht/bezittingen/investment toont hem niet. Op /toekomst verschijnt hij nooit (daar staan de uitleg-ballonnen). Zolang de gids loopt VERVANGT de gidsstap de data-gap-tip: op een route zonder gidsstap komt er dus géén data-gap-melding, maar valt de selectie door naar de pad-/default-tip. Bezoekstappen ("bekijk je nieuws") worden nooit proactief genoemd — die vinken zichzelf af zodra je er bent. MAX ÉÉN PER DAG: na de eerste verschijning stempelt de app `guideLastShownAt` en zwijgt Fin over de gids tot de volgende lokale kalenderdag; herhaald bezoek diezelfde dag levert hoogstens de gewone pad-tip. Stempelen gebeurt pas bij het ECHT verschijnen — tijdens de rondleiding of achter een open overlay/immersieve route zwijgt Fin en verbruikt de stap zijn dag niet. KRUISJE = DIE STAP STIL: het kruisje schrijft `guide_<stap-id>` naar de weggeklikte sleutels (server-side, dus cross-device) en Fin noemt morgen de vólgende open stap; vanzelf wegglijden (auto-dismiss) doet dat NIET — dan blijft de stap op de lijst en gaat alleen de dag om. CTA: een stap zonder deeplink opent de gidsweergave in Fin ("Bekijk in de gids"), een stap mét query behoudt zijn deeplink. Beheer kan de laag in één klik uitzetten (/beheer/coach, regel "guide"); dan vervalt óók de vervanging van de data-gaten en keert het gedrag van vóór ADR 0130 terug.',
    assertion: {
      kind: 'ui-only',
      source:
        'lib/welcome-guide.ts#openGuideSteps/guideStepMatchesRoute/isProactiveGuideStep + lib/coach-suggestions.ts#getFirstUndismissedSuggestion (gids-laag, order 2, GUIDE_BUBBLE_EXCLUDED_ROUTES) + lib/hooks/use-coach-suggestion.ts (dagregel via isSameLocalDay, stempel bij verschijnen, kruisje vs. auto) + components/app/fin/fin-home.tsx#handleCta (openGids bij een stap zonder deeplink) + app/api/coach-state (PUT guideShown/dismiss) — gedekt door lib/welcome-guide.test.ts, lib/coach-suggestions.test.ts, lib/hooks/use-coach-suggestion.test.ts en components/app/fin/fin-home.test.tsx; in de live-run een PROCEStoets (verschijnt hij op de juiste pagina, en precies één keer), geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-WILL-27',
    scenarioId: 'UAT-WILL-27',
    titel: 'Een gesprek bewaren en later hervatten',
    kriticiteit: 'KERN',
    given:
      'ADR 0137 (melding W-004). Opslagkeuze staat op de default `account` en Fin draait in de cloud, dus `resolveBackend("account", "cloud")` = `server`. De gebruiker heeft de chat open, stelt een eerste vraag en krijgt een antwoord; het gesprek wordt LUI aangemaakt — pas bij die eerste beurt ontstaat er een rij, een leeg geopend paneel schrijft niets. De titel komt uit de eerste vraag (`chatTitelUitVraag`), niet uit het model. Daarna: pagina herladen.',
    when:
      'De gebruiker herlaadt, opent de chat, klikt de gesprekkenknop in de chatheader (de vierde paneelmodus, achter dezelfde Wft-gate als de lijst zelf), kiest het gesprek van zojuist, en stelt een vervolgvraag. Apart geval: dezelfde handeling terwijl het laden van de berichten faalt (netwerk uit).',
    then:
      'De lijst toont het gesprek met zijn afgeleide titel en een relatieve datum; een gesprek dat op dit toestel woont draagt een "lokaal"-chip, een servergesprek niet. Bij hervatten worden EERST de berichten geladen en pas DAARNA klapt de conversatie om — in één zetting, zodat er geen render bestaat waarin de nieuwe id de oude berichten draagt. Het transcript staat er compleet; is het gesprek tegen de bewaargrens aangelopen, dan meldt één regel bovenaan dat eerdere berichten niet bewaard zijn. Het vervolgnummer (`seq`) komt van de RUG (`meta.nextSeq`, ondergrens = hoogste geladen seq + 1) en wordt NOOIT door de client opgeteld — anders wordt een beurt na een afgebroken fetch stil weggegooid door de `ON CONFLICT … DO NOTHING` van de RPC. Hernoemen gebeurt inline in de regel (Escape annuleert alléén het hernoemen, niet het paneel), verwijderen is een tweestap ín de regel, zonder aparte overlay. FAALT HET LADEN, DAN WORDT ER NIET HERVAT: de gebruiker blijft in de lijst staan en ziet een `role="alert"`-foutregel ("Dit gesprek kon niet worden opgehaald…") — een half hervat gesprek is erger dan geen, want dat schrijft de volgende beurt op een bezette seq. DE VERZONDEN HISTORIE IS BEGRENSD: per cloud-beurt gaan maximaal 20 berichten (10 beurten) mee naar het model, en het venster schuift altijd dóór tot een user-bericht — de eerste beurt die de provider ziet moet van de gebruiker zijn.',
    assertion: {
      kind: 'exact',
      expected: 'titel=Hoeveel vrijheidstijd levert het op als ik mijn hypotheek…; kortOngewijzigd=Wat kost mijn auto?; venster25=19; vensterStartRol=user',
      source:
        'lib/chat/history-copy.ts#chatTitelUitVraag (echte productiefunctie, geen mirror) + components/app/chat/chat-panel.tsx (MAX_VERZONDEN_BERICHTEN=20 en `verzendVenster`, gemirrord) + lib/chat/history/facade.ts + lib/chat/history/server-store.ts + lib/chat/history/device-store.ts + components/app/chat/gesprekken/gesprekken-lijst.tsx + app/api/chat/conversations/route.ts + app/api/chat/conversations/[id]/messages/route.ts — zie will-checks.ts',
    },
  },
  {
    workflow: 'WF-WILL-28',
    scenarioId: 'UAT-WILL-28',
    titel: 'Een nieuw gesprek beginnen zonder het oude te verliezen',
    kriticiteit: 'BELANGRIJK',
    given:
      'ADR 0137. Een lopend gesprek met minstens één beantwoorde beurt, opslagkeuze `account` of `apparaat` (bij `uit` bestaat er niets om te bewaren en is dit scenario leeg). De gesprekkenlijst is open.',
    when:
      'De gebruiker klikt "Nieuw gesprek", stelt daar een eerste vraag, opent opnieuw de lijst en hervat het oorspronkelijke gesprek.',
    then:
      'Het nieuwe gesprek begint NAAST het oude, niet in plaats ervan: het oude blijft in de lijst staan met zijn eigen titel en beurten, en is daarna volledig te hervatten. De nieuwe conversatie is LUI — zolang er niets gestuurd is bestaat er geen rij, dus tien keer "Nieuw gesprek" klikken levert geen tien lege gesprekken. De lijst is aflopend gesorteerd op laatste bericht, dus het zojuist beantwoorde gesprek staat bovenaan. Een verwijderd gesprek dat op dat moment het actieve is, laat het paneel netjes op een vers gesprek achter (geen paneel dat naar een niet-bestaande rug blijft schrijven). Cross-check met WF-WILL-24: het openen en sluiten van de lijst zelf raakt het lopende gesprek niet aan — alleen "Nieuw gesprek" en "Hervatten" klappen de conversatie om.',
    assertion: {
      kind: 'ui-only',
      source:
        'components/app/chat/chat-panel.tsx (`startNieuwGesprek`/`versGesprek`, lui aanmaken bij de eerste beurt, GesprekStand als één state) + components/app/chat/gesprekken/gesprekken-lijst.tsx (sortering, onActiefVerwijderd) — gedekt door components/app/chat/chat-panel.test.tsx en components/app/chat/gesprekken/gesprekken-lijst.test.tsx; procestoets, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-WILL-29',
    scenarioId: 'UAT-WILL-29',
    titel: 'De opslagkeuze voor gesprekken wijzigen (inclusief de "uit"-bevestiging)',
    kriticiteit: 'KERN',
    given:
      'ADR 0137. `profiles.chat_history_mode` staat op de default `account`. De keuze staat op TWEE bedieningen met ÉÉN tekstbron (`lib/chat/history-copy.ts#CHAT_HISTORY_OPTIES`): volledig op /mijn/privacy en compact in de chat-instellingen. De gebruiker heeft gesprekken op allebei de ruggen staan (server én dit apparaat).',
    when:
      'De gebruiker wisselt `account` → `apparaat` → terug, kiest daarna `uit`, en gebruikt in de bevestiging achtereenvolgens Annuleren, "Laat ze staan" en (in een tweede ronde) "Verwijder ze nu". Apart: de losse wisactie zonder de modus te wijzigen.',
    then:
      'EEN INSTELLING IS NOOIT EEN DESTRUCTIEVE HANDELING. Wisselen tussen `account` en `apparaat` verplaatst niets en wist niets: bestaande gesprekken blijven staan waar ze stonden, alleen NIEUWE gesprekken volgen de nieuwe keuze (`meta.backend` wordt bij het aanmaken afgeleid en ligt daarna vast). Alleen `uit` opent een bevestiging, en die heeft TWEE uitgangen die allebei even duidelijk zijn: "Laat ze staan" (modus uit, niets verwijderd) en "Verwijder ze nu" (modus uit én beide ruggen leeg). Annuleren — knop, Escape of backdrop — zet de instelling NIET om. De teller noemt altijd allebei de plekken ("X op je account en Y op dit apparaat") en de wisactie raakt ze allebei; mislukt het wissen op één van de twee, dan is de terugkoppeling een fout en geen groene bevestiging. Onder élke plek waar de keuze gemaakt wordt staat de vloerregel (`CHAT_HISTORY_VLOER_REGEL`), zodat de privacybelofte nooit naast een instelling staat die het tegendeel lijkt te zeggen. Een onbekende/kapotte waarde leest terug als `account` (`parseChatHistoryMode`), nooit als `uit` — stil stoppen met bewaren is de ergere fout.',
    assertion: {
      kind: 'ui-only',
      source:
        'components/mijn/chat-geschiedenis-instelling.tsx (bevestiging "uit" met de knoppen Annuleren/"Laat ze staan"/"Verwijder ze nu" in de sticky ShellOverlay-footer, teller over beide ruggen) + lib/chat/history-copy.ts (CHAT_HISTORY_OPTIES, CHAT_HISTORY_VLOER_REGEL, parseChatHistoryMode) + components/app/chat/chat-settings-popover.tsx (dezelfde keuze, compacte bediening) + app/api/chat/history-settings/route.ts + app/(app)/mijn/privacy/page.tsx — gedekt door components/mijn/chat-geschiedenis-instelling.test.tsx, components/app/chat/chat-settings-popover.test.tsx en app/api/chat/history-settings/route.test.ts; procestoets, geen cijfermatige uitkomst. De cijfermatige kern (welke rug volgt uit welke keuze) zit in WF-WILL-30.',
    },
  },
  {
    workflow: 'WF-WILL-30',
    scenarioId: 'UAT-WILL-30',
    titel: 'De privacyvloer: een lokaal gevoerd gesprek gaat nooit naar de server',
    kriticiteit: 'KERN',
    given:
      'ADR 0137, de vloer. `resolveBackend(mode, origin)` is de enige plek waar de opslagkeuze en de privacybelofte elkaar ontmoeten. Vier gevallen; het vierde is de reden dat de functie bestaat. De gebruiker staat op opslagkeuze `account` (dus servergesprekken) en heeft één cloudgesprek én één on-device gesprek bewaard.',
    when:
      'De gebruiker zet Fin op zijn eigen toestel (privé-modus) en hervat vanuit de gesprekkenlijst het CLOUDgesprek; daarna doet hij het omgekeerde (cloud aan, on-device gesprek hervatten). Ook: hij wisselt van bestemming terwijl er berichten staan.',
    then:
      'DE VIER GEVALLEN: `uit` → `geen` (ongeacht herkomst), `apparaat` → `apparaat`, `account`+cloud → `server`, en `account`+lokaal → `apparaat`. Dat laatste IS de vloer: een gesprek dat met de lokale AI gevoerd is gaat nooit naar onze server, ook niet wanneer de gebruiker "op mijn account" koos — dezelfde vloer staat een tweede keer in de database als `CHECK (origin = \'cloud\')` op `chat_conversations`, zodat een fout in de clientlaag geen stil lek kan worden. HERVATTEN OVER DE GRENS SPLITST: draait de chat nu ergens anders dan waar het gesprek gevoerd is, dan wordt het NIET hervat maar begint er een nieuw gesprek met een uitlegregel ("Dat gesprek is in de cloud gevoerd. Fin draait nu op je toestel, dus we beginnen hier opnieuw — het staat gewoon in je gesprekken.", en omgekeerd). Hetzelfde gebeurt bij een bestemmingswissel mét berichten in beeld. Er wordt in geen van beide richtingen iets van het oude transcript naar de andere rug geschreven. GEHEUGENLOOS HERVATTEN OP DE LOKALE AI: boven een hervat on-device transcript staat precies één regel — "Fin leest dit gesprek terug maar begint zonder geheugen. Verwijs je naar iets van hierboven, noem het dan kort even opnieuw." — omdat de on-device sessie vers is en de bewaarde beurten niet opnieuw door het model gaan.',
    assertion: {
      kind: 'exact',
      expected: 'uit+cloud=geen; uit+lokaal=geen; apparaat+cloud=apparaat; apparaat+lokaal=apparaat; account+cloud=server; account+lokaal=apparaat',
      source:
        'lib/chat/history/resolve.ts#resolveBackend (echte productiefunctie, geen mirror) + supabase/migrations/20260908120000_chat_gespreksgeschiedenis.sql (CHECK origin = cloud, de tweede afdwinging) + components/app/chat/chat-panel.tsx (`hervatGesprek` poort 1 = splitsen, `geheugenloosHervat`, de A9-bestemmingswissel) — zie will-checks.ts',
    },
  },
  {
    workflow: 'WF-WILL-31',
    scenarioId: 'UAT-WILL-31',
    titel: 'Suggestievragen in de lege staat van het gesprek',
    kriticiteit: 'BELANGRIJK',
    given:
      'ADR 0137 (D7). De lege staat van de chat is sinds deze release een ander scherm: naast de vaste chip "Geef me een tip" (het anker, roteert nooit) en de eventuele paginachip staan drie aantikbare volzin-suggesties met een "Andere vragen"-knop. De bron is één tabel van 105 records in `lib/chat/suggesties.ts`; de vijf oude hardcoded `CONTEXT_CHIPS` zijn daar letterlijk de eerste vijf records van, dus er is geen tweede lijst meer. Twee accounts: een LEEG account (alle `CoachDataGaps` false) en een gevuld account, allebei op /overzicht.',
    when:
      'De gebruiker opent de lege chat, leest de rij, klikt "Andere vragen", en tikt een suggestie aan.',
    then:
      'DE SELECTIE IS DETERMINISTISCH — geen `Math.random`: gelijke (pathname, databeeld, seed) geeft gelijke uitkomst, anders zou elke re-render van het paneel andere vragen tonen. Routegebonden suggesties gaan vóór generieke; is er niets routegebonden, dan vult de generieke pool volledig aan, zodat de rij nooit leeg is. DE DATAVEREISTE IS DE KERN: belooft een vraag een antwoord over JOUW cijfers, dan draagt hij de `CoachDataGaps`-sleutel die daarvoor nodig is, en op een leeg account blijven precies de uitlegvragen ("hoe werkt Box 3?", "sneeuwbal of lawine?") over — nooit "Hoeveel houd ik netto over van mijn volgende verdiende euro?" tegen iemand zonder inkomensgegevens. "Andere vragen" schuift een heel blok op (index `(seed × aantal + i) % pool.length`) i.p.v. één vraag te verwisselen, en verschijnt alleen wanneer er daadwerkelijk iets anders te tonen is (pool > 4). Aantikken verstuurt de volledige vraag als gewone gebruikersbeurt; de chip "Geef me een tip" blijft ongewijzigd de eerste en roteert niet mee.',
    assertion: {
      kind: 'exact',
      expected: 'aantalLeegAccount=3; alleZonderVereist=true; zelfdeSeedGelijk=true; andereSeedAnders=true; poolGroeitMetData=true',
      source:
        'lib/chat/suggesties.ts#selectSuggesties/#suggestiePoolGrootte (echte productiefuncties, geen mirror; CHAT_SUGGESTIES = 105 records, LEGE_DATA_GAPS) + components/app/chat/chat-panel.tsx#QuickActionChips (SUGGESTIE_AANTAL=3, GENERIC_PROMPT als vaste eerste chip, "Andere vragen" alleen bij pool > SUGGESTIE_AANTAL+1) — zie will-checks.ts',
    },
  },
  {
    workflow: 'WF-WILL-32',
    scenarioId: 'UAT-WILL-32',
    titel: 'Een vragenlijst invullen in de chat bij Fin (stoppen en later verdergaan)',
    kriticiteit: 'BELANGRIJK',
    given:
      'Een beheerder heeft op /beheer/vragenlijsten één actieve vragenlijst met vier vragen gezet (WF-BEHEER-14): een verplichte schaalvraag, een niet-verplichte open vraag, een meerkeuzevraag met "Anders, namelijk…" en een rangschikvraag. De testgebruiker heeft géén AI-abonnement nodig: in deze modus draait geen model.',
    when:
      '(a) De gebruiker opent de chat en kijkt naar de knoppen in de kop; (b) tikt het klembord-icoon, beantwoordt de schaalvraag, slaat de open vraag over en tikt "Later afmaken"; (c) opent de chat opnieuw en het icoon; (d) wijzigt een eerder antwoord, beantwoordt de rest en rondt af; (e) de beheerder zet de lijst inactief.',
    then:
      '(a) Het klembord-icoon ("Vragenlijst invullen") staat vóór de megafoon en verschijnt alleen zolang er een actieve lijst met minstens één vraag is. (b) Bij precies één lijst begint het invullen direct (geen keuzescherm); Fin stelt de vragen één voor één als chatbubbel met "Vraag N van 4", de gebruiker antwoordt eronder. Elk antwoord gaat meteen per vraag naar de server (POST /api/questionnaires/[id]/respond); "Overslaan" staat alleen bij een niet-verplichte vraag en bewaart niets. Een mislukte opslag toont "Je antwoord is niet opgeslagen. Controleer je verbinding en probeer het opnieuw." en gaat niet door. (c) Fin zegt "Welkom terug! Je had al 1 van de 4 vragen beantwoord." en gaat verder bij de eerste open vraag; in een keuzelijst (meer dan één lijst) staat "1 van 4 beantwoord · verder waar je was". (d) Een eerder antwoord is aan te passen (knop onder de eigen bubbel, "Annuleren" om terug te gaan); na afronden: "Dank je wel! Je antwoorden zijn bewaard en gaan naar het TriFinity-team, niet naar de AI." — de antwoorden verschijnen in de respons-sheet in beheer. (e) Inactief = het icoon is weg bij het volgende openen. Nergens komt een vragenlijstantwoord in een AI-context terecht. (f) Gerichte verspreiding (ADR 0147): staat de lijst op "handmatig" en is de testgebruiker niet gekozen, dan ziet hij het icoon niet en telt de badge bij Fin (nav-pill én desktop-bubbel) hem niet mee; is hij wél gekozen of matcht hij de regels, dan toont de badge het aantal lijsten dat hij nu kan invullen (cap 9+) en daalt dat alleen door afronden of "Niet meer vragen", niet door kijken. Staat de popup aan, dan verschijnt bij het eerstvolgende gebruik (na de rondleiding/Fins melding, hooguit één tegelijk) een bevestigingsoverlay met de titel, de regel "Je antwoorden gaan naar het TriFinity-team, niet naar de AI" en drie keuzes: "Nu invullen" opent Fin direct in díe lijst; "Later" = 7 dagen stil (server-side, ook op een ander apparaat) en na 2× definitief; "Niet meer vragen" = definitief weg uit badge en popup.',
    assertion: {
      kind: 'ui-only',
      source:
        'components/app/chat/chat-panel.tsx (modus `vragenlijst`, `toonVragenlijstKnop`) + components/app/vragenlijst/vragenlijst-signaal-provider.tsx (één bron: lijsten, teller, popupkandidaat) + vragenlijst-badge.tsx + vragenlijst-uitnodiging.tsx (popup, aandachtsregister ADR 0134) + components/app/chat/vragenlijst/vragenlijst-view.tsx (Keuze/Invullen, hervatten, wijzigen, afronden, `initieelId`) + app/api/questionnaires/route.ts (zichtbaarheid compute-on-read via lib/questionnaires/verspreiding.ts) + app/api/questionnaires/[id]/{session,respond,uitnodiging}/route.ts + lib/questionnaires/antwoord.ts (antwoordvalidatie per vraagtype) — invulproces zonder cijfermatige uitkomst; bewaakt in `components/app/chat/vragenlijst/vragenlijst-view.test.tsx`, `components/app/vragenlijst/*.test.tsx`, `app/api/questionnaires/**/route.test.ts` en `lib/questionnaires/*.test.ts`.',
    },
  },
]

export const WILL_ACCEPTANCE: AcceptanceSet = {
  zone: 'WILL',
  criteria,
}
