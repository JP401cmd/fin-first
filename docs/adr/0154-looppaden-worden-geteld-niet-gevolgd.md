---
id: 0154-looppaden-worden-geteld-niet-gevolgd
title: 'Looppaden worden geteld, niet gevolgd: gebeurtenissen en schermovergangen per sessie, opgeslagen als tellers zonder gebruikers-id'
status: aanvaard
date: 2026-09-17
elements: [do-meta, t-supabase, sp-inzicht]
---

Nieuwe gebruikers bekijken hun FIRE-leeftijd en komen niet terug. Fase 1 van
`/beheer/gebruik` laat zien óf en op welke dagen iemand terugkomt, niet wáár hij
binnen een bezoek afhaakt. Dit voorstel voegt een meting toe die dat zichtbaar
maakt — gebeurtenissen uit een gesloten naamlijst en de volgorde van schermen in
één bezoek — en slaat die **bij binnenkomst op als tellers**: geen rij per
gebruiker, geen rij per sessie, geen gebruikers-id, geen tijdstip. Het vult ADR
0146 en ADR 0147 aan en vervangt niets. **Aanvaard door de eigenaar op 17 september
2026. Er wordt niets verzameld vóór de juridische toets (open punt a) en de
`/privacy`-aanpassing live staan.**

## Context

- **ADR 0146** trekt de grens: beheer ziet gebruik, geen inhoud. `user_activity_days`
  = gebruiker × dag.
- **ADR 0147 besluit 7** gaat één niveau fijner: `user_activity_modules` = gebruiker
  × dag × app-deel, gesloten lijst van elf, CHECK in de database, geen route, geen
  tijdstip.
- **`/privacy` 2.3** belooft letterlijk "geen tijdstip, geen losse schermen en geen
  inhoud" en "ons team ziet … verder alleen tellingen". Sectie 9 noemt Speed
  Insights als "de enige meet-component".
- **ADR 0063** (`web_vitals`) is verzameld voor prestaties. Doelbinding (AVG art. 5
  lid 1 sub b): die routes en tijden mogen niet worden hergebruikt om looppaden te
  reconstrueren.
- **ADR 0137 + ADR 0146 besluit 5**: chat blijft buiten beheer — geen inhoud, geen
  tellingen.
- **Het terugkeerprobleem** vraagt twee dingen die fase 1 niet heeft: volgorde
  binnen een bezoek, en mijlpalen ("wizard afgerond").
- **Een sessie-id zonder `user_id` is niet vanzelf anoniem.** Bij weinig gebruikers
  is een bezoek via dag, volgorde en de gebruikte app-delen terug te leggen op de rij
  in `user_activity_modules` van diezelfde dag, en via de request-logs van Vercel
  (IP + tijd + pad) op een persoon. Een opgeslagen sessierij is dan een
  **pseudoniem persoonsgegeven** — met AVG-plichten, en zonder dat we de rechten
  van de betrokkene (inzage, wis) kunnen uitvoeren.

## Besluit

1. **Aanvulling, geen vervanging.** De grens van 0146 en de dag-/module-meting van
   0147 blijven ongewijzigd. Deze meting staat ernaast, in eigen tabellen, en wordt
   nooit met `user_activity_days`, `user_activity_modules` of `web_vitals` gekoppeld.
2. **Twee gesloten lijsten, afgedwongen in de database.**
   - `SCHERMEN` (`lib/activity/schermen.ts`): route-sjablonen zonder id's
     (`toekomst`, `toekomst/plan-review`, `overzicht/bezittingen`, …) plus de
     pseudo-stappen `start` en `einde`. CHECK-constraint met dezelfde lijst.
   - `GEBEURTENISSEN` (`lib/activity/gebeurtenissen.ts`): namen als
     `plan_wizard_gestart`, `plan_wizard_afgerond`, `checkin_gestart`,
     `fire_leeftijd_gezien`. Geen vrije tekst, geen bedragen, geen parameters.
     Geen enkele gebeurtenis uit of over het chatgesprek. Het openen van Fins
     venster telt alleen als scherm `fin`, gelijk aan de module in 0147: dát het
     venster openging, nooit berichten, onderwerp of lengte (eigenaarsbesluit
     17 sep 2026).
   Een nieuwe sleutel = migratie + lijst, in één PR.
3. **De sessiesleutel leeft alleen in het geheugen van de browser.** Een willekeurige
   waarde per volledige app-load, in een modulevariabele — niet in een cookie,
   `localStorage` of `sessionStorage`, niet afgeleid van de gebruiker. Hij verlaat de
   browser niet: de client gebruikt hem alleen om overgangen binnen het bezoek te
   bepalen.
4. **Opslag als tellers bij binnenkomst, niet als rijen.** De client stuurt aan het
   eind van het bezoek (`pagehide`, `sendBeacon`) en hooguit elke N overgangen één
   batch. De route telt op in drie tellertabellen, per **ISO-week**:
   - `usage_step_counts` (week · cohort · van-scherm · naar-scherm · aantal) — de
     overgangen, inclusief `start → x` (binnenkomst) en `x → einde` (afhaakscherm);
   - `usage_event_counts` (week · cohort · gebeurtenis · aantal);
   - `usage_funnel_counts` (week · cohort · trechter · hoogste stap · aantal) — voor
     trechters die in code zijn vastgelegd (`lib/activity/trechters.ts`) en die de
     client binnen het bezoek bijhoudt.
   Geen sessie-id, geen `user_id`, geen dag, geen tijdstip, geen `created_at`.
