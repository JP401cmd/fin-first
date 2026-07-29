# Beheerders-runbook — TriFinity

Praktische gids voor superadmins: hoe voer je veelvoorkomende beheertaken uit?
Alle beheerschermen staan onder **`/beheer`** (alleen zichtbaar voor `profiles.role = 'superadmin'`),
ingedeeld in vier groepen: **Technisch beheer**, **Functioneel beheer**, **Test & ontwikkeling**, **Ter info**.

> Bron van waarheid voor de indeling: `lib/beheer-sections.ts`.

---

## Gebruikers

### Een abonnement toekennen of intrekken
1. Ga naar **Functioneel beheer → Gebruikers** (`/beheer/gebruikers`).
2. Zoek de gebruiker op e-mailadres.
3. Klik **Toekennen** / **Intrekken** bij AI of Connected.
   Dit is een handmatige comp (los van de Polar-checkout) en wordt gelogd in de
   toewijzingsgeschiedenis én in de audit-trail.

### Een rol wijzigen (user ↔ superadmin)
- Op dezelfde gebruikerskaart: kies de rol in het uitklapmenu.
- Je kunt je **eigen** rol niet wijzigen en de **laatste** superadmin niet degraderen.

### Een account blokkeren / deblokkeren
- Op de gebruikerskaart: **Blokkeren** (vraagt bevestiging). De gebruiker wordt direct
  uitgelogd en kan niet meer inloggen; deblokkeren herstelt de toegang.
- Je kunt jezelf niet blokkeren en een superadmin niet (zet eerst de rol op gebruiker).

---

## AVG / privacy

### Inzageverzoek (recht op inzage)
- **Admin-export:** zoek de gebruiker op **Functioneel beheer → Gebruikers** (`/beheer/gebruikers`),
  open **Supportview** en klik **Exporteer data (AVG)**. Levert profiel + bezittingen + schulden +
  transacties als JSON. De export wordt gelogd in de audit-trail.
- **Self-service:** de gebruiker kan z'n data ook zelf downloaden (`/api/export`, CSV/JSON).

### Verwijderverzoek (recht op vergetelheid)
- **Self-service (voorkeur):** de gebruiker verwijdert z'n account via de account-pagina
  (`/api/account/delete`, modus *delete*).
- **Admin-gestuurd:** een één-klik admin-verwijdering is bewust nog niet gebouwd (destructief,
  vereist de service-role-key). Voer een admin-verzoek uit op database-niveau met
  `deleteAllUserData(serviceClient, userId)` + `auth.admin.deleteUser(userId)`, en noteer het
  verzoek. Dit is de enige actie in dit runbook die niet via een knop loopt.

---

## Een kapotte bankimport debuggen
1. Vraag de gebruiker om het e-mailadres en het tijdstip van de import.
2. **Foutmeldingen** (`/beheer/errors`, Technisch beheer): kijk of er rond dat tijdstip een
   client-fout van die gebruiker staat.
3. Een volledige per-gebruiker datadiagnose (rekeningen / laatste sync / importfouten) is nog
   een open backlog-item (*supportview*). Tot die tijd: directe DB-inspectie.

---

## Platform-incidenten

### Onderhoudsmodus of een aankondiging tonen
- **Technisch beheer → Platform-status** (`/beheer/platform`):
  - *Onderhoudsmodus* toont een rode, niet-sluitbare banner aan iedereen.
  - *Aankondiging* toont een (sluitbare) info/waarschuwing-banner.

### AI globaal uitschakelen (kill-switch)
- Op **Platform-status**: zet **AI ingeschakeld** uit. Alle AI-functies (chat, briefing,
  rapporten, extractie, …) geven dan direct een nette melding. Eén schakelaar, werkt overal.

### Bankkoppeling uitschakelen
- **Technisch beheer → Bank Connect** (`/beheer/bank-connect`): zet TrueLayer uit.

