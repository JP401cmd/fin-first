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
 * scenario's die daadwerkelijk bestaan (20 + UAT-WILL-23 + UAT-WILL-24 = 22).
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
 * VIJF MIRRORS met bronregel-verwijzing (server-only routes met een Supabase-
 * client-parameter, dus niet importeerbaar in een pure module — spiegelt de
 * spaardoel-mirror in `budget-checks.ts` en de netto-vermogen-mirror in
 * `start-checks.ts`): de postpone-termijn (chat-panel.tsx/tips-lijst.tsx,
 * beide `POSTPONE_DAYS = 14`), de bel-badge-cap "9+" (fin-home.tsx), de
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
    titel: 'Een tip van Fin beslissen: accepteren, uitstellen, afwijzen',
    kriticiteit: 'KERN',
    given: 'Een "Tip van Fin"-kaart in de chat; "nu" = 5 juli 2026.',
    when: 'De gebruiker kiest "Uitstel".',
    then: '`postponed_until` = nu + 14 dagen = 19 juli 2026 (POSTPONE_DAYS = 14, identiek in chat-panel.tsx en tips-lijst.tsx); de tip mag pas vanaf die datum via de badge terugkomen (WF-WILL-06). De tip-inhoud zelf ("+X dagen vrijheid/jaar") is AI-tool-output en niet hand-narekenbaar.',
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
    titel: 'Uitgestelde tips heropakken via de badge',
    kriticiteit: 'BELANGRIJK',
    given: 'Badge-aantal = 0 (geen uitgestelde tips klaar) resp. 12 (meer dan 9 klaar).',
    when: 'De gebruiker bekijkt de badge op de Fin-bubbel.',
    then: 'Bij 0: geen badge, klik opent de lege chat (geen automatische vraag). Bij 12: de badge toont "9+" in plaats van het exacte aantal.',
    assertion: {
      kind: 'exact',
      expected: 'badge0=; badge12=9+',
      source: 'components/app/fin/fin-home.tsx (badge-cap-formule, gemirrord) — zie will-checks.ts',
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
    then: 'Rode foutbanner met begrijpelijke uitleg + "Technische details" (max 240 tekens) + knoppen "Opnieuw proberen"/"Sluiten"; bubbel en paneel blijven bruikbaar; "Opnieuw proberen" na herstel genereert alsnog een antwoord; "Sluiten" verwijdert de banner.',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/chat/chat-panel.tsx (getErrorMessage/getErrorDetail) + app/api/ai/chat/route.ts (AI_TIMEOUT_MS=60s, 422/401/403) — procestoets, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-WILL-10',
    scenarioId: 'UAT-WILL-10',
    titel: 'Meldingen checken via de bel',
    kriticiteit: 'BELANGRIJK',
    given: 'Drie budgetten naast elkaar: "Boodschappen" (limiet €380, besteed €320), "Huur" precies op de grens (limiet €1280, besteed €1280) en "Huur" nét eroverheen (limiet €1279,80, besteed €1280,40) — alle expense-type met alert_threshold 80%.',
    when: 'De gebruiker opent de bel-modal.',
    then: 'Drie drempeltakken, drie verschillende antwoorden (bevinding H16). ONDER: 84% → "Boodschappen: 84% besteed", "€320 van €380 — nog €60 over (drempel: 80%)", amber, priority 2. BEREIKT (besteed = limiet, op de cent): "Huur: limiet bereikt", "€1280 van €1280 — precies op de grens, niets meer over", amber, priority 3 — dus BUITEN de Dringend-bak (priority ≤ 2), want er is niets overschreden. OVER (besteed > limiet): "Huur: 100% — over budget", rood, priority 1; en omdat beide bedragen op hele euro\'s samenvallen toont de omschrijving centen ("€1280,40 van €1279,80 — budget overschreden") in plaats van tweemaal "€1280". Bij ≥120% wordt de titel "… — flink over budget".',
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
      source: 'app/api/news/route.ts#getDemotedCategories (r219-241, drempel ≥2/90 dagen, gemirrord) — zie will-checks.ts',
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
      'De gebruiker kiest een type (bug/vraag/aanbeveling), vult het formulier in — bug/vraag verplicht een scherm, een aanbeveling juist NIET (en toont geen scherm-/verwachting-/toestemmingsveld) — voegt optioneel een screenshot toe (niet bij aanbeveling; PNG/JPEG/WebP tot 4 MB) en verstuurt. Tijdens het versturen probeert hij te sluiten (kruisje of mobiele backdrop) of de megafoon nogmaals te klikken.',
    then:
      'Sluiten en de megafoon-toggle zijn geblokkeerd zolang de verzending loopt (`meldingBezig`) — geen halve/dubbele melding. Dit geldt sinds deze release ook voor het NIEUWE swipe-down-gebaar op mobiel (het paneel deelt `useSwipeToDismiss` met BottomSheet, zie WF-NAV-21): de hook wordt met `enabled: !isPinned && !meldingBezig` aangeroepen, dus wegslepen tijdens een lopende verzending sluit het paneel niet — consistent met de bestaande sluit-blokkade. Gepind (desktop-zijbalk) is het swipe-gebaar sowieso nooit actief. Het gesprek zelf (useChat-state) blijft intact wanneer de gebruiker terug naar chatmodus schakelt; de melding wordt pas geschreven bij "versturen", nooit tussentijds. Bij een 6e melding binnen het lopende uur wijst de server het verzoek af (HTTP 429, Nederlandse foutmelding "al veel meldingen... probeer het over een uur"); de eerste 5 lukken. Server-side validatie (zod) geeft bij een ontbrekend scherm op bug/vraag, een te korte omschrijving (<5 tekens) of een niet-toegestaan veld bij een aanbeveling een Nederlandse foutmelding, nooit de rauwe zod-tekst. Bij succes toont de meldmodus een bevestigingsstap; de rij komt eerst in Supabase (`user_reports`) te staan en pas daarna, best-effort, als Notion-kaartje — een falende Notion-push verliest de melding dus niet en wordt de volgende dag door de cron (UAT-BEHEER-31 → `/beheer/jobs`, job "Meldingen → Notion-sync") opnieuw geprobeerd.',
    assertion: {
      kind: 'ui-only',
      source:
        'components/app/chat/chat-panel.tsx (megafoon-toggle, veiligSluiten/meldingBezig-blokkade, useSwipeToDismiss({enabled: !isPinned && !meldingBezig})) + lib/hooks/use-swipe-to-dismiss.ts + components/app/chat/melding/melding-view.tsx + melding-form.tsx + melding-type-kiezer.tsx + app/api/user-reports/route.ts (ReportSchema/zod-validatie, dutchValidationMessage, RPC reserve_user_report_slot voor de 5/uur-rem, best-effort pushReportToNotion) + app/api/cron/user-reports-notion-sync/route.ts (retry-cron) — procestoets/randvoorwaarden, geen AI-inhoud',
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
]

export const WILL_ACCEPTANCE: AcceptanceSet = {
  zone: 'WILL',
  criteria,
}
