---
description: Start een UAT live-run met chromedev over gekozen zones — vraagt welke zones, test ze live en logt bugs naar Notion
argument-hint: "[zone-namen, 'alle' of 'alle ongeteste' — optioneel]"
---

Je draait een **UAT live-run** over de TriFinity-app: je test de gekozen UAT-zones **live via de chrome-devtools MCP** (echte klik-/lees-doorloop in de browser), registreert per scenario een resultaat in een UAT-ronde (zodat de plaat op `/beheer/uat` bijwerkt) en logt elke echte bug als kaartje in Notion. Deze flow is gebaseerd op de chromedev-run van 17 jul 2026 (zie geheugen `project_uat_chromedev_fullplaat_jul17_2026`).

## Vaste gegevens
- **Testomgeving:** dev-server op `http://localhost:3000`. De **chrome-devtools MCP-browser** moet ingelogd zijn als **`jochen@test.trifinity.nl`** — een *disposable* superadmin-**wegwerp**testaccount. **NOOIT** het echte account (`jpsmit@…`) gebruiken of muteren.
- **Zones (15):** `START, NAV, OVZ, BEZIT, SCHULD, CASH, BUDGET, BELAST, TOEK, REKEN, MIJN, WILL, RAPP, KRUIS, BEHEER` (bron `lib/uat/catalog.ts`, banden in `UAT_BANDEN`).
- **Per zone:** acceptatiecriteria in `lib/uat/acceptance/<zone-lc>.ts` (elk criterium heeft `workflow` WF-<ZONE>-NN, `scenarioId` UAT-<ZONE>-NN, `kriticiteit`, `given`/`when`/`then`, `assertion.kind` = `exact`|`consistency`|`ui-only`); flow/schermen in `lib/uat/flows/<zone-lc>.ts`; sub/platform per scenario via `UAT-<ZONE>-` in `lib/uat/catalog.ts`.
- **UAT-ronde aanmaken** (in de browser via `evaluate_script`): `POST /api/admin/uat/rounds` body `{label, environment:'test', notes}` → `{round}` (bewaar `round.id`).
- **Resultaat registreren** (meteen per scenario): `POST /api/admin/uat/results` body `{round_id, scenario_id, sub:'a', platform:'webapp'|'mobiel', status:'geslaagd'|'gefaald'|'geblokkeerd', severity, faalstap, opmerking, frictie}`. `severity` (`S0`|`S1`|`S2`|`S3`) is **verplicht bij `gefaald`**. Beide endpoints zijn superadmin-only en draaien in de ingelogde browsersessie.
- **Notion-bugdatabase:** data source `d87e54c5-fb52-4607-a72a-52e4b58ee806` (🧩 Trifinity). Aanmaken via `mcp__notion__notion-create-pages` (token verlopen? val terug op `mcp__claude_ai_Notion__*`).

## Harde regels
1. **Alleen `jochen@test`.** Controleer vóór alles wélk account is ingelogd (bv. e-mail uit `/mijn/account`-HTML). Is het niet `jochen@test.trifinity.nl` → **STOP** en meld het; muteer nooit het echte account.
2. **Eerlijk registreren, geen green-theater.** Registreer alleen wat je écht geverifieerd hebt. `exact`/`consistency`-wiskunde is al vitest-groen — de live-run verifieert dat de **UI rendert/navigeert/gedraagt** zoals het `then` beschrijft; niet de som overdoen. Maakt een bevestigd defect het `then` onwaar → `gefaald` (met severity), niet `geslaagd` omdat er een bug gelogd is.
3. **Geblokkeerd = geblokkeerd.** Vereist een scenario een écht 2e account/partner-huishouden, een externe sandbox (bv. TrueLayer open-banking), of een destructieve/uitgaande actie die je niet mag uitvoeren → `geblokkeerd` met heldere reden in `opmerking`. Maak **geen** echte 2e auth-accounts en verstuur **geen** echte e-mails.
4. **NOOIT uitloggen / de sessie beëindigen.** Het `jochen`-wachtwoord is onbekend en de sessie is cookie-based; uitloggen = lockout. Logout-scenario's → alleen de affordance verifiëren, niet klikken.
5. **Niet-destructief tenzij veilig-omkeerbaar op dit wegwerpaccount.** Draai destructieve admin-tools (account verwijderen, persona-seed die wist, onboarding-reset, check-in wissen, AI-kill-switch op prod-config) **niet** echt — verifieer rendering/bereikbaarheid. Maak eigen test-CRUD (transacties/budgetten/rapporten/calculators) achteraf ongedaan zodat het account eindigt zoals het begon.
6. **Efficiënt.** Gebruik `evaluate_script` met tekst-presence-checks (`document.body.innerText.includes(...)`, `querySelector`, `location.pathname`) i.p.v. dure full-page screenshots; screenshot alleen waar visuele/mobiele bevestiging nodig is. Mobiel-scenario's: emuleer ~390×844.