### TrueLayer-omgeving wisselen (sandbox ↔ productie)
- Sandbox en Live zijn in de TrueLayer-console **aparte apps met eigen credentials**:
  het sandbox-client-id heeft een `sandbox-`-prefix (bv. `sandbox-finfirst-…`) en een
  **eigen** client-secret. Wissel je van omgeving, wissel dan altijd client-id én secret mee —
  anders toont de TrueLayer-authpagina "Unknown client or client not enabled".
- **"Test verbinding" bewijst in sandbox-modus de credentials níet** (haalt alleen de kale
  providerlijst op, die slaagt ook met fout client-id). De echte proef is een koppelpoging.
- Registreer per omgeving de redirect-URI `…/api/bank-connect/callback` in de TrueLayer-console
  (Settings → Redirect URIs). Let op: op de **Live**-app staat nu alleen
  `https://fin-first.vercel.app/callback` — het juiste pad
  `https://fin-first.vercel.app/api/bank-connect/callback` moet daar nog bij vóór livegang.

---

## Monitoring

### Draaien de geplande taken nog?
- **Technisch beheer → Achtergrondtaken** (`/beheer/jobs`): laatste run, status, duur en
  samenvatting per cron (prijsverversing, maandsnapshots, nieuws-ingest).

### Fouten die gebruikers raken
- **Technisch beheer → Foutmeldingen** (`/beheer/errors`): ongevangen client-fouten met
  stacktrace, automatisch verzameld.

### AI-verbruik en -kosten
- **Technisch beheer → AI Features** (`/beheer/ai-features`): maandbudgetten (AI-abonnees /
  gratis proefbudget), vaste kosten per actie, en het verbruik-dashboard (totaal · per functie ·
  grootste verbruikers). Gebruikers zien hun eigen verbruik op `/mijn/account`.

### Wie wijzigde wat?
- **Ter info → Audit-trail** (`/beheer/audit`): logboek van abonnement-, rol-, blokkade- en
  configuratiewijzigingen.

---

## E-mail
- **Technisch beheer → E-mail** (`/beheer/email`): providerstatus + recente pogingen.
- Versturen werkt zodra `RESEND_API_KEY` (en optioneel `EMAIL_FROM`) is gezet en het afzenderdomein
  bij Resend is geverifieerd. Zonder key worden pogingen als *overgeslagen* gelogd en blijven
  huishouden-uitnodigingen via de deelbare link werken.

---

## Inhoud & teksten
Aanpasbaar zonder deploy (Functioneel beheer):
- **Welkomstgids** (`/beheer/welkom`), **Coach** (`/beheer/coach`), **Briefing** (`/beheer/briefing`),
  **Doelen** (`/beheer/doelen`), **Nieuws** (`/beheer/nieuws`).

Nog hardcoded (vereisen een deploy): landingscopy, FAQ, glossarium, en de juridische pagina's
(`/privacy`, `/voorwaarden`, `/wft` — gemarkeerd als concept, nog juridisch te valideren).

## Back-up en herstel

De werkwijze staat in `.claude/skills/herstelproef` — elk kwartaal oefenen, nooit op productie.

**Hersteldoelen** (vastgesteld 2026-07-29, org-besluit 10 "lichte voorziening" — bijstellen mag bij de eerste herstelproef):

- **RPO (hoeveel data mag je kwijt zijn): 24 uur** — vereist minimaal een dagelijkse Supabase-back-up; verifieer dat die aanstaat en op welk tijdstip.
- **RTO (hoe lang mag herstel duren): 4 uur** — van "besluit tot terugzetten" tot checklist groen. De geklokte tijd van elke proef komt hieronder te staan.

### Wat je náást de database nodig hebt

Een teruggezette database alléén is géén werkende omgeving. Deze drie dingen zitten **niet** in een
Supabase-databaseback-up en moeten apart geregeld zijn, anders staat er straks onleesbare data:

