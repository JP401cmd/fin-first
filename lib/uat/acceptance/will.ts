/**
 * Acceptatiecriteria — domein Will (AI-coach), berichten & krant (WF-WILL-01..20 /
 * UAT-WILL-01..20).
 *
 * Spiegelt exact de aanpak van `budget.ts`/`start.ts`/`schuld.ts`/`toek.ts`. Bron:
 * `docs/uat/uat-plan.md` Deel 1 (workflow-definities WF-WILL-01..22) + Deel 2 §2.8
 * (UAT-WILL-01..20).
 *
 * WF-WILL-21 en WF-WILL-22 hebben BEWUST GEEN eigen criterium hier — het UAT-plan
 * zelf wijst ze door naar UAT-OVZ-19/20/21 ("→ gedekt door UAT-OVZ-19/20/21");
 * `lib/uat/catalog.ts` bevat dan ook geen UAT-WILL-21/22 (de catalogus stopt bij
 * UAT-WILL-20) — dit domein is dus, net als SCHULD/TOEK, NIET volledig
 * aaneengesloten op WF-nummer, maar WEL 1-op-1 met de 20 catalogus-scenario's.
 *
 * KERN-BEVINDING (bepaalt exact vs. ui-only — zie ook de zone-specifieke notitie
 * op de Notion-kaart): dit domein combineert twee toetsbaarheidsprofielen.
 * (1) Will-chat en de krant zijn AI-gegenereerd → NIET deterministisch toetsbaar
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
 * beide `POSTPONE_DAYS = 14`), de bel-badge-cap "9+" (will-home.tsx), de
 * budgetmelding-titel/omschrijving (`app/api/notifications/route.ts#pushBudgetNotification`),
 * het krant-editienummer/jaargang + ververs-resterend (`app/api/news/route.ts`),
 * en de "minder hierover"-demotiedrempel (`app/api/news/route.ts#getDemotedCategories`).
 */

import type { AcceptanceCriterion, AcceptanceSet } from './types'