## Stappen

### 0. Preflight
- **chrome-devtools verbonden?** Zo niet (tools ontbreken), vraag de gebruiker de MCP te herverbinden (`/mcp` → chrome-devtools reconnect; bij vastgelopen browser eerst het Chrome-venster op het devtools-profiel sluiten) en wacht.
- **Ingelogd als `jochen@test`?** Navigeer naar `/overzicht`, controleer via `evaluate_script` dat er geen login-form is en dat het account `jochen@test.trifinity.nl` is (regel 1). De dev-server kan traag compileren — herprobeer een navigatie-timeout één keer.
- **Data-baseline.** Zorg voor rijke data: als het account leeg/onbekend is, seed `compleet` (Tessa/gezin): `POST /api/admin/seed` body `{"persona":"compleet"}` en lees de stream tot `{"done":true}`. **Seed-val:** eindigt de stream met een fout als *"Could not find the '<kolom>' column … in the schema cache"*, dan is er migratie-drift (kolom ontbreekt op de verbonden DB) → los op met `apply_migration` van de betreffende `supabase/migrations/*`-migratie + `NOTIFY pgrst, 'reload schema'` (of meld het en stop). Log dit als bug (zie Notion-format, Tags `["Backend"]`).

### 1. Vraag welke zones
`$ARGUMENTS` bevat zone-namen / `alle` / `alle ongeteste` → gebruik die en sla de vraag over. Anders:
- Toon kort de **huidige dekking** per zone (haal via `GET /api/admin/uat/rounds` de laatste rondes op, of query de laatst bekende status) zodat de gebruiker ziet wat al getest is.
- Stel via **AskUserQuestion** de vraag *"Welke UAT-zones wil je testen?"* met keuzes o.a.: **Alle nog-niet-(volledig-)geteste**, **Alle 15 zones**, **Specifieke zones** (laat de gebruiker via "Other" de namen typen, bv. `CASH, BUDGET, START`). Bevestig de definitieve zonelijst + volgorde vóór je begint. Zet zones die op de huidige data-persona veilig draaien vooraan; **START als laatste** (vereist uitgelogde/onboarding-staat, zie stap 3).

### 1b. Vraag diepte
Stel via **AskUserQuestion** de vraag *"Welke diepte wil je testen?"*:
- **Happy-path (aanbevolen voor een snelle veeg)** — het standaardgedrag hieronder: alleen sub `a`, webapp.
- **Volledige dekking (a+b+c+d + mobiel waar van toepassing)** — grondiger en trager; richt zich op de go/no-go-dekkingsdrempel (≥95%) op `/beheer/uat`. Ga bij deze keuze door naar stap 1c vóórdat je sub-agents dispatcht.

Bij happy-path: sla stap 1c over, ga direct naar stap 2 — **0% gedragswijziging** t.o.v. het bestaande commandogedrag.

