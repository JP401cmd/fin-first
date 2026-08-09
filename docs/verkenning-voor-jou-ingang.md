# Verkenning NAV-4 — één "Voor jou"-ingang?

*9 augustus 2026 · spike, geen bouw · fase 5 van `docs/eenvoudige-weergave-audit.md` · concept-ADR: `docs/adr/0095-voor-jou-ingang-tips-en-berichten.md`*

**Voorstel uit de audit:** "Tips & acties" + "Berichten" samenvoegen tot één ingang "Voor jou · N" (tips als tab in het berichtencentrum); Nieuws blijft apart.

## 1 · Wat er nu werkelijk staat (geverifieerd in de code)

| | Tips & acties | Berichten |
|---|---|---|
| Route | `/overzicht/tips` | `/berichten` |
| Desktop-sidebar | ✅ `OVERIGE_BASE` (Zap) | ✅ `OVERIGE_BASE` (Inbox) |
| Mobiele nav-sheet (`globalNav`) | ❌ **staat er niet** | ✅ |
| Teller | ❌ alleen een binaire freshness-dot | ✅ numeriek (`unreadCount`) |
| Signaalbron | `sidebarSignals.tipsActions` = `actionCount > 0 \|\| recsCount > 0` (server, `app/(app)/layout.tsx`) | `useNotifications().unreadCount` (client, 7-daags venster) |
| Datamodel | DB-rijen: `recommendations` (pending/postponed) + `actions` (open werkitems, toewijsbaar aan partner) — echte levenscyclus | **afgeleide stroom**: `/api/notifications` genereert de meldingen bij élke GET en merget ze in een JSON-blob `app_settings.notifications_history_<uid>` (30d bewaard, 7d teruggegeven) |
| Render | Server-component op `loadFinData` (partner-toewijzing, `currentUserId`) | Volledig client-side, géén server-data |

**Drie bevindingen die de aanname van de audit bijstellen:**

1. **"Twee badges" bestaat niet.** Er is één getal (Berichten) en twee binaire stipjes. De cognitieve last is kleiner dan de audit suggereert.
2. **Het probleem is asymmetrisch, niet symmetrisch.** Op desktop staan er twee ingangen naast elkaar; op mobiel staat "Tips & acties" *helemaal niet* in het menu — alleen bereikbaar via `/overzicht` (tips-teaser, `overzicht-secondary`), ⌘K, de gezondheidsscore-kassabon en een AI-`actionUrl`. Mobiel heeft dus een vindbaarheids-probleem, geen dubbelingsprobleem.
3. **Eén badge "Voor jou · N" heeft geen coherente N.** Je zou een afgeleide, per-request opnieuw berekende meldingstroom optellen bij DB-rijen met een eigen levenscyclus. "Gelezen" (melding) en "afgehandeld" (aanbeveling/actie) zijn niet hetzelfde begrip; een gebruiker die zijn berichten leest ziet N dalen zonder dat er iets gedaan is.

## 2 · Opties

**A · Volledig samenvoegen** — tips als derde tab in `/berichten`, één ingang "Voor jou · N", `/overzicht/tips` wordt een redirect.
*Voor:* één plek voor "wat er voor mij ligt"; nav-sheet en sidebar krijgen dezelfde vorm.
*Tegen:* vraagt een gedeelde tellerdefinitie die er niet is (bevinding 3); `/berichten` is client-only en zou server-data (`loadFinData`, partner-toewijzing) moeten gaan laden óf `/overzicht/tips` moet omgekat naar client; ~7 bestaande deeplinks naar `/overzicht/tips` (+ `#acties`-anker) moeten mee; raakt `nav-config`, sidebar, nav-sheet, ⌘K-index, UAT-zones WILL/NAV/OVZ. Grote IA-ingreep voor een probleem dat vooral op desktop zichtbaar is.

**B · De asymmetrie repareren, niet samenvoegen** — "Tips & acties" toevoegen aan `globalNav` zodat de mobiele nav-sheet 'm óók toont; beide ingangen blijven bestaan, badges ongewijzigd.
*Voor:* lost het echte, meetbare gat op (mobiel mist de ingang volledig); ~1 regel in `lib/nav-config.ts` + een nav-config-test; nul migratie, nul redirects, geen tellerdefinitie nodig.
*Tegen:* de desktop-sidebar houdt twee "voor jou"-achtige regels naast elkaar.

**C · Omgekeerde richting** — één ingang "Voor jou" die naar `/overzicht/tips` leidt, met berichten als tab dáár.
*Voor:* de server-pagina blijft server; tips (waar je iets *doet*) wordt de kop van de stroom.
*Tegen:* zelfde tellerprobleem als A; berichten verhuizen uit hun eigen route, wat de bel-modal en `/berichten`-deeplinks raakt. Alle nadelen van A, minder winst.

## 3 · Aanbeveling

**B nu; A pas na een expliciet tellerbesluit.** De audit-observatie ("twee ingangen die op hetzelfde lijken") klopt op desktop, maar de duurste helft van de oplossing — één badge — stuit op twee onverenigbare datamodellen. B haalt de werkelijke gebruikerswinst binnen (mobiel kán nu niet bij zijn tips) tegen bijna geen risico, en houdt A open.

Kiest de eigenaar tóch voor A, dan is de **eerste** te beantwoorden vraag niet "welke tab" maar: *wat telt "Voor jou · N"?* Zolang daar geen antwoord op is, levert A een getal op dat niemand kan uitleggen — precies het soort cijfer-zonder-context dat fase 4 (NAV-5) juist heeft wéggehaald.

## 4 · Als A tóch doorgaat — uitvoeringsschets

1. Tellerbesluit vastleggen (voorstel: N = openstaande *acties* + pending *aanbevelingen*; meldingen krijgen een aparte stip, geen getal).
2. `/overzicht/tips` blijft de server-pagina en wordt de "Voor jou"-route; `/berichten` wordt daar een tab. Zo blijft `loadFinData` server-side.
3. `nav-config.ts`: één `globalNav`-item "Voor jou"; `OVERIGE_BASE` in de sidebar van vier naar drie regels.
4. `/berichten` blijft als route bestaan met een redirect naar de tab (bel-modal, deeplinks, e-mails).
5. UAT: WF-NAV-04/06, WF-WILL-11/12 en de OVZ-tips-criteria herschrijven; `lib/uat/flows/will.ts` aanpassen.