const criteria: AcceptanceCriterion[] = [
  {
    workflow: 'WF-WILL-01',
    scenarioId: 'UAT-WILL-01',
    titel: 'Vrije vraag stellen aan Will',
    kriticiteit: 'BELANGRIJK',
    given: 'Een ingelogde gebruiker (willekeurige persona) opent een app-pagina; chat nog nooit geopend op dit apparaat.',
    when: 'De gebruiker klikt de Will-bubbel, accepteert de Wft-disclaimer en stelt een vrije vraag.',
    then: 'Het antwoord stroomt zichtbaar binnen, gaat inhoudelijk over de gestelde vraag en bevat geen ruw datalek (bv. volledige IBAN); de Wft-voetnoot blijft permanent zichtbaar; de disclaimer verschijnt na acceptatie nooit meer op dit apparaat. AI-tekst zelf is niet deterministisch toetsbaar — alleen het PROCES en de randvoorwaarden.',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/chat/chat-panel.tsx (Wft-disclaimer, streaming, domain-useMemo) + app/api/ai/chat/route.ts — procestoets, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-WILL-02',
    scenarioId: 'UAT-WILL-02',
    titel: 'Een tip van Will beslissen: accepteren, uitstellen, afwijzen',
    kriticiteit: 'KERN',
    given: 'Een "Tip van Will"-kaart in de chat; "nu" = 5 juli 2026.',
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
    given: 'Vers, leeg testaccount: alle CoachDataGaps ontbreken (hasBank/hasAssets/etc. allemaal false), geen deferred fields, pathname "/overzicht", geen regel weggeklikt.',
    when: 'De pagina wordt geladen (eerste bezoek), en na het wegklikken van de bank-regel opnieuw.',
    then: 'De regelselectie is deterministisch: bij alles ontbrekend wint eerst "gap_bank"; na wegklikken van "gap_bank" (toegevoegd aan dismissed) wint "gap_assets" — de vaste volgorde bank → assets → debts → budgets → transactions → holdings → isin → goals → fire_params → life_events wordt gerespecteerd. De getoonde BOODSCHAP zelf is statische catalogus-tekst, geen AI-output.',
    assertion: {
      kind: 'exact',
      expected: 'eersteRegel=gap_bank; naDismissBank=gap_assets',
      source: 'lib/coach-suggestions.ts#getFirstUndismissedSuggestion (DATA_GAP_SUGGESTIONS-volgorde) — echte productiefunctie, geen mirror',
    },
  },
  {
    workflow: 'WF-WILL-06',
    scenarioId: 'UAT-WILL-06',
    titel: 'Uitgestelde tips heropakken via de badge',
    kriticiteit: 'BELANGRIJK',
    given: 'Badge-aantal = 0 (geen uitgestelde tips klaar) resp. 12 (meer dan 9 klaar).',
    when: 'De gebruiker bekijkt de badge op de Will-bubbel.',
    then: 'Bij 0: geen badge, klik opent de lege chat (geen automatische vraag). Bij 12: de badge toont "9+" in plaats van het exacte aantal.',
    assertion: {
      kind: 'exact',
      expected: 'badge0=; badge12=9+',
      source: 'components/app/will/will-home.tsx (badge-cap-formule, gemirrord) — zie will-checks.ts',
    },
  },
  {
    workflow: 'WF-WILL-07',
    scenarioId: 'UAT-WILL-07',
    titel: '"Bespreek met Will" vanaf een onderwerp elders in de app',
    kriticiteit: 'BELANGRIJK',
    given: 'Persona met alle in-depth apps actief; een "Bespreek met Will"-knop bij een fase-analyse of vaste-lasten-analyse.',
    when: 'De gebruiker klikt de knop (en klikt snel nogmaals).',
    then: 'De chat opent met het kick-off-bericht (onderwerp + toelichting) al verstuurd; een tweede snelle klik verstuurt niet nogmaals hetzelfde bericht (one-shot-guard).',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/chat/bespreek-met-will-button.tsx + openWithMessage (chat-provider.tsx) — procestoets, geen cijfermatige uitkomst',
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
    given: 'AI-kill-switch uit via /beheer/platform (deterministisch forceerbaar); breed tier-gate-effect over alle AI-oppervlakken hoort bij UAT-KRUIS-25, hier alleen het chat-oppervlak.',
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
    given: 'Budget "Boodschappen": limiet €380/mnd, alert_threshold 80%, besteed €320 deze maand (expense-type).',
    when: 'De gebruiker opent de bel-modal.',
    then: 'Drempel = 80% van €380 = €304; besteed €320 = 84% (afgerond) → titel "Boodschappen: 84% besteed", omschrijving "€320 van €380 — nog €60 over (drempel: 80%)", kleur amber, priority 2 (< 100%). Bij ≥100% wordt de titel "… — over budget" (rood, priority 1); bij ≥120% "… — flink over budget".',
    assertion: {
      kind: 'exact',
      expected: 'titel=Boodschappen: 84% besteed; omschrijving=€320 van €380 — nog €60 over (drempel: 80%); priority=2',
      source: 'app/api/notifications/route.ts#pushBudgetNotification (r200-260, gemirrord met lib/budget-alerts.ts#shouldAlert) — zie will-checks.ts',
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
    titel: 'Een melding opvolgen: doorklikken of Will vragen',
    kriticiteit: 'BELANGRIJK',
    given: 'Een ongelezen budgetmelding in de bel/berichtencentrum.',
    when: 'De gebruiker klikt op de melding zelf, of op de knop "Vraag Will".',
    then: 'Klik op de melding: gelezen gemarkeerd + navigatie naar de bestemmings-URL (indien aanwezig). Klik "Vraag Will": gelezen gemarkeerd, paneel sluit, chat opent met een voorgeformuleerde vraag die het percentage/bedrag noemt. Legacy-actionUrl-doelen (/core/budgets, /core/cash, /horizon) moeten per doorklik op werkend/redirect/dood gecontroleerd worden (genoteerd risico).',
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
    titel: 'Een nieuwsartikel met Will bespreken',
    kriticiteit: 'BELANGRIJK',
    given: 'Een artikel op de huidige editie van /nieuws (niet het archief).',
    when: 'De gebruiker klikt "Bespreek met Will".',
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
]

export const WILL_ACCEPTANCE: AcceptanceSet = {
  zone: 'WILL',
  criteria,
}