### 1c. Bij volledige dekking — prioriteitswachtrij (alleen als stap 1b = volledige dekking)
Bereken in de hoofdthread, via `evaluate_script` in de ingelogde browsersessie (geen nieuwe API-route nodig):
1. Haal alle `uat_rounds` op en per ronde de `uat_results`; reduceer tot "laatst bekend per (scenario_id, sub, platform)" over álle rondes samen (dezelfde reductie die de plaat op `/beheer/uat` al doet — zie `buildResultLookup`/`deriveSubStatus` in `lib/uat/status.ts`).
2. Grijs = nooit geregistreerd, voor elke sub×platform-combinatie in de catalogus (`lib/uat/catalog.ts`) van de in stap 1 gekozen zones.
3. Sorteer de grijze gaten: KERN eerst, dan BELANGRIJK, dan OVERIG (matcht het go/no-go-criterium "alle KERN uitgevoerd én geslaagd").
4. Bundel per scenario: alle nog-grijze subs van hetzelfde scenario samen als één wachtrij-item (een scenario wordt niet over meerdere sessies heen heropend).

Is de wachtrij leeg (alles al gedekt op deze diepte in deze zones) → meld dat direct en sla de sub-agent-dispatch over.

Toon anders een compacte tabel (grijze KERN-/BELANGRIJK-/OVERIG-instanties per zone) en stel een behapbare hap voor: **de KERN-gaten van precies één zone — de zone met de minste resterende grijze KERN-instanties (tie-breaker: eerste in catalogus-volgorde)**. Stel via **AskUserQuestion**:
1. **Volg het voorstel** (aanbevolen)
2. **Alles in één keer** — alle grijze KERN+BELANGRIJK van de gekozen zones
3. **Eén zone volledig afmaken** — zone via "Other"
4. **Other (vrije tekst)** — zone-namen, "alleen KERN", aantallen, scenario-ID's; interpreteer dit tegen de berekende wachtrij en bevestig kort ("ik ga dan X draaien, klopt dat?") vóórdat je sub-agents dispatcht — geen mini-syntax, gewoon natuurlijke taal.

Het resultaat is een concrete lijst `[{scenarioId, zone, subs:['b','c','d',...], platforms:[...]}, ...]` — dit is wat de zone-agent(s) in stap 2 meekrijgen.

### 2. Test per zone — serieel, één sub-agent per zone
Er is **één gedeelde browser**; draai de zones **na elkaar** (nooit twee browser-agents tegelijk). Per zone een **sub-agent** (Agent-tool, `general-purpose`) om het hoofd-contextvenster licht te houden. Geef de sub-agent deze self-contained briefing (vul `<ZONE>` + datum in):

