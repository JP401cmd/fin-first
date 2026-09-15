---
id: 0146-beheer-ziet-gebruik-geen-inhoud
title: 'Beheer ziet gebruik, geen inhoud: geen supportview, geen admin-export, wel een activiteitsprofiel'
status: aanvaard
date: 2026-09-15
elements: [do-meta]
---

# 0146 — Beheer ziet gebruik, geen inhoud

## Context

Sinds beheer 2.0 (juni 2026) kon een superadmin op `/beheer/gebruikers`:

- een **financiële diagnose** openen (`/api/admin/user-diagnose`): netto vermogen, totaal
  bezittingen en schulden, en elke rekening met naam en saldo;
- de **volledige data** van een gebruiker downloaden (`/api/admin/user-export`): alle
  persoonlijke tabellen, rekeningnummers ontsleuteld.

Beide lazen met de service-role en logden de inzage. Het brede RLS-leesrecht was al in juni
geschrapt (migratie `20260611120000`), maar deze twee routes hielden de inzage in stand.

Het onderzoek van 14 sep 2026 vond daarnaast twee paden zonder scherm:

- de RLS-policy `app_settings select` had een tak **"Superadmin leest alles"**. Daarmee kon
  elke superadmin met de gewone browser-client de maandelijkse check-in van iedere
  gebruiker lezen (`checkin_snapshot_<uid>_<maand>`: netto vermogen, inkomen, uitgaven,
  reflectietekst) en diens meldingsgeschiedenis;
- de vragenlijst-antwoorden werden in beheer **op naam** getoond.

De eigenaar wil van beheer het **gebruik** van de app zien, niet de inhoudelijke bedragen.

## Besluit

1. **De grens.** Wat de gebruiker in de app vastlegt (bedragen, rekeningen, transacties,
   check-ins, chat) is voor beheer onzichtbaar. Wat de gebruiker zelf **naar ons stuurt**
   (een melding, feedback, een calculator-report) mag beheer zien — daar is het voor
   bedoeld. Vragenlijst-antwoorden zijn ook naar ons gestuurd, maar worden in beheer
   **zonder invuller** getoond ("Invulling N", tijdstempels alleen op de dag): voor
   onderzoek telt wát er geantwoord is. Dat is geen weergave-truc: de superadmin-leestak
   op `questionnaire_sessions`/`questionnaire_responses` vervalt (migratie
   `20260915122000`) en de beheer-routes lezen via de service-role zonder `user_id`.
2. **Supportview en admin-export zijn verwijderd.** Er komt geen vervangende knop.
3. **AVG-inzage loopt uitsluitend via de gebruiker zelf** (`/api/account/export`, bestaand).
   Kan iemand niet meer inloggen, dan herstelt de eigenaar eerst de toegang; alleen als
   dat niet lukt volgt een handmatige export op databaseniveau, met een aantekening in het
   AVG-register (beheerders-runbook).
4. **In de plaats komt een gebruiksprofiel** (`/api/admin/users/activity`,
   `lib/beheer/gebruik.ts`): actieve dagen, laatst actief, AI-aanroepen per functie,
   ingerichte apps, gidsstappen, check-in-maanden (alleen dát er een check-in is),
   meldingen, en **aantallen** bezittingen/schulden/transacties/bankkoppelingen met het
   tijdstip van de laatste toevoeging en sync-status. Tellingen mogen, bedragen en namen
   niet. De inzage wordt gelogd (`user.activity`).
5. **Chat blijft er volledig buiten** — ook geen telling. ADR 0137 belooft dat er geen
   beheer-leespad op de gespreksgeschiedenis bestaat; dat blijft zo.
6. **Actief gebruik wordt gemeten** in een nieuwe tabel `user_activity_days` (één rij per
   gebruiker per dag, geen inhoud), gevuld bij de eerste app-open van de dag via de
   bestaande `/api/sync/daily-open`-aanroep. Platform-cijfers (vandaag / 7 / 30 dagen) via
   de service-role-only RPC `admin_activity_counts()` op `/beheer/kpi`. De tabel valt in
   de AVG-wis en -export en heeft een retentie.
7. **De `app_settings`-tak voor superadmins is versmald** tot sleutels zonder gebruikers-id
   (globale configuratie). Per-gebruiker-sleutels leest een superadmin niet meer.
8. **Borging.** `lib/beheer/geen-inhoud.test.ts` scant alle beheer-bronnen (en elke route
   met `isSuperAdmin`) **fail-closed**: een tabel mag alleen met meta-kolommen gelezen
   worden, tenzij hij bewust op de vrije lijst staat (config, logs, gebruiksmeting, wat de
   gebruiker naar ons stuurde). Onbekende RPC's en elke chat-lezing maken hem rood. De
   verwijderde routes mogen niet terugkomen.
9. **De zelf-export is volledig.** Omdat de admin-export wegvalt, leest
   `/api/account/export` ook de persoonlijke tabellen zonder eigen-rij leesrecht
   (`net_worth_history`, `feedback`, `user_reports`) via de service-role, strikt op de vers
   geverifieerde eigen id. Lukt dat niet, dan benoemt de export het gat (`onvolledig`).

## Uitrolvolgorde

1. `20260915120000` (app_settings) — mag los van de code; alleen strenger.
2. De code deployen.
3. `20260915122000` (vragenlijsten) — pás ná de code, anders ziet beheer tussendoor 0
   invullingen en faalt verwijderen stil.
4. `20260915121000` (user_activity_days) — pas nadat `/privacy` de dag-registratie noemt
   (doel, bewaartermijn 400 dagen). De code is er defensief op: zonder tabel toont beheer
   "nog niet gemeten" en schrijft de app niets.

## Gevolgen

- Support kan een getal van een gebruiker niet meer "even nakijken". Een vraag over een
  verkeerd bedrag loopt via de gebruiker (screenshot in een melding) of via een
  testaccount met dezelfde situatie.
- **Wat dit niet is:** versleuteling. Wie de service-role-sleutel of het Supabase-dashboard
  heeft, kan technisch alles lezen. Dit besluit sluit de inzage via de app (`/beheer`, de
  browser-client van een superadmin), niet de toegang tot de database zelf.
- `ADMIN_EXPORT_TABLES` en `ADMIN_EXPORT_UITGESLOTEN` in `lib/user-data-tables.ts`
  verdwijnen met de route; de uitsluiting van chat uit een beheer-leespad is nu
  onvoorwaardelijk en wordt bewaakt door de bron-gate.
- `/privacy` moet de nieuwe activiteitsregistratie noemen vóór migratie `20260915121000`
  draait (AVG art. 13), en kan worden aangescherpt ("ons team kan je bedragen niet
  inzien"). Dat is een wijziging aan een juridische pagina en loopt via de
  Grenswachter-route, niet via dit besluit.
- Een actieve dag telt bij een volledige app-load (`/api/sync/daily-open`). Een tab die over
  middernacht open blijft, meldt de nieuwe dag pas bij de volgende load — DAU is dus een
  ondergrens.
- Resterende superadmin-leestakken op operationele tabellen (`error_logs` met
  client-aangeleverde fouttekst, `mail_log` met ontvanger en onderwerp) vallen onder
  "operationeel" en blijven; de inhoud van foutmeldingen verdient een eigen audit.
- De audit-regel van een inzage wordt fout-inslikkend geschreven: een mislukte log-insert
  blokkeert de inzage niet (bestaand ontwerp van `logAdminAction`).

## Vervangt

Het supportview-/admin-exportdeel van beheer 2.0 (juni 2026, zie de kop van migratie
`20260611120000_drop_superadmin_personal_data_select.sql`).