- **Sleutels uit de omgeving.** `ENCRYPTION_KEY_V1` (versleutelde bankkoppeling-credentials, migratie
  `20260503193310_encrypt_bank_credentials`) en `IBAN_INDEX_KEY_V1` (de gehashte IBAN-index) wonen in
  Vercel/`.env.local`, niet in de database. Zonder exact dezelfde sleutels is de herstelde data er wél,
  maar onbruikbaar. Bewaar ze buiten de repo én buiten hetzelfde Supabase-project.
- **De `auth`- en `storage`-schema's.** Alleen `public` terugzetten betekent: data zonder gebruikers —
  niemand kan inloggen. Een dump/herstel moet `auth` (en `storage`) meenemen.
- **Bestanden in Storage.** De bucket `pension-documents` bevat geüploade documenten. Een database-
  back-up herstelt de rijen in `storage.objects`, niet per se de bestanden zelf — controleer dit
  expliciet bij de proef.

### De proef in stappen (met verwachte duur)

Omvang op 2026-07-29: database ~56 MB — klein genoeg dat het terugzetten zelf minuten kost, niet uren.
De tijd zit in het optuigen van de doelomgeving en de controle.

| # | Stap | Verwacht |
| --- | --- | --- |
| 0 | Vaststellen dát er een back-up is: Supabase-dashboard → Database → Backups (plan + tijdstip + retentie). Free plan = géén back-ups; dan haalt de RPO van 24 uur het niet. | 5 min |
| 1 | Doelomgeving: **een apart Supabase-project** (restore van de back-up/PITR). Géén branch — een branch draait de migraties op een lege database en bevat dus **geen productiedata**; dat toetst schema, niet herstel. | 15 min |
| 2 | Back-up terugzetten naar dat project, inclusief `auth` en `storage`. | 10–20 min |
| 3 | Env samenstellen: nieuwe project-URL + anon/service-role-key, plus de bestaande `ENCRYPTION_KEY_V1` en `IBAN_INDEX_KEY_V1` uit de kluis. | 15 min |
| 4 | Checklist aflopen (hieronder). | 30 min |
| | **Totaal (eerste keer, realistisch)** | **1,5–2,5 uur — binnen de RTO van 4 uur, maar nog niet bewezen** |

### Controlechecklist

Draai deze telling eerst op productie (dat is de verwachting), dan op de herstelde omgeving; ze moeten
gelijk zijn voor de back-updatum:

```sql
select (select count(*) from auth.users)              as auth_users,
       (select count(*) from public.profiles)         as profiles,
       (select count(*) from public.transactions)     as transactions,
       (select count(*) from public.bank_accounts)    as bank_accounts,
       (select count(*) from public.assets)           as assets,
       (select count(*) from public.budgets)          as budgets,
       (select count(*) from public.debts)            as debts,
       (select count(*) from public.net_worth_snapshots) as nw_snapshots;
```

Daarnaast, en dit is bij een vermogensapp het punt waar het écht om gaat:

- **inloggen** met een testaccount tegen de herstelde omgeving werkt;
- **steekproef op bedragen** — een paar bekende saldi én een uitkomst van de rekenkern
  (netto vermogen / FIRE-doel uit `net_worth_snapshots`) komen overeen met productie op de back-updatum;
- **bankkoppeling leesbaar** — een `bank_connections`-rij ontsleutelt met `ENCRYPTION_KEY_V1`;
- **Storage** — een bestand uit `pension-documents` is daadwerkelijk op te halen.

**Proeflog:**

| Datum | Back-updatum | Hersteltijd | Uitkomst | Wat schuurde |
| --- | --- | --- | --- | --- |
| 2026-07-29 | — | — | **Droge doorloop, niet uitgevoerd** — er is nog geen herstel-doelomgeving. Stappenplan + checklist hierboven vastgelegd; wachten op go voor een tweede Supabase-project. | Geen Docker/psql op de beheerdersmachine (lokaal terugzetten kan niet); een Supabase-branch is géén geldig doel (geen productiedata); de encryptiesleutels en Storage-bestanden zitten niet in de databaseback-up. |
| *(eerste échte proef — af vóór de allowlist opengaat)* | | | | |