> Je draait een UAT live-run voor **ÉÉN zone: `<ZONE>`** via de chrome-devtools MCP. Datum = **<YYYY-MM-DD vandaag>**.
> **Omgeving:** browser al ingelogd als `jochen@test.trifinity.nl` (disposable superadmin) op `http://localhost:3000`; één gedeelde pagina; laat 'm schoon achter (draai eigen test-CRUD terug). Data = persona `compleet`/Tessa. **Niet re-seeden.**
> **Bron:** lees `lib/uat/acceptance/<zone-lc>.ts` (+ evt. `<zone-lc>-checks.ts`) en `lib/uat/flows/<zone-lc>.ts`; grep `lib/uat/catalog.ts` op `UAT-<ZONE>-` voor sub/platform. `exact`/`consistency` = vitest-groen → verifieer live dat de UI rendert/gedraagt zoals `then`; niet de som overdoen.
> **1) Ronde:** `POST /api/admin/uat/rounds` `{label:'<ZONE> live-run — <datum> (chromedev)', environment:'test', notes:'chromedev live-run, persona compleet/Tessa.'}` → bewaar `round.id`.
> **2) Per scenario:** oefen `when`, verifieer `then` (efficiënte `evaluate_script`-checks; screenshot spaarzaam; mobiel → emuleer 390×844). Bepaal eerlijk `geslaagd|gefaald|geblokkeerd` en registreer **meteen**: `POST /api/admin/uat/results` `{round_id, scenario_id, sub:'a', platform:'webapp'|'mobiel', status, severity(alleen bij gefaald: S0|S1|S2|S3), faalstap, opmerking, frictie}`. Registreer sub `a` per scenario.
> **Regels:** geen green-theater; bevestigd defect dat `then` breekt → `gefaald` + severity; iets dat een 2e account/externe sandbox/destructieve of uitgaande actie vereist → `geblokkeerd` met reden; **nooit uitloggen, nooit echte accounts aanmaken/e-mails sturen, destructieve admin-tools niet echt uitvoeren**. Verouderd criterium (beschreven bug al opgelost) → `geslaagd` + observatie dat het criterium bijgewerkt moet worden, géén bug.
> **Chromedev-interactie-caveats** (klik/typ-betrouwbaarheid — verifieer vóór je een bug concludeert):
> - **Stale uid → verse snapshot.** Een `click` op een `uid` uit een oudere `take_snapshot` kan het verkeerde element raken als de layout intussen is verschoven (bv. een naburig paneel dat open/dicht klapt) — neem **vlak vóór** elke uid-klik een verse `take_snapshot`.
> - **Non-pointer `.click()` → dispatch pointer-events.** Reageert een `evaluate_script`-`element.click()` niet zichtbaar (geen state-wijziging/re-render) op een React-knop, dispatch dan `pointerdown` + `pointerup` + `click` achter elkaar op hetzelfde element i.p.v. alleen `.click()` — sommige handlers luisteren naar pointer-events, niet naar de synthetische click.
> - **`fill(uid, '')` → verifieer met echte toetsaanslagen.** Een tekst-/e-mailveld legen naar een lege string zet de waarde soms alleen in de rauwe DOM zonder React's `onChange` te vuren — een knop die z'n `disabled` op die state baseert (bv. een getypte bevestiging vóór een destructieve actie) kan dan ten onrechte enabled ogen. Verifieer bij twijfel met echte toetsaanslagen (klik in het veld → `Ctrl+A`/`Shift+End` → `Backspace`).
> **3) Bugs → Notion** (`mcp__notion__notion-create-pages`, data source `d87e54c5-fb52-4607-a72a-52e4b58ee806`): één pagina per echt defect met **Feature**(titel) `<datum>-WF-<ZONE>-NN-bug<n>`, **Type** `Bug`, **Status** `Nieuw`, **CC-actie** `Backlog` (het Status-veld heeft géén "Backlog" — dat leeft in CC-actie), **Severity** `S0 - blocker`|`S1 - high`|`S2 - medium`|`S3 - low`, **Tags** `["<ZONE>"]` (+ `"UX"`/`"Backend"`/`"Security"` waar terecht), **Steps to reproduce**, **Expected result** (uit `then`), **Actual result**, **Analyse & voorstel** (oorzaakhypothese + verdacht bestand; grep mag). Alleen echte defecten; cosmetisch → S3.
> **4) Retour:** compacte JSON-samenvatting: `round_id`, counts `{geslaagd,gefaald,geblokkeerd,total}`, geblokkeerd-lijst met redenen, bugs `[{title,wf,severity,oneLine,notionUrl}]`, observaties (o.a. verouderde criteria) + opvallende positieven.

