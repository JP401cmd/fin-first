---
id: 0122-het-onboarding-concept-staat-server-side
title: 'Het onboarding-concept staat server-side op de eigen profielrij, niet in localStorage'
status: aanvaard
date: 2026-08-31
elements: [sp-registreren, do-meta, app-comp]
---

# 0122 — Het onboarding-concept staat server-side

## Context

Tot juli 2026 bewaarde de onboarding haar volledige concept in `localStorage`:
naam, geboortedatum, inkomen, uitgaven, budgetbedragen, bezittingen, schulden en
pensioenbedragen. Op een gedeeld apparaat, of via één XSS-gaatje, was dat alles
leesbaar zolang de onboarding liep.

De toen gekozen oplossing was **persistentie minimaliseren**: alleen de
stap-positie en de keuzes-zonder-bedrag bleven bewaard. Dat sloot het lek, maar
maakte élke page-reload destructief. De UX-review van 31 augustus 2026 (kaart
UR2-01, P0) legde de prijs bloot: een tester vulde acht stappen in — betaalrekening
€1.800, spaarrekening €22.000, eigen woning €425.000 met gekoppelde hypotheek
€285.000 — en hield na één refresh alleen de teller "3/8" over. De banner meldde
netjes dat de bedragen niet bewaard waren; dat maakte het verlies eerlijk, niet
kleiner. Voor een app die om precies deze bedragen vraagt is dat een
blokkerende frictiebron: elke onderbreking — een crash, een telefoontje, een
HMR-reload — kost de gebruiker alle geïnvesteerde moeite.

De aanleiding was bovendien niet alleen frictie. Wie na zo'n reload doorklikte,
rondde de onboarding af met lege velden en produceerde daarmee €0-records, die
verderop in de app als échte cijfers werden gepresenteerd (kaarten UR2-02 en
UR2-03). Het dataverlies was de bron van een datakwaliteitsprobleem.

## Besluit

Het onboarding-concept verhuist van `localStorage` naar de **eigen,
RLS-gescopede profielrij** (`profiles.onboarding_draft`, jsonb), met
`/api/onboarding/draft` (GET/PUT/DELETE) als enige transport.

Daarmee blijven beide eerdere besluiten overeind: gevoelige onboarding-data
staat niet meer op het toestel, én ze overleeft een reload. De data landt op
dezelfde plek waar ze na afronding tóch al terechtkomt — de opslag is dus geen
nieuwe blootstelling, alleen een vroegere.

- **Toegangsmodel**: uitsluitend de anon RLS-client op `.eq('id', user.id)`,
  bovenop de bestaande policy `auth.uid() = id`. Nooit service-role.
- **Levensduur**: het concept wordt gewist bij afronden, bij uitloggen/afbreken,
  en wanneer de pagina een al voltooide onboarding aantreft.
- **Schrijfritme**: gedebounced (600 ms) en geketend, zodat doortypen geen
  PUT-per-toetsaanslag kost en een oudere schrijf nooit ná een nieuwere landt.
- **Eén veld blijft buiten het concept**: het geparste pensioenoverzicht
  (`pension.parseResult`). Dat blijft per ADR 0115 op het toestel. Het
  `.strict()`-zodschema op de route weigert het actief, zodat de belofte niet
  stil kan wegzakken. Wat wél meegaat is `pension.mode: 'upload'` — dat legt
  vast dát de gebruiker de uploadroute koos, niet wat er in het document stond.
  Ook `grossMonthly`/`startAge` zijn hier veilig: die worden uitsluitend in de
  *schattings*-tak geschreven (gebruikersinvoer), nooit uit een parse afgeleid.

- **Twee omvangsgrenzen**, want de per-veld-maxima begrenzen alleen losse
  velden: een `content-length`-voorcontrole (256 kB) weigert een absurde body
  vóór het inlezen, en een totaalgrens (64 kB) weigert een schema-geldig maar
  te groot concept vóór de database. Het aantal sleutels in `budgetAmounts` is
  apart gecapt — dat was de enige onbegrensde collectie in het schema.

De validatie is bewust in tweeën gesplitst. Het zodschema op de route bewaakt
**vorm en omvang**, niet volledigheid: een concept is per definitie halfaf, en
een concept dat geweigerd wordt omdat het nog niet compleet is, zou de gebruiker
juist tijdens het invullen zonder vangnet zetten. Het versmallen naar de echte
unions — plus de migratie van oude concepten — gebeurt bij het lezen, in
`sanitizeStoredDraft`. Strenge validatie hoort thuis bij de eind-save
(`/api/onboarding/save-own-data`), waar de gegevens hun definitieve plek krijgen.

## Gevolgen

- Een reload, crash of tabwissel kost geen invoer meer; de gebruiker hervat waar
  hij was, mét zijn bedragen.
- De herstelmelding is voor de tweede keer met het gedrag meeverhuisd. Ze zit
  vast aan `UNRESTORED_DRAFT_KEYS` via een `Record<...>`, dus een veld dat in de
  toekomst niet meer hersteld wordt, dwingt compile-time een tekstwijziging af.
- De waarschuwing "ververs de pagina niet" bij een mislukte eindopslag is
  vervallen — die was waar en is dat niet meer. De regel dat het foutpad **niet
  navigeert** blijft staan (bron-grendel in `save-failure-no-reload.test.ts`):
  een reload is niet meer fataal, maar gooit de gebruiker nog steeds uit de flow
  en kost de niet-bewaarde pensioen-parse.
- **Prijs: het concept is niet meer offline-bestendig.** Valt de verbinding weg,
  dan bewaart de app niets tot ze terug is. Dat is bewust: een offline-kopie zou
  de gevoelige data terugzetten op het toestel, precies wat juli 2026 wegnam.
- Een oud localStorage-concept wordt bij de eerstvolgende binnenkomst nog
  éénmalig gelezen (stap-positie en keuzes) en daarna gewist, zodat iemand die
  middenin de onboarding zat niet terugvalt naar stap 1.