5. **Cohort is grof.** Alleen `nieuw` (account jonger dan 14 dagen) of `bestaand`,
   door de route afgeleid uit de ingelogde sessie en daarna weggegooid. De route
   vereist een ingelogde gebruiker (tegen vervuiling), maar schrijft en logt diens id
   niet.
6. **Beheer ziet alleen wat k-veilig is.** Een service-role-only RPC levert cellen
   met een aantal ≥ `K_SESSIES` (voorstel 10); lagere cellen worden samengevoegd tot
   "overig" of weggelaten, en bij te weinig volume per week toont beheer per vier
   weken. De onderdrukking volgt de lessen van fase 1 (ADR 0153): alles-of-niets per
   verdeling met een publiek totaal, complementen als verdeling, geen geneste
   vensters naast elkaar, en een eigenschapstest met een lezer die het algoritme
   kent. Let op: k telt **bezoeken, geen personen** — één actieve gebruiker kan tien
   bezoeken vullen. Daarom een hogere drempel dan de k = 5 van fase 1 en geen
   volledige paden, alleen overgangen, afhaakschermen en trechterstappen.
7. **Grondslag: gerechtvaardigd belang** (productverbetering), met één opt-out op
   `Mijn › Privacy` ("Tel mijn gebruik mee", standaard aan). **Die ene schakelaar
   geldt voor beide fasen** (eigenaarsbesluit 17 sep 2026): uit betekent geen
   actieve dagen, geen app-delen (fase 1) en geen looppaden (fase 2). Bij uit
   verstuurt de client niets. Gevolg: de vragenlijstregel "dominante stroom" (ADR
   0147) matcht voor die gebruiker nooit meer; dat is fail-closed en gewenst. Toestemming (opt-in) is overwogen en afgewezen: juist wie afhaakt
   geeft die het minst, zodat de meting blind is voor de groep waar hij om draait.
8. **Bewaartermijn: 400 dagen** op `week`, gelijk aan 0146, via `lib/retention.ts`.
   Tellers bevatten geen rij over één persoon; ze vallen daarom niet in de AVG-wis of
   -export per gebruiker (AVG art. 11: we bewaren geen extra gegevens alleen om te
   kunnen identificeren). `/privacy` zegt dat met zoveel woorden.
9. **Eigen stack, geen nieuwe verwerker.** Supabase (opslag) en Vercel (hosting,
   request-logs) staan al in het register. Een extern analytics-pakket (PostHog,
   Plausible, Hotjar) is afgewezen: nieuwe verwerker, apparaat-id's en ruwe
   gebeurtenissen per persoon.
10. **Borging.** CHECK-constraints op de drie lijsten; een brontest die faalt als de
    ingest-route of de tellertabellen `user_id`, een sessie-id of een tijdstip
    bevatten, of als bron `web_vitals` of een chattabel leest; de nieuwe RPC komt
    bewust op de vrije lijst van `lib/beheer/geen-inhoud.test.ts`, met reden.

## Uitrolvolgorde

1. Eigenaar akkoord op dit voorstel (status → aanvaard).
2. Juridische toets + `/privacy`-aanpassing (secties 2, 3, 6, 9) via de
   Grenswachter-route; live.
3. Migratie (tellertabellen, CHECK's, RPC, opt-out-kolom op `profiles`) via
   `schemawijziging` + `security-specialist`.
4. Code: de opt-out, ook in de bestaande tracker en `POST /api/activity/module` van
   fase 1; de client-tracker, de ingest-route en de beheerweergave. Pas daarna meten.

## Gevolgen

- Beheer ziet waar bezoeken eindigen en hoe ver trechters komen, apart voor nieuwe
  accounts. Het ziet geen paden van één bezoek en niets per persoon.
- **Wat het niet kan:** een meerstaps-pad over niet-vastgelegde schermen
  reconstrueren, of een bezoek aan een terugkeer koppelen. Wie dat wil, heeft
  opgeslagen sessierijen nodig; dat is een nieuw besluit met een eigen juridische
  toets, geen uitbreiding van dit besluit.
- Een afhaakscherm is een ondergrens: een bezoek dat eindigt zonder `pagehide`
  (crash, app gedood op iOS) telt alleen de tussentijds verstuurde batches.
- Een opt-out werkt alleen vooruit: eerder getelde bezoeken zijn niet meer aan
  iemand te koppelen en blijven staan.
- Bij een kleine bèta blijven veel cellen onder de drempel; beheer toont dan
  "te weinig bezoeken" in plaats van een getal.
- **Open punt (blokkeert stap 2):** (a) valt versturen zonder opslag op het apparaat
  onder de cookiewet (Telecommunicatiewet art. 11.7a; EDPB-richtsnoeren 2/2023 lezen
  "toegang" ruim)? Zo ja, dan moet de analytische uitzondering (geen of geringe
  gevolgen voor de privacy) gelden. Dat bevestigt een jurist in de juridische toets.
- **Besloten op 17 sep 2026:** (b) de opt-out geldt ook voor de dag- en modulemeting
  van fase 1 (besluit 7); (c) scherm `fin` telt mee als "venster geopend" (besluit 2).

## Verwant

ADR 0006 (service-role), ADR 0063 (web-vitals, doelbinding), ADR 0137 (chat), ADR
0146 (gebruik, geen inhoud), ADR 0147 (gericht verspreiden, module-meting).