**Bij diepte=volledig (stap 1b/1c), pas de briefing hierboven als volgt aan:**
- **Instantielijst i.p.v. "per scenario":** geef de sub-agent de concrete lijst uit stap 1c mee (`[{scenarioId, subs, platforms}, ...]`) i.p.v. "doorloop de hele zone" — hij test precies die scenario's × subs × platforms, niet meer en niet minder.
- **Bron voor b/c/d:** naast `lib/uat/acceptance/<zone-lc>.ts` (blijft de bron voor de exacte cijfer-assertie, doorgaans sub `a`) grept de agent `docs/uat/uat-plan.md` op de exacte kop `#### UAT-<ID>` (bv. `#### UAT-SCHULD-07`) en leest **alleen die sectie** (niet het hele ~13.500-regels-document) voor de volledige a/b/c/d-given/when/then-prose. **CANON-fallback:** bestaat er geen `#### UAT-CANON-NN`-kop (CANON is een latere toevoeging, niet in het oorspronkelijke Deel-2-document), gebruik dan `given`/`when`/`then` uit `lib/uat/acceptance/canon.ts` als enige bron voor alle subs van dat scenario, en meld dit als observatie voor `uat-docs-keeper` — niet blokkeren.
- **Falende sub blokkeert niet:** faalt sub `b`, ga gewoon door met `c`/`d` van hetzelfde scenario — elke sub is een onafhankelijke test, apart geregistreerd.
- **Rondelabel:** `{label:'<ZONE> diepte-run — <datum> (chromedev)', notes:'volledige dekking a+b+c+d, instanties: [...]'}` i.p.v. `'... live-run ...'` — zodat de rondegeschiedenis op `/beheer/uat` het runtype onderscheidt.

**Crash-herstel:** de incrementele registratie overleeft een sub-agent-crash (API 529 / connection closed). Crasht een zone-agent, controleer via de DB/`GET results` welke `scenario_id`s al staan en **hervat dezelfde agent via SendMessage** met de nog-ontbrekende scenario's (niet opnieuw beginnen).

### 3. START (indien gekozen) — speciale afhandeling
START heeft publiek/registratie/onboarding-flows. Test wat veilig kan (marketing/Vrijheidscheck/rapport + rendering van login/registratie), en:
- **Uitgelogd-only** (registreren, login-submit, wachtwoord-reset-mail, route-bescherming-voor-anon, logout): **NIET** uitvoeren — `geblokkeerd` (reden: "vereist uitgelogde sessie; sessie mag niet beëindigd worden, wachtwoord onbekend"), of alleen rendering verifiëren.
- **Onboarding** (WF-START-17..26): `POST /api/onboarding/reset` (wist data + `onboarding_completed=false`, **logt NIET uit**, `profiles.role`=superadmin blijft), loop `/onboarding` door, registreer; daarna **`POST /api/admin/seed {"persona":"compleet"}`** om te herstellen en verifieer dat de sessie nog leeft (`GET /api/admin/uat/rounds` → 200) en de data terug is.

### 4. Afronding
- Haal de definitieve tellingen per zone uit de DB (`GET /api/admin/uat/results?round=<id>` of één SQL-aggregatie) en geef een **overzichtstabel** (✅/❌/⛔ per zone) + de lijst **Notion-bugkaarten** (titel · severity · één regel · URL).
- Meld **verouderde acceptatiecriteria** die opvielen (beschreven bug al gefixt) als aanbeveling om `lib/uat/acceptance/*` bij te werken — voer dat **niet** automatisch door.
- Bevestig dat het testaccount schoon is achtergelaten (persona `compleet` hersteld, sessie intact). **Niets committen** — dat is een aparte stap (`release`-skill).

## Token-efficiëntie
Houd het hoofd-contextvenster licht: lees zelf niet elk acceptatiebestand in de hoofdthread — dat doet de zone-sub-agent in z'n eigen context. De hoofdthread doet alleen preflight, de zonevraag, het serieel dispatchen/hervatten van zone-agents, en de eindaggregatie (compacte samenvattingen terug).

## Slotstap — Zelfverbetering (in overleg, niets auto-doorvoeren)
Sluit af met een kort retrospectief in de hoofdchat: viel er een instructie in dit command tekort (onduidelijke gate, ontbrekende stap, verkeerde persona/volgorde, tekortschietende blokkeer-regel)? Leg één scherp voorstel vast als Notion-`Backlog`-kaartje (`Feature` = `Zelfverbetering: <titel>`, `Type` `Bug`, `CC-actie` `Backlog`, voorstel in **Analyse & voorstel** incl. de exacte tekstwijziging in `.claude/commands/uat.md`) en noem het in de samenvatting. Wijzig het command zelf pas **na expliciet akkoord**, in een aparte `self-improve:`-commit. Geen voorstel is prima; nooit een lijst.
